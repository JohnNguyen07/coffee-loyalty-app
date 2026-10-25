import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

// POST /api/qr/scan — Customer scans QR code to earn cashback points
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await request.json();
    const { code, user_id, phone } = body;

    if (!code || typeof code !== 'string' || code.trim() === '') {
      return NextResponse.json({ error: 'Vui lòng cung cấp mã QR hợp lệ' }, { status: 400 });
    }

    const cleanCode = code.trim();

    // 1. Identify target user
    let profile: any = null;

    if (user_id) {
      const { data } = await supabase
        .from('users')
        .select('*, tier:tiers(*)')
        .eq('id', user_id)
        .maybeSingle();
      profile = data;
    } else if (phone) {
      const normalized = phone.replace(/[\s\-()]/g, '');
      const { data } = await supabase
        .from('users')
        .select('*, tier:tiers(*)')
        .eq('phone', normalized)
        .maybeSingle();
      profile = data;
    }

    // Fallback to authenticated user session
    if (!profile) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from('users')
          .select('*, tier:tiers(*)')
          .eq('google_id', user.id)
          .maybeSingle();
        profile = data;
      }
    }

    if (!profile) {
      return NextResponse.json(
        { error: 'Vui lòng nhập số điện thoại hoặc đăng nhập để tích điểm' },
        { status: 401 }
      );
    }

    // 2. Look up or auto-register QR token
    let { data: qrToken } = await supabase
      .from('qr_tokens')
      .select('*')
      .eq('code', cleanCode)
      .maybeSingle();

    if (!qrToken) {
      // Extract price from code if possible (e.g. QR-38000 or QR-35000-XYZ)
      let detectedPrice = 38000;
      const match = cleanCode.match(/(\d{4,6})/);
      if (match) {
        const parsed = parseInt(match[1], 10);
        if (parsed >= 10000 && parsed <= 500000) {
          detectedPrice = parsed;
        }
      }

      // Auto-insert token so the scan can proceed
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 48);

      const { data: newQR } = await supabase
        .from('qr_tokens')
        .insert({
          code: cleanCode,
          drink_value: detectedPrice,
          status: 'ACTIVE',
          expires_at: expiresAt.toISOString(),
        })
        .select()
        .maybeSingle();

      qrToken = newQR || {
        code: cleanCode,
        drink_value: detectedPrice,
        status: 'ACTIVE',
        expires_at: expiresAt.toISOString(),
      };
    }

    if (qrToken.status === 'USED') {
      return NextResponse.json({ error: 'Mã QR này đã được quét và tích điểm trước đó' }, { status: 400 });
    }

    if (qrToken.status === 'EXPIRED' || (qrToken.expires_at && new Date(qrToken.expires_at) < new Date())) {
      return NextResponse.json({ error: 'Mã QR đã hết hạn sử dụng' }, { status: 400 });
    }

    // 3. Try Supabase RPC first
    try {
      const { data: rpcResult, error: rpcError } = await supabase.rpc('process_qr_scan', {
        p_qr_code: cleanCode,
        p_user_id: profile.id,
      });

      if (!rpcError && rpcResult) {
        return NextResponse.json({
          success: true,
          ...rpcResult,
        });
      }
    } catch {
      // Fall through to manual transaction
    }

    // 4. Fallback Direct Transaction (in case RPC is not yet created on Supabase)
    const tierRate = profile.tier?.cashback_rate || 5;
    const cashback = Math.floor((qrToken.drink_value * tierRate) / 100);
    const newSpending = (profile.total_spending || 0) + qrToken.drink_value;
    let newBalance = (profile.point_balance || 0) + cashback;

    // Check tier upgrade
    let newTierId = profile.current_tier_id;
    let tierChanged = false;
    let newTierName = profile.tier?.name || 'Member';
    let tierBonus = 0;

    // Fetch all tiers to evaluate
    const { data: allTiers } = await supabase.from('tiers').select('*').order('min_spending', { ascending: false });

    if (allTiers && allTiers.length > 0) {
      for (const t of allTiers) {
        if (newSpending >= t.min_spending) {
          if (t.id !== profile.current_tier_id) {
            newTierId = t.id;
            tierChanged = true;
            newTierName = t.name;
            if (t.code === 'SILVER' && !profile.upgraded_to_silver) tierBonus = 100000;
            else if (t.code === 'GOLD' && !profile.upgraded_to_gold) tierBonus = 200000;
            else if (t.code === 'DIAMOND' && !profile.upgraded_to_diamond) tierBonus = 45000;
            newBalance += tierBonus;
          }
          break;
        }
      }
    }

    // Update QR token to USED
    await supabase
      .from('qr_tokens')
      .update({
        status: 'USED',
        scanned_by: profile.id,
        scanned_at: new Date().toISOString(),
      })
      .eq('code', cleanCode);

    // Log CASHBACK point transaction
    await supabase.from('point_transactions').insert({
      user_id: profile.id,
      type: 'CASHBACK',
      amount: cashback,
      balance_after: newBalance - tierBonus,
      reference_id: cleanCode,
      description: `Hoàn ${tierRate}% cho ly ${qrToken.drink_value.toLocaleString('vi-VN')}đ`,
    });

    // Log TIER_UP_BONUS if any
    if (tierBonus > 0) {
      await supabase.from('point_transactions').insert({
        user_id: profile.id,
        type: 'TIER_UP_BONUS',
        amount: tierBonus,
        balance_after: newBalance,
        reference_id: newTierName,
        description: `Thưởng thăng hạng ${newTierName} ✨`,
      });
    }

    // Update user profile
    const updatePayload: any = {
      point_balance: newBalance,
      total_spending: newSpending,
      current_tier_id: newTierId,
      updated_at: new Date().toISOString(),
    };
    if (tierBonus > 0) {
      if (newTierName === 'Silver') updatePayload.upgraded_to_silver = true;
      if (newTierName === 'Gold') updatePayload.upgraded_to_gold = true;
      if (newTierName === 'Diamond') updatePayload.upgraded_to_diamond = true;
    }

    await supabase.from('users').update(updatePayload).eq('id', profile.id);

    return NextResponse.json({
      success: true,
      cashback,
      drink_value: qrToken.drink_value,
      new_balance: newBalance,
      new_spending: newSpending,
      tier_changed: tierChanged,
      new_tier_name: newTierName,
      tier_bonus: tierBonus,
      cashback_rate: tierRate,
    });
  } catch (error: any) {
    console.error('Scan API error:', error);
    return NextResponse.json(
      { error: error?.message || 'Lỗi xử lý tích điểm, vui lòng thử lại' },
      { status: 500 }
    );
  }
}
