import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { full_name, phone, email } = body;

    if (!full_name || !phone) {
      return NextResponse.json(
        { error: 'Vui lòng nhập họ tên và số điện thoại' },
        { status: 400 }
      );
    }

    // Normalize phone
    const normalized = phone.replace(/[\s\-()]/g, '');

    if (normalized.length < 9 || normalized.length > 15) {
      return NextResponse.json(
        { error: 'Số điện thoại không hợp lệ' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Check if phone already exists
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('phone', normalized)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: 'Số điện thoại này đã được đăng ký' },
        { status: 409 }
      );
    }

    // Get the MEMBER tier id
    const { data: memberTier } = await supabase
      .from('tiers')
      .select('id')
      .eq('code', 'MEMBER')
      .single();

    if (!memberTier) {
      return NextResponse.json(
        { error: 'Lỗi hệ thống: không tìm thấy tier mặc định' },
        { status: 500 }
      );
    }

    // Create user
    const { data: newUser, error: insertErr } = await supabase
      .from('users')
      .insert({
        full_name: full_name.trim(),
        phone: normalized,
        email: email || null,
        role: 'USER',
        current_tier_id: memberTier.id,
        total_spending: 0,
        point_balance: 10000, // Welcome bonus
        locked_points: 0,
        received_welcome_10k: true,
        upgraded_to_silver: false,
        upgraded_to_gold: false,
        upgraded_to_diamond: false,
      })
      .select('id, full_name, phone, point_balance')
      .single();

    if (insertErr) {
      console.error('Error creating user:', insertErr);
      return NextResponse.json(
        { error: 'Lỗi tạo tài khoản, vui lòng thử lại' },
        { status: 500 }
      );
    }

    // Create welcome bonus transaction
    await supabase.from('point_transactions').insert({
      user_id: newUser.id,
      type: 'WELCOME_BONUS',
      amount: 10000,
      balance_after: 10000,
      description: 'Chào mừng thành viên mới - +10.000đ',
    });

    return NextResponse.json({
      success: true,
      user: newUser,
    });
  } catch (err) {
    console.error('Registration error:', err);
    return NextResponse.json(
      { error: 'Lỗi hệ thống' },
      { status: 500 }
    );
  }
}
