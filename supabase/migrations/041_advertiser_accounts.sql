-- 039: Advertiser accounts, sessions, API keys, and ad linkage

-- Advertiser accounts (magic-link auth, no password)
CREATE TABLE advertiser_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

-- Magic-link sessions
CREATE TABLE advertiser_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_id UUID NOT NULL REFERENCES advertiser_accounts(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

CREATE INDEX idx_advertiser_sessions_token ON advertiser_sessions(token);

-- API keys for programmatic access
CREATE TABLE advertiser_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_id UUID NOT NULL REFERENCES advertiser_accounts(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT 'Default',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX idx_advertiser_api_keys_hash ON advertiser_api_keys(key_hash);

-- Link sky_ads to advertiser accounts
ALTER TABLE sky_ads ADD COLUMN IF NOT EXISTS advertiser_id UUID REFERENCES advertiser_accounts(id);
CREATE INDEX IF NOT EXISTS idx_sky_ads_advertiser ON sky_ads(advertiser_id);

-- Auto-create advertiser accounts from existing purchaser emails
INSERT INTO advertiser_accounts (email)
SELECT DISTINCT purchaser_email FROM sky_ads
WHERE purchaser_email IS NOT NULL
ON CONFLICT (email) DO NOTHING;

-- Link existing ads to their advertiser accounts
UPDATE sky_ads SET advertiser_id = (
  SELECT id FROM advertiser_accounts WHERE email = sky_ads.purchaser_email
) WHERE purchaser_email IS NOT NULL AND advertiser_id IS NULL;
