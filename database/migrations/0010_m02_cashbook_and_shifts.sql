-- ============================================================
-- MIGRATION: 0010_m02_cashbook_and_shifts.sql
-- Module: M02 — Doanh Thu, Sổ Quỹ Thu - Chi & Quản Lý Ca Bán Hàng
-- Quy tắc: Không xóa bảng, cột hoặc dữ liệu hiện có. Idempotent (chạy nhiều lần an toàn).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Bổ sung các cột mới cho bảng CASH_DRAWER_SESSIONS (Ca bán hàng)
ALTER TABLE cash_drawer_sessions
  ADD COLUMN IF NOT EXISTS code VARCHAR(50),
  ADD COLUMN IF NOT EXISTS shift_name VARCHAR(100) DEFAULT 'Ca Bán Hàng',
  ADD COLUMN IF NOT EXISTS cash_in BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cash_out BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cash_retained BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cash_handed_over BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS denominations JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_cash_drawer_sessions_code
  ON cash_drawer_sessions(code);

-- 2. Bảng CASH_TRANSACTIONS (Sổ Quỹ Thu - Chi Tiền Mặt & Ngân Hàng)
CREATE TABLE IF NOT EXISTS cash_transactions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id     UUID NOT NULL REFERENCES businesses(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  location_id     UUID NOT NULL REFERENCES locations(id) DEFAULT '00000000-0000-0000-0000-000000000002',
  shift_id        UUID REFERENCES cash_drawer_sessions(id),
  code            VARCHAR(50) NOT NULL UNIQUE,
  type            VARCHAR(20) NOT NULL CHECK (type IN ('RECEIPT', 'PAYMENT')), -- RECEIPT: Thu | PAYMENT: Chi
  category        VARCHAR(50) NOT NULL, -- RAW_MATERIAL, PACKAGING, UTILITIES, SALARY_ADVANCE, BANK_DEPOSIT, OPENING_FLOAT, OTHER
  amount          BIGINT NOT NULL CHECK (amount > 0),
  payment_method  VARCHAR(20) NOT NULL DEFAULT 'CASH' CHECK (payment_method IN ('CASH', 'BANK_TRANSFER')),
  recipient_payer VARCHAR(255),
  notes           TEXT,
  created_by      UUID REFERENCES users(id),
  created_by_name VARCHAR(255),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cash_transactions_loc_time
  ON cash_transactions(business_id, location_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cash_transactions_type_cat
  ON cash_transactions(type, category);

CREATE INDEX IF NOT EXISTS idx_cash_transactions_shift
  ON cash_transactions(shift_id);

-- 3. Bật Row Level Security (RLS) cho bảng cash_transactions
ALTER TABLE cash_transactions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'cash_transactions' AND policyname = 'Admin read cash transactions'
  ) THEN
    CREATE POLICY "Admin read cash transactions" ON cash_transactions FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM users
        WHERE (id = auth.uid() OR google_id = (SELECT auth.jwt() ->> 'sub'))
        AND role IN ('ADMIN', 'OWNER')
      )
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'cash_transactions' AND policyname = 'Admin manage cash transactions'
  ) THEN
    CREATE POLICY "Admin manage cash transactions" ON cash_transactions FOR ALL USING (
      EXISTS (
        SELECT 1 FROM users
        WHERE (id = auth.uid() OR google_id = (SELECT auth.jwt() ->> 'sub'))
        AND role IN ('ADMIN', 'OWNER')
      )
    );
  END IF;
END $$;

