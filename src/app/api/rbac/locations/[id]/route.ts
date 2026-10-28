import { NextRequest, NextResponse } from 'next/server';
import { requireRbacUser } from '@/lib/rbac/server-guard';
import { updateLocation } from '@/lib/rbac/repository';

export const dynamic = 'force-dynamic';

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const user = await requireRbacUser(['OWNER', 'ADMIN']);
    const body = await request.json();

    const updated = await updateLocation(user, id, {
      name: body.name,
      address: body.address,
      phone: body.phone,
      isActive: body.isActive,
    });

    return NextResponse.json({
      success: true,
      location: updated,
      message: `Cập nhật điểm bán thành công: ${updated.name}`,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Lỗi cập nhật điểm bán';
    let status = 400;
    if (msg.includes('UNAUTHORIZED')) status = 401;
    if (msg.includes('FORBIDDEN')) status = 403;

    return NextResponse.json({ error: msg }, { status });
  }
}
