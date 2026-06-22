-- ─── Event Engine: generic scoring + N-rail rewards + manual hold ──
-- Turns the boss-specific reward flow into a reusable engine so future event
-- types (build comps, tournaments, collective goals…) reuse the same spine.
--
-- Three changes:
--   1. event_participations gains a generic `score` + `progress` (boss_raid
--      keeps writing damage_dealt; other event types write score/progress).
--   2. event_instances gains `auto_distribute` (manual-hold freio de mão) and
--      `config_version`.
--   3. complete_event_wrap is rewritten to interpret a GENERALIZED
--      rewards_config: { scoring:{metric,aggregation}, rails:[{id,selector,bundle}] }
--      while preserving the legacy {participation,milestone,ranked}/{gift_item}
--      shapes verbatim. Distribution is factored into distribute_event_rewards()
--      so the manual "release" path reuses identical logic.
--
-- Reward model (new shape): a player receives EVERY rail whose selector matches.
--   • selector.type 'all'        → score >= min_score (default 0)
--   • selector.type 'threshold'  → score >= min_score          (stacks: milestones)
--   • selector.type 'rank'       → final_rank BETWEEN min_rank..max_rank (DISJOINT bands)
--   • selector.type 'percentile' → final_rank <= ceil(total*cutoff_pct), floored by min_qualified
--   • selector.type 'collective_goal' → outcome = 'victory'
-- Rank prizes use disjoint bands so 1st place doesn't also collect 2nd/3rd.
-- bundle = { pixels, item_id, xp }. Headline tier = first matching rail (order best-first).

BEGIN;

-- ─── Generic scoring columns ───────────────────────────────────
ALTER TABLE event_participations ADD COLUMN IF NOT EXISTS score numeric NOT NULL DEFAULT 0;
ALTER TABLE event_participations ADD COLUMN IF NOT EXISTS progress jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ─── Engine columns on the event row ───────────────────────────
ALTER TABLE event_instances ADD COLUMN IF NOT EXISTS auto_distribute boolean NOT NULL DEFAULT true;
ALTER TABLE event_instances ADD COLUMN IF NOT EXISTS config_version int NOT NULL DEFAULT 1;

-- ─── distribute_event_rewards: rank → outliers → grant rails → archive ──
-- Idempotent (claim_key dedup + archive is a no-op replay). Safe to re-run.
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

  UPDATE event_instances SET status = 'archived', archived_at = now()
  WHERE id = p_event_id AND status <> 'archived';

  RETURN json_build_object('ok', true, 'participants', v_total, 'distributed', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION distribute_event_rewards(uuid) FROM PUBLIC;

-- ─── complete_event_wrap: totals + outcome + rank, then auto/hold ──
-- Replaces 108. Computes outcome (97% threshold) and standings always (so a
-- held event can be previewed), then either distributes (auto) or holds at
-- 'wrap' for manual release.
CREATE OR REPLACE FUNCTION complete_event_wrap(p_event_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_total        int;
  v_total_damage bigint;
  v_max_hp       bigint;
  v_outcome      text;
  v_metric       text;
  v_auto         boolean;
BEGIN
  SELECT boss_max_hp, auto_distribute,
         COALESCE(rewards_config->'scoring'->>'metric', 'damage_dealt')
    INTO v_max_hp, v_auto, v_metric
  FROM event_instances WHERE id = p_event_id;

  SELECT COUNT(*), COALESCE(SUM(damage_dealt), 0)
    INTO v_total, v_total_damage
  FROM event_participations WHERE event_id = p_event_id AND damage_dealt > 0;

  -- 97% threshold: credited damage undercounts live HP (disconnect leakage).
  v_outcome := CASE WHEN v_total_damage >= CEIL(COALESCE(v_max_hp, 0) * 0.97)
                    THEN 'victory' ELSE 'defeat' END;

  -- Store totals + outcome up front (needed for preview while held).
  UPDATE event_instances
    SET total_participants = v_total, total_damage = v_total_damage, outcome = v_outcome
  WHERE id = p_event_id;

  IF v_total = 0 THEN
    UPDATE event_instances SET status = 'archived', archived_at = now()
    WHERE id = p_event_id AND status <> 'archived';
    RETURN json_build_object('ok', true, 'participants', 0, 'outcome', v_outcome);
  END IF;

  IF v_auto THEN
    PERFORM distribute_event_rewards(p_event_id);
    RETURN json_build_object('ok', true, 'participants', v_total, 'outcome', v_outcome, 'distributed', true);
  END IF;

  -- Manual hold: compute ranks + outliers for preview, but do NOT grant.
  -- (Reuse the ranking/outlier pass from distribute by leaving status at 'wrap'.)
  UPDATE event_instances SET status = 'wrap' WHERE id = p_event_id AND status <> 'archived';
  PERFORM rank_event_standings(p_event_id);
  RETURN json_build_object('ok', true, 'participants', v_total, 'outcome', v_outcome, 'held', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION complete_event_wrap(uuid) FROM PUBLIC;

-- ─── rank_event_standings: ranks + outlier flags WITHOUT granting ──
-- Lets a held (auto_distribute=false) event show a final leaderboard + flagged
-- outliers in the admin before the operator clicks "Release".
CREATE OR REPLACE FUNCTION rank_event_standings(p_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_metric text;
  v_median numeric;
BEGIN
  SELECT COALESCE(rewards_config->'scoring'->>'metric', 'damage_dealt')
    INTO v_metric FROM event_instances WHERE id = p_event_id;

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
END;
$$;

REVOKE EXECUTE ON FUNCTION rank_event_standings(uuid) FROM PUBLIC;

-- ─── release_event_rewards: operator-triggered grant for held events ──
CREATE OR REPLACE FUNCTION release_event_rewards(p_event_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status FROM event_instances WHERE id = p_event_id;
  IF v_status IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_status = 'archived' THEN
    RETURN json_build_object('ok', true, 'already', true);
  END IF;
  IF v_status <> 'wrap' THEN
    RETURN json_build_object('ok', false, 'error', 'not_in_wrap');
  END IF;
  RETURN distribute_event_rewards(p_event_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION release_event_rewards(uuid) FROM PUBLIC;

COMMIT;
