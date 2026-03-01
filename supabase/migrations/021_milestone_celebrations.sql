-- Milestone celebrations: tracks when each milestone (10k, 15k, 20k...) was reached
CREATE TABLE IF NOT EXISTS milestone_celebrations (
  milestone   integer PRIMARY KEY,
  reached_at  timestamptz NOT NULL DEFAULT now()
);

-- 10K Pioneer achievement
INSERT INTO achievements (id, category, name, description, threshold, tier, reward_type, reward_item_id, sort_order)
VALUES (
  'pioneer_10k',
  'milestone',
  '10K Pioneer',
  'Was part of Git City when it reached 10,000 developers',
  0,
  'diamond',
  'exclusive_badge',
  NULL,
  0
) ON CONFLICT (id) DO NOTHING;

-- Bulk grant to ALL existing devs
INSERT INTO developer_achievements (developer_id, achievement_id)
SELECT id, 'pioneer_10k' FROM developers
ON CONFLICT (developer_id, achievement_id) DO NOTHING;
