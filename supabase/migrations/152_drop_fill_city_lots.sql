-- ─── City lots: drop the unused fill ───────────────────────
-- fill_city_lots (148) built its waiting list by scanning developers and
-- timed out on prod; the snapshot cron uses fill_city_lots_for (149) instead.
-- Nothing calls it.

BEGIN;

DROP FUNCTION IF EXISTS public.fill_city_lots(int);

COMMIT;
