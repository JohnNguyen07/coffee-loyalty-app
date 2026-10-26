import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { allMenuItems } from '@/data/menu';

async function resolveProfile(user: { id: string; email?: string | null }) {
  const adminClient = createAdminClient();
  let { data: profile } = await adminClient
    .from('users')
    .select('id, role, point_balance')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile) {
    const { data: byGoogle } = await adminClient
      .from('users')
      .select('id, role, point_balance')
      .eq('google_id', user.id)
      .maybeSingle();
    profile = byGoogle;
  }

  if (!profile && user.email) {
    const { data: byEmail } = await adminClient
      .from('users')
      .select('id, role, point_balance')
      .eq('email', user.email)
      .maybeSingle();
    profile = byEmail;
  }

  return { profile, adminClient };
}

// POST /api/orders — Create a new order (customer)
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
  }

  const { profile, adminClient } = await resolveProfile(user);

  if (!profile) {
    return NextResponse.json({ error: 'Không tìm thấy tài khoản' }, { status: 404 });
  }

  const body = await request.json();
  const { items, points_used, note } = body;

  if (!items || items.length === 0) {
    return NextResponse.json({ error: 'Giỏ hàng trống' }, { status: 400 });
  }

  // Normalize items and calculate subtotal using SERVER-SIDE prices
  const normalizedItems = items.map(
    (item: { item_id?: string; name?: string; product_name?: string; size_label?: string; size?: string; unit_price: number; quantity: number }) => {
      const menuItem = allMenuItems.find(m => m.id === item.item_id || m.name === (item.product_name || item.name));
      const sizeLabel = item.size_label || item.size || 'M';
      const sizeInfo = menuItem?.sizes.find(s => s.label === sizeLabel);
      const verifiedPrice = sizeInfo?.price ?? Number(item.unit_price) ?? 0;
      const qty = Math.max(1, Number(item.quantity) || 1);
      const prodName = item.product_name || item.name || menuItem?.name || 'Món nước';

      return {
        item_id: item.item_id,
        product_name: prodName,
        name: prodName,
        size: sizeLabel,
        size_label: sizeLabel,
        unit_price: verifiedPrice,
        quantity: qty,
        subtotal: verifiedPrice * qty,
      };
    }
  );

  const subtotal = normalizedItems.reduce((sum: number, it: { subtotal: number }) => sum + it.subtotal, 0);
  const pointsToUse = Math.min(points_used || 0, profile.point_balance, subtotal);
  const totalDue = subtotal - pointsToUse;

  // 1. Try creating order with items using RPC for atomicity
  const { data: rpcResult, error: rpcError } = await adminClient.rpc('create_order', {
    p_user_id: profile.id,
    p_items: normalizedItems,
    p_points_used: pointsToUse,
    p_subtotal: subtotal,
    p_total_due: totalDue,
    p_note: note || null,
  });

  if (!rpcError && rpcResult) {
    return NextResponse.json({ success: true, order: rpcResult });
  }

  // 2. Fallback direct insert if RPC is not available or signature differs
  const orderCode = `CF-${Math.floor(1000 + Math.random() * 9000)}`;
  const { data: insertedOrder, error: orderErr } = await adminClient
    .from('orders')
    .insert({
      order_code: orderCode,
      user_id: profile.id,
      status: 'PENDING',
      subtotal,
      points_used: pointsToUse,
      total_due: totalDue,
      note: note || null,
    })
    .select()
    .single();

  if (orderErr || !insertedOrder) {
    console.error('Order creation error:', orderErr || rpcError);
    return NextResponse.json({ error: 'Không thể tạo đơn hàng' }, { status: 500 });
  }

  await adminClient.from('order_items').insert(
    normalizedItems.map((it: { product_name: string; size: string; quantity: number; unit_price: number; subtotal: number }) => ({
      order_id: insertedOrder.id,
      product_name: it.product_name,
      size: it.size,
      quantity: it.quantity,
      unit_price: it.unit_price,
      subtotal: it.subtotal,
    }))
  );

  if (pointsToUse > 0) {
    const newBalance = Math.max(0, profile.point_balance - pointsToUse);
    await adminClient
      .from('users')
      .update({ point_balance: newBalance })
      .eq('id', profile.id);

    await adminClient.from('point_transactions').insert({
      user_id: profile.id,
      type: 'ORDER_DEDUCT',
      amount: -pointsToUse,
      balance_after: newBalance,
      reference_id: insertedOrder.order_code,
      description: `Dùng điểm cho đơn ${insertedOrder.order_code}`,
    });
  }

  return NextResponse.json({ success: true, order: insertedOrder });
}

// GET /api/orders — Get orders (admin: all, user: own)
export async function GET(request: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
  }

  const { profile, adminClient } = await resolveProfile(user);

  if (!profile) {
    return NextResponse.json({ error: 'Không tìm thấy tài khoản' }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '20');
  const offset = (page - 1) * limit;

  let query = adminClient
    .from('orders')
    .select('*, items:order_items(*), user:users(id, full_name, email, phone, current_tier_id)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  // Admin sees all, user sees only own orders
  if (profile.role !== 'ADMIN') {
    query = query.eq('user_id', profile.id);
  }

  if (status && status !== 'ALL') {
    query = query.eq('status', status);
  }

  const { data: orders, error, count } = await query;

  if (error) {
    console.error('Orders fetch error:', error);
    return NextResponse.json({ error: 'Lỗi truy vấn' }, { status: 500 });
  }

  return NextResponse.json({
    orders: orders || [],
    total: count || 0,
    page,
    limit,
  });
}
