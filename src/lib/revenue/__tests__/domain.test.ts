import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateRevenueSummary,
  getDateRangeBoundaries,
  normalizePaymentMethod,
  type RawOrderForRevenue,
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
    // Expected cash = 500k (opening) + 80k (cash sales) - 40k (cash refund) - 5k (payout) = 535,000đ
    assert.equal(result.cashReconciliation.expectedCash, 535000);
    assert.equal(result.cashReconciliation.actualCash, 535000);
    assert.equal(result.cashReconciliation.cashVariance, 0);
    assert.equal(result.cashReconciliation.varianceStatus, 'BALANCED');
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
    assert.ok(today.from.startsWith('2026-10-28T17:00:00')); // 00:00 VN = 17:00 UTC previous day

    const last7 = getDateRangeBoundaries('LAST_7_DAYS', undefined, undefined, refDate);
    assert.equal(last7.label, '7 ngày qua');

    const custom = getDateRangeBoundaries('CUSTOM', '2026-10-01', '2026-10-15', refDate);
    assert.equal(custom.label, '2026-10-01 đến 2026-10-15');
  });
});

