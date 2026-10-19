-- A Brasil state's founder is the first dev who ever arrived in it, forever
-- (src/lib/towns/brasil-server.ts). Until now it was read off the map as the
-- first dev in the state's capital, so a founder who moved to their own city
-- handed the state to whoever came next. A city keeps its own founder, read
-- off the map as before.

BEGIN;

CREATE TABLE IF NOT EXISTS public.brasil_state_founders (
  league_id    uuid        NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  uf           text        NOT NULL CHECK (uf ~ '^[A-Z]{2}$'),
  developer_id bigint      NOT NULL REFERENCES public.developers(id) ON DELETE CASCADE,
  founded_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (league_id, uf)
);

-- The founders the map shows today: each state's first dev in its capital.
-- A founder who already moved away is put back by hand (the map no longer knows them).
INSERT INTO public.brasil_state_founders (league_id, uf, developer_id, founded_at)
SELECT DISTINCT ON (r.league_id, r.uf) r.league_id, r.uf, r.developer_id, r.placed_at
FROM public.brasil_residents r
WHERE r.uf IS NOT NULL AND r.lx IS NOT NULL
  AND r.ibge IN (
    1200401, 2704302, 1600303, 1302603, 2927408, 2304400, 5300108, 3205309, 5208707, 2111300, 5103403, 5002704, 3106200, 1501402,
    2507507, 4106902, 2611606, 2211001, 3304557, 2408102, 4314902, 1100205, 1400100, 4205407, 3550308, 2800308, 1721000
  )
ORDER BY r.league_id, r.uf, r.placed_at
ON CONFLICT DO NOTHING;

ALTER TABLE public.brasil_state_founders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.brasil_state_founders FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brasil_state_founders TO service_role;

COMMIT;
