-- ─── dblink leaves the public schema ───────────────────────
-- dblink sat in public, which PostgREST exposes, so anon could call
-- dblink_connect / dblink_exec over RPC and open connections from the
-- database host. Its functions belong to supabase_admin, so 133's REVOKE
-- couldn't touch them. Nothing in the app, cron or SQL uses dblink; in
-- extensions it's out of the API (and the advisor's extension_in_public).

ALTER EXTENSION dblink SET SCHEMA extensions;
