import { NextRequest, NextResponse } from 'next/server';
import { verifyPosStaff } from '@/lib/auth-utils';
import { createPosOrder, listPosOrders, type CreatePosOrderPayload } from '@/lib/pos/repository';

// GET /api/pos/orders — Tra cứu danh sách đơn gần đây tại quầy
export async function GET(request: NextRequest) {
  try {
    const staff = await verifyPosStaff();
    if (!staff) {
      return NextResponse.json({ error: 'Không có quyền truy cập POS.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'ALL';
    const search = searchParams.get('search') || '';
    const date = searchParams.get('date') || '';
    const limit = parseInt(searchParams.get('limit') || '30', 10);

    const result = await listPosOrders({ status, search, date, limit });
    return NextResponse.json(result);
  } catch (err) {
    console.error('GET /api/pos/orders error:', err);
    return NextResponse.json({ error: 'Lỗi tải danh sách đơn hàng POS.' }, { status: 500 });
  }
}

// POST /api/pos/orders — Tạo đơn và xác nhận thanh toán tại quầy POS
export async function POST(request: NextRequest) {
  try {
    const staff = await verifyPosStaff();
    if (!staff) {
      return NextResponse.json({ error: 'Không có quyền tạo đơn POS.' }, { status: 403 });
    }

    const body = (await request.json()) as CreatePosOrderPayload;
    const result = await createPosOrder(body, staff);

    if (!result.success || !result.order) {
      return NextResponse.json(
        { error: result.error || 'Không thể tạo đơn hàng POS.' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      order: result.order,
    });
  } catch (err) {
    console.error('POST /api/pos/orders error:', err);
    return NextResponse.json(
      { error: 'Lỗi hệ thống khi xử lý thanh toán đơn hàng.' },
      { status: 500 }
    );
  }
}

