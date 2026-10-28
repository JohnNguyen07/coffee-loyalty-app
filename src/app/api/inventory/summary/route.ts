import { NextRequest, NextResponse } from 'next/server';
import { verifyPosStaff } from '@/lib/auth-utils';
import { getInventoryOverview } from '@/lib/inventory/repository';

export async function GET(request: NextRequest) {
  const staff = await verifyPosStaff();
  if (!staff) {
    return NextResponse.json(
      { error: 'Không có quyền truy cập dữ liệu kho hàng.' },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const warehouseId = searchParams.get('warehouseId') || undefined;

    const data = await getInventoryOverview(staff.businessId, warehouseId);

    return NextResponse.json({
      success: true,
      staff: {
        fullName: staff.fullName,
        staffRole: staff.staffRole,
        locationName: staff.locationName,
      },
      ...data,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Lỗi máy chủ khi lấy dữ liệu kho.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
