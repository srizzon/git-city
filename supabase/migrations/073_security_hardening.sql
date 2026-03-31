-- 073: Comprehensive security hardening
-- Fixes all issues flagged by Supabase security advisor

BEGIN;

-- ============================================================================
-- PART 1: Enable RLS on all unprotected public tables
-- All 8 tables are accessed exclusively via getSupabaseAdmin() (service_role)
-- which bypasses RLS, so no policies needed.
-- ============================================================================

-- Sensitive: emails, webhook_secrets
ALTER TABLE advertiser_accounts ENABLE ROW LEVEL SECURITY;

-- Sensitive: session tokens (allows session hijacking if exposed)
ALTER TABLE advertiser_sessions ENABLE ROW LEVEL SECURITY;

-- Sensitive: API key hashes
ALTER TABLE advertiser_api_keys ENABLE ROW LEVEL SECURITY;

-- Sensitive: session_ids
ALTER TABLE site_visitors ENABLE ROW LEVEL SECURITY;

-- Reference data, but no client-side reads (API uses admin client)
ALTER TABLE districts ENABLE ROW LEVEL SECURITY;
ALTER TABLE district_changes ENABLE ROW LEVEL SECURITY;

-- Internal tracking tables
ALTER TABLE milestone_celebrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE xp_log ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- PART 2: Fix developer_sessions broken policy
-- "Service role manages sessions" uses USING(true) WITH CHECK(true) for ALL
-- roles, which completely defeats RLS. Service role already bypasses RLS,
-- so this policy only opens the door for anon/authenticated.
-- ============================================================================

DROP POLICY IF EXISTS "Service role manages sessions" ON developer_sessions;


-- ============================================================================
-- PART 3: Fix survey_responses user_metadata vulnerability
-- Existing policies use auth.jwt()->'user_metadata'->>'user_name' which is
-- EDITABLE by end users — anyone can forge their github_login in metadata.
-- Fix: use developers.claimed_by = auth.uid() which is tamper-proof.
-- ============================================================================

DROP POLICY IF EXISTS "Users can submit their own response" ON survey_responses;
DROP POLICY IF EXISTS "Users can read their own responses" ON survey_responses;

CREATE POLICY "Users can submit their own response" ON survey_responses
  FOR INSERT
  WITH CHECK (
    developer_id = (
      SELECT id FROM public.developers
      WHERE claimed_by = auth.uid()
      LIMIT 1
    )
  );

CREATE POLICY "Users can read their own responses" ON survey_responses
  FOR SELECT
  USING (
    developer_id = (
      SELECT id FROM public.developers
      WHERE claimed_by = auth.uid()
      LIMIT 1
    )
  );


-- ============================================================================
-- PART 4: Revoke materialized view access from PostgREST API
-- sky_ad_daily_stats and sky_ad_conversion_daily_stats expose ad analytics
-- to anon/authenticated. All access goes through RPC functions via service_role.
-- ============================================================================

REVOKE SELECT ON sky_ad_daily_stats FROM anon, authenticated;
REVOKE SELECT ON sky_ad_conversion_daily_stats FROM anon, authenticated;


-- ============================================================================
-- PART 5: Set search_path on all functions missing it
-- SECURITY DEFINER functions without search_path are vulnerable to
-- search_path injection (attacker creates objects in a schema that gets
-- searched before 'public'). Using 'public' instead of '' to avoid
-- rewriting all function bodies with fully-qualified names.
-- ============================================================================

-- SECURITY DEFINER functions (HIGH risk — run as owner, bypass RLS)
ALTER FUNCTION assign_new_dev_rank(bigint) SET search_path = 'public';
ALTER FUNCTION credit_pixels(bigint, bigint, text, text, text, text, text, inet, text) SET search_path = 'public';
ALTER FUNCTION deactivate_expired_ads() SET search_path = 'public';
ALTER FUNCTION debit_pixels(bigint, bigint, text, text, text, text) SET search_path = 'public';
ALTER FUNCTION earn_pixels(bigint, text, text, text, text) SET search_path = 'public';
ALTER FUNCTION find_auth_user_by_github_login(text) SET search_path = 'public';
ALTER FUNCTION get_ad_daily_stats(date, date, text[]) SET search_path = 'public';
ALTER FUNCTION get_ad_stats(date, date, text[]) SET search_path = 'public';
ALTER FUNCTION get_auth_users_without_developer() SET search_path = 'public';
ALTER FUNCTION get_endorsements_given_this_month(bigint) SET search_path = 'public';
ALTER FUNCTION heartbeat_visitor(text) SET search_path = 'public';
ALTER FUNCTION increment_hired_count(uuid) SET search_path = 'public';
ALTER FUNCTION increment_job_counter(uuid, text) SET search_path = 'public';
ALTER FUNCTION increment_kudos_count(bigint) SET search_path = 'public';
ALTER FUNCTION increment_referral_count(bigint) SET search_path = 'public';
ALTER FUNCTION increment_visit_count(bigint) SET search_path = 'public';
ALTER FUNCTION recalculate_ranks() SET search_path = 'public';
ALTER FUNCTION refresh_sky_ad_stats() SET search_path = 'public';
ALTER FUNCTION spend_pixels(bigint, text, text, bigint, boolean, inet, text) SET search_path = 'public';
ALTER FUNCTION upsert_arcade_visit(uuid, uuid) SET search_path = 'public';

-- SECURITY INVOKER functions (MEDIUM risk — run as caller, but still best practice)
ALTER FUNCTION complete_all_dailies(bigint) SET search_path = 'public';
ALTER FUNCTION count_devs_with_more_achievements(bigint) SET search_path = 'public';
ALTER FUNCTION grant_streak_freeze(bigint) SET search_path = 'public';
ALTER FUNCTION grant_xp(bigint, text, integer) SET search_path = 'public';
ALTER FUNCTION increment_kudos_week(bigint, bigint) SET search_path = 'public';
ALTER FUNCTION perform_checkin(bigint) SET search_path = 'public';
ALTER FUNCTION prevent_ledger_mutation() SET search_path = 'public';
ALTER FUNCTION record_mission_progress(bigint, text, integer, integer) SET search_path = 'public';
ALTER FUNCTION refresh_weekly_kudos() SET search_path = 'public';
ALTER FUNCTION top_achievers(integer) SET search_path = 'public';
ALTER FUNCTION update_arcade_rooms_updated_at() SET search_path = 'public';
ALTER FUNCTION update_job_updated_at() SET search_path = 'public';


-- ============================================================================
-- PART 6: Revoke EXECUTE on SECURITY DEFINER functions from anon/authenticated
-- All 20 are called exclusively via getSupabaseAdmin() (service_role), which
-- bypasses privilege checks. Revoking prevents direct PostgREST RPC abuse
-- where anon users could call functions like credit_pixels, recalculate_ranks,
-- find_auth_user_by_github_login (which accesses auth.users!), etc.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION assign_new_dev_rank(bigint) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION credit_pixels(bigint, bigint, text, text, text, text, text, inet, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION deactivate_expired_ads() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION debit_pixels(bigint, bigint, text, text, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION earn_pixels(bigint, text, text, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION find_auth_user_by_github_login(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION get_ad_daily_stats(date, date, text[]) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION get_ad_stats(date, date, text[]) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION get_auth_users_without_developer() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION get_endorsements_given_this_month(bigint) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION heartbeat_visitor(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION increment_hired_count(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION increment_job_counter(uuid, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION increment_kudos_count(bigint) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION increment_referral_count(bigint) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION increment_visit_count(bigint) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION recalculate_ranks() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION refresh_sky_ad_stats() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION spend_pixels(bigint, text, text, bigint, boolean, inet, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION upsert_arcade_visit(uuid, uuid) FROM anon, authenticated;


-- ============================================================================
-- PART 7: Drop duplicate index
-- idx_dev_achievements_dev and idx_dev_achievements_dev_id are identical
-- (both btree on developer_id). Keeping the more descriptive name.
-- ============================================================================

DROP INDEX IF EXISTS idx_dev_achievements_dev;

COMMIT;
