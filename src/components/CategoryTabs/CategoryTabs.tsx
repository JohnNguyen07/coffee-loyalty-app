'use client';

import { useRef, useEffect, useState } from 'react';
import styles from './CategoryTabs.module.css';
import { MenuCategory } from '@/data/menu';
import { CategorySvgIcon, SparkleIcon } from '@/components/Icons/LabIcons';

interface CategoryTabsProps {
  categories: MenuCategory[];
  activeSlug: string;
  onSelect: (slug: string) => void;
  showAllOption?: boolean;
}

export default function CategoryTabs({
  categories,
  activeSlug,
  onSelect,
  showAllOption = true,
}: CategoryTabsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);

  const totalItems = categories.reduce((sum, cat) => sum + cat.items.length, 0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const check = () => {
      setShowLeftFade(el.scrollLeft > 4);
      setShowRightFade(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
    };

    check();
    el.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    return () => {
      el.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    };
  }, []);

  const handleSelect = (slug: string) => {
    onSelect(slug);
    const activeEl = document.getElementById(`tab-${slug}`);
    activeEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  };

  return (
    <div className={styles.wrapper}>
      {showLeftFade && <div className={styles.fadeLeft} aria-hidden="true" />}
      {showRightFade && <div className={styles.fadeRight} aria-hidden="true" />}
      <div className={styles.scroll} ref={scrollRef} role="tablist" aria-label="Danh mục thực đơn">
        {showAllOption && (
          <button
            type="button"
            id="tab-all"
            role="tab"
            aria-selected={activeSlug === 'all'}
            className={`${styles.tab} ${activeSlug === 'all' ? styles.active : ''}`}
            onClick={() => handleSelect('all')}
          >
            <span className={styles.tabIcon}>
              <SparkleIcon size={16} />
            </span>
            <span className={styles.tabLabel}>Tất cả món</span>
            <span className={styles.tabCount}>{totalItems}</span>
          </button>
        )}
        {categories.map((cat) => (
          <button
            type="button"
            key={cat.slug}
            id={`tab-${cat.slug}`}
            role="tab"
            aria-selected={activeSlug === cat.slug}
            className={`${styles.tab} ${activeSlug === cat.slug ? styles.active : ''}`}
            onClick={() => handleSelect(cat.slug)}
          >
            <span className={styles.tabIcon}>
              <CategorySvgIcon slug={cat.slug} size={17} />
            </span>
            <span className={styles.tabLabel}>{cat.name}</span>
            <span className={styles.tabCount}>{cat.items.length}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
