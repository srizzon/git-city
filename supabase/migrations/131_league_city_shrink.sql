-- ─── Admins can shrink their city ──────────────────────────
-- {op:"shrink"} in an admin batch removes the outer ring (size - 2, min 12).
-- Expands apply before the rest of the batch and shrinks after it, so the
-- editor can clear the ring (remove ops) and shrink in one batch. A shrink is
-- refused while anything still stands on the ring, or when the smaller city
-- would be over the 70% growth threshold (it would just grow back).

BEGIN;

CREATE OR REPLACE FUNCTION public.apply_league_city_ops_admin(
  p_slug  text,
  p_login text,
  p_ops   jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  c_max_batches constant int := 120;
  c_window      constant interval := interval '10 minutes';
  c_min_size    constant int := 12;
  c_max_size    constant int := 40;
  c_lot         constant double precision := 48;
  v_league  uuid;
  v_admin   bigint;
  v_dev     bigint;
  v_count   int;
  v_expands int;
  v_shrinks int;
  v_rest    jsonb;
  v_size    int;
  v_version bigint;
  v_result  jsonb;
  v_lo      int;
  v_hi      int;
BEGIN
  IF p_ops IS NULL OR jsonb_typeof(p_ops) <> 'array' THEN
    RAISE EXCEPTION 'invalid_op';
  END IF;

  SELECT l.id, l.admin_id INTO v_league, v_admin FROM public.leagues l WHERE l.slug = lower(p_slug);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'league_not_found';
  END IF;

  SELECT d.id INTO v_dev FROM public.developers d WHERE d.github_login = lower(p_login);
  IF v_dev IS NULL OR v_admin IS DISTINCT FROM v_dev THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  SELECT count(*) INTO v_count FROM public.league_city_ops o
  WHERE o.actor_id = v_dev AND o.at > now() - c_window;
  IF v_count >= c_max_batches THEN
    RAISE EXCEPTION 'rate_limit';
  END IF;

  SELECT count(*) FILTER (WHERE e ->> 'op' = 'expand'),
         count(*) FILTER (WHERE e ->> 'op' = 'shrink'),
         COALESCE(jsonb_agg(e) FILTER (WHERE e ->> 'op' IS DISTINCT FROM 'expand' AND e ->> 'op' IS DISTINCT FROM 'shrink'), '[]'::jsonb)
  INTO v_expands, v_shrinks, v_rest
  FROM jsonb_array_elements(p_ops) AS e;

  -- Same lock as apply_league_city_ops (re-entrant within the transaction).
  IF v_expands > 0 OR v_shrinks > 0 THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('league_city:' || v_league::text, 0));
  END IF;

  IF v_expands > 0 THEN
    UPDATE public.league_cities c
    SET size = least(c_max_size, c.size + 2 * v_expands), version = c.version + 1, updated_at = now()
    WHERE c.league_id = v_league
    RETURNING c.size, c.version INTO v_size, v_version;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'not_found';
    END IF;
    INSERT INTO public.league_city_ops (league_id, version, actor_id, ops)
    VALUES (v_league, v_version, v_dev, jsonb_build_array(jsonb_build_object('op', 'expand', 'count', v_expands)));
  END IF;

  IF jsonb_array_length(v_rest) > 0 THEN
    v_result := public.apply_league_city_ops(v_league, v_dev, v_rest);
  END IF;

  IF v_shrinks > 0 THEN
    SELECT c.size INTO v_size FROM public.league_cities c WHERE c.league_id = v_league;
    v_size := greatest(c_min_size, v_size - 2 * v_shrinks);
    v_lo := -(v_size / 2);
    v_hi := v_size - v_size / 2 - 1;
    -- Nothing may stand outside the smaller city (props by their footprint).
    PERFORM 1 FROM public.league_objects o
    WHERE o.league_id = v_league AND (
      (o.px IS NULL AND (o.x < v_lo OR o.x > v_hi OR o.z < v_lo OR o.z > v_hi))
      OR (o.px IS NOT NULL AND (
        o.px - public.league_prop_radius(o.item_type) < (v_lo - 0.5) * c_lot
        OR o.px + public.league_prop_radius(o.item_type) > (v_hi + 0.5) * c_lot
        OR o.pz - public.league_prop_radius(o.item_type) < (v_lo - 0.5) * c_lot
        OR o.pz + public.league_prop_radius(o.item_type) > (v_hi + 0.5) * c_lot
      ))
    )
    LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'ring_not_empty';
    END IF;
    SELECT count(*) INTO v_count FROM public.league_objects o WHERE o.league_id = v_league AND o.px IS NULL;
    IF v_count > 0.7 * v_size * v_size THEN
      RAISE EXCEPTION 'too_full';
    END IF;
    UPDATE public.league_cities c
    SET size = v_size, version = c.version + 1, updated_at = now()
    WHERE c.league_id = v_league
    RETURNING c.version INTO v_version;
    INSERT INTO public.league_city_ops (league_id, version, actor_id, ops)
    VALUES (v_league, v_version, v_dev, jsonb_build_array(jsonb_build_object('op', 'shrink', 'count', v_shrinks)));
    RETURN jsonb_build_object('version', v_version, 'size', v_size, 'objects_changed', COALESCE((v_result ->> 'objects_changed')::int, 0), 'unplaced', '[]'::jsonb);
  END IF;

  IF v_result IS NOT NULL THEN
    RETURN v_result;
  END IF;
  RETURN jsonb_build_object('version', v_version, 'size', v_size, 'objects_changed', 0, 'unplaced', '[]'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_league_city_ops_admin(text, text, jsonb) FROM PUBLIC, anon, authenticated;

COMMIT;
