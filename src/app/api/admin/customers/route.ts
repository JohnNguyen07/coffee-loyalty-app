import { createAdminClient } from '@/lib/supabase/admin';
import { verifyAdmin, verifyPosStaff, escapeFilterInput } from '@/lib/auth-utils';
import { canAdjustMemberPoints } from '@/lib/rbac/domain';
import {
  createMemberAuthUser,
  syncMemberAuthProfile,
  validateMemberPassword,
} from '@/lib/customers/auth-provision';
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
    if (!staff || staff.staffRole === 'INVENTORY_STAFF') {
      return NextResponse.json({ error: 'Không có quyền tạo khách hàng' }, { status: 403 });
    }

    const body = await request.json();
    const fullName = String(body.full_name || body.fullName || '').trim();
    const cleanPhone = String(body.phone || '').replace(/\D/g, '');
    const rawEmail = String(body.email || '').trim().toLowerCase();
    const initialPoints = Math.max(0, Math.floor(Number(body.initial_points || 0)));
    const rawPassword = body.password;
    const requirePassword = Boolean(body.require_password);

    if (!fullName || fullName.length < 2 || cleanPhone.length < 9 || cleanPhone.length > 15) {
      return NextResponse.json(
        { error: 'Vui lòng nhập Họ tên (tối thiểu 2 ký tự) và Số điện thoại hợp lệ (9-15 chữ số).' },
        { status: 400 }
      );
    }

    if (rawEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      return NextResponse.json({ error: 'Email không đúng định dạng.' }, { status: 400 });
    }

    let resolvedPassword = cleanPhone;
    if (requirePassword || rawPassword !== undefined) {
      try {
        resolvedPassword = validateMemberPassword(rawPassword);
      } catch (pwErr: unknown) {
        return NextResponse.json(
          { error: pwErr instanceof Error ? pwErr.message : 'Mật khẩu đăng nhập không hợp lệ.' },
          { status: 400 }
        );
      }
    }

    if (initialPoints > 0 && !canAdjustMemberPoints(staff.staffRole)) {
      return NextResponse.json(
        { error: 'Chỉ tài khoản Owner hoặc Admin mới có quyền tặng điểm mở thẻ ban đầu.' },
        { status: 403 }
      );
    }

    const adminClient = createAdminClient();

    // Check duplicate phone
    const { data: existingPhone } = await adminClient
      .from('users')
      .select('*, tier:tiers(*)')
      .eq('phone', cleanPhone)
      .maybeSingle();

    if (existingPhone) {
      return NextResponse.json(
        {
          error: `Số điện thoại ${cleanPhone} đã được đăng ký cho khách hàng "${existingPhone.full_name}".`,
          customer: existingPhone,
        },
        { status: 409 }
      );
    }

    const targetEmail = rawEmail || `member.${cleanPhone}@ulab.vn`;

    // Check duplicate email in public.users
    const { data: existingEmail } = await adminClient
      .from('users')
      .select('id, full_name')
      .ilike('email', targetEmail)
      .maybeSingle();

    if (existingEmail) {
      return NextResponse.json(
        { error: `Email ${targetEmail} đã được đăng ký cho tài khoản khác.` },
        { status: 409 }
      );
    }

    // Resolve default MEMBER tier id
    const { data: memberTier } = await adminClient
      .from('tiers')
      .select('id, code, name, cashback_rate')
      .eq('code', 'MEMBER')
      .maybeSingle();

    // Provision Supabase Auth user so member can log in immediately
    const authRes = await createMemberAuthUser(adminClient, {
      email: targetEmail,
      password: resolvedPassword,
      fullName,
      phone: cleanPhone,
    });

    if (!authRes.ok) {
      return NextResponse.json({ error: authRes.error }, { status: authRes.status });
    }

    const { data: created, error: createErr } = await adminClient
      .from('users')
      .insert({
        id: authRes.authUserId,
        google_id: authRes.authUserId,
        full_name: fullName,
        phone: cleanPhone,
        email: targetEmail,
        role: 'USER',
        current_tier_id: memberTier?.id || null,
        point_balance: initialPoints,
        total_spending: 0,
        locked_points: 0,
      })
      .select('*, tier:tiers(*)')
      .single();

    if (createErr || !created) {
      console.error('Create customer error:', createErr);
      await adminClient.auth.admin.deleteUser(authRes.authUserId).catch(() => {});
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
        description: `Tặng điểm khởi tạo thành viên mới (bởi ${staff.fullName})`,
      });
    }

    return NextResponse.json({
      success: true,
      customer: created,
      authProvisioned: true,
      message: `Đã tạo thành viên mới "${fullName}" (${cleanPhone}) thành công! Khách có thể đăng nhập bằng SĐT và mật khẩu vừa tạo.`,
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
    if (!staff || staff.staffRole === 'INVENTORY_STAFF') {
      return NextResponse.json({ error: 'Không có quyền cập nhật khách hàng' }, { status: 403 });
    }

    const body = await request.json();
    const id = String(body.id || '').trim();
    const fullName = String(body.full_name || body.fullName || '').trim();
    const cleanPhone = String(body.phone || '').replace(/\D/g, '');
    const email = String(body.email || '').trim().toLowerCase();

    if (!id || !fullName || fullName.length < 2) {
      return NextResponse.json({ error: 'Thiếu ID hoặc Họ tên hợp lệ.' }, { status: 400 });
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Email không đúng định dạng.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data: existingUser } = await adminClient
      .from('users')
      .select('id, google_id, full_name, phone, email')
      .eq('id', id)
      .maybeSingle();

    if (!existingUser) {
      return NextResponse.json({ error: 'Không tìm thấy khách hàng cần cập nhật.' }, { status: 404 });
    }

    if (cleanPhone.length >= 9 && cleanPhone !== existingUser.phone) {
      const { data: dupPhone } = await adminClient
        .from('users')
        .select('id')
        .eq('phone', cleanPhone)
        .neq('id', id)
        .maybeSingle();
      if (dupPhone) {
        return NextResponse.json(
          { error: `Số điện thoại ${cleanPhone} đã được sử dụng bởi thành viên khác.` },
          { status: 409 }
        );
      }
    }

    if (email && email !== (existingUser.email || '').toLowerCase()) {
      const { data: dupEmail } = await adminClient
        .from('users')
        .select('id')
        .ilike('email', email)
        .neq('id', id)
        .maybeSingle();
      if (dupEmail) {
        return NextResponse.json(
          { error: `Email ${email} đã được sử dụng bởi tài khoản khác.` },
          { status: 409 }
        );
      }
    }

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

    await syncMemberAuthProfile(adminClient, {
      publicUserId: updated.id,
      googleId: existingUser.google_id,
      oldEmail: existingUser.email,
      fullName: updated.full_name,
      phone: updated.phone,
      email: updated.email,
    });

    return NextResponse.json({
      success: true,
      customer: updated,
      message: 'Đã cập nhật thông tin khách hàng thành công!',
    });
  } catch {
    return NextResponse.json({ error: 'Lỗi máy chủ khi cập nhật khách hàng.' }, { status: 500 });
  }
}
