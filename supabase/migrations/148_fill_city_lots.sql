-- ─── City lots: fill free lots ─────────────────────────────
-- The Bay Area map adds ~100k lots around SF, and ~53k developers have no lot
-- yet. fill_city_lots hands free lots of completed seeds to developers without
-- one: claimed first, then by rank; closest to downtown first. Writes only
-- city_lots (never developers), in batches the snapshot cron can loop over.
-- Returns how many lots it filled.

BEGIN;

CREATE OR REPLACE FUNCTION public.fill_city_lots(p_limit int)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  PERFORM pg_advisory_xact_lock(146, 1);

  WITH free AS (
    SELECT l.id, row_number() OVER (ORDER BY l.ring, l.id) AS n
    FROM public.city_lots l
    JOIN public.city_lot_seeds s ON s.map = l.map
    WHERE l.developer_id IS NULL
    ORDER BY l.ring, l.id
    LIMIT greatest(0, least(p_limit, 10000))
  ), waiting AS (
    SELECT d.id, row_number() OVER (ORDER BY d.claimed DESC, d.rank NULLS LAST, d.id) AS n
    FROM public.developers d
    WHERE NOT EXISTS (SELECT 1 FROM public.city_lots o WHERE o.developer_id = d.id)
    ORDER BY d.claimed DESC, d.rank NULLS LAST, d.id
    LIMIT greatest(0, least(p_limit, 10000))
  )
  UPDATE public.city_lots l SET developer_id = w.id
  FROM free f JOIN waiting w ON w.n = f.n
  WHERE l.id = f.id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fill_city_lots(int) FROM PUBLIC, anon, authenticated;

COMMIT;
