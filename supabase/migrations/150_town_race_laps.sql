-- ─── Town race track: best laps ────────────────────────────
-- One row per developer per town per track: their best valid lap. Laps are
-- timed by the PartyKit race server from the car's positions (checkpoints in
-- order, inside the walls, no faster than a car can go) and reach the site as
-- a signed receipt; /api/towns/[slug]/race/lap saves one only for the
-- signed-in developer it names.

BEGIN;

CREATE TABLE IF NOT EXISTS public.town_race_laps (
  league_id    uuid   NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  track        text   NOT NULL CHECK (track ~ '^[a-z0-9-]{1,32}$'),
  developer_id bigint NOT NULL REFERENCES public.developers(id) ON DELETE CASCADE,
  best_ms      int    NOT NULL CHECK (best_ms > 0 AND best_ms < 3600000),
  laps         int    NOT NULL DEFAULT 1 CHECK (laps > 0),
  set_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (league_id, track, developer_id)
);
CREATE INDEX IF NOT EXISTS idx_town_race_laps_board ON public.town_race_laps (league_id, track, best_ms);

-- RLS on, no public policies: reads and writes go through the service role.
ALTER TABLE public.town_race_laps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.town_race_laps FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.town_race_laps TO service_role;

-- ─── record_town_lap ───────────────────────────────────────
-- Counts a valid lap and keeps it when it beats the stored best.
-- Returns the best after this lap, whether this lap set it, and the rank on
-- the town's board for this track.
CREATE OR REPLACE FUNCTION public.record_town_lap(
  p_league_id uuid,
  p_track     text,
  p_dev_id    bigint,
  p_ms        int
) RETURNS TABLE (best_ms int, improved boolean, rank int)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_prev int;
  v_best int;
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

  RETURN QUERY
  SELECT v_best,
         (v_prev IS NULL OR p_ms < v_prev),
         (SELECT count(*)::int + 1 FROM public.town_race_laps o
          WHERE o.league_id = p_league_id AND o.track = p_track AND o.best_ms < v_best);
END;
$$;

REVOKE ALL ON FUNCTION public.record_town_lap(uuid, text, bigint, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_town_lap(uuid, text, bigint, int) TO service_role;

COMMIT;
