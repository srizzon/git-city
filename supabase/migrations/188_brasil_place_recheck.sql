-- A slow pass over the residents a comment put on the map with no city picked
-- (state only, or before every city existed): their comment is read again with
-- today's reader, and whoever named a city moves there (brasil-recheck.ts).
-- place_recheck says what the pass did with that comment ('moved', 'same',
-- 'no_city', 'other_login', 'gone', 'skip'); null: not yet.

ALTER TABLE public.brasil_comments ADD COLUMN IF NOT EXISTS place_recheck text;
CREATE INDEX IF NOT EXISTS brasil_comments_recheck ON public.brasil_comments (created_at)
  WHERE outcome = 'added' AND place_recheck IS NULL AND developer_id IS NOT NULL;
