-- ─── Security lockdown ─────────────────────────────────────
-- Grants, RLS switches and publication membership only; no row is touched.
--
-- 1. developers: anon/authenticated can no longer read email or the VS Code
--    key. 077 restored table-level SELECT assuming those columns were empty;
--    they aren't. PostgREST expands select("*") to every column, so cookie
--    and anon clients read through PUBLIC_DEVELOPER_COLUMNS
--    (src/lib/developer-columns.ts), which must match this list.
-- 2. developers leaves the realtime publication: nothing subscribes to it,
--    and it streamed every column (email and key included) to any client.
-- 3. sky_ads / arcade_rooms: purchaser email, Stripe ids, tracking token and
--    room password hash are service-role only.
-- 4. RLS on the three public tables that had it off. No policies: the app
--    reads and writes them with the service role only.
-- 5. No anon/authenticated EXECUTE on any function in public, dblink
--    included (it let anon open connections from the database host). Every
--    RPC the app makes goes through the service-role client, and trigger
--    functions don't need EXECUTE to fire.
-- 6. New tables and sequences in public no longer grant anon/authenticated
--    anything by default (the reason 4 was reachable). A table meant for
--    client reads now needs an explicit GRANT in its migration.
-- 7. Advisor: security-definer views and mutable search_path functions.

BEGIN;

-- 1 ─ developers sensitive columns
REVOKE SELECT ON public.developers FROM anon, authenticated;
GRANT SELECT (
  id, github_login, github_id, name, avatar_url, bio, contributions, public_repos, total_stars,
  primary_language, top_repos, rank, fetched_at, created_at, claimed, claimed_by, fetch_priority,
  claimed_at, kudos_count, visit_count, referred_by, referral_count, contributions_total,
  contribution_years, total_prs, total_reviews, total_issues, repos_contributed_to, followers,
  following, organizations_count, account_created_at, current_streak, longest_streak,
  active_days_last_year, language_diversity, app_streak, app_longest_streak, last_checkin_date,
  streak_freezes_available, streak_freeze_30d_claimed, kudos_streak, last_kudos_given_date, raid_xp,
  current_week_contributions, current_week_kudos_given, current_week_kudos_received,
  rabbit_progress, rabbit_started_at, rabbit_completed, rabbit_completed_at, district,
  district_chosen, district_changes_count, district_changed_at, district_rank, timezone,
  last_active_at, city_theme, dailies_completed, dailies_streak, last_dailies_date, xp_total,
  xp_level, xp_github, xp_daily, xp_daily_date, github_etag, suspended, contributions_cy,
  contributions_cy_year
) ON public.developers TO anon, authenticated;

-- 2 ─ realtime
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables
             WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'developers') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.developers;
  END IF;
END $$;

-- 3 ─ other sensitive columns
REVOKE SELECT ON public.sky_ads FROM anon, authenticated;
GRANT SELECT (
  id, brand, text, description, color, bg_color, link, vehicle, priority, active, starts_at,
  ends_at, created_at, plan_id, expiry_notified, pix_id, advertiser_id, amount_paid_cents, currency
) ON public.sky_ads TO anon, authenticated;

REVOKE SELECT ON public.arcade_rooms FROM anon, authenticated;
GRANT SELECT (
  id, slug, name, room_type, floor_number, map_json, max_players, owner_id, portals, created_at,
  updated_at, visibility, category, description, is_featured, search_vector
) ON public.arcade_rooms TO anon, authenticated;

-- 4 ─ RLS off → on
ALTER TABLE public.job_application_email_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cosmetic_sets               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cosmetic_seasons            ENABLE ROW LEVEL SECURITY;

-- 5 ─ functions: service role only
DO $$
DECLARE
  f regprocedure;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.prokind IN ('f', 'p')
      AND (has_function_privilege('anon', p.oid, 'EXECUTE')
           OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
END $$;

-- 6 ─ default privileges for objects the migration role creates in public
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;

-- 7 ─ advisor
ALTER VIEW public.emblem_stats    SET (security_invoker = true);
ALTER VIEW public.v_event_summary SET (security_invoker = true);

ALTER FUNCTION public.arcade_buy_item(bigint, text) SET search_path = public;
ALTER FUNCTION public.increment_job_counter(uuid, text) SET search_path = public;
ALTER FUNCTION public.count_job_events_by_listing(uuid[], timestamptz, timestamptz) SET search_path = public;
ALTER FUNCTION public.event_instances_guard() SET search_path = public;
ALTER FUNCTION public.landmarks_set_updated_at() SET search_path = public;

COMMIT;
