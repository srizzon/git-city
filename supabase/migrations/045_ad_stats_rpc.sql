-- Aggregated ad stats via RPC instead of pulling thousands of view rows client-side.
-- The materialized view sky_ad_daily_stats has rows per (ad_id, day, country, device),
-- which can be 100+ rows per ad per day. These RPCs aggregate in Postgres and return
-- only the data each consumer actually needs.

-- Returns aggregated totals per ad_id for a given period.
-- Used by: admin analytics, advertiser dashboard, weekly report cron.
CREATE OR REPLACE FUNCTION get_ad_stats(
  p_since date DEFAULT NULL,
  p_until date DEFAULT NULL,
  p_ad_ids text[] DEFAULT NULL
)
RETURNS TABLE(ad_id text, impressions bigint, clicks bigint, cta_clicks bigint)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    s.ad_id,
    COALESCE(SUM(s.impressions), 0)::bigint AS impressions,
    COALESCE(SUM(s.clicks), 0)::bigint AS clicks,
    COALESCE(SUM(s.cta_clicks), 0)::bigint AS cta_clicks
  FROM sky_ad_daily_stats s
  WHERE (p_since IS NULL OR s.day >= p_since)
    AND (p_until IS NULL OR s.day < p_until)
    AND (p_ad_ids IS NULL OR s.ad_id = ANY(p_ad_ids))
  GROUP BY s.ad_id;
$$;

-- Returns daily breakdown per ad_id for a given period.
-- Used by: advertiser dashboard (chart), per-ad API.
CREATE OR REPLACE FUNCTION get_ad_daily_stats(
  p_since date DEFAULT NULL,
  p_until date DEFAULT NULL,
  p_ad_ids text[] DEFAULT NULL
)
RETURNS TABLE(ad_id text, day date, impressions bigint, clicks bigint, cta_clicks bigint)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    s.ad_id,
    s.day,
    COALESCE(SUM(s.impressions), 0)::bigint AS impressions,
    COALESCE(SUM(s.clicks), 0)::bigint AS clicks,
    COALESCE(SUM(s.cta_clicks), 0)::bigint AS cta_clicks
  FROM sky_ad_daily_stats s
  WHERE (p_since IS NULL OR s.day >= p_since)
    AND (p_until IS NULL OR s.day < p_until)
    AND (p_ad_ids IS NULL OR s.ad_id = ANY(p_ad_ids))
  GROUP BY s.ad_id, s.day
  ORDER BY s.day;
$$;

-- Deactivate expired ads. Run via cron to keep database clean.
CREATE OR REPLACE FUNCTION deactivate_expired_ads()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  affected integer;
BEGIN
  UPDATE sky_ads
  SET active = false
  WHERE active = true
    AND ends_at IS NOT NULL
    AND ends_at < now();
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

-- Schedule expired ads cleanup every 15 minutes (same cadence as view refresh)
SELECT cron.schedule(
  'deactivate-expired-ads',
  '*/15 * * * *',
  $$SELECT deactivate_expired_ads()$$
);

-- Add "landmark" to vehicle CHECK constraint
ALTER TABLE sky_ads DROP CONSTRAINT IF EXISTS sky_ads_vehicle_check;
ALTER TABLE sky_ads ADD CONSTRAINT sky_ads_vehicle_check
  CHECK (vehicle IN ('plane', 'blimp', 'billboard', 'rooftop_sign', 'led_wrap', 'landmark'));
