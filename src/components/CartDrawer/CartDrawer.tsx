'use client';

import { useState, useEffect, useRef } from 'react';
import styles from './CartDrawer.module.css';
import { useCartStore, CartItem } from '@/store/cart';
import { formatVND } from '@/data/menu';
import { useAuth } from '@/hooks/useAuth';
import {
  DrinkIllustration,
  ShoppingBagIcon,
  StarSolidIcon,
  CheckCircleIcon,
  FlaskIcon,
} from '@/components/Icons/LabIcons';
import { buildVietQrImageUrl, DEFAULT_VIETQR_CONFIG } from '@/lib/vietqr';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export type FulfillmentType = 'DELIVERY' | 'PICKUP';
export type PaymentPreference = 'FLEXIBLE' | 'QR' | 'CASH';

interface OrderSuccessInfo {
  code: string;
  text: string;
  customerName?: string;
  customerPhone?: string;
  fulfillmentType?: FulfillmentType;
  messengerUrl: string;
  webMessengerUrl: string;
  pageUrl: string;
  totalDue: number;
  paymentPreference: PaymentPreference;
  vietQrUrl: string;
  bankName: string;
  accountNo: string;
  accountName: string;
}

const FANPAGE_ID = process.env.NEXT_PUBLIC_MESSENGER_FANPAGE_ID || '61595629718216';
const FACEBOOK_PAGE_URL =
  process.env.NEXT_PUBLIC_FACEBOOK_PAGE_URL ||
  'https://www.facebook.com/p/%E1%BB%A6-LAB-61595629718216/';

const QUICK_NOTES = ['Ít ngọt', 'Đá riêng', 'Không đường', 'Nhiều đá'];

async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fallback
    }
  }
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch {
    return false;
  }
}

export default function CartDrawer({ isOpen, onClose }: CartDrawerProps) {
  const {
    items,
    pointsToUse,
    setPointsToUse,
    clearCart,
    getSubtotal,
    getTotalDue,
    updateQuantity,
    removeItem,
  } = useCartStore();
  const { profile, spendPoints } = useAuth();
  const drawerRef = useRef<HTMLDivElement>(null);

  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType>('PICKUP');
  const [paymentPreference, setPaymentPreference] = useState<PaymentPreference>('FLEXIBLE');
  const [customerName, setCustomerName] = useState(profile?.full_name || '');
  const [customerPhone, setCustomerPhone] = useState(profile?.phone || '');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerNote, setCustomerNote] = useState('');
  const [formError, setFormError] = useState('');
  const [orderSuccess, setOrderSuccess] = useState<OrderSuccessInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const subtotal = getSubtotal();
  const userPointBalance = profile?.point_balance || 0;
  const maxUsablePoints = Math.min(userPointBalance, subtotal);
  const totalDue = getTotalDue();

  useEffect(() => {
    if (profile?.full_name && !customerName) {
      setCustomerName(profile.full_name);
    }
    if (profile?.phone && !customerPhone) {
      setCustomerPhone(profile.phone);
    }
  }, [profile, customerName, customerPhone]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      setOrderSuccess(null);
      setCopied(false);
      setShowPreview(false);
      setFormError('');
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const toggleQuickNote = (chip: string) => {
    if (customerNote.includes(chip)) {
      const updated = customerNote
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s && s !== chip)
        .join(', ');
      setCustomerNote(updated);
    } else {
      setCustomerNote(customerNote ? `${customerNote.trim()}, ${chip}` : chip);
    }
  };

  const handleCopyField = async (text: string, fieldName: string) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2000);
    }
  };

  const handleSendOrder = async () => {
    if (items.length === 0) return;

    const cleanName = customerName.trim();
    const cleanPhone = customerPhone.trim().replace(/[\s\-()]/g, '');
    let cleanAddress = customerAddress.trim();

    if (!cleanName) {
      setFormError('Vui lòng nhập họ và tên người đặt hàng.');
      return;
    }

    if (!cleanPhone || !/^0\d{8,10}$/.test(cleanPhone)) {
      setFormError('Vui lòng nhập số điện thoại hợp lệ (9–11 số, bắt đầu bằng số 0).');
      return;
    }

    if (!cleanAddress && fulfillmentType === 'DELIVERY') {
      setFormError('Vui lòng nhập địa chỉ giao hàng chi tiết.');
      return;
    }

    if (!cleanAddress && fulfillmentType === 'PICKUP') {
      cleanAddress = 'Ghé lấy trực tiếp tại quầy';
    }

    setFormError('');

    const orderCode = `CF-${Math.floor(1000 + Math.random() * 9000)}`;

    const orderItemsText = items
      .map(
        (ci: CartItem) =>
          `• ${ci.quantity}x ${ci.menuItem.name} (${ci.sizeLabel}) - ${formatVND(ci.price * ci.quantity)}`
      )
      .join('\n');

    const fulfillmentLabel =
      fulfillmentType === 'DELIVERY' ? '🛵 Giao tới nhà' : '🏪 Lấy tại cửa hàng';

    const paymentLabel =
      paymentPreference === 'QR'
        ? '📲 Quét mã QR ngân hàng'
        : paymentPreference === 'CASH'
        ? (fulfillmentType === 'DELIVERY' ? '💵 Tiền mặt khi nhận (COD)' : '💵 Tiền mặt tại quầy')
        : (fulfillmentType === 'DELIVERY' ? '🔄 Tiền mặt hoặc Chuyển khoản khi giao' : '🔄 Linh hoạt tại quầy (Tiền mặt hoặc Quét QR)');

    const customerInfo = `${cleanName} - ${cleanPhone}`;
    const tierInfo = profile?.tier?.name
      ? `${profile.tier.name} (Hoàn ${profile.tier.cashback_rate}%)`
      : null;

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} - ${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

    const fullText = [
      `🧪 Ủ LAB - ĐƠN ĐẶT HÀNG [#${orderCode}]`,
      `📦 Hình thức nhận: ${fulfillmentLabel}`,
      `💳 Thanh toán: ${paymentLabel}`,
      `👤 Khách hàng: ${customerInfo}`,
      `📍 Địa chỉ / Giờ lấy: ${cleanAddress}`,
      tierInfo ? `⭐ Hạng thành viên: ${tierInfo}` : null,
      `---------------------------------`,
      orderItemsText,
      `---------------------------------`,
      `💰 Tạm tính: ${formatVND(subtotal)}`,
      pointsToUse > 0 ? `🎁 Giảm từ điểm ví: -${formatVND(pointsToUse)}` : null,
      `👉 TỔNG THANH TOÁN: ${formatVND(totalDue)}`,
      customerNote.trim() ? `📝 Ghi chú: ${customerNote.trim()}` : null,
      `---------------------------------`,
      `⏰ Thời gian: ${timeStr}`,
      `🌐 Đặt từ: Website Ủ LAB`,
    ]
      .filter(Boolean)
      .join('\n');

    const messengerUrl = `https://m.me/${FANPAGE_ID}?ref=${orderCode}`;
    const webMessengerUrl = `https://www.facebook.com/messages/t/${FANPAGE_ID}`;

    // Silently copy order details for convenience if customer wishes to paste
    void copyToClipboard(fullText);

    if (pointsToUse > 0) {
      spendPoints(pointsToUse, orderCode);
    }

    const combinedOrderNote = [
      `[${fulfillmentType === 'DELIVERY' ? 'Giao tới nhà' : 'Lấy tại cửa hàng'}]`,
      `Thanh toán: ${paymentLabel}`,
      `KH: ${cleanName} (${cleanPhone})`,
      `Đ/c: ${cleanAddress}`,
      customerNote.trim() ? `Ghi chú: ${customerNote.trim()}` : null,
    ]
      .filter(Boolean)
      .join(' | ');

    fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: items.map((ci) => ({
          item_id: ci.menuItem.id,
          name: ci.menuItem.name,
          size_label: ci.sizeLabel,
          unit_price: ci.price,
          quantity: ci.quantity,
        })),
        points_used: pointsToUse,
        note: combinedOrderNote,
        customer_name: cleanName,
        customer_phone: cleanPhone,
        customer_address: cleanAddress,
        fulfillment_type: fulfillmentType,
        payment_method: paymentPreference === 'QR' ? 'BANK_TRANSFER' : paymentPreference === 'CASH' ? 'CASH' : 'FLEXIBLE',
      }),
    }).catch((err) => console.warn('Order DB sync:', err));

    const vietQrUrl = buildVietQrImageUrl({
      amount: totalDue,
      description: `ULAB ${orderCode}`,
    });

    setOrderSuccess({
      code: orderCode,
      text: fullText,
      customerName: cleanName,
      customerPhone: cleanPhone,
      fulfillmentType,
      messengerUrl,
      webMessengerUrl,
      pageUrl: FACEBOOK_PAGE_URL,
      totalDue,
      paymentPreference,
      vietQrUrl,
      bankName: DEFAULT_VIETQR_CONFIG.bankName,
      accountNo: DEFAULT_VIETQR_CONFIG.accountNo,
      accountName: DEFAULT_VIETQR_CONFIG.accountName,
    });

    clearCart();
  };

  const handleCopyAgain = async () => {
    if (orderSuccess?.text) {
      const ok = await copyToClipboard(orderSuccess.text);
      setCopied(ok);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <>
      <div
        className={`${styles.overlay} ${isOpen ? styles.open : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        ref={drawerRef}
        className={`${styles.drawer} ${isOpen ? styles.open : ''}`}
        role="dialog"
        aria-label="Giỏ hàng đặt món Ủ LAB"
      >
        {/* House Green Header Band */}
        <div className={styles.header}>
          <div className={styles.headerTitleGroup}>
            <span className={styles.headerIcon}>
              <ShoppingBagIcon size={18} />
            </span>
            <div>
              <h2 className={styles.title}>Đơn hàng của bạn</h2>
              <span className={styles.subtitle}>Ủ LAB · Matcha &amp; Cold Brew</span>
            </div>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Đóng giỏ hàng"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Success View */}
        {orderSuccess ? (
          <div className={styles.successView}>
            <div className={styles.successBadgeWrap}>
              <CheckCircleIcon size={36} />
            </div>
            <h3 className={styles.successTitle}>Đặt Đơn Thành Công!</h3>
            <span className={styles.orderCodeBadge}>Mã đơn hàng: #{orderSuccess.code}</span>
            <p className={styles.successDesc}>
              Hệ thống Ủ LAB đã tiếp nhận đơn của bạn và gửi ngay tới quầy pha chế.
            </p>

            {/* Delivery vs Pickup Notice */}
            {orderSuccess.fulfillmentType === 'DELIVERY' ? (
              <div className={styles.noticeDeliveryBox}>
                <span className={styles.noticeIcon}>🛵</span>
                <div className={styles.noticeBoxText}>
                  <strong>Đơn Hàng Giao Tận Nơi</strong>
                  <p>
                    Quán sẽ liên hệ SĐT <strong>{orderSuccess.customerPhone}</strong> trong ít phút để kiểm tra khoảng cách và báo phí ship chính xác trước khi giao hàng.
                  </p>
                </div>
              </div>
            ) : (
              <div className={styles.noticePickupBox}>
                <span className={styles.noticeIcon}>🏪</span>
                <div className={styles.noticeBoxText}>
                  <strong>Lấy Trực Tiếp Tại Quầy</strong>
                  <p>
                    Đơn hàng đang được chuẩn bị tại quầy Ủ LAB (Hồ Con Rùa). Bạn có thể ghé quầy nhận đồ uống theo thời gian đã hẹn!
                  </p>
                </div>
              </div>
            )}

            {/* Dynamic VietQR Payment Card if user wants to scan QR or flexible */}
            {orderSuccess.vietQrUrl && orderSuccess.totalDue > 0 && (
              <div className={styles.vietQrBox}>
                <div className={styles.vietQrHeader}>
                  <span className={styles.vietQrTitle}>📲 Quét mã QR thanh toán (VietQR)</span>
                  <span className={styles.vietQrBadge}>Đúng số tiền</span>
                </div>
                <div className={styles.vietQrImageWrap}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={orderSuccess.vietQrUrl}
                    alt="VietQR Thanh Toán Ủ LAB"
                    className={styles.vietQrImg}
                  />
                </div>
                <div className={styles.vietQrDetails}>
                  <div className={styles.vietQrRow}>
                    <span>Ngân hàng:</span>
                    <strong>{orderSuccess.bankName}</strong>
                  </div>
                  <div className={styles.vietQrRow}>
                    <span>Số tài khoản:</span>
                    <strong style={{ fontFamily: 'monospace' }}>{orderSuccess.accountNo}</strong>
                    <button
                      type="button"
                      className={styles.miniCopyBtn}
                      onClick={() => handleCopyField(orderSuccess.accountNo, 'stk')}
                    >
                      {copiedField === 'stk' ? '✓ Đã chép' : 'Sao chép'}
                    </button>
                  </div>
                  <div className={styles.vietQrRow}>
                    <span>Chủ tài khoản:</span>
                    <strong>{orderSuccess.accountName}</strong>
                  </div>
                  <div className={styles.vietQrRow}>
                    <span>Số tiền cần thu:</span>
                    <strong style={{ color: '#006241', fontSize: '1.05rem' }}>{formatVND(orderSuccess.totalDue)}</strong>
                  </div>
                  <div className={styles.vietQrRow}>
                    <span>Nội dung chuyển khoản:</span>
                    <strong style={{ fontFamily: 'monospace' }}>ULAB {orderSuccess.code}</strong>
                    <button
                      type="button"
                      className={styles.miniCopyBtn}
                      onClick={() => handleCopyField('ULAB ' + orderSuccess.code, 'memo')}
                    >
                      {copiedField === 'memo' ? '✓ Đã chép' : 'Sao chép'}
                    </button>
                  </div>
                </div>
                <p className={styles.vietQrNote}>
                  💡 <em>Quý khách có thể quét mã chuyển khoản ngay hoặc thanh toán trực tiếp khi nhận đồ uống.</em>
                </p>
              </div>
            )}

            {/* Direct Contact Channels */}
            <div className={styles.quickContactRow}>
              <a
                href="https://zalo.me/0947038325"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.contactZaloBtn}
              >
                💬 Chat Zalo Quán
              </a>
              <a
                href="tel:0947038325"
                className={styles.contactCallBtn}
              >
                📞 Hotline: 0947.038.325
              </a>
              <a
                href="https://m.me/ulabbrew"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.contactFbBtn}
              >
                💬 Nhắn tin Facebook Messenger
              </a>
            </div>

            <div className={styles.successActions}>
              <button
                type="button"
                className={styles.previewToggleBtn}
                onClick={() => setShowPreview(!showPreview)}
              >
                {showPreview ? 'Ẩn tóm tắt đơn ▲' : 'Xem tóm tắt đơn đã đặt ▼'}
              </button>

              {showPreview && (
                <pre className={styles.messagePreview}>{orderSuccess.text}</pre>
              )}

              <button type="button" className={styles.doneBtn} onClick={onClose}>
                Hoàn tất &amp; Tiếp tục xem thực đơn
              </button>
            </div>
          </div>
        ) : items.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIconCircle}>
              <FlaskIcon size={32} />
            </div>
            <p className={styles.emptyText}>Chưa có món nào trong giỏ</p>
            <p className={styles.emptySubtext}>
              Khám phá thực đơn Matcha Fuji MK4 và Cold Brew ủ lạnh 18 giờ để bắt đầu đặt món.
            </p>
            <button type="button" className={styles.emptyBrowseBtn} onClick={onClose}>
              Xem thực đơn ngay
            </button>
          </div>
        ) : (
          <>
            {/* Scrollable Body */}
            <div className={styles.scrollBody}>
              {/* Cart Items List */}
              <div className={styles.itemsList}>
                {items.map((ci: CartItem) => (
                  <div
                    key={`${ci.menuItem.id}-${ci.sizeIndex}`}
                    className={styles.cartItem}
                  >
                    <div className={styles.itemThumb}>
                      <DrinkIllustration
                        itemId={ci.menuItem.id}
                        categorySlug={ci.menuItem.categorySlug}
                        className={styles.itemThumbSvg}
                      />
                    </div>

                    <div className={styles.itemInfo}>
                      <div className={styles.itemTop}>
                        <h4 className={styles.itemName}>{ci.menuItem.name}</h4>
                        <button
                          type="button"
                          className={styles.removeBtn}
                          onClick={() => removeItem(ci.menuItem.id, ci.sizeIndex)}
                          aria-label={`Xóa ${ci.menuItem.name} khỏi giỏ`}
                        >
                          ✕
                        </button>
                      </div>

                      <span className={styles.sizeBadge}>Size {ci.sizeLabel}</span>

                      <div className={styles.itemBottom}>
                        <div className={styles.qtyControl}>
                          <button
                            type="button"
                            className={styles.qtyBtn}
                            onClick={() =>
                              updateQuantity(
                                ci.menuItem.id,
                                ci.sizeIndex,
                                ci.quantity - 1
                              )
                            }
                            aria-label="Giảm số lượng"
                          >
                            −
                          </button>
                          <span className={styles.qtyNum}>{ci.quantity}</span>
                          <button
                            type="button"
                            className={styles.qtyBtn}
                            onClick={() =>
                              updateQuantity(
                                ci.menuItem.id,
                                ci.sizeIndex,
                                ci.quantity + 1
                              )
                            }
                            aria-label="Tăng số lượng"
                          >
                            +
                          </button>
                        </div>
                        <span className={styles.itemPrice}>
                          {formatVND(ci.price * ci.quantity)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Customer Info, Fulfillment Type & Customization Notes */}
              <div className={styles.customerForm}>
                <span className={styles.sectionSmallTitle}>1. HÌNH THỨC NHẬN MÓN *</span>

                {/* Fulfillment Option Selector */}
                <div className={styles.fulfillmentToggle} role="radiogroup" aria-label="Chọn hình thức nhận món">
                  <button
                    type="button"
                    className={`${styles.fulfillmentBtn} ${fulfillmentType === 'PICKUP' ? styles.fulfillmentBtnActive : ''}`}
                    onClick={() => setFulfillmentType('PICKUP')}
                    aria-pressed={fulfillmentType === 'PICKUP'}
                  >
                    <span>🏪 Lấy tại cửa hàng</span>
                  </button>
                  <button
                    type="button"
                    className={`${styles.fulfillmentBtn} ${fulfillmentType === 'DELIVERY' ? styles.fulfillmentBtnActive : ''}`}
                    onClick={() => setFulfillmentType('DELIVERY')}
                    aria-pressed={fulfillmentType === 'DELIVERY'}
                  >
                    <span>🛵 Giao tới nhà</span>
                  </button>
                </div>

                <span className={styles.paymentSectionTitle}>2. HÌNH THỨC THANH TOÁN DỰ KIẾN *</span>
                <div className={styles.paymentToggle} role="radiogroup" aria-label="Chọn hình thức thanh toán">
                  {fulfillmentType === 'PICKUP' ? (
                    <>
                      <button
                        type="button"
                        className={`${styles.paymentBtn} ${paymentPreference === 'FLEXIBLE' ? styles.paymentBtnActive : ''}`}
                        onClick={() => setPaymentPreference('FLEXIBLE')}
                        aria-pressed={paymentPreference === 'FLEXIBLE'}
                      >
                        <span>🔄 Linh hoạt tại quầy (Tiền mặt hoặc Quét QR)</span>
                        <span className={styles.paymentBtnBadge}>Khuyên dùng</span>
                      </button>
                      <button
                        type="button"
                        className={`${styles.paymentBtn} ${paymentPreference === 'QR' ? styles.paymentBtnActive : ''}`}
                        onClick={() => setPaymentPreference('QR')}
                        aria-pressed={paymentPreference === 'QR'}
                      >
                        <span>📲 Quét mã QR chuyển khoản</span>
                      </button>
                      <button
                        type="button"
                        className={`${styles.paymentBtn} ${paymentPreference === 'CASH' ? styles.paymentBtnActive : ''}`}
                        onClick={() => setPaymentPreference('CASH')}
                        aria-pressed={paymentPreference === 'CASH'}
                      >
                        <span>💵 Tiền mặt khi lấy món</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className={`${styles.paymentBtn} ${paymentPreference === 'CASH' ? styles.paymentBtnActive : ''}`}
                        onClick={() => setPaymentPreference('CASH')}
                        aria-pressed={paymentPreference === 'CASH'}
                      >
                        <span>💵 Tiền mặt khi nhận (COD)</span>
                        <span className={styles.paymentBtnBadge}>Phổ biến</span>
                      </button>
                      <button
                        type="button"
                        className={`${styles.paymentBtn} ${paymentPreference === 'QR' ? styles.paymentBtnActive : ''}`}
                        onClick={() => setPaymentPreference('QR')}
                        aria-pressed={paymentPreference === 'QR'}
                      >
                        <span>📲 Quét mã QR chuyển khoản</span>
                      </button>
                      <button
                        type="button"
                        className={`${styles.paymentBtn} ${paymentPreference === 'FLEXIBLE' ? styles.paymentBtnActive : ''}`}
                        onClick={() => setPaymentPreference('FLEXIBLE')}
                        aria-pressed={paymentPreference === 'FLEXIBLE'}
                      >
                        <span>🔄 Tiền mặt hoặc Chuyển khoản khi giao</span>
                      </button>
                    </>
                  )}
                </div>

                {formError && (
                  <div className={styles.formErrorBox} role="alert">
                    {formError}
                  </div>
                )}

                <span className={styles.paymentSectionTitle} style={{ marginTop: 10 }}>3. THÔNG TIN KHÁCH HÀNG *</span>
                <div className={styles.formRow}>
                  <input
                    type="text"
                    placeholder="Họ và tên *"
                    value={customerName}
                    onChange={(e) => {
                      setCustomerName(e.target.value);
                      if (formError) setFormError('');
                    }}
                    className={styles.formInput}
                    aria-label="Tên khách hàng"
                    required
                  />
                  <input
                    type="tel"
                    placeholder="Số điện thoại *"
                    value={customerPhone}
                    onChange={(e) => {
                      setCustomerPhone(e.target.value);
                      if (formError) setFormError('');
                    }}
                    className={styles.formInput}
                    aria-label="Số điện thoại"
                    required
                  />
                </div>

                <input
                  type="text"
                  placeholder={
                    fulfillmentType === 'DELIVERY'
                      ? 'Địa chỉ giao hàng chi tiết (Số nhà, đường, phường/xã) *'
                      : 'Thời gian dự kiến ghé lấy (VD: 8h30 sáng nay, chiều nay...)'
                  }
                  value={customerAddress}
                  onChange={(e) => {
                    setCustomerAddress(e.target.value);
                    if (formError) setFormError('');
                  }}
                  className={styles.formInput}
                  aria-label="Địa chỉ hoặc thời gian ghé lấy"
                />

                <input
                  type="text"
                  placeholder="Ghi chú khẩu vị: Ít ngọt, đá riêng, nhiều đá..."
                  value={customerNote}
                  onChange={(e) => setCustomerNote(e.target.value)}
                  className={styles.noteInput}
                  aria-label="Ghi chú đơn hàng"
                />
                <div className={styles.quickNotesRow}>
                  {QUICK_NOTES.map((chip) => {
                    const active = customerNote.includes(chip);
                    return (
                      <button
                        type="button"
                        key={chip}
                        className={`${styles.quickNotePill} ${active ? styles.quickNoteActive : ''}`}
                        onClick={() => toggleQuickNote(chip)}
                      >
                        {active ? `✓ ${chip}` : `+ ${chip}`}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Gold Rewards Points Redemption */}
              <div className={styles.pointsSection}>
                <div className={styles.pointsHeader}>
                  <span className={styles.pointsLabel}>
                    <StarSolidIcon size={13} className={styles.goldIcon} />
                    <span>Dùng điểm thưởng Ủ LAB</span>
                  </span>
                  <span className={styles.pointsBalance}>
                    Số dư: <strong>{formatVND(userPointBalance)}</strong>
                  </span>
                </div>
                <div className={styles.pointsInput}>
                  <input
                    type="number"
                    min="0"
                    max={maxUsablePoints}
                    step="1000"
                    value={pointsToUse || ''}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setPointsToUse(Math.min(Math.max(0, val), maxUsablePoints));
                    }}
                    className={styles.input}
                    placeholder="Nhập số điểm muốn trừ..."
                    aria-label="Số điểm thưởng muốn dùng"
                  />
                  <button
                    type="button"
                    className={styles.useAllBtn}
                    onClick={() => setPointsToUse(maxUsablePoints)}
                    disabled={maxUsablePoints <= 0}
                  >
                    Dùng tối đa
                  </button>
                </div>
              </div>
            </div>

            {/* Sticky Checkout Footer */}
            <div className={styles.footerDock}>
              <div className={styles.summary}>
                <div className={styles.summaryRow}>
                  <span>Hình thức nhận</span>
                  <strong>
                    {fulfillmentType === 'DELIVERY' ? '🛵 Giao tới nhà' : '🏪 Lấy tại cửa hàng'}
                  </strong>
                </div>
                <div className={styles.summaryRow}>
                  <span>Thanh toán</span>
                  <strong style={{ color: '#006241' }}>
                    {paymentPreference === 'QR'
                      ? '📲 Quét mã QR'
                      : paymentPreference === 'CASH'
                      ? '💵 Tiền mặt'
                      : '🔄 Linh hoạt tại quầy'}
                  </strong>
                </div>
                <div className={styles.summaryRow}>
                  <span>Tạm tính ({items.reduce((s, i) => s + i.quantity, 0)} món)</span>
                  <span>{formatVND(subtotal)}</span>
                </div>
                {pointsToUse > 0 && (
                  <div className={`${styles.summaryRow} ${styles.discount}`}>
                    <span>Ưu đãi trừ điểm ví</span>
                    <span>−{formatVND(pointsToUse)}</span>
                  </div>
                )}
                <div className={`${styles.summaryRow} ${styles.total}`}>
                  <span>Tổng thanh toán</span>
                  <span>{formatVND(totalDue)}</span>
                </div>
              </div>

              <div className={styles.actions}>
                {fulfillmentType === 'DELIVERY' && (
                  <div className={styles.shipNoticeFooter}>
                    🛵 Phí ship sẽ được quán kiểm tra khoảng cách và báo lại qua SĐT / Zalo khi nhận đơn.
                  </div>
                )}
                <button
                  type="button"
                  className={styles.sendBtn}
                  onClick={handleSendOrder}
                  id="cart-send-order-btn"
                >
                  <CheckCircleIcon size={19} />
                  <span>Xác Nhận Đặt Đơn</span>
                </button>
                <button type="button" className={styles.clearBtn} onClick={clearCart}>
                  Xóa toàn bộ giỏ hàng
                </button>
              </div>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
