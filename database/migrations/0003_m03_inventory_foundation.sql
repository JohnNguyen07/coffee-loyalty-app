-- ============================================================
-- MIGRATION: 0003_m03_inventory_foundation.sql
-- Module: M03 — Kho Hàng: Cơ sở Kho, Danh mục 3 loại mặt hàng & Quy đổi đơn vị
-- Quy tắc: Idempotent, không xóa dữ liệu cũ, bảo toàn tính tương thích.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Bảng WAREHOUSES (Kho hàng vật lý theo điểm bán)
CREATE TABLE IF NOT EXISTS warehouses (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id     UUID NOT NULL REFERENCES businesses(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  location_id     UUID REFERENCES locations(id) DEFAULT '00000000-0000-0000-0000-000000000002',
  code            VARCHAR(50) NOT NULL,
  name            VARCHAR(255) NOT NULL,
  warehouse_type  VARCHAR(30) NOT NULL DEFAULT 'BAR_COUNTER' CHECK (warehouse_type IN ('BAR_COUNTER', 'STORAGE', 'CENTRAL_KITCHEN')),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, code)
);

-- Seed kho mặc định: Kho Quầy Chính Ủ LAB
INSERT INTO warehouses (id, business_id, location_id, code, name, warehouse_type)
VALUES (
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  'WH-MAIN',
  'Kho Quầy Chính Ủ LAB',
  'BAR_COUNTER'
)
ON CONFLICT (business_id, code) DO NOTHING;

-- 2. Bảng INVENTORY_ITEMS (Danh mục mặt hàng 3 loại: raw_material, packaging, finished_good)
CREATE TABLE IF NOT EXISTS inventory_items (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id         UUID NOT NULL REFERENCES businesses(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  sku                 VARCHAR(50) NOT NULL,
  name                VARCHAR(255) NOT NULL,
  item_type           VARCHAR(30) NOT NULL CHECK (item_type IN ('raw_material', 'packaging', 'finished_good')),
  base_unit           VARCHAR(30) NOT NULL,            -- 'g', 'ml', 'chai', 'ly', 'cai', 'hop'
  min_stock_level     DECIMAL(12,3) NOT NULL DEFAULT 0,
  cost_price          BIGINT NOT NULL DEFAULT 0,       -- Giá vốn tham chiếu (VND)
  linked_menu_item_id UUID REFERENCES menu_items(id),  -- Liên kết trực tiếp nếu là finished_good
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_inventory_items_type ON inventory_items(business_id, item_type);
CREATE INDEX IF NOT EXISTS idx_inventory_items_sku ON inventory_items(sku);
CREATE INDEX IF NOT EXISTS idx_inventory_items_linked_menu ON inventory_items(linked_menu_item_id);

-- 3. Bảng UNIT_CONVERSIONS (Hệ số quy đổi đơn vị khai báo rõ ràng)
CREATE TABLE IF NOT EXISTS unit_conversions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id     UUID NOT NULL REFERENCES businesses(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  item_id         UUID REFERENCES inventory_items(id) ON DELETE CASCADE, -- NULL nếu áp dụng hệ chuẩn toàn hệ thống
  from_unit       VARCHAR(30) NOT NULL,
  to_unit         VARCHAR(30) NOT NULL,
  multiplier      DECIMAL(12,6) NOT NULL CHECK (multiplier > 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, item_id, from_unit, to_unit)
);

-- Seed quy đổi chuẩn: kg sang g, lít sang ml (tuyệt đối không quy đổi khối lượng sang thể tích)
INSERT INTO unit_conversions (business_id, item_id, from_unit, to_unit, multiplier)
VALUES
  ('00000000-0000-0000-0000-000000000001', NULL, 'kg', 'g', 1000.000000),
  ('00000000-0000-0000-0000-000000000001', NULL, 'lit', 'ml', 1000.000000),
  ('00000000-0000-0000-0000-000000000001', NULL, 'l', 'ml', 1000.000000)
ON CONFLICT (business_id, item_id, from_unit, to_unit) DO NOTHING;

-- 4. Bật Row Level Security (RLS)
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE unit_conversions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'warehouses' AND policyname = 'Public read active warehouses') THEN
    CREATE POLICY "Public read active warehouses" ON warehouses FOR SELECT USING (is_active = TRUE);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'warehouses' AND policyname = 'Admin manage warehouses') THEN
    CREATE POLICY "Admin manage warehouses" ON warehouses FOR ALL USING (
      EXISTS (SELECT 1 FROM users WHERE (id = auth.uid() OR google_id = (SELECT auth.jwt() ->> 'sub')) AND role = 'ADMIN')
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inventory_items' AND policyname = 'Public read active inventory items') THEN
    CREATE POLICY "Public read active inventory items" ON inventory_items FOR SELECT USING (is_active = TRUE);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inventory_items' AND policyname = 'Admin manage inventory items') THEN
    CREATE POLICY "Admin manage inventory items" ON inventory_items FOR ALL USING (
      EXISTS (SELECT 1 FROM users WHERE (id = auth.uid() OR google_id = (SELECT auth.jwt() ->> 'sub')) AND role = 'ADMIN')
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'unit_conversions' AND policyname = 'Public read unit conversions') THEN
    CREATE POLICY "Public read unit conversions" ON unit_conversions FOR SELECT USING (TRUE);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'unit_conversions' AND policyname = 'Admin manage unit conversions') THEN
    CREATE POLICY "Admin manage unit conversions" ON unit_conversions FOR ALL USING (
      EXISTS (SELECT 1 FROM users WHERE (id = auth.uid() OR google_id = (SELECT auth.jwt() ->> 'sub')) AND role = 'ADMIN')
    );
  END IF;
END $$;
