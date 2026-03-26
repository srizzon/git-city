-- 026_dailies.sql — Daily missions system
-- 3 daily missions per player, deterministic via seed, with progress tracking

-- ─── Daily mission progress table ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_mission_progress (
  developer_id  bigint  NOT NULL REFERENCES developers(id),
  mission_date  date    NOT NULL DEFAULT current_date,
  mission_id    text    NOT NULL,
  progress      int     NOT NULL DEFAULT 0,
  completed     boolean NOT NULL DEFAULT false,
  completed_at  timestamptz,
  PRIMARY KEY (developer_id, mission_date, mission_id)
);

CREATE INDEX IF NOT EXISTS idx_dmp_dev_date
  ON daily_mission_progress(developer_id, mission_date DESC);

ALTER TABLE daily_mission_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dmp_public_read"
  ON daily_mission_progress FOR SELECT USING (true);

CREATE POLICY "dmp_service_insert"
  ON daily_mission_progress FOR INSERT WITH CHECK (false);

CREATE POLICY "dmp_service_update"
  ON daily_mission_progress FOR UPDATE USING (false);

-- ─── Columns on developers ─────────────────────────────────────────────
ALTER TABLE developers
  ADD COLUMN IF NOT EXISTS dailies_completed int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dailies_streak    int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_dailies_date date;

-- ─── RPC: record mission progress (idempotent, race-safe) ──────────────
CREATE OR REPLACE FUNCTION record_mission_progress(
  p_developer_id bigint,
  p_mission_id   text,
  p_threshold    int,
  p_increment    int DEFAULT 1
)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_today    date := current_date;
  v_progress int;
  v_completed boolean;
BEGIN
  -- Upsert progress row
  INSERT INTO daily_mission_progress (developer_id, mission_date, mission_id, progress)
  VALUES (p_developer_id, v_today, p_mission_id, p_increment)
  ON CONFLICT (developer_id, mission_date, mission_id)
  DO UPDATE SET progress = LEAST(daily_mission_progress.progress + p_increment, p_threshold)
  WHERE daily_mission_progress.completed = false;

  -- Read current state
  SELECT progress, completed INTO v_progress, v_completed
  FROM daily_mission_progress
  WHERE developer_id = p_developer_id
    AND mission_date = v_today
    AND mission_id = p_mission_id;

  -- Auto-complete if threshold reached
  IF v_progress >= p_threshold AND NOT v_completed THEN
    UPDATE daily_mission_progress
    SET completed = true, completed_at = now()
    WHERE developer_id = p_developer_id
      AND mission_date = v_today
      AND mission_id = p_mission_id;

    v_completed := true;
  END IF;

  RETURN jsonb_build_object(
    'progress', v_progress,
    'completed', v_completed,
    'threshold', p_threshold
  );
END;
$$;

-- ─── RPC: complete all dailies (called when 3/3 done) ──────────────────
CREATE OR REPLACE FUNCTION complete_all_dailies(p_developer_id bigint)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_today       date := current_date;
  v_last_date   date;
  v_old_streak  int;
  v_new_streak  int;
  v_total       int;
BEGIN
  -- Lock the developer row
  SELECT last_dailies_date, dailies_streak, dailies_completed
  INTO v_last_date, v_old_streak, v_total
  FROM developers
  WHERE id = p_developer_id
  FOR UPDATE;

  -- Already completed today
  IF v_last_date = v_today THEN
    RETURN jsonb_build_object('already_completed', true, 'streak', v_old_streak, 'total', v_total);
  END IF;

  -- Calculate streak
  IF v_last_date = v_today - 1 THEN
    v_new_streak := v_old_streak + 1;
  ELSE
    v_new_streak := 1;
  END IF;

  v_total := v_total + 1;

  UPDATE developers
  SET dailies_completed = v_total,
      dailies_streak = v_new_streak,
      last_dailies_date = v_today
  WHERE id = p_developer_id;

  RETURN jsonb_build_object(
    'already_completed', false,
    'streak', v_new_streak,
    'total', v_total
  );
END;
$$;

-- ─── Achievements (4 tiers) ────────────────────────────────────────────
INSERT INTO achievements (id, category, name, description, threshold, tier, reward_type, reward_item_id, sort_order)
VALUES
  ('daily_rookie',  'dailies', 'Daily Rookie',  'Complete all dailies 7 times',   7,   'bronze',  'exclusive_badge', NULL, 300),
  ('daily_regular', 'dailies', 'Daily Regular', 'Complete all dailies 30 times',  30,  'silver',  'exclusive_badge', NULL, 301),
  ('daily_master',  'dailies', 'Daily Master',  'Complete all dailies 100 times', 100, 'gold',    'exclusive_badge', NULL, 302),
  ('daily_legend',  'dailies', 'Daily Legend',  'Complete all dailies 365 times', 365, 'diamond', 'exclusive_badge', NULL, 303)
ON CONFLICT (id) DO NOTHING;
