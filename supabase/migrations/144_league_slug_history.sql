-- ─── Old town addresses ────────────────────────────────────
-- When a town's slug changes, the old one lands here: /town/<old> redirects
-- to the town's current slug (query kept, so old invite links still work),
-- and no new town can take it.

BEGIN;

CREATE TABLE IF NOT EXISTS public.league_slug_history (
  slug       text PRIMARY KEY,
  league_id  uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_league_slug_history_league ON public.league_slug_history(league_id);

ALTER TABLE public.league_slug_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.league_slug_history FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.league_slug_history TO service_role;

COMMIT;
