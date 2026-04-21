-- ============================================================
-- Migration 081: arcade_buy_item RPC
-- Atomic purchase: advisory lock → check ownership → check balance → debit → grant → ledger
-- Safe to re-run (CREATE OR REPLACE)
-- ============================================================

CREATE OR REPLACE FUNCTION arcade_buy_item(
  p_developer_id bigint,
  p_item_id text
) RETURNS jsonb AS $$
DECLARE
  v_price integer;
  v_item_name text;
  v_rarity text;
  v_old_balance bigint;
  v_new_balance bigint;
BEGIN
  -- Only service_role (API routes) can call this
  IF auth.role() != 'service_role' THEN
    RAISE EXCEPTION 'arcade_buy_item requires service_role';
  END IF;

  -- Lock on developer to prevent concurrent purchases
  PERFORM pg_advisory_xact_lock(p_developer_id);

  -- 1. Lookup item in arcade catalog
  SELECT price_px, name, rarity INTO v_price, v_item_name, v_rarity
  FROM arcade_shop_items
  WHERE id = p_item_id AND active = true;

  IF v_price IS NULL THEN
    RETURN jsonb_build_object('error', 'item_not_found');
  END IF;

  -- 2. Check if already owned
  IF EXISTS (
    SELECT 1 FROM arcade_inventory
    WHERE developer_id = p_developer_id AND item_id = p_item_id
  ) THEN
    RETURN jsonb_build_object('error', 'already_owned');
  END IF;

  -- 3. Debit wallet (skip for free items)
  IF v_price > 0 THEN
    UPDATE wallets
    SET balance = balance - v_price,
        lifetime_spent = lifetime_spent + v_price,
        updated_at = now()
    WHERE developer_id = p_developer_id
      AND balance >= v_price
    RETURNING balance + v_price, balance
    INTO v_old_balance, v_new_balance;

    IF NOT FOUND THEN
      -- Check if wallet exists at all
      PERFORM 1 FROM wallets WHERE developer_id = p_developer_id;
      IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'wallet_not_found');
      ELSE
        RETURN jsonb_build_object('error', 'insufficient_balance');
      END IF;
    END IF;

    -- 4. Ledger entry (immutable transaction log)
    INSERT INTO wallet_transactions (
      developer_id, type, amount, source,
      reference_id, reference_type, description,
      balance_before, balance_after
    ) VALUES (
      p_developer_id, 'debit', v_price, 'item_purchase',
      p_item_id, 'arcade_cosmetic',
      'Purchased ' || v_item_name,
      v_old_balance, v_new_balance
    );
  ELSE
    -- Free item: just get current balance for response
    SELECT balance INTO v_new_balance
    FROM wallets WHERE developer_id = p_developer_id;
    v_new_balance := COALESCE(v_new_balance, 0);
  END IF;

  -- 5. Grant item to inventory
  INSERT INTO arcade_inventory (developer_id, item_id)
  VALUES (p_developer_id, p_item_id);

  RETURN jsonb_build_object(
    'success', true,
    'new_balance', v_new_balance,
    'price', v_price,
    'item_name', v_item_name
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Only service_role can call this
REVOKE EXECUTE ON FUNCTION arcade_buy_item FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION arcade_buy_item FROM authenticated;
REVOKE EXECUTE ON FUNCTION arcade_buy_item FROM anon;
