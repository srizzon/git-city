-- Queue for batching application notification emails to companies.
-- The flush cron groups by listing_id and sends one digest per listing.
CREATE TABLE IF NOT EXISTS job_application_email_queue (
  id BIGSERIAL PRIMARY KEY,
  listing_id UUID NOT NULL REFERENCES job_listings(id) ON DELETE CASCADE,
  developer_login TEXT NOT NULL,
  has_profile BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_app_email_queue_pending
  ON job_application_email_queue (created_at);
