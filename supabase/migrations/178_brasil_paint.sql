-- The Brasil town's State War: paper.io on the map (lib/towns/brasil-paint).
--
-- The board itself lives in the drive room (its Durable Object's storage);
-- the site keeps what it needs to show and score it, saved by the room:
--
-- brasil_paint_hours: each state's lots at each hour of the week (the last
-- save in that hour). A week's winner is the average over its hours, an
-- hour with no save counting as the one before (Ingress' checkpoints).
-- brasil_paint_players: each painter's week (lots taken, invaded, loops).
-- brasil_paint_invasions: loops over another state's land, for the emails.
-- brasil_points takes a new kind, 'paint' (one row per loop that scored).

BEGIN;

ALTER TABLE public.brasil_points DROP CONSTRAINT IF EXISTS brasil_points_kind_check;
ALTER TABLE public.brasil_points
  ADD CONSTRAINT brasil_points_kind_check CHECK (kind IN ('join', 'comment', 'invite', 'story', 'vote', 'paint'));

CREATE TABLE IF NOT EXISTS public.brasil_paint_hours (
  week_start date        NOT NULL,
  hour       timestamptz NOT NULL,
  land       integer     NOT NULL CHECK (land > 0),
  shares     jsonb       NOT NULL,
  PRIMARY KEY (week_start, hour)
);

CREATE TABLE IF NOT EXISTS public.brasil_paint_players (
  week_start   date        NOT NULL,
  developer_id bigint      NOT NULL REFERENCES public.developers(id) ON DELETE CASCADE,
  taken        integer     NOT NULL DEFAULT 0,
  invaded      integer     NOT NULL DEFAULT 0,
  loops        integer     NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (week_start, developer_id)
);

CREATE TABLE IF NOT EXISTS public.brasil_paint_invasions (
  id           bigserial   PRIMARY KEY,
  week_start   date        NOT NULL,
  developer_id bigint      NOT NULL REFERENCES public.developers(id) ON DELETE CASCADE,
  by_uf        text        NOT NULL,
  victim_uf    text        NOT NULL,
  lots         integer     NOT NULL,
  x            integer     NOT NULL,
  z            integer     NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS brasil_paint_invasions_at ON public.brasil_paint_invasions (created_at);

-- RLS on, no public policies: reads and writes go through the service role.
ALTER TABLE public.brasil_paint_hours     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brasil_paint_players   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brasil_paint_invasions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.brasil_paint_hours, public.brasil_paint_players, public.brasil_paint_invasions FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brasil_paint_hours, public.brasil_paint_players, public.brasil_paint_invasions TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.brasil_paint_invasions_id_seq TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
