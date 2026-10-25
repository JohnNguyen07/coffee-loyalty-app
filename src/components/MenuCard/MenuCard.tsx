'use client';

import { useState, useRef } from 'react';
import styles from './MenuCard.module.css';
import { MenuItem, formatVND } from '@/data/menu';
import { useCartStore } from '@/store/cart';

interface MenuCardProps {
  item: MenuItem;
  index: number;
}

export default function MenuCard({ item, index }: MenuCardProps) {
  const [selectedSize, setSelectedSize] = useState(0);
  const [isAdding, setIsAdding] = useState(false);
  const addItem = useCartStore((s) => s.addItem);
  const cardRef = useRef<HTMLDivElement>(null);

  const handleAdd = () => {
    addItem(item, selectedSize);
    setIsAdding(true);
    setTimeout(() => setIsAdding(false), 500);
  };

  // Get category-specific gradient class
  const getCategoryClass = () => {
    if (item.categorySlug === 'matcha') return styles.matcha;
    if (item.categorySlug === 'cold-brew') return styles.coldBrew;
    return styles.cannedBrew;
  };

  // Get category icon for product image placeholder
  const getCategoryEmoji = () => {
    if (item.categorySlug === 'matcha') return '🍵';
    if (item.categorySlug === 'cold-brew') return '🧊';
    return '🍾';
  };

  return (
    <div
      ref={cardRef}
      className={`${styles.card} ${getCategoryClass()}`}
      style={{ animationDelay: `${index * 60}ms` }}
      id={`menu-card-${item.id}`}
    >
      <div className={styles.imageArea}>
        <span className={styles.emoji}>{getCategoryEmoji()}</span>
        {item.isSignature && (
          <span className={styles.signatureBadge}>Signature</span>
        )}
        {item.shelfLife && (
          <span className={styles.shelfBadge}>{item.shelfLife}</span>
        )}
      </div>

      <div className={styles.content}>
        <h3 className={styles.name}>{item.name}</h3>

        <div className={styles.sizeRow}>
          {item.sizes.map((size, i) => (
            <button
              key={size.label}
              className={`${styles.sizeBtn} ${selectedSize === i ? styles.sizeActive : ''}`}
              onClick={() => setSelectedSize(i)}
              aria-pressed={selectedSize === i}
            >
              {size.label.replace(/\(|\)/g, '').replace('Lon ', '')}
            </button>
          ))}
        </div>

        <div className={styles.footer}>
          <span className={styles.price}>
            {formatVND(item.sizes[selectedSize].price)}
          </span>
          <button
            className={`${styles.addBtn} ${isAdding ? styles.adding : ''}`}
            onClick={handleAdd}
            aria-label={`Thêm ${item.name} vào giỏ`}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
