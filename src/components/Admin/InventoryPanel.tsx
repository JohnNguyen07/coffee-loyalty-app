'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import styles from './InventoryPanel.module.css';
import { formatVND } from '@/data/menu';
import type {
  InventoryOverviewSummary,
  InventoryItemWithStock,
  InventoryLotView,
} from '@/lib/inventory/repository';

type InventoryTab = 'items' | 'receipt' | 'audit' | 'production' | 'lots_movements';

interface ReceiptDraftLine {
  itemId: string;
  quantity: string;
  unitCost: string;
  expiryDate: string;
}

const MOVEMENT_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  IN_PURCHASE: { label: '📥 Nhập kho mua hàng', color: '#15803d' },
  IN_PRODUCTION: { label: '🏭 Nhập thành phẩm SX', color: '#0284c7' },
  OUT_PRODUCTION: { label: '🧪 Xuất pha chế mẻ SX', color: '#b45309' },
  OUT_POS_SALE: { label: '🛒 Trừ kho bán POS', color: '#475569' },
  IN_POS_CANCEL: { label: '↩️ Hoàn kho hủy đơn', color: '#0d9488' },
  OUT_LOSS: { label: '⚠️ Xuất hủy / Hao hụt', color: '#dc2626' },
  OUT_EXPIRED: { label: '🗑️ Xuất hủy hết hạn', color: '#b91c1c' },
  ADJUST_AUDIT: { label: '📋 Cân bằng kiểm kê', color: '#7e22ce' },
};

const QUICK_LOSS_REASONS = [
  'Nguyên liệu / Sữa hết hạn sử dụng',
  'Đổ hỏng trong quá trình pha chế',
  'Pha thử nghiệm món mới (R&D)',
  'Vỡ chai / Hư hỏng bao bì ly nắp',
];

function formatFriendlyStock(qty: number, unit: string): { main: string; sub?: string } {
  const cleanQty = Number(qty.toFixed(2));
  const u = unit.toLowerCase();
  if (u === 'g' && Math.abs(cleanQty) >= 1000) {
    return {
      main: `${cleanQty.toLocaleString('vi-VN')} g`,
      sub: `≈ ${(cleanQty / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} kg`,
    };
  }
  if (u === 'ml' && Math.abs(cleanQty) >= 1000) {
    return {
      main: `${cleanQty.toLocaleString('vi-VN')} ml`,
      sub: `≈ ${(cleanQty / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} Lít`,
    };
  }
  return {
    main: `${cleanQty.toLocaleString('vi-VN')} ${unit}`,
  };
}

function getQuickQuantityPresets(unit: string): { label: string; value: number }[] {
  const u = unit.toLowerCase();
  if (u === 'g') {
    return [
      { label: '+250g', value: 250 },
      { label: '+500g (0.5kg)', value: 500 },
      { label: '+1.000g (1kg)', value: 1000 },
      { label: '+2.000g (2kg)', value: 2000 },
      { label: '+5.000g (5kg)', value: 5000 },
    ];
  }
  if (u === 'ml') {
    return [
      { label: '+500ml', value: 500 },
      { label: '+950ml (1 hộp/chai)', value: 950 },
      { label: '+1.000ml (1 Lít)', value: 1000 },
      { label: '+2.000ml (2 Lít)', value: 2000 },
      { label: '+5.000ml (5 Lít)', value: 5000 },
    ];
  }
  if (u === 'chai') {
    return [
      { label: '+10 chai', value: 10 },
      { label: '+20 chai', value: 20 },
      { label: '+50 chai', value: 50 },
      { label: '+100 chai', value: 100 },
    ];
  }
  return [
    { label: '+10', value: 10 },
    { label: '+50', value: 50 },
    { label: '+100', value: 100 },
    { label: '+500', value: 500 },
  ];
}

export default function InventoryPanel() {
  const [activeTab, setActiveTab] = useState<InventoryTab>('items');
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Overview data
  const [summary, setSummary] = useState<InventoryOverviewSummary | null>(null);
  const [items, setItems] = useState<InventoryItemWithStock[]>([]);
  const [lots, setLots] = useState<InventoryLotView[]>([]);
  const [movements, setMovements] = useState<Record<string, unknown>[]>([]);
  const [recipes, setRecipes] = useState<Record<string, unknown>[]>([]);

  // Search & Filters on Main Stock Tab
  const [itemSearch, setItemSearch] = useState<string>('');
  const [quickFilter, setQuickFilter] = useState<'ALL' | 'ALERT' | 'raw_material' | 'packaging' | 'finished_good'>('ALL');

  // ── 1-Click Inline Modals State ──
  // A. Quick Restock Modal (+ Nhập thêm)
  const [restockItem, setRestockItem] = useState<InventoryItemWithStock | null>(null);
  const [restockQty, setRestockQty] = useState<string>('1000');
  const [restockUnitCost, setRestockUnitCost] = useState<string>('0');
  const [restockExpiry, setRestockExpiry] = useState<string>('');
  const [restockSupplier, setRestockSupplier] = useState<string>('Nhập bổ sung tại quầy');

  // B. Quick Loss / Spoilage Modal (⚠️ Xuất hủy / Hao hụt)
  const [lossItem, setLossItem] = useState<InventoryItemWithStock | null>(null);
  const [lossQty, setLossQty] = useState<string>('');
  const [lossType, setLossType] = useState<'OUT_LOSS' | 'OUT_EXPIRED'>('OUT_LOSS');
  const [lossReason, setLossReason] = useState<string>('Nguyên liệu / Sữa hết hạn sử dụng');

  // C. Quick Single-Item Audit Modal (📋 Kiểm đếm nhanh)
  const [quickAuditItem, setQuickAuditItem] = useState<InventoryItemWithStock | null>(null);
  const [quickAuditCounted, setQuickAuditCounted] = useState<string>('');
  const [quickAuditReason, setQuickAuditReason] = useState<string>('Kiểm đếm thực tế tại quầy');

  // D. Create / Edit Item Modal (+ Thêm mặt hàng / ✏️ Sửa)
  const [showItemModal, setShowItemModal] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<InventoryItemWithStock | null>(null);
  const [formSku, setFormSku] = useState<string>('');
  const [formName, setFormName] = useState<string>('');
  const [formType, setFormType] = useState<string>('raw_material');
  const [formUnit, setFormUnit] = useState<string>('g');
  const [formMinStock, setFormMinStock] = useState<string>('500');
  const [formCost, setFormCost] = useState<string>('200');
  const [formInitStock, setFormInitStock] = useState<string>('0');
  const [formInitExpiry, setFormInitExpiry] = useState<string>('');

  // ── Tab 2: Multi-line Goods Receipt Form ──
  const [recNumber, setRecNumber] = useState<string>(() => `NK-${Math.floor(1000 + Math.random() * 9000)}`);
  const [recSupplier, setRecSupplier] = useState<string>('Nhà cung cấp nguyên liệu Ủ LAB');
  const [recLines, setRecLines] = useState<ReceiptDraftLine[]>([
    { itemId: '', quantity: '1000', unitCost: '0', expiryDate: '' },
  ]);

  // ── Tab 3: Interactive Batch Stocktake Table ──
  const [batchCounts, setBatchCounts] = useState<Record<string, string>>({});
  const [batchAuditReason, setBatchAuditReason] = useState<string>('Kiểm kê định kỳ cuối ca');

  // ── Tab 4: Simple Production Form ──
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>('');
  const [prodActualQty, setProdActualQty] = useState<string>('10');
  const [prodOrderCode, setProdOrderCode] = useState<string>(() => `SX-${Math.floor(1000 + Math.random() * 9000)}`);

  // Auto clear banners
  useEffect(() => {
    if (!successMsg) return;
    const t = setTimeout(() => setSuccessMsg(null), 5000);
    return () => clearTimeout(t);
  }, [successMsg]);

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [sumRes, prodRes] = await Promise.all([
        fetch('/api/inventory/summary', { cache: 'no-store' }),
        fetch('/api/inventory/production', { cache: 'no-store' }),
      ]);

      if (sumRes.ok) {
        const data = await sumRes.json();
        setSummary(data.summary);
        const loadedItems: InventoryItemWithStock[] = data.items || [];
        setItems(loadedItems);
        setLots(data.lots || []);
        setMovements(data.recentMovements || []);

        // Initialize batchCounts with currentStock
        const initCounts: Record<string, string> = {};
        loadedItems.forEach((it) => {
          initCounts[it.id] = String(it.currentStock);
        });
        setBatchCounts(initCounts);
      } else {
        const errData = await sumRes.json().catch(() => ({}));
        setErrorMsg(errData.error || 'Không thể tải dữ liệu kho.');
      }

      if (prodRes.ok) {
        const prodData = await prodRes.json();
        if (prodData.recipes) {
          setRecipes(prodData.recipes);
          if (prodData.recipes.length > 0 && !selectedRecipeId) {
            setSelectedRecipeId(String(prodData.recipes[0].id));
          }
        }
      }
    } catch {
      setErrorMsg('Lỗi kết nối máy chủ khi tải dữ liệu kho.');
    } finally {
      setLoading(false);
    }
  }, [selectedRecipeId]);

  useEffect(() => {
    fetchOverview();
    const handleLocationChanged = () => fetchOverview();
    window.addEventListener('ulab:location-changed', handleLocationChanged);
    return () => {
      window.removeEventListener('ulab:location-changed', handleLocationChanged);
    };
  }, [fetchOverview]);

  // Filtered items on main tab
  const filteredItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    return items.filter((it) => {
      const matchSearch =
        !q || it.name.toLowerCase().includes(q) || it.sku.toLowerCase().includes(q);
      if (!matchSearch) return false;

      if (quickFilter === 'ALERT') {
        return it.stockStatus === 'LOW_STOCK' || it.stockStatus === 'OUT_OF_STOCK';
      }
      if (quickFilter !== 'ALL') {
        return it.itemType === quickFilter;
      }
      return true;
    });
  }, [items, itemSearch, quickFilter]);

  const alertItemsCount = useMemo(
    () => items.filter((i) => i.stockStatus !== 'IN_STOCK').length,
    [items]
  );

  // ── Open Modals Helpers ──
  const openQuickRestock = (item: InventoryItemWithStock) => {
    setRestockItem(item);
    const presets = getQuickQuantityPresets(item.baseUnit);
    setRestockQty(String(presets[1]?.value || presets[0]?.value || 100));
    setRestockUnitCost(String(item.costPrice || 0));
    setRestockExpiry('');
    setRestockSupplier('Nhập bổ sung tại quầy');
  };

  const openQuickLoss = (item: InventoryItemWithStock) => {
    setLossItem(item);
    setLossQty('');
    setLossType('OUT_LOSS');
    setLossReason(QUICK_LOSS_REASONS[0]);
  };

  const openQuickAudit = (item: InventoryItemWithStock) => {
    setQuickAuditItem(item);
    setQuickAuditCounted(String(item.currentStock));
    setQuickAuditReason('Kiểm đếm thực tế tại quầy');
  };

  const openCreateItemModal = () => {
    setEditingItem(null);
    setFormSku('');
    setFormName('');
    setFormType('raw_material');
    setFormUnit('g');
    setFormMinStock('500');
    setFormCost('200');
    setFormInitStock('0');
    setFormInitExpiry('');
    setShowItemModal(true);
  };

  const openEditItemModal = (item: InventoryItemWithStock) => {
    setEditingItem(item);
    setFormSku(item.sku);
    setFormName(item.name);
    setFormType(item.itemType);
    setFormUnit(item.baseUnit);
    setFormMinStock(String(item.minStockLevel));
    setFormCost(String(item.costPrice));
    setShowItemModal(true);
  };

  // ── Submit 1-Click Quick Restock ──
  const handleQuickRestockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restockItem) return;
    const qty = Number(restockQty) || 0;
    if (qty <= 0) {
      setErrorMsg('Số lượng nhập thêm phải lớn hơn 0.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    try {
      const code = `NK-${Math.floor(1000 + Math.random() * 9000)}`;
      const res = await fetch('/api/inventory/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiptNumber: code,
          supplierName: restockSupplier,
          items: [
            {
              itemId: restockItem.id,
              unit: restockItem.baseUnit,
              quantity: qty,
              unitCost: Math.max(0, Number(restockUnitCost) || 0),
              expiryDate: restockExpiry || undefined,
            },
          ],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Không thể nhập kho.');
      } else {
        setSuccessMsg(
          `✓ Đã nhập thêm +${qty.toLocaleString('vi-VN')} ${restockItem.baseUnit} "${restockItem.name}" vào kho!`
        );
        setRestockItem(null);
        await fetchOverview();
      }
    } catch {
      setErrorMsg('Lỗi kết nối khi nhập kho.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Submit 1-Click Quick Loss / Spoilage ──
  const handleQuickLossSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lossItem) return;
    const qty = Number(lossQty) || 0;
    if (qty <= 0) {
      setErrorMsg('Vui lòng nhập số lượng xuất hủy lớn hơn 0.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/inventory/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'RECORD_LOSS',
          itemId: lossItem.id,
          quantity: qty,
          lossType,
          reason: lossReason,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Không thể ghi nhận xuất hủy.');
      } else {
        setSuccessMsg(
          `✓ Đã trừ kho xuất hủy -${qty.toLocaleString('vi-VN')} ${lossItem.baseUnit} "${lossItem.name}" (${lossReason}).`
        );
        setLossItem(null);
        await fetchOverview();
      }
    } catch {
      setErrorMsg('Lỗi kết nối khi ghi nhận xuất hủy.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Submit 1-Click Quick Audit ──
  const handleQuickAuditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickAuditItem) return;
    const counted = Math.max(0, Number(quickAuditCounted) || 0);

    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/inventory/audits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auditNumber: `KK-${Math.floor(1000 + Math.random() * 9000)}`,
          items: [
            {
              itemId: quickAuditItem.id,
              systemQuantity: quickAuditItem.currentStock,
              countedQuantity: counted,
              unit: quickAuditItem.baseUnit,
              unitCost: quickAuditItem.costPrice,
              reason: quickAuditReason,
            },
          ],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Lỗi cập nhật kiểm đếm.');
      } else {
        setSuccessMsg(
          `✓ Đã cân bằng tồn kho "${quickAuditItem.name}" thành ${counted.toLocaleString('vi-VN')} ${quickAuditItem.baseUnit}!`
        );
        setQuickAuditItem(null);
        await fetchOverview();
      }
    } catch {
      setErrorMsg('Lỗi kết nối khi gửi kiểm kê.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Submit Create / Edit Item ──
  const handleSaveItemModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      if (editingItem) {
        const res = await fetch('/api/inventory/items', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingItem.id,
            sku: formSku,
            name: formName,
            itemType: formType,
            baseUnit: formUnit,
            minStockLevel: Number(formMinStock) || 0,
            costPrice: Number(formCost) || 0,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setErrorMsg(data.error || 'Không thể cập nhật mặt hàng.');
        } else {
          setSuccessMsg(`✓ Đã cập nhật thông tin mặt hàng "${formName}"!`);
          setShowItemModal(false);
          await fetchOverview();
        }
      } else {
        const res = await fetch('/api/inventory/items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sku: formSku,
            name: formName,
            itemType: formType,
            baseUnit: formUnit,
            minStockLevel: Number(formMinStock) || 0,
            costPrice: Number(formCost) || 0,
            initialStock: Number(formInitStock) || 0,
            expiryDate: formInitExpiry || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setErrorMsg(data.error || 'Không thể tạo mặt hàng.');
        } else {
          setSuccessMsg(
            `✓ Đã tạo mặt hàng "${formName}"${Number(formInitStock) > 0 ? ` kèm tồn đầu kỳ ${formInitStock} ${formUnit}` : ''} thành công!`
          );
          setShowItemModal(false);
          await fetchOverview();
        }
      }
    } catch {
      setErrorMsg('Lỗi kết nối khi lưu mặt hàng.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Submit Multi-line Goods Receipt ──
  const handleCreateMultiReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    const validLines = recLines.filter((l) => l.itemId && Number(l.quantity) > 0);
    if (validLines.length === 0) {
      setErrorMsg('Vui lòng chọn ít nhất 1 mặt hàng và nhập số lượng > 0.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    try {
      const payloadItems = validLines.map((l) => {
        const matched = items.find((i) => i.id === l.itemId);
        return {
          itemId: l.itemId,
          unit: matched?.baseUnit || 'g',
          quantity: Number(l.quantity) || 0,
          unitCost: Math.max(0, Number(l.unitCost) || 0),
          expiryDate: l.expiryDate || undefined,
        };
      });

      const res = await fetch('/api/inventory/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiptNumber: recNumber,
          supplierName: recSupplier,
          items: payloadItems,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Lỗi ghi nhận phiếu nhập kho.');
      } else {
        setSuccessMsg(`✓ Đã nhập kho hóa đơn ${recNumber} (${validLines.length} mặt hàng) thành công!`);
        setRecNumber(`NK-${Math.floor(1000 + Math.random() * 9000)}`);
        setRecLines([{ itemId: '', quantity: '1000', unitCost: '0', expiryDate: '' }]);
        await fetchOverview();
        setActiveTab('items');
      }
    } catch {
      setErrorMsg('Lỗi kết nối khi gửi phiếu nhập kho.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Submit Interactive Batch Stocktake ──
  const handleBatchAuditSubmit = async () => {
    const changedItems = items
      .map((it) => {
        const rawVal = batchCounts[it.id];
        const counted = rawVal !== undefined && rawVal !== '' ? Number(rawVal) : it.currentStock;
        return {
          item: it,
          counted: Math.max(0, counted),
          diff: Number((counted - it.currentStock).toFixed(3)),
        };
      })
      .filter((row) => row.diff !== 0);

    if (changedItems.length === 0) {
      setErrorMsg('Chưa có mặt hàng nào có số lượng thực đếm khác với tồn hệ thống.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    try {
      const auditNum = `KK-${Math.floor(1000 + Math.random() * 9000)}`;
      const res = await fetch('/api/inventory/audits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auditNumber: auditNum,
          notes: batchAuditReason,
          items: changedItems.map((r) => ({
            itemId: r.item.id,
            systemQuantity: r.item.currentStock,
            countedQuantity: r.counted,
            unit: r.item.baseUnit,
            unitCost: r.item.costPrice,
            reason: batchAuditReason,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Lỗi chốt phiếu kiểm kê.');
      } else {
        setSuccessMsg(
          `✓ Đã chốt kiểm kê ${auditNum} và tự động cân bằng tồn kho cho ${changedItems.length} mặt hàng!`
        );
        await fetchOverview();
        setActiveTab('items');
      }
    } catch {
      setErrorMsg('Lỗi kết nối khi chốt kiểm kê.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Submit Simple Production Order ──
  const handleCreateProduction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecipeId) {
      setErrorMsg('Vui lòng chọn công thức sản xuất.');
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/inventory/production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderCode: prodOrderCode,
          recipeId: selectedRecipeId,
          actualQuantity: Number(prodActualQty) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Lỗi ghi nhận lệnh sản xuất.');
      } else {
        setSuccessMsg(`✓ Đã hoàn tất mẻ sản xuất ${prodOrderCode}: Tăng tồn thành phẩm đóng chai!`);
        setProdOrderCode(`SX-${Math.floor(1000 + Math.random() * 9000)}`);
        await fetchOverview();
        setActiveTab('items');
      }
    } catch {
      setErrorMsg('Lỗi kết nối khi thực hiện lệnh sản xuất.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.panel}>
      {/* ── Top Header Bar ── */}
      <div className={styles.headerBar}>
        <div>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>Kho &amp; Nguyên Liệu Pha Chế</h1>
            <span className={styles.locationBadge}>Kho Quầy Chính Ủ LAB</span>
          </div>
          <p className={styles.subtitle}>
            Thao tác 1-chạm ngay trên từng nguyên liệu: Nhập thêm hàng, Báo hủy hao hụt, Kiểm đếm nhanh cuối ca &amp; Tự động tính giá vốn.
          </p>
        </div>

        <div className={styles.actionBtnsRow}>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={openCreateItemModal}
          >
            + Thêm Mặt Hàng Mới
          </button>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => setActiveTab('receipt')}
          >
            📥 Nhập Hóa Đơn Nhiều Món
          </button>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => setActiveTab('audit')}
          >
            📋 Kiểm Kê Nhanh Cuối Ca
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className={styles.errorBanner}>
          <span>⚠️ {errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
            ✕
          </button>
        </div>
      )}
      {successMsg && (
        <div className={styles.successBanner}>
          <span>{successMsg}</span>
          <button type="button" onClick={() => setSuccessMsg(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
            ✕
          </button>
        </div>
      )}

      {/* ── Metrics Grid (4 Cards) ── */}
      <div className={styles.metricsGrid}>
        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>Tổng Giá Trị Tồn Kho</div>
          <div className={styles.metricValRow}>
            <span className={styles.metricNumber}>
              {formatVND(summary?.totalValuationVnd || 0)}
            </span>
          </div>
          <div className={styles.metricSubText}>Vốn nguyên liệu &amp; bao bì đang lưu kho</div>
        </div>

        <div
          className={`${styles.metricCard} ${styles.metricCardClickable}`}
          onClick={() => {
            setActiveTab('items');
            setQuickFilter('ALL');
          }}
        >
          <div className={styles.metricLabel}>Tổng Danh Mục Mặt Hàng</div>
          <div className={styles.metricValRow}>
            <span className={styles.metricNumber}>{summary?.totalItems || items.length}</span>
            <span className={styles.metricUnit}>mặt hàng</span>
          </div>
          <div className={styles.metricSubText}>Nguyên liệu · Bao bì · Chai thành phẩm</div>
        </div>

        <div
          className={`${styles.metricCard} ${styles.metricCardClickable}`}
          onClick={() => {
            setActiveTab('items');
            setQuickFilter('ALERT');
          }}
        >
          <div className={styles.metricLabel}>Cần Nhập Bổ Sung Gấp</div>
          <div className={styles.metricValRow}>
            <span
              className={`${styles.metricNumber} ${
                alertItemsCount > 0 ? styles.textDanger : ''
              }`}
            >
              {alertItemsCount}
            </span>
            <span className={styles.metricUnit}>mặt hàng</span>
          </div>
          <div className={styles.metricSubText}>
            {alertItemsCount > 0 ? 'Bấm để lọc ngay các món sắp hết / hết hàng' : 'Tất cả nguyên liệu đều đủ dùng'}
          </div>
        </div>

        <div
          className={`${styles.metricCard} ${styles.metricCardClickable}`}
          onClick={() => setActiveTab('lots_movements')}
        >
          <div className={styles.metricLabel}>Lô Hàng &amp; Hạn Sử Dụng</div>
          <div className={styles.metricValRow}>
            <span className={styles.metricNumber}>{lots.length}</span>
            <span className={styles.metricUnit}>lô đang mở</span>
          </div>
          <div className={styles.metricSubText}>
            {(summary?.expiringLotsCount || 0) > 0 ? (
              <span className={styles.textDanger}>
                ⚠️ {summary?.expiringLotsCount} lô cận date / hết hạn
              </span>
            ) : (
              'Tự động ưu tiên xuất lô cận hạn trước'
            )}
          </div>
        </div>
      </div>

      {/* ── Navigation Tabs Bar (Streamlined into 5 Friendly Tabs) ── */}
      <div className={styles.tabsBar}>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === 'items' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('items')}
        >
          📦 Tồn Kho &amp; Thao Tác Nhanh ({items.length})
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === 'audit' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('audit')}
        >
          📋 Kiểm Kê Nhanh Toàn Kho
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === 'receipt' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('receipt')}
        >
          📥 Lập Hóa Đơn Nhập Hàng
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === 'production' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('production')}
        >
          🏭 Sản Xuất Đóng Chai ({recipes.length})
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === 'lots_movements' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('lots_movements')}
        >
          📖 Lô Hạn Dùng &amp; Nhật Ký Kho ({movements.length})
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          TAB 1: DANH MỤC TỒN KHO & THAO TÁC NHANH 1-CHẠM TRÊN TỪNG DÒNG
         ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'items' && (
        <div className={styles.cardContainer}>
          <div className={styles.filterPillsRow}>
            <div className={styles.filterPills}>
              <button
                type="button"
                className={`${styles.filterPill} ${quickFilter === 'ALL' ? styles.filterPillActive : ''}`}
                onClick={() => setQuickFilter('ALL')}
              >
                Tất cả ({items.length})
              </button>
              <button
                type="button"
                className={`${styles.filterPill} ${quickFilter === 'ALERT' ? styles.filterPillAlertActive : ''}`}
                onClick={() => setQuickFilter('ALERT')}
              >
                🔥 Sắp hết / Cần nhập ({alertItemsCount})
              </button>
              <button
                type="button"
                className={`${styles.filterPill} ${quickFilter === 'raw_material' ? styles.filterPillActive : ''}`}
                onClick={() => setQuickFilter('raw_material')}
              >
                🧪 Nguyên liệu pha chế ({items.filter((i) => i.itemType === 'raw_material').length})
              </button>
              <button
                type="button"
                className={`${styles.filterPill} ${quickFilter === 'packaging' ? styles.filterPillActive : ''}`}
                onClick={() => setQuickFilter('packaging')}
              >
                🥤 Bao bì &amp; Ly nắp ({items.filter((i) => i.itemType === 'packaging').length})
              </button>
              <button
                type="button"
                className={`${styles.filterPill} ${quickFilter === 'finished_good' ? styles.filterPillActive : ''}`}
                onClick={() => setQuickFilter('finished_good')}
              >
                🍾 Chai thành phẩm ({items.filter((i) => i.itemType === 'finished_good').length})
              </button>
            </div>

            <input
              type="search"
              placeholder="🔍 Tìm nhanh tên nguyên liệu, mã SKU..."
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
              className={styles.formInput}
              style={{ width: 260 }}
            />
          </div>

          {loading ? (
            <div className={styles.loadingEmpty}>Đang tải dữ liệu tồn kho...</div>
          ) : filteredItems.length === 0 ? (
            <div className={styles.loadingEmpty}>
              Không có mặt hàng nào khớp với bộ lọc hiện tại.
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.invTable}>
                <thead>
                  <tr>
                    <th>Mặt hàng &amp; Mã SKU</th>
                    <th>Phân loại</th>
                    <th>Mức tồn hiện tại</th>
                    <th>Trạng thái</th>
                    <th>Giá vốn / ĐVT</th>
                    <th>Giá trị tồn</th>
                    <th>Thao tác nhanh tại quầy</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((it) => {
                    const friendly = formatFriendlyStock(it.currentStock, it.baseUnit);
                    const minFriendly = formatFriendlyStock(it.minStockLevel, it.baseUnit);
                    const safeTarget = Math.max(it.minStockLevel * 2, 1);
                    const fillPct = Math.min(100, Math.max(0, Math.round((it.currentStock / safeTarget) * 100)));
                    const barColor =
                      it.stockStatus === 'OUT_OF_STOCK'
                        ? '#dc2626'
                        : it.stockStatus === 'LOW_STOCK'
                          ? '#d97706'
                          : '#16a34a';

                    return (
                      <tr key={it.id}>
                        <td>
                          <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.9rem' }}>
                            {it.name}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b', fontFamily: 'monospace' }}>
                            {it.sku} · Cảnh báo dưới: {minFriendly.main}
                          </div>
                        </td>
                        <td>
                          {it.itemType === 'raw_material' ? (
                            <span className={styles.badgeTypeRaw}>🧪 Nguyên liệu</span>
                          ) : it.itemType === 'packaging' ? (
                            <span className={styles.badgeTypePkg}>🥤 Bao bì</span>
                          ) : (
                            <span className={styles.badgeTypeFg}>🍾 Chai TP</span>
                          )}
                        </td>
                        <td className={styles.stockCell}>
                          <div className={styles.stockTopRow}>
                            <span className={styles.stockBigNum}>{friendly.main}</span>
                            {friendly.sub && (
                              <span className={styles.stockHumanHint}>{friendly.sub}</span>
                            )}
                          </div>
                          <div className={styles.stockBarTrack}>
                            <div
                              className={styles.stockBarFill}
                              style={{ width: `${fillPct}%`, background: barColor }}
                            />
                          </div>
                        </td>
                        <td>
                          {it.stockStatus === 'IN_STOCK' ? (
                            <span className={styles.badgeStatusIn}>✓ Đủ hàng</span>
                          ) : it.stockStatus === 'LOW_STOCK' ? (
                            <span className={styles.badgeStatusLow}>⚠️ Sắp hết</span>
                          ) : (
                            <span className={styles.badgeStatusOut}>✕ Hết hàng</span>
                          )}
                        </td>
                        <td>
                          {formatVND(it.costPrice)} / {it.baseUnit}
                        </td>
                        <td>
                          <strong>{formatVND(it.totalValueVnd)}</strong>
                        </td>
                        <td>
                          <div className={styles.rowActions}>
                            <button
                              type="button"
                              className={styles.rowBtnIn}
                              onClick={() => openQuickRestock(it)}
                              title="Nhập thêm hàng nhanh vào kho"
                            >
                              📥 + Nhập thêm
                            </button>
                            <button
                              type="button"
                              className={styles.rowBtnLoss}
                              onClick={() => openQuickLoss(it)}
                              title="Ghi nhận xuất hủy do hỏng, đổ, hết hạn hoặc pha thử"
                            >
                              ⚠️ Báo hủy
                            </button>
                            <button
                              type="button"
                              className={styles.rowBtnAudit}
                              onClick={() => openQuickAudit(it)}
                              title="Cập nhật lại số lượng thực đếm trên kệ"
                            >
                              📋 Kiểm đếm
                            </button>
                            <button
                              type="button"
                              className={styles.rowBtnEdit}
                              onClick={() => openEditItemModal(it)}
                              title="Sửa tên, mức cảnh báo hoặc giá vốn"
                            >
                              ✏️
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB 2: BẢNG KIỂM KÊ NHANH TOÀN KHO (1-CLICK BATCH STOCKTAKE)
         ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'audit' && (
        <div className={styles.cardContainer}>
          <div className={styles.cardHeader}>
            <div>
              <h2 className={styles.cardTitle}>📋 Bảng Kiểm Kê Nhanh Cuối Ca / Cuối Tuần</h2>
              <p style={{ margin: '4px 0 0', fontSize: '0.825rem', color: '#64748b' }}>
                Điền số lượng thực tế đếm được vào cột <strong>&ldquo;Thực đếm tại quầy&rdquo;</strong>, hệ thống tự động tính chênh lệch và cân bằng kho chỉ với 1 nút bấm.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="text"
                value={batchAuditReason}
                onChange={(e) => setBatchAuditReason(e.target.value)}
                placeholder="Ghi chú đợt kiểm kê..."
                className={styles.formInput}
                style={{ width: 240 }}
              />
              <button
                type="button"
                disabled={submitting}
                onClick={handleBatchAuditSubmit}
                className={styles.primaryBtn}
              >
                {submitting ? 'Đang xử lý...' : '✓ Chốt Kiểm Kê Các Món Có Thay Đổi'}
              </button>
            </div>
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.invTable}>
              <thead>
                <tr>
                  <th>Mặt hàng</th>
                  <th>Phân loại</th>
                  <th>Tồn trên hệ thống</th>
                  <th>Thực đếm tại quầy</th>
                  <th>Chênh lệch</th>
                  <th>Giá trị lệch dự kiến</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const rawCount = batchCounts[it.id] ?? String(it.currentStock);
                  const countedNum = rawCount === '' ? it.currentStock : Number(rawCount);
                  const diff = Number((countedNum - it.currentStock).toFixed(3));
                  const diffVal = Math.round(diff * it.costPrice);

                  return (
                    <tr key={it.id} style={{ background: diff !== 0 ? '#f8fafc' : undefined }}>
                      <td>
                        <strong>{it.name}</strong>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', fontFamily: 'monospace' }}>
                          {it.sku}
                        </div>
                      </td>
                      <td>
                        {it.itemType === 'raw_material'
                          ? 'Nguyên liệu'
                          : it.itemType === 'packaging'
                            ? 'Bao bì'
                            : 'Chai TP'}
                      </td>
                      <td>
                        <strong>
                          {it.currentStock.toLocaleString('vi-VN')} {it.baseUnit}
                        </strong>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <input
                            type="number"
                            value={rawCount}
                            onChange={(e) =>
                              setBatchCounts((prev) => ({ ...prev, [it.id]: e.target.value }))
                            }
                            className={styles.formInput}
                            style={{
                              width: 120,
                              fontWeight: 700,
                              borderColor: diff !== 0 ? '#00754a' : undefined,
                            }}
                          />
                          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{it.baseUnit}</span>
                        </div>
                      </td>
                      <td>
                        {diff === 0 ? (
                          <span style={{ color: '#94a3b8' }}>Khớp (0)</span>
                        ) : diff > 0 ? (
                          <strong style={{ color: '#15803d' }}>
                            +{diff.toLocaleString('vi-VN')} {it.baseUnit} (Thừa)
                          </strong>
                        ) : (
                          <strong style={{ color: '#dc2626' }}>
                            {diff.toLocaleString('vi-VN')} {it.baseUnit} (Hao hụt)
                          </strong>
                        )}
                      </td>
                      <td>
                        {diff === 0 ? (
                          '—'
                        ) : (
                          <strong style={{ color: diff > 0 ? '#15803d' : '#dc2626' }}>
                            {diff > 0 ? '+' : ''}
                            {formatVND(diffVal)}
                          </strong>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB 3: LẬP HÓA ĐƠN NHẬP HÀNG NHIỀU MÓN (MULTI-ITEM RECEIPT)
         ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'receipt' && (
        <div className={styles.cardContainer}>
          <div className={styles.cardHeader}>
            <div>
              <h2 className={styles.cardTitle}>📥 Lập Phiếu Nhập Hàng Hóa Đơn (Nhiều Mặt Hàng)</h2>
              <p style={{ margin: '4px 0 0', fontSize: '0.825rem', color: '#64748b' }}>
                Dùng khi nhận hóa đơn giao hàng gồm nhiều nguyên liệu cùng lúc từ nhà cung cấp.
              </p>
            </div>
          </div>

          <form onSubmit={handleCreateMultiReceipt}>
            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label>Mã phiếu nhập kho:</label>
                <input
                  type="text"
                  required
                  value={recNumber}
                  onChange={(e) => setRecNumber(e.target.value)}
                  className={styles.formInput}
                />
              </div>
              <div className={styles.formGroup}>
                <label>Tên nhà cung cấp / Nguồn mua:</label>
                <input
                  type="text"
                  value={recSupplier}
                  onChange={(e) => setRecSupplier(e.target.value)}
                  className={styles.formInput}
                />
              </div>
            </div>

            <div className={styles.tableWrap} style={{ marginBottom: 16 }}>
              <table className={styles.invTable}>
                <thead>
                  <tr>
                    <th>Chọn mặt hàng nhập *</th>
                    <th>Số lượng nhập *</th>
                    <th>Đơn giá vốn (VND / ĐVT) *</th>
                    <th>Hạn sử dụng (Tùy chọn)</th>
                    <th>Thành tiền</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {recLines.map((line, idx) => {
                    const matched = items.find((i) => i.id === line.itemId);
                    const lineTotal = (Number(line.quantity) || 0) * (Number(line.unitCost) || 0);
                    return (
                      <tr key={idx}>
                        <td>
                          <select
                            required
                            value={line.itemId}
                            onChange={(e) => {
                              const nextId = e.target.value;
                              const found = items.find((i) => i.id === nextId);
                              setRecLines((prev) =>
                                prev.map((r, i) =>
                                  i === idx
                                    ? {
                                        ...r,
                                        itemId: nextId,
                                        unitCost: found ? String(found.costPrice) : r.unitCost,
                                      }
                                    : r
                                )
                              );
                            }}
                            className={styles.formInput}
                            style={{ width: '100%', minWidth: 220 }}
                          >
                            <option value="">-- Chọn nguyên liệu / bao bì --</option>
                            {items.map((it) => (
                              <option key={it.id} value={it.id}>
                                {it.name} ({it.baseUnit}) — Tồn: {it.currentStock}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <input
                              type="number"
                              required
                              min="1"
                              value={line.quantity}
                              onChange={(e) =>
                                setRecLines((prev) =>
                                  prev.map((r, i) => (i === idx ? { ...r, quantity: e.target.value } : r))
                                )
                              }
                              className={styles.formInput}
                              style={{ width: 110 }}
                            />
                            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                              {matched?.baseUnit || ''}
                            </span>
                          </div>
                        </td>
                        <td>
                          <input
                            type="number"
                            required
                            min="0"
                            value={line.unitCost}
                            onChange={(e) =>
                              setRecLines((prev) =>
                                prev.map((r, i) => (i === idx ? { ...r, unitCost: e.target.value } : r))
                              )
                            }
                            className={styles.formInput}
                            style={{ width: 120 }}
                          />
                        </td>
                        <td>
                          <input
                            type="date"
                            value={line.expiryDate}
                            onChange={(e) =>
                              setRecLines((prev) =>
                                prev.map((r, i) => (i === idx ? { ...r, expiryDate: e.target.value } : r))
                              )
                            }
                            className={styles.formInput}
                          />
                        </td>
                        <td>
                          <strong style={{ color: '#15803d' }}>{formatVND(lineTotal)}</strong>
                        </td>
                        <td>
                          {recLines.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                setRecLines((prev) => prev.filter((_, i) => i !== idx))
                              }
                              className={styles.rowBtnLoss}
                            >
                              Xóa
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() =>
                  setRecLines((prev) => [
                    ...prev,
                    { itemId: '', quantity: '1000', unitCost: '0', expiryDate: '' },
                  ])
                }
              >
                + Thêm dòng mặt hàng vào phiếu
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ fontSize: '1rem', fontWeight: 700 }}>
                  Tổng phiếu nhập:{' '}
                  <strong style={{ color: '#15803d', fontSize: '1.2rem' }}>
                    {formatVND(
                      recLines.reduce(
                        (s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0),
                        0
                      )
                    )}
                  </strong>
                </div>
                <button type="submit" disabled={submitting} className={styles.primaryBtn}>
                  {submitting ? 'Đang lưu...' : '📥 Xác Nhận Nhập Kho Tất Cả'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB 4: LỆNH SẢN XUẤT ĐÓNG CHAI COLD BREW
         ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'production' && (
        <div className={styles.cardContainer}>
          <div className={styles.cardHeader}>
            <div>
              <h2 className={styles.cardTitle}>🏭 Ghi Nhận Mẻ Sản Xuất Đóng Chai Cold Brew</h2>
              <p style={{ margin: '4px 0 0', fontSize: '0.825rem', color: '#64748b' }}>
                Hệ thống tự động trừ hạt cà phê, nguyên liệu và vỏ chai theo định mức, đồng thời cộng số lượng chai thành phẩm vào kho.
              </p>
            </div>
          </div>

          <form onSubmit={handleCreateProduction}>
            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label>Mã mẻ sản xuất:</label>
                <input
                  type="text"
                  required
                  value={prodOrderCode}
                  onChange={(e) => setProdOrderCode(e.target.value)}
                  className={styles.formInput}
                />
              </div>
              <div className={styles.formGroup}>
                <label>Chọn công thức đóng chai:</label>
                <select
                  required
                  value={selectedRecipeId}
                  onChange={(e) => setSelectedRecipeId(e.target.value)}
                  className={styles.formInput}
                >
                  <option value="">-- Chọn công thức --</option>
                  {recipes.map((rc: Record<string, unknown>) => (
                    <option key={String(rc.id)} value={String(rc.id)}>
                      {String(rc.name)} (v{String(rc.version)})
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.formGroup}>
                <label>Số lượng chai hoàn thành thực tế:</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={prodActualQty}
                  onChange={(e) => setProdActualQty(e.target.value)}
                  className={styles.formInput}
                />
                <div className={styles.quickChips}>
                  {[5, 10, 20, 30, 50].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={styles.quickChip}
                      onClick={() => setProdActualQty(String(n))}
                    >
                      {n} chai
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button type="submit" disabled={submitting} className={styles.primaryBtn}>
              {submitting ? 'Đang xử lý...' : '🏭 Hoàn Tất Sản Xuất & Cộng Tồn Chai Thành Phẩm'}
            </button>
          </form>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB 5: LÔ HẠN DÙNG FEFO & NHẬT KÝ BIẾN ĐỘNG KHO DỄ ĐỌC
         ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'lots_movements' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Lô hàng & Hạn dùng */}
          <div className={styles.cardContainer}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>🏷️ Các Lô Hàng Đang Mở &amp; Hạn Sử Dụng ({lots.length} lô)</h2>
              <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                Lô có hạn sử dụng gần nhất luôn được hệ thống tự động ưu tiên trừ trước (FEFO).
              </span>
            </div>

            {lots.length === 0 ? (
              <div className={styles.loadingEmpty}>Hiện chưa có lô hàng nào trong kho.</div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.invTable}>
                  <thead>
                    <tr>
                      <th>Mã Lô</th>
                      <th>Mặt hàng</th>
                      <th>Ngày nhập</th>
                      <th>Hạn sử dụng</th>
                      <th>Tình trạng hạn</th>
                      <th>Ban đầu</th>
                      <th>Còn lại</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lots.map((lot) => (
                      <tr key={lot.id}>
                        <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{lot.lotNumber}</td>
                        <td>
                          <strong>{lot.itemName}</strong>
                        </td>
                        <td>{lot.receivedDate}</td>
                        <td>
                          <strong>{lot.expiryDate || 'Không giới hạn'}</strong>
                        </td>
                        <td>
                          {lot.expiryAlert === 'EXPIRED' ? (
                            <span className={styles.badgeStatusOut}>✕ Đã hết hạn!</span>
                          ) : lot.expiryAlert === 'CRITICAL' ? (
                            <span className={styles.badgeStatusLow}>
                              ⚠️ Cận date ({lot.daysToExpiry} ngày)
                            </span>
                          ) : (
                            <span className={styles.badgeStatusIn}>✓ Còn hạn tốt</span>
                          )}
                        </td>
                        <td>
                          {lot.initialQuantity.toLocaleString('vi-VN')} {lot.baseUnit}
                        </td>
                        <td>
                          <strong>
                            {lot.remainingQuantity.toLocaleString('vi-VN')} {lot.baseUnit}
                          </strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Sổ cái biến động kho */}
          <div className={styles.cardContainer}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>📖 Nhật Ký Nhập - Xuất - Hao Hụt Gần Đây ({movements.length})</h2>
            </div>

            {movements.length === 0 ? (
              <div className={styles.loadingEmpty}>Chưa có giao dịch biến động kho nào.</div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.invTable}>
                  <thead>
                    <tr>
                      <th>Thời gian</th>
                      <th>Mặt hàng</th>
                      <th>Loại thao tác</th>
                      <th>Biến động</th>
                      <th>Mã chứng từ</th>
                      <th>Ghi chú chi tiết</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((mv: Record<string, unknown>, idx) => {
                      const mvType = String(mv.movement_type || '');
                      const typeInfo = MOVEMENT_TYPE_LABELS[mvType] || {
                        label: mvType,
                        color: '#334155',
                      };
                      const qty = Number(mv.quantity) || 0;
                      return (
                        <tr key={String(mv.id || idx)}>
                          <td style={{ fontSize: '0.78rem', color: '#64748b', whiteSpace: 'nowrap' }}>
                            {new Date(String(mv.created_at)).toLocaleString('vi-VN')}
                          </td>
                          <td>
                            <strong>{String(mv.item_name || 'Mặt hàng')}</strong>
                          </td>
                          <td>
                            <span style={{ fontWeight: 700, color: typeInfo.color }}>
                              {typeInfo.label}
                            </span>
                          </td>
                          <td>
                            <strong style={{ color: qty < 0 ? '#dc2626' : '#15803d', fontSize: '0.9rem' }}>
                              {qty > 0 ? `+${qty.toLocaleString('vi-VN')}` : qty.toLocaleString('vi-VN')}{' '}
                              {String(mv.base_unit || '')}
                            </strong>
                          </td>
                          <td style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>
                            {String(mv.reference_doc_number || '—')}
                          </td>
                          <td>{String(mv.notes || '—')}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          MODAL A: 1-CLICK QUICK RESTOCK (+ NHẬP THÊM HÀNG NHANH)
         ══════════════════════════════════════════════════════════════════ */}
      {restockItem && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
              <div>
                <h3 className={styles.modalTitle}>📥 Nhập Thêm Hàng: {restockItem.name}</h3>
                <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                  Tồn hiện tại: <strong>{restockItem.currentStock.toLocaleString('vi-VN')} {restockItem.baseUnit}</strong>
                </p>
              </div>
              <button type="button" className={styles.modalCloseBtn} onClick={() => setRestockItem(null)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleQuickRestockSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className={styles.formGroup}>
                <label>Số lượng nhập thêm ({restockItem.baseUnit}) *</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={restockQty}
                  onChange={(e) => setRestockQty(e.target.value)}
                  className={styles.formInput}
                  autoFocus
                />
                <div className={styles.quickChips}>
                  {getQuickQuantityPresets(restockItem.baseUnit).map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      className={styles.quickChip}
                      onClick={() => setRestockQty(String(p.value))}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.formGrid} style={{ marginBottom: 0 }}>
                <div className={styles.formGroup}>
                  <label>Đơn giá vốn (VND / 1 {restockItem.baseUnit})</label>
                  <input
                    type="number"
                    min="0"
                    value={restockUnitCost}
                    onChange={(e) => setRestockUnitCost(e.target.value)}
                    className={styles.formInput}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>Hạn sử dụng lô này (Tùy chọn)</label>
                  <input
                    type="date"
                    value={restockExpiry}
                    onChange={(e) => setRestockExpiry(e.target.value)}
                    className={styles.formInput}
                  />
                </div>
              </div>

              <div
                style={{
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: 10,
                  padding: '10px 14px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '0.85rem',
                }}
              >
                <span>Tồn sau khi nhập:</span>
                <strong style={{ color: '#15803d', fontSize: '1rem' }}>
                  {(restockItem.currentStock + (Number(restockQty) || 0)).toLocaleString('vi-VN')}{' '}
                  {restockItem.baseUnit}
                </strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className={styles.secondaryBtn} onClick={() => setRestockItem(null)}>
                  Hủy
                </button>
                <button type="submit" disabled={submitting} className={styles.primaryBtn}>
                  {submitting ? 'Đang nhập...' : '✓ Xác Nhận Nhập Kho'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          MODAL B: 1-CLICK QUICK LOSS / SPOILAGE (⚠️ BÁO HỦY / HAO HỤT)
         ══════════════════════════════════════════════════════════════════ */}
      {lossItem && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
              <div>
                <h3 className={styles.modalTitle} style={{ color: '#c2410c' }}>
                  ⚠️ Xuất Hủy / Hao Hụt: {lossItem.name}
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                  Tồn khả dụng: <strong>{lossItem.currentStock.toLocaleString('vi-VN')} {lossItem.baseUnit}</strong>
                </p>
              </div>
              <button type="button" className={styles.modalCloseBtn} onClick={() => setLossItem(null)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleQuickLossSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className={styles.formGroup}>
                <label>Phân loại hao hụt</label>
                <select
                  value={lossType}
                  onChange={(e) => setLossType(e.target.value as 'OUT_LOSS' | 'OUT_EXPIRED')}
                  className={styles.formInput}
                >
                  <option value="OUT_LOSS">⚠️ Hao hụt vận hành (Đổ hỏng, pha thử, vỡ chai...)</option>
                  <option value="OUT_EXPIRED">🗑️ Hết hạn sử dụng (Thanh lý lô cận/hết date)</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label>Số lượng cần trừ hủy ({lossItem.baseUnit}) *</label>
                <input
                  type="number"
                  required
                  min="1"
                  max={lossItem.currentStock}
                  value={lossQty}
                  onChange={(e) => setLossQty(e.target.value)}
                  placeholder={`Nhập số ${lossItem.baseUnit} bị hỏng/hủy...`}
                  className={styles.formInput}
                  autoFocus
                />
              </div>

              <div className={styles.formGroup}>
                <label>Lý do xuất hủy *</label>
                <div className={styles.quickChips} style={{ marginBottom: 6 }}>
                  {QUICK_LOSS_REASONS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      className={styles.quickChip}
                      onClick={() => setLossReason(r)}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  required
                  value={lossReason}
                  onChange={(e) => setLossReason(e.target.value)}
                  className={styles.formInput}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className={styles.secondaryBtn} onClick={() => setLossItem(null)}>
                  Đóng
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className={styles.primaryBtn}
                  style={{ background: '#dc2626' }}
                >
                  {submitting ? 'Đang trừ kho...' : '⚠️ Xác Nhận Xuất Hủy'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          MODAL C: 1-CLICK QUICK SINGLE-ITEM STOCKTAKE (📋 KIỂM ĐẾM NHANH)
         ══════════════════════════════════════════════════════════════════ */}
      {quickAuditItem && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
              <div>
                <h3 className={styles.modalTitle}>📋 Kiểm Đếm Thực Tế: {quickAuditItem.name}</h3>
                <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                  Tồn trên máy: <strong>{quickAuditItem.currentStock.toLocaleString('vi-VN')} {quickAuditItem.baseUnit}</strong>
                </p>
              </div>
              <button type="button" className={styles.modalCloseBtn} onClick={() => setQuickAuditItem(null)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleQuickAuditSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className={styles.formGroup}>
                <label>Số lượng thực tế đang có trên kệ ({quickAuditItem.baseUnit}) *</label>
                <input
                  type="number"
                  required
                  min="0"
                  value={quickAuditCounted}
                  onChange={(e) => setQuickAuditCounted(e.target.value)}
                  className={styles.formInput}
                  autoFocus
                />
              </div>

              <div className={styles.formGroup}>
                <label>Ghi chú giải trình</label>
                <input
                  type="text"
                  value={quickAuditReason}
                  onChange={(e) => setQuickAuditReason(e.target.value)}
                  className={styles.formInput}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className={styles.secondaryBtn} onClick={() => setQuickAuditItem(null)}>
                  Hủy
                </button>
                <button type="submit" disabled={submitting} className={styles.primaryBtn}>
                  {submitting ? 'Đang lưu...' : '✓ Cập Nhật Số Tồn Thực Tế'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          MODAL D: CREATE / EDIT INVENTORY ITEM (+ THÊM MỚI / ✏️ SỬA)
         ══════════════════════════════════════════════════════════════════ */}
      {showItemModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
              <div>
                <h3 className={styles.modalTitle}>
                  {editingItem ? `✏️ Sửa Mặt Hàng: ${editingItem.name}` : '➕ Thêm Mặt Hàng Mới Vào Kho'}
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                  {editingItem
                    ? 'Cập nhật tên, ngưỡng cảnh báo sắp hết hoặc đơn giá vốn.'
                    : 'Có thể nhập luôn số lượng tồn đầu kỳ đang có sẵn tại quán.'}
                </p>
              </div>
              <button type="button" className={styles.modalCloseBtn} onClick={() => setShowItemModal(false)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveItemModal} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className={styles.formGroup}>
                <label>Tên nguyên liệu / bao bì *</label>
                <input
                  type="text"
                  required
                  placeholder="VD: Sữa Tươi Thanh Trùng Dalat Milk"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className={styles.formInput}
                />
              </div>

              <div className={styles.formGrid} style={{ marginBottom: 0 }}>
                <div className={styles.formGroup}>
                  <label>Phân loại *</label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value)}
                    className={styles.formInput}
                  >
                    <option value="raw_material">🧪 Nguyên liệu pha chế</option>
                    <option value="packaging">🥤 Bao bì (Ly, nắp, chai...)</option>
                    <option value="finished_good">🍾 Chai thành phẩm</option>
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label>Đơn vị tính (ĐVT) *</label>
                  <select
                    value={formUnit}
                    onChange={(e) => setFormUnit(e.target.value)}
                    className={styles.formInput}
                  >
                    <option value="g">Gram (g)</option>
                    <option value="ml">Mililit (ml)</option>
                    <option value="chai">Chai</option>
                    <option value="cai">Cái / Ly / Nắp</option>
                    <option value="hop">Hộp</option>
                  </select>
                </div>
              </div>

              <div className={styles.formGrid} style={{ marginBottom: 0 }}>
                <div className={styles.formGroup}>
                  <label>Báo sắp hết khi dưới ({formUnit}):</label>
                  <input
                    type="number"
                    min="0"
                    value={formMinStock}
                    onChange={(e) => setFormMinStock(e.target.value)}
                    className={styles.formInput}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>Giá vốn (VND / 1 {formUnit}):</label>
                  <input
                    type="number"
                    min="0"
                    value={formCost}
                    onChange={(e) => setFormCost(e.target.value)}
                    className={styles.formInput}
                  />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label>Mã SKU (Để trống hệ thống sẽ tự tạo mã)</label>
                <input
                  type="text"
                  placeholder="VD: MILK-DALAT-01 (Không bắt buộc)"
                  value={formSku}
                  onChange={(e) => setFormSku(e.target.value)}
                  className={styles.formInput}
                />
              </div>

              {!editingItem && (
                <div
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: 10,
                    padding: 12,
                  }}
                >
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
                    📦 Khai báo luôn số lượng đang có sẵn trên kệ (Không bắt buộc):
                  </div>
                  <div className={styles.formGrid} style={{ marginBottom: 0 }}>
                    <div className={styles.formGroup}>
                      <label>Số lượng tồn ban đầu ({formUnit}):</label>
                      <input
                        type="number"
                        min="0"
                        value={formInitStock}
                        onChange={(e) => setFormInitStock(e.target.value)}
                        className={styles.formInput}
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label>Hạn sử dụng (Tùy chọn):</label>
                      <input
                        type="date"
                        value={formInitExpiry}
                        onChange={(e) => setFormInitExpiry(e.target.value)}
                        className={styles.formInput}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
                <button type="button" className={styles.secondaryBtn} onClick={() => setShowItemModal(false)}>
                  Hủy
                </button>
                <button type="submit" disabled={submitting} className={styles.primaryBtn}>
                  {submitting ? 'Đang lưu...' : editingItem ? 'Lưu thay đổi' : '✓ Tạo mặt hàng'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
