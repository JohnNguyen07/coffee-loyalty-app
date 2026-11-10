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
  pointsEarned?: number;
  memberPointBalance?: number;
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

// Global in-memory cache for product availability and price overrides
const globalProductAvailability = new Map<string, boolean>();
const globalProductPriceOverrides = new Map<string, Map<string, number>>();

export function getProductAvailabilityMap(): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  globalProductAvailability.forEach((v, k) => {
    result[k] = v;
  });
  return result;
}

export function isProductAvailable(productId: string): boolean {
  if (globalProductAvailability.has(productId)) {
    return globalProductAvailability.get(productId) === true;
  }
  return true;
}

export async function setProductAvailability(
  productId: string,
  isAvailable: boolean
): Promise<boolean> {
  globalProductAvailability.set(productId, isAvailable);

  try {
    const adminClient = createAdminClient();
    const staticItem = allMenuItems.find((m) => m.id === productId);
    if (staticItem) {
      const { data: dbCat } = await adminClient
        .from('menu_categories')
        .select('id')
        .eq('slug', staticItem.categorySlug)
        .maybeSingle();

      let query = adminClient
        .from('menu_items')
        .update({ is_available: isAvailable, updated_at: new Date().toISOString() })
        .ilike('name', staticItem.name);

      if (dbCat?.id) {
        query = query.eq('category_id', dbCat.id);
      }

      await query;
    }
  } catch (err) {
    console.warn('DB menu_items availability update fallback:', err);
  }

  return true;
}

export async function setProductPrices(
  productId: string,
  sizes: { label: string; price: number }[]
): Promise<boolean> {
  const sizeMap = new Map<string, number>();
  sizes.forEach((s) => sizeMap.set(s.label, s.price));
  globalProductPriceOverrides.set(productId, sizeMap);

  try {
    const adminClient = createAdminClient();
    const staticItem = allMenuItems.find((m) => m.id === productId);
    if (staticItem) {
      const { data: dbCat } = await adminClient
        .from('menu_categories')
        .select('id')
        .eq('slug', staticItem.categorySlug)
        .maybeSingle();

      let query = adminClient
        .from('menu_items')
        .select('id')
        .ilike('name', staticItem.name);

      if (dbCat?.id) {
        query = query.eq('category_id', dbCat.id);
      }

      const { data: dbItems } = await query;
      const dbItem = dbItems?.[0];

      if (dbItem?.id) {
        await adminClient.from('menu_item_sizes').delete().eq('menu_item_id', dbItem.id);
        await adminClient.from('menu_item_sizes').insert(
          sizes.map((s, idx) => ({
            menu_item_id: dbItem.id,
            size_label: s.label,
            price: s.price,
            is_available: true,
            sort_order: idx + 1,
          }))
        );
      }
    }
  } catch (err) {
    console.warn('DB menu_item_sizes price update fallback:', err);
  }

  return true;
}

export function getProductPriceOverridesMap(): Record<string, { label: string; price: number }[]> {
  const result: Record<string, { label: string; price: number }[]> = {};
  globalProductPriceOverrides.forEach((map, pid) => {
    const arr: { label: string; price: number }[] = [];
    map.forEach((price, label) => arr.push({ label, price }));
    result[pid] = arr;
  });
  return result;
}

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
          .filter((item) => {
            if (item.category_id !== cat.id) return false;
            const lower = item.name.trim().toLowerCase();
            // Exclude discontinued Cold Brew Vải from active menu catalog
            if (lower === 'cold brew vải' || lower === 'cold brew vai') return false;
            return true;
          })
          .map((item) => {
            const lowerDbName = item.name.trim().toLowerCase();
            const isStrawberryMatcha =
              lowerDbName === 'strawberry matcha' || lowerDbName === 'strawberry matcha latte';
            const staticMatch =
              staticCat?.items.find(
                (m) =>
                  m.name.toLowerCase() === lowerDbName ||
                  (isStrawberryMatcha && m.id === 'strawberry-matcha')
              ) ||
              allMenuItems.find(
                (m) => m.name.toLowerCase() === lowerDbName && m.categorySlug === cat.slug
              ) ||
              allMenuItems.find((m) => m.id === item.id) ||
              allMenuItems.find((m) => m.name.toLowerCase() === lowerDbName);
            const pid = staticMatch?.id || item.id;
            const rawSizes = Array.isArray(item.sizes) ? (item.sizes as DbSizeRow[]) : [];
            const sortedSizes = rawSizes
              .filter((s) => {
                if (s.is_available === false) return false;
                if (staticMatch && !staticMatch.sizes.some((st) => st.label === s.size_label)) {
                  return false;
                }
                return true;
              })
              .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
              .map((s) => ({
                label: s.size_label,
                price: Number(s.price) || 0,
              }));

            const priceMap = globalProductPriceOverrides.get(pid);
            const baseSizes = staticMatch?.sizes || (sortedSizes.length > 0 ? sortedSizes : [{ label: 'M', price: 30000 }]);
            const finalSizes = baseSizes.map((sz) => ({
              label: sz.label,
              price: priceMap?.get(sz.label) ?? sz.price,
            }));

            const isAvailable = globalProductAvailability.has(pid)
              ? globalProductAvailability.get(pid)!
              : item.is_available !== false;

            return {
              id: pid,
              name: staticMatch?.name || item.name,
              category: cat.name,
              categorySlug: cat.slug,
              isSignature: Boolean(item.is_signature ?? staticMatch?.isSignature),
              tag: staticMatch?.tag,
              shelfLife: staticMatch?.shelfLife || item.description || undefined,
              sizes: finalSizes,
              isAvailable,
            };
          });

        // Merge any canonical items from static menuData that haven't been seeded into DB yet
        if (staticCat) {
          for (const stItem of staticCat.items) {
            const alreadyPresent = catItems.some(
              (ci) =>
                ci.id === stItem.id ||
                ci.name.toLowerCase() === stItem.name.toLowerCase()
            );
            if (!alreadyPresent) {
              const priceMap = globalProductPriceOverrides.get(stItem.id);
              const sizes = priceMap
                ? stItem.sizes.map((s) => ({
                    label: s.label,
                    price: priceMap.get(s.label) ?? s.price,
                  }))
                : stItem.sizes;
              const isAvailable = globalProductAvailability.has(stItem.id)
                ? globalProductAvailability.get(stItem.id)!
                : true;
              catItems.push({
                ...stItem,
                sizes,
                isAvailable,
              });
            }
          }
        }

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

  const mappedCategories: MenuCategory[] = menuData.map((cat) => ({
    ...cat,
    items: cat.items.map((item) => {
      const priceMap = globalProductPriceOverrides.get(item.id);
      const sizes = priceMap
        ? item.sizes.map((s) => ({
            label: s.label,
            price: priceMap.get(s.label) ?? s.price,
          }))
        : item.sizes;

      const isAvailable = globalProductAvailability.has(item.id)
        ? globalProductAvailability.get(item.id)!
        : true;

      return {
        ...item,
        sizes,
        isAvailable,
      };
    }),
  }));

  return {
    categories: mappedCategories,
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

  // 2. Look up member profile by phone if provided (or auto-create member if valid phone)
  let memberProfile: {
    id: string;
    full_name: string | null;
    phone: string | null;
    point_balance: number;
    total_spending?: number;
    current_tier_id?: string;
    upgraded_to_silver?: boolean;
    upgraded_to_gold?: boolean;
    upgraded_to_diamond?: boolean;
    tier?: { id: string; code: string; name: string; cashback_rate: number } | null;
  } | null = null;
  const cleanPhone = (payload.customerPhone || '').replace(/[\s\-()]/g, '');
  if (cleanPhone) {
    const { data: byPhone } = await adminClient
      .from('users')
      .select('id, full_name, phone, point_balance, total_spending, current_tier_id, upgraded_to_silver, upgraded_to_gold, upgraded_to_diamond, tier:tiers(id, code, name, cashback_rate)')
      .eq('phone', cleanPhone)
      .maybeSingle();

    if (byPhone) {
      const rawTier = Array.isArray(byPhone.tier) ? byPhone.tier[0] : byPhone.tier;
      memberProfile = {
        ...byPhone,
        tier: (rawTier as { id: string; code: string; name: string; cashback_rate: number } | null) || null,
      };
    } else if (/^0\d{8,10}$/.test(cleanPhone)) {
      // Auto-register member when cashier enters a valid new phone number at POS
      const { data: memberTier } = await adminClient
        .from('tiers')
        .select('id, code, name, cashback_rate')
        .eq('code', 'MEMBER')
        .maybeSingle();

      if (memberTier) {
        const autoName = payload.customerName?.trim() || `Thành viên ${cleanPhone.slice(-4)}`;
        const { data: createdMember } = await adminClient
          .from('users')
          .insert({
            full_name: autoName,
            phone: cleanPhone,
            role: 'USER',
            current_tier_id: memberTier.id,
            point_balance: 0,
            total_spending: 0,
            locked_points: 0,
          })
          .select('id, full_name, phone, point_balance, total_spending, current_tier_id, upgraded_to_silver, upgraded_to_gold, upgraded_to_diamond')
          .maybeSingle();

        if (createdMember) {
          memberProfile = {
            ...createdMember,
            tier: {
              id: memberTier.id,
              code: memberTier.code,
              name: memberTier.name,
              cashback_rate: Number(memberTier.cashback_rate) || 3,
            },
          };
        }
      }
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

  const candidateQr =
    totals.totalDue >= 1000 && totals.pointsUsed === 0
      ? `QR-${totals.totalDue}-${Date.now().toString(36).toUpperCase()}-${Math.random()
          .toString(36)
          .substring(2, 5)
          .toUpperCase()}`
      : undefined;

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
    qrTokenCode: candidateQr,
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

  // 7. Deduct member points if used & Automatically credit cashback points when member phone is provided
  let pointsEarned = 0;
  let finalMemberBalance = memberProfile ? Number(memberProfile.point_balance) || 0 : undefined;

  if (memberProfile && totals.pointsUsed > 0) {
    finalMemberBalance = Math.max(0, (finalMemberBalance || 0) - totals.pointsUsed);
    await adminClient
      .from('users')
      .update({ point_balance: finalMemberBalance, updated_at: now.toISOString() })
      .eq('id', memberProfile.id);

    await adminClient.from('point_transactions').insert({
      user_id: memberProfile.id,
      type: 'ORDER_DEDUCT',
      amount: -totals.pointsUsed,
      balance_after: finalMemberBalance,
      reference_id: String(insertedOrder!.order_code),
      description: `Dùng điểm tại quầy POS cho đơn ${insertedOrder!.order_code}`,
    });
  }

  // 7b. Auto-credit cashback points directly to customer wallet when phone is entered at POS
  // Rule: Orders that redeem points/balance from the account (totals.pointsUsed > 0) do NOT earn cashback!
  if (memberProfile && totals.totalDue > 0 && totals.pointsUsed === 0) {
    const tierRate = Number(memberProfile.tier?.cashback_rate) || 3;
    const cashbackEarned = Math.floor((totals.totalDue * tierRate) / 100);
    const newSpending = (Number(memberProfile.total_spending) || 0) + totals.totalDue;
    let newBalance = (finalMemberBalance || 0) + cashbackEarned;

    let newTierId = memberProfile.current_tier_id;
    let newTierName = memberProfile.tier?.name || 'Member';
    let tierBonus = 0;
    const tierFlagUpdates: Record<string, boolean> = {};

    const { data: allTiers } = await adminClient
      .from('tiers')
      .select('id, code, name, min_spending')
      .order('min_spending', { ascending: false });

    if (allTiers && allTiers.length > 0) {
      for (const t of allTiers) {
        if (newSpending >= Number(t.min_spending)) {
          if (t.id !== memberProfile.current_tier_id) {
            newTierId = t.id;
            newTierName = t.name;
            if (t.code === 'SILVER' && !memberProfile.upgraded_to_silver) {
              tierBonus = 100000;
              tierFlagUpdates.upgraded_to_silver = true;
            } else if (t.code === 'GOLD' && !memberProfile.upgraded_to_gold) {
              tierBonus = 200000;
              tierFlagUpdates.upgraded_to_gold = true;
            } else if (t.code === 'DIAMOND' && !memberProfile.upgraded_to_diamond) {
              tierBonus = 45000;
              tierFlagUpdates.upgraded_to_diamond = true;
            }
            newBalance += tierBonus;
          }
          break;
        }
      }
    }

    if (cashbackEarned > 0) {
      await adminClient.from('point_transactions').insert({
        user_id: memberProfile.id,
        type: 'CASHBACK',
        amount: cashbackEarned,
        balance_after: newBalance - tierBonus,
        reference_id: String(insertedOrder!.order_code),
        description: `Tích điểm tự động (${tierRate}%) qua SĐT cho đơn ${insertedOrder!.order_code}`,
      });
    }

    if (tierBonus > 0) {
      await adminClient.from('point_transactions').insert({
        user_id: memberProfile.id,
        type: 'TIER_UP_BONUS',
        amount: tierBonus,
        balance_after: newBalance,
        reference_id: newTierName,
        description: `Thưởng thăng hạng ${newTierName} ✨`,
      });
    }

    await adminClient
      .from('users')
      .update({
        point_balance: newBalance,
        total_spending: newSpending,
        ...(newTierId ? { current_tier_id: newTierId } : {}),
        ...tierFlagUpdates,
        updated_at: now.toISOString(),
      })
      .eq('id', memberProfile.id);

    pointsEarned = cashbackEarned + tierBonus;
    finalMemberBalance = newBalance;
  }

  // 8. Generate a QR Loyalty Token for this receipt if totalDue > 0 and no account points were used
  // If memberProfile already received auto-cashback via phone, mark QR as USED so it cannot be double-claimed!
  let qrTokenCode: string | undefined;
  if (candidateQr && totals.totalDue >= 1000 && totals.pointsUsed === 0) {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: qrRow, error: qrErr } = await adminClient
      .from('qr_tokens')
      .insert({
        code: candidateQr,
        drink_value: totals.totalDue,
        status: memberProfile ? 'USED' : 'ACTIVE',
        created_by: staff.dbUserId,
        scanned_by: memberProfile ? memberProfile.id : null,
        scanned_at: memberProfile ? now.toISOString() : null,
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
  if (pointsEarned > 0) {
    record.pointsEarned = pointsEarned;
  }
  if (finalMemberBalance !== undefined) {
    record.memberPointBalance = finalMemberBalance;
  }

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

  const buildPosOrdersQuery = (selectStr: string) => {
    let q = adminClient
      .from('orders')
      .select(selectStr, { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (params.status && params.status !== 'ALL') {
      q = q.eq('status', params.status);
    }

    if (params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)) {
      const dayStart = new Date(`${params.date}T00:00:00.000+07:00`).toISOString();
      const dayEnd = new Date(`${params.date}T23:59:59.999+07:00`).toISOString();
      q = q.gte('created_at', dayStart).lte('created_at', dayEnd);
    }

    if (params.search && params.search.trim()) {
      const clean = escapeFilterInput(params.search.trim());
      if (clean) {
        q = q.or(`order_code.ilike.%${clean}%,note.ilike.%${clean}%`);
      }
    }
    return q;
  };

  let { data: rows, error, count } = await buildPosOrdersQuery(
    '*, items:order_items(*), user:users!user_id(id, full_name, email, phone)'
  );

  if (error) {
    const fallback = await buildPosOrdersQuery('*, items:order_items(*)');
    rows = fallback.data;
    error = fallback.error;
    count = fallback.count;
  }

  if (error || !rows) {
    console.error('listPosOrders error:', error);
    return { orders: [], total: 0 };
  }

  const mapped = (rows as unknown as Record<string, unknown>[]).map((r) => mapOrderRowToPosRecord(r));
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

  // Refund member points if points were used on this order, AND revoke earned cashback points if any were credited
  const pointsUsed = Number(existingRow.points_used) || 0;
  const orderCodeStr = String(existingRow.order_code);
  const orderTotalDue = Number(existingRow.total_due) || 0;

  // Expire any active QR token linked to this cancelled order so it cannot be scanned later
  if (prevMeta.qrTokenCode) {
    try {
      await adminClient
        .from('qr_tokens')
        .update({ status: 'EXPIRED' })
        .eq('code', prevMeta.qrTokenCode)
        .eq('status', 'ACTIVE');
    } catch {
      // Ignore if qr_tokens update fails
    }
  }

  // Look up any CASHBACK transactions earned from this order (via auto-phone POS credit or scanned QR token)
  const refCandidates = [orderCodeStr, ...(prevMeta.qrTokenCode ? [prevMeta.qrTokenCode] : [])];
  const { data: earnedTxs } = await adminClient
    .from('point_transactions')
    .select('id, user_id, type, amount, reference_id')
    .in('reference_id', refCandidates)
    .in('type', ['CASHBACK', 'ORDER_CONFIRM'])
    .gt('amount', 0);

  let revokedCashbackPoints = 0;

  // 1) Refund points that the customer spent on this order (if pointsUsed > 0)
  if (pointsUsed > 0) {
    let spendUserId = existingRow.user_id as string | undefined;
    if (!spendUserId && prevMeta.customerPhone) {
      const cleanCancelPhone = prevMeta.customerPhone.replace(/\s+/g, '');
      if (cleanCancelPhone) {
        const { data: byPhone } = await adminClient
          .from('users')
          .select('id')
          .eq('phone', cleanCancelPhone)
          .maybeSingle();
        if (byPhone?.id) spendUserId = String(byPhone.id);
      }
    }

    if (spendUserId) {
      const { data: spendUser } = await adminClient
        .from('users')
        .select('id, point_balance, locked_points')
        .eq('id', spendUserId)
        .maybeSingle();

      if (spendUser) {
        const refundedBalance = (Number(spendUser.point_balance) || 0) + pointsUsed;
        const newLocked =
          currentStatus === 'PENDING'
            ? Math.max(0, (Number(spendUser.locked_points) || 0) - pointsUsed)
            : Number(spendUser.locked_points) || 0;

        await adminClient
          .from('users')
          .update({
            point_balance: refundedBalance,
            locked_points: newLocked,
            updated_at: nowIso,
          })
          .eq('id', spendUser.id);

        await adminClient.from('point_transactions').insert({
          user_id: spendUser.id,
          type: 'ORDER_CANCEL_REFUND',
          amount: pointsUsed,
          balance_after: refundedBalance,
          reference_id: orderCodeStr,
          description: `Hoàn điểm đã dùng do hủy đơn ${orderCodeStr}: ${params.cancelReason.trim()}`,
        });
      }
    }
  }

  // 2) Revoke/claw back cashback points that the customer earned from this order
  if (earnedTxs && earnedTxs.length > 0) {
    const earnedByUser = new Map<string, number>();
    for (const tx of earnedTxs) {
      const uid = String(tx.user_id || '');
      const amt = Number(tx.amount) || 0;
      if (uid && amt > 0) {
        earnedByUser.set(uid, (earnedByUser.get(uid) || 0) + amt);
      }
    }

    for (const [uid, earnedAmount] of earnedByUser.entries()) {
      const { data: earnerRow } = await adminClient
        .from('users')
        .select('id, point_balance, total_spending')
        .eq('id', uid)
        .maybeSingle();

      if (earnerRow && earnedAmount > 0) {
        revokedCashbackPoints += earnedAmount;
        const newBalance = Math.max(0, (Number(earnerRow.point_balance) || 0) - earnedAmount);
        const newSpending = Math.max(0, (Number(earnerRow.total_spending) || 0) - orderTotalDue);

        await adminClient
          .from('users')
          .update({
            point_balance: newBalance,
            total_spending: newSpending,
            updated_at: nowIso,
          })
          .eq('id', earnerRow.id);

        await adminClient.from('point_transactions').insert({
          user_id: earnerRow.id,
          type: 'ORDER_CANCEL_REFUND',
          amount: -earnedAmount,
          balance_after: newBalance,
          reference_id: orderCodeStr,
          description: `Thu hồi điểm tích lũy (-${earnedAmount.toLocaleString('vi-VN')}đ) do hủy đơn ${orderCodeStr}: ${params.cancelReason.trim()}`,
        });
      }
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
        revokedCashbackPoints,
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
