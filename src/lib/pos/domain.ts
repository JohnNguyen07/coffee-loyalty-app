import { allMenuItems, type MenuItem as StaticMenuItem } from '../../data/menu';

export const DEFAULT_BUSINESS_ID = '00000000-0000-0000-0000-000000000001';
export const DEFAULT_LOCATION_ID = '00000000-0000-0000-0000-000000000002';
export const DEFAULT_LOCATION_NAME = 'Ủ LAB — Quầy Chính';

export type StaffRole = 'OWNER' | 'ADMIN' | 'MANAGER' | 'CASHIER' | 'INVENTORY_STAFF';
export type OrderType = 'TAKEAWAY' | 'DINE_IN' | 'DELIVERY';
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'EWALLET';
export type DiscountType = 'NONE' | 'PERCENT' | 'FIXED';

export interface PosAddonOption {
  id: string;
  name: string;
  price: number;
}

export const SWEETNESS_OPTIONS = [
  '100% đường',
  '70% đường',
  '50% đường',
  '30% đường',
  'Không đường',
] as const;

export const ICE_OPTIONS = [
  '100% đá',
  '70% đá',
  '50% đá',
  'Ít đá',
  'Đá riêng',
  'Không đá',
] as const;

export const ADDON_OPTIONS: PosAddonOption[] = [
  { id: 'kem-muoi', name: 'Kem Muối', price: 7000 },
  { id: 'shot-cold-brew', name: 'Thêm Shot Cold Brew', price: 10000 },
  { id: 'sua-yen-mach', name: 'Đổi Sữa Yến Mạch', price: 5000 },
  { id: 'tran-chau-trang', name: 'Trân Châu Trắng', price: 6000 },
];

export const CASHIER_MAX_DISCOUNT_PERCENT = 10;
export const CASHIER_MAX_DISCOUNT_AMOUNT = 20000;

export interface PosItemOptions {
  sweetness?: string;
  ice?: string;
  addons?: string[]; // array of addon IDs
}

export interface PosCartItemInput {
  itemId: string;
  productName: string;
  sizeLabel: string;
  quantity: number;
  options?: PosItemOptions;
  itemNote?: string;
  unitPriceOverride?: number; // Used only if item comes from dynamic DB menu not in static list
}

export interface NormalizedPosOrderItem {
  itemId: string;
  productName: string;
  sizeLabel: string;
  quantity: number;
  basePrice: number;
  addonPrice: number;
  unitPrice: number;
  subtotal: number;
  options: {
    sweetness: string;
    ice: string;
    addons: { id: string; name: string; price: number }[];
  };
  itemNote: string;
}

export interface PosDiscountInput {
  type: DiscountType;
  value: number; // percent (0-100) or fixed VND
  reason?: string;
}

export interface PosOrderCalculationResult {
  items: NormalizedPosOrderItem[];
  totalQuantity: number;
  subtotal: number;
  discountAmount: number;
  discountPercent: number;
  pointsUsed: number;
  totalDue: number;
  amountReceived: number;
  changeDue: number;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Resolve addon objects and total addon price from addon IDs.
 */
export function resolveAddons(addonIds?: string[]): {
  addons: PosAddonOption[];
  addonTotal: number;
} {
  if (!Array.isArray(addonIds) || addonIds.length === 0) {
    return { addons: [], addonTotal: 0 };
  }
  const uniqueIds = Array.from(new Set(addonIds));
  const addons = uniqueIds
    .map((id) => ADDON_OPTIONS.find((a) => a.id === id))
    .filter((a): a is PosAddonOption => Boolean(a));
  const addonTotal = addons.reduce((sum, a) => sum + a.price, 0);
  return { addons, addonTotal };
}

/**
 * Normalize cart items and verify prices against menu catalog.
 */
export function normalizePosItems(
  rawItems: PosCartItemInput[],
  catalog: StaticMenuItem[] = allMenuItems
): NormalizedPosOrderItem[] {
  if (!Array.isArray(rawItems)) return [];

  return rawItems
    .filter((it) => it && (it.itemId || it.productName) && Number(it.quantity) > 0)
    .map((it) => {
      const qty = Math.max(1, Math.floor(Number(it.quantity) || 1));
      const matchedItem = catalog.find(
        (m) => m.id === it.itemId || m.name.toLowerCase() === (it.productName || '').trim().toLowerCase()
      );
      const sizeObj = matchedItem?.sizes.find((s) => s.label === it.sizeLabel) || matchedItem?.sizes[0];
      const basePrice = sizeObj
        ? sizeObj.price
        : Math.max(0, Math.floor(Number(it.unitPriceOverride) || 0));

      const isBottled = (sizeObj?.label || it.sizeLabel) === 'Chai';
      const sweetness = isBottled
        ? 'Nguyên bản (Chai)'
        : it.options?.sweetness || '100% đường';
      const ice = isBottled
        ? 'Ướp lạnh (Chai)'
        : it.options?.ice || '100% đá';

      const { addons, addonTotal } = isBottled
        ? { addons: [], addonTotal: 0 }
        : resolveAddons(it.options?.addons);

      const unitPrice = basePrice + addonTotal;
      const subtotal = unitPrice * qty;

      return {
        itemId: matchedItem?.id || it.itemId || 'custom-item',
        productName: matchedItem?.name || it.productName.trim(),
        sizeLabel: sizeObj?.label || it.sizeLabel || 'M',
        quantity: qty,
        basePrice,
        addonPrice: addonTotal,
        unitPrice,
        subtotal,
        options: {
          sweetness,
          ice,
          addons,
        },
        itemNote: (it.itemNote || '').trim(),
      };
    });
}

/**
 * Validate whether the staff role is permitted to apply the requested discount.
 */
export function validateDiscountPermission(
  subtotal: number,
  discount: PosDiscountInput | undefined,
  staffRole: StaffRole
): ValidationResult & { discountAmount: number; discountPercent: number } {
  if (!discount || discount.type === 'NONE' || !discount.value || discount.value <= 0) {
    return { valid: true, discountAmount: 0, discountPercent: 0 };
  }

  if (subtotal <= 0) {
    return {
      valid: false,
      error: 'Không thể áp dụng giảm giá cho giỏ hàng có tổng tiền bằng 0.',
      discountAmount: 0,
      discountPercent: 0,
    };
  }

  let discountAmount = 0;
  let discountPercent = 0;

  if (discount.type === 'PERCENT') {
    if (discount.value < 0 || discount.value > 100) {
      return {
        valid: false,
        error: 'Phần trăm giảm giá phải nằm trong khoảng từ 0% đến 100%.',
        discountAmount: 0,
        discountPercent: 0,
      };
    }
    discountPercent = Number(discount.value.toFixed(2));
    discountAmount = Math.round((subtotal * discountPercent) / 100);
  } else if (discount.type === 'FIXED') {
    discountAmount = Math.floor(Number(discount.value) || 0);
    if (discountAmount < 0 || discountAmount > subtotal) {
      return {
        valid: false,
        error: 'Số tiền giảm giá không được vượt quá tạm tính của đơn hàng.',
        discountAmount: 0,
        discountPercent: 0,
      };
    }
    discountPercent = Number(((discountAmount / subtotal) * 100).toFixed(2));
  }

  if (discountAmount > 0 && (!discount.reason || discount.reason.trim().length < 2)) {
    return {
      valid: false,
      error: 'Vui lòng nhập lý do giảm giá (ví dụ: Voucher, Khách quen, Chương trình KM).',
      discountAmount: 0,
      discountPercent: 0,
    };
  }

  if (staffRole === 'CASHIER') {
    const exceedsPercent = discountPercent > CASHIER_MAX_DISCOUNT_PERCENT;
    const exceedsAmount = discountAmount > CASHIER_MAX_DISCOUNT_AMOUNT;
    if (exceedsPercent || exceedsAmount) {
      return {
        valid: false,
        error: `Thu ngân (CASHIER) chỉ được giảm tối đa ${CASHIER_MAX_DISCOUNT_PERCENT}% và không quá ${CASHIER_MAX_DISCOUNT_AMOUNT.toLocaleString('vi-VN')}đ. Cần quyền Quản lý (MANAGER/ADMIN).`,
        discountAmount: 0,
        discountPercent: 0,
      };
    }
  }

  return {
    valid: true,
    discountAmount,
    discountPercent,
  };
}

/**
 * Calculate complete order totals, discounts, points, and cash change.
 */
export function calculatePosOrderTotals(params: {
  items: PosCartItemInput[];
  discount?: PosDiscountInput;
  pointsRequested?: number;
  availableMemberPoints?: number;
  paymentMethod: PaymentMethod;
  amountReceived?: number;
  staffRole: StaffRole;
  catalog?: StaticMenuItem[];
}): {
  validation: ValidationResult;
  totals: PosOrderCalculationResult;
} {
  const normalizedItems = normalizePosItems(params.items, params.catalog);
  const totalQuantity = normalizedItems.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = normalizedItems.reduce((sum, item) => sum + item.subtotal, 0);

  if (normalizedItems.length === 0 || subtotal <= 0) {
    return {
      validation: { valid: false, error: 'Giỏ hàng trống hoặc chưa có món hợp lệ.' },
      totals: {
        items: [],
        totalQuantity: 0,
        subtotal: 0,
        discountAmount: 0,
        discountPercent: 0,
        pointsUsed: 0,
        totalDue: 0,
        amountReceived: 0,
        changeDue: 0,
      },
    };
  }

  const discountCheck = validateDiscountPermission(subtotal, params.discount, params.staffRole);
  if (!discountCheck.valid) {
    return {
      validation: { valid: false, error: discountCheck.error },
      totals: {
        items: normalizedItems,
        totalQuantity,
        subtotal,
        discountAmount: 0,
        discountPercent: 0,
        pointsUsed: 0,
        totalDue: subtotal,
        amountReceived: 0,
        changeDue: 0,
      },
    };
  }

  const afterDiscount = Math.max(0, subtotal - discountCheck.discountAmount);
  const maxPoints = Math.max(0, Math.floor(params.availableMemberPoints || 0));
  const requestedPoints = Math.max(0, Math.floor(params.pointsRequested || 0));
  const pointsUsed = Math.min(requestedPoints, maxPoints, afterDiscount);

  const totalDue = Math.max(0, afterDiscount - pointsUsed);

  const rawReceived =
    params.paymentMethod === 'CASH'
      ? params.amountReceived !== undefined && params.amountReceived > 0
        ? Math.floor(params.amountReceived)
        : totalDue
      : totalDue;

  if (params.paymentMethod === 'CASH' && rawReceived < totalDue) {
    return {
      validation: {
        valid: false,
        error: `Số tiền khách đưa (${rawReceived.toLocaleString('vi-VN')}đ) nhỏ hơn tổng cần thu (${totalDue.toLocaleString('vi-VN')}đ).`,
      },
      totals: {
        items: normalizedItems,
        totalQuantity,
        subtotal,
        discountAmount: discountCheck.discountAmount,
        discountPercent: discountCheck.discountPercent,
        pointsUsed,
        totalDue,
        amountReceived: rawReceived,
        changeDue: 0,
      },
    };
  }

  const changeDue = Math.max(0, rawReceived - totalDue);

  return {
    validation: { valid: true },
    totals: {
      items: normalizedItems,
      totalQuantity,
      subtotal,
      discountAmount: discountCheck.discountAmount,
      discountPercent: discountCheck.discountPercent,
      pointsUsed,
      totalDue,
      amountReceived: rawReceived,
      changeDue,
    },
  };
}

/**
 * Generate a sequential or unique POS order code that fits within VARCHAR(20).
 * Format: POS-YYMMDD-XXXX (15 characters)
 */
export function generatePosOrderCode(date: Date = new Date(), sequenceOrRandom?: number): string {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const suffix =
    sequenceOrRandom !== undefined
      ? String(sequenceOrRandom).padStart(4, '0').slice(-4)
      : String(Math.floor(1000 + Math.random() * 9000));
  return `POS-${yy}${mm}${dd}-${suffix}`;
}

/**
 * Validate whether staff can cancel an order.
 * Rule: Never hard-delete completed orders; require a cancellation reason; check role.
 */
export function validatePosOrderCancel(params: {
  currentStatus: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
  staffRole: StaffRole;
  cancelReason?: string;
}): ValidationResult {
  if (params.currentStatus === 'CANCELLED') {
    return { valid: false, error: 'Đơn hàng này đã ở trạng thái Đã hủy.' };
  }

  const cleanReason = (params.cancelReason || '').trim();
  if (cleanReason.length < 3) {
    return {
      valid: false,
      error: 'Bắt buộc nhập lý do hủy đơn (tối thiểu 3 ký tự) để lưu nhật ký kiểm toán.',
    };
  }

  if (params.currentStatus === 'CONFIRMED' && params.staffRole === 'CASHIER') {
    return {
      valid: false,
      error: 'Đơn đã thanh toán chỉ được hủy bởi Quản lý (MANAGER) hoặc Quản trị viên (ADMIN).',
    };
  }

  return { valid: true };
}

/**
 * Format item options into a compact string for bar tickets, receipts, and fallback DB storage.
 */
export function formatItemOptionsSummary(options?: {
  sweetness?: string;
  ice?: string;
  addons?: { id: string; name: string; price: number }[];
}, itemNote?: string): string {
  const parts: string[] = [];
  if (options?.sweetness && options.sweetness !== '100% đường' && options.sweetness !== 'Nguyên bản (Chai)') {
    parts.push(options.sweetness);
  } else if (options?.sweetness === '100% đường') {
    parts.push('100% đường');
  }
  if (options?.ice && options.ice !== 'Ướp lạnh (Chai)') {
    parts.push(options.ice);
  }
  if (options?.addons && options.addons.length > 0) {
    parts.push(options.addons.map((a) => `+${a.name}`).join(', '));
  }
  if (itemNote && itemNote.trim()) {
    parts.push(`Ghi chú: ${itemNote.trim()}`);
  }
  return parts.join(' · ');
}

export interface PosOrderMetadata {
  channel: 'POS' | 'WEB';
  orderType: OrderType;
  paymentMethod: PaymentMethod;
  paymentStatus: 'PAID' | 'UNPAID' | 'REFUNDED';
  discountAmount: number;
  discountPercent: number;
  discountReason?: string;
  amountReceived: number;
  changeDue: number;
  customerName?: string;
  customerPhone?: string;
  cashierName?: string;
  cancelReason?: string;
  cancelledBy?: string;
  userNote?: string;
}

const POS_META_PREFIX = '[[ULAB_POS_META:';
const POS_META_SUFFIX = ']]';

/**
 * Encode POS metadata into the `note` field as a resilient fallback when extended columns are not yet migrated,
 * while keeping human-readable notes clean.
 */
export function serializePosFallbackNote(meta: PosOrderMetadata): string {
  const payload = JSON.stringify(meta);
  const humanNote = meta.userNote ? `${meta.userNote.trim()} ` : '';
  return `${humanNote}${POS_META_PREFIX}${payload}${POS_META_SUFFIX}`;
}

/**
 * Parse POS metadata from an order row (reads native columns first, then falls back to encoded note).
 */
export function extractPosOrderMetadata(orderRow: Record<string, unknown>): PosOrderMetadata {
  const rawNote = typeof orderRow.note === 'string' ? orderRow.note : '';
  let parsedMeta: Partial<PosOrderMetadata> = {};
  let cleanUserNote = rawNote;

  const startIdx = rawNote.indexOf(POS_META_PREFIX);
  if (startIdx !== -1) {
    const endIdx = rawNote.indexOf(POS_META_SUFFIX, startIdx);
    if (endIdx !== -1) {
      const jsonStr = rawNote.slice(startIdx + POS_META_PREFIX.length, endIdx);
      cleanUserNote = rawNote.slice(0, startIdx).trim();
      try {
        parsedMeta = JSON.parse(jsonStr);
      } catch {
        parsedMeta = {};
      }
    }
  }

  const userObj = orderRow.user as { full_name?: string; phone?: string } | undefined;

  return {
    channel: (orderRow.channel as 'POS' | 'WEB' | undefined) || parsedMeta.channel || ( String(orderRow.order_code || '').startsWith('POS-') ? 'POS' : 'WEB' ),
    orderType: (orderRow.order_type as OrderType | undefined) || parsedMeta.orderType || 'TAKEAWAY',
    paymentMethod: (orderRow.payment_method as PaymentMethod | undefined) || parsedMeta.paymentMethod || 'CASH',
    paymentStatus:
      orderRow.status === 'CANCELLED'
        ? 'REFUNDED'
        : (orderRow.payment_status as 'PAID' | 'UNPAID' | 'REFUNDED' | undefined) || parsedMeta.paymentStatus || 'PAID',
    discountAmount: Number(orderRow.discount_amount ?? parsedMeta.discountAmount ?? 0),
    discountPercent: Number(orderRow.discount_percent ?? parsedMeta.discountPercent ?? 0),
    discountReason: (orderRow.discount_reason as string | undefined) || parsedMeta.discountReason || undefined,
    amountReceived: Number(orderRow.amount_received ?? parsedMeta.amountReceived ?? orderRow.total_due ?? 0),
    changeDue: Number(orderRow.change_due ?? parsedMeta.changeDue ?? 0),
    customerName: (orderRow.customer_name as string | undefined) || parsedMeta.customerName || userObj?.full_name || 'Khách lẻ tại quầy',
    customerPhone: (orderRow.customer_phone as string | undefined) || parsedMeta.customerPhone || userObj?.phone || '',
    cashierName: parsedMeta.cashierName || 'Thu ngân Ủ LAB',
    cancelReason: (orderRow.cancel_reason as string | undefined) || parsedMeta.cancelReason || undefined,
    cancelledBy: parsedMeta.cancelledBy || undefined,
    userNote: cleanUserNote || parsedMeta.userNote || '',
  };
}
