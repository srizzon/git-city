-- ============================================================
-- Migration 052: Pixels (PX) Virtual Currency — Core
-- Tables: wallets, wallet_transactions, pixel_packages, earn_rules
-- RPCs: credit_pixels, earn_pixels, spend_pixels, debit_pixels
-- ============================================================

-- 1. Wallets (one per developer, cached balance)
CREATE TABLE wallets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id    bigint NOT NULL UNIQUE REFERENCES developers(id) ON DELETE RESTRICT,
  balance         bigint NOT NULL DEFAULT 0
                    CHECK (balance >= 0 AND balance <= 999999999),
  lifetime_earned bigint NOT NULL DEFAULT 0,
  lifetime_bought bigint NOT NULL DEFAULT 0,
  lifetime_spent  bigint NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- 2. Wallet Transactions (immutable ledger)
CREATE TABLE wallet_transactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id    bigint NOT NULL REFERENCES developers(id) ON DELETE RESTRICT,
  type            text NOT NULL CHECK (type IN ('credit', 'debit')),
  amount          bigint NOT NULL CHECK (amount > 0 AND amount <= 1000000),
  source          text NOT NULL CHECK (source IN (
    'purchase',
    'daily_commit',
    'streak_bonus',
    'achievement',
    'city_action',
    'item_purchase',
    'refund',
    'chargeback',
    'adjustment'
  )),
  reference_id    text,
  reference_type  text,
  description     text CHECK (length(description) <= 500),
  balance_before  bigint NOT NULL,
  balance_after   bigint NOT NULL,
  idempotency_key text UNIQUE,
  ip_address      inet,
  user_agent      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wtx_developer ON wallet_transactions(developer_id, created_at DESC);
CREATE INDEX idx_wtx_source ON wallet_transactions(developer_id, source);
CREATE INDEX idx_wtx_daily_earn ON wallet_transactions(developer_id, created_at)
  WHERE type = 'credit' AND source IN ('daily_commit', 'streak_bonus', 'achievement', 'city_action');

-- 3. Immutability trigger
CREATE OR REPLACE FUNCTION prevent_ledger_mutation() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Ledger entries are immutable. Create a reversal instead.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER immutable_ledger
  BEFORE UPDATE OR DELETE ON wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION prevent_ledger_mutation();

-- 4. Pixel Packages (purchasable bundles)
CREATE TABLE pixel_packages (
  id              text PRIMARY KEY,
  name            text NOT NULL,
  pixels          int NOT NULL,
  bonus_pixels    int NOT NULL DEFAULT 0,
  price_usd_cents int NOT NULL,
  price_brl_cents int,
  is_active       boolean NOT NULL DEFAULT true,
  sort_order      int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

INSERT INTO pixel_packages (id, name, pixels, bonus_pixels, price_usd_cents, price_brl_cents, sort_order) VALUES
  ('starter', 'Starter',    100,   0,  100,   500, 1),
  ('value',   'Value Pack', 500,  25,  500,  2500, 2),
  ('popular', 'Popular',   1000, 200, 1000,  5000, 3),
  ('mega',    'Mega Pack',  2000, 750, 2000,  9900, 4);

-- 5. Earn Rules (how users earn PX through gameplay)
CREATE TABLE earn_rules (
  id              text PRIMARY KEY,
  source          text NOT NULL,
  pixels          int NOT NULL,
  cooldown_hours  int,
  max_per_day     int,
  is_active       boolean NOT NULL DEFAULT true,
  description     text
);

INSERT INTO earn_rules (id, source, pixels, cooldown_hours, max_per_day, description) VALUES
  ('daily_commit',    'daily_commit',  2, 20, 2, 'Commit diario no GitHub'),
  ('streak_3',        'streak_bonus',  3, NULL, NULL, 'Streak de 3 dias'),
  ('streak_7',        'streak_bonus',  7, NULL, NULL, 'Streak de 7 dias'),
  ('streak_14',       'streak_bonus', 15, NULL, NULL, 'Streak de 14 dias'),
  ('streak_30',       'streak_bonus', 35, NULL, NULL, 'Streak de 30 dias'),
  ('visit_city',      'city_action',   1, 20, 1, 'Visitar a cidade'),
  ('raid_attack',     'city_action',   2, 20, 2, 'Atacar em raid'),
  ('gift_sent',       'city_action',   3, NULL, 5, 'Enviar presente'),
  ('dailies_complete','city_action',   5, 20, 1, 'Completar 3 dailies do dia');

-- 6. RLS Policies
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY wallet_read ON wallets FOR SELECT
  USING (developer_id = (SELECT id FROM developers WHERE claimed_by = auth.uid()));
CREATE POLICY wallet_service ON wallets FOR ALL
  USING (auth.role() = 'service_role');

ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tx_read ON wallet_transactions FOR SELECT
  USING (developer_id = (SELECT id FROM developers WHERE claimed_by = auth.uid()));
CREATE POLICY tx_service ON wallet_transactions FOR ALL
  USING (auth.role() = 'service_role');

ALTER TABLE pixel_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY packages_read ON pixel_packages FOR SELECT USING (is_active = true);
CREATE POLICY packages_service ON pixel_packages FOR ALL USING (auth.role() = 'service_role');

ALTER TABLE earn_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY earn_read ON earn_rules FOR SELECT USING (is_active = true);
CREATE POLICY earn_service ON earn_rules FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- RPCs
-- ============================================================

-- 7. credit_pixels (service_role only — purchases, refunds, adjustments)
CREATE OR REPLACE FUNCTION credit_pixels(
  p_developer_id bigint,
  p_amount bigint,
  p_source text,
  p_reference_id text,
  p_reference_type text,
  p_description text,
  p_idempotency_key text,
  p_ip inet DEFAULT NULL,
  p_user_agent text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_old_balance bigint;
  v_new_balance bigint;
  v_tx_id uuid;
BEGIN
  IF auth.role() != 'service_role' THEN
    RAISE EXCEPTION 'credit_pixels requires service_role';
  END IF;

  IF p_source NOT IN ('purchase', 'refund', 'adjustment') THEN
    RAISE EXCEPTION 'credit_pixels only accepts purchase/refund/adjustment sources';
  END IF;

  PERFORM pg_advisory_xact_lock(p_developer_id);

  INSERT INTO wallets (developer_id)
  VALUES (p_developer_id)
  ON CONFLICT (developer_id) DO NOTHING;

  UPDATE wallets
  SET balance = balance + p_amount,
      lifetime_bought = lifetime_bought +
        CASE WHEN p_source = 'purchase' THEN p_amount ELSE 0 END,
      lifetime_earned = lifetime_earned +
        CASE WHEN p_source != 'purchase' THEN p_amount ELSE 0 END,
      updated_at = now()
  WHERE developer_id = p_developer_id
  RETURNING balance - p_amount, balance
  INTO v_old_balance, v_new_balance;

  INSERT INTO wallet_transactions (
    developer_id, type, amount, source,
    reference_id, reference_type, description,
    balance_before, balance_after,
    idempotency_key, ip_address, user_agent
  ) VALUES (
    p_developer_id, 'credit', p_amount, p_source,
    p_reference_id, p_reference_type, p_description,
    v_old_balance, v_new_balance,
    p_idempotency_key, p_ip, p_user_agent
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_tx_id;

  IF v_tx_id IS NULL THEN
    UPDATE wallets
    SET balance = balance - p_amount,
        lifetime_bought = lifetime_bought -
          CASE WHEN p_source = 'purchase' THEN p_amount ELSE 0 END,
        lifetime_earned = lifetime_earned -
          CASE WHEN p_source != 'purchase' THEN p_amount ELSE 0 END,
        updated_at = now()
    WHERE developer_id = p_developer_id;

    RETURN jsonb_build_object('error', 'duplicate_transaction');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_tx_id,
    'new_balance', v_new_balance
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION credit_pixels FROM authenticated, anon;

-- 8. earn_pixels (service_role only — gameplay rewards)
CREATE OR REPLACE FUNCTION earn_pixels(
  p_developer_id bigint,
  p_earn_rule_id text,
  p_reference_id text DEFAULT NULL,
  p_reference_type text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_rule earn_rules%ROWTYPE;
  v_earned_today bigint;
  v_source_today int;
  v_last_earn timestamptz;
  v_old_balance bigint;
  v_new_balance bigint;
  v_tx_id uuid;
BEGIN
  IF auth.role() != 'service_role' THEN
    RAISE EXCEPTION 'earn_pixels requires service_role';
  END IF;

  PERFORM pg_advisory_xact_lock(p_developer_id);

  SELECT * INTO v_rule FROM earn_rules WHERE id = p_earn_rule_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'invalid_earn_rule');
  END IF;

  -- Check cooldown
  IF v_rule.cooldown_hours IS NOT NULL THEN
    SELECT MAX(created_at) INTO v_last_earn
    FROM wallet_transactions
    WHERE developer_id = p_developer_id
      AND source = v_rule.source
      AND reference_type = p_earn_rule_id
      AND created_at >= now() - make_interval(hours => v_rule.cooldown_hours);

    IF v_last_earn IS NOT NULL THEN
      RETURN jsonb_build_object('error', 'cooldown_active');
    END IF;
  END IF;

  -- Check per-source daily limit
  IF v_rule.max_per_day IS NOT NULL THEN
    SELECT COUNT(*) INTO v_source_today
    FROM wallet_transactions
    WHERE developer_id = p_developer_id
      AND source = v_rule.source
      AND reference_type = p_earn_rule_id
      AND created_at >= now() - interval '24 hours';

    IF v_source_today >= v_rule.max_per_day THEN
      RETURN jsonb_build_object('error', 'daily_source_cap_reached');
    END IF;
  END IF;

  -- Check global daily earn cap (50 PX)
  SELECT COALESCE(SUM(amount), 0) INTO v_earned_today
  FROM wallet_transactions
  WHERE developer_id = p_developer_id
    AND type = 'credit'
    AND source IN ('daily_commit', 'streak_bonus', 'achievement', 'city_action')
    AND created_at >= now() - interval '24 hours';

  IF v_earned_today + v_rule.pixels > 50 THEN
    RETURN jsonb_build_object('error', 'daily_earn_cap_reached');
  END IF;

  INSERT INTO wallets (developer_id)
  VALUES (p_developer_id)
  ON CONFLICT (developer_id) DO NOTHING;

  UPDATE wallets
  SET balance = balance + v_rule.pixels,
      lifetime_earned = lifetime_earned + v_rule.pixels,
      updated_at = now()
  WHERE developer_id = p_developer_id
  RETURNING balance - v_rule.pixels, balance
  INTO v_old_balance, v_new_balance;

  INSERT INTO wallet_transactions (
    developer_id, type, amount, source,
    reference_id, reference_type, description,
    balance_before, balance_after,
    idempotency_key
  ) VALUES (
    p_developer_id, 'credit', v_rule.pixels, v_rule.source,
    p_reference_id, p_earn_rule_id, v_rule.description,
    v_old_balance, v_new_balance,
    p_idempotency_key
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_tx_id;

  IF v_tx_id IS NULL THEN
    UPDATE wallets
    SET balance = balance - v_rule.pixels,
        lifetime_earned = lifetime_earned - v_rule.pixels,
        updated_at = now()
    WHERE developer_id = p_developer_id;

    RETURN jsonb_build_object('error', 'duplicate_transaction');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_tx_id,
    'new_balance', v_new_balance,
    'earned', v_rule.pixels
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION earn_pixels FROM authenticated, anon;

-- 9. spend_pixels (service_role only — all item purchases go through API route)
CREATE OR REPLACE FUNCTION spend_pixels(
  p_developer_id bigint,
  p_item_id text,
  p_idempotency_key text,
  p_recipient_id bigint DEFAULT NULL,
  p_allow_multiple boolean DEFAULT false,
  p_ip inet DEFAULT NULL,
  p_user_agent text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_price bigint;
  v_target_id bigint;
  v_old_balance bigint;
  v_new_balance bigint;
  v_tx_id uuid;
BEGIN
  -- CRITICAL: only service_role (API routes) can call this
  IF auth.role() != 'service_role' THEN
    RAISE EXCEPTION 'spend_pixels requires service_role';
  END IF;

  PERFORM pg_advisory_xact_lock(p_developer_id);

  -- Lookup item price from DB (never trust caller)
  SELECT price_pixels INTO v_price
  FROM items WHERE id = p_item_id AND is_active = true;

  IF v_price IS NULL THEN
    RETURN jsonb_build_object('error', 'item_not_found');
  END IF;

  v_target_id := COALESCE(p_recipient_id, p_developer_id);

  -- Check duplicate ownership (skip for consumables/multi-buy items)
  IF NOT p_allow_multiple THEN
    IF EXISTS (
      SELECT 1 FROM purchases
      WHERE (
        (developer_id = v_target_id AND item_id = p_item_id AND status = 'completed' AND gifted_to IS NULL)
        OR
        (gifted_to = v_target_id AND item_id = p_item_id AND status = 'completed')
      )
    ) THEN
      RETURN jsonb_build_object('error', 'already_owned');
    END IF;
  END IF;

  -- Atomic debit
  UPDATE wallets
  SET balance = balance - v_price,
      lifetime_spent = lifetime_spent + v_price,
      updated_at = now()
  WHERE developer_id = p_developer_id
    AND balance >= v_price
  RETURNING balance + v_price, balance
  INTO v_old_balance, v_new_balance;

  IF NOT FOUND THEN
    PERFORM 1 FROM wallets WHERE developer_id = p_developer_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('error', 'wallet_not_found');
    ELSE
      RETURN jsonb_build_object('error', 'insufficient_balance');
    END IF;
  END IF;

  -- Ledger entry
  INSERT INTO wallet_transactions (
    developer_id, type, amount, source,
    reference_id, reference_type, description,
    balance_before, balance_after,
    idempotency_key, ip_address, user_agent
  ) VALUES (
    p_developer_id, 'debit', v_price, 'item_purchase',
    p_item_id, 'item',
    CASE WHEN p_recipient_id IS NOT NULL
      THEN 'Gifted ' || p_item_id || ' to dev ' || p_recipient_id
      ELSE 'Purchased ' || p_item_id
    END,
    v_old_balance, v_new_balance,
    p_idempotency_key, p_ip, p_user_agent
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_tx_id;

  IF v_tx_id IS NULL THEN
    UPDATE wallets
    SET balance = balance + v_price,
        lifetime_spent = lifetime_spent - v_price,
        updated_at = now()
    WHERE developer_id = p_developer_id;

    RETURN jsonb_build_object('error', 'duplicate_transaction');
  END IF;

  -- Purchase record
  IF p_recipient_id IS NOT NULL THEN
    INSERT INTO purchases (developer_id, item_id, provider, amount_cents, currency, status, gifted_to)
    VALUES (p_developer_id, p_item_id, 'pixels', v_price, 'PX', 'completed', p_recipient_id);
  ELSE
    INSERT INTO purchases (developer_id, item_id, provider, amount_cents, currency, status)
    VALUES (p_developer_id, p_item_id, 'pixels', v_price, 'PX', 'completed');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_tx_id,
    'new_balance', v_new_balance,
    'price', v_price
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION spend_pixels FROM authenticated, anon;

-- 10. debit_pixels (service_role only — chargebacks/refunds)
CREATE OR REPLACE FUNCTION debit_pixels(
  p_developer_id bigint,
  p_amount bigint,
  p_source text,
  p_reference_id text,
  p_description text,
  p_idempotency_key text
) RETURNS jsonb AS $$
DECLARE
  v_old_balance bigint;
  v_new_balance bigint;
  v_tx_id uuid;
BEGIN
  IF auth.role() != 'service_role' THEN
    RAISE EXCEPTION 'debit_pixels requires service_role';
  END IF;

  IF p_source NOT IN ('chargeback', 'refund', 'adjustment') THEN
    RAISE EXCEPTION 'debit_pixels only accepts chargeback/refund/adjustment sources';
  END IF;

  PERFORM pg_advisory_xact_lock(p_developer_id);

  SELECT balance INTO v_old_balance FROM wallets WHERE developer_id = p_developer_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'wallet_not_found');
  END IF;

  UPDATE wallets
  SET balance = GREATEST(0, balance - p_amount),
      lifetime_spent = lifetime_spent + LEAST(balance, p_amount),
      updated_at = now()
  WHERE developer_id = p_developer_id
  RETURNING balance INTO v_new_balance;

  INSERT INTO wallet_transactions (
    developer_id, type, amount, source,
    reference_id, reference_type, description,
    balance_before, balance_after,
    idempotency_key
  ) VALUES (
    p_developer_id, 'debit', p_amount, p_source,
    p_reference_id, p_source, p_description,
    v_old_balance, v_new_balance,
    p_idempotency_key
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_tx_id;

  IF v_tx_id IS NULL THEN
    UPDATE wallets
    SET balance = v_old_balance,
        lifetime_spent = lifetime_spent - LEAST(v_old_balance, p_amount),
        updated_at = now()
    WHERE developer_id = p_developer_id;
    RETURN jsonb_build_object('error', 'duplicate_transaction');
  END IF;

  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION debit_pixels FROM authenticated, anon;
