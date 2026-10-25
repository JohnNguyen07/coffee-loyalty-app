'use client';

import { useState, useEffect, useCallback } from 'react';
import styles from './LoyaltyPanel.module.css';
import { formatVND } from '@/data/menu';

export type LoyaltySubTab = 'tiers' | 'cashback' | 'transactions' | 'vouchers';

interface TierData {
  id: string;
  code: string;
  name: string;
  min_spending: number;
  cashback_rate: number;
  level_up_bonus: number;
  user_count: number;
}

interface PointTx {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  reference_id: string | null;
  description: string;
  created_at: string;
  user?: {
    full_name: string;
    phone: string;
    email: string;
  };
}

interface Voucher {
  id: string;
  code: string;
  title: string;
  discount_amount: number;
  min_order_value: number;
  points_cost: number;
  expires_in_days: number;
  category: string;
  is_active: boolean;
  claimed_count: number;
}

const tierIcons: Record<string, string> = {
  MEMBER: '🌱',
  SILVER: '🥈',
  GOLD: '🥇',
  DIAMOND: '💎',
};

const tierGradients: Record<string, string> = {
  MEMBER: 'linear-gradient(135deg, #f0fdf4, #dcfce7)',
  SILVER: 'linear-gradient(135deg, #f8fafc, #e2e8f0)',
  GOLD: 'linear-gradient(135deg, #fefce8, #fef08a)',
  DIAMOND: 'linear-gradient(135deg, #eff6ff, #dbeafe)',
};

interface LoyaltyPanelProps {
  initialSubTab?: LoyaltySubTab;
}

export default function LoyaltyPanel({ initialSubTab = 'tiers' }: LoyaltyPanelProps) {
  const [subTab, setSubTab] = useState<LoyaltySubTab>(initialSubTab);
  const [tiers, setTiers] = useState<TierData[]>([]);
  const [transactions, setTransactions] = useState<PointTx[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [metrics, setMetrics] = useState({ totalCirculatingPoints: 0, totalCustomerSpending: 0, totalCustomers: 0 });
  const [loading, setLoading] = useState(true);

  // Filters for transactions
  const [txTypeFilter, setTxTypeFilter] = useState('ALL');
  const [txSearch, setTxSearch] = useState('');

  // Simulator for cashback
  const [calcDrinkPrice, setCalcDrinkPrice] = useState<number>(39000);

  const fetchLoyaltyData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (txTypeFilter && txTypeFilter !== 'ALL') params.set('txType', txTypeFilter);
      if (txSearch) params.set('search', txSearch);

      const res = await fetch(`/api/admin/loyalty?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setTiers(data.tiers || []);
        setTransactions(data.transactions || []);
        setVouchers(data.vouchers || []);
        if (data.metrics) setMetrics(data.metrics);
      }
    } catch (err) {
      console.error('Fetch loyalty error:', err);
    } finally {
      setLoading(false);
    }
  }, [txTypeFilter, txSearch]);

  useEffect(() => {
    fetchLoyaltyData();
  }, [fetchLoyaltyData]);

  return (
    <div className={styles.panel}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <h2 className={styles.title}>🎁 Chương trình Khách hàng thân thiết (Loyalty)</h2>
          <span className={styles.badge}>4 Cấp bậc thành viên</span>
        </div>
      </div>

      {/* Sub Tabs */}
      <div className={styles.subTabs}>
        <button
          className={`${styles.subTabBtn} ${subTab === 'tiers' ? styles.activeSubTab : ''}`}
          onClick={() => setSubTab('tiers')}
        >
          <span>🏆</span> Hạng thành viên (Tiers)
        </button>
        <button
          className={`${styles.subTabBtn} ${subTab === 'cashback' ? styles.activeSubTab : ''}`}
          onClick={() => setSubTab('cashback')}
        >
          <span>💸</span> Tỷ lệ hoàn tiền (Cashback)
        </button>
        <button
          className={`${styles.subTabBtn} ${subTab === 'transactions' ? styles.activeSubTab : ''}`}
          onClick={() => setSubTab('transactions')}
        >
          <span>📜</span> Sổ cái giao dịch điểm (Transactions)
        </button>
        <button
          className={`${styles.subTabBtn} ${subTab === 'vouchers' ? styles.activeSubTab : ''}`}
          onClick={() => setSubTab('vouchers')}
        >
          <span>🎟️</span> Mã ưu đãi & Voucher (Vouchers)
        </button>
      </div>

      {/* Overall Stats */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Tổng điểm ví đang lưu hành</span>
          <span className={styles.statValue} style={{ color: '#15803d' }}>
            {formatVND(metrics.totalCirculatingPoints)}
          </span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Doanh thu tích lũy khách hàng</span>
          <span className={styles.statValue}>{formatVND(metrics.totalCustomerSpending)}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Tổng số thành viên</span>
          <span className={styles.statValue}>{metrics.totalCustomers}</span>
        </div>
      </div>

      {/* SUBTAB 1: TIERS */}
      {subTab === 'tiers' && (
        <div className={styles.tiersGrid}>
          {tiers.map((t) => (
            <div key={t.id} className={styles.tierCard} style={{ background: tierGradients[t.code] || 'white' }}>
              <div className={styles.tierBadgeHeader}>
                <div className={styles.tierTitle}>
                  <span>{tierIcons[t.code] || '🌱'}</span>
                  <span>{t.name}</span>
                </div>
                <span className={styles.tierMemberCount}>{t.user_count} thành viên</span>
              </div>

              <div style={{ marginTop: '12px' }}>
                <div className={styles.tierRow}>
                  <span style={{ color: 'var(--ink-secondary)' }}>Mốc chi tiêu tối thiểu:</span>
                  <strong>{t.min_spending === 0 ? 'Mặc định (0đ)' : formatVND(t.min_spending)}</strong>
                </div>
                <div className={styles.tierRow}>
                  <span style={{ color: 'var(--ink-secondary)' }}>Tỷ lệ hoàn tiền mỗi ly:</span>
                  <strong style={{ color: '#15803d', fontSize: '1.05rem' }}>{t.cashback_rate}%</strong>
                </div>
                <div className={styles.tierRow}>
                  <span style={{ color: 'var(--ink-secondary)' }}>Thưởng lên hạng:</span>
                  <strong>+{formatVND(t.level_up_bonus)}</strong>
                </div>
                <div className={styles.tierRow}>
                  <span style={{ color: 'var(--ink-secondary)' }}>Mã hạng:</span>
                  <code>{t.code}</code>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* SUBTAB 2: CASHBACK */}
      {subTab === 'cashback' && (
        <div>
          <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
            <h3 style={{ margin: '0 0 12px', color: 'var(--ink)' }}>🧮 Máy tính thử nghiệm tỷ lệ hoàn tiền khi quét tem QR</h3>
            <p style={{ color: 'var(--ink-secondary)', fontSize: '0.875rem', marginBottom: '16px' }}>
              Mỗi khi khách hàng mua ly nước và quét tem QR in dán trên ly, hệ thống tự động hoàn tiền tương ứng với hạng của khách hàng:
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', marginBottom: '24px' }}>
              <label style={{ fontSize: '0.875rem', fontWeight: 600 }}>Giá niêm yết ly nước (VNĐ):</label>
              <input
                type="number"
                value={calcDrinkPrice}
                onChange={(e) => setCalcDrinkPrice(Number(e.target.value) || 0)}
                style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '1rem', fontWeight: 700 }}
                step="1000"
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" onClick={() => setCalcDrinkPrice(29000)} style={{ padding: '4px 10px', borderRadius: '4px', border: '1px solid var(--border)', background: '#f8fafc', cursor: 'pointer' }}>29k</button>
                <button type="button" onClick={() => setCalcDrinkPrice(35000)} style={{ padding: '4px 10px', borderRadius: '4px', border: '1px solid var(--border)', background: '#f8fafc', cursor: 'pointer' }}>35k</button>
                <button type="button" onClick={() => setCalcDrinkPrice(39000)} style={{ padding: '4px 10px', borderRadius: '4px', border: '1px solid var(--border)', background: '#f8fafc', cursor: 'pointer' }}>39k</button>
                <button type="button" onClick={() => setCalcDrinkPrice(45000)} style={{ padding: '4px 10px', borderRadius: '4px', border: '1px solid var(--border)', background: '#f8fafc', cursor: 'pointer' }}>45k</button>
                <button type="button" onClick={() => setCalcDrinkPrice(59000)} style={{ padding: '4px 10px', borderRadius: '4px', border: '1px solid var(--border)', background: '#f8fafc', cursor: 'pointer' }}>59k</button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              {tiers.map((t) => {
                const points = Math.round((calcDrinkPrice * t.cashback_rate) / 100);
                return (
                  <div key={t.id} style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '16px', background: '#fafbfc' }}>
                    <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '4px' }}>
                      {tierIcons[t.code]} {t.name} ({t.cashback_rate}%)
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#15803d' }}>
                      +{formatVND(points)}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', marginTop: '4px' }}>
                      Cộng trực tiếp vào ví sau khi quét QR
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 3: TRANSACTIONS LEDGER */}
      {subTab === 'transactions' && (
        <>
          <div className={styles.toolbar}>
            <div className={styles.searchBox}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={styles.searchIcon}>
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Tìm theo mô tả hoặc mã tham chiếu..."
                value={txSearch}
                onChange={(e) => setTxSearch(e.target.value)}
                className={styles.searchInput}
              />
            </div>

            <select
              value={txTypeFilter}
              onChange={(e) => setTxTypeFilter(e.target.value)}
              className={styles.select}
            >
              <option value="ALL">Tất cả loại giao dịch</option>
              <option value="CASHBACK">Hoàn tiền quét QR (CASHBACK)</option>
              <option value="ORDER_DEDUCT">Trừ điểm đơn hàng (ORDER_DEDUCT)</option>
              <option value="WELCOME_BONUS">Thưởng chào mừng (WELCOME_BONUS)</option>
              <option value="TIER_UP_BONUS">Thưởng thăng hạng (TIER_UP_BONUS)</option>
            </select>
          </div>

          <div className={styles.tableContainer}>
            {loading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ink-muted)' }}>
                Đang tải nhật ký biến động điểm...
              </div>
            ) : transactions.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ink-muted)' }}>
                Không có giao dịch nào phù hợp với bộ lọc.
              </div>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Khách hàng</th>
                    <th>Loại giao dịch</th>
                    <th>Nội dung</th>
                    <th>Biến động</th>
                    <th>Số dư sau</th>
                    <th>Thời gian</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{tx.user?.full_name || 'Khách vãng lai'}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>{tx.user?.phone || tx.user?.email || 'N/A'}</div>
                      </td>
                      <td>
                        <code style={{ fontSize: '0.75rem', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>
                          {tx.type}
                        </code>
                      </td>
                      <td>
                        <div style={{ fontSize: '0.85rem' }}>{tx.description}</div>
                        {tx.reference_id && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>Ref: {tx.reference_id}</div>
                        )}
                      </td>
                      <td>
                        <strong style={{ color: tx.amount > 0 ? '#15803d' : '#b91c1c' }}>
                          {tx.amount > 0 ? `+${formatVND(tx.amount)}` : formatVND(tx.amount)}
                        </strong>
                      </td>
                      <td>{formatVND(tx.balance_after)}</td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--ink-secondary)' }}>
                        {new Date(tx.created_at).toLocaleString('vi-VN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* SUBTAB 4: VOUCHERS */}
      {subTab === 'vouchers' && (
        <div className={styles.vouchersGrid}>
          {vouchers.map((v) => (
            <div key={v.id} className={styles.voucherCard}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <code style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--accent)', background: 'rgba(184, 115, 51, 0.08)', padding: '4px 10px', borderRadius: '6px' }}>
                    {v.code}
                  </code>
                  <span style={{ fontSize: '0.75rem', color: v.is_active ? '#15803d' : '#94a3b8', fontWeight: 700 }}>
                    {v.is_active ? '● Đang mở đổi' : '○ Tạm đóng'}
                  </span>
                </div>
                <h4 style={{ margin: '8px 0 4px', fontSize: '0.95rem', color: 'var(--ink)' }}>
                  {v.title}
                </h4>
                <div style={{ fontSize: '0.8rem', color: 'var(--ink-muted)', marginBottom: '12px' }}>
                  Đơn tối thiểu: <strong>{formatVND(v.min_order_value)}</strong>
                </div>
              </div>

              <div style={{ borderTop: '1px dashed var(--border)', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--ink-secondary)' }}>
                  Điểm đổi: <strong style={{ color: '#b45309' }}>{formatVND(v.points_cost)}</strong>
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>
                  Đã đổi: {v.claimed_count} lượt
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
