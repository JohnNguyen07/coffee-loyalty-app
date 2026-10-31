import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateRevenueSummary,
  calculateDenominationsTotal,
  calculateCashbookSummary,
  calculateShiftReconciliation,
  calculateBestSellers,
  calculateHourlySales,
  getDateRangeBoundaries,
  normalizePaymentMethod,
  type RawOrderForRevenue,
  type CashTransaction,
} from '../domain';

describe('M02 Revenue & Cash Reconciliation Domain Logic', () => {
  it('distinguishes order revenue, total collected, refunds, and cash variance', () => {
    const sampleOrders: RawOrderForRevenue[] = [
      // 1. Order 1: Paid CASH 80k (subtotal 90k, discount 10k)
      {
        id: 'ord-1',
        order_code: 'POS-261029-0001',
        status: 'CONFIRMED',
        subtotal: 90000,
        discount_amount: 10000,
        points_used: 0,
        total_due: 80000,
        payment_method: 'CASH',
        created_at: '2026-10-29T02:00:00Z',
        items: [
          { product_name: 'Cold Brew Cam Sả', size: 'M', quantity: 2, subtotal: 90000 },
        ],
      },
      // 2. Order 2: Paid BANK_TRANSFER 60k (subtotal 70k, points 10k)
      {
        id: 'ord-2',
        order_code: 'POS-261029-0002',
        status: 'CONFIRMED',
        subtotal: 70000,
        discount_amount: 0,
        points_used: 10000,
        total_due: 60000,
        payment_method: 'BANK_TRANSFER',
        created_at: '2026-10-29T02:30:00Z',
        items: [
          { product_name: 'Matcha Fuji MK4', size: 'L', quantity: 1, subtotal: 70000 },
        ],
      },
      // 3. Order 3: Cancelled CASH order 40k (refunded cash to customer)
      {
        id: 'ord-3',
        order_code: 'POS-261029-0003',
        status: 'CANCELLED',
        subtotal: 40000,
        discount_amount: 0,
        points_used: 5000,
        total_due: 40000,
        payment_method: 'CASH',
        created_at: '2026-10-29T03:00:00Z',
      },
      // 4. Order 4: Pending web order 50k (not yet confirmed)
      {
        id: 'ord-4',
        order_code: 'CF-0004',
        status: 'PENDING',
        subtotal: 50000,
        discount_amount: 0,
        points_used: 0,
        total_due: 50000,
        payment_method: 'CASH',
        created_at: '2026-10-29T03:15:00Z',
      },
    ];

    const result = calculateRevenueSummary(sampleOrders, {
      openingCash: 500000, // 500,000đ tiền thối đầu ca
      actualCashCounted: 535000, // Kiểm đếm cuối ca: 535,000đ
      cashPayouts: 5000, // Chi mua đá: 5,000đ
    });

    // 1. Core 4 Metrics matching dashboard cards
    assert.equal(result.metrics.paidOrderRevenue, 140000); // 80k + 60k
    assert.equal(result.metrics.orderCount, 2);            // 2 paid orders
    assert.equal(result.metrics.actualCash, 535000);       // Tiền mặt thực tế kiểm đếm
    assert.equal(result.metrics.bankTransferAmount, 60000);// 60k chuyển khoản

    // 2. Order Revenue (Net Sales)
    assert.equal(result.orderRevenue.grossSales, 160000);   // 90k + 70k
    assert.equal(result.orderRevenue.discounts, 10000);     // 10k discount
    assert.equal(result.orderRevenue.pointsDiscount, 10000);// 10k points used
    assert.equal(result.orderRevenue.netRevenue, 140000);
    assert.equal(result.orderRevenue.averageOrderValue, 70000);

    // 3. Collection Breakdown
    assert.equal(result.collection.cashCollected, 80000);
    assert.equal(result.collection.bankTransferCollected, 60000);
    assert.equal(result.collection.totalCollected, 140000);

    // 4. Refunds Breakdown
    assert.equal(result.refunds.totalRefunded, 40000);
    assert.equal(result.refunds.cashRefunded, 40000);
    assert.equal(result.refunds.pointsRefunded, 5000);
    assert.equal(result.refunds.cancelledOrderCount, 1);

    // 5. Cash Reconciliation & Variance
    assert.equal(result.cashReconciliation.expectedCash, 535000);
    assert.equal(result.cashReconciliation.actualCash, 535000);
    assert.equal(result.cashReconciliation.cashVariance, 0);
    assert.equal(result.cashReconciliation.varianceStatus, 'BALANCED');

    // 6. Best Sellers & Hourly Sales
    assert.equal(result.bestSellers.length, 2);
    assert.equal(result.bestSellers[0].productName, 'Cold Brew Cam Sả');
    assert.equal(result.bestSellers[0].quantitySold, 2);
  });

  it('correctly calculates cash shortage and surplus', () => {
    const orders: RawOrderForRevenue[] = [
      {
        id: '1',
        order_code: 'POS-01',
        status: 'CONFIRMED',
        subtotal: 100000,
        total_due: 100000,
        points_used: 0,
        payment_method: 'CASH',
        created_at: '2026-10-29T00:00:00Z',
      },
    ];

    // Case 1: Shortage (expected 100k, actual 90k -> -10k)
    const shortage = calculateRevenueSummary(orders, {
      openingCash: 0,
      actualCashCounted: 90000,
    });
    assert.equal(shortage.cashReconciliation.expectedCash, 100000);
    assert.equal(shortage.cashReconciliation.actualCash, 90000);
    assert.equal(shortage.cashReconciliation.cashVariance, -10000);
    assert.equal(shortage.cashReconciliation.varianceStatus, 'SHORTAGE');

    // Case 2: Surplus (expected 100k, actual 110k -> +10k)
    const surplus = calculateRevenueSummary(orders, {
      openingCash: 0,
      actualCashCounted: 110000,
    });
    assert.equal(surplus.cashReconciliation.cashVariance, 10000);
    assert.equal(surplus.cashReconciliation.varianceStatus, 'SURPLUS');
  });

  it('calculates cash denominations total accurately', () => {
    // 2 tờ 500k, 3 tờ 200k, 5 tờ 50k, 10 tờ 10k
    // 2*500k = 1,000,000 + 3*200k = 600,000 + 5*50k = 250,000 + 10*10k = 100,000 = 1,950,000đ
    const total = calculateDenominationsTotal({
      '500k': 2,
      '200k': 3,
      '50k': 5,
      '10k': 10,
    });
    assert.equal(total, 1950000);
  });

  it('calculates cashbook ledger running balance and categories correctly', () => {
    const openingBalance = 500000; // 500k đầu kỳ
    const txs: CashTransaction[] = [
      {
        id: '1',
        code: 'PC-01',
        type: 'PAYMENT',
        category: 'RAW_MATERIAL',
        amount: 30000, // Chi mua đá bi
        paymentMethod: 'CASH',
        recipientPayer: 'Chú Tư đá',
        createdByName: 'Thu ngân',
        createdAt: '2026-10-29T08:00:00Z',
      },
      {
        id: '2',
        code: 'PT-01',
        type: 'RECEIPT',
        category: 'OPENING_FLOAT',
        amount: 200000, // Quản lý rót thêm tiền thối
        paymentMethod: 'CASH',
        recipientPayer: 'Quản lý',
        createdByName: 'Thu ngân',
        createdAt: '2026-10-29T09:00:00Z',
      },
      {
        id: '3',
        code: 'PC-02',
        type: 'PAYMENT',
        category: 'PACKAGING',
        amount: 50000, // Mua thêm bao bì ly
        paymentMethod: 'CASH',
        recipientPayer: 'Đại lý bao bì',
        createdByName: 'Thu ngân',
        createdAt: '2026-10-29T10:00:00Z',
      },
    ];

    const book = calculateCashbookSummary(openingBalance, txs);
    // Total in = 200,000
    assert.equal(book.totalIn, 200000);
    // Total out = 30k + 50k = 80,000
    assert.equal(book.totalOut, 80000);
    // Closing balance = 500k + 200k - 80k = 620,000
    assert.equal(book.closingBalance, 620000);

    // Category breakdown
    assert.equal(book.categoryBreakdown['RAW_MATERIAL'], 30000);
    assert.equal(book.categoryBreakdown['PACKAGING'], 50000);
  });

  it('calculates shift reconciliation and cash handover correctly', () => {
    const shift = calculateShiftReconciliation({
      openingCash: 500000,  // 500k thối ban đầu
      cashSales: 1200000,   // Bán được 1.2M
      cashRefunds: 50000,   // Hoàn trả 50k
      cashIn: 0,
      cashOut: 30000,       // Chi mua đá 30k
      actualCash: 1620000,  // Đếm được 1.62M
      cashRetained: 500000, // Giữ lại 500k cho ca sau
    });

    // Expected = 500k + 1.2M - 50k - 30k = 1,620,000đ
    assert.equal(shift.expectedCash, 1620000);
    assert.equal(shift.cashVariance, 0);
    assert.equal(shift.varianceStatus, 'BALANCED');
    // Handed over = 1.62M - 500k = 1,120,000đ
    assert.equal(shift.cashHandedOver, 1120000);
  });

  it('normalizes payment methods correctly', () => {
    assert.equal(normalizePaymentMethod('cash'), 'CASH');
    assert.equal(normalizePaymentMethod('BANK_TRANSFER'), 'BANK_TRANSFER');
    assert.equal(normalizePaymentMethod('QR'), 'BANK_TRANSFER');
    assert.equal(normalizePaymentMethod('EWALLET'), 'EWALLET');
    assert.equal(normalizePaymentMethod(undefined), 'CASH');
  });

  it('generates date range boundaries accurately', () => {
    const refDate = new Date('2026-10-29T10:00:00+07:00');
    const today = getDateRangeBoundaries('TODAY', undefined, undefined, refDate);
    assert.equal(today.label, 'Hôm nay');
    assert.ok(today.from.startsWith('2026-10-28T17:00:00'));

    const last7 = getDateRangeBoundaries('LAST_7_DAYS', undefined, undefined, refDate);
    assert.equal(last7.label, '7 ngày qua');

    const custom = getDateRangeBoundaries('CUSTOM', '2026-10-01', '2026-10-15', refDate);
    assert.equal(custom.label, '2026-10-01 đến 2026-10-15');
  });
});
