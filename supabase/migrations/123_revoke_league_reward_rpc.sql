-- ─── Lock grant_league_reward to the service role ──────────
-- REVOKE ... FROM PUBLIC (121) isn't enough on Supabase: anon and
-- authenticated get EXECUTE directly through default privileges, so the
-- SECURITY DEFINER function was callable over PostgREST RPC. Only the
-- service-role client (the league-close cron) may call it.

REVOKE EXECUTE ON FUNCTION grant_league_reward(bigint, uuid, date, int, int, text) FROM anon, authenticated;
