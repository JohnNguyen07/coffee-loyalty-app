import { NextRequest, NextResponse } from 'next/server';
import { requireRbacUser } from '@/lib/rbac/server-guard';
import {
  getBusinessProfile,
  listRbacAuditLogs,
  updateBusinessProfile,
} from '@/lib/rbac/repository';
import { getRolePermissionMatrix } from '@/lib/rbac/domain';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await requireRbacUser();
    const { searchParams } = new URL(request.url);
    const limitParam = parseInt(searchParams.get('limit') || '100', 10);
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 100;

    const business = await getBusinessProfile(user);
    const canViewLogs = user.role === 'OWNER' || user.role === 'ADMIN';
    const auditLogs = canViewLogs ? await listRbacAuditLogs(user, limit) : [];

    return NextResponse.json({
      success: true,
      business,
      auditLogs,
      permissionMatrix: getRolePermissionMatrix(),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Lỗi lấy thông tin doanh nghiệp';
    let status = 400;
    if (msg.includes('UNAUTHORIZED')) status = 401;
    if (msg.includes('FORBIDDEN')) status = 403;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireRbacUser(['OWNER', 'ADMIN']);
    const body = await request.json();

    const updated = await updateBusinessProfile(user, {
      name: body.name,
      taxCode: body.taxCode,
      phone: body.phone,
      email: body.email,
      address: body.address,
      defaultReceiptFooter: body.defaultReceiptFooter,
    });

    return NextResponse.json({
      success: true,
      business: updated,
      message: `Đã cập nhật hồ sơ doanh nghiệp: ${updated.name}`,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Lỗi cập nhật hồ sơ doanh nghiệp';
    let status = 400;
    if (msg.includes('UNAUTHORIZED')) status = 401;
    if (msg.includes('FORBIDDEN')) status = 403;
    return NextResponse.json({ error: msg }, { status });
  }
}
