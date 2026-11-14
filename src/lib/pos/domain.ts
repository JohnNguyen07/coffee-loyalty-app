import { allMenuItems, isMatchaItem, type MenuItem as StaticMenuItem } from '../../data/menu';

export const DEFAULT_BUSINESS_ID = '00000000-0000-0000-0000-000000000001';
export const DEFAULT_LOCATION_ID = '00000000-0000-0000-0000-000000000002';
export const DEFAULT_LOCATION_NAME = 'Ủ LAB — Quầy Chính';

export type StaffRole = 'OWNER' | 'ADMIN' | 'MANAGER' | 'CASHIER' | 'INVENTORY_STAFF';
export type OrderType = 'TAKEAWAY' | 'DINE_IN' | 'DELIVERY';
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'EWALLET';
export type DiscountType = 'NONE' | 'PERCENT' | 'FIXED';
export type FulfillmentStatus = 'PENDING' | 'PREPARING' | 'READY' | 'COMPLETED' | 'CANCELLED';

export const FULFILLMENT_STATUS_LABELS: Record<FulfillmentStatus, string> = {
  PENDING: 'Chờ xác nhận',
  PREPARING: 'Đang pha chế',
  READY: 'Sẵn sàng trả món',
  COMPLETED: 'Đã hoàn tất',
  CANCELLED: 'Đã hủy',
};

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
  { id: 'kem-beo', name: 'Kem Béo', price: 5000 },
  { id: '1g-matcha-fuji', name: '1g Matcha Fuji', price: 5000 },
  { id: 'sua-oat', name: 'Đổi Sữa Oat', price: 0 },
  { id: 'sua-thanh-trung', name: 'Sữa thanh trùng', price: 0 },
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
      const cleanName = (it.productName || '').trim().toLowerCase();

      // 1. Precise match: ID and has requested size
      let matchedItem = catalog.find(
        (m) => m.id === it.itemId && (!it.sizeLabel || m.sizes.some((s) => s.label === it.sizeLabel))
      );

      // 2. Fallback: match by ID only
      if (!matchedItem) {
        matchedItem = catalog.find((m) => m.id === it.itemId);
      }

      // 3. Fallback: match by name AND has requested size (handles cup vs bottle sharing the same name!)
      if (!matchedItem || (it.sizeLabel && !matchedItem.sizes.some((s) => s.label === it.sizeLabel))) {
        const byNameAndSize = catalog.find(
          (m) => m.name.toLowerCase() === cleanName && m.sizes.some((s) => s.label === it.sizeLabel)
        );
        if (byNameAndSize) {
          matchedItem = byNameAndSize;
        }
      }

      // 4. Fallback: match by name only (including Strawberry Matcha & Matcha Kem Béo aliases)
      if (!matchedItem) {
        matchedItem = catalog.find(
          (m) =>
            m.name.toLowerCase() === cleanName ||
            (m.id === 'strawberry-matcha' &&
              (cleanName === 'strawberry matcha' || cleanName === 'strawberry matcha latte')) ||
            (m.id === 'matcha-kem-beo' &&
              (cleanName === 'matcha kem béo' || cleanName === 'matcha kem beo' || cleanName === 'matcha kem muối' || cleanName === 'matcha kem muoi'))
        );
      }

      const sizeObj = matchedItem?.sizes.find((s) => s.label === it.sizeLabel);
      const basePrice = sizeObj
        ? sizeObj.price
        : typeof it.unitPriceOverride === 'number' && it.unitPriceOverride > 0
          ? Math.max(0, Math.floor(it.unitPriceOverride))
          : matchedItem?.sizes[0]?.price || 0;

      const isBottled =
        (sizeObj?.label || it.sizeLabel) === 'Chai' ||
        matchedItem?.categorySlug === 'cold-brew-chai' ||
        matchedItem?.category === 'Cold Brew Chai';
      const sweetness = isBottled
        ? 'Nguyên bản (Chai)'
        : it.options?.sweetness || '100% đường';
      const ice = isBottled
        ? 'Ướp lạnh (Chai)'
        : it.options?.ice || '100% đá';

      const isMatcha = isMatchaItem({
        categorySlug: matchedItem?.categorySlug,
        category: matchedItem?.category,
        name: matchedItem?.name || it.productName,
      });
      const filteredAddonIds = (it.options?.addons || []).filter((id) =>
        id === '1g-matcha-fuji' ? isMatcha : true
      );

      const { addons, addonTotal } = isBottled
        ? { addons: [], addonTotal: 0 }
        : resolveAddons(filteredAddonIds);

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
  fulfillmentStatus?: FulfillmentStatus;
  shippingFee?: number;
  customerAddress?: string;
  linkedOrderId?: string;
  linkedOrderCode?: string;
  pointsEarned?: number;
  memberPointBalance?: number;
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
  qrTokenCode?: string;
  userNote?: string;
}

const POS_META_PREFIX = '[[ULAB_POS_META:';
const POS_META_SUFFIX = ']]';

/**
 * Normalize order fulfillment status across migrated DB columns and legacy order statuses.
 */
export function normalizeFulfillmentStatus(
  status?: string | null,
  orderStatus?: string | null,
  channel?: 'POS' | 'WEB'
): FulfillmentStatus {
  if (orderStatus === 'CANCELLED') {
    return 'CANCELLED';
  }
  const upper = String(status || '').trim().toUpperCase();
  if (
    upper === 'PENDING' ||
    upper === 'PREPARING' ||
    upper === 'READY' ||
    upper === 'COMPLETED' ||
    upper === 'CANCELLED'
  ) {
    return upper;
  }
  if (orderStatus === 'CONFIRMED') {
    return channel === 'WEB' ? 'PREPARING' : 'COMPLETED';
  }
  return 'PENDING';
}

const FULFILLMENT_RANK: Record<Exclude<FulfillmentStatus, 'CANCELLED'>, number> = {
  PENDING: 0,
  PREPARING: 1,
  READY: 2,
  COMPLETED: 3,
};

/**
 * Validate forward-only transition for order preparation & handover progress.
 */
export function validateFulfillmentTransition(
  current: FulfillmentStatus,
  next: FulfillmentStatus
): ValidationResult {
  if (current === 'CANCELLED') {
    return {
      valid: false,
      error: 'Đơn hàng đã hủy không thể cập nhật tiến độ phục vụ.',
    };
  }
  if (next === 'CANCELLED') {
    return {
      valid: false,
      error: 'Vui lòng sử dụng chức năng Hủy đơn kèm lý do bắt buộc.',
    };
  }
  if (current === next) {
    return {
      valid: false,
      error: `Đơn hàng đã ở trạng thái "${FULFILLMENT_STATUS_LABELS[current]}".`,
    };
  }
  if (FULFILLMENT_RANK[next] < FULFILLMENT_RANK[current]) {
    return {
      valid: false,
      error: `Không thể chuyển lùi từ "${FULFILLMENT_STATUS_LABELS[current]}" về "${FULFILLMENT_STATUS_LABELS[next]}".`,
    };
  }
  return { valid: true };
}

/**
 * Compute waiting time & SLA alert badge for open orders.
 */
export function calculateOrderWaitStatus(
  createdAtIso: string,
  fulfillmentStatus: FulfillmentStatus,
  now: Date = new Date()
): { elapsedMinutes: number; slaLevel: 'NORMAL' | 'WARNING' | 'OVERDUE'; label: string } {
  if (fulfillmentStatus === 'COMPLETED' || fulfillmentStatus === 'CANCELLED') {
    return {
      elapsedMinutes: 0,
      slaLevel: 'NORMAL',
      label: FULFILLMENT_STATUS_LABELS[fulfillmentStatus],
    };
  }

  const createdMs = new Date(createdAtIso).getTime();
  const diffMs = Number.isNaN(createdMs) ? 0 : Math.max(0, now.getTime() - createdMs);
  const elapsedMinutes = Math.floor(diffMs / 60000);

  if (elapsedMinutes >= 20) {
    return {
      elapsedMinutes,
      slaLevel: 'OVERDUE',
      label: `Trễ ${elapsedMinutes} phút (Quá SLA)`,
    };
  }

  if (elapsedMinutes >= 10) {
    return {
      elapsedMinutes,
      slaLevel: 'WARNING',
      label: `Chờ ${elapsedMinutes} phút (Cần ưu tiên)`,
    };
  }

  return {
    elapsedMinutes,
    slaLevel: 'NORMAL',
    label: elapsedMinutes <= 1 ? 'Vừa tiếp nhận' : `Chờ ${elapsedMinutes} phút`,
  };
}

/**
 * Validate manual delivery shipping fee input (0 - 500,000 VND).
 */
export function validateShippingFeeInput(
  feeInput: unknown
): ValidationResult & { shippingFee: number } {
  if (feeInput === null || feeInput === undefined || feeInput === '') {
    return { valid: true, shippingFee: 0 };
  }
  const num = Number(feeInput);
  if (!Number.isFinite(num) || num < 0) {
    return {
      valid: false,
      error: 'Phí giao hàng phải là số không âm.',
      shippingFee: 0,
    };
  }
  const shippingFee = Math.floor(num);
  if (shippingFee > 500000) {
    return {
      valid: false,
      error: 'Phí giao hàng không được vượt quá 500.000đ.',
      shippingFee: 0,
    };
  }
  return { valid: true, shippingFee };
}

export interface MenuProductInput {
  name: string;
  categorySlug: string;
  sizes: { label: string; price: number }[];
  isSignature?: boolean;
  shelfLife?: string;
  description?: string;
}

const VALID_MENU_CATEGORY_SLUGS = ['cold-brew', 'matcha', 'cold-brew-chai'];

/**
 * Validate creating or updating a menu beverage item.
 */
export function validateMenuProductInput(input: MenuProductInput): ValidationResult {
  const cleanName = (input.name || '').trim();
  if (cleanName.length < 2 || cleanName.length > 120) {
    return {
      valid: false,
      error: 'Tên món phải từ 2 đến 120 ký tự.',
    };
  }

  const slug = (input.categorySlug || '').trim();
  if (!VALID_MENU_CATEGORY_SLUGS.includes(slug)) {
    return {
      valid: false,
      error: 'Nhóm thực đơn không hợp lệ (chỉ hỗ trợ Cold Brew, Matcha, Cold Brew Chai).',
    };
  }

  if (!Array.isArray(input.sizes) || input.sizes.length === 0) {
    return {
      valid: false,
      error: 'Món nước phải có ít nhất 1 kích cỡ (Size) và mức giá.',
    };
  }

  for (const sz of input.sizes) {
    const label = (sz?.label || '').trim();
    const price = Number(sz?.price);
    if (!label) {
      return { valid: false, error: 'Tên kích cỡ (Size) không được để trống.' };
    }
    if (!Number.isFinite(price) || price < 1000 || price > 5000000) {
      return {
        valid: false,
        error: `Giá bán Size ${label} phải nằm trong khoảng 1.000đ – 5.000.000đ.`,
      };
    }
  }

  return { valid: true };
}

export interface HeldPosCart {
  holdId: string;
  label: string;
  createdAt: string;
  orderType: OrderType;
  customerPhone: string;
  customerName: string;
  orderNote: string;
  discountType: DiscountType;
  discountValue: string;
  discountReason: string;
  linkedOrderId?: string | null;
  linkedOrderCode?: string | null;
  items: {
    itemId: string;
    productName: string;
    sizeLabel: string;
    basePrice: number;
    quantity: number;
    sweetness: string;
    ice: string;
    addons: string[];
    itemNote: string;
  }[];
  totalQuantity: number;
  subtotal: number;
}

/**
 * Validate whether current POS cart can be parked into Held Orders tray.
 */
export function validateHoldCartInput(
  itemsCount: number,
  existingHeldCount: number,
  maxHeld = 10
): ValidationResult {
  if (itemsCount <= 0) {
    return {
      valid: false,
      error: 'Giỏ hàng đang trống, không có món để lưu tạm.',
    };
  }
  if (existingHeldCount >= maxHeld) {
    return {
      valid: false,
      error: `Chỉ được giữ tối đa ${maxHeld} đơn tạm cùng lúc. Vui lòng xử lý hoặc xóa bớt đơn tạm cũ.`,
    };
  }
  return { valid: true };
}

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
  const resolvedChannel =
    (orderRow.channel as 'POS' | 'WEB' | undefined) ||
    parsedMeta.channel ||
    (String(orderRow.order_code || '').startsWith('POS-') ? 'POS' : 'WEB');

  let parsedShippingFee = Number(orderRow.shipping_fee ?? parsedMeta.shippingFee ?? 0);
  if (!parsedShippingFee) {
    const shipMatch = cleanUserNote.match(/\[Phí ship:\s*([\d.,]+)\s*đ?\]/i);
    if (shipMatch) {
      parsedShippingFee = Number(shipMatch[1].replace(/\D/g, '')) || 0;
    }
  }

  let parsedAddress =
    (orderRow.customer_address as string | undefined) || parsedMeta.customerAddress || undefined;
  if (!parsedAddress) {
    const dcMatch = cleanUserNote.match(/Đ\/c:\s*([^|]+)/);
    if (dcMatch && dcMatch[1]?.trim()) {
      parsedAddress = dcMatch[1].trim();
    }
  }

  const orderStatusStr = typeof orderRow.status === 'string' ? orderRow.status : undefined;
  const fulfillmentStatus = normalizeFulfillmentStatus(
    (orderRow.fulfillment_status as string | undefined) || parsedMeta.fulfillmentStatus,
    orderStatusStr,
    resolvedChannel
  );

  return {
    channel: resolvedChannel,
    orderType: (orderRow.order_type as OrderType | undefined) || parsedMeta.orderType || 'TAKEAWAY',
    paymentMethod: (orderRow.payment_method as PaymentMethod | undefined) || parsedMeta.paymentMethod || 'CASH',
    paymentStatus:
      orderRow.status === 'CANCELLED'
        ? 'REFUNDED'
        : (orderRow.payment_status as 'PAID' | 'UNPAID' | 'REFUNDED' | undefined) || parsedMeta.paymentStatus || 'PAID',
    fulfillmentStatus,
    shippingFee: parsedShippingFee,
    customerAddress: parsedAddress,
    linkedOrderId: (orderRow.linked_order_id as string | undefined) || parsedMeta.linkedOrderId || undefined,
    linkedOrderCode: parsedMeta.linkedOrderCode || undefined,
    pointsEarned: parsedMeta.pointsEarned,
    memberPointBalance: parsedMeta.memberPointBalance,
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
    qrTokenCode: parsedMeta.qrTokenCode || undefined,
    userNote: cleanUserNote || parsedMeta.userNote || '',
  };
}

// ============================================================
// COUNTER PHONE LOYALTY DOMAIN (ĐỌC SĐT TẠI QUẦY - CỘNG % HẠNG THẺ / TRỪ TẠI QUẦY)
// ============================================================

export const TIER_CASHBACK_RATES: Record<string, number> = {
  MEMBER: 3,
  SILVER: 5,
  GOLD: 7,
  DIAMOND: 10,
};

export function resolveTierCashbackRate(tierCode?: string | null, explicitRate?: number | null): number {
  if (typeof explicitRate === 'number' && explicitRate > 0) {
    return explicitRate;
  }
  const code = String(tierCode || 'MEMBER').trim().toUpperCase();
  return TIER_CASHBACK_RATES[code] ?? 3;
}

export interface CounterLoyaltyInput {
  billAmount: number;
  pointsRequested?: number;
  availableMemberPoints?: number;
  tierCode?: string | null;
  tierCashbackRate?: number | null;
}

export interface CounterLoyaltyOutcome {
  billAmount: number;
  pointsUsed: number;
  totalDue: number;
  cashbackRate: number;
  pointsEarned: number;
  eligibleForCashback: boolean;
  reasonIfNoCashback?: string;
}

/**
 * Pure domain calculation for Counter Phone Loyalty:
 * - Deducts points at the counter (`pointsUsed`) up to `min(availableMemberPoints, billAmount)`.
 * - Rule: Any order that deducts wallet points (`pointsUsed > 0`) MUST NOT earn cashback (`pointsEarned = 0`).
 * - When `pointsUsed === 0` and `totalDue > 0`, credits `%` cashback according to the member's tier (`3%`, `5%`, `7%`, `10%`).
 */
export function calculateCounterLoyaltyOutcome(input: CounterLoyaltyInput): CounterLoyaltyOutcome {
  const billAmount = Math.max(0, Math.floor(Number(input.billAmount) || 0));
  const available = Math.max(0, Math.floor(Number(input.availableMemberPoints) || 0));
  const requested = Math.max(0, Math.floor(Number(input.pointsRequested) || 0));
  const pointsUsed = Math.min(requested, available, billAmount);
  const totalDue = Math.max(0, billAmount - pointsUsed);
  const cashbackRate = resolveTierCashbackRate(input.tierCode, input.tierCashbackRate);

  if (pointsUsed > 0) {
    return {
      billAmount,
      pointsUsed,
      totalDue,
      cashbackRate,
      pointsEarned: 0,
      eligibleForCashback: false,
      reasonIfNoCashback: 'Đơn hàng có trừ tiền tích lũy tại quầy nên không tích điểm mới.',
    };
  }

  if (totalDue <= 0) {
    return {
      billAmount,
      pointsUsed: 0,
      totalDue: 0,
      cashbackRate,
      pointsEarned: 0,
      eligibleForCashback: false,
      reasonIfNoCashback: 'Giá trị thanh toán bằng 0đ nên không phát sinh điểm tích lũy.',
    };
  }

  const pointsEarned = Math.floor((totalDue * cashbackRate) / 100);
  return {
    billAmount,
    pointsUsed: 0,
    totalDue,
    cashbackRate,
    pointsEarned,
    eligibleForCashback: true,
  };
}

