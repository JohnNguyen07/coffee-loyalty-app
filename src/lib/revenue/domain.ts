export type DateRangePreset = 'TODAY' | 'YESTERDAY' | 'LAST_7_DAYS' | 'THIS_MONTH' | 'CUSTOM';
export type VarianceStatus = 'BALANCED' | 'SURPLUS' | 'SHORTAGE';

export interface RawOrderItem {
  product_name?: string;
  size?: string;
  quantity?: number;
  subtotal?: number;
  unit_price?: number;
}

export interface RawOrderForRevenue {
  id: string;
  order_code: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
  subtotal: number;
  total_due: number;
  points_used: number;
  discount_amount?: number;
  payment_method?: string;
  amount_received?: number;
  change_due?: number;
  channel?: string;
  created_at: string;
  customer_name?: string;
  customer_phone?: string;
  cancel_reason?: string;
  note?: string;
  items?: RawOrderItem[];
}

export interface CashReconciliationInput {
  openingCash: number;
  actualCashCounted?: number;
  cashPayouts?: number; // Tiền mặt chi khẩn cấp tại quầy
}

export interface RevenueMetricCardData {
  paidOrderRevenue: number;     // Doanh thu đơn đã thanh toán (VND)
  orderCount: number;           // Số đơn hàng (Đơn)
  actualCash: number;           // Tiền mặt thực tế (VND)
  bankTransferAmount: number;   // Chuyển khoản (VND)
}

export interface OrderRevenueBreakdown {
  grossSales: number;           // Doanh thu gộp (tổng subtotal)
  discounts: number;            // Giảm giá trực tiếp
  pointsDiscount: number;       // Giảm giá qua trừ điểm ví
  netRevenue: number;           // Doanh thu thuần = Doanh thu đơn đã thanh toán
  averageOrderValue: number;    // Giá trị trung bình / đơn (AOV)
}

export interface PaymentCollectionBreakdown {
  cashCollected: number;        // Tiền mặt đã thu
  bankTransferCollected: number;// Chuyển khoản QR ngân hàng
  ewalletCollected: number;     // Ví điện tử
  totalCollected: number;       // Tổng tiền thực tế đã thu
}

export interface RefundBreakdown {
  totalRefunded: number;        // Tổng tiền hoàn lại do đơn hủy
  cashRefunded: number;         // Tiền mặt hoàn lại
  bankTransferRefunded: number; // Chuyển khoản hoàn lại
  pointsRefunded: number;       // Điểm ví hoàn lại
  cancelledOrderCount: number;  // Số đơn bị hủy
}

export interface CashReconciliationBreakdown {
  openingCash: number;          // Tiền thối đầu ca
  cashSales: number;            // Tiền mặt thu từ đơn hàng
  cashRefunds: number;          // Tiền mặt hoàn cho đơn hủy
  cashPayouts: number;          // Tiền mặt chi ra tại quầy
  expectedCash: number;         // Tiền mặt lý thuyết trong két
  actualCash: number;           // Tiền mặt thực tế kiểm đếm
  cashVariance: number;         // Chênh lệch (actual - expected)
  varianceStatus: VarianceStatus;
}

export interface BestSellerItem {
  productName: string;
  categoryName: string;
  quantitySold: number;
  totalRevenue: number;
}

export interface HourlySalesBucket {
  hourLabel: string;
  orderCount: number;
  revenue: number;
}

export interface RevenueSummaryResult {
  metrics: RevenueMetricCardData;
  orderRevenue: OrderRevenueBreakdown;
  collection: PaymentCollectionBreakdown;
  refunds: RefundBreakdown;
  cashReconciliation: CashReconciliationBreakdown;
  bestSellers: BestSellerItem[];
  hourlySales: HourlySalesBucket[];
  totalOrdersPlaced: number;
  completedOrdersCount: number;
  pendingOrdersCount: number;
  cancelledOrdersCount: number;
}

// ── Vietnamese Denominations for Cash Drawer Count ──
export type DenominationKey = '500k' | '200k' | '100k' | '50k' | '20k' | '10k' | '5k' | '2k' | '1k';

export const DENOMINATION_VALUES: Record<DenominationKey, number> = {
  '500k': 500000,
  '200k': 200000,
  '100k': 100000,
  '50k': 50000,
  '20k': 20000,
  '10k': 10000,
  '5k': 5000,
  '2k': 2000,
  '1k': 1000,
};

export function calculateDenominationsTotal(counts: Partial<Record<DenominationKey, number>>): number {
  let total = 0;
  for (const [key, val] of Object.entries(counts)) {
    const denom = DENOMINATION_VALUES[key as DenominationKey];
    if (denom && typeof val === 'number' && val > 0) {
      total += denom * Math.floor(val);
    }
  }
  return total;
}

// ── Cash Transactions & Cashbook (Sổ Quỹ) ──
export type CashTransactionType = 'RECEIPT' | 'PAYMENT';

export type CashTransactionCategory =
  | 'RAW_MATERIAL'     // Mua đá bi, sữa, chanh sả, nguyên liệu khẩn cấp
  | 'PACKAGING'        // Ly, nắp, ống hút, túi chữ T
  | 'UTILITIES'        // Tiền điện, nước, rác, internet, gửi xe
  | 'SALARY_ADVANCE'   // Tạm ứng lương nhân viên
  | 'SHIPPING'         // Tiền trả shipper ngoài
  | 'BANK_DEPOSIT'     // Rút tiền két nộp vào tài khoản ngân hàng (chuyển quỹ)
  | 'OPENING_FLOAT'    // Rót tiền thối đầu ca từ chủ quán
  | 'OTHER';           // Chi phí khác

export const CASH_CATEGORY_LABELS: Record<CashTransactionCategory, string> = {
  RAW_MATERIAL: 'Nguyên liệu mua ngoài (Đá, sữa, chanh...)',
  PACKAGING: 'Bao bì & Công cụ (Ly, ống hút, túi...)',
  UTILITIES: 'Sinh hoạt & Tiện ích (Điện, nước, rác, xe...)',
  SALARY_ADVANCE: 'Tạm ứng lương nhân viên',
  SHIPPING: 'Chi phí giao hàng (Shipper ngoài)',
  BANK_DEPOSIT: 'Nộp tiền vào ngân hàng (Chuyển quỹ)',
  OPENING_FLOAT: 'Nạp tiền thối quầy (Rót quỹ)',
  OTHER: 'Chi phí khác',
};

export interface CashTransaction {
  id: string;
  code: string;
  shiftId?: string | null;
  type: CashTransactionType;
  category: CashTransactionCategory;
  amount: number;
  paymentMethod: 'CASH' | 'BANK_TRANSFER';
  recipientPayer: string;
  notes?: string;
  createdByName: string;
  createdAt: string;
  runningBalance?: number;
}

export interface CashbookSummary {
  openingBalance: number;
  totalIn: number;
  totalOut: number;
  closingBalance: number;
  transactions: CashTransaction[];
  categoryBreakdown: Record<string, number>;
}

export function calculateCashbookSummary(
  openingBalance: number,
  transactions: CashTransaction[]
): CashbookSummary {
  let totalIn = 0;
  let totalOut = 0;
  let currentBalance = Math.max(0, openingBalance);

  // Sort chronologically ascending to calculate running balance
  const sorted = [...transactions].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const categoryBreakdown: Record<string, number> = {};

  const withRunning = sorted.map((tx) => {
    if (tx.type === 'RECEIPT') {
      totalIn += tx.amount;
      currentBalance += tx.amount;
    } else {
      totalOut += tx.amount;
      currentBalance -= tx.amount;
      categoryBreakdown[tx.category] = (categoryBreakdown[tx.category] || 0) + tx.amount;
    }
    return {
      ...tx,
      runningBalance: currentBalance,
    };
  });

  // Reverse back to newest first for display
  withRunning.reverse();

  return {
    openingBalance,
    totalIn,
    totalOut,
    closingBalance: currentBalance,
    transactions: withRunning,
    categoryBreakdown,
  };
}

// ── Shift Session (Quản lý ca bán hàng) ──
export interface ShiftSession {
  id: string;
  code: string;
  shiftName: string;
  status: 'OPEN' | 'CLOSED';
  openedAt: string;
  closedAt?: string | null;
  openedByName: string;
  closedByName?: string | null;
  openingCash: number;
  cashSales: number;
  cashRefunds: number;
  cashIn: number;
  cashOut: number;
  expectedCash: number;
  actualCash?: number | null;
  cashVariance?: number;
  varianceStatus?: VarianceStatus;
  cashRetained?: number;
  cashHandedOver?: number;
  notes?: string | null;
  denominations?: Partial<Record<DenominationKey, number>>;
}

export function calculateShiftReconciliation(params: {
  openingCash: number;
  cashSales: number;
  cashRefunds: number;
  cashIn: number;
  cashOut: number;
  actualCash: number;
  cashRetained?: number;
}): {
  expectedCash: number;
  cashVariance: number;
  varianceStatus: VarianceStatus;
  cashHandedOver: number;
} {
  const opening = Math.max(0, params.openingCash);
  const sales = Math.max(0, params.cashSales);
  const refunds = Math.max(0, params.cashRefunds);
  const cin = Math.max(0, params.cashIn);
  const cout = Math.max(0, params.cashOut);
  const actual = Math.max(0, params.actualCash);

  const expectedCash = opening + sales - refunds + cin - cout;
  const cashVariance = actual - expectedCash;
  const varianceStatus: VarianceStatus =
    cashVariance === 0 ? 'BALANCED' : cashVariance > 0 ? 'SURPLUS' : 'SHORTAGE';

  const retained = Math.max(0, params.cashRetained || 0);
  const cashHandedOver = Math.max(0, actual - retained);

  return {
    expectedCash,
    cashVariance,
    varianceStatus,
    cashHandedOver,
  };
}

/**
 * Normalizes payment method string.
 */
export function normalizePaymentMethod(method?: string): 'CASH' | 'BANK_TRANSFER' | 'EWALLET' {
  const m = String(method || '').toUpperCase();
  if (m === 'BANK_TRANSFER' || m === 'TRANSFER' || m === 'QR') return 'BANK_TRANSFER';
  if (m === 'EWALLET' || m === 'WALLET') return 'EWALLET';
  return 'CASH';
}

/**
 * Calculates Best Sellers ranking.
 */
export function calculateBestSellers(orders: RawOrderForRevenue[], limit = 8): BestSellerItem[] {
  const map = new Map<string, { quantity: number; revenue: number; category: string }>();

  for (const ord of orders) {
    if (ord.status !== 'CONFIRMED') continue;
    const items = ord.items || [];
    for (const it of items) {
      const rawName = String(it.product_name || 'Món');
      const cleanName = rawName.replace(/\s*\[.*\]$/, '');
      const qty = Number(it.quantity) || 1;
      const subtotal = Number(it.subtotal) || (Number(it.unit_price || 0) * qty) || 0;

      let cat = 'Khác';
      const lower = cleanName.toLowerCase();
      if (lower.includes('cam sả') || lower.includes('chanh vàng') || lower.includes('cold brew')) {
        cat = 'Cold Brew';
      } else if (lower.includes('matcha')) {
        cat = 'Matcha Fuji';
      } else if (lower.includes('chai')) {
        cat = 'Đóng Chai';
      } else if (lower.includes('cà phê') || lower.includes('espresso') || lower.includes('latte')) {
        cat = 'Pha Máy';
      }

      const existing = map.get(cleanName) || { quantity: 0, revenue: 0, category: cat };
      existing.quantity += qty;
      existing.revenue += subtotal;
      map.set(cleanName, existing);
    }
  }

  const list: BestSellerItem[] = Array.from(map.entries()).map(([name, data]) => ({
    productName: name,
    categoryName: data.category,
    quantitySold: data.quantity,
    totalRevenue: data.revenue,
  }));

  list.sort((a, b) => b.totalRevenue - a.totalRevenue);
  return list.slice(0, limit);
}

/**
 * Calculates hourly sales from 06:00 to 22:00.
 */
export function calculateHourlySales(orders: RawOrderForRevenue[]): HourlySalesBucket[] {
  const hours = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];
  const map = new Map<number, { count: number; rev: number }>();
  hours.forEach((h) => map.set(h, { count: 0, rev: 0 }));

  for (const ord of orders) {
    if (ord.status !== 'CONFIRMED') continue;
    const d = new Date(ord.created_at);
    // Convert to VN hour (+7 UTC)
    const vnHour = (d.getUTCHours() + 7) % 24;
    if (map.has(vnHour)) {
      const curr = map.get(vnHour)!;
      curr.count++;
      curr.rev += ord.total_due;
    }
  }

  return hours.map((h) => ({
    hourLabel: `${String(h).padStart(2, '0')}:00`,
    orderCount: map.get(h)?.count || 0,
    revenue: map.get(h)?.rev || 0,
  }));
}

/**
 * Calculates complete revenue metrics, distinguishing order revenue, cash collected, refunds, and cash variance.
 */
export function calculateRevenueSummary(
  orders: RawOrderForRevenue[],
  cashInput: CashReconciliationInput = { openingCash: 0 }
): RevenueSummaryResult {
  let grossSales = 0;
  let discounts = 0;
  let pointsDiscount = 0;
  let netRevenue = 0;
  let completedOrdersCount = 0;
  let pendingOrdersCount = 0;
  let cancelledOrdersCount = 0;

  let cashCollected = 0;
  let bankTransferCollected = 0;
  let ewalletCollected = 0;

  let cashRefunded = 0;
  let bankTransferRefunded = 0;
  let pointsRefunded = 0;

  for (const ord of orders) {
    const subtotal = Math.max(0, Number(ord.subtotal) || 0);
    const totalDue = Math.max(0, Number(ord.total_due) || 0);
    const pointsUsed = Math.max(0, Number(ord.points_used) || 0);
    const discountAmount = Math.max(0, Number(ord.discount_amount) || 0);
    const method = normalizePaymentMethod(ord.payment_method);

    if (ord.status === 'CONFIRMED') {
      completedOrdersCount++;
      grossSales += subtotal;
      discounts += discountAmount;
      pointsDiscount += pointsUsed;
      netRevenue += totalDue;

      if (method === 'CASH') {
        cashCollected += totalDue;
      } else if (method === 'BANK_TRANSFER') {
        bankTransferCollected += totalDue;
      } else if (method === 'EWALLET') {
        ewalletCollected += totalDue;
      }
    } else if (ord.status === 'PENDING') {
      pendingOrdersCount++;
    } else if (ord.status === 'CANCELLED') {
      cancelledOrdersCount++;
      pointsRefunded += pointsUsed;

      if (totalDue > 0) {
        if (method === 'CASH') {
          cashRefunded += totalDue;
        } else {
          bankTransferRefunded += totalDue;
        }
      }
    }
  }

  const totalCollected = cashCollected + bankTransferCollected + ewalletCollected;
  const totalRefunded = cashRefunded + bankTransferRefunded;
  const averageOrderValue = completedOrdersCount > 0 ? Math.round(netRevenue / completedOrdersCount) : 0;

  // Cash Reconciliation & Drawer Variance calculation
  const openingCash = Math.max(0, Math.floor(cashInput.openingCash || 0));
  const cashPayouts = Math.max(0, Math.floor(cashInput.cashPayouts || 0));
  const expectedCash = openingCash + cashCollected - cashRefunded - cashPayouts;

  const actualCash =
    cashInput.actualCashCounted !== undefined && cashInput.actualCashCounted !== null
      ? Math.max(0, Math.floor(cashInput.actualCashCounted))
      : expectedCash;

  const cashVariance = actualCash - expectedCash;
  const varianceStatus: VarianceStatus =
    cashVariance === 0 ? 'BALANCED' : cashVariance > 0 ? 'SURPLUS' : 'SHORTAGE';

  const bestSellers = calculateBestSellers(orders);
  const hourlySales = calculateHourlySales(orders);

  return {
    metrics: {
      paidOrderRevenue: netRevenue,
      orderCount: completedOrdersCount,
      actualCash,
      bankTransferAmount: bankTransferCollected + ewalletCollected,
    },
    orderRevenue: {
      grossSales,
      discounts,
      pointsDiscount,
      netRevenue,
      averageOrderValue,
    },
    collection: {
      cashCollected,
      bankTransferCollected,
      ewalletCollected,
      totalCollected,
    },
    refunds: {
      totalRefunded,
      cashRefunded,
      bankTransferRefunded,
      pointsRefunded,
      cancelledOrderCount: cancelledOrdersCount,
    },
    cashReconciliation: {
      openingCash,
      cashSales: cashCollected,
      cashRefunds: cashRefunded,
      cashPayouts,
      expectedCash,
      actualCash,
      cashVariance,
      varianceStatus,
    },
    bestSellers,
    hourlySales,
    totalOrdersPlaced: orders.length,
    completedOrdersCount,
    pendingOrdersCount,
    cancelledOrdersCount,
  };
}

/**
 * Returns ISO date strings for a given date range preset in Vietnam timezone (UTC+7).
 */
export function getDateRangeBoundaries(
  preset: DateRangePreset,
  customFrom?: string,
  customTo?: string,
  now: Date = new Date()
): { from: string; to: string; label: string } {
  const vnOffsetMs = 7 * 60 * 60 * 1000;
  const vnDate = new Date(now.getTime() + vnOffsetMs);
  const year = vnDate.getUTCFullYear();
  const month = vnDate.getUTCMonth();
  const date = vnDate.getUTCDate();

  const createIsoUtcFromVnDate = (y: number, m: number, d: number, hour: number, min: number, sec: number, ms: number) => {
    const localMs = Date.UTC(y, m, d, hour, min, sec, ms);
    return new Date(localMs - vnOffsetMs).toISOString();
  };

  switch (preset) {
    case 'YESTERDAY': {
      const yesterday = date - 1;
      return {
        from: createIsoUtcFromVnDate(year, month, yesterday, 0, 0, 0, 0),
        to: createIsoUtcFromVnDate(year, month, yesterday, 23, 59, 59, 999),
        label: 'Hôm qua',
      };
    }
    case 'LAST_7_DAYS': {
      return {
        from: createIsoUtcFromVnDate(year, month, date - 6, 0, 0, 0, 0),
        to: createIsoUtcFromVnDate(year, month, date, 23, 59, 59, 999),
        label: '7 ngày qua',
      };
    }
    case 'THIS_MONTH': {
      return {
        from: createIsoUtcFromVnDate(year, month, 1, 0, 0, 0, 0),
        to: createIsoUtcFromVnDate(year, month, date, 23, 59, 59, 999),
        label: 'Tháng này',
      };
    }
    case 'CUSTOM': {
      if (customFrom && customTo && /^\d{4}-\d{2}-\d{2}$/.test(customFrom) && /^\d{4}-\d{2}-\d{2}$/.test(customTo)) {
        const [fy, fm, fd] = customFrom.split('-').map(Number);
        const [ty, tm, td] = customTo.split('-').map(Number);
        return {
          from: createIsoUtcFromVnDate(fy, fm - 1, fd, 0, 0, 0, 0),
          to: createIsoUtcFromVnDate(ty, tm - 1, td, 23, 59, 59, 999),
          label: `${customFrom} đến ${customTo}`,
        };
      }
      return {
        from: createIsoUtcFromVnDate(year, month, date, 0, 0, 0, 0),
        to: createIsoUtcFromVnDate(year, month, date, 23, 59, 59, 999),
        label: 'Hôm nay',
      };
    }
    case 'TODAY':
    default: {
      return {
        from: createIsoUtcFromVnDate(year, month, date, 0, 0, 0, 0),
        to: createIsoUtcFromVnDate(year, month, date, 23, 59, 59, 999),
        label: 'Hôm nay',
      };
    }
  }
}
