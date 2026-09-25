-- ─── Town join modes and requests ──────────────────────────
-- Each custom town picks how newcomers get in (leagues.join_mode):
--   open     anyone signed in joins with a click
--   request  newcomers ask, the admin approves or declines (default)
--   invite   invites and the admin's link only (how every town worked before)
-- Company towns ignore it: they're joined by verifying GitHub org membership.
--
-- league_join_requests keeps one row per dev per town. A request (pending or
-- declined) blocks a new one for 14 days, so from the requester's side a
-- decline looks the same as a request nobody answered.
-- league_members.joined_via records how each member got in, for measurement:
-- invite | link | request | open | org (null for members from before 143).

BEGIN;

ALTER TABLE public.leagues ADD COLUMN IF NOT EXISTS join_mode text NOT NULL DEFAULT 'request';
ALTER TABLE public.leagues DROP CONSTRAINT IF EXISTS leagues_join_mode_check;
ALTER TABLE public.leagues ADD CONSTRAINT leagues_join_mode_check CHECK (join_mode IN ('open', 'request', 'invite'));

ALTER TABLE public.league_members ADD COLUMN IF NOT EXISTS joined_via text;
ALTER TABLE public.league_members DROP CONSTRAINT IF EXISTS league_members_joined_via_check;
ALTER TABLE public.league_members ADD CONSTRAINT league_members_joined_via_check
  CHECK (joined_via IS NULL OR joined_via IN ('invite', 'link', 'request', 'open', 'org'));

CREATE TABLE IF NOT EXISTS public.league_join_requests (
  league_id    uuid   NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  developer_id bigint NOT NULL REFERENCES public.developers(id) ON DELETE CASCADE,
  status       text   NOT NULL CHECK (status IN ('pending', 'approved', 'declined', 'cancelled')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  decided_at   timestamptz,
  decided_by   bigint REFERENCES public.developers(id) ON DELETE SET NULL,
  PRIMARY KEY (league_id, developer_id)
);
CREATE INDEX IF NOT EXISTS idx_league_join_requests_league ON public.league_join_requests(league_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_league_join_requests_dev ON public.league_join_requests(developer_id, status, created_at);

-- RLS on, no public policies: reads and writes go through the service role.
ALTER TABLE public.league_join_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.league_join_requests FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.league_join_requests TO service_role;

-- ─── league_request_join ───────────────────────────────────
-- Files a request, serialized per dev so the pending cap holds under races.
-- Returns: 'requested' | 'already' (a live request or a recent decline for
-- this town) | 'limit' (p_max_pending live requests elsewhere).
CREATE OR REPLACE FUNCTION public.league_request_join(
  p_league_id   uuid,
  p_dev_id      bigint,
  p_max_pending int,
  p_ttl         interval
) RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_count int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('league_request:' || p_dev_id, 0));

  PERFORM 1 FROM public.league_join_requests r
  WHERE r.league_id = p_league_id AND r.developer_id = p_dev_id
    AND r.status IN ('pending', 'declined') AND r.created_at > now() - p_ttl;
  IF FOUND THEN
    RETURN 'already';
  END IF;

  SELECT count(*) INTO v_count FROM public.league_join_requests r
  WHERE r.developer_id = p_dev_id AND r.status = 'pending' AND r.created_at > now() - p_ttl;
  IF v_count >= p_max_pending THEN
    RETURN 'limit';
  END IF;

  INSERT INTO public.league_join_requests (league_id, developer_id, status, created_at)
  VALUES (p_league_id, p_dev_id, 'pending', now())
  ON CONFLICT (league_id, developer_id) DO UPDATE
    SET status = 'pending', created_at = now(), decided_at = NULL, decided_by = NULL;
  RETURN 'requested';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.league_request_join(uuid, bigint, int, interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.league_request_join(uuid, bigint, int, interval) TO service_role;

COMMIT;
