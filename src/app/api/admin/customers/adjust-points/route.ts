import { createAdminClient } from '@/lib/supabase/admin';
import { verifyAdmin, verifyPosStaff } from '@/lib/auth-utils';
import { resolveTierCashbackRate } from '@/lib/pos/domain';
import { NextRequest, NextResponse } from 'next/server';

// POST /api/admin/customers/adjust-points
// Counter Phone Loyalty:
// - Authorized for CASHIER (POS), MANAGER, ADMIN, OWNER (blocks INVENTORY_STAFF & unauthenticated users).
// - DEDUCT: Deduct points directly at counter (`pointsUsed > 0` -> 0 cashback earned).
// - EARN_BY_BILL / ADD: Credit cashback automatically by member's tier % (`3%`, `5%`, `7%`, `10%`) from billAmount,
//   strictly enforcing that any order/bill with points deducted (`pointsUsed > 0` or existing ORDER_DEDUCT) cannot earn points.
export async function POST(request: NextRequest) {
  try {
    const staff = await verifyPosStaff();
    const admin = staff || (await verifyAdmin());
    if (!admin || (staff && staff.staffRole === 'INVENTORY_STAFF')) {
      return NextResponse.json({ error: 'Không có quyền thực hiện tích/trừ điểm tại quầy' }, { status: 403 });
    }

    const adminClient = createAdminClient();
    const body = await request.json();
    const {
      userId,
      phone,
      action,
      amount,
      billAmount,
      pointsUsed,
      reason,
      orderCode,
    } = body;

    if (!['DEDUCT', 'ADD', 'EARN_BY_BILL'].includes(action)) {
      return NextResponse.json(
        { error: 'Hành động không hợp lệ (DEDUCT, EARN_BY_BILL hoặc ADD)' },
        { status: 400 }
      );
    }

    // 1. Locate customer (with tier info)
    let query = adminClient
      .from('users')
      .select(
        'id, full_name, phone, point_balance, total_spending, current_tier_id, upgraded_to_silver, upgraded_to_gold, upgraded_to_diamond, tier:tiers(id, code, name, cashback_rate)'
      );
    const cleanPhone = phone ? String(phone).replace(/[\s\-()]/g, '') : '';
    if (userId) {
      query = query.eq('id', userId);
    } else if (cleanPhone) {
      query = query.eq('phone', cleanPhone);
    } else {
      return NextResponse.json(
        { error: 'Cần cung cấp mã ID hoặc số điện thoại khách hàng' },
        { status: 400 }
      );
    }

    const { data: rawCustomer, error: fetchErr } = await query.maybeSingle();

    if (fetchErr || !rawCustomer) {
      return NextResponse.json(
        { error: `Không tìm thấy khách hàng với SĐT/ID: ${cleanPhone || userId}` },
        { status: 404 }
      );
    }

    const rawTier = Array.isArray(rawCustomer.tier) ? rawCustomer.tier[0] : rawCustomer.tier;
    const customerTier = (rawTier as { id: string; code: string; name: string; cashback_rate: number } | null) || null;
    const tierRate = resolveTierCashbackRate(customerTier?.code, Number(customerTier?.cashback_rate));
    const tierName = customerTier?.name || 'Member';
    const currentBalance = Number(rawCustomer.point_balance) || 0;
    const currentSpending = Number(rawCustomer.total_spending) || 0;
    const cleanOrderCode = orderCode ? String(orderCode).trim() : '';

    // ============================================================
    // CASE A: TRỪ ĐIỂM TẠI QUẦY (DEDUCT)
    // Rule: Đơn nào trừ tiền thì đơn đó KHÔNG tích điểm (pointsEarned = 0)
    // ============================================================
    if (action === 'DEDUCT') {
      const deductAmount = Math.floor(Number(amount) || 0);
      const parsedBill = Math.floor(Number(billAmount) || 0);

      if (deductAmount <= 0) {
        return NextResponse.json({ error: 'Số điểm cần trừ phải lớn hơn 0' }, { status: 400 });
      }

      if (currentBalance < deductAmount) {
        return NextResponse.json(
          {
            error: `Số dư điểm không đủ! Khách hiện có ${currentBalance.toLocaleString('vi-VN')}đ, không thể trừ ${deductAmount.toLocaleString('vi-VN')}đ.`,
            currentBalance,
          },
          { status: 400 }
        );
      }

      if (parsedBill > 0 && deductAmount > parsedBill) {
        return NextResponse.json(
          {
            error: `Số điểm trừ (${deductAmount.toLocaleString('vi-VN')}đ) không được vượt quá giá trị đơn hàng (${parsedBill.toLocaleString('vi-VN')}đ).`,
          },
          { status: 400 }
        );
      }

      const newBalance = currentBalance - deductAmount;
      const cashRemaining = parsedBill > 0 ? Math.max(0, parsedBill - deductAmount) : 0;
      const newSpending = parsedBill > 0 ? currentSpending + cashRemaining : currentSpending;
      const refId = cleanOrderCode || `POS-DEDUCT-${Date.now().toString(36).toUpperCase()}`;
      const txDescription =
        reason ||
        `Trừ điểm tại quầy POS${cleanOrderCode ? ` cho đơn #${cleanOrderCode}` : ''}${
          parsedBill > 0
            ? ` (Đơn ${parsedBill.toLocaleString('vi-VN')}đ - Trừ ví ${deductAmount.toLocaleString('vi-VN')}đ - Không tích điểm mới)`
            : ' (Đơn trừ tiền không tích điểm mới)'
        }`;

      const { error: updateErr } = await adminClient
        .from('users')
        .update({
          point_balance: newBalance,
          total_spending: newSpending,
          updated_at: new Date().toISOString(),
        })
        .eq('id', rawCustomer.id);

      if (updateErr) {
        return NextResponse.json({ error: 'Lỗi cập nhật số dư điểm của khách' }, { status: 500 });
      }

      const { data: tx } = await adminClient
        .from('point_transactions')
        .insert({
          user_id: rawCustomer.id,
          type: 'ORDER_DEDUCT',
          amount: -deductAmount,
          balance_after: newBalance,
          reference_id: refId,
          description: txDescription,
        })
        .select()
        .single();

      return NextResponse.json({
        success: true,
        action: 'DEDUCT',
        pointsUsed: deductAmount,
        pointsEarned: 0,
        message: `Đã trừ tại quầy ${deductAmount.toLocaleString('vi-VN')}đ từ ví khách ${rawCustomer.full_name || rawCustomer.phone}. (Đơn có trừ tiền nên không tích điểm mới)`,
        customer: {
          id: rawCustomer.id,
          full_name: rawCustomer.full_name,
          phone: rawCustomer.phone,
          tier_name: tierName,
          cashback_rate: tierRate,
          previous_balance: currentBalance,
          point_balance: newBalance,
          total_spending: newSpending,
        },
        transaction: tx,
      });
    }

    // ============================================================
    // CASE B: CỘNG ĐIỂM TẠI QUẦY THEO % HẠNG THẺ (EARN_BY_BILL / ADD)
    // Rule: Đơn nào có trừ tiền (pointsUsed > 0 hoặc đã có ORDER_DEDUCT) thì tuyệt đối KHÔNG tích điểm!
    // ============================================================
    if (Number(pointsUsed) > 0) {
      return NextResponse.json(
        {
          error: 'Đơn hàng có áp dụng trừ tiền tích lũy tại quầy nên không được tích điểm mới!',
        },
        { status: 400 }
      );
    }

    // If orderCode is provided, check DB to ensure this order did NOT deduct points and was not already credited
    if (cleanOrderCode) {
      const { data: orderRow } = await adminClient
        .from('orders')
        .select('id, order_code, points_used, total_due, status')
        .eq('order_code', cleanOrderCode)
        .maybeSingle();

      if (orderRow && Number(orderRow.points_used) > 0) {
        return NextResponse.json(
          {
            error: `Đơn #${cleanOrderCode} đã sử dụng trừ tiền tích lũy (-${Number(orderRow.points_used).toLocaleString('vi-VN')}đ) nên không được tích điểm!`,
          },
          { status: 400 }
        );
      }

      const { data: existingOrderTxs } = await adminClient
        .from('point_transactions')
        .select('id, type, amount')
        .eq('reference_id', cleanOrderCode);

      if (existingOrderTxs && existingOrderTxs.some((t) => t.type === 'ORDER_DEDUCT' || Number(t.amount) < 0)) {
        return NextResponse.json(
          {
            error: `Đơn #${cleanOrderCode} đã có giao dịch trừ tiền tích lũy nên không được tích điểm mới!`,
          },
          { status: 400 }
        );
      }

      if (existingOrderTxs && existingOrderTxs.some((t) => t.type === 'CASHBACK' && Number(t.amount) > 0)) {
        return NextResponse.json(
          {
            error: `Đơn #${cleanOrderCode} đã được cộng tích điểm trước đó!`,
          },
          { status: 400 }
        );
      }
    }

    const parsedBillAmount = Math.floor(Number(billAmount) || 0);
    const isBillBased = action === 'EARN_BY_BILL' || parsedBillAmount > 0;
    const pointsToCredit = isBillBased
      ? Math.floor((parsedBillAmount * tierRate) / 100)
      : Math.floor(Number(amount) || 0);

    if (pointsToCredit <= 0) {
      return NextResponse.json(
        {
          error: isBillBased
            ? 'Giá trị hóa đơn quá nhỏ hoặc không hợp lệ để tính điểm hoàn.'
            : 'Số điểm cộng phải lớn hơn 0.',
        },
        { status: 400 }
      );
    }

    const newSpending = isBillBased ? currentSpending + parsedBillAmount : currentSpending;
    let newBalance = currentBalance + pointsToCredit;
    let newTierId = rawCustomer.current_tier_id;
    let newTierName = tierName;
    let tierBonus = 0;
    const tierFlagUpdates: Record<string, boolean> = {};

    if (isBillBased) {
      const { data: allTiers } = await adminClient
        .from('tiers')
        .select('id, code, name, min_spending')
        .order('min_spending', { ascending: false });

      if (allTiers && allTiers.length > 0) {
        for (const t of allTiers) {
          if (newSpending >= Number(t.min_spending)) {
            if (t.id !== rawCustomer.current_tier_id) {
              newTierId = t.id;
              newTierName = t.name;
              if (t.code === 'SILVER' && !rawCustomer.upgraded_to_silver) {
                tierBonus = 100000;
                tierFlagUpdates.upgraded_to_silver = true;
              } else if (t.code === 'GOLD' && !rawCustomer.upgraded_to_gold) {
                tierBonus = 200000;
                tierFlagUpdates.upgraded_to_gold = true;
              } else if (t.code === 'DIAMOND' && !rawCustomer.upgraded_to_diamond) {
                tierBonus = 45000;
                tierFlagUpdates.upgraded_to_diamond = true;
              }
              newBalance += tierBonus;
            }
            break;
          }
        }
      }
    }

    const refId = cleanOrderCode || `POS-${Date.now().toString(36).toUpperCase()}`;
    const txDescription =
      reason ||
      (isBillBased
        ? `Tích điểm tại quầy (${tierRate}% hạng ${tierName}) cho đơn ${parsedBillAmount.toLocaleString('vi-VN')}đ${cleanOrderCode ? ` (#${cleanOrderCode})` : ''}`
        : `Cộng điểm tại quầy POS${cleanOrderCode ? ` (#${cleanOrderCode})` : ''}`);

    const { data: tx } = await adminClient
      .from('point_transactions')
      .insert({
        user_id: rawCustomer.id,
        type: 'CASHBACK',
        amount: pointsToCredit,
        balance_after: newBalance - tierBonus,
        reference_id: refId,
        description: txDescription,
      })
      .select()
      .single();

    if (tierBonus > 0) {
      await adminClient.from('point_transactions').insert({
        user_id: rawCustomer.id,
        type: 'TIER_UP_BONUS',
        amount: tierBonus,
        balance_after: newBalance,
        reference_id: newTierName,
        description: `Thưởng thăng hạng ${newTierName} ✨`,
      });
    }

    const { error: updateErr } = await adminClient
      .from('users')
      .update({
        point_balance: newBalance,
        total_spending: newSpending,
        ...(newTierId ? { current_tier_id: newTierId } : {}),
        ...tierFlagUpdates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', rawCustomer.id);

    if (updateErr) {
      return NextResponse.json({ error: 'Lỗi cập nhật số dư điểm của khách' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      action: isBillBased ? 'EARN_BY_BILL' : 'ADD',
      billAmount: parsedBillAmount || undefined,
      cashbackRate: tierRate,
      pointsUsed: 0,
      pointsEarned: pointsToCredit,
      tierBonus,
      message: isBillBased
        ? `Đã cộng +${pointsToCredit.toLocaleString('vi-VN')}đ (${tierRate}% hạng ${tierName} trên đơn ${parsedBillAmount.toLocaleString('vi-VN')}đ) cho khách ${rawCustomer.full_name || rawCustomer.phone}${tierBonus > 0 ? ` + Thưởng lên hạng ${newTierName} +${tierBonus.toLocaleString('vi-VN')}đ!` : ''}`
        : `Đã cộng thành công +${pointsToCredit.toLocaleString('vi-VN')}đ điểm cho khách ${rawCustomer.full_name || rawCustomer.phone}`,
      customer: {
        id: rawCustomer.id,
        full_name: rawCustomer.full_name,
        phone: rawCustomer.phone,
        tier_name: newTierName,
        cashback_rate: tierRate,
        previous_balance: currentBalance,
        point_balance: newBalance,
        total_spending: newSpending,
      },
      transaction: tx,
    });
  } catch (err: unknown) {
    console.error('Adjust points error:', err);
    return NextResponse.json({ error: 'Lỗi xử lý điểm khách hàng tại quầy' }, { status: 500 });
  }
}
