'use client';

import styles from './FloatingCartBar.module.css';
import { useCartStore } from '@/store/cart';
import { formatVND } from '@/data/menu';

interface FloatingCartBarProps {
  onClick: () => void;
}

export default function FloatingCartBar({ onClick }: FloatingCartBarProps) {
  const itemCount = useCartStore((s) => s.getItemCount());
  const subtotal = useCartStore((s) => s.getSubtotal());

  if (itemCount === 0) return null;

  return (
    <button className={styles.bar} onClick={onClick} id="floating-cart-bar">
      <div className={styles.left}>
        <span className={styles.badge}>{itemCount}</span>
        <span className={styles.label}>Giỏ hàng</span>
      </div>
      <span className={styles.total}>{formatVND(subtotal)}</span>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={styles.arrow}>
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </button>
  );
}
