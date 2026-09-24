-- ─── Admins can grow their city ────────────────────────────
-- {op:"expand"} in an admin batch adds one ring of lots (size + 2, cap 40).
-- Handled here, before the rest of the batch, so ops in the same batch can
-- already use the new ring. The terrain still also grows on its own.

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
  c_max_size    constant int := 40;
  v_league  uuid;
  v_admin   bigint;
  v_dev     bigint;
  v_count   int;
  v_expands int;
  v_rest    jsonb;
  v_size    int;
  v_version bigint;
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
         COALESCE(jsonb_agg(e) FILTER (WHERE e ->> 'op' IS DISTINCT FROM 'expand'), '[]'::jsonb)
  INTO v_expands, v_rest
  FROM jsonb_array_elements(p_ops) AS e;

  IF v_expands > 0 THEN
    -- Same lock as apply_league_city_ops (re-entrant within the transaction).
    PERFORM pg_advisory_xact_lock(hashtextextended('league_city:' || v_league::text, 0));
    UPDATE public.league_cities c
    SET size = least(c_max_size, c.size + 2 * v_expands), version = c.version + 1, updated_at = now()
    WHERE c.league_id = v_league
    RETURNING c.size, c.version INTO v_size, v_version;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'not_found';
    END IF;
    INSERT INTO public.league_city_ops (league_id, version, actor_id, ops)
    VALUES (v_league, v_version, v_dev, jsonb_build_array(jsonb_build_object('op', 'expand', 'count', v_expands)));
    IF jsonb_array_length(v_rest) = 0 THEN
      RETURN jsonb_build_object('version', v_version, 'size', v_size, 'objects_changed', 0, 'unplaced', '[]'::jsonb);
    END IF;
  END IF;

  RETURN public.apply_league_city_ops(v_league, v_dev, v_rest);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_league_city_ops_admin(text, text, jsonb) FROM PUBLIC, anon, authenticated;

COMMIT;
