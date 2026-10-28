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
  address?: string | null;
  isActive: boolean;
  createdAt?: string;
}

export interface LocationItem {
  id: string;
  businessId: string;
  code: string;
  name: string;
  address?: string | null;
  phone?: string | null;
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
}

export interface UpdateLocationInput {
  name?: string;
  address?: string;
  phone?: string;
  isActive?: boolean;
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

  return { code, name };
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
