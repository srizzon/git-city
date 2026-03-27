-- 057_portfolio.sql
-- Portfolio system: projects, endorsements, experiences

-- ─── Enums ───

CREATE TYPE endorsement_status AS ENUM ('pending', 'approved', 'hidden');
CREATE TYPE endorsement_relationship AS ENUM ('worked_together', 'managed_by', 'mentored', 'open_source', 'other');

-- ─── Portfolio Projects ───

CREATE TABLE portfolio_projects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  developer_id bigint NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  description text CHECK (char_length(description) <= 500),
  role text CHECK (char_length(role) <= 100),
  tech_stack text[] DEFAULT '{}',
  image_urls text[] DEFAULT '{}',
  live_url text,
  source_url text,
  is_verified boolean DEFAULT false,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_portfolio_projects_dev ON portfolio_projects(developer_id);

ALTER TABLE portfolio_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on portfolio_projects"
  ON portfolio_projects FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Public read portfolio_projects"
  ON portfolio_projects FOR SELECT TO authenticated, anon
  USING (true);

-- ─── Portfolio Experiences ───

CREATE TABLE portfolio_experiences (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  developer_id bigint NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
  company text NOT NULL CHECK (char_length(company) BETWEEN 1 AND 120),
  role text NOT NULL CHECK (char_length(role) BETWEEN 1 AND 120),
  period text CHECK (char_length(period) <= 50),
  impact_line text CHECK (char_length(impact_line) <= 200),
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_portfolio_experiences_dev ON portfolio_experiences(developer_id);

ALTER TABLE portfolio_experiences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on portfolio_experiences"
  ON portfolio_experiences FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Public read portfolio_experiences"
  ON portfolio_experiences FOR SELECT TO authenticated, anon
  USING (true);

-- ─── Portfolio Endorsements ───

CREATE TABLE portfolio_endorsements (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  developer_id bigint NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
  endorser_id bigint NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
  skill_name text NOT NULL CHECK (char_length(skill_name) BETWEEN 1 AND 50),
  context_text text NOT NULL CHECK (char_length(context_text) BETWEEN 10 AND 280),
  relationship endorsement_relationship NOT NULL DEFAULT 'worked_together',
  status endorsement_status NOT NULL DEFAULT 'approved',
  weight numeric(3,1) DEFAULT 1.0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(developer_id, endorser_id, skill_name)
);

CREATE INDEX idx_endorsements_dev ON portfolio_endorsements(developer_id);
CREATE INDEX idx_endorsements_endorser ON portfolio_endorsements(endorser_id);
CREATE INDEX idx_endorsements_skill ON portfolio_endorsements(developer_id, skill_name) WHERE status = 'approved';

ALTER TABLE portfolio_endorsements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on portfolio_endorsements"
  ON portfolio_endorsements FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Public read approved endorsements"
  ON portfolio_endorsements FOR SELECT TO authenticated, anon
  USING (status = 'approved');

-- ─── Endorsement monthly limit RPC ───

CREATE OR REPLACE FUNCTION get_endorsements_given_this_month(p_endorser_id bigint)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT count(*)::int
  FROM portfolio_endorsements
  WHERE endorser_id = p_endorser_id
    AND created_at >= date_trunc('month', now());
$$;

-- ─── Triggers ───

CREATE TRIGGER update_portfolio_projects_updated_at
  BEFORE UPDATE ON portfolio_projects
  FOR EACH ROW EXECUTE FUNCTION update_job_updated_at();

-- ─── Achievements ───

INSERT INTO achievements (id, name, description, tier, category, threshold, reward_type, sort_order) VALUES
  ('endorser', 'Endorser', 'Give your first endorsement', 'bronze', 'social', 1, 'exclusive_badge', 910),
  ('endorsed_10', 'Recognized', 'Receive 10 endorsements', 'silver', 'social', 10, 'exclusive_badge', 911),
  ('endorsed_50', 'Well Known', 'Receive 50 endorsements', 'gold', 'social', 50, 'exclusive_badge', 912),
  ('portfolio_complete', 'Portfolio Ready', 'Add your first project to your portfolio', 'bronze', 'jobs', 1, 'exclusive_badge', 913)
ON CONFLICT (id) DO NOTHING;
