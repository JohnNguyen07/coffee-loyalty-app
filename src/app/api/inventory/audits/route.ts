import { NextRequest, NextResponse } from 'next/server';
import { verifyPosStaff } from '@/lib/auth-utils';
import { recordStockAudit } from '@/lib/inventory/repository';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const staff = await verifyPosStaff();
  if (!staff) {
    return NextResponse.json({ error: 'Không có quyền truy cập.' }, { status: 403 });
  }

  const adminClient = createAdminClient();
  const { data: audits } = await adminClient
    .from('inventory_audits')
    .select('*, items:inventory_audit_items(*, item:inventory_items(*))')
    .eq('business_id', staff.businessId)
    .order('created_at', { ascending: false })
    .limit(20);

  return NextResponse.json({ audits: audits || [] });
}

export async function POST(request: NextRequest) {
  const staff = await verifyPosStaff();
  if (!staff) {
    return NextResponse.json({ error: 'Không có quyền thực hiện kiểm kê kho.' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { warehouseId, auditNumber, auditDate, notes, items } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Phiếu kiểm kê phải có ít nhất 1 dòng mặt hàng.' }, { status: 400 });
    }

    const whId = warehouseId || '00000000-0000-0000-0000-000000000003';
    const num = auditNumber?.trim() || `KK-${Date.now().toString().slice(-6)}`;

    const result = await recordStockAudit(
      {
        warehouseId: whId,
        auditNumber: num,
        auditDate: auditDate || new Date().toISOString().slice(0, 10),
        notes,
        items,
      },
      staff
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, auditId: result.auditId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Lỗi máy chủ khi ghi nhận kiểm kê kho.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

