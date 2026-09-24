-- ─── Leagues ───────────────────────────────────────────────
-- Company and custom leagues with a weekly race, a hall of fame and crowns.
-- Scoring lives in src/lib/leagues/scoring.ts (reads xp_log +
-- league_weekly_stats); there is no SQL copy of it.
--
-- All tables are RLS-on with no public policies: every read and write goes
-- through API routes using the service-role client.

BEGIN;

-- ─── leagues ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leagues (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text NOT NULL UNIQUE,
  name         text NOT NULL,
  kind         text NOT NULL CHECK (kind IN ('company', 'custom')),
  github_org   text UNIQUE,                      -- company leagues only (lowercase org login)
  scoring_mode text NOT NULL DEFAULT 'xp' CHECK (scoring_mode IN ('xp', 'contributions')),
  admin_id     bigint REFERENCES developers(id) ON DELETE SET NULL,
  created_by   bigint REFERENCES developers(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leagues_company_has_org CHECK (kind <> 'company' OR github_org IS NOT NULL)
);

-- ─── league_members ────────────────────────────────────────
-- invited = dark building (never scores), active = scores, former = left the
-- company (kept for the hall of fame).
CREATE TABLE IF NOT EXISTS league_members (
  league_id      uuid   NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  developer_id   bigint NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
  status         text   NOT NULL CHECK (status IN ('invited', 'active', 'former')),
  verification   text   CHECK (verification IN ('public', 'private')),
  verified_until timestamptz,
  invited_by     bigint REFERENCES developers(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  joined_at      timestamptz,                   -- when the member became active
  left_at        timestamptz,
  PRIMARY KEY (league_id, developer_id)
);
CREATE INDEX IF NOT EXISTS idx_league_members_dev ON league_members(developer_id);
CREATE INDEX IF NOT EXISTS idx_league_members_league_status ON league_members(league_id, status);
CREATE INDEX IF NOT EXISTS idx_league_members_inviter ON league_members(invited_by, created_at);

-- ─── league_weekly_stats ───────────────────────────────────
-- GitHub contributions per dev per UTC day, refreshed hourly for active members.
CREATE TABLE IF NOT EXISTS league_weekly_stats (
  developer_id  bigint NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
  week_start    date   NOT NULL,
  day           date   NOT NULL,
  contributions int    NOT NULL DEFAULT 0,
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (developer_id, day)
);
CREATE INDEX IF NOT EXISTS idx_league_weekly_stats_week ON league_weekly_stats(week_start);

-- ─── league_weeks ──────────────────────────────────────────
-- Frozen standings per closed week. The PK makes the Monday close idempotent.
CREATE TABLE IF NOT EXISTS league_weeks (
  league_id  uuid NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  standings  jsonb NOT NULL DEFAULT '{}'::jsonb,
  winner_id  bigint REFERENCES developers(id) ON DELETE SET NULL,
  closed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (league_id, week_start)
);

-- ─── league_crowns ─────────────────────────────────────────
-- One crown per dev per week, even when they win several leagues.
CREATE TABLE IF NOT EXISTS league_crowns (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id bigint NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
  league_id    uuid   NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  week_start   date   NOT NULL,
  expires_at   timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT league_crowns_dev_week_unique UNIQUE (developer_id, week_start)
);
CREATE INDEX IF NOT EXISTS idx_league_crowns_expires ON league_crowns(expires_at);

-- ─── league_reward_claims ──────────────────────────────────
CREATE TABLE IF NOT EXISTS league_reward_claims (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id  bigint NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
  league_id     uuid   NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  week_start    date   NOT NULL,
  xp_amount     int    NOT NULL DEFAULT 0,
  pixels_amount int    NOT NULL DEFAULT 0,
  claim_key     text   NOT NULL,
  granted_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT league_reward_claim_key_unique UNIQUE (claim_key)
);
CREATE INDEX IF NOT EXISTS idx_league_reward_claims_dev ON league_reward_claims(developer_id);

-- ─── developer_orgs ────────────────────────────────────────
-- GitHub orgs a dev proved membership of, read from the OAuth provider_token
-- in the auth callback (the token itself is never stored). Feeds the
-- /leagues/verify page and silent 90-day renewals.
CREATE TABLE IF NOT EXISTS developer_orgs (
  developer_id bigint NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
  org_login    text   NOT NULL,                 -- lowercase
  org_name     text,
  avatar_url   text,
  verified_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (developer_id, org_login)
);
CREATE INDEX IF NOT EXISTS idx_developer_orgs_org ON developer_orgs(org_login);

-- ─── RLS: on, no public policies ───────────────────────────
ALTER TABLE leagues              ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_members       ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_weekly_stats  ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_weeks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_crowns        ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_reward_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE developer_orgs       ENABLE ROW LEVEL SECURITY;

-- ─── Email preference category ─────────────────────────────
ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS leagues boolean NOT NULL DEFAULT true;

-- ─── Wallet sources: + social, league_reward ───────────────
-- Same list as 118_fix_referral_source.sql, so the two migrations can land in
-- either order.
ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_source_check;
ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_source_check
  CHECK (source IN (
    'purchase',
    'daily_commit',
    'streak_bonus',
    'achievement',
    'city_action',
    'item_purchase',
    'refund',
    'chargeback',
    'adjustment',
    'event_reward',
    'social',
    'league_reward'
  ));

-- ─── grant_league_reward ───────────────────────────────────
-- Modeled on grant_event_reward (110) minus the event row. Idempotent on
-- claim_key: replays return early before any grant.
CREATE OR REPLACE FUNCTION grant_league_reward(
  p_developer_id bigint,
  p_league_id    uuid,
  p_week_start   date,
  p_xp           int,
  p_pixels       int,
  p_claim_key    text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_new uuid;
  v_old_balance bigint;
  v_new_balance bigint;
BEGIN
  -- Serialize a single player's concurrent claims (re-entrant within a tx).
  PERFORM pg_advisory_xact_lock(p_developer_id);

  INSERT INTO league_reward_claims
    (developer_id, league_id, week_start, xp_amount, pixels_amount, claim_key)
  VALUES (p_developer_id, p_league_id, p_week_start,
          COALESCE(p_xp, 0), COALESCE(p_pixels, 0), p_claim_key)
  ON CONFLICT (claim_key) DO NOTHING
  RETURNING id INTO v_new;

  IF v_new IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true);
  END IF;

  IF COALESCE(p_pixels, 0) > 0 THEN
    INSERT INTO wallets (developer_id)
    VALUES (p_developer_id)
    ON CONFLICT (developer_id) DO NOTHING;

    UPDATE wallets
    SET balance = balance + p_pixels,
        lifetime_earned = lifetime_earned + p_pixels,
        updated_at = now()
    WHERE developer_id = p_developer_id
    RETURNING balance - p_pixels, balance INTO v_old_balance, v_new_balance;

    INSERT INTO wallet_transactions (
      developer_id, type, amount, source,
      reference_id, reference_type, description,
      balance_before, balance_after, idempotency_key
    ) VALUES (
      p_developer_id, 'credit', p_pixels, 'league_reward',
      p_league_id::text, 'league', 'League weekly win (' || p_week_start::text || ')',
      v_old_balance, v_new_balance, 'lg_' || p_claim_key
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;

  IF COALESCE(p_xp, 0) > 0 THEN
    PERFORM grant_xp(p_developer_id, 'league_win', p_xp);
  END IF;

  RETURN jsonb_build_object('ok', true, 'granted', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION grant_league_reward(bigint, uuid, date, int, int, text) FROM PUBLIC;

COMMIT;
