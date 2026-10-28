import { createAdminClient } from '@/lib/supabase/admin';
import type { NormalizedPosOrderItem } from '@/lib/pos/domain';
import {
  type InventoryItem,
  type InventoryLot,
  type InventoryCostLayer,
  type Recipe,
  deductPosOrderItem,
  reversePosOrderDeductions,
} from './domain';

/**
 * Automatically process inventory deductions for a newly created POS Order.
 * - Made-to-order drinks: deduct raw materials & packaging via active approved recipe.
 * - Bottled drinks: deduct finished goods directly by bottles sold (NEVER deduct raw materials a second time).
 * - Records `pos_order_deductions` and `OUT_SALE_POS` ledger movements.
 */
export async function processPosOrderInventory(
  orderId: string,
  businessId: string,
  locationId: string,
  items: NormalizedPosOrderItem[],
  staffUserId?: string | null
): Promise<{ success: boolean; totalCogs: number; deductedCount: number }> {
  const adminClient = createAdminClient();

  // 1. Resolve warehouse for this location
  const { data: wh } = await adminClient
    .from('warehouses')
    .select('id')
    .eq('business_id', businessId)
    .eq('location_id', locationId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  const warehouseId = wh?.id || '00000000-0000-0000-0000-000000000003';

  // 2. Fetch all active inventory items
  const { data: dbItems } = await adminClient
    .from('inventory_items')
    .select('*')
    .eq('business_id', businessId)
    .eq('is_active', true);

  const inventoryItems = (dbItems || []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    sku: String(row.sku),
    name: String(row.name),
    itemType: row.item_type,
    baseUnit: String(row.base_unit),
    minStockLevel: Number(row.min_stock_level) || 0,
    costPrice: Number(row.cost_price) || 0,
    linkedMenuItemId: row.linked_menu_item_id ? String(row.linked_menu_item_id) : undefined,
    isActive: Boolean(row.is_active),
  })) as InventoryItem[];

  // 3. Fetch all active recipes
  const { data: dbRecipes } = await adminClient
    .from('recipes')
    .select('*, recipe_items(*)')
    .eq('business_id', businessId)
    .eq('is_active', true);

  const recipes = (dbRecipes || []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    targetItemId: String(r.target_item_id),
    targetSize: r.target_size ? String(r.target_size) : undefined,
    version: Number(r.version) || 1,
    name: String(r.name),
    yieldQuantity: Number(r.yield_quantity) || 1,
    yieldUnit: String(r.yield_unit) || 'ly',
    isActive: Boolean(r.is_active),
    items: (Array.isArray(r.recipe_items) ? (r.recipe_items as Record<string, unknown>[]) : []).map((ri: Record<string, unknown>) => ({
      ingredientItemId: String(ri.ingredient_item_id),
      standardQuantity: Number(ri.standard_quantity) || 0,
      unit: String(ri.unit),
      isPackaging: Boolean(ri.is_packaging),
    })),
  })) as Recipe[];

  // 4. Fetch available lots and cost layers for warehouse
  const { data: dbLots } = await adminClient
    .from('inventory_lots')
    .select('*')
    .eq('warehouse_id', warehouseId)
    .eq('status', 'ACTIVE')
    .gt('remaining_quantity', 0);

  const { data: dbLayers } = await adminClient
    .from('inventory_cost_layers')
    .select('*')
    .eq('warehouse_id', warehouseId)
    .gt('remaining_quantity', 0);

  const lotsMap = new Map<string, InventoryLot[]>();
  for (const l of dbLots || []) {
    const list = lotsMap.get(String(l.item_id)) || [];
    list.push({
      id: String(l.id),
      warehouseId: String(l.warehouse_id),
      itemId: String(l.item_id),
      lotNumber: String(l.lot_number),
      receivedDate: String(l.received_date),
      expiryDate: l.expiry_date ? String(l.expiry_date) : undefined,
      initialQuantity: Number(l.initial_quantity),
      remainingQuantity: Number(l.remaining_quantity),
      status: l.status,
    });
    lotsMap.set(String(l.item_id), list);
  }

  const layersMap = new Map<string, InventoryCostLayer[]>();
  for (const ly of dbLayers || []) {
    const list = layersMap.get(String(ly.item_id)) || [];
    list.push({
      id: String(ly.id),
      warehouseId: String(ly.warehouse_id),
      itemId: String(ly.item_id),
      sourceDocType: (ly.source_doc_type as 'RECEIPT' | 'PRODUCTION' | 'INITIAL_BALANCE' | 'RETURN') || 'RECEIPT',
      sourceDocId: String(ly.source_doc_id),
      layerOrder: Number(ly.layer_order),
      receivedAt: String(ly.received_at),
      initialQuantity: Number(ly.initial_quantity),
      remainingQuantity: Number(ly.remaining_quantity),
      unitCost: Number(ly.unit_cost),
    });
    layersMap.set(String(ly.item_id), list);
  }

  let totalCogs = 0;
  let deductedCount = 0;

  // 5. Deduct for each item in POS order
  for (const posItem of items) {
    // Check if item is a finished good (bottled drink)
    const finishedGood = inventoryItems.find(
      (it) =>
        it.itemType === 'finished_good' &&
        (it.sku === posItem.itemId ||
          it.name.toLowerCase() === posItem.productName.toLowerCase() ||
          it.linkedMenuItemId === posItem.itemId)
    );

    // Check recipe if made-to-order
    let recipe: Recipe | undefined;
    if (!finishedGood) {
      recipe = recipes.find(
        (rc) =>
          rc.name.toLowerCase().includes(posItem.productName.toLowerCase()) &&
          (!rc.targetSize || rc.targetSize === posItem.sizeLabel)
      );
    }

    try {
      const deductionRes = deductPosOrderItem({
        orderId,
        orderItemId: posItem.itemId,
        menuItemId: posItem.itemId,
        size: posItem.sizeLabel,
        quantity: posItem.quantity,
        recipe,
        finishedGoodItem: finishedGood,
        availableLotsMap: lotsMap,
        availableLayersMap: layersMap,
      });

      if (deductionRes.inventoryStatus === 'DEDUCTED') {
        totalCogs += deductionRes.totalCogs;
        deductedCount += deductionRes.deductions.length;

        // Save deductions and movements
        for (const ded of deductionRes.deductions) {
          const { data: mv } = await adminClient
            .from('inventory_movements')
            .insert({
              business_id: businessId,
              warehouse_id: warehouseId,
              item_id: ded.itemId,
              lot_id: ded.lotId || null,
              movement_type: 'OUT_SALE_POS',
              quantity: -ded.deductedQuantity,
              base_unit: finishedGood ? finishedGood.baseUnit : 'g',
              reference_doc_type: 'ORDER',
              reference_doc_id: orderId,
              reference_doc_number: orderId,
              actor_id: staffUserId || null,
              notes: `Xuất bán POS: ${posItem.quantity} ${posItem.productName} (${posItem.sizeLabel})`,
            })
            .select('id')
            .single();

          await adminClient.from('pos_order_deductions').insert({
            business_id: businessId,
            order_id: orderId,
            order_item_id: posItem.itemId,
            item_id: ded.itemId,
            item_type: ded.itemType,
            movement_id: mv?.id || null,
            lot_id: ded.lotId || null,
            cost_layer_id: ded.costLayerId,
            deducted_quantity: ded.deductedQuantity,
            unit_cost: ded.unitCost,
            total_cost: ded.totalCost,
            status: 'ACTIVE',
          });

          // Update cost layer remaining quantity in DB
          const updatedLayer = deductionRes.updatedLayersMap
            .get(ded.itemId)
            ?.find((ly) => ly.id === ded.costLayerId);
          if (updatedLayer) {
            await adminClient
              .from('inventory_cost_layers')
              .update({ remaining_quantity: updatedLayer.remainingQuantity })
              .eq('id', ded.costLayerId);
          }

          // Update lot remaining quantity in DB
          if (ded.lotId) {
            const updatedLot = deductionRes.updatedLotsMap
              .get(ded.itemId)
              ?.find((l) => l.id === ded.lotId);
            if (updatedLot) {
              await adminClient
                .from('inventory_lots')
                .update({
                  remaining_quantity: updatedLot.remainingQuantity,
                  status: updatedLot.status,
                })
                .eq('id', ded.lotId);
            }
          }
        }
      }
    } catch (err: unknown) {
      console.warn('POS inventory deduction skipped or failed for item:', posItem.productName, err);
    }
  }

  return { success: true, totalCogs, deductedCount };
}

/**
 * Reverse inventory deductions for a cancelled POS order.
 */
export async function reversePosOrderInventory(
  orderId: string,
  businessId: string,
  staffUserId?: string | null
): Promise<{ success: boolean; reversedCount: number }> {
  const adminClient = createAdminClient();

  // 1. Fetch active deductions for this order
  const { data: deductions } = await adminClient
    .from('pos_order_deductions')
    .select('*')
    .eq('order_id', orderId)
    .eq('status', 'ACTIVE');

  if (!deductions || deductions.length === 0) {
    return { success: true, reversedCount: 0 };
  }

  const lotIds = deductions.map((d: Record<string, unknown>) => d.lot_id).filter(Boolean);
  const layerIds = deductions.map((d: Record<string, unknown>) => d.cost_layer_id);

  const { data: dbLots } = await adminClient.from('inventory_lots').select('*').in('id', lotIds);
  const { data: dbLayers } = await adminClient.from('inventory_cost_layers').select('*').in('id', layerIds);

  const lots: InventoryLot[] = (dbLots || []).map((l: Record<string, unknown>) => ({
    id: String(l.id),
    warehouseId: String(l.warehouse_id),
    itemId: String(l.item_id),
    lotNumber: String(l.lot_number),
    receivedDate: String(l.received_date),
    initialQuantity: Number(l.initial_quantity),
    remainingQuantity: Number(l.remaining_quantity),
    status: l.status as 'ACTIVE',
  }));

  const layers: InventoryCostLayer[] = (dbLayers || []).map((ly: Record<string, unknown>) => ({
    id: String(ly.id),
    warehouseId: String(ly.warehouse_id),
    itemId: String(ly.item_id),
    sourceDocType: (ly.source_doc_type as 'RECEIPT' | 'PRODUCTION' | 'INITIAL_BALANCE' | 'RETURN') || 'RECEIPT',
    sourceDocId: String(ly.source_doc_id),
    layerOrder: Number(ly.layer_order),
    receivedAt: String(ly.received_at),
    initialQuantity: Number(ly.initial_quantity),
    remainingQuantity: Number(ly.remaining_quantity),
    unitCost: Number(ly.unit_cost),
  }));

  const reverseRes = reversePosOrderDeductions({
    deductions: deductions.map((d: Record<string, unknown>) => ({
      itemId: String(d.item_id),
      itemType: d.item_type as 'raw_material',
      lotId: d.lot_id ? String(d.lot_id) : undefined,
      costLayerId: String(d.cost_layer_id),
      deductedQuantity: Number(d.deducted_quantity),
      unitCost: Number(d.unit_cost),
      totalCost: Number(d.total_cost),
    })),
    availableLots: lots,
    availableLayers: layers,
  });

  // Update DB records
  for (const lot of reverseRes.updatedLots) {
    await adminClient
      .from('inventory_lots')
      .update({ remaining_quantity: lot.remainingQuantity, status: lot.status })
      .eq('id', lot.id);
  }

  for (const layer of reverseRes.updatedLayers) {
    await adminClient
      .from('inventory_cost_layers')
      .update({ remaining_quantity: layer.remainingQuantity })
      .eq('id', layer.id);
  }

  // Create IN_RETURN_POS movement
  for (const d of deductions) {
    await adminClient.from('inventory_movements').insert({
      business_id: businessId,
      warehouse_id: d.warehouse_id || '00000000-0000-0000-0000-000000000003',
      item_id: d.item_id,
      lot_id: d.lot_id || null,
      movement_type: 'IN_RETURN_POS',
      quantity: Number(d.deducted_quantity),
      base_unit: 'base',
      reference_doc_type: 'ORDER',
      reference_doc_id: orderId,
      actor_id: staffUserId || null,
      notes: `Hoàn kho đơn hàng hủy ${orderId}`,
    });
  }

  // Mark deductions REVERSED
  await adminClient
    .from('pos_order_deductions')
    .update({ status: 'REVERSED' })
    .eq('order_id', orderId);

  return { success: true, reversedCount: reverseRes.reversedCount };
}
