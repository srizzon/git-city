-- Track which expiry emails have been sent for job listings
ALTER TABLE job_listings ADD COLUMN IF NOT EXISTS expiry_notified TEXT;

-- Track when notify-me signups were fulfilled
ALTER TABLE job_notification_signups ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ;

-- Add job notification preference columns
ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS jobs_applications BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS jobs_performance BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS jobs_digest BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS jobs_updates BOOLEAN DEFAULT true;
