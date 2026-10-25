import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

// PATCH /api/orders/[id] — Update order status (admin only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('users')
    .select('id, role')
    .eq('google_id', user.id)
    .single();

  if (!profile || profile.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
  }

  const body = await request.json();
  const { action } = body; // 'confirm' | 'cancel'

  if (!['confirm', 'cancel'].includes(action)) {
    return NextResponse.json({ error: 'Hành động không hợp lệ' }, { status: 400 });
  }

  // Use RPC for atomic confirm/cancel with point handling
  const { data: result, error } = await supabase.rpc(
    action === 'confirm' ? 'confirm_order' : 'cancel_order',
    { p_order_id: id }
  );

  if (error) {
    console.error(`Order ${action} error:`, error);
    return NextResponse.json({ error: `Không thể ${action === 'confirm' ? 'xác nhận' : 'hủy'} đơn` }, { status: 500 });
  }

  return NextResponse.json({ success: true, ...result });
}
