-- ─── Hidden leagues + one-round-trip editor saves ──────────
-- hidden: the league works by URL but stays out of every listing (profile
-- chips, /leagues, rankings). For internal test leagues.
--
-- apply_league_city_ops_admin: the editor's save in a single call. Resolves
-- the league by slug and the dev by login, checks admin and the rate limit
-- (120 batches per admin per 10 minutes, counted from league_city_ops), then
-- applies the batch. Before this, a save took four round trips.

BEGIN;

ALTER TABLE public.leagues ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;

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
  v_league uuid;
  v_admin  bigint;
  v_dev    bigint;
  v_count  int;
BEGIN
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

  RETURN public.apply_league_city_ops(v_league, v_dev, p_ops);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_league_city_ops_admin(text, text, jsonb) FROM PUBLIC, anon, authenticated;

COMMIT;
