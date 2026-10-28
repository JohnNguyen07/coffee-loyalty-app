import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePosOrderTotals,
  validateDiscountPermission,
  validatePosOrderCancel,
  generatePosOrderCode,
  serializePosFallbackNote,
  extractPosOrderMetadata,
} from '../domain';
import { buildBaristaTicketHtml, buildCustomerReceiptHtml } from '../print-templates';

describe('M01 POS Domain Logic', () => {
  it('calculates cart subtotal, size price, and addons accurately using server catalog', () => {
    const result = calculatePosOrderTotals({
      items: [
        {
          itemId: 'cold-brew-cam-sa',
          productName: 'Cold Brew Cam Sả',
          sizeLabel: 'L', // 39,000đ in catalog
          quantity: 2,
          options: {
            sweetness: '70% đường',
            ice: 'Ít đá',
            addons: ['kem-muoi'], // +7,000đ
          },
          itemNote: 'Khuấy đều',
        },
        {
          itemId: 'pure-black-cold-brew',
          productName: 'Pure Black Cold Brew',
          sizeLabel: 'Chai', // 69,000đ
          quantity: 1,
        },
      ],
      paymentMethod: 'CASH',
      amountReceived: 200000,
      staffRole: 'CASHIER',
    });

    assert.equal(result.validation.valid, true);
    assert.equal(result.totals.totalQuantity, 3);
    // (39,000 + 7,000) * 2 + 69,000 = 92,000 + 69,000 = 161,000
    assert.equal(result.totals.subtotal, 161000);
    assert.equal(result.totals.totalDue, 161000);
    assert.equal(result.totals.changeDue, 39000);
  });

  it('enforces role-based discount limits for CASHIER vs MANAGER/ADMIN', () => {
    // Cashier tries 20% discount -> rejected (max 10% and 20k)
    const cashierAttempt = validateDiscountPermission(
      150000,
      { type: 'PERCENT', value: 20, reason: 'Khách VIP' },
      'CASHIER'
    );
    assert.equal(cashierAttempt.valid, false);
    assert.match(cashierAttempt.error || '', /Thu ngân/);

    // Cashier applies 10% discount on 150,000đ (15,000đ <= 20,000đ) with reason -> allowed
    const cashierValid = validateDiscountPermission(
      150000,
      { type: 'PERCENT', value: 10, reason: 'Ưu đãi giờ vàng' },
      'CASHIER'
    );
    assert.equal(cashierValid.valid, true);
    assert.equal(cashierValid.discountAmount, 15000);

    // Manager applies 25% discount on 150,000đ with reason -> allowed
    const managerValid = validateDiscountPermission(
      150000,
      { type: 'PERCENT', value: 25, reason: 'Quản lý duyệt voucher' },
      'MANAGER'
    );
    assert.equal(managerValid.valid, true);
    assert.equal(managerValid.discountAmount, 37500);

    // Missing reason when discount > 0 -> rejected
    const missingReason = validateDiscountPermission(
      100000,
      { type: 'FIXED', value: 10000, reason: '' },
      'ADMIN'
    );
    assert.equal(missingReason.valid, false);
  });

  it('rejects cash payment when amountReceived is less than totalDue', () => {
    const res = calculatePosOrderTotals({
      items: [
        {
          itemId: 'matcha-latte',
          productName: 'Matcha Latte',
          sizeLabel: 'M', // 34,000đ
          quantity: 1,
        },
      ],
      paymentMethod: 'CASH',
      amountReceived: 20000,
      staffRole: 'ADMIN',
    });

    assert.equal(res.validation.valid, false);
    assert.match(res.validation.error || '', /nhỏ hơn tổng cần thu/);
  });

  it('generates POS order code within VARCHAR(20) limit', () => {
    const code = generatePosOrderCode(new Date('2026-10-29T08:00:00Z'), 42);
    assert.equal(code, 'POS-261029-0042');
    assert.ok(code.length <= 20);
  });

  it('validates role-based order cancellation and requires audit reason', () => {
    // Missing reason -> rejected
    const noReason = validatePosOrderCancel({
      currentStatus: 'CONFIRMED',
      staffRole: 'ADMIN',
      cancelReason: '',
    });
    assert.equal(noReason.valid, false);

    // Cashier trying to cancel confirmed/paid order -> rejected
    const cashierCancelPaid = validatePosOrderCancel({
      currentStatus: 'CONFIRMED',
      staffRole: 'CASHIER',
      cancelReason: 'Khách đổi món',
    });
    assert.equal(cashierCancelPaid.valid, false);

    // Admin/Manager cancelling confirmed order with reason -> allowed
    const adminCancelPaid = validatePosOrderCancel({
      currentStatus: 'CONFIRMED',
      staffRole: 'ADMIN',
      cancelReason: 'Khách đổi món, tạo lại đơn mới',
    });
    assert.equal(adminCancelPaid.valid, true);
  });

  it('serializes and extracts POS fallback metadata losslessly', () => {
    const serialized = serializePosFallbackNote({
      channel: 'POS',
      orderType: 'TAKEAWAY',
      paymentMethod: 'BANK_TRANSFER',
      paymentStatus: 'PAID',
      discountAmount: 10000,
      discountPercent: 10,
      discountReason: 'Ưu đãi khai trương',
      amountReceived: 90000,
      changeDue: 0,
      customerName: 'Chị Lan',
      customerPhone: '0909111222',
      cashierName: 'Admin Ủ LAB',
      userNote: 'Giao liền tại quầy',
    });

    const extracted = extractPosOrderMetadata({
      order_code: 'POS-261029-0001',
      status: 'CONFIRMED',
      total_due: 90000,
      note: serialized,
    });

    assert.equal(extracted.channel, 'POS');
    assert.equal(extracted.paymentMethod, 'BANK_TRANSFER');
    assert.equal(extracted.discountAmount, 10000);
    assert.equal(extracted.customerName, 'Chị Lan');
    assert.equal(extracted.userNote, 'Giao liền tại quầy');
  });

  it('builds barista cup tickets and customer receipt HTML with all order details', () => {
    const sampleOrder = {
      id: 'ord-1',
      orderCode: 'POS-261029-0009',
      status: 'CONFIRMED' as const,
      channel: 'POS' as const,
      orderType: 'TAKEAWAY' as const,
      paymentMethod: 'CASH' as const,
      paymentStatus: 'PAID' as const,
      subtotal: 80000,
      discountAmount: 8000,
      discountPercent: 10,
      discountReason: 'Giờ vàng',
      pointsUsed: 0,
      totalDue: 72000,
      amountReceived: 100000,
      changeDue: 28000,
      customerName: 'Anh Minh',
      customerPhone: '0909888777',
      cashierName: 'Quản trị viên Ủ LAB',
      note: 'Ít ngọt',
      createdAt: '2026-10-29T03:30:00.000Z',
      items: [
        {
          productName: 'Cold Brew Cam Sả',
          sizeLabel: 'L',
          quantity: 2,
          unitPrice: 40000,
          subtotal: 80000,
          optionsSummary: '70% đường · Ít đá',
        },
      ],
    };

    const barHtml = buildBaristaTicketHtml(sampleOrder);
    assert.match(barHtml, /#POS-261029-0009/);
    assert.match(barHtml, /Ly 1\/2/);
    assert.match(barHtml, /Ly 2\/2/);
    assert.match(barHtml, /70% đường · Ít đá/);

    const receiptHtml = buildCustomerReceiptHtml(sampleOrder);
    assert.match(receiptHtml, /Biên Nhận Thanh Toán/);
    assert.match(receiptHtml, /72\.000đ/);
    assert.match(receiptHtml, /28\.000đ/);
  });
});
