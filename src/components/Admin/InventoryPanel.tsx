'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import styles from './InventoryPanel.module.css';
import { formatVND } from '@/data/menu';
import type {
  InventoryOverviewSummary,
  InventoryItemWithStock,
  InventoryLotView,
} from '@/lib/inventory/repository';

type InventoryTab = 'items' | 'lots' | 'receipt' | 'production' | 'audit' | 'movements';

export default function InventoryPanel() {
  const [activeTab, setActiveTab] = useState<InventoryTab>('items');
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Overview data
  const [summary, setSummary] = useState<InventoryOverviewSummary | null>(null);
  const [items, setItems] = useState<InventoryItemWithStock[]>([]);
  const [lots, setLots] = useState<InventoryLotView[]>([]);
  const [movements, setMovements] = useState<Record<string, unknown>[]>([]);

  // Search & Filters
  const [itemSearch, setItemSearch] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  // Form states
  // New Item
  const [newItemSku, setNewItemSku] = useState<string>('');
  const [newItemName, setNewItemName] = useState<string>('');
  const [newItemType, setNewItemType] = useState<string>('raw_material');
  const [newItemUnit, setNewItemUnit] = useState<string>('g');
  const [newItemMinStock, setNewItemMinStock] = useState<string>('500');
  const [newItemCost, setNewItemCost] = useState<string>('200');

  // New Receipt
  const [recNumber, setRecNumber] = useState<string>('NK-0001');
  const [recSupplier, setRecSupplier] = useState<string>('Nhà cung cấp cà phê & sữa');
  const [recItemId, setRecItemId] = useState<string>('');
  const [recQuantity, setRecQuantity] = useState<string>('1000');
  const [recUnitCost, setRecUnitCost] = useState<string>('200');
  const [recLotNumber, setRecLotNumber] = useState<string>('');
  const [recExpiryDate, setRecExpiryDate] = useState<string>('');

  // Production Form
  const [recipes, setRecipes] = useState<Record<string, unknown>[]>([]);
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>('');
  const [prodActualQty, setProdActualQty] = useState<string>('10');
  const [prodOrderCode, setProdOrderCode] = useState<string>('SX-0001');

  // Audit Form
  const [auditItemId, setAuditItemId] = useState<string>('');
  const [auditCountedQty, setAuditCountedQty] = useState<string>('');
  const [auditReason, setAuditReason] = useState<string>('Kiểm kê định kỳ cuối tuần');

  // Fetch summary
  const fetchOverview = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/inventory/summary');
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Không thể tải dữ liệu kho.');
      } else {
        setSummary(data.summary);
        setItems(data.items || []);
        setLots(data.lots || []);
        setMovements(data.recentMovements || []);
      }
    } catch {
      setErrorMsg('Lỗi kết nối máy chủ khi lấy dữ liệu kho.');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRecipes = useCallback(async () => {
    try {
      const res = await fetch('/api/inventory/production');
      const data = await res.json();
      if (res.ok && data.recipes) {
        setRecipes(data.recipes);
        if (data.recipes.length > 0 && !selectedRecipeId) {
          setSelectedRecipeId(String(data.recipes[0].id));
        }
      }
    } catch {
      // Ignore
    }
  }, [selectedRecipeId]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [sumRes, prodRes] = await Promise.all([
          fetch('/api/inventory/summary'),
          fetch('/api/inventory/production'),
        ]);

        if (!active) return;

        if (sumRes.ok) {
          const sumData = await sumRes.json();
          setSummary(sumData.summary);
          setItems(sumData.items || []);
          setLots(sumData.lots || []);
          setMovements(sumData.recentMovements || []);
        }

        if (prodRes.ok) {
          const prodData = await prodRes.json();
          if (prodData.recipes) {
            setRecipes(prodData.recipes);
            if (prodData.recipes.length > 0) {
              setSelectedRecipeId(String(prodData.recipes[0].id));
            }
          }
        }
      } catch {
        if (active) setErrorMsg('Lỗi tải dữ liệu kho.');
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  // Filtered items
  const filteredItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    return items.filter((it) => {
      const matchType = typeFilter === 'ALL' || it.itemType === typeFilter;
      const matchSearch =
        !q || it.name.toLowerCase().includes(q) || it.sku.toLowerCase().includes(q);
      return matchType && matchSearch;
    });
  }, [items, itemSearch, typeFilter]);

  // Handle Create Item
  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch('/api/inventory/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku: newItemSku,
          name: newItemName,
          itemType: newItemType,
          baseUnit: newItemUnit,
          minStockLevel: Number(newItemMinStock) || 0,
          costPrice: Number(newItemCost) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Lỗi tạo mặt hàng.');
      } else {
        setSuccessMsg(`Đã tạo mặt hàng ${newItemName} (${newItemSku}) thành công!`);
        setNewItemSku('');
        setNewItemName('');
        await fetchOverview();
      }
    } catch {
      setErrorMsg('Lỗi kết nối khi tạo mặt hàng.');
    }
  };

  // Handle Goods Receipt
  const handleCreateReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recItemId) {
      setErrorMsg('Vui lòng chọn mặt hàng nhập kho.');
      return;
    }
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const selectedItem = items.find((i) => i.id === recItemId);
      const res = await fetch('/api/inventory/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiptNumber: recNumber,
          supplierName: recSupplier,
          items: [
            {
              itemId: recItemId,
              unit: selectedItem?.baseUnit || 'g',
              quantity: Number(recQuantity) || 0,
              unitCost: Number(recUnitCost) || 0,
              lotNumber: recLotNumber.trim() || undefined,
              expiryDate: recExpiryDate || undefined,
            },
          ],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Lỗi ghi nhận phiếu nhập kho.');
      } else {
        setSuccessMsg(`Đã ghi sổ phiếu nhập kho ${recNumber} thành công! Sinh lớp giá vốn FIFO.`);
        setRecNumber('NK-' + Math.floor(1000 + Math.random() * 9000));
        await fetchOverview();
        setActiveTab('items');
      }
    } catch {
      setErrorMsg('Lỗi kết nối khi gửi phiếu nhập kho.');
    }
  };

  // Handle Production Order
  const handleCreateProduction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecipeId) {
      setErrorMsg('Vui lòng chọn công thức sản xuất.');
      return;
    }
    setErrorMsg(null);
    setSuccessMsg(null);
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
        setSuccessMsg(`Đã hoàn tất lệnh sản xuất ${prodOrderCode}: Trừ NVL theo FEFO/FIFO, tăng tồn thành phẩm chai!`);
        setProdOrderCode('SX-' + Math.floor(1000 + Math.random() * 9000));
        await fetchOverview();
        await fetchRecipes();
        setActiveTab('items');
      }
    } catch {
      setErrorMsg('Lỗi kết nối khi thực hiện lệnh sản xuất.');
    }
  };

  // Handle Audit
  const handleCreateAudit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auditItemId) {
      setErrorMsg('Vui lòng chọn mặt hàng để kiểm kê.');
      return;
    }
    const item = items.find((i) => i.id === auditItemId);
    if (!item) return;

    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch('/api/inventory/audits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auditNumber: 'KK-' + Math.floor(1000 + Math.random() * 9000),
          items: [
            {
              itemId: item.id,
              systemQuantity: item.currentStock,
              countedQuantity: Number(auditCountedQty) || 0,
              unit: item.baseUnit,
              unitCost: item.costPrice,
              reason: auditReason,
            },
          ],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Lỗi ghi nhận phiếu kiểm kê.');
      } else {
        setSuccessMsg(`Đã chốt phiếu kiểm kê cho ${item.name}! Tự động điều chỉnh số dư.`);
        await fetchOverview();
        setActiveTab('items');
      }
    } catch {
      setErrorMsg('Lỗi kết nối khi gửi kiểm kê.');
    }
  };

  return (
    <div className={styles.panel}>
      {/* ── Top Header Bar ── */}
      <div className={styles.headerBar}>
        <div>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>Quản Lý Kho &amp; Giá Vốn FIFO / FEFO</h1>
            <span className={styles.locationBadge}>Kho Quầy Chính Ủ LAB</span>
          </div>
          <p className={styles.subtitle}>
            Định giá xuất kho FIFO · Ưu tiên lô FEFO · Sản xuất đơn giản · Tự động trừ kho bán hàng POS
          </p>
        </div>

        <div className={styles.actionBtnsRow}>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => setActiveTab('receipt')}
          >
            + Nhập Kho Mới
          </button>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => setActiveTab('production')}
          >
            🏭 Lệnh Sản Xuất
          </button>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => setActiveTab('audit')}
          >
            📋 Kiểm Kê
          </button>
        </div>
      </div>

      {errorMsg && <div className={styles.errorBanner}>{errorMsg}</div>}
      {successMsg && <div className={styles.successBanner}>{successMsg}</div>}

      {/* ── Metrics Grid (4 Cards) ── */}
      <div className={styles.metricsGrid}>
        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>Tổng Giá Trị Tồn Kho (FIFO)</div>
          <div className={styles.metricValRow}>
            <span className={styles.metricNumber}>
              {formatVND(summary?.totalValuationVnd || 0)}
            </span>
          </div>
          <div className={styles.metricSubText}>Tính theo các lớp giá vốn đang lưu trữ</div>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>Tổng Mặt Hàng (SKU)</div>
          <div className={styles.metricValRow}>
            <span className={styles.metricNumber}>{summary?.totalItems || items.length}</span>
            <span className={styles.metricUnit}>mặt hàng</span>
          </div>
          <div className={styles.metricSubText}>Nguyên liệu · Bao bì · Chai thành phẩm</div>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>Cảnh Báo Tồn Kho</div>
          <div className={styles.metricValRow}>
            <span
              className={`${styles.metricNumber} ${
                (summary?.lowStockCount || 0) > 0 ? styles.textWarning : ''
              }`}
            >
              {summary?.lowStockCount || 0}
            </span>
            <span className={styles.metricUnit}>cần nhập</span>
          </div>
          <div className={styles.metricSubText}>Dưới ngưỡng tồn tối thiểu đã cấu hình</div>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>Lô Hàng FEFO Đang Quản Lý</div>
          <div className={styles.metricValRow}>
            <span className={styles.metricNumber}>{lots.length}</span>
            <span className={styles.metricUnit}>lô vật lý</span>
          </div>
          <div className={styles.metricSubText}>
            {(summary?.expiringLotsCount || 0) > 0 ? (
              <span className={styles.textDanger}>
                {summary?.expiringLotsCount} lô cận hạn/hết hạn
              </span>
            ) : (
              'Hạn sử dụng đảm bảo an toàn'
            )}
          </div>
        </div>
      </div>

      {/* ── Navigation Tabs Bar ── */}
      <div className={styles.tabsBar}>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === 'items' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('items')}
        >
          📦 Tồn Kho &amp; Mặt Hàng ({items.length})
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === 'lots' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('lots')}
        >
          🏷️ Theo Dõi Lô &amp; Hạn Dùng FEFO ({lots.length})
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === 'receipt' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('receipt')}
        >
          📥 Lập Phiếu Nhập Kho
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === 'production' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('production')}
        >
          🏭 Sản Xuất Đóng Chai ({recipes.length} công thức)
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === 'audit' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('audit')}
        >
          📋 Kiểm Kê &amp; Chênh Lệch
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === 'movements' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('movements')}
        >
          📖 Sổ Cái Biến Động ({movements.length})
        </button>
      </div>

      {/* ── TAB 1: ITEMS & CURRENT STOCK ── */}
      {activeTab === 'items' && (
        <div className={styles.cardContainer}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Danh Mục Mặt Hàng &amp; Số Dư Tồn Kho</h2>
            <div style={{ display: 'flex', gap: 10 }}>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className={styles.formInput}
                style={{ padding: '6px 12px' }}
              >
                <option value="ALL">Tất cả phân loại</option>
                <option value="raw_material">Nguyên vật liệu (Raw)</option>
                <option value="packaging">Bao bì &amp; Ly nắp (Packaging)</option>
                <option value="finished_good">Thành phẩm đóng chai (Finished Good)</option>
              </select>
              <input
                type="search"
                placeholder="Tìm mã SKU, tên hàng..."
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
                className={styles.formInput}
                style={{ padding: '6px 12px', width: 220 }}
              />
            </div>
          </div>

          {loading ? (
            <div className={styles.loadingEmpty}>Đang tải danh mục kho...</div>
          ) : filteredItems.length === 0 ? (
            <div className={styles.loadingEmpty}>Chưa có mặt hàng nào khớp bộ lọc.</div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.invTable}>
                <thead>
                  <tr>
                    <th>Mã SKU</th>
                    <th>Tên mặt hàng</th>
                    <th>Phân loại</th>
                    <th>ĐVT</th>
                    <th>Tồn hiện tại</th>
                    <th>Mức tồn tối thiểu</th>
                    <th>Đơn giá vốn</th>
                    <th>Tổng giá trị</th>
                    <th>Trạng thái tồn</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((it) => (
                    <tr key={it.id}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{it.sku}</td>
                      <td>
                        <strong>{it.name}</strong>
                      </td>
                      <td>
                        {it.itemType === 'raw_material' ? (
                          <span className={styles.badgeTypeRaw}>Nguyên liệu</span>
                        ) : it.itemType === 'packaging' ? (
                          <span className={styles.badgeTypePkg}>Bao bì</span>
                        ) : (
                          <span className={styles.badgeTypeFg}>Chai thành phẩm</span>
                        )}
                      </td>
                      <td>{it.baseUnit}</td>
                      <td>
                        <strong style={{ fontSize: '0.95rem' }}>
                          {it.currentStock.toLocaleString('vi-VN')} {it.baseUnit}
                        </strong>
                      </td>
                      <td>
                        {it.minStockLevel} {it.baseUnit}
                      </td>
                      <td>{formatVND(it.costPrice)}</td>
                      <td>
                        <strong>{formatVND(it.totalValueVnd)}</strong>
                      </td>
                      <td>
                        {it.stockStatus === 'IN_STOCK' ? (
                          <span className={styles.badgeStatusIn}>Đủ hàng</span>
                        ) : it.stockStatus === 'LOW_STOCK' ? (
                          <span className={styles.badgeStatusLow}>Sắp hết</span>
                        ) : (
                          <span className={styles.badgeStatusOut}>Hết hàng</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Quick Add Item Accordion/Box */}
          <div style={{ marginTop: 24, borderTop: '1px solid #f1f5f9', paddingTop: 20 }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 12 }}>
              ➕ Thêm Mặt Hàng Mới Vào Danh Mục
            </h3>
            <form onSubmit={handleCreateItem}>
              <div className={styles.formGrid}>
                <div className={styles.formGroup}>
                  <label>Mã SKU:</label>
                  <input
                    type="text"
                    required
                    value={newItemSku}
                    onChange={(e) => setNewItemSku(e.target.value)}
                    placeholder="VD: ING-COFFEE-ARABICA"
                    className={styles.formInput}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>Tên mặt hàng:</label>
                  <input
                    type="text"
                    required
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    placeholder="VD: Hạt Cà Phê Arabica Cầu Đất"
                    className={styles.formInput}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>Phân loại mặt hàng:</label>
                  <select
                    value={newItemType}
                    onChange={(e) => setNewItemType(e.target.value)}
                    className={styles.formInput}
                  >
                    <option value="raw_material">Nguyên vật liệu (Pha chế)</option>
                    <option value="packaging">Bao bì (Ly, nắp, chai, ống hút)</option>
                    <option value="finished_good">Thành phẩm đóng chai</option>
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label>Đơn vị cơ sở (Base Unit):</label>
                  <select
                    value={newItemUnit}
                    onChange={(e) => setNewItemUnit(e.target.value)}
                    className={styles.formInput}
                  >
                    <option value="g">Gram (g)</option>
                    <option value="ml">Mililit (ml)</option>
                    <option value="chai">Chai</option>
                    <option value="cai">Cái / Ly / Nắp</option>
                    <option value="hop">Hộp</option>
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label>Mức tồn tối thiểu (Cảnh báo):</label>
                  <input
                    type="number"
                    value={newItemMinStock}
                    onChange={(e) => setNewItemMinStock(e.target.value)}
                    className={styles.formInput}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>Giá vốn tham chiếu (VND / đơn vị cơ sở):</label>
                  <input
                    type="number"
                    value={newItemCost}
                    onChange={(e) => setNewItemCost(e.target.value)}
                    className={styles.formInput}
                  />
                </div>
              </div>
              <button type="submit" className={styles.primaryBtn}>
                Lưu Mặt Hàng Mới
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── TAB 2: FEFO PHYSICAL LOTS ── */}
      {activeTab === 'lots' && (
        <div className={styles.cardContainer}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Quản Lý Lô Vật Lý &amp; Ưu Tiên Xuất FEFO</h2>
            <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>
              Quy tắc FEFO: Lô có hạn sử dụng gần nhất sẽ tự động được ưu tiên xuất trước.
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
                    <th>Phân loại</th>
                    <th>Ngày nhập</th>
                    <th>Hạn sử dụng (FEFO)</th>
                    <th>Tình trạng hạn</th>
                    <th>Số lượng nhập</th>
                    <th>Số lượng còn</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {lots.map((lot) => (
                    <tr key={lot.id}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{lot.lotNumber}</td>
                      <td>
                        <strong>{lot.itemName}</strong>
                      </td>
                      <td>{lot.itemType}</td>
                      <td>{lot.receivedDate}</td>
                      <td>
                        <strong>{lot.expiryDate || '— (Không date)'}</strong>
                      </td>
                      <td>
                        {lot.expiryAlert === 'EXPIRED' ? (
                          <span className={styles.badgeStatusOut}>Đã hết hạn!</span>
                        ) : lot.expiryAlert === 'CRITICAL' ? (
                          <span className={styles.badgeStatusLow}>
                            Cận date ({lot.daysToExpiry} ngày)
                          </span>
                        ) : (
                          <span className={styles.badgeStatusIn}>Còn hạn tốt</span>
                        )}
                      </td>
                      <td>
                        {lot.initialQuantity} {lot.baseUnit}
                      </td>
                      <td>
                        <strong>
                          {lot.remainingQuantity} {lot.baseUnit}
                        </strong>
                      </td>
                      <td>
                        <span className={styles.badgeStatusIn}>{lot.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 3: GOODS RECEIPT FORM ── */}
      {activeTab === 'receipt' && (
        <div className={styles.cardContainer}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Lập Phiếu Nhập Hàng (Tạo Lô &amp; Lớp Giá FIFO)</h2>
          </div>
          <form onSubmit={handleCreateReceipt}>
            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label>Mã phiếu nhập:</label>
                <input
                  type="text"
                  required
                  value={recNumber}
                  onChange={(e) => setRecNumber(e.target.value)}
                  className={styles.formInput}
                />
              </div>
              <div className={styles.formGroup}>
                <label>Nhà cung cấp:</label>
                <input
                  type="text"
                  value={recSupplier}
                  onChange={(e) => setRecSupplier(e.target.value)}
                  className={styles.formInput}
                />
              </div>
              <div className={styles.formGroup}>
                <label>Chọn mặt hàng nhập:</label>
                <select
                  required
                  value={recItemId}
                  onChange={(e) => {
                    setRecItemId(e.target.value);
                    const it = items.find((i) => i.id === e.target.value);
                    if (it) setRecUnitCost(String(it.costPrice));
                  }}
                  className={styles.formInput}
                >
                  <option value="">-- Chọn mặt hàng --</option>
                  {items.map((it) => (
                    <option key={it.id} value={it.id}>
                      [{it.sku}] {it.name} ({it.baseUnit})
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.formGroup}>
                <label>Số lượng nhập (đơn vị cơ sở):</label>
                <input
                  type="number"
                  required
                  value={recQuantity}
                  onChange={(e) => setRecQuantity(e.target.value)}
                  className={styles.formInput}
                />
              </div>
              <div className={styles.formGroup}>
                <label>Đơn giá nhập (VND / đơn vị cơ sở):</label>
                <input
                  type="number"
                  required
                  value={recUnitCost}
                  onChange={(e) => setRecUnitCost(e.target.value)}
                  className={styles.formInput}
                />
              </div>
              <div className={styles.formGroup}>
                <label>Mã lô hàng (Tự động hoặc theo NCC):</label>
                <input
                  type="text"
                  placeholder="VD: LOT-202610-01"
                  value={recLotNumber}
                  onChange={(e) => setRecLotNumber(e.target.value)}
                  className={styles.formInput}
                />
              </div>
              <div className={styles.formGroup}>
                <label>Hạn sử dụng (Để xếp lịch FEFO):</label>
                <input
                  type="date"
                  value={recExpiryDate}
                  onChange={(e) => setRecExpiryDate(e.target.value)}
                  className={styles.formInput}
                />
              </div>
              <div className={styles.formGroup}>
                <label>Thành tiền dự kiến:</label>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#15803d', paddingTop: 8 }}>
                  {formatVND((Number(recQuantity) || 0) * (Number(recUnitCost) || 0))}
                </div>
              </div>
            </div>
            <button type="submit" className={styles.primaryBtn} style={{ padding: '12px 24px' }}>
              📥 Xác Nhận Nhập Kho &amp; Tạo Lớp Giá FIFO
            </button>
          </form>
        </div>
      )}

      {/* ── TAB 4: SIMPLE PRODUCTION FORM ── */}
      {activeTab === 'production' && (
        <div className={styles.cardContainer}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Lệnh Sản Xuất Đóng Chai Đơn Giản</h2>
            <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>
              Quy tắc: Tiêu hao NVL theo FEFO &amp; FIFO, tự động tính giá vốn 1 chai thành phẩm.
            </span>
          </div>

          <form onSubmit={handleCreateProduction}>
            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label>Mã lệnh sản xuất:</label>
                <input
                  type="text"
                  required
                  value={prodOrderCode}
                  onChange={(e) => setProdOrderCode(e.target.value)}
                  className={styles.formInput}
                />
              </div>
              <div className={styles.formGroup}>
                <label>Chọn công thức sản xuất đã duyệt:</label>
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
                <label>Sản lượng thực tế đạt chuẩn (chai):</label>
                <input
                  type="number"
                  required
                  value={prodActualQty}
                  onChange={(e) => setProdActualQty(e.target.value)}
                  className={styles.formInput}
                />
              </div>
            </div>

            <button type="submit" className={styles.primaryBtn} style={{ padding: '12px 24px' }}>
              🏭 Ghi Sổ Lệnh Sản Xuất &amp; Tăng Tồn Thành Phẩm
            </button>
          </form>
        </div>
      )}

      {/* ── TAB 5: STOCK AUDIT FORM ── */}
      {activeTab === 'audit' && (
        <div className={styles.cardContainer}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Phiếu Kiểm Kê &amp; Ghi Nhận Chênh Lệch</h2>
          </div>
          <form onSubmit={handleCreateAudit}>
            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label>Chọn mặt hàng kiểm kê:</label>
                <select
                  required
                  value={auditItemId}
                  onChange={(e) => {
                    setAuditItemId(e.target.value);
                    const it = items.find((i) => i.id === e.target.value);
                    if (it) setAuditCountedQty(String(it.currentStock));
                  }}
                  className={styles.formInput}
                >
                  <option value="">-- Chọn mặt hàng --</option>
                  {items.map((it) => (
                    <option key={it.id} value={it.id}>
                      [{it.sku}] {it.name} (Tồn hệ thống: {it.currentStock} {it.baseUnit})
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.formGroup}>
                <label>Số lượng đếm thực tế:</label>
                <input
                  type="number"
                  required
                  value={auditCountedQty}
                  onChange={(e) => setAuditCountedQty(e.target.value)}
                  className={styles.formInput}
                />
              </div>
              <div className={styles.formGroup} style={{ gridColumn: 'span 2' }}>
                <label>Lý do giải trình chênh lệch / Ghi chú kiểm kê:</label>
                <input
                  type="text"
                  value={auditReason}
                  onChange={(e) => setAuditReason(e.target.value)}
                  className={styles.formInput}
                />
              </div>
            </div>
            <button type="submit" className={styles.primaryBtn} style={{ padding: '12px 24px' }}>
              📋 Chốt Phiếu Kiểm Kê &amp; Cân Bằng Tồn Kho
            </button>
          </form>
        </div>
      )}

      {/* ── TAB 6: MOVEMENTS LEDGER ── */}
      {activeTab === 'movements' && (
        <div className={styles.cardContainer}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Sổ Cái Biến Động Kho (Immutable Ledger)</h2>
            <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>
              Mọi thay đổi tồn kho đều lưu vết nguồn, không thể xóa sửa trực tiếp.
            </span>
          </div>

          {movements.length === 0 ? (
            <div className={styles.loadingEmpty}>Chưa có giao dịch biến động kho nào.</div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.invTable}>
                <thead>
                  <tr>
                    <th>Thời gian</th>
                    <th>Loại biến động</th>
                    <th>Mã chứng từ nguồn</th>
                    <th>Số lượng</th>
                    <th>Đơn vị</th>
                    <th>Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((mv: Record<string, unknown>, idx) => (
                    <tr key={String(mv.id || idx)}>
                      <td style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        {new Date(String(mv.created_at)).toLocaleString('vi-VN')}
                      </td>
                      <td>
                        <strong style={{ color: Number(mv.quantity) < 0 ? '#dc2626' : '#16a34a' }}>
                          {String(mv.movement_type)}
                        </strong>
                      </td>
                      <td style={{ fontFamily: 'monospace' }}>
                        {String(mv.reference_doc_number || mv.reference_doc_id || '—')}
                      </td>
                      <td>
                        <strong>
                          {Number(mv.quantity) > 0 ? `+${String(mv.quantity)}` : String(mv.quantity ?? 0)}
                        </strong>
                      </td>
                      <td>{String(mv.base_unit || '')}</td>
                      <td>{String(mv.notes || '—')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
