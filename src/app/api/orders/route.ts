import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { allMenuItems } from '@/data/menu';

// POST /api/orders — Create a new order (customer)
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('users')
    .select('id, point_balance')
    .eq('google_id', user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: 'Không tìm thấy tài khoản' }, { status: 404 });
  }

  const body = await request.json();
  const { items, points_used, note } = body;

  if (!items || items.length === 0) {
    return NextResponse.json({ error: 'Giỏ hàng trống' }, { status: 400 });
  }

  // Calculate subtotal using SERVER-SIDE prices (don't trust client)
  const subtotal = items.reduce(
    (sum: number, item: { item_id: string; size_label: string; unit_price: number; quantity: number }) => {
      // Look up real price from menu data
      const menuItem = allMenuItems.find(m => m.id === item.item_id);
      const sizeInfo = menuItem?.sizes.find(s => s.label === item.size_label);
      const verifiedPrice = sizeInfo?.price ?? item.unit_price; // fallback to client price only if item not found
      return sum + verifiedPrice * item.quantity;
    },
    0
  );

  const pointsToUse = Math.min(points_used || 0, profile.point_balance, subtotal);
  const totalDue = subtotal - pointsToUse;

  // Create order with items using RPC for atomicity
  const { data: result, error } = await supabase.rpc('create_order', {
    p_user_id: profile.id,
    p_items: JSON.stringify(items),
    p_points_used: pointsToUse,
    p_subtotal: subtotal,
    p_total_due: totalDue,
    p_note: note || null,
  });

  if (error) {
    console.error('Order creation error:', error);
    return NextResponse.json({ error: 'Không thể tạo đơn hàng' }, { status: 500 });
  }

  return NextResponse.json({ success: true, order: result });
}

// GET /api/orders — Get orders (admin: all, user: own)
export async function GET(request: NextRequest) {
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

  if (!profile) {
    return NextResponse.json({ error: 'Không tìm thấy tài khoản' }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '20');
  const offset = (page - 1) * limit;

  let query = supabase
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
