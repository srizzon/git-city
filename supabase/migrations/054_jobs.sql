-- 054_jobs.sql — Git City Jobs tables

-- ── Job company profiles ──────────────────────────────────
CREATE TABLE job_company_profiles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_id uuid NOT NULL REFERENCES advertiser_accounts(id) ON DELETE CASCADE,
  name          text NOT NULL,
  slug          text NOT NULL UNIQUE,
  logo_url      text,
  website       text NOT NULL,
  description   text,
  github_org    text,
  hired_count   integer NOT NULL DEFAULT 0,
  last_dashboard_visit timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT slug_format CHECK (slug ~ '^[a-z0-9-]+$')
);

CREATE INDEX idx_job_company_profiles_advertiser ON job_company_profiles(advertiser_id);

ALTER TABLE job_company_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Companies visible to authenticated users"
  ON job_company_profiles FOR SELECT
  USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

CREATE POLICY "Service role full access to companies"
  ON job_company_profiles FOR ALL
  USING (auth.role() = 'service_role');

-- ── Job listings ──────────────────────────────────────────
CREATE TYPE job_status AS ENUM ('draft', 'pending_review', 'active', 'paused', 'filled', 'expired', 'rejected');
CREATE TYPE job_tier AS ENUM ('standard', 'featured', 'premium');
CREATE TYPE job_seniority AS ENUM ('junior', 'mid', 'senior', 'staff', 'lead');
CREATE TYPE job_contract AS ENUM ('clt', 'pj', 'contract');
CREATE TYPE job_web AS ENUM ('web2', 'web3', 'both');
CREATE TYPE job_role_type AS ENUM ('frontend', 'backend', 'fullstack', 'devops', 'mobile', 'data', 'design', 'other');

CREATE TABLE job_listings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES job_company_profiles(id) ON DELETE CASCADE,
  title           text NOT NULL,
  description     text NOT NULL,
  salary_min      integer NOT NULL CHECK (salary_min > 0),
  salary_max      integer NOT NULL CHECK (salary_max >= salary_min),
  salary_currency text NOT NULL DEFAULT 'USD',
  role_type       job_role_type NOT NULL,
  tech_stack      text[] NOT NULL DEFAULT '{}',
  seniority       job_seniority NOT NULL,
  contract_type   job_contract NOT NULL,
  web_type        job_web NOT NULL,
  apply_url       text NOT NULL,
  language        text NOT NULL DEFAULT 'en',
  language_pt_br  text,

  -- Trust badges (opt-in)
  badge_response_guaranteed boolean NOT NULL DEFAULT false,
  badge_no_ai_screening     boolean NOT NULL DEFAULT false,

  -- Status & tier
  status          job_status NOT NULL DEFAULT 'draft',
  tier            job_tier NOT NULL DEFAULT 'standard',
  rejection_reason text,

  -- Stripe
  stripe_session_id    text,
  stripe_payment_intent text,

  -- Dates
  published_at    timestamptz,
  expires_at      timestamptz,
  filled_at       timestamptz,
  paused_at       timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- Counters (denormalized for dashboard perf)
  view_count      integer NOT NULL DEFAULT 0,
  apply_count     integer NOT NULL DEFAULT 0,
  profile_count   integer NOT NULL DEFAULT 0
);

CREATE INDEX idx_job_listings_company ON job_listings(company_id);
CREATE INDEX idx_job_listings_status ON job_listings(status);
CREATE INDEX idx_job_listings_expires ON job_listings(expires_at) WHERE status = 'active';
CREATE INDEX idx_job_listings_web_type ON job_listings(web_type) WHERE status = 'active';

ALTER TABLE job_listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active listings visible to authenticated users"
  ON job_listings FOR SELECT
  USING (
    (status = 'active' AND auth.role() = 'authenticated')
    OR auth.role() = 'service_role'
  );

CREATE POLICY "Service role full access to listings"
  ON job_listings FOR ALL
  USING (auth.role() = 'service_role');

-- ── Career profiles ───────────────────────────────────────
CREATE TABLE career_profiles (
  id              bigint PRIMARY KEY,  -- same as developer.id
  skills          text[] NOT NULL DEFAULT '{}',
  seniority       job_seniority NOT NULL,
  years_experience integer,
  bio             text NOT NULL,
  web_type        job_web NOT NULL DEFAULT 'both',
  contract_type   job_contract[] NOT NULL DEFAULT '{}',
  salary_min      integer,
  salary_max      integer,
  salary_currency text DEFAULT 'USD',
  salary_visible  boolean NOT NULL DEFAULT false,
  languages       text[] NOT NULL DEFAULT '{}',
  timezone        text,
  link_portfolio  text,
  link_linkedin   text,
  link_website    text,
  open_to_work    boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE career_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own profile readable by owner"
  ON career_profiles FOR SELECT
  USING (auth.role() = 'service_role' OR id = (
    SELECT d.id FROM developers d WHERE d.claimed_by = auth.uid() LIMIT 1
  ));

CREATE POLICY "Service role full access to career profiles"
  ON career_profiles FOR ALL
  USING (auth.role() = 'service_role');

-- ── Job applications (tracking clicks) ────────────────────
CREATE TABLE job_applications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id  uuid NOT NULL REFERENCES job_listings(id) ON DELETE CASCADE,
  developer_id bigint NOT NULL,
  has_profile  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(listing_id, developer_id)
);

CREATE INDEX idx_job_applications_listing ON job_applications(listing_id);
CREATE INDEX idx_job_applications_developer ON job_applications(developer_id);

ALTER TABLE job_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Devs can see own applications"
  ON job_applications FOR SELECT
  USING (auth.role() = 'service_role' OR developer_id = (
    SELECT d.id FROM developers d WHERE d.claimed_by = auth.uid() LIMIT 1
  ));

CREATE POLICY "Service role full access to applications"
  ON job_applications FOR ALL
  USING (auth.role() = 'service_role');

-- ── Job reports ───────────────────────────────────────────
CREATE TABLE job_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id  uuid NOT NULL REFERENCES job_listings(id) ON DELETE CASCADE,
  developer_id bigint NOT NULL,
  reason      text NOT NULL,
  details     text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(listing_id, developer_id)
);

ALTER TABLE job_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to reports"
  ON job_reports FOR ALL
  USING (auth.role() = 'service_role');

-- ── Job referrals ─────────────────────────────────────────
CREATE TABLE job_referrals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_dev_id bigint NOT NULL,
  advertiser_id   uuid REFERENCES advertiser_accounts(id) ON DELETE SET NULL,
  referral_code   text NOT NULL UNIQUE,
  converted       boolean NOT NULL DEFAULT false,
  converted_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_job_referrals_code ON job_referrals(referral_code);
CREATE INDEX idx_job_referrals_referrer ON job_referrals(referrer_dev_id);

ALTER TABLE job_referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to referrals"
  ON job_referrals FOR ALL
  USING (auth.role() = 'service_role');

-- ── Job listing view events (for analytics) ───────────────
CREATE TABLE job_listing_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id  uuid NOT NULL REFERENCES job_listings(id) ON DELETE CASCADE,
  event_type  text NOT NULL CHECK (event_type IN ('view', 'apply_click', 'profile_copy', 'save')),
  developer_id bigint,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_job_listing_events_listing ON job_listing_events(listing_id);
CREATE INDEX idx_job_listing_events_type ON job_listing_events(listing_id, event_type);

ALTER TABLE job_listing_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to events"
  ON job_listing_events FOR ALL
  USING (auth.role() = 'service_role');

-- ── Job notification signups (empty state "notify me") ────
CREATE TABLE job_notification_signups (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id bigint NOT NULL UNIQUE,
  email        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE job_notification_signups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to notification signups"
  ON job_notification_signups FOR ALL
  USING (auth.role() = 'service_role');

-- ── Auto-update triggers ──────────────────────────────────
CREATE OR REPLACE FUNCTION update_job_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_job_listings_updated
  BEFORE UPDATE ON job_listings
  FOR EACH ROW EXECUTE FUNCTION update_job_updated_at();

CREATE TRIGGER trg_career_profiles_updated
  BEFORE UPDATE ON career_profiles
  FOR EACH ROW EXECUTE FUNCTION update_job_updated_at();

CREATE TRIGGER trg_job_company_profiles_updated
  BEFORE UPDATE ON job_company_profiles
  FOR EACH ROW EXECUTE FUNCTION update_job_updated_at();
