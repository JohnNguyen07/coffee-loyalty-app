'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import styles from './OrdersPanel.module.css';
import { formatVND } from '@/data/menu';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import {
  FULFILLMENT_STATUS_LABELS,
  calculateOrderWaitStatus,
  extractPosOrderMetadata,
  normalizeFulfillmentStatus,
  type FulfillmentStatus,
} from '@/lib/pos/domain';
import { buildBaristaTicketHtml, buildCustomerReceiptHtml } from '@/lib/pos/print-templates';
import type { OrderAuditLogItem, PosOrderRecord } from '@/lib/pos/repository';

interface OrderItem {
  item_name: string;
  size_label: string;
  unit_price: number;
  quantity: number;
  options_summary?: string;
}

export interface DemoOrder {
  id: string;
  order_code: string;
  customer_name: string;
  customer_phone: string;
  items: OrderItem[];
  subtotal: number;
  discount_amount?: number;
  discount_percent?: number;
  points_used: number;
  shipping_fee: number;
  total_due: number;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
  fulfillment_status: FulfillmentStatus;
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
  raw_created_at?: string;
}

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
    fulfillment_status: 'COMPLETED',
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
    raw_created_at: '2026-10-29T00:12:00+07:00',
  },
];

const QUICK_CANCEL_REASONS = [
  'Khách báo hủy đơn',
  'Bấm nhầm món / Tạo lại đơn mới',
  'Hết nguyên liệu phục vụ',
  'Khách đổi ý / Không liên lạc được',
];

const FULFILLMENT_FILTER_TABS: { key: 'ALL' | FulfillmentStatus; label: string }[] = [
  { key: 'ALL', label: 'Tất cả tiến độ' },
  { key: 'PENDING', label: 'Chờ tiếp nhận' },
  { key: 'PREPARING', label: 'Đang pha chế' },
  { key: 'READY', label: 'Sẵn sàng giao' },
  { key: 'COMPLETED', label: 'Hoàn tất' },
];

export default function OrdersPanel() {
  const [orders, setOrders] = useState<DemoOrder[]>(defaultSingleOrder);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [fulfillmentFilter, setFulfillmentFilter] = useState<'ALL' | FulfillmentStatus>('ALL');
  const [channelFilter, setChannelFilter] = useState<'ALL' | 'WEB' | 'POS'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<string>(''); // YYYY-MM-DD
  const [loading, setLoading] = useState<boolean>(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [actionBanner, setActionBanner] = useState<{ text: string; isError?: boolean } | null>(null);
  const [nowDate, setNowDate] = useState<Date | null>(null);

  // Inline Shipping Fee Editing State
  const [editingShippingId, setEditingShippingId] = useState<string | null>(null);
  const [shippingInputVal, setShippingInputVal] = useState<string>('');

  // Cancel Order Modal State
  const [cancellingOrder, setCancellingOrder] = useState<DemoOrder | null>(null);
  const [cancelReasonInput, setCancelReasonInput] = useState<string>('');

  // Audit Log Modal State
  const [auditModalOrder, setAuditModalOrder] = useState<DemoOrder | null>(null);
  const [auditLogs, setAuditLogs] = useState<OrderAuditLogItem[]>([]);
  const [loadingAuditLogs, setLoadingAuditLogs] = useState<boolean>(false);

  const fetchOrders = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/orders?limit=100', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.orders) && data.orders.length > 0) {
          const mapped: DemoOrder[] = data.orders.map((o: Record<string, unknown>) => {
            const meta = extractPosOrderMetadata(o);
            const isPos = String(o.order_code || '').startsWith('POS-') || meta.channel === 'POS';
            const userObj = (o.user as Record<string, unknown>) || {};
            const itemsArr = Array.isArray(o.items) ? o.items : [];
            const rawNote = String(o.note || '');

            // Strip out any [[ULAB_POS_META:...]] or JSON metadata completely before parsing note fields
            const cleanRawNote = rawNote.replace(/\[\[ULAB_POS_META:[\s\S]*?\]\]/g, '').trim();

            let cleanNote = meta.userNote || '';
            cleanNote = cleanNote.replace(/\[\[ULAB_POS_META:[\s\S]*?\]\]/g, '').trim();

            let address: string | null = null;
            let parsedName = '';
            let parsedPhone = '';
            let shippingFee = 0;

            const shipMatch = cleanRawNote.match(/\[Phí ship:\s*([\d.,]+)\s*đ?\]/i);
            if (shipMatch) {
              shippingFee = Number(shipMatch[1].replace(/\D/g, '')) || 0;
            }

            if (isPos) {
              parsedName = meta.customerName || 'Khách lẻ tại quầy';
              parsedPhone = meta.customerPhone || '';
            } else {
              parsedName = String(userObj.full_name || 'Khách đặt web');
              parsedPhone = String(userObj.phone || userObj.email || '—');

              const khMatch = cleanRawNote.match(/KH:\s*([^|(]+)(?:\(([^)]+)\))?/);
              if (khMatch) {
                if (khMatch[1]?.trim()) parsedName = khMatch[1].trim();
                if (khMatch[2]?.trim()) parsedPhone = khMatch[2].trim();
              }

              const dcMatch = cleanRawNote.match(/Đ\/c:\s*([^|]+)/);
              if (dcMatch) {
                address = dcMatch[1].trim();
              }

              const noteMatch = cleanRawNote.match(/Ghi chú:\s*([^|]+)/);
              if (noteMatch) {
                cleanNote = noteMatch[1].trim();
              } else if (!cleanNote && !cleanRawNote.startsWith('[')) {
                cleanNote = cleanRawNote;
              } else if (cleanNote && cleanNote.includes('|')) {
                const innerMatch = cleanNote.match(/Ghi chú:\s*([^|]+)/);
                if (innerMatch) {
                  cleanNote = innerMatch[1].trim();
                }
              }
            }

            let orderType: 'DELIVERY' | 'TAKEAWAY' | 'DINE_IN' = meta.orderType || 'TAKEAWAY';
            if (!isPos) {
              if (rawNote.includes('Giao tới nhà') || rawNote.includes('DELIVERY')) {
                orderType = 'DELIVERY';
              } else {
                orderType = 'TAKEAWAY';
              }
            }

            const orderStatus = (o.status as DemoOrder['status']) || 'PENDING';
            const channel: 'POS' | 'WEB' = isPos ? 'POS' : 'WEB';
            const resolvedFulfillment = normalizeFulfillmentStatus(
              typeof o.fulfillment_status === 'string' ? o.fulfillment_status : meta.fulfillmentStatus,
              orderStatus,
              channel
            );
            const resolvedShipping =
              Number(o.shipping_fee) || shippingFee || meta.shippingFee || 0;

            return {
              id: String(o.id),
              order_code: String(o.order_code || `CF-${String(o.id).slice(0, 4).toUpperCase()}`),
              customer_name: parsedName,
              customer_phone: parsedPhone,
              cashier_name: isPos ? meta.cashierName || 'Thu ngân Ủ LAB' : null,
              channel,
              order_type: orderType,
              customer_address:
                (typeof o.customer_address === 'string' && o.customer_address) ||
                address ||
                meta.customerAddress ||
                null,
              items: itemsArr.map((it: Record<string, unknown>) => {
                const rawItemName = String(it.product_name || it.item_name || it.name || 'Món nước');
                const optMatch = rawItemName.match(/\[(.*?)\]$/);
                const cleanItemName = rawItemName.replace(/\s*\[.*?\]$/, '').trim();
                return {
                  item_name: cleanItemName,
                  size_label: String(it.size || it.size_label || 'M'),
                  unit_price: Number(it.unit_price) || 0,
                  quantity: Number(it.quantity) || 1,
                  options_summary: optMatch ? optMatch[1] : undefined,
                };
              }),
              subtotal: Number(o.subtotal) || 0,
              discount_amount: meta.discountAmount || 0,
              discount_percent: meta.discountPercent || 0,
              points_used: Number(o.points_used) || 0,
              shipping_fee: resolvedShipping,
              total_due: Number(o.total_due) || 0,
              status: orderStatus,
              fulfillment_status: resolvedFulfillment,
              payment_method: typeof o.payment_method === 'string' ? o.payment_method : meta.paymentMethod,
              payment_status: typeof o.payment_status === 'string' ? o.payment_status : meta.paymentStatus,
              note: rawNote,
              clean_note: cleanNote || null,
              cancel_reason: meta.cancelReason || null,
              cancelled_by: meta.cancelledBy || null,
              raw_created_at: o.created_at ? String(o.created_at) : undefined,
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
        } else if (Array.isArray(data.orders) && data.orders.length === 0) {
          setOrders([]);
        }
      }
    } catch (err) {
      console.warn('Orders fetch fallback:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initTimer = setTimeout(() => {
      setNowDate(new Date());
      void fetchOrders();
    }, 0);
    const timer = setInterval(() => {
      void fetchOrders();
    }, 25000);
    const slaTimer = setInterval(() => {
      setNowDate(new Date());
    }, 30000);
    const handleLocationChanged = () => {
      void fetchOrders();
    };
    window.addEventListener('ulab:location-changed', handleLocationChanged);
    return () => {
      clearTimeout(initTimer);
      clearInterval(timer);
      clearInterval(slaTimer);
      window.removeEventListener('ulab:location-changed', handleLocationChanged);
    };
  }, [fetchOrders]);

  const kpiStats = useMemo(() => {
    const activeOpenCount = orders.filter(
      (o) =>
        o.status !== 'CANCELLED' &&
        (o.fulfillment_status === 'PENDING' ||
          o.fulfillment_status === 'PREPARING' ||
          o.fulfillment_status === 'READY')
    ).length;
    const completedCount = orders.filter(
      (o) => o.status !== 'CANCELLED' && o.fulfillment_status === 'COMPLETED'
    ).length;
    const cancelledCount = orders.filter((o) => o.status === 'CANCELLED').length;
    const collectedRevenue = orders
      .filter(
        (o) =>
          o.status !== 'CANCELLED' &&
          (o.payment_status === 'PAID' || (o.note || '').includes('Đã thanh toán'))
      )
      .reduce((sum, o) => sum + o.total_due, 0);

    return {
      total: orders.length,
      activeOpenCount,
      completedCount,
      cancelledCount,
      collectedRevenue,
    };
  }, [orders]);

  // Filter orders by status, fulfillment, channel, search query, and date
  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return orders.filter((o) => {
      const matchStatus = statusFilter === 'ALL' ? true : o.status === statusFilter;
      const matchFulfillment =
        fulfillmentFilter === 'ALL' ? true : o.fulfillment_status === fulfillmentFilter;
      const matchChannel = channelFilter === 'ALL' ? true : o.channel === channelFilter;

      let matchDate = true;
      if (dateFilter && o.raw_created_at) {
        const vnDate = new Date(new Date(o.raw_created_at).getTime() + 7 * 3600 * 1000)
          .toISOString()
          .slice(0, 10);
        matchDate = vnDate === dateFilter;
      }

      let matchSearch = true;
      if (q) {
        const inCode = o.order_code.toLowerCase().includes(q);
        const inName = o.customer_name.toLowerCase().includes(q);
        const inPhone = (o.customer_phone || '').toLowerCase().includes(q);
        const inItems = o.items.some((it) => it.item_name.toLowerCase().includes(q));
        matchSearch = inCode || inName || inPhone || inItems;
      }

      return matchStatus && matchFulfillment && matchChannel && matchDate && matchSearch;
    });
  }, [orders, statusFilter, fulfillmentFilter, channelFilter, searchQuery, dateFilter]);

  const handleAction = async (
    orderId: string,
    action: 'confirm' | 'cancel' | 'mark_paid',
    paymentMethod?: 'BANK_TRANSFER' | 'CASH',
    cancelReason?: string
  ) => {
    setProcessingId(orderId);
    setActionBanner(null);
    try {
      let loyaltyBonusMsg = '';
      if (isSupabaseConfigured()) {
        const res = await fetch(`/api/orders/${orderId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action,
            payment_method: paymentMethod,
            cancel_reason: cancelReason,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setActionBanner({ text: data.error || 'Không thể thực hiện thao tác.', isError: true });
          setProcessingId(null);
          return;
        }
        if (data?.loyalty?.pointsEarned && Number(data.loyalty.pointsEarned) > 0) {
          loyaltyBonusMsg = ` · Đã cộng tự động +${formatVND(Number(data.loyalty.pointsEarned))} vào ví SĐT khách hàng!`;
        }
      }

      setOrders((prev) =>
        prev.map((o) => {
          if (o.id !== orderId) return o;
          if (action === 'cancel') {
            return {
              ...o,
              status: 'CANCELLED',
              fulfillment_status: 'CANCELLED',
              payment_status: 'REFUNDED',
              cancel_reason: cancelReason || 'Khách báo hủy đơn',
            };
          }
          if (action === 'mark_paid') {
            return {
              ...o,
              status: 'CONFIRMED',
              fulfillment_status: o.fulfillment_status === 'PENDING' ? 'PREPARING' : o.fulfillment_status,
              payment_method: paymentMethod || 'CASH',
              payment_status: 'PAID',
            };
          }
          return {
            ...o,
            status: 'CONFIRMED',
            fulfillment_status: o.fulfillment_status === 'PENDING' ? 'PREPARING' : o.fulfillment_status,
          };
        })
      );
      setActionBanner({
        text:
          action === 'cancel'
            ? 'Đã hủy đơn hàng và hoàn/thu hồi điểm (nếu có) thành công.'
            : action === 'mark_paid'
              ? `Đã xác nhận đơn và ghi nhận thu tiền vào Quỹ Tiền.${loyaltyBonusMsg}`
              : `Đã xác nhận đơn hàng.${loyaltyBonusMsg}`,
      });
    } catch {
      setActionBanner({ text: 'Lỗi kết nối máy chủ.', isError: true });
    } finally {
      setProcessingId(null);
    }
  };

  const handleUpdateFulfillment = async (
    order: DemoOrder,
    nextFulfillment: Exclude<FulfillmentStatus, 'PENDING' | 'CANCELLED'>
  ) => {
    setProcessingId(order.id);
    setActionBanner(null);
    try {
      if (isSupabaseConfigured()) {
        const res = await fetch(`/api/orders/${order.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'update_fulfillment',
            fulfillment_status: nextFulfillment,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setActionBanner({
            text: data.error || 'Không thể cập nhật tiến độ phục vụ.',
            isError: true,
          });
          setProcessingId(null);
          return;
        }
      }

      setOrders((prev) =>
        prev.map((o) =>
          o.id === order.id ? { ...o, fulfillment_status: nextFulfillment } : o
        )
      );
      setActionBanner({
        text: `Đơn #${order.order_code} đã chuyển sang "${FULFILLMENT_STATUS_LABELS[nextFulfillment]}".`,
      });
    } catch {
      setActionBanner({ text: 'Lỗi kết nối khi cập nhật tiến độ đơn hàng.', isError: true });
    } finally {
      setProcessingId(null);
    }
  };

  const handleOpenAuditModal = async (order: DemoOrder) => {
    setAuditModalOrder(order);
    setAuditLogs([]);
    setLoadingAuditLogs(true);
    try {
      const res = await fetch(`/api/orders/${order.id}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(Array.isArray(data.auditLogs) ? data.auditLogs : []);
      }
    } catch {
      setAuditLogs([]);
    } finally {
      setLoadingAuditLogs(false);
    }
  };

  const handleExportCsv = () => {
    if (filteredOrders.length === 0) {
      setActionBanner({ text: 'Không có đơn hàng nào để xuất CSV.', isError: true });
      return;
    }

    const escapeCsv = (val: unknown) => {
      const s = String(val ?? '').replace(/"/g, '""');
      return `"${s}"`;
    };

    const headers = [
      'Ma don',
      'Thoi gian',
      'Kenh',
      'Hinh thuc',
      'Khach hang',
      'SDT',
      'Trang thai',
      'Tien do',
      'Thanh toan',
      'Tam tinh',
      'Giam gia',
      'Diem vi',
      'Phi ship',
      'Tong thu',
      'Danh sach mon',
    ];

    const rows = filteredOrders.map((o) => [
      o.order_code,
      o.created_at,
      o.channel,
      o.order_type,
      o.customer_name,
      o.customer_phone,
      o.status,
      FULFILLMENT_STATUS_LABELS[o.fulfillment_status],
      isOrderPaid(o) ? 'PAID' : 'UNPAID',
      o.subtotal,
      o.discount_amount || 0,
      o.points_used || 0,
      o.shipping_fee || 0,
      o.total_due,
      o.items.map((it) => `${it.quantity}x ${it.item_name} (${it.size_label})`).join('; '),
    ]);

    const csvContent =
      '\uFEFF' +
      [headers.map(escapeCsv).join(','), ...rows.map((r) => r.map(escapeCsv).join(','))].join(
        '\r\n'
      );

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ulab-don-hang-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleConfirmCancelModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingOrder) return;
    const cleanReason = cancelReasonInput.trim();
    if (cleanReason.length < 3) {
      alert('Vui lòng nhập lý do hủy đơn (tối thiểu 3 ký tự).');
      return;
    }
    const targetId = cancellingOrder.id;
    setCancellingOrder(null);
    setCancelReasonInput('');
    await handleAction(targetId, 'cancel', undefined, cleanReason);
  };

  // Convert DemoOrder to PosOrderRecord for direct thermal printing
  const toPosOrderRecord = (order: DemoOrder): PosOrderRecord => ({
    id: order.id,
    orderCode: order.order_code,
    status: order.status,
    fulfillmentStatus: order.fulfillment_status,
    channel: order.channel,
    orderType: order.order_type,
    paymentMethod: 'CASH',
    paymentStatus: order.status === 'CANCELLED' ? 'REFUNDED' : isOrderPaid(order) ? 'PAID' : 'UNPAID',
    subtotal: order.subtotal,
    discountAmount: order.discount_amount || 0,
    discountPercent: order.discount_percent || 0,
    pointsUsed: order.points_used,
    shippingFee: order.shipping_fee || 0,
    customerAddress: order.customer_address || undefined,
    totalDue: order.total_due,
    amountReceived: order.total_due,
    changeDue: 0,
    customerName: order.customer_name,
    customerPhone: order.customer_phone !== '—' ? order.customer_phone : '',
    cashierName: order.cashier_name || 'Thu ngân Ủ LAB',
    note: order.clean_note || '',
    createdAt: order.raw_created_at || new Date().toISOString(),
    items: order.items.map((it) => ({
      productName: it.item_name,
      sizeLabel: it.size_label,
      quantity: it.quantity,
      unitPrice: it.unit_price,
      subtotal: it.unit_price * it.quantity,
      optionsSummary: it.options_summary || (order.clean_note ? order.clean_note : '100% đường · 100% đá'),
    })),
  });

  const handlePrintBaristaTicket = (order: DemoOrder) => {
    const html = buildBaristaTicketHtml(toPosOrderRecord(order));
    const win = window.open('', '_blank', 'width=420,height=640');
    if (win) {
      win.document.write(html);
      win.document.close();
    }
  };

  const handlePrintReceipt = (order: DemoOrder) => {
    const html = buildCustomerReceiptHtml(toPosOrderRecord(order));
    const win = window.open('', '_blank', 'width=420,height=680');
    if (win) {
      win.document.write(html);
      win.document.close();
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
            Tiếp nhận đơn đặt trước từ website, quản lý đơn quầy POS, theo dõi SLA pha chế, in phiếu và đối soát tức thì.
          </p>
        </div>
        <div className={styles.headerActionsRow}>
          <button
            type="button"
            onClick={handleExportCsv}
            className={styles.exportCsvBtn}
            title="Xuất danh sách đơn đang lọc ra file CSV (Excel)"
          >
            📥 Xuất CSV ({filteredOrders.length})
          </button>
          <button
            type="button"
            onClick={fetchOrders}
            disabled={loading}
            className={styles.refreshBtn}
          >
            {loading ? 'Đang tải...' : '↻ Làm mới đơn'}
          </button>
        </div>
      </div>

      {/* 5-Card KPI Overview Strip */}
      <div className={styles.kpiStrip}>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Tổng đơn hiện có</span>
          <strong className={styles.kpiVal}>{kpiStats.total}</strong>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Đang chờ / Pha chế</span>
          <strong className={`${styles.kpiVal} ${styles.kpiAccentAmber}`}>
            {kpiStats.activeOpenCount}
          </strong>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Đã hoàn tất giao</span>
          <strong className={`${styles.kpiVal} ${styles.kpiAccentGreen}`}>
            {kpiStats.completedCount}
          </strong>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Đơn đã hủy</span>
          <strong className={`${styles.kpiVal} ${styles.kpiAccentRed}`}>
            {kpiStats.cancelledCount}
          </strong>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Doanh thu thực thu</span>
          <strong className={`${styles.kpiVal} ${styles.kpiAccentGreen}`}>
            {formatVND(kpiStats.collectedRevenue)}
          </strong>
        </div>
      </div>

      {actionBanner && (
        <div
          style={{
            marginBottom: 14,
            padding: '10px 14px',
            borderRadius: 10,
            background: actionBanner.isError ? '#fef2f2' : '#f0fdf4',
            border: `1px solid ${actionBanner.isError ? '#fecaca' : '#bbf7d0'}`,
            color: actionBanner.isError ? '#b91c1c' : '#15803d',
            fontSize: '0.85rem',
            fontWeight: 600,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{actionBanner.text}</span>
          <button
            type="button"
            onClick={() => setActionBanner(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Search & Date Filter Bar */}
      <div className={styles.searchDateToolbar}>
        <div className={styles.searchInputWrap}>
          <input
            type="search"
            placeholder="🔍 Tìm theo Mã đơn (#POS-..., #CF-...), Tên khách, SĐT hoặc Tên món..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.searchInput}
          />
        </div>
        <input
          type="date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className={styles.dateInput}
          title="Lọc đơn hàng theo ngày"
        />
        {(searchQuery || dateFilter) && (
          <button
            type="button"
            className={styles.clearFilterBtn}
            onClick={() => {
              setSearchQuery('');
              setDateFilter('');
            }}
          >
            ✕ Xóa lọc
          </button>
        )}
      </div>

      {/* Channel Filters */}
      <div className={styles.channelFilters}>
        {[
          { key: 'ALL', label: 'Tất cả nguồn', count: orders.length },
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

      {/* Fulfillment Progress Filters */}
      <div className={styles.fulfillmentFiltersRow} aria-label="Lọc theo tiến độ pha chế">
        {FULFILLMENT_FILTER_TABS.map((tab) => {
          const count =
            tab.key === 'ALL'
              ? orders.length
              : orders.filter((o) => o.fulfillment_status === tab.key).length;
          return (
            <button
              key={tab.key}
              type="button"
              className={`${styles.fulfillmentPillBtn} ${
                fulfillmentFilter === tab.key ? styles.fulfillmentPillActive : ''
              }`}
              onClick={() => setFulfillmentFilter(tab.key)}
            >
              {tab.label} ({count})
            </button>
          );
        })}
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
          const waitStatus =
            nowDate && order.raw_created_at && order.status !== 'CANCELLED' && order.fulfillment_status !== 'COMPLETED'
              ? calculateOrderWaitStatus(order.raw_created_at, order.fulfillment_status, nowDate)
              : null;

          const smsText = `Ủ LAB xin chào bạn ${order.customer_name}! Đơn hàng #${order.order_code}: Tiền nước ${formatVND(order.subtotal)}${order.points_used > 0 ? ` - Điểm ví ${formatVND(order.points_used)}` : ''} + Phí ship ${formatVND(order.shipping_fee || 0)} = Tổng thanh toán: ${formatVND(order.total_due)}. Quán chuẩn bị và giao ngay cho bạn nhé!`;

          return (
            <div key={order.id} className={styles.orderCard}>
              {/* Card Header */}
              <div className={styles.orderHeader}>
                <div className={styles.orderMeta}>
                  <span className={styles.orderCode}>#{order.order_code}</span>
                  <span className={styles.orderTime}>{order.created_at}</span>
                  <div className={styles.badgesGroup}>
                    {order.channel === 'POS' ? (
                      <span className={`${styles.badge} ${styles.badgePos}`}>
                        🏪 Bán tại quầy (POS)
                      </span>
                    ) : (
                      <span className={`${styles.badge} ${styles.badgeWeb}`}>
                        🌐 Đặt từ Website
                      </span>
                    )}

                    {isDelivery && (
                      <span className={`${styles.badge} ${styles.badgeDelivery}`}>
                        🛵 COD giao tới nhà
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

                    <span className={`${styles.badge} ${styles.badgePayCash}`}>
                      💵 Tiền
                    </span>

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

                <div className={styles.orderStatusIndicator}>
                  {order.status !== 'CANCELLED' && (
                    <span
                      className={`${styles.badge} ${
                        order.fulfillment_status === 'COMPLETED'
                          ? styles.fulfillmentBadgeCompleted
                          : order.fulfillment_status === 'READY'
                          ? styles.fulfillmentBadgeReady
                          : order.fulfillment_status === 'PREPARING'
                          ? styles.fulfillmentBadgePreparing
                          : styles.fulfillmentBadgePending
                      }`}
                    >
                      {FULFILLMENT_STATUS_LABELS[order.fulfillment_status]}
                    </span>
                  )}
                  {waitStatus && (
                    <span
                      className={`${styles.badge} ${
                        waitStatus.slaLevel === 'OVERDUE'
                          ? styles.slaBadgeOverdue
                          : waitStatus.slaLevel === 'WARNING'
                          ? styles.slaBadgeWarning
                          : styles.slaBadgeNormal
                      }`}
                      title="Thời gian chờ từ lúc tiếp nhận đơn"
                    >
                      ⏱ {waitStatus.label}
                    </span>
                  )}
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
                    <div>
                      <span className={styles.itemNameQty}>
                        {item.item_name} ({item.size_label}) × {item.quantity}
                      </span>
                      {item.options_summary && (
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          ↳ {item.options_summary}
                        </div>
                      )}
                    </div>
                    <span className={styles.itemPrice}>{formatVND(item.unit_price * item.quantity)}</span>
                  </div>
                ))}
              </div>

              {/* Clean Human Note */}
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
                {(order.discount_amount || 0) > 0 && (
                  <div className={`${styles.priceRow} ${styles.discount}`}>
                    <span>Giảm giá trực tiếp</span>
                    <span>-{formatVND(order.discount_amount || 0)}</span>
                  </div>
                )}
                {order.points_used > 0 && (
                  <div className={`${styles.priceRow} ${styles.discount}`}>
                    <span>Trừ điểm ví thành viên</span>
                    <span>-{formatVND(order.points_used)}</span>
                  </div>
                )}

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
                {/* 1. Direct Thermal Printing Buttons */}
                {order.status !== 'CANCELLED' && (
                  <>
                    <button
                      type="button"
                      className={`${styles.actionBtn} ${styles.printBtn}`}
                      onClick={() => handlePrintBaristaTicket(order)}
                      title="In phiếu pha chế / tem dán ly cho đơn này"
                    >
                      🏷️ In Tem Pha Chế
                    </button>
                    <button
                      type="button"
                      className={`${styles.actionBtn} ${styles.printBtn}`}
                      onClick={() => handlePrintReceipt(order)}
                      title="In biên nhận thanh toán (80mm)"
                    >
                      🧾 In Biên Nhận
                    </button>
                  </>
                )}

                {/* 2. Fast Payment Collection */}
                {!paid && order.status !== 'CANCELLED' && (
                  <button
                    type="button"
                    className={`${styles.actionBtn} ${styles.payCashBtn}`}
                    disabled={processingId === order.id}
                    onClick={() => handleAction(order.id, 'mark_paid', 'CASH')}
                  >
                    ✓ Xác nhận &amp; Đã Thu Tiền ({formatVND(order.total_due)})
                  </button>
                )}

                {/* 3. Confirm order if pending (for COD / unpaid delivery) */}
                {order.status === 'PENDING' && !paid && (
                  <button
                    type="button"
                    className={`${styles.actionBtn} ${styles.confirmBtn}`}
                    disabled={processingId === order.id}
                    onClick={() => handleAction(order.id, 'confirm')}
                  >
                    🚚 Xác nhận đơn (Thu sau)
                  </button>
                )}

                {/* 4. Fulfillment progression buttons */}
                {order.status !== 'CANCELLED' && order.fulfillment_status === 'PENDING' && (
                  <button
                    type="button"
                    className={`${styles.actionBtn} ${styles.fulfillmentActionBtn}`}
                    disabled={processingId === order.id}
                    onClick={() => handleUpdateFulfillment(order, 'PREPARING')}
                  >
                    👨‍🍳 Bắt đầu pha
                  </button>
                )}
                {order.status !== 'CANCELLED' && order.fulfillment_status === 'PREPARING' && (
                  <button
                    type="button"
                    className={`${styles.actionBtn} ${styles.fulfillmentActionBtn}`}
                    disabled={processingId === order.id}
                    onClick={() => handleUpdateFulfillment(order, 'READY')}
                  >
                    🔔 Báo sẵn sàng
                  </button>
                )}
                {order.status !== 'CANCELLED' && order.fulfillment_status === 'READY' && (
                  <button
                    type="button"
                    className={`${styles.actionBtn} ${styles.fulfillmentActionBtn}`}
                    disabled={processingId === order.id}
                    onClick={() => handleUpdateFulfillment(order, 'COMPLETED')}
                  >
                    ✓ Hoàn tất giao
                  </button>
                )}

                {/* 5. Push to POS option — ONLY for pending/unpaid WEB orders to prevent duplicate POS revenue */}
                {order.channel === 'WEB' && order.status === 'PENDING' && !paid && (
                  <button
                    type="button"
                    className={`${styles.actionBtn} ${styles.posBtn}`}
                    onClick={() => handlePushToPos(order)}
                    title="Nạp đơn đặt web vào màn hình POS để chỉnh sửa thêm món"
                  >
                    ⚡ Nạp vào POS
                  </button>
                )}

                {/* 6. Order Audit Trail modal trigger */}
                <button
                  type="button"
                  className={`${styles.actionBtn} ${styles.auditBtn}`}
                  onClick={() => handleOpenAuditModal(order)}
                  title="Xem lịch sử thao tác và kiểm toán đơn hàng"
                >
                  📜 Nhật ký đơn
                </button>

                {/* 7. Cancel order button (opens mandatory reason modal) */}
                {order.status !== 'CANCELLED' && (
                  <button
                    type="button"
                    className={`${styles.actionBtn} ${styles.cancelBtn}`}
                    disabled={processingId === order.id}
                    onClick={() => {
                      setCancellingOrder(order);
                      setCancelReasonInput('Khách báo hủy đơn');
                    }}
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
            <p>Không có đơn hàng nào phù hợp với bộ lọc hiện tại</p>
          </div>
        )}
      </div>

      {/* Cancel Order Reason Modal */}
      {cancellingOrder && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <div className={styles.modalHeader} style={{ background: '#b91c1c' }}>
              <h3 className={styles.modalTitle}>
                ⚠️ Xác Nhận Hủy Đơn #{cancellingOrder.order_code}
              </h3>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setCancellingOrder(null)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleConfirmCancelModal} className={styles.modalBody} style={{ alignItems: 'stretch', textAlign: 'left' }}>
              <div className={styles.modalDetails}>
                <div className={styles.modalDetailRow}>
                  <span>Khách hàng:</span>
                  <strong>{cancellingOrder.customer_name}</strong>
                </div>
                <div className={styles.modalDetailRow}>
                  <span>Tổng giá trị đơn:</span>
                  <strong style={{ color: '#b91c1c' }}>{formatVND(cancellingOrder.total_due)}</strong>
                </div>
                {cancellingOrder.points_used > 0 && (
                  <div className={styles.modalDetailRow}>
                    <span>Điểm ví hoàn lại:</span>
                    <strong style={{ color: '#15803d' }}>+{formatVND(cancellingOrder.points_used)}</strong>
                  </div>
                )}
              </div>

              <label style={{ fontSize: '0.825rem', fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
                Chọn nhanh hoặc nhập lý do hủy đơn (Bắt buộc):
              </label>
              <div className={styles.quickReasonRow}>
                {QUICK_CANCEL_REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={styles.quickReasonPill}
                    onClick={() => setCancelReasonInput(r)}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <input
                type="text"
                required
                value={cancelReasonInput}
                onChange={(e) => setCancelReasonInput(e.target.value)}
                placeholder="Nhập lý do hủy đơn (tối thiểu 3 ký tự)..."
                className={styles.searchInput}
                style={{ marginBottom: 16 }}
              />

              <div className={styles.modalActionBtnRow}>
                <button
                  type="button"
                  className={styles.clearFilterBtn}
                  onClick={() => setCancellingOrder(null)}
                >
                  Đóng lại
                </button>
                <button
                  type="submit"
                  className={`${styles.actionBtn} ${styles.confirmBtn}`}
                  style={{ background: '#b91c1c', justifyContent: 'center' }}
                >
                  ✕ Xác nhận Hủy đơn
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Order Audit Log Modal */}
      {auditModalOrder && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                📜 Nhật Ký Kiểm Toán #{auditModalOrder.order_code}
              </h3>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setAuditModalOrder(null)}
              >
                ✕
              </button>
            </div>
            <div className={styles.modalBody} style={{ alignItems: 'stretch' }}>
              {loadingAuditLogs ? (
                <p style={{ color: '#64748b', fontSize: '0.85rem' }}>
                  Đang tải lịch sử thao tác...
                </p>
              ) : auditLogs.length === 0 ? (
                <p style={{ color: '#64748b', fontSize: '0.85rem' }}>
                  Chưa có bản ghi kiểm toán chi tiết cho đơn hàng này.
                </p>
              ) : (
                <div className={styles.auditLogList}>
                  {auditLogs.map((log) => (
                    <div key={log.id} className={styles.auditLogItem}>
                      <div className={styles.auditLogTop}>
                        <span className={styles.auditLogAction}>{log.action}</span>
                        <span className={styles.auditLogTime}>
                          {new Date(log.createdAt).toLocaleString('vi-VN')}
                        </span>
                      </div>
                      <div style={{ color: '#334155', fontSize: '0.78rem' }}>
                        Thực hiện bởi: <strong>{log.actorName}</strong> ({log.actorRole})
                      </div>
                      {log.reason && (
                        <div style={{ color: '#0f172a', marginTop: 3 }}>
                          Ghi chú / Lý do: {log.reason}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                className={styles.clearFilterBtn}
                style={{ marginTop: 14, width: '100%' }}
                onClick={() => setAuditModalOrder(null)}
              >
                Đóng cửa sổ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
