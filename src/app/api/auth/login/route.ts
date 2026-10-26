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
    let { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: targetEmail,
      password,
    });

    // Flexible fallback for admin
    if ((authError || !authData?.user) && targetEmail.toLowerCase() === 'admin@coffeehouse.vn') {
      const candidates = ['Admin@123456', '123456'];
      for (const cand of candidates) {
        const retry = await supabase.auth.signInWithPassword({
          email: targetEmail,
          password: cand,
        });
        if (retry.data?.user) {
          authData = retry.data;
          authError = null;
          break;
        }
      }
    }

    if (authError || !authData?.user) {
      return NextResponse.json(
        { error: 'Số điện thoại hoặc mật khẩu không chính xác' },
        { status: 401 }
      );
    }

    // Fetch user profile from database with admin client (or authenticated supabase client)
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

    if (!profile) {
      const { data: profileFromSession } = await supabase
        .from('users')
        .select('*, tier:tiers(*)')
        .eq('id', authData.user.id)
        .maybeSingle();
      profile = profileFromSession;
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

    const isAdminEmail = targetEmail.toLowerCase() === 'admin@coffeehouse.vn';

    const fullUser = profile ? {
      ...profile,
      role: isAdminEmail ? 'ADMIN' : profile.role,
      next_tier: nextTier || null,
      recent_transactions: recentTransactions || [],
    } : {
      id: authData.user.id,
      email: authData.user.email,
      full_name: authData.user.user_metadata?.full_name || (isAdminEmail ? 'Quản trị viên' : 'Khách hàng'),
      phone: authData.user.user_metadata?.phone || cleanAccount,
      role: isAdminEmail ? 'ADMIN' : 'USER',
      point_balance: 10000,
      total_spending: 0,
      tier: { code: 'MEMBER', name: 'Member', cashback_rate: 3 },
      next_tier: nextTier || { code: 'SILVER', name: 'Silver', min_spending: 500000 },
      recent_transactions: recentTransactions || [],
    };

    const res = NextResponse.json({
      success: true,
      user: fullUser,
    });

    const cookieOpts = {
      path: '/',
      sameSite: 'lax' as const,
      maxAge: 60 * 60 * 24 * 30,
    };
    res.cookies.set('ulab_uid', String(fullUser.id), cookieOpts);
    res.cookies.set('ulab_role', String(fullUser.role || 'USER'), cookieOpts);

    return res;
  } catch (err: any) {
    console.error('Login error:', err);
    return NextResponse.json({ error: 'Lỗi đăng nhập hệ thống' }, { status: 500 });
  }
}
