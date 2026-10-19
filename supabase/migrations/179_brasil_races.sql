-- The Brasil town's races: city to city on the map's roads, timed by the
-- drive room (party/drive.ts), saved by /api/towns/[slug]/brasil/race.
--
-- brasil_race_results keeps every timed finish by a signed-in racer: one row
-- per race and developer. A route's board is its best time per developer;
-- its record is the best of all (brasil_race_records). The route key changes
-- when a highway moves, so a rerouted road starts a fresh board.
--
-- brasil_route_ghosts keeps the record's drive (its path), raced against
-- by anyone who runs the route alone.
--
-- Races score Brasil points: brasil_points gains the kind 'race'.

BEGIN;

CREATE TABLE IF NOT EXISTS public.brasil_race_results (
  id           bigserial   PRIMARY KEY,
  race_id      text        NOT NULL,
  developer_id bigint      NOT NULL REFERENCES public.developers(id) ON DELETE CASCADE,
  route_key    text        NOT NULL,
  from_city    text        NOT NULL,
  to_city      text        NOT NULL,
  ms           integer     NOT NULL CHECK (ms > 0),
  place        smallint    NOT NULL CHECK (place > 0),
  racers       smallint    NOT NULL CHECK (racers > 0),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (race_id, developer_id)
);
CREATE INDEX IF NOT EXISTS brasil_race_results_route ON public.brasil_race_results (route_key, ms);
CREATE INDEX IF NOT EXISTS brasil_race_results_dev ON public.brasil_race_results (developer_id, created_at);

CREATE TABLE IF NOT EXISTS public.brasil_route_ghosts (
  route_key    text        PRIMARY KEY,
  developer_id bigint      NOT NULL REFERENCES public.developers(id) ON DELETE CASCADE,
  ms           integer     NOT NULL,
  ghost        jsonb       NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Each route's record: its fastest finish (the first to set it wins a tie).
CREATE OR REPLACE VIEW public.brasil_race_records AS
SELECT DISTINCT ON (route_key) route_key, from_city, to_city, developer_id, ms, created_at
FROM public.brasil_race_results
ORDER BY route_key, ms, created_at;

ALTER TABLE public.brasil_points DROP CONSTRAINT IF EXISTS brasil_points_kind_check;
ALTER TABLE public.brasil_points ADD CONSTRAINT brasil_points_kind_check CHECK (kind IN ('join', 'comment', 'invite', 'story', 'vote', 'paint', 'race'));

-- RLS on, no public policies: reads and writes go through the service role.
ALTER TABLE public.brasil_race_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brasil_route_ghosts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.brasil_race_results, public.brasil_route_ghosts, public.brasil_race_records FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brasil_race_results, public.brasil_route_ghosts TO service_role;
GRANT SELECT ON public.brasil_race_records TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.brasil_race_results_id_seq TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
