import { NextRequest, NextResponse } from 'next/server';
import { verifyPosStaff } from '@/lib/auth-utils';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordGoodsReceipt, recordStockLoss } from '@/lib/inventory/repository';

const DEFAULT_WAREHOUSE_ID = '00000000-0000-0000-0000-000000000003';

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

    // 1. Handle Direct Stock Loss / Spoilage / Waste (Xuất hủy / Hao hụt)
    if (body.action === 'RECORD_LOSS') {
      const { warehouseId, itemId, quantity, lossType, reason } = body;
      const res = await recordStockLoss(
        {
          warehouseId: warehouseId || DEFAULT_WAREHOUSE_ID,
          itemId: String(itemId || ''),
          quantity: Number(quantity) || 0,
          lossType: lossType === 'OUT_EXPIRED' ? 'OUT_EXPIRED' : 'OUT_LOSS',
          reason: String(reason || 'Hao hụt vận hành').trim(),
        },
        staff
      );
      if (!res.success) {
        return NextResponse.json({ error: res.error }, { status: 400 });
      }
      return NextResponse.json({ success: true });
    }

    // 2. Create New Inventory Item (with optional initial stock!)
    const {
      sku,
      name,
      itemType,
      baseUnit,
      minStockLevel,
      costPrice,
      initialStock,
      expiryDate,
      linkedMenuItemId,
    } = body;

    if (!name || !itemType || !baseUnit) {
      return NextResponse.json(
        { error: 'Vui lòng điền đầy đủ Tên mặt hàng, Phân loại và Đơn vị tính.' },
        { status: 400 }
      );
    }

    // Auto-generate SKU if left blank so user doesn't have to invent codes
    const cleanSku =
      sku && String(sku).trim()
        ? String(sku).trim().toUpperCase()
        : `${itemType === 'packaging' ? 'PKG' : itemType === 'finished_good' ? 'FG' : 'NVL'}-${Date.now().toString().slice(-5)}`;

    const cleanUnit = String(baseUnit).trim().toLowerCase();
    const unitCost = Math.max(0, Number(costPrice) || 0);

    const adminClient = createAdminClient();
    const { data: newItem, error } = await adminClient
      .from('inventory_items')
      .insert({
        business_id: staff.businessId,
        sku: cleanSku,
        name: String(name).trim(),
        item_type: itemType,
        base_unit: cleanUnit,
        min_stock_level: Number(minStockLevel) || 0,
        cost_price: unitCost,
        linked_menu_item_id: linkedMenuItemId || null,
        is_active: true,
      })
      .select('*')
      .single();

    if (error || !newItem) {
      return NextResponse.json({ error: error?.message || 'Lỗi tạo mặt hàng.' }, { status: 500 });
    }

    // If user also provided initialStock > 0 right in the creation form, record an initial lot & FIFO cost layer immediately!
    const initQty = Number(initialStock) || 0;
    if (initQty > 0) {
      await recordGoodsReceipt(
        {
          warehouseId: DEFAULT_WAREHOUSE_ID,
          receiptNumber: `NK-INIT-${Date.now().toString().slice(-5)}`,
          supplierName: 'Tồn đầu kỳ khi tạo mặt hàng',
          receiptDate: new Date().toISOString().slice(0, 10),
          items: [
            {
              itemId: String(newItem.id),
              unit: cleanUnit,
              quantity: initQty,
              unitCost,
              expiryDate: expiryDate || undefined,
            },
          ],
        },
        staff
      );
    }

    return NextResponse.json({ success: true, item: newItem });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Lỗi xử lý tạo mặt hàng.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const staff = await verifyPosStaff();
  if (!staff) {
    return NextResponse.json({ error: 'Không có quyền thực hiện.' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { id, name, sku, itemType, baseUnit, minStockLevel, costPrice } = body;

    if (!id || !name) {
      return NextResponse.json({ error: 'Thiếu ID hoặc Tên mặt hàng.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const updates: Record<string, unknown> = {
      name: String(name).trim(),
      min_stock_level: Math.max(0, Number(minStockLevel) || 0),
      cost_price: Math.max(0, Number(costPrice) || 0),
    };
    if (sku) updates.sku = String(sku).trim().toUpperCase();
    if (itemType) updates.item_type = itemType;
    if (baseUnit) updates.base_unit = String(baseUnit).trim().toLowerCase();

    const { data: updated, error } = await adminClient
      .from('inventory_items')
      .update(updates)
      .eq('id', id)
      .eq('business_id', staff.businessId)
      .select('*')
      .single();

    if (error || !updated) {
      return NextResponse.json({ error: error?.message || 'Không thể cập nhật mặt hàng.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, item: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Lỗi cập nhật mặt hàng.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
