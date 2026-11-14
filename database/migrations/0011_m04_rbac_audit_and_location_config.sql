-- ============================================================
-- MIGRATION: 0011_m04_rbac_audit_and_location_config.sql
-- Module: M04 (Module D) — Location Operational Config, Business Profile & RBAC Audit Logs
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Mở rộng bảng BUSINESSES với Email liên hệ và Chân trang phiếu in mặc định
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS default_receipt_footer TEXT DEFAULT 'Cảm ơn quý khách — Hẹn gặp lại tại Ủ LAB!';

UPDATE businesses
SET default_receipt_footer = 'Cảm ơn quý khách — Hẹn gặp lại tại Ủ LAB!'
WHERE default_receipt_footer IS NULL;

-- 2. Mở rộng bảng LOCATIONS với cấu hình vận hành điểm bán
ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS opening_hours VARCHAR(100) DEFAULT '06:30 - 22:00',
  ADD COLUMN IF NOT EXISTS manager_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS default_opening_cash BIGINT NOT NULL DEFAULT 500000,
  ADD COLUMN IF NOT EXISTS accept_web_orders BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS receipt_footer TEXT;

UPDATE locations
SET opening_hours = '06:30 - 22:00'
WHERE opening_hours IS NULL;

-- 3. Tạo bảng RBAC_AUDIT_LOGS lưu vết mọi thao tác quản trị điểm bán, nhân sự, phân quyền
CREATE TABLE IF NOT EXISTS rbac_audit_logs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  actor_user_id UUID,
  actor_name    VARCHAR(255) NOT NULL,
  actor_role    VARCHAR(30) NOT NULL,
  action        VARCHAR(80) NOT NULL,
  target_type   VARCHAR(50) NOT NULL,
  target_id     VARCHAR(100),
  target_name   VARCHAR(255),
  summary       TEXT NOT NULL,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rbac_audit_logs_biz_created
  ON rbac_audit_logs(business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rbac_audit_logs_action
  ON rbac_audit_logs(business_id, action, created_at DESC);

-- 4. Thiết lập Row Level Security (RLS) cho rbac_audit_logs
ALTER TABLE rbac_audit_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Owner and Admin can read rbac audit logs" ON rbac_audit_logs;
  CREATE POLICY "Owner and Admin can read rbac audit logs" ON rbac_audit_logs FOR SELECT USING (
    rbac_user_has_business_role(business_id, ARRAY['OWNER', 'ADMIN'])
  );

  DROP POLICY IF EXISTS "Owner and Admin can insert rbac audit logs" ON rbac_audit_logs;
  CREATE POLICY "Owner and Admin can insert rbac audit logs" ON rbac_audit_logs FOR INSERT WITH CHECK (
    rbac_user_has_business_role(business_id, ARRAY['OWNER', 'ADMIN'])
  );
END $$;
