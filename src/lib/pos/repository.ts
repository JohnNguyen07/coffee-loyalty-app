import { createAdminClient } from '@/lib/supabase/admin';
import { escapeFilterInput, type PosStaffContext } from '@/lib/auth-utils';
import { menuData, allMenuItems, type MenuCategory, type MenuItem } from '@/data/menu';
import { processPosOrderInventory, reversePosOrderInventory } from '@/lib/inventory/pos-integration';
import {
  ADDON_OPTIONS,
  ICE_OPTIONS,
  SWEETNESS_OPTIONS,
  calculatePosOrderTotals,
  extractPosOrderMetadata,
  formatItemOptionsSummary,
  generatePosOrderCode,
  serializePosFallbackNote,
  validatePosOrderCancel,
  type DiscountType,
  type NormalizedPosOrderItem,
  type OrderType,
  type PaymentMethod,
  type PosCartItemInput,
} from './domain';

interface DbSizeRow {
  size_label: string;
  price: number;
  sort_order?: number;
  is_available?: boolean;
}

export interface CreatePosOrderPayload {
  items: PosCartItemInput[];
  orderType: OrderType;
  paymentMethod: PaymentMethod;
  amountReceived?: number;
  discount?: {
    type: DiscountType;
    value: number;
    reason?: string;
  };
  customerPhone?: string;
  customerName?: string;
  pointsUsed?: number;
  note?: string;
  idempotencyKey?: string;
}

export interface PosOrderRecord {
  id: string;
  orderCode: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
  channel: 'POS' | 'WEB';
  orderType: OrderType;
  paymentMethod: PaymentMethod;
  paymentStatus: 'PAID' | 'UNPAID' | 'REFUNDED';
  subtotal: number;
  discountAmount: number;
  discountPercent: number;
  discountReason?: string;
  pointsUsed: number;
  totalDue: number;
  amountReceived: number;
  changeDue: number;
  customerName: string;
  customerPhone: string;
  cashierName: string;
  note: string;
  cancelReason?: string;
  cancelledBy?: string;
  qrTokenCode?: string;
  createdAt: string;
  confirmedAt?: string | null;
  cancelledAt?: string | null;
  items: {
    id?: string;
    productName: string;
    sizeLabel: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    optionsSummary: string;
    options?: {
      sweetness?: string;
      ice?: string;
      addons?: { id: string; name: string; price: number }[];
    };
    itemNote?: string;
  }[];
}

// Track recent idempotency keys in memory as a secondary guard when DB column is not migrated yet
const recentIdempotencyCache = new Map<string, PosOrderRecord>();

/**
 * Fetch POS menu categories, items, sizes, and customization options.
 */
export async function getPosMenuCatalog() {
  const adminClient = createAdminClient();

  try {
    const { data: dbCategories } = await adminClient
      .from('menu_categories')
      .select('id, name, slug, sort_order')
      .order('sort_order', { ascending: true });

    const { data: dbItems } = await adminClient
      .from('menu_items')
      .select('id, category_id, name, description, is_available, is_signature, sort_order, sizes:menu_item_sizes(id, size_label, price, is_available, sort_order)')
      .order('sort_order', { ascending: true });

    if (dbCategories && dbCategories.length > 0 && dbItems && dbItems.length > 0) {
      const categories: MenuCategory[] = dbCategories.map((cat) => {
        const staticCat = menuData.find((c) => c.slug === cat.slug);
        const catItems: MenuItem[] = dbItems
          .filter((item) => item.category_id === cat.id && item.is_available !== false)
          .map((item) => {
            const staticMatch = allMenuItems.find(
              (m) => m.name.toLowerCase() === item.name.toLowerCase()
            );
            const rawSizes = Array.isArray(item.sizes) ? (item.sizes as DbSizeRow[]) : [];
            const sortedSizes = rawSizes
              .filter((s) => s.is_available !== false)
              .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
              .map((s) => ({
                label: s.size_label,
                price: Number(s.price) || 0,
              }));

            return {
              id: staticMatch?.id || item.id,
              name: item.name,
              category: cat.name,
              categorySlug: cat.slug,
              isSignature: Boolean(item.is_signature ?? staticMatch?.isSignature),
              tag: staticMatch?.tag,
              shelfLife: staticMatch?.shelfLife || item.description || undefined,
              sizes: sortedSizes.length > 0 ? sortedSizes : staticMatch?.sizes || [{ label: 'M', price: 34000 }],
            };
          });

        return {
          name: cat.name,
          slug: cat.slug,
          icon: staticCat?.icon || '☕',
          items: catItems,
        };
      });

      return {
        categories,
        optionsConfig: {
          sweetness: SWEETNESS_OPTIONS,
          ice: ICE_OPTIONS,
          addons: ADDON_OPTIONS,
        },
      };
    }
  } catch (err) {
    console.warn('POS menu DB fetch fallback to static catalog:', err);
  }

  return {
    categories: menuData,
    optionsConfig: {
      sweetness: SWEETNESS_OPTIONS,
      ice: ICE_OPTIONS,
      addons: ADDON_OPTIONS,
    },
  };
}

/**
 * Helper to encode item options inside `product_name` when `order_items.item_options` column is not yet migrated.
 */
function formatFallbackProductName(item: NormalizedPosOrderItem): string {
  const summary = formatItemOptionsSummary(item.options, item.itemNote);
  if (!summary) return item.productName;
  return `${item.productName} [${summary}]`;
}

/**
 * Parse product name & options from an `order_items` row.
 */
function parseOrderItemRow(row: Record<string, unknown>) {
  const rawName = String(row.product_name || 'Món nước');
  let productName = rawName;
  let optionsSummary = '';

  const itemOptions = row.item_options as { sweetness?: string; ice?: string; addons?: { id: string; name: string; price: number }[] } | undefined;
  const itemNote = typeof row.item_note === 'string' ? row.item_note : undefined;

  if (itemOptions && typeof itemOptions === 'object' && Object.keys(itemOptions).length > 0) {
    optionsSummary = formatItemOptionsSummary(itemOptions, itemNote);
  } else {
    const bracketStart = rawName.indexOf(' [');
    const bracketEnd = rawName.lastIndexOf(']');
    if (bracketStart !== -1 && bracketEnd > bracketStart) {
      productName = rawName.slice(0, bracketStart).trim();
      optionsSummary = rawName.slice(bracketStart + 2, bracketEnd).trim();
    }
  }

  return {
    id: typeof row.id === 'string' ? row.id : undefined,
    productName,
    sizeLabel: String(row.size || 'M'),
    quantity: Number(row.quantity) || 1,
    unitPrice: Number(row.unit_price) || 0,
    subtotal: Number(row.subtotal) || (Number(row.unit_price) || 0) * (Number(row.quantity) || 1),
    optionsSummary,
    options: itemOptions,
    itemNote,
  };
}

/**
 * Map a raw DB order row to `PosOrderRecord`.
 */
function mapOrderRowToPosRecord(row: Record<string, unknown>, qrTokenCode?: string): PosOrderRecord {
  const meta = extractPosOrderMetadata(row);
  const rawItems = Array.isArray(row.items) ? (row.items as Record<string, unknown>[]) : [];

  return {
    id: String(row.id || ''),
    orderCode: String(row.order_code || ''),
    status: (row.status as 'PENDING' | 'CONFIRMED' | 'CANCELLED') || 'CONFIRMED',
    channel: meta.channel,
    orderType: meta.orderType,
    paymentMethod: meta.paymentMethod,
    paymentStatus: meta.paymentStatus,
    subtotal: Number(row.subtotal) || 0,
    discountAmount: meta.discountAmount,
    discountPercent: meta.discountPercent,
    discountReason: meta.discountReason,
    pointsUsed: Number(row.points_used) || 0,
    totalDue: Number(row.total_due) || 0,
    amountReceived: meta.amountReceived,
    changeDue: meta.changeDue,
    customerName: meta.customerName || 'Khách lẻ tại quầy',
    customerPhone: meta.customerPhone || '',
    cashierName: meta.cashierName || 'Thu ngân Ủ LAB',
    note: meta.userNote || '',
    cancelReason: meta.cancelReason,
    cancelledBy: meta.cancelledBy,
    qrTokenCode,
    createdAt: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
    confirmedAt: typeof row.confirmed_at === 'string' ? row.confirmed_at : null,
    cancelledAt: typeof row.cancelled_at === 'string' ? row.cancelled_at : null,
    items: rawItems.map(parseOrderItemRow),
  };
}

/**
 * Resolve a fallback `user_id` in case the database still enforces `orders.user_id NOT NULL` for walk-in guests.
 */
async function resolveFallbackUserId(adminClient: ReturnType<typeof createAdminClient>, staff: PosStaffContext): Promise<string | null> {
  if (staff.dbUserId) return staff.dbUserId;

  const { data: anyAdmin } = await adminClient
    .from('users')
    .select('id')
    .eq('role', 'ADMIN')
    .limit(1)
    .maybeSingle();

  if (anyAdmin?.id) return anyAdmin.id;

  const { data: anyUser } = await adminClient
    .from('users')
    .select('id')
    .limit(1)
    .maybeSingle();

  return anyUser?.id || null;
}

/**
 * Create a paid POS order at the counter.
 */
export async function createPosOrder(
  payload: CreatePosOrderPayload,
  staff: PosStaffContext
): Promise<{ success: boolean; error?: string; order?: PosOrderRecord }> {
  const adminClient = createAdminClient();

  // 1. Check idempotency key to prevent duplicate orders
  const idempotencyKey = payload.idempotencyKey?.trim();
  if (idempotencyKey && recentIdempotencyCache.has(idempotencyKey)) {
    return {
      success: true,
      order: recentIdempotencyCache.get(idempotencyKey)!,
    };
  }

  // 2. Look up member profile by phone if provided
  let memberProfile: { id: string; full_name: string | null; phone: string | null; point_balance: number } | null = null;
  const cleanPhone = (payload.customerPhone || '').replace(/[\s\-()]/g, '');
  if (cleanPhone) {
    const { data: byPhone } = await adminClient
      .from('users')
      .select('id, full_name, phone, point_balance')
      .eq('phone', cleanPhone)
      .maybeSingle();
    if (byPhone) {
      memberProfile = byPhone;
    }
  }

  // 3. Calculate and validate order totals, discounts, points, and payment
  const { categories } = await getPosMenuCatalog();
  const dynamicCatalog = categories.flatMap((c) => c.items);

  const calc = calculatePosOrderTotals({
    items: payload.items,
    discount: payload.discount,
    pointsRequested: payload.pointsUsed || 0,
    availableMemberPoints: memberProfile?.point_balance || 0,
    paymentMethod: payload.paymentMethod || 'CASH',
    amountReceived: payload.amountReceived,
    staffRole: staff.staffRole,
    catalog: dynamicCatalog,
  });

  if (!calc.validation.valid) {
    return {
      success: false,
      error: calc.validation.error || 'Dữ liệu đơn hàng không hợp lệ.',
    };
  }

  const { totals } = calc;

  // 4. Generate unique POS Order Code (POS-YYMMDD-XXXX)
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const { count: todayCount } = await adminClient
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', startOfDay);

  let orderCode = generatePosOrderCode(now, (todayCount || 0) + 1);

  // Verify uniqueness of orderCode
  const { data: existingCode } = await adminClient
    .from('orders')
    .select('id')
    .eq('order_code', orderCode)
    .maybeSingle();

  if (existingCode) {
    orderCode = generatePosOrderCode(now);
  }

  const customerName =
    payload.customerName?.trim() ||
    memberProfile?.full_name ||
    (cleanPhone ? `Khách (${cleanPhone})` : 'Khách lẻ tại quầy');

  const fallbackNote = serializePosFallbackNote({
    channel: 'POS',
    orderType: payload.orderType || 'TAKEAWAY',
    paymentMethod: payload.paymentMethod || 'CASH',
    paymentStatus: 'PAID',
    discountAmount: totals.discountAmount,
    discountPercent: totals.discountPercent,
    discountReason: payload.discount?.reason?.trim() || undefined,
    amountReceived: totals.amountReceived,
    changeDue: totals.changeDue,
    customerName,
    customerPhone: cleanPhone,
    cashierName: staff.fullName,
    userNote: payload.note?.trim() || '',
  });

  // 5. Try inserting with full M01 schema first; fallback to base schema if migration 0001 hasn't run yet
  let insertedOrder: Record<string, unknown> | null = null;

  const fullInsertPayload: Record<string, unknown> = {
    order_code: orderCode,
    user_id: memberProfile?.id || null,
    business_id: staff.businessId,
    location_id: staff.locationId,
    channel: 'POS',
    order_type: payload.orderType || 'TAKEAWAY',
    customer_name: customerName,
    customer_phone: cleanPhone || null,
    status: 'CONFIRMED',
    subtotal: totals.subtotal,
    discount_amount: totals.discountAmount,
    discount_percent: totals.discountPercent,
    discount_reason: payload.discount?.reason?.trim() || null,
    discount_approved_by: totals.discountAmount > 0 ? staff.dbUserId : null,
    points_used: totals.pointsUsed,
    total_due: totals.totalDue,
    payment_method: payload.paymentMethod || 'CASH',
    payment_status: 'PAID',
    amount_received: totals.amountReceived,
    change_due: totals.changeDue,
    idempotency_key: idempotencyKey || null,
    created_by: staff.dbUserId,
    confirmed_at: now.toISOString(),
    note: fallbackNote,
  };

  const { data: fullInserted, error: fullError } = await adminClient
    .from('orders')
    .insert(fullInsertPayload)
    .select('*')
    .single();

  if (!fullError && fullInserted) {
    insertedOrder = fullInserted as Record<string, unknown>;
  } else {
    // Fallback for unmigrated schema (e.g. missing columns or user_id NOT NULL constraint)
    const fallbackUserId = memberProfile?.id || (await resolveFallbackUserId(adminClient, staff));
    const baseInsertPayload: Record<string, unknown> = {
      order_code: orderCode,
      user_id: fallbackUserId,
      status: 'CONFIRMED',
      subtotal: totals.subtotal,
      points_used: totals.pointsUsed,
      total_due: totals.totalDue,
      confirmed_at: now.toISOString(),
      note: fallbackNote,
    };

    const { data: baseInserted, error: baseError } = await adminClient
      .from('orders')
      .insert(baseInsertPayload)
      .select('*')
      .single();

    if (baseError || !baseInserted) {
      console.error('POS Order creation failed:', { fullError, baseError });
      return {
        success: false,
        error: baseError?.message || 'Không thể lưu đơn hàng vào cơ sở dữ liệu.',
      };
    }
    insertedOrder = baseInserted as Record<string, unknown>;
  }

  // 6. Insert order items (try extended columns first, fallback to base columns)
  const fullItemsPayload = totals.items.map((it) => ({
    order_id: String(insertedOrder!.id),
    business_id: staff.businessId,
    location_id: staff.locationId,
    product_name: formatFallbackProductName(it),
    size: it.sizeLabel,
    quantity: it.quantity,
    unit_price: it.unitPrice,
    subtotal: it.subtotal,
    item_options: it.options,
    item_note: it.itemNote || null,
  }));

  let insertedItems: Record<string, unknown>[] | null = null;
  const { data: extItems, error: extItemsErr } = await adminClient
    .from('order_items')
    .insert(fullItemsPayload)
    .select('*');

  if (!extItemsErr && extItems) {
    insertedItems = extItems as Record<string, unknown>[];
  } else {
    const baseItemsPayload = totals.items.map((it) => ({
      order_id: String(insertedOrder!.id),
      product_name: formatFallbackProductName(it),
      size: it.sizeLabel,
      quantity: it.quantity,
      unit_price: it.unitPrice,
      subtotal: it.subtotal,
    }));
    const { data: fallbackItems } = await adminClient
      .from('order_items')
      .insert(baseItemsPayload)
      .select('*');
    insertedItems = (fallbackItems as Record<string, unknown>[] | null) || (baseItemsPayload as Record<string, unknown>[]);
  }

  // 7. Deduct member points if used
  if (memberProfile && totals.pointsUsed > 0) {
    const newBalance = Math.max(0, memberProfile.point_balance - totals.pointsUsed);
    await adminClient
      .from('users')
      .update({ point_balance: newBalance, updated_at: now.toISOString() })
      .eq('id', memberProfile.id);

    await adminClient.from('point_transactions').insert({
      user_id: memberProfile.id,
      type: 'ORDER_DEDUCT',
      amount: -totals.pointsUsed,
      balance_after: newBalance,
      reference_id: String(insertedOrder!.order_code),
      description: `Dùng điểm tại quầy POS cho đơn ${insertedOrder!.order_code}`,
    });
  }

  // 8. Generate a QR Loyalty Token for this receipt if totalDue > 0
  let qrTokenCode: string | undefined;
  if (totals.totalDue >= 1000) {
    const candidateQr = `QR-${totals.totalDue}-${Date.now().toString(36).toUpperCase()}-${Math.random()
      .toString(36)
      .substring(2, 5)
      .toUpperCase()}`;
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: qrRow, error: qrErr } = await adminClient
      .from('qr_tokens')
      .insert({
        code: candidateQr,
        drink_value: totals.totalDue,
        status: 'ACTIVE',
        created_by: staff.dbUserId,
        expires_at: expiresAt,
      })
      .select('code')
      .maybeSingle();

    if (!qrErr && qrRow?.code) {
      qrTokenCode = qrRow.code;
    }
  }

  // 9. Write audit log (best-effort if migration 0001 is active)
  try {
    await adminClient.from('order_audit_logs').insert({
      business_id: staff.businessId,
      location_id: staff.locationId,
      order_id: String(insertedOrder!.id),
      order_code: String(insertedOrder!.order_code),
      action: totals.discountAmount > 0 ? 'CREATED_WITH_DISCOUNT' : 'CREATED_AND_PAID',
      actor_id: staff.dbUserId,
      actor_name: staff.fullName,
      actor_role: staff.staffRole,
      reason: payload.discount?.reason || null,
      metadata: {
        subtotal: totals.subtotal,
        discountAmount: totals.discountAmount,
        pointsUsed: totals.pointsUsed,
        totalDue: totals.totalDue,
        paymentMethod: payload.paymentMethod,
      },
    });
  } catch {
    // Ignore if order_audit_logs table is not yet migrated
  }

  // 10. Record payment in PAYMENTS table & Deduct Inventory via Recipe/FEFO/FIFO
  try {
    await adminClient.from('payments').insert({
      business_id: staff.businessId,
      location_id: staff.locationId,
      order_id: String(insertedOrder!.id),
      payment_method: payload.paymentMethod || 'CASH',
      amount: totals.totalDue,
      status: 'COMPLETED',
      reference_code: String(insertedOrder!.order_code),
    });
  } catch {
    // Ignore if payments table is not yet migrated
  }

  try {
    await processPosOrderInventory(
      String(insertedOrder!.id),
      staff.businessId,
      staff.locationId,
      totals.items,
      staff.dbUserId
    );
  } catch {
    // Fallback gracefully if inventory tables/recipes are still being initialized
  }

  const record = mapOrderRowToPosRecord(
    {
      ...insertedOrder,
      items: insertedItems || [],
    },
    qrTokenCode
  );

  if (idempotencyKey) {
    recentIdempotencyCache.set(idempotencyKey, record);
  }

  return {
    success: true,
    order: record,
  };
}

/**
 * List recent orders for POS lookup and management.
 */
export async function listPosOrders(params: {
  status?: string;
  search?: string;
  date?: string; // YYYY-MM-DD
  limit?: number;
}): Promise<{ orders: PosOrderRecord[]; total: number }> {
  const adminClient = createAdminClient();
  const limit = Math.min(Math.max(1, params.limit || 30), 100);

  let query = adminClient
    .from('orders')
    .select('*, items:order_items(*), user:users(id, full_name, email, phone)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (params.status && params.status !== 'ALL') {
    query = query.eq('status', params.status);
  }

  if (params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)) {
    const dayStart = new Date(`${params.date}T00:00:00.000+07:00`).toISOString();
    const dayEnd = new Date(`${params.date}T23:59:59.999+07:00`).toISOString();
    query = query.gte('created_at', dayStart).lte('created_at', dayEnd);
  }

  if (params.search && params.search.trim()) {
    const clean = escapeFilterInput(params.search.trim());
    if (clean) {
      query = query.or(`order_code.ilike.%${clean}%,note.ilike.%${clean}%`);
    }
  }

  const { data: rows, error, count } = await query;

  if (error || !rows) {
    console.error('listPosOrders error:', error);
    return { orders: [], total: 0 };
  }

  const mapped = (rows as Record<string, unknown>[]).map((r) => mapOrderRowToPosRecord(r));
  return {
    orders: mapped,
    total: count || mapped.length,
  };
}

/**
 * Soft-cancel a POS order according to role permissions, with audit log and automatic point refund.
 */
export async function cancelPosOrder(params: {
  orderId: string;
  cancelReason: string;
  staff: PosStaffContext;
}): Promise<{ success: boolean; error?: string; order?: PosOrderRecord }> {
  const adminClient = createAdminClient();

  const { data: existing, error: fetchErr } = await adminClient
    .from('orders')
    .select('*, items:order_items(*), user:users(id, full_name, email, phone, point_balance, locked_points)')
    .eq('id', params.orderId)
    .maybeSingle();

  if (fetchErr || !existing) {
    return { success: false, error: 'Không tìm thấy đơn hàng cần hủy.' };
  }

  const existingRow = existing as Record<string, unknown>;
  const currentStatus = (existingRow.status as 'PENDING' | 'CONFIRMED' | 'CANCELLED') || 'CONFIRMED';

  const check = validatePosOrderCancel({
    currentStatus,
    staffRole: params.staff.staffRole,
    cancelReason: params.cancelReason,
  });

  if (!check.valid) {
    return { success: false, error: check.error };
  }

  const nowIso = new Date().toISOString();
  const prevMeta = extractPosOrderMetadata(existingRow);
  const updatedNote = serializePosFallbackNote({
    ...prevMeta,
    paymentStatus: 'REFUNDED',
    cancelReason: params.cancelReason.trim(),
    cancelledBy: `${params.staff.fullName} (${params.staff.staffRole})`,
  });

  // Update order status to CANCELLED (try extended columns first, fallback to base columns)
  let updatedRow: Record<string, unknown> | null = null;
  const { data: extUpdate, error: extErr } = await adminClient
    .from('orders')
    .update({
      status: 'CANCELLED',
      payment_status: 'REFUNDED',
      cancelled_at: nowIso,
      cancelled_by: params.staff.dbUserId,
      cancel_reason: params.cancelReason.trim(),
      note: updatedNote,
      updated_at: nowIso,
    })
    .eq('id', params.orderId)
    .select('*, items:order_items(*), user:users(id, full_name, email, phone)')
    .single();

  if (!extErr && extUpdate) {
    updatedRow = extUpdate as Record<string, unknown>;
  } else {
    const { data: baseUpdate, error: baseErr } = await adminClient
      .from('orders')
      .update({
        status: 'CANCELLED',
        cancelled_at: nowIso,
        note: updatedNote,
        updated_at: nowIso,
      })
      .eq('id', params.orderId)
      .select('*, items:order_items(*), user:users(id, full_name, email, phone)')
      .single();

    if (baseErr || !baseUpdate) {
      return { success: false, error: 'Lỗi cập nhật trạng thái hủy đơn.' };
    }
    updatedRow = baseUpdate as Record<string, unknown>;
  }

  // Refund member points if points were used on this order
  const pointsUsed = Number(existingRow.points_used) || 0;
  const userId = existingRow.user_id as string | undefined;
  if (pointsUsed > 0 && userId) {
    const { data: userRow } = await adminClient
      .from('users')
      .select('id, point_balance, locked_points')
      .eq('id', userId)
      .maybeSingle();

    if (userRow) {
      const newBalance = (Number(userRow.point_balance) || 0) + pointsUsed;
      const newLocked =
        currentStatus === 'PENDING'
          ? Math.max(0, (Number(userRow.locked_points) || 0) - pointsUsed)
          : Number(userRow.locked_points) || 0;

      await adminClient
        .from('users')
        .update({
          point_balance: newBalance,
          locked_points: newLocked,
          updated_at: nowIso,
        })
        .eq('id', userRow.id);

      await adminClient.from('point_transactions').insert({
        user_id: userRow.id,
        type: 'ORDER_CANCEL_REFUND',
        amount: pointsUsed,
        balance_after: newBalance,
        reference_id: String(existingRow.order_code),
        description: `Hoàn điểm do hủy đơn ${existingRow.order_code}: ${params.cancelReason.trim()}`,
      });
    }
  }

  // Write audit log (best-effort)
  try {
    await adminClient.from('order_audit_logs').insert({
      business_id: params.staff.businessId,
      location_id: params.staff.locationId,
      order_id: String(existingRow.id),
      order_code: String(existingRow.order_code),
      action: 'CANCELLED',
      actor_id: params.staff.dbUserId,
      actor_name: params.staff.fullName,
      actor_role: params.staff.staffRole,
      reason: params.cancelReason.trim(),
      metadata: {
        previousStatus: currentStatus,
        refundedPoints: pointsUsed,
        totalDue: existingRow.total_due,
      },
    });
  } catch {
    // Ignore if order_audit_logs table is not yet migrated
  }

  // Reverse payment in PAYMENTS table & reverse inventory deductions back to original lot & layer
  try {
    await adminClient
      .from('payments')
      .update({ status: 'REFUNDED' })
      .eq('order_id', params.orderId);

    await reversePosOrderInventory(params.orderId, params.staff.businessId, params.staff.dbUserId);
  } catch {
    // Fallback gracefully if inventory reversal is not configured
  }

  return {
    success: true,
    order: mapOrderRowToPosRecord(updatedRow!),
  };
}
