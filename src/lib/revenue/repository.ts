import { createAdminClient } from '@/lib/supabase/admin';
import type { PosStaffContext } from '@/lib/auth-utils';
import { extractPosOrderMetadata } from '@/lib/pos/domain';
import {
  calculateRevenueSummary,
  calculateCashbookSummary,
  calculateShiftReconciliation,
  getDateRangeBoundaries,
  type CashReconciliationInput,
  type CashTransaction,
  type CashTransactionCategory,
  type CashTransactionType,
  type CashbookSummary,
  type DateRangePreset,
  type DenominationKey,
  type RawOrderForRevenue,
  type RevenueSummaryResult,
  type ShiftSession,
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
  activeShift: ShiftSession | null;
  shiftHistory: ShiftSession[];
  staff: {
    fullName: string;
    staffRole: string;
    locationName: string;
  };
}

// In-memory fallback stores when Supabase DB migrations are not yet applied
const memoryCashTransactions: CashTransaction[] = [];
let memoryActiveShift: ShiftSession | null = null;
const memoryShiftHistory: ShiftSession[] = [];

/**
 * Fetch orders and compile the complete revenue & cash reconciliation report.
 */
export async function getRevenueReport(
  query: RevenueReportQuery,
  staff: PosStaffContext
): Promise<RevenueReportResponse> {
  const adminClient = createAdminClient();
  const preset: DateRangePreset = query.preset || 'TODAY';
  const boundaries = getDateRangeBoundaries(preset, query.customFrom, query.customTo);

  let ordersQuery = adminClient
    .from('orders')
    .select('*, items:order_items(product_name, size, quantity, subtotal, unit_price), user:users(id, full_name, phone)')
    .gte('created_at', boundaries.from)
    .lte('created_at', boundaries.to)
    .order('created_at', { ascending: false });

  // Optional channel filter
  if (query.channel && query.channel !== 'ALL') {
    if (query.channel === 'POS') {
      ordersQuery = ordersQuery.or('channel.eq.POS,order_code.ilike.POS-%');
    } else if (query.channel === 'WEB') {
      ordersQuery = ordersQuery.or('channel.eq.WEB,order_code.ilike.CF-%,order_code.ilike.ULAB-%');
    }
  }

  const { data: rows, error } = await ordersQuery;

  if (error || !rows) {
    console.error('getRevenueReport query error:', error);
  }

  const rawRows = (rows as Record<string, unknown>[] | null) || [];

  // Transform DB rows into RawOrderForRevenue and DetailedRevenueOrder
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

  // 1. Fetch or Fallback Cash Transactions for Cashbook
  const cashTransactions = await getCashTransactions(
    staff.locationId,
    boundaries.from,
    boundaries.to
  );

  // 2. Compute total cash payouts from cashbook to feed cashReconciliation
  const cashPayoutsFromBook = cashTransactions
    .filter((tx) => tx.type === 'PAYMENT' && tx.paymentMethod === 'CASH')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const cashInput: CashReconciliationInput = {
    openingCash: query.openingCash || 0,
    actualCashCounted: query.actualCashCounted,
    cashPayouts: query.cashPayouts !== undefined ? query.cashPayouts : cashPayoutsFromBook,
  };

  const summary = calculateRevenueSummary(rawOrders, cashInput);

  // 3. Compute Cashbook summary with running balance
  const openingCashbookBalance = query.openingCash || 500000;
  const cashbook = calculateCashbookSummary(openingCashbookBalance, cashTransactions);

  // 4. Fetch Active Shift and Shift History
  const activeShift = await getActiveShiftSession(staff.locationId);
  const shiftHistory = await getShiftHistory(staff.locationId);

  return {
    boundaries: {
      ...boundaries,
      preset,
    },
    summary,
    orders: detailedOrders,
    cashbook,
    activeShift,
    shiftHistory,
    staff: {
      fullName: staff.fullName,
      staffRole: staff.staffRole,
      locationName: staff.locationName,
    },
  };
}

/**
 * Fetch cash transactions for Cashbook ledger.
 */
export async function getCashTransactions(
  locationId: string,
  from?: string,
  to?: string
): Promise<CashTransaction[]> {
  const adminClient = createAdminClient();

  try {
    let q = adminClient
      .from('cash_transactions')
      .select('*')
      .eq('location_id', locationId)
      .order('created_at', { ascending: false });

    if (from) q = q.gte('created_at', from);
    if (to) q = q.lte('created_at', to);

    const { data, error } = await q;

    if (!error && Array.isArray(data) && data.length > 0) {
      return data.map((r) => ({
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
      }));
    }
  } catch (err) {
    console.warn('cash_transactions table query fallback:', err);
  }

  // Fallback to in-memory items
  return memoryCashTransactions;
}

/**
 * Create a new Cash Transaction (Receipt or Payment voucher).
 */
export async function createCashTransaction(
  params: {
    type: CashTransactionType;
    category: CashTransactionCategory;
    amount: number;
    paymentMethod?: 'CASH' | 'BANK_TRANSFER';
    recipientPayer: string;
    notes?: string;
  },
  staff: PosStaffContext
): Promise<{ success: boolean; transaction?: CashTransaction; error?: string }> {
  const adminClient = createAdminClient();
  const amount = Math.max(0, Math.floor(params.amount));
  if (amount <= 0) {
    return { success: false, error: 'Số tiền giao dịch phải lớn hơn 0đ.' };
  }

  const d = new Date();
  const dateStr = d.toISOString().slice(2, 10).replace(/-/g, '');
  const prefix = params.type === 'RECEIPT' ? 'PT' : 'PC';
  const rand = Math.floor(1000 + Math.random() * 9000);
  const code = `${prefix}-${dateStr}-${rand}`;

  const txData: CashTransaction = {
    id: `mem-${Date.now()}-${rand}`,
    code,
    type: params.type,
    category: params.category,
    amount,
    paymentMethod: params.paymentMethod || 'CASH',
    recipientPayer: params.recipientPayer.trim() || 'Người giao dịch',
    notes: params.notes?.trim() || undefined,
    createdByName: staff.fullName,
    createdAt: new Date().toISOString(),
  };

  try {
    const { data: dbTx, error } = await adminClient
      .from('cash_transactions')
      .insert({
        business_id: staff.businessId,
        location_id: staff.locationId,
        code,
        type: params.type,
        category: params.category,
        amount,
        payment_method: params.paymentMethod || 'CASH',
        recipient_payer: txData.recipientPayer,
        notes: txData.notes,
        created_by: staff.dbUserId,
        created_by_name: staff.fullName,
      })
      .select()
      .maybeSingle();

    if (!error && dbTx) {
      txData.id = String(dbTx.id);
    }
  } catch (err) {
    console.warn('createCashTransaction DB fallback:', err);
  }

  memoryCashTransactions.unshift(txData);
  return { success: true, transaction: txData };
}

/**
 * Get active open shift session.
 */
export async function getActiveShiftSession(locationId: string): Promise<ShiftSession | null> {
  const adminClient = createAdminClient();

  try {
    const { data, error } = await adminClient
      .from('cash_drawer_sessions')
      .select('*, opener:users!cash_drawer_sessions_opened_by_fkey(full_name)')
      .eq('location_id', locationId)
      .eq('status', 'OPEN')
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      return {
        id: String(data.id),
        code: data.code || `SHIFT-${String(data.id).slice(0, 8).toUpperCase()}`,
        shiftName: data.shift_name || 'Ca Bán Hàng',
        status: 'OPEN',
        openedAt: String(data.opened_at),
        openedByName: data.opener?.full_name || 'Thu ngân',
        openingCash: Number(data.opening_cash) || 0,
        cashSales: Number(data.cash_sales) || 0,
        cashRefunds: Number(data.cash_refunds) || 0,
        cashIn: Number(data.cash_in) || 0,
        cashOut: Number(data.cash_out) || 0,
        expectedCash: Number(data.expected_cash) || 0,
      };
    }
  } catch (err) {
    console.warn('getActiveShiftSession fallback:', err);
  }

  return memoryActiveShift;
}

/**
 * Open a new shift session.
 */
export async function openShiftSession(
  params: {
    shiftName: string;
    openingCash: number;
    notes?: string;
  },
  staff: PosStaffContext
): Promise<{ success: boolean; shift?: ShiftSession; error?: string }> {
  const adminClient = createAdminClient();
  const openingCash = Math.max(0, Math.floor(params.openingCash || 0));

  const d = new Date();
  const dateStr = d.toISOString().slice(2, 10).replace(/-/g, '');
  const rand = Math.floor(100 + Math.random() * 900);
  const code = `SHIFT-${dateStr}-${rand}`;

  const newShift: ShiftSession = {
    id: `shift-${Date.now()}`,
    code,
    shiftName: params.shiftName.trim() || 'Ca Sáng',
    status: 'OPEN',
    openedAt: new Date().toISOString(),
    openedByName: staff.fullName,
    openingCash,
    cashSales: 0,
    cashRefunds: 0,
    cashIn: 0,
    cashOut: 0,
    expectedCash: openingCash,
    notes: params.notes,
  };

  try {
    const { data: dbShift, error } = await adminClient
      .from('cash_drawer_sessions')
      .insert({
        business_id: staff.businessId,
        location_id: staff.locationId,
        code,
        shift_name: newShift.shiftName,
        opened_by: staff.dbUserId,
        opening_cash: openingCash,
        expected_cash: openingCash,
        status: 'OPEN',
        notes: params.notes || null,
      })
      .select()
      .maybeSingle();

    if (!error && dbShift) {
      newShift.id = String(dbShift.id);
    }
  } catch (err) {
    console.warn('openShiftSession DB fallback:', err);
  }

  memoryActiveShift = newShift;
  return { success: true, shift: newShift };
}

/**
 * Close and reconcile shift session.
 */
export async function closeShiftSession(
  params: {
    shiftId?: string;
    actualCash: number;
    cashRetained?: number;
    notes?: string;
    denominations?: Partial<Record<DenominationKey, number>>;
  },
  staff: PosStaffContext
): Promise<{ success: boolean; shift?: ShiftSession; error?: string }> {
  const adminClient = createAdminClient();
  const current = memoryActiveShift || (await getActiveShiftSession(staff.locationId));

  const openingCash = current?.openingCash || 500000;

  // Compute orders created during shift
  const openTime = current?.openedAt || new Date(Date.now() - 8 * 3600 * 1000).toISOString();
  const closeTime = new Date().toISOString();

  let cashSales = 0;
  let cashRefunds = 0;

  try {
    const { data: shiftOrders } = await adminClient
      .from('orders')
      .select('status, total_due, payment_method, note')
      .gte('created_at', openTime)
      .lte('created_at', closeTime);

    for (const ord of (shiftOrders as Record<string, unknown>[]) || []) {
      const meta = extractPosOrderMetadata(ord);
      const totalDue = Number(ord.total_due) || 0;
      if (meta.paymentMethod === 'CASH') {
        if (ord.status === 'CONFIRMED') cashSales += totalDue;
        else if (ord.status === 'CANCELLED') cashRefunds += totalDue;
      }
    }
  } catch {
    // ignore
  }

  const reconciliation = calculateShiftReconciliation({
    openingCash,
    cashSales,
    cashRefunds,
    cashIn: 0,
    cashOut: 0,
    actualCash: params.actualCash,
    cashRetained: params.cashRetained,
  });

  const closedShift: ShiftSession = {
    id: current?.id || `shift-${Date.now()}`,
    code: current?.code || `SHIFT-${Date.now().toString().slice(-6)}`,
    shiftName: current?.shiftName || 'Ca Bán Hàng',
    status: 'CLOSED',
    openedAt: openTime,
    closedAt: closeTime,
    openedByName: current?.openedByName || staff.fullName,
    closedByName: staff.fullName,
    openingCash,
    cashSales,
    cashRefunds,
    cashIn: 0,
    cashOut: 0,
    expectedCash: reconciliation.expectedCash,
    actualCash: params.actualCash,
    cashVariance: reconciliation.cashVariance,
    varianceStatus: reconciliation.varianceStatus,
    cashRetained: params.cashRetained || 0,
    cashHandedOver: reconciliation.cashHandedOver,
    notes: params.notes,
    denominations: params.denominations,
  };

  try {
    await adminClient
      .from('cash_drawer_sessions')
      .update({
        closed_by: staff.dbUserId,
        closed_at: closeTime,
        cash_sales: cashSales,
        cash_refunds: cashRefunds,
        expected_cash: reconciliation.expectedCash,
        actual_cash: params.actualCash,
        cash_variance: reconciliation.cashVariance,
        cash_retained: params.cashRetained || 0,
        cash_handed_over: reconciliation.cashHandedOver,
        denominations: params.denominations || {},
        status: 'CLOSED',
        notes: params.notes || null,
        updated_at: closeTime,
      })
      .eq('id', closedShift.id);
  } catch (err) {
    console.warn('closeShiftSession DB fallback:', err);
  }

  memoryActiveShift = null;
  memoryShiftHistory.unshift(closedShift);
  return { success: true, shift: closedShift };
}

/**
 * Fetch shift history.
 */
export async function getShiftHistory(locationId: string, limit = 10): Promise<ShiftSession[]> {
  const adminClient = createAdminClient();

  try {
    const { data, error } = await adminClient
      .from('cash_drawer_sessions')
      .select('*, opener:users!cash_drawer_sessions_opened_by_fkey(full_name), closer:users!cash_drawer_sessions_closed_by_fkey(full_name)')
      .eq('location_id', locationId)
      .eq('status', 'CLOSED')
      .order('closed_at', { ascending: false })
      .limit(limit);

    if (!error && Array.isArray(data) && data.length > 0) {
      return data.map((d) => ({
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
        notes: d.notes ? String(d.notes) : null,
        denominations: typeof d.denominations === 'object' ? d.denominations : undefined,
      }));
    }
  } catch (err) {
    console.warn('getShiftHistory DB fallback:', err);
  }

  return memoryShiftHistory;
}
