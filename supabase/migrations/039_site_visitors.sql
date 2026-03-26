-- Lightweight site visitor presence tracking (replaces Supabase Realtime Presence channel)
CREATE TABLE IF NOT EXISTS site_visitors (
  session_id TEXT PRIMARY KEY,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_site_visitors_last_seen ON site_visitors (last_seen);

-- RPC: upsert visitor + prune stale + return count (single atomic call)
CREATE OR REPLACE FUNCTION heartbeat_visitor(p_session_id TEXT)
RETURNS INTEGER AS $$
DECLARE
  visitor_count INTEGER;
BEGIN
  INSERT INTO site_visitors (session_id, last_seen)
  VALUES (p_session_id, now())
  ON CONFLICT (session_id) DO UPDATE SET last_seen = now();

  DELETE FROM site_visitors WHERE last_seen < now() - INTERVAL '90 seconds';

  SELECT count(*) INTO visitor_count FROM site_visitors;

  RETURN visitor_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
