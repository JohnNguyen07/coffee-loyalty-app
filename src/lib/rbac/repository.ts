import {
  createAdminClient,
  resolveServiceRoleKey,
  resolveSupabaseUrl,
} from '@/lib/supabase/admin';
import {
  type MvpRole,
  type UserRbacProfile,
  type BusinessItem,
  type UpdateBusinessProfileInput,
  type LocationItem,
  type StaffMemberDto,
  type CreateLocationInput,
  type UpdateLocationInput,
  type RbacAuditLogItem,
  type RbacAuditAction,
  type RbacAuditTargetType,
  canManageLocations,
  canManageBusinessProfile,
  canAssignRole,
  canAssignLocations,
  canResetStaffPassword,
  mergeStaffMemberLists,
  validateCreateLocationInput,
  validateLocationOperationalFields,
  validateUpdateBusinessProfile,
  filterAccessibleLocations,
  validateStaffCreateInput,
  validateStaffUpdateInput,
  validateStaffPassword,
  canRevokeStaff,
  createRbacAuditEntry,
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
  opening_hours?: string | null;
  manager_name?: string | null;
  default_opening_cash?: number | null;
  accept_web_orders?: boolean | null;
  receipt_footer?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

interface BusinessDbRow {
  id: string;
  code: string;
  name: string;
  tax_code?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  default_receipt_footer?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

interface AuditLogDbRow {
  id: string;
  business_id: string;
  actor_user_id?: string | null;
  actor_name: string;
  actor_role: string;
  action: string;
  target_type: string;
  target_id?: string | null;
  target_name?: string | null;
  summary: string;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}

interface PersistedRbacState {
  locations: LocationItem[];
  staffByBusiness: Record<string, StaffMemberDto[]>;
  revokedStaffIdsByBusiness?: Record<string, string[]>;
  businessById?: Record<string, BusinessItem>;
  auditLogsByBusiness?: Record<string, RbacAuditLogItem[]>;
  updatedAt: string;
}

interface AuthStaffRbacMeta {
  businessId: string;
  role: MvpRole;
  assignedLocations: {
    locationId: string;
    locationCode: string;
    locationName: string;
  }[];
  isActive: boolean;
  fullName: string;
  phone?: string | null;
  email?: string | null;
  updatedAt: string;
}

interface AuthUserRecord {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}

const RBAC_BUCKET = 'ulab-system';
const RBAC_OBJECT_PATH = 'rbac-store.json';
const RBAC_SYSTEM_STORE_EMAIL = 'rbac-system-store@coffeehouse.vn';
const MAX_STORED_AUDIT_LOGS = 200;
const FALLBACK_MEMBER_TIER_ID = '5311a256-9362-4718-bbf5-6d70e9c100a8';

function buildSeedBusiness(businessId = DEFAULT_BUSINESS_ID): BusinessItem {
  const now = new Date().toISOString();
  return {
    id: businessId,
    code: businessId === DEFAULT_BUSINESS_ID ? 'ULAB' : 'BIZ',
    name: businessId === DEFAULT_BUSINESS_ID ? 'Ủ LAB — Matcha & Cold Brew' : 'Doanh nghiệp Ủ LAB',
    taxCode: null,
    phone: '0909000001',
    email: 'hello@ulab.vn',
    address: 'TP. Hồ Chí Minh, Việt Nam',
    defaultReceiptFooter: 'Cảm ơn quý khách — Hẹn gặp lại tại Ủ LAB!',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
}

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
      openingHours: '06:30 - 22:00',
      managerName: 'Quản trị viên Ủ LAB',
      defaultOpeningCash: 500000,
      acceptWebOrders: true,
      receiptFooter: 'Cảm ơn quý khách — Hẹn gặp lại tại Ủ LAB Hồ Con Rùa!',
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
      openingHours: '07:00 - 22:30',
      managerName: 'Nguyễn cao Hoàng Minh',
      defaultOpeningCash: 500000,
      acceptWebOrders: true,
      receiptFooter: 'Cảm ơn quý khách — Hẹn gặp lại tại Ủ LAB Nguyễn Huệ!',
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
  __ulabRbacSystemUserId?: string;
};

function createSeedState(): PersistedRbacState {
  return {
    locations: buildSeedLocations(),
    staffByBusiness: {
      [DEFAULT_BUSINESS_ID]: buildSeedStaff(),
    },
    revokedStaffIdsByBusiness: {
      [DEFAULT_BUSINESS_ID]: [],
    },
    businessById: {
      [DEFAULT_BUSINESS_ID]: buildSeedBusiness(DEFAULT_BUSINESS_ID),
    },
    auditLogsByBusiness: {
      [DEFAULT_BUSINESS_ID]: [],
    },
    updatedAt: new Date(0).toISOString(),
  };
}

function getInMemoryState(): PersistedRbacState {
  if (!globalForRbac.__ulabRbacState) {
    globalForRbac.__ulabRbacState = createSeedState();
  }
  return globalForRbac.__ulabRbacState;
}

function getSupabaseStorageConfig(): { url: string; key: string } {
  return {
    url: resolveSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL),
    key: resolveServiceRoleKey(process.env.SUPABASE_SERVICE_ROLE_KEY),
  };
}

function normalizeParsedRbacState(parsed: Partial<PersistedRbacState>): PersistedRbacState {
  return {
    locations:
      Array.isArray(parsed.locations) && parsed.locations.length > 0
        ? parsed.locations
        : buildSeedLocations(),
    staffByBusiness:
      parsed.staffByBusiness && typeof parsed.staffByBusiness === 'object'
        ? parsed.staffByBusiness
        : { [DEFAULT_BUSINESS_ID]: buildSeedStaff() },
    revokedStaffIdsByBusiness:
      parsed.revokedStaffIdsByBusiness && typeof parsed.revokedStaffIdsByBusiness === 'object'
        ? parsed.revokedStaffIdsByBusiness
        : {},
    businessById:
      parsed.businessById && typeof parsed.businessById === 'object'
        ? parsed.businessById
        : { [DEFAULT_BUSINESS_ID]: buildSeedBusiness(DEFAULT_BUSINESS_ID) },
    auditLogsByBusiness:
      parsed.auditLogsByBusiness && typeof parsed.auditLogsByBusiness === 'object'
        ? parsed.auditLogsByBusiness
        : { [DEFAULT_BUSINESS_ID]: [] },
    updatedAt: typeof parsed.updatedAt === 'string' && parsed.updatedAt ? parsed.updatedAt : new Date(0).toISOString(),
  };
}

async function ensureRbacBucket(
  adminClient: ReturnType<typeof createAdminClient>,
  url: string,
  key: string
): Promise<void> {
  if (globalForRbac.__ulabRbacBucketReady) return;

  try {
    const { error } = await adminClient.storage.createBucket(RBAC_BUCKET, { public: false });
    if (!error) {
      globalForRbac.__ulabRbacBucketReady = true;
      return;
    }
    const errMsg = (error.message || '').toLowerCase();
    if (errMsg.includes('already exists') || errMsg.includes('duplicate')) {
      globalForRbac.__ulabRbacBucketReady = true;
      return;
    }
  } catch {
    // fallback to REST bucket check below
  }

  try {
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
    if (res.ok || res.status === 409) {
      globalForRbac.__ulabRbacBucketReady = true;
    } else {
      const txt = await res.text().catch(() => '');
      if (txt.toLowerCase().includes('already exists') || txt.toLowerCase().includes('duplicate')) {
        globalForRbac.__ulabRbacBucketReady = true;
      }
    }
  } catch {
    // ignore bucket ensure failure here; upload will surface exact error
  }
}

async function listAllAuthUsers(
  adminClient: ReturnType<typeof createAdminClient>
): Promise<AuthUserRecord[]> {
  const allUsers: AuthUserRecord[] = [];
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error || !data?.users?.length) break;
    allUsers.push(...(data.users as AuthUserRecord[]));
    if (data.users.length < 1000) break;
  }
  return allUsers;
}

async function loadStateFromSupabaseStorage(
  adminClient: ReturnType<typeof createAdminClient>,
  cfg: { url: string; key: string }
): Promise<PersistedRbacState | null> {
  try {
    const { data, error } = await adminClient.storage
      .from(RBAC_BUCKET)
      .download(RBAC_OBJECT_PATH);
    if (!error && data) {
      const rawText = await data.text();
      if (rawText) {
        return normalizeParsedRbacState(JSON.parse(rawText) as Partial<PersistedRbacState>);
      }
    }
  } catch (err) {
    console.warn('Supabase Storage SDK download fallback:', err);
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
      return normalizeParsedRbacState(parsed);
    }
  } catch (err) {
    console.warn('Supabase Storage fetch download fallback:', err);
  }

  return null;
}

async function saveStateToSupabaseStorage(
  adminClient: ReturnType<typeof createAdminClient>,
  cfg: { url: string; key: string },
  state: PersistedRbacState
): Promise<boolean> {
  await ensureRbacBucket(adminClient, cfg.url, cfg.key);
  const payload = JSON.stringify(state);

  try {
    const { error } = await adminClient.storage
      .from(RBAC_BUCKET)
      .upload(RBAC_OBJECT_PATH, payload, {
        contentType: 'application/json',
        upsert: true,
        cacheControl: '0',
      });
    if (!error) return true;
  } catch {
    // fallback to fetch upload below
  }

  try {
    const uploadUrl = `${cfg.url}/storage/v1/object/${RBAC_BUCKET}/${RBAC_OBJECT_PATH}`;
    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        'Content-Type': 'application/json',
        'x-upsert': 'true',
        'cache-control': 'no-cache, max-age=0',
      },
      body: payload,
      cache: 'no-store',
    });
    if (res.ok) return true;
  } catch {
    // handled by caller
  }

  return false;
}

interface AuthBackupData {
  snapshotState: PersistedRbacState | null;
  perUserEntriesByBusiness: Record<string, { staff: StaffMemberDto; updatedAtMs: number }[]>;
}

function parseAuthStaffMeta(user: AuthUserRecord): {
  businessId: string;
  staff: StaffMemberDto;
  updatedAtMs: number;
} | null {
  const meta = user.user_metadata;
  if (!meta || typeof meta !== 'object') return null;
  const raw = meta.ulab_rbac as Partial<AuthStaffRbacMeta> | undefined;
  if (!raw || typeof raw !== 'object' || !raw.businessId || !raw.role) return null;

  const fullName =
    (typeof raw.fullName === 'string' && raw.fullName.trim()) ||
    (typeof meta.full_name === 'string' && meta.full_name.trim()) ||
    'Nhân viên';

  const locations = Array.isArray(raw.assignedLocations)
    ? raw.assignedLocations.filter(
        (loc): loc is { locationId: string; locationCode: string; locationName: string } =>
          Boolean(loc && typeof loc.locationId === 'string')
      )
    : [];

  return {
    businessId: String(raw.businessId),
    updatedAtMs: Date.parse(raw.updatedAt || '') || 0,
    staff: {
      userId: user.id,
      fullName,
      email: raw.email ?? (user.email || null),
      phone: raw.phone ?? (typeof meta.phone === 'string' ? meta.phone : null),
      role: raw.role as MvpRole,
      assignedLocations: locations,
      isActive: raw.isActive !== undefined ? Boolean(raw.isActive) : true,
    },
  };
}

async function loadRbacBackupFromAuth(
  adminClient: ReturnType<typeof createAdminClient>
): Promise<AuthBackupData> {
  const empty: AuthBackupData = {
    snapshotState: null,
    perUserEntriesByBusiness: {},
  };

  try {
    const authUsers = await listAllAuthUsers(adminClient);
    let snapshotState: PersistedRbacState | null = null;
    const perUserEntriesByBusiness: Record<
      string,
      { staff: StaffMemberDto; updatedAtMs: number }[]
    > = {};

    for (const u of authUsers) {
      if (u.email?.toLowerCase() === RBAC_SYSTEM_STORE_EMAIL) {
        globalForRbac.__ulabRbacSystemUserId = u.id;
        const rawSnapshot = u.user_metadata?.ulab_rbac_state as
          | Partial<PersistedRbacState>
          | undefined;
        if (rawSnapshot && typeof rawSnapshot === 'object') {
          snapshotState = normalizeParsedRbacState(rawSnapshot);
        }
        continue;
      }

      const parsed = parseAuthStaffMeta(u);
      if (parsed) {
        if (!perUserEntriesByBusiness[parsed.businessId]) {
          perUserEntriesByBusiness[parsed.businessId] = [];
        }
        perUserEntriesByBusiness[parsed.businessId].push({
          staff: parsed.staff,
          updatedAtMs: parsed.updatedAtMs,
        });
      }
    }

    return { snapshotState, perUserEntriesByBusiness };
  } catch (err) {
    console.warn('Auth RBAC backup read fallback:', err);
    return empty;
  }
}

async function saveRbacSnapshotToAuth(
  adminClient: ReturnType<typeof createAdminClient>,
  state: PersistedRbacState
): Promise<boolean> {
  const compactLogs: Record<string, RbacAuditLogItem[]> = {};
  if (state.auditLogsByBusiness) {
    for (const [bizId, logs] of Object.entries(state.auditLogsByBusiness)) {
      compactLogs[bizId] = (logs || []).slice(0, 30);
    }
  }

  const compactSnapshot: PersistedRbacState = {
    locations: state.locations,
    staffByBusiness: state.staffByBusiness,
    revokedStaffIdsByBusiness: state.revokedStaffIdsByBusiness || {},
    businessById: state.businessById,
    auditLogsByBusiness: compactLogs,
    updatedAt: state.updatedAt,
  };

  try {
    let sysUserId = globalForRbac.__ulabRbacSystemUserId;
    if (sysUserId) {
      const { error } = await adminClient.auth.admin.updateUserById(sysUserId, {
        user_metadata: {
          full_name: 'ULAB RBAC System Store',
          ulab_rbac_state: compactSnapshot,
        },
      });
      if (!error) return true;
      globalForRbac.__ulabRbacSystemUserId = undefined;
      sysUserId = undefined;
    }

    const authUsers = await listAllAuthUsers(adminClient);
    const existing = authUsers.find(
      (u) => u.email?.toLowerCase() === RBAC_SYSTEM_STORE_EMAIL
    );
    if (existing) {
      globalForRbac.__ulabRbacSystemUserId = existing.id;
      const { error } = await adminClient.auth.admin.updateUserById(existing.id, {
        user_metadata: {
          full_name: 'ULAB RBAC System Store',
          ulab_rbac_state: compactSnapshot,
        },
      });
      return !error;
    }

    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email: RBAC_SYSTEM_STORE_EMAIL,
      password: `${crypto.randomUUID()}Aa1!`,
      email_confirm: true,
      user_metadata: {
        full_name: 'ULAB RBAC System Store',
        ulab_rbac_state: compactSnapshot,
      },
    });
    if (!createErr && created?.user) {
      globalForRbac.__ulabRbacSystemUserId = created.user.id;
      return true;
    }
  } catch (err) {
    console.warn('Auth RBAC snapshot save fallback:', err);
  }

  return false;
}

function mergeAuditLogBuckets(
  primaryLogs?: Record<string, RbacAuditLogItem[]>,
  secondaryLogs?: Record<string, RbacAuditLogItem[]>
): Record<string, RbacAuditLogItem[]> {
  const merged: Record<string, RbacAuditLogItem[]> = {};
  const keys = new Set([
    ...Object.keys(primaryLogs || {}),
    ...Object.keys(secondaryLogs || {}),
  ]);

  for (const bizId of keys) {
    const map = new Map<string, RbacAuditLogItem>();
    for (const item of [...(secondaryLogs?.[bizId] || []), ...(primaryLogs?.[bizId] || [])]) {
      if (item?.id) map.set(item.id, item);
    }
    merged[bizId] = Array.from(map.values())
      .sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0))
      .slice(0, MAX_STORED_AUDIT_LOGS);
  }

  return merged;
}

async function loadPersistedRbacState(): Promise<PersistedRbacState> {
  const cfg = getSupabaseStorageConfig();
  const adminClient = createAdminClient();

  const [storageRes, authRes] = await Promise.allSettled([
    loadStateFromSupabaseStorage(adminClient, cfg),
    loadRbacBackupFromAuth(adminClient),
  ]);

  const storageState = storageRes.status === 'fulfilled' ? storageRes.value : null;
  const authBackup: AuthBackupData =
    authRes.status === 'fulfilled'
      ? authRes.value
      : { snapshotState: null, perUserEntriesByBusiness: {} };
  const authState = authBackup.snapshotState;

  if (!storageState && !authState && Object.keys(authBackup.perUserEntriesByBusiness).length === 0) {
    return getInMemoryState();
  }

  const storageMs = Date.parse(storageState?.updatedAt || '') || 0;
  const authMs = Date.parse(authState?.updatedAt || '') || 0;
  const newestBase =
    storageState && (!authState || storageMs >= authMs)
      ? storageState
      : authState || createSeedState();
  const olderBase =
    newestBase === storageState ? authState : storageState;
  const newestBaseMs = Math.max(storageMs, authMs);

  const bizIds = new Set<string>([
    DEFAULT_BUSINESS_ID,
    ...Object.keys(newestBase.staffByBusiness || {}),
    ...Object.keys(olderBase?.staffByBusiness || {}),
    ...Object.keys(authBackup.perUserEntriesByBusiness),
  ]);

  const mergedStaffByBusiness: Record<string, StaffMemberDto[]> = {};
  const revokedByBusiness: Record<string, string[]> = {
    ...(olderBase?.revokedStaffIdsByBusiness || {}),
    ...(newestBase.revokedStaffIdsByBusiness || {}),
  };

  for (const bizId of bizIds) {
    const revokedIds = revokedByBusiness[bizId] || [];
    const primaryStaff = [...(newestBase.staffByBusiness?.[bizId] || [])];
    const olderStaff = olderBase?.staffByBusiness?.[bizId] || [];
    const perUserEntries = authBackup.perUserEntriesByBusiness[bizId] || [];

    const fresherPerUser: StaffMemberDto[] = [];
    const standardPerUser: StaffMemberDto[] = [];
    for (const entry of perUserEntries) {
      if (revokedIds.includes(entry.staff.userId)) continue;
      if (entry.updatedAtMs > newestBaseMs) {
        fresherPerUser.push(entry.staff);
      } else {
        standardPerUser.push(entry.staff);
      }
    }

    const baseMerged = mergeStaffMemberLists(
      mergeStaffMemberLists(fresherPerUser, primaryStaff, revokedIds),
      mergeStaffMemberLists(olderStaff, standardPerUser, revokedIds),
      revokedIds
    );

    mergedStaffByBusiness[bizId] =
      bizId === DEFAULT_BUSINESS_ID
        ? mergeStaffMemberLists(baseMerged, buildSeedStaff(), revokedIds)
        : baseMerged;
  }

  const normalized: PersistedRbacState = {
    locations:
      newestBase.locations && newestBase.locations.length > 0
        ? newestBase.locations
        : olderBase?.locations && olderBase.locations.length > 0
          ? olderBase.locations
          : buildSeedLocations(),
    staffByBusiness: mergedStaffByBusiness,
    revokedStaffIdsByBusiness: revokedByBusiness,
    businessById: {
      ...(olderBase?.businessById || {}),
      ...(newestBase.businessById || {}),
    },
    auditLogsByBusiness: mergeAuditLogBuckets(
      newestBase.auditLogsByBusiness,
      olderBase?.auditLogsByBusiness
    ),
    updatedAt: newestBase.updatedAt || new Date().toISOString(),
  };

  globalForRbac.__ulabRbacState = normalized;
  return normalized;
}

async function savePersistedRbacState(state: PersistedRbacState): Promise<void> {
  const nextState: PersistedRbacState = {
    ...state,
    revokedStaffIdsByBusiness: state.revokedStaffIdsByBusiness || {},
    updatedAt: new Date().toISOString(),
  };
  globalForRbac.__ulabRbacState = nextState;

  const cfg = getSupabaseStorageConfig();
  const adminClient = createAdminClient();

  const [storageOk, authOk] = await Promise.all([
    saveStateToSupabaseStorage(adminClient, cfg, nextState),
    saveRbacSnapshotToAuth(adminClient, nextState),
  ]);

  if (!storageOk && !authOk) {
    throw new Error('Không thể lưu dữ liệu phân quyền lên hệ thống lưu trữ từ xa.');
  }
}

function getBusinessStaff(state: PersistedRbacState, businessId: string): StaffMemberDto[] {
  if (!state.staffByBusiness[businessId]) {
    state.staffByBusiness[businessId] =
      businessId === DEFAULT_BUSINESS_ID ? buildSeedStaff() : [];
  }
  return state.staffByBusiness[businessId];
}

function getRevokedStaffIds(state: PersistedRbacState, businessId: string): string[] {
  if (!state.revokedStaffIdsByBusiness) {
    state.revokedStaffIdsByBusiness = {};
  }
  if (!state.revokedStaffIdsByBusiness[businessId]) {
    state.revokedStaffIdsByBusiness[businessId] = [];
  }
  return state.revokedStaffIdsByBusiness[businessId];
}

function unmarkStaffRevoked(state: PersistedRbacState, businessId: string, userId: string): void {
  const revoked = getRevokedStaffIds(state, businessId);
  const idx = revoked.indexOf(userId);
  if (idx !== -1) revoked.splice(idx, 1);
}

function markStaffRevoked(state: PersistedRbacState, businessId: string, userId: string): void {
  const revoked = getRevokedStaffIds(state, businessId);
  if (!revoked.includes(userId)) revoked.push(userId);
}

function getBusinessAuditLogs(state: PersistedRbacState, businessId: string): RbacAuditLogItem[] {
  if (!state.auditLogsByBusiness) {
    state.auditLogsByBusiness = {};
  }
  if (!state.auditLogsByBusiness[businessId]) {
    state.auditLogsByBusiness[businessId] = [];
  }
  return state.auditLogsByBusiness[businessId];
}

function getPersistedBusiness(state: PersistedRbacState, businessId: string): BusinessItem {
  if (!state.businessById) {
    state.businessById = {};
  }
  if (!state.businessById[businessId]) {
    state.businessById[businessId] = buildSeedBusiness(businessId);
  }
  return state.businessById[businessId];
}

function mapLocationRow(row: LocationDbRow, persisted?: LocationItem): LocationItem {
  const hasExtendedCols = row.opening_hours !== undefined || row.default_opening_cash !== undefined;
  return {
    id: row.id,
    businessId: row.business_id,
    code: row.code,
    name: row.name,
    address: row.address || null,
    phone: row.phone || null,
    openingHours: hasExtendedCols
      ? (row.opening_hours ?? '06:30 - 22:00')
      : (persisted?.openingHours ?? '06:30 - 22:00'),
    managerName: hasExtendedCols
      ? (row.manager_name ?? null)
      : (persisted?.managerName ?? null),
    defaultOpeningCash: hasExtendedCols
      ? (typeof row.default_opening_cash === 'number' ? row.default_opening_cash : 500000)
      : (typeof persisted?.defaultOpeningCash === 'number' ? persisted.defaultOpeningCash : 500000),
    acceptWebOrders: hasExtendedCols
      ? (row.accept_web_orders !== null && row.accept_web_orders !== undefined ? Boolean(row.accept_web_orders) : true)
      : (persisted?.acceptWebOrders !== undefined ? persisted.acceptWebOrders : true),
    receiptFooter: hasExtendedCols
      ? (row.receipt_footer ?? null)
      : (persisted?.receiptFooter ?? null),
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Record an RBAC audit log entry into PostgreSQL (if migrated) and persisted RBAC store.
 */
export async function recordRbacAuditLog(params: {
  actor: Pick<UserRbacProfile, 'businessId' | 'userId' | 'fullName' | 'role'>;
  action: RbacAuditAction;
  targetType: RbacAuditTargetType;
  targetId?: string | null;
  targetName?: string | null;
  summary: string;
  metadata?: Record<string, unknown>;
  stateOverride?: PersistedRbacState;
}): Promise<RbacAuditLogItem> {
  const entry = createRbacAuditEntry({
    businessId: params.actor.businessId,
    actorUserId: params.actor.userId,
    actorName: params.actor.fullName,
    actorRole: params.actor.role,
    action: params.action,
    targetType: params.targetType,
    targetId: params.targetId,
    targetName: params.targetName,
    summary: params.summary,
    metadata: params.metadata,
  });

  try {
    const adminClient = createAdminClient();
    await adminClient.from('rbac_audit_logs').insert({
      id: entry.id,
      business_id: entry.businessId,
      actor_user_id: entry.actorUserId,
      actor_name: entry.actorName,
      actor_role: entry.actorRole,
      action: entry.action,
      target_type: entry.targetType,
      target_id: entry.targetId,
      target_name: entry.targetName,
      summary: entry.summary,
      metadata: entry.metadata || {},
      created_at: entry.createdAt,
    });
  } catch (err) {
    console.warn('DB rbac_audit_logs insert fallback:', err);
  }

  const state = params.stateOverride || (await loadPersistedRbacState());
  const logs = getBusinessAuditLogs(state, params.actor.businessId);
  logs.unshift(entry);
  if (logs.length > MAX_STORED_AUDIT_LOGS) {
    logs.length = MAX_STORED_AUDIT_LOGS;
  }
  if (!params.stateOverride) {
    await savePersistedRbacState(state);
  }

  return entry;
}

/**
 * List RBAC audit logs for the user's business.
 * Only OWNER and ADMIN can view audit logs.
 */
export async function listRbacAuditLogs(
  user: UserRbacProfile,
  limit = 100
): Promise<RbacAuditLogItem[]> {
  if (user.role !== 'OWNER' && user.role !== 'ADMIN') {
    throw new Error('FORBIDDEN_VIEW_AUDIT_LOGS: Chỉ Owner hoặc Admin mới có quyền xem nhật ký kiểm toán an ninh.');
  }

  try {
    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('rbac_audit_logs')
      .select('*')
      .eq('business_id', user.businessId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!error && Array.isArray(data) && data.length > 0) {
      return (data as AuditLogDbRow[]).map((row) => ({
        id: row.id,
        businessId: row.business_id,
        actorUserId: row.actor_user_id || null,
        actorName: row.actor_name,
        actorRole: row.actor_role as MvpRole,
        action: row.action as RbacAuditAction,
        targetType: row.target_type as RbacAuditTargetType,
        targetId: row.target_id || null,
        targetName: row.target_name || null,
        summary: row.summary,
        metadata: row.metadata || {},
        createdAt: row.created_at,
      }));
    }
  } catch (err) {
    console.warn('DB rbac_audit_logs query fallback:', err);
  }

  const state = await loadPersistedRbacState();
  return getBusinessAuditLogs(state, user.businessId).slice(0, limit);
}

/**
 * Get the user's business profile.
 */
export async function getBusinessProfile(user: UserRbacProfile): Promise<BusinessItem> {
  const state = await loadPersistedRbacState();
  const persisted = getPersistedBusiness(state, user.businessId);

  try {
    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('businesses')
      .select('*')
      .eq('id', user.businessId)
      .maybeSingle();

    if (!error && data) {
      const row = data as BusinessDbRow;
      const hasExtended = row.email !== undefined || row.default_receipt_footer !== undefined;
      return {
        id: row.id,
        code: row.code,
        name: row.name,
        taxCode: row.tax_code ?? null,
        phone: row.phone ?? null,
        email: hasExtended ? (row.email ?? null) : (persisted.email ?? null),
        address: row.address ?? null,
        defaultReceiptFooter: hasExtended
          ? (row.default_receipt_footer ?? persisted.defaultReceiptFooter ?? null)
          : (persisted.defaultReceiptFooter ?? null),
        isActive: Boolean(row.is_active),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    }
  } catch (err) {
    console.warn('DB getBusinessProfile fallback:', err);
  }

  return persisted;
}

/**
 * Update the business profile (OWNER and ADMIN only).
 */
export async function updateBusinessProfile(
  user: UserRbacProfile,
  input: UpdateBusinessProfileInput
): Promise<BusinessItem> {
  if (!canManageBusinessProfile(user.role)) {
    throw new Error('FORBIDDEN_CANNOT_MANAGE_BUSINESS: Chỉ Owner hoặc Admin mới có quyền cập nhật hồ sơ doanh nghiệp.');
  }

  const validated = validateUpdateBusinessProfile(input);
  const state = await loadPersistedRbacState();
  const existing = getPersistedBusiness(state, user.businessId);
  const now = new Date().toISOString();

  const nextBusiness: BusinessItem = {
    ...existing,
    name: validated.name !== undefined ? validated.name : existing.name,
    taxCode: validated.taxCode !== undefined ? validated.taxCode : existing.taxCode,
    phone: validated.phone !== undefined ? validated.phone : existing.phone,
    email: validated.email !== undefined ? validated.email : existing.email,
    address: validated.address !== undefined ? validated.address : existing.address,
    defaultReceiptFooter:
      validated.defaultReceiptFooter !== undefined
        ? validated.defaultReceiptFooter
        : existing.defaultReceiptFooter,
    updatedAt: now,
  };

  try {
    const adminClient = createAdminClient();
    const fullPayload: Record<string, unknown> = {
      name: nextBusiness.name,
      tax_code: nextBusiness.taxCode ?? null,
      phone: nextBusiness.phone ?? null,
      email: nextBusiness.email ?? null,
      address: nextBusiness.address ?? null,
      default_receipt_footer: nextBusiness.defaultReceiptFooter ?? null,
      updated_at: now,
    };

    const { error } = await adminClient
      .from('businesses')
      .update(fullPayload)
      .eq('id', user.businessId);

    if (error) {
      // Fallback to base columns if migration 0011 has not been applied
      await adminClient
        .from('businesses')
        .update({
          name: nextBusiness.name,
          tax_code: nextBusiness.taxCode ?? null,
          phone: nextBusiness.phone ?? null,
          address: nextBusiness.address ?? null,
          updated_at: now,
        })
        .eq('id', user.businessId);
    }
  } catch (err) {
    console.warn('DB updateBusinessProfile fallback:', err);
  }

  if (!state.businessById) state.businessById = {};
  state.businessById[user.businessId] = nextBusiness;

  await recordRbacAuditLog({
    actor: user,
    action: 'UPDATE_BUSINESS_PROFILE',
    targetType: 'BUSINESS',
    targetId: nextBusiness.id,
    targetName: nextBusiness.name,
    summary: `Cập nhật hồ sơ doanh nghiệp "${nextBusiness.name}"`,
    metadata: {
      phone: nextBusiness.phone,
      email: nextBusiness.email,
      address: nextBusiness.address,
    },
    stateOverride: state,
  });

  await savePersistedRbacState(state);
  return nextBusiness;
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
 * Checks DB / Supabase Storage / Auth durable RBAC state, excluding revoked IDs.
 */
export async function findStaffMemberAsync(params: {
  userId?: string | null;
  phone?: string | null;
  email?: string | null;
  businessId?: string;
}): Promise<StaffMemberDto | null> {
  const businessId = params.businessId || DEFAULT_BUSINESS_ID;
  const state = await loadPersistedRbacState();
  const revokedIds = getRevokedStaffIds(state, businessId);
  const persistedList = getBusinessStaff(state, businessId).filter(
    (s) => !revokedIds.includes(s.userId)
  );
  return matchStaffInList(persistedList, params.userId, params.phone, params.email);
}

/**
 * Resolve default MEMBER tier UUID dynamically from PostgreSQL tiers table.
 */
async function resolveDefaultMemberTierId(
  adminClient: ReturnType<typeof createAdminClient>
): Promise<string> {
  try {
    const { data: memberTier } = await adminClient
      .from('tiers')
      .select('id')
      .eq('code', 'MEMBER')
      .limit(1)
      .maybeSingle();
    if (memberTier?.id) return String(memberTier.id);

    const { data: anyTier } = await adminClient
      .from('tiers')
      .select('id')
      .order('min_spending', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (anyTier?.id) return String(anyTier.id);
  } catch (err) {
    console.warn('resolveDefaultMemberTierId fallback:', err);
  }
  return FALLBACK_MEMBER_TIER_ID;
}

/**
 * Helper to resolve a target staff member from persisted state or PostgreSQL tables.
 */
async function resolveTargetStaff(
  state: PersistedRbacState,
  businessId: string,
  targetUserId: string
): Promise<{ staff: StaffMemberDto; stateIdx: number }> {
  const staffList = getBusinessStaff(state, businessId);
  const stateIdx = staffList.findIndex((s) => s.userId === targetUserId);
  if (stateIdx !== -1) {
    return { staff: staffList[stateIdx], stateIdx };
  }

  try {
    const adminClient = createAdminClient();
    const { data: membership } = await adminClient
      .from('business_memberships')
      .select('user_id, role, is_active')
      .eq('business_id', businessId)
      .eq('user_id', targetUserId)
      .maybeSingle();

    if (membership) {
      const { data: userInfo } = await adminClient
        .from('users')
        .select('id, full_name, email, phone')
        .eq('id', targetUserId)
        .maybeSingle();

      const hydrated: StaffMemberDto = {
        userId: targetUserId,
        fullName: userInfo?.full_name || 'Nhân viên',
        email: userInfo?.email || null,
        phone: userInfo?.phone || null,
        role: membership.role as MvpRole,
        assignedLocations: [],
        isActive: Boolean(membership.is_active),
      };
      staffList.push(hydrated);
      return { staff: hydrated, stateIdx: staffList.length - 1 };
    }
  } catch (err) {
    console.warn('resolveTargetStaff DB fallback:', err);
  }

  throw new Error('Nhân viên không tồn tại.');
}

/**
 * Synchronize staff login credentials and RBAC metadata with Supabase Auth using service role client.
 */
async function syncAuthUserAccount(params: {
  existingUserId?: string | null;
  email?: string | null;
  phone?: string | null;
  fullName: string;
  password?: string;
  createIfMissing?: boolean;
  rbacMeta?: AuthStaffRbacMeta | null;
  clearRbacMeta?: boolean;
}): Promise<{ authUserId: string | null; provisioned: boolean }> {
  const cleanPhone = normalizePhone(params.phone);
  const cleanEmail = params.email ? params.email.trim().toLowerCase() : null;
  const authEmail = cleanEmail || (cleanPhone ? `${cleanPhone}@coffeehouse.vn` : null);
  const adminClient = createAdminClient();

  const buildMergedMetadata = (existingMeta?: Record<string, unknown>): Record<string, unknown> => {
    const merged: Record<string, unknown> = {
      ...(existingMeta || {}),
      full_name: params.fullName,
      ...(cleanPhone ? { phone: cleanPhone } : {}),
    };
    if (params.clearRbacMeta) {
      delete merged.ulab_rbac;
    } else if (params.rbacMeta) {
      merged.ulab_rbac = params.rbacMeta;
    }
    return merged;
  };

  if (!authEmail && !params.existingUserId) {
    return { authUserId: null, provisioned: false };
  }

  try {
    if (params.existingUserId) {
      const { data: byIdData } = await adminClient.auth.admin.getUserById(params.existingUserId);
      if (byIdData?.user) {
        const updateAttrs: {
          password?: string;
          email_confirm: boolean;
          user_metadata: Record<string, unknown>;
        } = {
          email_confirm: true,
          user_metadata: buildMergedMetadata(byIdData.user.user_metadata),
        };
        if (params.password) {
          updateAttrs.password = params.password;
        }
        const { data: updatedData, error: updateErr } =
          await adminClient.auth.admin.updateUserById(byIdData.user.id, updateAttrs);
        if (!updateErr && updatedData?.user) {
          return { authUserId: updatedData.user.id, provisioned: Boolean(params.password) };
        }
      }

      const { data: userRow } = await adminClient
        .from('users')
        .select('google_id')
        .eq('id', params.existingUserId)
        .maybeSingle();

      if (userRow?.google_id && userRow.google_id !== params.existingUserId) {
        const { data: byGoogleData } = await adminClient.auth.admin.getUserById(
          String(userRow.google_id)
        );
        if (byGoogleData?.user) {
          const updateAttrs: {
            password?: string;
            email_confirm: boolean;
            user_metadata: Record<string, unknown>;
          } = {
            email_confirm: true,
            user_metadata: buildMergedMetadata(byGoogleData.user.user_metadata),
          };
          if (params.password) {
            updateAttrs.password = params.password;
          }
          const retryByGoogleId = await adminClient.auth.admin.updateUserById(
            byGoogleData.user.id,
            updateAttrs
          );
          if (!retryByGoogleId.error && retryByGoogleId.data?.user) {
            return { authUserId: retryByGoogleId.data.user.id, provisioned: Boolean(params.password) };
          }
        }
      }
    }

    if (authEmail) {
      const authUsers = await listAllAuthUsers(adminClient);
      const existingAuth = authUsers.find((u) => u.email?.toLowerCase() === authEmail);
      if (existingAuth) {
        const updateAttrs: {
          password?: string;
          email_confirm: boolean;
          user_metadata: Record<string, unknown>;
        } = {
          email_confirm: true,
          user_metadata: buildMergedMetadata(existingAuth.user_metadata),
        };
        if (params.password) {
          updateAttrs.password = params.password;
        }
        await adminClient.auth.admin.updateUserById(existingAuth.id, updateAttrs);
        if (params.existingUserId) {
          await adminClient
            .from('users')
            .update({ google_id: existingAuth.id })
            .eq('id', params.existingUserId);
        }
        return { authUserId: existingAuth.id, provisioned: Boolean(params.password) };
      }

      if (params.password || params.createIfMissing) {
        const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
          email: authEmail,
          password: params.password || `${crypto.randomUUID()}Aa1!`,
          email_confirm: true,
          user_metadata: buildMergedMetadata(),
        });
        if (!createErr && created?.user) {
          if (params.existingUserId) {
            await adminClient
              .from('users')
              .update({ google_id: created.user.id })
              .eq('id', params.existingUserId);
          }
          return { authUserId: created.user.id, provisioned: Boolean(params.password) };
        }
      }
    }
  } catch (err) {
    console.warn('Supabase Auth sync fallback:', err);
  }

  return { authUserId: params.existingUserId || null, provisioned: false };
}

/**
 * List all location IDs belonging to a business (used by server-guard for OWNER/ADMIN).
 */
export async function listAllLocationIdsForBusiness(businessId: string): Promise<string[]> {
  try {
    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('locations')
      .select('id, is_active')
      .eq('business_id', businessId)
      .order('is_active', { ascending: false })
      .order('created_at', { ascending: true });

    if (!error && data && data.length > 0) {
      return data.map((l: { id: string }) => l.id);
    }
  } catch {
    // fallback to persisted state
  }

  const state = await loadPersistedRbacState();
  return state.locations
    .filter((l) => l.businessId === businessId)
    .sort((a, b) => Number(b.isActive) - Number(a.isActive))
    .map((l) => l.id);
}

/**
 * List locations accessible to the given user based on their business and role.
 * Reads from PostgreSQL locations if migrated, otherwise persisted Supabase Storage state.
 */
export async function listLocationsForUser(user: UserRbacProfile): Promise<LocationItem[]> {
  const state = await loadPersistedRbacState();
  const persistedMap = new Map(state.locations.map((l) => [l.id, l]));

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
      return rows.map((r) => mapLocationRow(r, persistedMap.get(r.id)));
    }
  } catch (err) {
    console.warn('DB locations query fallback:', err);
  }

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
  const ops = validateLocationOperationalFields(input);
  const state = await loadPersistedRbacState();

  const existingCode = state.locations.find(
    (l) => l.businessId === user.businessId && l.code.toUpperCase() === code
  );
  if (existingCode) {
    throw new Error(`Điểm bán với mã "${code}" đã tồn tại trong doanh nghiệp.`);
  }

  const openingHours = ops.openingHours ?? '06:30 - 22:00';
  const managerName = ops.managerName ?? null;
  const defaultOpeningCash = ops.defaultOpeningCash ?? 500000;
  const acceptWebOrders = ops.acceptWebOrders ?? true;
  const receiptFooter = ops.receiptFooter ?? null;

  let createdLoc: LocationItem | null = null;

  try {
    const adminClient = createAdminClient();
    const baseInsert = {
      business_id: user.businessId,
      code,
      name,
      address: input.address?.trim() || null,
      phone: input.phone?.trim() || null,
      is_active: true,
    };

    const fullRes = await adminClient
      .from('locations')
      .insert({
        ...baseInsert,
        opening_hours: openingHours,
        manager_name: managerName,
        default_opening_cash: defaultOpeningCash,
        accept_web_orders: acceptWebOrders,
        receipt_footer: receiptFooter,
      })
      .select('*')
      .single();

    if (!fullRes.error && fullRes.data) {
      createdLoc = mapLocationRow(fullRes.data as LocationDbRow);
    } else if (fullRes.error) {
      // Fallback insert without migration 0011 columns
      const baseRes = await adminClient
        .from('locations')
        .insert(baseInsert)
        .select('*')
        .single();

      if (!baseRes.error && baseRes.data) {
        const mappedBase = mapLocationRow(baseRes.data as LocationDbRow);
        createdLoc = {
          ...mappedBase,
          openingHours,
          managerName,
          defaultOpeningCash,
          acceptWebOrders,
          receiptFooter,
        };
      }
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
      openingHours,
      managerName,
      defaultOpeningCash,
      acceptWebOrders,
      receiptFooter,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  state.locations.push(createdLoc);
  await recordRbacAuditLog({
    actor: user,
    action: 'CREATE_LOCATION',
    targetType: 'LOCATION',
    targetId: createdLoc.id,
    targetName: `${createdLoc.code} — ${createdLoc.name}`,
    summary: `Tạo điểm bán mới "${createdLoc.name}" (${createdLoc.code})`,
    metadata: {
      openingHours: createdLoc.openingHours,
      defaultOpeningCash: createdLoc.defaultOpeningCash,
      acceptWebOrders: createdLoc.acceptWebOrders,
    },
    stateOverride: state,
  });

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

  const ops = validateLocationOperationalFields(input);
  const now = new Date().toISOString();
  const baseUpdates: Record<string, unknown> = {
    updated_at: now,
  };

  if (input.name !== undefined) {
    const trimmedName = input.name.trim();
    if (trimmedName.length < 2) {
      throw new Error('Tên điểm bán không được để trống.');
    }
    baseUpdates.name = trimmedName;
  }
  if (input.address !== undefined) {
    baseUpdates.address = input.address.trim() || null;
  }
  if (input.phone !== undefined) {
    baseUpdates.phone = input.phone.trim() || null;
  }
  if (input.isActive !== undefined) {
    baseUpdates.is_active = Boolean(input.isActive);
  }

  const extendedUpdates: Record<string, unknown> = { ...baseUpdates };
  if (ops.openingHours !== undefined) extendedUpdates.opening_hours = ops.openingHours;
  if (ops.managerName !== undefined) extendedUpdates.manager_name = ops.managerName;
  if (ops.defaultOpeningCash !== undefined) extendedUpdates.default_opening_cash = ops.defaultOpeningCash;
  if (ops.acceptWebOrders !== undefined) extendedUpdates.accept_web_orders = ops.acceptWebOrders;
  if (ops.receiptFooter !== undefined) extendedUpdates.receipt_footer = ops.receiptFooter;

  const state = await loadPersistedRbacState();
  const idx = state.locations.findIndex((l) => l.id === locationId);
  const existing = idx !== -1 ? state.locations[idx] : undefined;

  if (existing && existing.businessId !== user.businessId) {
    throw new Error('FORBIDDEN_CROSS_BUSINESS: Không thể chỉnh sửa điểm bán của doanh nghiệp khác.');
  }

  let updatedFromDb: LocationItem | null = null;

  try {
    const adminClient = createAdminClient();
    const fullRes = await adminClient
      .from('locations')
      .update(extendedUpdates)
      .eq('id', locationId)
      .eq('business_id', user.businessId)
      .select('*')
      .single();

    if (!fullRes.error && fullRes.data) {
      updatedFromDb = mapLocationRow(fullRes.data as LocationDbRow, existing);
    } else if (fullRes.error) {
      const baseRes = await adminClient
        .from('locations')
        .update(baseUpdates)
        .eq('id', locationId)
        .eq('business_id', user.businessId)
        .select('*')
        .single();

      if (!baseRes.error && baseRes.data) {
        const mappedBase = mapLocationRow(baseRes.data as LocationDbRow, existing);
        updatedFromDb = {
          ...mappedBase,
          openingHours: ops.openingHours !== undefined ? ops.openingHours : mappedBase.openingHours,
          managerName: ops.managerName !== undefined ? ops.managerName : mappedBase.managerName,
          defaultOpeningCash:
            ops.defaultOpeningCash !== undefined ? ops.defaultOpeningCash : mappedBase.defaultOpeningCash,
          acceptWebOrders:
            ops.acceptWebOrders !== undefined ? ops.acceptWebOrders : mappedBase.acceptWebOrders,
          receiptFooter: ops.receiptFooter !== undefined ? ops.receiptFooter : mappedBase.receiptFooter,
        };
      }
    }
  } catch (err) {
    console.warn('DB locations update fallback:', err);
  }

  let finalLocation: LocationItem;
  if (updatedFromDb) {
    finalLocation = updatedFromDb;
    if (idx !== -1) state.locations[idx] = updatedFromDb;
    else state.locations.push(updatedFromDb);
  } else {
    if (idx === -1 || !existing) {
      throw new Error('Điểm bán không tồn tại.');
    }
    finalLocation = {
      ...existing,
      name: input.name !== undefined ? input.name.trim() : existing.name,
      address: input.address !== undefined ? input.address.trim() || null : existing.address,
      phone: input.phone !== undefined ? input.phone.trim() || null : existing.phone,
      openingHours: ops.openingHours !== undefined ? ops.openingHours : existing.openingHours,
      managerName: ops.managerName !== undefined ? ops.managerName : existing.managerName,
      defaultOpeningCash:
        ops.defaultOpeningCash !== undefined ? ops.defaultOpeningCash : existing.defaultOpeningCash,
      acceptWebOrders:
        ops.acceptWebOrders !== undefined ? ops.acceptWebOrders : existing.acceptWebOrders,
      receiptFooter: ops.receiptFooter !== undefined ? ops.receiptFooter : existing.receiptFooter,
      isActive: input.isActive !== undefined ? Boolean(input.isActive) : existing.isActive,
      updatedAt: now,
    };
    state.locations[idx] = finalLocation;
  }

  await recordRbacAuditLog({
    actor: user,
    action: 'UPDATE_LOCATION',
    targetType: 'LOCATION',
    targetId: finalLocation.id,
    targetName: `${finalLocation.code} — ${finalLocation.name}`,
    summary: `Cập nhật cấu hình điểm bán "${finalLocation.name}" (${finalLocation.isActive ? 'Đang hoạt động' : 'Tạm dừng'})`,
    metadata: {
      openingHours: finalLocation.openingHours,
      managerName: finalLocation.managerName,
      defaultOpeningCash: finalLocation.defaultOpeningCash,
      acceptWebOrders: finalLocation.acceptWebOrders,
      isActive: finalLocation.isActive,
    },
    stateOverride: state,
  });

  await savePersistedRbacState(state);
  return finalLocation;
}

async function ensureDbUserRowForStaff(
  adminClient: ReturnType<typeof createAdminClient>,
  params: {
    userId: string;
    authUserId?: string | null;
    fullName?: string;
    email?: string | null;
    phone?: string | null;
    isElevatedRole: boolean;
  }
): Promise<void> {
  const now = new Date().toISOString();
  const dbRole = params.isElevatedRole ? 'ADMIN' : 'USER';

  const { data: existingUser } = await adminClient
    .from('users')
    .select('id')
    .eq('id', params.userId)
    .maybeSingle();

  if (existingUser?.id) {
    const updatePayload: Record<string, unknown> = {
      role: dbRole,
      updated_at: now,
    };
    if (params.fullName !== undefined) updatePayload.full_name = params.fullName;
    if (params.phone !== undefined) updatePayload.phone = params.phone;
    if (params.email !== undefined) updatePayload.email = params.email;
    if (params.authUserId) updatePayload.google_id = params.authUserId;

    const { error } = await adminClient
      .from('users')
      .update(updatePayload)
      .eq('id', params.userId);

    if (error && updatePayload.google_id) {
      delete updatePayload.google_id;
      await adminClient.from('users').update(updatePayload).eq('id', params.userId);
    }
    return;
  }

  const tierId = await resolveDefaultMemberTierId(adminClient);
  const insertEmail =
    params.email || (params.phone ? `${params.phone}@coffeehouse.vn` : null);
  const insertPayload: Record<string, unknown> = {
    id: params.userId,
    google_id: params.authUserId || params.userId,
    full_name: params.fullName || 'Nhân viên',
    email: insertEmail,
    phone: params.phone || null,
    role: dbRole,
    current_tier_id: tierId,
    updated_at: now,
  };

  const { error: insertErr } = await adminClient.from('users').upsert(insertPayload);
  if (insertErr) {
    const fallbackPayload = { ...insertPayload, google_id: null };
    const { error: retryErr } = await adminClient.from('users').upsert(fallbackPayload);
    if (retryErr && insertEmail) {
      await adminClient.from('users').upsert({
        ...fallbackPayload,
        email: null,
      });
    }
  }
}

/**
 * List staff members in the business with their role and assigned locations.
 * Requires OWNER or ADMIN role.
 */
export async function listStaffMembers(user: UserRbacProfile): Promise<StaffMemberDto[]> {
  if (user.role !== 'OWNER' && user.role !== 'ADMIN') {
    throw new Error('FORBIDDEN_VIEW_STAFF: Chỉ Owner hoặc Admin mới có quyền xem danh sách nhân sự.');
  }

  const state = await loadPersistedRbacState();
  const persistedStaff = getBusinessStaff(state, user.businessId);
  const revokedIds = getRevokedStaffIds(state, user.businessId);
  const persistedLocMap = new Map<string, { code: string; name: string }>(
    state.locations.map((l) => [l.id, { code: l.code, name: l.name }])
  );

  try {
    const adminClient = createAdminClient();

    const { data: locRows } = await adminClient
      .from('locations')
      .select('id, code, name')
      .eq('business_id', user.businessId);

    const locMap = new Map<string, { code: string; name: string }>(persistedLocMap);
    (locRows || []).forEach((l: { id: string; code: string; name: string }) => {
      locMap.set(l.id, { code: l.code, name: l.name });
    });

    const { data: memberships, error: memErr } = await adminClient
      .from('business_memberships')
      .select('user_id, role, is_active')
      .eq('business_id', user.businessId);

    if (!memErr && memberships && memberships.length > 0) {
      const membershipUserIds = memberships.map((m: { user_id: string }) => m.user_id);

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
        .select('id, full_name, email, phone')
        .in('id', membershipUserIds);

      const userMap = new Map<string, { full_name?: string; email?: string; phone?: string }>();
      (userRows || []).forEach((u: { id: string; full_name?: string; email?: string; phone?: string }) => {
        userMap.set(u.id, u);
      });

      const dbStaffList: StaffMemberDto[] = memberships.map(
        (m: { user_id: string; role: string; is_active: boolean }) => {
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
        }
      );

      return mergeStaffMemberLists(dbStaffList, persistedStaff, revokedIds);
    }
  } catch (err) {
    console.warn('DB listStaffMembers fallback:', err);
  }

  return mergeStaffMemberLists([], persistedStaff, revokedIds);
}

/**
 * Assign or update a staff member's role, location assignments, and optional contact info.
 */
export async function assignStaffRoleAndLocations(
  actor: UserRbacProfile,
  targetUserId: string,
  targetRole: MvpRole,
  locationIds: string[],
  contactUpdates?: { fullName?: string; email?: string | null; phone?: string | null }
): Promise<void> {
  if (!canAssignRole(actor.role, targetRole)) {
    throw new Error(
      `FORBIDDEN_CANNOT_ASSIGN_ROLE: Vai trò của bạn (${actor.role}) không được phép gán vai trò (${targetRole}).`
    );
  }

  if (!canAssignLocations(actor.role)) {
    throw new Error('FORBIDDEN_CANNOT_ASSIGN_LOCATIONS: Bạn không có quyền phân công điểm bán.');
  }

  const validatedContact = contactUpdates ? validateStaffUpdateInput(contactUpdates) : {};
  const state = await loadPersistedRbacState();
  const staffList = getBusinessStaff(state, actor.businessId);
  const adminClient = createAdminClient();
  const now = new Date().toISOString();

  unmarkStaffRevoked(state, actor.businessId, targetUserId);

  const matchedLocations = state.locations
    .filter((l) => locationIds.includes(l.id))
    .map((l) => ({
      locationId: l.id,
      locationCode: l.code,
      locationName: l.name,
    }));

  const staffIdx = staffList.findIndex((s) => s.userId === targetUserId);
  let targetStaff: StaffMemberDto;

  if (staffIdx !== -1) {
    staffList[staffIdx].role = targetRole;
    staffList[staffIdx].assignedLocations = matchedLocations;
    staffList[staffIdx].isActive = true;
    if (validatedContact.fullName !== undefined) staffList[staffIdx].fullName = validatedContact.fullName;
    if (validatedContact.phone !== undefined) staffList[staffIdx].phone = validatedContact.phone;
    if (validatedContact.email !== undefined) staffList[staffIdx].email = validatedContact.email;
    targetStaff = staffList[staffIdx];
  } else {
    const { data: userInfo } = await adminClient
      .from('users')
      .select('full_name, email, phone')
      .eq('id', targetUserId)
      .maybeSingle();

    targetStaff = {
      userId: targetUserId,
      fullName: validatedContact.fullName || userInfo?.full_name || 'Nhân viên mới',
      email: validatedContact.email !== undefined ? validatedContact.email : (userInfo?.email || null),
      phone: validatedContact.phone !== undefined ? validatedContact.phone : (userInfo?.phone || null),
      role: targetRole,
      assignedLocations: matchedLocations,
      isActive: true,
    };
    staffList.push(targetStaff);
  }

  const isElevated = targetRole === 'OWNER' || targetRole === 'ADMIN';

  try {
    await ensureDbUserRowForStaff(adminClient, {
      userId: targetUserId,
      fullName: targetStaff.fullName,
      phone: targetStaff.phone,
      email: targetStaff.email,
      isElevatedRole: isElevated,
    });

    const { error: upsertErr } = await adminClient
      .from('business_memberships')
      .upsert(
        {
          business_id: actor.businessId,
          user_id: targetUserId,
          role: targetRole,
          is_active: true,
          updated_at: now,
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
  } catch (err) {
    console.warn('DB assignStaffRoleAndLocations fallback:', err);
  }

  await syncAuthUserAccount({
    existingUserId: targetUserId,
    email: targetStaff.email,
    phone: targetStaff.phone,
    fullName: targetStaff.fullName,
    createIfMissing: true,
    rbacMeta: {
      businessId: actor.businessId,
      role: targetRole,
      assignedLocations: matchedLocations,
      isActive: targetStaff.isActive,
      fullName: targetStaff.fullName,
      phone: targetStaff.phone || null,
      email: targetStaff.email || null,
      updatedAt: now,
    },
  });

  await recordRbacAuditLog({
    actor,
    action: 'UPDATE_STAFF',
    targetType: 'STAFF',
    targetId: targetUserId,
    targetName: targetStaff.fullName,
    summary: `Cập nhật quyền (${targetRole}) & ${matchedLocations.length} điểm bán cho ${targetStaff.fullName}`,
    metadata: {
      role: targetRole,
      locationCodes: matchedLocations.map((l) => l.locationCode),
    },
    stateOverride: state,
  });

  await savePersistedRbacState(state);
}

/**
 * Create a new staff member (or promote/assign an existing user) with initial role, locations, and optional auth password.
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
  const validatedPassword = validateStaffPassword(input.initialPassword, false);

  const cleanFullName = input.fullName.trim();
  const cleanPhone = normalizePhone(input.phone) || '';
  const cleanEmail = (input.email || '').trim().toLowerCase();
  const adminClient = createAdminClient();
  const state = await loadPersistedRbacState();
  const staffList = getBusinessStaff(state, actor.businessId);
  const now = new Date().toISOString();

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
        .ilike('email', cleanEmail)
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

  const matchedLocations = state.locations
    .filter((l) => input.locationIds.includes(l.id))
    .map((l) => ({
      locationId: l.id,
      locationCode: l.code,
      locationName: l.name,
    }));

  const finalEmail = cleanEmail || existingEmail || null;
  const finalPhone = cleanPhone || existingPhone || null;

  const rbacMeta: AuthStaffRbacMeta = {
    businessId: actor.businessId,
    role: input.role,
    assignedLocations: matchedLocations,
    isActive: true,
    fullName: cleanFullName,
    phone: finalPhone,
    email: finalEmail,
    updatedAt: now,
  };

  // Always sync to Supabase Auth so durable user_metadata backup is written reliably
  const authSyncResult = await syncAuthUserAccount({
    existingUserId: resolvedUserId,
    email: finalEmail,
    phone: finalPhone,
    fullName: cleanFullName,
    password: validatedPassword || undefined,
    createIfMissing: true,
    rbacMeta,
  });

  const finalUserId = resolvedUserId || authSyncResult.authUserId || crypto.randomUUID();
  unmarkStaffRevoked(state, actor.businessId, finalUserId);

  const newStaff: StaffMemberDto = {
    userId: finalUserId,
    fullName: cleanFullName,
    email: finalEmail,
    phone: finalPhone,
    role: input.role,
    assignedLocations: matchedLocations,
    isActive: true,
  };

  try {
    const isElevatedRole = input.role === 'OWNER' || input.role === 'ADMIN';
    await ensureDbUserRowForStaff(adminClient, {
      userId: finalUserId,
      authUserId: authSyncResult.authUserId,
      fullName: newStaff.fullName,
      email: finalEmail,
      phone: finalPhone,
      isElevatedRole,
    });

    const { error: bmErr } = await adminClient.from('business_memberships').upsert(
      {
        business_id: actor.businessId,
        user_id: finalUserId,
        role: input.role,
        is_active: true,
        updated_at: now,
      },
      { onConflict: 'business_id,user_id' }
    );

    if (!bmErr) {
      await adminClient
        .from('user_location_assignments')
        .delete()
        .eq('business_id', actor.businessId)
        .eq('user_id', finalUserId);

      if (input.locationIds.length > 0) {
        const assignments = input.locationIds.map((locId) => ({
          business_id: actor.businessId,
          user_id: finalUserId,
          location_id: locId,
          is_active: true,
        }));
        await adminClient.from('user_location_assignments').insert(assignments);
      }
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

  const authProvisioned = Boolean(validatedPassword && authSyncResult.provisioned);

  await recordRbacAuditLog({
    actor,
    action: 'CREATE_STAFF',
    targetType: 'STAFF',
    targetId: newStaff.userId,
    targetName: newStaff.fullName,
    summary: `Thêm nhân viên mới ${newStaff.fullName} (${newStaff.role}) tại ${matchedLocations.length} điểm bán${authProvisioned ? ' (đã cấp tài khoản đăng nhập)' : ''}`,
    metadata: {
      role: newStaff.role,
      locationCodes: matchedLocations.map((l) => l.locationCode),
      authProvisioned,
    },
    stateOverride: state,
  });

  await savePersistedRbacState(state);
  return newStaff;
}

/**
 * Reset or set login password for a staff member in Supabase Auth.
 */
export async function resetStaffPassword(
  actor: UserRbacProfile,
  targetUserId: string,
  newPassword: string
): Promise<{ fullName: string; provisioned: boolean }> {
  const validPassword = validateStaffPassword(newPassword, true);
  const state = await loadPersistedRbacState();
  const { staff } = await resolveTargetStaff(state, actor.businessId, targetUserId);

  if (!canResetStaffPassword(actor.role, staff.role)) {
    throw new Error(
      `FORBIDDEN_CANNOT_RESET_PASSWORD: Vai trò của bạn (${actor.role}) không được phép đặt lại mật khẩu cho nhân viên (${staff.role}).`
    );
  }

  const syncRes = await syncAuthUserAccount({
    existingUserId: staff.userId,
    email: staff.email,
    phone: staff.phone,
    fullName: staff.fullName,
    password: validPassword,
    createIfMissing: true,
    rbacMeta: {
      businessId: actor.businessId,
      role: staff.role,
      assignedLocations: staff.assignedLocations,
      isActive: staff.isActive,
      fullName: staff.fullName,
      phone: staff.phone || null,
      email: staff.email || null,
      updatedAt: new Date().toISOString(),
    },
  });

  await recordRbacAuditLog({
    actor,
    action: 'RESET_STAFF_PASSWORD',
    targetType: 'STAFF',
    targetId: staff.userId,
    targetName: staff.fullName,
    summary: `Đặt lại mật khẩu đăng nhập cho nhân viên ${staff.fullName} (${staff.role})`,
    metadata: {
      role: staff.role,
      authProvisioned: syncRes.provisioned,
    },
    stateOverride: state,
  });

  await savePersistedRbacState(state);
  return { fullName: staff.fullName, provisioned: syncRes.provisioned };
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
  const { staff } = await resolveTargetStaff(state, actor.businessId, targetUserId);

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

  await syncAuthUserAccount({
    existingUserId: staff.userId,
    email: staff.email,
    phone: staff.phone,
    fullName: staff.fullName,
    rbacMeta: {
      businessId: actor.businessId,
      role: staff.role,
      assignedLocations: staff.assignedLocations,
      isActive,
      fullName: staff.fullName,
      phone: staff.phone || null,
      email: staff.email || null,
      updatedAt: new Date().toISOString(),
    },
  });

  await recordRbacAuditLog({
    actor,
    action: 'TOGGLE_STAFF_STATUS',
    targetType: 'STAFF',
    targetId: staff.userId,
    targetName: staff.fullName,
    summary: `${isActive ? 'Kích hoạt lại' : 'Tạm khóa'} tài khoản nhân viên ${staff.fullName} (${staff.role})`,
    metadata: {
      isActive,
      role: staff.role,
    },
    stateOverride: state,
  });

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
  const { staff } = await resolveTargetStaff(state, actor.businessId, targetUserId);

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

  markStaffRevoked(state, actor.businessId, targetUserId);
  state.staffByBusiness[actor.businessId] = staffList.filter(
    (s) => s.userId !== targetUserId
  );

  await syncAuthUserAccount({
    existingUserId: staff.userId,
    email: staff.email,
    phone: staff.phone,
    fullName: staff.fullName,
    clearRbacMeta: true,
  });

  await recordRbacAuditLog({
    actor,
    action: 'REVOKE_STAFF',
    targetType: 'STAFF',
    targetId: staff.userId,
    targetName: staff.fullName,
    summary: `Hủy quyền và xóa nhân viên ${staff.fullName} (${staff.role}) khỏi hệ thống`,
    metadata: {
      role: staff.role,
    },
    stateOverride: state,
  });

  await savePersistedRbacState(state);
}
