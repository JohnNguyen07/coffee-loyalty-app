-- ============================================================
-- COFFEE LOYALTY & ORDERING SYSTEM - DATABASE SCHEMA
-- Target: PostgreSQL (Supabase)
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. TIERS - Bảng phân hạng thành viên
-- ============================================================
CREATE TABLE tiers (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code        VARCHAR(20) UNIQUE NOT NULL,     -- MEMBER, SILVER, GOLD, DIAMOND
  name        VARCHAR(50) NOT NULL,
  min_spending BIGINT NOT NULL DEFAULT 0,       -- Mốc chi tiêu tối thiểu (VNĐ)
  cashback_rate DECIMAL(4,2) NOT NULL DEFAULT 0, -- % hoàn tiền (VD: 3.00 = 3%)
  level_up_bonus BIGINT NOT NULL DEFAULT 0,     -- Điểm thưởng khi lên hạng
  sort_order   INT NOT NULL DEFAULT 0,          -- Thứ tự sắp xếp
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed data cho tiers
INSERT INTO tiers (code, name, min_spending, cashback_rate, level_up_bonus, sort_order) VALUES
  ('MEMBER',  'Member',  0,       3.00,  10000,  1),
  ('SILVER',  'Silver',  500000,  5.00,  100000, 2),
  ('GOLD',    'Gold',    1250000, 7.00,  200000, 3),
  ('DIAMOND', 'Diamond', 6000000, 10.00, 45000,  4);

-- ============================================================
-- 2. USERS - Bảng người dùng
-- ============================================================
CREATE TABLE users (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  google_id           VARCHAR(255) UNIQUE,          -- Google OAuth ID
  email               VARCHAR(255) UNIQUE,
  full_name           VARCHAR(255),
  avatar_url          TEXT,
  phone               VARCHAR(20),
  role                VARCHAR(10) NOT NULL DEFAULT 'USER' CHECK (role IN ('USER', 'ADMIN')),
  current_tier_id     UUID NOT NULL REFERENCES tiers(id),
  total_spending      BIGINT NOT NULL DEFAULT 0,    -- Tổng chi tiêu tích lũy (chỉ tăng)
  point_balance       BIGINT NOT NULL DEFAULT 0,    -- Ví điểm khả dụng
  locked_points       BIGINT NOT NULL DEFAULT 0,    -- Điểm đang bị tạm khóa (đơn hàng pending)

  -- Cờ tránh cộng thưởng thăng hạng nhiều lần
  received_welcome_10k BOOLEAN NOT NULL DEFAULT FALSE,
  upgraded_to_silver   BOOLEAN NOT NULL DEFAULT FALSE,
  upgraded_to_gold     BOOLEAN NOT NULL DEFAULT FALSE,
  upgraded_to_diamond  BOOLEAN NOT NULL DEFAULT FALSE,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_point_balance CHECK (point_balance >= 0),
  CONSTRAINT chk_locked_points CHECK (locked_points >= 0),
  CONSTRAINT chk_total_spending CHECK (total_spending >= 0)
);

CREATE INDEX idx_users_google_id ON users(google_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- ============================================================
-- 3. QR_TOKENS - Mã QR trên tem in
-- ============================================================
CREATE TABLE qr_tokens (
  code          VARCHAR(32) PRIMARY KEY,          -- Mã QR duy nhất
  drink_value   BIGINT NOT NULL,                  -- Giá ly nước (VNĐ)
  status        VARCHAR(10) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'USED', 'EXPIRED')),
  created_by    UUID REFERENCES users(id),        -- Admin tạo mã
  scanned_by    UUID REFERENCES users(id),        -- Khách hàng quét mã
  scanned_at    TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_qr_tokens_status ON qr_tokens(status);
CREATE INDEX idx_qr_tokens_scanned_by ON qr_tokens(scanned_by);
CREATE INDEX idx_qr_tokens_expires_at ON qr_tokens(expires_at);

-- ============================================================
-- 4. POINT_TRANSACTIONS - Sổ cái biến động điểm
-- ============================================================
CREATE TABLE point_transactions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id),
  type            VARCHAR(30) NOT NULL CHECK (type IN (
    'CASHBACK',           -- Hoàn tiền từ quét QR
    'WELCOME_BONUS',      -- Thưởng chào mừng 10k
    'TIER_UP_BONUS',      -- Thưởng thăng hạng
    'MONTHLY_BONUS',      -- Thưởng hàng tháng (Diamond)
    'ORDER_DEDUCT',       -- Trừ điểm khi đặt hàng (khóa)
    'ORDER_CONFIRM',      -- Xác nhận trừ điểm (từ locked -> trừ hẳn)
    'ORDER_CANCEL_REFUND' -- Hoàn lại điểm khi hủy đơn
  )),
  amount          BIGINT NOT NULL,                -- Số điểm (+/-)
  balance_after   BIGINT NOT NULL,                -- Số dư sau giao dịch
  reference_id    VARCHAR(255),                   -- ID tham chiếu (QR code hoặc Order ID)
  description     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_point_tx_user ON point_transactions(user_id);
CREATE INDEX idx_point_tx_type ON point_transactions(type);
CREATE INDEX idx_point_tx_created ON point_transactions(created_at);

-- ============================================================
-- 5. ORDERS - Đơn hàng từ Web
-- ============================================================
CREATE TABLE orders (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_code      VARCHAR(20) UNIQUE NOT NULL,    -- Mã đơn hàng dạng #CF001
  user_id         UUID NOT NULL REFERENCES users(id),
  status          VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING',      -- Đang chờ xác nhận
    'CONFIRMED',    -- Admin đã xác nhận
    'CANCELLED'     -- Đã hủy
  )),
  subtotal        BIGINT NOT NULL DEFAULT 0,      -- Tổng tiền trước giảm
  points_used     BIGINT NOT NULL DEFAULT 0,      -- Số điểm đã dùng
  total_due       BIGINT NOT NULL DEFAULT 0,      -- Số tiền khách phải trả
  note            TEXT,
  confirmed_at    TIMESTAMPTZ,
  cancelled_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_code ON orders(order_code);

-- ============================================================
-- 6. ORDER_ITEMS - Chi tiết các món trong đơn
-- ============================================================
CREATE TABLE order_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_name    VARCHAR(255) NOT NULL,
  size            VARCHAR(10) NOT NULL,           -- M, L, 330ml, 500ml
  quantity        INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price      BIGINT NOT NULL,                -- Đơn giá
  subtotal        BIGINT NOT NULL,                -- quantity * unit_price
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_items_order ON order_items(order_id);

-- ============================================================
-- 7. MENU_CATEGORIES - Danh mục menu
-- ============================================================
CREATE TABLE menu_categories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(100) NOT NULL,
  slug        VARCHAR(100) UNIQUE NOT NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 8. MENU_ITEMS - Các món trong menu
-- ============================================================
CREATE TABLE menu_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id     UUID NOT NULL REFERENCES menu_categories(id),
  name            VARCHAR(255) NOT NULL,
  description     TEXT,
  image_url       TEXT,
  is_available    BOOLEAN NOT NULL DEFAULT TRUE,
  is_signature    BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order      INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_menu_items_category ON menu_items(category_id);

-- ============================================================
-- 9. MENU_ITEM_SIZES - Giá theo size
-- ============================================================
CREATE TABLE menu_item_sizes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  menu_item_id    UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  size_label      VARCHAR(20) NOT NULL,           -- "M (360ml)", "L (500ml)", "Lon 330ml", "Lon 500ml"
  price           BIGINT NOT NULL,
  is_available    BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order      INT NOT NULL DEFAULT 0
);

CREATE INDEX idx_menu_sizes_item ON menu_item_sizes(menu_item_id);

-- ============================================================
-- SEED: Menu Categories & Items
-- ============================================================

-- Categories
INSERT INTO menu_categories (name, slug, sort_order) VALUES
  ('Cold Brew', 'cold-brew', 1),
  ('Matcha', 'matcha', 2),
  ('Cold Brew Chai', 'cold-brew-chai', 3);

-- Helper function để seed menu items dễ dàng hơn
-- (Sẽ insert từ application layer hoặc migration script)

-- ============================================================
-- FUNCTION: Auto-update updated_at timestamp
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_menu_items_updated_at
  BEFORE UPDATE ON menu_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- FUNCTION: Generate sequential order code
-- ============================================================
CREATE OR REPLACE FUNCTION generate_order_code()
RETURNS TRIGGER AS $$
DECLARE
  next_num INT;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(order_code FROM 4) AS INT)), 0) + 1
  INTO next_num
  FROM orders;

  NEW.order_code = 'CF-' || LPAD(next_num::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_orders_code
  BEFORE INSERT ON orders
  FOR EACH ROW
  WHEN (NEW.order_code IS NULL OR NEW.order_code = '')
  EXECUTE FUNCTION generate_order_code();
