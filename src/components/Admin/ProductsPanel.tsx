'use client';

import { useState, useEffect, useCallback } from 'react';
import styles from './ProductsPanel.module.css';
import { formatVND } from '@/data/menu';

export type ProductSubTab = 'products' | 'categories' | 'inventory';

interface ProductItem {
  id: string;
  name: string;
  category: string;
  categorySlug: string;
  categoryName: string;
  sizes: { label: string; price: number }[];
  is_available: boolean;
  isSignature?: boolean;
}

interface CategoryItem {
  id: string;
  name: string;
  slug: string;
  itemCount: number;
}

interface InventoryItem {
  id: string;
  name: string;
  sku: string;
  category: string;
  unit: string;
  current_stock: number;
  min_stock: number;
  cost_price: number;
  status: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
  updated_at: string;
}

interface ProductsPanelProps {
  initialSubTab?: ProductSubTab;
}

export default function ProductsPanel({ initialSubTab = 'products' }: ProductsPanelProps) {
  const [subTab, setSubTab] = useState<ProductSubTab>(initialSubTab);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/products');
      if (res.ok) {
        const data = await res.json();
        setProducts(data.products || []);
        setCategories(data.categories || []);
        setInventory(data.inventory || []);
      }
    } catch (err) {
      console.error('Fetch products error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Toggle product availability
  const handleToggleAvailability = async (productId: string, currentStatus: boolean) => {
    try {
      const res = await fetch('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'TOGGLE_AVAILABILITY',
          productId,
          isAvailable: !currentStatus,
        }),
      });

      if (res.ok) {
        setProducts((prev) =>
          prev.map((p) => (p.id === productId ? { ...p, is_available: !currentStatus } : p))
        );
      }
    } catch (err) {
      console.error('Toggle error:', err);
    }
  };

  // Adjust stock
  const handleAdjustStock = async (inventoryId: string, adjustment: number) => {
    try {
      const res = await fetch('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'ADJUST_STOCK',
          inventoryId,
          adjustment,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setInventory((prev) =>
          prev.map((i) => (i.id === inventoryId ? data.item : i))
        );
      }
    } catch (err) {
      console.error('Adjust stock error:', err);
    }
  };

  // Filtered Products
  const filteredProducts = products.filter((p) => {
    const matchCat = categoryFilter === 'ALL' || p.categorySlug === categoryFilter;
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <div className={styles.panel}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <h2 className={styles.title}>☕ Quản lý Sản phẩm & Kho</h2>
          <span className={styles.badge}>{products.length} món thức uống</span>
        </div>
      </div>

      {/* Sub Tabs */}
      <div className={styles.subTabs}>
        <button
          className={`${styles.subTabBtn} ${subTab === 'products' ? styles.activeSubTab : ''}`}
          onClick={() => setSubTab('products')}
        >
          <span>🍵</span> Danh sách món (Products)
        </button>
        <button
          className={`${styles.subTabBtn} ${subTab === 'categories' ? styles.activeSubTab : ''}`}
          onClick={() => setSubTab('categories')}
        >
          <span>📂</span> Danh mục (Categories)
        </button>
        <button
          className={`${styles.subTabBtn} ${subTab === 'inventory' ? styles.activeSubTab : ''}`}
          onClick={() => setSubTab('inventory')}
        >
          <span>📦</span> Kho nguyên liệu & Vật tư (Inventory)
        </button>
      </div>

      {/* SUBTAB 1: PRODUCTS */}
      {subTab === 'products' && (
        <>
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>Tổng số món</span>
              <span className={styles.statValue}>{products.length}</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>Đang phục vụ</span>
              <span className={styles.statValue} style={{ color: '#15803d' }}>
                {products.filter((p) => p.is_available).length}
              </span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>Tạm ngưng phục vụ</span>
              <span className={styles.statValue} style={{ color: '#b91c1c' }}>
                {products.filter((p) => !p.is_available).length}
              </span>
            </div>
          </div>

          <div className={styles.toolbar}>
            <div className={styles.searchBox}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={styles.searchIcon}>
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Tìm kiếm tên món..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={styles.searchInput}
              />
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className={styles.select}
            >
              <option value="ALL">Tất cả danh mục</option>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.tableContainer}>
            {loading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ink-muted)' }}>
                Đang tải thực đơn quán...
              </div>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Tên món</th>
                    <th>Danh mục</th>
                    <th>Kích thước & Giá niêm yết</th>
                    <th>Trạng thái</th>
                    <th style={{ textAlign: 'right' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <div className={styles.productName}>
                          {p.name}
                          {p.isSignature && (
                            <span style={{ marginLeft: '6px', fontSize: '0.7rem', background: '#fef3c7', color: '#b45309', padding: '2px 6px', borderRadius: '4px' }}>
                              Signature ⭐
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.8rem', color: 'var(--ink-secondary)' }}>
                          {p.categoryName}
                        </span>
                      </td>
                      <td>
                        <div>
                          {p.sizes.map((s, idx) => (
                            <span key={idx} className={styles.sizeTag}>
                              {s.label}: <strong>{formatVND(s.price)}</strong>
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <span className={p.is_available ? styles.statusActive : styles.statusDisabled}>
                          {p.is_available ? '● Đang bán' : '○ Tạm hết'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className={styles.actionBtn}
                          onClick={() => handleToggleAvailability(p.id, p.is_available)}
                          style={{
                            color: p.is_available ? '#b91c1c' : '#15803d',
                            borderColor: p.is_available ? '#fecaca' : '#bbf7d0',
                          }}
                        >
                          {p.is_available ? 'Tắt bán' : 'Mở bán'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* SUBTAB 2: CATEGORIES */}
      {subTab === 'categories' && (
        <div className={styles.catGrid}>
          {categories.map((c) => (
            <div key={c.id} className={styles.catCard}>
              <div>
                <h3 style={{ margin: '0 0 6px', fontSize: '1.1rem', color: 'var(--ink)' }}>
                  {c.name}
                </h3>
                <div style={{ color: 'var(--ink-muted)', fontSize: '0.85rem' }}>
                  Slug: <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>{c.slug}</code>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent)' }}>
                  {c.itemCount}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>món đồ uống</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* SUBTAB 3: INVENTORY */}
      {subTab === 'inventory' && (
        <>
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>Mặt hàng theo dõi</span>
              <span className={styles.statValue}>{inventory.length}</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>Cảnh báo sắp hết hàng</span>
              <span className={styles.statValue} style={{ color: '#b45309' }}>
                {inventory.filter((i) => i.current_stock <= i.min_stock).length}
              </span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>Tổng giá trị tồn kho ước tính</span>
              <span className={styles.statValue} style={{ color: 'var(--ink)' }}>
                {formatVND(inventory.reduce((sum, i) => sum + i.current_stock * i.cost_price, 0))}
              </span>
            </div>
          </div>

          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Nguyên vật liệu / Vật tư</th>
                  <th>Phân loại</th>
                  <th>Đơn vị</th>
                  <th>Tồn kho hiện tại</th>
                  <th>Định mức tối thiểu</th>
                  <th>Trạng thái</th>
                  <th style={{ textAlign: 'right' }}>Điều chỉnh kho</th>
                </tr>
              </thead>
              <tbody>
                {inventory.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{item.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>Mã SKU: {item.sku}</div>
                    </td>
                    <td>{item.category}</td>
                    <td>{item.unit}</td>
                    <td>
                      <strong style={{ fontSize: '1rem', color: item.current_stock <= item.min_stock ? '#b45309' : 'var(--ink)' }}>
                        {item.current_stock}
                      </strong>
                    </td>
                    <td>{item.min_stock}</td>
                    <td>
                      {item.current_stock === 0 ? (
                        <span className={styles.statusDisabled}>Hết hàng</span>
                      ) : item.current_stock <= item.min_stock ? (
                        <span className={styles.statusLowStock}>⚠️ Cần nhập thêm</span>
                      ) : (
                        <span className={styles.statusActive}>An toàn</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '4px' }}>
                        <button
                          className={styles.actionBtn}
                          onClick={() => handleAdjustStock(item.id, -1)}
                          disabled={item.current_stock <= 0}
                          title="Xuất bớt 1 đơn vị"
                        >
                          -1
                        </button>
                        <button
                          className={styles.actionBtn}
                          onClick={() => handleAdjustStock(item.id, 1)}
                          title="Nhập thêm 1 đơn vị"
                        >
                          +1
                        </button>
                        <button
                          className={styles.actionBtn}
                          onClick={() => handleAdjustStock(item.id, 5)}
                          title="Nhập lô +5"
                          style={{ background: '#f0fdf4', color: '#15803d', borderColor: '#bbf7d0' }}
                        >
                          +5
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
