import { createAdminClient } from '@/lib/supabase/admin';
import { verifyAdmin, escapeFilterInput } from '@/lib/auth-utils';
import { NextRequest, NextResponse } from 'next/server';

// GET /api/admin/customers/detail?phone=... OR ?id=...
export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 403 });
    }

    const adminClient = createAdminClient();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const phone = searchParams.get('phone');
    const query = searchParams.get('query');

    // Quick search mode for auto-complete
    if (query) {
      const q = escapeFilterInput(query.trim());
      const { data: suggestions } = await adminClient
        .from('users')
        .select('id, full_name, phone, email, point_balance, total_spending, tier:tiers(name, code, cashback_rate)')
        .or(`phone.ilike.%${q}%,full_name.ilike.%${q}%,email.ilike.%${q}%`)
        .limit(10);

      return NextResponse.json({ suggestions: suggestions || [] });
    }

    if (!id && !phone) {
      return NextResponse.json({ error: 'Vui lòng cung cấp ID hoặc số điện thoại' }, { status: 400 });
    }

    let customerQuery = adminClient
      .from('users')
      .select('*, tier:tiers(*)');

    if (id) {
      customerQuery = customerQuery.eq('id', id);
    } else if (phone) {
      customerQuery = customerQuery.eq('phone', phone.trim());
    }

    const { data: customer, error } = await customerQuery.maybeSingle();

    if (error || !customer) {
      return NextResponse.json({ error: 'Không tìm thấy khách hàng' }, { status: 404 });
    }

    // Fetch transactions
    const { data: transactions } = await adminClient
      .from('point_transactions')
      .select('*')
      .eq('user_id', customer.id)
      .order('created_at', { ascending: false })
      .limit(30);

    // Fetch orders if available
    const { data: orders } = await adminClient
      .from('orders')
      .select('*, items:order_items(*)')
      .eq('user_id', customer.id)
      .order('created_at', { ascending: false })
      .limit(15);

    // Calculate next tier progress
    const { data: nextTier } = await adminClient
      .from('tiers')
      .select('*')
      .gt('min_spending', customer.total_spending || 0)
      .order('min_spending', { ascending: true })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      customer: {
        ...customer,
        next_tier: nextTier || null,
        transactions: transactions || [],
        orders: orders || [],
      },
    });
  } catch (err: any) {
    console.error('Customer detail error:', err);
    return NextResponse.json({ error: 'Lỗi tải thông tin chi tiết khách hàng' }, { status: 500 });
  }
}
