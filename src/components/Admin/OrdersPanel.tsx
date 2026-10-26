'use client';

import { useState, useEffect, useCallback } from 'react';
import styles from './OrdersPanel.module.css';
import { formatVND } from '@/data/menu';
import { isSupabaseConfigured } from '@/lib/supabase/client';

interface OrderItem {
  item_name: string;
  size_label: string;
  unit_price: number;
  quantity: number;
}

interface DemoOrder {
  id: string;
  order_code: string;
  customer_name: string;
  customer_phone: string;
  items: OrderItem[];
  subtotal: number;
  points_used: number;
  total_due: number;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
  note: string | null;
  created_at: string;
}

const demoOrders: DemoOrder[] = [
  {
    id: '1',
    order_code: 'CF-0001',
    customer_name: 'Nguyễn Văn A',
    customer_phone: '0901234567',
    items: [
      { item_name: 'Matcha Cold Whisk', size_label: 'L', unit_price: 46000, quantity: 2 },
      { item_name: 'Cold Brew Cam Sả', size_label: 'M', unit_price: 34000, quantity: 1 },
    ],
    subtotal: 126000,
    points_used: 20000,
    total_due: 106000,
    status: 'PENDING',
    note: 'Ít đá, giao trước 3h chiều',
    created_at: '14:25 - Hôm nay',
  },
  {
    id: '2',
    order_code: 'CF-0002',
    customer_name: 'Trần Thị B',
    customer_phone: '0912345678',
    items: [
      { item_name: 'Cold Brew Chanh Vàng', size_label: 'Chai', unit_price: 74000, quantity: 1 },
    ],
    subtotal: 74000,
    points_used: 0,
    total_due: 74000,
    status: 'CONFIRMED',
    note: null,
    created_at: '13:10 - Hôm nay',
  },
  {
    id: '3',
    order_code: 'CF-0003',
    customer_name: 'Lê Minh C',
    customer_phone: '0987654321',
    items: [
      { item_name: 'Matcha Latte', size_label: 'M', unit_price: 34000, quantity: 3 },
    ],
    subtotal: 102000,
    points_used: 15000,
    total_due: 87000,
    status: 'CANCELLED',
    note: 'Khách đổi ý, đã hoàn 15.000đ điểm ví',
    created_at: '11:45 - Hôm nay',
  },
];

export default function OrdersPanel() {
  const [orders, setOrders] = useState<DemoOrder[]>(demoOrders);
  const [filter, setFilter] = useState<string>('ALL');
  const [loading, setLoading] = useState<boolean>(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/orders?limit=50', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.orders) && data.orders.length > 0) {
          const mapped: DemoOrder[] = data.orders.map((o: any) => ({
            id: o.id,
            order_code: o.order_code || `CF-${String(o.id).slice(0, 4).toUpperCase()}`,
            customer_name: o.user?.full_name || 'Khách đặt web',
            customer_phone: o.user?.phone || o.user?.email || '—',
            items: Array.isArray(o.items)
              ? o.items.map((it: any) => ({
                  item_name: it.product_name || it.item_name || it.name || 'Món nước',
                  size_label: it.size || it.size_label || 'M',
                  unit_price: Number(it.unit_price) || 0,
                  quantity: Number(it.quantity) || 1,
                }))
              : [],
            subtotal: Number(o.subtotal) || 0,
            points_used: Number(o.points_used) || 0,
            total_due: Number(o.total_due) || 0,
            status: o.status || 'PENDING',
            note: o.note || null,
            created_at: o.created_at
              ? new Date(o.created_at).toLocaleString('vi-VN', {
                  hour: '2-digit',
                  minute: '2-digit',
                  day: '2-digit',
                  month: '2-digit',
                })
              : 'Hôm nay',
          }));
          setOrders(mapped);
        }
      }
    } catch (err) {
      console.warn('Orders fetch fallback to demo:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const filteredOrders = orders.filter((o) =>
    filter === 'ALL' ? true : o.status === filter
  );

  const handleAction = async (orderId: string, action: 'confirm' | 'cancel') => {
    setProcessingId(orderId);
    try {
      if (isSupabaseConfigured()) {
        await fetch(`/api/orders/${orderId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        });
      }
    } catch {
      // Fallback local state update
    } finally {
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? { ...o, status: action === 'confirm' ? 'CONFIRMED' : 'CANCELLED' }
            : o
        )
      );
      setProcessingId(null);
    }
  };

  const getStatusBadge = (status: DemoOrder['status']) => {
    switch (status) {
      case 'PENDING':
        return <span className={`${styles.badge} ${styles.pending}`}>Chờ xác nhận</span>;
      case 'CONFIRMED':
        return <span className={`${styles.badge} ${styles.confirmed}`}>Đã xác nhận</span>;
      case 'CANCELLED':
        return <span className={`${styles.badge} ${styles.cancelled}`}>Đã hủy (Hoàn điểm)</span>;
    }
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className={styles.title}>Quản lý Đơn Hàng Website</h1>
          <p className={styles.subtitle}>
            Xác nhận đơn đặt từ website hoặc hủy đơn (tự động hoàn lại điểm ví đã dùng cho khách).
          </p>
        </div>
        <button
          type="button"
          onClick={fetchOrders}
          style={{
            padding: '8px 16px',
            borderRadius: '50px',
            border: '1px solid rgba(0,0,0,0.12)',
            background: '#FFFFFF',
            fontSize: '0.8125rem',
            fontWeight: 700,
            color: '#1E3932',
            cursor: 'pointer',
          }}
        >
          {loading ? 'Đang tải...' : '↻ Làm mới đơn'}
        </button>
      </div>

      {/* Filter tabs */}
      <div className={styles.filters}>
        {[
          { key: 'ALL', label: 'Tất cả', count: orders.length },
          {
            key: 'PENDING',
            label: 'Chờ xác nhận',
            count: orders.filter((o) => o.status === 'PENDING').length,
          },
          {
            key: 'CONFIRMED',
            label: 'Đã xác nhận',
            count: orders.filter((o) => o.status === 'CONFIRMED').length,
          },
          {
            key: 'CANCELLED',
            label: 'Đã hủy',
            count: orders.filter((o) => o.status === 'CANCELLED').length,
          },
        ].map((f) => (
          <button
            type="button"
            key={f.key}
            className={`${styles.filterBtn} ${filter === f.key ? styles.filterActive : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
            <span className={styles.filterCount}>{f.count}</span>
          </button>
        ))}
      </div>

      {/* Order list */}
      <div className={styles.orderList}>
        {filteredOrders.map((order) => (
          <div key={order.id} className={styles.orderCard}>
            <div className={styles.orderHeader}>
              <div className={styles.orderMeta}>
                <span className={styles.orderCode}>#{order.order_code}</span>
                <span className={styles.orderTime}>{order.created_at}</span>
              </div>
              {getStatusBadge(order.status)}
            </div>

            <div className={styles.customer}>
              <span>👤 {order.customer_name}</span>
              <span>📞 {order.customer_phone}</span>
            </div>

            <div className={styles.items}>
              {order.items.map((item, i) => (
                <div key={i} className={styles.item}>
                  <span>
                    {item.item_name} ({item.size_label}) × {item.quantity}
                  </span>
                  <span>{formatVND(item.unit_price * item.quantity)}</span>
                </div>
              ))}
            </div>

            {order.note && <div className={styles.note}>📝 {order.note}</div>}

            <div className={styles.pricing}>
              <div className={styles.priceRow}>
                <span>Tạm tính</span>
                <span>{formatVND(order.subtotal)}</span>
              </div>
              {order.points_used > 0 && (
                <div className={`${styles.priceRow} ${styles.discount}`}>
                  <span>Trừ điểm ví thành viên</span>
                  <span>-{formatVND(order.points_used)}</span>
                </div>
              )}
              <div className={`${styles.priceRow} ${styles.total}`}>
                <span>Cần thu</span>
                <span>{formatVND(order.total_due)}</span>
              </div>
            </div>

            {order.status === 'PENDING' && (
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.confirmBtn}
                  disabled={processingId === order.id}
                  onClick={() => handleAction(order.id, 'confirm')}
                >
                  ✓ Xác nhận đơn
                </button>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  disabled={processingId === order.id}
                  onClick={() => handleAction(order.id, 'cancel')}
                >
                  ✕ Hủy &amp; Hoàn điểm
                </button>
              </div>
            )}
          </div>
        ))}

        {filteredOrders.length === 0 && (
          <div className={styles.empty}>
            <span>📋</span>
            <p>Không có đơn hàng nào ở trạng thái này</p>
          </div>
        )}
      </div>
    </div>
  );
}
