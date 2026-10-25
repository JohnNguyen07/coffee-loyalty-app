import { createAdminClient } from '@/lib/supabase/admin';
import { verifyAdmin, escapeFilterInput } from '@/lib/auth-utils';
import { NextRequest, NextResponse } from 'next/server';

// GET /api/admin/customers — Get all customers with search, tier filter & pagination
export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 403 });
    }

    const adminClient = createAdminClient();

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const tier = searchParams.get('tier') || '';
    const membersOnly = searchParams.get('membersOnly') === 'true';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = (page - 1) * limit;

    let query = adminClient
      .from('users')
      .select('*, tier:tiers(*)', { count: 'exact' })
      .order('total_spending', { ascending: false });

    if (search.trim()) {
      const q = escapeFilterInput(search.trim());
      query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`);
    }

    if (tier && tier !== 'ALL') {
      const { data: tierData } = await adminClient
        .from('tiers')
        .select('id')
        .eq('code', tier)
        .maybeSingle();

      if (tierData) {
        query = query.eq('current_tier_id', tierData.id);
      }
    }

    if (membersOnly) {
      // Exclude zero-spending non-members or admins if desired, but all users with point_balance or spending > 0
      query = query.gt('point_balance', 0);
    }

    query = query.range(offset, offset + limit - 1);

    const { data: customers, error, count } = await query;

    if (error) {
      console.error('Customers fetch error:', error);
      return NextResponse.json({ error: 'Lỗi truy vấn danh sách khách hàng' }, { status: 500 });
    }

    return NextResponse.json({
      customers: customers || [],
      total: count || 0,
      page,
      limit,
    });
  } catch (err: any) {
    console.error('Admin customers error:', err);
    return NextResponse.json({ error: 'Lỗi máy chủ' }, { status: 500 });
  }
}
