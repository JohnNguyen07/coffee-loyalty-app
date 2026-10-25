'use client';

import { useState } from 'react';
import styles from './OrdersPanel.module.css';
import { formatVND } from '@/data/menu';

interface Order {
  id: string;
  code: string;
  customerName: string;
  items: { name: string; size: string; qty: number; price: number }[];
  subtotal: number;
  pointsUsed: number;
  totalDue: number;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
  createdAt: Date;
}

// Demo orders
const demoOrders: Order[] = [
  {
    id: '1',
    code: 'CF-0001',
    customerName: 'Nguyễn Văn A',
    items: [
      { name: 'Matcha Latte', size: 'L', qty: 2, price: 39000 },
      { name: 'Cold Brew Nước Dừa', size: 'M', qty: 1, price: 29000 },
    ],
    subtotal: 107000,
    pointsUsed: 7000,
    totalDue: 100000,
    status: 'PENDING',
    createdAt: new Date(Date.now() - 300000),
  },
  {
    id: '2',
    code: 'CF-0002',
    customerName: 'Trần Thị B',
    items: [
      { name: 'Matcha Cold Whisk', size: 'M', qty: 1, price: 42000 },
    ],
    subtotal: 42000,
    pointsUsed: 0,
    totalDue: 42000,
    status: 'PENDING',
    createdAt: new Date(Date.now() - 120000),
  },
  {
    id: '3',
    code: 'CF-0003',
    customerName: 'Lê Văn C',
    items: [
      { name: 'Original Cold Brew', size: 'M', qty: 2, price: 29000 },
    ],
    subtotal: 58000,
    pointsUsed: 10000,
    totalDue: 48000,
    status: 'CONFIRMED',
    createdAt: new Date(Date.now() - 900000),
  },
];

export default function OrdersPanel() {
  const [orders, setOrders] = useState<Order[]>(demoOrders);
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'CONFIRMED' | 'CANCELLED'>('ALL');

  const filteredOrders = filter === 'ALL' ? orders : orders.filter((o) => o.status === filter);

  const handleConfirm = (orderId: string) => {
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId ? { ...o, status: 'CONFIRMED' as const } : o
      )
    );
  };

  const handleCancel = (orderId: string) => {
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId ? { ...o, status: 'CANCELLED' as const } : o
      )
    );
  };

  const statusLabels: Record<string, { label: string; className: string }> = {
    PENDING: { label: 'Chờ xác nhận', className: styles.statusPending },
    CONFIRMED: { label: 'Đã xác nhận', className: styles.statusConfirmed },
    CANCELLED: { label: 'Đã hủy', className: styles.statusCancelled },
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h2 className={styles.title}>Đơn hàng</h2>
        <div className={styles.stats}>
          <span className={styles.stat}>
            <span className={styles.statNum}>{orders.filter((o) => o.status === 'PENDING').length}</span>
            chờ xác nhận
          </span>
        </div>
      </div>

      {/* Filter tabs */}
      <div className={styles.filters}>
        {(['ALL', 'PENDING', 'CONFIRMED', 'CANCELLED'] as const).map((f) => (
          <button
            key={f}
            className={`${styles.filterBtn} ${filter === f ? styles.filterActive : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'ALL' ? 'Tất cả' : statusLabels[f].label}
            <span className={styles.filterCount}>
              {f === 'ALL' ? orders.length : orders.filter((o) => o.status === f).length}
            </span>
          </button>
        ))}
      </div>

      {/* Orders list */}
      <div className={styles.ordersList}>
        {filteredOrders.length === 0 ? (
          <div className={styles.empty}>
            <p>Không có đơn hàng nào</p>
          </div>
        ) : (
          filteredOrders.map((order) => (
            <div key={order.id} className={styles.orderCard}>
              <div className={styles.orderHeader}>
                <div className={styles.orderMeta}>
                  <span className={styles.orderCode}>{order.code}</span>
                  <span className={`${styles.statusBadge} ${statusLabels[order.status].className}`}>
                    {statusLabels[order.status].label}
                  </span>
                </div>
                <span className={styles.orderTime}>
                  {order.createdAt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              <div className={styles.customerName}>{order.customerName}</div>

              <div className={styles.itemsList}>
                {order.items.map((item, i) => (
                  <div key={i} className={styles.orderItem}>
                    <span className={styles.orderItemQty}>{item.qty}x</span>
                    <span className={styles.orderItemName}>{item.name}</span>
                    <span className={styles.orderItemSize}>{item.size}</span>
                    <span className={styles.orderItemPrice}>{formatVND(item.price * item.qty)}</span>
                  </div>
                ))}
              </div>

              <div className={styles.orderFooter}>
                <div className={styles.orderTotal}>
                  {order.pointsUsed > 0 && (
                    <span className={styles.pointsUsed}>Điểm: −{formatVND(order.pointsUsed)}</span>
                  )}
                  <span className={styles.totalAmount}>Thu: {formatVND(order.totalDue)}</span>
                </div>

                {order.status === 'PENDING' && (
                  <div className={styles.orderActions}>
                    <button
                      className={styles.cancelBtn}
                      onClick={() => handleCancel(order.id)}
                    >
                      Hủy
                    </button>
                    <button
                      className={styles.confirmBtn}
                      onClick={() => handleConfirm(order.id)}
                    >
                      Xác nhận đơn
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
