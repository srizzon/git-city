-- The Instagram account's breaker (brasil-breaker.ts): fail_streak counts the
-- sends in a row Meta refused as blocked or rate-limited; at 3 the bot stops
-- speaking until paused_until, pause_reason saying which error tripped it.

ALTER TABLE public.instagram_account ADD COLUMN IF NOT EXISTS fail_streak integer NOT NULL DEFAULT 0;
ALTER TABLE public.instagram_account ADD COLUMN IF NOT EXISTS paused_until timestamptz;
ALTER TABLE public.instagram_account ADD COLUMN IF NOT EXISTS pause_reason text;
