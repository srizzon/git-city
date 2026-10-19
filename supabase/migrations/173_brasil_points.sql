-- The Brasil town's points and its presidential election.
--
-- brasil_points is the ledger of everything that scores off Instagram and the
-- site: joining the map, a comment a day, a tagged friend who joined, a story
-- tagging the account, a vote. Each row says which week it counts for, and
-- (kind, ref) is unique, so a webhook delivered twice never scores twice.
-- Coding scores too, but it is read from the week's standings, not stored.
--
-- brasil_invites keeps who tagged an Instagram account first (the first tag
-- wins), and who that account became when it joined the map.
--
-- brasil_candidates and brasil_votes are a term's presidential race: anyone
-- on the map can run (or an admin adds them) and gets a two-digit number for
-- the term, typed in like on Brazil's voting machine; one vote per developer
-- a term.

BEGIN;

CREATE TABLE IF NOT EXISTS public.brasil_points (
  id           bigserial   PRIMARY KEY,
  developer_id bigint      NOT NULL REFERENCES public.developers(id) ON DELETE CASCADE,
  kind         text        NOT NULL CHECK (kind IN ('join', 'comment', 'invite', 'story', 'vote')),
  points       smallint    NOT NULL,
  ref          text        NOT NULL,
  week_start   date        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, ref)
);
CREATE INDEX IF NOT EXISTS brasil_points_week ON public.brasil_points (week_start, developer_id);

CREATE TABLE IF NOT EXISTS public.brasil_invites (
  friend_ig  text        PRIMARY KEY,
  tagger_id  bigint      NOT NULL REFERENCES public.developers(id) ON DELETE CASCADE,
  comment_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  joined_id  bigint      REFERENCES public.developers(id) ON DELETE SET NULL,
  joined_at  timestamptz
);
CREATE INDEX IF NOT EXISTS brasil_invites_tagger ON public.brasil_invites (tagger_id);

CREATE TABLE IF NOT EXISTS public.brasil_candidates (
  term         smallint    NOT NULL,
  developer_id bigint      NOT NULL REFERENCES public.developers(id) ON DELETE CASCADE,
  number       smallint    NOT NULL CHECK (number BETWEEN 10 AND 99),
  added_by     text        NOT NULL CHECK (added_by IN ('self', 'admin')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  withdrawn_at timestamptz,
  PRIMARY KEY (term, developer_id),
  UNIQUE (term, number)
);

CREATE TABLE IF NOT EXISTS public.brasil_votes (
  term         smallint    NOT NULL,
  voter_id     bigint      NOT NULL REFERENCES public.developers(id) ON DELETE CASCADE,
  candidate_id bigint      NOT NULL REFERENCES public.developers(id) ON DELETE CASCADE,
  voted_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (term, voter_id)
);
CREATE INDEX IF NOT EXISTS brasil_votes_candidate ON public.brasil_votes (term, candidate_id);

-- RLS on, no public policies: reads and writes go through the service role.
ALTER TABLE public.brasil_points     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brasil_invites    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brasil_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brasil_votes      ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.brasil_points, public.brasil_invites, public.brasil_candidates, public.brasil_votes FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brasil_points, public.brasil_invites, public.brasil_candidates, public.brasil_votes TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.brasil_points_id_seq TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
