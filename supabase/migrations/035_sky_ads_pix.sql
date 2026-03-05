-- Add pix_id column for AbacatePay sky ad purchases
ALTER TABLE sky_ads ADD COLUMN IF NOT EXISTS pix_id TEXT;
