-- ─── XP & Leveling System V1 ────────────────────────────────

-- New columns on developers table
ALTER TABLE developers ADD COLUMN IF NOT EXISTS xp_total integer NOT NULL DEFAULT 0;
ALTER TABLE developers ADD COLUMN IF NOT EXISTS xp_level integer NOT NULL DEFAULT 1;
ALTER TABLE developers ADD COLUMN IF NOT EXISTS xp_github integer NOT NULL DEFAULT 0;
ALTER TABLE developers ADD COLUMN IF NOT EXISTS xp_daily integer NOT NULL DEFAULT 0;
ALTER TABLE developers ADD COLUMN IF NOT EXISTS xp_daily_date date;

-- Index for leaderboard queries
CREATE INDEX IF NOT EXISTS idx_developers_xp_total ON developers(xp_total DESC);

-- XP audit log
CREATE TABLE IF NOT EXISTS xp_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id bigint NOT NULL REFERENCES developers(id),
  source text NOT NULL,
  amount integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_xp_log_dev ON xp_log(developer_id);
CREATE INDEX IF NOT EXISTS idx_xp_log_created ON xp_log(created_at);

-- ─── grant_xp RPC ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION grant_xp(
  p_developer_id bigint,
  p_source text,
  p_amount integer
) RETURNS json LANGUAGE plpgsql AS $$
DECLARE
  v_today date := CURRENT_DATE;
  v_daily integer;
  v_actual integer;
  v_new_total integer;
  v_new_level integer;
BEGIN
  -- Reset daily counter if new day
  UPDATE developers
  SET xp_daily = 0, xp_daily_date = v_today
  WHERE id = p_developer_id AND (xp_daily_date IS NULL OR xp_daily_date < v_today);

  SELECT xp_daily INTO v_daily FROM developers WHERE id = p_developer_id;

  -- Daily cap only for engagement sources
  IF p_source IN ('checkin', 'dailies', 'kudos_given', 'visit', 'fly') THEN
    v_actual := LEAST(p_amount, GREATEST(0, 150 - COALESCE(v_daily, 0)));
  ELSE
    v_actual := p_amount;
  END IF;

  IF v_actual <= 0 THEN
    RETURN json_build_object('granted', 0, 'reason', 'daily_cap');
  END IF;

  -- Increment XP
  UPDATE developers
  SET xp_total = xp_total + v_actual,
      xp_daily = COALESCE(xp_daily, 0) +
        CASE WHEN p_source IN ('checkin','dailies','kudos_given','visit','fly')
        THEN v_actual ELSE 0 END,
      xp_daily_date = v_today
  WHERE id = p_developer_id
  RETURNING xp_total INTO v_new_total;

  -- Calculate level (25 * level^2.2)
  v_new_level := 1;
  WHILE v_new_total >= (25 * POWER(v_new_level + 1, 2.2))::integer LOOP
    v_new_level := v_new_level + 1;
  END LOOP;

  -- Level never drops
  UPDATE developers SET xp_level = GREATEST(xp_level, v_new_level)
  WHERE id = p_developer_id;

  -- Audit log
  INSERT INTO xp_log (developer_id, source, amount)
  VALUES (p_developer_id, p_source, v_actual);

  RETURN json_build_object('granted', v_actual, 'new_total', v_new_total, 'new_level', v_new_level);
END;
$$;

-- ─── Backfill existing developers ───────────────────────────

DO $$
DECLARE
  r RECORD;
  v_github_xp integer;
  v_engagement_xp integer;
  v_total integer;
  v_level integer;
BEGIN
  FOR r IN SELECT * FROM developers LOOP
    -- GitHub XP (log scale, +1 to avoid log(0))
    v_github_xp := (
      FLOOR(LOG(2, GREATEST(r.contributions, 1) + 1) * 15) +
      FLOOR(LOG(2, GREATEST(r.total_stars, 1) + 1) * 10) +
      FLOOR(LOG(2, GREATEST(r.public_repos, 1) + 1) * 5) +
      FLOOR(LOG(2, GREATEST(COALESCE(r.total_prs, 0), 1) + 1) * 8)
    )::integer;

    -- Engagement XP retroactive estimate
    v_engagement_xp := (
      COALESCE(r.app_streak, 0) * 10 +
      COALESCE(r.dailies_completed, 0) * 25 +
      COALESCE(r.raid_xp, 0) +
      COALESCE(r.referral_count, 0) * 50
    );

    v_total := v_github_xp + v_engagement_xp;

    -- Calculate level
    v_level := 1;
    WHILE v_total >= (25 * POWER(v_level + 1, 2.2))::integer LOOP
      v_level := v_level + 1;
    END LOOP;

    UPDATE developers
    SET xp_total = v_total, xp_github = v_github_xp, xp_level = v_level
    WHERE id = r.id;
  END LOOP;
END $$;
