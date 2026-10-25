'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import styles from './ProfilePanel.module.css';
import { formatVND } from '@/data/menu';
import { useAuth, TIERS_CONFIG } from '@/hooks/useAuth';

interface ProfilePanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const tierColors: Record<string, string> = {
  MEMBER: 'var(--tier-member)',
  SILVER: 'var(--tier-silver)',
  GOLD: 'var(--tier-gold)',
  DIAMOND: 'var(--tier-diamond)',
};

const tierIcons: Record<string, string> = {
  MEMBER: '🌱',
  SILVER: '🥈',
  GOLD: '🥇',
  DIAMOND: '💎',
};

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
    : (profile?.next_tier || NEXT_TIERS[currentTierCode] || NEXT_TIERS.MEMBER);

  const nextTierMin = nextTierInfo?.min_spending || 500000;
  const currentSpending = profile?.total_spending || 0;
  const progress = nextTierInfo
    ? Math.min(100, Math.max(0, (currentSpending / nextTierMin) * 100))
    : 100;
  const remaining = nextTierInfo
    ? Math.max(0, nextTierMin - currentSpending)
    : 0;

  const transactions = profile?.recent_transactions || [];

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
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
      />
      <div className={`${styles.panel} ${isOpen ? styles.open : ''}`}>
        <div className={styles.header}>
          <div className={styles.headerTitleWrap}>
            <h2 className={styles.title}>Tài khoản</h2>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Đóng">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className={styles.content}>
          {isLoggedIn && profile ? (
            <>
              {/* User info */}
              <div className={styles.userCard}>
                <div className={styles.avatar}>
                  <span>{(profile.full_name || 'U').charAt(0).toUpperCase()}</span>
                </div>
                <div className={styles.userInfo}>
                  <span className={styles.userName}>{profile.full_name}</span>
                  <span className={styles.userEmail}>{profile.phone || profile.email}</span>
                </div>
                <div
                  className={styles.tierBadge}
                  style={{ background: tierColors[currentTierCode] }}
                >
                  <span>{tierIcons[currentTierCode]}</span>
                  <span>{profile.tier?.name || 'Member'}</span>
                </div>
              </div>

              {/* Points balance */}
              <div className={styles.pointsCard}>
                <div className={styles.pointsTop}>
                  <span className={styles.pointsLabel}>Ví điểm thưởng</span>
                  <span className={styles.pointsValue}>{formatVND(profile.point_balance || 0)}</span>
                </div>
                <div className={styles.cashbackInfo}>
                  Hoàn {profile.tier?.cashback_rate || 3}% cho mỗi giao dịch quét QR
                </div>
              </div>

              {/* Quick Action Navigation */}
              <div className={styles.quickNav}>
                <button
                  className={styles.actionBtnPrimary}
                  onClick={() => handleNavigate('/scan')}
                >
                  <span className={styles.actionIcon}>📷</span>
                  <div className={styles.actionText}>
                    <strong>Quét mã QR nhận hoàn tiền</strong>
                    <small>Nhận điểm ngay khi uống nước</small>
                  </div>
                </button>
              </div>

              {/* Tier progress */}
              {!isDiamond && nextTierInfo ? (
                <div className={styles.progressCard}>
                  <div className={styles.progressHeader}>
                    <span className={styles.progressLabel}>
                      Tiến trình lên <strong>{nextTierInfo.name}</strong>
                    </span>
                    <span className={styles.progressPercent}>{Math.round(progress)}%</span>
                  </div>
                  <div className={styles.progressBar}>
                    <div
                      className={styles.progressFill}
                      style={{
                        width: `${progress}%`,
                        background: tierColors[nextTierInfo.code] || 'var(--accent)',
                      }}
                    />
                  </div>
                  <div className={styles.progressFooter}>
                    <span>Đã chi: {formatVND(currentSpending)}</span>
                    <span>Còn: {formatVND(remaining)}</span>
                  </div>
                </div>
              ) : isDiamond ? (
                <div className={styles.maxTierCard}>
                  <span>💎 Bạn đang ở hạng cao nhất (Diamond)!</span>
                </div>
              ) : null}

              {/* Tabs: Point History & Policy */}
              <div className={styles.sectionHeaderWithTab}>
                <div className={styles.tabButtons}>
                  <button
                    type="button"
                    className={`${styles.tabBtn} ${activeTab === 'history' ? styles.tabBtnActive : ''}`}
                    onClick={() => setActiveTab('history')}
                  >
                    📜 Lịch sử điểm ({transactions.length})
                  </button>
                  <button
                    type="button"
                    className={`${styles.tabBtn} ${activeTab === 'policy' ? styles.tabBtnActive : ''}`}
                    onClick={() => setActiveTab('policy')}
                  >
                    🏆 Hạng thành viên
                  </button>
                </div>
              </div>

              {/* Tab 1: Transaction History */}
              {activeTab === 'history' && (
                <div className={styles.transactionList}>
                  {transactions.length === 0 ? (
                    <div className={styles.txEmpty}>
                      Chưa có giao dịch tích điểm nào.<br />
                      Hãy quét tem QR trên ly nước để nhận hoàn tiền!
                    </div>
                  ) : (
                    transactions.map((tx) => {
                      const isPositive = tx.amount > 0;
                      let icon = '☕';
                      if (tx.type === 'WELCOME_BONUS') icon = '🌱';
                      else if (tx.type === 'TIER_UP_BONUS') icon = '🏆';
                      else if (tx.type === 'ORDER_DEDUCT') icon = '🛍️';
                      else if (tx.type === 'ORDER_CANCEL_REFUND') icon = '↩️';

                      return (
                        <div key={tx.id} className={styles.transactionItem}>
                          <div className={styles.txIconWrap}>
                            <span>{icon}</span>
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
                          <span className={`${styles.txAmount} ${isPositive ? styles.txPositive : styles.txNegative}`}>
                            {isPositive ? `+${formatVND(tx.amount)}` : formatVND(tx.amount)}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* Tab 2: Membership policy */}
              {activeTab === 'policy' && (
                <div className={styles.tierList}>
                  {Object.values(TIERS_CONFIG).map((t) => (
                    <div
                      key={t.code}
                      className={`${styles.tierItem} ${currentTierCode === t.code ? styles.tierItemActive : ''}`}
                    >
                      <span className={styles.tierIcon}>{t.icon}</span>
                      <div className={styles.tierInfo}>
                        <span className={styles.tierName}>{t.name}</span>
                        <span className={styles.tierDetail}>
                          {t.minSpending > 0 ? `≥ ${formatVND(t.minSpending)}` : 'Khởi đầu'} · Hoàn {t.cashbackRate}%
                        </span>
                      </div>
                      <span className={styles.tierBonus}>{t.bonus}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Sign out */}
              <div className={styles.authSection}>
                <button className={styles.signOutBtn} onClick={signOut}>
                  Đăng xuất ({profile.phone || profile.email})
                </button>
              </div>
            </>
          ) : (
            /* Guest / Not logged in */
            <>
              <div className={styles.guestWelcomeCard}>
                <div style={{ width: 52, height: 52, borderRadius: 12, overflow: 'hidden', background: '#fff', margin: '0 auto 10px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Image src="/logo.png" alt="Ủ LAB Logo" width={52} height={52} style={{ objectFit: 'contain' }} />
                </div>
                <span className={styles.guestWelcomeTitle}>Chào mừng đến với Ủ LAB</span>
                <p className={styles.guestWelcomeDesc}>
                  Đăng ký thành viên để nhận ngay <strong>10.000đ</strong> vào ví và hoàn tiền tới <strong>10%</strong> mỗi lần uống nước!
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button
                  className={styles.loginBtnPrimary}
                  onClick={() => handleNavigate('/login')}
                >
                  🔑 Đăng nhập tài khoản
                </button>
                <button
                  className={styles.registerBtnSecondary}
                  onClick={() => handleNavigate('/register')}
                >
                  🎁 Đăng ký nhận 10.000đ
                </button>
              </div>

              {/* Membership policy */}
              <div className={styles.tierList} style={{ marginTop: 'var(--space-2)' }}>
                <h3 className={styles.sectionTitle}>Chính sách hạng thành viên</h3>
                {Object.values(TIERS_CONFIG).map((t) => (
                  <div key={t.code} className={styles.tierItem}>
                    <span className={styles.tierIcon}>{t.icon}</span>
                    <div className={styles.tierInfo}>
                      <span className={styles.tierName}>{t.name}</span>
                      <span className={styles.tierDetail}>
                        {t.minSpending > 0 ? `≥ ${formatVND(t.minSpending)}` : 'Khởi đầu'} · Hoàn {t.cashbackRate}%
                      </span>
                    </div>
                    <span className={styles.tierBonus}>{t.bonus}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
