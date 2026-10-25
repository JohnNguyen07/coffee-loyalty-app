'use client';

import { useState } from 'react';
import Image from 'next/image';
import styles from './page.module.css';
import { menuData } from '@/data/menu';
import Header from '@/components/Header/Header';
import CategoryTabs from '@/components/CategoryTabs/CategoryTabs';
import MenuCard from '@/components/MenuCard/MenuCard';
import CartDrawer from '@/components/CartDrawer/CartDrawer';
import ProfilePanel from '@/components/ProfilePanel/ProfilePanel';
import FloatingCartBar from '@/components/FloatingCartBar/FloatingCartBar';

export default function Home() {
  const [activeCategory, setActiveCategory] = useState(menuData[0].slug);
  const [cartOpen, setCartOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const currentCategory = menuData.find((c) => c.slug === activeCategory) || menuData[0];

  return (
    <div className={styles.page}>
      <Header
        onCartClick={() => setCartOpen(true)}
        onProfileClick={() => setProfileOpen(true)}
      />

      <main className={styles.main}>
        {/* Hero section */}
        <section className={styles.hero}>
          <div className={styles.heroContent}>
            <h1 className={styles.heroTitle}>
              Matcha & Cold Brew
            </h1>
            <p className={styles.heroSubtitle}>
              Thức uống thủ công, chọn ngay · giao nhanh
            </p>
          </div>
          <div className={styles.heroDecor}>
            <span className={styles.heroEmoji}>🍵</span>
          </div>
        </section>

        {/* Category tabs */}
        <CategoryTabs
          categories={menuData}
          activeSlug={activeCategory}
          onSelect={setActiveCategory}
        />

        {/* Category title */}
        <div className={styles.categoryHeader}>
          <h2 className={styles.categoryTitle}>
            <span className={styles.categoryIcon}>{currentCategory.icon}</span>
            {currentCategory.name}
          </h2>
          <span className={styles.categoryCount}>
            {currentCategory.items.length} món
          </span>
        </div>

        {/* Menu grid */}
        <div className={styles.menuGrid} key={activeCategory}>
          {currentCategory.items.map((item, index) => (
            <MenuCard key={item.id} item={item} index={index} />
          ))}
        </div>

        {/* Footer */}
        <footer className={styles.footer}>
          <div className={styles.footerBrand}>
            <div className={styles.footerLogoWrap}>
              <Image
                src="/logo.png"
                alt="Ủ LAB Logo"
                width={40}
                height={40}
                className={styles.footerLogoImg}
              />
            </div>
            <div>
              <div className={styles.footerTitle}>Ủ LAB</div>
              <div className={styles.footerSubtitle}>Matcha & Cold Brew Thủ Công</div>
            </div>
          </div>

          <div className={styles.footerLinks}>
            <a
              href={process.env.NEXT_PUBLIC_FACEBOOK_SHARE_URL || "https://www.facebook.com/share/1PhbkgjNBD/?mibextid=wwXIfr"}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.footerSocialBtn}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
              Facebook Fanpage
            </a>

            <a
              href="https://m.me/61595629718216"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.footerSocialBtn}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.477 2 2 6.145 2 11.258c0 2.91 1.455 5.513 3.738 7.202V22l3.376-1.853c.913.253 1.884.39 2.886.39 5.523 0 10-4.145 10-9.279C22 6.145 17.523 2 12 2zm1.066 12.477l-2.545-2.715-4.968 2.715 5.464-5.803 2.607 2.715 4.906-2.715-5.464 5.803z"/>
              </svg>
              Nhắn tin đặt hàng
            </a>
          </div>

          <p className={styles.footerCopy}>
            © {new Date().getFullYear()} Ủ LAB. Đặt món take-away và tích điểm hoàn tiền tự động.
          </p>
        </footer>
      </main>

      {/* Floating cart bar (mobile) */}
      <FloatingCartBar onClick={() => setCartOpen(true)} />

      {/* Cart drawer */}
      <CartDrawer isOpen={cartOpen} onClose={() => setCartOpen(false)} />

      {/* Profile panel */}
      <ProfilePanel isOpen={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  );
}
