-- ─── grant_xp: drop the PUBLIC grant ───────────────────────
-- 124 revoked anon/authenticated, but grant_xp still carried EXECUTE for
-- PUBLIC (proacl "=X/postgres"), which anon inherits. service_role keeps its
-- own explicit grant; SQL callers are SECURITY DEFINER (run as postgres).

REVOKE EXECUTE ON FUNCTION grant_xp(bigint, text, integer) FROM PUBLIC;
