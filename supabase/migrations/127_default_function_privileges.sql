-- ─── New functions are not RPC-callable by default ─────────
-- Supabase's default privileges grant EXECUTE on every new public function to
-- anon and authenticated, and Postgres grants it to PUBLIC, so each migration
-- had to remember a REVOKE (see 124). From here on, functions created by the
-- migration role start with EXECUTE for their owner and service_role only.
--
-- A function meant for anon/authenticated (an RLS helper or a public RPC) now
-- needs an explicit GRANT EXECUTE ... TO anon, authenticated in its migration.
-- Existing functions keep their current grants.

BEGIN;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
-- The PUBLIC grant is a global default, which a per-schema entry can't revoke.
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
-- Keep extension functions (operators, casts) usable by every role.
ALTER DEFAULT PRIVILEGES IN SCHEMA extensions GRANT EXECUTE ON FUNCTIONS TO PUBLIC;

COMMIT;
