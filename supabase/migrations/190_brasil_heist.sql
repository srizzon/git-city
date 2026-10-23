-- City of the day on the Brasil map (cops and robbers). One city a day pays
-- double for its buildings; robbers bank them by pushing, cops bust robbers.
--   brasil_heist_days   the day's city (picked once, kept even if the map
--                       grows) and, settled after midnight, how much stood
--   brasil_heist_sides  each dev's side for a day; the first pick holds
--   brasil_points kinds 'heist' (a pushed building, 10), 'bust' (15, or 5
--                       for a game-run robber), 'heist_bonus' (the cops'
--                       +30 when the city stood)

BEGIN;

CREATE TABLE IF NOT EXISTS public.brasil_heist_days (
  day         date        PRIMARY KEY,
  city_key    text        NOT NULL,
  name        text        NOT NULL,
  uf          text,
  buildings   integer     NOT NULL CHECK (buildings > 0),
  standing    real        CHECK (standing >= 0 AND standing <= 1),
  settled_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.brasil_heist_sides (
  developer_id bigint      NOT NULL REFERENCES public.developers(id) ON DELETE CASCADE,
  day          date        NOT NULL,
  side         text        NOT NULL CHECK (side IN ('robber', 'cop')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (developer_id, day)
);
CREATE INDEX IF NOT EXISTS brasil_heist_sides_day ON public.brasil_heist_sides (day, side);

ALTER TABLE public.brasil_points DROP CONSTRAINT IF EXISTS brasil_points_kind_check;
ALTER TABLE public.brasil_points ADD CONSTRAINT brasil_points_kind_check CHECK (kind IN ('join', 'comment', 'invite', 'story', 'vote', 'paint', 'race', 'project', 'smash', 'heist', 'bust', 'heist_bonus'));

-- RLS on, no public policies: reads and writes go through the service role.
ALTER TABLE public.brasil_heist_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brasil_heist_sides ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.brasil_heist_days, public.brasil_heist_sides FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brasil_heist_days, public.brasil_heist_sides TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
