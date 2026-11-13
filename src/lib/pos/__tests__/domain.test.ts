import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePosOrderTotals,
  validateDiscountPermission,
  validatePosOrderCancel,
  generatePosOrderCode,
  serializePosFallbackNote,
  extractPosOrderMetadata,
  calculateCounterLoyaltyOutcome,
  resolveTierCashbackRate,
} from '../domain';
import { buildBaristaTicketHtml, buildCustomerReceiptHtml } from '../print-templates';

describe('M01 POS Domain Logic', () => {
  it('calculates cart subtotal, size price, and addons accurately using server catalog', () => {
    const result = calculatePosOrderTotals({
      items: [
        {
          itemId: 'cold-brew-cam-sa',
          productName: 'Cold Brew Cam Sả',
          sizeLabel: 'L', // 40,000đ in catalog
          quantity: 2,
          options: {
            sweetness: '70% đường',
            ice: 'Ít đá',
            addons: ['kem-beo'], // +5,000đ
          },
          itemNote: 'Khuấy đều',
        },
        {
          itemId: 'pure-black-cold-brew',
          productName: 'Pure Black Cold Brew',
          sizeLabel: 'Chai', // 70,000đ
          quantity: 1,
        },
      ],
      paymentMethod: 'CASH',
      amountReceived: 200000,
      staffRole: 'CASHIER',
    });

    assert.equal(result.validation.valid, true);
    assert.equal(result.totals.totalQuantity, 3);
    // (40,000 + 5,000) * 2 + 70,000 = 90,000 + 70,000 = 160,000
    assert.equal(result.totals.subtotal, 160000);
    assert.equal(result.totals.totalDue, 160000);
    assert.equal(result.totals.changeDue, 40000);
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
          sizeLabel: 'M', // 40,000đ
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

  it('correctly prices Cold Brew Chanh Vang Chai at 75.000đ without colliding with Cup size M 30.000đ', () => {
    // 1. Bottled version with sizeLabel Chai and id cold-brew-chanh-vang-chai
    const bottleResult = calculatePosOrderTotals({
      items: [
        {
          itemId: 'cold-brew-chanh-vang-chai',
          productName: 'Cold Brew Chanh Vàng',
          sizeLabel: 'Chai',
          quantity: 1,
        },
      ],
      paymentMethod: 'CASH',
      amountReceived: 100000,
      staffRole: 'CASHIER',
    });
    assert.equal(bottleResult.validation.valid, true);
    assert.equal(bottleResult.totals.items[0].unitPrice, 75000);
    assert.equal(bottleResult.totals.items[0].sizeLabel, 'Chai');
    assert.equal(bottleResult.totals.subtotal, 75000);

    // 2. Resilient resolution: even if itemId was loosely cold-brew-chanh-vang but size is Chai
    const resilientBottleResult = calculatePosOrderTotals({
      items: [
        {
          itemId: 'cold-brew-chanh-vang',
          productName: 'Cold Brew Chanh Vàng',
          sizeLabel: 'Chai',
          quantity: 2,
          unitPriceOverride: 75000,
        },
      ],
      paymentMethod: 'CASH',
      amountReceived: 200000,
      staffRole: 'CASHIER',
    });
    assert.equal(resilientBottleResult.validation.valid, true);
    assert.equal(resilientBottleResult.totals.items[0].unitPrice, 75000);
    assert.equal(resilientBottleResult.totals.items[0].sizeLabel, 'Chai');
    assert.equal(resilientBottleResult.totals.subtotal, 150000);

    // 3. Cup version size M (30,000đ) and size L (35,000đ)
    const cupResult = calculatePosOrderTotals({
      items: [
        {
          itemId: 'cold-brew-chanh-vang',
          productName: 'Cold Brew Chanh Vàng',
          sizeLabel: 'M',
          quantity: 1,
        },
        {
          itemId: 'cold-brew-chanh-vang',
          productName: 'Cold Brew Chanh Vàng',
          sizeLabel: 'L',
          quantity: 1,
        },
      ],
      paymentMethod: 'CASH',
      amountReceived: 100000,
      staffRole: 'CASHIER',
    });
    assert.equal(cupResult.validation.valid, true);
    assert.equal(cupResult.totals.items[0].unitPrice, 30000);
    assert.equal(cupResult.totals.items[1].unitPrice, 35000);
    assert.equal(cupResult.totals.subtotal, 65000);
  });

  it('includes Strawberry Matcha, Matcha Kem Béo, and new Cold Brew items in POS catalog accurately', () => {
    const res = calculatePosOrderTotals({
      items: [
        {
          itemId: 'strawberry-matcha',
          productName: 'Strawberry Matcha',
          sizeLabel: 'M',
          quantity: 1,
          options: {
            addons: ['sua-oat', '1g-matcha-fuji'], // 0đ + 5,000đ
          },
        },
        {
          itemId: 'matcha-kem-beo',
          productName: 'Matcha Kem Béo',
          sizeLabel: 'M',
          quantity: 1,
        },
        {
          itemId: 'cold-brew-dau-tam',
          productName: 'Cold Brew Dâu Tằm',
          sizeLabel: 'M',
          quantity: 1,
        },
        {
          itemId: 'cold-brew-strawberry',
          productName: 'Cold Brew Strawberry',
          sizeLabel: 'L',
          quantity: 1,
        },
        {
          itemId: 'cold-brew-buoi-hong',
          productName: 'Cold Brew Bưởi Hồng',
          sizeLabel: 'M',
          quantity: 1,
        },
        {
          itemId: 'cold-brew-vai',
          productName: 'Cold Brew Vải',
          sizeLabel: 'M',
          quantity: 1,
        },
        {
          itemId: 'cold-brew-vai',
          productName: 'Cold Brew Vải',
          sizeLabel: 'L',
          quantity: 1,
        },
        {
          itemId: 'pure-black-cold-brew',
          productName: 'Pure Black Cold Brew',
          sizeLabel: 'Chai',
          quantity: 1,
        },
      ],
      paymentMethod: 'CASH',
      amountReceived: 400000,
      staffRole: 'CASHIER',
    });

    assert.equal(res.validation.valid, true);
    assert.equal(res.totals.items[0].productName, 'Strawberry Matcha');
    assert.equal(res.totals.items[0].unitPrice, 50000); // 45,000 + 5,000
    assert.equal(res.totals.items[1].productName, 'Matcha Kem Béo');
    assert.equal(res.totals.items[1].unitPrice, 45000);
    assert.equal(res.totals.items[2].unitPrice, 35000);
    assert.equal(res.totals.items[3].unitPrice, 40000);
    assert.equal(res.totals.items[4].unitPrice, 35000);
    assert.equal(res.totals.items[5].productName, 'Cold Brew Vải');
    assert.equal(res.totals.items[5].unitPrice, 35000);
    assert.equal(res.totals.items[6].unitPrice, 40000);
    assert.equal(res.totals.items[7].productName, 'Pure Black Cold Brew');
    assert.equal(res.totals.items[7].unitPrice, 70000);
    assert.equal(res.totals.subtotal, 350000);
  });

  it('calculates Counter Phone Loyalty cashback accurately by member tier % (3%, 5%, 7%, 10%) when no points are deducted', () => {
    assert.equal(resolveTierCashbackRate('MEMBER'), 3);
    assert.equal(resolveTierCashbackRate('SILVER'), 5);
    assert.equal(resolveTierCashbackRate('GOLD'), 7);
    assert.equal(resolveTierCashbackRate('DIAMOND'), 10);

    // Member (3%) buying 100.000đ -> +3.000đ
    const memberRes = calculateCounterLoyaltyOutcome({
      billAmount: 100000,
      pointsRequested: 0,
      availableMemberPoints: 20000,
      tierCode: 'MEMBER',
    });
    assert.equal(memberRes.pointsUsed, 0);
    assert.equal(memberRes.totalDue, 100000);
    assert.equal(memberRes.cashbackRate, 3);
    assert.equal(memberRes.pointsEarned, 3000);
    assert.equal(memberRes.eligibleForCashback, true);

    // Silver (5%) buying 80.000đ -> +4.000đ
    const silverRes = calculateCounterLoyaltyOutcome({
      billAmount: 80000,
      pointsRequested: 0,
      availableMemberPoints: 50000,
      tierCode: 'SILVER',
    });
    assert.equal(silverRes.pointsEarned, 4000);
    assert.equal(silverRes.eligibleForCashback, true);

    // Gold (7%) buying 90.000đ -> +6.300đ
    const goldRes = calculateCounterLoyaltyOutcome({
      billAmount: 90000,
      pointsRequested: 0,
      availableMemberPoints: 50000,
      tierCode: 'GOLD',
    });
    assert.equal(goldRes.pointsEarned, 6300);
    assert.equal(goldRes.eligibleForCashback, true);

    // Diamond (10%) buying 45.000đ -> +4.500đ
    const diamondRes = calculateCounterLoyaltyOutcome({
      billAmount: 45000,
      pointsRequested: 0,
      availableMemberPoints: 100000,
      tierCode: 'DIAMOND',
    });
    assert.equal(diamondRes.pointsEarned, 4500);
    assert.equal(diamondRes.eligibleForCashback, true);
  });

  it('strictly enforces rule: any order that deducts points at counter (pointsUsed > 0) earns 0 cashback points', () => {
    // Customer has 25.000đ in wallet, buys 45.000đ drink, deducts 15.000đ at counter
    const deductPartial = calculateCounterLoyaltyOutcome({
      billAmount: 45000,
      pointsRequested: 15000,
      availableMemberPoints: 25000,
      tierCode: 'GOLD', // Even Gold 7% earns 0 when deducting points!
    });
    assert.equal(deductPartial.pointsUsed, 15000);
    assert.equal(deductPartial.totalDue, 30000);
    assert.equal(deductPartial.pointsEarned, 0);
    assert.equal(deductPartial.eligibleForCashback, false);
    assert.match(deductPartial.reasonIfNoCashback || '', /không tích điểm/);

    // Customer has 50.000đ in wallet, buys 40.000đ drink, deducts full 40.000đ
    const deductFull = calculateCounterLoyaltyOutcome({
      billAmount: 40000,
      pointsRequested: 50000, // Capped at billAmount (40.000đ)
      availableMemberPoints: 50000,
      tierCode: 'DIAMOND',
    });
    assert.equal(deductFull.pointsUsed, 40000);
    assert.equal(deductFull.totalDue, 0);
    assert.equal(deductFull.pointsEarned, 0);
    assert.equal(deductFull.eligibleForCashback, false);
  });
});
