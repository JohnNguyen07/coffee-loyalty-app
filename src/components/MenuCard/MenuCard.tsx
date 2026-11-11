'use client';

import { useState, useRef } from 'react';
import styles from './MenuCard.module.css';
import {
  MenuItem,
  MENU_ADDONS,
  MILK_OPTIONS,
  type MilkOption,
  formatVND,
} from '@/data/menu';
import { useCartStore } from '@/store/cart';
import {
  DrinkIllustration,
  CupSizeIcon,
  StarSolidIcon,
} from '@/components/Icons/LabIcons';

interface MenuCardProps {
  item: MenuItem;
  index: number;
}

export default function MenuCard({ item, index }: MenuCardProps) {
  const [selectedSize, setSelectedSize] = useState(0);
  const [selectedMilk, setSelectedMilk] = useState<MilkOption>('Sữa thanh trùng');
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const addItem = useCartStore((s) => s.addItem);
  const cardRef = useRef<HTMLDivElement>(null);

  const isBottled =
    item.categorySlug === 'cold-brew-chai' ||
    item.sizes[selectedSize]?.label === 'Chai';

  const basePrice = item.sizes[selectedSize]?.price || item.sizes[0].price;
  const addonTotal = isBottled
    ? 0
    : selectedAddons.reduce((sum, id) => {
        const found = MENU_ADDONS.find((a) => a.id === id);
        return sum + (found ? found.price : 0);
      }, 0);
  const currentPrice = basePrice + addonTotal;
  const estimatedCashback = Math.round(currentPrice * 0.05);

  const toggleAddon = (addonId: string) => {
    setSelectedAddons((prev) =>
      prev.includes(addonId) ? prev.filter((id) => id !== addonId) : [...prev, addonId]
    );
  };

  const handleAdd = () => {
    addItem(item, selectedSize, {
      milkOption: item.hasMilkChoice ? selectedMilk : undefined,
      addons: isBottled ? [] : selectedAddons,
    });
    setIsAdding(true);
    setTimeout(() => setIsAdding(false), 650);
  };

  const getCategoryClass = () => {
    if (item.categorySlug === 'matcha') return styles.matcha;
    if (item.categorySlug === 'cold-brew') return styles.coldBrew;
    return styles.cannedBrew;
  };

  const badgeText = item.badgeLabel || (item.tag === 'Special' ? 'Special' : 'Signature');

  return (
    <article
      ref={cardRef}
      className={`${styles.card} ${getCategoryClass()}`}
      style={{ animationDelay: `${index * 50}ms` }}
      id={`menu-card-${item.id}`}
    >
      {/* Studio Product Photography / Illustration Area */}
      <div className={styles.imageArea}>
        <div className={styles.illustrationWrap}>
          <DrinkIllustration
            itemId={item.id}
            categorySlug={item.categorySlug}
            className={styles.drinkSvg}
          />
        </div>

        {/* Top Badges */}
        <div className={styles.topBadges}>
          {item.isSignature ? (
            <span className={styles.signatureBadge}>
              <StarSolidIcon size={11} />
              <span>{badgeText}</span>
            </span>
          ) : item.tag ? (
            <span className={styles.craftTag}>{item.tag}</span>
          ) : null}

          <span className={styles.rewardsPill} title="Hoàn điểm tích lũy thành viên">
            +{formatVND(estimatedCashback)} ★
          </span>
        </div>

        {item.shelfLife && (
          <span className={styles.shelfBadge}>Bảo quản lạnh: {item.shelfLife}</span>
        )}
      </div>

      {/* Card Body */}
      <div className={styles.content}>
        <div className={styles.headerInfo}>
          <h3 className={styles.name}>{item.name}</h3>
          {item.description && (
            <p className={styles.description}>{item.description}</p>
          )}
        </div>

        {/* Starbucks PDP Style Cup Size Selector */}
        <div className={styles.sizeRow} role="group" aria-label={`Chọn kích cỡ cho ${item.name}`}>
          {item.sizes.map((size, i) => {
            const isSelected = selectedSize === i;
            const cleanLabel = size.label.replace(/\(|\)/g, '').replace('Lon ', '');
            const displaySize =
              cleanLabel === 'M'
                ? 'Size M'
                : cleanLabel === 'L'
                  ? 'Size L'
                  : cleanLabel === 'Chai'
                    ? 'Chai đóng sẵn'
                    : cleanLabel;

            return (
              <button
                type="button"
                key={size.label}
                className={`${styles.sizeBtn} ${isSelected ? styles.sizeActive : ''}`}
                onClick={() => setSelectedSize(i)}
                aria-pressed={isSelected}
              >
                <span className={styles.cupIconRing}>
                  <CupSizeIcon sizeLabel={cleanLabel} active={isSelected} />
                </span>
                <span className={styles.sizeMeta}>
                  <span className={styles.sizeLabelText}>{displaySize}</span>
                  <span className={styles.sizeSubPrice}>{formatVND(size.price)}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Free Milk Switch for Designated Matcha Items */}
        {!isBottled && item.hasMilkChoice && (
          <div className={styles.customGroup}>
            <span className={styles.customLabel}>Tùy chọn sữa (Miễn phí):</span>
            <div className={styles.customPills}>
              {MILK_OPTIONS.map((milk) => {
                const active = selectedMilk === milk;
                return (
                  <button
                    key={milk}
                    type="button"
                    className={`${styles.customPill} ${active ? styles.customPillActive : ''}`}
                    onClick={() => setSelectedMilk(milk)}
                    aria-pressed={active}
                  >
                    {active ? `✓ ${milk}` : milk}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Add-ons (+ Kem Béo / + 1g Matcha Fuji — Đồng giá 5.000đ) */}
        {!isBottled && (
          <div className={styles.customGroup}>
            <span className={styles.customLabel}>Lựa chọn thêm (+5.000đ):</span>
            <div className={styles.customPills}>
              {MENU_ADDONS.map((addon) => {
                const active = selectedAddons.includes(addon.id);
                return (
                  <button
                    key={addon.id}
                    type="button"
                    className={`${styles.customPill} ${active ? styles.customPillActive : ''}`}
                    onClick={() => toggleAddon(addon.id)}
                    aria-pressed={active}
                  >
                    {active ? `✓ +${addon.name}` : `+ ${addon.name}`}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Price & Pill CTA Footer */}
        <div className={styles.footer}>
          <div className={styles.priceBlock}>
            <span className={styles.priceLabel}>
              {addonTotal > 0 ? `Giá (+${formatVND(addonTotal)} thêm)` : 'Giá bán'}
            </span>
            <span className={styles.price}>{formatVND(currentPrice)}</span>
          </div>

          <button
            type="button"
            className={`${styles.addBtn} ${isAdding ? styles.adding : ''}`}
            onClick={handleAdd}
            aria-label={`Thêm ${item.name} (${item.sizes[selectedSize]?.label}) vào giỏ hàng`}
          >
            {isAdding ? (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Đã thêm</span>
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>Thêm món</span>
              </>
            )}
          </button>
        </div>
      </div>
    </article>
  );
}
