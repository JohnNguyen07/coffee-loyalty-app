-- ============================================================
-- MIGRATION: 0001_m01_pos_foundation.sql
-- Module: M01 — POS Bán Hàng & Nền tảng Multi-location
-- Quy tắc: Không xóa bảng, cột hoặc dữ liệu hiện có. Idempotent (chạy nhiều lần an toàn).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Bảng BUSINESSES (Doanh nghiệp)
CREATE TABLE IF NOT EXISTS businesses (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code        VARCHAR(50) UNIQUE NOT NULL,
  name        VARCHAR(255) NOT NULL,
  tax_code    VARCHAR(50),
  phone       VARCHAR(30),
  address     TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed doanh nghiệp mặc định Ủ LAB
INSERT INTO businesses (id, code, name, phone, address)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'ULAB',
  'Ủ LAB — Matcha & Cold Brew',
  '0909000001',
  'TP. Hồ Chí Minh, Việt Nam'
)
ON CONFLICT (code) DO NOTHING;

-- 2. Bảng LOCATIONS (Điểm bán / Cửa hàng)
CREATE TABLE IF NOT EXISTS locations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id),
  code        VARCHAR(50) NOT NULL,
  name        VARCHAR(255) NOT NULL,
  address     TEXT,
  phone       VARCHAR(30),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, code)
);

-- Seed điểm bán mặc định Ủ LAB Quầy Chính
INSERT INTO locations (id, business_id, code, name, address, phone)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'ULAB-MAIN',
  'Ủ LAB — Quầy Chính',
  'TP. Hồ Chí Minh',
  '0909000001'
)
ON CONFLICT (business_id, code) DO NOTHING;

-- 3. Bổ sung business_id, location_id, staff_role cho bảng hiện có (không phá vỡ dữ liệu cũ)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES locations(id) DEFAULT '00000000-0000-0000-0000-000000000002',
  ADD COLUMN IF NOT EXISTS staff_role VARCHAR(20) DEFAULT 'CASHIER';

ALTER TABLE menu_categories
  ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id) DEFAULT '00000000-0000-0000-0000-000000000001';

ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id) DEFAULT '00000000-0000-0000-0000-000000000001';

ALTER TABLE qr_tokens
  ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES locations(id) DEFAULT '00000000-0000-0000-0000-000000000002';

-- 4. Mở rộng bảng ORDERS cho POS Bán Hàng (M01)
-- Cho phép user_id NULL đối với khách vãng lai mua trực tiếp tại quầy POS
ALTER TABLE orders
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES locations(id) DEFAULT '00000000-0000-0000-0000-000000000002',
  ADD COLUMN IF NOT EXISTS channel VARCHAR(20) NOT NULL DEFAULT 'POS',
  ADD COLUMN IF NOT EXISTS order_type VARCHAR(20) NOT NULL DEFAULT 'TAKEAWAY',
  ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(30),
  ADD COLUMN IF NOT EXISTS discount_amount BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_reason TEXT,
  ADD COLUMN IF NOT EXISTS discount_approved_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(30) NOT NULL DEFAULT 'CASH',
  ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) NOT NULL DEFAULT 'PAID',
  ADD COLUMN IF NOT EXISTS amount_received BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS change_due BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100),
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency_key
  ON orders(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_business_location_created
  ON orders(business_id, location_id, created_at DESC);

-- 5. Mở rộng bảng ORDER_ITEMS cho tùy chọn món (độ ngọt, đá, topping, ghi chú món)
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES locations(id) DEFAULT '00000000-0000-0000-0000-000000000002',
  ADD COLUMN IF NOT EXISTS item_options JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS item_note TEXT;

-- 6. Bảng ORDER_AUDIT_LOGS (Lưu vết tạo đơn, giảm giá, thanh toán, hủy đơn)
CREATE TABLE IF NOT EXISTS order_audit_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  location_id UUID NOT NULL REFERENCES locations(id) DEFAULT '00000000-0000-0000-0000-000000000002',
  order_id    UUID NOT NULL REFERENCES orders(id),
  order_code  VARCHAR(20) NOT NULL,
  action      VARCHAR(40) NOT NULL, -- CREATED, PAID, DISCOUNT_APPLIED, CANCELLED, REFUNDED
  actor_id    UUID REFERENCES users(id),
  actor_name  VARCHAR(255),
  actor_role  VARCHAR(30),
  reason      TEXT,
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_audit_logs_order_id ON order_audit_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_order_audit_logs_business_loc ON order_audit_logs(business_id, location_id, created_at DESC);

-- 7. Bật RLS cho các bảng mới
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_audit_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'businesses' AND policyname = 'Public read active businesses'
  ) THEN
    CREATE POLICY "Public read active businesses" ON businesses FOR SELECT USING (is_active = TRUE);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'locations' AND policyname = 'Public read active locations'
  ) THEN
    CREATE POLICY "Public read active locations" ON locations FOR SELECT USING (is_active = TRUE);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'order_audit_logs' AND policyname = 'Admin read audit logs'
  ) THEN
    CREATE POLICY "Admin read audit logs" ON order_audit_logs FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM users
        WHERE (id = auth.uid() OR google_id = (SELECT auth.jwt() ->> 'sub'))
        AND role = 'ADMIN'
      )
    );
  END IF;
END $$;

