-- 153: a town's buildings fill in from the middle of the city instead of
-- piling up at the gate. auto_place used to take the free road-touching lot
-- nearest the entrance (0, 0); now it takes the one nearest the grid's
-- center, (0, -h + 0.5), doubled so it stays an integer. Ties go north to
-- south, then west to east, like freeLotsInOrder in placement.ts.
--
-- Prod's apply_league_city_ops was hand-patched before (134/135, 141, 145),
-- so this edits the live definition in place instead of restating it: the
-- ORDER BY anchor must appear exactly once, and a second run is a no-op.

DO $$
DECLARE
  v_def text;
  c_old constant text := 'l.gx * l.gx + l.gz * l.gz, abs(l.gz), l.gz, l.gx';
  c_new constant text := '4 * l.gx * l.gx + (2 * l.gz + 2 * v_h - 1) * (2 * l.gz + 2 * v_h - 1), l.gz, l.gx';
BEGIN
  v_def := pg_get_functiondef('public.apply_league_city_ops(uuid, bigint, jsonb)'::regprocedure);
  IF position(c_new IN v_def) > 0 THEN
    RETURN;
  END IF;
  IF (length(v_def) - length(replace(v_def, c_old, ''))) / length(c_old) <> 1 THEN
    RAISE EXCEPTION 'apply_league_city_ops: placement anchor not found exactly once';
  END IF;
  EXECUTE replace(v_def, c_old, c_new);
END
$$;
