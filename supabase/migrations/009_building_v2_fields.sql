-- Building Generation v2: expanded developer profile fields
-- Run manually in Supabase SQL Editor

ALTER TABLE developers ADD COLUMN IF NOT EXISTS contributions_total int DEFAULT 0;
ALTER TABLE developers ADD COLUMN IF NOT EXISTS contribution_years int[] DEFAULT '{}';
ALTER TABLE developers ADD COLUMN IF NOT EXISTS total_prs int DEFAULT 0;
ALTER TABLE developers ADD COLUMN IF NOT EXISTS total_reviews int DEFAULT 0;
ALTER TABLE developers ADD COLUMN IF NOT EXISTS total_issues int DEFAULT 0;
ALTER TABLE developers ADD COLUMN IF NOT EXISTS repos_contributed_to int DEFAULT 0;
ALTER TABLE developers ADD COLUMN IF NOT EXISTS followers int DEFAULT 0;
ALTER TABLE developers ADD COLUMN IF NOT EXISTS following int DEFAULT 0;
ALTER TABLE developers ADD COLUMN IF NOT EXISTS organizations_count int DEFAULT 0;
ALTER TABLE developers ADD COLUMN IF NOT EXISTS account_created_at timestamptz;
ALTER TABLE developers ADD COLUMN IF NOT EXISTS current_streak int DEFAULT 0;
ALTER TABLE developers ADD COLUMN IF NOT EXISTS longest_streak int DEFAULT 0;
ALTER TABLE developers ADD COLUMN IF NOT EXISTS active_days_last_year int DEFAULT 0;
ALTER TABLE developers ADD COLUMN IF NOT EXISTS language_diversity int DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_developers_contributions_total ON developers (contributions_total DESC);

-- Updated ranking: use contributions_total when available, fallback to contributions
-- Run this AFTER some devs have been re-fetched with v2 data
CREATE OR REPLACE FUNCTION recalculate_ranks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
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
  WHERE d.id = r.id;

  UPDATE city_stats
  SET total_developers = (SELECT count(*) FROM developers),
      total_contributions = (SELECT coalesce(sum(contributions), 0) FROM developers),
      updated_at = now()
  WHERE id = 1;
END;
$$;
