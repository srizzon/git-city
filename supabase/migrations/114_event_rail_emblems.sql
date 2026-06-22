-- ─── Event rail emblems ────────────────────────────────────────────────────
-- A reward rail's bundle can now carry an optional `emblem_id`. When set, every
-- player who qualifies for that rail is granted that emblem on wrap — fully
-- config-driven from admin/events, no deploy, no manual grants. (e.g. the Duck
-- Boss "participation" rail grants "duck_slayer" to everyone who showed up.)
--
-- Re-creates distribute_event_rewards from 112 verbatim and adds ONE call inside
-- the rails loop. The generic Veteran + placement step is unchanged.

BEGIN;

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
          -- Optional per-rail emblem (config-driven; e.g. Duck Slayer).
          IF NULLIF(bun->>'emblem_id', '') IS NOT NULL THEN
            PERFORM grant_emblem(
              r.developer_id, bun->>'emblem_id',
              p_event_id::text || ':' || r.developer_id::text || ':railemblem:' || (rail->>'id'),
              jsonb_build_object('event_id', p_event_id, 'rank', r.final_rank, 'rail', rail->>'id'),
              'event'
            );
          END IF;
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

  -- ═══ EMBLEMS: generic merit-honors layer (Veteran + best placement) ═══
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
