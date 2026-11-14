import { NextResponse } from 'next/server';
import { resolveUserRbac } from '@/lib/rbac/server-guard';
import { getBusinessProfile, listLocationsForUser } from '@/lib/rbac/repository';
import { getRolePermissionMatrix } from '@/lib/rbac/domain';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await resolveUserRbac();
    if (!user) {
      console.warn('GET /api/rbac/profile: No user resolved');
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    }

    const [locations, business] = await Promise.all([
      listLocationsForUser(user),
      getBusinessProfile(user),
    ]);

    const activeLocationId = user.assignedLocationIds[0] || locations[0]?.id || null;
    const activeLocation =
      locations.find((l) => l.id === activeLocationId) || locations[0] || null;

    return NextResponse.json({
      success: true,
      profile: user,
      business,
      locations,
      activeLocationId: activeLocation?.id || activeLocationId,
      activeLocation,
      permissionMatrix: getRolePermissionMatrix(),
    });
  } catch (error: unknown) {
    console.error('GET /api/rbac/profile ERROR:', error);
    const msg = error instanceof Error ? error.message : 'Lỗi kiểm tra thông tin phân quyền';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
