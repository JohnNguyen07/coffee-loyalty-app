import { createAdminClient } from '@/lib/supabase/admin';
import { verifyAdmin, verifyPosStaff } from '@/lib/auth-utils';
import { NextRequest, NextResponse } from 'next/server';
import { cancelPosOrder } from '@/lib/pos/repository';

// PATCH /api/orders/[id] — Update order status and payment (admin/cashier)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const staff = await verifyPosStaff();
  const admin = staff || (await verifyAdmin());
  if (!admin) {
    return NextResponse.json({ error: 'Không có quyền thực hiện thao tác' }, { status: 403 });
  }

  const body = await request.json();
  const { action, payment_method, shipping_fee, cancel_reason } = body; // 'confirm' | 'cancel' | 'mark_paid' | 'update_shipping'

  if (!['confirm', 'cancel', 'mark_paid', 'update_shipping'].includes(action)) {
    return NextResponse.json({ error: 'Hành động không hợp lệ' }, { status: 400 });
  }

  const adminClient = createAdminClient();

  if (action === 'update_shipping') {
    const fee = Math.max(0, Number(shipping_fee) || 0);

    const { data: currentOrder } = await adminClient
      .from('orders')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (!currentOrder) {
      return NextResponse.json({ error: 'Không tìm thấy đơn hàng' }, { status: 404 });
    }

    const subtotal = Number(currentOrder.subtotal) || 0;
    const pointsUsed = Number(currentOrder.points_used) || 0;
    const newTotalDue = Math.max(0, subtotal + fee - pointsUsed);

    const existingNote = String(currentOrder.note || '');
    let updatedNote = existingNote;
    const shipTag = `[Phí ship: ${fee.toLocaleString('vi-VN')}đ]`;

    if (updatedNote.includes('[Phí ship:')) {
      updatedNote = updatedNote.replace(/\[Phí ship:\s*[^\]]+\]/gi, shipTag);
    } else {
      updatedNote = `${updatedNote} | ${shipTag}`.trim();
    }

    const { data: updatedOrder, error: updateErr } = await adminClient
      .from('orders')
      .update({
        total_due: newTotalDue,
        note: updatedNote,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json({ error: 'Lỗi cập nhật phí ship' }, { status: 500 });
    }

    return NextResponse.json({ success: true, order: updatedOrder });
  }

  if (action === 'mark_paid') {
    const method = payment_method === 'BANK_TRANSFER' ? 'BANK_TRANSFER' : 'CASH';

    const { data: currentOrder } = await adminClient
      .from('orders')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (!currentOrder) {
      return NextResponse.json({ error: 'Không tìm thấy đơn hàng' }, { status: 404 });
    }

    const existingNote = currentOrder.note || '';
    const updatedNote = existingNote.includes('Đã thanh toán')
      ? existingNote
      : `${existingNote} | [Đã thanh toán: Tiền]`.trim();

    try {
      const { data: updatedWithCols, error: colErr } = await adminClient
        .from('orders')
        .update({
          status: 'CONFIRMED',
          payment_method: method,
          payment_status: 'PAID',
          note: updatedNote,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (!colErr && updatedWithCols) {
        return NextResponse.json({ success: true, order: updatedWithCols });
      }
    } catch {
      // fallback if payment_method or payment_status columns don't exist in Supabase
    }

    const { data: fallbackUpdated, error: fbErr } = await adminClient
      .from('orders')
      .update({
        status: 'CONFIRMED',
        note: updatedNote,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (fbErr) {
      return NextResponse.json({ error: 'Lỗi cập nhật trạng thái thanh toán' }, { status: 500 });
    }

    return NextResponse.json({ success: true, order: fallbackUpdated });
  }

  // Handle Cancel with Audit Reason & Point Refund via cancelPosOrder
  if (action === 'cancel' && staff) {
    const reason = String(cancel_reason || 'Khách báo hủy đơn').trim();
    const cancelRes = await cancelPosOrder({
      orderId: id,
      cancelReason: reason.length >= 3 ? reason : 'Khách báo hủy đơn',
      staff,
    });
    if (!cancelRes.success) {
      return NextResponse.json({ error: cancelRes.error || 'Không thể hủy đơn' }, { status: 400 });
    }
    return NextResponse.json({ success: true, order: cancelRes.order });
  }

  // Use RPC for atomic confirm/cancel with point handling
  try {
    const { data: result, error } = await adminClient.rpc(
      action === 'confirm' ? 'confirm_order' : 'cancel_order',
      { p_order_id: id }
    );

    if (!error && result) {
      return NextResponse.json({ success: true, ...result });
    }
  } catch {
    // fallback if RPC unmigrated
  }

  // Fallback direct table update if RPC fails
  const fallbackStatus = action === 'confirm' ? 'CONFIRMED' : 'CANCELLED';
  const { data: directUpdated, error: directErr } = await adminClient
    .from('orders')
    .update({
      status: fallbackStatus,
      updated_at: new Date().toISOString(),
      ...(action === 'confirm' ? { confirmed_at: new Date().toISOString() } : { cancelled_at: new Date().toISOString() }),
    })
    .eq('id', id)
    .select()
    .single();

  if (directErr) {
    return NextResponse.json({ error: `Không thể ${action === 'confirm' ? 'xác nhận' : 'hủy'} đơn` }, { status: 500 });
  }

  return NextResponse.json({ success: true, order: directUpdated });
}
