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
  filterAccessibleLocations,
  validateStaffCreateInput,
  canRevokeStaff,
  type CreateStaffInput,
} from './domain';
import { DEFAULT_BUSINESS_ID, DEFAULT_LOCATION_ID } from '@/lib/pos/domain';

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

// In-memory fallback store seeded for local development and unmigrated database fallback
const fallbackLocations: LocationItem[] = [
  {
    id: DEFAULT_LOCATION_ID,
    businessId: DEFAULT_BUSINESS_ID,
    code: 'ULAB-MAIN',
    name: 'Ủ LAB — Quầy Chính (Hồ Con Rùa)',
    address: 'Công Trường Quốc Tế, Quận 3, TP. Hồ Chí Minh',
    phone: '0909000001',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: '00000000-0000-0000-0000-000000000012',
    businessId: DEFAULT_BUSINESS_ID,
    code: 'ULAB-Q1',
    name: 'Ủ LAB — Chi nhánh Nguyễn Huệ (Quận 1)',
    address: 'Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh',
    phone: '0909000012',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const fallbackStaffList: StaffMemberDto[] = [
  {
    userId: '00000000-0000-0000-0000-000000000003',
    fullName: 'Quản trị viên Ủ LAB',
    email: 'admin@coffeehouse.vn',
    phone: '0909000001',
    role: 'OWNER',
    assignedLocations: [
      {
        locationId: DEFAULT_LOCATION_ID,
        locationCode: 'ULAB-MAIN',
        locationName: 'Ủ LAB — Quầy Chính (Hồ Con Rùa)',
      },
      {
        locationId: '00000000-0000-0000-0000-000000000012',
        locationCode: 'ULAB-Q1',
        locationName: 'Ủ LAB — Chi nhánh Nguyễn Huệ (Quận 1)',
      },
    ],
    isActive: true,
  },
];

/**
 * List locations accessible to the given user based on their business and role.
 * Falls back gracefully to in-memory store if tables are unmigrated in Supabase.
 */
export async function listLocationsForUser(user: UserRbacProfile): Promise<LocationItem[]> {
  try {
    const adminClient = createAdminClient();

    let query = adminClient
      .from('locations')
      .select('*')
      .eq('business_id', user.businessId)
      .order('created_at', { ascending: true });

    if (user.role !== 'OWNER' && user.role !== 'ADMIN') {
      if (user.assignedLocationIds.length === 0) {
        return [];
      }
      query = query.in('id', user.assignedLocationIds);
    }

    const { data, error } = await query;
    if (!error && data && data.length > 0) {
      const rows = data as LocationDbRow[];
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
  } catch (err) {
    console.warn('DB locations query fallback:', err);
  }

  // Fallback to in-memory locations filtered by user permissions
  return filterAccessibleLocations(fallbackLocations, user);
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

  // Check if code already exists in fallback store
  const existingCode = fallbackLocations.find(
    (l) => l.businessId === user.businessId && l.code.toUpperCase() === code
  );
  if (existingCode) {
    throw new Error(`Điểm bán với mã "${code}" đã tồn tại trong doanh nghiệp.`);
  }

  try {
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

    if (!error && data) {
      const row = data as LocationDbRow;
      const createdLoc: LocationItem = {
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
      fallbackLocations.push(createdLoc);
      return createdLoc;
    }
  } catch (err) {
    console.warn('DB locations insert fallback to memory:', err);
  }

  // In-memory fallback
  const newLoc: LocationItem = {
    id: `loc-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    businessId: user.businessId,
    code,
    name,
    address: input.address?.trim() || null,
    phone: input.phone?.trim() || null,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  fallbackLocations.push(newLoc);
  return newLoc;
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

  try {
    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('locations')
      .update(updates)
      .eq('id', locationId)
      .eq('business_id', user.businessId)
      .select('*')
      .single();

    if (!error && data) {
      const row = data as LocationDbRow;
      const updatedItem: LocationItem = {
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

      const idx = fallbackLocations.findIndex((l) => l.id === locationId);
      if (idx !== -1) fallbackLocations[idx] = updatedItem;
      return updatedItem;
    }
  } catch (err) {
    console.warn('DB locations update fallback to memory:', err);
  }

  // In-memory fallback
  const idx = fallbackLocations.findIndex((l) => l.id === locationId);
  if (idx === -1) {
    throw new Error('Điểm bán không tồn tại.');
  }

  const existing = fallbackLocations[idx];
  if (existing.businessId !== user.businessId) {
    throw new Error('FORBIDDEN_CROSS_BUSINESS: Không thể chỉnh sửa điểm bán của doanh nghiệp khác.');
  }

  const updatedItem: LocationItem = {
    ...existing,
    name: input.name !== undefined ? input.name.trim() : existing.name,
    address: input.address !== undefined ? input.address.trim() || null : existing.address,
    phone: input.phone !== undefined ? input.phone.trim() || null : existing.phone,
    isActive: input.isActive !== undefined ? Boolean(input.isActive) : existing.isActive,
    updatedAt: new Date().toISOString(),
  };

  fallbackLocations[idx] = updatedItem;
  return updatedItem;
}

/**
 * List staff members in the business with their role and assigned locations.
 * Requires OWNER or ADMIN role.
 */
export async function listStaffMembers(user: UserRbacProfile): Promise<StaffMemberDto[]> {
  if (user.role !== 'OWNER' && user.role !== 'ADMIN') {
    throw new Error('FORBIDDEN_VIEW_STAFF: Chỉ Owner hoặc Admin mới có quyền xem danh sách nhân sự.');
  }

  try {
    const adminClient = createAdminClient();

    // 1. Get all active locations in this business
    const { data: locRows, error: locErr } = await adminClient
      .from('locations')
      .select('id, code, name')
      .eq('business_id', user.businessId);

    if (!locErr && locRows) {
      const locMap = new Map<string, { code: string; name: string }>();
      locRows.forEach((l: { id: string; code: string; name: string }) => {
        locMap.set(l.id, { code: l.code, name: l.name });
      });

      // 2. Get memberships in this business
      const { data: memberships, error: memErr } = await adminClient
        .from('business_memberships')
        .select('user_id, role, is_active')
        .eq('business_id', user.businessId);

      if (!memErr && memberships && memberships.length > 0) {
        // Return DB members
        const { data: assignRows } = await adminClient
          .from('user_location_assignments')
          .select('user_id, location_id, is_active')
          .eq('business_id', user.businessId)
          .eq('is_active', true);

        const assignmentMap = new Map<string, string[]>();
        (assignRows || []).forEach((a: { user_id: string; location_id: string }) => {
          const arr = assignmentMap.get(a.user_id) || [];
          arr.push(a.location_id);
          assignmentMap.set(a.user_id, arr);
        });

        const { data: userRows } = await adminClient
          .from('users')
          .select('id, full_name, email, phone');

        const userMap = new Map<string, { full_name?: string; email?: string; phone?: string }>();
        (userRows || []).forEach((u: { id: string; full_name?: string; email?: string; phone?: string }) => {
          userMap.set(u.id, u);
        });

        return memberships.map((m: { user_id: string; role: string; is_active: boolean }) => {
          const userInfo = userMap.get(m.user_id);
          const locIds = assignmentMap.get(m.user_id) || [];
          return {
            userId: m.user_id,
            fullName: userInfo?.full_name || 'Nhân viên',
            email: userInfo?.email || null,
            phone: userInfo?.phone || null,
            role: m.role as MvpRole,
            isActive: m.is_active,
            assignedLocations: locIds.map((lid) => {
              const lInfo = locMap.get(lid);
              return {
                locationId: lid,
                locationCode: lInfo?.code || lid,
                locationName: lInfo?.name || 'Điểm bán',
              };
            }),
          };
        });
      }
    }
  } catch (err) {
    console.warn('DB listStaffMembers fallback:', err);
  }

  // Return fallback staff list
  return fallbackStaffList;
}

/**
 * Assign or update a staff member's role and multiple location assignments.
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

  try {
    const adminClient = createAdminClient();

    // 1. Upsert business_memberships
    await adminClient
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

    // 2. Update user_location_assignments
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

      await adminClient.from('user_location_assignments').insert(newAssignments);
    }
  } catch (err) {
    console.warn('DB assignStaffRoleAndLocations fallback:', err);
  }

  // Update in-memory fallback staff
  const staffIdx = fallbackStaffList.findIndex((s) => s.userId === targetUserId);
  const matchedLocations = fallbackLocations
    .filter((l) => locationIds.includes(l.id))
    .map((l) => ({
      locationId: l.id,
      locationCode: l.code,
      locationName: l.name,
    }));

  if (staffIdx !== -1) {
    fallbackStaffList[staffIdx].role = targetRole;
    fallbackStaffList[staffIdx].assignedLocations = matchedLocations;
  } else {
    fallbackStaffList.push({
      userId: targetUserId,
      fullName: 'Nhân viên mới',
      role: targetRole,
      assignedLocations: matchedLocations,
      isActive: true,
    });
  }
}

/**
 * Create a new staff member and assign initial role and locations.
 */
export async function createStaffMember(
  actor: UserRbacProfile,
  input: CreateStaffInput
): Promise<StaffMemberDto> {
  if (!canAssignRole(actor.role, input.role)) {
    throw new Error(
      `FORBIDDEN_CANNOT_ASSIGN_ROLE: Vai trò của bạn (${actor.role}) không được phép tạo nhân viên với vai trò (${input.role}).`
    );
  }

  validateStaffCreateInput(input);

  const newUserId = `usr-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const matchedLocations = fallbackLocations
    .filter((l) => input.locationIds.includes(l.id))
    .map((l) => ({
      locationId: l.id,
      locationCode: l.code,
      locationName: l.name,
    }));

  const newStaff: StaffMemberDto = {
    userId: newUserId,
    fullName: input.fullName.trim(),
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    role: input.role,
    assignedLocations: matchedLocations,
    isActive: true,
  };

  try {
    const adminClient = createAdminClient();

    // 1. Try creating user record
    await adminClient.from('users').insert({
      id: newUserId,
      full_name: newStaff.fullName,
      email: newStaff.email,
      phone: newStaff.phone,
      business_id: actor.businessId,
      staff_role: input.role,
    });

    // 2. Try creating membership
    await adminClient.from('business_memberships').insert({
      business_id: actor.businessId,
      user_id: newUserId,
      role: input.role,
      is_active: true,
    });

    // 3. Try creating assignments
    if (input.locationIds.length > 0) {
      const assignments = input.locationIds.map((locId) => ({
        business_id: actor.businessId,
        user_id: newUserId,
        location_id: locId,
        is_active: true,
      }));
      await adminClient.from('user_location_assignments').insert(assignments);
    }
  } catch (err) {
    console.warn('DB createStaffMember fallback to memory:', err);
  }

  fallbackStaffList.push(newStaff);
  return newStaff;
}

/**
 * Toggle active status of a staff member.
 */
export async function toggleStaffStatus(
  actor: UserRbacProfile,
  targetUserId: string,
  isActive: boolean
): Promise<void> {
  const staff = fallbackStaffList.find((s) => s.userId === targetUserId);
  if (!staff) {
    throw new Error('Nhân viên không tồn tại.');
  }

  if (!canRevokeStaff(actor.role, staff.role)) {
    throw new Error('Bạn không có quyền thay đổi trạng thái của nhân viên này.');
  }

  try {
    const adminClient = createAdminClient();
    await adminClient
      .from('business_memberships')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('business_id', actor.businessId)
      .eq('user_id', targetUserId);
  } catch (err) {
    console.warn('DB toggleStaffStatus fallback:', err);
  }

  staff.isActive = isActive;
}

/**
 * Revoke/delete a staff member's access.
 */
export async function revokeStaffMember(
  actor: UserRbacProfile,
  targetUserId: string
): Promise<void> {
  const staffIdx = fallbackStaffList.findIndex((s) => s.userId === targetUserId);
  if (staffIdx === -1) {
    throw new Error('Nhân viên không tồn tại.');
  }

  const staff = fallbackStaffList[staffIdx];
  if (!canRevokeStaff(actor.role, staff.role)) {
    throw new Error('Bạn không có quyền xóa nhân viên này.');
  }

  try {
    const adminClient = createAdminClient();
    await adminClient
      .from('business_memberships')
      .delete()
      .eq('business_id', actor.businessId)
      .eq('user_id', targetUserId);

    await adminClient
      .from('user_location_assignments')
      .delete()
      .eq('business_id', actor.businessId)
      .eq('user_id', targetUserId);
  } catch (err) {
    console.warn('DB revokeStaffMember fallback:', err);
  }

  fallbackStaffList.splice(staffIdx, 1);
}
