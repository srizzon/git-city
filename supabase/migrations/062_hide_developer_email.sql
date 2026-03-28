-- 062: Hide sensitive columns from public API
-- The "Public read developers" RLS policy exposes ALL columns.
-- Revoke SELECT on email fields so /rest/v1/developers no longer leaks them.

REVOKE SELECT (email, email_verified, email_updated_at, vscode_api_key_hash) ON developers FROM anon, authenticated;
