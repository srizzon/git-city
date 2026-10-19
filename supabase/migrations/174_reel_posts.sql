-- The reel factory's agenda and what each reel did on Instagram.
--
-- reel_schedule: a finished reel waiting for its slot. The reel CLI uploads
-- its mp4 (and the main reel's cover) to the private reel-uploads bucket and
-- writes the row; the reel-publish cron posts it when its time comes, through
-- the Graph API, and deletes the upload. A failed post is retried once, then
-- stays failed (the agenda shows it, an email says so).
-- reel_posts: one row per posted reel, with what made it what it was (preset,
-- hook, opening scene, length, bed, trial or main), for the weekly report.
-- reel_stats: the reel-insights cron's snapshots of each post's numbers,
-- hourly for 48h, then daily for a week; devs_placed is ours (the Brasil map's
-- importer), not Instagram's.

BEGIN;

CREATE TABLE IF NOT EXISTS public.reel_schedule (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  spec_id         text        NOT NULL UNIQUE,
  kind            text        NOT NULL CHECK (kind IN ('main', 'trial')),
  caption         text        NOT NULL DEFAULT '',
  video_path      text        NOT NULL,
  cover_path      text,
  thumb_offset_ms integer,
  scheduled_at    timestamptz NOT NULL,
  status          text        NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'publishing', 'posted', 'failed', 'cancelled')),
  attempts        smallint    NOT NULL DEFAULT 0,
  error           text,
  container_id    text,
  media_id        text,
  permalink       text,
  -- preset, hook, opening_scene, length_s, bed, cta, watch: copied to reel_posts.
  meta            jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reel_schedule_due ON public.reel_schedule (scheduled_at) WHERE status IN ('scheduled', 'publishing', 'failed');

CREATE TABLE IF NOT EXISTS public.reel_posts (
  media_id       text        PRIMARY KEY,
  spec_id        text        NOT NULL,
  kind           text        NOT NULL CHECK (kind IN ('main', 'trial')),
  permalink      text,
  preset         text,
  hook           text,
  opening_scene  text,
  length_s       numeric(5, 2),
  bed            text,
  cta            text,
  trial_strategy text,
  graduated      boolean     NOT NULL DEFAULT false,
  posted_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.reel_stats (
  media_id           text        NOT NULL REFERENCES public.reel_posts (media_id) ON DELETE CASCADE,
  taken_at           timestamptz NOT NULL DEFAULT now(),
  views              integer,
  reach              integer,
  likes              integer,
  comments           integer,
  shares             integer,
  saved              integer,
  total_interactions integer,
  avg_watch_ms       integer,
  skip_rate          numeric(5, 2),
  devs_placed        integer,
  PRIMARY KEY (media_id, taken_at)
);

-- RLS on, no public policies: only the service role reads or writes them.
ALTER TABLE public.reel_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reel_posts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reel_stats    ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reel_schedule, public.reel_posts, public.reel_stats FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reel_schedule, public.reel_posts, public.reel_stats TO service_role;

-- The uploads waiting for their slot: private, read through short signed URLs.
INSERT INTO storage.buckets (id, name, public)
VALUES ('reel-uploads', 'reel-uploads', false)
ON CONFLICT (id) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';
