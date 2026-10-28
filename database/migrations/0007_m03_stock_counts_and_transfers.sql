-- ============================================================
-- MIGRATION: 0007_m03_stock_counts_and_transfers.sql
-- Module: M03 — Phiếu Kiểm Kê (Stock Count), Hao Hụt & Điều Chuyển Kho
-- Quy tắc: Idempotent, không xóa dữ liệu cũ, bảo toàn tính tương thích.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Bảng INVENTORY_AUDITS (Phiếu kiểm kê định kỳ & chốt số dư thực tế)
CREATE TABLE IF NOT EXISTS inventory_audits (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id     UUID NOT NULL REFERENCES businesses(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  warehouse_id    UUID NOT NULL REFERENCES warehouses(id),
  audit_number    VARCHAR(50) NOT NULL,
  audit_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  status          VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'COMPLETED', 'CANCELLED')),
  notes           TEXT,
  created_by      UUID REFERENCES users(id),
  approved_by     UUID REFERENCES users(id),
  approved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, audit_number)
);

-- 2. Bảng INVENTORY_AUDIT_ITEMS (Chi tiết đếm thực tế và chênh lệch theo lô)
CREATE TABLE IF NOT EXISTS inventory_audit_items (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  audit_id            UUID NOT NULL REFERENCES inventory_audits(id) ON DELETE CASCADE,
  item_id             UUID NOT NULL REFERENCES inventory_items(id),
  lot_id              UUID REFERENCES inventory_lots(id),
  system_quantity     DECIMAL(12,3) NOT NULL,
  counted_quantity    DECIMAL(12,3) NOT NULL CHECK (counted_quantity >= 0),
  variance_quantity   DECIMAL(12,3) NOT NULL,                   -- counted_quantity - system_quantity
  unit                VARCHAR(30) NOT NULL,
  reason              TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_items_audit ON inventory_audit_items(audit_id);

-- 3. Bảng INVENTORY_TRANSFERS (Phiếu điều chuyển nguyên vật liệu & thành phẩm giữa các kho)
CREATE TABLE IF NOT EXISTS inventory_transfers (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id         UUID NOT NULL REFERENCES businesses(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  from_warehouse_id   UUID NOT NULL REFERENCES warehouses(id),
  to_warehouse_id     UUID NOT NULL REFERENCES warehouses(id),
  transfer_number     VARCHAR(50) NOT NULL,
  transfer_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  status              VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED')),
  notes               TEXT,
  created_by          UUID REFERENCES users(id),
  completed_by        UUID REFERENCES users(id),
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, transfer_number),
  CONSTRAINT chk_different_warehouses CHECK (from_warehouse_id <> to_warehouse_id)
);

-- 4. Bảng INVENTORY_TRANSFER_ITEMS (Chi tiết mặt hàng điều chuyển)
CREATE TABLE IF NOT EXISTS inventory_transfer_items (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transfer_id         UUID NOT NULL REFERENCES inventory_transfers(id) ON DELETE CASCADE,
  item_id             UUID NOT NULL REFERENCES inventory_items(id),
  lot_id              UUID REFERENCES inventory_lots(id),
  quantity            DECIMAL(12,3) NOT NULL CHECK (quantity > 0),
  unit                VARCHAR(30) NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transfer_items_transfer ON inventory_transfer_items(transfer_id);

-- 5. Bật Row Level Security (RLS)
ALTER TABLE inventory_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_audit_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_transfer_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inventory_audits' AND policyname = 'Admin manage audits') THEN
    CREATE POLICY "Admin manage audits" ON inventory_audits FOR ALL USING (
      EXISTS (SELECT 1 FROM users WHERE (id = auth.uid() OR google_id = (SELECT auth.jwt() ->> 'sub')) AND role = 'ADMIN')
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inventory_audit_items' AND policyname = 'Admin manage audit items') THEN
    CREATE POLICY "Admin manage audit items" ON inventory_audit_items FOR ALL USING (
      EXISTS (SELECT 1 FROM users WHERE (id = auth.uid() OR google_id = (SELECT auth.jwt() ->> 'sub')) AND role = 'ADMIN')
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inventory_transfers' AND policyname = 'Admin manage transfers') THEN
    CREATE POLICY "Admin manage transfers" ON inventory_transfers FOR ALL USING (
      EXISTS (SELECT 1 FROM users WHERE (id = auth.uid() OR google_id = (SELECT auth.jwt() ->> 'sub')) AND role = 'ADMIN')
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inventory_transfer_items' AND policyname = 'Admin manage transfer items') THEN
    CREATE POLICY "Admin manage transfer items" ON inventory_transfer_items FOR ALL USING (
      EXISTS (SELECT 1 FROM users WHERE (id = auth.uid() OR google_id = (SELECT auth.jwt() ->> 'sub')) AND role = 'ADMIN')
    );
  END IF;
END $$;
