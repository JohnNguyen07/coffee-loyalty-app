import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';
import type { PosStaffContext } from '@/lib/auth-utils';
import { DEFAULT_LOCATION_ID, extractPosOrderMetadata } from '@/lib/pos/domain';
import { buildUserRbacProfile } from '@/lib/rbac/domain';
import { listLocationsForUser } from '@/lib/rbac/repository';
import {
  calculateRevenueSummary,
  calculateCashbookSummary,
  calculateShiftReconciliation,
  calculateNetOperatingCashflow,
  getDateRangeBoundaries,
  validateCashTransactionInput,
  validateVoidTransactionInput,
  validateShiftOpenInput,
  validateShiftCloseInput,
  type CashReconciliationInput,
  type CashTransaction,
  type CashTransactionCategory,
  type CashTransactionStatus,
  type CashTransactionType,
  type CashbookSummary,
  type DateRangePreset,
  type DenominationKey,
  type NetOperatingCashflowBreakdown,
  type RawOrderForRevenue,
  type RevenueSummaryResult,
  type ShiftSession,
  type StoreFundOverview,
} from './domain';

export interface RevenueReportQuery {
  preset?: DateRangePreset;
  customFrom?: string;
  customTo?: string;
  channel?: 'ALL' | 'POS' | 'WEB';
  openingCash?: number;
  actualCashCounted?: number;
  cashPayouts?: number;
}

export interface DetailedRevenueOrder {
  id: string;
  orderCode: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
  channel: 'POS' | 'WEB';
  customerName: string;
  customerPhone: string;
  paymentMethod: string;
  subtotal: number;
  discountAmount: number;
  pointsUsed: number;
  totalDue: number;
  createdAt: string;
  itemsSummary: string;
  cancelReason?: string;
}

export interface RevenueReportResponse {
  boundaries: {
    from: string;
    to: string;
    label: string;
    preset: DateRangePreset;
  };
  summary: RevenueSummaryResult;
  orders: DetailedRevenueOrder[];
  cashbook: CashbookSummary;
  storeFund: StoreFundOverview;
  netCashflow: NetOperatingCashflowBreakdown;
  activeShift: ShiftSession | null;
  shiftHistory: ShiftSession[];
  suggestedOpeningCash: number;
  staff: {
    fullName: string;
    staffRole: string;
    locationId: string;
    locationName: string;
  };
}

interface PersistedRevenueState {
  transactionsByLocation: Record<string, CashTransaction[]>;
  activeShiftByLocation: Record<string, ShiftSession | null>;
  shiftHistoryByLocation: Record<string, ShiftSession[]>;
  updatedAt: string;
}

const REVENUE_STORE_DIR = path.join(process.cwd(), '.data');
const REVENUE_STORE_PATH = path.join(REVENUE_STORE_DIR, 'revenue-store.json');
const MAX_STORED_TX_PER_LOC = 500;
const MAX_STORED_SHIFTS_PER_LOC = 100;

declare global {
  var __ulabRevenueStore: PersistedRevenueState | undefined;
}

function getEmptyStore(): PersistedRevenueState {
  return {
    transactionsByLocation: {},
    activeShiftByLocation: {},
    shiftHistoryByLocation: {},
    updatedAt: new Date().toISOString(),
  };
}

function readRevenueStore(): PersistedRevenueState {
  if (globalThis.__ulabRevenueStore) {
    return globalThis.__ulabRevenueStore;
  }

  try {
    if (fs.existsSync(REVENUE_STORE_PATH)) {
      const raw = fs.readFileSync(REVENUE_STORE_PATH, 'utf8');
      const parsed = JSON.parse(raw) as Partial<PersistedRevenueState>;
      const normalized: PersistedRevenueState = {
        transactionsByLocation: parsed.transactionsByLocation || {},
        activeShiftByLocation: parsed.activeShiftByLocation || {},
        shiftHistoryByLocation: parsed.shiftHistoryByLocation || {},
        updatedAt: parsed.updatedAt || new Date().toISOString(),
      };
      globalThis.__ulabRevenueStore = normalized;
      return normalized;
    }
  } catch {
    // Fallback cleanly to empty in-memory state if filesystem is unavailable/read-only
  }

  const initial = getEmptyStore();
  globalThis.__ulabRevenueStore = initial;
  return initial;
}

function writeRevenueStore(store: PersistedRevenueState): void {
  store.updatedAt = new Date().toISOString();
  globalThis.__ulabRevenueStore = store;
  try {
    if (!fs.existsSync(REVENUE_STORE_DIR)) {
      fs.mkdirSync(REVENUE_STORE_DIR, { recursive: true });
    }
    fs.writeFileSync(REVENUE_STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
  } catch {
    // Read-only serverless runtime fallback: keep in globalThis without throwing
  }
}

function matchesLocation(rowLocationId: unknown, targetLocationId?: string): boolean {
  const target = targetLocationId || DEFAULT_LOCATION_ID;
  const rowLoc = typeof rowLocationId === 'string' && rowLocationId.trim() ? rowLocationId.trim() : null;
  if (target === DEFAULT_LOCATION_ID) {
    return !rowLoc || rowLoc === DEFAULT_LOCATION_ID;
  }
  return rowLoc === target;
}

function isUuidLike(val?: string): boolean {
  return Boolean(val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val));
}

/**
 * Resiliently fetch orders for revenue reporting filtered by locationId with automatic fallback
 * if foreign-key disambiguation or optional columns are not yet in the DB schema cache.
 */
async function queryOrdersForRevenue(
  adminClient: ReturnType<typeof createAdminClient>,
  boundaries: { from: string; to: string },
  channel?: 'ALL' | 'POS' | 'WEB',
  locationId?: string
): Promise<Record<string, unknown>[]> {
  const buildBaseQuery = (
    selectClause: string,
    useChannelColumn: boolean,
    useLocationFilter: boolean
  ) => {
    let q = adminClient
      .from('orders')
      .select(selectClause)
      .gte('created_at', boundaries.from)
      .lte('created_at', boundaries.to)
      .order('created_at', { ascending: false })
      .limit(1000);

    if (useLocationFilter && isUuidLike(locationId)) {
      if (locationId === DEFAULT_LOCATION_ID) {
        q = q.or(`location_id.eq.${DEFAULT_LOCATION_ID},location_id.is.null`);
      } else {
        q = q.eq('location_id', locationId);
      }
    }

    if (channel && channel !== 'ALL') {
      if (channel === 'POS') {
        q = useChannelColumn
          ? q.or('channel.eq.POS,order_code.ilike.POS-%')
          : q.ilike('order_code', 'POS-%');
      } else if (channel === 'WEB') {
        q = useChannelColumn
          ? q.or('channel.eq.WEB,order_code.ilike.CF-%,order_code.ilike.ULAB-%')
          : q.or('order_code.ilike.CF-%,order_code.ilike.ULAB-%');
      }
    }
    return q;
  };

  try {
    // 1. Primary query with location_id filter, channel filter, and explicit user_id disambiguation
    const { data, error } = await buildBaseQuery(
      '*, items:order_items(product_name, size, quantity, subtotal, unit_price), user:users!user_id(id, full_name, phone)',
      true,
      true
    );
    if (!error && Array.isArray(data)) {
      return (data as unknown as Record<string, unknown>[]).filter((row) =>
        matchesLocation(row.location_id, locationId)
      );
    }

    // 2. Fallback without user embed & optional location filter if DB schema lacks column
    const { data: fallbackData, error: fallbackError } = await buildBaseQuery(
      '*, items:order_items(product_name, size, quantity, subtotal, unit_price)',
      false,
      false
    );
    if (!fallbackError && Array.isArray(fallbackData)) {
      return (fallbackData as unknown as Record<string, unknown>[]).filter((row) =>
        matchesLocation(row.location_id, locationId)
      );
    }

    if (fallbackError) {
      console.error('getRevenueReport fallback query error:', fallbackError);
    }
  } catch (err) {
    console.error('queryOrdersForRevenue unexpected error:', err);
  }

  return [];
}

/**
 * Look up configured defaultOpeningCash for a location (Module D integration).
 */
async function getLocationDefaultOpeningCash(staff: PosStaffContext): Promise<number> {
  try {
    const profile = buildUserRbacProfile({
      userId: staff.id,
      fullName: staff.fullName,
      email: staff.email,
      phone: staff.phone,
      businessId: staff.businessId,
      role: staff.staffRole,
      assignedLocationIds: [staff.locationId],
    });
    const locs = await listLocationsForUser(profile);
    const matched = locs.find((l) => l.id === staff.locationId);
    if (matched && typeof matched.defaultOpeningCash === 'number' && matched.defaultOpeningCash >= 0) {
      return Math.round(matched.defaultOpeningCash);
    }
  } catch {
    // Fallback to DB direct check below
  }

  try {
    const adminClient = createAdminClient();
    const { data } = await adminClient
      .from('locations')
      .select('default_opening_cash')
      .eq('id', staff.locationId)
      .maybeSingle();
    if (data && typeof data.default_opening_cash === 'number' && data.default_opening_cash >= 0) {
      return Math.round(data.default_opening_cash);
    }
  } catch {
    // ignore if column does not exist yet
  }

  return 500000;
}

/**
 * Fetch cash transactions for Cashbook ledger with resilient local merge.
 */
export async function getCashTransactions(
  locationId: string,
  from?: string,
  to?: string
): Promise<CashTransaction[]> {
  const adminClient = createAdminClient();
  const store = readRevenueStore();
  const localRows = store.transactionsByLocation[locationId] || [];

  const fromMs = from ? new Date(from).getTime() : null;
  const toMs = to ? new Date(to).getTime() : null;

  const isInRange = (createdAt: string) => {
    const t = new Date(createdAt).getTime();
    if (Number.isNaN(t)) return true;
    if (fromMs !== null && t < fromMs) return false;
    if (toMs !== null && t > toMs) return false;
    return true;
  };

  let dbRows: CashTransaction[] = [];
  try {
    let q = adminClient
      .from('cash_transactions')
      .select('*')
      .eq('location_id', locationId)
      .order('created_at', { ascending: false });

    if (from) q = q.gte('created_at', from);
    if (to) q = q.lte('created_at', to);

    const { data, error } = await q;

    if (!error && Array.isArray(data)) {
      dbRows = data.map((r) => ({
        id: String(r.id),
        code: String(r.code),
        shiftId: r.shift_id ? String(r.shift_id) : null,
        type: r.type as CashTransactionType,
        category: r.category as CashTransactionCategory,
        amount: Number(r.amount) || 0,
        paymentMethod: (r.payment_method as 'CASH' | 'BANK_TRANSFER') || 'CASH',
        recipientPayer: String(r.recipient_payer || '—'),
        notes: r.notes ? String(r.notes) : undefined,
        createdByName: String(r.created_by_name || 'Thu ngân'),
        createdAt: String(r.created_at),
        status: (r.status === 'VOIDED' ? 'VOIDED' : 'POSTED') as CashTransactionStatus,
        voidReason: r.void_reason ? String(r.void_reason) : null,
        voidedByName: r.voided_by_name ? String(r.voided_by_name) : null,
        voidedAt: r.voided_at ? String(r.voided_at) : null,
        idempotencyKey: r.idempotency_key ? String(r.idempotency_key) : null,
        locationId: r.location_id ? String(r.location_id) : locationId,
        businessId: r.business_id ? String(r.business_id) : undefined,
      }));
    }
  } catch (err) {
    console.warn('cash_transactions table query fallback:', err);
  }

  // Merge DB rows with persisted local store (preserves VOIDED flags & shiftId even without migration 0012)
  const mergedMap = new Map<string, CashTransaction>();
  for (const row of dbRows) {
    mergedMap.set(row.code || row.id, row);
  }

  for (const local of localRows) {
    if (!isInRange(local.createdAt)) continue;
    const key = local.code || local.id;
    const existing = mergedMap.get(key) || Array.from(mergedMap.values()).find((r) => r.id === local.id);
    if (existing) {
      mergedMap.set(existing.code || existing.id, {
        ...existing,
        shiftId: existing.shiftId || local.shiftId || null,
        status: existing.status === 'VOIDED' || local.status === 'VOIDED' ? 'VOIDED' : 'POSTED',
        voidReason: existing.voidReason || local.voidReason || null,
        voidedByName: existing.voidedByName || local.voidedByName || null,
        voidedAt: existing.voidedAt || local.voidedAt || null,
        idempotencyKey: existing.idempotencyKey || local.idempotencyKey || null,
      });
    } else {
      mergedMap.set(key, {
        ...local,
        status: local.status === 'VOIDED' ? 'VOIDED' : 'POSTED',
      });
    }
  }

  return Array.from(mergedMap.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * Compute live shift metrics from orders (location-filtered) and active cashbook vouchers linked to the shift.
 */
async function computeShiftLiveMetrics(
  locationId: string,
  shiftId: string,
  openedAtIso: string,
  closedAtIso?: string
): Promise<{
  cashSales: number;
  cashRefunds: number;
  cashIn: number;
  cashOut: number;
  orderCount: number;
}> {
  const adminClient = createAdminClient();
  const endIso = closedAtIso || new Date().toISOString();
  let cashSales = 0;
  let cashRefunds = 0;
  let orderCount = 0;

  try {
    const orderRows = await queryOrdersForRevenue(adminClient, { from: openedAtIso, to: endIso }, 'ALL', locationId);
    for (const ord of orderRows) {
      const amt = Math.max(0, Number(ord.total_due) || 0);
      if (ord.status === 'CONFIRMED') {
        cashSales += amt;
        orderCount++;
      } else if (ord.status === 'CANCELLED') {
        cashRefunds += amt;
      }
    }
  } catch {
    // ignore order aggregate errors cleanly
  }

  let cashIn = 0;
  let cashOut = 0;
  try {
    const txs = await getCashTransactions(locationId, openedAtIso, endIso);
    const openedMs = new Date(openedAtIso).getTime();
    for (const tx of txs) {
      if (tx.status === 'VOIDED') continue;
      // Do not count BANK_DEPOSIT closing handover back into cashOut of the shift being closed if linked differently,
      // wait: during an open shift, every valid voucher created inside the shift updates cashIn/cashOut.
      const belongsToShift =
        tx.shiftId === shiftId ||
        (!tx.shiftId && new Date(tx.createdAt).getTime() >= openedMs);
      if (!belongsToShift) continue;

      if (tx.type === 'RECEIPT') {
        cashIn += tx.amount;
      } else if (tx.type === 'PAYMENT') {
        cashOut += tx.amount;
      }
    }
  } catch {
    // ignore
  }

  return { cashSales, cashRefunds, cashIn, cashOut, orderCount };
}

/**
 * Create a new Cash Transaction (Receipt or Payment voucher) with shift linkage and idempotency.
 */
export async function createCashTransaction(
  params: {
    type: CashTransactionType | string;
    category: CashTransactionCategory | string;
    amount: number;
    paymentMethod?: 'CASH' | 'BANK_TRANSFER' | string;
    recipientPayer: string;
    notes?: string;
    shiftId?: string | null;
    idempotencyKey?: string | null;
  },
  staff: PosStaffContext
): Promise<{ success: boolean; transaction?: CashTransaction; error?: string }> {
  let validated;
  try {
    validated = validateCashTransactionInput(params);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Dữ liệu phiếu thu/chi không hợp lệ.' };
  }

  const adminClient = createAdminClient();
  const store = readRevenueStore();
  const existingLocTxs = store.transactionsByLocation[staff.locationId] || [];
  const idempotencyKey = params.idempotencyKey ? String(params.idempotencyKey).trim() : null;

  // Idempotency guard (local + DB)
  if (idempotencyKey) {
    const matchedLocal = existingLocTxs.find((t) => t.idempotencyKey === idempotencyKey);
    if (matchedLocal) {
      return { success: true, transaction: matchedLocal };
    }
    try {
      const { data: dupRow } = await adminClient
        .from('cash_transactions')
        .select('*')
        .eq('location_id', staff.locationId)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();
      if (dupRow) {
        return {
          success: true,
          transaction: {
            id: String(dupRow.id),
            code: String(dupRow.code),
            shiftId: dupRow.shift_id ? String(dupRow.shift_id) : null,
            type: dupRow.type as CashTransactionType,
            category: dupRow.category as CashTransactionCategory,
            amount: Number(dupRow.amount) || 0,
            paymentMethod: String(dupRow.payment_method || 'CASH'),
            recipientPayer: String(dupRow.recipient_payer || '—'),
            notes: dupRow.notes ? String(dupRow.notes) : undefined,
            createdByName: String(dupRow.created_by_name || staff.fullName),
            createdAt: String(dupRow.created_at),
            status: (dupRow.status === 'VOIDED' ? 'VOIDED' : 'POSTED') as CashTransactionStatus,
            idempotencyKey,
            locationId: staff.locationId,
            businessId: staff.businessId,
          },
        };
      }
    } catch {
      // column might not exist before migration 0012
    }
  }

  // Link to active shift if not supplied
  let resolvedShiftId: string | null = params.shiftId ?? null;
  if (!resolvedShiftId) {
    const activeShift = await getActiveShiftSession(staff.locationId);
    resolvedShiftId = activeShift?.id || null;
  }

  const d = new Date();
  const dateStr = d.toISOString().slice(2, 10).replace(/-/g, '');
  const prefix = validated.type === 'RECEIPT' ? 'PT' : 'PC';
  const rand = Math.floor(1000 + Math.random() * 9000);
  const code = `${prefix}-${dateStr}-${rand}`;

  const txData: CashTransaction = {
    id: `tx-${Date.now()}-${rand}`,
    code,
    shiftId: resolvedShiftId,
    type: validated.type,
    category: validated.category,
    amount: validated.amount,
    paymentMethod: validated.paymentMethod,
    recipientPayer: validated.recipientPayer,
    notes: validated.notes,
    createdByName: staff.fullName,
    createdAt: new Date().toISOString(),
    status: 'POSTED',
    idempotencyKey,
    locationId: staff.locationId,
    businessId: staff.businessId,
  };

  const shiftIdForDb = isUuidLike(resolvedShiftId || undefined) ? resolvedShiftId : null;

  try {
    const basePayload = {
      business_id: staff.businessId,
      location_id: staff.locationId,
      shift_id: shiftIdForDb,
      code,
      type: validated.type,
      category: validated.category,
      amount: validated.amount,
      payment_method: validated.paymentMethod,
      recipient_payer: validated.recipientPayer,
      notes: validated.notes || null,
      created_by: staff.dbUserId,
      created_by_name: staff.fullName,
    };

    const { data: dbTx, error } = await adminClient
      .from('cash_transactions')
      .insert({
        ...basePayload,
        status: 'POSTED',
        idempotency_key: idempotencyKey,
      })
      .select()
      .maybeSingle();

    if (!error && dbTx) {
      txData.id = String(dbTx.id);
    } else if (error) {
      // Fallback insert without 0012 columns when DB is still at 0010
      const { data: fallbackTx, error: fallbackErr } = await adminClient
        .from('cash_transactions')
        .insert(basePayload)
        .select()
        .maybeSingle();
      if (!fallbackErr && fallbackTx) {
        txData.id = String(fallbackTx.id);
      }
    }
  } catch (err) {
    console.warn('createCashTransaction DB fallback:', err);
  }

  store.transactionsByLocation[staff.locationId] = [txData, ...existingLocTxs].slice(0, MAX_STORED_TX_PER_LOC);
  writeRevenueStore(store);
  return { success: true, transaction: txData };
}

/**
 * Void (cancel) a cashbook transaction cleanly without hard deletion.
 */
export async function voidCashTransaction(
  params: { transactionId: string; reason: string },
  staff: PosStaffContext
): Promise<{ success: boolean; transaction?: CashTransaction; error?: string }> {
  let validated;
  try {
    validated = validateVoidTransactionInput(params);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Lý do hủy phiếu không hợp lệ.' };
  }

  const locationTxs = await getCashTransactions(staff.locationId);
  const target = locationTxs.find(
    (t) => t.id === validated.transactionId || t.code === validated.transactionId
  );

  if (!target) {
    return { success: false, error: 'Không tìm thấy phiếu thu/chi thuộc điểm bán hiện tại.' };
  }
  if (target.status === 'VOIDED') {
    return { success: false, error: 'Phiếu này đã được hủy trước đó.' };
  }

  const voidedAt = new Date().toISOString();
  const updatedTx: CashTransaction = {
    ...target,
    status: 'VOIDED',
    voidReason: validated.reason,
    voidedByName: staff.fullName,
    voidedAt,
  };

  const adminClient = createAdminClient();
  try {
    if (isUuidLike(target.id)) {
      await adminClient
        .from('cash_transactions')
        .update({
          status: 'VOIDED',
          void_reason: validated.reason,
          voided_by: staff.dbUserId,
          voided_by_name: staff.fullName,
          voided_at: voidedAt,
          updated_at: voidedAt,
        })
        .eq('id', target.id)
        .eq('location_id', staff.locationId);
    }
  } catch (err) {
    console.warn('voidCashTransaction DB fallback:', err);
  }

  const store = readRevenueStore();
  const list = store.transactionsByLocation[staff.locationId] || [];
  const idx = list.findIndex((t) => t.id === target.id || t.code === target.code);
  if (idx >= 0) {
    list[idx] = updatedTx;
  } else {
    list.unshift(updatedTx);
  }
  store.transactionsByLocation[staff.locationId] = list.slice(0, MAX_STORED_TX_PER_LOC);
  writeRevenueStore(store);

  return { success: true, transaction: updatedTx };
}

/**
 * Get active open shift session with live orders and cashbook totals.
 */
export async function getActiveShiftSession(locationId: string): Promise<ShiftSession | null> {
  const adminClient = createAdminClient();
  const store = readRevenueStore();
  const closedHistory = store.shiftHistoryByLocation[locationId] || [];
  const localActive = store.activeShiftByLocation[locationId] || null;

  let baseShift: ShiftSession | null = null;

  try {
    let { data, error } = await adminClient
      .from('cash_drawer_sessions')
      .select('*, opener:users!cash_drawer_sessions_opened_by_fkey(full_name)')
      .eq('location_id', locationId)
      .eq('status', 'OPEN')
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      const fallback = await adminClient
        .from('cash_drawer_sessions')
        .select('*')
        .eq('location_id', locationId)
        .eq('status', 'OPEN')
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      data = fallback.data;
      error = fallback.error;
    }

    if (!error && data) {
      const dbId = String(data.id);
      const alreadyClosedLocally = closedHistory.some((h) => h.id === dbId);
      if (!alreadyClosedLocally) {
        baseShift = {
          id: dbId,
          code: data.code || `SHIFT-${dbId.slice(0, 8).toUpperCase()}`,
          shiftName: data.shift_name || 'Ca Bán Hàng',
          status: 'OPEN',
          openedAt: String(data.opened_at),
          openedByName: data.opener?.full_name || localActive?.openedByName || 'Thu ngân',
          openingCash: Number(data.opening_cash) || 0,
          cashSales: Number(data.cash_sales) || 0,
          cashRefunds: Number(data.cash_refunds) || 0,
          cashIn: Number(data.cash_in) || 0,
          cashOut: Number(data.cash_out) || 0,
          expectedCash: Number(data.expected_cash) || 0,
          orderCount: Number(data.order_count) || 0,
          notes: data.notes ? String(data.notes) : null,
          locationId,
        };
      }
    }
  } catch (err) {
    console.warn('getActiveShiftSession fallback:', err);
  }

  if (!baseShift && localActive && localActive.status === 'OPEN') {
    baseShift = { ...localActive, locationId };
  }

  if (!baseShift) {
    return null;
  }

  const metrics = await computeShiftLiveMetrics(locationId, baseShift.id, baseShift.openedAt);
  const expectedCash =
    baseShift.openingCash + metrics.cashSales - metrics.cashRefunds + metrics.cashIn - metrics.cashOut;

  return {
    ...baseShift,
    cashSales: metrics.cashSales,
    cashRefunds: metrics.cashRefunds,
    cashIn: metrics.cashIn,
    cashOut: metrics.cashOut,
    orderCount: metrics.orderCount,
    expectedCash,
  };
}

/**
 * Open a new shift session with duplicate-open protection and idempotency.
 */
export async function openShiftSession(
  params: {
    shiftName: string;
    openingCash: number;
    notes?: string;
    idempotencyKey?: string | null;
  },
  staff: PosStaffContext
): Promise<{ success: boolean; shift?: ShiftSession; error?: string }> {
  let validated;
  try {
    validated = validateShiftOpenInput(params);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Dữ liệu mở ca không hợp lệ.' };
  }

  const idempotencyKey = params.idempotencyKey ? String(params.idempotencyKey).trim() : null;
  const currentOpen = await getActiveShiftSession(staff.locationId);

  if (currentOpen) {
    if (idempotencyKey && currentOpen.idempotencyKey === idempotencyKey) {
      return { success: true, shift: currentOpen };
    }
    return {
      success: false,
      error: 'Hiện đang có ca làm việc chưa chốt tại điểm bán này. Vui lòng chốt ca hiện tại trước khi mở ca mới.',
    };
  }

  const adminClient = createAdminClient();
  const d = new Date();
  const dateStr = d.toISOString().slice(2, 10).replace(/-/g, '');
  const rand = Math.floor(100 + Math.random() * 900);
  const code = `SHIFT-${dateStr}-${rand}`;

  const newShift: ShiftSession = {
    id: `shift-${Date.now()}-${rand}`,
    code,
    shiftName: validated.shiftName,
    status: 'OPEN',
    openedAt: new Date().toISOString(),
    openedByName: staff.fullName,
    openingCash: validated.openingCash,
    cashSales: 0,
    cashRefunds: 0,
    cashIn: 0,
    cashOut: 0,
    expectedCash: validated.openingCash,
    orderCount: 0,
    notes: validated.notes,
    locationId: staff.locationId,
    businessId: staff.businessId,
    idempotencyKey,
  };

  try {
    const basePayload = {
      business_id: staff.businessId,
      location_id: staff.locationId,
      code,
      shift_name: newShift.shiftName,
      opened_by: staff.dbUserId,
      opening_cash: validated.openingCash,
      expected_cash: validated.openingCash,
      status: 'OPEN',
      notes: validated.notes || null,
    };

    const { data: dbShift, error } = await adminClient
      .from('cash_drawer_sessions')
      .insert({
        ...basePayload,
        order_count: 0,
        idempotency_key: idempotencyKey,
      })
      .select()
      .maybeSingle();

    if (!error && dbShift) {
      newShift.id = String(dbShift.id);
    } else if (error) {
      const { data: fallbackShift, error: fallbackErr } = await adminClient
        .from('cash_drawer_sessions')
        .insert(basePayload)
        .select()
        .maybeSingle();
      if (!fallbackErr && fallbackShift) {
        newShift.id = String(fallbackShift.id);
      }
    }
  } catch (err) {
    console.warn('openShiftSession DB fallback:', err);
  }

  const store = readRevenueStore();
  store.activeShiftByLocation[staff.locationId] = newShift;
  writeRevenueStore(store);
  return { success: true, shift: newShift };
}

/**
 * Close and reconcile shift session (including cashIn, cashOut, variance reason validation, and optional handover voucher).
 */
export async function closeShiftSession(
  params: {
    shiftId?: string;
    actualCash: number;
    cashRetained?: number;
    notes?: string;
    denominations?: Partial<Record<DenominationKey, number>>;
    idempotencyKey?: string | null;
    autoRecordHandover?: boolean;
  },
  staff: PosStaffContext
): Promise<{ success: boolean; shift?: ShiftSession; error?: string }> {
  const adminClient = createAdminClient();
  const store = readRevenueStore();
  const history = store.shiftHistoryByLocation[staff.locationId] || [];
  const idempotencyKey = params.idempotencyKey ? String(params.idempotencyKey).trim() : null;

  if (idempotencyKey) {
    const matchedHistory = history.find((h) => h.idempotencyKey === idempotencyKey);
    if (matchedHistory) {
      return { success: true, shift: matchedHistory };
    }
  }

  const current = await getActiveShiftSession(staff.locationId);
  if (!current && !params.shiftId) {
    return { success: false, error: 'Không có ca bán hàng đang mở tại điểm bán này để chốt ca.' };
  }

  const targetShiftId = current?.id || String(params.shiftId);
  const openingCash = current?.openingCash ?? 500000;
  const openTime = current?.openedAt || new Date(Date.now() - 8 * 3600 * 1000).toISOString();
  const closeTime = new Date().toISOString();

  const metrics = await computeShiftLiveMetrics(staff.locationId, targetShiftId, openTime, closeTime);
  const liveExpectedCash =
    openingCash + metrics.cashSales - metrics.cashRefunds + metrics.cashIn - metrics.cashOut;

  let validatedClose;
  try {
    validatedClose = validateShiftCloseInput({
      expectedCash: liveExpectedCash,
      actualCash: params.actualCash,
      cashRetained: params.cashRetained,
      notes: params.notes,
    });
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Dữ liệu chốt ca không hợp lệ.' };
  }

  const reconciliation = calculateShiftReconciliation({
    openingCash,
    cashSales: metrics.cashSales,
    cashRefunds: metrics.cashRefunds,
    cashIn: metrics.cashIn,
    cashOut: metrics.cashOut,
    actualCash: validatedClose.actualCash,
    cashRetained: validatedClose.cashRetained,
  });

  const closedShift: ShiftSession = {
    id: targetShiftId,
    code: current?.code || `SHIFT-${Date.now().toString().slice(-6)}`,
    shiftName: current?.shiftName || 'Ca Bán Hàng',
    status: 'CLOSED',
    openedAt: openTime,
    closedAt: closeTime,
    openedByName: current?.openedByName || staff.fullName,
    closedByName: staff.fullName,
    openingCash,
    cashSales: metrics.cashSales,
    cashRefunds: metrics.cashRefunds,
    cashIn: metrics.cashIn,
    cashOut: metrics.cashOut,
    expectedCash: reconciliation.expectedCash,
    actualCash: validatedClose.actualCash,
    cashVariance: reconciliation.cashVariance,
    varianceStatus: reconciliation.varianceStatus,
    cashRetained: validatedClose.cashRetained,
    cashHandedOver: reconciliation.cashHandedOver,
    orderCount: metrics.orderCount,
    notes: validatedClose.notes || null,
    denominations: params.denominations,
    locationId: staff.locationId,
    businessId: staff.businessId,
    idempotencyKey,
  };

  try {
    if (isUuidLike(closedShift.id)) {
      const baseUpdate = {
        closed_by: staff.dbUserId,
        closed_at: closeTime,
        cash_sales: metrics.cashSales,
        cash_refunds: metrics.cashRefunds,
        cash_in: metrics.cashIn,
        cash_out: metrics.cashOut,
        expected_cash: reconciliation.expectedCash,
        actual_cash: validatedClose.actualCash,
        cash_variance: reconciliation.cashVariance,
        cash_retained: validatedClose.cashRetained,
        cash_handed_over: reconciliation.cashHandedOver,
        denominations: params.denominations || {},
        status: 'CLOSED',
        notes: validatedClose.notes || null,
        updated_at: closeTime,
      };

      const { error } = await adminClient
        .from('cash_drawer_sessions')
        .update({
          ...baseUpdate,
          order_count: metrics.orderCount,
        })
        .eq('id', closedShift.id);

      if (error) {
        await adminClient
          .from('cash_drawer_sessions')
          .update(baseUpdate)
          .eq('id', closedShift.id);
      }
    }
  } catch (err) {
    console.warn('closeShiftSession DB fallback:', err);
  }

  store.activeShiftByLocation[staff.locationId] = null;
  store.shiftHistoryByLocation[staff.locationId] = [
    closedShift,
    ...history.filter((h) => h.id !== closedShift.id),
  ].slice(0, MAX_STORED_SHIFTS_PER_LOC);
  writeRevenueStore(store);

  // Optionally record an automatic BANK_DEPOSIT payout voucher for cash handed over
  if (params.autoRecordHandover && reconciliation.cashHandedOver > 0) {
    await createCashTransaction(
      {
        type: 'PAYMENT',
        category: 'BANK_DEPOSIT',
        amount: reconciliation.cashHandedOver,
        paymentMethod: 'CASH',
        recipientPayer: 'Nộp doanh thu chốt ca về Chủ quán / Quản lý',
        notes: `Tự động ghi nhận khi chốt ca #${closedShift.code}`,
        shiftId: closedShift.id,
        idempotencyKey: idempotencyKey ? `${idempotencyKey}-handover` : `handover-${closedShift.id}`,
      },
      staff
    );
  }

  return { success: true, shift: closedShift };
}

/**
 * Fetch shift history merged cleanly between DB and persisted local store.
 */
export async function getShiftHistory(locationId: string, limit = 15): Promise<ShiftSession[]> {
  const adminClient = createAdminClient();
  const store = readRevenueStore();
  const localHistory = store.shiftHistoryByLocation[locationId] || [];

  let dbHistory: ShiftSession[] = [];
  try {
    let { data, error } = await adminClient
      .from('cash_drawer_sessions')
      .select('*, opener:users!cash_drawer_sessions_opened_by_fkey(full_name), closer:users!cash_drawer_sessions_closed_by_fkey(full_name)')
      .eq('location_id', locationId)
      .eq('status', 'CLOSED')
      .order('closed_at', { ascending: false })
      .limit(limit);

    if (error) {
      const fallback = await adminClient
        .from('cash_drawer_sessions')
        .select('*')
        .eq('location_id', locationId)
        .eq('status', 'CLOSED')
        .order('closed_at', { ascending: false })
        .limit(limit);
      data = fallback.data;
      error = fallback.error;
    }

    if (!error && Array.isArray(data)) {
      dbHistory = data.map((d) => ({
        id: String(d.id),
        code: d.code || `SHIFT-${String(d.id).slice(0, 8).toUpperCase()}`,
        shiftName: d.shift_name || 'Ca Bán Hàng',
        status: 'CLOSED',
        openedAt: String(d.opened_at),
        closedAt: d.closed_at ? String(d.closed_at) : null,
        openedByName: d.opener?.full_name || 'Thu ngân',
        closedByName: d.closer?.full_name || 'Thu ngân',
        openingCash: Number(d.opening_cash) || 0,
        cashSales: Number(d.cash_sales) || 0,
        cashRefunds: Number(d.cash_refunds) || 0,
        cashIn: Number(d.cash_in) || 0,
        cashOut: Number(d.cash_out) || 0,
        expectedCash: Number(d.expected_cash) || 0,
        actualCash: Number(d.actual_cash) || 0,
        cashVariance: Number(d.cash_variance) || 0,
        varianceStatus:
          Number(d.cash_variance) === 0
            ? 'BALANCED'
            : Number(d.cash_variance) > 0
              ? 'SURPLUS'
              : 'SHORTAGE',
        cashRetained: Number(d.cash_retained) || 0,
        cashHandedOver: Number(d.cash_handed_over) || 0,
        orderCount: Number(d.order_count) || 0,
        notes: d.notes ? String(d.notes) : null,
        denominations: typeof d.denominations === 'object' ? d.denominations : undefined,
        locationId,
      }));
    }
  } catch (err) {
    console.warn('getShiftHistory DB fallback:', err);
  }

  const mergedMap = new Map<string, ShiftSession>();
  for (const row of dbHistory) {
    mergedMap.set(row.code || row.id, row);
  }
  for (const local of localHistory) {
    const key = local.code || local.id;
    const existing = mergedMap.get(key) || Array.from(mergedMap.values()).find((r) => r.id === local.id);
    if (existing) {
      mergedMap.set(existing.code || existing.id, {
        ...existing,
        orderCount: existing.orderCount || local.orderCount || 0,
        denominations: existing.denominations || local.denominations,
      });
    } else {
      mergedMap.set(key, local);
    }
  }

  return Array.from(mergedMap.values())
    .sort((a, b) => new Date(b.closedAt || b.openedAt).getTime() - new Date(a.closedAt || a.openedAt).getTime())
    .slice(0, limit);
}

/**
 * Fetch orders and compile the complete revenue, cashbook & shift reconciliation report.
 */
export async function getRevenueReport(
  query: RevenueReportQuery,
  staff: PosStaffContext
): Promise<RevenueReportResponse> {
  const adminClient = createAdminClient();
  const preset: DateRangePreset = query.preset || 'TODAY';
  const boundaries = getDateRangeBoundaries(preset, query.customFrom, query.customTo);

  // Run queries in parallel for current location
  const [rawRows, cashTransactions, activeShift, shiftHistory, locationDefaultCash] = await Promise.all([
    queryOrdersForRevenue(adminClient, boundaries, query.channel, staff.locationId),
    getCashTransactions(staff.locationId, boundaries.from, boundaries.to),
    getActiveShiftSession(staff.locationId),
    getShiftHistory(staff.locationId),
    getLocationDefaultOpeningCash(staff),
  ]);

  const rawOrders: RawOrderForRevenue[] = [];
  const detailedOrders: DetailedRevenueOrder[] = [];

  for (const row of rawRows) {
    const meta = extractPosOrderMetadata(row);
    const subtotal = Number(row.subtotal) || 0;
    const totalDue = Number(row.total_due) || 0;
    const pointsUsed = Number(row.points_used) || 0;
    const status = (row.status as 'PENDING' | 'CONFIRMED' | 'CANCELLED') || 'CONFIRMED';
    const rawItems = Array.isArray(row.items) ? (row.items as Record<string, unknown>[]) : [];

    const itemsSummary = rawItems
      .map((it) => {
        const rawName = String(it.product_name || 'Món');
        const cleanName = rawName.replace(/\s*\[.*\]$/, '');
        return `${it.quantity || 1}× ${cleanName} (${it.size || 'M'})`;
      })
      .join(', ') || 'Đơn hàng';

    const orderItems = rawItems.map((it) => ({
      product_name: String(it.product_name || 'Món nước'),
      size: String(it.size || 'M'),
      quantity: Number(it.quantity) || 1,
      subtotal: Number(it.subtotal) || 0,
      unit_price: Number(it.unit_price) || 0,
    }));

    rawOrders.push({
      id: String(row.id || ''),
      order_code: String(row.order_code || ''),
      status,
      subtotal,
      total_due: totalDue,
      points_used: pointsUsed,
      discount_amount: meta.discountAmount,
      payment_method: meta.paymentMethod,
      amount_received: meta.amountReceived,
      change_due: meta.changeDue,
      channel: meta.channel,
      created_at: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
      customer_name: meta.customerName,
      customer_phone: meta.customerPhone,
      cancel_reason: meta.cancelReason,
      note: meta.userNote,
      items: orderItems,
    });

    detailedOrders.push({
      id: String(row.id || ''),
      orderCode: String(row.order_code || ''),
      status,
      channel: meta.channel,
      customerName: meta.customerName || 'Khách vãng lai',
      customerPhone: meta.customerPhone || '',
      paymentMethod: meta.paymentMethod,
      subtotal,
      discountAmount: meta.discountAmount,
      pointsUsed,
      totalDue,
      createdAt: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
      itemsSummary,
      cancelReason: meta.cancelReason,
    });
  }

  // Filter out VOIDED cashbook transactions when computing totals
  const cashPayoutsFromBook = cashTransactions
    .filter((tx) => tx.status !== 'VOIDED' && tx.type === 'PAYMENT')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const effectiveOpeningCash =
    query.openingCash !== undefined ? query.openingCash : activeShift ? activeShift.openingCash : 0;

  const cashInput: CashReconciliationInput = {
    openingCash: effectiveOpeningCash,
    actualCashCounted: query.actualCashCounted,
    cashPayouts: query.cashPayouts !== undefined ? query.cashPayouts : cashPayoutsFromBook,
  };

  const summary = calculateRevenueSummary(rawOrders, cashInput);

  // Unified Cashbook & Store Fund connecting order inflows + manual vouchers
  const cashbook = calculateCashbookSummary(
    effectiveOpeningCash,
    cashTransactions,
    summary.collection.totalCollected,
    summary.refunds.totalRefunded
  );
  const storeFund = cashbook.storeFund;
  const netCashflow = calculateNetOperatingCashflow(summary, cashbook);

  const lastRetained = shiftHistory[0]?.cashRetained;
  const suggestedOpeningCash =
    typeof lastRetained === 'number' && lastRetained > 0
      ? lastRetained
      : locationDefaultCash > 0
        ? locationDefaultCash
        : 500000;

  return {
    boundaries: {
      ...boundaries,
      preset,
    },
    summary,
    orders: detailedOrders,
    cashbook,
    storeFund,
    netCashflow,
    activeShift,
    shiftHistory,
    suggestedOpeningCash,
    staff: {
      fullName: staff.fullName,
      staffRole: staff.staffRole,
      locationId: staff.locationId,
      locationName: staff.locationName,
    },
  };
}
