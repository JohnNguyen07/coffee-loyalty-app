-- ============================================================
-- MIGRATION: 0002_m02_revenue_reconciliation.sql
-- Module: M02 — Ghi Nhận Doanh Thu Tại Chỗ & Đối Soát Tiền Mặt
-- Quy tắc: Không xóa bảng, cột hoặc dữ liệu hiện có. Idempotent (chạy nhiều lần an toàn).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Bảng CASH_DRAWER_SESSIONS (Phiên két tiền mặt / Ca bán hàng)
CREATE TABLE IF NOT EXISTS cash_drawer_sessions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id     UUID NOT NULL REFERENCES businesses(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  location_id     UUID NOT NULL REFERENCES locations(id) DEFAULT '00000000-0000-0000-0000-000000000002',
  opened_by       UUID REFERENCES users(id),
  closed_by       UUID REFERENCES users(id),
  opened_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at       TIMESTAMPTZ,
  opening_cash    BIGINT NOT NULL DEFAULT 0,       -- Tiền thối đầu ca
  cash_sales      BIGINT NOT NULL DEFAULT 0,       -- Tiền mặt thu từ bán hàng
  cash_refunds    BIGINT NOT NULL DEFAULT 0,       -- Tiền mặt hoàn lại cho đơn hủy
  cash_payouts    BIGINT NOT NULL DEFAULT 0,       -- Tiền mặt chi ra tại quầy (mua đá, sữa...)
  expected_cash   BIGINT NOT NULL DEFAULT 0,       -- Tiền mặt lý thuyết trong két
  actual_cash     BIGINT,                          -- Tiền mặt thực tế kiểm đếm
  cash_variance   BIGINT NOT NULL DEFAULT 0,       -- Chênh lệch (actual - expected): dương = thừa, âm = thiếu
  status          VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cash_drawer_sessions_loc_status
  ON cash_drawer_sessions(business_id, location_id, status);

CREATE INDEX IF NOT EXISTS idx_cash_drawer_sessions_opened_at
  ON cash_drawer_sessions(opened_at DESC);

-- 2. Bật Row Level Security (RLS)
ALTER TABLE cash_drawer_sessions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'cash_drawer_sessions' AND policyname = 'Admin read cash drawer sessions'
  ) THEN
    CREATE POLICY "Admin read cash drawer sessions" ON cash_drawer_sessions FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM users
        WHERE (id = auth.uid() OR google_id = (SELECT auth.jwt() ->> 'sub'))
        AND role = 'ADMIN'
      )
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'cash_drawer_sessions' AND policyname = 'Admin manage cash drawer sessions'
  ) THEN
    CREATE POLICY "Admin manage cash drawer sessions" ON cash_drawer_sessions FOR ALL USING (
      EXISTS (
        SELECT 1 FROM users
        WHERE (id = auth.uid() OR google_id = (SELECT auth.jwt() ->> 'sub'))
        AND role = 'ADMIN'
      )
    );
  END IF;
END $$;
