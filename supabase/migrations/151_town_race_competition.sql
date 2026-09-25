-- ─── Town race track: ghosts, the weekly board, who you passed ──
-- The competition around the lap board (migration 150):
-- - town_race_ghosts: the path of each driver's best lap, so anyone can race
--   it (the rival ghost). Saved only with the receipt of the lap it belongs to.
-- - town_race_week_laps: best lap per driver per week (Monday 00:00 UTC), the
--   weekly season. Last week's fastest is the week's winner.
-- - record_town_race_lap: record_town_lap plus the week and the drivers this
--   lap passed on the all-time board, so the site can tell them.

BEGIN;

CREATE TABLE IF NOT EXISTS public.town_race_ghosts (
  league_id    uuid   NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  track        text   NOT NULL CHECK (track ~ '^[a-z0-9-]{1,32}$'),
  developer_id bigint NOT NULL REFERENCES public.developers(id) ON DELETE CASCADE,
  ms           int    NOT NULL CHECK (ms > 0 AND ms < 3600000),
  -- {splits: int[], frames: number[]} (lib/league-city/race/ghost.ts); the API caps its size.
  ghost        jsonb  NOT NULL,
  set_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (league_id, track, developer_id)
);

CREATE TABLE IF NOT EXISTS public.town_race_week_laps (
  league_id    uuid   NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  track        text   NOT NULL CHECK (track ~ '^[a-z0-9-]{1,32}$'),
  week         date   NOT NULL,
  developer_id bigint NOT NULL REFERENCES public.developers(id) ON DELETE CASCADE,
  best_ms      int    NOT NULL CHECK (best_ms > 0 AND best_ms < 3600000),
  set_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (league_id, track, week, developer_id)
);
CREATE INDEX IF NOT EXISTS idx_town_race_week_board ON public.town_race_week_laps (league_id, track, week, best_ms);

-- RLS on, no public policies: reads and writes go through the service role.
ALTER TABLE public.town_race_ghosts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.town_race_week_laps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.town_race_ghosts FROM anon, authenticated;
REVOKE ALL ON public.town_race_week_laps FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.town_race_ghosts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.town_race_week_laps TO service_role;

-- ─── record_town_race_lap ──────────────────────────────────
-- Counts a valid lap on the all-time board and this week's, keeping each best.
-- Returns both bests, whether this lap set them, both ranks, and up to three
-- drivers it passed on the all-time board (closest first), only when it
-- improved your best.
CREATE OR REPLACE FUNCTION public.record_town_race_lap(
  p_league_id uuid,
  p_track     text,
  p_dev_id    bigint,
  p_ms        int,
  p_week      date
) RETURNS TABLE (
  best_ms       int,
  improved      boolean,
  rank          int,
  week_best_ms  int,
  week_improved boolean,
  week_rank     int,
  passed        bigint[]
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_prev      int;
  v_best      int;
  v_week_prev int;
  v_week_best int;
  v_passed    bigint[] := '{}';
BEGIN
  SELECT l.best_ms INTO v_prev
  FROM public.town_race_laps l
  WHERE l.league_id = p_league_id AND l.track = p_track AND l.developer_id = p_dev_id
  FOR UPDATE;

  INSERT INTO public.town_race_laps AS l (league_id, track, developer_id, best_ms)
  VALUES (p_league_id, p_track, p_dev_id, p_ms)
  ON CONFLICT (league_id, track, developer_id) DO UPDATE
    SET laps    = l.laps + 1,
        best_ms = LEAST(l.best_ms, EXCLUDED.best_ms),
        set_at  = CASE WHEN EXCLUDED.best_ms < l.best_ms THEN now() ELSE l.set_at END
  RETURNING l.best_ms INTO v_best;

  SELECT w.best_ms INTO v_week_prev
  FROM public.town_race_week_laps w
  WHERE w.league_id = p_league_id AND w.track = p_track AND w.week = p_week AND w.developer_id = p_dev_id
  FOR UPDATE;

  INSERT INTO public.town_race_week_laps AS w (league_id, track, week, developer_id, best_ms)
  VALUES (p_league_id, p_track, p_week, p_dev_id, p_ms)
  ON CONFLICT (league_id, track, week, developer_id) DO UPDATE
    SET best_ms = LEAST(w.best_ms, EXCLUDED.best_ms),
        set_at  = CASE WHEN EXCLUDED.best_ms < w.best_ms THEN now() ELSE w.set_at END
  RETURNING w.best_ms INTO v_week_best;

  IF v_prev IS NULL OR p_ms < v_prev THEN
    SELECT coalesce(array_agg(o.developer_id ORDER BY o.best_ms), '{}') INTO v_passed
    FROM (
      SELECT o.developer_id, o.best_ms
      FROM public.town_race_laps o
      WHERE o.league_id = p_league_id AND o.track = p_track AND o.developer_id <> p_dev_id
        AND o.best_ms > v_best AND (v_prev IS NULL OR o.best_ms <= v_prev)
      ORDER BY o.best_ms
      LIMIT 3
    ) o;
  END IF;

  RETURN QUERY
  SELECT v_best,
         (v_prev IS NULL OR p_ms < v_prev),
         (SELECT count(*)::int + 1 FROM public.town_race_laps o
          WHERE o.league_id = p_league_id AND o.track = p_track AND o.best_ms < v_best),
         v_week_best,
         (v_week_prev IS NULL OR p_ms < v_week_prev),
         (SELECT count(*)::int + 1 FROM public.town_race_week_laps o
          WHERE o.league_id = p_league_id AND o.track = p_track AND o.week = p_week AND o.best_ms < v_week_best),
         v_passed;
END;
$$;

REVOKE ALL ON FUNCTION public.record_town_race_lap(uuid, text, bigint, int, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_town_race_lap(uuid, text, bigint, int, date) TO service_role;

COMMIT;
