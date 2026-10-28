'use client';

import React, { useState, useEffect } from 'react';
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

  // Auto-dismiss toast
  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => {
      setToastMessage(null);
    }, 3500);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  // Fetch products and availability state from server on mount
  useEffect(() => {
    let active = true;
    const loadProducts = async () => {
      try {
        const res = await fetch('/api/admin/products');
        if (res.ok) {
          const data = await res.json();
          if (active && Array.isArray(data.products) && data.products.length > 0) {
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
    };

    loadProducts();
    return () => {
      active = false;
    };
  }, []);

  // Toggle availability (Báo hết / Mở bán lại)
  const toggleAvailability = async (item: MenuItem) => {
    const isCurrentlyOut = unavailableIds.includes(item.id);
    const nextIsOut = !isCurrentlyOut;

    // Optimistic UI update
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

        // Broadcast to POS and other panels
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('ulab:menu-changed', {
              detail: { productId: item.id, isAvailable: !nextIsOut },
            })
          );
        }
      } else {
        // Rollback on error
        setUnavailableIds((prev) =>
          isCurrentlyOut ? [...prev, item.id] : prev.filter((id) => id !== item.id)
        );
        setToastMessage('Lỗi cập nhật trạng thái món. Vui lòng thử lại.');
      }
    } catch (err) {
      console.error('Error toggling product availability:', err);
      // Rollback on error
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

    // Optimistic update
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

  const filteredItems = items.filter((item) => {
    const matchCat = categoryFilter === 'ALL' || item.categorySlug === categoryFilter;
    const matchSearch = item.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Quản lý Thực Đơn &amp; Giá Bán</h1>
          <p className={styles.subtitle}>
            Điều chỉnh giá theo cỡ ly (Size M, L, Chai) và tức thì bật/tắt báo hết hàng đồng bộ sang quầy POS.
          </p>
        </div>
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
              {cat.name} ({cat.items.length})
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
    </div>
  );
}
