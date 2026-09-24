-- ─── League hardening ──────────────────────────────────────
-- invite_token: a custom league's open invite link carries it (`t=`). Joining
-- without an `invited` row needs it, and the admin can rotate it. New leagues
-- get one from the column default; existing leagues keep NULL (no backfill)
-- until the admin first opens the invite link, which generates and stores
-- one. A NULL token accepts no one.
--
-- removed_by: set when an admin removes a member. Those members can't rejoin
-- on their own (token link, org verification); only a new invite brings them
-- back. Leaving voluntarily leaves it NULL.
--
-- league_invite_attempts: one row per invite attempt, taken before the
-- GitHub lookup, so failed and repeated invites count toward the daily limit.
-- Kept 30 days.
--
-- league_take_quota: count-then-take for per-dev limits, serialized per dev
-- and kind with an advisory lock. 'invite' also records the attempt.
--
-- league_create_custom: creates a custom league and its admin membership
-- under the same locks as the quota checks, so parallel requests can't slip
-- past the membership or daily creation limits.
--
-- RLS on, no policies: reads and writes go through API routes using the
-- service-role client.

BEGIN;

-- ─── leagues.invite_token ──────────────────────────────────
-- Added without a default first so existing rows stay NULL, then the default
-- covers new rows. gen_random_uuid() draws from the strong random source.
ALTER TABLE public.leagues ADD COLUMN IF NOT EXISTS invite_token text;
ALTER TABLE public.leagues
  ALTER COLUMN invite_token SET DEFAULT translate(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

-- ─── league_members.removed_by ─────────────────────────────
ALTER TABLE public.league_members
  ADD COLUMN IF NOT EXISTS removed_by bigint REFERENCES public.developers(id) ON DELETE SET NULL;

-- ─── league_invite_attempts ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.league_invite_attempts (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  developer_id bigint NOT NULL,
  at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_league_invite_attempts_dev_at ON public.league_invite_attempts(developer_id, at);
ALTER TABLE public.league_invite_attempts ENABLE ROW LEVEL SECURITY;

-- ─── league_take_quota ─────────────────────────────────────
-- Kinds: 'invite' (attempts in p_window), 'create' (leagues created in
-- p_window), 'membership' (active custom memberships; p_window unused).
-- Returns false when the dev is at p_limit.
CREATE OR REPLACE FUNCTION public.league_take_quota(
  p_dev_id bigint,
  p_kind   text,
  p_limit  int,
  p_window interval
) RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_count int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('league_quota:' || p_kind || ':' || p_dev_id, 0));

  IF p_kind = 'invite' THEN
    SELECT count(*) INTO v_count FROM public.league_invite_attempts a
    WHERE a.developer_id = p_dev_id AND a.at > now() - p_window;
  ELSIF p_kind = 'create' THEN
    SELECT count(*) INTO v_count FROM public.leagues l
    WHERE l.created_by = p_dev_id AND l.created_at > now() - p_window;
  ELSIF p_kind = 'membership' THEN
    SELECT count(*) INTO v_count FROM public.league_members m
    JOIN public.leagues l ON l.id = m.league_id
    WHERE m.developer_id = p_dev_id AND m.status = 'active' AND l.kind = 'custom';
  ELSE
    RAISE EXCEPTION 'invalid_kind';
  END IF;

  IF v_count >= p_limit THEN
    RETURN false;
  END IF;
  IF p_kind = 'invite' THEN
    INSERT INTO public.league_invite_attempts (developer_id) VALUES (p_dev_id);
  END IF;
  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.league_take_quota(bigint, text, int, interval) FROM PUBLIC, anon, authenticated;

-- ─── league_create_custom ──────────────────────────────────
-- Errors (exception message): limit, create_limit; a taken slug raises the
-- unique violation (23505). Returns the new league id. Locks in the same
-- order as league_take_quota callers (membership, then create).
CREATE OR REPLACE FUNCTION public.league_create_custom(
  p_dev_id          bigint,
  p_slug            text,
  p_name            text,
  p_max_per_day     int,
  p_max_memberships int
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_count int;
  v_id    uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('league_quota:membership:' || p_dev_id, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('league_quota:create:' || p_dev_id, 0));

  SELECT count(*) INTO v_count FROM public.league_members m
  JOIN public.leagues l ON l.id = m.league_id
  WHERE m.developer_id = p_dev_id AND m.status = 'active' AND l.kind = 'custom';
  IF v_count >= p_max_memberships THEN
    RAISE EXCEPTION 'limit';
  END IF;

  SELECT count(*) INTO v_count FROM public.leagues l
  WHERE l.created_by = p_dev_id AND l.created_at > now() - interval '1 day';
  IF v_count >= p_max_per_day THEN
    RAISE EXCEPTION 'create_limit';
  END IF;

  INSERT INTO public.leagues (slug, name, kind, admin_id, created_by)
  VALUES (p_slug, p_name, 'custom', p_dev_id, p_dev_id)
  RETURNING id INTO v_id;

  INSERT INTO public.league_members (league_id, developer_id, status, joined_at)
  VALUES (v_id, p_dev_id, 'active', now());

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.league_create_custom(bigint, text, text, int, int) FROM PUBLIC, anon, authenticated;

-- ─── Invite attempt retention: 30 days ─────────────────────
SELECT cron.schedule(
  'prune-league-invite-attempts',
  '41 4 * * *',
  $$DELETE FROM public.league_invite_attempts WHERE at < now() - interval '30 days'$$
);

COMMIT;
