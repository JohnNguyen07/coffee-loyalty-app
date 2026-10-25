'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import styles from './ProfilePanel.module.css';
import { formatVND } from '@/data/menu';
import { useAuth, TIERS_CONFIG } from '@/hooks/useAuth';
import {
  TierSvgIcon,
  StarSolidIcon,
  QrScanIcon,
  GiftIcon,
  ShoppingBagIcon,
} from '@/components/Icons/LabIcons';

interface ProfilePanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const NEXT_TIERS: Record<string, { code: string; name: string; min_spending: number }> = {
  MEMBER: { code: 'SILVER', name: 'Silver', min_spending: 500000 },
  SILVER: { code: 'GOLD', name: 'Gold', min_spending: 1250000 },
  GOLD: { code: 'DIAMOND', name: 'Diamond', min_spending: 6000000 },
};

export default function ProfilePanel({ isOpen, onClose }: ProfilePanelProps) {
  const router = useRouter();
  const { profile, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<'history' | 'policy'>('history');

  const isLoggedIn = Boolean(profile);

  const currentTierCode = (profile?.tier?.code || 'MEMBER').toUpperCase();
  const isDiamond = currentTierCode === 'DIAMOND';
  const nextTierInfo = isDiamond
    ? null
    : profile?.next_tier || NEXT_TIERS[currentTierCode] || NEXT_TIERS.MEMBER;

  const nextTierMin = nextTierInfo?.min_spending || 500000;
  const currentSpending = profile?.total_spending || 0;
  const progress = nextTierInfo
    ? Math.min(100, Math.max(0, (currentSpending / nextTierMin) * 100))
    : 100;
  const remaining = nextTierInfo ? Math.max(0, nextTierMin - currentSpending) : 0;

  const transactions = profile?.recent_transactions || [];

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleNavigate = (path: string) => {
    onClose();
    router.push(path);
  };

  return (
    <>
      <div
        className={`${styles.overlay} ${isOpen ? styles.open : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={`${styles.panel} ${isOpen ? styles.open : ''}`}
        role="dialog"
        aria-label="Tài khoản Ủ LAB Rewards"
      >
        <div className={styles.header}>
          <div className={styles.headerTitleWrap}>
            <span className={styles.headerStar}>
              <StarSolidIcon size={16} />
            </span>
            <div>
              <h2 className={styles.title}>Ủ LAB Rewards®</h2>
              <span className={styles.subtitle}>Thành viên &amp; Tích điểm hoàn tiền</span>
            </div>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Đóng bảng tài khoản"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className={styles.content}>
          {isLoggedIn && profile ? (
            <>
              {/* Starbucks House Green Member Status Card */}
              <div className={styles.memberHeroCard}>
                <div className={styles.userRow}>
                  <div className={styles.avatar}>
                    <span>{(profile.full_name || 'U').charAt(0).toUpperCase()}</span>
                  </div>
                  <div className={styles.userInfo}>
                    <span className={styles.userName}>{profile.full_name}</span>
                    <span className={styles.userEmail}>{profile.phone || profile.email}</span>
                  </div>
                  <div className={styles.tierBadge}>
                    <TierSvgIcon code={currentTierCode} size={14} />
                    <span>{profile.tier?.name || 'Member'}</span>
                  </div>
                </div>

                <div className={styles.pointsDivider} />

                <div className={styles.pointsTop}>
                  <div>
                    <span className={styles.pointsLabel}>Số dư ví thưởng</span>
                    <div className={styles.pointsValue}>
                      {formatVND(profile.point_balance || 0)}
                    </div>
                  </div>
                  <span className={styles.cashbackPill}>
                    Hoàn {profile.tier?.cashback_rate || 3}% / ly
                  </span>
                </div>
              </div>

              {/* Native Camera QR Hint */}
              <div className={styles.scanActionBtn} style={{ cursor: 'default' }}>
                <span className={styles.scanActionIcon}>
                  <QrScanIcon size={20} />
                </span>
                <div className={styles.actionText}>
                  <strong>Tích điểm bằng Camera điện thoại</strong>
                  <small>Quét mã QR dán trên ly nước để mở link nhận hoàn tiền tự động</small>
                </div>
              </div>

              {/* Tier Progression Card */}
              {!isDiamond && nextTierInfo ? (
                <div className={styles.progressCard}>
                  <div className={styles.progressHeader}>
                    <span className={styles.progressLabel}>
                      Tiến trình thăng hạng <strong>{nextTierInfo.name}</strong>
                    </span>
                    <span className={styles.progressPercent}>{Math.round(progress)}%</span>
                  </div>
                  <div className={styles.progressBar}>
                    <div
                      className={styles.progressFill}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className={styles.progressFooter}>
                    <span>Đã tích lũy: {formatVND(currentSpending)}</span>
                    <span>Còn thêm: {formatVND(remaining)}</span>
                  </div>
                </div>
              ) : isDiamond ? (
                <div className={styles.maxTierCard}>
                  <TierSvgIcon code="DIAMOND" size={18} />
                  <span>Bạn đang ở hạng cao nhất (Diamond · Hoàn 10%)</span>
                </div>
              ) : null}

              {/* History & Tier Policy Tabs */}
              <div className={styles.tabButtons}>
                <button
                  type="button"
                  className={`${styles.tabBtn} ${activeTab === 'history' ? styles.tabBtnActive : ''}`}
                  onClick={() => setActiveTab('history')}
                >
                  Lịch sử điểm ({transactions.length})
                </button>
                <button
                  type="button"
                  className={`${styles.tabBtn} ${activeTab === 'policy' ? styles.tabBtnActive : ''}`}
                  onClick={() => setActiveTab('policy')}
                >
                  Đặc quyền hạng
                </button>
              </div>

              {activeTab === 'history' && (
                <div className={styles.transactionList}>
                  {transactions.length === 0 ? (
                    <div className={styles.txEmpty}>
                      Chưa có giao dịch tích điểm nào.
                      <br />
                      Hãy quét mã QR trên ly nước để nhận hoàn tiền ngay!
                    </div>
                  ) : (
                    transactions.map((tx) => {
                      const isPositive = tx.amount > 0;
                      return (
                        <div key={tx.id} className={styles.transactionItem}>
                          <div
                            className={`${styles.txIconWrap} ${isPositive ? styles.txIconPos : styles.txIconNeg}`}
                          >
                            {isPositive ? (
                              <StarSolidIcon size={15} />
                            ) : (
                              <ShoppingBagIcon size={15} />
                            )}
                          </div>
                          <div className={styles.txDetails}>
                            <span className={styles.txDesc}>{tx.description || tx.type}</span>
                            <span className={styles.txDate}>
                              {new Date(tx.created_at).toLocaleString('vi-VN', {
                                day: '2-digit',
                                month: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                          <span
                            className={`${styles.txAmount} ${isPositive ? styles.txPositive : styles.txNegative}`}
                          >
                            {isPositive ? `+${formatVND(tx.amount)}` : formatVND(tx.amount)}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {activeTab === 'policy' && (
                <div className={styles.tierList}>
                  {Object.values(TIERS_CONFIG).map((t) => (
                    <div
                      key={t.code}
                      className={`${styles.tierItem} ${currentTierCode === t.code ? styles.tierItemActive : ''}`}
                    >
                      <span className={styles.tierIcon}>
                        <TierSvgIcon code={t.code} size={18} />
                      </span>
                      <div className={styles.tierInfo}>
                        <span className={styles.tierName}>{t.name}</span>
                        <span className={styles.tierDetail}>
                          {t.minSpending > 0
                            ? `Chi tiêu ≥ ${formatVND(t.minSpending)}`
                            : 'Mặc định khi đăng ký'}{' '}
                          · Hoàn {t.cashbackRate}%
                        </span>
                      </div>
                      <span className={styles.tierBonus}>{t.bonus}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className={styles.authSection}>
                <button type="button" className={styles.signOutBtn} onClick={signOut}>
                  Đăng xuất ({profile.phone || profile.email})
                </button>
              </div>
            </>
          ) : (
            /* Guest View */
            <>
              <div className={styles.guestWelcomeCard}>
                <div className={styles.guestLogoCircle}>
                  <Image
                    src="/logo-mark.png"
                    alt="Ủ LAB Logo"
                    width={48}
                    height={48}
                    style={{ objectFit: 'contain' }}
                  />
                </div>
                <span className={styles.guestEyebrow}>Ủ LAB REWARDS®</span>
                <h3 className={styles.guestWelcomeTitle}>
                  Tham gia thành viên nhận ngay 10.000đ
                </h3>
                <p className={styles.guestWelcomeDesc}>
                  Tích điểm hoàn tiền từ <strong>3% đến 10%</strong> cho mỗi ly Matcha &amp; Cold Brew, sử dụng điểm trừ trực tiếp cho đơn hàng tiếp theo.
                </p>

                <div className={styles.guestActionRow}>
                  <button
                    type="button"
                    className={styles.registerBtnPrimary}
                    onClick={() => handleNavigate('/register')}
                  >
                    <GiftIcon size={16} />
                    <span>Đăng ký nhận 10.000đ</span>
                  </button>
                  <button
                    type="button"
                    className={styles.loginBtnSecondary}
                    onClick={() => handleNavigate('/login')}
                  >
                    Đăng nhập tài khoản
                  </button>
                </div>
              </div>

              <div className={styles.tierList}>
                <h3 className={styles.sectionTitle}>4 Hạng thành viên &amp; Quyền lợi</h3>
                {Object.values(TIERS_CONFIG).map((t) => (
                  <div key={t.code} className={styles.tierItem}>
                    <span className={styles.tierIcon}>
                      <TierSvgIcon code={t.code} size={18} />
                    </span>
                    <div className={styles.tierInfo}>
                      <span className={styles.tierName}>{t.name}</span>
                      <span className={styles.tierDetail}>
                        {t.minSpending > 0
                          ? `≥ ${formatVND(t.minSpending)}`
                          : 'Khởi đầu'}{' '}
                        · Hoàn {t.cashbackRate}%
                      </span>
                    </div>
                    <span className={styles.tierBonus}>{t.bonus}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
