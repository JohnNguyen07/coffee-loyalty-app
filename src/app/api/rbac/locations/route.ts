import { NextRequest, NextResponse } from 'next/server';
import { requireRbacUser } from '@/lib/rbac/server-guard';
import { listLocationsForUser, createLocation } from '@/lib/rbac/repository';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await requireRbacUser();
    const locations = await listLocationsForUser(user);

    return NextResponse.json({
      success: true,
      locations,
      total: locations.length,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Lỗi lấy danh sách điểm bán';
    const status = msg.includes('UNAUTHORIZED') ? 401 : 403;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Only OWNER and ADMIN can create locations
    const user = await requireRbacUser(['OWNER', 'ADMIN']);
    const body = await request.json();

    const created = await createLocation(user, {
      code: body.code,
      name: body.name,
      address: body.address,
      phone: body.phone,
    });

    return NextResponse.json({
      success: true,
      location: created,
      message: `Đã tạo điểm bán thành công: ${created.name} (${created.code})`,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Lỗi tạo điểm bán mới';
    let status = 400;
    if (msg.includes('UNAUTHORIZED')) status = 401;
    if (msg.includes('FORBIDDEN')) status = 403;

    return NextResponse.json({ error: msg }, { status });
  }
}
