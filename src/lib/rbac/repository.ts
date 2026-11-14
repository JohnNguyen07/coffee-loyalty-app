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

interface PersistedRbacState {
  locations: LocationItem[];
  staffByBusiness: Record<string, StaffMemberDto[]>;
  updatedAt: string;
}

const RBAC_BUCKET = 'ulab-system';
const RBAC_OBJECT_PATH = 'rbac-store.json';

function buildSeedLocations(): LocationItem[] {
  const now = new Date().toISOString();
  return [
    {
      id: DEFAULT_LOCATION_ID,
      businessId: DEFAULT_BUSINESS_ID,
      code: 'ULAB-MAIN',
      name: 'Ủ LAB — Quầy Chính (Hồ Con Rùa)',
      address: 'Công Trường Quốc Tế, Quận 3, TP. Hồ Chí Minh',
      phone: '0909000001',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: '00000000-0000-0000-0000-000000000012',
      businessId: DEFAULT_BUSINESS_ID,
      code: 'ULAB-Q1',
      name: 'Ủ LAB — Chi nhánh Nguyễn Huệ (Quận 1)',
      address: 'Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh',
      phone: '0909000012',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function buildSeedStaff(): StaffMemberDto[] {
  return [
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
    {
      userId: '0ad4fd98-d28e-4b8c-9a44-80be3c52a12b',
      fullName: 'Nguyễn cao Hoàng Minh',
      email: 'nguyencaohoangminh1@gmail.com',
      phone: '0947038325',
      role: 'ADMIN',
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
}

// Keep fallback seed shared across Next.js route bundles in the same process
const globalForRbac = globalThis as typeof globalThis & {
  __ulabRbacState?: PersistedRbacState;
  __ulabRbacBucketReady?: boolean;
};

function getInMemoryState(): PersistedRbacState {
  if (!globalForRbac.__ulabRbacState) {
    globalForRbac.__ulabRbacState = {
      locations: buildSeedLocations(),
      staffByBusiness: {
        [DEFAULT_BUSINESS_ID]: buildSeedStaff(),
      },
      updatedAt: new Date().toISOString(),
    };
  }
  return globalForRbac.__ulabRbacState;
}

function getSupabaseStorageConfig(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ''), key };
}

async function ensureRbacBucket(url: string, key: string): Promise<void> {
  if (globalForRbac.__ulabRbacBucketReady) return;
  const res = await fetch(`${url}/storage/v1/bucket`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id: RBAC_BUCKET, name: RBAC_BUCKET, public: false }),
    cache: 'no-store',
  });
  // 200/201 created, or 400/409 already exists
  if (res.ok || res.status === 409) {
    globalForRbac.__ulabRbacBucketReady = true;
  } else {
    const txt = await res.text().catch(() => '');
    if (txt.toLowerCase().includes('already exists') || txt.toLowerCase().includes('duplicate')) {
      globalForRbac.__ulabRbacBucketReady = true;
    }
  }
}

async function loadPersistedRbacState(): Promise<PersistedRbacState> {
  const cfg = getSupabaseStorageConfig();
  if (!cfg) {
    return getInMemoryState();
  }

  try {
    const dlUrl = `${cfg.url}/storage/v1/object/authenticated/${RBAC_BUCKET}/${RBAC_OBJECT_PATH}?t=${Date.now()}`;
    const res = await fetch(dlUrl, {
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        'Cache-Control': 'no-store',
      },
      cache: 'no-store',
    });

    if (res.ok) {
      const parsed = (await res.json()) as Partial<PersistedRbacState>;
      const normalized: PersistedRbacState = {
        locations: Array.isArray(parsed.locations) && parsed.locations.length > 0
          ? parsed.locations
          : buildSeedLocations(),
        staffByBusiness:
          parsed.staffByBusiness && typeof parsed.staffByBusiness === 'object'
            ? parsed.staffByBusiness
            : { [DEFAULT_BUSINESS_ID]: buildSeedStaff() },
        updatedAt: parsed.updatedAt || new Date().toISOString(),
      };
      globalForRbac.__ulabRbacState = normalized;
      return normalized;
    }

    if (res.status === 400 || res.status === 404) {
      // First-time bootstrap: seed Supabase Storage with initial locations & staff
      const seed = getInMemoryState();
      await savePersistedRbacState(seed).catch(() => undefined);
      return seed;
    }
  } catch (err) {
    console.warn('Supabase Storage loadPersistedRbacState fallback:', err);
  }

  return getInMemoryState();
}

async function savePersistedRbacState(state: PersistedRbacState): Promise<void> {
  const nextState: PersistedRbacState = {
    ...state,
    updatedAt: new Date().toISOString(),
  };
  globalForRbac.__ulabRbacState = nextState;

  const cfg = getSupabaseStorageConfig();
  if (!cfg) return;

  await ensureRbacBucket(cfg.url, cfg.key);

  const uploadUrl = `${cfg.url}/storage/v1/object/${RBAC_BUCKET}/${RBAC_OBJECT_PATH}`;
  const doUpload = () =>
    fetch(uploadUrl, {
      method: 'POST',
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        'Content-Type': 'application/json',
        'x-upsert': 'true',
        'cache-control': 'no-cache, max-age=0',
      },
      body: JSON.stringify(nextState),
      cache: 'no-store',
    });

  let res = await doUpload();
  if (!res.ok) {
    globalForRbac.__ulabRbacBucketReady = false;
    await ensureRbacBucket(cfg.url, cfg.key);
    res = await doUpload();
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Không thể lưu dữ liệu phân quyền lên hệ thống (${res.status}): ${errBody}`);
    }
  }
}

function getBusinessStaff(state: PersistedRbacState, businessId: string): StaffMemberDto[] {
  if (!state.staffByBusiness[businessId]) {
    state.staffByBusiness[businessId] =
      businessId === DEFAULT_BUSINESS_ID ? buildSeedStaff() : [];
  }
  return state.staffByBusiness[businessId];
}

function normalizePhone(phone?: string | null): string | null {
  if (!phone) return null;
  const clean = phone.trim().replace(/[\s\-()]/g, '');
  return clean || null;
}

function matchStaffInList(
  list: StaffMemberDto[],
  userId?: string | null,
  phone?: string | null,
  email?: string | null
): StaffMemberDto | null {
  const normPhone = normalizePhone(phone);
  const normEmail = email ? email.trim().toLowerCase() : null;

  return (
    list.find((s) => {
      if (userId && s.userId === userId) return true;
      const sp = normalizePhone(s.phone);
      const se = s.email ? s.email.trim().toLowerCase() : null;
      return (normPhone && sp === normPhone) || (normEmail && se === normEmail);
    }) || null
  );
}

export function findStaffByPhoneOrEmail(
  phone?: string | null,
  email?: string | null
): StaffMemberDto | null {
  const state = getInMemoryState();
  const list = getBusinessStaff(state, DEFAULT_BUSINESS_ID);
  return matchStaffInList(list, null, phone, email);
}

export function findStaffByUserId(userId: string): StaffMemberDto | null {
  const state = getInMemoryState();
  const list = getBusinessStaff(state, DEFAULT_BUSINESS_ID);
  return matchStaffInList(list, userId, null, null);
}

/**
 * Persistent async lookup of a staff member by userId, phone, or email.
 * Checks DB business_memberships first, then persistent Supabase Storage RBAC state.
 */
export async function findStaffMemberAsync(params: {
  userId?: string | null;
  phone?: string | null;
  email?: string | null;
  businessId?: string;
}): Promise<StaffMemberDto | null> {
  const businessId = params.businessId || DEFAULT_BUSINESS_ID;
  const state = await loadPersistedRbacState();
  const persistedList = getBusinessStaff(state, businessId);
  return matchStaffInList(persistedList, params.userId, params.phone, params.email);
}

/**
 * List locations accessible to the given user based on their business and role.
 * Reads from PostgreSQL locations if migrated, otherwise persisted Supabase Storage state.
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

  const state = await loadPersistedRbacState();
  return filterAccessibleLocations(state.locations, user);
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
  const state = await loadPersistedRbacState();

  const existingCode = state.locations.find(
    (l) => l.businessId === user.businessId && l.code.toUpperCase() === code
  );
  if (existingCode) {
    throw new Error(`Điểm bán với mã "${code}" đã tồn tại trong doanh nghiệp.`);
  }

  let createdLoc: LocationItem | null = null;

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
      createdLoc = {
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
  } catch (err) {
    console.warn('DB locations insert fallback:', err);
  }

  if (!createdLoc) {
    createdLoc = {
      id: crypto.randomUUID(),
      businessId: user.businessId,
      code,
      name,
      address: input.address?.trim() || null,
      phone: input.phone?.trim() || null,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  state.locations.push(createdLoc);
  await savePersistedRbacState(state);
  return createdLoc;
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

  const state = await loadPersistedRbacState();
  let updatedFromDb: LocationItem | null = null;

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
      updatedFromDb = {
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
  } catch (err) {
    console.warn('DB locations update fallback:', err);
  }

  const idx = state.locations.findIndex((l) => l.id === locationId);
  if (updatedFromDb) {
    if (idx !== -1) state.locations[idx] = updatedFromDb;
    else state.locations.push(updatedFromDb);
    await savePersistedRbacState(state);
    return updatedFromDb;
  }

  if (idx === -1) {
    throw new Error('Điểm bán không tồn tại.');
  }

  const existing = state.locations[idx];
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

  state.locations[idx] = updatedItem;
  await savePersistedRbacState(state);
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

    const { data: locRows, error: locErr } = await adminClient
      .from('locations')
      .select('id, code, name')
      .eq('business_id', user.businessId);

    if (!locErr && locRows) {
      const locMap = new Map<string, { code: string; name: string }>();
      locRows.forEach((l: { id: string; code: string; name: string }) => {
        locMap.set(l.id, { code: l.code, name: l.name });
      });

      const { data: memberships, error: memErr } = await adminClient
        .from('business_memberships')
        .select('user_id, role, is_active')
        .eq('business_id', user.businessId);

      if (!memErr && memberships && memberships.length > 0) {
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

  const state = await loadPersistedRbacState();
  return getBusinessStaff(state, user.businessId);
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

  const state = await loadPersistedRbacState();
  const staffList = getBusinessStaff(state, actor.businessId);
  const adminClient = createAdminClient();

  try {
    const { error: upsertErr } = await adminClient
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

    if (!upsertErr) {
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
    }

    const isElevated = targetRole === 'OWNER' || targetRole === 'ADMIN';
    await adminClient
      .from('users')
      .update({ role: isElevated ? 'ADMIN' : 'USER' })
      .eq('id', targetUserId);
  } catch (err) {
    console.warn('DB assignStaffRoleAndLocations fallback:', err);
  }

  const matchedLocations = state.locations
    .filter((l) => locationIds.includes(l.id))
    .map((l) => ({
      locationId: l.id,
      locationCode: l.code,
      locationName: l.name,
    }));

  const staffIdx = staffList.findIndex((s) => s.userId === targetUserId);
  if (staffIdx !== -1) {
    staffList[staffIdx].role = targetRole;
    staffList[staffIdx].assignedLocations = matchedLocations;
  } else {
    const { data: userInfo } = await adminClient
      .from('users')
      .select('full_name, email, phone')
      .eq('id', targetUserId)
      .maybeSingle();

    staffList.push({
      userId: targetUserId,
      fullName: userInfo?.full_name || 'Nhân viên mới',
      email: userInfo?.email || null,
      phone: userInfo?.phone || null,
      role: targetRole,
      assignedLocations: matchedLocations,
      isActive: true,
    });
  }

  await savePersistedRbacState(state);
}

/**
 * Create a new staff member (or promote/assign an existing user) with initial role & locations.
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

  const cleanPhone = normalizePhone(input.phone) || '';
  const cleanEmail = (input.email || '').trim().toLowerCase();
  const adminClient = createAdminClient();
  const state = await loadPersistedRbacState();
  const staffList = getBusinessStaff(state, actor.businessId);

  let resolvedUserId: string | null = null;
  let existingEmail: string | null = null;
  let existingPhone: string | null = null;

  try {
    if (cleanPhone) {
      const { data: byPhoneRows } = await adminClient
        .from('users')
        .select('id, role, email, phone')
        .eq('phone', cleanPhone)
        .limit(1);
      const byPhone = byPhoneRows?.[0];
      if (byPhone?.id) {
        resolvedUserId = byPhone.id;
        existingEmail = byPhone.email || null;
        existingPhone = byPhone.phone || null;
      }
    }
    if (!resolvedUserId && cleanEmail) {
      const { data: byEmailRows } = await adminClient
        .from('users')
        .select('id, role, email, phone')
        .eq('email', cleanEmail)
        .limit(1);
      const byEmail = byEmailRows?.[0];
      if (byEmail?.id) {
        resolvedUserId = byEmail.id;
        existingEmail = byEmail.email || null;
        existingPhone = byEmail.phone || null;
      }
    }
  } catch (err) {
    console.warn('Check existing user for staff member fallback:', err);
  }

  // Also check if already in persisted staff list by phone/email
  if (!resolvedUserId) {
    const existingStaff = matchStaffInList(staffList, null, cleanPhone, cleanEmail);
    if (existingStaff) {
      resolvedUserId = existingStaff.userId;
      existingEmail = existingStaff.email || null;
      existingPhone = existingStaff.phone || null;
    }
  }

  const finalUserId = resolvedUserId || crypto.randomUUID();

  const matchedLocations = state.locations
    .filter((l) => input.locationIds.includes(l.id))
    .map((l) => ({
      locationId: l.id,
      locationCode: l.code,
      locationName: l.name,
    }));

  const newStaff: StaffMemberDto = {
    userId: finalUserId,
    fullName: input.fullName.trim(),
    email: cleanEmail || existingEmail || null,
    phone: cleanPhone || existingPhone || null,
    role: input.role,
    assignedLocations: matchedLocations,
    isActive: true,
  };

  try {
    const isElevatedRole = input.role === 'OWNER' || input.role === 'ADMIN';

    if (resolvedUserId) {
      const updatePayload: Record<string, unknown> = {
        full_name: newStaff.fullName,
        role: isElevatedRole ? 'ADMIN' : 'USER',
        updated_at: new Date().toISOString(),
      };
      if (cleanPhone && !existingPhone) updatePayload.phone = cleanPhone;
      if (cleanEmail && !existingEmail) updatePayload.email = cleanEmail;

      await adminClient
        .from('users')
        .update(updatePayload)
        .eq('id', resolvedUserId);
    } else {
      await adminClient.from('users').insert({
        id: finalUserId,
        full_name: newStaff.fullName,
        email: cleanEmail || (cleanPhone ? `${cleanPhone}@coffeehouse.vn` : null),
        phone: cleanPhone || null,
        role: isElevatedRole ? 'ADMIN' : 'USER',
        current_tier_id: '5311a256-9362-4718-bbf5-6d70e9c100a8',
      });
    }

    const { error: bmErr } = await adminClient.from('business_memberships').upsert(
      {
        business_id: actor.businessId,
        user_id: finalUserId,
        role: input.role,
        is_active: true,
      },
      { onConflict: 'business_id,user_id' }
    );

    if (!bmErr && input.locationIds.length > 0) {
      await adminClient
        .from('user_location_assignments')
        .delete()
        .eq('business_id', actor.businessId)
        .eq('user_id', finalUserId);

      const assignments = input.locationIds.map((locId) => ({
        business_id: actor.businessId,
        user_id: finalUserId,
        location_id: locId,
        is_active: true,
      }));
      await adminClient.from('user_location_assignments').insert(assignments);
    }
  } catch (err) {
    console.warn('DB createStaffMember sync fallback:', err);
  }

  const existingIdx = staffList.findIndex(
    (s) =>
      s.userId === finalUserId ||
      (cleanPhone && normalizePhone(s.phone) === cleanPhone) ||
      (cleanEmail && s.email?.toLowerCase() === cleanEmail)
  );

  if (existingIdx !== -1) {
    staffList[existingIdx] = newStaff;
  } else {
    staffList.push(newStaff);
  }

  await savePersistedRbacState(state);
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
  const state = await loadPersistedRbacState();
  const staffList = getBusinessStaff(state, actor.businessId);
  const staff = staffList.find((s) => s.userId === targetUserId);
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
  await savePersistedRbacState(state);
}

/**
 * Revoke/delete a staff member's access.
 */
export async function revokeStaffMember(
  actor: UserRbacProfile,
  targetUserId: string
): Promise<void> {
  const state = await loadPersistedRbacState();
  const staffList = getBusinessStaff(state, actor.businessId);
  const staffIdx = staffList.findIndex((s) => s.userId === targetUserId);
  if (staffIdx === -1) {
    throw new Error('Nhân viên không tồn tại.');
  }

  const staff = staffList[staffIdx];
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

    if (staff.email?.toLowerCase() !== 'admin@coffeehouse.vn') {
      await adminClient
        .from('users')
        .update({ role: 'USER' })
        .eq('id', targetUserId);
    }
  } catch (err) {
    console.warn('DB revokeStaffMember fallback:', err);
  }

  staffList.splice(staffIdx, 1);
  await savePersistedRbacState(state);
}
