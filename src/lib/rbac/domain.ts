// ============================================================
// RBAC DOMAIN — BUSINESS, LOCATIONS & ROLE-BASED ACCESS CONTROL
// Module: M04 — Multi-tenant & Multi-location Permissions
// ============================================================

export type MvpRole = 'OWNER' | 'ADMIN' | 'MANAGER' | 'CASHIER' | 'INVENTORY_STAFF';

export const ALL_ROLES: MvpRole[] = ['OWNER', 'ADMIN', 'MANAGER', 'CASHIER', 'INVENTORY_STAFF'];

export interface BusinessItem {
  id: string;
  code: string;
  name: string;
  taxCode?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  defaultReceiptFooter?: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface UpdateBusinessProfileInput {
  name?: string;
  taxCode?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  defaultReceiptFooter?: string | null;
}

export interface LocationItem {
  id: string;
  businessId: string;
  code: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  openingHours?: string | null;
  managerName?: string | null;
  defaultOpeningCash?: number;
  acceptWebOrders?: boolean;
  receiptFooter?: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface BusinessMembershipItem {
  id: string;
  businessId: string;
  userId: string;
  role: MvpRole;
  isActive: boolean;
  createdAt?: string;
}

export interface UserLocationAssignmentItem {
  id: string;
  businessId: string;
  userId: string;
  locationId: string;
  isActive: boolean;
  createdAt?: string;
}

export interface UserRbacProfile {
  userId: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  businessId: string;
  role: MvpRole;
  assignedLocationIds: string[];
  isOwner: boolean;
  isAdmin: boolean;
  isManager: boolean;
  isCashier: boolean;
  isInventoryStaff: boolean;
}

export interface StaffMemberDto {
  userId: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  role: MvpRole;
  assignedLocations: {
    locationId: string;
    locationCode: string;
    locationName: string;
  }[];
  isActive: boolean;
}

export interface CreateLocationInput {
  code: string;
  name: string;
  address?: string;
  phone?: string;
  openingHours?: string;
  managerName?: string;
  defaultOpeningCash?: number;
  acceptWebOrders?: boolean;
  receiptFooter?: string;
}

export interface UpdateLocationInput {
  name?: string;
  address?: string;
  phone?: string;
  openingHours?: string;
  managerName?: string;
  defaultOpeningCash?: number;
  acceptWebOrders?: boolean;
  receiptFooter?: string;
  isActive?: boolean;
}

/**
 * Check if a role can view and update Business Profile settings.
 * Only OWNER and ADMIN can manage business-wide profile settings.
 */
export function canManageBusinessProfile(role: MvpRole): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}

/**
 * Validate business profile update input.
 */
export function validateUpdateBusinessProfile(input: UpdateBusinessProfileInput): {
  name?: string;
  taxCode?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  defaultReceiptFooter?: string | null;
} {
  const result: {
    name?: string;
    taxCode?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    defaultReceiptFooter?: string | null;
  } = {};

  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (!trimmed || trimmed.length < 2 || trimmed.length > 255) {
      throw new Error('Tên doanh nghiệp phải từ 2 đến 255 ký tự.');
    }
    result.name = trimmed;
  }

  if (input.phone !== undefined) {
    const phone = (input.phone || '').trim();
    if (phone && !/^[0-9+]{9,15}$/.test(phone.replace(/[\s\-()]/g, ''))) {
      throw new Error('Số điện thoại doanh nghiệp không đúng định dạng.');
    }
    result.phone = phone || null;
  }

  if (input.email !== undefined) {
    const email = (input.email || '').trim().toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Email doanh nghiệp không đúng định dạng.');
    }
    result.email = email || null;
  }

  if (input.taxCode !== undefined) {
    result.taxCode = (input.taxCode || '').trim() || null;
  }

  if (input.address !== undefined) {
    result.address = (input.address || '').trim() || null;
  }

  if (input.defaultReceiptFooter !== undefined) {
    result.defaultReceiptFooter = (input.defaultReceiptFooter || '').trim() || null;
  }

  return result;
}

/**
 * Check if a role can create or edit locations.
 * Only OWNER and ADMIN have authority to create/edit physical sales locations.
 */
export function canManageLocations(role: MvpRole): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}

/**
 * Check if an actor role can assign a target role to a staff member.
 * - OWNER can assign any role.
 * - ADMIN can assign MANAGER, CASHIER, and INVENTORY_STAFF (cannot assign or demote OWNER/ADMIN).
 * - MANAGER, CASHIER, INVENTORY_STAFF cannot assign any roles (zero privilege escalation).
 */
export function canAssignRole(actorRole: MvpRole, targetRole: MvpRole): boolean {
  if (actorRole === 'OWNER') {
    return true;
  }
  if (actorRole === 'ADMIN') {
    return targetRole === 'MANAGER' || targetRole === 'CASHIER' || targetRole === 'INVENTORY_STAFF';
  }
  return false;
}

/**
 * Check if a user can assign locations to staff members.
 * Only OWNER and ADMIN can manage location assignments.
 */
export function canAssignLocations(actorRole: MvpRole): boolean {
  return actorRole === 'OWNER' || actorRole === 'ADMIN';
}

/**
 * Check if a role can operate POS sales at the counter.
 * CASHIER, MANAGER, ADMIN, OWNER can sell. INVENTORY_STAFF cannot.
 */
export function canOperatePos(role: MvpRole): boolean {
  return role === 'OWNER' || role === 'ADMIN' || role === 'MANAGER' || role === 'CASHIER';
}

/**
 * Check if a role can look up customer phone numbers, deduct points at the counter,
 * and credit tier % cashback at the counter.
 * CASHIER, MANAGER, ADMIN, OWNER can perform counter loyalty operations. INVENTORY_STAFF cannot.
 */
export function canManageCounterLoyalty(role: MvpRole): boolean {
  return role === 'OWNER' || role === 'ADMIN' || role === 'MANAGER' || role === 'CASHIER';
}

/**
 * Check if a role can manage inventory (goods receipts, production batches, audits).
 * INVENTORY_STAFF, MANAGER, ADMIN, OWNER can manage inventory. CASHIER cannot.
 */
export function canManageInventory(role: MvpRole): boolean {
  return role === 'OWNER' || role === 'ADMIN' || role === 'MANAGER' || role === 'INVENTORY_STAFF';
}

/**
 * Check if a role can view overall financial revenue & profit dashboards.
 * OWNER, ADMIN, and MANAGER can view revenue. CASHIER and INVENTORY_STAFF cannot.
 */
export function canViewFinancialRevenue(role: MvpRole): boolean {
  return role === 'OWNER' || role === 'ADMIN' || role === 'MANAGER';
}

/**
 * Check whether a user can access a specific location within a target business.
 * - Rejects any cross-business access attempt (tenant boundary isolation).
 * - OWNER & ADMIN can access all locations in their business.
 * - MANAGER, CASHIER, INVENTORY_STAFF can only access explicitly assigned locations.
 */
export function canAccessLocation(
  user: Pick<UserRbacProfile, 'businessId' | 'role' | 'assignedLocationIds'>,
  targetBusinessId: string,
  targetLocationId: string
): boolean {
  // 1. Cross-business check: strictly reject
  if (!targetBusinessId || user.businessId !== targetBusinessId) {
    return false;
  }

  // 2. Full business authority for Owner & Admin
  if (user.role === 'OWNER' || user.role === 'ADMIN') {
    return true;
  }

  // 3. Location assignment check for Manager, Cashier, Inventory staff
  return user.assignedLocationIds.includes(targetLocationId);
}

/**
 * Filter an array of locations to only those the user has permission to view.
 */
export function filterAccessibleLocations(
  locations: LocationItem[],
  user: Pick<UserRbacProfile, 'businessId' | 'role' | 'assignedLocationIds'>
): LocationItem[] {
  return locations.filter((loc) => canAccessLocation(user, loc.businessId, loc.id));
}

/**
 * Validate and resolve target business and location from client request.
 * Never trusts client input without verifying membership and location assignments!
 *
 * Throws errors if client attempts unauthorized or cross-business access.
 */
export function validateServerLocationAccess(
  user: UserRbacProfile,
  requestedBusinessId?: string,
  requestedLocationId?: string
): { businessId: string; locationId: string } {
  // If client supplied businessId, verify it matches user's active business
  if (requestedBusinessId && requestedBusinessId !== user.businessId) {
    throw new Error('FORBIDDEN_CROSS_BUSINESS: Bạn không có quyền truy cập dữ liệu của doanh nghiệp khác.');
  }

  const effectiveBusinessId = user.businessId;

  // If client supplied locationId, verify user has access to it
  if (requestedLocationId) {
    const hasAccess = canAccessLocation(user, effectiveBusinessId, requestedLocationId);
    if (!hasAccess) {
      throw new Error(`FORBIDDEN_LOCATION_ACCESS: Bạn không được phân công quản lý điểm bán này (${requestedLocationId}).`);
    }
    return {
      businessId: effectiveBusinessId,
      locationId: requestedLocationId,
    };
  }

  // If client did not specify locationId, default to first assigned location or throw if none
  if (user.role === 'OWNER' || user.role === 'ADMIN') {
    // Owner/Admin default to their first assigned location or default system location
    const fallbackLocationId = user.assignedLocationIds[0] || '00000000-0000-0000-0000-000000000002';
    return {
      businessId: effectiveBusinessId,
      locationId: fallbackLocationId,
    };
  }

  if (user.assignedLocationIds.length === 0) {
    throw new Error('FORBIDDEN_NO_ASSIGNED_LOCATION: Bạn chưa được phân công vào điểm bán nào.');
  }

  return {
    businessId: effectiveBusinessId,
    locationId: user.assignedLocationIds[0],
  };
}

/**
 * Validate location creation input
 */
export function validateCreateLocationInput(input: CreateLocationInput): { code: string; name: string } {
  const code = (input.code || '').trim().toUpperCase();
  const name = (input.name || '').trim();

  if (!code || code.length < 2 || code.length > 50) {
    throw new Error('Mã điểm bán phải từ 2 đến 50 ký tự (ví dụ: ULAB-Q1).');
  }

  if (!/^[A-Z0-9_-]+$/.test(code)) {
    throw new Error('Mã điểm bán chỉ được chứa chữ cái không dấu, số, dấu gạch nối (-) hoặc gạch dưới (_).');
  }

  if (!name || name.length < 2 || name.length > 255) {
    throw new Error('Tên điểm bán phải từ 2 đến 255 ký tự.');
  }

  validateLocationOperationalFields(input);

  return { code, name };
}

/**
 * Validate and normalize location operational configuration fields.
 */
export function validateLocationOperationalFields(input: {
  openingHours?: string | null;
  managerName?: string | null;
  defaultOpeningCash?: number | null;
  acceptWebOrders?: boolean;
  receiptFooter?: string | null;
}): {
  openingHours?: string | null;
  managerName?: string | null;
  defaultOpeningCash?: number;
  acceptWebOrders?: boolean;
  receiptFooter?: string | null;
} {
  const result: {
    openingHours?: string | null;
    managerName?: string | null;
    defaultOpeningCash?: number;
    acceptWebOrders?: boolean;
    receiptFooter?: string | null;
  } = {};

  if (input.openingHours !== undefined) {
    const trimmed = (input.openingHours || '').trim();
    if (trimmed.length > 100) {
      throw new Error('Khung giờ mở cửa không được vượt quá 100 ký tự.');
    }
    result.openingHours = trimmed || null;
  }

  if (input.managerName !== undefined) {
    result.managerName = (input.managerName || '').trim() || null;
  }

  if (input.defaultOpeningCash !== undefined && input.defaultOpeningCash !== null) {
    const val = Number(input.defaultOpeningCash);
    if (!Number.isFinite(val) || val < 0) {
      throw new Error('Tiền đầu ca mặc định phải là số nguyên không âm (VND).');
    }
    result.defaultOpeningCash = Math.round(val);
  }

  if (input.acceptWebOrders !== undefined) {
    result.acceptWebOrders = Boolean(input.acceptWebOrders);
  }

  if (input.receiptFooter !== undefined) {
    result.receiptFooter = (input.receiptFooter || '').trim() || null;
  }

  return result;
}

/**
 * Check if a role has permission to see and access a sidebar menu tab.
 */
export function canAccessMenuTab(role: MvpRole, tab: string): boolean {
  if (role === 'OWNER' || role === 'ADMIN') {
    return true;
  }

  if (role === 'MANAGER') {
    // Manager has operations, sales, inventory, revenue for assigned locations, but not settings/locations management
    return tab !== 'settings' && tab !== 'locations';
  }

  if (role === 'CASHIER') {
    // Cashier accesses POS sales, order lookup, and customer phone loyalty at the counter
    return tab === 'pos' || tab === 'orders' || tab === 'customers';
  }

  if (role === 'INVENTORY_STAFF') {
    // Inventory staff only accesses inventory and orders
    return tab === 'inventory' || tab === 'orders';
  }

  return false;
}

export interface CreateStaffInput {
  fullName: string;
  role: MvpRole;
  email?: string;
  phone?: string;
  locationIds: string[];
  initialPassword?: string;
}

export interface UpdateStaffInput {
  targetUserId: string;
  targetRole: MvpRole;
  locationIds: string[];
  fullName?: string;
  email?: string;
  phone?: string;
}

/**
 * Validate staff password (min 6 chars when provided or required).
 */
export function validateStaffPassword(password?: string, required = false): string | undefined {
  const raw = (password || '').trim();
  if (required && raw.length < 6) {
    throw new Error('Mật khẩu nhân viên phải có ít nhất 6 ký tự.');
  }
  if (password !== undefined && password !== '' && raw.length < 6) {
    throw new Error('Mật khẩu nhân viên phải có ít nhất 6 ký tự.');
  }
  return raw || undefined;
}

/**
 * Validate staff creation input
 */
export function validateStaffCreateInput(input: CreateStaffInput): void {
  const name = (input.fullName || '').trim();
  if (!name || name.length < 2) {
    throw new Error('Họ và tên nhân viên phải có ít nhất 2 ký tự.');
  }

  if (!ALL_ROLES.includes(input.role)) {
    throw new Error('Vai trò nhân viên không hợp lệ.');
  }

  const email = (input.email || '').trim();
  const phone = (input.phone || '').trim();

  if (!email && !phone) {
    throw new Error('Vui lòng cung cấp ít nhất số điện thoại hoặc email liên hệ cho nhân viên.');
  }

  if (phone && !/^[0-9+]{9,15}$/.test(phone.replace(/[\s\-()]/g, ''))) {
    throw new Error('Số điện thoại không đúng định dạng.');
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Email không đúng định dạng.');
  }

  if (input.initialPassword !== undefined && input.initialPassword !== '') {
    validateStaffPassword(input.initialPassword, true);
  }
}

/**
 * Validate editable staff contact/profile fields when updating staff details.
 */
export function validateStaffUpdateInput(input: {
  fullName?: string;
  email?: string | null;
  phone?: string | null;
}): { fullName?: string; email?: string | null; phone?: string | null } {
  const result: { fullName?: string; email?: string | null; phone?: string | null } = {};

  if (input.fullName !== undefined) {
    const name = input.fullName.trim();
    if (!name || name.length < 2) {
      throw new Error('Họ và tên nhân viên phải có ít nhất 2 ký tự.');
    }
    result.fullName = name;
  }

  if (input.phone !== undefined) {
    const phone = (input.phone || '').trim();
    if (phone && !/^[0-9+]{9,15}$/.test(phone.replace(/[\s\-()]/g, ''))) {
      throw new Error('Số điện thoại không đúng định dạng.');
    }
    result.phone = phone ? phone.replace(/[\s\-()]/g, '') : null;
  }

  if (input.email !== undefined) {
    const email = (input.email || '').trim().toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Email không đúng định dạng.');
    }
    result.email = email || null;
  }

  return result;
}

/**
 * Check if actor role can toggle, revoke, or reset password for a staff member
 */
export function canToggleStaffStatus(actorRole: MvpRole, targetRole: MvpRole): boolean {
  return canAssignRole(actorRole, targetRole);
}

export function canRevokeStaff(actorRole: MvpRole, targetRole: MvpRole): boolean {
  return canAssignRole(actorRole, targetRole);
}

export function canResetStaffPassword(actorRole: MvpRole, targetRole: MvpRole): boolean {
  return canAssignRole(actorRole, targetRole);
}

export interface RolePermissionMatrixRow {
  key: string;
  group: string;
  capability: string;
  description: string;
  permissions: Record<MvpRole, string>;
}

/**
 * Canonical permission matrix across all 5 RBAC roles and 9 operational groups.
 */
export function getRolePermissionMatrix(): RolePermissionMatrixRow[] {
  return [
    {
      key: 'pos_sales',
      group: 'Bán hàng & Quầy',
      capability: 'Bán hàng POS & In tem',
      description: 'Tạo đơn tại quầy, tra cứu điểm thành viên và in tem pha chế / biên nhận',
      permissions: {
        OWNER: 'Toàn chuỗi',
        ADMIN: 'Toàn chuỗi',
        MANAGER: 'Điểm bán được gán',
        CASHIER: 'Điểm bán được gán',
        INVENTORY_STAFF: 'Không được phép',
      },
    },
    {
      key: 'pos_discount',
      group: 'Bán hàng & Quầy',
      capability: 'Áp dụng giảm giá đơn hàng',
      description: 'Hạn mức chiết khấu tối đa trên hóa đơn bán hàng POS',
      permissions: {
        OWNER: 'Tối đa 100% (kèm lý do)',
        ADMIN: 'Tối đa 100% (kèm lý do)',
        MANAGER: 'Tối đa 100% (kèm lý do)',
        CASHIER: 'Tối đa 10% hoặc 20.000đ',
        INVENTORY_STAFF: 'Không được phép',
      },
    },
    {
      key: 'order_cancel',
      group: 'Bán hàng & Quầy',
      capability: 'Hủy đơn & Hoàn kho/điểm',
      description: 'Chuyển trạng thái đơn sang CANCELLED, ghi log lý do và hoàn tồn kho',
      permissions: {
        OWNER: 'Toàn chuỗi',
        ADMIN: 'Toàn chuỗi',
        MANAGER: 'Điểm bán được gán',
        CASHIER: 'Không được phép',
        INVENTORY_STAFF: 'Không được phép',
      },
    },
    {
      key: 'shift_cash',
      group: 'Tài chính & Ca',
      capability: 'Mở/Chốt ca & Kiểm đếm két',
      description: 'Mở ca bán hàng, nhập tiền đầu ca, đếm mệnh giá tờ tiền và in Z-Report',
      permissions: {
        OWNER: 'Toàn chuỗi',
        ADMIN: 'Toàn chuỗi',
        MANAGER: 'Điểm bán được gán',
        CASHIER: 'Không được phép',
        INVENTORY_STAFF: 'Không được phép',
      },
    },
    {
      key: 'revenue_cashbook',
      group: 'Tài chính & Ca',
      capability: 'Sổ quỹ Thu-Chi & Báo cáo doanh thu',
      description: 'Xem doanh thu thuần, biểu đồ peak hours, lập phiếu thu/chi quỹ tiền',
      permissions: {
        OWNER: 'Toàn chuỗi',
        ADMIN: 'Toàn chuỗi',
        MANAGER: 'Điểm bán được gán',
        CASHIER: 'Không được phép',
        INVENTORY_STAFF: 'Không được phép',
      },
    },
    {
      key: 'inventory_ops',
      group: 'Kho & Sản xuất',
      capability: 'Nhập kho, Sản xuất & Kiểm kê',
      description: 'Nhập NCC (FIFO/FEFO), đóng chai Cold Brew, xuất hủy và kiểm kê kho',
      permissions: {
        OWNER: 'Toàn chuỗi',
        ADMIN: 'Toàn chuỗi',
        MANAGER: 'Điểm bán được gán',
        CASHIER: 'Không được phép',
        INVENTORY_STAFF: 'Điểm bán được gán',
      },
    },
    {
      key: 'menu_pricing',
      group: 'Danh mục & Giá',
      capability: 'Quản lý Thực đơn & Báo hết món',
      description: 'Bật/tắt trạng thái còn hàng và cập nhật giá bán theo size',
      permissions: {
        OWNER: 'Toàn chuỗi',
        ADMIN: 'Toàn chuỗi',
        MANAGER: 'Điểm bán được gán',
        CASHIER: 'Không được phép',
        INVENTORY_STAFF: 'Không được phép',
      },
    },
    {
      key: 'locations_biz',
      group: 'Quản trị Hệ thống',
      capability: 'Quản lý Điểm bán & Hồ sơ Chuỗi',
      description: 'Tạo/sửa chi nhánh, cấu hình vận hành điểm bán và thông tin doanh nghiệp',
      permissions: {
        OWNER: 'Toàn quyền',
        ADMIN: 'Tạo & Cấu hình chi nhánh',
        MANAGER: 'Chỉ xem chi nhánh được gán',
        CASHIER: 'Chỉ xem chi nhánh được gán',
        INVENTORY_STAFF: 'Chỉ xem chi nhánh được gán',
      },
    },
    {
      key: 'staff_rbac',
      group: 'Quản trị Hệ thống',
      capability: 'Nhân sự, Phân quyền & Đổi mật khẩu',
      description: 'Thêm nhân viên, gán vai trò, phân công chi nhánh, khóa & đặt lại mật khẩu',
      permissions: {
        OWNER: 'Mọi vai trò (kể cả Admin/Owner)',
        ADMIN: 'Chỉ Manager, Cashier, Inventory',
        MANAGER: 'Không được phép',
        CASHIER: 'Không được phép',
        INVENTORY_STAFF: 'Không được phép',
      },
    },
  ];
}

export type RbacAuditAction =
  | 'CREATE_LOCATION'
  | 'UPDATE_LOCATION'
  | 'CREATE_STAFF'
  | 'UPDATE_STAFF'
  | 'RESET_STAFF_PASSWORD'
  | 'TOGGLE_STAFF_STATUS'
  | 'REVOKE_STAFF'
  | 'UPDATE_BUSINESS_PROFILE'
  | 'SWITCH_LOCATION';

export type RbacAuditTargetType = 'LOCATION' | 'STAFF' | 'BUSINESS';

export interface RbacAuditLogItem {
  id: string;
  businessId: string;
  actorUserId?: string | null;
  actorName: string;
  actorRole: MvpRole;
  action: RbacAuditAction;
  targetType: RbacAuditTargetType;
  targetId?: string | null;
  targetName?: string | null;
  summary: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

/**
 * Create a normalized RBAC audit entry.
 */
export function createRbacAuditEntry(params: {
  businessId: string;
  actorUserId?: string | null;
  actorName: string;
  actorRole: MvpRole;
  action: RbacAuditAction;
  targetType: RbacAuditTargetType;
  targetId?: string | null;
  targetName?: string | null;
  summary: string;
  metadata?: Record<string, unknown>;
}): RbacAuditLogItem {
  const id =
    typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `audit-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  return {
    id,
    businessId: params.businessId,
    actorUserId: params.actorUserId || null,
    actorName: params.actorName,
    actorRole: params.actorRole,
    action: params.action,
    targetType: params.targetType,
    targetId: params.targetId || null,
    targetName: params.targetName || null,
    summary: params.summary,
    metadata: params.metadata || {},
    createdAt: new Date().toISOString(),
  };
}

/**
 * Build a structured UserRbacProfile from DB records
 */
export function buildUserRbacProfile(params: {
  userId: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  businessId: string;
  role: MvpRole;
  assignedLocationIds: string[];
}): UserRbacProfile {
  return {
    userId: params.userId,
    fullName: params.fullName,
    email: params.email,
    phone: params.phone,
    businessId: params.businessId,
    role: params.role,
    assignedLocationIds: params.assignedLocationIds,
    isOwner: params.role === 'OWNER',
    isAdmin: params.role === 'ADMIN',
    isManager: params.role === 'MANAGER',
    isCashier: params.role === 'CASHIER',
    isInventoryStaff: params.role === 'INVENTORY_STAFF',
  };
}

