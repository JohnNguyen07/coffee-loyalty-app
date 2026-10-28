import { createAdminClient } from '@/lib/supabase/admin';
import {
  type MvpRole,
  type UserRbacProfile,
  type LocationItem,
  type StaffMemberDto,
  type CreateLocationInput,
  type UpdateLocationInput,
  canManageLocations,
  canAssignRole,
  canAssignLocations,
  validateCreateLocationInput,
} from './domain';

interface LocationDbRow {
  id: string;
  business_id: string;
  code: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

interface UserDbRow {
  id: string;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  staff_role?: string | null;
  is_active?: boolean;
}

interface MembershipDbRow {
  user_id: string;
  role: string;
  is_active: boolean;
}

interface AssignmentDbRow {
  user_id: string;
  location_id: string;
  is_active: boolean;
}

/**
 * List locations accessible to the given user based on their business and role.
 */
export async function listLocationsForUser(user: UserRbacProfile): Promise<LocationItem[]> {
  const adminClient = createAdminClient();

  let query = adminClient
    .from('locations')
    .select('*')
    .eq('business_id', user.businessId)
    .order('created_at', { ascending: true });

  // If not Owner/Admin, strictly limit query to assigned locations
  if (user.role !== 'OWNER' && user.role !== 'ADMIN') {
    if (user.assignedLocationIds.length === 0) {
      return [];
    }
    query = query.in('id', user.assignedLocationIds);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Lỗi truy vấn điểm bán: ${error.message}`);
  }

  const rows = (data || []) as LocationDbRow[];
  return rows.map((r) => ({
    id: r.id,
    businessId: r.business_id,
    code: r.code,
    name: r.name,
    address: r.address || null,
    phone: r.phone || null,
    isActive: Boolean(r.is_active),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

/**
 * Create a new physical location for the user's business.
 * Strictly requires OWNER or ADMIN role.
 */
export async function createLocation(
  user: UserRbacProfile,
  input: CreateLocationInput
): Promise<LocationItem> {
  if (!canManageLocations(user.role)) {
    throw new Error('FORBIDDEN_CANNOT_MANAGE_LOCATIONS: Chỉ Owner hoặc Admin mới có quyền tạo điểm bán mới.');
  }

  const { code, name } = validateCreateLocationInput(input);
  const adminClient = createAdminClient();

  const { data, error } = await adminClient
    .from('locations')
    .insert({
      business_id: user.businessId,
      code,
      name,
      address: input.address?.trim() || null,
      phone: input.phone?.trim() || null,
      is_active: true,
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error(`Điểm bán với mã "${code}" đã tồn tại trong doanh nghiệp.`);
    }
    throw new Error(`Lỗi tạo điểm bán: ${error.message}`);
  }

  const row = data as LocationDbRow;
  return {
    id: row.id,
    businessId: row.business_id,
    code: row.code,
    name: row.name,
    address: row.address || null,
    phone: row.phone || null,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Update an existing location.
 * Strictly requires OWNER or ADMIN role and matches business_id.
 */
export async function updateLocation(
  user: UserRbacProfile,
  locationId: string,
  input: UpdateLocationInput
): Promise<LocationItem> {
  if (!canManageLocations(user.role)) {
    throw new Error('FORBIDDEN_CANNOT_MANAGE_LOCATIONS: Chỉ Owner hoặc Admin mới có quyền chỉnh sửa điểm bán.');
  }

  const adminClient = createAdminClient();

  // Verify location belongs to the actor's business
  const { data: existing, error: checkError } = await adminClient
    .from('locations')
    .select('id, business_id')
    .eq('id', locationId)
    .maybeSingle();

  if (checkError || !existing) {
    throw new Error('Điểm bán không tồn tại.');
  }

  if (existing.business_id !== user.businessId) {
    throw new Error('FORBIDDEN_CROSS_BUSINESS: Không thể chỉnh sửa điểm bán của doanh nghiệp khác.');
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (input.name !== undefined) {
    const trimmedName = input.name.trim();
    if (trimmedName.length < 2) {
      throw new Error('Tên điểm bán không được để trống.');
    }
    updates.name = trimmedName;
  }
  if (input.address !== undefined) {
    updates.address = input.address.trim() || null;
  }
  if (input.phone !== undefined) {
    updates.phone = input.phone.trim() || null;
  }
  if (input.isActive !== undefined) {
    updates.is_active = Boolean(input.isActive);
  }

  const { data, error } = await adminClient
    .from('locations')
    .update(updates)
    .eq('id', locationId)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Lỗi cập nhật điểm bán: ${error.message}`);
  }

  const row = data as LocationDbRow;
  return {
    id: row.id,
    businessId: row.business_id,
    code: row.code,
    name: row.name,
    address: row.address || null,
    phone: row.phone || null,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * List staff members in the business with their role and assigned locations.
 * Requires OWNER or ADMIN role.
 */
export async function listStaffMembers(user: UserRbacProfile): Promise<StaffMemberDto[]> {
  if (user.role !== 'OWNER' && user.role !== 'ADMIN') {
    throw new Error('FORBIDDEN_VIEW_STAFF: Chỉ Owner hoặc Admin mới có quyền xem danh sách nhân sự.');
  }

  const adminClient = createAdminClient();

  // 1. Get all active locations in this business
  const { data: locRows } = await adminClient
    .from('locations')
    .select('id, code, name')
    .eq('business_id', user.businessId);

  const locMap = new Map<string, { code: string; name: string }>();
  (locRows || []).forEach((l: { id: string; code: string; name: string }) => {
    locMap.set(l.id, { code: l.code, name: l.name });
  });

  // 2. Get memberships in this business
  const { data: memberships } = await adminClient
    .from('business_memberships')
    .select('user_id, role, is_active')
    .eq('business_id', user.businessId);

  const memberRows = (memberships || []) as MembershipDbRow[];
  const memberUserIds = new Set(memberRows.map((m) => m.user_id));

  // 3. Get users who are either in memberships or have business_id set
  const { data: usersData } = await adminClient
    .from('users')
    .select('id, full_name, email, phone, staff_role')
    .or(`business_id.eq.${user.businessId},id.in.(${Array.from(memberUserIds).join(',') || '00000000-0000-0000-0000-000000000000'})`);

  const userRows = (usersData || []) as UserDbRow[];

  // 4. Get all location assignments in this business
  const { data: assignRows } = await adminClient
    .from('user_location_assignments')
    .select('user_id, location_id, is_active')
    .eq('business_id', user.businessId)
    .eq('is_active', true);

  const assignmentRows = (assignRows || []) as AssignmentDbRow[];
  const userAssignmentsMap = new Map<string, string[]>();
  assignmentRows.forEach((a) => {
    const list = userAssignmentsMap.get(a.user_id) || [];
    list.push(a.location_id);
    userAssignmentsMap.set(a.user_id, list);
  });

  const memberMap = new Map<string, MembershipDbRow>();
  memberRows.forEach((m) => memberMap.set(m.user_id, m));

  return userRows.map((u) => {
    const membership = memberMap.get(u.id);
    const rawRole = (membership?.role || u.staff_role || 'CASHIER').toUpperCase() as MvpRole;
    const assignedIds = userAssignmentsMap.get(u.id) || [];

    return {
      userId: u.id,
      fullName: u.full_name || u.email || 'Nhân viên',
      email: u.email || null,
      phone: u.phone || null,
      role: rawRole,
      isActive: membership ? membership.is_active : true,
      assignedLocations: assignedIds.map((locId) => {
        const info = locMap.get(locId);
        return {
          locationId: locId,
          locationCode: info?.code || locId,
          locationName: info?.name || 'Điểm bán',
        };
      }),
    };
  });
}

/**
 * Assign or update a staff member's role and multiple location assignments.
 * Strictly verifies role hierarchy (Admin cannot assign Owner; Cashier/Manager cannot assign anyone).
 */
export async function assignStaffRoleAndLocations(
  actor: UserRbacProfile,
  targetUserId: string,
  targetRole: MvpRole,
  locationIds: string[]
): Promise<void> {
  if (!canAssignRole(actor.role, targetRole)) {
    throw new Error(
      `FORBIDDEN_CANNOT_ASSIGN_ROLE: Vai trò của bạn (${actor.role}) không được phép gán vai trò (${targetRole}).`
    );
  }

  if (!canAssignLocations(actor.role)) {
    throw new Error('FORBIDDEN_CANNOT_ASSIGN_LOCATIONS: Bạn không có quyền phân công điểm bán.');
  }

  const adminClient = createAdminClient();

  // 1. Verify all locationIds belong to the actor's business
  if (locationIds.length > 0) {
    const { data: validLocs, error: locError } = await adminClient
      .from('locations')
      .select('id')
      .eq('business_id', actor.businessId)
      .in('id', locationIds);

    if (locError || !validLocs || validLocs.length !== locationIds.length) {
      throw new Error('Một hoặc nhiều điểm bán được chọn không thuộc doanh nghiệp của bạn.');
    }
  }

  // 2. Upsert business_memberships
  const { error: memberError } = await adminClient
    .from('business_memberships')
    .upsert(
      {
        business_id: actor.businessId,
        user_id: targetUserId,
        role: targetRole,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'business_id,user_id' }
    );

  if (memberError) {
    throw new Error(`Lỗi cập nhật quyền thành viên: ${memberError.message}`);
  }

  // 3. Update staff_role on users table for backwards-compatibility
  await adminClient
    .from('users')
    .update({
      staff_role: targetRole,
      business_id: actor.businessId,
    })
    .eq('id', targetUserId);

  // 4. Update user_location_assignments: delete old assignments in this business and insert new ones
  await adminClient
    .from('user_location_assignments')
    .delete()
    .eq('business_id', actor.businessId)
    .eq('user_id', targetUserId);

  if (locationIds.length > 0) {
    const newAssignments = locationIds.map((locId) => ({
      business_id: actor.businessId,
      user_id: targetUserId,
      location_id: locId,
      is_active: true,
    }));

    const { error: assignError } = await adminClient
      .from('user_location_assignments')
      .insert(newAssignments);

    if (assignError) {
      throw new Error(`Lỗi gán điểm bán cho nhân viên: ${assignError.message}`);
    }
  }
}
