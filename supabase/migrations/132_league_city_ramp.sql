-- ─── Ramp prop ─────────────────────────────────────────────
-- A free-standing wedge the car can jump in drive mode. Only the item type
-- lists change: the item_type check (126), the prop shape check (128), the
-- prop radius (128) and the item list in apply_league_city_ops (128).

BEGIN;

ALTER TABLE public.league_objects DROP CONSTRAINT IF EXISTS league_objects_item_type_check;
ALTER TABLE public.league_objects ADD CONSTRAINT league_objects_item_type_check CHECK (item_type IN (
  'road', 'lamp', 'bench', 'fountain', 'plaza', 'ramp',
  'tree_default', 'tree_oak', 'tree_fat', 'tree_detailed', 'tree_palm_tall', 'tree_pine_tall_a'
));

ALTER TABLE public.league_objects DROP CONSTRAINT IF EXISTS league_objects_prop_shape;
ALTER TABLE public.league_objects ADD CONSTRAINT league_objects_prop_shape CHECK (
  (px IS NULL) = (pz IS NULL)
  AND (px IS NULL OR (kind = 'item' AND item_type IN (
    'lamp', 'bench', 'fountain', 'ramp',
    'tree_default', 'tree_oak', 'tree_fat', 'tree_detailed', 'tree_palm_tall', 'tree_pine_tall_a'
  )))
);

CREATE OR REPLACE FUNCTION public.league_prop_radius(p_type text)
RETURNS double precision
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_type
    WHEN 'lamp' THEN 2
    WHEN 'bench' THEN 3.5
    WHEN 'fountain' THEN 10
    WHEN 'ramp' THEN 15
    ELSE 7
  END::double precision
$$;

REVOKE EXECUTE ON FUNCTION public.league_prop_radius(text) FROM PUBLIC, anon, authenticated;

-- ─── apply_league_city_ops, with props ─────────────────────
-- Same contract as 126, plus:
--   {op:"place", kind:"item", item_type:<prop>, px, pz, rot?, id?}   prop at a world position
--                                                                     (x, z instead: the lot's center)
--   {op:"move", id, px, pz}                                           move a prop
--   {op:"rotate", id, rot}                                            props: any 0–359
-- New errors: on_building, on_road, prop_overlap (and out_of_bounds for props).
-- After the batch every prop near a touched lot is checked. Only lot objects
-- count toward terrain growth.
CREATE OR REPLACE FUNCTION public.apply_league_city_ops(
  p_league_id uuid,
  p_actor_id  bigint,
  p_ops       jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  c_start   constant int := 12;
  c_max     constant int := 40;
  c_max_ops constant int := 200;
  c_grow_at constant numeric := 0.7;
  c_lot     constant double precision := 48;
  c_items   constant text[] := ARRAY[
    'road', 'lamp', 'bench', 'fountain', 'plaza', 'ramp',
    'tree_default', 'tree_oak', 'tree_fat', 'tree_detailed', 'tree_palm_tall', 'tree_pine_tall_a'
  ];
  c_surfaces constant text[] := ARRAY['road', 'plaza'];
  v_system   boolean := p_actor_id IS NULL;
  v_size     int;
  v_version  bigint;
  v_n        int;
  v_i        int;
  v_op       jsonb;
  v_kind     text;
  v_type     text;
  v_id       uuid;
  v_dev      bigint;
  v_x        int;
  v_z        int;
  v_px       double precision;
  v_pz       double precision;
  v_rot      int;
  v_half     int;
  v_rows     int;
  v_changed  int := 0;
  v_count    int;
  v_obj      record;
  v_problem  text;
  v_unplaced bigint[] := '{}';
  v_touched  int[] := '{}';   -- flattened (x, z) pairs of lots the batch touched
BEGIN
  IF p_ops IS NULL OR jsonb_typeof(p_ops) <> 'array' THEN
    RAISE EXCEPTION 'invalid_op';
  END IF;
  v_n := jsonb_array_length(p_ops);
  IF v_n > c_max_ops THEN
    RAISE EXCEPTION 'too_many_ops';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('league_city:' || p_league_id::text, 0));

  PERFORM 1 FROM public.leagues WHERE id = p_league_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  SELECT c.size, c.version INTO v_size, v_version
  FROM public.league_cities c WHERE c.league_id = p_league_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.league_cities (league_id, size, version) VALUES (p_league_id, c_start, 0);
    v_size := c_start;
    v_version := 0;
  END IF;

  IF v_n = 0 THEN
    RETURN jsonb_build_object('version', v_version, 'size', v_size, 'objects_changed', 0, 'unplaced', '[]'::jsonb);
  END IF;

  FOR v_i IN 0 .. v_n - 1 LOOP
    v_op := p_ops -> v_i;
    IF jsonb_typeof(v_op) <> 'object' THEN
      RAISE EXCEPTION 'invalid_op';
    END IF;

    v_x := NULL; v_z := NULL; v_px := NULL; v_pz := NULL; v_rot := NULL; v_id := NULL; v_dev := NULL;
    IF v_op ? 'x' OR v_op ? 'z' THEN
      IF jsonb_typeof(v_op -> 'x') <> 'number' OR jsonb_typeof(v_op -> 'z') <> 'number'
         OR (v_op ->> 'x')::numeric % 1 <> 0 OR (v_op ->> 'z')::numeric % 1 <> 0
         OR abs((v_op ->> 'x')::numeric) > 1000 OR abs((v_op ->> 'z')::numeric) > 1000 THEN
        RAISE EXCEPTION 'invalid_op';
      END IF;
      v_x := (v_op ->> 'x')::int;
      v_z := (v_op ->> 'z')::int;
    END IF;
    IF v_op ? 'px' OR v_op ? 'pz' THEN
      IF jsonb_typeof(v_op -> 'px') <> 'number' OR jsonb_typeof(v_op -> 'pz') <> 'number'
         OR abs((v_op ->> 'px')::numeric) > 48000 OR abs((v_op ->> 'pz')::numeric) > 48000 THEN
        RAISE EXCEPTION 'invalid_op';
      END IF;
      v_px := round((v_op ->> 'px')::numeric, 1)::double precision;
      v_pz := round((v_op ->> 'pz')::numeric, 1)::double precision;
    END IF;
    IF v_op ? 'rot' THEN
      IF jsonb_typeof(v_op -> 'rot') <> 'number' OR (v_op ->> 'rot')::numeric % 1 <> 0
         OR (v_op ->> 'rot')::numeric < 0 OR (v_op ->> 'rot')::numeric > 359 THEN
        RAISE EXCEPTION 'invalid_op';
      END IF;
      v_rot := (v_op ->> 'rot')::int;
    END IF;
    IF v_op ? 'id' THEN
      IF jsonb_typeof(v_op -> 'id') <> 'string'
         OR (v_op ->> 'id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
        RAISE EXCEPTION 'invalid_op';
      END IF;
      v_id := (v_op ->> 'id')::uuid;
    END IF;
    IF v_op ? 'developer_id' THEN
      IF jsonb_typeof(v_op -> 'developer_id') <> 'number' OR (v_op ->> 'developer_id')::numeric % 1 <> 0 THEN
        RAISE EXCEPTION 'invalid_op';
      END IF;
      v_dev := (v_op ->> 'developer_id')::bigint;
    END IF;

    v_half := v_size / 2;

    CASE v_op ->> 'op'

    WHEN 'init' THEN
      IF NOT v_system OR v_i <> 0 THEN
        RAISE EXCEPTION 'invalid_op';
      END IF;
      IF v_version > 0 THEN
        RETURN jsonb_build_object('version', v_version, 'size', v_size, 'objects_changed', 0,
                                  'unplaced', '[]'::jsonb, 'skipped', true);
      END IF;
      IF jsonb_typeof(v_op -> 'size') <> 'number' OR (v_op ->> 'size')::numeric % 1 <> 0 THEN
        RAISE EXCEPTION 'invalid_op';
      END IF;
      v_size := (v_op ->> 'size')::int;
      IF v_size < c_start OR v_size > c_max OR v_size % 2 <> 0 THEN
        RAISE EXCEPTION 'invalid_op';
      END IF;

    WHEN 'place' THEN
      v_kind := v_op ->> 'kind';
      IF v_kind = 'item' THEN
        v_type := v_op ->> 'item_type';
        IF v_type IS NULL OR NOT (v_type = ANY (c_items)) THEN
          RAISE EXCEPTION 'invalid_op';
        END IF;
        IF v_type = ANY (c_surfaces) THEN
          -- Surface: owns a lot, quarter turns.
          IF v_x IS NULL OR v_px IS NOT NULL OR COALESCE(v_rot, 0) % 90 <> 0 THEN
            RAISE EXCEPTION 'invalid_op';
          END IF;
          IF v_x < -v_half OR v_x >= v_size - v_half OR v_z < -v_half OR v_z >= v_size - v_half THEN
            RAISE EXCEPTION 'out_of_bounds';
          END IF;
          INSERT INTO public.league_objects (id, league_id, kind, item_type, x, z, rot)
          VALUES (COALESCE(v_id, gen_random_uuid()), p_league_id, 'item', v_type, v_x, v_z, COALESCE(v_rot, 0));
          v_touched := v_touched || ARRAY[v_x, v_z];
        ELSE
          -- Prop: free position; its lot is the one under its center.
          -- A lot-only op (callers from before 128) lands at the lot's center.
          IF v_px IS NULL THEN
            IF v_x IS NULL THEN
              RAISE EXCEPTION 'invalid_op';
            END IF;
            v_px := v_x * c_lot;
            v_pz := v_z * c_lot;
          END IF;
          v_x := round(v_px / c_lot)::int;
          v_z := round(v_pz / c_lot)::int;
          INSERT INTO public.league_objects (id, league_id, kind, item_type, x, z, px, pz, rot)
          VALUES (COALESCE(v_id, gen_random_uuid()), p_league_id, 'item', v_type, v_x, v_z, v_px, v_pz, COALESCE(v_rot, 0));
          v_touched := v_touched || ARRAY[v_x, v_z];
        END IF;
      ELSIF v_kind = 'building' THEN
        IF v_dev IS NULL OR v_x IS NULL OR COALESCE(v_rot, 0) % 90 <> 0 THEN
          RAISE EXCEPTION 'invalid_op';
        END IF;
        IF v_x < -v_half OR v_x >= v_size - v_half OR v_z < -v_half OR v_z >= v_size - v_half THEN
          RAISE EXCEPTION 'out_of_bounds';
        END IF;
        PERFORM 1 FROM public.league_members m
        WHERE m.league_id = p_league_id AND m.developer_id = v_dev AND m.status IN ('invited', 'active');
        IF NOT FOUND THEN
          RAISE EXCEPTION 'not_member';
        END IF;
        PERFORM 1 FROM public.league_objects o WHERE o.league_id = p_league_id AND o.developer_id = v_dev;
        IF FOUND THEN
          RAISE EXCEPTION 'already_placed';
        END IF;
        INSERT INTO public.league_objects (id, league_id, kind, developer_id, x, z, rot, is_new)
        VALUES (COALESCE(v_id, gen_random_uuid()), p_league_id, 'building', v_dev, v_x, v_z, COALESCE(v_rot, 0), v_system);
        v_touched := v_touched || ARRAY[v_x, v_z];
      ELSE
        RAISE EXCEPTION 'invalid_op';
      END IF;
      v_changed := v_changed + 1;

    WHEN 'move' THEN
      IF v_id IS NULL THEN
        RAISE EXCEPTION 'invalid_op';
      END IF;
      SELECT o.x, o.z, o.px INTO v_obj FROM public.league_objects o WHERE o.id = v_id AND o.league_id = p_league_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'not_found';
      END IF;
      v_touched := v_touched || ARRAY[v_obj.x, v_obj.z];
      IF v_obj.px IS NOT NULL THEN
        IF v_px IS NULL THEN
          IF v_x IS NULL THEN
            RAISE EXCEPTION 'invalid_op';
          END IF;
          v_px := v_x * c_lot;
          v_pz := v_z * c_lot;
        END IF;
        v_x := round(v_px / c_lot)::int;
        v_z := round(v_pz / c_lot)::int;
        UPDATE public.league_objects o SET px = v_px, pz = v_pz, x = v_x, z = v_z, updated_at = now()
        WHERE o.id = v_id;
      ELSE
        IF v_x IS NULL THEN
          RAISE EXCEPTION 'invalid_op';
        END IF;
        IF v_x < -v_half OR v_x >= v_size - v_half OR v_z < -v_half OR v_z >= v_size - v_half THEN
          RAISE EXCEPTION 'out_of_bounds';
        END IF;
        UPDATE public.league_objects o
        SET x = v_x, z = v_z, updated_at = now(),
            is_new = CASE WHEN v_system THEN o.is_new ELSE false END
        WHERE o.id = v_id;
      END IF;
      v_touched := v_touched || ARRAY[v_x, v_z];
      v_changed := v_changed + 1;

    WHEN 'rotate' THEN
      IF v_id IS NULL OR v_rot IS NULL THEN
        RAISE EXCEPTION 'invalid_op';
      END IF;
      SELECT o.px INTO v_obj FROM public.league_objects o WHERE o.id = v_id AND o.league_id = p_league_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'not_found';
      END IF;
      IF v_obj.px IS NULL AND v_rot % 90 <> 0 THEN
        RAISE EXCEPTION 'invalid_op';
      END IF;
      UPDATE public.league_objects o SET rot = v_rot, updated_at = now() WHERE o.id = v_id;
      v_changed := v_changed + 1;

    WHEN 'remove' THEN
      IF v_id IS NOT NULL THEN
        SELECT o.kind, o.x, o.z INTO v_obj FROM public.league_objects o WHERE o.id = v_id AND o.league_id = p_league_id;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'not_found';
        END IF;
        IF v_obj.kind = 'building' AND NOT v_system THEN
          RAISE EXCEPTION 'forbidden';
        END IF;
        DELETE FROM public.league_objects o WHERE o.id = v_id;
        v_touched := v_touched || ARRAY[v_obj.x, v_obj.z];
        v_changed := v_changed + 1;
      ELSIF v_dev IS NOT NULL THEN
        IF NOT v_system THEN
          RAISE EXCEPTION 'forbidden';
        END IF;
        DELETE FROM public.league_objects o WHERE o.league_id = p_league_id AND o.developer_id = v_dev;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        v_changed := v_changed + v_rows;
      ELSE
        RAISE EXCEPTION 'invalid_op';
      END IF;

    WHEN 'dismiss_new' THEN
      IF v_id IS NULL THEN
        RAISE EXCEPTION 'invalid_op';
      END IF;
      UPDATE public.league_objects o SET is_new = false, updated_at = now()
      WHERE o.id = v_id AND o.league_id = p_league_id;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows = 0 THEN
        RAISE EXCEPTION 'not_found';
      END IF;
      v_changed := v_changed + 1;

    WHEN 'auto_place' THEN
      IF NOT v_system THEN
        RAISE EXCEPTION 'forbidden';
      END IF;
      IF v_dev IS NULL THEN
        RAISE EXCEPTION 'invalid_op';
      END IF;
      PERFORM 1 FROM public.league_members m
      WHERE m.league_id = p_league_id AND m.developer_id = v_dev AND m.status IN ('invited', 'active');
      IF NOT FOUND THEN
        RAISE EXCEPTION 'not_member';
      END IF;
      PERFORM 1 FROM public.league_objects o WHERE o.league_id = p_league_id AND o.developer_id = v_dev;
      IF NOT FOUND THEN
        -- Nearest free lot (no lot object, no prop reaching into it) to the
        -- center that touches a road, else the nearest free lot, else grow.
        LOOP
          v_half := v_size / 2;
          WITH occ AS (
            SELECT o.x, o.z, o.item_type FROM public.league_objects o WHERE o.league_id = p_league_id AND o.px IS NULL
          ), props AS (
            SELECT o.px, o.pz, public.league_prop_radius(o.item_type) AS r
            FROM public.league_objects o WHERE o.league_id = p_league_id AND o.px IS NOT NULL
          ), lots AS (
            SELECT gx, gz
            FROM generate_series(-v_half, v_size - v_half - 1) AS gx
            CROSS JOIN generate_series(-v_half, v_size - v_half - 1) AS gz
          )
          SELECT l.gx, l.gz INTO v_x, v_z
          FROM lots l
          WHERE NOT EXISTS (SELECT 1 FROM occ WHERE occ.x = l.gx AND occ.z = l.gz)
            AND NOT EXISTS (
              SELECT 1 FROM props p
              WHERE public.league_rect_dist2(p.px, p.pz, l.gx * c_lot - c_lot / 2, l.gz * c_lot - c_lot / 2,
                                             l.gx * c_lot + c_lot / 2, l.gz * c_lot + c_lot / 2) < p.r * p.r
            )
          ORDER BY
            EXISTS (SELECT 1 FROM occ WHERE occ.item_type = 'road' AND abs(occ.x - l.gx) + abs(occ.z - l.gz) = 1) DESC,
            l.gx * l.gx + l.gz * l.gz, abs(l.gz), l.gz, l.gx
          LIMIT 1;
          EXIT WHEN FOUND;
          IF v_size >= c_max THEN
            v_unplaced := v_unplaced || v_dev;
            v_x := NULL;
            EXIT;
          END IF;
          v_size := v_size + 2;
        END LOOP;

        IF v_x IS NOT NULL THEN
          SELECT CASE
                   WHEN o.z = v_z - 1 THEN 0
                   WHEN o.x = v_x + 1 THEN 90
                   WHEN o.z = v_z + 1 THEN 180
                   ELSE 270
                 END INTO v_rot
          FROM public.league_objects o
          WHERE o.league_id = p_league_id AND o.item_type = 'road' AND o.px IS NULL
            AND abs(o.x - v_x) + abs(o.z - v_z) = 1
          ORDER BY CASE WHEN o.z = v_z - 1 THEN 0 WHEN o.x = v_x + 1 THEN 1 WHEN o.z = v_z + 1 THEN 2 ELSE 3 END
          LIMIT 1;
          INSERT INTO public.league_objects (league_id, kind, developer_id, x, z, rot, is_new)
          VALUES (p_league_id, 'building', v_dev, v_x, v_z, COALESCE(v_rot, 0), true);
          v_changed := v_changed + 1;
        END IF;
      END IF;

    ELSE
      RAISE EXCEPTION 'invalid_op';
    END CASE;
  END LOOP;

  -- Lot check after the whole batch (lot objects only).
  PERFORM 1 FROM public.league_objects o
  WHERE o.league_id = p_league_id AND o.px IS NULL
  GROUP BY o.x, o.z HAVING count(*) > 1
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'lot_taken';
  END IF;

  -- Props near any touched lot must still stand (moves, new roads and moved
  -- buildings can all invalidate a prop that didn't move).
  IF array_length(v_touched, 1) > 0 THEN
    FOR v_obj IN
      SELECT o.id FROM public.league_objects o
      WHERE o.league_id = p_league_id AND o.px IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM generate_subscripts(v_touched, 1) AS i
          WHERE i % 2 = 1 AND abs(o.x - v_touched[i]) <= 1 AND abs(o.z - v_touched[i + 1]) <= 1
        )
    LOOP
      v_problem := public.league_prop_problem(p_league_id, v_obj.id);
      IF v_problem IS NOT NULL THEN
        RAISE EXCEPTION '%', v_problem;
      END IF;
    END LOOP;
  END IF;

  SELECT count(*) INTO v_count FROM public.league_objects o WHERE o.league_id = p_league_id AND o.px IS NULL;
  WHILE v_count > c_grow_at * v_size * v_size AND v_size < c_max LOOP
    v_size := v_size + 2;
  END LOOP;

  v_version := v_version + 1;
  UPDATE public.league_cities
  SET size = v_size, version = v_version, updated_at = now()
  WHERE league_id = p_league_id;

  INSERT INTO public.league_city_ops (league_id, version, actor_id, ops)
  VALUES (p_league_id, v_version, p_actor_id, p_ops);

  RETURN jsonb_build_object(
    'version', v_version,
    'size', v_size,
    'objects_changed', v_changed,
    'unplaced', to_jsonb(v_unplaced)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_league_city_ops(uuid, bigint, jsonb) FROM PUBLIC, anon, authenticated;

COMMIT;
