-- Efficient grouped count of job listing events for weekly reports.
-- Returns listing_id, event_type, cnt for the given time window.
CREATE OR REPLACE FUNCTION count_job_events_by_listing(
  p_listing_ids UUID[],
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ
)
RETURNS TABLE (listing_id UUID, event_type TEXT, cnt BIGINT)
LANGUAGE sql STABLE
AS $$
  SELECT
    e.listing_id,
    e.event_type,
    COUNT(*) AS cnt
  FROM job_listing_events e
  WHERE e.listing_id = ANY(p_listing_ids)
    AND e.created_at >= p_from
    AND e.created_at < p_to
  GROUP BY e.listing_id, e.event_type;
$$;
