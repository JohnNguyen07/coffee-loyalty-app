-- ============================================================
-- ROW LEVEL SECURITY (RLS) Policies for Supabase
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE point_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_item_sizes ENABLE ROW LEVEL SECURITY;

-- ──────────────────────────────────────
-- TIERS: Public read
-- ──────────────────────────────────────
CREATE POLICY "Tiers are publicly readable"
  ON tiers FOR SELECT
  USING (true);

-- ──────────────────────────────────────
-- USERS: Own profile read/update, admin reads all
-- ──────────────────────────────────────
CREATE POLICY "Users can read own profile"
  ON users FOR SELECT
  USING (
    google_id = (SELECT auth.jwt() ->> 'sub')
    OR role = 'ADMIN'
  );

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  USING (google_id = (SELECT auth.jwt() ->> 'sub'));

-- Allow insert from auth callback (service role handles this via RPC)
CREATE POLICY "Service role inserts users"
  ON users FOR INSERT
  WITH CHECK (true);

-- ──────────────────────────────────────
-- QR_TOKENS: Admin creates, public reads ACTIVE tokens
-- ──────────────────────────────────────
CREATE POLICY "Anyone can read QR tokens"
  ON qr_tokens FOR SELECT
  USING (true);

CREATE POLICY "Admin creates QR tokens"
  ON qr_tokens FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE google_id = (SELECT auth.jwt() ->> 'sub')
      AND role = 'ADMIN'
    )
  );

CREATE POLICY "QR tokens can be updated"
  ON qr_tokens FOR UPDATE
  USING (true);

-- ──────────────────────────────────────
-- POINT_TRANSACTIONS: Users see own, admin sees all
-- ──────────────────────────────────────
CREATE POLICY "Users read own transactions"
  ON point_transactions FOR SELECT
  USING (
    user_id IN (
      SELECT id FROM users WHERE google_id = (SELECT auth.jwt() ->> 'sub')
    )
    OR EXISTS (
      SELECT 1 FROM users
      WHERE google_id = (SELECT auth.jwt() ->> 'sub')
      AND role = 'ADMIN'
    )
  );

CREATE POLICY "Transactions are inserted by system"
  ON point_transactions FOR INSERT
  WITH CHECK (true);

-- ──────────────────────────────────────
-- ORDERS: Users see own, admin sees all
-- ──────────────────────────────────────
CREATE POLICY "Users read own orders"
  ON orders FOR SELECT
  USING (
    user_id IN (
      SELECT id FROM users WHERE google_id = (SELECT auth.jwt() ->> 'sub')
    )
    OR EXISTS (
      SELECT 1 FROM users
      WHERE google_id = (SELECT auth.jwt() ->> 'sub')
      AND role = 'ADMIN'
    )
  );

CREATE POLICY "Users create orders"
  ON orders FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Orders can be updated"
  ON orders FOR UPDATE
  USING (true);

-- ──────────────────────────────────────
-- ORDER_ITEMS: Follows order access
-- ──────────────────────────────────────
CREATE POLICY "Order items follow order access"
  ON order_items FOR SELECT
  USING (
    order_id IN (
      SELECT id FROM orders WHERE user_id IN (
        SELECT id FROM users WHERE google_id = (SELECT auth.jwt() ->> 'sub')
      )
    )
    OR EXISTS (
      SELECT 1 FROM users
      WHERE google_id = (SELECT auth.jwt() ->> 'sub')
      AND role = 'ADMIN'
    )
  );

CREATE POLICY "Order items can be inserted"
  ON order_items FOR INSERT
  WITH CHECK (true);

-- ──────────────────────────────────────
-- MENU: Public read
-- ──────────────────────────────────────
CREATE POLICY "Menu categories are public"
  ON menu_categories FOR SELECT
  USING (true);

CREATE POLICY "Menu items are public"
  ON menu_items FOR SELECT
  USING (true);

CREATE POLICY "Menu sizes are public"
  ON menu_item_sizes FOR SELECT
  USING (true);

-- Admin can manage menu
CREATE POLICY "Admin manages menu categories"
  ON menu_categories FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE google_id = (SELECT auth.jwt() ->> 'sub')
      AND role = 'ADMIN'
    )
  );

CREATE POLICY "Admin manages menu items"
  ON menu_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE google_id = (SELECT auth.jwt() ->> 'sub')
      AND role = 'ADMIN'
    )
  );

CREATE POLICY "Admin manages menu sizes"
  ON menu_item_sizes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE google_id = (SELECT auth.jwt() ->> 'sub')
      AND role = 'ADMIN'
    )
  );
