import { NextRequest, NextResponse } from 'next/server';
import { verifyPosStaff } from '@/lib/auth-utils';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const staff = await verifyPosStaff();
  if (!staff) {
    return NextResponse.json({ error: 'Không có quyền truy cập.' }, { status: 403 });
  }

  const adminClient = createAdminClient();
  const { data: items, error } = await adminClient
    .from('inventory_items')
    .select('*')
    .eq('business_id', staff.businessId)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: items || [] });
}

export async function POST(request: NextRequest) {
  const staff = await verifyPosStaff();
  if (!staff) {
    return NextResponse.json({ error: 'Không có quyền thực hiện.' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { sku, name, itemType, baseUnit, minStockLevel, costPrice, linkedMenuItemId } = body;

    if (!sku || !name || !itemType || !baseUnit) {
      return NextResponse.json(
        { error: 'Vui lòng điền đầy đủ SKU, tên mặt hàng, phân loại và đơn vị cơ sở.' },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();
    const { data: newItem, error } = await adminClient
      .from('inventory_items')
      .insert({
        business_id: staff.businessId,
        sku: String(sku).trim().toUpperCase(),
        name: String(name).trim(),
        item_type: itemType,
        base_unit: String(baseUnit).trim().toLowerCase(),
        min_stock_level: Number(minStockLevel) || 0,
        cost_price: Number(costPrice) || 0,
        linked_menu_item_id: linkedMenuItemId || null,
        is_active: true,
      })
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, item: newItem });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Lỗi xử lý tạo mặt hàng.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
