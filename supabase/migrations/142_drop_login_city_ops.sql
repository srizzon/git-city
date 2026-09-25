-- ─── Drop the login-based city ops entry point ─────────────
-- apply_league_city_ops_admin took a GitHub login that the route read from
-- user-editable auth metadata. Since 134 the route resolves the developer by
-- claimed_by and calls apply_league_city_ops_admin_by_id; nothing calls the
-- login version any more.

DROP FUNCTION IF EXISTS public.apply_league_city_ops_admin(text, text, jsonb);
