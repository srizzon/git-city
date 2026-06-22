-- Current-calendar-year contribution split for the rolling building-refresh cron
-- (/api/cron/refresh-buildings).
--
-- Past calendar years are immutable, so a refresh only needs the current year.
-- We store that mutable slice separately so the cron can update just the current
-- year and keep contributions_total accurate, instead of refetching all 10 years
-- for every dev (which 502s when batched on GitHub's side).
--
--   contributions_total = (immutable prior years) + contributions_cy
--   prior years         = contributions_total - contributions_cy
--
-- A row is "split-ready" when contributions_cy_year = the current calendar year;
-- otherwise (legacy rows, or after a year rollover) the cron does one full
-- 10-year fetch to re-establish the split.

ALTER TABLE developers
  ADD COLUMN IF NOT EXISTS contributions_cy int DEFAULT 0;

ALTER TABLE developers
  ADD COLUMN IF NOT EXISTS contributions_cy_year int;

COMMENT ON COLUMN developers.contributions_cy IS
  'Current calendar year''s contribution count — the mutable part of contributions_total. Refreshed frequently by the building-refresh cron.';
COMMENT ON COLUMN developers.contributions_cy_year IS
  'Calendar year that contributions_cy represents. When this is not the current year, the row needs a full reseed before the cheap incremental refresh applies.';
