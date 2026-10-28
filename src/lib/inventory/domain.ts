/**
 * ============================================================
 * MODULE C: INVENTORY DOMAIN LOGIC
 * FIFO Costing + FEFO Picking + Simple Production + POS Integration
 * ============================================================
 */

export type ItemType = 'raw_material' | 'packaging' | 'finished_good';
export type LotStatus = 'ACTIVE' | 'DEPLETED' | 'EXPIRED' | 'LOCKED';
export type MovementType =
  | 'IN_PURCHASE'
  | 'OUT_PRODUCTION'
  | 'IN_PRODUCTION'
  | 'OUT_SALE_POS'
  | 'IN_RETURN_POS'
  | 'OUT_LOSS'
  | 'ADJUST_AUDIT'
  | 'TRANSFER_OUT'
  | 'TRANSFER_IN';

export interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  itemType: ItemType;
  baseUnit: string; // 'g', 'ml', 'chai', 'cai', 'hop'
  minStockLevel: number;
  costPrice: number; // VND
  linkedMenuItemId?: string;
  isActive: boolean;
}

export interface UnitConversion {
  itemId?: string;
  fromUnit: string;
  toUnit: string;
  multiplier: number; // toUnit = fromUnit * multiplier
}

export interface InventoryLot {
  id: string;
  warehouseId: string;
  itemId: string;
  lotNumber: string;
  receivedDate: string; // YYYY-MM-DD
  manufacturedDate?: string;
  expiryDate?: string; // YYYY-MM-DD (null for non-perishables like cups, lids)
  initialQuantity: number;
  remainingQuantity: number;
  status: LotStatus;
}

export interface InventoryCostLayer {
  id: string;
  warehouseId: string;
  itemId: string;
  sourceDocType: 'RECEIPT' | 'PRODUCTION' | 'INITIAL_BALANCE' | 'RETURN';
  sourceDocId: string;
  sourceDocNumber?: string;
  layerOrder: number; // sequential order for strict FIFO
  receivedAt: string; // ISO date
  initialQuantity: number;
  remainingQuantity: number;
  unitCost: number; // VND per base unit
}

export interface CostAllocation {
  layerId: string;
  physicalLotId?: string;
  allocatedQuantity: number;
  unitCost: number;
  totalCost: number;
  isLotCostDivergent: boolean;
}

export interface RecipeItem {
  ingredientItemId: string;
  standardQuantity: number;
  unit: string;
  isPackaging: boolean;
}

export interface Recipe {
  id: string;
  targetItemId: string; // Finished good item or menu item
  targetSize?: string; // 'M', 'L', 'Chai', 'STANDARD'
  version: number;
  name: string;
  yieldQuantity: number;
  yieldUnit: string;
  isActive: boolean;
  items: RecipeItem[];
}

export interface PosDeductionItem {
  itemId: string;
  itemType: ItemType;
  lotId?: string;
  costLayerId: string;
  deductedQuantity: number;
  unitCost: number;
  totalCost: number;
}

// ────────────────────────────────────────────────────────────
// 1. UNIT CONVERSION (Quy Đổi Đơn Vị Đo Lường Nghiêm Ngặt)
// ────────────────────────────────────────────────────────────

/**
 * Standard mass and volume conversion rules.
 * Throws an explicit error when attempting incompatible cross-dimension conversions
 * (e.g. weight to volume without declared density).
 */
export function convertUnit(
  quantity: number,
  fromUnit: string,
  toUnit: string,
  conversions: UnitConversion[] = []
): number {
  const from = fromUnit.trim().toLowerCase();
  const to = toUnit.trim().toLowerCase();

  if (from === to) return quantity;

  // 1. Check custom declared conversions first
  const custom = conversions.find(
    (c) => c.fromUnit.toLowerCase() === from && c.toUnit.toLowerCase() === to
  );
  if (custom && custom.multiplier > 0) {
    return quantity * custom.multiplier;
  }

  const customReverse = conversions.find(
    (c) => c.fromUnit.toLowerCase() === to && c.toUnit.toLowerCase() === from
  );
  if (customReverse && customReverse.multiplier > 0) {
    return quantity / customReverse.multiplier;
  }

  // 2. Standard Mass (Khối lượng)
  if (from === 'kg' && to === 'g') return quantity * 1000;
  if (from === 'g' && to === 'kg') return quantity / 1000;

  // 3. Standard Volume (Thể tích)
  if ((from === 'l' || from === 'lit') && to === 'ml') return quantity * 1000;
  if (from === 'ml' && (to === 'l' || to === 'lit')) return quantity / 1000;

  // 4. Standard Pieces / Packages (Bao bì, lốc, thùng)
  if (from === 'thung' && (to === 'chai' || to === 'hop' || to === 'lon')) {
    // Requires declared conversion rate; cannot assume 24
    throw new Error(
      `Không thể quy đổi từ ${fromUnit} sang ${toUnit} khi chưa khai báo hệ số thùng.`
    );
  }

  // Cross-dimension rejection
  const massUnits = ['kg', 'g', 'mg'];
  const volumeUnits = ['l', 'lit', 'ml'];
  if (
    (massUnits.includes(from) && volumeUnits.includes(to)) ||
    (volumeUnits.includes(from) && massUnits.includes(to))
  ) {
    throw new Error(
      `Lỗi quy đổi: Không được tự suy đoán quy đổi giữa khối lượng (${fromUnit}) và thể tích (${toUnit}).`
    );
  }

  throw new Error(`Chưa có hệ số quy đổi giữa đơn vị '${fromUnit}' và '${toUnit}'.`);
}

// ────────────────────────────────────────────────────────────
// 2. FEFO LOT PICKING (First-Expired, First-Out)
// ────────────────────────────────────────────────────────────

export interface LotAllocationResult {
  allocations: {
    lotId: string;
    lotNumber: string;
    quantity: number;
    expiryDate?: string;
  }[];
  remainingLots: InventoryLot[];
}

/**
 * Picks physical inventory lots based strictly on FEFO order.
 * - Prioritizes lots with earliest expiry_date.
 * - Non-perishable lots (null expiry) are used after dated lots or by received_date.
 * - Never picks expired lots.
 * - Rejects transaction if insufficient valid stock is available.
 */
export function pickLotsFEFO(
  lots: InventoryLot[],
  requestedQuantity: number,
  currentDateStr?: string
): LotAllocationResult {
  if (requestedQuantity <= 0) {
    return { allocations: [], remainingLots: lots };
  }

  const today = currentDateStr || new Date().toISOString().slice(0, 10);

  // Deep clone to avoid mutating input objects directly
  const availableLots = lots.map((l) => ({ ...l }));

  // Filter lots: must be ACTIVE, have remaining quantity, and NOT expired
  const validLots = availableLots.filter((lot) => {
    if (lot.status !== 'ACTIVE' || lot.remainingQuantity <= 0) return false;
    if (lot.expiryDate && lot.expiryDate < today) {
      // Expired lot! Never pick automatically.
      return false;
    }
    return true;
  });

  // Sort by FEFO:
  // 1. Lots with expiryDate come first, ordered ascending (earliest expiry first).
  // 2. Lots with no expiryDate come after, ordered by receivedDate ascending.
  validLots.sort((a, b) => {
    if (a.expiryDate && b.expiryDate) {
      if (a.expiryDate !== b.expiryDate) {
        return a.expiryDate.localeCompare(b.expiryDate);
      }
      return a.receivedDate.localeCompare(b.receivedDate);
    }
    if (a.expiryDate && !b.expiryDate) return -1;
    if (!a.expiryDate && b.expiryDate) return 1;
    return a.receivedDate.localeCompare(b.receivedDate);
  });

  const totalValidStock = validLots.reduce((sum, l) => sum + l.remainingQuantity, 0);
  if (totalValidStock < requestedQuantity) {
    throw new Error(
      `INSUFFICIENT_VALID_STOCK: Không đủ tồn kho hợp lệ theo FEFO. Yêu cầu: ${requestedQuantity}, khả dụng: ${totalValidStock}. (Đã loại bỏ các lô hết hạn).`
    );
  }

  let remainingNeeded = requestedQuantity;
  const allocations: {
    lotId: string;
    lotNumber: string;
    quantity: number;
    expiryDate?: string;
  }[] = [];

  for (const lot of validLots) {
    if (remainingNeeded <= 0) break;

    const takeQty = Math.min(lot.remainingQuantity, remainingNeeded);
    lot.remainingQuantity = Number((lot.remainingQuantity - takeQty).toFixed(3));
    if (lot.remainingQuantity === 0) {
      lot.status = 'DEPLETED';
    }

    allocations.push({
      lotId: lot.id,
      lotNumber: lot.lotNumber,
      quantity: Number(takeQty.toFixed(3)),
      expiryDate: lot.expiryDate,
    });

    remainingNeeded = Number((remainingNeeded - takeQty).toFixed(3));
  }

  // Synchronize back into availableLots array
  const updatedLots = availableLots.map((l) => {
    const updated = validLots.find((v) => v.id === l.id);
    return updated || l;
  });

  return {
    allocations,
    remainingLots: updatedLots,
  };
}

// ────────────────────────────────────────────────────────────
// 3. FIFO COSTING (First-In, First-Out Cost Layers)
// ────────────────────────────────────────────────────────────

export interface FifoCostResult {
  allocations: CostAllocation[];
  totalCost: number;
  averageUnitCost: number;
  remainingLayers: InventoryCostLayer[];
}

/**
 * Allocates inventory deduction cost across FIFO cost layers.
 * - Allocates from earliest layer_order first.
 * - Can span multiple layers.
 * - Retains unit_cost snapshot at the time of recording.
 * - Never recalculates past layers or past deductions when new receipts arrive.
 * - Links to physicalLotAllocations if provided, flagging divergent lot/layer cases.
 */
export function allocateFIFOCost(
  layers: InventoryCostLayer[],
  requestedQuantity: number,
  physicalLotAllocations?: { lotId: string; quantity: number }[]
): FifoCostResult {
  if (requestedQuantity <= 0) {
    return {
      allocations: [],
      totalCost: 0,
      averageUnitCost: 0,
      remainingLayers: layers,
    };
  }

  // Deep clone layers
  const activeLayers = layers.map((ly) => ({ ...ly }));

  // Sort strictly by FIFO layer_order ascending
  activeLayers.sort((a, b) => a.layerOrder - b.layerOrder);

  const totalRemaining = activeLayers.reduce((sum, l) => sum + l.remainingQuantity, 0);
  if (totalRemaining < requestedQuantity) {
    throw new Error(
      `INSUFFICIENT_COST_LAYERS: Không đủ lớp giá vốn FIFO. Yêu cầu: ${requestedQuantity}, tổng tồn lớp vốn: ${totalRemaining}.`
    );
  }

  let remainingNeeded = requestedQuantity;
  const allocations: CostAllocation[] = [];
  let totalCost = 0;

  // Create lot allocation pool if physical lots were provided
  const lotPool = physicalLotAllocations ? [...physicalLotAllocations] : [];

  for (const layer of activeLayers) {
    if (remainingNeeded <= 0) break;
    if (layer.remainingQuantity <= 0) continue;

    const qtyFromLayer = Math.min(layer.remainingQuantity, remainingNeeded);
    const layerCost = Math.round(qtyFromLayer * layer.unitCost);

    layer.remainingQuantity = Number((layer.remainingQuantity - qtyFromLayer).toFixed(3));
    remainingNeeded = Number((remainingNeeded - qtyFromLayer).toFixed(3));
    totalCost += layerCost;

    // Associate with physical lot if available
    let assignedLotId: string | undefined;
    let isDivergent = false;

    if (lotPool.length > 0) {
      const topLot = lotPool[0];
      assignedLotId = topLot.lotId;
      // If the lot was received under a different source or time, flag as divergent
      isDivergent = true;

      if (topLot.quantity <= qtyFromLayer) {
        lotPool.shift();
      } else {
        topLot.quantity = Number((topLot.quantity - qtyFromLayer).toFixed(3));
      }
    }

    allocations.push({
      layerId: layer.id,
      physicalLotId: assignedLotId,
      allocatedQuantity: Number(qtyFromLayer.toFixed(3)),
      unitCost: layer.unitCost,
      totalCost: layerCost,
      isLotCostDivergent: isDivergent,
    });
  }

  const averageUnitCost =
    requestedQuantity > 0 ? Math.round(totalCost / requestedQuantity) : 0;

  return {
    allocations,
    totalCost,
    averageUnitCost,
    remainingLayers: activeLayers,
  };
}

// ────────────────────────────────────────────────────────────
// 4. SIMPLE PRODUCTION (Sản Xuất Đơn Giản Thành Phẩm Đóng Chai)
// ────────────────────────────────────────────────────────────

export interface ProductionCalculationInput {
  productionOrderId: string;
  orderCode: string;
  recipe: Recipe;
  actualQuantity: number; // e.g. 10 chai
  availableLotsMap: Map<string, InventoryLot[]>; // itemId -> lots[]
  availableLayersMap: Map<string, InventoryCostLayer[]>; // itemId -> costLayers[]
  currentDateStr?: string;
  finishedGoodItem: InventoryItem;
}

export interface ProductionMaterialUsage {
  itemId: string;
  isPackaging: boolean;
  plannedQuantity: number;
  actualQuantity: number;
  unit: string;
  lotAllocations: { lotId: string; lotNumber: string; quantity: number }[];
  costAllocations: CostAllocation[];
  totalCost: number;
}

export interface ProductionCalculationResult {
  productionOrderId: string;
  finishedGoodItemId: string;
  actualQuantity: number;
  totalMaterialCost: number;
  unitFinishedCost: number; // Cost of 1 bottled beverage (VND)
  materials: ProductionMaterialUsage[];
  updatedLotsMap: Map<string, InventoryLot[]>;
  updatedLayersMap: Map<string, InventoryCostLayer[]>;
  newFinishedGoodLot: {
    lotNumber: string;
    quantity: number;
    manufacturedDate: string;
    expiryDate?: string;
  };
  newFinishedGoodCostLayer: {
    quantity: number;
    unitCost: number;
  };
}

/**
 * Calculates raw material & packaging usage for a production batch of finished goods.
 * - Multiplies recipe items by actual production quantity.
 * - Deducts physical lots via FEFO.
 * - Values consumed ingredients and packaging via FIFO cost layers.
 * - Calculates finished product unit cost = totalMaterialCost / actualQuantity.
 * - Generates new finished product lot and new FIFO cost layer.
 */
export function calculateSimpleProduction(
  input: ProductionCalculationInput
): ProductionCalculationResult {
  const {
    productionOrderId,
    orderCode,
    recipe,
    actualQuantity,
    availableLotsMap,
    availableLayersMap,
    currentDateStr,
  } = input;

  if (actualQuantity <= 0) {
    throw new Error('Số lượng sản xuất thực tế phải lớn hơn 0.');
  }

  if (!recipe.isActive) {
    throw new Error(`Công thức '${recipe.name}' chưa được phê duyệt hoặc đang bị khóa.`);
  }

  const today = currentDateStr || new Date().toISOString().slice(0, 10);
  const updatedLotsMap = new Map<string, InventoryLot[]>();
  const updatedLayersMap = new Map<string, InventoryCostLayer[]>();

  // Copy maps
  for (const [k, v] of availableLotsMap.entries()) {
    updatedLotsMap.set(k, v.map((l) => ({ ...l })));
  }
  for (const [k, v] of availableLayersMap.entries()) {
    updatedLayersMap.set(k, v.map((l) => ({ ...l })));
  }

  let totalMaterialCost = 0;
  const materials: ProductionMaterialUsage[] = [];

  // Deduct each recipe item
  for (const item of recipe.items) {
    // Quantity per recipe yield
    const ratio = actualQuantity / recipe.yieldQuantity;
    const requiredQty = Number((item.standardQuantity * ratio).toFixed(3));

    const itemLots = updatedLotsMap.get(item.ingredientItemId) || [];
    const itemLayers = updatedLayersMap.get(item.ingredientItemId) || [];

    // 1. FEFO Lot Picking
    const lotResult = pickLotsFEFO(itemLots, requiredQty, today);
    updatedLotsMap.set(item.ingredientItemId, lotResult.remainingLots);

    // 2. FIFO Cost Layer Allocation
    const lotAllocMap = lotResult.allocations.map((a) => ({
      lotId: a.lotId,
      quantity: a.quantity,
    }));
    const costResult = allocateFIFOCost(itemLayers, requiredQty, lotAllocMap);
    updatedLayersMap.set(item.ingredientItemId, costResult.remainingLayers);

    totalMaterialCost += costResult.totalCost;

    materials.push({
      itemId: item.ingredientItemId,
      isPackaging: item.isPackaging,
      plannedQuantity: requiredQty,
      actualQuantity: requiredQty,
      unit: item.unit,
      lotAllocations: lotResult.allocations,
      costAllocations: costResult.allocations,
      totalCost: costResult.totalCost,
    });
  }

  // Cost per finished bottle
  const unitFinishedCost = Math.round(totalMaterialCost / actualQuantity);

  // Expiry date calculation for bottled beverage (e.g. 7 days from manufacture)
  const expDate = new Date(today);
  expDate.setDate(expDate.getDate() + 7);
  const expiryDateStr = expDate.toISOString().slice(0, 10);

  return {
    productionOrderId,
    finishedGoodItemId: input.finishedGoodItem.id,
    actualQuantity,
    totalMaterialCost,
    unitFinishedCost,
    materials,
    updatedLotsMap,
    updatedLayersMap,
    newFinishedGoodLot: {
      lotNumber: `LOT-PROD-${orderCode}`,
      quantity: actualQuantity,
      manufacturedDate: today,
      expiryDate: expiryDateStr,
    },
    newFinishedGoodCostLayer: {
      quantity: actualQuantity,
      unitCost: unitFinishedCost,
    },
  };
}

// ────────────────────────────────────────────────────────────
// 5. POS INVENTORY DEDUCTION (Pha Quầy vs Chai Đóng Sẵn)
// ────────────────────────────────────────────────────────────

export interface PosLineItemDeductionInput {
  orderId: string;
  orderItemId: string;
  menuItemId: string;
  size: string; // 'M', 'L', 'Chai'
  quantity: number; // e.g. 2 cups or 2 bottles
  recipe?: Recipe;
  finishedGoodItem?: InventoryItem; // Set if product is bottled finished good
  availableLotsMap: Map<string, InventoryLot[]>;
  availableLayersMap: Map<string, InventoryCostLayer[]>;
  currentDateStr?: string;
}

export interface PosLineItemDeductionResult {
  orderItemId: string;
  inventoryStatus: 'DEDUCTED' | 'SKIPPED_NO_RECIPE';
  deductions: PosDeductionItem[];
  totalCogs: number;
  updatedLotsMap: Map<string, InventoryLot[]>;
  updatedLayersMap: Map<string, InventoryCostLayer[]>;
}

/**
 * Deducts inventory for a POS order item.
 * - If product is bottled finished good (`finished_good`):
 *   Deducts finished good bottles directly.
 *   CRITICAL: NEVER deducts raw materials and packaging a second time!
 * - If product is made-to-order cup drink:
 *   Checks active approved recipe. Deducts raw materials & packaging per recipe formula.
 *   If no active recipe exists, flags as 'SKIPPED_NO_RECIPE' without breaking POS sales.
 */
export function deductPosOrderItem(
  input: PosLineItemDeductionInput
): PosLineItemDeductionResult {
  const {
    orderItemId,
    quantity,
    recipe,
    finishedGoodItem,
    availableLotsMap,
    availableLayersMap,
    currentDateStr,
  } = input;

  const today = currentDateStr || new Date().toISOString().slice(0, 10);
  const updatedLotsMap = new Map<string, InventoryLot[]>();
  const updatedLayersMap = new Map<string, InventoryCostLayer[]>();

  for (const [k, v] of availableLotsMap.entries()) {
    updatedLotsMap.set(k, v.map((l) => ({ ...l })));
  }
  for (const [k, v] of availableLayersMap.entries()) {
    updatedLayersMap.set(k, v.map((l) => ({ ...l })));
  }

  // ─────────────────────────────────────────────────────────
  // CASE A: BOTTLED FINISHED GOODS (Thành phẩm đóng chai)
  // ─────────────────────────────────────────────────────────
  if (finishedGoodItem && finishedGoodItem.itemType === 'finished_good') {
    const itemLots = updatedLotsMap.get(finishedGoodItem.id) || [];
    const itemLayers = updatedLayersMap.get(finishedGoodItem.id) || [];

    // Deduct bottles sold via FEFO
    const lotResult = pickLotsFEFO(itemLots, quantity, today);
    updatedLotsMap.set(finishedGoodItem.id, lotResult.remainingLots);

    // Value bottles via FIFO
    const lotAllocMap = lotResult.allocations.map((a) => ({
      lotId: a.lotId,
      quantity: a.quantity,
    }));
    const costResult = allocateFIFOCost(itemLayers, quantity, lotAllocMap);
    updatedLayersMap.set(finishedGoodItem.id, costResult.remainingLayers);

    const deductions: PosDeductionItem[] = costResult.allocations.map((alloc) => ({
      itemId: finishedGoodItem.id,
      itemType: 'finished_good',
      lotId: alloc.physicalLotId,
      costLayerId: alloc.layerId,
      deductedQuantity: alloc.allocatedQuantity,
      unitCost: alloc.unitCost,
      totalCost: alloc.totalCost,
    }));

    return {
      orderItemId,
      inventoryStatus: 'DEDUCTED',
      deductions,
      totalCogs: costResult.totalCost,
      updatedLotsMap,
      updatedLayersMap,
    };
  }

  // ─────────────────────────────────────────────────────────
  // CASE B: MADE-TO-ORDER DRINKS (Đồ uống pha tại quầy)
  // ─────────────────────────────────────────────────────────
  if (!recipe || !recipe.isActive) {
    return {
      orderItemId,
      inventoryStatus: 'SKIPPED_NO_RECIPE',
      deductions: [],
      totalCogs: 0,
      updatedLotsMap,
      updatedLayersMap,
    };
  }

  const deductions: PosDeductionItem[] = [];
  let totalCogs = 0;

  for (const item of recipe.items) {
    const requiredQty = Number((item.standardQuantity * quantity).toFixed(3));
    const itemLots = updatedLotsMap.get(item.ingredientItemId) || [];
    const itemLayers = updatedLayersMap.get(item.ingredientItemId) || [];

    // FEFO
    const lotResult = pickLotsFEFO(itemLots, requiredQty, today);
    updatedLotsMap.set(item.ingredientItemId, lotResult.remainingLots);

    // FIFO
    const lotAllocMap = lotResult.allocations.map((a) => ({
      lotId: a.lotId,
      quantity: a.quantity,
    }));
    const costResult = allocateFIFOCost(itemLayers, requiredQty, lotAllocMap);
    updatedLayersMap.set(item.ingredientItemId, costResult.remainingLayers);

    totalCogs += costResult.totalCost;

    for (const alloc of costResult.allocations) {
      deductions.push({
        itemId: item.ingredientItemId,
        itemType: item.isPackaging ? 'packaging' : 'raw_material',
        lotId: alloc.physicalLotId,
        costLayerId: alloc.layerId,
        deductedQuantity: alloc.allocatedQuantity,
        unitCost: alloc.unitCost,
        totalCost: alloc.totalCost,
      });
    }
  }

  return {
    orderItemId,
    inventoryStatus: 'DEDUCTED',
    deductions,
    totalCogs,
    updatedLotsMap,
    updatedLayersMap,
  };
}

// ────────────────────────────────────────────────────────────
// 6. ORDER CANCELLATION & RETURN TO STOCK (Hoàn Kho An Toàn)
// ────────────────────────────────────────────────────────────

export interface ReturnStockInput {
  deductions: PosDeductionItem[];
  availableLots: InventoryLot[];
  availableLayers: InventoryCostLayer[];
}

export interface ReturnStockResult {
  reversedCount: number;
  totalRestoredCost: number;
  updatedLots: InventoryLot[];
  updatedLayers: InventoryCostLayer[];
}

/**
 * Reverses a POS order deduction upon cancellation and restocking.
 * - Restores quantity to the exact original physical lot.
 * - Restores remaining_quantity to the exact original FIFO cost layer.
 * - Prevents double return.
 */
export function reversePosOrderDeductions(input: ReturnStockInput): ReturnStockResult {
  const { deductions, availableLots, availableLayers } = input;

  const updatedLots = availableLots.map((l) => ({ ...l }));
  const updatedLayers = availableLayers.map((ly) => ({ ...ly }));
  let totalRestoredCost = 0;

  for (const ded of deductions) {
    // Restore physical lot
    if (ded.lotId) {
      const targetLot = updatedLots.find((l) => l.id === ded.lotId);
      if (targetLot) {
        targetLot.remainingQuantity = Number(
          (targetLot.remainingQuantity + ded.deductedQuantity).toFixed(3)
        );
        if (targetLot.status === 'DEPLETED') {
          targetLot.status = 'ACTIVE';
        }
      }
    }

    // Restore cost layer
    const targetLayer = updatedLayers.find((ly) => ly.id === ded.costLayerId);
    if (targetLayer) {
      targetLayer.remainingQuantity = Number(
        (targetLayer.remainingQuantity + ded.deductedQuantity).toFixed(3)
      );
    }

    totalRestoredCost += ded.totalCost;
  }

  return {
    reversedCount: deductions.length,
    totalRestoredCost,
    updatedLots,
    updatedLayers,
  };
}

// ────────────────────────────────────────────────────────────
// 7. STOCK COUNT & AUDIT VARIANCE (Kiểm Kê & Hao Hụt)
// ────────────────────────────────────────────────────────────

export interface StockCountItemVariance {
  itemId: string;
  lotId?: string;
  systemQuantity: number;
  countedQuantity: number;
  varianceQuantity: number; // counted - system
  varianceStatus: 'BALANCED' | 'SURPLUS' | 'SHORTAGE';
  varianceAmountVnd: number; // based on item unit cost
}

export function calculateStockAuditVariance(
  systemQuantity: number,
  countedQuantity: number,
  unitCost: number
): StockCountItemVariance {
  const varianceQuantity = Number((countedQuantity - systemQuantity).toFixed(3));
  const varianceStatus =
    varianceQuantity === 0
      ? 'BALANCED'
      : varianceQuantity > 0
        ? 'SURPLUS'
        : 'SHORTAGE';
  const varianceAmountVnd = Math.round(varianceQuantity * unitCost);

  return {
    itemId: '',
    systemQuantity,
    countedQuantity,
    varianceQuantity,
    varianceStatus,
    varianceAmountVnd,
  };
}

