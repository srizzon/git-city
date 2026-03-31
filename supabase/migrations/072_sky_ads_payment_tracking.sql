-- Track how much was actually paid for each ad
ALTER TABLE sky_ads
  ADD COLUMN IF NOT EXISTS amount_paid_cents INT,
  ADD COLUMN IF NOT EXISTS currency TEXT;

-- Backfill currency for existing ads that have a stripe_session_id (assume USD)
-- and pix_id (always BRL). amount_paid_cents can't be backfilled without querying Stripe.
UPDATE sky_ads SET currency = 'brl' WHERE pix_id IS NOT NULL AND currency IS NULL;
