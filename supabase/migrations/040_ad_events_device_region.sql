-- 038: Add device and region columns to sky_ad_events + update materialized view

-- Device column for UA-based device tracking
ALTER TABLE sky_ad_events ADD COLUMN IF NOT EXISTS device TEXT;
CREATE INDEX IF NOT EXISTS idx_sky_ad_events_device ON sky_ad_events(device) WHERE device IS NOT NULL;

-- Region column for finer geo granularity (x-vercel-ip-country-region)
ALTER TABLE sky_ad_events ADD COLUMN IF NOT EXISTS region TEXT;

-- Recreate materialized view with device and country breakdowns.
-- COALESCE NULLs to empty string so the unique index works with
-- REFRESH MATERIALIZED VIEW CONCURRENTLY (PG treats NULLs as distinct).
DROP MATERIALIZED VIEW IF EXISTS sky_ad_daily_stats;
CREATE MATERIALIZED VIEW sky_ad_daily_stats AS
SELECT
  ad_id,
  date_trunc('day', created_at)::date AS day,
  COUNT(*) FILTER (WHERE event_type = 'impression') AS impressions,
  COUNT(*) FILTER (WHERE event_type = 'click') AS clicks,
  COUNT(*) FILTER (WHERE event_type = 'cta_click') AS cta_clicks,
  COALESCE(country, '') AS country,
  COALESCE(device, '') AS device
FROM sky_ad_events
GROUP BY ad_id, date_trunc('day', created_at)::date, COALESCE(country, ''), COALESCE(device, '');

CREATE UNIQUE INDEX idx_sky_ad_daily_stats ON sky_ad_daily_stats(ad_id, day, country, device);
