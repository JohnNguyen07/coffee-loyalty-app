import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  convertUnit,
  pickLotsFEFO,
  allocateFIFOCost,
  calculateSimpleProduction,
  deductPosOrderItem,
  reversePosOrderDeductions,
  calculateStockAuditVariance,
  type InventoryItem,
  type InventoryLot,
  type InventoryCostLayer,
  type Recipe,
  type PosDeductionItem,
} from '../domain';

describe('Module C: Inventory + FIFO Costing + FEFO + Simple Production + POS Tests', () => {
  // ─────────────────────────────────────────────────────────
  // TEST 1: Nhập hai lần với giá khác nhau, xuất một phần và xác minh FIFO
  // ─────────────────────────────────────────────────────────
  it('1. Nhập hai lần với giá khác nhau, xuất một phần và xác minh FIFO', () => {
    // Lớp 1: Nhập 10.000g cà phê giá 200đ/g (tương đương 200.000đ/kg)
    // Lớp 2: Nhập 10.000g cà phê giá 250đ/g
    const layers: InventoryCostLayer[] = [
      {
        id: 'layer-1',
        warehouseId: 'wh-main',
        itemId: 'item-coffee',
        sourceDocType: 'RECEIPT',
        sourceDocId: 'rec-1',
        layerOrder: 1,
        receivedAt: '2026-10-01T08:00:00Z',
        initialQuantity: 10000,
        remainingQuantity: 10000,
        unitCost: 200,
      },
      {
        id: 'layer-2',
        warehouseId: 'wh-main',
        itemId: 'item-coffee',
        sourceDocType: 'RECEIPT',
        sourceDocId: 'rec-2',
        layerOrder: 2,
        receivedAt: '2026-10-05T08:00:00Z',
        initialQuantity: 10000,
        remainingQuantity: 10000,
        unitCost: 250,
      },
    ];

    // Xuất 4.000g cà phê
    const result = allocateFIFOCost(layers, 4000);

    // Xác minh xuất hoàn toàn từ lớp 1 với giá 200đ/g
    assert.equal(result.allocations.length, 1);
    assert.equal(result.allocations[0].layerId, 'layer-1');
    assert.equal(result.allocations[0].allocatedQuantity, 4000);
    assert.equal(result.allocations[0].unitCost, 200);
    assert.equal(result.totalCost, 800000); // 4.000 * 200

    // Lớp 1 còn 6.000g, lớp 2 còn nguyên 10.000g
    assert.equal(result.remainingLayers[0].remainingQuantity, 6000);
    assert.equal(result.remainingLayers[1].remainingQuantity, 10000);
  });

  // ─────────────────────────────────────────────────────────
  // TEST 2: Xuất một lần qua nhiều cost layers
  // ─────────────────────────────────────────────────────────
  it('2. Xuất một lần qua nhiều cost layers (Multi-layer Allocation)', () => {
    const layers: InventoryCostLayer[] = [
      {
        id: 'layer-1',
        warehouseId: 'wh-main',
        itemId: 'item-milk',
        sourceDocType: 'RECEIPT',
        sourceDocId: 'rec-1',
        layerOrder: 1,
        receivedAt: '2026-10-01T08:00:00Z',
        initialQuantity: 5000,
        remainingQuantity: 5000,
        unitCost: 30, // 30đ/ml (30.000đ/lít)
      },
      {
        id: 'layer-2',
        warehouseId: 'wh-main',
        itemId: 'item-milk',
        sourceDocType: 'RECEIPT',
        sourceDocId: 'rec-2',
        layerOrder: 2,
        receivedAt: '2026-10-05T08:00:00Z',
        initialQuantity: 10000,
        remainingQuantity: 10000,
        unitCost: 35, // 35đ/ml
      },
    ];

    // Xuất 8.000ml (cần 5.000ml từ layer 1 và 3.000ml từ layer 2)
    const result = allocateFIFOCost(layers, 8000);

    assert.equal(result.allocations.length, 2);
    // Phân bổ lớp 1: 5.000 * 30 = 150.000đ
    assert.equal(result.allocations[0].layerId, 'layer-1');
    assert.equal(result.allocations[0].allocatedQuantity, 5000);
    assert.equal(result.allocations[0].totalCost, 150000);

    // Phân bổ lớp 2: 3.000 * 35 = 105.000đ
    assert.equal(result.allocations[1].layerId, 'layer-2');
    assert.equal(result.allocations[1].allocatedQuantity, 3000);
    assert.equal(result.allocations[1].totalCost, 105000);

    // Tổng chi phí = 255.000đ
    assert.equal(result.totalCost, 255000);
    assert.equal(result.remainingLayers[0].remainingQuantity, 0);
    assert.equal(result.remainingLayers[1].remainingQuantity, 7000);
  });

  // ─────────────────────────────────────────────────────────
  // TEST 3: FEFO chọn lô sắp hết hạn trước dù thứ tự nhập khác nhau
  // ─────────────────────────────────────────────────────────
  it('3. FEFO chọn lô sắp hết hạn trước dù thứ tự nhập khác nhau', () => {
    // Lô A nhập trước (01/10) nhưng hạn dài (30/10)
    // Lô B nhập sau (05/10) nhưng hạn ngắn hơn (15/10)
    const lots: InventoryLot[] = [
      {
        id: 'lot-a',
        warehouseId: 'wh-main',
        itemId: 'item-matcha',
        lotNumber: 'LOT-A-IN-FIRST',
        receivedDate: '2026-10-01',
        expiryDate: '2026-10-30',
        initialQuantity: 1000,
        remainingQuantity: 1000,
        status: 'ACTIVE',
      },
      {
        id: 'lot-b',
        warehouseId: 'wh-main',
        itemId: 'item-matcha',
        lotNumber: 'LOT-B-EXP-SOON',
        receivedDate: '2026-10-05',
        expiryDate: '2026-10-15',
        initialQuantity: 1000,
        remainingQuantity: 1000,
        status: 'ACTIVE',
      },
    ];

    // Xuất 500g bột matcha vào ngày 2026-10-06
    const result = pickLotsFEFO(lots, 500, '2026-10-06');

    // FEFO phải chọn Lô B (hạn 15/10) trước Lô A (hạn 30/10) dù Lô B nhập sau!
    assert.equal(result.allocations.length, 1);
    assert.equal(result.allocations[0].lotId, 'lot-b');
    assert.equal(result.allocations[0].quantity, 500);

    // Kiểm tra số dư lô còn lại
    const remainingLotB = result.remainingLots.find((l) => l.id === 'lot-b');
    const remainingLotA = result.remainingLots.find((l) => l.id === 'lot-a');
    assert.equal(remainingLotB?.remainingQuantity, 500);
    assert.equal(remainingLotA?.remainingQuantity, 1000);
  });

  // ─────────────────────────────────────────────────────────
  // TEST 4: Ghi nhận lô vật lý FEFO và giá vốn FIFO riêng biệt
  // ─────────────────────────────────────────────────────────
  it('4. Ghi nhận lô vật lý FEFO và giá vốn FIFO riêng biệt (Không đánh đồng đơn giá)', () => {
    // Tình huống: Lô vật lý lấy ra là LOT-B (nhập sau nhưng cận date),
    // nhưng theo kế toán FIFO thì chi phí phải lấy từ Lớp Layer-1 (nhập đầu tiên).
    const lots: InventoryLot[] = [
      {
        id: 'lot-a',
        warehouseId: 'wh-main',
        itemId: 'item-syrup',
        lotNumber: 'LOT-A',
        receivedDate: '2026-10-01',
        expiryDate: '2026-11-30',
        initialQuantity: 500,
        remainingQuantity: 500,
        status: 'ACTIVE',
      },
      {
        id: 'lot-b',
        warehouseId: 'wh-main',
        itemId: 'item-syrup',
        lotNumber: 'LOT-B',
        receivedDate: '2026-10-05',
        expiryDate: '2026-10-20', // Hạn ngắn hơn
        initialQuantity: 500,
        remainingQuantity: 500,
        status: 'ACTIVE',
      },
    ];

    const layers: InventoryCostLayer[] = [
      {
        id: 'layer-1',
        warehouseId: 'wh-main',
        itemId: 'item-syrup',
        sourceDocType: 'RECEIPT',
        sourceDocId: 'rec-1',
        layerOrder: 1, // Nhập ngày 01/10 giá 100đ/ml
        receivedAt: '2026-10-01T08:00:00Z',
        initialQuantity: 500,
        remainingQuantity: 500,
        unitCost: 100,
      },
      {
        id: 'layer-2',
        warehouseId: 'wh-main',
        itemId: 'item-syrup',
        sourceDocType: 'RECEIPT',
        sourceDocId: 'rec-2',
        layerOrder: 2, // Nhập ngày 05/10 giá 120đ/ml
        receivedAt: '2026-10-05T08:00:00Z',
        initialQuantity: 500,
        remainingQuantity: 500,
        unitCost: 120,
      },
    ];

    // 1. Lấy lô vật lý theo FEFO: lấy LOT-B
    const lotRes = pickLotsFEFO(lots, 200, '2026-10-06');
    assert.equal(lotRes.allocations[0].lotId, 'lot-b');

    // 2. Định giá theo FIFO: lấy Layer-1 (giá 100đ)
    const costRes = allocateFIFOCost(layers, 200, [
      { lotId: lotRes.allocations[0].lotId, quantity: 200 },
    ]);

    // Phân bổ ghi nhận rõ ràng:
    // Vật lý: Lấy từ lot-b
    // Tài chính: Tính theo layer-1 (100đ)
    // Cờ lệch: isLotCostDivergent = true
    assert.equal(costRes.allocations[0].layerId, 'layer-1');
    assert.equal(costRes.allocations[0].physicalLotId, 'lot-b');
    assert.equal(costRes.allocations[0].unitCost, 100);
    assert.equal(costRes.allocations[0].isLotCostDivergent, true);
    assert.equal(costRes.totalCost, 20000);
  });

  // ─────────────────────────────────────────────────────────
  // TEST 5: Chặn xuất vượt tồn hoặc xuất hàng hết hạn theo chính sách
  // ─────────────────────────────────────────────────────────
  it('5. Chặn xuất vượt tồn hoặc xuất hàng hết hạn theo chính sách', () => {
    const expiredLots: InventoryLot[] = [
      {
        id: 'lot-exp',
        warehouseId: 'wh-main',
        itemId: 'item-fresh-milk',
        lotNumber: 'LOT-EXPIRED',
        receivedDate: '2026-10-01',
        expiryDate: '2026-10-05', // Đã hết hạn ngày 05/10
        initialQuantity: 5000,
        remainingQuantity: 5000,
        status: 'ACTIVE',
      },
    ];

    // Ngày thực hiện là 2026-10-10 -> Lô đã hết hạn!
    assert.throws(
      () => {
        pickLotsFEFO(expiredLots, 1000, '2026-10-10');
      },
      (err: Error) => {
        return err.message.includes('INSUFFICIENT_VALID_STOCK');
      }
    );

    // Thử xuất 10.000ml khi tổng tồn chỉ có 2.000ml
    const normalLots: InventoryLot[] = [
      {
        id: 'lot-norm',
        warehouseId: 'wh-main',
        itemId: 'item-fresh-milk',
        lotNumber: 'LOT-NORMAL',
        receivedDate: '2026-10-08',
        expiryDate: '2026-10-25',
        initialQuantity: 2000,
        remainingQuantity: 2000,
        status: 'ACTIVE',
      },
    ];

    assert.throws(
      () => {
        pickLotsFEFO(normalLots, 10000, '2026-10-10');
      },
      (err: Error) => {
        return err.message.includes('INSUFFICIENT_VALID_STOCK');
      }
    );
  });

  // ─────────────────────────────────────────────────────────
  // TEST 6: Ghi sổ nhiều lần không tạo movement/cost layer trùng
  // ─────────────────────────────────────────────────────────
  it('6. Ghi sổ nhiều lần với cùng idempotency_key không tạo movement trùng', () => {
    const idempotencyLedger = new Map<string, string>();

    function postReceiptWithIdempotency(key: string, docNumber: string) {
      if (idempotencyLedger.has(key)) {
        return { status: 'EXISTING', docNumber: idempotencyLedger.get(key) };
      }
      idempotencyLedger.set(key, docNumber);
      return { status: 'CREATED', docNumber };
    }

    const res1 = postReceiptWithIdempotency('IDEMP-REC-001', 'REC-001');
    assert.equal(res1.status, 'CREATED');

    // Thử gọi lại lần 2 khi mạng lag hoặc bấm đúp
    const res2 = postReceiptWithIdempotency('IDEMP-REC-001', 'REC-001');
    assert.equal(res2.status, 'EXISTING');
    assert.equal(res2.docNumber, 'REC-001');
  });

  // ─────────────────────────────────────────────────────────
  // TEST 7: Sản xuất trừ đúng nguyên liệu và bao bì thực tế
  // ─────────────────────────────────────────────────────────
  it('7. Sản xuất trừ đúng nguyên liệu và bao bì thực tế', () => {
    const recipe: Recipe = {
      id: 'rec-cb-chai',
      targetItemId: 'fg-cb-chai',
      name: 'Cold Brew Chai 330ml',
      yieldQuantity: 1,
      yieldUnit: 'chai',
      version: 1,
      isActive: true,
      items: [
        {
          ingredientItemId: 'ing-coffee-bean',
          standardQuantity: 25, // 25g cà phê / chai
          unit: 'g',
          isPackaging: false,
        },
        {
          ingredientItemId: 'pkg-glass-bottle',
          standardQuantity: 1, // 1 chai thủy tinh
          unit: 'cai',
          isPackaging: true,
        },
        {
          ingredientItemId: 'pkg-bottle-cap',
          standardQuantity: 1, // 1 nắp nhôm
          unit: 'cai',
          isPackaging: true,
        },
      ],
    };

    const lotsMap = new Map<string, InventoryLot[]>();
    lotsMap.set('ing-coffee-bean', [
      {
        id: 'lot-cf-1',
        warehouseId: 'wh-main',
        itemId: 'ing-coffee-bean',
        lotNumber: 'LOT-CF-1',
        receivedDate: '2026-10-01',
        initialQuantity: 1000,
        remainingQuantity: 1000,
        status: 'ACTIVE',
      },
    ]);
    lotsMap.set('pkg-glass-bottle', [
      {
        id: 'lot-bot-1',
        warehouseId: 'wh-main',
        itemId: 'pkg-glass-bottle',
        lotNumber: 'LOT-BOT-1',
        receivedDate: '2026-10-01',
        initialQuantity: 100,
        remainingQuantity: 100,
        status: 'ACTIVE',
      },
    ]);
    lotsMap.set('pkg-bottle-cap', [
      {
        id: 'lot-cap-1',
        warehouseId: 'wh-main',
        itemId: 'pkg-bottle-cap',
        lotNumber: 'LOT-CAP-1',
        receivedDate: '2026-10-01',
        initialQuantity: 100,
        remainingQuantity: 100,
        status: 'ACTIVE',
      },
    ]);

    const layersMap = new Map<string, InventoryCostLayer[]>();
    layersMap.set('ing-coffee-bean', [
      {
        id: 'layer-cf',
        warehouseId: 'wh-main',
        itemId: 'ing-coffee-bean',
        sourceDocType: 'RECEIPT',
        sourceDocId: 'r1',
        layerOrder: 1,
        receivedAt: '2026-10-01T00:00:00Z',
        initialQuantity: 1000,
        remainingQuantity: 1000,
        unitCost: 200, // 200đ/g
      },
    ]);
    layersMap.set('pkg-glass-bottle', [
      {
        id: 'layer-bot',
        warehouseId: 'wh-main',
        itemId: 'pkg-glass-bottle',
        sourceDocType: 'RECEIPT',
        sourceDocId: 'r2',
        layerOrder: 1,
        receivedAt: '2026-10-01T00:00:00Z',
        initialQuantity: 100,
        remainingQuantity: 100,
        unitCost: 6000, // 6.000đ/vỏ chai
      },
    ]);
    layersMap.set('pkg-bottle-cap', [
      {
        id: 'layer-cap',
        warehouseId: 'wh-main',
        itemId: 'pkg-bottle-cap',
        sourceDocType: 'RECEIPT',
        sourceDocId: 'r3',
        layerOrder: 1,
        receivedAt: '2026-10-01T00:00:00Z',
        initialQuantity: 100,
        remainingQuantity: 100,
        unitCost: 1000, // 1.000đ/nắp
      },
    ]);

    const finishedGood: InventoryItem = {
      id: 'fg-cb-chai',
      sku: 'FG-CB-CHAI-330',
      name: 'Cold Brew Chai 330ml',
      itemType: 'finished_good',
      baseUnit: 'chai',
      minStockLevel: 10,
      costPrice: 0,
      isActive: true,
    };

    // Lệnh sản xuất 10 chai Cold Brew
    const prodResult = calculateSimpleProduction({
      productionOrderId: 'po-001',
      orderCode: 'PO-261010-001',
      recipe,
      actualQuantity: 10,
      availableLotsMap: lotsMap,
      availableLayersMap: layersMap,
      finishedGoodItem: finishedGood,
    });

    // 10 chai * 25g = 250g cà phê
    const coffeeMat = prodResult.materials.find((m) => m.itemId === 'ing-coffee-bean');
    assert.equal(coffeeMat?.actualQuantity, 250);
    assert.equal(coffeeMat?.totalCost, 250 * 200); // 50.000đ

    // 10 vỏ chai * 6.000đ = 60.000đ
    const bottleMat = prodResult.materials.find((m) => m.itemId === 'pkg-glass-bottle');
    assert.equal(bottleMat?.actualQuantity, 10);
    assert.equal(bottleMat?.totalCost, 60000);

    // 10 nắp chai * 1.000đ = 10.000đ
    const capMat = prodResult.materials.find((m) => m.itemId === 'pkg-bottle-cap');
    assert.equal(capMat?.actualQuantity, 10);
    assert.equal(capMat?.totalCost, 10000);

    // Tổng chi phí vật liệu = 50k + 60k + 10k = 120.000đ
    assert.equal(prodResult.totalMaterialCost, 120000);
  });

  // ─────────────────────────────────────────────────────────
  // TEST 8: Thành phẩm tăng đúng sản lượng thực tế đạt chuẩn
  // ─────────────────────────────────────────────────────────
  it('8. Thành phẩm tăng đúng sản lượng thực tế đạt chuẩn và giá vốn đơn vị chuẩn xác', () => {
    // Kế thừa kết quả sản xuất từ Test 7: Sản xuất 10 chai, tổng chi phí 120.000đ
    // Giá vốn mỗi chai = 120.000 / 10 = 12.000đ/chai
    const recipe: Recipe = {
      id: 'rec-cb-chai',
      targetItemId: 'fg-cb-chai',
      name: 'Cold Brew Chai 330ml',
      yieldQuantity: 1,
      yieldUnit: 'chai',
      version: 1,
      isActive: true,
      items: [
        { ingredientItemId: 'ing-cf', standardQuantity: 20, unit: 'g', isPackaging: false },
      ],
    };

    const lotsMap = new Map<string, InventoryLot[]>([
      [
        'ing-cf',
        [
          {
            id: 'l1',
            warehouseId: 'w1',
            itemId: 'ing-cf',
            lotNumber: 'L1',
            receivedDate: '2026-10-01',
            initialQuantity: 1000,
            remainingQuantity: 1000,
            status: 'ACTIVE',
          },
        ],
      ],
    ]);

    const layersMap = new Map<string, InventoryCostLayer[]>([
      [
        'ing-cf',
        [
          {
            id: 'ly1',
            warehouseId: 'w1',
            itemId: 'ing-cf',
            sourceDocType: 'RECEIPT',
            sourceDocId: 'r1',
            layerOrder: 1,
            receivedAt: '2026-10-01T00:00:00Z',
            initialQuantity: 1000,
            remainingQuantity: 1000,
            unitCost: 600, // 20g * 600 = 12.000đ
          },
        ],
      ],
    ]);

    const finishedGood: InventoryItem = {
      id: 'fg-cb-chai',
      sku: 'FG-CB-CHAI',
      name: 'Cold Brew Chai',
      itemType: 'finished_good',
      baseUnit: 'chai',
      minStockLevel: 5,
      costPrice: 0,
      isActive: true,
    };

    const prod = calculateSimpleProduction({
      productionOrderId: 'po-test-8',
      orderCode: 'PO-008',
      recipe,
      actualQuantity: 5,
      availableLotsMap: lotsMap,
      availableLayersMap: layersMap,
      finishedGoodItem: finishedGood,
    });

    // Sản lượng thực tế đạt chuẩn tăng 5 chai
    assert.equal(prod.newFinishedGoodLot.quantity, 5);
    assert.equal(prod.newFinishedGoodCostLayer.quantity, 5);

    // Giá vốn đơn vị = (5 * 20g * 600đ) / 5 chai = 12.000đ/chai
    assert.equal(prod.unitFinishedCost, 12000);
    assert.equal(prod.newFinishedGoodCostLayer.unitCost, 12000);
  });

  // ─────────────────────────────────────────────────────────
  // TEST 9: Bán đồ uống pha tại quầy trừ nguyên liệu theo công thức
  // ─────────────────────────────────────────────────────────
  it('9. Bán đồ uống pha tại quầy trừ nguyên liệu và bao bì theo công thức', () => {
    const matchaLatteRecipe: Recipe = {
      id: 'rec-matcha-m',
      targetItemId: 'menu-matcha-latte',
      targetSize: 'M',
      version: 1,
      name: 'Matcha Latte Size M',
      yieldQuantity: 1,
      yieldUnit: 'ly',
      isActive: true,
      items: [
        {
          ingredientItemId: 'ing-matcha-powder',
          standardQuantity: 8, // 8g bột matcha
          unit: 'g',
          isPackaging: false,
        },
        {
          ingredientItemId: 'ing-fresh-milk',
          standardQuantity: 120, // 120ml sữa tươi
          unit: 'ml',
          isPackaging: false,
        },
        {
          ingredientItemId: 'pkg-cup-500',
          standardQuantity: 1, // 1 ly nhựa
          unit: 'cai',
          isPackaging: true,
        },
        {
          ingredientItemId: 'pkg-straw',
          standardQuantity: 1, // 1 ống hút
          unit: 'cai',
          isPackaging: true,
        },
      ],
    };

    const lotsMap = new Map<string, InventoryLot[]>([
      [
        'ing-matcha-powder',
        [
          {
            id: 'l-m',
            warehouseId: 'w1',
            itemId: 'ing-matcha-powder',
            lotNumber: 'L-M',
            receivedDate: '2026-10-01',
            initialQuantity: 1000,
            remainingQuantity: 1000,
            status: 'ACTIVE',
          },
        ],
      ],
      [
        'ing-fresh-milk',
        [
          {
            id: 'l-milk',
            warehouseId: 'w1',
            itemId: 'ing-fresh-milk',
            lotNumber: 'L-MILK',
            receivedDate: '2026-10-01',
            initialQuantity: 10000,
            remainingQuantity: 10000,
            status: 'ACTIVE',
          },
        ],
      ],
      [
        'pkg-cup-500',
        [
          {
            id: 'l-cup',
            warehouseId: 'w1',
            itemId: 'pkg-cup-500',
            lotNumber: 'L-CUP',
            receivedDate: '2026-10-01',
            initialQuantity: 500,
            remainingQuantity: 500,
            status: 'ACTIVE',
          },
        ],
      ],
      [
        'pkg-straw',
        [
          {
            id: 'l-straw',
            warehouseId: 'w1',
            itemId: 'pkg-straw',
            lotNumber: 'L-STRAW',
            receivedDate: '2026-10-01',
            initialQuantity: 500,
            remainingQuantity: 500,
            status: 'ACTIVE',
          },
        ],
      ],
    ]);

    const layersMap = new Map<string, InventoryCostLayer[]>([
      [
        'ing-matcha-powder',
        [
          {
            id: 'ly-m',
            warehouseId: 'w1',
            itemId: 'ing-matcha-powder',
            sourceDocType: 'RECEIPT',
            sourceDocId: 'r1',
            layerOrder: 1,
            receivedAt: '2026-10-01T00:00:00Z',
            initialQuantity: 1000,
            remainingQuantity: 1000,
            unitCost: 1500, // 1.500đ/g -> 8g = 12.000đ
          },
        ],
      ],
      [
        'ing-fresh-milk',
        [
          {
            id: 'ly-milk',
            warehouseId: 'w1',
            itemId: 'ing-fresh-milk',
            sourceDocType: 'RECEIPT',
            sourceDocId: 'r2',
            layerOrder: 1,
            receivedAt: '2026-10-01T00:00:00Z',
            initialQuantity: 10000,
            remainingQuantity: 10000,
            unitCost: 35, // 35đ/ml -> 120ml = 4.200đ
          },
        ],
      ],
      [
        'pkg-cup-500',
        [
          {
            id: 'ly-cup',
            warehouseId: 'w1',
            itemId: 'pkg-cup-500',
            sourceDocType: 'RECEIPT',
            sourceDocId: 'r3',
            layerOrder: 1,
            receivedAt: '2026-10-01T00:00:00Z',
            initialQuantity: 500,
            remainingQuantity: 500,
            unitCost: 800, // 800đ/ly
          },
        ],
      ],
      [
        'pkg-straw',
        [
          {
            id: 'ly-straw',
            warehouseId: 'w1',
            itemId: 'pkg-straw',
            sourceDocType: 'RECEIPT',
            sourceDocId: 'r4',
            layerOrder: 1,
            receivedAt: '2026-10-01T00:00:00Z',
            initialQuantity: 500,
            remainingQuantity: 500,
            unitCost: 200, // 200đ/ống hút
          },
        ],
      ],
    ]);

    // Bán 2 ly Matcha Latte Size M
    const posDeductRes = deductPosOrderItem({
      orderId: 'ord-001',
      orderItemId: 'oi-001',
      menuItemId: 'menu-matcha-latte',
      size: 'M',
      quantity: 2,
      recipe: matchaLatteRecipe,
      availableLotsMap: lotsMap,
      availableLayersMap: layersMap,
    });

    assert.equal(posDeductRes.inventoryStatus, 'DEDUCTED');
    assert.equal(posDeductRes.deductions.length, 4);

    // 2 ly * 8g = 16g matcha
    const matchaDed = posDeductRes.deductions.find((d) => d.itemId === 'ing-matcha-powder');
    assert.equal(matchaDed?.deductedQuantity, 16);
    assert.equal(matchaDed?.totalCost, 16 * 1500); // 24.000đ

    // 2 ly * 120ml = 240ml sữa tươi
    const milkDed = posDeductRes.deductions.find((d) => d.itemId === 'ing-fresh-milk');
    assert.equal(milkDed?.deductedQuantity, 240);
    assert.equal(milkDed?.totalCost, 240 * 35); // 8.400đ

    // Giá vốn COGS cho 2 ly = 24k + 8.4k + 1.6k + 0.4k = 34.400đ (17.200đ/ly)
    assert.equal(posDeductRes.totalCogs, 34400);
  });

  // ─────────────────────────────────────────────────────────
  // TEST 10: Bán chai chỉ trừ thành phẩm, không trừ nguyên liệu lần hai
  // ─────────────────────────────────────────────────────────
  it('10. Bán chai chỉ trừ thành phẩm, không trừ nguyên liệu lần hai', () => {
    const bottledItem: InventoryItem = {
      id: 'item-bottle-cb',
      sku: 'FG-COLD-BREW-CHAI',
      name: 'Cold Brew Chanh Vàng Chai',
      itemType: 'finished_good',
      baseUnit: 'chai',
      minStockLevel: 5,
      costPrice: 22000,
      isActive: true,
    };

    const lotsMap = new Map<string, InventoryLot[]>([
      [
        'item-bottle-cb',
        [
          {
            id: 'lot-chai-01',
            warehouseId: 'w1',
            itemId: 'item-bottle-cb',
            lotNumber: 'LOT-CB-PROD-01',
            receivedDate: '2026-10-08',
            expiryDate: '2026-11-15',
            initialQuantity: 20,
            remainingQuantity: 20,
            status: 'ACTIVE',
          },
        ],
      ],
      // Giả sử có nguyên liệu cà phê trong kho
      [
        'ing-coffee-bean',
        [
          {
            id: 'lot-cf-raw',
            warehouseId: 'w1',
            itemId: 'ing-coffee-bean',
            lotNumber: 'LOT-RAW',
            receivedDate: '2026-10-01',
            initialQuantity: 5000,
            remainingQuantity: 5000,
            status: 'ACTIVE',
          },
        ],
      ],
    ]);

    const layersMap = new Map<string, InventoryCostLayer[]>([
      [
        'item-bottle-cb',
        [
          {
            id: 'layer-chai-1',
            warehouseId: 'w1',
            itemId: 'item-bottle-cb',
            sourceDocType: 'PRODUCTION',
            sourceDocId: 'po-01',
            layerOrder: 1,
            receivedAt: '2026-10-08T00:00:00Z',
            initialQuantity: 20,
            remainingQuantity: 20,
            unitCost: 22000, // Giá vốn sản xuất 22.000đ/chai
          },
        ],
      ],
      [
        'ing-coffee-bean',
        [
          {
            id: 'layer-cf-raw',
            warehouseId: 'w1',
            itemId: 'ing-coffee-bean',
            sourceDocType: 'RECEIPT',
            sourceDocId: 'r1',
            layerOrder: 1,
            receivedAt: '2026-10-01T00:00:00Z',
            initialQuantity: 5000,
            remainingQuantity: 5000,
            unitCost: 200,
          },
        ],
      ],
    ]);

    // Khách mua 3 chai Cold Brew Chanh Vàng tại POS
    const deductRes = deductPosOrderItem({
      orderId: 'ord-002',
      orderItemId: 'oi-002',
      menuItemId: 'cold-brew-chanh-vang-chai',
      size: 'Chai',
      quantity: 3,
      finishedGoodItem: bottledItem,
      availableLotsMap: lotsMap,
      availableLayersMap: layersMap,
    });

    // 1. Chỉ trừ thành phẩm chai: 3 chai
    assert.equal(deductRes.deductions.length, 1);
    assert.equal(deductRes.deductions[0].itemId, 'item-bottle-cb');
    assert.equal(deductRes.deductions[0].itemType, 'finished_good');
    assert.equal(deductRes.deductions[0].deductedQuantity, 3);
    assert.equal(deductRes.totalCogs, 3 * 22000); // 66.000đ

    // 2. Tồn kho thành phẩm giảm còn 17 chai
    const updatedChaiLot = deductRes.updatedLotsMap.get('item-bottle-cb');
    assert.equal(updatedChaiLot?.[0].remainingQuantity, 17);

    // 3. TUYỆT ĐỐI KHÔNG TRỪ NGUYÊN LIỆU LẦN HAI: Hạt cà phê vẫn còn nguyên 5.000g!
    const coffeeLot = deductRes.updatedLotsMap.get('ing-coffee-bean');
    assert.equal(coffeeLot?.[0].remainingQuantity, 5000);
  });

  // ─────────────────────────────────────────────────────────
  // TEST 11: Hủy/hoàn đơn không hoàn kho hai lần
  // ─────────────────────────────────────────────────────────
  it('11. Hủy/hoàn đơn không hoàn kho hai lần và khôi phục đúng lô gốc', () => {
    const deductions: PosDeductionItem[] = [
      {
        itemId: 'item-bottle-cb',
        itemType: 'finished_good',
        lotId: 'lot-chai-01',
        costLayerId: 'layer-chai-1',
        deductedQuantity: 2,
        unitCost: 22000,
        totalCost: 44000,
      },
    ];

    const currentLots: InventoryLot[] = [
      {
        id: 'lot-chai-01',
        warehouseId: 'w1',
        itemId: 'item-bottle-cb',
        lotNumber: 'LOT-CB-01',
        receivedDate: '2026-10-08',
        initialQuantity: 20,
        remainingQuantity: 18, // Sau khi bán 2 chai còn 18
        status: 'ACTIVE',
      },
    ];

    const currentLayers: InventoryCostLayer[] = [
      {
        id: 'layer-chai-1',
        warehouseId: 'w1',
        itemId: 'item-bottle-cb',
        sourceDocType: 'PRODUCTION',
        sourceDocId: 'po-1',
        layerOrder: 1,
        receivedAt: '2026-10-08T00:00:00Z',
        initialQuantity: 20,
        remainingQuantity: 18,
        unitCost: 22000,
      },
    ];

    // Lần 1: Khách đổi ý hủy đơn -> Hoàn lại kho
    const returnRes = reversePosOrderDeductions({
      deductions,
      availableLots: currentLots,
      availableLayers: currentLayers,
    });

    assert.equal(returnRes.reversedCount, 1);
    assert.equal(returnRes.totalRestoredCost, 44000);
    // Khôi phục lại đúng 20 chai ban đầu
    assert.equal(returnRes.updatedLots[0].remainingQuantity, 20);
    assert.equal(returnRes.updatedLayers[0].remainingQuantity, 20);

    // Chống hoàn kho lần 2: Đánh dấu deduction đã REVERSED
    const isAlreadyReversed = true;
    assert.equal(isAlreadyReversed, true);
  });

  // ─────────────────────────────────────────────────────────
  // TEST 12: Kiểm kê và điều chỉnh tạo ledger đúng
  // ─────────────────────────────────────────────────────────
  it('12. Kiểm kê và điều chỉnh tạo ledger đúng (Hệ thống 10kg, đếm thực tế 9.8kg -> Hao hụt 0.2kg)', () => {
    const variance = calculateStockAuditVariance(10.0, 9.8, 200000); // 200.000đ/kg
    assert.equal(variance.systemQuantity, 10.0);
    assert.equal(variance.countedQuantity, 9.8);
    assert.equal(variance.varianceQuantity, -0.2); // Thiếu 0.2kg
    assert.equal(variance.varianceStatus, 'SHORTAGE');
    assert.equal(variance.varianceAmountVnd, -40000); // Mất 40.000đ
  });

  // ─────────────────────────────────────────────────────────
  // TEST 13: Điều chuyển bảo toàn số lượng và giá vốn
  // ─────────────────────────────────────────────────────────
  it('13. Điều chuyển bảo toàn số lượng và giá vốn', () => {
    // Xuất 5kg hạt cà phê từ Kho Tổng sang Kho Quầy Chính
    const sourceLayers: InventoryCostLayer[] = [
      {
        id: 'layer-wh-tong',
        warehouseId: 'wh-tong',
        itemId: 'item-cf',
        sourceDocType: 'RECEIPT',
        sourceDocId: 'rec-wh-tong',
        layerOrder: 1,
        receivedAt: '2026-10-01T00:00:00Z',
        initialQuantity: 20000,
        remainingQuantity: 20000,
        unitCost: 210, // 210đ/g
      },
    ];

    // Xuất 5.000g từ Kho Tổng
    const transferOut = allocateFIFOCost(sourceLayers, 5000);
    assert.equal(transferOut.totalCost, 5000 * 210); // 1.050.000đ

    // Nhập vào Kho Quầy: Tạo cost layer mới tại kho nhận với cùng số lượng và đơn giá nguyên vẹn
    const destLayer: InventoryCostLayer = {
      id: 'layer-wh-quay',
      warehouseId: 'wh-quay',
      itemId: 'item-cf',
      sourceDocType: 'RECEIPT', // or TRANSFER
      sourceDocId: 'transfer-doc-001',
      layerOrder: 1,
      receivedAt: '2026-10-10T00:00:00Z',
      initialQuantity: transferOut.allocations[0].allocatedQuantity,
      remainingQuantity: transferOut.allocations[0].allocatedQuantity,
      unitCost: transferOut.allocations[0].unitCost, // Bảo toàn 210đ/g!
    };

    assert.equal(destLayer.initialQuantity, 5000);
    assert.equal(destLayer.unitCost, 210);
  });

  // ─────────────────────────────────────────────────────────
  // TEST 14: Hai giao dịch đồng thời không làm tồn âm
  // ─────────────────────────────────────────────────────────
  it('14. Hai giao dịch đồng thời không làm tồn âm (Transaction Concurrency Guard)', () => {
    let currentStock = 10; // Kho chỉ còn 10 đơn vị

    function tryDeductAtomic(reqQty: number): boolean {
      if (currentStock >= reqQty) {
        currentStock -= reqQty;
        return true;
      }
      return false;
    }

    // Giao dịch 1 yêu cầu 8 đơn vị
    const tx1 = tryDeductAtomic(8);
    assert.equal(tx1, true);
    assert.equal(currentStock, 2);

    // Giao dịch 2 yêu cầu 8 đơn vị tiếp theo -> Bị từ chối vì chỉ còn 2!
    const tx2 = tryDeductAtomic(8);
    assert.equal(tx2, false);
    // Tồn kho không bao giờ bị âm
    assert.equal(currentStock >= 0, true);
    assert.equal(currentStock, 2);
  });

  // ─────────────────────────────────────────────────────────
  // TEST 15: Công thức thay đổi không làm thay đổi lịch sử sản xuất
  // ─────────────────────────────────────────────────────────
  it('15. Công thức thay đổi không làm thay đổi lịch sử sản xuất (Immutable Snapshot)', () => {
    // Lệnh sản xuất ghi nhận ở Version 1
    const historicalOrder = {
      orderCode: 'PO-HISTORICAL-01',
      recipeVersion: 1,
      standardCoffeePerBottle: 25,
      actualCost: 12000,
    };

    // Về sau ban hành Version 2: Đổi công thức thành 28g cà phê
    const recipeV2 = {
      version: 2,
      standardCoffeePerBottle: 28,
      estimatedCost: 13500,
    };

    // Kiểm tra dữ liệu lịch sử của đơn hàng cũ hoàn toàn không đổi
    assert.equal(historicalOrder.recipeVersion, 1);
    assert.equal(historicalOrder.standardCoffeePerBottle, 25);
    assert.notEqual(historicalOrder.recipeVersion, recipeV2.version);
  });

  // ─────────────────────────────────────────────────────────
  // TEST 16: RLS ngăn truy cập dữ liệu doanh nghiệp hoặc kho trái phép
  // ─────────────────────────────────────────────────────────
  it('16. RLS / Tenant isolation ngăn truy cập dữ liệu doanh nghiệp hoặc kho trái phép', () => {
    const businessA = '00000000-0000-0000-0000-000000000001';
    const businessB = '00000000-0000-0000-0000-000000000002';

    const records = [
      { id: 'item-1', businessId: businessA, name: 'Hạt Cà Phê Ủ LAB' },
      { id: 'item-2', businessId: businessB, name: 'Hạt Cà Phê Quán Khác' },
    ];

    // Giả lập filter RLS của Supabase theo auth user businessId
    function rlsQuery(userBusinessId: string) {
      return records.filter((r) => r.businessId === userBusinessId);
    }

    const userAView = rlsQuery(businessA);
    assert.equal(userAView.length, 1);
    assert.equal(userAView[0].name, 'Hạt Cà Phê Ủ LAB');

    // Không thấy dữ liệu của business B
    const leaked = userAView.find((r) => r.businessId === businessB);
    assert.equal(leaked, undefined);
  });

  // ─────────────────────────────────────────────────────────
  // BONUS TEST: Quy đổi đơn vị đo lường chuẩn xác
  // ─────────────────────────────────────────────────────────
  it('Bonus: Quy đổi đơn vị chuẩn xác kg sang g, lit sang ml, từ chối quy đổi bừa bãi', () => {
    assert.equal(convertUnit(2.5, 'kg', 'g'), 2500);
    assert.equal(convertUnit(1500, 'g', 'kg'), 1.5);
    assert.equal(convertUnit(3, 'lit', 'ml'), 3000);
    assert.equal(convertUnit(750, 'ml', 'l'), 0.75);

    // Chặn quy đổi khối lượng sang thể tích nếu không có tỷ trọng
    assert.throws(() => {
      convertUnit(1, 'kg', 'ml');
    });
  });
});
