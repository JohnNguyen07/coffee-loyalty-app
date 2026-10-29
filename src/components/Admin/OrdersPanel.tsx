'use client';

import { useState, useEffect, useCallback } from 'react';
import styles from './OrdersPanel.module.css';
import { formatVND } from '@/data/menu';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { buildVietQrImageUrl, DEFAULT_VIETQR_CONFIG } from '@/lib/vietqr';

interface OrderItem {
  item_name: string;
  size_label: string;
  unit_price: number;
  quantity: number;
}

export interface DemoOrder {
  id: string;
  order_code: string;
  customer_name: string;
  customer_phone: string;
  items: OrderItem[];
  subtotal: number;
  points_used: number;
  total_due: number;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
  payment_method?: string;
  payment_status?: string;
  note: string | null;
  created_at: string;
}

// Retain only #CF-0001 as required by user
const defaultSingleOrder: DemoOrder[] = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    order_code: 'CF-0001',
    customer_name: 'Nguyễn Hoàng Yến Vy',
    customer_phone: '0907960109',
    items: [
      { item_name: 'Cold Brew Chanh Vàng', size_label: 'L', unit_price: 34000, quantity: 1 },
    ],
    subtotal: 34000,
    points_used: 10000,
    total_due: 24000,
    status: 'CONFIRMED',
    note: '[Lấy tại cửa hàng] | KH: Nguyễn Hoàng Yến Vy (0907960109) | Đ/c: 7h30 sáng, ngày 29/10 | Ghi chú: Nhiều đá',
    created_at: '00:12 - 29/10',
  },
];

export default function OrdersPanel() {
  const [orders, setOrders] = useState<DemoOrder[]>(defaultSingleOrder);
  const [filter, setFilter] = useState<string>('ALL');
  const [loading, setLoading] = useState<boolean>(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [qrModalOrder, setQrModalOrder] = useState<DemoOrder | null>(null);

  const fetchOrders = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/orders?limit=50', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.orders) && data.orders.length > 0) {
          const mapped: DemoOrder[] = data.orders.map((o: Record<string, unknown>) => {
            const userObj = (o.user as Record<string, unknown>) || {};
            const itemsArr = Array.isArray(o.items) ? o.items : [];

            // Extract customer info from note if user link is empty
            const noteStr = String(o.note || '');
            let parsedName = String(userObj.full_name || 'Khách đặt web');
            let parsedPhone = String(userObj.phone || userObj.email || '—');

            const khMatch = noteStr.match(/KH:\s*([^|(]+)(?:\(([^)]+)\))?/);
            if (khMatch) {
              if (parsedName === 'Khách đặt web' && khMatch[1]?.trim()) {
                parsedName = khMatch[1].trim();
              }
              if (parsedPhone === '—' && khMatch[2]?.trim()) {
                parsedPhone = khMatch[2].trim();
              }
            }

            return {
              id: String(o.id),
              order_code: String(o.order_code || `CF-${String(o.id).slice(0, 4).toUpperCase()}`),
              customer_name: parsedName,
              customer_phone: parsedPhone,
              items: itemsArr.map((it: Record<string, unknown>) => ({
                item_name: String(it.product_name || it.item_name || it.name || 'Món nước'),
                size_label: String(it.size || it.size_label || 'M'),
                unit_price: Number(it.unit_price) || 0,
                quantity: Number(it.quantity) || 1,
              })),
              subtotal: Number(o.subtotal) || 0,
              points_used: Number(o.points_used) || 0,
              total_due: Number(o.total_due) || 0,
              status: (o.status as DemoOrder['status']) || 'PENDING',
              payment_method: typeof o.payment_method === 'string' ? o.payment_method : undefined,
              payment_status: typeof o.payment_status === 'string' ? o.payment_status : undefined,
              note: o.note ? String(o.note) : null,
              created_at: o.created_at
                ? new Date(String(o.created_at)).toLocaleString('vi-VN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    day: '2-digit',
                    month: '2-digit',
                  })
                : 'Hôm nay',
            };
          });
          setOrders(mapped);
        }
      }
    } catch (err) {
      console.warn('Orders fetch fallback:', err);
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

  const handleAction = async (orderId: string, action: 'confirm' | 'cancel' | 'mark_paid', paymentMethod?: 'BANK_TRANSFER' | 'CASH') => {
    setProcessingId(orderId);
    try {
      if (isSupabaseConfigured()) {
        await fetch(`/api/orders/${orderId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, payment_method: paymentMethod }),
        });
      }
    } catch {
      // Fallback local state update
    } finally {
      setOrders((prev) =>
        prev.map((o) => {
          if (o.id !== orderId) return o;
          if (action === 'cancel') {
            return { ...o, status: 'CANCELLED' };
          }
          if (action === 'mark_paid') {
            const payLabel = paymentMethod === 'BANK_TRANSFER' ? 'Quét mã QR' : 'Tiền mặt';
            const curNote = o.note || '';
            const updatedNote = curNote.includes('Đã thanh toán')
              ? curNote
              : `${curNote} | [Đã thanh toán: ${payLabel}]`.trim();
            return {
              ...o,
              status: 'CONFIRMED',
              payment_method: paymentMethod,
              payment_status: 'PAID',
              note: updatedNote,
            };
          }
          return { ...o, status: 'CONFIRMED' };
        })
      );
      setProcessingId(null);
      if (qrModalOrder?.id === orderId) {
        setQrModalOrder(null);
      }
    }
  };

  const isPickupOrder = (note: string | null) => {
    return !note || note.includes('Lấy tại cửa hàng') || !note.includes('Giao tới nhà');
  };

  const getPaymentPref = (order: DemoOrder) => {
    if (order.payment_method === 'BANK_TRANSFER') return 'QR';
    if (order.payment_method === 'CASH') return 'CASH';
    const n = order.note || '';
    if (n.includes('Quét mã QR')) return 'QR';
    if (n.includes('Tiền mặt')) return 'CASH';
    return 'FLEXIBLE';
  };

  const isOrderPaid = (order: DemoOrder) => {
    if (order.payment_status === 'PAID') return true;
    const n = order.note || '';
    return n.includes('Đã thanh toán');
  };

  const handlePushToPos = (order: DemoOrder) => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', 'pos');
      window.history.pushState({}, '', url.toString());
      window.dispatchEvent(new CustomEvent('ulab:nav-change', { detail: { tab: 'pos' } }));
      // Also broadcast load order event for POS panel
      window.dispatchEvent(new CustomEvent('ulab:load-pos-order', { detail: { order } }));
    }
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Quản lý Đơn Hàng Website</h1>
          <p className={styles.subtitle}>
            Tiếp nhận đơn đặt trước từ khách, hỗ trợ khách lấy tại quầy thanh toán tiền mặt hoặc quét mã QR VietQR.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchOrders}
          disabled={loading}
          className={styles.refreshBtn}
        >
          {loading ? 'Đang tải...' : 'Làm mới'}
        </button>
      </div>

      {/* Filter Tabs */}
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
            className={`${styles.filterBtn} ${filter === f.key ? styles.filterBtnActive : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
            <span className={styles.filterCount}>{f.count}</span>
          </button>
        ))}
      </div>

      {/* Order List */}
      <div className={styles.orderList}>
        {filteredOrders.map((order) => {
          const isPickup = isPickupOrder(order.note);
          const payPref = getPaymentPref(order);
          const paid = isOrderPaid(order);

          return (
            <div key={order.id} className={styles.orderCard}>
              <div className={styles.orderHeader}>
                <div className={styles.orderMeta}>
                  <span className={styles.orderCode}>#{order.order_code}</span>
                  <span className={styles.orderTime}>{order.created_at}</span>
                  <div className={styles.badgesGroup}>
                    {/* Fulfillment Badge */}
                    <span className={`${styles.badge} ${isPickup ? styles.badgePickup : styles.badgeDelivery}`}>
                      {isPickup ? '🏪 Lấy tại cửa hàng' : '🛵 Giao hàng'}
                    </span>

                    {/* Payment Preference Badge */}
                    {payPref === 'QR' && (
                      <span className={`${styles.badge} ${styles.badgePayQr}`}>
                        📲 Khách quét mã QR
                      </span>
                    )}
                    {payPref === 'CASH' && (
                      <span className={`${styles.badge} ${styles.badgePayCash}`}>
                        💵 Khách trả tiền mặt
                      </span>
                    )}
                    {payPref === 'FLEXIBLE' && (
                      <span className={`${styles.badge} ${styles.badgePayFlex}`}>
                        🔄 Linh hoạt Tiền mặt / QR
                      </span>
                    )}

                    {/* Payment State Badge */}
                    {paid ? (
                      <span className={`${styles.badge} ${styles.badgePaid}`}>
                        ✓ Đã thanh toán
                      </span>
                    ) : (
                      <span className={`${styles.badge} ${styles.badgeUnpaid}`}>
                        ⏳ Chờ thu tiền ({formatVND(order.total_due)})
                      </span>
                    )}
                  </div>
                </div>

                {order.status === 'PENDING' && (
                  <span className={`${styles.badge} ${styles.pending}`}>Chờ xác nhận</span>
                )}
                {order.status === 'CONFIRMED' && (
                  <span className={`${styles.badge} ${styles.confirmed}`}>Đã xác nhận</span>
                )}
                {order.status === 'CANCELLED' && (
                  <span className={`${styles.badge} ${styles.cancelled}`}>Đã hủy</span>
                )}
              </div>

              <div className={styles.customer}>
                <span>👤 {order.customer_name}</span>
                <span>📞 {order.customer_phone}</span>
              </div>

              <div className={styles.items}>
                {order.items.map((item, i) => (
                  <div key={i} className={styles.item}>
                    <span className={styles.itemNameQty}>
                      {item.item_name} ({item.size_label}) × {item.quantity}
                    </span>
                    <span className={styles.itemPrice}>{formatVND(item.unit_price * item.quantity)}</span>
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

              {/* Order Actions */}
              <div className={styles.actions}>
                {/* 1. If Unpaid & Not Cancelled: Show QR Collection button */}
                {!paid && order.status !== 'CANCELLED' && (
                  <button
                    type="button"
                    className={`${styles.actionBtn} ${styles.qrBtn}`}
                    onClick={() => setQrModalOrder(order)}
                    title="Mở mã QR VietQR để khách quét thanh toán bằng ngân hàng"
                  >
                    📲 Mở QR Thu Tiền ({formatVND(order.total_due)})
                  </button>
                )}

                {/* 2. Fast Payment Confirmation Buttons */}
                {!paid && order.status !== 'CANCELLED' && (
                  <>
                    <button
                      type="button"
                      className={`${styles.actionBtn} ${styles.payQrBtn}`}
                      disabled={processingId === order.id}
                      onClick={() => handleAction(order.id, 'mark_paid', 'BANK_TRANSFER')}
                      title="Ghi nhận khách đã chuyển khoản hoặc quét QR thành công"
                    >
                      ✓ Đã nhận Quét QR
                    </button>
                    <button
                      type="button"
                      className={`${styles.actionBtn} ${styles.payCashBtn}`}
                      disabled={processingId === order.id}
                      onClick={() => handleAction(order.id, 'mark_paid', 'CASH')}
                      title="Ghi nhận khách đã trả tiền mặt tại quầy"
                    >
                      ✓ Đã thu Tiền mặt
                    </button>
                  </>
                )}

                {/* 3. Confirm Order if PENDING */}
                {order.status === 'PENDING' && (
                  <button
                    type="button"
                    className={`${styles.actionBtn} ${styles.confirmBtn}`}
                    disabled={processingId === order.id}
                    onClick={() => handleAction(order.id, 'confirm')}
                  >
                    ✓ Xác nhận đơn
                  </button>
                )}

                {/* 4. Push to POS option */}
                <button
                  type="button"
                  className={`${styles.actionBtn} ${styles.posBtn}`}
                  onClick={() => handlePushToPos(order)}
                  title="Chuyển đơn này sang màn hình POS để in tem pha chế hoặc thêm món"
                >
                  ⚡ Nạp vào POS
                </button>

                {/* 5. Cancel order button */}
                {order.status !== 'CANCELLED' && (
                  <button
                    type="button"
                    className={`${styles.actionBtn} ${styles.cancelBtn}`}
                    disabled={processingId === order.id}
                    onClick={() => handleAction(order.id, 'cancel')}
                  >
                    ✕ Hủy đơn
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {filteredOrders.length === 0 && (
          <div className={styles.empty}>
            <span>📋</span>
            <p>Không có đơn hàng nào ở trạng thái này</p>
          </div>
        )}
      </div>

      {/* ── QR Payment Modal for Counter Cashier ── */}
      {qrModalOrder && (
        <div className={styles.modalOverlay} onClick={() => setQrModalOrder(null)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Mã VietQR Thu Tiền — #{qrModalOrder.order_code}</h3>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setQrModalOrder(null)}
              >
                &times;
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.modalQrImageWrap}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={buildVietQrImageUrl({
                    amount: qrModalOrder.total_due,
                    description: `ULAB ${qrModalOrder.order_code}`,
                  })}
                  alt="Mã QR thanh toán đơn hàng"
                  className={styles.modalQrImg}
                />
              </div>

              <div className={styles.modalDetails}>
                <div className={styles.modalDetailRow}>
                  <span>Khách hàng:</span>
                  <strong>{qrModalOrder.customer_name} ({qrModalOrder.customer_phone})</strong>
                </div>
                <div className={styles.modalDetailRow}>
                  <span>Số tiền cần thu:</span>
                  <strong style={{ color: '#006241', fontSize: '1.05rem' }}>
                    {formatVND(qrModalOrder.total_due)}
                  </strong>
                </div>
                <div className={styles.modalDetailRow}>
                  <span>Ngân hàng:</span>
                  <strong>{DEFAULT_VIETQR_CONFIG.bankName}</strong>
                </div>
                <div className={styles.modalDetailRow}>
                  <span>Số tài khoản:</span>
                  <strong style={{ fontFamily: 'monospace' }}>{DEFAULT_VIETQR_CONFIG.accountNo}</strong>
                </div>
                <div className={styles.modalDetailRow}>
                  <span>Nội dung chuyển khoản:</span>
                  <strong style={{ fontFamily: 'monospace' }}>ULAB {qrModalOrder.order_code}</strong>
                </div>
              </div>

              <div className={styles.modalActions}>
                <div className={styles.modalActionBtnRow}>
                  <button
                    type="button"
                    className={`${styles.actionBtn} ${styles.payQrBtn}`}
                    onClick={() => handleAction(qrModalOrder.id, 'mark_paid', 'BANK_TRANSFER')}
                  >
                    ✓ Đã nhận Quét QR
                  </button>
                  <button
                    type="button"
                    className={`${styles.actionBtn} ${styles.payCashBtn}`}
                    onClick={() => handleAction(qrModalOrder.id, 'mark_paid', 'CASH')}
                  >
                    ✓ Đã thu Tiền mặt
                  </button>
                </div>
                <button
                  type="button"
                  className={`${styles.actionBtn} ${styles.cancelBtn}`}
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => setQrModalOrder(null)}
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
