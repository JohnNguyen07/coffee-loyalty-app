import { NextRequest, NextResponse } from 'next/server';
import { verifyPosStaff } from '@/lib/auth-utils';
import {
  getRevenueReport,
  recordCashDrawerSession,
  type RevenueReportQuery,
} from '@/lib/revenue/repository';
import type { DateRangePreset } from '@/lib/revenue/domain';

// GET /api/revenue/summary — Tải báo cáo doanh thu & đối soát tiền mặt
export async function GET(request: NextRequest) {
  try {
    const staff = await verifyPosStaff();
    if (!staff) {
      return NextResponse.json(
        { error: 'Không có quyền truy cập báo cáo doanh thu.' },
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

// POST /api/revenue/summary — Ghi nhận phiên kiểm đếm & chốt két tiền mặt
export async function POST(request: NextRequest) {
  try {
    const staff = await verifyPosStaff();
    if (!staff) {
      return NextResponse.json(
        { error: 'Không có quyền ghi nhận kiểm đếm két.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const openingCash = Number(body.openingCash) || 0;
    const actualCash = Number(body.actualCash) || 0;
    const cashPayouts = Number(body.cashPayouts) || 0;
    const notes = typeof body.notes === 'string' ? body.notes : '';

    const result = await recordCashDrawerSession(
      { openingCash, actualCash, cashPayouts, notes },
      staff
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Lỗi lưu phiên két.' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error('POST /api/revenue/summary error:', err);
    return NextResponse.json(
      { error: 'Lỗi máy chủ khi chốt phiên kiểm đếm.' },
      { status: 500 }
    );
  }
}

