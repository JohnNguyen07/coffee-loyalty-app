import { NextRequest, NextResponse } from 'next/server';
import { verifyPosStaff } from '@/lib/auth-utils';
import { recordSimpleProduction } from '@/lib/inventory/repository';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const staff = await verifyPosStaff();
  if (!staff) {
    return NextResponse.json({ error: 'Không có quyền truy cập.' }, { status: 403 });
  }

  const adminClient = createAdminClient();
  const { data: recipes } = await adminClient
    .from('recipes')
    .select('*, recipe_items(*, ingredient:inventory_items(*))')
    .eq('business_id', staff.businessId)
    .eq('is_active', true);

  const { data: productionOrders } = await adminClient
    .from('production_orders')
    .select('*, finished_good:inventory_items(*)')
    .eq('business_id', staff.businessId)
    .order('created_at', { ascending: false })
    .limit(20);

  return NextResponse.json({
    recipes: recipes || [],
    productionOrders: productionOrders || [],
  });
}

export async function POST(request: NextRequest) {
  const staff = await verifyPosStaff();
  if (!staff) {
    return NextResponse.json({ error: 'Không có quyền thực hiện lệnh sản xuất.' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { warehouseId, orderCode, recipeId, actualQuantity, varianceReason, idempotencyKey } = body;

    if (!recipeId || !actualQuantity || Number(actualQuantity) <= 0) {
      return NextResponse.json({ error: 'Vui lòng chọn công thức và nhập sản lượng thực tế > 0.' }, { status: 400 });
    }

    const whId = warehouseId || '00000000-0000-0000-0000-000000000003';
    const code = orderCode?.trim() || `SX-${Date.now().toString().slice(-6)}`;

    const result = await recordSimpleProduction(
      {
        warehouseId: whId,
        orderCode: code,
        recipeId,
        actualQuantity: Number(actualQuantity),
        varianceReason,
        idempotencyKey,
      },
      staff
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, orderId: result.orderId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Lỗi máy chủ khi ghi nhận lệnh sản xuất.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

