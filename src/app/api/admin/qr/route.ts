import { createAdminClient } from '@/lib/supabase/admin';
import { verifyAdmin, escapeFilterInput } from '@/lib/auth-utils';
import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const noCacheHeaders = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
};

// GET /api/admin/qr — List QR tokens with filter & stats
export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 403 });
    }

    const adminClient = createAdminClient();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'ALL';
    const search = searchParams.get('search') || '';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const offset = (page - 1) * limit;

    let query = adminClient
      .from('qr_tokens')
      .select('*, scanner:users!qr_tokens_scanned_by_fkey(full_name, phone, email)', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (status && status !== 'ALL') {
      query = query.eq('status', status);
    }

    if (search.trim()) {
      query = query.ilike('code', `%${escapeFilterInput(search.trim())}%`);
    }

    query = query.range(offset, offset + limit - 1);

    const { data: tokens, error, count } = await query;

    if (error) {
      console.error('QR tokens fetch error:', error);
      const fallback = await adminClient
        .from('qr_tokens')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      return NextResponse.json({
        tokens: fallback.data || [],
        total: fallback.count || 0,
        page,
        limit,
      }, { headers: noCacheHeaders });
    }

    // Overview counts
    const { count: activeCount } = await adminClient
      .from('qr_tokens')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'ACTIVE');

    const { count: usedCount } = await adminClient
      .from('qr_tokens')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'USED');

    return NextResponse.json({
      tokens: tokens || [],
      total: count || 0,
      stats: {
        active: activeCount || 0,
        used: usedCount || 0,
        total: count || 0,
      },
      page,
      limit,
    }, { headers: noCacheHeaders });
  } catch (err: any) {
    console.error('QR list error:', err);
    return NextResponse.json({ error: 'Lỗi tải danh sách mã QR' }, { status: 500, headers: noCacheHeaders });
  }
}

// POST /api/admin/qr — Batch generate QR tokens
export async function POST(request: NextRequest) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 403 });
    }

    const adminClient = createAdminClient();
    const body = await request.json();
    const { drink_value, quantity = 1, prefix = 'QR' } = body;

    const value = parseInt(drink_value, 10);
    const count = Math.min(Math.max(parseInt(quantity, 10) || 1, 1), 50);

    if (!value || value <= 0) {
      return NextResponse.json({ error: 'Giá trị ly nước không hợp lệ' }, { status: 400, headers: noCacheHeaders });
    }

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 72);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const tokensToInsert = [];

    for (let i = 0; i < count; i++) {
      const randomHex = randomBytes(4).toString('hex').toUpperCase();
      const code = `${prefix}-${value}-${Date.now().toString(36).toUpperCase()}-${randomHex}`;
      tokensToInsert.push({
        code,
        drink_value: value,
        status: 'ACTIVE',
        expires_at: expiresAt.toISOString(),
      });
    }

    const { data: inserted, error } = await adminClient
      .from('qr_tokens')
      .insert(tokensToInsert)
      .select();

    if (error) {
      console.error('Batch QR insert error:', error);
      return NextResponse.json({ error: 'Lỗi lưu mã QR vào cơ sở dữ liệu' }, { status: 500, headers: noCacheHeaders });
    }

    const results = (inserted || tokensToInsert).map((t) => ({
      ...t,
      scan_url: `${appUrl}/scan?code=${encodeURIComponent(t.code)}`,
    }));

    return NextResponse.json({
      success: true,
      count: results.length,
      tokens: results,
    }, { headers: noCacheHeaders });
  } catch (err: any) {
    console.error('Batch QR error:', err);
    return NextResponse.json({ error: 'Lỗi tạo lô mã QR' }, { status: 500, headers: noCacheHeaders });
  }
}

// DELETE /api/admin/qr — Delete a QR token or batch delete
export async function DELETE(request: NextRequest) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 403 });
    }

    const adminClient = createAdminClient();
    const body = await request.json();
    const { code, codes } = body;

    let targetCodes: string[] = [];
    if (code) targetCodes = [code];
    if (Array.isArray(codes)) targetCodes = codes;

    if (targetCodes.length === 0) {
      return NextResponse.json({ error: 'Vui lòng cung cấp mã QR cần xóa' }, { status: 400, headers: noCacheHeaders });
    }

    const { error } = await adminClient
      .from('qr_tokens')
      .delete()
      .in('code', targetCodes);

    if (error) {
      console.error('Delete QR tokens error:', error);
      return NextResponse.json({ error: 'Lỗi khi xóa mã QR trong cơ sở dữ liệu' }, { status: 500, headers: noCacheHeaders });
    }

    return NextResponse.json({
      success: true,
      message: `Đã xóa thành công ${targetCodes.length} mã QR`,
      deletedCodes: targetCodes,
    }, { headers: noCacheHeaders });
  } catch (err: any) {
    console.error('Delete QR error:', err);
    return NextResponse.json({ error: 'Lỗi máy chủ khi xóa mã QR' }, { status: 500, headers: noCacheHeaders });
  }
}
