-- Leaderboard tabs (/leaderboard?tab=...) read the top 50 developers by one
-- metric: order by <metric> desc nulls last, created_at asc limit 50.
-- Without a matching index each tab sorted the whole developers table and hit
-- the statement timeout (~8s), so Stars / Architects / Recruiters / XP took 8s
-- and then rendered empty. Column order and direction match the query exactly
-- so the planner reads the first 50 index entries and stops.
CREATE INDEX IF NOT EXISTS idx_developers_lb_stars
  ON developers (total_stars DESC NULLS LAST, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_developers_lb_repos
  ON developers (public_repos DESC NULLS LAST, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_developers_lb_referrals
  ON developers (referral_count DESC NULLS LAST, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_developers_lb_xp
  ON developers (xp_total DESC NULLS LAST, created_at ASC);
