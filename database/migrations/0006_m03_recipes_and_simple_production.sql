-- ============================================================
-- MIGRATION: 0006_m03_recipes_and_simple_production.sql
-- Module: M03 — Công Thức Pha Chế (Đã Duyệt) & Lệnh Sản Xuất Đơn Giản (Thành Phẩm Đóng Chai)
-- Quy tắc: Idempotent, không xóa dữ liệu cũ, bảo toàn tính tương thích.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Bảng RECIPES (Công thức pha chế / sản xuất đã được ban hành & duyệt)
CREATE TABLE IF NOT EXISTS recipes (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id         UUID NOT NULL REFERENCES businesses(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  target_item_id      UUID NOT NULL REFERENCES inventory_items(id),
  target_size         VARCHAR(20) DEFAULT 'STANDARD',           -- 'M', 'L', 'Chai', 'STANDARD'
  version             INT NOT NULL DEFAULT 1,
  name                VARCHAR(255) NOT NULL,
  yield_quantity      DECIMAL(12,3) NOT NULL DEFAULT 1.0 CHECK (yield_quantity > 0),
  yield_unit          VARCHAR(30) NOT NULL,                     -- 'ly', 'chai'
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  approved_by         UUID REFERENCES users(id),
  approved_at         TIMESTAMPTZ,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, target_item_id, target_size, version)
);

CREATE INDEX IF NOT EXISTS idx_recipes_lookup
  ON recipes(business_id, target_item_id, target_size, is_active);

-- 2. Bảng RECIPE_ITEMS (Định mức nguyên vật liệu & bao bì cho từng công thức)
CREATE TABLE IF NOT EXISTS recipe_items (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipe_id           UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  ingredient_item_id  UUID NOT NULL REFERENCES inventory_items(id),
  standard_quantity   DECIMAL(12,3) NOT NULL CHECK (standard_quantity > 0),
  unit                VARCHAR(30) NOT NULL,                     -- 'g', 'ml', 'cai', 'hop'
  is_packaging        BOOLEAN NOT NULL DEFAULT FALSE,           -- Phân biệt nguyên liệu vs bao bì (ly, nắp, chai, ống hút)
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recipe_items_recipe ON recipe_items(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_items_ingredient ON recipe_items(ingredient_item_id);

-- 3. Bảng PRODUCTION_ORDERS (Lệnh sản xuất thành phẩm đóng chai đơn giản)
CREATE TABLE IF NOT EXISTS production_orders (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id             UUID NOT NULL REFERENCES businesses(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  warehouse_id            UUID NOT NULL REFERENCES warehouses(id),
  order_code              VARCHAR(50) NOT NULL,
  recipe_id               UUID NOT NULL REFERENCES recipes(id),
  recipe_version_snapshot INT NOT NULL,                          -- Khóa phiên bản công thức tại thời điểm sản xuất
  finished_good_item_id   UUID NOT NULL REFERENCES inventory_items(id),
  planned_quantity        DECIMAL(12,3) NOT NULL CHECK (planned_quantity > 0),
  actual_quantity         DECIMAL(12,3) NOT NULL CHECK (actual_quantity >= 0),
  status                  VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'POSTED', 'CANCELLED')),
  total_material_cost     BIGINT NOT NULL DEFAULT 0,             -- Tổng chi phí NVL + Bao bì thực tế tiêu hao (FIFO)
  unit_finished_cost      BIGINT NOT NULL DEFAULT 0,             -- Giá vốn 1 chai = total_material_cost / actual_quantity
  variance_reason         TEXT,
  idempotency_key         VARCHAR(100),
  created_by              UUID REFERENCES users(id),
  posted_by               UUID REFERENCES users(id),
  posted_at               TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, order_code)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_production_orders_idempotency
  ON production_orders(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 4. Bảng PRODUCTION_ORDER_ITEMS (Chi tiết NVL & bao bì thực tế tiêu hao)
CREATE TABLE IF NOT EXISTS production_order_items (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  production_order_id UUID NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
  item_id             UUID NOT NULL REFERENCES inventory_items(id),
  planned_quantity    DECIMAL(12,3) NOT NULL CHECK (planned_quantity > 0),
  actual_quantity     DECIMAL(12,3) NOT NULL CHECK (actual_quantity >= 0),
  unit                VARCHAR(30) NOT NULL,
  is_packaging        BOOLEAN NOT NULL DEFAULT FALSE,
  unit_cost           BIGINT NOT NULL DEFAULT 0,
  total_cost          BIGINT NOT NULL DEFAULT 0,
  variance_reason     TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prod_items_order ON production_order_items(production_order_id);

-- 5. Bật Row Level Security (RLS)
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_order_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'recipes' AND policyname = 'Public read active recipes') THEN
    CREATE POLICY "Public read active recipes" ON recipes FOR SELECT USING (is_active = TRUE);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'recipes' AND policyname = 'Admin manage recipes') THEN
    CREATE POLICY "Admin manage recipes" ON recipes FOR ALL USING (
      EXISTS (SELECT 1 FROM users WHERE (id = auth.uid() OR google_id = (SELECT auth.jwt() ->> 'sub')) AND role = 'ADMIN')
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'recipe_items' AND policyname = 'Public read recipe items') THEN
    CREATE POLICY "Public read recipe items" ON recipe_items FOR SELECT USING (TRUE);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'recipe_items' AND policyname = 'Admin manage recipe items') THEN
    CREATE POLICY "Admin manage recipe items" ON recipe_items FOR ALL USING (
      EXISTS (SELECT 1 FROM users WHERE (id = auth.uid() OR google_id = (SELECT auth.jwt() ->> 'sub')) AND role = 'ADMIN')
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'production_orders' AND policyname = 'Admin manage production orders') THEN
    CREATE POLICY "Admin manage production orders" ON production_orders FOR ALL USING (
      EXISTS (SELECT 1 FROM users WHERE (id = auth.uid() OR google_id = (SELECT auth.jwt() ->> 'sub')) AND role = 'ADMIN')
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'production_order_items' AND policyname = 'Admin manage production order items') THEN
    CREATE POLICY "Admin manage production order items" ON production_order_items FOR ALL USING (
      EXISTS (SELECT 1 FROM users WHERE (id = auth.uid() OR google_id = (SELECT auth.jwt() ->> 'sub')) AND role = 'ADMIN')
    );
  END IF;
END $$;

