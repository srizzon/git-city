-- 074: Hide sensitive columns from public API
-- Column-level REVOKE doesn't work when table-level SELECT is granted.
-- Fix: revoke table SELECT, then re-grant only safe columns.

REVOKE SELECT ON developers FROM anon, authenticated;

GRANT SELECT (
  id, github_login, github_id, name, avatar_url, bio,
  contributions, public_repos, total_stars, primary_language, top_repos,
  rank, fetched_at, created_at, claimed, claimed_by, fetch_priority, claimed_at,
  kudos_count, visit_count, referred_by, referral_count,
  contributions_total, contribution_years, total_prs, total_reviews,
  total_issues, repos_contributed_to, followers, following,
  organizations_count, account_created_at,
  current_streak, longest_streak, active_days_last_year, language_diversity,
  app_streak, app_longest_streak, last_checkin_date,
  streak_freezes_available, streak_freeze_30d_claimed,
  kudos_streak, last_kudos_given_date, raid_xp,
  current_week_contributions, current_week_kudos_given, current_week_kudos_received,
  rabbit_progress, rabbit_started_at, rabbit_completed, rabbit_completed_at,
  district, district_chosen, district_changes_count, district_changed_at, district_rank,
  timezone, last_active_at, city_theme,
  dailies_completed, dailies_streak, last_dailies_date,
  xp_total, xp_level, xp_github, xp_daily, xp_daily_date,
  github_etag, suspended
) ON developers TO anon, authenticated;

-- Hidden columns: email, email_verified, email_updated_at, vscode_api_key_hash, vscode_api_key
