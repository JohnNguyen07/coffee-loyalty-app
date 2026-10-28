-- ============================================================
-- MIGRATION: 0005_m03_fifo_cost_layers_and_allocations.sql
-- Module: M03 — Lớp Giá Vốn FIFO & Phân Bổ Giá Vốn Chi Tiết (Tách Biệt Lô FEFO)
-- Quy tắc: Idempotent, không xóa dữ liệu cũ, bảo toàn tính tương thích.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Bảng INVENTORY_COST_LAYERS (Lớp giá vốn FIFO cho mỗi lần nhập kho đủ điều kiện)
CREATE TABLE IF NOT EXISTS inventory_cost_layers (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id         UUID NOT NULL REFERENCES businesses(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  warehouse_id        UUID NOT NULL REFERENCES warehouses(id),
  item_id             UUID NOT NULL REFERENCES inventory_items(id),
  source_doc_type     VARCHAR(40) NOT NULL CHECK (source_doc_type IN ('RECEIPT', 'PRODUCTION', 'INITIAL_BALANCE', 'RETURN')),
  source_doc_id       UUID NOT NULL,
  source_doc_number   VARCHAR(50),
  layer_order         BIGINT NOT NULL,                      -- Thứ tự FIFO tăng dần đơn điệu
  received_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  initial_quantity    DECIMAL(12,3) NOT NULL CHECK (initial_quantity > 0),
  remaining_quantity  DECIMAL(12,3) NOT NULL CHECK (remaining_quantity >= 0),
  unit_cost           BIGINT NOT NULL CHECK (unit_cost >= 0), -- Đơn giá vốn nguyên VND / đơn vị cơ sở
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (warehouse_id, item_id, layer_order)
);

CREATE INDEX IF NOT EXISTS idx_cost_layers_fifo
  ON inventory_cost_layers(warehouse_id, item_id, layer_order ASC)
  WHERE remaining_quantity > 0;

CREATE INDEX IF NOT EXISTS idx_cost_layers_src_doc
  ON inventory_cost_layers(source_doc_type, source_doc_id);

-- 2. Bảng INVENTORY_COST_ALLOCATIONS (Bảng chi tiết phân bổ giá vốn cho từng giao dịch xuất kho)
-- Lưu đồng thời: Lô vật lý FEFO và Lớp giá vốn FIFO, bảo toàn tính độc lập kiểm toán
CREATE TABLE IF NOT EXISTS inventory_cost_allocations (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id             UUID NOT NULL REFERENCES businesses(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  movement_id             UUID NOT NULL REFERENCES inventory_movements(id) ON DELETE CASCADE,
  cost_layer_id           UUID NOT NULL REFERENCES inventory_cost_layers(id),
  physical_lot_id         UUID REFERENCES inventory_lots(id),         -- Lô vật lý FEFO lấy ra
  allocated_quantity      DECIMAL(12,3) NOT NULL CHECK (allocated_quantity > 0),
  unit_cost               BIGINT NOT NULL CHECK (unit_cost >= 0),     -- Đơn giá vốn lớp FIFO tại thời điểm ghi sổ
  total_cost              BIGINT NOT NULL CHECK (total_cost >= 0),    -- allocated_quantity * unit_cost
  is_lot_cost_divergent   BOOLEAN NOT NULL DEFAULT FALSE,             -- Đánh dấu khi lô FEFO khác lớp FIFO
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cost_allocations_movement ON inventory_cost_allocations(movement_id);
CREATE INDEX IF NOT EXISTS idx_cost_allocations_layer ON inventory_cost_allocations(cost_layer_id);
CREATE INDEX IF NOT EXISTS idx_cost_allocations_lot ON inventory_cost_allocations(physical_lot_id);

-- 3. Bật Row Level Security (RLS)
ALTER TABLE inventory_cost_layers ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_cost_allocations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inventory_cost_layers' AND policyname = 'Admin manage cost layers') THEN
    CREATE POLICY "Admin manage cost layers" ON inventory_cost_layers FOR ALL USING (
      EXISTS (SELECT 1 FROM users WHERE (id = auth.uid() OR google_id = (SELECT auth.jwt() ->> 'sub')) AND role = 'ADMIN')
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inventory_cost_allocations' AND policyname = 'Admin manage cost allocations') THEN
    CREATE POLICY "Admin manage cost allocations" ON inventory_cost_allocations FOR ALL USING (
      EXISTS (SELECT 1 FROM users WHERE (id = auth.uid() OR google_id = (SELECT auth.jwt() ->> 'sub')) AND role = 'ADMIN')
    );
  END IF;
END $$;

