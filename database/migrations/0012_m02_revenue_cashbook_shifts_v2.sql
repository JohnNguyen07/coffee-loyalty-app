-- ============================================================
-- MIGRATION: 0012_m02_revenue_cashbook_shifts_v2.sql
-- Module: M02 (Module B) — Voiding Cashbook Vouchers, Shift Linkages, Idempotency & Multi-location RLS
-- Quy tắc: Không xóa bảng, cột hoặc dữ liệu hiện có. Idempotent (chạy nhiều lần an toàn).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Mở rộng bảng CASH_TRANSACTIONS với trạng thái hủy phiếu (VOIDED), người hủy & idempotency_key
ALTER TABLE cash_transactions
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED', 'VOIDED')),
  ADD COLUMN IF NOT EXISTS void_reason TEXT,
  ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS voided_by_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100);

UPDATE cash_transactions
SET status = 'POSTED'
WHERE status IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_transactions_idempotency
  ON cash_transactions(business_id, location_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cash_transactions_loc_status
  ON cash_transactions(business_id, location_id, status, created_at DESC);

-- 2. Mở rộng bảng CASH_DRAWER_SESSIONS với số lượng đơn hàng trong ca & idempotency_key
ALTER TABLE cash_drawer_sessions
  ADD COLUMN IF NOT EXISTS order_count BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_drawer_sessions_idempotency
  ON cash_drawer_sessions(business_id, location_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 3. Cập nhật Row Level Security (RLS) đa điểm bán cho cash_drawer_sessions & cash_transactions
ALTER TABLE cash_drawer_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_transactions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regprocedure('rbac_user_has_location_access(uuid,uuid)') IS NOT NULL
     AND to_regprocedure('rbac_user_has_business_role(uuid,text[])') IS NOT NULL THEN

    -- cash_drawer_sessions policies
    DROP POLICY IF EXISTS "Admin read cash drawer sessions" ON cash_drawer_sessions;
    DROP POLICY IF EXISTS "Admin manage cash drawer sessions" ON cash_drawer_sessions;
    DROP POLICY IF EXISTS "RBAC finance read cash drawer sessions" ON cash_drawer_sessions;
    DROP POLICY IF EXISTS "RBAC finance manage cash drawer sessions" ON cash_drawer_sessions;

    CREATE POLICY "RBAC finance read cash drawer sessions" ON cash_drawer_sessions FOR SELECT USING (
      rbac_user_has_business_role(business_id, ARRAY['OWNER', 'ADMIN', 'MANAGER'])
      AND rbac_user_has_location_access(business_id, location_id)
    );

    CREATE POLICY "RBAC finance manage cash drawer sessions" ON cash_drawer_sessions FOR ALL USING (
      rbac_user_has_business_role(business_id, ARRAY['OWNER', 'ADMIN', 'MANAGER'])
      AND rbac_user_has_location_access(business_id, location_id)
    ) WITH CHECK (
      rbac_user_has_business_role(business_id, ARRAY['OWNER', 'ADMIN', 'MANAGER'])
      AND rbac_user_has_location_access(business_id, location_id)
    );

    -- cash_transactions policies
    DROP POLICY IF EXISTS "Admin read cash transactions" ON cash_transactions;
    DROP POLICY IF EXISTS "Admin manage cash transactions" ON cash_transactions;
    DROP POLICY IF EXISTS "RBAC finance read cash transactions" ON cash_transactions;
    DROP POLICY IF EXISTS "RBAC finance manage cash transactions" ON cash_transactions;

    CREATE POLICY "RBAC finance read cash transactions" ON cash_transactions FOR SELECT USING (
      rbac_user_has_business_role(business_id, ARRAY['OWNER', 'ADMIN', 'MANAGER'])
      AND rbac_user_has_location_access(business_id, location_id)
    );

    CREATE POLICY "RBAC finance manage cash transactions" ON cash_transactions FOR ALL USING (
      rbac_user_has_business_role(business_id, ARRAY['OWNER', 'ADMIN', 'MANAGER'])
      AND rbac_user_has_location_access(business_id, location_id)
    ) WITH CHECK (
      rbac_user_has_business_role(business_id, ARRAY['OWNER', 'ADMIN', 'MANAGER'])
      AND rbac_user_has_location_access(business_id, location_id)
    );

  ELSE
    -- Fallback khi chưa chạy migration 0009
    DROP POLICY IF EXISTS "Admin read cash drawer sessions" ON cash_drawer_sessions;
    DROP POLICY IF EXISTS "Admin manage cash drawer sessions" ON cash_drawer_sessions;

    CREATE POLICY "Admin read cash drawer sessions" ON cash_drawer_sessions FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM users
        WHERE (id = auth.uid() OR google_id = (SELECT auth.jwt() ->> 'sub'))
        AND (role IN ('ADMIN', 'OWNER') OR COALESCE(staff_role, '') IN ('OWNER', 'ADMIN', 'MANAGER'))
      )
    );

    CREATE POLICY "Admin manage cash drawer sessions" ON cash_drawer_sessions FOR ALL USING (
      EXISTS (
        SELECT 1 FROM users
        WHERE (id = auth.uid() OR google_id = (SELECT auth.jwt() ->> 'sub'))
        AND (role IN ('ADMIN', 'OWNER') OR COALESCE(staff_role, '') IN ('OWNER', 'ADMIN', 'MANAGER'))
      )
    );

    DROP POLICY IF EXISTS "Admin read cash transactions" ON cash_transactions;
    DROP POLICY IF EXISTS "Admin manage cash transactions" ON cash_transactions;

    CREATE POLICY "Admin read cash transactions" ON cash_transactions FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM users
        WHERE (id = auth.uid() OR google_id = (SELECT auth.jwt() ->> 'sub'))
        AND (role IN ('ADMIN', 'OWNER') OR COALESCE(staff_role, '') IN ('OWNER', 'ADMIN', 'MANAGER'))
      )
    );

    CREATE POLICY "Admin manage cash transactions" ON cash_transactions FOR ALL USING (
      EXISTS (
        SELECT 1 FROM users
        WHERE (id = auth.uid() OR google_id = (SELECT auth.jwt() ->> 'sub'))
        AND (role IN ('ADMIN', 'OWNER') OR COALESCE(staff_role, '') IN ('OWNER', 'ADMIN', 'MANAGER'))
      )
    );
  END IF;
END $$;
