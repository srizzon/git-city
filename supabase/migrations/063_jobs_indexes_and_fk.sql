-- 063: Add missing indexes and FK for jobs tables

-- ── Performance indexes on job_listings ──
CREATE INDEX IF NOT EXISTS idx_job_listings_role_type ON job_listings(role_type) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_job_listings_seniority ON job_listings(seniority) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_job_listings_contract ON job_listings(contract_type) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_job_listings_tier ON job_listings(tier) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_job_listings_published ON job_listings(published_at DESC NULLS LAST) WHERE status = 'active';

-- ── FK on career_profiles to prevent orphaned records ──
ALTER TABLE career_profiles
  ADD CONSTRAINT career_profiles_developer_fk
  FOREIGN KEY (id) REFERENCES developers(id) ON DELETE CASCADE;
