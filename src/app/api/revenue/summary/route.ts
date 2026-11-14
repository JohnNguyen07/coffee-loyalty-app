import { NextRequest, NextResponse } from 'next/server';
import { verifyPosStaff } from '@/lib/auth-utils';
import { canViewFinancialRevenue } from '@/lib/rbac/domain';
import {
  getRevenueReport,
  createCashTransaction,
  voidCashTransaction,
  openShiftSession,
  closeShiftSession,
  type RevenueReportQuery,
} from '@/lib/revenue/repository';
import type { DateRangePreset } from '@/lib/revenue/domain';

// GET /api/revenue/summary — Tải báo cáo doanh thu, sổ quỹ & ca bán hàng
export async function GET(request: NextRequest) {
  try {
    const staff = await verifyPosStaff();
    if (!staff) {
      return NextResponse.json(
        { error: 'Không có quyền truy cập báo cáo doanh thu.' },
        { status: 403 }
      );
    }
    if (!canViewFinancialRevenue(staff.staffRole)) {
      return NextResponse.json(
        { error: 'Vai trò của bạn không có quyền truy cập dữ liệu doanh thu và sổ quỹ cửa hàng.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const preset = (searchParams.get('preset') || 'TODAY') as DateRangePreset;
    const customFrom = searchParams.get('customFrom') || undefined;
    const customTo = searchParams.get('customTo') || undefined;
    const channel = (searchParams.get('channel') || 'ALL') as 'ALL' | 'POS' | 'WEB';

    const openingCash = searchParams.has('openingCash')
      ? parseInt(searchParams.get('openingCash') || '0', 10)
      : undefined;
    const actualCashCounted = searchParams.has('actualCashCounted')
      ? parseInt(searchParams.get('actualCashCounted') || '0', 10)
      : undefined;
    const cashPayouts = searchParams.has('cashPayouts')
      ? parseInt(searchParams.get('cashPayouts') || '0', 10)
      : undefined;

    const query: RevenueReportQuery = {
      preset,
      customFrom,
      customTo,
      channel,
      openingCash,
      actualCashCounted,
      cashPayouts,
    };

    const report = await getRevenueReport(query, staff);
    return NextResponse.json(report);
  } catch (err: unknown) {
    console.error('GET /api/revenue/summary error:', err);
    return NextResponse.json(
      { error: 'Lỗi máy chủ khi tạo báo cáo doanh thu.' },
      { status: 500 }
    );
  }
}

// POST /api/revenue/summary — Thao tác: Lập/Hủy phiếu Thu-Chi, Mở ca, Chốt ca & Két
export async function POST(request: NextRequest) {
  try {
    const staff = await verifyPosStaff();
    if (!staff) {
      return NextResponse.json(
        { error: 'Không có quyền thao tác sổ quỹ và két tiền.' },
        { status: 403 }
      );
    }
    if (!canViewFinancialRevenue(staff.staffRole)) {
      return NextResponse.json(
        { error: 'Vai trò của bạn không có quyền thao tác doanh thu và sổ quỹ cửa hàng.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const action = body.action || 'record_drawer';

    // 1. Tạo Phiếu Thu / Chi Sổ Quỹ
    if (action === 'create_transaction') {
      const { type, category, amount, paymentMethod, recipientPayer, notes, shiftId, idempotencyKey } = body;
      const res = await createCashTransaction(
        {
          type,
          category,
          amount: Number(amount) || 0,
          paymentMethod,
          recipientPayer: String(recipientPayer || ''),
          notes: typeof notes === 'string' ? notes : undefined,
          shiftId: typeof shiftId === 'string' ? shiftId : undefined,
          idempotencyKey: typeof idempotencyKey === 'string' ? idempotencyKey : undefined,
        },
        staff
      );
      if (!res.success) {
        return NextResponse.json({ error: res.error || 'Lỗi lập phiếu sổ quỹ.' }, { status: 400 });
      }
      return NextResponse.json({ success: true, transaction: res.transaction });
    }

    // 2. Hủy Phiếu Thu / Chi (Chuyển trạng thái VOIDED kèm lý do)
    if (action === 'void_transaction') {
      const { transactionId, reason } = body;
      const res = await voidCashTransaction(
        {
          transactionId: String(transactionId || ''),
          reason: String(reason || ''),
        },
        staff
      );
      if (!res.success) {
        return NextResponse.json({ error: res.error || 'Lỗi hủy phiếu sổ quỹ.' }, { status: 400 });
      }
      return NextResponse.json({ success: true, transaction: res.transaction });
    }

    // 3. Mở Ca Bán Hàng (Open Shift)
    if (action === 'open_shift') {
      const { shiftName, openingCash, notes, idempotencyKey } = body;
      const res = await openShiftSession(
        {
          shiftName: String(shiftName || 'Ca Sáng'),
          openingCash: Number(openingCash) || 0,
          notes: typeof notes === 'string' ? notes : undefined,
          idempotencyKey: typeof idempotencyKey === 'string' ? idempotencyKey : undefined,
        },
        staff
      );
      if (!res.success) {
        return NextResponse.json({ error: res.error || 'Lỗi mở ca bán hàng.' }, { status: 400 });
      }
      return NextResponse.json({ success: true, shift: res.shift });
    }

    // 4. Chốt Ca Bán Hàng & Bàn Giao (Close Shift)
    if (action === 'close_shift') {
      const { shiftId, actualCash, cashRetained, notes, denominations, idempotencyKey, autoRecordHandover } = body;
      const res = await closeShiftSession(
        {
          shiftId: typeof shiftId === 'string' ? shiftId : undefined,
          actualCash: Number(actualCash) || 0,
          cashRetained: Number(cashRetained) || 0,
          notes: typeof notes === 'string' ? notes : undefined,
          denominations,
          idempotencyKey: typeof idempotencyKey === 'string' ? idempotencyKey : undefined,
          autoRecordHandover: Boolean(autoRecordHandover),
        },
        staff
      );
      if (!res.success) {
        return NextResponse.json({ error: res.error || 'Lỗi chốt ca bán hàng.' }, { status: 400 });
      }
      return NextResponse.json({ success: true, shift: res.shift });
    }

    // 5. Fallback legacy count
    const openingCash = Number(body.openingCash) || 0;
    const actualCash = Number(body.actualCash) || 0;
    const notes = typeof body.notes === 'string' ? body.notes : '';

    const closeRes = await closeShiftSession(
      {
        actualCash,
        cashRetained: openingCash,
        notes: notes || undefined,
      },
      staff
    );

    if (!closeRes.success) {
      return NextResponse.json({ error: closeRes.error || 'Lỗi đối soát két.' }, { status: 400 });
    }
    return NextResponse.json({ success: true, shift: closeRes.shift });
  } catch (err: unknown) {
    console.error('POST /api/revenue/summary error:', err);
    return NextResponse.json(
      { error: 'Lỗi máy chủ khi xử lý giao dịch sổ quỹ.' },
      { status: 500 }
    );
  }
}
