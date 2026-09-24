-- ─── Lock privileged functions to the service role ─────────
-- Supabase grants EXECUTE on every public function to anon and authenticated
-- through default privileges, so REVOKE ... FROM PUBLIC (used across earlier
-- migrations) never closed them. These SECURITY DEFINER functions (plus
-- grant_xp) were callable by any visitor over PostgREST RPC: free XP, emblems,
-- event rewards, pixels, PvP kill credit, and admin-only metrics/pruning.
--
-- Every app call site uses the service-role client, and the SQL callers are
-- SECURITY DEFINER functions or pg_cron jobs (both run as postgres), so none
-- of them depend on anon/authenticated EXECUTE. Grants only; no data touched.

BEGIN;

REVOKE EXECUTE ON FUNCTION capture_daily_snapshot(date) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION complete_event_wrap(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION credit_event_damage(uuid, bigint, bigint, integer, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION distribute_event_rewards(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION event_damage_log_prune(integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION event_dau_lift(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION event_funnel(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION event_retention_split(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION event_tier_distribution(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION game_events_prune(integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION grant_emblem(bigint, text, text, jsonb, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION grant_event_reward(uuid, bigint, text, text, text, integer, text, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION grant_xp(bigint, text, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION log_game_event(text, bigint, uuid, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION log_game_events_batch(jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION pvp_credit_kill(bigint, bigint, integer, boolean, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION pvp_kill_log_prune(integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION rank_event_standings(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION rebuild_emblem_grants(bigint) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION register_event_participation(uuid, bigint) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION release_event_rewards(uuid) FROM anon, authenticated;

COMMIT;
