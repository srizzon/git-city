-- 061_expand_job_enums.sql
-- Expand role_type and seniority enums with industry-standard options

-- ─── Expand role types ───
ALTER TYPE job_role_type ADD VALUE IF NOT EXISTS 'cloud';
ALTER TYPE job_role_type ADD VALUE IF NOT EXISTS 'security';
ALTER TYPE job_role_type ADD VALUE IF NOT EXISTS 'qa';
ALTER TYPE job_role_type ADD VALUE IF NOT EXISTS 'ai_ml';
ALTER TYPE job_role_type ADD VALUE IF NOT EXISTS 'blockchain';
ALTER TYPE job_role_type ADD VALUE IF NOT EXISTS 'embedded';
ALTER TYPE job_role_type ADD VALUE IF NOT EXISTS 'sre';
ALTER TYPE job_role_type ADD VALUE IF NOT EXISTS 'gamedev';
ALTER TYPE job_role_type ADD VALUE IF NOT EXISTS 'engineering_manager';

-- ─── Expand seniority levels ───
ALTER TYPE job_seniority ADD VALUE IF NOT EXISTS 'intern';
ALTER TYPE job_seniority ADD VALUE IF NOT EXISTS 'principal';
ALTER TYPE job_seniority ADD VALUE IF NOT EXISTS 'director';

-- ─── Expand contract types ───
ALTER TYPE job_contract ADD VALUE IF NOT EXISTS 'fulltime';
ALTER TYPE job_contract ADD VALUE IF NOT EXISTS 'parttime';
ALTER TYPE job_contract ADD VALUE IF NOT EXISTS 'freelance';
ALTER TYPE job_contract ADD VALUE IF NOT EXISTS 'internship';
