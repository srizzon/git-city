-- A comment that puts someone on the Brasil map gets a DM instead of a public
-- reply (brasil-dm.ts): a private reply with a "Ver meu prédio" button, then the
-- link when they tap it. dm_status: 'sent', 'skipped' (that account already
-- got one) or 'failed'; dm_sent_at when it went; link_sent_at when the tap got
-- the link. The queue is the "added" comments with no dm_status yet.

ALTER TABLE public.brasil_comments ADD COLUMN IF NOT EXISTS dm_status text CHECK (dm_status IN ('sent', 'skipped', 'failed'));
ALTER TABLE public.brasil_comments ADD COLUMN IF NOT EXISTS dm_sent_at timestamptz;
ALTER TABLE public.brasil_comments ADD COLUMN IF NOT EXISTS link_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS brasil_comments_dm_queue ON public.brasil_comments (created_at)
  WHERE outcome = 'added' AND dm_status IS NULL AND replied_at IS NULL;
CREATE INDEX IF NOT EXISTS brasil_comments_dm_sent ON public.brasil_comments (dm_sent_at) WHERE dm_sent_at IS NOT NULL;
