-- Simplify heartbeat_visitor: upsert only, no prune or count.
-- Pruning moved to cleanup-sessions cron. Count served via cached GET endpoint.
CREATE OR REPLACE FUNCTION heartbeat_visitor(p_session_id TEXT)
RETURNS VOID AS $$
BEGIN
  INSERT INTO site_visitors (session_id, last_seen)
  VALUES (p_session_id, now())
  ON CONFLICT (session_id) DO UPDATE SET last_seen = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
