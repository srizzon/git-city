-- 077: Fix developers table SELECT - restore table-level grant
--
-- Migration 074 revoked table-level SELECT on developers and replaced it
-- with column-level grants to hide email/vscode_api_key columns.
-- PostgREST does NOT support column-level SELECT grants — it expands
-- select("*") to all columns, hitting "permission denied" on hidden columns.
-- This broke ALL profile pages (/dev/[username]) for 12+ hours.
--
-- Fix: restore table-level SELECT. Sensitive columns (email, vscode_api_key)
-- are already NULL in the database and are not written by the app.

GRANT SELECT ON developers TO anon, authenticated;
