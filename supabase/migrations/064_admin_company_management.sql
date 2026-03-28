-- Allow admin-created companies without an advertiser account
ALTER TABLE job_company_profiles ALTER COLUMN advertiser_id DROP NOT NULL;

-- Track who created the company (null = legacy/self-service, 'admin:<github_login>' = admin-created)
ALTER TABLE job_company_profiles ADD COLUMN IF NOT EXISTS created_by text;
