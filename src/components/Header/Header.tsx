'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import styles from './Header.module.css';
import { useCartStore } from '@/store/cart';
import { useAuth } from '@/hooks/useAuth';
import { formatVND } from '@/data/menu';

interface HeaderProps {
  onCartClick: () => void;
  onProfileClick: () => void;
}

const tierIcons: Record<string, string> = {
  MEMBER: '🌱',
  SILVER: '🥈',
  GOLD: '🥇',
  DIAMOND: '💎',
};

export default function Header({ onCartClick, onProfileClick }: HeaderProps) {
  const pathname = usePathname();
  const itemCount = useCartStore((s) => s.getItemCount());
  const { profile } = useAuth();
  const [bouncing, setBouncing] = useState(false);
  const [prevCount, setPrevCount] = useState(0);

  useEffect(() => {
    if (itemCount > prevCount && itemCount > 0) {
      setBouncing(true);
      const timer = setTimeout(() => setBouncing(false), 400);
      return () => clearTimeout(timer);
    }
    setPrevCount(itemCount);
  }, [itemCount, prevCount]);

  const tierCode = profile?.tier?.code || 'SILVER';
  const tierIcon = tierIcons[tierCode] || '🌱';
  const facebookUrl = process.env.NEXT_PUBLIC_FACEBOOK_PAGE_URL || 'https://www.facebook.com/p/%E1%BB%A6-LAB-61595629718216/';

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.logo}>
          <div className={styles.logoWrap}>
            <Image
              src="/logo.png"
              alt="Ủ LAB Logo"
              width={34}
              height={34}
              className={styles.logoImg}
              priority
            />
          </div>
          <span className={styles.logoText}>Ủ LAB</span>
        </Link>

        {/* Center navigation */}
        <nav className={styles.nav}>
          <Link
            href="/"
            className={`${styles.navLink} ${pathname === '/' ? styles.navActive : ''}`}
          >
            Menu
          </Link>
          <Link
            href="/scan"
            className={`${styles.navLink} ${pathname === '/scan' ? styles.navActive : ''}`}
          >
            Quét QR Tích Điểm
          </Link>
        </nav>

        <div className={styles.actions}>
          {/* Facebook Fanpage link */}
          <a
            href={facebookUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.fbBtn}
            aria-label="Facebook Fanpage Ủ LAB"
            title="Fanpage Facebook Ủ LAB"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
          </a>

          {/* User profile / tier chip */}
          <button
            className={styles.tierChip}
            onClick={onProfileClick}
            aria-label="Tài khoản & điểm thưởng"
            id="header-profile-btn"
          >
            <span className={styles.tierChipIcon}>{profile ? tierIcon : '👤'}</span>
            <span className={styles.tierChipText}>
              {profile ? (
                <>
                  {profile.tier?.name || 'Member'}
                  <strong className={styles.tierChipPoints}> · {formatVND(profile.point_balance || 0)}</strong>
                </>
              ) : (
                'Đăng nhập'
              )}
            </span>
          </button>

          {/* Cart trigger */}
          <button
            className={`${styles.cartBtn} ${bouncing ? styles.bouncing : ''}`}
            onClick={onCartClick}
            aria-label="Giỏ hàng"
            id="header-cart-btn"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
            {itemCount > 0 && (
              <span className={styles.badge}>{itemCount}</span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}

