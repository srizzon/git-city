-- Brasil projects (brasil-projects.ts): devs on the map post what they built,
-- anyone signed in upvotes, the week's top 3 sit in the map's top-right card
-- and win points, one ad slot sits above them. Every link is screened before
-- it goes live (brasil-projects-check.ts). RLS on, no public policies: reads
-- and writes go through the service role, like brasil_votes.

CREATE TABLE IF NOT EXISTS public.brasil_projects (
  id            bigserial   PRIMARY KEY,
  league_id     uuid        NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  developer_id  bigint      NOT NULL REFERENCES public.developers(id) ON DELETE CASCADE,
  slug          text        NOT NULL UNIQUE,
  name          text        NOT NULL,
  tagline       text        NOT NULL,
  description   text        NOT NULL DEFAULT '',
  url           text        NOT NULL,
  url_host      text        NOT NULL,
  repo          text,
  category      text        NOT NULL CHECK (category IN ('ai', 'devtool', 'webapp', 'mobile', 'game', 'library', 'other')),
  icon_url      text,
  cover_url     text,
  uf            text,
  ibge          integer,
  status        text        NOT NULL DEFAULT 'checking' CHECK (status IN ('checking', 'live', 'review', 'rejected', 'hidden', 'removed')),
  -- Why it isn't live, in a line the maker reads (rejected) or the admin reads (review, hidden).
  status_reason text,
  appealed      boolean     NOT NULL DEFAULT false,
  -- The points week (its Monday, UTC) it competes in: the week it first went live.
  launch_week   date,
  votes_counted integer     NOT NULL DEFAULT 0,
  votes_total   integer     NOT NULL DEFAULT 0,
  visits        integer     NOT NULL DEFAULT 0,
  checked_at    timestamptz,
  live_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
-- The same link can't be posted twice while it's up.
CREATE UNIQUE INDEX IF NOT EXISTS brasil_projects_url ON public.brasil_projects (league_id, url) WHERE status <> 'removed';
CREATE INDEX IF NOT EXISTS brasil_projects_week ON public.brasil_projects (league_id, launch_week, votes_counted DESC) WHERE status = 'live';
CREATE INDEX IF NOT EXISTS brasil_projects_dev ON public.brasil_projects (developer_id);
CREATE INDEX IF NOT EXISTS brasil_projects_status ON public.brasil_projects (status, created_at);

-- Every screening of a project: rules, reputation, the page fetch, the model, an admin's call.
CREATE TABLE IF NOT EXISTS public.brasil_project_checks (
  id          bigserial   PRIMARY KEY,
  project_id  bigint      NOT NULL REFERENCES public.brasil_projects(id) ON DELETE CASCADE,
  kind        text        NOT NULL CHECK (kind IN ('rules', 'reputation', 'fetch', 'model', 'admin', 'report')),
  verdict     text        NOT NULL CHECK (verdict IN ('approve', 'review', 'reject')),
  category    text,
  reason      text,
  model       text,
  cost_usd    numeric(10, 6),
  raw         jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS brasil_project_checks_project ON public.brasil_project_checks (project_id, created_at DESC);

-- One upvote per project per dev; counted = from an account old and active enough to move the rank.
CREATE TABLE IF NOT EXISTS public.brasil_project_votes (
  project_id  bigint      NOT NULL REFERENCES public.brasil_projects(id) ON DELETE CASCADE,
  voter_id    bigint      NOT NULL REFERENCES public.developers(id) ON DELETE CASCADE,
  counted     boolean     NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, voter_id)
);
CREATE INDEX IF NOT EXISTS brasil_project_votes_voter ON public.brasil_project_votes (voter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS brasil_project_votes_recent ON public.brasil_project_votes (project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.brasil_project_reports (
  project_id   bigint      NOT NULL REFERENCES public.brasil_projects(id) ON DELETE CASCADE,
  reporter_id  bigint      NOT NULL REFERENCES public.developers(id) ON DELETE CASCADE,
  reason       text        NOT NULL CHECK (reason IN ('scam', 'gambling', 'broken', 'not_theirs', 'other')),
  note         text,
  counted      boolean     NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  resolved_at  timestamptz,
  PRIMARY KEY (project_id, reporter_id)
);

-- A closed week's top 3, written once by the Monday close.
CREATE TABLE IF NOT EXISTS public.brasil_project_weeks (
  league_id   uuid        NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  week        date        NOT NULL,
  rank        smallint    NOT NULL CHECK (rank BETWEEN 1 AND 3),
  project_id  bigint      NOT NULL REFERENCES public.brasil_projects(id) ON DELETE CASCADE,
  votes       integer     NOT NULL,
  points      smallint    NOT NULL,
  PRIMARY KEY (league_id, week, rank)
);

-- Ads booked by hand (the request form only emails): one shows at a time, marked AD.
CREATE TABLE IF NOT EXISTS public.brasil_ad_slots (
  id             bigserial   PRIMARY KEY,
  league_id      uuid        NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  name           text        NOT NULL,
  tagline        text        NOT NULL,
  url            text        NOT NULL,
  icon_url       text,
  starts_at      timestamptz NOT NULL,
  ends_at        timestamptz NOT NULL,
  status         text        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'live', 'ended')),
  contact_email  text,
  price_note     text,
  notes          text,
  clicks         integer     NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS brasil_ad_slots_when ON public.brasil_ad_slots (league_id, starts_at);

-- Devs who can't post anymore (their building stays).
CREATE TABLE IF NOT EXISTS public.brasil_project_bans (
  developer_id  bigint      PRIMARY KEY REFERENCES public.developers(id) ON DELETE CASCADE,
  reason        text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.brasil_projects         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brasil_project_checks   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brasil_project_votes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brasil_project_reports  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brasil_project_weeks    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brasil_ad_slots         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brasil_project_bans     ENABLE ROW LEVEL SECURITY;

-- The week's top 3 win points (POINTS_FOR_RANK in brasil-projects.ts).
ALTER TABLE public.brasil_points DROP CONSTRAINT IF EXISTS brasil_points_kind_check;
ALTER TABLE public.brasil_points ADD CONSTRAINT brasil_points_kind_check CHECK (kind IN ('join', 'comment', 'invite', 'story', 'vote', 'paint', 'race', 'project'));

-- An upvote on (p_on) or off, and the project's counters kept in step, in one go.
-- Returns the project's counters after it.
CREATE OR REPLACE FUNCTION public.brasil_project_vote(p_project bigint, p_voter bigint, p_counted boolean, p_on boolean)
RETURNS TABLE (votes_counted integer, votes_total integer, voted boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  was_counted boolean;
BEGIN
  IF p_on THEN
    INSERT INTO brasil_project_votes (project_id, voter_id, counted) VALUES (p_project, p_voter, p_counted)
    ON CONFLICT (project_id, voter_id) DO NOTHING;
    IF FOUND THEN
      UPDATE brasil_projects SET votes_total = brasil_projects.votes_total + 1,
        votes_counted = brasil_projects.votes_counted + CASE WHEN p_counted THEN 1 ELSE 0 END
      WHERE id = p_project;
    END IF;
  ELSE
    DELETE FROM brasil_project_votes WHERE project_id = p_project AND voter_id = p_voter RETURNING counted INTO was_counted;
    IF FOUND THEN
      UPDATE brasil_projects SET votes_total = greatest(brasil_projects.votes_total - 1, 0),
        votes_counted = greatest(brasil_projects.votes_counted - CASE WHEN was_counted THEN 1 ELSE 0 END, 0)
      WHERE id = p_project;
    END IF;
  END IF;
  RETURN QUERY SELECT p.votes_counted, p.votes_total, EXISTS (SELECT 1 FROM brasil_project_votes v WHERE v.project_id = p_project AND v.voter_id = p_voter)
  FROM brasil_projects p WHERE p.id = p_project;
END;
$$;

-- A click through /go: one more visit on the project, or on the ad.
CREATE OR REPLACE FUNCTION public.brasil_project_visit(p_project bigint)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE brasil_projects SET visits = visits + 1 WHERE id = p_project;
$$;
CREATE OR REPLACE FUNCTION public.brasil_ad_click(p_slot bigint)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE brasil_ad_slots SET clicks = clicks + 1 WHERE id = p_slot;
$$;

REVOKE ALL ON FUNCTION public.brasil_project_vote(bigint, bigint, boolean, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.brasil_project_visit(bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.brasil_ad_click(bigint) FROM PUBLIC, anon, authenticated;
