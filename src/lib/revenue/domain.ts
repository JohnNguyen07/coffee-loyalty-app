export type DateRangePreset = 'TODAY' | 'YESTERDAY' | 'LAST_7_DAYS' | 'THIS_MONTH' | 'CUSTOM';
export type VarianceStatus = 'BALANCED' | 'SURPLUS' | 'SHORTAGE';

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

export interface RevenueSummaryResult {
  metrics: RevenueMetricCardData;
  orderRevenue: OrderRevenueBreakdown;
  collection: PaymentCollectionBreakdown;
  refunds: RefundBreakdown;
  cashReconciliation: CashReconciliationBreakdown;
  totalOrdersPlaced: number;
  completedOrdersCount: number;
  pendingOrdersCount: number;
  cancelledOrdersCount: number;
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

      // If order was cancelled after being collected or marked, record refund amount
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
  // Convert now to Vietnam day parts
  const vnOffsetMs = 7 * 60 * 60 * 1000;
  const vnDate = new Date(now.getTime() + vnOffsetMs);
  const year = vnDate.getUTCFullYear();
  const month = vnDate.getUTCMonth();
  const date = vnDate.getUTCDate();

  const createIsoUtcFromVnDate = (y: number, m: number, d: number, hour: number, min: number, sec: number, ms: number) => {
    // Return UTC ISO string matching VN local time
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
      // fallback to today if invalid
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
