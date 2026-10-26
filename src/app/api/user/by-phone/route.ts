import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  const phone = request.nextUrl.searchParams.get('phone');

  if (!phone) {
    return NextResponse.json(
      { error: 'Thiếu số điện thoại' },
      { status: 400 }
    );
  }

  // Normalize phone: remove spaces, dashes
  const normalized = phone.replace(/[\s\-()]/g, '');

  try {
    const adminClient = createAdminClient();
    const { data: user, error } = await adminClient
      .from('users')
      .select('id, full_name, phone, email, role, point_balance, total_spending, current_tier_id, tier:tiers(*)')
      .eq('phone', normalized)
      .maybeSingle();

    if (error) {
      console.error('Error looking up user by phone:', error);
      return NextResponse.json(
        { error: 'Lỗi hệ thống' },
        { status: 500 }
      );
    }

    if (!user) {
      return NextResponse.json({ found: false }, { status: 200 });
    }

    // Get recent transactions & next tier
    const { data: recentTransactions } = await adminClient
      .from('point_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    const { data: nextTier } = await adminClient
      .from('tiers')
      .select('*')
      .gt('min_spending', user.total_spending || 0)
      .order('min_spending', { ascending: true })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      found: true,
      user: {
        ...user,
        next_tier: nextTier || null,
        recent_transactions: recentTransactions || [],
      },
    });
  } catch (err: any) {
    console.error('by-phone error:', err);
    return NextResponse.json(
      { error: 'Lỗi hệ thống' },
      { status: 500 }
    );
  }
}
