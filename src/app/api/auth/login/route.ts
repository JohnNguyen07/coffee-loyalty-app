import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';

// POST /api/auth/login — Full login by phone or email + password
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { account, password } = body;

    if (!account || !password) {
      return NextResponse.json(
        { error: 'Vui lòng nhập tài khoản và mật khẩu' },
        { status: 400 }
      );
    }

    const cleanAccount = account.trim();
    const supabase = await createClient();
    const adminClient = createAdminClient();

    let targetEmail = cleanAccount;

    // Check alias admin
    if (cleanAccount.toLowerCase() === 'admin') {
      targetEmail = 'admin@coffeehouse.vn';
    }

    // Check if account is a phone number (e.g. 0901234567)
    const isPhone = /^[0-9+]{9,15}$/.test(cleanAccount.replace(/[\s\-()]/g, ''));
    if (isPhone) {
      const normalizedPhone = cleanAccount.replace(/[\s\-()]/g, '');
      const { data: userByPhone } = await adminClient
        .from('users')
        .select('email')
        .eq('phone', normalizedPhone)
        .maybeSingle();

      if (userByPhone?.email) {
        targetEmail = userByPhone.email;
      } else {
        targetEmail = `${normalizedPhone}@coffeehouse.vn`;
      }
    }

    // Sign in with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: targetEmail,
      password,
    });

    if (authError || !authData?.user) {
      return NextResponse.json(
        { error: 'Số điện thoại hoặc mật khẩu không chính xác' },
        { status: 401 }
      );
    }

    // Fetch user profile from database with admin client to bypass RLS
    let { data: profile } = await adminClient
      .from('users')
      .select('*, tier:tiers(*)')
      .eq('id', authData.user.id)
      .maybeSingle();

    if (!profile) {
      const { data: profileByEmail } = await adminClient
        .from('users')
        .select('*, tier:tiers(*)')
        .eq('email', targetEmail)
        .maybeSingle();
      profile = profileByEmail;
    }

    if (!profile && isPhone) {
      const normalizedPhone = cleanAccount.replace(/[\s\-()]/g, '');
      const { data: profileByPhone } = await adminClient
        .from('users')
        .select('*, tier:tiers(*)')
        .eq('phone', normalizedPhone)
        .maybeSingle();
      profile = profileByPhone;
    }

    // Get next tier info
    const { data: nextTier } = await adminClient
      .from('tiers')
      .select('*')
      .gt('min_spending', profile?.total_spending || 0)
      .order('min_spending', { ascending: true })
      .limit(1)
      .maybeSingle();

    // Get recent point transactions
    const { data: recentTransactions } = await adminClient
      .from('point_transactions')
      .select('*')
      .eq('user_id', profile ? profile.id : authData.user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    const fullUser = profile ? {
      ...profile,
      next_tier: nextTier || null,
      recent_transactions: recentTransactions || [],
    } : {
      id: authData.user.id,
      email: authData.user.email,
      full_name: authData.user.user_metadata?.full_name || 'Khách hàng',
      phone: authData.user.user_metadata?.phone || cleanAccount,
      role: 'USER',
      point_balance: 10000,
      total_spending: 0,
      tier: { code: 'MEMBER', name: 'Member', cashback_rate: 3 },
      next_tier: nextTier || { code: 'SILVER', name: 'Silver', min_spending: 500000 },
      recent_transactions: recentTransactions || [],
    };

    return NextResponse.json({
      success: true,
      user: fullUser,
    });
  } catch (err: any) {
    console.error('Login error:', err);
    return NextResponse.json({ error: 'Lỗi đăng nhập hệ thống' }, { status: 500 });
  }
}
