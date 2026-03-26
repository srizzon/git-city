-- Security hardening for Live Presence
-- ======================================

-- 1. Hash API keys at rest (C1)
-- Rename plaintext column, add hashed column
ALTER TABLE developers ADD COLUMN IF NOT EXISTS vscode_api_key_hash TEXT UNIQUE;
CREATE INDEX IF NOT EXISTS idx_developers_vscode_api_key_hash
  ON developers(vscode_api_key_hash) WHERE vscode_api_key_hash IS NOT NULL;

-- Migrate existing plaintext keys to hashed (SHA-256)
UPDATE developers
  SET vscode_api_key_hash = encode(sha256(vscode_api_key::bytea), 'hex')
  WHERE vscode_api_key IS NOT NULL AND vscode_api_key_hash IS NULL;

-- Drop plaintext column and old index
DROP INDEX IF EXISTS idx_developers_vscode_api_key;
ALTER TABLE developers DROP COLUMN IF EXISTS vscode_api_key;

-- 2. Restrict RLS on developer_sessions (M3)
-- Drop overly permissive public read policy
DROP POLICY IF EXISTS "Public read sessions" ON developer_sessions;

-- Only allow reading non-sensitive columns via the service role
-- (all reads go through the API layer which filters appropriately)
CREATE POLICY "No direct public read" ON developer_sessions
  FOR SELECT USING (false);
