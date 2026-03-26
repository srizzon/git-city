-- HOTFIX: Kill the pg_cron job that's been hammering the database every 5 minutes
-- with a 114s+ CPU-bound query, causing all other queries to time out.
-- The RPC approach was reverted in app code (e8a4eed) but the cron job kept running.

-- 1. Unschedule the cron job
DO $$
BEGIN
  PERFORM cron.unschedule('refresh-city-snapshot');
EXCEPTION WHEN OTHERS THEN
  NULL; -- Job may already be gone
END;
$$;

-- 2. Drop the functions
DROP FUNCTION IF EXISTS get_cached_city_snapshot();
DROP FUNCTION IF EXISTS refresh_city_snapshot();
DROP FUNCTION IF EXISTS get_city_snapshot();

-- 3. Drop the cache table
DROP TABLE IF EXISTS city_snapshot_cache;

-- 4. Add missing indexes for the PostgREST city queries
-- Gift purchases query has no index on gifted_to (full table scan per chunk)
CREATE INDEX IF NOT EXISTS idx_purchases_gifted_to
  ON purchases(gifted_to, status) WHERE gifted_to IS NOT NULL;

-- Customizations query has no index at all (full table scan per chunk)
CREATE INDEX IF NOT EXISTS idx_customizations_dev_item
  ON developer_customizations(developer_id, item_id);
