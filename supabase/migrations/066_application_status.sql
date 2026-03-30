-- Add hiring workflow status to job applications
ALTER TABLE job_applications
  ADD COLUMN status text NOT NULL DEFAULT 'applied'
    CHECK (status IN ('applied', 'hired')),
  ADD COLUMN status_changed_at timestamptz;

-- Index for filtering by status
CREATE INDEX idx_job_applications_status ON job_applications (listing_id, status);
