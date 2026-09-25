-- ─── City lots: every building gets a fixed address ────────
-- Until now a building's position was recomputed on every load: a greedy
-- walk over developers sorted by a score, stopping when the SF map ran out of
-- room. A newcomer sorted last and was silently dropped, and any change to the
-- input shifted everyone behind it.
--
-- 1. city_lots: the map's lots, each with a fixed position and a footprint
--    cap. Seeded once by the snapshot cron from the current layout, so the
--    city looks the same the day this ships.
-- 2. developers.lot_id: a developer's lot. Unique, so a lot holds one
--    building. Not granted to anon/authenticated (133: new columns are
--    service-role only unless granted).
-- 3. assign_city_lot(dev): gives a developer a lot if they have none: the
--    free lot closest to downtown, else the outermost lot held by an
--    unclaimed developer (who loses it). Claimed developers never lose one.
--    Serialized by an advisory lock, so two logins can't take the same lot.
-- 4. seed_city_lots(lots): appends lots and their first occupants. Idempotent
--    on (map, x, z) and on already-assigned developers.

BEGIN;

-- ─── 1. city_lots ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.city_lots (
  id        int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  map       text NOT NULL DEFAULT 'sf' CHECK (map ~ '^[a-z0-9_]{1,20}$'),
  x         int NOT NULL,
  z         int NOT NULL,
  -- Footprint cap: a building is never wider or deeper than its lot allows,
  -- which is what keeps neighbours from overlapping.
  max_w     smallint NOT NULL CHECK (max_w BETWEEN 4 AND 120),
  max_d     smallint NOT NULL CHECK (max_d BETWEEN 4 AND 120),
  -- Distance to downtown; free lots are handed out closest first.
  ring      real NOT NULL CHECK (ring >= 0),
  downtown  boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (map, x, z)
);
CREATE INDEX IF NOT EXISTS idx_city_lots_ring ON public.city_lots (ring);
ALTER TABLE public.city_lots ENABLE ROW LEVEL SECURITY;

-- ─── 2. developers.lot_id ──────────────────────────────────
ALTER TABLE public.developers
  ADD COLUMN IF NOT EXISTS lot_id int REFERENCES public.city_lots(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_developers_lot_id ON public.developers (lot_id) WHERE lot_id IS NOT NULL;

-- ─── 3. assign_city_lot ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assign_city_lot(p_dev_id bigint)
RETURNS TABLE (lot_id int, x int, z int, max_w smallint, max_d smallint, downtown boolean, evicted_id bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_lot int;
  v_evicted bigint;
BEGIN
  -- One assignment at a time: logins are rare, and this makes "free" mean free.
  -- Two-key form: its key space never overlaps the per-developer bigint locks.
  PERFORM pg_advisory_xact_lock(146, 1);

  SELECT d.lot_id INTO v_lot FROM public.developers d WHERE d.id = p_dev_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_lot IS NULL THEN
    SELECT l.id INTO v_lot
    FROM public.city_lots l
    WHERE NOT EXISTS (SELECT 1 FROM public.developers o WHERE o.lot_id = l.id)
    ORDER BY l.ring, l.id
    LIMIT 1;

    IF v_lot IS NULL THEN
      -- City full: the outermost unclaimed building makes room.
      SELECT o.id, o.lot_id INTO v_evicted, v_lot
      FROM public.developers o
      JOIN public.city_lots l ON l.id = o.lot_id
      WHERE NOT o.claimed AND o.id <> p_dev_id
      ORDER BY l.ring DESC, l.id DESC
      LIMIT 1;

      IF v_lot IS NULL THEN
        RETURN; -- every lot is held by a claimed developer
      END IF;
      UPDATE public.developers SET lot_id = NULL WHERE id = v_evicted;
    END IF;

    UPDATE public.developers SET lot_id = v_lot WHERE id = p_dev_id;
  END IF;

  RETURN QUERY
  SELECT l.id, l.x, l.z, l.max_w, l.max_d, l.downtown, v_evicted
  FROM public.city_lots l WHERE l.id = v_lot;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.assign_city_lot(bigint) FROM PUBLIC, anon, authenticated;

-- ─── 4. seed_city_lots ─────────────────────────────────────
-- p_lots: [{x, z, w, d, ring, downtown, dev_id|null}]. Returns lots inserted.
CREATE OR REPLACE FUNCTION public.seed_city_lots(p_map text, p_lots jsonb)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  PERFORM pg_advisory_xact_lock(146, 1);

  WITH src AS (
    SELECT * FROM jsonb_to_recordset(p_lots)
      AS t(x int, z int, w int, d int, ring real, downtown boolean, dev_id bigint)
  ), ins AS (
    INSERT INTO public.city_lots (map, x, z, max_w, max_d, ring, downtown)
    SELECT p_map, s.x, s.z, s.w, s.d, s.ring, coalesce(s.downtown, false) FROM src s
    ON CONFLICT (map, x, z) DO NOTHING
    RETURNING id, x, z
  ), occ AS (
    UPDATE public.developers dv SET lot_id = ins.id
    FROM ins JOIN src s ON s.x = ins.x AND s.z = ins.z
    WHERE dv.id = s.dev_id AND dv.lot_id IS NULL
    RETURNING dv.id
  )
  SELECT count(*) INTO v_count FROM ins;
  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.seed_city_lots(text, jsonb) FROM PUBLIC, anon, authenticated;

COMMIT;
