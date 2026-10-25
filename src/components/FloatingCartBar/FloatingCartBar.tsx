'use client';

import styles from './FloatingCartBar.module.css';
import { useCartStore } from '@/store/cart';
import { formatVND } from '@/data/menu';
import { ShoppingBagIcon } from '@/components/Icons/LabIcons';

interface FloatingCartBarProps {
  onClick: () => void;
}

export default function FloatingCartBar({ onClick }: FloatingCartBarProps) {
  const itemCount = useCartStore((s) => s.getItemCount());
  const subtotal = useCartStore((s) => s.getSubtotal());

  // When cart is empty, show the signature Starbucks 56px circular "Frap" floating button
  if (itemCount === 0) {
    return (
      <button
        type="button"
        className={styles.frapCircle}
        onClick={onClick}
        aria-label="Mở giỏ hàng đặt món"
        title="Giỏ hàng Ủ LAB"
        id="floating-frap-btn"
      >
        <ShoppingBagIcon size={24} />
      </button>
    );
  }

  return (
    <button
      type="button"
      className={styles.bar}
      onClick={onClick}
      id="floating-cart-bar"
      aria-label={`Xem giỏ hàng: ${itemCount} món, tổng cộng ${formatVND(subtotal)}`}
    >
      <div className={styles.frapIconWrap}>
        <ShoppingBagIcon size={20} />
        <span className={styles.badge}>{itemCount}</span>
      </div>
      <div className={styles.meta}>
        <span className={styles.label}>Xem đơn đặt hàng</span>
        <span className={styles.subLabel}>{itemCount} món đã chọn</span>
      </div>
      <span className={styles.total}>{formatVND(subtotal)}</span>
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={styles.arrow}
        aria-hidden="true"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </button>
  );
}
