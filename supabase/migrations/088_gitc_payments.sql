-- ============================================================
-- Migration 088: GITC token payments (Base chain)
-- ============================================================
-- Tracks user payments in GITC for two products:
--   - sky ads     → ad_gitc_payments
--   - pixel packs → pixel_gitc_payments
--
-- Each row maps a quote (USD price snapshot) to an on-chain
-- transfer of GITC to the project treasury.
--
-- Verification rules:
--   1. tx receipt status = success
--   2. has Transfer(from=user, to=TREASURY, value>=quoted) log
--   3. tx blockNumber >= quote.quote_block_number
--      (prevents replay of pre-existing transfers from the same wallet)
--   4. tx_hash UNIQUE across the table
-- ============================================================

-- ── Sky ads ────────────────────────────────────────────────
-- Used for both single-ad checkouts (one ad_id) and package checkouts
-- (ad_id is the first/primary ad, package_ad_ids holds the full set).
CREATE TABLE IF NOT EXISTS ad_gitc_payments (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id                    text NOT NULL REFERENCES sky_ads(id) ON DELETE CASCADE,
  package_id               text,
  package_ad_ids           text[] NOT NULL DEFAULT '{}',

  quote_id                 text UNIQUE NOT NULL,
  quote_block_number       bigint NOT NULL,
  wallet_address           text NOT NULL CHECK (wallet_address ~ '^0x[a-f0-9]{40}$'),
  treasury_address         text NOT NULL CHECK (treasury_address ~ '^0x[a-f0-9]{40}$'),
  gitc_amount_wei          numeric(78,0) NOT NULL CHECK (gitc_amount_wei > 0),
  usd_quote_cents          integer NOT NULL CHECK (usd_quote_cents > 0),
  gitc_price_usd_at_quote  numeric(40,20) NOT NULL,
  discount_bps             integer NOT NULL DEFAULT 0 CHECK (discount_bps >= 0 AND discount_bps <= 10000),

  tx_hash                  text UNIQUE,
  block_number             bigint,
  paid_amount_wei          numeric(78,0),

  status                   text NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'confirmed', 'expired', 'failed')),
  expires_at               timestamptz NOT NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  confirmed_at             timestamptz
);

CREATE INDEX IF NOT EXISTS ad_gitc_payments_status_expires_idx
  ON ad_gitc_payments (status, expires_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS ad_gitc_payments_ad_id_idx
  ON ad_gitc_payments (ad_id);

CREATE INDEX IF NOT EXISTS ad_gitc_payments_wallet_idx
  ON ad_gitc_payments (wallet_address);

ALTER TABLE ad_gitc_payments ENABLE ROW LEVEL SECURITY;
-- service-role only; no public policies

-- ── Pixel packs ────────────────────────────────────────────
-- Allow 'gitc' as a payment provider on pixel_purchases without taking a long
-- ACCESS EXCLUSIVE lock. NOT VALID makes the constraint apply only to new rows
-- immediately; VALIDATE then checks existing rows under a weaker SHARE UPDATE
-- EXCLUSIVE lock that doesn't block reads/writes.
ALTER TABLE pixel_purchases DROP CONSTRAINT IF EXISTS pixel_purchases_provider_check;
ALTER TABLE pixel_purchases
  ADD CONSTRAINT pixel_purchases_provider_check
  CHECK (provider IN ('stripe', 'abacatepay', 'gitc')) NOT VALID;
ALTER TABLE pixel_purchases VALIDATE CONSTRAINT pixel_purchases_provider_check;

ALTER TABLE pixel_purchases DROP CONSTRAINT IF EXISTS pixel_purchases_currency_check;
ALTER TABLE pixel_purchases
  ADD CONSTRAINT pixel_purchases_currency_check
  CHECK (currency IN ('usd', 'brl', 'gitc')) NOT VALID;
ALTER TABLE pixel_purchases VALIDATE CONSTRAINT pixel_purchases_currency_check;

CREATE TABLE IF NOT EXISTS pixel_gitc_payments (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pixel_purchase_id        uuid NOT NULL REFERENCES pixel_purchases(id) ON DELETE CASCADE,
  developer_id             bigint NOT NULL REFERENCES developers(id),
  package_id               text NOT NULL REFERENCES pixel_packages(id),

  quote_id                 text UNIQUE NOT NULL,
  quote_block_number       bigint NOT NULL,
  wallet_address           text NOT NULL CHECK (wallet_address ~ '^0x[a-f0-9]{40}$'),
  treasury_address         text NOT NULL CHECK (treasury_address ~ '^0x[a-f0-9]{40}$'),
  gitc_amount_wei          numeric(78,0) NOT NULL CHECK (gitc_amount_wei > 0),
  usd_quote_cents          integer NOT NULL CHECK (usd_quote_cents > 0),
  gitc_price_usd_at_quote  numeric(40,20) NOT NULL,
  discount_bps             integer NOT NULL DEFAULT 0 CHECK (discount_bps >= 0 AND discount_bps <= 10000),

  tx_hash                  text UNIQUE,
  block_number             bigint,
  paid_amount_wei          numeric(78,0),

  status                   text NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'confirmed', 'expired', 'failed')),
  expires_at               timestamptz NOT NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  confirmed_at             timestamptz
);

CREATE INDEX IF NOT EXISTS pixel_gitc_payments_status_expires_idx
  ON pixel_gitc_payments (status, expires_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS pixel_gitc_payments_dev_idx
  ON pixel_gitc_payments (developer_id);

CREATE INDEX IF NOT EXISTS pixel_gitc_payments_wallet_idx
  ON pixel_gitc_payments (wallet_address);

ALTER TABLE pixel_gitc_payments ENABLE ROW LEVEL SECURITY;
-- service-role only; no public policies
