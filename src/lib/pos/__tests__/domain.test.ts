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
  normalizeFulfillmentStatus,
  validateFulfillmentTransition,
  calculateOrderWaitStatus,
  validateShippingFeeInput,
  validateMenuProductInput,
  validateHoldCartInput,
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

describe('M01 V2 Multi-channel POS, Fulfillment, Menu & Print Extensions', () => {
  it('normalizes fulfillment status across explicit values and order statuses', () => {
    assert.equal(normalizeFulfillmentStatus('READY', 'PENDING', 'POS'), 'READY');
    assert.equal(normalizeFulfillmentStatus(null, 'CANCELLED', 'WEB'), 'CANCELLED');
    assert.equal(normalizeFulfillmentStatus(undefined, 'PENDING', 'WEB'), 'PENDING');
    assert.equal(normalizeFulfillmentStatus('COMPLETED', 'CONFIRMED', 'POS'), 'COMPLETED');
  });

  it('enforces forward-only fulfillment status transitions and terminal locks', () => {
    assert.equal(validateFulfillmentTransition('PENDING', 'PREPARING').valid, true);
    assert.equal(validateFulfillmentTransition('PREPARING', 'READY').valid, true);
    assert.equal(validateFulfillmentTransition('READY', 'COMPLETED').valid, true);

    assert.equal(validateFulfillmentTransition('READY', 'PREPARING').valid, false);
    assert.equal(validateFulfillmentTransition('COMPLETED', 'PENDING').valid, false);
    assert.equal(validateFulfillmentTransition('CANCELLED', 'PREPARING').valid, false);
  });

  it('calculates SLA wait timers for active and terminal orders', () => {
    const now = new Date('2026-10-29T10:30:00.000Z');
    const twoMinsAgo = '2026-10-29T10:28:00.000Z';
    const thirtyMinsAgo = '2026-10-29T10:00:00.000Z';

    const fresh = calculateOrderWaitStatus(twoMinsAgo, 'PREPARING', now);
    assert.equal(fresh.elapsedMinutes, 2);
    assert.equal(fresh.slaLevel, 'NORMAL');
    assert.ok(fresh.label.length > 0);

    const overdue = calculateOrderWaitStatus(thirtyMinsAgo, 'PENDING', now);
    assert.equal(overdue.elapsedMinutes, 30);
    assert.equal(overdue.slaLevel, 'OVERDUE');

    const terminal = calculateOrderWaitStatus(thirtyMinsAgo, 'COMPLETED', now);
    assert.equal(terminal.slaLevel, 'NORMAL');
  });

  it('validates delivery shipping fee input', () => {
    const zeroFee = validateShippingFeeInput(0);
    assert.equal(zeroFee.valid, true);
    assert.equal(zeroFee.shippingFee, 0);

    const parsedString = validateShippingFeeInput('25000');
    assert.equal(parsedString.valid, true);
    assert.equal(parsedString.shippingFee, 25000);

    const negativeFee = validateShippingFeeInput(-5000);
    assert.equal(negativeFee.valid, false);

    const invalidText = validateShippingFeeInput('abc');
    assert.equal(invalidText.valid, false);
  });

  it('validates menu product payload for admin CRUD', () => {
    const validProduct = validateMenuProductInput({
      name: 'Cold Brew Muối V2',
      categorySlug: 'cold-brew',
      sizes: [
        { label: 'M', price: 35000 },
        { label: 'L', price: 42000 },
      ],
      isSignature: true,
      shelfLife: '48 giờ',
      description: 'Cà phê ủ lạnh kem muối đậm vị',
    });
    assert.equal(validProduct.valid, true, validProduct.error);

    assert.equal(
      validateMenuProductInput({
        name: '   ',
        categorySlug: 'cold-brew',
        sizes: [{ label: 'M', price: 35000 }],
      }).valid,
      false
    );

    assert.equal(
      validateMenuProductInput({
        name: 'Trà Sữa',
        categorySlug: 'cold-brew',
        sizes: [],
      }).valid,
      false
    );

    assert.equal(
      validateMenuProductInput({
        name: 'Trà Sữa',
        categorySlug: 'cold-brew',
        sizes: [{ label: 'M', price: -1000 }],
      }).valid,
      false
    );
  });

  it('validates hold/park cart capacity rules', () => {
    assert.equal(validateHoldCartInput(2, 0).valid, true);
    assert.equal(validateHoldCartInput(0, 0).valid, false);
    assert.equal(validateHoldCartInput(2, 10, 10).valid, false);
  });

  it('round-trips M01 V2 fulfillment, delivery shipping and linked Web order metadata', () => {
    const serialized = serializePosFallbackNote({
      channel: 'POS',
      orderType: 'DELIVERY',
      fulfillmentStatus: 'READY',
      paymentMethod: 'BANK_TRANSFER',
      paymentStatus: 'PAID',
      discountAmount: 0,
      discountPercent: 0,
      shippingFee: 15000,
      amountReceived: 95000,
      changeDue: 0,
      customerName: 'Chị Hương',
      customerPhone: '0909333444',
      customerAddress: '12 Nguyễn Huệ, Q1',
      linkedOrderId: 'web-ord-123',
      linkedOrderCode: 'WEB-261029-0005',
      cashierName: 'Thu ngân Quầy 1',
      userNote: 'Ít đá',
    });

    const extracted = extractPosOrderMetadata({
      order_code: 'POS-261029-0018',
      status: 'CONFIRMED',
      total_due: 95000,
      shipping_fee: 15000,
      note: serialized,
    });

    assert.equal(extracted.orderType, 'DELIVERY');
    assert.equal(extracted.fulfillmentStatus, 'READY');
    assert.equal(extracted.shippingFee, 15000);
    assert.equal(extracted.customerAddress, '12 Nguyễn Huệ, Q1');
    assert.equal(extracted.linkedOrderId, 'web-ord-123');
    assert.equal(extracted.linkedOrderCode, 'WEB-261029-0005');
    assert.equal(extracted.userNote, 'Ít đá');
  });

  it('renders PrintLocationMeta, delivery address and shipping fee into ticket and receipt HTML', () => {
    const deliveryOrder = {
      id: 'ord-v2-1',
      orderCode: 'POS-261029-0021',
      status: 'CONFIRMED' as const,
      channel: 'POS' as const,
      orderType: 'DELIVERY' as const,
      fulfillmentStatus: 'PREPARING' as const,
      paymentMethod: 'CASH' as const,
      paymentStatus: 'PAID' as const,
      subtotal: 80000,
      discountAmount: 0,
      discountPercent: 0,
      pointsUsed: 0,
      shippingFee: 15000,
      totalDue: 95000,
      amountReceived: 100000,
      changeDue: 5000,
      customerName: 'Anh Khoa',
      customerPhone: '0909555666',
      customerAddress: '45 Lê Lợi, Q1',
      cashierName: 'Thu ngân B',
      note: 'Giao cổng trước',
      createdAt: '2026-10-29T09:15:00.000Z',
      items: [
        {
          productName: 'Cold Brew Cam Sả',
          sizeLabel: 'L',
          quantity: 1,
          unitPrice: 80000,
          subtotal: 80000,
          optionsSummary: '70% đường, Ít đá',
        },
      ],
    };

    const locMeta = {
      locationName: 'Ủ LAB Chi nhánh Thảo Điền',
      address: '88 Xuân Thủy, TP. Thủ Đức',
      phone: '028 3899 1234',
      receiptFooter: 'Hẹn gặp lại quý khách tại Ủ LAB!',
    };

    const ticketHtml = buildBaristaTicketHtml(deliveryOrder, locMeta);
    assert.match(ticketHtml, /Cold Brew Cam Sả/);
    assert.match(ticketHtml, /Thảo Điền/);

    const receiptHtml = buildCustomerReceiptHtml(deliveryOrder, '', locMeta);
    assert.match(receiptHtml, /88 Xuân Thủy, TP\. Thủ Đức/);
    assert.match(receiptHtml, /028 3899 1234/);
    assert.match(receiptHtml, /Hẹn gặp lại quý khách tại Ủ LAB!/);
    assert.match(receiptHtml, /45 Lê Lợi, Q1/);
    assert.match(receiptHtml, /15\.000/);
  });
});
