import { NextRequest, NextResponse } from 'next/server';
import { verifyPosStaff } from '@/lib/auth-utils';
import { recordGoodsReceipt } from '@/lib/inventory/repository';

export async function POST(request: NextRequest) {
  const staff = await verifyPosStaff();
  if (!staff) {
    return NextResponse.json({ error: 'Không có quyền thực hiện nhập kho.' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { warehouseId, receiptNumber, supplierName, receiptDate, notes, idempotencyKey, items } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Phiếu nhập phải có ít nhất 1 dòng mặt hàng.' }, { status: 400 });
    }

    const whId = warehouseId || '00000000-0000-0000-0000-000000000003';
    const recNumber = receiptNumber?.trim() || `NK-${Date.now().toString().slice(-6)}`;

    const result = await recordGoodsReceipt(
      {
        warehouseId: whId,
        receiptNumber: recNumber,
        supplierName,
        receiptDate: receiptDate || new Date().toISOString().slice(0, 10),
        notes,
        idempotencyKey,
        items,
      },
      staff
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, receiptId: result.receiptId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Lỗi máy chủ khi ghi nhận phiếu nhập kho.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
