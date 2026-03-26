-- Optimize recalculate_ranks() to only update rows where rank actually changed.
-- Previously it updated ALL ~33k rows every 30 minutes, causing massive lock contention,
-- dead tuple bloat, and 10-120s latencies on unrelated queries.

-- Index to speed up the ranking window function
CREATE INDEX IF NOT EXISTS idx_developers_rank_order
  ON developers (contributions_total DESC, contributions DESC, github_login ASC);

CREATE OR REPLACE FUNCTION recalculate_ranks()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET statement_timeout = '120s'
AS $$
BEGIN
  WITH ranked AS (
    SELECT id, row_number() OVER (
      ORDER BY CASE WHEN contributions_total > 0 THEN contributions_total ELSE contributions END DESC,
      github_login ASC
    ) AS new_rank
    FROM developers
  )
  UPDATE developers d
  SET rank = r.new_rank
  FROM ranked r
  WHERE d.id = r.id
    AND d.rank IS DISTINCT FROM r.new_rank;

  UPDATE city_stats
  SET total_developers    = (SELECT count(*) FROM developers),
      total_contributions = (SELECT coalesce(sum(contributions), 0) FROM developers),
      updated_at          = now()
  WHERE id = 1;
END;
$$;

-- Lightweight function for new devs: assign last rank without full recalc
CREATE OR REPLACE FUNCTION assign_new_dev_rank(dev_id bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE developers SET rank = (SELECT count(*) FROM developers) WHERE id = dev_id AND rank IS NULL;
  UPDATE city_stats
  SET total_developers    = (SELECT count(*) FROM developers),
      total_contributions = (SELECT coalesce(sum(contributions), 0) FROM developers),
      updated_at          = now()
  WHERE id = 1;
END;
$$;

-- Reduce cron frequency from every 30 min to every 4 hours
SELECT cron.unschedule('recalculate-ranks');
SELECT cron.schedule('recalculate-ranks', '0 */4 * * *', 'SELECT recalculate_ranks()');
