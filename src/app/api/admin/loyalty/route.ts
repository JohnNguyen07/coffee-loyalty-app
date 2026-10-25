import { createAdminClient } from '@/lib/supabase/admin';
import { verifyAdmin, escapeFilterInput } from '@/lib/auth-utils';
import { NextRequest, NextResponse } from 'next/server';

// Default vouchers catalog
const defaultVouchers = [
  {
    id: 'v-10k',
    code: 'GIAM10K',
    title: 'Giảm 10.000đ cho đơn từ 45k',
    discount_amount: 10000,
    min_order_value: 45000,
    points_cost: 10000,
    expires_in_days: 30,
    category: 'DISCOUNT',
    is_active: true,
    claimed_count: 24,
  },
  {
    id: 'v-20k',
    code: 'VIP20K',
    title: 'Giảm 20.000đ cho đơn từ 70k',
    discount_amount: 20000,
    min_order_value: 70000,
    points_cost: 18000,
    expires_in_days: 15,
    category: 'DISCOUNT',
    is_active: true,
    claimed_count: 15,
  },
  {
    id: 'v-matcha',
    code: 'FREETOPPING',
    title: 'Tặng Kem Muối / Phô Mai Cho Matcha',
    discount_amount: 10000,
    min_order_value: 35000,
    points_cost: 8000,
    expires_in_days: 20,
    category: 'TOPPING',
    is_active: true,
    claimed_count: 42,
  },
  {
    id: 'v-lon',
    code: 'FREESHIP50K',
    title: 'Miễn phí giao hàng bán kính 5km',
    discount_amount: 25000,
    min_order_value: 99000,
    points_cost: 20000,
    expires_in_days: 30,
    category: 'SHIPPING',
    is_active: true,
    claimed_count: 8,
  },
];

// GET /api/admin/loyalty — Get tiers, transactions, and vouchers
export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 403 });
    }

    const adminClient = createAdminClient();
    const { searchParams } = new URL(request.url);
    const view = searchParams.get('view') || 'all'; // 'tiers', 'transactions', 'vouchers', 'cashback'
    const txType = searchParams.get('txType') || 'ALL';
    const search = searchParams.get('search') || '';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = (page - 1) * limit;

    // 1. Get tiers with user count
    const { data: tiers, error: tiersErr } = await adminClient
      .from('tiers')
      .select('*')
      .order('sort_order', { ascending: true });

    // Count users in each tier
    const tiersWithCount = await Promise.all(
      (tiers || []).map(async (t) => {
        const { count } = await adminClient
          .from('users')
          .select('*', { count: 'exact', head: true })
          .eq('current_tier_id', t.id);
        return {
          ...t,
          user_count: count || 0,
        };
      })
    );

    // 2. Query point transactions with user join
    let txQuery = adminClient
      .from('point_transactions')
      .select('*, user:users(id, full_name, phone, email, point_balance)', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (txType && txType !== 'ALL') {
      txQuery = txQuery.eq('type', txType);
    }

    if (search.trim()) {
      const s = escapeFilterInput(search.trim());
      txQuery = txQuery.or(`description.ilike.%${s}%,reference_id.ilike.%${s}%`);
    }

    txQuery = txQuery.range(offset, offset + limit - 1);

    const { data: transactions, count: txCount } = await txQuery;

    // Overall loyalty metrics
    const { data: allUsers } = await adminClient
      .from('users')
      .select('point_balance, total_spending');

    const totalCirculatingPoints = (allUsers || []).reduce((sum, u) => sum + (Number(u.point_balance) || 0), 0);
    const totalCustomerSpending = (allUsers || []).reduce((sum, u) => sum + (Number(u.total_spending) || 0), 0);

    return NextResponse.json({
      tiers: tiersWithCount,
      transactions: transactions || [],
      totalTransactions: txCount || 0,
      vouchers: defaultVouchers,
      metrics: {
        totalCirculatingPoints,
        totalCustomerSpending,
        totalCustomers: allUsers?.length || 0,
      },
      page,
      limit,
    });
  } catch (err: any) {
    console.error('Loyalty API error:', err);
    return NextResponse.json({ error: 'Lỗi tải thông tin Loyalty' }, { status: 500 });
  }
}
