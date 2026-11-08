-- Comment-to-DM by keyword (ig-keyword-dm.ts): a comment with a campaign's word
-- ("hack" on the Hack Brasil reels) gets a private reply with a button, and the
-- tap gets the link. One row a comment: the claim that stops the webhook and
-- the cron from sending twice, the hour's count against the cap, and the tap.
-- Server only (admin client), so no policies.

CREATE TABLE IF NOT EXISTS public.ig_keyword_dms (
  comment_id   text PRIMARY KEY,
  keyword      text NOT NULL,
  media_id     text NOT NULL,
  ig_user      text,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'skipped')),
  sent_at      timestamptz,
  link_sent_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ig_keyword_dms_sent_idx ON public.ig_keyword_dms (sent_at) WHERE status = 'sent';
CREATE INDEX IF NOT EXISTS ig_keyword_dms_pending_idx ON public.ig_keyword_dms (created_at) WHERE status = 'pending';

ALTER TABLE public.ig_keyword_dms ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ig_keyword_dms FROM anon, authenticated;
