import { createAdminClient } from '@/lib/supabase/admin';
import { verifyAdmin } from '@/lib/auth-utils';
import { NextRequest, NextResponse } from 'next/server';

// POST /api/admin/qr/redeem — Admin manually redeems QR code for a customer by phone number
export async function POST(request: NextRequest) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 403 });
    }

    const adminClient = createAdminClient();
    const body = await request.json();
    const { code, phone } = body;

    if (!code || !code.trim()) {
      return NextResponse.json({ error: 'Vui lòng cung cấp mã QR' }, { status: 400 });
    }

    if (!phone || !phone.trim()) {
      return NextResponse.json({ error: 'Vui lòng cung cấp số điện thoại khách hàng nhận điểm' }, { status: 400 });
    }

    const cleanCode = code.trim();
    const cleanPhone = phone.trim();

    // 1. Find user by phone
    const { data: user, error: userErr } = await adminClient
      .from('users')
      .select('*, tier:tiers(*)')
      .eq('phone', cleanPhone)
      .maybeSingle();

    if (userErr || !user) {
      return NextResponse.json({ error: `Không tìm thấy khách hàng với số điện thoại ${cleanPhone}` }, { status: 404 });
    }

    // 2. Find QR token
    const { data: token, error: tokenErr } = await adminClient
      .from('qr_tokens')
      .select('*')
      .eq('code', cleanCode)
      .maybeSingle();

    if (tokenErr || !token) {
      return NextResponse.json({ error: 'Mã QR không tồn tại trong hệ thống' }, { status: 404 });
    }

    if (token.status === 'USED') {
      return NextResponse.json({
        error: `Mã QR này đã được quét sử dụng trước đó vào lúc ${new Date(token.scanned_at || token.created_at).toLocaleString('vi-VN')}`,
      }, { status: 400 });
    }

    if (token.status === 'EXPIRED' || new Date(token.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Mã QR này đã hết hạn sử dụng' }, { status: 400 });
    }

    // 3. Calculate cashback based on user's tier
    const rate = Number(user.tier?.cashback_rate) || 3.0;
    const cashbackAmount = Math.round((token.drink_value * rate) / 100);
    const newSpending = (user.total_spending || 0) + token.drink_value;
    const newBalance = (user.point_balance || 0) + cashbackAmount;

    // Check tier upgrade
    const { data: higherTiers } = await adminClient
      .from('tiers')
      .select('*')
      .lte('min_spending', newSpending)
      .order('min_spending', { ascending: false })
      .limit(1);

    const targetTier = higherTiers?.[0] || user.tier;
    const isUpgraded = targetTier && targetTier.id !== user.current_tier_id;

    // 4. Update QR token to USED
    await adminClient
      .from('qr_tokens')
      .update({
        status: 'USED',
        scanned_by: user.id,
        scanned_at: new Date().toISOString(),
      })
      .eq('code', cleanCode);

    // 5. Update user balance & spending
    await adminClient
      .from('users')
      .update({
        point_balance: newBalance,
        total_spending: newSpending,
        current_tier_id: targetTier.id,
      })
      .eq('id', user.id);

    // 6. Record transaction
    const { data: tx } = await adminClient
      .from('point_transactions')
      .insert({
        user_id: user.id,
        type: 'CASHBACK',
        amount: cashbackAmount,
        balance_after: newBalance,
        reference_id: cleanCode,
        description: `Thu ngân tích điểm thủ công tem ly nước ${token.drink_value.toLocaleString('vi-VN')}đ (hoàn ${rate}%)`,
      })
      .select()
      .single();

    return NextResponse.json({
      success: true,
      message: `Đã tích thành công ${cashbackAmount.toLocaleString('vi-VN')}đ vào ví khách hàng ${user.full_name || user.phone}!`,
      drink_value: token.drink_value,
      cashback_amount: cashbackAmount,
      cashback_rate: rate,
      customer: {
        id: user.id,
        full_name: user.full_name,
        phone: user.phone,
        point_balance: newBalance,
        tier: targetTier.name,
        isUpgraded,
      },
      transaction: tx,
    });
  } catch (err: any) {
    console.error('QR redemption error:', err);
    return NextResponse.json({ error: 'Lỗi thực hiện đổi tem tích điểm' }, { status: 500 });
  }
}
