-- ============================================================
-- MIGRATION: 0009_m04_business_locations_rbac.sql
-- Module: M04 — Business, Locations & Role-Based Access Control (RBAC)
-- Vai trò MVP:
--   - OWNER: Toàn quyền trên doanh nghiệp (tạo/sửa điểm bán, gán quyền, xem toàn bộ dữ liệu).
--   - ADMIN: Quản lý theo quyền được cấp (quản lý điểm bán, nhân viên cấp dưới).
--   - MANAGER: Quản lý các điểm bán được phân công (xem báo cáo, duyệt ca, hủy đơn điểm bán).
--   - CASHIER: Thao tác POS tại điểm bán được cấp; không có quyền quản trị.
--   - INVENTORY_STAFF: Nghiệp vụ kho theo phạm vi được cấp; không có quyền bán hàng/doanh thu.
-- Quy tắc:
--   - Một business có nhiều locations.
--   - Một nhân viên có thể được cấp quyền ở nhiều locations.
--   - Chặn tuyệt đối truy cập chéo business.
--   - Không tạo hoặc giả lập tình trạng đăng ký pháp lý đã được xác nhận.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Đảm bảo bảng BUSINESSES đầy đủ trường
CREATE TABLE IF NOT EXISTS businesses (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code        VARCHAR(50) UNIQUE NOT NULL,
  name        VARCHAR(255) NOT NULL,
  tax_code    VARCHAR(50),
  phone       VARCHAR(30),
  address     TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed Business mặc định Ủ LAB nếu chưa có
INSERT INTO businesses (id, code, name, phone, address)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'ULAB',
  'Ủ LAB — Matcha & Cold Brew',
  '0909000001',
  'TP. Hồ Chí Minh, Việt Nam'
)
ON CONFLICT (code) DO NOTHING;

-- Seed Business thứ hai phục vụ kiểm thử cô lập đa khách thuê (Multi-tenant test)
INSERT INTO businesses (id, code, name, phone, address)
VALUES (
  '00000000-0000-0000-0000-000000000021',
  'TEST-BIZ2',
  'Cà Phê Thử Nghiệm Đối Soát B',
  '0909000021',
  'Hà Nội, Việt Nam'
)
ON CONFLICT (code) DO NOTHING;

-- 2. Đảm bảo bảng LOCATIONS đầy đủ trường
CREATE TABLE IF NOT EXISTS locations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  code        VARCHAR(50) NOT NULL,
  name        VARCHAR(255) NOT NULL,
  address     TEXT,
  phone       VARCHAR(30),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, code)
);

-- Seed điểm bán 1: Ủ LAB Quầy Chính
INSERT INTO locations (id, business_id, code, name, address, phone)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'ULAB-MAIN',
  'Ủ LAB — Quầy Chính (Hồ Con Rùa)',
  'Công Trường Quốc Tế, Quận 3, TP. Hồ Chí Minh',
  '0909000001'
)
ON CONFLICT (business_id, code) DO NOTHING;

-- Seed điểm bán 2: Ủ LAB Chi Nhánh Quận 1
INSERT INTO locations (id, business_id, code, name, address, phone)
VALUES (
  '00000000-0000-0000-0000-000000000012',
  '00000000-0000-0000-0000-000000000001',
  'ULAB-Q1',
  'Ủ LAB — Chi nhánh Nguyễn Huệ',
  'Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh',
  '0909000012'
)
ON CONFLICT (business_id, code) DO NOTHING;

-- Seed điểm bán 3: Chi nhánh Doanh nghiệp B (Dùng test cô lập cross-tenant)
INSERT INTO locations (id, business_id, code, name, address, phone)
VALUES (
  '00000000-0000-0000-0000-000000000022',
  '00000000-0000-0000-0000-000000000021',
  'BIZ2-LOC1',
  'Điểm bán Chi Nhánh B — Hoàn Kiếm',
  'Hoàn Kiếm, Hà Nội',
  '0909000022'
)
ON CONFLICT (business_id, code) DO NOTHING;

-- 3. Bảng BUSINESS_MEMBERSHIPS (Phân quyền vai trò người dùng trong doanh nghiệp)
CREATE TABLE IF NOT EXISTS business_memberships (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        VARCHAR(30) NOT NULL CHECK (role IN ('OWNER', 'ADMIN', 'MANAGER', 'CASHIER', 'INVENTORY_STAFF')),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_biz_user ON business_memberships(business_id, user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_user_active ON business_memberships(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_memberships_biz_role ON business_memberships(business_id, role);

-- 4. Bảng USER_LOCATION_ASSIGNMENTS (Một nhân viên được cấp quyền ở nhiều điểm bán)
CREATE TABLE IF NOT EXISTS user_location_assignments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, user_id, location_id)
);

CREATE INDEX IF NOT EXISTS idx_user_loc_assign_user ON user_location_assignments(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_user_loc_assign_loc ON user_location_assignments(location_id, is_active);
CREATE INDEX IF NOT EXISTS idx_user_loc_assign_biz_loc ON user_location_assignments(business_id, location_id);

-- 5. Helper Functions cho RLS kiểm tra quyền linh hoạt và tối ưu
CREATE OR REPLACE FUNCTION rbac_get_current_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    auth.uid(),
    (SELECT id FROM users WHERE google_id = (SELECT auth.jwt() ->> 'sub') LIMIT 1)
  );
$$;

-- Kiểm tra user hiện tại có thuộc business và có một trong các role chỉ định không
CREATE OR REPLACE FUNCTION rbac_user_has_business_role(p_business_id UUID, p_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM business_memberships bm
    WHERE bm.business_id = p_business_id
      AND bm.user_id = rbac_get_current_user_id()
      AND bm.is_active = TRUE
      AND bm.role = ANY(p_roles)
  );
$$;

-- Kiểm tra user có quyền truy cập vào điểm bán (Location) cụ thể hay không
-- Owner & Admin có quyền trên mọi location của business.
-- Manager, Cashier, Inventory staff chỉ có quyền trên location được assign cụ thể.
CREATE OR REPLACE FUNCTION rbac_user_has_location_access(p_business_id UUID, p_location_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    -- 1. OWNER hoặc ADMIN của business có quyền trên tất cả location
    SELECT 1
    FROM business_memberships bm
    WHERE bm.business_id = p_business_id
      AND bm.user_id = rbac_get_current_user_id()
      AND bm.is_active = TRUE
      AND bm.role IN ('OWNER', 'ADMIN')
    UNION ALL
    -- 2. Hoặc nhân viên được gán trực tiếp vào location đó
    SELECT 1
    FROM user_location_assignments ula
    JOIN business_memberships bm ON bm.business_id = ula.business_id AND bm.user_id = ula.user_id
    WHERE ula.business_id = p_business_id
      AND ula.location_id = p_location_id
      AND ula.user_id = rbac_get_current_user_id()
      AND ula.is_active = TRUE
      AND bm.is_active = TRUE
  );
$$;

-- 6. Thiết lập Row Level Security (RLS)
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_location_assignments ENABLE ROW LEVEL SECURITY;

-- Policy cho businesses
DO $$
BEGIN
  DROP POLICY IF EXISTS "Members can read their business" ON businesses;
  CREATE POLICY "Members can read their business" ON businesses FOR SELECT USING (
    id IN (
      SELECT bm.business_id FROM business_memberships bm
      WHERE bm.user_id = rbac_get_current_user_id() AND bm.is_active = TRUE
    )
  );

  DROP POLICY IF EXISTS "Owner can update business" ON businesses;
  CREATE POLICY "Owner can update business" ON businesses FOR UPDATE USING (
    rbac_user_has_business_role(id, ARRAY['OWNER'])
  );
END $$;

-- Policy cho locations
DO $$
BEGIN
  DROP POLICY IF EXISTS "Staff can read assigned locations or owner all" ON locations;
  CREATE POLICY "Staff can read assigned locations or owner all" ON locations FOR SELECT USING (
    rbac_user_has_location_access(business_id, id)
  );

  DROP POLICY IF EXISTS "Owner and Admin can insert locations" ON locations;
  CREATE POLICY "Owner and Admin can insert locations" ON locations FOR INSERT WITH CHECK (
    rbac_user_has_business_role(business_id, ARRAY['OWNER', 'ADMIN'])
  );

  DROP POLICY IF EXISTS "Owner and Admin can update locations" ON locations;
  CREATE POLICY "Owner and Admin can update locations" ON locations FOR UPDATE USING (
    rbac_user_has_business_role(business_id, ARRAY['OWNER', 'ADMIN'])
  );
END $$;

-- Policy cho business_memberships
DO $$
BEGIN
  DROP POLICY IF EXISTS "Members can view memberships in their business" ON business_memberships;
  CREATE POLICY "Members can view memberships in their business" ON business_memberships FOR SELECT USING (
    business_id IN (
      SELECT bm.business_id FROM business_memberships bm
      WHERE bm.user_id = rbac_get_current_user_id() AND bm.is_active = TRUE
    )
  );

  DROP POLICY IF EXISTS "Owner and Admin can manage memberships" ON business_memberships;
  CREATE POLICY "Owner and Admin can manage memberships" ON business_memberships FOR ALL USING (
    rbac_user_has_business_role(business_id, ARRAY['OWNER', 'ADMIN'])
  );
END $$;

-- Policy cho user_location_assignments
DO $$
BEGIN
  DROP POLICY IF EXISTS "Members can view location assignments in their business" ON user_location_assignments;
  CREATE POLICY "Members can view location assignments in their business" ON user_location_assignments FOR SELECT USING (
    business_id IN (
      SELECT bm.business_id FROM business_memberships bm
      WHERE bm.user_id = rbac_get_current_user_id() AND bm.is_active = TRUE
    )
  );

  DROP POLICY IF EXISTS "Owner and Admin can manage location assignments" ON user_location_assignments;
  CREATE POLICY "Owner and Admin can manage location assignments" ON user_location_assignments FOR ALL USING (
    rbac_user_has_business_role(business_id, ARRAY['OWNER', 'ADMIN'])
  );
END $$;
