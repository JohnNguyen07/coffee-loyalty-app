'use client';

import { useRef, useEffect, useState } from 'react';
import styles from './CategoryTabs.module.css';
import { MenuCategory } from '@/data/menu';

interface CategoryTabsProps {
  categories: MenuCategory[];
  activeSlug: string;
  onSelect: (slug: string) => void;
}

export default function CategoryTabs({ categories, activeSlug, onSelect }: CategoryTabsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);

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
    // Scroll the active tab into view
    const activeEl = document.getElementById(`tab-${slug}`);
    activeEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  };

  return (
    <div className={styles.wrapper}>
      {showLeftFade && <div className={styles.fadeLeft} />}
      {showRightFade && <div className={styles.fadeRight} />}
      <div className={styles.scroll} ref={scrollRef} role="tablist">
        {categories.map((cat) => (
          <button
            key={cat.slug}
            id={`tab-${cat.slug}`}
            role="tab"
            aria-selected={activeSlug === cat.slug}
            className={`${styles.tab} ${activeSlug === cat.slug ? styles.active : ''}`}
            onClick={() => handleSelect(cat.slug)}
          >
            <span className={styles.tabIcon}>{cat.icon}</span>
            <span className={styles.tabLabel}>{cat.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
