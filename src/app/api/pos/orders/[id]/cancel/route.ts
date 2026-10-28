import { NextRequest, NextResponse } from 'next/server';
import { verifyPosStaff } from '@/lib/auth-utils';
import { cancelPosOrder } from '@/lib/pos/repository';

// POST /api/pos/orders/[id]/cancel — Hủy đơn theo quyền (kèm lý do bắt buộc & hoàn điểm)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const staff = await verifyPosStaff();
    if (!staff) {
      return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này.' }, { status: 403 });
    }

    const body = await request.json();
    const cancelReason = typeof body?.reason === 'string' ? body.reason : '';

    const result = await cancelPosOrder({
      orderId: id,
      cancelReason,
      staff,
    });

    if (!result.success || !result.order) {
      return NextResponse.json(
        { error: result.error || 'Không thể hủy đơn hàng.' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      order: result.order,
    });
  } catch (err) {
    console.error('POST /api/pos/orders/[id]/cancel error:', err);
    return NextResponse.json(
      { error: 'Lỗi hệ thống khi hủy đơn hàng.' },
      { status: 500 }
    );
  }
}

