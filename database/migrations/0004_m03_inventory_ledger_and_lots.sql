-- ============================================================
-- MIGRATION: 0004_m03_inventory_ledger_and_lots.sql
-- Module: M03 — Lô Vật Lý (FEFO), Sổ Cái Giao Dịch Kho (Movements) & Phiếu Nhập Hàng
-- Quy tắc: Idempotent, không xóa dữ liệu cũ, bảo toàn tính tương thích.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Bảng INVENTORY_LOTS (Quản lý lô hàng vật lý & Hạn sử dụng cho FEFO)
CREATE TABLE IF NOT EXISTS inventory_lots (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id         UUID NOT NULL REFERENCES businesses(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  warehouse_id        UUID NOT NULL REFERENCES warehouses(id),
  item_id             UUID NOT NULL REFERENCES inventory_items(id),
  lot_number          VARCHAR(100) NOT NULL,
  received_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  manufactured_date   DATE,
  expiry_date         DATE,                             -- Hạn sử dụng (tiêu chí sắp xếp FEFO)
  initial_quantity    DECIMAL(12,3) NOT NULL CHECK (initial_quantity >= 0),
  remaining_quantity  DECIMAL(12,3) NOT NULL CHECK (remaining_quantity >= 0),
  status              VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DEPLETED', 'EXPIRED', 'LOCKED')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (warehouse_id, item_id, lot_number)
);

CREATE INDEX IF NOT EXISTS idx_inventory_lots_fefo
  ON inventory_lots(warehouse_id, item_id, expiry_date ASC NULLS LAST, remaining_quantity)
  WHERE status = 'ACTIVE' AND remaining_quantity > 0;

CREATE INDEX IF NOT EXISTS idx_inventory_lots_item_status
  ON inventory_lots(item_id, status);

-- 2. Bảng INVENTORY_RECEIPTS (Phiếu nhập hàng từ nhà cung cấp)
CREATE TABLE IF NOT EXISTS inventory_receipts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id     UUID NOT NULL REFERENCES businesses(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  warehouse_id    UUID NOT NULL REFERENCES warehouses(id),
  receipt_number  VARCHAR(50) NOT NULL,
  supplier_name   VARCHAR(255),
  receipt_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  status          VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'POSTED', 'CANCELLED')),
  total_amount    BIGINT NOT NULL DEFAULT 0,
  idempotency_key VARCHAR(100),
  notes           TEXT,
  created_by      UUID REFERENCES users(id),
  posted_by       UUID REFERENCES users(id),
  posted_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, receipt_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_receipts_idempotency
  ON inventory_receipts(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 3. Bảng INVENTORY_RECEIPT_ITEMS (Chi tiết các mặt hàng trong phiếu nhập)
CREATE TABLE IF NOT EXISTS inventory_receipt_items (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  receipt_id          UUID NOT NULL REFERENCES inventory_receipts(id) ON DELETE CASCADE,
  item_id             UUID NOT NULL REFERENCES inventory_items(id),
  unit                VARCHAR(30) NOT NULL,
  quantity            DECIMAL(12,3) NOT NULL CHECK (quantity > 0),
  conversion_rate     DECIMAL(12,6) NOT NULL DEFAULT 1.0 CHECK (conversion_rate > 0),
  base_quantity       DECIMAL(12,3) NOT NULL CHECK (base_quantity > 0),
  unit_cost           BIGINT NOT NULL CHECK (unit_cost >= 0),       -- Giá vốn VND / đơn vị cơ sở
  total_cost          BIGINT NOT NULL CHECK (total_cost >= 0),
  lot_number          VARCHAR(100),
  manufactured_date   DATE,
  expiry_date         DATE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_receipt_items_receipt ON inventory_receipt_items(receipt_id);
CREATE INDEX IF NOT EXISTS idx_receipt_items_item ON inventory_receipt_items(item_id);

-- 4. Bảng INVENTORY_MOVEMENTS (Sổ cái biến động kho duy nhất - Immutable Ledger)
CREATE TABLE IF NOT EXISTS inventory_movements (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id         UUID NOT NULL REFERENCES businesses(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  warehouse_id        UUID NOT NULL REFERENCES warehouses(id),
  item_id             UUID NOT NULL REFERENCES inventory_items(id),
  lot_id              UUID REFERENCES inventory_lots(id),
  movement_type       VARCHAR(40) NOT NULL CHECK (movement_type IN (
    'IN_PURCHASE',       -- Nhập mua hàng từ NCC
    'OUT_PRODUCTION',    -- Xuất NVL & bao bì để sản xuất
    'IN_PRODUCTION',     -- Nhập thành phẩm sản xuất đạt chuẩn
    'OUT_SALE_POS',      -- Xuất bán tại quầy POS (trừ NVL theo công thức hoặc trừ chai)
    'IN_RETURN_POS',     -- Nhập trả hàng POS có kiểm soát
    'OUT_LOSS',          -- Xuất hao hụt / đổ vỡ / hết hạn
    'ADJUST_AUDIT',      -- Điều chỉnh sau kiểm kê kho
    'TRANSFER_OUT',      -- Xuất điều chuyển kho
    'TRANSFER_IN'        -- Nhập điều chuyển kho
  )),
  quantity            DECIMAL(12,3) NOT NULL,                       -- Dương = Tăng tồn; Âm = Giảm tồn
  base_unit           VARCHAR(30) NOT NULL,
  reference_doc_type  VARCHAR(40) NOT NULL,                         -- 'RECEIPT', 'PRODUCTION', 'ORDER', 'AUDIT', 'TRANSFER', 'LOSS'
  reference_doc_id    UUID NOT NULL,
  reference_doc_number VARCHAR(50),
  idempotency_key     VARCHAR(100),
  actor_id            UUID REFERENCES users(id),
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_movements_idempotency
  ON inventory_movements(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_movements_wh_item_created
  ON inventory_movements(warehouse_id, item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_movements_ref_doc
  ON inventory_movements(reference_doc_type, reference_doc_id);

-- 5. Bật Row Level Security (RLS)
ALTER TABLE inventory_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_receipt_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inventory_lots' AND policyname = 'Admin read lots') THEN
    CREATE POLICY "Admin read lots" ON inventory_lots FOR SELECT USING (
      EXISTS (SELECT 1 FROM users WHERE (id = auth.uid() OR google_id = (SELECT auth.jwt() ->> 'sub')) AND role = 'ADMIN')
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inventory_lots' AND policyname = 'Admin manage lots') THEN
    CREATE POLICY "Admin manage lots" ON inventory_lots FOR ALL USING (
      EXISTS (SELECT 1 FROM users WHERE (id = auth.uid() OR google_id = (SELECT auth.jwt() ->> 'sub')) AND role = 'ADMIN')
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inventory_receipts' AND policyname = 'Admin manage receipts') THEN
    CREATE POLICY "Admin manage receipts" ON inventory_receipts FOR ALL USING (
      EXISTS (SELECT 1 FROM users WHERE (id = auth.uid() OR google_id = (SELECT auth.jwt() ->> 'sub')) AND role = 'ADMIN')
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inventory_receipt_items' AND policyname = 'Admin manage receipt items') THEN
    CREATE POLICY "Admin manage receipt items" ON inventory_receipt_items FOR ALL USING (
      EXISTS (SELECT 1 FROM users WHERE (id = auth.uid() OR google_id = (SELECT auth.jwt() ->> 'sub')) AND role = 'ADMIN')
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inventory_movements' AND policyname = 'Admin manage movements') THEN
    CREATE POLICY "Admin manage movements" ON inventory_movements FOR ALL USING (
      EXISTS (SELECT 1 FROM users WHERE (id = auth.uid() OR google_id = (SELECT auth.jwt() ->> 'sub')) AND role = 'ADMIN')
    );
  END IF;
END $$;
