'use client';

import { useState, useEffect, useCallback } from 'react';
import styles from './OrdersPanel.module.css';
import { formatVND } from '@/data/menu';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { buildVietQrImageUrl, DEFAULT_VIETQR_CONFIG } from '@/lib/vietqr';
import { extractPosOrderMetadata } from '@/lib/pos/domain';

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
  shipping_fee: number;
  total_due: number;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
  channel: 'POS' | 'WEB';
  order_type: 'TAKEAWAY' | 'DINE_IN' | 'DELIVERY';
  payment_method?: string;
  payment_status?: string;
  note: string | null;
  clean_note: string | null;
  customer_address?: string | null;
  cashier_name?: string | null;
  cancel_reason?: string | null;
  cancelled_by?: string | null;
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
    shipping_fee: 0,
    total_due: 24000,
    status: 'CONFIRMED',
    channel: 'WEB',
    order_type: 'TAKEAWAY',
    payment_method: 'CASH',
    payment_status: 'PAID',
    note: '[Lấy tại cửa hàng] | KH: Nguyễn Hoàng Yến Vy (0907960109) | Đ/c: 7h30 sáng, ngày 29/10 | Ghi chú: Nhiều đá',
    clean_note: 'Nhiều đá',
    customer_address: '7h30 sáng, ngày 29/10',
    cashier_name: null,
    cancel_reason: null,
    cancelled_by: null,
    created_at: '00:12 - 29/10',
  },
];

export default function OrdersPanel() {
  const [orders, setOrders] = useState<DemoOrder[]>(defaultSingleOrder);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [channelFilter, setChannelFilter] = useState<'ALL' | 'WEB' | 'POS'>('ALL');
  const [loading, setLoading] = useState<boolean>(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [qrModalOrder, setQrModalOrder] = useState<DemoOrder | null>(null);

  // Inline Shipping Fee Editing State
  const [editingShippingId, setEditingShippingId] = useState<string | null>(null);
  const [shippingInputVal, setShippingInputVal] = useState<string>('');

  const fetchOrders = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/orders?limit=50', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.orders) && data.orders.length > 0) {
          const mapped: DemoOrder[] = data.orders.map((o: Record<string, unknown>) => {
            const meta = extractPosOrderMetadata(o);
            const isPos = String(o.order_code || '').startsWith('POS-') || meta.channel === 'POS';
            const userObj = (o.user as Record<string, unknown>) || {};
            const itemsArr = Array.isArray(o.items) ? o.items : [];
            const rawNote = String(o.note || '');

            let cleanNote = meta.userNote || '';
            let address: string | null = null;
            let parsedName = '';
            let parsedPhone = '';
            let shippingFee = 0;

            // Extract shipping fee if recorded in note
            const shipMatch = rawNote.match(/\[Phí ship:\s*([\d.,]+)\s*đ?\]/i);
            if (shipMatch) {
              shippingFee = Number(shipMatch[1].replace(/\D/g, '')) || 0;
            }

            if (isPos) {
              parsedName = meta.customerName || 'Khách lẻ tại quầy';
              parsedPhone = meta.customerPhone || '';
            } else {
              // Web order: Parse KH, Phone, Address, Note
              parsedName = String(userObj.full_name || 'Khách đặt web');
              parsedPhone = String(userObj.phone || userObj.email || '—');

              const khMatch = rawNote.match(/KH:\s*([^|(]+)(?:\(([^)]+)\))?/);
              if (khMatch) {
                if (khMatch[1]?.trim()) parsedName = khMatch[1].trim();
                if (khMatch[2]?.trim()) parsedPhone = khMatch[2].trim();
              }

              const dcMatch = rawNote.match(/Đ\/c:\s*([^|]+)/);
              if (dcMatch) {
                address = dcMatch[1].trim();
              }

              const noteMatch = rawNote.match(/Ghi chú:\s*([^|]+)/);
              if (noteMatch) {
                cleanNote = noteMatch[1].trim();
              } else if (!cleanNote && !rawNote.startsWith('[')) {
                cleanNote = rawNote;
              }
            }

            // Determine order type (DELIVERY vs TAKEAWAY vs DINE_IN)
            let orderType: 'DELIVERY' | 'TAKEAWAY' | 'DINE_IN' = meta.orderType || 'TAKEAWAY';
            if (!isPos) {
              if (rawNote.includes('Giao tới nhà') || rawNote.includes('DELIVERY')) {
                orderType = 'DELIVERY';
              } else {
                orderType = 'TAKEAWAY';
              }
            }

            return {
              id: String(o.id),
              order_code: String(o.order_code || `CF-${String(o.id).slice(0, 4).toUpperCase()}`),
              customer_name: parsedName,
              customer_phone: parsedPhone,
              cashier_name: isPos ? meta.cashierName || 'Thu ngân Ủ LAB' : null,
              channel: isPos ? 'POS' : 'WEB',
              order_type: orderType,
              customer_address: address,
              items: itemsArr.map((it: Record<string, unknown>) => ({
                item_name: String(it.product_name || it.item_name || it.name || 'Món nước'),
                size_label: String(it.size || it.size_label || 'M'),
                unit_price: Number(it.unit_price) || 0,
                quantity: Number(it.quantity) || 1,
              })),
              subtotal: Number(o.subtotal) || 0,
              points_used: Number(o.points_used) || 0,
              shipping_fee: shippingFee,
              total_due: Number(o.total_due) || 0,
              status: (o.status as DemoOrder['status']) || 'PENDING',
              payment_method: typeof o.payment_method === 'string' ? o.payment_method : meta.paymentMethod,
              payment_status: typeof o.payment_status === 'string' ? o.payment_status : meta.paymentStatus,
              note: rawNote,
              clean_note: cleanNote || null,
              cancel_reason: meta.cancelReason || null,
              cancelled_by: meta.cancelledBy || null,
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
    // Auto-refresh every 25 seconds for incoming web orders
    const timer = setInterval(() => {
      fetchOrders();
    }, 25000);
    return () => clearInterval(timer);
  }, [fetchOrders]);

  // Filter orders by status and channel
  const filteredOrders = orders.filter((o) => {
    const matchStatus = statusFilter === 'ALL' ? true : o.status === statusFilter;
    const matchChannel = channelFilter === 'ALL' ? true : o.channel === channelFilter;
    return matchStatus && matchChannel;
  });

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
            return { ...o, status: 'CANCELLED', payment_status: 'REFUNDED' };
          }
          if (action === 'mark_paid') {
            return {
              ...o,
              status: 'CONFIRMED',
              payment_method: paymentMethod,
              payment_status: 'PAID',
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

  // Handle Save Shipping Fee
  const handleSaveShippingFee = async (order: DemoOrder) => {
    const fee = Math.max(0, Number(shippingInputVal.replace(/\D/g, '')) || 0);
    setProcessingId(order.id);
    try {
      if (isSupabaseConfigured()) {
        await fetch(`/api/orders/${order.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'update_shipping', shipping_fee: fee }),
        });
      }
      setOrders((prev) =>
        prev.map((o) => {
          if (o.id !== order.id) return o;
          const newTotal = Math.max(0, o.subtotal + fee - o.points_used);
          return {
            ...o,
            shipping_fee: fee,
            total_due: newTotal,
          };
        })
      );
    } catch (err) {
      console.warn('Update shipping fee error:', err);
    } finally {
      setProcessingId(null);
      setEditingShippingId(null);
      setShippingInputVal('');
    }
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
      window.dispatchEvent(new CustomEvent('ulab:load-pos-order', { detail: { order } }));
    }
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Quản Lý Đơn Hàng</h1>
          <p className={styles.subtitle}>
            Tiếp nhận đơn đặt trước từ website, quản lý đơn quầy POS, cập nhật phí ship và báo giá khách linh hoạt.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchOrders}
          disabled={loading}
          className={styles.refreshBtn}
        >
          {loading ? 'Đang tải...' : '↻ Làm mới đơn'}
        </button>
      </div>

      {/* Channel Filters */}
      <div className={styles.channelFilters}>
        {[
          { key: 'ALL', label: 'Tất cả nguồn' },
          { key: 'WEB', label: '🌐 Đơn Website', count: orders.filter((o) => o.channel === 'WEB').length },
          { key: 'POS', label: '🏪 Đơn POS Quầy', count: orders.filter((o) => o.channel === 'POS').length },
        ].map((c) => (
          <button
            type="button"
            key={c.key}
            className={`${styles.channelBtn} ${channelFilter === c.key ? styles.channelBtnActive : ''}`}
            onClick={() => setChannelFilter(c.key as 'ALL' | 'WEB' | 'POS')}
          >
            {c.label} {c.count !== undefined ? `(${c.count})` : ''}
          </button>
        ))}
      </div>

      {/* Status Filter Tabs */}
      <div className={styles.filters}>
        {[
          { key: 'ALL', label: 'Tất cả trạng thái', count: orders.length },
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
            className={`${styles.filterBtn} ${statusFilter === f.key ? styles.filterBtnActive : ''}`}
            onClick={() => setStatusFilter(f.key)}
          >
            {f.label}
            <span className={styles.filterCount}>{f.count}</span>
          </button>
        ))}
      </div>

      {/* Order List */}
      <div className={styles.orderList}>
        {filteredOrders.map((order) => {
          const isDelivery = order.order_type === 'DELIVERY';
          const isPickup = order.order_type === 'TAKEAWAY';
          const isDineIn = order.order_type === 'DINE_IN';
          const paid = isOrderPaid(order);
          const isEditingShip = editingShippingId === order.id;
          const cleanPhone = order.customer_phone ? order.customer_phone.replace(/\D/g, '') : '';

          // Fast quote SMS text
          const smsText = `Ủ LAB xin chào bạn ${order.customer_name}! Đơn hàng #${order.order_code}: Tiền nước ${formatVND(order.subtotal)}${order.points_used > 0 ? ` - Điểm ví ${formatVND(order.points_used)}` : ''} + Phí ship ${formatVND(order.shipping_fee || 0)} = Tổng thanh toán: ${formatVND(order.total_due)}. Quán chuẩn bị và giao ngay cho bạn nhé!`;

          return (
            <div key={order.id} className={styles.orderCard}>
              {/* Card Header */}
              <div className={styles.orderHeader}>
                <div className={styles.orderMeta}>
                  <span className={styles.orderCode}>#{order.order_code}</span>
                  <span className={styles.orderTime}>{order.created_at}</span>
                  <div className={styles.badgesGroup}>
                    {/* Channel Badge */}
                    {order.channel === 'POS' ? (
                      <span className={`${styles.badge} ${styles.badgePos}`}>
                        🏪 Bán tại quầy (POS)
                      </span>
                    ) : (
                      <span className={`${styles.badge} ${styles.badgeWeb}`}>
                        🌐 Đặt từ Website
                      </span>
                    )}

                    {/* Order Type Badge */}
                    {isDelivery && (
                      <span className={`${styles.badge} ${styles.badgeDelivery}`}>
                        🛵 Giao tận nơi
                      </span>
                    )}
                    {isPickup && (
                      <span className={`${styles.badge} ${styles.badgePickup}`}>
                        {order.channel === 'POS' ? '🛍️ Mang về' : '🏪 Lấy tại quán'}
                      </span>
                    )}
                    {isDineIn && (
                      <span className={`${styles.badge} ${styles.badgeDineIn}`}>
                        ☕ Uống tại chỗ
                      </span>
                    )}

                    {/* Payment Method Badge */}
                    {order.payment_method === 'BANK_TRANSFER' ? (
                      <span className={`${styles.badge} ${styles.badgePayQr}`}>
                        📲 Quét mã QR
                      </span>
                    ) : order.payment_method === 'CASH' ? (
                      <span className={`${styles.badge} ${styles.badgePayCash}`}>
                        💵 Tiền mặt
                      </span>
                    ) : (
                      <span className={`${styles.badge} ${styles.badgePayFlex}`}>
                        🔄 Linh hoạt
                      </span>
                    )}

                    {/* Payment State Badge */}
                    {order.status === 'CANCELLED' ? (
                      <span className={`${styles.badge} ${styles.cancelled}`}>
                        ✕ Đã hủy &amp; hoàn
                      </span>
                    ) : paid ? (
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

                {/* Status Indicator on Right */}
                <div className={styles.orderStatusIndicator}>
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
              </div>

              {/* Customer & Staff Info */}
              <div className={styles.customerRow}>
                <div className={styles.customerInfo}>
                  <span className={styles.custName}>👤 {order.customer_name}</span>
                  {order.customer_phone && order.customer_phone !== '—' && (
                    <span className={styles.custPhone}>📞 {order.customer_phone}</span>
                  )}
                  {order.cashier_name && (
                    <span className={styles.cashierBadge}>🧑‍💼 {order.cashier_name}</span>
                  )}
                </div>

                {/* Quick Contact Buttons for Web Orders */}
                {cleanPhone && cleanPhone.length >= 9 && (
                  <div className={styles.contactActions}>
                    <a
                      href={`https://zalo.me/${cleanPhone}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${styles.contactBtn} ${styles.zaloBtn}`}
                      title="Mở Zalo nhắn tin cho khách"
                    >
                      💬 Chat Zalo
                    </a>
                    <a
                      href={`sms:${cleanPhone}?&body=${encodeURIComponent(smsText)}`}
                      className={`${styles.contactBtn} ${styles.smsBtn}`}
                      title="Soạn tin nhắn SMS báo đơn hoặc giá ship"
                    >
                      ✉️ Gửi SMS
                    </a>
                    <a
                      href={`tel:${cleanPhone}`}
                      className={`${styles.contactBtn} ${styles.callBtn}`}
                      title="Gọi điện trực tiếp cho khách"
                    >
                      📞 Gọi
                    </a>
                  </div>
                )}
              </div>

              {/* Delivery Address */}
              {order.customer_address && (
                <div className={styles.addressBox}>
                  <span>📍 Địa chỉ / Thời gian:</span>
                  <strong>{order.customer_address}</strong>
                </div>
              )}

              {/* Items List */}
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

              {/* Clean Human Note (NO JSON) */}
              {order.clean_note && (
                <div className={styles.note}>
                  📝 Ghi chú: <strong>{order.clean_note}</strong>
                </div>
              )}

              {/* Cancellation Reason if Cancelled */}
              {order.cancel_reason && (
                <div className={styles.cancelBox}>
                  ⚠️ Lý do hủy: <strong>{order.cancel_reason}</strong>
                  {order.cancelled_by && <span> · Người hủy: {order.cancelled_by}</span>}
                </div>
              )}

              {/* Pricing Breakdown */}
              <div className={styles.pricing}>
                <div className={styles.priceRow}>
                  <span>Tạm tính tiền đồ uống</span>
                  <span>{formatVND(order.subtotal)}</span>
                </div>
                {order.points_used > 0 && (
                  <div className={`${styles.priceRow} ${styles.discount}`}>
                    <span>Trừ điểm ví thành viên</span>
                    <span>-{formatVND(order.points_used)}</span>
                  </div>
                )}

                {/* Shipping Fee Management for Delivery Orders */}
                {isDelivery && (
                  <div className={`${styles.priceRow} ${styles.shippingRow}`}>
                    <span>Phí giao hàng (Ship):</span>
                    {isEditingShip ? (
                      <div className={styles.shippingInputGroup}>
                        <input
                          type="text"
                          placeholder="Nhập phí ship..."
                          value={shippingInputVal}
                          onChange={(e) => setShippingInputVal(e.target.value)}
                          className={styles.shippingInput}
                          autoFocus
                        />
                        <button
                          type="button"
                          className={styles.saveShipBtn}
                          disabled={processingId === order.id}
                          onClick={() => handleSaveShippingFee(order)}
                        >
                          Lưu
                        </button>
                        <button
                          type="button"
                          className={styles.cancelShipBtn}
                          onClick={() => setEditingShippingId(null)}
                        >
                          Hủy
                        </button>
                      </div>
                    ) : (
                      <div className={styles.shippingDisplay}>
                        <strong style={{ color: order.shipping_fee > 0 ? '#15803d' : '#d97706' }}>
                          {order.shipping_fee > 0 ? `+${formatVND(order.shipping_fee)}` : 'Chưa nhập phí ship'}
                        </strong>
                        <button
                          type="button"
                          className={styles.editShipBtn}
                          onClick={() => {
                            setEditingShippingId(order.id);
                            setShippingInputVal(order.shipping_fee > 0 ? String(order.shipping_fee) : '');
                          }}
                        >
                          {order.shipping_fee > 0 ? '✏️ Đổi phí ship' : '+ Nhập phí ship'}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <div className={`${styles.priceRow} ${styles.total}`}>
                  <span>Tổng cần thu</span>
                  <span className={styles.totalValue}>{formatVND(order.total_due)}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className={styles.actions}>
                {/* 1. Fast VietQR collection for unpaid orders */}
                {!paid && order.status !== 'CANCELLED' && (
                  <button
                    type="button"
                    className={`${styles.actionBtn} ${styles.qrBtn}`}
                    onClick={() => setQrModalOrder(order)}
                    title="Mở mã VietQR đúng số tiền để thu chuyển khoản"
                  >
                    📲 Mở QR Thu Tiền ({formatVND(order.total_due)})
                  </button>
                )}

                {/* 2. Fast Payment Mark */}
                {!paid && order.status !== 'CANCELLED' && (
                  <>
                    <button
                      type="button"
                      className={`${styles.actionBtn} ${styles.payQrBtn}`}
                      disabled={processingId === order.id}
                      onClick={() => handleAction(order.id, 'mark_paid', 'BANK_TRANSFER')}
                    >
                      ✓ Đã nhận Quét QR
                    </button>
                    <button
                      type="button"
                      className={`${styles.actionBtn} ${styles.payCashBtn}`}
                      disabled={processingId === order.id}
                      onClick={() => handleAction(order.id, 'mark_paid', 'CASH')}
                    >
                      ✓ Đã thu Tiền mặt
                    </button>
                  </>
                )}

                {/* 3. Confirm order if pending */}
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
                  title="Chuyển sang màn hình POS để pha chế hoặc in tem ly"
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
            <p>Không có đơn hàng nào phù hợp với bộ lọc</p>
          </div>
        )}
      </div>

      {/* ── QR Payment Modal for Cashier ── */}
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
                  <strong>{qrModalOrder.customer_name} ({qrModalOrder.customer_phone || 'Khách lẻ'})</strong>
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
