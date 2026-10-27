'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import styles from './Header.module.css';
import { useCartStore } from '@/store/cart';
import { useAuth } from '@/hooks/useAuth';
import { formatVND } from '@/data/menu';
import {
  StarSolidIcon,
  ShoppingBagIcon,
  UserIcon,
  TierSvgIcon,
} from '@/components/Icons/LabIcons';

interface HeaderProps {
  onCartClick?: () => void;
  onProfileClick?: () => void;
}

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

  const tierCode = profile?.tier?.code || 'MEMBER';
  const facebookUrl =
    process.env.NEXT_PUBLIC_FACEBOOK_PAGE_URL ||
    'https://www.facebook.com/p/%E1%BB%A6-LAB-61595629718216/';
  const instagramUrl =
    process.env.NEXT_PUBLIC_INSTAGRAM_URL ||
    'https://www.instagram.com/ulab.contact.gmail.com2026/';
  const tiktokUrl =
    process.env.NEXT_PUBLIC_TIKTOK_URL ||
    'https://www.tiktok.com/@ulabcoffee0';

  return (
    <header className={styles.headerWrapper}>
      {/* Starbucks House Green Top Rewards Strip */}
      <div className={styles.rewardsStrip}>
        <div className={styles.rewardsStripInner}>
          <div className={styles.rewardsStripLeft}>
            <span className={styles.goldStarBadge} aria-hidden="true">
              <StarSolidIcon size={12} />
            </span>
            <span className={styles.rewardsStripText}>
              <strong>THÔNG BÁO:</strong> Chương trình tích điểm thành viên sẽ chính thức bắt đầu từ <strong>ngày 9</strong> · Hoàn điểm 3% – 10% mọi ly nước &amp; tặng 10.000đ thành viên mới
            </span>
          </div>
          <div className={styles.rewardsStripRight}>
            <a href="#rewards-ceremony" className={styles.stripActionLink}>
              <StarSolidIcon size={12} />
              <span>Cơ chế tích điểm 4 hạng</span>
            </a>
            {!profile && (
              <Link href="/register" className={styles.stripJoinPill}>
                Tham gia ngay
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Main Sticky Global Navigation */}
      <div className={styles.globalNav}>
        <div className={styles.inner}>
          <div className={styles.leftCluster}>
            <Link href="/" className={styles.logo}>
              <div className={styles.logoWrap}>
                <Image
                  src="/logo-mark.png"
                  alt="Ủ LAB Logo"
                  width={40}
                  height={40}
                  className={styles.logoImg}
                  priority
                />
              </div>
              <div className={styles.logoBrand}>
                <span className={styles.logoText}>Ủ LAB</span>
                <span className={styles.logoTagline}>MATCHA &amp; COLD BREW</span>
              </div>
            </Link>

            {/* Primary Navigation Links */}
            <nav className={styles.nav} aria-label="Điều hướng chính">
              <Link
                href="/"
                className={`${styles.navLink} ${pathname === '/' ? styles.navActive : ''}`}
              >
                Menu
              </Link>
              {pathname === '/' && (
                <a href="#rewards-ceremony" className={styles.navLink}>
                  <StarSolidIcon size={13} className={styles.navGoldStar} />
                  <span>Ưu đãi Thành viên</span>
                </a>
              )}
              {profile?.role === 'ADMIN' && (
                <Link
                  href="/admin"
                  className={`${styles.navLink} ${pathname.startsWith('/admin') ? styles.navActive : ''}`}
                >
                  Quản trị POS
                </Link>
              )}
            </nav>
          </div>

          <div className={styles.actions}>
            {/* Fanpage, Instagram & TikTok Links */}
            <a
              href={facebookUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.fbBtn}
              aria-label="Facebook Fanpage Ủ LAB"
              title="Fanpage Facebook Ủ LAB"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
              <span className={styles.fbBtnLabel}>Fanpage</span>
            </a>

            <a
              href={instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`${styles.fbBtn} ${styles.igBtn}`}
              aria-label="Instagram Ủ LAB"
              title="Instagram Ủ LAB"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
              </svg>
              <span className={styles.fbBtnLabel}>Instagram</span>
            </a>

            <a
              href={tiktokUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`${styles.fbBtn} ${styles.ttBtn}`}
              aria-label="TikTok Ủ LAB"
              title="TikTok Ủ LAB"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
              </svg>
              <span className={styles.fbBtnLabel}>TikTok</span>
            </a>

            {/* User Profile / Rewards Tier Pill */}
            {onProfileClick ? (
              <button
                type="button"
                className={`${styles.tierChip} ${profile ? styles.tierChipMember : ''}`}
                onClick={onProfileClick}
                aria-label="Tài khoản & điểm thưởng"
                id="header-profile-btn"
              >
                <span className={styles.tierChipIcon}>
                  {profile ? <TierSvgIcon code={tierCode} size={15} /> : <UserIcon size={15} />}
                </span>
                <span className={styles.tierChipText}>
                  {profile ? (
                    <>
                      <span className={styles.tierNameText}>{profile.tier?.name || 'Member'}</span>
                      <strong className={styles.tierChipPoints}>
                        {formatVND(profile.point_balance || 0)}
                      </strong>
                    </>
                  ) : (
                    'Đăng nhập'
                  )}
                </span>
              </button>
            ) : (
              <Link
                href={profile ? '/' : '/login'}
                className={`${styles.tierChip} ${profile ? styles.tierChipMember : ''}`}
              >
                <span className={styles.tierChipIcon}>
                  {profile ? <TierSvgIcon code={tierCode} size={15} /> : <UserIcon size={15} />}
                </span>
                <span className={styles.tierChipText}>
                  {profile ? formatVND(profile.point_balance || 0) : 'Đăng nhập'}
                </span>
              </Link>
            )}

            {/* Cart Trigger Pill */}
            {onCartClick && (
              <button
                type="button"
                className={`${styles.cartBtn} ${itemCount > 0 ? styles.cartBtnActive : ''} ${bouncing ? styles.bouncing : ''}`}
                onClick={onCartClick}
                aria-label={`Giỏ hàng (${itemCount} món)`}
                id="header-cart-btn"
              >
                <ShoppingBagIcon size={19} />
                {itemCount > 0 && <span className={styles.badge}>{itemCount}</span>}
              </button>
            )}
          </div>
        </div>

        {/* Mobile Sub-Navigation Bar (Ensures >=44px touch targets on mobile) */}
        <nav className={styles.mobileSubNav} aria-label="Điều hướng di động">
          <Link
            href="/"
            className={`${styles.mobileNavLink} ${pathname === '/' ? styles.mobileNavActive : ''}`}
          >
            Menu
          </Link>
          <a href="#rewards-ceremony" className={styles.mobileNavLink}>
            <StarSolidIcon size={13} className={styles.navGoldStar} />
            <span>Ủ LAB Rewards</span>
          </a>
          {onProfileClick ? (
            <button
              type="button"
              onClick={onProfileClick}
              className={styles.mobileNavLink}
            >
              <span>Ví điểm thưởng</span>
            </button>
          ) : (
            <Link href="/register" className={styles.mobileNavLink}>
              <span>Nhận 10.000đ</span>
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
