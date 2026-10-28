-- ============================================================
-- MIGRATION: 0008_m03_pos_inventory_integration.sql
-- Module: M03 — Tích Hợp Trừ Kho Tự Động POS (Pha Quầy vs Chai Đóng Sẵn) & Bảng Payments
-- Quy tắc: Idempotent, không xóa dữ liệu cũ, bảo toàn tính tương thích.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Mở rộng ORDER_ITEMS ghi nhận trạng thái trừ kho & liên kết công thức
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS inventory_status VARCHAR(30) DEFAULT 'PENDING'
    CHECK (inventory_status IN ('PENDING', 'DEDUCTED', 'SKIPPED_NO_RECIPE', 'RETURNED')),
  ADD COLUMN IF NOT EXISTS recipe_id UUID REFERENCES recipes(id);

-- 2. Bảng POS_ORDER_DEDUCTIONS (Bảng chi tiết phân bổ xuất kho theo từng dòng đơn hàng POS)
-- Phục vụ đối soát giá vốn COGS và đảo ngược hoàn kho an toàn khi hủy đơn
CREATE TABLE IF NOT EXISTS pos_order_deductions (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id         UUID NOT NULL REFERENCES businesses(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  order_id            UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id       UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  item_id             UUID NOT NULL REFERENCES inventory_items(id),
  item_type           VARCHAR(30) NOT NULL CHECK (item_type IN ('raw_material', 'packaging', 'finished_good')),
  movement_id         UUID REFERENCES inventory_movements(id),
  lot_id              UUID REFERENCES inventory_lots(id),         -- Lô FEFO được lấy ra
  cost_layer_id       UUID REFERENCES inventory_cost_layers(id),   -- Lớp FIFO được định giá
  deducted_quantity   DECIMAL(12,3) NOT NULL CHECK (deducted_quantity > 0),
  unit_cost           BIGINT NOT NULL CHECK (unit_cost >= 0),
  total_cost          BIGINT NOT NULL CHECK (total_cost >= 0),
  status              VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVERSED')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_deductions_order ON pos_order_deductions(order_id);
CREATE INDEX IF NOT EXISTS idx_pos_deductions_item ON pos_order_deductions(item_id);
CREATE INDEX IF NOT EXISTS idx_pos_deductions_lot ON pos_order_deductions(lot_id);

-- 3. Bảng PAYMENTS (Tách riêng bảng thanh toán chuẩn hóa đa phương thức)
CREATE TABLE IF NOT EXISTS payments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id     UUID NOT NULL REFERENCES businesses(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  location_id     UUID REFERENCES locations(id) DEFAULT '00000000-0000-0000-0000-000000000002',
  order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  payment_method  VARCHAR(30) NOT NULL CHECK (payment_method IN ('CASH', 'BANK_TRANSFER', 'EWALLET')),
  amount          BIGINT NOT NULL CHECK (amount >= 0),
  status          VARCHAR(20) NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('PENDING', 'COMPLETED', 'REFUNDED', 'FAILED')),
  reference_code  VARCHAR(100),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_method ON payments(business_id, location_id, payment_method, created_at DESC);

-- 4. Bật Row Level Security (RLS)
ALTER TABLE pos_order_deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pos_order_deductions' AND policyname = 'Admin manage pos deductions') THEN
    CREATE POLICY "Admin manage pos deductions" ON pos_order_deductions FOR ALL USING (
      EXISTS (SELECT 1 FROM users WHERE (id = auth.uid() OR google_id = (SELECT auth.jwt() ->> 'sub')) AND role = 'ADMIN')
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'payments' AND policyname = 'Admin manage payments') THEN
    CREATE POLICY "Admin manage payments" ON payments FOR ALL USING (
      EXISTS (SELECT 1 FROM users WHERE (id = auth.uid() OR google_id = (SELECT auth.jwt() ->> 'sub')) AND role = 'ADMIN')
    );
  END IF;
END $$;
