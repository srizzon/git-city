-- 048: Conversion tracking system
-- Allows advertisers to track conversions (signup, purchase, etc.) from Git City ads
-- via client-side pixel or server-side postback (S2S).

-- 1. Add click_id column to sky_ad_events (links CTA clicks to conversions)
ALTER TABLE sky_ad_events ADD COLUMN IF NOT EXISTS click_id TEXT;
CREATE INDEX IF NOT EXISTS idx_sky_ad_events_click_id ON sky_ad_events(click_id) WHERE click_id IS NOT NULL;

-- 2. Add webhook_secret to advertiser_accounts (used for S2S HMAC verification)
ALTER TABLE advertiser_accounts ADD COLUMN IF NOT EXISTS webhook_secret TEXT;

-- 3. Conversions table
CREATE TABLE sky_ad_conversions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ad_id TEXT NOT NULL REFERENCES sky_ads(id),
  click_id TEXT NOT NULL,
  event_name TEXT NOT NULL DEFAULT 'conversion',
  order_id TEXT,
  revenue_cents INTEGER,
  currency TEXT NOT NULL DEFAULT 'USD',
  ip_hash TEXT,
  source TEXT NOT NULL CHECK (source IN ('pixel', 's2s')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dedup: one order_id per ad_id
CREATE UNIQUE INDEX idx_sky_ad_conversions_order_dedup
  ON sky_ad_conversions(ad_id, order_id) WHERE order_id IS NOT NULL;

CREATE INDEX idx_sky_ad_conversions_ad_id ON sky_ad_conversions(ad_id);
CREATE INDEX idx_sky_ad_conversions_click_id ON sky_ad_conversions(click_id);
CREATE INDEX idx_sky_ad_conversions_created ON sky_ad_conversions(created_at);

-- RLS: only service role can access
ALTER TABLE sky_ad_conversions ENABLE ROW LEVEL SECURITY;

-- 4. Conversion daily stats materialized view
CREATE MATERIALIZED VIEW sky_ad_conversion_daily_stats AS
SELECT
  ad_id,
  date_trunc('day', created_at)::date AS day,
  COUNT(*) AS conversions,
  COALESCE(SUM(revenue_cents), 0) AS revenue_cents
FROM sky_ad_conversions
GROUP BY ad_id, date_trunc('day', created_at)::date;

CREATE UNIQUE INDEX idx_sky_ad_conversion_daily_stats
  ON sky_ad_conversion_daily_stats(ad_id, day);

-- 5. Update refresh function to also refresh conversion stats
CREATE OR REPLACE FUNCTION refresh_sky_ad_stats()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY sky_ad_daily_stats;
  REFRESH MATERIALIZED VIEW CONCURRENTLY sky_ad_conversion_daily_stats;
END;
$$;

-- 6. Updated RPCs: include conversion data via LEFT JOIN
-- Must drop first because return type changes (adding conversions + revenue_cents columns)

DROP FUNCTION IF EXISTS get_ad_stats(date, date, text[]);
DROP FUNCTION IF EXISTS get_ad_daily_stats(date, date, text[]);

CREATE OR REPLACE FUNCTION get_ad_stats(
  p_since date DEFAULT NULL,
  p_until date DEFAULT NULL,
  p_ad_ids text[] DEFAULT NULL
)
RETURNS TABLE(ad_id text, impressions bigint, clicks bigint, cta_clicks bigint, conversions bigint, revenue_cents bigint)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    s.ad_id,
    COALESCE(SUM(s.impressions), 0)::bigint AS impressions,
    COALESCE(SUM(s.clicks), 0)::bigint AS clicks,
    COALESCE(SUM(s.cta_clicks), 0)::bigint AS cta_clicks,
    COALESCE(c.conversions, 0)::bigint AS conversions,
    COALESCE(c.revenue_cents, 0)::bigint AS revenue_cents
  FROM sky_ad_daily_stats s
  LEFT JOIN (
    SELECT
      cv.ad_id,
      SUM(cv.conversions) AS conversions,
      SUM(cv.revenue_cents) AS revenue_cents
    FROM sky_ad_conversion_daily_stats cv
    WHERE (p_since IS NULL OR cv.day >= p_since)
      AND (p_until IS NULL OR cv.day < p_until)
    GROUP BY cv.ad_id
  ) c ON c.ad_id = s.ad_id
  WHERE (p_since IS NULL OR s.day >= p_since)
    AND (p_until IS NULL OR s.day < p_until)
    AND (p_ad_ids IS NULL OR s.ad_id = ANY(p_ad_ids))
  GROUP BY s.ad_id, c.conversions, c.revenue_cents;
$$;

CREATE OR REPLACE FUNCTION get_ad_daily_stats(
  p_since date DEFAULT NULL,
  p_until date DEFAULT NULL,
  p_ad_ids text[] DEFAULT NULL
)
RETURNS TABLE(ad_id text, day date, impressions bigint, clicks bigint, cta_clicks bigint, conversions bigint, revenue_cents bigint)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    s.ad_id,
    s.day,
    COALESCE(SUM(s.impressions), 0)::bigint AS impressions,
    COALESCE(SUM(s.clicks), 0)::bigint AS clicks,
    COALESCE(SUM(s.cta_clicks), 0)::bigint AS cta_clicks,
    COALESCE(c.conversions, 0)::bigint AS conversions,
    COALESCE(c.revenue_cents, 0)::bigint AS revenue_cents
  FROM sky_ad_daily_stats s
  LEFT JOIN sky_ad_conversion_daily_stats c
    ON c.ad_id = s.ad_id AND c.day = s.day
  WHERE (p_since IS NULL OR s.day >= p_since)
    AND (p_until IS NULL OR s.day < p_until)
    AND (p_ad_ids IS NULL OR s.ad_id = ANY(p_ad_ids))
  GROUP BY s.ad_id, s.day, c.conversions, c.revenue_cents
  ORDER BY s.day;
$$;
