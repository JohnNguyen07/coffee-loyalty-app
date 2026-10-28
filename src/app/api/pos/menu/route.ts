import { NextResponse } from 'next/server';
import { verifyPosStaff } from '@/lib/auth-utils';
import { getPosMenuCatalog } from '@/lib/pos/repository';

export async function GET() {
  try {
    const staff = await verifyPosStaff();
    if (!staff) {
      return NextResponse.json(
        { error: 'Không có quyền truy cập quầy POS. Vui lòng đăng nhập tài khoản Nhân viên / Quản trị.' },
        { status: 403 }
      );
    }

    const catalog = await getPosMenuCatalog();
    return NextResponse.json({
      ...catalog,
      staff: {
        id: staff.id,
        fullName: staff.fullName,
        staffRole: staff.staffRole,
        locationName: staff.locationName,
      },
    });
  } catch (err) {
    console.error('GET /api/pos/menu error:', err);
    return NextResponse.json(
      { error: 'Không thể tải dữ liệu thực đơn POS.' },
      { status: 500 }
    );
  }
}

