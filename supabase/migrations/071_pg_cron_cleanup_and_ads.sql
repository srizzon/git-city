-- Migrate cleanup-sessions and refresh-ad-stats from Vercel cron to pg_cron (free)

-- 1. Cleanup sessions: mark idle/offline, prune stale visitors
--    Runs every minute (was every 5 min on Vercel, now free so can be more precise)
SELECT cron.schedule('cleanup-sessions', '* * * * *', $$
  -- Mark offline if no heartbeat in 15 minutes
  UPDATE developer_sessions
  SET status = 'offline', ended_at = now()
  WHERE status IN ('active', 'idle')
    AND last_heartbeat_at < now() - interval '15 minutes';

  -- Mark idle if no heartbeat in 5 minutes
  UPDATE developer_sessions
  SET status = 'idle'
  WHERE status = 'active'
    AND last_heartbeat_at < now() - interval '5 minutes';

  -- Prune stale site visitors (heartbeat window is 90s)
  DELETE FROM site_visitors
  WHERE last_seen < now() - interval '90 seconds';
$$);

-- 2. Refresh ad stats: calls existing RPC
--    Runs every hour (same as Vercel)
SELECT cron.schedule('refresh-ad-stats', '0 * * * *', 'SELECT refresh_sky_ad_stats()');
