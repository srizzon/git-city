-- 058_experience_dates.sql
-- Add proper date fields to portfolio_experiences

ALTER TABLE portfolio_experiences
  ADD COLUMN start_year int,
  ADD COLUMN start_month int CHECK (start_month IS NULL OR (start_month >= 1 AND start_month <= 12)),
  ADD COLUMN end_year int,
  ADD COLUMN end_month int CHECK (end_month IS NULL OR (end_month >= 1 AND end_month <= 12)),
  ADD COLUMN is_current boolean DEFAULT false;

-- Migrate existing period text to structured dates where possible
-- (best effort, manual cleanup may be needed)
