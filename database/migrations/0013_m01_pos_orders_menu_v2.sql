-- ============================================================
-- MIGRATION: 0013_m01_pos_orders_menu_v2.sql
-- Module: M01 (Module A) — Fulfillment Progress, Delivery Fees, Linked Web Orders, Menu Metadata & Multi-location RLS
-- Quy tắc: Không xóa bảng, cột hoặc dữ liệu hiện có. Idempotent (chạy nhiều lần an toàn).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Mở rộng bảng ORDERS cho tiến độ phục vụ (Fulfillment), phí ship, địa chỉ giao & liên kết đơn Web -> POS
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS fulfillment_status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS shipping_fee BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS customer_address TEXT,
  ADD COLUMN IF NOT EXISTS linked_order_id UUID REFERENCES orders(id),
  ADD COLUMN IF NOT EXISTS prepared_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

UPDATE orders
SET fulfillment_status = CASE
  WHEN status = 'CANCELLED' THEN 'CANCELLED'
  WHEN status = 'CONFIRMED' AND COALESCE(channel, CASE WHEN order_code LIKE 'POS-%' THEN 'POS' ELSE 'WEB' END) = 'POS' THEN 'COMPLETED'
  WHEN status = 'CONFIRMED' THEN 'PREPARING'
  ELSE 'PENDING'
END
WHERE fulfillment_status = 'PENDING'
  AND status IN ('CONFIRMED', 'CANCELLED');

CREATE INDEX IF NOT EXISTS idx_orders_biz_loc_fulfillment
  ON orders(business_id, location_id, fulfillment_status, created_at DESC);

-- 2. Mở rộng bảng MENU_ITEMS cho tùy biến đa điểm bán & thông tin hiển thị thực đơn
ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES locations(id),
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS badge_label VARCHAR(50),
  ADD COLUMN IF NOT EXISTS has_milk_choice BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS shelf_life VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_menu_items_location
  ON menu_items(business_id, location_id, is_available);

-- 3. Cập nhật Row Level Security (RLS) đa điểm bán cho ORDERS, ORDER_ITEMS & ORDER_AUDIT_LOGS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_audit_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regprocedure('rbac_user_has_location_access(uuid,uuid)') IS NOT NULL
     AND to_regprocedure('rbac_user_has_business_role(uuid,text[])') IS NOT NULL THEN

    -- orders policies (nhân sự quầy/quản lý theo điểm bán)
    DROP POLICY IF EXISTS "RBAC staff read location orders" ON orders;
    DROP POLICY IF EXISTS "RBAC staff manage location orders" ON orders;

    CREATE POLICY "RBAC staff read location orders" ON orders FOR SELECT USING (
      (
        rbac_user_has_business_role(business_id, ARRAY['OWNER', 'ADMIN', 'MANAGER', 'CASHIER'])
        AND rbac_user_has_location_access(business_id, location_id)
      )
      OR user_id = auth.uid()
    );

    CREATE POLICY "RBAC staff manage location orders" ON orders FOR ALL USING (
      rbac_user_has_business_role(business_id, ARRAY['OWNER', 'ADMIN', 'MANAGER', 'CASHIER'])
      AND rbac_user_has_location_access(business_id, location_id)
    ) WITH CHECK (
      rbac_user_has_business_role(business_id, ARRAY['OWNER', 'ADMIN', 'MANAGER', 'CASHIER'])
      AND rbac_user_has_location_access(business_id, location_id)
    );

    -- order_items policies
    DROP POLICY IF EXISTS "RBAC staff read location order items" ON order_items;
    DROP POLICY IF EXISTS "RBAC staff manage location order items" ON order_items;

    CREATE POLICY "RBAC staff read location order items" ON order_items FOR SELECT USING (
      rbac_user_has_business_role(business_id, ARRAY['OWNER', 'ADMIN', 'MANAGER', 'CASHIER'])
      AND rbac_user_has_location_access(business_id, location_id)
    );

    CREATE POLICY "RBAC staff manage location order items" ON order_items FOR ALL USING (
      rbac_user_has_business_role(business_id, ARRAY['OWNER', 'ADMIN', 'MANAGER', 'CASHIER'])
      AND rbac_user_has_location_access(business_id, location_id)
    ) WITH CHECK (
      rbac_user_has_business_role(business_id, ARRAY['OWNER', 'ADMIN', 'MANAGER', 'CASHIER'])
      AND rbac_user_has_location_access(business_id, location_id)
    );

    -- order_audit_logs policies
    DROP POLICY IF EXISTS "Admin read audit logs" ON order_audit_logs;
    DROP POLICY IF EXISTS "RBAC staff read location order audit logs" ON order_audit_logs;
    DROP POLICY IF EXISTS "RBAC staff insert location order audit logs" ON order_audit_logs;

    CREATE POLICY "RBAC staff read location order audit logs" ON order_audit_logs FOR SELECT USING (
      rbac_user_has_business_role(business_id, ARRAY['OWNER', 'ADMIN', 'MANAGER', 'CASHIER'])
      AND rbac_user_has_location_access(business_id, location_id)
    );

    CREATE POLICY "RBAC staff insert location order audit logs" ON order_audit_logs FOR INSERT WITH CHECK (
      rbac_user_has_business_role(business_id, ARRAY['OWNER', 'ADMIN', 'MANAGER', 'CASHIER'])
      AND rbac_user_has_location_access(business_id, location_id)
    );

  ELSE
    -- Fallback khi chưa chạy migration 0009
    DROP POLICY IF EXISTS "Admin read audit logs" ON order_audit_logs;
    CREATE POLICY "Admin read audit logs" ON order_audit_logs FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM users
        WHERE (id = auth.uid() OR google_id = (SELECT auth.jwt() ->> 'sub'))
        AND (role IN ('ADMIN', 'OWNER') OR COALESCE(staff_role, '') IN ('OWNER', 'ADMIN', 'MANAGER', 'CASHIER'))
      )
    );
  END IF;
END $$;
