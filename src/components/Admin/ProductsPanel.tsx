'use client';

import { useState } from 'react';
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

  const toggleAvailability = (id: string) => {
    setUnavailableIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const openEditModal = (item: MenuItem) => {
    setEditingItem(item);
    setEditSizes(item.sizes.map((s) => ({ ...s })));
  };

  const handleSavePrices = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    setItems((prev) =>
      prev.map((it) =>
        it.id === editingItem.id
          ? {
              ...it,
              sizes: editSizes.map((s) => ({
                label: s.label,
                price: Math.max(1000, Number(s.price) || 0),
              })),
            }
          : it
      )
    );
    setEditingItem(null);
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
             Quản lý danh sách thức uống, điều chỉnh giá theo cỡ ly (Size M, L, Chai) và bật/tắt trạng thái còn hàng.
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
          <span className={styles.statValue}>{items.length - unavailableIds.length}</span>
          <span className={styles.statChange}>Hiển thị trên menu khách</span>
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
          <span className={styles.statValue}>{unavailableIds.length}</span>
          <span className={styles.statChange}>Có thể bật lại bất cứ lúc nào</span>
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
              return (
                <tr key={item.id}>
                  <td>
                    <div className={styles.itemName}>{item.name}</div>
                    {item.shelfLife && (
                      <div className={styles.itemSub}>Bảo quản lạnh: {item.shelfLife}</div>
                    )}
                  </td>
                  <td>
                    <span className={styles.badge} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
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
                      <span className={`${styles.badge} ${styles.badgeGold}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <StarSolidIcon size={11} />
                        <span>Signature</span>
                      </span>
                    ) : (
                      <span className={styles.mutedText}>{item.tag || 'Tiêu chuẩn'}</span>
                    )}
                  </td>
                  <td>
                    <span
                      className={`${styles.statusDot} ${isOut ? styles.statusOut : styles.statusIn}`}
                    >
                      {isOut ? 'Tạm hết' : 'Đang bán'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        className={styles.actionLink}
                        onClick={() => openEditModal(item)}
                      >
                        Sửa giá
                      </button>
                      <button
                        type="button"
                        className={styles.actionLink}
                        onClick={() => toggleAvailability(item.id)}
                      >
                        {isOut ? 'Mở bán lại' : 'Báo hết'}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

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
                  className={styles.actionLink}
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
