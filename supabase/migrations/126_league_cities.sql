-- ─── League cities ─────────────────────────────────────────
-- Every league owns a small city: a square grid of 48-unit lots centered on
-- (0,0), one object per lot. Objects are member buildings or items (roads,
-- trees, decorations). All writes go through apply_league_city_ops, which
-- serializes per league with an advisory lock, so editor saves, invites and
-- seeding never race for a lot.
--
-- Lot coordinates for a city of `size`: x, z in [-size/2, size - size/2 - 1].
-- `rot` is the direction the object faces, clockwise from north (-z).
--
-- RLS on, no policies: reads and writes go through API routes using the
-- service-role client.

BEGIN;

-- ─── league_cities ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.league_cities (
  league_id  uuid PRIMARY KEY REFERENCES public.leagues(id) ON DELETE CASCADE,
  size       int    NOT NULL DEFAULT 12 CHECK (size BETWEEN 12 AND 40 AND size % 2 = 0),
  version    bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── league_objects ────────────────────────────────────────
-- The lot key is deferrable so two buildings can swap lots in one batch.
CREATE TABLE IF NOT EXISTS public.league_objects (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id    uuid   NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  kind         text   NOT NULL CHECK (kind IN ('building', 'item')),
  item_type    text   CHECK (item_type IN (
    'road', 'lamp', 'bench', 'fountain', 'plaza',
    'tree_default', 'tree_oak', 'tree_fat', 'tree_detailed', 'tree_palm_tall', 'tree_pine_tall_a'
  )),
  developer_id bigint REFERENCES public.developers(id) ON DELETE CASCADE,
  x            int    NOT NULL,
  z            int    NOT NULL,
  rot          int    NOT NULL DEFAULT 0 CHECK (rot IN (0, 90, 180, 270)),
  is_new       boolean NOT NULL DEFAULT false,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT league_objects_kind_shape CHECK (
    (kind = 'building' AND developer_id IS NOT NULL AND item_type IS NULL)
    OR (kind = 'item' AND developer_id IS NULL AND item_type IS NOT NULL)
  ),
  CONSTRAINT league_objects_lot_unique UNIQUE (league_id, x, z) DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT league_objects_dev_unique UNIQUE (league_id, developer_id)
);
CREATE INDEX IF NOT EXISTS idx_league_objects_dev ON public.league_objects(developer_id);

-- ─── league_city_ops ───────────────────────────────────────
-- Append-only log of every applied batch. Also the source for the city ops
-- rate limit (actor_id, at). Kept 90 days.
CREATE TABLE IF NOT EXISTS public.league_city_ops (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  league_id uuid   NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  version   bigint NOT NULL,
  actor_id  bigint REFERENCES public.developers(id) ON DELETE SET NULL, -- null = system
  ops       jsonb  NOT NULL,
  at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_league_city_ops_league_version ON public.league_city_ops(league_id, version);
CREATE INDEX IF NOT EXISTS idx_league_city_ops_actor_at ON public.league_city_ops(actor_id, at);
CREATE INDEX IF NOT EXISTS idx_league_city_ops_at ON public.league_city_ops(at);

ALTER TABLE public.league_cities   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_objects  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_city_ops ENABLE ROW LEVEL SECURITY;

-- ─── apply_league_city_ops ─────────────────────────────────
-- Applies a batch of ops atomically; any invalid op rejects the whole batch.
-- p_actor_id null = system (starter city, auto-placement, member removal).
--
-- Ops (max 200):
--   {op:"init", size}                                   system, first op only; no-op batch if the city already has edits
--   {op:"place", kind:"item", item_type, x, z, rot?, id?}
--   {op:"place", kind:"building", developer_id, x, z, rot?, id?}
--   {op:"move", id, x, z}
--   {op:"rotate", id, rot}
--   {op:"remove", id} | {op:"remove", developer_id}     buildings: system only
--   {op:"dismiss_new", id}
--   {op:"auto_place", developer_id}                     system only
--
-- Errors (exception message): invalid_op, too_many_ops, not_found, not_member,
-- out_of_bounds, lot_taken, already_placed, forbidden.
-- Returns {version, size, objects_changed, unplaced, skipped?}.
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
  c_items   constant text[] := ARRAY[
    'road', 'lamp', 'bench', 'fountain', 'plaza',
    'tree_default', 'tree_oak', 'tree_fat', 'tree_detailed', 'tree_palm_tall', 'tree_pine_tall_a'
  ];
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
  v_rot      int;
  v_half     int;
  v_rows     int;
  v_changed  int := 0;
  v_count    int;
  v_unplaced bigint[] := '{}';
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

    -- Shared field parsing. Numbers must be integers.
    v_x := NULL; v_z := NULL; v_rot := NULL; v_id := NULL; v_dev := NULL;
    IF v_op ? 'x' OR v_op ? 'z' THEN
      IF jsonb_typeof(v_op -> 'x') <> 'number' OR jsonb_typeof(v_op -> 'z') <> 'number'
         OR (v_op ->> 'x')::numeric % 1 <> 0 OR (v_op ->> 'z')::numeric % 1 <> 0
         OR abs((v_op ->> 'x')::numeric) > 1000 OR abs((v_op ->> 'z')::numeric) > 1000 THEN
        RAISE EXCEPTION 'invalid_op';
      END IF;
      v_x := (v_op ->> 'x')::int;
      v_z := (v_op ->> 'z')::int;
    END IF;
    IF v_op ? 'rot' THEN
      IF jsonb_typeof(v_op -> 'rot') <> 'number' OR (v_op ->> 'rot') NOT IN ('0', '90', '180', '270') THEN
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
      -- Idempotent: a city that already has edits keeps them.
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
      IF v_x IS NULL THEN
        RAISE EXCEPTION 'invalid_op';
      END IF;
      IF v_x < -v_half OR v_x >= v_size - v_half OR v_z < -v_half OR v_z >= v_size - v_half THEN
        RAISE EXCEPTION 'out_of_bounds';
      END IF;
      IF v_kind = 'item' THEN
        v_type := v_op ->> 'item_type';
        IF v_type IS NULL OR NOT (v_type = ANY (c_items)) THEN
          RAISE EXCEPTION 'invalid_op';
        END IF;
        INSERT INTO public.league_objects (id, league_id, kind, item_type, x, z, rot)
        VALUES (COALESCE(v_id, gen_random_uuid()), p_league_id, 'item', v_type, v_x, v_z, COALESCE(v_rot, 0));
      ELSIF v_kind = 'building' THEN
        IF v_dev IS NULL THEN
          RAISE EXCEPTION 'invalid_op';
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
      ELSE
        RAISE EXCEPTION 'invalid_op';
      END IF;
      v_changed := v_changed + 1;

    WHEN 'move' THEN
      IF v_id IS NULL OR v_x IS NULL THEN
        RAISE EXCEPTION 'invalid_op';
      END IF;
      IF v_x < -v_half OR v_x >= v_size - v_half OR v_z < -v_half OR v_z >= v_size - v_half THEN
        RAISE EXCEPTION 'out_of_bounds';
      END IF;
      UPDATE public.league_objects o
      SET x = v_x, z = v_z, updated_at = now(),
          is_new = CASE WHEN v_system THEN o.is_new ELSE false END
      WHERE o.id = v_id AND o.league_id = p_league_id;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows = 0 THEN
        RAISE EXCEPTION 'not_found';
      END IF;
      v_changed := v_changed + 1;

    WHEN 'rotate' THEN
      IF v_id IS NULL OR v_rot IS NULL THEN
        RAISE EXCEPTION 'invalid_op';
      END IF;
      UPDATE public.league_objects o SET rot = v_rot, updated_at = now()
      WHERE o.id = v_id AND o.league_id = p_league_id;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows = 0 THEN
        RAISE EXCEPTION 'not_found';
      END IF;
      v_changed := v_changed + 1;

    WHEN 'remove' THEN
      IF v_id IS NOT NULL THEN
        SELECT o.kind INTO v_kind FROM public.league_objects o WHERE o.id = v_id AND o.league_id = p_league_id;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'not_found';
        END IF;
        IF v_kind = 'building' AND NOT v_system THEN
          RAISE EXCEPTION 'forbidden';
        END IF;
        DELETE FROM public.league_objects o WHERE o.id = v_id;
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
        -- Nearest free lot to the center that touches a road, else the nearest
        -- free lot, else grow one ring and look again. At the cap the building
        -- waits (reported in `unplaced`).
        LOOP
          v_half := v_size / 2;
          WITH occ AS (
            SELECT o.x, o.z, o.item_type FROM public.league_objects o WHERE o.league_id = p_league_id
          ), lots AS (
            SELECT gx, gz
            FROM generate_series(-v_half, v_size - v_half - 1) AS gx
            CROSS JOIN generate_series(-v_half, v_size - v_half - 1) AS gz
          )
          SELECT l.gx, l.gz INTO v_x, v_z
          FROM lots l
          WHERE NOT EXISTS (SELECT 1 FROM occ WHERE occ.x = l.gx AND occ.z = l.gz)
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
          -- Face the first road neighbor (N, E, S, W).
          SELECT CASE
                   WHEN o.z = v_z - 1 THEN 0
                   WHEN o.x = v_x + 1 THEN 90
                   WHEN o.z = v_z + 1 THEN 180
                   ELSE 270
                 END INTO v_rot
          FROM public.league_objects o
          WHERE o.league_id = p_league_id AND o.item_type = 'road'
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

  -- Explicit lot check after the whole batch (the lot key is deferred, so a
  -- swap is legal mid-batch, and deferrable keys can't back ON CONFLICT).
  PERFORM 1 FROM public.league_objects o
  WHERE o.league_id = p_league_id
  GROUP BY o.x, o.z HAVING count(*) > 1
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'lot_taken';
  END IF;

  -- Grow one ring at a time while occupancy is past the threshold.
  SELECT count(*) INTO v_count FROM public.league_objects o WHERE o.league_id = p_league_id;
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

-- ─── Op log retention: 90 days ─────────────────────────────
SELECT cron.schedule(
  'prune-league-city-ops',
  '23 4 * * *',
  $$DELETE FROM public.league_city_ops WHERE at < now() - interval '90 days'$$
);

COMMIT;
