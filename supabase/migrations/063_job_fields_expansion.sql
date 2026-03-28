-- 063_job_fields_expansion.sql
-- Add location, benefits, how_to_apply, and salary_period to job listings

-- ─── Location fields ───
ALTER TABLE job_listings ADD COLUMN IF NOT EXISTS location_type text NOT NULL DEFAULT 'remote';
ALTER TABLE job_listings ADD COLUMN IF NOT EXISTS location_restriction text NOT NULL DEFAULT 'worldwide';
ALTER TABLE job_listings ADD COLUMN IF NOT EXISTS location_countries text[] DEFAULT '{}';
ALTER TABLE job_listings ADD COLUMN IF NOT EXISTS location_city text;
ALTER TABLE job_listings ADD COLUMN IF NOT EXISTS location_timezone text;

-- ─── Benefits ───
ALTER TABLE job_listings ADD COLUMN IF NOT EXISTS benefits text[] DEFAULT '{}';

-- ─── How to apply (separate from description) ───
ALTER TABLE job_listings ADD COLUMN IF NOT EXISTS how_to_apply text;

-- ─── Salary period (monthly vs annual) ───
ALTER TABLE job_listings ADD COLUMN IF NOT EXISTS salary_period text NOT NULL DEFAULT 'monthly';
