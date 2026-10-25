import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST /api/auth/register — Full registration with phone, password, welcome points
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { full_name, phone, email, password } = body;

    if (!full_name || !full_name.trim()) {
      return NextResponse.json({ error: 'Vui lòng nhập họ và tên' }, { status: 400 });
    }

    if (!phone || phone.trim().length < 9) {
      return NextResponse.json({ error: 'Số điện thoại không hợp lệ' }, { status: 400 });
    }

    if (!password || password.length < 6) {
      return NextResponse.json({ error: 'Mật khẩu phải có ít nhất 6 ký tự' }, { status: 400 });
    }

    const normalizedPhone = phone.replace(/[\s\-()]/g, '');
    const targetEmail = (email && email.trim()) ? email.trim() : `${normalizedPhone}@coffeehouse.vn`;

    // Service role client to perform admin auth and bypass client restrictions
    const adminClient = createAdminClient();

    // 1. Check if phone already registered in users table
    const { data: existingUser } = await adminClient
      .from('users')
      .select('id, phone')
      .eq('phone', normalizedPhone)
      .maybeSingle();

    if (existingUser) {
      return NextResponse.json({ error: 'Số điện thoại này đã được đăng ký' }, { status: 409 });
    }

    // 2. Create user in Supabase Auth
    let authUserId: string;
    const { data: authCreated, error: authCreateErr } = await adminClient.auth.admin.createUser({
      email: targetEmail,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: full_name.trim(),
        phone: normalizedPhone,
      },
    });

    if (authCreateErr) {
      // If user already exists in auth with that email, try to update their password
      if (authCreateErr.message.includes('already registered')) {
        const { data: list } = await adminClient.auth.admin.listUsers();
        const existingAuth = list?.users?.find(u => u.email === targetEmail);
        if (existingAuth) {
          authUserId = existingAuth.id;
          await adminClient.auth.admin.updateUserById(authUserId, { password });
        } else {
          return NextResponse.json({ error: 'Tài khoản email này đã tồn tại' }, { status: 409 });
        }
      } else {
        console.error('Auth create error:', authCreateErr);
        return NextResponse.json({ error: authCreateErr.message || 'Không thể tạo tài khoản' }, { status: 500 });
      }
    } else {
      authUserId = authCreated.user.id;
    }

    // 3. Get MEMBER tier
    const { data: memberTier } = await adminClient
      .from('tiers')
      .select('id, code, name, cashback_rate')
      .eq('code', 'MEMBER')
      .single();

    if (!memberTier) {
      return NextResponse.json({ error: 'Không tìm thấy hạng thành viên mặc định' }, { status: 500 });
    }

    // 4. Create user record in `users` table
    const { data: newUser, error: insertErr } = await adminClient
      .from('users')
      .insert({
        id: authUserId,
        full_name: full_name.trim(),
        phone: normalizedPhone,
        email: targetEmail,
        role: 'USER',
        current_tier_id: memberTier.id,
        total_spending: 0,
        point_balance: 10000, // 10.000đ welcome bonus!
        locked_points: 0,
        received_welcome_10k: true,
        upgraded_to_silver: false,
        upgraded_to_gold: false,
        upgraded_to_diamond: false,
      })
      .select('*, tier:tiers(*)')
      .single();

    if (insertErr) {
      console.error('Error inserting into users table:', insertErr);
      return NextResponse.json({ error: 'Không thể khởi tạo thông tin thành viên' }, { status: 500 });
    }

    // 5. Log WELCOME_BONUS transaction
    await adminClient.from('point_transactions').insert({
      user_id: authUserId,
      type: 'WELCOME_BONUS',
      amount: 10000,
      balance_after: 10000,
      reference_id: 'WELCOME-10K',
      description: 'Thưởng chào mừng thành viên mới 🌱 +10.000đ',
    });

    // 6. Sign in on the server client to set session cookies
    const serverClient = await createClient();
    await serverClient.auth.signInWithPassword({
      email: targetEmail,
      password,
    });

    return NextResponse.json({
      success: true,
      user: newUser,
    });
  } catch (err: any) {
    console.error('Registration API error:', err);
    return NextResponse.json({ error: 'Lỗi đăng ký thành viên' }, { status: 500 });
  }
}
