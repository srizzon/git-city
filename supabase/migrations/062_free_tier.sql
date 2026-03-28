-- 062_free_tier.sql
-- Add free tier for first-time job listings

ALTER TYPE job_tier ADD VALUE IF NOT EXISTS 'free';
