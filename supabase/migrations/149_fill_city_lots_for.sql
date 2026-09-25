-- ─── City lots: fill free lots for given developers ────────
-- fill_city_lots (148) built its waiting list by scanning developers, which on
-- prod is ~1.3 GB of heap: even a batch of 10 passed the 8 s API timeout. The
-- snapshot cron already holds every developer in memory, so it orders the
-- waiting list itself (claimed first, then rank) and hands over the ids. This
-- only reads and writes city_lots.
--
-- fill_city_lots_for(ids): gives the free lots of completed seeds, closest to
-- downtown first, to those developers in array order, skipping any that
-- already hold a lot. Returns how many lots it filled.

BEGIN;

CREATE OR REPLACE FUNCTION public.fill_city_lots_for(p_dev_ids bigint[])
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  PERFORM pg_advisory_xact_lock(146, 1);

  WITH waiting AS (
    SELECT w.id, row_number() OVER (ORDER BY w.ord) AS n
    FROM unnest(p_dev_ids[1:10000]) WITH ORDINALITY AS w(id, ord)
    WHERE NOT EXISTS (SELECT 1 FROM public.city_lots o WHERE o.developer_id = w.id)
  ), free AS (
    SELECT l.id, row_number() OVER (ORDER BY l.ring, l.id) AS n
    FROM public.city_lots l
    JOIN public.city_lot_seeds s ON s.map = l.map
    WHERE l.developer_id IS NULL
    ORDER BY l.ring, l.id
    LIMIT (SELECT count(*) FROM waiting)
  )
  UPDATE public.city_lots l SET developer_id = w.id
  FROM free f JOIN waiting w ON w.n = f.n
  WHERE l.id = f.id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fill_city_lots_for(bigint[]) FROM PUBLIC, anon, authenticated;

COMMIT;
