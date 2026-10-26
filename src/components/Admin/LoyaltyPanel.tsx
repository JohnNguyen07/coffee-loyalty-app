'use client';

import { useState, useEffect, useCallback } from 'react';
import styles from './LoyaltyPanel.module.css';
import { formatVND } from '@/data/menu';
import { TIERS_CONFIG } from '@/hooks/useAuth';
import { TierSvgIcon } from '@/components/Icons/LabIcons';

export type LoyaltySubTab = 'tiers' | 'transactions' | 'cashback' | 'vouchers';

interface LoyaltyPanelProps {
  initialSubTab?: LoyaltySubTab;
}

interface PointTx {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  description: string;
  reference_id?: string | null;
  created_at: string;
  user?: {
    id: string;
    full_name: string;
    phone: string;
    email: string;
  } | null;
}

export default function LoyaltyPanel({ initialSubTab = 'tiers' }: LoyaltyPanelProps) {
  const normalizedInit = initialSubTab === 'transactions' ? 'transactions' : 'tiers';
  const [subTab, setSubTab] = useState<'tiers' | 'transactions'>(normalizedInit);
  const [tiers, setTiers] = useState(Object.values(TIERS_CONFIG));
  const [samplePrice, setSamplePrice] = useState(39000);
  const [editingTierCode, setEditingTierCode] = useState<string | null>(null);
  const [editRate, setEditRate] = useState<number>(3);
  const [editMinSpend, setEditMinSpend] = useState<number>(0);

  // Real transactions state
  const [transactions, setTransactions] = useState<PointTx[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [txTypeFilter, setTxTypeFilter] = useState('ALL');
  const [loadingTx, setLoadingTx] = useState(false);

  const fetchTransactions = useCallback(async () => {
    setLoadingTx(true);
    try {
      const params = new URLSearchParams();
      if (txTypeFilter !== 'ALL') params.set('type', txTypeFilter);
      params.set('limit', '100');

      const res = await fetch(`/api/admin/transactions?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setTransactions(data.transactions || []);
        setTxTotal(data.total || 0);
      }
    } catch (err) {
      console.error('Fetch transactions error:', err);
    } finally {
      setLoadingTx(false);
    }
  }, [txTypeFilter]);

  useEffect(() => {
    if (subTab === 'transactions') {
      fetchTransactions();
    }
  }, [subTab, fetchTransactions]);

  const handleSaveTier = (code: string) => {
    setTiers((prev) =>
      prev.map((t) =>
        t.code === code
          ? {
              ...t,
              cashbackRate: Math.min(50, Math.max(1, editRate)),
              minSpending: Math.max(0, editMinSpend),
            }
          : t
      )
    );
    setEditingTierCode(null);
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Cấu Hình Tích Điểm — Ủ LAB Rewards®</h1>
          <p className={styles.subtitle}>
            Quản lý 4 hạng thành viên, tỷ lệ hoàn điểm khi khách quét QR trên ly và sổ cái lịch sử cộng/trừ điểm.
          </p>
        </div>
      </div>

      <div className={styles.subTabs}>
        <button
          type="button"
          className={`${styles.subTab} ${subTab === 'tiers' ? styles.subTabActive : ''}`}
          onClick={() => setSubTab('tiers')}
        >
          Hạng &amp; Tỷ lệ hoàn điểm
        </button>
        <button
          type="button"
          className={`${styles.subTab} ${subTab === 'transactions' ? styles.subTabActive : ''}`}
          onClick={() => setSubTab('transactions')}
        >
          Sổ cái giao dịch điểm ({txTotal || transactions.length})
        </button>
      </div>

      {/* SUB-TAB 1: TIERS & CASHBACK SIMULATOR */}
      {subTab === 'tiers' && (
        <>
          <div className={styles.cardsGrid}>
            {tiers.map((tier) => {
              const isEditing = editingTierCode === tier.code;
              return (
                <div key={tier.code} className={styles.infoCard}>
                  <div className={styles.infoCardHeader}>
                    <span className={styles.infoCardIcon}>
                      <TierSvgIcon code={tier.code} size={22} />
                    </span>
                    <span className={`${styles.badge} ${styles.badgeGold}`}>
                      Hoàn {tier.cashbackRate}%
                    </span>
                  </div>
                  <h3 className={styles.infoCardTitle}>Hạng {tier.name}</h3>

                  {isEditing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '8px 0' }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                        Mức hoàn điểm (%):
                        <input
                          type="number"
                          value={editRate}
                          min={1}
                          max={50}
                          onChange={(e) => setEditRate(Number(e.target.value))}
                          className={styles.searchInput}
                          style={{ width: '100%', marginTop: 4 }}
                        />
                      </label>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                        Chi tiêu tối thiểu (VNĐ):
                        <input
                          type="number"
                          value={editMinSpend}
                          step={50000}
                          min={0}
                          onChange={(e) => setEditMinSpend(Number(e.target.value))}
                          className={styles.searchInput}
                          style={{ width: '100%', marginTop: 4 }}
                        />
                      </label>
                    </div>
                  ) : (
                    <>
                      <p className={styles.infoCardDesc}>
                        Chi tiêu tích lũy tối thiểu:{' '}
                        <strong>
                          {tier.minSpending > 0
                            ? formatVND(tier.minSpending)
                            : '0đ (Mặc định khi đăng ký)'}
                        </strong>
                      </p>
                      <p className={styles.infoCardDesc}>
                        Quyền lợi: <strong>{tier.bonus}</strong>
                      </p>
                    </>
                  )}

                  <div className={styles.infoCardFooter}>
                    <span className={styles.mutedText}>Mã: {tier.code}</span>
                    {isEditing ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          className={styles.actionLink}
                          onClick={() => setEditingTierCode(null)}
                        >
                          Hủy
                        </button>
                        <button
                          type="button"
                          className={styles.primaryBtn}
                          style={{ padding: '4px 12px', fontSize: '0.75rem' }}
                          onClick={() => handleSaveTier(tier.code)}
                        >
                          Lưu
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className={styles.actionLink}
                        onClick={() => {
                          setEditingTierCode(tier.code);
                          setEditRate(tier.cashbackRate);
                          setEditMinSpend(tier.minSpending);
                        }}
                      >
                        Chỉnh sửa
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Inline Cashback Simulator */}
          <div className={styles.detailCard} style={{ marginTop: 20 }}>
            <h3 className={styles.sectionTitle}>Mô phỏng số điểm hoàn khi khách quét tem QR</h3>
            <p className={styles.subtitle}>
              Nhập giá trị ly nước để kiểm tra số điểm hoàn tự động cộng vào ví khách theo từng hạng:
            </p>
            <div className={styles.toolbar} style={{ marginTop: 12 }}>
              <input
                type="number"
                value={samplePrice}
                onChange={(e) => setSamplePrice(Number(e.target.value) || 0)}
                className={styles.searchInput}
                step={1000}
              />
              {[29000, 34000, 39000, 46000, 74000].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setSamplePrice(p)}
                  className={styles.actionLink}
                >
                  {formatVND(p)}
                </button>
              ))}
            </div>

            <div className={styles.statsGrid}>
              {tiers.map((t) => {
                const earned = Math.round((samplePrice * t.cashbackRate) / 100);
                return (
                  <div key={t.code} className={styles.statCard}>
                    <span className={styles.statLabel}>
                      {t.name} ({t.cashbackRate}%)
                    </span>
                    <span className={styles.statValue}>+{formatVND(earned)}</span>
                    <span className={styles.statChange}>
                      Cho ly giá {formatVND(samplePrice)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* SUB-TAB 2: POINT TRANSACTIONS LEDGER */}
      {subTab === 'transactions' && (
        <>
          <div className={styles.toolbar}>
            <select
              value={txTypeFilter}
              onChange={(e) => setTxTypeFilter(e.target.value)}
              className={styles.selectInput}
            >
              <option value="ALL">Tất cả loại giao dịch</option>
              <option value="CASHBACK">Hoàn điểm quét QR (CASHBACK)</option>
              <option value="ADMIN_ADJUST">Quầy điều chỉnh (ADMIN_ADJUST)</option>
              <option value="REDEMPTION">Đổi điểm trừ đơn (REDEMPTION)</option>
              <option value="REGISTER_BONUS">Thưởng đăng ký (REGISTER_BONUS)</option>
              <option value="TIER_UP_BONUS">Thưởng lên hạng (TIER_UP_BONUS)</option>
            </select>
            <button
              type="button"
              onClick={fetchTransactions}
              className={styles.primaryBtn}
            >
              Làm mới sổ cái
            </button>
          </div>

          <div className={styles.tableCard}>
            {loadingTx ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#888' }}>
                Đang tải lịch sử giao dịch...
              </div>
            ) : transactions.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#888' }}>
                Chưa có giao dịch điểm nào.
              </div>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Khách hàng</th>
                    <th>Loại giao dịch</th>
                    <th>Biến động</th>
                    <th>Số dư sau GD</th>
                    <th>Nội dung</th>
                    <th>Thời gian</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id}>
                      <td>
                        <div className={styles.itemName}>
                          {tx.user?.full_name || 'Khách hàng'}
                        </div>
                        <div className={styles.itemSub}>
                          {tx.user?.phone || tx.user?.email || '—'}
                        </div>
                      </td>
                      <td>
                        <span
                          className={`${styles.badge} ${
                            tx.amount >= 0 ? styles.badgeGreen : styles.badgeGold
                          }`}
                        >
                          {tx.type}
                        </span>
                      </td>
                      <td>
                        <strong
                          style={{
                            color: tx.amount >= 0 ? '#166534' : '#DC2626',
                          }}
                        >
                          {tx.amount >= 0
                            ? `+${formatVND(tx.amount)}`
                            : formatVND(tx.amount)}
                        </strong>
                      </td>
                      <td>{formatVND(tx.balance_after)}</td>
                      <td>{tx.description || '—'}</td>
                      <td className={styles.mutedText}>
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
    </div>
  );
}
