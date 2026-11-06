'use client';

import React, { useState, useEffect, useCallback } from 'react';
import styles from './ProductsPanel.module.css';
import { menuData, allMenuItems, formatVND, MenuItem } from '@/data/menu';
import { CategorySvgIcon, StarSolidIcon } from '@/components/Icons/LabIcons';

export default function ProductsPanel() {
  const [items, setItems] = useState<MenuItem[]>(allMenuItems);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [unavailableIds, setUnavailableIds] = useState<string[]>([]);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [editSizes, setEditSizes] = useState<{ label: string; price: number }[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Create New Product Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCatSlug, setNewCatSlug] = useState('matcha');
  const [newIsSignature, setNewIsSignature] = useState(false);
  const [newShelfLife, setNewShelfLife] = useState('');
  const [newPriceM, setNewPriceM] = useState('40000');
  const [newPriceL, setNewPriceL] = useState('35000');
  const [newHasSizeL, setNewHasSizeL] = useState(false);
  const [newPriceBottle, setNewPriceBottle] = useState('69000');
  const [creatingProduct, setCreatingProduct] = useState(false);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => {
      setToastMessage(null);
    }, 3500);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const loadProducts = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/products', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.products) && data.products.length > 0) {
          setItems(data.products);
          const outIds: string[] = data.products
            .filter((p: MenuItem & { is_available?: boolean }) => p.is_available === false)
            .map((p: MenuItem) => p.id);
          setUnavailableIds(outIds);
        }
      }
    } catch (err) {
      console.warn('Fallback loading menu products:', err);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  // Toggle availability (Báo hết / Mở bán lại)
  const toggleAvailability = async (item: MenuItem) => {
    const isCurrentlyOut = unavailableIds.includes(item.id);
    const nextIsOut = !isCurrentlyOut;

    setUnavailableIds((prev) =>
      nextIsOut ? [...prev, item.id] : prev.filter((id) => id !== item.id)
    );
    setUpdatingId(item.id);

    try {
      const res = await fetch('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'TOGGLE_AVAILABILITY',
          productId: item.id,
          isAvailable: !nextIsOut,
        }),
      });

      if (res.ok) {
        setToastMessage(
          nextIsOut
            ? `Đã báo hết món "${item.name}". Quầy POS sẽ tạm ngưng bán món này.`
            : `Đã mở bán lại món "${item.name}". Quầy POS đã sẵn sàng phục vụ.`
        );

        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('ulab:menu-changed', {
              detail: { productId: item.id, isAvailable: !nextIsOut },
            })
          );
        }
      } else {
        setUnavailableIds((prev) =>
          isCurrentlyOut ? [...prev, item.id] : prev.filter((id) => id !== item.id)
        );
        setToastMessage('Lỗi cập nhật trạng thái món. Vui lòng thử lại.');
      }
    } catch (err) {
      console.error('Error toggling product availability:', err);
      setUnavailableIds((prev) =>
        isCurrentlyOut ? [...prev, item.id] : prev.filter((id) => id !== item.id)
      );
      setToastMessage('Không thể kết nối đến máy chủ.');
    } finally {
      setUpdatingId(null);
    }
  };

  const openEditModal = (item: MenuItem) => {
    setEditingItem(item);
    setEditSizes(item.sizes.map((s) => ({ ...s })));
  };

  const handleSavePrices = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    const newSizes = editSizes.map((s) => ({
      label: s.label,
      price: Math.max(1000, Number(s.price) || 0),
    }));

    setItems((prev) =>
      prev.map((it) => (it.id === editingItem.id ? { ...it, sizes: newSizes } : it))
    );
    const savedName = editingItem.name;
    const savedId = editingItem.id;
    setEditingItem(null);

    try {
      const res = await fetch('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'UPDATE_PRICES',
          productId: savedId,
          sizes: newSizes,
        }),
      });

      if (res.ok) {
        setToastMessage(`Đã cập nhật bảng giá mới cho món "${savedName}".`);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('ulab:menu-changed', { detail: { productId: savedId } })
          );
        }
      }
    } catch (err) {
      console.error('Error saving prices:', err);
    }
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    const isBottleCat = newCatSlug === 'cold-brew-chai';
    const sizes = isBottleCat
      ? [{ label: 'Chai', price: Math.max(1000, Number(newPriceBottle) || 69000) }]
      : newHasSizeL || newCatSlug === 'cold-brew'
        ? [
            { label: 'M', price: Math.max(1000, Number(newPriceM) || 30000) },
            { label: 'L', price: Math.max(1000, Number(newPriceL) || 35000) },
          ]
        : [{ label: 'M', price: Math.max(1000, Number(newPriceM) || 40000) }];

    setCreatingProduct(true);
    try {
      const res = await fetch('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CREATE_PRODUCT',
          name: newName.trim(),
          categorySlug: newCatSlug,
          isSignature: newIsSignature,
          shelfLife: isBottleCat ? newShelfLife.trim() : undefined,
          sizes,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setToastMessage(`✓ Đã thêm món "${newName.trim()}" vào thực đơn và đồng bộ sang POS!`);
        setShowCreateModal(false);
        setNewName('');
        setNewIsSignature(false);
        setNewShelfLife('');
        await loadProducts();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('ulab:menu-changed'));
        }
      } else {
        setToastMessage(data.error || 'Không thể tạo món mới.');
      }
    } catch {
      setToastMessage('Lỗi kết nối khi tạo món mới.');
    } finally {
      setCreatingProduct(false);
    }
  };

  const filteredItems = items.filter((item) => {
    const matchCat = categoryFilter === 'ALL' || item.categorySlug === categoryFilter;
    const matchSearch = item.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <div className={styles.panel}>
      <div className={styles.header} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className={styles.title}>Quản lý Thực Đơn &amp; Giá Bán</h1>
          <p className={styles.subtitle}>
            Thêm món mới, điều chỉnh giá theo cỡ ly (Size M, L, Chai) và bật/tắt báo hết hàng đồng bộ tức thì sang quầy POS.
          </p>
        </div>
        <button
          type="button"
          className={styles.primaryBtn}
          style={{ padding: '10px 18px', fontWeight: 700, fontSize: '0.85rem' }}
          onClick={() => setShowCreateModal(true)}
        >
          + Thêm món mới vào Menu
        </button>
      </div>

      {/* Overview Stats */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Tổng số món</span>
          <span className={styles.statValue}>{items.length}</span>
          <span className={styles.statChange}>Trên {menuData.length} nhóm thực đơn</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Đang mở bán</span>
          <span className={styles.statValue} style={{ color: '#15803d' }}>
            {items.length - unavailableIds.length}
          </span>
          <span className={styles.statChange}>Hiển thị sẵn sàng phục vụ tại POS</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Món Signature</span>
          <span className={styles.statValue}>
            {items.filter((i) => i.isSignature).length}
          </span>
          <span className={styles.statChange}>Best-seller chủ đạo</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Tạm hết hàng</span>
          <span className={styles.statValue} style={{ color: unavailableIds.length > 0 ? '#dc2626' : '#64748b' }}>
            {unavailableIds.length}
          </span>
          <span className={styles.statChange}>Bị khóa tại quầy POS</span>
        </div>
      </div>

      <div className={styles.toolbar}>
        <input
          type="text"
          placeholder="Tìm kiếm tên món..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={styles.searchInput}
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className={styles.selectInput}
        >
          <option value="ALL">Tất cả danh mục ({items.length})</option>
          {menuData.map((cat) => (
            <option key={cat.slug} value={cat.slug}>
              {cat.name} ({items.filter((i) => i.categorySlug === cat.slug).length})
            </option>
          ))}
        </select>
      </div>

      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Tên thức uống</th>
              <th>Danh mục</th>
              <th>Bảng giá theo Size</th>
              <th>Phân loại</th>
              <th>Trạng thái</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item) => {
              const isOut = unavailableIds.includes(item.id);
              const isBusy = updatingId === item.id;
              return (
                <tr key={item.id} className={`${styles.tableRow} ${isOut ? styles.tableRowOut : ''}`}>
                  <td>
                    <div className={styles.itemName}>{item.name}</div>
                    {item.shelfLife && (
                      <div className={styles.itemSub}>Bảo quản lạnh: {item.shelfLife}</div>
                    )}
                  </td>
                  <td>
                    <span className={styles.badge}>
                      <CategorySvgIcon slug={item.categorySlug} size={13} />
                      <span>{item.category}</span>
                    </span>
                  </td>
                  <td>
                    <div className={styles.sizeTags}>
                      {item.sizes.map((s) => (
                        <span key={s.label} className={styles.sizeTag}>
                          <strong>{s.label}</strong>: {formatVND(s.price)}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    {item.isSignature ? (
                      <span className={`${styles.badge} ${styles.badgeGold}`}>
                        <StarSolidIcon size={11} />
                        <span>Signature</span>
                      </span>
                    ) : (
                      <span className={styles.mutedText}>{item.tag || 'Tiêu chuẩn'}</span>
                    )}
                  </td>
                  <td>
                    <span
                      className={`${styles.statusBadge} ${isOut ? styles.statusOut : styles.statusIn}`}
                    >
                      <span
                        className={`${styles.statusDot} ${isOut ? styles.dotOut : styles.dotIn}`}
                      />
                      {isOut ? 'Tạm hết hàng' : 'Đang mở bán'}
                    </span>
                  </td>
                  <td>
                    <div className={styles.actionGroup}>
                      <button
                        type="button"
                        className={`${styles.actionBtn} ${styles.actionBtnEdit}`}
                        onClick={() => openEditModal(item)}
                      >
                        Sửa giá
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        className={`${styles.actionBtn} ${
                          isOut ? styles.actionBtnReopen : styles.actionBtnReportOut
                        }`}
                        onClick={() => toggleAvailability(item)}
                        title={isOut ? 'Mở bán lại tại quầy POS' : 'Báo hết món này tại quầy POS'}
                      >
                        {isBusy ? 'Đang xử lý...' : isOut ? '✓ Mở bán lại' : 'Báo hết'}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className={styles.toast}>
          <span className={styles.toastIcon}>✓</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Edit Price Modal */}
      {editingItem && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 16,
          }}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: 16,
              padding: 24,
              width: '100%',
              maxWidth: 400,
              boxShadow: '0 20px 45px rgba(0,0,0,0.2)',
            }}
          >
            <h3 style={{ margin: '0 0 6px', fontSize: '1.125rem', color: '#1E3932' }}>
              Điều chỉnh giá: {editingItem.name}
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: '0.8125rem', color: '#666' }}>
              Cập nhật đơn giá (VNĐ) cho từng kích cỡ của món nước này.
            </p>
            <form onSubmit={handleSavePrices} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {editSizes.map((sz, idx) => (
                <div key={sz.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <label style={{ fontWeight: 700, fontSize: '0.875rem', color: '#1E3932', minWidth: 70 }}>
                    Size {sz.label}
                  </label>
                  <input
                    type="number"
                    value={sz.price}
                    step={1000}
                    min={1000}
                    onChange={(e) => {
                      const next = [...editSizes];
                      next[idx].price = Number(e.target.value);
                      setEditSizes(next);
                    }}
                    className={styles.searchInput}
                    style={{ flex: 1 }}
                  />
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className={`${styles.actionBtn} ${styles.actionBtnEdit}`}
                >
                  Hủy
                </button>
                <button type="submit" className={styles.primaryBtn}>
                  Lưu giá mới
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create New Product Modal */}
      {showCreateModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 16,
          }}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: 16,
              padding: 24,
              width: '100%',
              maxWidth: 440,
              boxShadow: '0 20px 45px rgba(0,0,0,0.2)',
            }}
          >
            <h3 style={{ margin: '0 0 6px', fontSize: '1.15rem', color: '#1E3932' }}>
              🍹 Thêm Món Mới Vào Thực Đơn
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: '0.8125rem', color: '#64748b' }}>
              Món mới sẽ được lưu vào cơ sở dữ liệu và xuất hiện ngay trên quầy POS.
            </p>
            <form onSubmit={handleCreateProduct} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontWeight: 700, fontSize: '0.825rem', color: '#1E3932', marginBottom: 4 }}>
                  Tên thức uống *
                </label>
                <input
                  type="text"
                  required
                  placeholder="VD: Matcha Kem Phô Mai"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className={styles.searchInput}
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 700, fontSize: '0.825rem', color: '#1E3932', marginBottom: 4 }}>
                  Nhóm thực đơn *
                </label>
                <select
                  value={newCatSlug}
                  onChange={(e) => {
                    const slug = e.target.value;
                    setNewCatSlug(slug);
                    if (slug === 'cold-brew') {
                      setNewPriceM('30000');
                      setNewPriceL('35000');
                      setNewHasSizeL(true);
                    } else if (slug === 'matcha') {
                      setNewPriceM('40000');
                      setNewHasSizeL(false);
                    }
                  }}
                  className={styles.selectInput}
                  style={{ width: '100%' }}
                >
                  <option value="cold-brew">🧊 Cold Brew</option>
                  <option value="matcha">🍵 Matcha</option>
                  <option value="cold-brew-chai">🍾 Cold Brew Chai</option>
                </select>
              </div>

              {newCatSlug === 'cold-brew-chai' ? (
                <>
                  <div>
                    <label style={{ display: 'block', fontWeight: 700, fontSize: '0.825rem', color: '#1E3932', marginBottom: 4 }}>
                      Đơn giá Chai (VNĐ) *
                    </label>
                    <input
                      type="number"
                      step={1000}
                      min={1000}
                      required
                      value={newPriceBottle}
                      onChange={(e) => setNewPriceBottle(e.target.value)}
                      className={styles.searchInput}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontWeight: 700, fontSize: '0.825rem', color: '#1E3932', marginBottom: 4 }}>
                      Thời hạn bảo quản lạnh (Tùy chọn)
                    </label>
                    <input
                      type="text"
                      placeholder="VD: 5 – 7 ngày"
                      value={newShelfLife}
                      onChange={(e) => setNewShelfLife(e.target.value)}
                      className={styles.searchInput}
                      style={{ width: '100%' }}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: (newHasSizeL || newCatSlug === 'cold-brew') ? '1fr 1fr' : '1fr', gap: 12 }}>
                    <div>
                      <label style={{ display: 'block', fontWeight: 700, fontSize: '0.825rem', color: '#1E3932', marginBottom: 4 }}>
                        Giá Size M (VNĐ) *
                      </label>
                      <input
                        type="number"
                        step={1000}
                        min={1000}
                        required
                        value={newPriceM}
                        onChange={(e) => setNewPriceM(e.target.value)}
                        className={styles.searchInput}
                        style={{ width: '100%' }}
                      />
                    </div>
                    {(newHasSizeL || newCatSlug === 'cold-brew') && (
                      <div>
                        <label style={{ display: 'block', fontWeight: 700, fontSize: '0.825rem', color: '#1E3932', marginBottom: 4 }}>
                          Giá Size L (VNĐ) *
                        </label>
                        <input
                          type="number"
                          step={1000}
                          min={1000}
                          required
                          value={newPriceL}
                          onChange={(e) => setNewPriceL(e.target.value)}
                          className={styles.searchInput}
                          style={{ width: '100%' }}
                        />
                      </div>
                    )}
                  </div>
                  {newCatSlug !== 'cold-brew' && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.825rem', color: '#475569', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={newHasSizeL}
                        onChange={(e) => setNewHasSizeL(e.target.checked)}
                      />
                      Có bán thêm Size L
                    </label>
                  )}
                </>
              )}

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', fontWeight: 600, color: '#1E3932', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={newIsSignature}
                  onChange={(e) => setNewIsSignature(e.target.checked)}
                />
                Gắn nhãn ★ Signature (Best-seller chủ đạo)
              </label>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className={`${styles.actionBtn} ${styles.actionBtnEdit}`}
                >
                  Hủy
                </button>
                <button type="submit" disabled={creatingProduct} className={styles.primaryBtn}>
                  {creatingProduct ? 'Đang lưu...' : '✓ Lưu món mới'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
