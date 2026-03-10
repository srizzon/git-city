-- Store VS Code API key in plaintext so users can retrieve it
-- The hash column is kept for fast lookup during heartbeat auth
ALTER TABLE developers ADD COLUMN IF NOT EXISTS vscode_api_key TEXT;
