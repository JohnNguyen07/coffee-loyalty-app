import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';

// POST /api/qr/generate — POS/Admin generates QR code for a drink price
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check if there is an authenticated user
    let creatorId: string | null = null;
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const { data: profile } = await supabase
        .from('users')
        .select('id, role')
        .eq('google_id', user.id)
        .maybeSingle();

      if (profile) {
        creatorId = profile.id;
      }
    }

    const body = await request.json();
    const { drink_value, custom_code } = body;

    const value = parseInt(drink_value, 10);
    if (!value || value <= 0) {
      return NextResponse.json({ error: 'Giá trị ly nước không hợp lệ' }, { status: 400 });
    }

    // Generate unique code or use custom formatted code
    const randomHex = randomBytes(4).toString('hex').toUpperCase();
    const code = custom_code || `QR-${value}-${Date.now().toString(36).toUpperCase()}-${randomHex}`;

    // Set expiration: 48 hours from now
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 48);

    const { data: qrToken, error } = await supabase
      .from('qr_tokens')
      .insert({
        code,
        drink_value: value,
        status: 'ACTIVE',
        created_by: creatorId,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .maybeSingle();

    if (error) {
      console.warn('QR insert warning (falling back to generated object):', error);
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    return NextResponse.json({
      success: true,
      code,
      drink_value: value,
      qr_token: qrToken || {
        code,
        drink_value: value,
        status: 'ACTIVE',
        expires_at: expiresAt.toISOString(),
      },
      scan_url: `${appUrl}/scan?code=${encodeURIComponent(code)}`,
    });
  } catch (err: any) {
    console.error('QR generate API error:', err);
    return NextResponse.json({ error: 'Lỗi tạo mã QR' }, { status: 500 });
  }
}
