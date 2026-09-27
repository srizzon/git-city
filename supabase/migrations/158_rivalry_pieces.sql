-- Claude Code vs Codex town pieces (src/lib/league-city/catalog.ts): the two
-- mascots and one landmark per side. All system placed.
INSERT INTO public.league_item_types (item_type, footprint, radius, max_per_city, limit_group, system_only, on_road) VALUES
  ('clawd',          'prop', 10, NULL, NULL, true, false),
  ('codex_cloud',    'prop', 10, NULL, NULL, true, false),
  ('context_window', 'prop', 40, 1,    NULL, true, false),
  ('sandbox',        'prop', 44, 1,    NULL, true, false)
ON CONFLICT (item_type) DO NOTHING;

-- The rivalry maps put a street every 4 lots and a tree in each block, so
-- roads and plazas already cover ~45% of the city. At the usual 70% the city
-- would grow long before its blocks fill, and new edge rings have no streets.
-- These two towns grow only when nearly full (95%). In place, like 157.
DO $$
DECLARE
  v_def text;
  c_old constant text := 'c_grow_at constant numeric := 0.7;';
  c_new constant text := 'c_grow_at numeric := 0.7;';
  c_hook constant text := E'    c_max_objects := 8000;\n';
BEGIN
  v_def := pg_get_functiondef('public.apply_league_city_ops(uuid, bigint, jsonb)'::regprocedure);
  IF position('c_grow_at := 0.95;' IN v_def) > 0 THEN
    RETURN;
  END IF;
  IF (length(v_def) - length(replace(v_def, c_old, ''))) / length(c_old) <> 1
     OR (length(v_def) - length(replace(v_def, c_hook, ''))) / length(c_hook) <> 1 THEN
    RAISE EXCEPTION 'apply_league_city_ops: grow anchors not found exactly once (157 first)';
  END IF;
  v_def := replace(v_def, c_old, c_new);
  v_def := replace(v_def, c_hook, c_hook || E'    c_grow_at := 0.95;\n');
  EXECUTE v_def;
END
$$;

-- auto_place was slow on big cities: about 2 s per building on a 37×36 map
-- with ~400 trees and lamps. For every lot it called league_rect_dist2 on
-- every prop (an SQL function with SET search_path, so never inlined), and
-- checked road adjacency with abs() against every road. Same results, faster:
-- a cheap bounding-box test before the exact distance (inlined), and the four
-- neighbours compared directly. In place, like 157; every town benefits.
DO $$
DECLARE
  v_def text;
  c_dist constant text := 'WHERE public\.league_rect_dist2\(p\.px, p\.pz, l\.gx \* c_lot - c_lot / 2, l\.gz \* c_lot - c_lot / 2,\s+l\.gx \* c_lot \+ c_lot / 2, l\.gz \* c_lot \+ c_lot / 2\) < p\.r \* p\.r';
  c_dist_new constant text := 'WHERE abs(l.gx * c_lot - p.px) < c_lot / 2 + p.r AND abs(l.gz * c_lot - p.pz) < c_lot / 2 + p.r'
    || ' AND (greatest(l.gx * c_lot - c_lot / 2 - p.px, 0, p.px - (l.gx * c_lot + c_lot / 2)) ^ 2'
    || ' + greatest(l.gz * c_lot - c_lot / 2 - p.pz, 0, p.pz - (l.gz * c_lot + c_lot / 2)) ^ 2) < p.r * p.r';
  c_road constant text := 'EXISTS (SELECT 1 FROM occ WHERE occ.item_type = ''road'' AND abs(occ.x - l.gx) + abs(occ.z - l.gz) = 1) DESC';
  c_road_new constant text := 'EXISTS (SELECT 1 FROM occ WHERE occ.item_type = ''road'' AND ((occ.x = l.gx AND (occ.z = l.gz - 1 OR occ.z = l.gz + 1)) OR (occ.z = l.gz AND (occ.x = l.gx - 1 OR occ.x = l.gx + 1)))) DESC';
BEGIN
  v_def := pg_get_functiondef('public.apply_league_city_ops(uuid, bigint, jsonb)'::regprocedure);
  IF position('abs(l.gx * c_lot - p.px) < c_lot / 2 + p.r' IN v_def) > 0 THEN
    RETURN;
  END IF;
  IF regexp_count(v_def, c_dist) <> 1 OR (length(v_def) - length(replace(v_def, c_road, ''))) / length(c_road) <> 1 THEN
    RAISE EXCEPTION 'apply_league_city_ops: auto_place anchors not found exactly once';
  END IF;
  v_def := regexp_replace(v_def, c_dist, c_dist_new);
  v_def := replace(v_def, c_road, c_road_new);
  EXECUTE v_def;
END
$$;
