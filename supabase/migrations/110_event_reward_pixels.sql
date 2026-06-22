-- ─── Event rewards: Pixel rail ─────────────────────────────
-- The duck boss meeting defined cash-equivalent prizes in Pixel (500/250/100
-- to the top 3), but the reward engine only ever granted items + XP — Pixel
-- was never wired in. This adds a Pixel currency reward to the engine.
--
-- Design notes:
--   • Pixels are credited INLINE here (wallets + wallet_transactions), NOT via
--     credit_pixels(). credit_pixels gates on auth.role()='service_role' (a
--     request-JWT check), which would reject the definer-chain call from
--     complete_event_wrap and break local/psql testing. grant_event_reward is
--     already the trusted, client-revoked reward primitive (it writes purchases
--     directly too), so an inline wallet credit is symmetric and safe.
--   • GUARD-RAIL: the engine knows only pixels | item_id | xp. There is NO code
--     path here that grants $GITC (the real on-chain token). Events can never
--     pay real money.
--   • Idempotent: grant_event_reward only reaches the grant body on the first
--     insert of a claim_key (replays return early). The wallet_transactions
--     idempotency_key ('evt_'||claim_key) is defense-in-depth.

BEGIN;

-- ─── Allow 'event_reward' as a wallet transaction source ──────
ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_source_check;
ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_source_check
  CHECK (source IN (
    'purchase',
    'daily_commit',
    'streak_bonus',
    'achievement',
    'city_action',
    'item_purchase',
    'refund',
    'chargeback',
    'adjustment',
    'event_reward'
  ));

-- ─── Reward claim ledger: record the Pixel amount; free the rail ──
-- pixels_amount completes the claim's reward bundle (item_id + xp_amount + pixels).
ALTER TABLE event_reward_claims ADD COLUMN IF NOT EXISTS pixels_amount int NOT NULL DEFAULT 0;
-- Tiers/rails are now fully config-driven (N rails, custom ids per event type),
-- so drop the hardcoded 3-rail CHECK. App-layer zod validates rail shape.
ALTER TABLE event_reward_claims DROP CONSTRAINT IF EXISTS event_reward_claims_rail_check;

-- ─── grant_event_reward: + Pixel rail ──────────────────────────
-- Replaces the 7-arg version (094) with an 8-arg one (p_pixels, defaulted to 0
-- for backward-compat with the still-active 108 complete_event_wrap, which is
-- itself replaced in 111). Item + XP + Pixel grant in one transaction.
DROP FUNCTION IF EXISTS grant_event_reward(uuid, bigint, text, text, text, int, text);

CREATE OR REPLACE FUNCTION grant_event_reward(
  p_event_id     uuid,
  p_developer_id bigint,
  p_rail         text,
  p_tier         text,
  p_item_id      text,
  p_xp           int,
  p_claim_key    text,
  p_pixels       int DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_new uuid;
  v_old_balance bigint;
  v_new_balance bigint;
BEGIN
  -- Serialize a single player's concurrent claims (re-entrant within a tx).
  PERFORM pg_advisory_xact_lock(p_developer_id);

  INSERT INTO event_reward_claims
    (event_id, developer_id, rail, tier, item_id, xp_amount, pixels_amount, claim_key, status)
  VALUES (p_event_id, p_developer_id, p_rail, p_tier, p_item_id,
          COALESCE(p_xp, 0), COALESCE(p_pixels, 0), p_claim_key, 'granted')
  ON CONFLICT (claim_key) DO NOTHING
  RETURNING id INTO v_new;

  IF v_new IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true);
  END IF;

  -- Grant the cosmetic (skips pre-owners via the partial unique completed idx).
  IF p_item_id IS NOT NULL AND p_item_id <> '' THEN
    INSERT INTO purchases (developer_id, item_id, provider, provider_tx_id, amount_cents, currency, status)
    SELECT p_developer_id, p_item_id, 'event', 'claim_' || p_claim_key, 0, 'usd', 'completed'
    WHERE NOT EXISTS (
      SELECT 1 FROM purchases p
      WHERE p.developer_id = p_developer_id AND p.item_id = p_item_id AND p.status = 'completed'
    )
    ON CONFLICT (provider_tx_id) DO NOTHING;
  END IF;

  -- Grant Pixels (inline wallet credit → lifetime_earned). Internal/trusted.
  IF COALESCE(p_pixels, 0) > 0 THEN
    INSERT INTO wallets (developer_id)
    VALUES (p_developer_id)
    ON CONFLICT (developer_id) DO NOTHING;

    UPDATE wallets
    SET balance = balance + p_pixels,
        lifetime_earned = lifetime_earned + p_pixels,
        updated_at = now()
    WHERE developer_id = p_developer_id
    RETURNING balance - p_pixels, balance INTO v_old_balance, v_new_balance;

    INSERT INTO wallet_transactions (
      developer_id, type, amount, source,
      reference_id, reference_type, description,
      balance_before, balance_after, idempotency_key
    ) VALUES (
      p_developer_id, 'credit', p_pixels, 'event_reward',
      p_event_id::text, 'event', 'Event reward: ' || p_rail || ' (' || p_tier || ')',
      v_old_balance, v_new_balance, 'evt_' || p_claim_key
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;

  IF COALESCE(p_xp, 0) > 0 THEN
    PERFORM grant_xp(p_developer_id, 'event_reward', p_xp);
  END IF;

  RETURN jsonb_build_object('ok', true, 'granted', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION grant_event_reward(uuid, bigint, text, text, text, int, text, int) FROM PUBLIC;

COMMIT;
