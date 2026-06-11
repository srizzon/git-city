-- ─── Event wrap: outcome threshold + ranked item fix ────────
-- Two corrections to complete_event_wrap (re-declared from 094):
--
-- 1. Outcome threshold 97%: PartyKit's live boss HP includes damage that can
--    never be credited to the DB (pending receipt chunks < 300 are lost when
--    a player disconnects mid-fight). Requiring credited SUM >= 100% of
--    boss_max_hp mislabels real victories as 'defeat'. 97% absorbs that
--    leakage. Label-only: reward rails are damage/rank-based, not outcome.
--
-- 2. reward_item_id on event_participations was being set to the ranked TIER
--    id ('slayer'/'combatant') instead of the tier's item id. Now tracks the
--    actual item granted.

BEGIN;

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
  v_cfg          jsonb;
  v_part         jsonb;
  v_milestones   jsonb;
  v_ranked       jsonb;
  v_min_damage   bigint;
  v_median       numeric;
  r              record;
  m              jsonb;
  rk             jsonb;
  v_ckey         text;
  v_ranked_tier  text;
  v_ranked_item  text;
  v_cut          int;
BEGIN
  SELECT COUNT(*), COALESCE(SUM(damage_dealt), 0)
    INTO v_total, v_total_damage
  FROM event_participations WHERE event_id = p_event_id AND damage_dealt > 0;

  SELECT boss_max_hp, rewards_config INTO v_max_hp, v_cfg FROM event_instances WHERE id = p_event_id;
  -- 97% threshold: credited damage always undercounts the live HP dealt
  -- (disconnects drop sub-300 pending chunks). See header.
  v_outcome := CASE WHEN v_total_damage >= CEIL(COALESCE(v_max_hp, 0) * 0.97) THEN 'victory' ELSE 'defeat' END;

  IF v_total = 0 THEN
    UPDATE event_instances SET status='archived', archived_at=now(),
      total_participants=0, total_damage=0, outcome=v_outcome WHERE id=p_event_id;
    RETURN json_build_object('ok', true, 'participants', 0, 'outcome', v_outcome);
  END IF;

  v_part       := v_cfg->'participation';
  v_milestones := v_cfg->'milestone'->'tiers';
  v_ranked     := v_cfg->'ranked'->'tiers';

  -- Backward compat: bare gift_item → participation rail
  IF v_part IS NULL AND (v_cfg ? 'gift_item') THEN
    v_part := jsonb_build_object('item_id', v_cfg->>'gift_item', 'xp', 50, 'min_damage', 1);
  END IF;
  v_min_damage := COALESCE((v_part->>'min_damage')::bigint, 1);

  -- Rank everyone (single set-based UPDATE)
  WITH ranked AS (
    SELECT developer_id, ROW_NUMBER() OVER (ORDER BY damage_dealt DESC) AS rn
    FROM event_participations WHERE event_id = p_event_id AND damage_dealt > 0
  )
  UPDATE event_participations ep SET final_rank = ranked.rn
  FROM ranked WHERE ep.event_id = p_event_id AND ep.developer_id = ranked.developer_id;

  -- Outlier flag (soft, for manual review — never blocks): damage > 5x median
  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY damage_dealt)
    INTO v_median FROM event_participations WHERE event_id = p_event_id AND damage_dealt > 0;
  IF v_median IS NOT NULL AND v_median > 0 THEN
    UPDATE event_participations SET flagged_outlier = true
    WHERE event_id = p_event_id AND damage_dealt > 5 * v_median;
  END IF;

  -- Evaluate rails per participant
  FOR r IN
    SELECT developer_id, damage_dealt, final_rank
    FROM event_participations WHERE event_id = p_event_id AND damage_dealt > 0
    ORDER BY final_rank
  LOOP
    -- PARTICIPATION
    IF v_part IS NOT NULL AND r.damage_dealt >= v_min_damage THEN
      v_ckey := p_event_id::text || ':' || r.developer_id::text || ':participation';
      PERFORM grant_event_reward(p_event_id, r.developer_id, 'participation', 'participation',
        v_part->>'item_id', COALESCE((v_part->>'xp')::int, 0), v_ckey);
    END IF;

    -- MILESTONE (cumulative — all tiers at or below the player's damage)
    IF v_milestones IS NOT NULL AND jsonb_typeof(v_milestones) = 'array' THEN
      FOR m IN SELECT jsonb_array_elements(v_milestones) LOOP
        IF r.damage_dealt >= COALESCE((m->>'threshold')::bigint, 0) THEN
          v_ckey := p_event_id::text || ':' || r.developer_id::text || ':milestone:' || (m->>'id');
          PERFORM grant_event_reward(p_event_id, r.developer_id, 'milestone', m->>'id',
            m->>'item_id', COALESCE((m->>'xp')::int, 0), v_ckey);
        END IF;
      END LOOP;
    END IF;

    -- RANKED (best single tier; config ordered best-first)
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

    -- Headline tier on the participation row (item id, not tier id)
    UPDATE event_participations
      SET reward_tier = COALESCE(v_ranked_tier, 'bystander'),
          reward_item_id = COALESCE(v_ranked_item, v_part->>'item_id'),
          reward_granted_at = now()
      WHERE event_id = p_event_id AND developer_id = r.developer_id;
  END LOOP;

  UPDATE event_instances SET status='archived', archived_at=now(),
    total_participants=v_total, total_damage=v_total_damage, outcome=v_outcome WHERE id=p_event_id;

  RETURN json_build_object('ok', true, 'participants', v_total, 'outcome', v_outcome);
END;
$$;

REVOKE EXECUTE ON FUNCTION complete_event_wrap(uuid) FROM PUBLIC;

COMMIT;
