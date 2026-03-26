-- ============================================================
-- Migration 053: Pixels — Items pricing + pixel_purchases
-- ============================================================

-- Items: add PX pricing columns
ALTER TABLE items
  ADD COLUMN price_pixels int,
  ADD COLUMN pixels_only boolean NOT NULL DEFAULT false;

-- Set PX prices: round numbers that feel like game currency, not converted cents
-- Set PX prices: round numbers that feel like game currency
-- 50 PX — Entry (simple structures)
UPDATE items SET price_pixels = 50  WHERE id IN ('helipad', 'antenna_array', 'rooftop_garden');
-- 75 PX — Small consumables
UPDATE items SET price_pixels = 75  WHERE id IN ('raid_boost_small', 'streak_freeze');
-- 100 PX — Core (basic effects + identity)
UPDATE items SET price_pixels = 100 WHERE id IN ('spotlight', 'custom_color', 'neon_outline', 'neon_trim', 'rooftop_fire', 'spire');
-- 150 PX — Mid-tier (structures + tags)
UPDATE items SET price_pixels = 150 WHERE id IN ('tag_neon', 'satellite_dish');
-- 200 PX — Premium (effects + vehicles + structures)
UPDATE items SET price_pixels = 200 WHERE id IN ('particle_aura', 'raid_drone', 'raid_boost_medium', 'pool_party', 'hologram_ring');
-- 250 PX — Billboard + LED Banner (multi-buy / faces)
UPDATE items SET price_pixels = 250 WHERE id IN ('billboard', 'led_banner');
-- 300 PX — High-tier (gold tag + crown + lightning)
UPDATE items SET price_pixels = 300 WHERE id IN ('tag_gold', 'crown_item', 'lightning_aura');
-- 400 PX — Vehicles + heavy consumables
UPDATE items SET price_pixels = 400 WHERE id IN ('raid_helicopter', 'raid_boost_large');
-- 500 PX — Top tier
UPDATE items SET price_pixels = 500 WHERE id = 'raid_rocket';
-- Free/achievement items keep price_pixels = NULL (not purchasable with PX)
-- flag, github_star, white_rabbit are earned, not bought

-- Developers: suspension flag (for chargebacks)
ALTER TABLE developers ADD COLUMN IF NOT EXISTS suspended boolean NOT NULL DEFAULT false;

-- Pixel purchase tracking (separate from item purchases)
CREATE TABLE pixel_purchases (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id    bigint NOT NULL REFERENCES developers(id),
  package_id      text NOT NULL REFERENCES pixel_packages(id),
  provider        text NOT NULL CHECK (provider IN ('stripe', 'abacatepay')),
  provider_tx_id  text UNIQUE,
  amount_cents    int NOT NULL,
  currency        text NOT NULL CHECK (currency IN ('usd', 'brl')),
  pixels_credited int NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'completed', 'expired', 'refunded')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pixel_purchases_dev ON pixel_purchases(developer_id);
CREATE INDEX idx_pixel_purchases_status ON pixel_purchases(status) WHERE status = 'pending';

ALTER TABLE pixel_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY pp_read ON pixel_purchases FOR SELECT
  USING (developer_id = (SELECT id FROM developers WHERE claimed_by = auth.uid()));
CREATE POLICY pp_service ON pixel_purchases FOR ALL
  USING (auth.role() = 'service_role');
