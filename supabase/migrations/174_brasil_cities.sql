-- The Brasil map gets every city in Brazil (src/lib/towns/brasil-map.ts).
--
-- A dev now lives in a city (its IBGE code; null: the island), on a lot
-- inside it (lx, lz) that never changes. The city itself stands somewhere on
-- the map (brasil_cities: its middle, in lots) and moves when the map makes
-- room; the map grows by a scale that only goes up (brasil_map). Every
-- placement writes all of it at once through brasil_place, which refuses a
-- map that changed since it was read (version), so two arrivals at once
-- can't place on a stale map.
--
-- x, z stay as they were (the lots before this), no longer written, so
-- their uniqueness goes: a lot is unique inside its city now. uf stays: the
-- states' rankings read it.

BEGIN;

CREATE TABLE IF NOT EXISTS public.brasil_cities (
  league_id  uuid        NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  ibge       integer     NOT NULL,
  cx         integer     NOT NULL,
  cz         integer     NOT NULL,
  founded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (league_id, ibge)
);

CREATE TABLE IF NOT EXISTS public.brasil_map (
  league_id uuid        PRIMARY KEY REFERENCES public.leagues(id) ON DELETE CASCADE,
  scale     numeric     NOT NULL DEFAULT 1 CHECK (scale >= 1),
  version   bigint      NOT NULL DEFAULT 0,
  grew_at   timestamptz
);

ALTER TABLE public.brasil_residents ADD COLUMN IF NOT EXISTS ibge integer;
ALTER TABLE public.brasil_residents ADD COLUMN IF NOT EXISTS lx integer;
ALTER TABLE public.brasil_residents ADD COLUMN IF NOT EXISTS lz integer;
-- Whether they named their city (not just a state): those who didn't are asked once, and that first pick is free.
ALTER TABLE public.brasil_residents ADD COLUMN IF NOT EXISTS city_picked boolean NOT NULL DEFAULT false;
ALTER TABLE public.brasil_residents ALTER COLUMN x DROP NOT NULL;
ALTER TABLE public.brasil_residents ALTER COLUMN z DROP NOT NULL;
ALTER TABLE public.brasil_residents DROP CONSTRAINT IF EXISTS brasil_residents_league_id_x_z_key;
-- Noronha's own devs live on the island with those who never said a city: one grid.
CREATE UNIQUE INDEX IF NOT EXISTS brasil_residents_city_lot
  ON public.brasil_residents (league_id, (CASE WHEN ibge IS NULL OR ibge = 2605459 THEN 0 ELSE ibge END), lx, lz)
  WHERE lx IS NOT NULL;

ALTER TABLE public.brasil_comments ADD COLUMN IF NOT EXISTS ibge integer;
ALTER TABLE public.brasil_comments DROP CONSTRAINT IF EXISTS brasil_comments_outcome_check;
ALTER TABLE public.brasil_comments ADD CONSTRAINT brasil_comments_outcome_check
  CHECK (outcome IN ('added', 'already', 'moved', 'unknown_user', 'no_login', 'blocked', 'capped', 'which_city'));

ALTER TABLE public.brasil_cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brasil_map    ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.brasil_cities, public.brasil_map FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brasil_cities, public.brasil_map TO service_role;

-- One placement: the resident, every city that moved or was founded, the
-- scale. Refuses (SQLSTATE 40001) when the map's version isn't p_version.
CREATE OR REPLACE FUNCTION public.brasil_place(
  p_league   uuid,
  p_version  bigint,
  p_scale    numeric,
  p_cities   jsonb,
  p_resident jsonb
) RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v bigint;
BEGIN
  INSERT INTO public.brasil_map (league_id) VALUES (p_league) ON CONFLICT (league_id) DO NOTHING;
  UPDATE public.brasil_map
     SET version = version + 1,
         grew_at = CASE WHEN p_scale > scale THEN now() ELSE grew_at END,
         scale = p_scale
   WHERE league_id = p_league AND version = p_version
  RETURNING version INTO v;
  IF v IS NULL THEN
    RAISE EXCEPTION 'brasil map changed' USING ERRCODE = '40001';
  END IF;

  INSERT INTO public.brasil_cities (league_id, ibge, cx, cz)
  SELECT p_league, (c->>'ibge')::int, (c->>'cx')::int, (c->>'cz')::int
    FROM jsonb_array_elements(p_cities) c
  ON CONFLICT (league_id, ibge) DO UPDATE SET cx = excluded.cx, cz = excluded.cz;

  IF p_resident IS NOT NULL THEN
    INSERT INTO public.brasil_residents (league_id, developer_id, uf, hub, ibge, lx, lz, city_picked, source, placed_at)
    VALUES (
      p_league,
      (p_resident->>'developer_id')::bigint,
      p_resident->>'uf',
      (p_resident->>'hub')::smallint,
      (p_resident->>'ibge')::int,
      (p_resident->>'lx')::int,
      (p_resident->>'lz')::int,
      coalesce((p_resident->>'city_picked')::boolean, false),
      p_resident->>'source',
      now()
    )
    ON CONFLICT (league_id, developer_id) DO UPDATE
      SET uf = excluded.uf, hub = excluded.hub, ibge = excluded.ibge, lx = excluded.lx, lz = excluded.lz, city_picked = excluded.city_picked,
          x = NULL, z = NULL, source = excluded.source, placed_at = excluded.placed_at;
  END IF;
  RETURN v;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.brasil_place(uuid, bigint, numeric, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.brasil_place(uuid, bigint, numeric, jsonb, jsonb) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
