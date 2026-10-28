import { NextRequest, NextResponse } from 'next/server';
import { requireRbacUser } from '@/lib/rbac/server-guard';
import { listStaffMembers, assignStaffRoleAndLocations } from '@/lib/rbac/repository';
import { type MvpRole } from '@/lib/rbac/domain';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await requireRbacUser(['OWNER', 'ADMIN']);
    const staff = await listStaffMembers(user);

    return NextResponse.json({
      success: true,
      staff,
      total: staff.length,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Lỗi lấy danh sách nhân viên';
    const status = msg.includes('UNAUTHORIZED') ? 401 : 403;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Only OWNER and ADMIN can assign staff permissions
    const user = await requireRbacUser(['OWNER', 'ADMIN']);
    const body = await request.json();

    const { targetUserId, targetRole, locationIds } = body;

    if (!targetUserId || !targetRole) {
      return NextResponse.json(
        { error: 'Vui lòng cung cấp targetUserId và targetRole hợp lệ.' },
        { status: 400 }
      );
    }

    await assignStaffRoleAndLocations(
      user,
      targetUserId,
      targetRole as MvpRole,
      Array.isArray(locationIds) ? locationIds : []
    );

    return NextResponse.json({
      success: true,
      message: `Đã phân quyền thành công vai trò ${targetRole} cho nhân viên.`,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Lỗi phân quyền nhân viên';
    let status = 400;
    if (msg.includes('UNAUTHORIZED')) status = 401;
    if (msg.includes('FORBIDDEN')) status = 403;

    return NextResponse.json({ error: msg }, { status });
  }
}
