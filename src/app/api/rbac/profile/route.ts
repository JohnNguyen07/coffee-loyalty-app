import { NextResponse } from 'next/server';
import { resolveUserRbac } from '@/lib/rbac/server-guard';
import { listLocationsForUser } from '@/lib/rbac/repository';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await resolveUserRbac();
    if (!user) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    }

    const locations = await listLocationsForUser(user);

    return NextResponse.json({
      success: true,
      profile: user,
      locations,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Lỗi kiểm tra thông tin phân quyền';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
