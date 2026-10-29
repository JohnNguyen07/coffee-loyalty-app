import { createAdminClient } from '@/lib/supabase/admin';
import { verifyAdmin } from '@/lib/auth-utils';
import { NextRequest, NextResponse } from 'next/server';

// PATCH /api/orders/[id] — Update order status and payment (admin/cashier)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
  }

  const body = await request.json();
  const { action, payment_method } = body; // 'confirm' | 'cancel' | 'mark_paid'

  if (!['confirm', 'cancel', 'mark_paid'].includes(action)) {
    return NextResponse.json({ error: 'Hành động không hợp lệ' }, { status: 400 });
  }

  const adminClient = createAdminClient();

  if (action === 'mark_paid') {
    const method = payment_method === 'BANK_TRANSFER' ? 'BANK_TRANSFER' : 'CASH';
    const payLabel = method === 'BANK_TRANSFER' ? 'Quét mã QR' : 'Tiền mặt';

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
      : `${existingNote} | [Đã thanh toán: ${payLabel}]`.trim();

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
