-- 098: Restore objects that exist in production but were created outside the
-- migration history (via the dashboard / SQL editor), so a fresh `supabase db
-- reset` produces a schema that matches production.
--
-- All definitions below are byte-for-byte equivalent to production (captured via
-- pg_dump), so re-applying this migration to prod is a no-op.
--
-- Discovered while bootstrapping local Supabase:
--   * developers.github_etag column         (referenced by 073/074 hardening)
--   * sky_ads.stripe_subscription_id column  (Stripe webhook / billing portal)
--   * sky_ads.stripe_customer_id column      (Stripe webhook / billing portal)
--   * count_devs_with_more_achievements()    (used by leaderboard-position API)
--   * increment_kudos_count()                (kudos API)
--   * increment_referral_count()             (auth callback)
--   * increment_visit_count()                (visit API)
--   * top_achievers()                        (leaderboard page)

BEGIN;

-- ----------------------------------------------------------------------------
-- developers.github_etag (HTTP ETag cache for GitHub fetches)
-- ----------------------------------------------------------------------------
ALTER TABLE developers ADD COLUMN IF NOT EXISTS github_etag text;
GRANT SELECT (github_etag) ON developers TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- sky_ads Stripe subscription fields (recurring ad billing — webhook + portal)
-- ----------------------------------------------------------------------------
ALTER TABLE sky_ads ADD COLUMN IF NOT EXISTS stripe_subscription_id text;
ALTER TABLE sky_ads ADD COLUMN IF NOT EXISTS stripe_customer_id text;

-- ----------------------------------------------------------------------------
-- Achievement leaderboard helpers (SECURITY INVOKER, STABLE)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION count_devs_with_more_achievements(target_count bigint)
RETURNS bigint
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  SELECT COUNT(*)
  FROM (
    SELECT developer_id
    FROM developer_achievements
    GROUP BY developer_id
    HAVING COUNT(*) > target_count
  ) sub;
$$;

CREATE OR REPLACE FUNCTION top_achievers(lim integer DEFAULT 50)
RETURNS TABLE(developer_id bigint, ach_count bigint)
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  SELECT developer_id, COUNT(*) AS ach_count
  FROM developer_achievements
  GROUP BY developer_id
  ORDER BY ach_count DESC
  LIMIT lim;
$$;

-- ----------------------------------------------------------------------------
-- Counter bumps (SECURITY DEFINER — revoked from PUBLIC, service_role only)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION increment_kudos_count(target_dev_id bigint)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
begin
  update developers
  set kudos_count = kudos_count + 1
  where id = target_dev_id;
end;
$$;

CREATE OR REPLACE FUNCTION increment_referral_count(referrer_dev_id bigint)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
begin
  update developers
  set referral_count = referral_count + 1
  where id = referrer_dev_id;
end;
$$;

CREATE OR REPLACE FUNCTION increment_visit_count(target_dev_id bigint)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
begin
  update developers
  set visit_count = visit_count + 1
  where id = target_dev_id;
end;
$$;

-- Match production grants: SECURITY DEFINER counters are service_role-only.
REVOKE EXECUTE ON FUNCTION increment_kudos_count(bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION increment_referral_count(bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION increment_visit_count(bigint) FROM PUBLIC;

COMMIT;
