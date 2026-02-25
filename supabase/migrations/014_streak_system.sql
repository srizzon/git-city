-- ============================================================
-- 014: Streak System
-- Adds app streak columns, checkin/freeze tables, RPCs,
-- streak achievements, and streak_freeze consumable item.
-- ============================================================

-- ─── 1. New columns on developers ──────────────────────────
ALTER TABLE developers
  ADD COLUMN IF NOT EXISTS app_streak              int     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS app_longest_streak      int     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_checkin_date       date    NULL,
  ADD COLUMN IF NOT EXISTS streak_freezes_available int    DEFAULT 0,
  ADD COLUMN IF NOT EXISTS streak_freeze_30d_claimed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS kudos_streak            int     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_kudos_given_date   date    NULL;

-- ─── 2. streak_checkins table ──────────────────────────────
CREATE TABLE IF NOT EXISTS streak_checkins (
  developer_id  bigint    NOT NULL REFERENCES developers(id),
  checkin_date  date      NOT NULL DEFAULT current_date,
  type          text      NOT NULL DEFAULT 'active' CHECK (type IN ('active', 'frozen')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (developer_id, checkin_date)
);

CREATE INDEX IF NOT EXISTS idx_streak_checkins_dev_date
  ON streak_checkins (developer_id, checkin_date DESC);

ALTER TABLE streak_checkins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "streak_checkins_public_read" ON streak_checkins;
CREATE POLICY "streak_checkins_public_read" ON streak_checkins
  FOR SELECT USING (true);

-- ─── 3. streak_freeze_log table ────────────────────────────
CREATE TABLE IF NOT EXISTS streak_freeze_log (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id  bigint      NOT NULL REFERENCES developers(id),
  action        text        NOT NULL CHECK (action IN ('purchased', 'granted_milestone', 'consumed')),
  frozen_date   date        NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_streak_freeze_log_dev
  ON streak_freeze_log (developer_id, created_at DESC);

ALTER TABLE streak_freeze_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "streak_freeze_log_public_read" ON streak_freeze_log;
CREATE POLICY "streak_freeze_log_public_read" ON streak_freeze_log
  FOR SELECT USING (true);

-- ─── 4. perform_checkin RPC ────────────────────────────────
CREATE OR REPLACE FUNCTION perform_checkin(p_developer_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_last_date    date;
  v_streak       int;
  v_longest      int;
  v_freezes      int;
  v_today        date := current_date;
  v_was_frozen   boolean := false;
BEGIN
  -- Lock the developer row to prevent race conditions
  SELECT last_checkin_date, app_streak, app_longest_streak, streak_freezes_available
    INTO v_last_date, v_streak, v_longest, v_freezes
    FROM developers
   WHERE id = p_developer_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'checked_in', false,
      'error', 'developer_not_found'
    );
  END IF;

  -- Already checked in today: idempotent return
  IF v_last_date = v_today THEN
    RETURN jsonb_build_object(
      'checked_in', false,
      'already_today', true,
      'streak', v_streak,
      'longest', v_longest
    );
  END IF;

  -- Consecutive day: streak + 1
  IF v_last_date = v_today - 1 THEN
    v_streak := v_streak + 1;

  -- Missed exactly 1 day AND has freeze available
  ELSIF v_last_date = v_today - 2 AND v_freezes > 0 THEN
    v_freezes := v_freezes - 1;
    v_streak := v_streak + 1;
    v_was_frozen := true;

    -- Insert the frozen day check-in (yesterday)
    INSERT INTO streak_checkins (developer_id, checkin_date, type)
    VALUES (p_developer_id, v_today - 1, 'frozen')
    ON CONFLICT DO NOTHING;

    -- Log the freeze consumption
    INSERT INTO streak_freeze_log (developer_id, action, frozen_date)
    VALUES (p_developer_id, 'consumed', v_today - 1);

  -- Any other gap: reset
  ELSE
    v_streak := 1;
  END IF;

  -- Update longest
  IF v_streak > v_longest THEN
    v_longest := v_streak;
  END IF;

  -- Update developer row
  UPDATE developers
     SET app_streak = v_streak,
         app_longest_streak = v_longest,
         last_checkin_date = v_today,
         streak_freezes_available = v_freezes
   WHERE id = p_developer_id;

  -- Insert today's check-in
  INSERT INTO streak_checkins (developer_id, checkin_date, type)
  VALUES (p_developer_id, v_today, 'active')
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'checked_in', true,
    'already_today', false,
    'streak', v_streak,
    'longest', v_longest,
    'was_frozen', v_was_frozen
  );
END;
$$;

-- ─── 5. grant_streak_freeze RPC ───────────────────────────
CREATE OR REPLACE FUNCTION grant_streak_freeze(p_developer_id bigint)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE developers
     SET streak_freezes_available = LEAST(streak_freezes_available + 1, 2)
   WHERE id = p_developer_id;
END;
$$;

-- ─── 6. Streak achievements ───────────────────────────────
INSERT INTO achievements (id, category, name, description, threshold, tier, reward_type, reward_item_id, sort_order)
VALUES
  ('on_fire',         'streak',       'On Fire',        '7-day app streak',   7,   'bronze',  'exclusive_badge', NULL, 200),
  ('dedicated',       'streak',       'Dedicated',      '30-day app streak',  30,  'silver',  'exclusive_badge', NULL, 201),
  ('obsessed',        'streak',       'Obsessed',       '100-day app streak', 100, 'gold',    'exclusive_badge', NULL, 202),
  ('no_life',         'streak',       'No Life',        '365-day app streak', 365, 'diamond', 'exclusive_badge', NULL, 203),
  ('generous_streak', 'kudos_streak', 'Generous Streak','7-day kudos streak', 7,   'bronze',  'exclusive_badge', NULL, 210)
ON CONFLICT (id) DO NOTHING;

-- ─── 7. Streak Freeze consumable item ─────────────────────
INSERT INTO items (id, category, name, description, price_usd_cents, price_brl_cents, is_active)
VALUES ('streak_freeze', 'consumable', 'Streak Freeze', 'Protects 1 day of absence. Max 2 stored.', 99, 490, true)
ON CONFLICT (id) DO NOTHING;
