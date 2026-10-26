'use client';

import { useState, useEffect, useCallback } from 'react';
import styles from './CustomersPanel.module.css';
import { formatVND } from '@/data/menu';

export type CustomerSubTab = 'list' | 'detail' | 'all' | 'members';

interface Tier {
  id: string;
  code: string;
  name: string;
  cashback_rate: number;
}

interface Customer {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: string;
  total_spending: number;
  point_balance: number;
  created_at: string;
  tier?: Tier;
}

interface PointTransaction {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  reference_id: string | null;
  description: string;
  created_at: string;
}

const tierIcons: Record<string, string> = {
  MEMBER: '🌱',
  SILVER: '🥈',
  GOLD: '🥇',
  DIAMOND: '💎',
};

interface CustomersPanelProps {
  initialSubTab?: CustomerSubTab;
}

export default function CustomersPanel({ initialSubTab = 'detail' }: CustomersPanelProps) {
  const normalizedInit = initialSubTab === 'all' || initialSubTab === 'members' ? 'list' : initialSubTab;
  const [subTab, setSubTab] = useState<'list' | 'detail'>(normalizedInit);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('ALL');

  // Customer Detail & Point Deduction State
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [detailCustomer, setDetailCustomer] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [phoneLookup, setPhoneLookup] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Quick point adjustment modal/form state
  const [adjustMode, setAdjustMode] = useState<'DEDUCT' | 'ADD'>('DEDUCT');
  const [adjustAmount, setAdjustAmount] = useState<number | ''>('');
  const [orderCode, setOrderCode] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustSubmitting, setAdjustSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  // Fetch list of customers
  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (tierFilter && tierFilter !== 'ALL') params.set('tier', tierFilter);

      const res = await fetch(`/api/admin/customers?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setCustomers(data.customers || []);
      }
    } catch (err) {
      console.error('Fetch customers error:', err);
    } finally {
      setLoading(false);
    }
  }, [search, tierFilter, subTab]);

  useEffect(() => {
    if (subTab !== 'detail') {
      fetchCustomers();
    }
  }, [fetchCustomers, subTab]);

  // Load Customer Detail
  const loadCustomerDetail = useCallback(async (idOrPhone: { id?: string; phone?: string }) => {
    setDetailLoading(true);
    setActionMessage(null);
    try {
      const params = new URLSearchParams();
      if (idOrPhone.id) params.set('id', idOrPhone.id);
      if (idOrPhone.phone) params.set('phone', idOrPhone.phone);

      const res = await fetch(`/api/admin/customers/detail?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setDetailCustomer(data.customer);
        setSelectedCustomerId(data.customer?.id || null);
        if (data.customer?.phone) {
          setPhoneLookup(data.customer.phone);
        }
      } else {
        const data = await res.json();
        setActionMessage({ text: data.error || 'Không tìm thấy khách hàng', isError: true });
        setDetailCustomer(null);
      }
    } catch (err) {
      console.error('Detail fetch error:', err);
      setActionMessage({ text: 'Lỗi tải dữ liệu khách hàng', isError: true });
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // Live suggestions when typing phone in detail tab
  useEffect(() => {
    if (subTab !== 'detail' || !phoneLookup || phoneLookup.length < 2) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/customers/detail?query=${encodeURIComponent(phoneLookup)}`);
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data.suggestions || []);
          setShowSuggestions(true);
        }
      } catch (err) {
        console.error('Suggestion search error:', err);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [phoneLookup, subTab]);

  // Handle Point Adjustment (Trừ hoặc Cộng điểm)
  const handleAdjustPoints = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailCustomer) {
      setActionMessage({ text: 'Vui lòng chọn khách hàng trước', isError: true });
      return;
    }

    const amountNum = Number(adjustAmount);
    if (!amountNum || amountNum <= 0) {
      setActionMessage({ text: 'Vui lòng nhập số điểm hợp lệ lớn hơn 0', isError: true });
      return;
    }

    if (adjustMode === 'DEDUCT' && detailCustomer.point_balance < amountNum) {
      setActionMessage({
        text: `Khách chỉ còn ${formatVND(detailCustomer.point_balance)}, không đủ để trừ ${formatVND(amountNum)}!`,
        isError: true,
      });
      return;
    }

    setAdjustSubmitting(true);
    setActionMessage(null);

    try {
      const res = await fetch('/api/admin/customers/adjust-points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: detailCustomer.id,
          phone: detailCustomer.phone,
          action: adjustMode,
          amount: amountNum,
          orderCode: orderCode.trim(),
          reason: adjustReason.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setActionMessage({ text: data.message });
        // Reload detail customer to reflect new balance and transaction
        await loadCustomerDetail({ id: detailCustomer.id });
        setAdjustAmount('');
        setOrderCode('');
        setAdjustReason('');
      } else {
        setActionMessage({ text: data.error || 'Lỗi thực hiện thao tác', isError: true });
      }
    } catch (err: any) {
      console.error('Point adjust error:', err);
      setActionMessage({ text: 'Lỗi kết nối máy chủ', isError: true });
    } finally {
      setAdjustSubmitting(false);
    }
  };

  const handleSelectCustomerForDetail = (cust: Customer) => {
    setSubTab('detail');
    setPhoneLookup(cust.phone || cust.email || '');
    loadCustomerDetail({ id: cust.id });
  };

  // Metrics
  const totalSpending = customers.reduce((sum, c) => sum + (Number(c.total_spending) || 0), 0);
  const totalPoints = customers.reduce((sum, c) => sum + (Number(c.point_balance) || 0), 0);

  return (
    <div className={styles.panel}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <h2 className={styles.title}>👥 Quản lý Khách hàng</h2>
          <span className={styles.badge}>{customers.length} tài khoản</span>
        </div>
      </div>

      {/* Sub Tabs */}
      <div className={styles.subTabs}>
        <button
          className={`${styles.subTabBtn} ${subTab === 'detail' ? styles.activeSubTab : ''}`}
          onClick={() => setSubTab('detail')}
        >
          <span>🔍</span> Tra cứu &amp; Cộng/Trừ điểm (POS)
        </button>
        <button
          className={`${styles.subTabBtn} ${subTab === 'list' ? styles.activeSubTab : ''}`}
          onClick={() => setSubTab('list')}
        >
          <span>📋</span> Danh sách thành viên
        </button>
      </div>

      {/* TAB: MEMBERS LIST */}
      {subTab === 'list' && (
        <>
          {/* Stats Grid */}
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>Tổng chi tiêu khách hàng</span>
              <span className={styles.statValue}>{formatVND(totalSpending)}</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>Tổng điểm ví lưu hành</span>
              <span className={styles.statValue}>{formatVND(totalPoints)}</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>Khách hàng VIP (Gold & Diamond)</span>
              <span className={styles.statValue}>
                {customers.filter((c) => ['GOLD', 'DIAMOND'].includes(c.tier?.code || '')).length}
              </span>
            </div>
          </div>

          {/* Search & Filter Toolbar */}
          <div className={styles.toolbar}>
            <div className={styles.searchBox}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={styles.searchIcon}>
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Tìm kiếm theo Tên, Số điện thoại, Email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={styles.searchInput}
              />
            </div>

            <select
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value)}
              className={styles.select}
            >
              <option value="ALL">Tất cả thứ hạng</option>
              <option value="MEMBER">🌱 Member</option>
              <option value="SILVER">🥈 Silver</option>
              <option value="GOLD">🥇 Gold</option>
              <option value="DIAMOND">💎 Diamond</option>
            </select>
          </div>

          {/* Customer Table */}
          <div className={styles.tableContainer}>
            {loading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ink-muted)' }}>
                Đang tải dữ liệu khách hàng từ hệ thống...
              </div>
            ) : customers.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ink-muted)' }}>
                Không tìm thấy khách hàng nào phù hợp với bộ lọc.
              </div>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Khách hàng</th>
                    <th>Số điện thoại</th>
                    <th>Hạng thẻ</th>
                    <th>Chi tiêu lũy kế</th>
                    <th>Ví điểm khả dụng</th>
                    <th style={{ textAlign: 'right' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c) => {
                    const tierCode = c.tier?.code || 'MEMBER';
                    return (
                      <tr key={c.id}>
                        <td>
                          <div className={styles.customerName}>{c.full_name || 'Khách vãng lai'}</div>
                          <div className={styles.customerContact}>{c.email || 'Chưa liên kết email'}</div>
                        </td>
                        <td>
                          <strong style={{ letterSpacing: '0.02em', color: 'var(--ink)' }}>
                            {c.phone || 'Chưa cập nhật'}
                          </strong>
                        </td>
                        <td>
                          <span className={styles.tierBadge}>
                            {tierIcons[tierCode] || '🌱'} {c.tier?.name || 'Member'}
                          </span>
                        </td>
                        <td>{formatVND(c.total_spending || 0)}</td>
                        <td>
                          <span className={styles.pointsTag}>
                            {formatVND(c.point_balance || 0)}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            className={`${styles.actionBtn} ${styles.primaryActionBtn}`}
                            onClick={() => handleSelectCustomerForDetail(c)}
                          >
                            Trừ điểm / Chi tiết
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* TAB 3: CUSTOMER DETAIL & QUICK POINT DEDUCTION */}
      {subTab === 'detail' && (
        <div>
          {/* Phone Lookup Input */}
          <div className={styles.card} style={{ marginBottom: 'var(--space-4)' }}>
            <h3 className={styles.cardTitle}>
              <span>⚡</span> Nhập Số Điện Thoại để Tra Cứu & Trừ Điểm Khách Hàng
            </h3>
            <div style={{ position: 'relative' }}>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <input
                  type="text"
                  placeholder="Nhập số điện thoại khách (VD: 0947038325, 0938123456)..."
                  value={phoneLookup}
                  onChange={(e) => setPhoneLookup(e.target.value)}
                  onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                  className={styles.formInput}
                  style={{ fontSize: '1rem', fontWeight: 600, letterSpacing: '0.04em' }}
                />
                <button
                  type="button"
                  className={`${styles.actionBtn} ${styles.primaryActionBtn}`}
                  style={{ padding: '0 20px', whiteSpace: 'nowrap' }}
                  onClick={() => loadCustomerDetail({ phone: phoneLookup })}
                >
                  Tìm kiếm
                </button>
              </div>

              {/* Suggestions auto complete dropdown */}
              {showSuggestions && suggestions.length > 0 && (
                <div className={styles.suggestionList}>
                  {suggestions.map((s) => (
                    <div
                      key={s.id}
                      className={styles.suggestionItem}
                      onClick={() => {
                        setShowSuggestions(false);
                        setPhoneLookup(s.phone || '');
                        loadCustomerDetail({ id: s.id });
                      }}
                    >
                      <div>
                        <strong>{s.full_name || 'Khách hàng'}</strong> — <span style={{ color: 'var(--accent)' }}>{s.phone}</span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#1b8a5a', fontWeight: 700 }}>
                        Ví: {formatVND(s.point_balance)} ({s.tier?.name || 'Member'})
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {actionMessage && (
              <div
                style={{
                  marginTop: '12px',
                  padding: '10px 14px',
                  borderRadius: '6px',
                  backgroundColor: actionMessage.isError ? '#fde8e8' : '#def7ec',
                  color: actionMessage.isError ? '#9b1c1c' : '#03543f',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                }}
              >
                {actionMessage.text}
              </div>
            )}
          </div>

          {detailLoading ? (
            <div style={{ padding: '60px', textAlign: 'center', color: 'var(--ink-muted)' }}>
              Đang tra cứu dữ liệu khách hàng...
            </div>
          ) : detailCustomer ? (
            <div className={styles.detailGrid}>
              {/* Left Column: Customer Profile Info */}
              <div className={styles.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--ink)' }}>
                      {detailCustomer.full_name || 'Khách hàng'}
                    </h3>
                    <div style={{ color: 'var(--ink-muted)', fontSize: '0.875rem', marginTop: '4px' }}>
                      SĐT: <strong style={{ color: 'var(--ink)' }}>{detailCustomer.phone || 'Chưa cập nhật'}</strong>
                      {detailCustomer.email && ` · ${detailCustomer.email}`}
                    </div>
                  </div>
                  <span className={styles.tierBadge} style={{ fontSize: '0.875rem', padding: '6px 14px' }}>
                    {tierIcons[detailCustomer.tier?.code || 'MEMBER']} {detailCustomer.tier?.name || 'Member'}
                  </span>
                </div>

                {/* Point Balance Big Display */}
                <div
                  style={{
                    background: 'linear-gradient(135deg, #1b263b, #0d1b2a)',
                    color: 'white',
                    padding: '20px',
                    borderRadius: '12px',
                    marginBottom: '20px',
                  }}
                >
                  <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.8 }}>
                    Ví Điểm Khả Dụng Hiện Tại
                  </div>
                  <div style={{ fontSize: '2.25rem', fontWeight: 800, marginTop: '4px', color: '#68d391' }}>
                    {formatVND(detailCustomer.point_balance || 0)}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', fontSize: '0.8rem', opacity: 0.9 }}>
                    <span>Tổng chi tiêu: <strong>{formatVND(detailCustomer.total_spending || 0)}</strong></span>
                    <span>Hoàn điểm: <strong>{detailCustomer.tier?.cashback_rate || 3}%</strong> / đơn</span>
                  </div>
                </div>

                {/* Transaction history for this customer */}
                <h4 style={{ fontSize: '0.875rem', textTransform: 'uppercase', color: 'var(--ink-muted)', margin: '16px 0 8px' }}>
                  Lịch sử điểm gần đây ({detailCustomer.transactions?.length || 0})
                </h4>
                <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
                  {(!detailCustomer.transactions || detailCustomer.transactions.length === 0) ? (
                    <div style={{ fontSize: '0.8rem', color: 'var(--ink-muted)', padding: '12px 0' }}>
                      Chưa có lịch sử giao dịch điểm nào.
                    </div>
                  ) : (
                    detailCustomer.transactions.map((tx: PointTransaction) => (
                      <div
                        key={tx.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          padding: '10px 0',
                          borderBottom: '1px solid var(--border-light)',
                          fontSize: '0.825rem',
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{tx.description || tx.type}</div>
                          <div style={{ color: 'var(--ink-muted)', fontSize: '0.75rem' }}>
                            {new Date(tx.created_at).toLocaleString('vi-VN')}
                            {tx.reference_id && ` · Ref: ${tx.reference_id}`}
                          </div>
                        </div>
                        <div
                          style={{
                            fontWeight: 700,
                            color: tx.amount > 0 ? '#1b8a5a' : '#d9381e',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {tx.amount > 0 ? `+${formatVND(tx.amount)}` : formatVND(tx.amount)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Right Column: Fast Point Deduction Form */}
              <div className={styles.card}>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                  <button
                    type="button"
                    className={`${styles.subTabBtn} ${adjustMode === 'DEDUCT' ? styles.activeSubTab : ''}`}
                    onClick={() => setAdjustMode('DEDUCT')}
                    style={{ flex: 1, justifyContent: 'center' }}
                  >
                    🔻 Trừ điểm (Áp vào đơn nước)
                  </button>
                  <button
                    type="button"
                    className={`${styles.subTabBtn} ${adjustMode === 'ADD' ? styles.activeSubTab : ''}`}
                    onClick={() => setAdjustMode('ADD')}
                    style={{ flex: 1, justifyContent: 'center' }}
                  >
                    ➕ Cộng điểm thưởng
                  </button>
                </div>

                <form onSubmit={handleAdjustPoints}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>
                      {adjustMode === 'DEDUCT' ? 'Số điểm muốn trừ (VNĐ)' : 'Số điểm muốn cộng thưởng (VNĐ)'}
                    </label>
                    <input
                      type="number"
                      placeholder="VD: 20000"
                      value={adjustAmount}
                      onChange={(e) => setAdjustAmount(e.target.value ? Number(e.target.value) : '')}
                      className={styles.formInput}
                      min="1000"
                      step="1000"
                      required
                    />

                    {/* Quick selection pills */}
                    <div className={styles.quickPillRow}>
                      <button type="button" className={styles.quickPill} onClick={() => setAdjustAmount(10000)}>10.000đ</button>
                      <button type="button" className={styles.quickPill} onClick={() => setAdjustAmount(20000)}>20.000đ</button>
                      <button type="button" className={styles.quickPill} onClick={() => setAdjustAmount(30000)}>30.000đ</button>
                      <button type="button" className={styles.quickPill} onClick={() => setAdjustAmount(50000)}>50.000đ</button>
                      {adjustMode === 'DEDUCT' && (
                        <button
                          type="button"
                          className={styles.quickPill}
                          onClick={() => setAdjustAmount(detailCustomer.point_balance || 0)}
                          style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
                        >
                          Trừ hết ({formatVND(detailCustomer.point_balance || 0)})
                        </button>
                      )}
                    </div>
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Mã đơn hàng / Bàn số (Tùy chọn)</label>
                    <input
                      type="text"
                      placeholder="VD: CF-0012, Bàn 4, Mang về..."
                      value={orderCode}
                      onChange={(e) => setOrderCode(e.target.value)}
                      className={styles.formInput}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Ghi chú / Lý do</label>
                    <input
                      type="text"
                      placeholder={adjustMode === 'DEDUCT' ? 'VD: Trừ điểm thanh toán đơn nước' : 'VD: Thưởng tích cực / tri ân'}
                      value={adjustReason}
                      onChange={(e) => setAdjustReason(e.target.value)}
                      className={styles.formInput}
                    />
                  </div>

                  {/* Balance Preview */}
                  {typeof adjustAmount === 'number' && adjustAmount > 0 && (
                    <div className={styles.previewBox}>
                      <div>
                        <div className={styles.previewLabel}>Số dư sau thao tác:</div>
                        <div
                          className={styles.previewValue}
                          style={{
                            color: adjustMode === 'DEDUCT'
                              ? ((detailCustomer.point_balance - adjustAmount) < 0 ? '#d9381e' : '#1b8a5a')
                              : '#1b8a5a',
                          }}
                        >
                          {adjustMode === 'DEDUCT'
                            ? formatVND(detailCustomer.point_balance - adjustAmount)
                            : formatVND(detailCustomer.point_balance + adjustAmount)}
                        </div>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--ink-muted)' }}>
                        {adjustMode === 'DEDUCT' ? 'Giảm từ ví khách' : 'Tăng thêm vào ví'}
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    className={`${styles.submitBtn} ${adjustMode === 'ADD' ? styles.addPointsBtn : ''}`}
                    disabled={adjustSubmitting}
                  >
                    {adjustSubmitting
                      ? 'Đang xử lý...'
                      : adjustMode === 'DEDUCT'
                      ? `Xác nhận Trừ Điểm Khách Hàng`
                      : `Xác nhận Cộng Điểm Thưởng`}
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <div className={styles.card} style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--ink-muted)' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>📱</div>
              <h4 style={{ color: 'var(--ink)', margin: '0 0 6px' }}>Chưa chọn khách hàng</h4>
              <p style={{ margin: 0, fontSize: '0.875rem' }}>
                Nhập số điện thoại vào ô tìm kiếm phía trên để tra cứu hồ sơ khách hàng và thực hiện trừ điểm áp đơn hàng.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
