-- ─── City lots: the lot holds its occupant ─────────────────
-- 146 stored a developer's lot on developers.lot_id. On prod that row is
-- ~15 KB with 21 indexes and ~70 foreign keys pointing at it, and lot_id
-- being indexed rules out HOT updates, so seeding 4,000 lots took past the
-- 8 s API statement timeout. The occupant now lives on the small city_lots
-- row instead, and writes never touch developers.
--
-- 1. city_lots.developer_id (unique): who stands on the lot.
-- 2. developers.lot_id is dropped. It holds no data on prod: the one partial
--    seed was rolled back before this migration.
-- 3. city_lot_seeds: a map's lots count only once its seed completed, so a
--    seed that dies halfway is never published or handed out.
-- 4. assign_city_lot / seed_city_lots rewritten on city_lots; finish_city_lots_seed
--    marks a seed complete; reset_city_lots_seed clears an unfinished one.

BEGIN;

-- ─── 1-2. occupant on the lot ──────────────────────────────
ALTER TABLE public.city_lots
  ADD COLUMN IF NOT EXISTS developer_id bigint REFERENCES public.developers(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_city_lots_developer ON public.city_lots (developer_id) WHERE developer_id IS NOT NULL;

DROP INDEX IF EXISTS public.idx_developers_lot_id;
ALTER TABLE public.developers DROP COLUMN IF EXISTS lot_id;

-- ─── 3. seed markers ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.city_lot_seeds (
  map          text PRIMARY KEY,
  lots         int NOT NULL CHECK (lots >= 0),
  completed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.city_lot_seeds ENABLE ROW LEVEL SECURITY;

-- ─── 4. functions ──────────────────────────────────────────
DROP FUNCTION IF EXISTS public.assign_city_lot(bigint);
CREATE FUNCTION public.assign_city_lot(p_dev_id bigint)
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

  IF NOT EXISTS (SELECT 1 FROM public.developers d WHERE d.id = p_dev_id) THEN
    RETURN;
  END IF;

  SELECT l.id INTO v_lot FROM public.city_lots l WHERE l.developer_id = p_dev_id;

  IF v_lot IS NULL THEN
    SELECT l.id INTO v_lot
    FROM public.city_lots l
    JOIN public.city_lot_seeds s ON s.map = l.map
    WHERE l.developer_id IS NULL
    ORDER BY l.ring, l.id
    LIMIT 1;

    IF v_lot IS NULL THEN
      -- City full: the outermost unclaimed building makes room.
      SELECT l.id, l.developer_id INTO v_lot, v_evicted
      FROM public.city_lots l
      JOIN public.city_lot_seeds s ON s.map = l.map
      JOIN public.developers o ON o.id = l.developer_id
      WHERE NOT o.claimed
      ORDER BY l.ring DESC, l.id DESC
      LIMIT 1;

      IF v_lot IS NULL THEN
        RETURN; -- every lot is held by a claimed developer (or no seed yet)
      END IF;
    END IF;

    UPDATE public.city_lots SET developer_id = p_dev_id WHERE id = v_lot;
  END IF;

  RETURN QUERY
  SELECT l.id, l.x, l.z, l.max_w, l.max_d, l.downtown, v_evicted
  FROM public.city_lots l WHERE l.id = v_lot;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.assign_city_lot(bigint) FROM PUBLIC, anon, authenticated;

-- p_lots: [{x, z, w, d, ring, downtown, dev_id|null}]. Returns lots inserted.
-- Refuses once the map's seed is complete.
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
  IF EXISTS (SELECT 1 FROM public.city_lot_seeds WHERE map = p_map) THEN
    RAISE EXCEPTION 'city lots for % are already seeded', p_map;
  END IF;

  INSERT INTO public.city_lots (map, x, z, max_w, max_d, ring, downtown, developer_id)
  SELECT p_map, t.x, t.z, t.w, t.d, t.ring, coalesce(t.downtown, false), t.dev_id
  FROM jsonb_to_recordset(p_lots)
    AS t(x int, z int, w int, d int, ring real, downtown boolean, dev_id bigint)
  -- A developer deleted since the layout was read stays a free lot.
  WHERE t.dev_id IS NULL OR EXISTS (SELECT 1 FROM public.developers d WHERE d.id = t.dev_id)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.seed_city_lots(text, jsonb) FROM PUBLIC, anon, authenticated;

-- Marks a map's seed complete (only now do its lots count). Returns lots.
CREATE OR REPLACE FUNCTION public.finish_city_lots_seed(p_map text)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  PERFORM pg_advisory_xact_lock(146, 1);
  SELECT count(*) INTO v_count FROM public.city_lots WHERE map = p_map;
  INSERT INTO public.city_lot_seeds (map, lots) VALUES (p_map, v_count)
  ON CONFLICT (map) DO NOTHING;
  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.finish_city_lots_seed(text) FROM PUBLIC, anon, authenticated;

-- Clears a map's unfinished seed (a run that died halfway) so it can restart.
-- Does nothing once the seed is complete.
CREATE OR REPLACE FUNCTION public.reset_city_lots_seed(p_map text)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  PERFORM pg_advisory_xact_lock(146, 1);
  IF EXISTS (SELECT 1 FROM public.city_lot_seeds WHERE map = p_map) THEN
    RETURN 0;
  END IF;
  DELETE FROM public.city_lots WHERE map = p_map;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.reset_city_lots_seed(text) FROM PUBLIC, anon, authenticated;

COMMIT;
