import { NextRequest, NextResponse } from 'next/server';
import { requireRbacUser } from '@/lib/rbac/server-guard';
import {
  listStaffMembers,
  assignStaffRoleAndLocations,
  createStaffMember,
  toggleStaffStatus,
  revokeStaffMember,
  resetStaffPassword,
} from '@/lib/rbac/repository';
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
    const user = await requireRbacUser(['OWNER', 'ADMIN']);
    const body = await request.json();
    const action = body.action || 'update';

    if (action === 'create') {
      const created = await createStaffMember(user, {
        fullName: body.fullName,
        role: body.role as MvpRole,
        email: body.email,
        phone: body.phone,
        locationIds: Array.isArray(body.locationIds) ? body.locationIds : [],
        initialPassword: body.initialPassword,
      });

      return NextResponse.json({
        success: true,
        staff: created,
        message: `Đã thêm nhân viên mới thành công: ${created.fullName} (${created.role})`,
      });
    }

    if (action === 'reset_password') {
      const { targetUserId, newPassword } = body;
      if (!targetUserId || !newPassword) {
        return NextResponse.json(
          { error: 'Vui lòng cung cấp nhân viên và mật khẩu mới.' },
          { status: 400 }
        );
      }
      const res = await resetStaffPassword(user, targetUserId, String(newPassword));
      return NextResponse.json({
        success: true,
        provisioned: res.provisioned,
        message: `Đã đặt lại mật khẩu đăng nhập cho nhân viên ${res.fullName}.`,
      });
    }

    if (action === 'toggle') {
      const { targetUserId, isActive } = body;
      await toggleStaffStatus(user, targetUserId, Boolean(isActive));
      return NextResponse.json({
        success: true,
        message: `Đã ${isActive ? 'kích hoạt' : 'tạm khóa'} tài khoản nhân viên.`,
      });
    }

    if (action === 'revoke') {
      const { targetUserId } = body;
      await revokeStaffMember(user, targetUserId);
      return NextResponse.json({
        success: true,
        message: 'Đã hủy quyền và xóa nhân viên khỏi hệ thống.',
      });
    }

    // Default: update role, locations, and optional contact info
    const { targetUserId, targetRole, locationIds, fullName, email, phone } = body;
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
      Array.isArray(locationIds) ? locationIds : [],
      fullName !== undefined || email !== undefined || phone !== undefined
        ? { fullName, email, phone }
        : undefined
    );

    return NextResponse.json({
      success: true,
      message: `Đã cập nhật thông tin & phân quyền (${targetRole}) cho nhân viên.`,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Lỗi xử lý nghiệp vụ nhân sự';
    let status = 400;
    if (msg.includes('UNAUTHORIZED')) status = 401;
    if (msg.includes('FORBIDDEN')) status = 403;

    return NextResponse.json({ error: msg }, { status });
  }
}
