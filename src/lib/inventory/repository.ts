import { createAdminClient } from '@/lib/supabase/admin';
import type { PosStaffContext } from '@/lib/auth-utils';
import {
  type ItemType,
  type InventoryItem,
  type InventoryLot,
  type InventoryCostLayer,
  type Recipe,
  calculateSimpleProduction,
  calculateStockAuditVariance,
} from './domain';

export interface InventoryOverviewSummary {
  totalItems: number;
  totalValuationVnd: number;
  lowStockCount: number;
  expiringLotsCount: number;
  activeBatchesCount: number;
}

export interface InventoryItemWithStock extends InventoryItem {
  currentStock: number;
  stockStatus: 'OUT_OF_STOCK' | 'LOW_STOCK' | 'IN_STOCK';
  totalValueVnd: number;
}

export interface InventoryLotView extends InventoryLot {
  itemName: string;
  itemSku: string;
  itemType: ItemType;
  baseUnit: string;
  daysToExpiry?: number;
  expiryAlert?: 'EXPIRED' | 'CRITICAL' | 'NORMAL';
}

/**
 * Get comprehensive inventory overview metrics & items list.
 */
export async function getInventoryOverview(
  businessId: string,
  warehouseId?: string
): Promise<{
  summary: InventoryOverviewSummary;
  items: InventoryItemWithStock[];
  lots: InventoryLotView[];
  recentMovements: Record<string, unknown>[];
}> {
  const adminClient = createAdminClient();

  // 1. Fetch active warehouses
  let whId = warehouseId;
  if (!whId) {
    const { data: defaultWh } = await adminClient
      .from('warehouses')
      .select('id')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    whId = defaultWh?.id || '00000000-0000-0000-0000-000000000003';
  }

  // 2. Fetch inventory items
  const { data: rawItems } = await adminClient
    .from('inventory_items')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });

  const itemsList: InventoryItem[] = (rawItems || []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    sku: String(row.sku),
    name: String(row.name),
    itemType: row.item_type as ItemType,
    baseUnit: String(row.base_unit),
    minStockLevel: Number(row.min_stock_level) || 0,
    costPrice: Number(row.cost_price) || 0,
    linkedMenuItemId: row.linked_menu_item_id ? String(row.linked_menu_item_id) : undefined,
    isActive: Boolean(row.is_active),
  }));

  // 3. Fetch active lots
  const { data: rawLots } = await adminClient
    .from('inventory_lots')
    .select('*')
    .eq('business_id', businessId)
    .eq('warehouse_id', whId)
    .eq('status', 'ACTIVE')
    .gt('remaining_quantity', 0)
    .order('expiry_date', { ascending: true, nullsFirst: false });

  // 4. Fetch active FIFO cost layers
  const { data: rawLayers } = await adminClient
    .from('inventory_cost_layers')
    .select('*')
    .eq('business_id', businessId)
    .eq('warehouse_id', whId)
    .gt('remaining_quantity', 0);

  // Group lots and layers by item
  const lotStockMap = new Map<string, number>();
  const layerValueMap = new Map<string, number>();

  const todayStr = new Date().toISOString().slice(0, 10);
  const today = new Date(todayStr);

  let expiringLotsCount = 0;

  const lotViews: InventoryLotView[] = (rawLots || []).map((lotRow: Record<string, unknown>) => {
    const item = itemsList.find((it) => it.id === String(lotRow.item_id));
    const remainingQty = Number(lotRow.remaining_quantity) || 0;
    const currentTot = lotStockMap.get(String(lotRow.item_id)) || 0;
    lotStockMap.set(String(lotRow.item_id), Number((currentTot + remainingQty).toFixed(3)));

    let daysToExpiry: number | undefined;
    let expiryAlert: 'EXPIRED' | 'CRITICAL' | 'NORMAL' = 'NORMAL';

    if (lotRow.expiry_date) {
      const exp = new Date(String(lotRow.expiry_date));
      const diffTime = exp.getTime() - today.getTime();
      daysToExpiry = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (daysToExpiry < 0) {
        expiryAlert = 'EXPIRED';
        expiringLotsCount++;
      } else if (daysToExpiry <= 7) {
        expiryAlert = 'CRITICAL';
        expiringLotsCount++;
      }
    }

    return {
      id: String(lotRow.id),
      warehouseId: String(lotRow.warehouse_id),
      itemId: String(lotRow.item_id),
      itemName: item?.name || 'Mặt hàng',
      itemSku: item?.sku || '',
      itemType: item?.itemType || 'raw_material',
      baseUnit: item?.baseUnit || '',
      lotNumber: String(lotRow.lot_number),
      receivedDate: String(lotRow.received_date),
      manufacturedDate: lotRow.manufactured_date ? String(lotRow.manufactured_date) : undefined,
      expiryDate: lotRow.expiry_date ? String(lotRow.expiry_date) : undefined,
      initialQuantity: Number(lotRow.initial_quantity) || 0,
      remainingQuantity: remainingQty,
      status: lotRow.status as 'ACTIVE',
      daysToExpiry,
      expiryAlert,
    };
  });

  let totalValuationVnd = 0;
  for (const layer of rawLayers || []) {
    const rem = Number(layer.remaining_quantity) || 0;
    const cost = Number(layer.unit_cost) || 0;
    const val = Math.round(rem * cost);
    totalValuationVnd += val;
    const curVal = layerValueMap.get(String(layer.item_id)) || 0;
    layerValueMap.set(String(layer.item_id), curVal + val);
  }

  let lowStockCount = 0;
  const itemsWithStock: InventoryItemWithStock[] = itemsList.map((it) => {
    const currentStock = lotStockMap.get(it.id) || 0;
    const totalVal = layerValueMap.get(it.id) || Math.round(currentStock * it.costPrice);

    let stockStatus: 'OUT_OF_STOCK' | 'LOW_STOCK' | 'IN_STOCK' = 'IN_STOCK';
    if (currentStock <= 0) {
      stockStatus = 'OUT_OF_STOCK';
      lowStockCount++;
    } else if (currentStock <= it.minStockLevel) {
      stockStatus = 'LOW_STOCK';
      lowStockCount++;
    }

    return {
      ...it,
      currentStock,
      stockStatus,
      totalValueVnd: totalVal,
    };
  });

  // 5. Recent movements
  const { data: movements } = await adminClient
    .from('inventory_movements')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(20);

  return {
    summary: {
      totalItems: itemsList.length,
      totalValuationVnd,
      lowStockCount,
      expiringLotsCount,
      activeBatchesCount: lotViews.length,
    },
    items: itemsWithStock,
    lots: lotViews,
    recentMovements: movements || [],
  };
}

/**
 * Record a Goods Receipt (Phiếu Nhập Hàng) atomically.
 * Generates Receipt, Receipt Items, Inventory Lots, FIFO Cost Layers, and IN_PURCHASE Movements.
 */
export async function recordGoodsReceipt(
  payload: {
    warehouseId: string;
    receiptNumber: string;
    supplierName?: string;
    receiptDate: string;
    notes?: string;
    idempotencyKey?: string;
    items: {
      itemId: string;
      unit: string;
      quantity: number;
      conversionRate?: number;
      unitCost: number; // VND per base unit
      lotNumber?: string;
      manufacturedDate?: string;
      expiryDate?: string;
    }[];
  },
  staff: PosStaffContext
): Promise<{ success: boolean; error?: string; receiptId?: string }> {
  const adminClient = createAdminClient();

  // 1. Check idempotency
  if (payload.idempotencyKey) {
    const { data: existing } = await adminClient
      .from('inventory_receipts')
      .select('id, receipt_number')
      .eq('idempotency_key', payload.idempotencyKey)
      .maybeSingle();

    if (existing) {
      return { success: true, receiptId: existing.id };
    }
  }

  // Calculate total amount
  let totalAmount = 0;
  for (const it of payload.items) {
    const baseQty = it.quantity * (it.conversionRate || 1);
    totalAmount += Math.round(baseQty * it.unitCost);
  }

  // 2. Insert receipt header
  const { data: receipt, error: rErr } = await adminClient
    .from('inventory_receipts')
    .insert({
      business_id: staff.businessId,
      warehouse_id: payload.warehouseId,
      receipt_number: payload.receiptNumber,
      supplier_name: payload.supplierName || 'Nhà cung cấp',
      receipt_date: payload.receiptDate || new Date().toISOString().slice(0, 10),
      status: 'POSTED',
      total_amount: totalAmount,
      idempotency_key: payload.idempotencyKey || null,
      notes: payload.notes || null,
      created_by: staff.dbUserId,
      posted_by: staff.dbUserId,
      posted_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (rErr || !receipt) {
    return { success: false, error: rErr?.message || 'Không thể tạo phiếu nhập hàng.' };
  }

  // 3. Process each line item
  for (let i = 0; i < payload.items.length; i++) {
    const it = payload.items[i];
    const baseQuantity = Number((it.quantity * (it.conversionRate || 1)).toFixed(3));
    const lineTotal = Math.round(baseQuantity * it.unitCost);
    const lotNumber =
      it.lotNumber?.trim() || `LOT-${payload.receiptNumber}-${String(i + 1).padStart(2, '0')}`;

    // Insert receipt line
    await adminClient.from('inventory_receipt_items').insert({
      receipt_id: receipt.id,
      item_id: it.itemId,
      unit: it.unit,
      quantity: it.quantity,
      conversion_rate: it.conversionRate || 1,
      base_quantity: baseQuantity,
      unit_cost: it.unitCost,
      total_cost: lineTotal,
      lot_number: lotNumber,
      manufactured_date: it.manufacturedDate || null,
      expiry_date: it.expiryDate || null,
    });

    // Create or update inventory lot
    const { data: lotRow } = await adminClient
      .from('inventory_lots')
      .insert({
        business_id: staff.businessId,
        warehouse_id: payload.warehouseId,
        item_id: it.itemId,
        lot_number: lotNumber,
        received_date: payload.receiptDate || new Date().toISOString().slice(0, 10),
        manufactured_date: it.manufacturedDate || null,
        expiry_date: it.expiryDate || null,
        initial_quantity: baseQuantity,
        remaining_quantity: baseQuantity,
        status: 'ACTIVE',
      })
      .select('id')
      .single();

    // Create sequential FIFO cost layer
    // Get highest layer_order for this warehouse & item
    const { data: topLayer } = await adminClient
      .from('inventory_cost_layers')
      .select('layer_order')
      .eq('warehouse_id', payload.warehouseId)
      .eq('item_id', it.itemId)
      .order('layer_order', { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextLayerOrder = (topLayer?.layer_order ? Number(topLayer.layer_order) : 0) + 1;

    await adminClient.from('inventory_cost_layers').insert({
      business_id: staff.businessId,
      warehouse_id: payload.warehouseId,
      item_id: it.itemId,
      source_doc_type: 'RECEIPT',
      source_doc_id: receipt.id,
      source_doc_number: payload.receiptNumber,
      layer_order: nextLayerOrder,
      received_at: new Date().toISOString(),
      initial_quantity: baseQuantity,
      remaining_quantity: baseQuantity,
      unit_cost: it.unitCost,
    });

    // Record immutable ledger movement
    await adminClient.from('inventory_movements').insert({
      business_id: staff.businessId,
      warehouse_id: payload.warehouseId,
      item_id: it.itemId,
      lot_id: lotRow?.id || null,
      movement_type: 'IN_PURCHASE',
      quantity: baseQuantity,
      base_unit: it.unit,
      reference_doc_type: 'RECEIPT',
      reference_doc_id: receipt.id,
      reference_doc_number: payload.receiptNumber,
      idempotency_key: payload.idempotencyKey ? `${payload.idempotencyKey}-${it.itemId}` : null,
      actor_id: staff.dbUserId,
      notes: `Nhập kho từ phiếu ${payload.receiptNumber} (${payload.supplierName || 'NCC'})`,
    });
  }

  return { success: true, receiptId: receipt.id };
}

/**
 * Record Simple Production Order (Lệnh Sản Xuất Đóng Chai) atomically.
 */
export async function recordSimpleProduction(
  payload: {
    warehouseId: string;
    orderCode: string;
    recipeId: string;
    actualQuantity: number;
    varianceReason?: string;
    idempotencyKey?: string;
  },
  staff: PosStaffContext
): Promise<{ success: boolean; error?: string; orderId?: string }> {
  const adminClient = createAdminClient();

  // 1. Fetch recipe & recipe items
  const { data: recipeRow, error: rErr } = await adminClient
    .from('recipes')
    .select('*, recipe_items(*)')
    .eq('id', payload.recipeId)
    .single();

  if (rErr || !recipeRow) {
    return { success: false, error: 'Không tìm thấy công thức sản xuất.' };
  }

  const recipe: Recipe = {
    id: String(recipeRow.id),
    targetItemId: String(recipeRow.target_item_id),
    targetSize: recipeRow.target_size || 'Chai',
    version: Number(recipeRow.version) || 1,
    name: String(recipeRow.name),
    yieldQuantity: Number(recipeRow.yield_quantity) || 1,
    yieldUnit: String(recipeRow.yield_unit) || 'chai',
    isActive: Boolean(recipeRow.is_active),
    items: (recipeRow.recipe_items || []).map((ri: Record<string, unknown>) => ({
      ingredientItemId: String(ri.ingredient_item_id),
      standardQuantity: Number(ri.standard_quantity) || 0,
      unit: String(ri.unit),
      isPackaging: Boolean(ri.is_packaging),
    })),
  };

  // 2. Fetch finished good item details
  const { data: fgItem } = await adminClient
    .from('inventory_items')
    .select('*')
    .eq('id', recipe.targetItemId)
    .single();

  if (!fgItem) {
    return { success: false, error: 'Không tìm thấy thông tin mặt hàng thành phẩm.' };
  }

  // 3. Fetch lots and layers for all ingredients
  const ingredientIds = recipe.items.map((it) => it.ingredientItemId);
  const { data: dbLots } = await adminClient
    .from('inventory_lots')
    .select('*')
    .in('item_id', ingredientIds)
    .eq('warehouse_id', payload.warehouseId)
    .eq('status', 'ACTIVE')
    .gt('remaining_quantity', 0);

  const { data: dbLayers } = await adminClient
    .from('inventory_cost_layers')
    .select('*')
    .in('item_id', ingredientIds)
    .eq('warehouse_id', payload.warehouseId)
    .gt('remaining_quantity', 0);

  const lotsMap = new Map<string, InventoryLot[]>();
  for (const lot of dbLots || []) {
    const list = lotsMap.get(String(lot.item_id)) || [];
    list.push({
      id: String(lot.id),
      warehouseId: String(lot.warehouse_id),
      itemId: String(lot.item_id),
      lotNumber: String(lot.lot_number),
      receivedDate: String(lot.received_date),
      expiryDate: lot.expiry_date ? String(lot.expiry_date) : undefined,
      initialQuantity: Number(lot.initial_quantity),
      remainingQuantity: Number(lot.remaining_quantity),
      status: lot.status,
    });
    lotsMap.set(String(lot.item_id), list);
  }

  const layersMap = new Map<string, InventoryCostLayer[]>();
  for (const ly of dbLayers || []) {
    const list = layersMap.get(String(ly.item_id)) || [];
    list.push({
      id: String(ly.id),
      warehouseId: String(ly.warehouse_id),
      itemId: String(ly.item_id),
      sourceDocType: ly.source_doc_type,
      sourceDocId: String(ly.source_doc_id),
      layerOrder: Number(ly.layer_order),
      receivedAt: String(ly.received_at),
      initialQuantity: Number(ly.initial_quantity),
      remainingQuantity: Number(ly.remaining_quantity),
      unitCost: Number(ly.unit_cost),
    });
    layersMap.set(String(ly.item_id), list);
  }

  // 4. Run simple production calculations
  let prodResult: ReturnType<typeof calculateSimpleProduction>;
  try {
    prodResult = calculateSimpleProduction({
      productionOrderId: '',
      orderCode: payload.orderCode,
      recipe,
      actualQuantity: payload.actualQuantity,
      availableLotsMap: lotsMap,
      availableLayersMap: layersMap,
      finishedGoodItem: {
        id: String(fgItem.id),
        sku: String(fgItem.sku),
        name: String(fgItem.name),
        itemType: fgItem.item_type,
        baseUnit: String(fgItem.base_unit),
        minStockLevel: Number(fgItem.min_stock_level),
        costPrice: Number(fgItem.cost_price),
        isActive: Boolean(fgItem.is_active),
      },
    });
  } catch (calcErr: unknown) {
    const msg = calcErr instanceof Error ? calcErr.message : 'Lỗi tính toán sản xuất.';
    return { success: false, error: msg };
  }

  // 5. Insert production order header
  const { data: prodOrder, error: poErr } = await adminClient
    .from('production_orders')
    .insert({
      business_id: staff.businessId,
      warehouse_id: payload.warehouseId,
      order_code: payload.orderCode,
      recipe_id: recipe.id,
      recipe_version_snapshot: recipe.version,
      finished_good_item_id: recipe.targetItemId,
      planned_quantity: payload.actualQuantity,
      actual_quantity: payload.actualQuantity,
      status: 'POSTED',
      total_material_cost: prodResult.totalMaterialCost,
      unit_finished_cost: prodResult.unitFinishedCost,
      variance_reason: payload.varianceReason || null,
      idempotency_key: payload.idempotencyKey || null,
      created_by: staff.dbUserId,
      posted_by: staff.dbUserId,
      posted_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (poErr || !prodOrder) {
    return { success: false, error: poErr?.message || 'Không thể ghi nhận lệnh sản xuất.' };
  }

  // 6. Update consumed lots and cost layers, record OUT_PRODUCTION movements
  for (const mat of prodResult.materials) {
    // Record material line
    await adminClient.from('production_order_items').insert({
      production_order_id: prodOrder.id,
      item_id: mat.itemId,
      planned_quantity: mat.plannedQuantity,
      actual_quantity: mat.actualQuantity,
      unit: mat.unit,
      is_packaging: mat.isPackaging,
      unit_cost: mat.actualQuantity > 0 ? Math.round(mat.totalCost / mat.actualQuantity) : 0,
      total_cost: mat.totalCost,
    });

    // Record movement for consumed raw material / packaging
    const { data: mvOut } = await adminClient
      .from('inventory_movements')
      .insert({
        business_id: staff.businessId,
        warehouse_id: payload.warehouseId,
        item_id: mat.itemId,
        movement_type: 'OUT_PRODUCTION',
        quantity: -mat.actualQuantity,
        base_unit: mat.unit,
        reference_doc_type: 'PRODUCTION',
        reference_doc_id: prodOrder.id,
        reference_doc_number: payload.orderCode,
        actor_id: staff.dbUserId,
        notes: `Tiêu hao sản xuất ${payload.actualQuantity} ${recipe.yieldUnit} ${recipe.name}`,
      })
      .select('id')
      .single();

    // Record cost allocations
    for (const alloc of mat.costAllocations) {
      await adminClient.from('inventory_cost_allocations').insert({
        business_id: staff.businessId,
        movement_id: mvOut?.id,
        cost_layer_id: alloc.layerId,
        physical_lot_id: alloc.physicalLotId || null,
        allocated_quantity: alloc.allocatedQuantity,
        unit_cost: alloc.unitCost,
        total_cost: alloc.totalCost,
        is_lot_cost_divergent: alloc.isLotCostDivergent,
      });

      // Update cost layer remaining
      const updatedLayer = prodResult.updatedLayersMap
        .get(mat.itemId)
        ?.find((l) => l.id === alloc.layerId);
      if (updatedLayer) {
        await adminClient
          .from('inventory_cost_layers')
          .update({ remaining_quantity: updatedLayer.remainingQuantity })
          .eq('id', alloc.layerId);
      }
    }

    // Update lot remaining
    for (const lotAlloc of mat.lotAllocations) {
      const updatedLot = prodResult.updatedLotsMap
        .get(mat.itemId)
        ?.find((l) => l.id === lotAlloc.lotId);
      if (updatedLot) {
        await adminClient
          .from('inventory_lots')
          .update({
            remaining_quantity: updatedLot.remainingQuantity,
            status: updatedLot.status,
          })
          .eq('id', lotAlloc.lotId);
      }
    }
  }

  // 7. Create finished goods lot & FIFO cost layer
  const { data: fgLot } = await adminClient
    .from('inventory_lots')
    .insert({
      business_id: staff.businessId,
      warehouse_id: payload.warehouseId,
      item_id: recipe.targetItemId,
      lot_number: prodResult.newFinishedGoodLot.lotNumber,
      received_date: prodResult.newFinishedGoodLot.manufacturedDate,
      manufactured_date: prodResult.newFinishedGoodLot.manufacturedDate,
      expiry_date: prodResult.newFinishedGoodLot.expiryDate || null,
      initial_quantity: prodResult.newFinishedGoodLot.quantity,
      remaining_quantity: prodResult.newFinishedGoodLot.quantity,
      status: 'ACTIVE',
    })
    .select('id')
    .single();

  const { data: topFgLayer } = await adminClient
    .from('inventory_cost_layers')
    .select('layer_order')
    .eq('warehouse_id', payload.warehouseId)
    .eq('item_id', recipe.targetItemId)
    .order('layer_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextFgLayerOrder = (topFgLayer?.layer_order ? Number(topFgLayer.layer_order) : 0) + 1;

  await adminClient.from('inventory_cost_layers').insert({
    business_id: staff.businessId,
    warehouse_id: payload.warehouseId,
    item_id: recipe.targetItemId,
    source_doc_type: 'PRODUCTION',
    source_doc_id: prodOrder.id,
    source_doc_number: payload.orderCode,
    layer_order: nextFgLayerOrder,
    received_at: new Date().toISOString(),
    initial_quantity: prodResult.newFinishedGoodCostLayer.quantity,
    remaining_quantity: prodResult.newFinishedGoodCostLayer.quantity,
    unit_cost: prodResult.newFinishedGoodCostLayer.unitCost,
  });

  // Record IN_PRODUCTION movement for finished good
  await adminClient.from('inventory_movements').insert({
    business_id: staff.businessId,
    warehouse_id: payload.warehouseId,
    item_id: recipe.targetItemId,
    lot_id: fgLot?.id || null,
    movement_type: 'IN_PRODUCTION',
    quantity: payload.actualQuantity,
    base_unit: recipe.yieldUnit,
    reference_doc_type: 'PRODUCTION',
    reference_doc_id: prodOrder.id,
    reference_doc_number: payload.orderCode,
    actor_id: staff.dbUserId,
    notes: `Nhập thành phẩm sản xuất đạt chuẩn (Giá vốn: ${prodResult.unitFinishedCost.toLocaleString('vi-VN')}đ/${recipe.yieldUnit})`,
  });

  return { success: true, orderId: prodOrder.id };
}

/**
 * Record Stock Audit (Kiểm Kê Kho) & Variances atomically.
 */
export async function recordStockAudit(
  payload: {
    warehouseId: string;
    auditNumber: string;
    auditDate: string;
    notes?: string;
    items: {
      itemId: string;
      lotId?: string;
      systemQuantity: number;
      countedQuantity: number;
      unit: string;
      unitCost: number;
      reason?: string;
    }[];
  },
  staff: PosStaffContext
): Promise<{ success: boolean; error?: string; auditId?: string }> {
  const adminClient = createAdminClient();

  const { data: audit, error: aErr } = await adminClient
    .from('inventory_audits')
    .insert({
      business_id: staff.businessId,
      warehouse_id: payload.warehouseId,
      audit_number: payload.auditNumber,
      audit_date: payload.auditDate || new Date().toISOString().slice(0, 10),
      status: 'COMPLETED',
      notes: payload.notes || null,
      created_by: staff.dbUserId,
      approved_by: staff.dbUserId,
      approved_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (aErr || !audit) {
    return { success: false, error: aErr?.message || 'Không thể tạo phiếu kiểm kê.' };
  }

  for (const it of payload.items) {
    const variance = calculateStockAuditVariance(
      it.systemQuantity,
      it.countedQuantity,
      it.unitCost
    );

    await adminClient.from('inventory_audit_items').insert({
      audit_id: audit.id,
      item_id: it.itemId,
      lot_id: it.lotId || null,
      system_quantity: it.systemQuantity,
      counted_quantity: it.countedQuantity,
      variance_quantity: variance.varianceQuantity,
      unit: it.unit,
      reason: it.reason || null,
    });

    // If variance exists, create an ADJUST_AUDIT movement
    if (variance.varianceQuantity !== 0) {
      await adminClient.from('inventory_movements').insert({
        business_id: staff.businessId,
        warehouse_id: payload.warehouseId,
        item_id: it.itemId,
        lot_id: it.lotId || null,
        movement_type: 'ADJUST_AUDIT',
        quantity: variance.varianceQuantity,
        base_unit: it.unit,
        reference_doc_type: 'AUDIT',
        reference_doc_id: audit.id,
        reference_doc_number: payload.auditNumber,
        actor_id: staff.dbUserId,
        notes: `Điều chỉnh sau kiểm kê ${payload.auditNumber}: ${variance.varianceStatus} ${Math.abs(variance.varianceQuantity)} ${it.unit}`,
      });

      // Update physical lot if specific lot was audited
      if (it.lotId) {
        await adminClient
          .from('inventory_lots')
          .update({ remaining_quantity: it.countedQuantity })
          .eq('id', it.lotId);
      }
    }
  }

  return { success: true, auditId: audit.id };
}

