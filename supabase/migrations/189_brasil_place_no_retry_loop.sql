-- brasil_place refused a stale map with SQLSTATE 40001, which PostgREST retries
-- forever inside the same request: each stale call looped, held a pool
-- connection, and took the whole REST API down on 2026-10-22. Refuse with a code
-- PostgREST doesn't retry; the app reads it and retries with a fresh version.

BEGIN;

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
    RAISE EXCEPTION 'brasil map changed' USING ERRCODE = 'GC409';
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

COMMIT;

NOTIFY pgrst, 'reload schema';
