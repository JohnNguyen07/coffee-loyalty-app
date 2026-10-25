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
              <strong>Ủ LAB REWARDS</strong> · Hoàn tiền 3% – 10% mọi ly nước &amp; tặng 10.000đ thành viên mới
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
                Thực đơn
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
            {/* Fanpage Link */}
            <a
              href={facebookUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.fbBtn}
              aria-label="Facebook Fanpage Ủ LAB"
              title="Fanpage Facebook Ủ LAB"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
              <span className={styles.fbBtnLabel}>Fanpage</span>
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
            Thực đơn
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
