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

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

interface OrderSuccessInfo {
  code: string;
  text: string;
  messengerUrl: string;
  webMessengerUrl: string;
  pageUrl: string;
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

  const [customerName, setCustomerName] = useState(profile?.full_name || '');
  const [customerPhone, setCustomerPhone] = useState(profile?.phone || '');
  const [customerNote, setCustomerNote] = useState('');
  const [orderSuccess, setOrderSuccess] = useState<OrderSuccessInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

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

  const handleSendOrder = async () => {
    if (items.length === 0) return;

    const orderCode = `ULAB-${Math.floor(1000 + Math.random() * 9000)}`;

    const orderItemsText = items
      .map(
        (ci: CartItem) =>
          `• ${ci.quantity}x ${ci.menuItem.name} (${ci.sizeLabel}) - ${formatVND(ci.price * ci.quantity)}`
      )
      .join('\n');

    const customerInfo = `${customerName ? customerName.trim() : 'Khách đặt món'}${customerPhone ? ` - ${customerPhone.trim()}` : ''}`;
    const tierInfo = profile?.tier?.name
      ? `${profile.tier.name} (Hoàn ${profile.tier.cashback_rate}%)`
      : null;

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} - ${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

    const fullText = [
      `🧪 Ủ LAB - ĐƠN ĐẶT HÀNG [#${orderCode}]`,
      `👤 Khách hàng: ${customerInfo}`,
      tierInfo ? `⭐ Hạng thành viên: ${tierInfo}` : null,
      `---------------------------------`,
      orderItemsText,
      `---------------------------------`,
      `💰 Tạm tính: ${formatVND(subtotal)}`,
      pointsToUse > 0 ? `🎁 Giảm từ điểm ví: -${formatVND(pointsToUse)}` : null,
      `👉 TỔNG THANH TOÁN: ${formatVND(totalDue)}`,
      customerNote ? `📝 Ghi chú: ${customerNote.trim()}` : null,
      `---------------------------------`,
      `⏰ Thời gian: ${timeStr}`,
      `📍 Đặt từ: Website Ủ LAB`,
    ]
      .filter(Boolean)
      .join('\n');

    // Start copying and open Messenger synchronously inside the click gesture,
    // otherwise browsers block the popup after an `await`.
    // Note: Facebook ignores `?text=` on m.me page links, so the clipboard is the
    // reliable way to hand the order text to the user (they paste it into the chat).
    const copyPromise = copyToClipboard(fullText);
    const messengerUrl = `https://m.me/${FANPAGE_ID}?ref=${orderCode}`;
    const webMessengerUrl = `https://www.facebook.com/messages/t/${FANPAGE_ID}`;
    window.open(messengerUrl, '_blank');

    const copyOk = await copyPromise;
    setCopied(copyOk);

    if (pointsToUse > 0) {
      spendPoints(pointsToUse, orderCode);
    }

    if (profile) {
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
          note: customerNote,
        }),
      }).catch((err) => console.warn('Order DB sync:', err));
    }


    setOrderSuccess({
      code: orderCode,
      text: fullText,
      messengerUrl,
      webMessengerUrl,
      pageUrl: FACEBOOK_PAGE_URL,
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
            <h3 className={styles.successTitle}>Đã tạo đơn #{orderSuccess.code}</h3>
            <p className={styles.successDesc}>
              Đang chuyển sang Facebook Messenger để gửi đơn đến quầy pha chế <strong>Ủ LAB</strong>.
            </p>

            <div className={styles.clipTipBox}>
              <StarSolidIcon size={15} className={styles.clipTipIcon} />
              <p className={styles.clipTipText}>
                Nội dung đơn đã được <strong>sao chép tự động</strong>. Nếu hộp thoại Messenger chưa tự điền, bạn chỉ cần nhấn <strong>Dán (Paste / Ctrl+V)</strong> và gửi!
              </p>
            </div>

            <div className={styles.successActions}>
              <a
                href={orderSuccess.messengerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.openMessengerBtn}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 2C6.477 2 2 6.145 2 11.258c0 2.91 1.455 5.513 3.738 7.202V22l3.376-1.853c.913.253 1.884.39 2.886.39 5.523 0 10-4.145 10-9.279C22 6.145 17.523 2 12 2zm1.066 12.477l-2.545-2.715-4.968 2.715 5.464-5.803 2.607 2.715 4.906-2.715-5.464 5.803z" />
                </svg>
                <span>Mở Messenger gửi Ủ LAB</span>
              </a>

              <a
                href={orderSuccess.webMessengerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.openWebBtn}
              >
                <span>Mở hộp thư Facebook Web</span>
              </a>

              <button type="button" className={styles.copyBtn} onClick={handleCopyAgain}>
                {copied ? '✓ Đã sao chép nội dung đơn!' : 'Sao chép lại nội dung đơn'}
              </button>

              <button
                type="button"
                className={styles.previewToggleBtn}
                onClick={() => setShowPreview(!showPreview)}
              >
                {showPreview ? 'Ẩn xem trước tin nhắn ▲' : 'Xem chi tiết nội dung đơn ▼'}
              </button>

              {showPreview && (
                <pre className={styles.messagePreview}>{orderSuccess.text}</pre>
              )}

              <button type="button" className={styles.doneBtn} onClick={onClose}>
                Đóng &amp; Tiếp tục chọn món
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
              Khám phá thực đơn Matcha Uji và Cold Brew ủ lạnh 18 giờ để bắt đầu đặt món.
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
                    <div className={styles.itemMain}>
                      <div className={styles.itemTopRow}>
                        <span className={styles.itemName}>{ci.menuItem.name}</span>
                        <button
                          type="button"
                          className={styles.removeBtn}
                          onClick={() => removeItem(ci.menuItem.id, ci.sizeIndex)}
                          aria-label={`Xóa ${ci.menuItem.name}`}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </div>
                      <span className={styles.itemSizeBadge}>Cỡ: {ci.sizeLabel}</span>

                      <div className={styles.itemBottomRow}>
                        {/* Starbucks PDP Circular Numeric Stepper */}
                        <div className={styles.qtyControl}>
                          <button
                            type="button"
                            className={styles.qtyBtn}
                            onClick={() =>
                              updateQuantity(ci.menuItem.id, ci.sizeIndex, ci.quantity - 1)
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
                              updateQuantity(ci.menuItem.id, ci.sizeIndex, ci.quantity + 1)
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

              {/* Customer Info & Customization Notes */}
              <div className={styles.customerForm}>
                <span className={styles.sectionSmallTitle}>THÔNG TIN &amp; TÙY CHỈNH KHẨU VỊ</span>
                <div className={styles.formRow}>
                  <input
                    type="text"
                    placeholder="Tên của bạn (VD: Minh)"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className={styles.formInput}
                    aria-label="Tên khách hàng"
                  />
                  <input
                    type="tel"
                    placeholder="Số điện thoại"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className={styles.formInput}
                    aria-label="Số điện thoại"
                  />
                </div>
                <input
                  type="text"
                  placeholder="Ghi chú: Ít ngọt, đá riêng, giao giờ nghỉ trưa..."
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
                <button
                  type="button"
                  className={styles.sendBtn}
                  onClick={handleSendOrder}
                  id="cart-send-order-btn"
                >
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 2C6.477 2 2 6.145 2 11.258c0 2.91 1.455 5.513 3.738 7.202V22l3.376-1.853c.913.253 1.884.39 2.886.39 5.523 0 10-4.145 10-9.279C22 6.145 17.523 2 12 2zm1.066 12.477l-2.545-2.715-4.968 2.715 5.464-5.803 2.607 2.715 4.906-2.715-5.464 5.803z" />
                  </svg>
                  <span>Đặt món qua Messenger</span>
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
