import { NextRequest, NextResponse } from 'next/server';
import { requireRbacUser } from '@/lib/rbac/server-guard';
import { listLocationsForUser } from '@/lib/rbac/repository';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const user = await requireRbacUser();
    const body = await request.json();
    const { locationId } = body;

    if (!locationId) {
      return NextResponse.json({ error: 'Vui lòng cung cấp locationId.' }, { status: 400 });
    }

    const accessibleLocations = await listLocationsForUser(user);
    const targetLoc = accessibleLocations.find((l) => l.id === locationId);

    if (!targetLoc) {
      return NextResponse.json(
        { error: 'FORBIDDEN_LOCATION_ACCESS: Bạn không có quyền truy cập điểm bán này.' },
        { status: 403 }
      );
    }

    const res = NextResponse.json({
      success: true,
      activeLocation: targetLoc,
      message: `Đã chuyển điểm bán làm việc sang: ${targetLoc.name}`,
    });

    const cookieOpts = {
      path: '/',
      sameSite: 'lax' as const,
      maxAge: 60 * 60 * 24 * 30, // 30 days
    };
    res.cookies.set('ulab_active_location_id', targetLoc.id, cookieOpts);
    res.cookies.set('ulab_active_location_name', targetLoc.name, cookieOpts);

    return res;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Lỗi chuyển đổi điểm bán';
    let status = 400;
    if (msg.includes('UNAUTHORIZED')) status = 401;
    if (msg.includes('FORBIDDEN')) status = 403;

    return NextResponse.json({ error: msg }, { status });
  }
}
