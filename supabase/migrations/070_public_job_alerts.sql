-- Public job alerts: allow anyone (with or without account) to subscribe
-- to recurring weekly job digest emails filtered by tech stack.

CREATE TABLE IF NOT EXISTS job_alert_subscriptions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email        text NOT NULL,
  tech_stack   text[] NOT NULL DEFAULT '{}',
  verified     boolean NOT NULL DEFAULT false,
  verify_token text UNIQUE,
  unsubscribe_token text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  developer_id bigint REFERENCES developers(id) ON DELETE SET NULL,
  last_sent_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Unique per email to prevent duplicates
CREATE UNIQUE INDEX idx_job_alert_subscriptions_email ON job_alert_subscriptions (lower(email));

-- For cron: find verified subscribers that haven't been emailed recently
CREATE INDEX idx_job_alert_subscriptions_pending ON job_alert_subscriptions (last_sent_at)
  WHERE verified = true;

-- RLS: service role only
ALTER TABLE job_alert_subscriptions ENABLE ROW LEVEL SECURITY;
