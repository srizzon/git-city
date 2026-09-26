-- 154: a town's cover, the picture its Discover card shows. Like Minecraft's
-- world icon: the town page photographs the city itself (cover_pinned false)
-- at most once a day when the city changed, and the admin can pin a view of
-- their own that the automatic one never replaces. The file lives in the
-- league-assets bucket under covers/<league_id>/.

ALTER TABLE public.league_cities
  ADD COLUMN IF NOT EXISTS cover_path text,
  ADD COLUMN IF NOT EXISTS cover_version bigint,
  ADD COLUMN IF NOT EXISTS cover_pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cover_at timestamptz;
