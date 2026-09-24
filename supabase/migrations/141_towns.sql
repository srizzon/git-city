-- ─── Towns ─────────────────────────────────────────────────
-- Leagues become Towns for users; the DB keeps its league_* names.
--   town_visits          qualified visits, one row per dev per town per UTC day
--   town_visits_weekly   Monday rollup, feeds Town of the week
--   town_milestones      first road, 50 objects, 100 buildings
--   league_members.created_building   the invite created the building (measurement)
--   leagues.featured_week             Town of the week (Monday of the week it's featured)
-- Plus the town_welcome earn rule and three push-only emblems.
-- apply_league_city_ops is 140's body unchanged except one call to
-- record_town_milestones before the version bump.
-- Numbered 141: 137 would sort before the applied 140.

BEGIN;

-- ─── Tables ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.town_visits (
  league_id    uuid   NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  developer_id bigint NOT NULL REFERENCES public.developers(id) ON DELETE CASCADE,
  day          date   NOT NULL,
  first_at     timestamptz NOT NULL DEFAULT now(),
  drove        boolean NOT NULL DEFAULT false,
  PRIMARY KEY (league_id, developer_id, day)
);
CREATE INDEX IF NOT EXISTS idx_town_visits_league_day ON public.town_visits(league_id, day);
CREATE INDEX IF NOT EXISTS idx_town_visits_day ON public.town_visits(day);

-- first_at breaks visitor ties in the Town of the week pick (earlier wins).
CREATE TABLE IF NOT EXISTS public.town_visits_weekly (
  league_id  uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  visitors   int  NOT NULL DEFAULT 0,
  first_at   timestamptz,
  PRIMARY KEY (league_id, week_start)
);
CREATE INDEX IF NOT EXISTS idx_town_visits_weekly_week ON public.town_visits_weekly(week_start);

CREATE TABLE IF NOT EXISTS public.town_milestones (
  league_id  uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  milestone  text NOT NULL CHECK (milestone IN ('first_road', 'objects_50', 'buildings_100')),
  reached_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (league_id, milestone)
);

ALTER TABLE public.league_members ADD COLUMN IF NOT EXISTS created_building boolean NOT NULL DEFAULT false;
ALTER TABLE public.leagues ADD COLUMN IF NOT EXISTS featured_week date;
CREATE INDEX IF NOT EXISTS idx_leagues_featured_week ON public.leagues(featured_week) WHERE featured_week IS NOT NULL;

-- RLS on, no public policies: reads go through the service role.
ALTER TABLE public.town_visits        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.town_visits_weekly ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.town_milestones    ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.town_visits, public.town_visits_weekly, public.town_milestones FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.town_visits, public.town_visits_weekly, public.town_milestones TO service_role;

-- ─── Welcome reward ────────────────────────────────────────
-- Same shape as referral (105). Once per dev through the caller's
-- idempotency key (town_welcome:{dev}).
INSERT INTO public.earn_rules (id, source, pixels, cooldown_hours, max_per_day, description) VALUES
  ('town_welcome', 'social', 25, NULL, 1, 'Joined a town through an invite')
ON CONFLICT (id) DO NOTHING;

-- ─── Emblems (push-only counters) ──────────────────────────
INSERT INTO public.emblems (id, name, description, family, tier, glyph, is_counter, milestones, criteria, xp_reward, active, sort_order) VALUES
  ('town_builder', 'Town Builder',
   'Invited devs who joined your town. The number is how many.',
   'leagues', 'bronze', 'people', true,
   '[{"count":1,"tier":"bronze"},{"count":5,"tier":"silver"},{"count":20,"tier":"gold"}]'::jsonb,
   NULL, 0, true, 41),
  ('town_of_week', 'Town of the Week',
   'Your town had the most visitors of the week. The number is how many weeks.',
   'leagues', 'gold', 'trophy', true, NULL, NULL, 0, true, 42),
  ('tourist', 'Tourist',
   'Visited other devs'' towns. The number is how many towns.',
   'leagues', 'bronze', 'star', true,
   '[{"count":5,"tier":"bronze"},{"count":25,"tier":"silver"},{"count":100,"tier":"gold"}]'::jsonb,
   NULL, 0, true, 43)
ON CONFLICT (id) DO NOTHING;

UPDATE public.emblems
SET description = 'Won a town''s weekly race. The number is how many weeks.'
WHERE id = 'league_champion';

-- ─── record_town_visit ─────────────────────────────────────
-- Inserts today's row or upgrades it to drove. Returns true only when the
-- row is new, so the caller grants visit XP and the Tourist emblem once.
CREATE OR REPLACE FUNCTION public.record_town_visit(
  p_league_id    uuid,
  p_developer_id bigint,
  p_drove        boolean
) RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_inserted boolean;
BEGIN
  INSERT INTO public.town_visits (league_id, developer_id, day, drove)
  VALUES (p_league_id, p_developer_id, (now() AT TIME ZONE 'utc')::date, COALESCE(p_drove, false))
  ON CONFLICT (league_id, developer_id, day) DO UPDATE
    SET drove = public.town_visits.drove OR EXCLUDED.drove
  RETURNING (xmax = 0) INTO v_inserted;
  RETURN v_inserted;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_town_visit(uuid, bigint, boolean) FROM PUBLIC, anon, authenticated;

-- ─── rollup_town_visits ────────────────────────────────────
-- Distinct visitors per town for the week starting p_week_start (Monday).
-- Idempotent: rerunning a week overwrites its rows.
CREATE OR REPLACE FUNCTION public.rollup_town_visits(p_week_start date)
RETURNS int
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_rows int;
BEGIN
  INSERT INTO public.town_visits_weekly (league_id, week_start, visitors, first_at)
  SELECT v.league_id, p_week_start, count(DISTINCT v.developer_id)::int, min(v.first_at)
  FROM public.town_visits v
  WHERE v.day >= p_week_start AND v.day < p_week_start + 7
  GROUP BY v.league_id
  ON CONFLICT (league_id, week_start) DO UPDATE
    SET visitors = EXCLUDED.visitors, first_at = EXCLUDED.first_at;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rollup_town_visits(date) FROM PUBLIC, anon, authenticated;

-- ─── town_visit_trend ──────────────────────────────────────
-- Distinct visitors per town over the last 7 UTC days and the 7 before.
CREATE OR REPLACE FUNCTION public.town_visit_trend()
RETURNS TABLE (league_id uuid, last7 int, prev7 int)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT v.league_id,
         count(DISTINCT v.developer_id) FILTER (WHERE v.day > (now() AT TIME ZONE 'utc')::date - 7)::int,
         count(DISTINCT v.developer_id) FILTER (WHERE v.day <= (now() AT TIME ZONE 'utc')::date - 7)::int
  FROM public.town_visits v
  WHERE v.day > (now() AT TIME ZONE 'utc')::date - 14
  GROUP BY v.league_id;
$$;

REVOKE EXECUTE ON FUNCTION public.town_visit_trend() FROM PUBLIC, anon, authenticated;

-- ─── record_town_milestones ────────────────────────────────
-- Writes each milestone the first time its threshold holds. Called at the end
-- of apply_league_city_ops, so auto-placement is covered too.
CREATE OR REPLACE FUNCTION public.record_town_milestones(p_league_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.town_milestones (league_id, milestone)
  SELECT p_league_id, m.milestone
  FROM (
    SELECT 'first_road'::text AS milestone
    WHERE EXISTS (SELECT 1 FROM public.league_objects o WHERE o.league_id = p_league_id AND o.item_type = 'road')
    UNION ALL
    SELECT 'objects_50'
    WHERE (SELECT count(*) FROM public.league_objects o WHERE o.league_id = p_league_id) >= 50
    UNION ALL
    SELECT 'buildings_100'
    WHERE (SELECT count(*) FROM public.league_objects o WHERE o.league_id = p_league_id AND o.kind = 'building') >= 100
  ) m
  ON CONFLICT (league_id, milestone) DO NOTHING;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_town_milestones(uuid) FROM PUBLIC, anon, authenticated;

-- Towns that already crossed a threshold get their milestones now.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT DISTINCT o.league_id FROM public.league_objects o LOOP
    PERFORM public.record_town_milestones(r.league_id);
  END LOOP;
END;
$$;

-- ─── apply_league_city_ops, with milestones ────────────────
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
  c_max_bytes   constant int := 65536;
  c_max_objects constant int := 4000;
  c_grow_at constant numeric := 0.7;
  c_lot     constant double precision := 48;
  c_items   constant text[] := ARRAY[
    'road', 'lamp', 'bench', 'fountain', 'plaza', 'ramp',
    'ramp_big', 'boost_pad', 'speed_bump', 'cone', 'crates', 'tire_wall',
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
  IF octet_length(p_ops::text) > c_max_bytes THEN
    RAISE EXCEPTION 'payload_too_large';
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

  IF (SELECT count(*) FROM public.league_objects o WHERE o.league_id = p_league_id) > c_max_objects THEN
    RAISE EXCEPTION 'city_full';
  END IF;

  SELECT count(*) INTO v_count FROM public.league_objects o WHERE o.league_id = p_league_id AND o.px IS NULL;
  WHILE v_count > c_grow_at * v_size * v_size AND v_size < c_max LOOP
    v_size := v_size + 2;
  END LOOP;

  PERFORM public.record_town_milestones(p_league_id);

  v_version := v_version + 1;
  UPDATE public.league_cities
  SET size = v_size, version = v_version, updated_at = now()
  WHERE league_id = p_league_id;

  INSERT INTO public.league_city_ops (league_id, version, actor_id, ops)
  VALUES (p_league_id, v_version, p_actor_id, (
    SELECT COALESCE(jsonb_agg(
      (SELECT COALESCE(jsonb_object_agg(k, e -> k), '{}'::jsonb)
       FROM unnest(ARRAY['op', 'kind', 'item_type', 'developer_id', 'id', 'x', 'z', 'px', 'pz', 'rot', 'size']) AS k
       WHERE e ? k)
      ORDER BY i), '[]'::jsonb)
    FROM jsonb_array_elements(p_ops) WITH ORDINALITY AS t(e, i)
  ));

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
