import { createAdminClient } from '@/lib/supabase/admin';
import { verifyAdmin } from '@/lib/auth-utils';
import { NextRequest, NextResponse } from 'next/server';

// POST /api/admin/customers/adjust-points
// Deduct or add points for a customer by userId or phone number
export async function POST(request: NextRequest) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 403 });
    }

    const adminClient = createAdminClient();
    const body = await request.json();
    const { userId, phone, action, amount, reason, orderCode } = body;

    const numAmount = parseInt(amount, 10);
    if (!numAmount || numAmount <= 0) {
      return NextResponse.json({ error: 'Số điểm phải lớn hơn 0' }, { status: 400 });
    }

    if (!['DEDUCT', 'ADD'].includes(action)) {
      return NextResponse.json({ error: 'Hành động không hợp lệ (DEDUCT hoặc ADD)' }, { status: 400 });
    }

    // 1. Locate customer
    let query = adminClient.from('users').select('id, full_name, phone, point_balance, total_spending');
    if (userId) {
      query = query.eq('id', userId);
    } else if (phone) {
      query = query.eq('phone', phone.trim());
    } else {
      return NextResponse.json({ error: 'Cần cung cấp mã ID hoặc số điện thoại khách hàng' }, { status: 400 });
    }

    const { data: customer, error: fetchErr } = await query.maybeSingle();

    if (fetchErr || !customer) {
      return NextResponse.json({ error: `Không tìm thấy khách hàng với thông tin: ${phone || userId}` }, { status: 404 });
    }

    const currentBalance = customer.point_balance || 0;

    // 2. Validate balance when deducting
    if (action === 'DEDUCT' && currentBalance < numAmount) {
      return NextResponse.json({
        error: `Số dư điểm không đủ! Khách hiện có ${currentBalance.toLocaleString('vi-VN')}đ, không thể trừ ${numAmount.toLocaleString('vi-VN')}đ.`,
        currentBalance,
      }, { status: 400 });
    }

    const newBalance = action === 'DEDUCT' ? (currentBalance - numAmount) : (currentBalance + numAmount);
    const txAmount = action === 'DEDUCT' ? -numAmount : numAmount;
    const txType = action === 'DEDUCT' ? 'ORDER_DEDUCT' : 'CASHBACK';
    const txDescription = reason || (action === 'DEDUCT' 
      ? `Trừ điểm tại quầy POS áp vào đơn hàng ${orderCode || ''}`.trim()
      : `Cộng điểm thủ công tại quầy POS ${orderCode || ''}`.trim());

    // 3. Update user balance
    const { error: updateErr } = await adminClient
      .from('users')
      .update({ point_balance: newBalance })
      .eq('id', customer.id);

    if (updateErr) {
      console.error('Update balance error:', updateErr);
      return NextResponse.json({ error: 'Lỗi cập nhật số dư điểm của khách' }, { status: 500 });
    }

    // 4. Record transaction in point_transactions
    const { data: tx, error: txErr } = await adminClient
      .from('point_transactions')
      .insert({
        user_id: customer.id,
        type: txType,
        amount: txAmount,
        balance_after: newBalance,
        reference_id: orderCode || `POS-${Date.now().toString(36).toUpperCase()}`,
        description: txDescription,
      })
      .select()
      .single();

    if (txErr) {
      console.warn('Point transaction insert warning:', txErr);
    }

    return NextResponse.json({
      success: true,
      message: action === 'DEDUCT' 
        ? `Đã trừ thành công ${numAmount.toLocaleString('vi-VN')}đ điểm của khách ${customer.full_name || customer.phone}`
        : `Đã cộng thành công ${numAmount.toLocaleString('vi-VN')}đ điểm cho khách ${customer.full_name || customer.phone}`,
      customer: {
        id: customer.id,
        full_name: customer.full_name,
        phone: customer.phone,
        previous_balance: currentBalance,
        point_balance: newBalance,
      },
      transaction: tx,
    });
  } catch (err: any) {
    console.error('Adjust points error:', err);
    return NextResponse.json({ error: 'Lỗi xử lý điểm khách hàng' }, { status: 500 });
  }
}
