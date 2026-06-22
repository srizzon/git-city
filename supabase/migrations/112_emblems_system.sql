-- ─── Emblems: the city's merit-honors layer ───────────────────────────────
-- Unifies achievements + event placements + future honors into ONE data-driven
-- system. A new honor = one catalog row (+ a grant call), never new code.
--
-- Design principles (locked):
--   • SCALE:  create = 1 row · grant = 1 function · render = glyph by data.
--             Running 100 events does NOT create 100 emblems.
--   • MERIT:  earn-only. Never buyable with Pixels or $GITC. No economy here
--             beyond the free-item unlock carried over from achievements.
--   • REUSE:  grant_emblem mirrors grant_event_reward (advisory lock + claim_key
--             idempotency + grant_xp + activity_feed). Own data, shared plumbing.
--
-- Slimmed vs the original design doc (kept maintainable): glyph-only renderer
-- (no render_kind/image_url/palette/season_id/rarity_sort — add when a feature
-- actually needs them). Branded image emblems are a later, additive migration.
--
-- This migration is ADDITIVE. It backfills achievements -> emblems with zero
-- data loss and LEAVES the old tables in place (read-only by convention) for one
-- release. Dropping achievements/developer_achievements is a LATER migration,
-- only after prod parity is verified.

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. CATALOG: emblems (definition)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS emblems (
  id             text PRIMARY KEY,                  -- "commits_god", "event_top10"
  name           text NOT NULL,
  description    text NOT NULL,
  family         text NOT NULL,                     -- grouping in the Trophy Case
  tier           text NOT NULL,                     -- bronze | silver | gold | diamond
  glyph          text NOT NULL,                     -- key into the fixed glyph library
  is_counter     boolean NOT NULL DEFAULT false,    -- show a live count? (Veteran, placements)
  milestones     jsonb,                             -- [{count,tier},...] evolving frame
  criteria       jsonb,                             -- {type:'threshold',metric,gte}; null = push-only
  xp_reward      int  NOT NULL DEFAULT 0,
  unlock_item_id text REFERENCES items(id),         -- carries achievements' free-item reward
  active         boolean NOT NULL DEFAULT false,    -- per-emblem feature flag (draft -> live)
  sort_order     int  NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN emblems.criteria   IS 'Declarative unlock rule for the PULL evaluator. Exactly one shape: {type:"threshold",metric,gte}. null = PUSH-only (granted by a call site / admin).';
COMMENT ON COLUMN emblems.milestones IS 'Counter emblems only: [{count:int,tier:text},...]. The frame upgrades as the live count crosses each milestone.';

-- ════════════════════════════════════════════════════════════════════════════
-- 2. STATE: emblem_grants (aggregate per dev) — what the Trophy Case reads
--    Derived cache of the ledger. ONLY grant_emblem / rebuild_emblem_grants
--    write here. Rebuildable from emblem_grant_events at any time.
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS emblem_grants (
  developer_id    bigint NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
  emblem_id       text   NOT NULL REFERENCES emblems(id)    ON DELETE CASCADE,
  count           int    NOT NULL DEFAULT 1,
  tier            text   NOT NULL,
  first_earned_at timestamptz NOT NULL DEFAULT now(),
  last_earned_at  timestamptz NOT NULL DEFAULT now(),
  seen            boolean NOT NULL DEFAULT false,
  PRIMARY KEY (developer_id, emblem_id)
);
CREATE INDEX IF NOT EXISTS idx_emblem_grants_dev ON emblem_grants(developer_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. LEDGER: emblem_grant_events (idempotent + history)
--    One row per occurrence. claim_key gives idempotency; meta powers history
--    ("Top 10 in which events").
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS emblem_grant_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id  bigint NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
  emblem_id     text   NOT NULL REFERENCES emblems(id),
  claim_key     text   NOT NULL,
  meta          jsonb  NOT NULL DEFAULT '{}'::jsonb,
  source        text   NOT NULL,                    -- 'event' | 'threshold' | 'admin' | 'raid'
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT emblem_grant_event_key_unique UNIQUE (claim_key)
);
CREATE INDEX IF NOT EXISTS idx_emblem_grant_events_dev    ON emblem_grant_events(developer_id);
CREATE INDEX IF NOT EXISTS idx_emblem_grant_events_emblem ON emblem_grant_events(emblem_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 4. RLS: public read everywhere; writes only via SECURITY DEFINER RPC
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE emblems             ENABLE ROW LEVEL SECURITY;
ALTER TABLE emblem_grants       ENABLE ROW LEVEL SECURITY;
ALTER TABLE emblem_grant_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS emblems_read ON emblems;
CREATE POLICY emblems_read ON emblems
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS emblem_grants_read ON emblem_grants;
CREATE POLICY emblem_grants_read ON emblem_grants
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS emblem_grant_events_read ON emblem_grant_events;
CREATE POLICY emblem_grant_events_read ON emblem_grant_events
  FOR SELECT TO anon, authenticated USING (true);

-- Base table privileges. RLS gates anon/authenticated reads; the app's admin
-- client (service_role) bypasses RLS but still needs table-level grants for its
-- direct reads (evaluateEmblems, showcase, profile) and writes (mark-seen seen
-- flag, account deletion). RPC writes are SECURITY DEFINER and run as owner.
GRANT SELECT ON emblems, emblem_grants, emblem_grant_events TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON emblems, emblem_grants, emblem_grant_events TO service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. CHOKEPOINT: grant_emblem() — the one door for every grant (mirror of
--    grant_event_reward). Push (event/admin/raid) and pull (threshold) both
--    funnel through here. 100% idempotent on claim_key.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION grant_emblem(
  p_developer_id bigint,
  p_emblem_id    text,
  p_claim_key    text,
  p_meta         jsonb DEFAULT '{}'::jsonb,
  p_source       text  DEFAULT 'system'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_emblem emblems%ROWTYPE;
  v_new    uuid;
  v_count  int;
  v_tier   text;
  v_m      jsonb;
BEGIN
  SELECT * INTO v_emblem FROM emblems WHERE id = p_emblem_id;
  IF NOT FOUND OR NOT v_emblem.active THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unknown_or_inactive');
  END IF;

  -- Serialize a single player's concurrent grants (re-entrant within a tx).
  PERFORM pg_advisory_xact_lock(p_developer_id);

  -- Idempotent ledger insert: one row per occurrence. Replays return early.
  INSERT INTO emblem_grant_events (developer_id, emblem_id, claim_key, meta, source)
  VALUES (p_developer_id, p_emblem_id, p_claim_key, COALESCE(p_meta, '{}'::jsonb), p_source)
  ON CONFLICT (claim_key) DO NOTHING
  RETURNING id INTO v_new;

  IF v_new IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true);
  END IF;

  -- Aggregate upsert: bump the count (Veteran "10", placements "3×").
  INSERT INTO emblem_grants (developer_id, emblem_id, count, tier, first_earned_at, last_earned_at)
  VALUES (p_developer_id, p_emblem_id, 1, v_emblem.tier, now(), now())
  ON CONFLICT (developer_id, emblem_id) DO UPDATE
    SET count = emblem_grants.count + 1,
        last_earned_at = now()
  RETURNING count INTO v_count;

  -- Recompute the frame tier from milestones (best matching threshold wins).
  v_tier := v_emblem.tier;
  IF v_emblem.milestones IS NOT NULL AND jsonb_typeof(v_emblem.milestones) = 'array' THEN
    FOR v_m IN SELECT jsonb_array_elements(v_emblem.milestones) LOOP
      IF v_count >= COALESCE((v_m->>'count')::int, 0) THEN
        v_tier := COALESCE(v_m->>'tier', v_tier);
      END IF;
    END LOOP;
    UPDATE emblem_grants SET tier = v_tier
      WHERE developer_id = p_developer_id AND emblem_id = p_emblem_id;
  END IF;

  -- Free-item unlock (preserves achievements' reward_type='unlock_item'). Skips
  -- pre-owners, idempotent on provider_tx_id.
  IF v_emblem.unlock_item_id IS NOT NULL AND v_emblem.unlock_item_id <> '' THEN
    INSERT INTO purchases (developer_id, item_id, provider, provider_tx_id, amount_cents, currency, status)
    SELECT p_developer_id, v_emblem.unlock_item_id, 'emblem',
           'emblem_' || p_developer_id || '_' || p_emblem_id, 0, 'usd', 'completed'
    WHERE NOT EXISTS (
      SELECT 1 FROM purchases p
      WHERE p.developer_id = p_developer_id AND p.item_id = v_emblem.unlock_item_id AND p.status = 'completed'
    )
    ON CONFLICT (provider_tx_id) DO NOTHING;
  END IF;

  -- XP (source 'emblem' = uncapped; only engagement sources hit the 150/day cap).
  IF COALESCE(v_emblem.xp_reward, 0) > 0 THEN
    PERFORM grant_xp(p_developer_id, 'emblem', v_emblem.xp_reward);
  END IF;

  -- Activity feed (event_type is free text; no CHECK constraint).
  INSERT INTO activity_feed (event_type, actor_id, metadata)
  VALUES ('emblem_earned', p_developer_id,
          jsonb_build_object('emblem_id', p_emblem_id, 'emblem_name', v_emblem.name,
                             'tier', v_tier, 'count', v_count));

  RETURN jsonb_build_object('ok', true, 'granted', true, 'count', v_count, 'tier', v_tier);
END;
$$;

REVOKE EXECUTE ON FUNCTION grant_emblem(bigint, text, text, jsonb, text) FROM PUBLIC;

-- ── rebuild_emblem_grants(): recover the aggregate cache from the ledger ──────
-- Cheap insurance: if emblem_grants ever drifts, recompute it from the immutable
-- ledger. The ledger is the source of truth; the aggregate is a derived cache.
CREATE OR REPLACE FUNCTION rebuild_emblem_grants(p_developer_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  rec record;
  v_tier text;
  v_m jsonb;
BEGIN
  DELETE FROM emblem_grants WHERE developer_id = p_developer_id;

  FOR rec IN
    SELECT ge.emblem_id, COUNT(*) AS cnt, MIN(ge.created_at) AS first_at,
           MAX(ge.created_at) AS last_at, e.tier AS base_tier, e.milestones AS milestones
    FROM emblem_grant_events ge
    JOIN emblems e ON e.id = ge.emblem_id
    WHERE ge.developer_id = p_developer_id
    GROUP BY ge.emblem_id, e.tier, e.milestones
  LOOP
    v_tier := rec.base_tier;
    IF rec.milestones IS NOT NULL AND jsonb_typeof(rec.milestones) = 'array' THEN
      FOR v_m IN SELECT jsonb_array_elements(rec.milestones) LOOP
        IF rec.cnt >= COALESCE((v_m->>'count')::int, 0) THEN
          v_tier := COALESCE(v_m->>'tier', v_tier);
        END IF;
      END LOOP;
    END IF;

    INSERT INTO emblem_grants (developer_id, emblem_id, count, tier, first_earned_at, last_earned_at)
    VALUES (p_developer_id, rec.emblem_id, rec.cnt, v_tier, rec.first_at, rec.last_at);
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION rebuild_emblem_grants(bigint) FROM PUBLIC;

-- ════════════════════════════════════════════════════════════════════════════
-- 6. BACKFILL: achievements -> emblems (zero data loss). emblems.id = the old
--    achievement id, so saved showcases (featured_achievements hold those ids)
--    keep pointing at valid rows with NO config migration.
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO emblems (id, name, description, family, tier, glyph, is_counter,
                     milestones, criteria, xp_reward, unlock_item_id, active, sort_order)
SELECT
  a.id,
  a.name,
  a.description,
  a.category AS family,
  a.tier,
  CASE a.category
    WHEN 'commits'        THEN 'commit-node'
    WHEN 'repos'          THEN 'blocks'
    WHEN 'stars'          THEN 'star'
    WHEN 'social'         THEN 'people'
    WHEN 'kudos'          THEN 'heart'
    WHEN 'gifts_sent'     THEN 'gift'
    WHEN 'gifts_received' THEN 'gift'
    WHEN 'streak'         THEN 'flame'
    WHEN 'kudos_streak'   THEN 'flame'
    WHEN 'raid'           THEN 'sword'
    WHEN 'purchases'      THEN 'sparkle'
    WHEN 'dailies'        THEN 'calendar'
    WHEN 'jobs'           THEN 'briefcase'
    WHEN 'secret'         THEN 'rabbit'
    ELSE 'sparkle'
  END AS glyph,
  false AS is_counter,
  NULL  AS milestones,
  -- criteria: a single threshold shape for the stat categories; null (push-only)
  -- for jobs (granted out-of-band) and secret (discovery).
  CASE a.category
    WHEN 'commits'        THEN jsonb_build_object('type','threshold','metric','contributions',    'gte', a.threshold)
    WHEN 'repos'          THEN jsonb_build_object('type','threshold','metric','public_repos',      'gte', a.threshold)
    WHEN 'stars'          THEN jsonb_build_object('type','threshold','metric','total_stars',       'gte', a.threshold)
    WHEN 'social'         THEN jsonb_build_object('type','threshold','metric','referral_count',    'gte', a.threshold)
    WHEN 'kudos'          THEN jsonb_build_object('type','threshold','metric','kudos_count',       'gte', a.threshold)
    WHEN 'gifts_sent'     THEN jsonb_build_object('type','threshold','metric','gifts_sent',        'gte', a.threshold)
    WHEN 'gifts_received' THEN jsonb_build_object('type','threshold','metric','gifts_received',    'gte', a.threshold)
    WHEN 'streak'         THEN jsonb_build_object('type','threshold','metric','app_streak',        'gte', a.threshold)
    WHEN 'kudos_streak'   THEN jsonb_build_object('type','threshold','metric','kudos_streak',      'gte', a.threshold)
    WHEN 'raid'           THEN jsonb_build_object('type','threshold','metric','raid_xp',           'gte', a.threshold)
    WHEN 'purchases'      THEN jsonb_build_object('type','threshold','metric','purchases',         'gte', a.threshold)
    WHEN 'dailies'        THEN jsonb_build_object('type','threshold','metric','dailies_completed', 'gte', a.threshold)
    ELSE NULL  -- jobs, secret: push-only
  END AS criteria,
  CASE a.tier
    WHEN 'bronze'  THEN 10
    WHEN 'silver'  THEN 25
    WHEN 'gold'    THEN 50
    WHEN 'diamond' THEN 100
    ELSE 0
  END AS xp_reward,
  a.reward_item_id AS unlock_item_id,
  true AS active,
  a.sort_order
FROM achievements a
ON CONFLICT (id) DO NOTHING;

-- developer_achievements -> emblem_grants (aggregate) + emblem_grant_events (ledger)
INSERT INTO emblem_grants (developer_id, emblem_id, count, tier, first_earned_at, last_earned_at, seen)
SELECT da.developer_id, da.achievement_id, 1, a.tier, da.unlocked_at, da.unlocked_at, da.seen
FROM developer_achievements da
JOIN achievements a ON a.id = da.achievement_id
ON CONFLICT (developer_id, emblem_id) DO NOTHING;

INSERT INTO emblem_grant_events (developer_id, emblem_id, claim_key, meta, source, created_at)
SELECT da.developer_id, da.achievement_id,
       'threshold:' || da.achievement_id || ':' || da.developer_id,
       '{}'::jsonb, 'threshold', da.unlocked_at
FROM developer_achievements da
ON CONFLICT (claim_key) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════
-- 7. SEED: the 5 generic EVENT emblems. Running N events never adds rows here —
--    every event grants from this fixed set, stamping per-occurrence meta in the
--    ledger. (Branded per-event emblems are a later, optional addition.)
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO emblems (id, name, description, family, tier, glyph, is_counter, milestones, criteria, xp_reward, active, sort_order) VALUES
  ('event_veteran', 'Event Veteran',
   'Showed up and fought. The number is how many city events you''ve joined.',
   'events', 'bronze', 'medal', true,
   '[{"count":1,"tier":"bronze"},{"count":3,"tier":"silver"},{"count":6,"tier":"gold"},{"count":12,"tier":"diamond"},{"count":24,"tier":"diamond"}]'::jsonb,
   NULL, 0, true, 10),

  ('event_champion', 'Champion',
   'Finished #1 in a city event. The number is how many times.',
   'events', 'diamond', 'crown', true, NULL, NULL, 0, true, 11),

  ('event_podium', 'Podium',
   'Finished in the top 3 of a city event. The number is how many times.',
   'events', 'gold', 'medal', true, NULL, NULL, 0, true, 12),

  ('event_top10', 'Top 10',
   'Finished in the top 10 of a city event. The number is how many times.',
   'events', 'silver', 'star', true, NULL, NULL, 0, true, 13),

  ('event_featured', 'Featured',
   'Finished in the top 10% of a large city event. The number is how many times.',
   'events', 'bronze', 'ribbon', true, NULL, NULL, 0, true, 14)
ON CONFLICT (id) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════
-- 8. EVENT WIRING: re-create distribute_event_rewards (verbatim from 111) and
--    append ONE dedicated emblem step. Generic for any ranked event — no
--    per-event config. Veteran to every participant; the SINGLE best placement
--    emblem when the field is large enough (>= 20) to make placement mean
--    something. Idempotent via fixed claim_key suffixes.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION distribute_event_rewards(p_event_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_cfg          jsonb;
  v_metric       text;
  v_total        int;
  v_outcome      text;
  v_median       numeric;
  v_rails        jsonb;
  -- legacy holders
  v_part         jsonb;
  v_milestones   jsonb;
  v_ranked       jsonb;
  v_min_damage   bigint;
  -- loop
  r              record;
  rail           jsonb;
  sel            jsonb;
  bun            jsonb;
  stype          text;
  m              jsonb;
  rk             jsonb;
  v_ckey         text;
  v_cut          int;
  v_qualifies    boolean;
  v_headline_tier text;
  v_headline_item text;
  v_ranked_tier  text;
  v_ranked_item  text;
  -- emblems
  v_emblem       text;
  v_feat_cut     int;
BEGIN
  SELECT rewards_config, COALESCE(outcome, 'defeat'),
         COALESCE(rewards_config->'scoring'->>'metric', 'damage_dealt')
    INTO v_cfg, v_outcome, v_metric
  FROM event_instances WHERE id = p_event_id;

  SELECT COUNT(*) INTO v_total
  FROM event_participations
  WHERE event_id = p_event_id
    AND (CASE WHEN v_metric = 'score' THEN score ELSE damage_dealt::numeric END) > 0;

  -- Rank everyone by the configured metric (set-based).
  WITH ranked AS (
    SELECT developer_id,
           ROW_NUMBER() OVER (
             ORDER BY (CASE WHEN v_metric = 'score' THEN score ELSE damage_dealt::numeric END) DESC
           ) AS rn
    FROM event_participations
    WHERE event_id = p_event_id
      AND (CASE WHEN v_metric = 'score' THEN score ELSE damage_dealt::numeric END) > 0
  )
  UPDATE event_participations ep SET final_rank = ranked.rn
  FROM ranked WHERE ep.event_id = p_event_id AND ep.developer_id = ranked.developer_id;

  -- Outlier flag (soft, never blocks): metric > 5x median.
  SELECT percentile_cont(0.5) WITHIN GROUP (
           ORDER BY (CASE WHEN v_metric = 'score' THEN score ELSE damage_dealt::numeric END)
         )
    INTO v_median
  FROM event_participations
  WHERE event_id = p_event_id
    AND (CASE WHEN v_metric = 'score' THEN score ELSE damage_dealt::numeric END) > 0;
  IF v_median IS NOT NULL AND v_median > 0 THEN
    UPDATE event_participations SET flagged_outlier = true
    WHERE event_id = p_event_id
      AND (CASE WHEN v_metric = 'score' THEN score ELSE damage_dealt::numeric END) > 5 * v_median;
  END IF;

  v_rails := v_cfg->'rails';

  -- ═══ NEW generalized path: rails[] with selectors ═══
  IF v_rails IS NOT NULL AND jsonb_typeof(v_rails) = 'array' THEN
    FOR r IN
      SELECT developer_id, final_rank,
             (CASE WHEN v_metric = 'score' THEN score ELSE damage_dealt::numeric END) AS eff_score
      FROM event_participations
      WHERE event_id = p_event_id
        AND (CASE WHEN v_metric = 'score' THEN score ELSE damage_dealt::numeric END) > 0
      ORDER BY final_rank
    LOOP
      v_headline_tier := NULL;
      v_headline_item := NULL;
      FOR rail IN SELECT jsonb_array_elements(v_rails) LOOP
        sel := rail->'selector';
        bun := rail->'bundle';
        stype := sel->>'type';
        v_qualifies := false;

        IF stype = 'all' THEN
          v_qualifies := r.eff_score >= COALESCE((sel->>'min_score')::numeric, 0);
        ELSIF stype = 'threshold' THEN
          v_qualifies := r.eff_score >= COALESCE((sel->>'min_score')::numeric, 0);
        ELSIF stype = 'rank' THEN
          v_qualifies := r.final_rank >= COALESCE((sel->>'min_rank')::int, 1)
                     AND r.final_rank <= COALESCE((sel->>'max_rank')::int, 0);
        ELSIF stype = 'percentile' THEN
          v_cut := GREATEST(
            COALESCE((sel->>'min_qualified')::int, 0),
            CEIL(v_total * COALESCE((sel->>'cutoff_pct')::numeric, 0))::int
          );
          v_qualifies := r.final_rank <= v_cut;
        ELSIF stype = 'collective_goal' THEN
          v_qualifies := (v_outcome = 'victory');
        END IF;

        IF v_qualifies THEN
          v_ckey := p_event_id::text || ':' || r.developer_id::text || ':rail:' || (rail->>'id');
          PERFORM grant_event_reward(
            p_event_id, r.developer_id, 'rail', rail->>'id',
            NULLIF(bun->>'item_id', ''), COALESCE((bun->>'xp')::int, 0),
            v_ckey, COALESCE((bun->>'pixels')::int, 0)
          );
          IF v_headline_tier IS NULL THEN
            v_headline_tier := rail->>'id';
            v_headline_item := NULLIF(bun->>'item_id', '');
          END IF;
        END IF;
      END LOOP;

      UPDATE event_participations
        SET reward_tier = COALESCE(v_headline_tier, 'bystander'),
            reward_item_id = v_headline_item,
            reward_granted_at = now()
        WHERE event_id = p_event_id AND developer_id = r.developer_id;
    END LOOP;

  -- ═══ LEGACY path: {participation, milestone, ranked} / {gift_item} ═══
  ELSE
    v_part       := v_cfg->'participation';
    v_milestones := v_cfg->'milestone'->'tiers';
    v_ranked     := v_cfg->'ranked'->'tiers';
    IF v_part IS NULL AND (v_cfg ? 'gift_item') THEN
      v_part := jsonb_build_object('item_id', v_cfg->>'gift_item', 'xp', 50, 'min_damage', 1);
    END IF;
    v_min_damage := COALESCE((v_part->>'min_damage')::bigint, 1);

    FOR r IN
      SELECT developer_id, damage_dealt, final_rank
      FROM event_participations WHERE event_id = p_event_id AND damage_dealt > 0
      ORDER BY final_rank
    LOOP
      IF v_part IS NOT NULL AND r.damage_dealt >= v_min_damage THEN
        v_ckey := p_event_id::text || ':' || r.developer_id::text || ':participation';
        PERFORM grant_event_reward(p_event_id, r.developer_id, 'participation', 'participation',
          v_part->>'item_id', COALESCE((v_part->>'xp')::int, 0), v_ckey);
      END IF;

      IF v_milestones IS NOT NULL AND jsonb_typeof(v_milestones) = 'array' THEN
        FOR m IN SELECT jsonb_array_elements(v_milestones) LOOP
          IF r.damage_dealt >= COALESCE((m->>'threshold')::bigint, 0) THEN
            v_ckey := p_event_id::text || ':' || r.developer_id::text || ':milestone:' || (m->>'id');
            PERFORM grant_event_reward(p_event_id, r.developer_id, 'milestone', m->>'id',
              m->>'item_id', COALESCE((m->>'xp')::int, 0), v_ckey);
          END IF;
        END LOOP;
      END IF;

      v_ranked_tier := NULL;
      v_ranked_item := NULL;
      IF v_ranked IS NOT NULL AND jsonb_typeof(v_ranked) = 'array' THEN
        FOR rk IN SELECT jsonb_array_elements(v_ranked) LOOP
          v_cut := GREATEST(
            COALESCE((rk->>'min_rank')::int, 0),
            CEIL(v_total * COALESCE((rk->>'cutoff_pct')::numeric, 0))::int
          );
          IF v_ranked_tier IS NULL AND r.final_rank <= v_cut THEN
            v_ranked_tier := rk->>'id';
            v_ranked_item := rk->>'item_id';
            v_ckey := p_event_id::text || ':' || r.developer_id::text || ':ranked:' || (rk->>'id');
            PERFORM grant_event_reward(p_event_id, r.developer_id, 'ranked', rk->>'id',
              rk->>'item_id', COALESCE((rk->>'xp')::int, 0), v_ckey);
          END IF;
        END LOOP;
      END IF;

      UPDATE event_participations
        SET reward_tier = COALESCE(v_ranked_tier, 'bystander'),
            reward_item_id = COALESCE(v_ranked_item, v_part->>'item_id'),
            reward_granted_at = now()
        WHERE event_id = p_event_id AND developer_id = r.developer_id;
    END LOOP;
  END IF;

  -- ═══ EMBLEMS: merit-honors layer (generic; never per-event config) ═══
  -- Veteran for every participant (counter +1); the single best placement
  -- emblem only when the field is big enough for placement to mean something.
  -- Emblems carry NO economy here — rails above already paid; emblem xp = 0.
  FOR r IN
    SELECT developer_id, final_rank,
           (CASE WHEN v_metric = 'score' THEN score ELSE damage_dealt::numeric END) AS eff_score
    FROM event_participations
    WHERE event_id = p_event_id
      AND (CASE WHEN v_metric = 'score' THEN score ELSE damage_dealt::numeric END) > 0
    ORDER BY final_rank
  LOOP
    PERFORM grant_emblem(
      r.developer_id, 'event_veteran',
      p_event_id::text || ':' || r.developer_id::text || ':emblem:veteran',
      jsonb_build_object('event_id', p_event_id, 'rank', r.final_rank),
      'event'
    );

    IF v_total >= 20 AND r.final_rank IS NOT NULL THEN
      v_feat_cut := CEIL(v_total * 0.10)::int;
      IF    r.final_rank = 1                              THEN v_emblem := 'event_champion';
      ELSIF r.final_rank <= 3                             THEN v_emblem := 'event_podium';
      ELSIF r.final_rank <= 10                            THEN v_emblem := 'event_top10';
      ELSIF r.final_rank <= GREATEST(v_feat_cut, 10)      THEN v_emblem := 'event_featured';
      ELSE  v_emblem := NULL;
      END IF;

      IF v_emblem IS NOT NULL THEN
        PERFORM grant_emblem(
          r.developer_id, v_emblem,
          p_event_id::text || ':' || r.developer_id::text || ':emblem:placement',
          jsonb_build_object('event_id', p_event_id, 'rank', r.final_rank, 'tier', v_emblem),
          'event'
        );
      END IF;
    END IF;
  END LOOP;

  UPDATE event_instances SET status = 'archived', archived_at = now()
  WHERE id = p_event_id AND status <> 'archived';

  RETURN json_build_object('ok', true, 'participants', v_total, 'distributed', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION distribute_event_rewards(uuid) FROM PUBLIC;

COMMIT;
