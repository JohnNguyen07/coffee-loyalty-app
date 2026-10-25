-- ============================================================
-- SUPABASE RPC FUNCTIONS
-- Atomic business logic wrapped in database transactions
-- ============================================================

-- ============================================================
-- 1. process_qr_scan: QR Scan → Cashback → Tier Upgrade
-- ============================================================
CREATE OR REPLACE FUNCTION process_qr_scan(
  p_qr_code VARCHAR,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_qr          qr_tokens%ROWTYPE;
  v_user        users%ROWTYPE;
  v_tier        tiers%ROWTYPE;
  v_cashback    BIGINT;
  v_new_balance BIGINT;
  v_new_spending BIGINT;
  v_new_tier_id UUID;
  v_tier_bonus  BIGINT := 0;
  v_tier_changed BOOLEAN := FALSE;
  v_new_tier_name VARCHAR := '';
  v_result      JSONB;
BEGIN
  -- Lock and fetch QR token
  SELECT * INTO v_qr FROM qr_tokens WHERE code = p_qr_code FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'QR_NOT_FOUND';
  END IF;

  IF v_qr.status = 'USED' THEN
    RAISE EXCEPTION 'QR_ALREADY_USED';
  END IF;

  IF v_qr.status = 'EXPIRED' OR v_qr.expires_at < NOW() THEN
    RAISE EXCEPTION 'QR_EXPIRED';
  END IF;

  -- Lock and fetch user
  SELECT * INTO v_user FROM users WHERE id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND';
  END IF;

  -- Get current tier
  SELECT * INTO v_tier FROM tiers WHERE id = v_user.current_tier_id;

  -- Calculate cashback
  v_cashback := FLOOR(v_qr.drink_value * v_tier.cashback_rate / 100);
  v_new_balance := v_user.point_balance + v_cashback;
  v_new_spending := v_user.total_spending + v_qr.drink_value;

  -- Mark QR as used
  UPDATE qr_tokens
  SET status = 'USED', scanned_by = p_user_id, scanned_at = NOW()
  WHERE code = p_qr_code;

  -- Log cashback transaction
  INSERT INTO point_transactions (user_id, type, amount, balance_after, reference_id, description)
  VALUES (
    p_user_id, 'CASHBACK', v_cashback, v_new_balance,
    p_qr_code,
    FORMAT('Hoàn %s%% cho ly %sđ', v_tier.cashback_rate, v_qr.drink_value)
  );

  -- Check tier upgrade (check from highest to lowest)
  v_new_tier_id := v_user.current_tier_id;

  -- Check DIAMOND
  IF v_new_spending >= 6000000 AND NOT v_user.upgraded_to_diamond THEN
    SELECT id INTO v_new_tier_id FROM tiers WHERE code = 'DIAMOND';
    v_tier_bonus := 45000;
    v_new_balance := v_new_balance + v_tier_bonus;
    v_tier_changed := TRUE;
    v_new_tier_name := 'Diamond';

    UPDATE users SET upgraded_to_diamond = TRUE WHERE id = p_user_id;

    INSERT INTO point_transactions (user_id, type, amount, balance_after, reference_id, description)
    VALUES (p_user_id, 'TIER_UP_BONUS', v_tier_bonus, v_new_balance, 'DIAMOND', 'Thưởng thăng hạng Diamond 💎');

  -- Check GOLD
  ELSIF v_new_spending >= 1250000 AND NOT v_user.upgraded_to_gold THEN
    SELECT id INTO v_new_tier_id FROM tiers WHERE code = 'GOLD';
    v_tier_bonus := 200000;
    v_new_balance := v_new_balance + v_tier_bonus;
    v_tier_changed := TRUE;
    v_new_tier_name := 'Gold';

    UPDATE users SET upgraded_to_gold = TRUE WHERE id = p_user_id;

    INSERT INTO point_transactions (user_id, type, amount, balance_after, reference_id, description)
    VALUES (p_user_id, 'TIER_UP_BONUS', v_tier_bonus, v_new_balance, 'GOLD', 'Thưởng thăng hạng Gold 🥇');

  -- Check SILVER
  ELSIF v_new_spending >= 500000 AND NOT v_user.upgraded_to_silver THEN
    SELECT id INTO v_new_tier_id FROM tiers WHERE code = 'SILVER';
    v_tier_bonus := 100000;
    v_new_balance := v_new_balance + v_tier_bonus;
    v_tier_changed := TRUE;
    v_new_tier_name := 'Silver';

    UPDATE users SET upgraded_to_silver = TRUE WHERE id = p_user_id;

    INSERT INTO point_transactions (user_id, type, amount, balance_after, reference_id, description)
    VALUES (p_user_id, 'TIER_UP_BONUS', v_tier_bonus, v_new_balance, 'SILVER', 'Thưởng thăng hạng Silver 🥈');
  END IF;

  -- Update user
  UPDATE users
  SET
    point_balance = v_new_balance,
    total_spending = v_new_spending,
    current_tier_id = v_new_tier_id,
    updated_at = NOW()
  WHERE id = p_user_id;

  -- Build result
  v_result := jsonb_build_object(
    'cashback', v_cashback,
    'drink_value', v_qr.drink_value,
    'new_balance', v_new_balance,
    'new_spending', v_new_spending,
    'tier_changed', v_tier_changed,
    'new_tier_name', v_new_tier_name,
    'tier_bonus', v_tier_bonus,
    'cashback_rate', v_tier.cashback_rate
  );

  RETURN v_result;
END;
$$;


-- ============================================================
-- 2. create_order: Create order with point locking
-- ============================================================
CREATE OR REPLACE FUNCTION create_order(
  p_user_id UUID,
  p_items JSONB,
  p_points_used BIGINT,
  p_subtotal BIGINT,
  p_total_due BIGINT,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user        users%ROWTYPE;
  v_order_id    UUID;
  v_order_code  VARCHAR;
  v_item        JSONB;
  v_new_balance BIGINT;
  v_result      JSONB;
BEGIN
  -- Lock user
  SELECT * INTO v_user FROM users WHERE id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND';
  END IF;

  -- Validate points
  IF p_points_used > v_user.point_balance THEN
    RAISE EXCEPTION 'INSUFFICIENT_POINTS';
  END IF;

  IF p_points_used > p_subtotal THEN
    RAISE EXCEPTION 'POINTS_EXCEED_SUBTOTAL';
  END IF;

  -- Generate order code
  SELECT 'CF-' || LPAD((COALESCE(MAX(CAST(SUBSTRING(order_code FROM 4) AS INT)), 0) + 1)::TEXT, 4, '0')
  INTO v_order_code
  FROM orders;

  -- Create order
  INSERT INTO orders (order_code, user_id, status, subtotal, points_used, total_due, note)
  VALUES (v_order_code, p_user_id, 'PENDING', p_subtotal, p_points_used, p_total_due, p_note)
  RETURNING id INTO v_order_id;

  -- Insert order items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO order_items (order_id, product_name, size, quantity, unit_price, subtotal)
    VALUES (
      v_order_id,
      v_item->>'product_name',
      v_item->>'size',
      (v_item->>'quantity')::INT,
      (v_item->>'unit_price')::BIGINT,
      (v_item->>'quantity')::INT * (v_item->>'unit_price')::BIGINT
    );
  END LOOP;

  -- Lock points if using any
  IF p_points_used > 0 THEN
    v_new_balance := v_user.point_balance - p_points_used;

    UPDATE users
    SET
      point_balance = v_new_balance,
      locked_points = locked_points + p_points_used,
      updated_at = NOW()
    WHERE id = p_user_id;

    INSERT INTO point_transactions (user_id, type, amount, balance_after, reference_id, description)
    VALUES (
      p_user_id, 'ORDER_DEDUCT', -p_points_used, v_new_balance,
      v_order_code, FORMAT('Dùng điểm cho đơn %s', v_order_code)
    );
  END IF;

  v_result := jsonb_build_object(
    'order_id', v_order_id,
    'order_code', v_order_code,
    'subtotal', p_subtotal,
    'points_used', p_points_used,
    'total_due', p_total_due
  );

  RETURN v_result;
END;
$$;


-- ============================================================
-- 3. confirm_order: Admin confirms → finalize locked points
-- ============================================================
CREATE OR REPLACE FUNCTION confirm_order(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_user  users%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  IF v_order.status != 'PENDING' THEN
    RAISE EXCEPTION 'ORDER_NOT_PENDING';
  END IF;

  -- Update order status
  UPDATE orders
  SET status = 'CONFIRMED', confirmed_at = NOW(), updated_at = NOW()
  WHERE id = p_order_id;

  -- Finalize locked points
  IF v_order.points_used > 0 THEN
    SELECT * INTO v_user FROM users WHERE id = v_order.user_id FOR UPDATE;

    UPDATE users
    SET
      locked_points = locked_points - v_order.points_used,
      updated_at = NOW()
    WHERE id = v_order.user_id;

    INSERT INTO point_transactions (user_id, type, amount, balance_after, reference_id, description)
    VALUES (
      v_order.user_id, 'ORDER_CONFIRM', 0, v_user.point_balance,
      v_order.order_code, FORMAT('Xác nhận đơn %s - trừ hẳn %sđ', v_order.order_code, v_order.points_used)
    );
  END IF;

  RETURN jsonb_build_object('status', 'CONFIRMED', 'order_code', v_order.order_code);
END;
$$;


-- ============================================================
-- 4. cancel_order: Admin cancels → refund locked points
-- ============================================================
CREATE OR REPLACE FUNCTION cancel_order(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order       orders%ROWTYPE;
  v_user        users%ROWTYPE;
  v_new_balance BIGINT;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  IF v_order.status != 'PENDING' THEN
    RAISE EXCEPTION 'ORDER_NOT_PENDING';
  END IF;

  -- Update order status
  UPDATE orders
  SET status = 'CANCELLED', cancelled_at = NOW(), updated_at = NOW()
  WHERE id = p_order_id;

  -- Refund locked points
  IF v_order.points_used > 0 THEN
    SELECT * INTO v_user FROM users WHERE id = v_order.user_id FOR UPDATE;

    v_new_balance := v_user.point_balance + v_order.points_used;

    UPDATE users
    SET
      point_balance = v_new_balance,
      locked_points = locked_points - v_order.points_used,
      updated_at = NOW()
    WHERE id = v_order.user_id;

    INSERT INTO point_transactions (user_id, type, amount, balance_after, reference_id, description)
    VALUES (
      v_order.user_id, 'ORDER_CANCEL_REFUND', v_order.points_used, v_new_balance,
      v_order.order_code, FORMAT('Hoàn điểm đơn hủy %s', v_order.order_code)
    );
  END IF;

  RETURN jsonb_build_object('status', 'CANCELLED', 'order_code', v_order.order_code);
END;
$$;
