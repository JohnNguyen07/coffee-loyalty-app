import { createAdminClient } from '@/lib/supabase/admin';
import type { PosStaffContext } from '@/lib/auth-utils';
import { extractPosOrderMetadata } from '@/lib/pos/domain';
import {
  calculateRevenueSummary,
  getDateRangeBoundaries,
  type CashReconciliationInput,
  type DateRangePreset,
  type RawOrderForRevenue,
  type RevenueSummaryResult,
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
  staff: {
    fullName: string;
    staffRole: string;
    locationName: string;
  };
}

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
    .select('*, items:order_items(product_name, size, quantity, subtotal), user:users(id, full_name, phone)')
    .gte('created_at', boundaries.from)
    .lte('created_at', boundaries.to)
    .order('created_at', { ascending: false });

  // Optional channel filter
  if (query.channel && query.channel !== 'ALL') {
    if (query.channel === 'POS') {
      // Either channel = 'POS' or code starts with 'POS-'
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

  const cashInput: CashReconciliationInput = {
    openingCash: query.openingCash || 0,
    actualCashCounted: query.actualCashCounted,
    cashPayouts: query.cashPayouts || 0,
  };

  const summary = calculateRevenueSummary(rawOrders, cashInput);

  return {
    boundaries: {
      ...boundaries,
      preset,
    },
    summary,
    orders: detailedOrders,
    staff: {
      fullName: staff.fullName,
      staffRole: staff.staffRole,
      locationName: staff.locationName,
    },
  };
}

/**
 * Record a shift cash reconciliation count.
 */
export async function recordCashDrawerSession(
  params: {
    openingCash: number;
    actualCash: number;
    cashPayouts?: number;
    notes?: string;
  },
  staff: PosStaffContext
): Promise<{ success: boolean; error?: string }> {
  const adminClient = createAdminClient();

  try {
    // 1. Get today's numbers to compute expected cash
    const todayBoundaries = getDateRangeBoundaries('TODAY');
    const { data: todayOrders } = await adminClient
      .from('orders')
      .select('status, total_due, payment_method, note')
      .gte('created_at', todayBoundaries.from)
      .lte('created_at', todayBoundaries.to);

    let cashSales = 0;
    let cashRefunds = 0;

    for (const r of (todayOrders as Record<string, unknown>[]) || []) {
      const meta = extractPosOrderMetadata(r);
      const totalDue = Number(r.total_due) || 0;
      if (meta.paymentMethod === 'CASH') {
        if (r.status === 'CONFIRMED') cashSales += totalDue;
        else if (r.status === 'CANCELLED') cashRefunds += totalDue;
      }
    }

    const openingCash = Math.max(0, Math.floor(params.openingCash || 0));
    const cashPayouts = Math.max(0, Math.floor(params.cashPayouts || 0));
    const actualCash = Math.max(0, Math.floor(params.actualCash || 0));
    const expectedCash = openingCash + cashSales - cashRefunds - cashPayouts;
    const cashVariance = actualCash - expectedCash;

    // Try inserting into cash_drawer_sessions if table exists
    const { error: insertErr } = await adminClient
      .from('cash_drawer_sessions')
      .insert({
        business_id: staff.businessId,
        location_id: staff.locationId,
        opened_by: staff.dbUserId,
        closed_by: staff.dbUserId,
        opening_cash: openingCash,
        cash_sales: cashSales,
        cash_refunds: cashRefunds,
        cash_payouts: cashPayouts,
        expected_cash: expectedCash,
        actual_cash: actualCash,
        cash_variance: cashVariance,
        status: 'CLOSED',
        notes: params.notes || null,
        closed_at: new Date().toISOString(),
      });

    if (insertErr) {
      // Best-effort fallback to audit log if table not yet migrated
      await adminClient.from('order_audit_logs').insert({
        business_id: staff.businessId,
        location_id: staff.locationId,
        order_id: staff.locationId, // placeholder
        order_code: 'CASH-DRAWER',
        action: 'CASH_DRAWER_RECONCILIATION',
        actor_id: staff.dbUserId,
        actor_name: staff.fullName,
        actor_role: staff.staffRole,
        reason: params.notes || 'Chốt két tiền mặt ca',
        metadata: {
          openingCash,
          expectedCash,
          actualCash,
          cashVariance,
        },
      });
    }

    return { success: true };
  } catch (err: unknown) {
    console.error('recordCashDrawerSession error:', err);
    return { success: false, error: 'Không thể lưu phiên kiểm đếm tiền mặt.' };
  }
}
