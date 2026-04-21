-- 079: Arcade scores table for minigames (10s challenge, etc.)

CREATE TABLE arcade_scores (
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  game text NOT NULL,
  best_ms integer NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, game)
);

-- Leaderboard query: top N by best_ms ascending per game
CREATE INDEX idx_arcade_scores_leaderboard
  ON arcade_scores (game, best_ms ASC);

-- RLS: anyone can read, only service_role can write
ALTER TABLE arcade_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read scores"
  ON arcade_scores FOR SELECT USING (true);

CREATE POLICY "Service role manages scores"
  ON arcade_scores FOR ALL USING (false);

-- Milestones tracking: which precision milestones a player has earned
CREATE TABLE arcade_milestones (
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  game text NOT NULL,
  milestone text NOT NULL,
  earned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, game, milestone)
);

ALTER TABLE arcade_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read milestones"
  ON arcade_milestones FOR SELECT USING (true);

CREATE POLICY "Service role manages milestones"
  ON arcade_milestones FOR ALL USING (false);

-- Achievements for arcade games (inserted into achievements table)
INSERT INTO achievements (id, category, name, description, threshold, tier, reward_type, sort_order)
VALUES
  ('arcade_hello_friend', 'arcade', 'Hello, Friend', 'Play the 10 Second Challenge for the first time', 1, 'bronze', 'exclusive_badge', 900),
  ('arcade_not_bad_kiddo', 'arcade', 'Not Bad, Kiddo', 'Score within 100ms on the 10 Second Challenge', 100, 'silver', 'exclusive_badge', 901),
  ('arcade_control_illusion', 'arcade', 'Control Is An Illusion', 'Score within 25ms on the 10 Second Challenge', 25, 'gold', 'exclusive_badge', 902),
  ('arcade_perfection', 'arcade', '10.000', 'Score within 5ms on the 10 Second Challenge', 5, 'diamond', 'exclusive_badge', 903);
