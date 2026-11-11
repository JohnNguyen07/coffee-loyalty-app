import { createAdminClient } from '@/lib/supabase/admin';
import { verifyAdmin, verifyPosStaff, escapeFilterInput } from '@/lib/auth-utils';
import { NextRequest, NextResponse } from 'next/server';

// GET /api/admin/customers — Get all customers with search, tier filter & pagination
export async function GET(request: NextRequest) {
  try {
    const staff = await verifyPosStaff();
    const admin = staff || (await verifyAdmin());
    if (!admin || (staff && staff.staffRole === 'INVENTORY_STAFF')) {
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
  } catch (err: unknown) {
    console.error('Admin customers error:', err);
    return NextResponse.json({ error: 'Lỗi máy chủ' }, { status: 500 });
  }
}

// POST /api/admin/customers — Create a new customer member at counter / admin
export async function POST(request: NextRequest) {
  try {
    const staff = await verifyPosStaff();
    const admin = staff || (await verifyAdmin());
    if (!admin || (staff && staff.staffRole === 'INVENTORY_STAFF')) {
      return NextResponse.json({ error: 'Không có quyền tạo khách hàng' }, { status: 403 });
    }

    const body = await request.json();
    const fullName = String(body.full_name || body.fullName || '').trim();
    const cleanPhone = String(body.phone || '').replace(/\D/g, '');
    const email = String(body.email || '').trim();
    const initialPoints = Math.max(0, Math.floor(Number(body.initial_points || 0)));

    if (!fullName || cleanPhone.length < 9) {
      return NextResponse.json(
        { error: 'Vui lòng nhập Họ tên và Số điện thoại hợp lệ (tối thiểu 9 chữ số).' },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // Check duplicate phone
    const { data: existing } = await adminClient
      .from('users')
      .select('*, tier:tiers(*)')
      .eq('phone', cleanPhone)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: `Số điện thoại ${cleanPhone} đã được đăng ký cho khách hàng "${existing.full_name}".`, customer: existing },
        { status: 409 }
      );
    }

    // Resolve default MEMBER tier id
    const { data: memberTier } = await adminClient
      .from('tiers')
      .select('id, code, name, cashback_rate')
      .eq('code', 'MEMBER')
      .maybeSingle();

    const syntheticEmail = email || `member.${cleanPhone}@ulab.vn`;

    const { data: created, error: createErr } = await adminClient
      .from('users')
      .insert({
        full_name: fullName,
        phone: cleanPhone,
        email: syntheticEmail,
        role: 'USER',
        current_tier_id: memberTier?.id || null,
        point_balance: initialPoints,
        total_spending: 0,
      })
      .select('*, tier:tiers(*)')
      .single();

    if (createErr || !created) {
      console.error('Create customer error:', createErr);
      return NextResponse.json(
        { error: createErr?.message || 'Không thể tạo hồ sơ khách hàng mới.' },
        { status: 500 }
      );
    }

    if (initialPoints > 0) {
      await adminClient.from('point_transactions').insert({
        user_id: created.id,
        type: 'WELCOME_BONUS',
        amount: initialPoints,
        balance_after: initialPoints,
        description: 'Tặng điểm khởi tạo thành viên mới tại quầy',
      });
    }

    return NextResponse.json({
      success: true,
      customer: created,
      message: `Đã tạo thành viên mới "${fullName}" (${cleanPhone}) thành công!`,
    });
  } catch (err: unknown) {
    console.error('Create customer exception:', err);
    return NextResponse.json({ error: 'Lỗi máy chủ khi tạo khách hàng.' }, { status: 500 });
  }
}

// PATCH /api/admin/customers — Update customer info (name, phone, email)
export async function PATCH(request: NextRequest) {
  try {
    const staff = await verifyPosStaff();
    const admin = staff || (await verifyAdmin());
    if (!admin) {
      return NextResponse.json({ error: 'Không có quyền cập nhật khách hàng' }, { status: 403 });
    }

    const body = await request.json();
    const id = String(body.id || '').trim();
    const fullName = String(body.full_name || body.fullName || '').trim();
    const cleanPhone = String(body.phone || '').replace(/\D/g, '');
    const email = String(body.email || '').trim();

    if (!id || !fullName) {
      return NextResponse.json({ error: 'Thiếu ID hoặc Họ tên khách hàng.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const updates: Record<string, unknown> = {
      full_name: fullName,
      updated_at: new Date().toISOString(),
    };
    if (cleanPhone.length >= 9) updates.phone = cleanPhone;
    if (email) updates.email = email;

    const { data: updated, error } = await adminClient
      .from('users')
      .update(updates)
      .eq('id', id)
      .select('*, tier:tiers(*)')
      .single();

    if (error || !updated) {
      return NextResponse.json({ error: error?.message || 'Không thể cập nhật thông tin.' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      customer: updated,
      message: 'Đã cập nhật thông tin khách hàng thành công!',
    });
  } catch {
    return NextResponse.json({ error: 'Lỗi máy chủ khi cập nhật khách hàng.' }, { status: 500 });
  }
}
