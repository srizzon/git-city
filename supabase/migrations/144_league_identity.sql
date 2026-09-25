-- ─── League identity ───────────────────────────────────────
-- Spec: docs/superpowers/specs/2026-09-24-league-identity-design.md
--
-- 1. Item types become data. league_item_types holds one row per type
--    (footprint lot | prop | air, radius, per-city limit, limit group,
--    system_only, on_road); league_objects.item_type references it instead of
--    the CHECK lists, and apply_league_city_ops / league_prop_problem read it.
--    A new type is an INSERT. Seeded with the 18 current types plus portal,
--    billboard, flag, plane and blimp.
-- 2. league_objects.props (jsonb, per-type settings validated by the ops
--    route's zod schemas, capped at 2 KB here) and league_objects.locked
--    (only system ops, actor null, may touch it).
-- 3. Cities are anchored at their entrance. league_cities.size (a square
--    centered on 0) becomes h: x in [-h, h], z in [-2h+1, 0], south (+z) is
--    the entrance row. Growth adds a column east and west and two rows north.
--    h 6..20 (13×12 to 41×40 lots).
-- 4. Identity: league_cities.sky, sign_side, identity_version (bumped by a
--    trigger on any identity change) and logo_asset_id; league_assets (logos,
--    in the public league-assets bucket); league_reports.
-- 5. Existing cities are anchored in place, never deleted: every object moves
--    north by h-1 lots, so the old south edge becomes z = 0. The entrance lots
--    (0, 0) and (0, -1) become locked roads; whatever stood there moves
--    (buildings re-auto-placed as NEW) or goes (surfaces, props the new
--    asphalt covers), each as a logged system op. Then the locked portal.
--
-- apply_league_city_ops starts from 141's body, which is prod's current
-- definition (141 was hash-checked against prod when applied). Hash-check
-- prod's pg_get_functiondef against 141 again before applying this.
-- apply_league_city_ops_admin_by_id starts from 134's body.

BEGIN;

-- ─── 1. league_item_types ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.league_item_types (
  item_type    text PRIMARY KEY CHECK (item_type ~ '^[a-z0-9_]{1,40}$'),
  footprint    text NOT NULL CHECK (footprint IN ('lot', 'prop', 'air')),
  radius       double precision NOT NULL DEFAULT 0 CHECK (radius >= 0 AND radius <= 48),
  max_per_city int CHECK (max_per_city IS NULL OR max_per_city > 0),
  -- Types sharing a group share one limit (planes and blimps: 3 together).
  limit_group  text,
  system_only  boolean NOT NULL DEFAULT false,
  -- Props that may stand on asphalt (drive toys, the portal).
  on_road      boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.league_item_types ENABLE ROW LEVEL SECURITY;

INSERT INTO public.league_item_types (item_type, footprint, radius, max_per_city, limit_group, system_only, on_road) VALUES
  ('road',             'lot',  0,    NULL, NULL,  false, false),
  ('plaza',            'lot',  0,    NULL, NULL,  false, false),
  ('lamp',             'prop', 2,    NULL, NULL,  false, false),
  ('bench',            'prop', 3.5,  NULL, NULL,  false, false),
  ('fountain',         'prop', 10,   NULL, NULL,  false, false),
  ('ramp',             'prop', 15,   NULL, NULL,  false, true),
  ('ramp_big',         'prop', 22,   NULL, NULL,  false, true),
  ('boost_pad',        'prop', 10,   NULL, NULL,  false, true),
  ('speed_bump',       'prop', 11,   NULL, NULL,  false, true),
  ('cone',             'prop', 2,    NULL, NULL,  false, true),
  ('crates',           'prop', 6,    NULL, NULL,  false, true),
  ('tire_wall',        'prop', 9,    NULL, NULL,  false, true),
  ('tree_default',     'prop', 7,    NULL, NULL,  false, false),
  ('tree_oak',         'prop', 7,    NULL, NULL,  false, false),
  ('tree_fat',         'prop', 7,    NULL, NULL,  false, false),
  ('tree_detailed',    'prop', 7,    NULL, NULL,  false, false),
  ('tree_palm_tall',   'prop', 7,    NULL, NULL,  false, false),
  ('tree_pine_tall_a', 'prop', 7,    NULL, NULL,  false, false),
  ('portal',           'prop', 3,    1,    NULL,  true,  true),
  ('billboard',        'prop', 6,    4,    NULL,  false, false),
  ('flag',             'prop', 2,    12,   NULL,  false, false),
  ('plane',            'air',  0,    3,    'sky', false, false),
  ('blimp',            'air',  0,    3,    'sky', false, false)
ON CONFLICT (item_type) DO NOTHING;

-- ─── 2. league_objects: catalog FK, props, locked ──────────
ALTER TABLE public.league_objects DROP CONSTRAINT IF EXISTS league_objects_item_type_check;
ALTER TABLE public.league_objects DROP CONSTRAINT IF EXISTS league_objects_item_type_fkey;
ALTER TABLE public.league_objects ADD CONSTRAINT league_objects_item_type_fkey
  FOREIGN KEY (item_type) REFERENCES public.league_item_types(item_type);

-- Which types take px/pz now lives in the catalog (footprint); the function
-- enforces it. The table keeps the pairing rule.
ALTER TABLE public.league_objects DROP CONSTRAINT IF EXISTS league_objects_prop_shape;
ALTER TABLE public.league_objects ADD CONSTRAINT league_objects_prop_shape CHECK (
  (px IS NULL) = (pz IS NULL) AND (px IS NULL OR kind = 'item')
);

ALTER TABLE public.league_objects ADD COLUMN IF NOT EXISTS props jsonb;
ALTER TABLE public.league_objects ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false;
ALTER TABLE public.league_objects DROP CONSTRAINT IF EXISTS league_objects_props_shape;
ALTER TABLE public.league_objects ADD CONSTRAINT league_objects_props_shape CHECK (
  props IS NULL OR (jsonb_typeof(props) = 'object' AND pg_column_size(props) <= 2048)
);

-- ─── 4. Assets, identity columns, reports ──────────────────
CREATE TABLE IF NOT EXISTS public.league_assets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id  uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  kind       text NOT NULL DEFAULT 'logo' CHECK (kind IN ('logo')),
  -- Path in the league-assets bucket; a new name per upload, so caches never serve the old one.
  path       text NOT NULL UNIQUE,
  source     text NOT NULL CHECK (source IN ('github_org', 'upload')),
  status     text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
  created_by bigint REFERENCES public.developers(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_league_assets_league ON public.league_assets(league_id);
CREATE INDEX IF NOT EXISTS idx_league_assets_created_by ON public.league_assets(created_by, created_at);
ALTER TABLE public.league_assets ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.league_cities ADD COLUMN IF NOT EXISTS h int;
ALTER TABLE public.league_cities ADD COLUMN IF NOT EXISTS sky smallint NOT NULL DEFAULT 1 CHECK (sky BETWEEN 0 AND 3);
ALTER TABLE public.league_cities ADD COLUMN IF NOT EXISTS sign_side text CHECK (sign_side IN ('north', 'east', 'west'));
ALTER TABLE public.league_cities ADD COLUMN IF NOT EXISTS identity_version bigint NOT NULL DEFAULT 0;
ALTER TABLE public.league_cities ADD COLUMN IF NOT EXISTS logo_asset_id uuid;
ALTER TABLE public.league_cities DROP CONSTRAINT IF EXISTS league_cities_logo_asset_id_fkey;
ALTER TABLE public.league_cities ADD CONSTRAINT league_cities_logo_asset_id_fkey
  FOREIGN KEY (logo_asset_id) REFERENCES public.league_assets(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.league_reports (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  league_id   uuid   NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  asset_id    uuid   NOT NULL REFERENCES public.league_assets(id) ON DELETE CASCADE,
  reporter_id bigint NOT NULL REFERENCES public.developers(id) ON DELETE CASCADE,
  reason      text   NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 280),
  at          timestamptz NOT NULL DEFAULT now(),
  -- Set when an admin takes the asset down or dismisses the report.
  resolved_at timestamptz,
  CONSTRAINT league_reports_once UNIQUE (reporter_id, asset_id)
);
CREATE INDEX IF NOT EXISTS idx_league_reports_open ON public.league_reports(at) WHERE resolved_at IS NULL;
ALTER TABLE public.league_reports ENABLE ROW LEVEL SECURITY;

-- identity_version: bumped on any identity change, so the OG card and the
-- page caches key on it.
CREATE OR REPLACE FUNCTION public.league_cities_bump_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.sky IS DISTINCT FROM OLD.sky
     OR NEW.sign_side IS DISTINCT FROM OLD.sign_side
     OR NEW.logo_asset_id IS DISTINCT FROM OLD.logo_asset_id THEN
    NEW.identity_version := OLD.identity_version + 1;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS league_cities_identity_version ON public.league_cities;
CREATE TRIGGER league_cities_identity_version
  BEFORE UPDATE ON public.league_cities
  FOR EACH ROW EXECUTE FUNCTION public.league_cities_bump_identity();

-- A takedown (status → removed) changes what the city shows.
CREATE OR REPLACE FUNCTION public.league_assets_bump_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE public.league_cities c SET identity_version = c.identity_version + 1
    WHERE c.logo_asset_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS league_assets_identity_version ON public.league_assets;
CREATE TRIGGER league_assets_identity_version
  AFTER UPDATE ON public.league_assets
  FOR EACH ROW EXECUTE FUNCTION public.league_assets_bump_identity();

REVOKE EXECUTE ON FUNCTION public.league_cities_bump_identity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.league_assets_bump_identity() FROM PUBLIC, anon, authenticated;

-- Public bucket for league logos. Uploads go through the logo route with the
-- service role; PNG only (the route re-encodes every upload), 1 MB cap.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('league-assets', 'league-assets', true, 1048576, ARRAY['image/png'])
ON CONFLICT (id) DO NOTHING;

-- Logo uploads per developer, counted from league_assets, serialized per dev.
CREATE OR REPLACE FUNCTION public.league_take_logo_quota(p_dev_id bigint, p_limit int, p_window interval)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_count int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('league_quota:logo:' || p_dev_id, 0));
  SELECT count(*) INTO v_count FROM public.league_assets a
  WHERE a.created_by = p_dev_id AND a.source = 'upload' AND a.created_at > now() - p_window;
  RETURN v_count < p_limit;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.league_take_logo_quota(bigint, int, interval) FROM PUBLIC, anon, authenticated;

-- ─── 3. size → h, anchored ─────────────────────────────────
-- Old bounds x, z in [-h, h-1] with h = size/2; new depth is the same 2h.
-- Every object moves by dz = -(h-1) lots (props: × 48), so the old south
-- edge (z = h-1) becomes the entrance row z = 0. The new east column x = h
-- starts empty. Coordinates only; nothing is deleted here.
SET CONSTRAINTS ALL DEFERRED;

UPDATE public.league_cities SET h = size / 2 WHERE h IS NULL;

UPDATE public.league_objects o
SET z = o.z - (c.h - 1),
    pz = CASE WHEN o.pz IS NULL THEN NULL ELSE o.pz - (c.h - 1) * 48 END
FROM public.league_cities c
WHERE c.league_id = o.league_id;

SET CONSTRAINTS ALL IMMEDIATE;

ALTER TABLE public.league_cities ALTER COLUMN h SET DEFAULT 6;
ALTER TABLE public.league_cities ALTER COLUMN h SET NOT NULL;
ALTER TABLE public.league_cities DROP CONSTRAINT IF EXISTS league_cities_h_check;
ALTER TABLE public.league_cities ADD CONSTRAINT league_cities_h_check CHECK (h BETWEEN 6 AND 20);
ALTER TABLE public.league_cities DROP COLUMN IF EXISTS size;

-- ─── Catalog readers ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.league_prop_radius(p_type text)
RETURNS double precision
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT COALESCE((SELECT t.radius FROM public.league_item_types t WHERE t.item_type = p_type), 7)::double precision
$$;

REVOKE EXECUTE ON FUNCTION public.league_prop_radius(text) FROM PUBLIC, anon, authenticated;

-- Why a prop can't stand where it is, or null when it can: out of the city,
-- on a building's lot, on asphalt, or overlapping another prop. Roads are
-- 26 wide: a center square plus an arm toward each road neighbor (see
-- src/lib/league-city/props.ts, which mirrors this). Catalog on_road types
-- may stand on asphalt. Air objects (planes, blimps) only need their center
-- inside the city, and nothing on the ground collides with them.
CREATE OR REPLACE FUNCTION public.league_prop_problem(p_league_id uuid, p_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  c_lot  constant double precision := 48;
  c_road constant double precision := 13;
  v_p    record;
  v_r    double precision;
  v_h    int;
  v_l    record;
  v_cx   double precision;
  v_cz   double precision;
BEGIN
  SELECT o.id, o.px, o.pz, o.x, o.z, o.item_type, t.footprint, t.radius, t.on_road INTO v_p
  FROM public.league_objects o
  JOIN public.league_item_types t ON t.item_type = o.item_type
  WHERE o.id = p_id AND o.league_id = p_league_id;
  IF NOT FOUND OR v_p.px IS NULL THEN
    RETURN NULL;
  END IF;
  v_r := CASE WHEN v_p.footprint = 'air' THEN 0 ELSE v_p.radius END;

  SELECT c.h INTO v_h FROM public.league_cities c WHERE c.league_id = p_league_id;
  IF v_p.px - v_r < (-v_h - 0.5) * c_lot OR v_p.px + v_r > (v_h + 0.5) * c_lot
     OR v_p.pz - v_r < (-2 * v_h + 1 - 0.5) * c_lot OR v_p.pz + v_r > 0.5 * c_lot THEN
    RETURN 'out_of_bounds';
  END IF;
  IF v_p.footprint = 'air' THEN
    RETURN NULL;
  END IF;

  -- Lot objects around the prop (its circle reaches at most one lot over).
  FOR v_l IN
    SELECT o.kind, o.item_type, o.x, o.z FROM public.league_objects o
    WHERE o.league_id = p_league_id AND o.px IS NULL
      AND o.x BETWEEN v_p.x - 1 AND v_p.x + 1 AND o.z BETWEEN v_p.z - 1 AND v_p.z + 1
  LOOP
    v_cx := v_l.x * c_lot;
    v_cz := v_l.z * c_lot;
    IF v_l.kind = 'building' THEN
      IF public.league_rect_dist2(v_p.px, v_p.pz, v_cx - c_lot / 2, v_cz - c_lot / 2, v_cx + c_lot / 2, v_cz + c_lot / 2) < v_r * v_r THEN
        RETURN 'on_building';
      END IF;
    ELSIF v_l.item_type = 'road' AND NOT v_p.on_road THEN
      IF public.league_rect_dist2(v_p.px, v_p.pz, v_cx - c_road, v_cz - c_road, v_cx + c_road, v_cz + c_road) < v_r * v_r
        OR (EXISTS (SELECT 1 FROM public.league_objects n WHERE n.league_id = p_league_id AND n.px IS NULL AND n.item_type = 'road' AND n.x = v_l.x AND n.z = v_l.z - 1)
            AND public.league_rect_dist2(v_p.px, v_p.pz, v_cx - c_road, v_cz - c_lot / 2, v_cx + c_road, v_cz - c_road) < v_r * v_r)
        OR (EXISTS (SELECT 1 FROM public.league_objects n WHERE n.league_id = p_league_id AND n.px IS NULL AND n.item_type = 'road' AND n.x = v_l.x AND n.z = v_l.z + 1)
            AND public.league_rect_dist2(v_p.px, v_p.pz, v_cx - c_road, v_cz + c_road, v_cx + c_road, v_cz + c_lot / 2) < v_r * v_r)
        OR (EXISTS (SELECT 1 FROM public.league_objects n WHERE n.league_id = p_league_id AND n.px IS NULL AND n.item_type = 'road' AND n.x = v_l.x + 1 AND n.z = v_l.z)
            AND public.league_rect_dist2(v_p.px, v_p.pz, v_cx + c_road, v_cz - c_road, v_cx + c_lot / 2, v_cz + c_road) < v_r * v_r)
        OR (EXISTS (SELECT 1 FROM public.league_objects n WHERE n.league_id = p_league_id AND n.px IS NULL AND n.item_type = 'road' AND n.x = v_l.x - 1 AND n.z = v_l.z)
            AND public.league_rect_dist2(v_p.px, v_p.pz, v_cx - c_lot / 2, v_cz - c_road, v_cx - c_road, v_cz + c_road) < v_r * v_r)
      THEN
        RETURN 'on_road';
      END IF;
    END IF;
  END LOOP;

  PERFORM 1 FROM public.league_objects q
  JOIN public.league_item_types qt ON qt.item_type = q.item_type
  WHERE q.league_id = p_league_id AND q.px IS NOT NULL AND q.id <> v_p.id AND qt.footprint = 'prop'
    AND q.x BETWEEN v_p.x - 1 AND v_p.x + 1 AND q.z BETWEEN v_p.z - 1 AND v_p.z + 1
    AND (q.px - v_p.px) ^ 2 + (q.pz - v_p.pz) ^ 2 < (qt.radius + v_r) ^ 2;
  IF FOUND THEN
    RETURN 'prop_overlap';
  END IF;
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.league_prop_problem(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ─── apply_league_city_ops, catalog-driven and anchored ────
-- Same contract as 141, except:
--   {op:"init", h}                              system, first op only (was size)
--   {op:"place", ..., props?, locked?}          props: object (validated by the
--                                               route); locked: system only
--   {op:"set_props", id, props}                 replace an object's props ({} clears)
-- Type rules come from league_item_types: footprint lot needs x/z, prop and
-- air take px/pz (a prop may still land at a lot's center from x/z);
-- system_only types are refused from an actor ('system_only'); per-city
-- limits (shared by limit_group) are checked after the batch
-- ('limit_reached'). Ops from an actor on a locked object raise 'locked'.
-- Bounds: x in [-h, h], z in [-2h+1, 0]; growth adds 1 to h. Returns h.
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
  c_start_h constant int := 6;
  c_max_h   constant int := 20;
  c_max_ops constant int := 200;
  c_max_bytes   constant int := 65536;
  c_max_objects constant int := 4000;
  c_max_props   constant int := 2048;
  c_grow_at constant numeric := 0.7;
  c_lot     constant double precision := 48;
  v_system   boolean := p_actor_id IS NULL;
  v_h        int;
  v_version  bigint;
  v_n        int;
  v_i        int;
  v_op       jsonb;
  v_kind     text;
  v_type     text;
  v_t        record;
  v_id       uuid;
  v_dev      bigint;
  v_x        int;
  v_z        int;
  v_px       double precision;
  v_pz       double precision;
  v_rot      int;
  v_props    jsonb;
  v_locked   boolean;
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
  IF octet_length(p_ops::text) > c_max_bytes THEN
    RAISE EXCEPTION 'payload_too_large';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('league_city:' || p_league_id::text, 0));

  PERFORM 1 FROM public.leagues WHERE id = p_league_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  SELECT c.h, c.version INTO v_h, v_version
  FROM public.league_cities c WHERE c.league_id = p_league_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.league_cities (league_id, h, version) VALUES (p_league_id, c_start_h, 0);
    v_h := c_start_h;
    v_version := 0;
  END IF;

  IF v_n = 0 THEN
    RETURN jsonb_build_object('version', v_version, 'h', v_h, 'objects_changed', 0, 'unplaced', '[]'::jsonb);
  END IF;

  FOR v_i IN 0 .. v_n - 1 LOOP
    v_op := p_ops -> v_i;
    IF jsonb_typeof(v_op) <> 'object' THEN
      RAISE EXCEPTION 'invalid_op';
    END IF;

    v_x := NULL; v_z := NULL; v_px := NULL; v_pz := NULL; v_rot := NULL; v_id := NULL; v_dev := NULL;
    v_props := NULL; v_locked := false;
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
    IF v_op ? 'props' THEN
      IF jsonb_typeof(v_op -> 'props') <> 'object' THEN
        RAISE EXCEPTION 'invalid_op';
      END IF;
      v_props := v_op -> 'props';
      IF pg_column_size(v_props) > c_max_props THEN
        RAISE EXCEPTION 'props_too_large';
      END IF;
      IF v_props = '{}'::jsonb THEN
        v_props := NULL;
      END IF;
    END IF;
    IF v_op ? 'locked' THEN
      IF jsonb_typeof(v_op -> 'locked') <> 'boolean' OR NOT v_system THEN
        RAISE EXCEPTION 'invalid_op';
      END IF;
      v_locked := (v_op ->> 'locked')::boolean;
    END IF;

    -- Ops that name an existing object: an actor may not touch a locked one.
    IF v_id IS NOT NULL AND NOT v_system AND (v_op ->> 'op') IN ('move', 'rotate', 'remove', 'set_props') THEN
      PERFORM 1 FROM public.league_objects o WHERE o.id = v_id AND o.league_id = p_league_id AND o.locked;
      IF FOUND THEN
        RAISE EXCEPTION 'locked';
      END IF;
    END IF;

    CASE v_op ->> 'op'

    WHEN 'init' THEN
      IF NOT v_system OR v_i <> 0 THEN
        RAISE EXCEPTION 'invalid_op';
      END IF;
      IF v_version > 0 THEN
        RETURN jsonb_build_object('version', v_version, 'h', v_h, 'objects_changed', 0,
                                  'unplaced', '[]'::jsonb, 'skipped', true);
      END IF;
      IF jsonb_typeof(v_op -> 'h') <> 'number' OR (v_op ->> 'h')::numeric % 1 <> 0 THEN
        RAISE EXCEPTION 'invalid_op';
      END IF;
      v_h := (v_op ->> 'h')::int;
      IF v_h < c_start_h OR v_h > c_max_h THEN
        RAISE EXCEPTION 'invalid_op';
      END IF;

    WHEN 'place' THEN
      v_kind := v_op ->> 'kind';
      IF v_kind = 'item' THEN
        v_type := v_op ->> 'item_type';
        SELECT t.footprint, t.system_only INTO v_t FROM public.league_item_types t WHERE t.item_type = v_type;
        IF v_type IS NULL OR NOT FOUND THEN
          RAISE EXCEPTION 'invalid_op';
        END IF;
        IF v_t.system_only AND NOT v_system THEN
          RAISE EXCEPTION 'system_only';
        END IF;
        IF v_t.footprint = 'lot' THEN
          -- Owns a lot, quarter turns.
          IF v_x IS NULL OR v_px IS NOT NULL OR COALESCE(v_rot, 0) % 90 <> 0 THEN
            RAISE EXCEPTION 'invalid_op';
          END IF;
          IF v_x < -v_h OR v_x > v_h OR v_z < -2 * v_h + 1 OR v_z > 0 THEN
            RAISE EXCEPTION 'out_of_bounds';
          END IF;
          INSERT INTO public.league_objects (id, league_id, kind, item_type, x, z, rot, props, locked)
          VALUES (COALESCE(v_id, gen_random_uuid()), p_league_id, 'item', v_type, v_x, v_z, COALESCE(v_rot, 0), v_props, v_locked);
          v_touched := v_touched || ARRAY[v_x, v_z];
        ELSE
          -- Prop or air: free position; its lot is the one under its center.
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
          INSERT INTO public.league_objects (id, league_id, kind, item_type, x, z, px, pz, rot, props, locked)
          VALUES (COALESCE(v_id, gen_random_uuid()), p_league_id, 'item', v_type, v_x, v_z, v_px, v_pz, COALESCE(v_rot, 0), v_props, v_locked);
          v_touched := v_touched || ARRAY[v_x, v_z];
        END IF;
      ELSIF v_kind = 'building' THEN
        IF v_dev IS NULL OR v_x IS NULL OR COALESCE(v_rot, 0) % 90 <> 0 OR v_props IS NOT NULL THEN
          RAISE EXCEPTION 'invalid_op';
        END IF;
        IF v_x < -v_h OR v_x > v_h OR v_z < -2 * v_h + 1 OR v_z > 0 THEN
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
        IF v_x < -v_h OR v_x > v_h OR v_z < -2 * v_h + 1 OR v_z > 0 THEN
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

    WHEN 'set_props' THEN
      IF v_id IS NULL OR NOT (v_op ? 'props') THEN
        RAISE EXCEPTION 'invalid_op';
      END IF;
      UPDATE public.league_objects o SET props = v_props, updated_at = now()
      WHERE o.id = v_id AND o.league_id = p_league_id AND o.kind = 'item';
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows = 0 THEN
        RAISE EXCEPTION 'not_found';
      END IF;
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
        -- Nearest free lot (no lot object, no ground prop reaching into it)
        -- to the entrance that touches a road, else the nearest free lot,
        -- else grow.
        LOOP
          WITH occ AS (
            SELECT o.x, o.z, o.item_type FROM public.league_objects o WHERE o.league_id = p_league_id AND o.px IS NULL
          ), props AS (
            SELECT o.px, o.pz, t.radius AS r
            FROM public.league_objects o JOIN public.league_item_types t ON t.item_type = o.item_type
            WHERE o.league_id = p_league_id AND o.px IS NOT NULL AND t.footprint = 'prop'
          ), lots AS (
            SELECT gx, gz
            FROM generate_series(-v_h, v_h) AS gx
            CROSS JOIN generate_series(-2 * v_h + 1, 0) AS gz
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
          IF v_h >= c_max_h THEN
            v_unplaced := v_unplaced || v_dev;
            v_x := NULL;
            EXIT;
          END IF;
          v_h := v_h + 1;
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

  -- Footprint shape: lot types own a lot, prop and air types stand at px/pz.
  PERFORM 1 FROM public.league_objects o JOIN public.league_item_types t ON t.item_type = o.item_type
  WHERE o.league_id = p_league_id AND (t.footprint = 'lot') <> (o.px IS NULL)
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'invalid_op';
  END IF;

  -- Per-city limits, shared across a limit group.
  PERFORM 1
  FROM public.league_objects o JOIN public.league_item_types t ON t.item_type = o.item_type
  WHERE o.league_id = p_league_id AND t.max_per_city IS NOT NULL
  GROUP BY COALESCE(t.limit_group, t.item_type)
  HAVING count(*) > min(t.max_per_city)
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'limit_reached';
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

  IF (SELECT count(*) FROM public.league_objects o WHERE o.league_id = p_league_id) > c_max_objects THEN
    RAISE EXCEPTION 'city_full';
  END IF;

  SELECT count(*) INTO v_count FROM public.league_objects o WHERE o.league_id = p_league_id AND o.px IS NULL;
  WHILE v_count > c_grow_at * (2 * v_h + 1) * (2 * v_h) AND v_h < c_max_h LOOP
    v_h := v_h + 1;
  END LOOP;

  PERFORM public.record_town_milestones(p_league_id);

  v_version := v_version + 1;
  UPDATE public.league_cities
  SET h = v_h, version = v_version, updated_at = now()
  WHERE league_id = p_league_id;

  INSERT INTO public.league_city_ops (league_id, version, actor_id, ops)
  VALUES (p_league_id, v_version, p_actor_id, (
    SELECT COALESCE(jsonb_agg(
      (SELECT COALESCE(jsonb_object_agg(k, e -> k), '{}'::jsonb)
       FROM unnest(ARRAY['op', 'kind', 'item_type', 'developer_id', 'id', 'x', 'z', 'px', 'pz', 'rot', 'h', 'props', 'locked']) AS k
       WHERE e ? k)
      ORDER BY i), '[]'::jsonb)
    FROM jsonb_array_elements(p_ops) WITH ORDINALITY AS t(e, i)
  ));

  RETURN jsonb_build_object(
    'version', v_version,
    'h', v_h,
    'objects_changed', v_changed,
    'unplaced', to_jsonb(v_unplaced)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_league_city_ops(uuid, bigint, jsonb) FROM PUBLIC, anon, authenticated;

-- ─── apply_league_city_ops_admin_by_id, anchored ───────────
-- 134's body with h: expand adds 1 to h (a column east and west, two rows
-- north), shrink removes the same; the entrance row never moves. A shrink is
-- refused when anything stands on the strips that would go (locked objects
-- included), or when the smaller city would be too full.
CREATE OR REPLACE FUNCTION public.apply_league_city_ops_admin_by_id(
  p_slug   text,
  p_dev_id bigint,
  p_ops    jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  c_max_batches constant int := 120;
  c_window      constant interval := interval '10 minutes';
  c_min_h       constant int := 6;
  c_max_h       constant int := 20;
  c_lot         constant double precision := 48;
  v_league  uuid;
  v_admin   bigint;
  v_dev     bigint;
  v_count   int;
  v_expands int;
  v_shrinks int;
  v_rest    jsonb;
  v_h       int;
  v_version bigint;
  v_result  jsonb;
BEGIN
  IF p_ops IS NULL OR jsonb_typeof(p_ops) <> 'array' THEN
    RAISE EXCEPTION 'invalid_op';
  END IF;
  IF octet_length(p_ops::text) > 65536 THEN
    RAISE EXCEPTION 'payload_too_large';
  END IF;

  SELECT l.id, l.admin_id INTO v_league, v_admin FROM public.leagues l WHERE l.slug = lower(p_slug);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'league_not_found';
  END IF;

  v_dev := p_dev_id;
  IF v_dev IS NULL OR v_admin IS DISTINCT FROM v_dev THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  SELECT count(*) INTO v_count FROM public.league_city_ops o
  WHERE o.actor_id = v_dev AND o.at > now() - c_window;
  IF v_count >= c_max_batches THEN
    RAISE EXCEPTION 'rate_limit';
  END IF;

  SELECT count(*) FILTER (WHERE e ->> 'op' = 'expand'),
         count(*) FILTER (WHERE e ->> 'op' = 'shrink'),
         COALESCE(jsonb_agg(e) FILTER (WHERE e ->> 'op' IS DISTINCT FROM 'expand' AND e ->> 'op' IS DISTINCT FROM 'shrink'), '[]'::jsonb)
  INTO v_expands, v_shrinks, v_rest
  FROM jsonb_array_elements(p_ops) AS e;

  -- Same lock as apply_league_city_ops (re-entrant within the transaction).
  IF v_expands > 0 OR v_shrinks > 0 THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('league_city:' || v_league::text, 0));
  END IF;

  IF v_expands > 0 THEN
    UPDATE public.league_cities c
    SET h = least(c_max_h, c.h + v_expands), version = c.version + 1, updated_at = now()
    WHERE c.league_id = v_league
    RETURNING c.h, c.version INTO v_h, v_version;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'not_found';
    END IF;
    INSERT INTO public.league_city_ops (league_id, version, actor_id, ops)
    VALUES (v_league, v_version, v_dev, jsonb_build_array(jsonb_build_object('op', 'expand', 'count', v_expands)));
  END IF;

  IF jsonb_array_length(v_rest) > 0 THEN
    v_result := public.apply_league_city_ops(v_league, v_dev, v_rest);
  END IF;

  IF v_shrinks > 0 THEN
    SELECT c.h INTO v_h FROM public.league_cities c WHERE c.league_id = v_league;
    v_h := greatest(c_min_h, v_h - v_shrinks);
    -- Nothing may stand outside the smaller city (ground props by their
    -- footprint, air objects by their center).
    PERFORM 1 FROM public.league_objects o
    LEFT JOIN public.league_item_types t ON t.item_type = o.item_type
    WHERE o.league_id = v_league AND (
      (o.px IS NULL AND (o.x < -v_h OR o.x > v_h OR o.z < -2 * v_h + 1 OR o.z > 0))
      OR (o.px IS NOT NULL AND (
        o.px - CASE WHEN t.footprint = 'air' THEN 0 ELSE t.radius END < (-v_h - 0.5) * c_lot
        OR o.px + CASE WHEN t.footprint = 'air' THEN 0 ELSE t.radius END > (v_h + 0.5) * c_lot
        OR o.pz - CASE WHEN t.footprint = 'air' THEN 0 ELSE t.radius END < (-2 * v_h + 1 - 0.5) * c_lot
        OR o.pz + CASE WHEN t.footprint = 'air' THEN 0 ELSE t.radius END > 0.5 * c_lot
      ))
    )
    LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'ring_not_empty';
    END IF;
    SELECT count(*) INTO v_count FROM public.league_objects o WHERE o.league_id = v_league AND o.px IS NULL;
    IF v_count > 0.7 * (2 * v_h + 1) * (2 * v_h) THEN
      RAISE EXCEPTION 'too_full';
    END IF;
    UPDATE public.league_cities c
    SET h = v_h, version = c.version + 1, updated_at = now()
    WHERE c.league_id = v_league
    RETURNING c.version INTO v_version;
    INSERT INTO public.league_city_ops (league_id, version, actor_id, ops)
    VALUES (v_league, v_version, v_dev, jsonb_build_array(jsonb_build_object('op', 'shrink', 'count', v_shrinks)));
    RETURN jsonb_build_object('version', v_version, 'h', v_h, 'objects_changed', COALESCE((v_result ->> 'objects_changed')::int, 0), 'unplaced', '[]'::jsonb);
  END IF;

  IF v_result IS NOT NULL THEN
    RETURN v_result;
  END IF;
  RETURN jsonb_build_object('version', v_version, 'h', v_h, 'objects_changed', 0, 'unplaced', '[]'::jsonb);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.apply_league_city_ops_admin_by_id(text, bigint, jsonb) FROM PUBLIC, anon, authenticated;

-- ─── 5. Entrance for existing cities ───────────────────────
-- Per city with edits:
--   a. what stands on the entrance lots (0, 0) and (0, -1) and isn't road
--      goes: surfaces are removed, buildings are removed and re-auto-placed
--      (NEW) in c;
--   b. those lots become locked roads (kept roads lock), the locked portal
--      goes up, and ground props that no longer stand next to them (on the
--      new asphalt, in the portal's way) are removed;
--   a+b are one system batch in league_city_ops (removes, then places);
--   c. the moved buildings are auto-placed through apply_league_city_ops.
-- Everything else only had its coordinates shifted above.
DO $$
DECLARE
  r        record;
  v_devs   bigint[];
  v_log    jsonb;
  v_places jsonb;
  v_bad    jsonb;
  v_ver    bigint;
  v_ops    jsonb;
BEGIN
  FOR r IN SELECT c.league_id FROM public.league_cities c WHERE c.version > 0 LOOP
    -- a.
    SELECT COALESCE(jsonb_agg(jsonb_build_object('op', 'remove', 'id', o.id)), '[]'::jsonb),
           COALESCE(array_agg(o.developer_id) FILTER (WHERE o.kind = 'building'), '{}')
    INTO v_log, v_devs
    FROM public.league_objects o
    WHERE o.league_id = r.league_id AND o.px IS NULL AND o.x = 0 AND o.z IN (0, -1)
      AND o.item_type IS DISTINCT FROM 'road';
    DELETE FROM public.league_objects o
    WHERE o.league_id = r.league_id AND o.px IS NULL AND o.x = 0 AND o.z IN (0, -1)
      AND o.item_type IS DISTINCT FROM 'road';

    -- b. Roads, then the portal.
    v_places := '[]'::jsonb;
    UPDATE public.league_objects o SET locked = true
    WHERE o.league_id = r.league_id AND o.px IS NULL AND o.x = 0 AND o.z IN (0, -1) AND o.item_type = 'road';
    WITH ins AS (
      INSERT INTO public.league_objects (league_id, kind, item_type, x, z, rot, locked)
      SELECT r.league_id, 'item', 'road', 0, e.z, 0, true
      FROM (VALUES (0), (-1)) AS e(z)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.league_objects o
        WHERE o.league_id = r.league_id AND o.px IS NULL AND o.x = 0 AND o.z = e.z
      )
      RETURNING id, z
    )
    SELECT v_places || COALESCE(jsonb_agg(jsonb_build_object('op', 'place', 'kind', 'item', 'item_type', 'road',
                                                             'x', 0, 'z', ins.z, 'id', ins.id, 'locked', true)), '[]'::jsonb)
    INTO v_places FROM ins;

    WITH ins AS (
      INSERT INTO public.league_objects (league_id, kind, item_type, x, z, px, pz, rot, locked)
      SELECT r.league_id, 'item', 'portal', 0, 0, 0, 4, 0, true
      WHERE NOT EXISTS (SELECT 1 FROM public.league_objects o WHERE o.league_id = r.league_id AND o.item_type = 'portal')
      RETURNING id
    )
    SELECT v_places || COALESCE(jsonb_agg(jsonb_build_object('op', 'place', 'kind', 'item', 'item_type', 'portal',
                                                             'px', 0, 'pz', 4, 'id', ins.id, 'locked', true)), '[]'::jsonb)
    INTO v_places FROM ins;

    -- Ground props around the entrance that no longer stand.
    SELECT COALESCE(jsonb_agg(jsonb_build_object('op', 'remove', 'id', o.id)), '[]'::jsonb) INTO v_bad
    FROM public.league_objects o
    WHERE o.league_id = r.league_id AND o.px IS NOT NULL AND NOT o.locked
      AND o.x BETWEEN -1 AND 1 AND o.z BETWEEN -2 AND 0
      AND public.league_prop_problem(r.league_id, o.id) IS NOT NULL;
    DELETE FROM public.league_objects o
    WHERE o.id IN (SELECT (e ->> 'id')::uuid FROM jsonb_array_elements(v_bad) AS e);

    v_log := v_log || v_bad || v_places;
    IF jsonb_array_length(v_log) > 0 THEN
      UPDATE public.league_cities c SET version = c.version + 1, updated_at = now()
      WHERE c.league_id = r.league_id
      RETURNING c.version INTO v_ver;
      INSERT INTO public.league_city_ops (league_id, version, actor_id, ops) VALUES (r.league_id, v_ver, NULL, v_log);
    END IF;

    -- c. Buildings that stood on the entrance come back as NEW.
    IF array_length(v_devs, 1) > 0 THEN
      SELECT jsonb_agg(jsonb_build_object('op', 'auto_place', 'developer_id', d)) INTO v_ops
      FROM unnest(v_devs) AS d
      WHERE EXISTS (
        SELECT 1 FROM public.league_members m
        WHERE m.league_id = r.league_id AND m.developer_id = d AND m.status IN ('invited', 'active')
      );
      IF v_ops IS NOT NULL THEN
        PERFORM public.apply_league_city_ops(r.league_id, NULL, v_ops);
      END IF;
    END IF;
  END LOOP;
END;
$$;

COMMIT;
