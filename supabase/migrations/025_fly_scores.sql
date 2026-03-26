-- Sky collectibles: per-session fly scores with daily seed leaderboard
CREATE TABLE fly_scores (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  developer_id  int NOT NULL REFERENCES developers(id),
  score         int NOT NULL,
  collected     int NOT NULL,
  max_combo     int NOT NULL DEFAULT 1,
  flight_ms     int NOT NULL,
  seed          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fly_scores_seed_score ON fly_scores(seed, score DESC);
CREATE INDEX idx_fly_scores_developer  ON fly_scores(developer_id, created_at DESC);

ALTER TABLE fly_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fly_scores_read" ON fly_scores FOR SELECT USING (true);
CREATE POLICY "fly_scores_insert" ON fly_scores FOR INSERT WITH CHECK (false);
