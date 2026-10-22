-- City of the day: busts each building made. When a robber's last heart goes
-- to a shot from a building (the tallest near a wanted robber shoot), the drive
-- room credits that building's owner; the midnight settle emails each owner
-- how many robbers their building stopped.

BEGIN;

CREATE TABLE IF NOT EXISTS public.brasil_heist_turrets (
  day          date        NOT NULL,
  developer_id bigint      NOT NULL REFERENCES public.developers(id) ON DELETE CASCADE,
  busts        integer     NOT NULL DEFAULT 0 CHECK (busts >= 0),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day, developer_id)
);

ALTER TABLE public.brasil_heist_turrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.brasil_heist_turrets FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brasil_heist_turrets TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
