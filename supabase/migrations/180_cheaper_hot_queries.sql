-- Two queries that held the database's CPU above 80% on 2026-10-19.

-- campaignStats reads notification_log with `dedup_key LIKE 'campaign:<id>:%'`
-- every 5 minutes. The (dedup_key, channel) indexes can't serve a LIKE prefix
-- under the default collation, so each page scanned all ~290k rows.
CREATE INDEX IF NOT EXISTS idx_notification_log_dedup_prefix
  ON notification_log (dedup_key text_pattern_ops)
  WHERE dedup_key IS NOT NULL;

-- A new dev's provisional rank recounted and re-summed the whole developers
-- table (three full scans, ~550ms) on every sign-up. Bump the totals instead;
-- recalculate_ranks (pg_cron, every 4h) still settles ranks and city_stats.
CREATE OR REPLACE FUNCTION assign_new_dev_rank(dev_id bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  added_contributions bigint;
BEGIN
  UPDATE developers d
  SET rank = s.total_developers + 1
  FROM city_stats s
  WHERE s.id = 1 AND d.id = dev_id AND d.rank IS NULL
  RETURNING coalesce(d.contributions, 0) INTO added_contributions;

  IF FOUND THEN
    UPDATE city_stats
    SET total_developers    = total_developers + 1,
        total_contributions = total_contributions + added_contributions,
        updated_at          = now()
    WHERE id = 1;
  END IF;
END;
$$;
