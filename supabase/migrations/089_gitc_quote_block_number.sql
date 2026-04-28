-- ============================================================
-- Migration 089: Add quote_block_number to GITC payment tables
-- ============================================================
-- Companion to migration 088. Adds the anti-replay column for
-- environments that applied 088 before this column was added
-- to that file. Idempotent (uses IF NOT EXISTS).
-- ============================================================

ALTER TABLE ad_gitc_payments
  ADD COLUMN IF NOT EXISTS quote_block_number bigint NOT NULL DEFAULT 0;

ALTER TABLE pixel_gitc_payments
  ADD COLUMN IF NOT EXISTS quote_block_number bigint NOT NULL DEFAULT 0;
