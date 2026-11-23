'use client';

import { useState, useEffect, useCallback } from 'react';
import styles from './CustomersPanel.module.css';
import { formatVND } from '@/data/menu';
import { type MvpRole, canAdjustMemberPoints } from '@/lib/rbac/domain';

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
  transactions?: PointTransaction[];
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
  userRole?: MvpRole;
  roleLoaded?: boolean;
}

export default function CustomersPanel({
  initialSubTab = 'detail',
  userRole,
  roleLoaded,
}: CustomersPanelProps) {
  const normalizedInit = initialSubTab === 'all' || initialSubTab === 'members' ? 'list' : initialSubTab;
  const [subTab, setSubTab] = useState<'list' | 'detail'>(normalizedInit);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('ALL');

  const [fallbackRole, setFallbackRole] = useState<MvpRole | null>(null);
  const [fallbackRoleLoaded, setFallbackRoleLoaded] = useState(false);

  useEffect(() => {
    if (userRole !== undefined && roleLoaded !== undefined) return;
    let active = true;
    fetch('/api/rbac/profile')
      .then((res) => res.json())
      .then((data) => {
        if (active && data.success && data.profile?.role) {
          setFallbackRole(data.profile.role as MvpRole);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setFallbackRoleLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [userRole, roleLoaded]);

  const effectiveRole = roleLoaded !== undefined ? (roleLoaded ? userRole : null) : fallbackRole;
  const effectiveRoleLoaded = roleLoaded !== undefined ? roleLoaded : fallbackRoleLoaded;
  const canAdjustPoints = Boolean(effectiveRoleLoaded && effectiveRole && canAdjustMemberPoints(effectiveRole));

  // Customer Detail & Point Deduction State
  const [detailCustomer, setDetailCustomer] = useState<Customer | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [phoneLookup, setPhoneLookup] = useState('');
  const [suggestions, setSuggestions] = useState<Customer[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Quick point adjustment modal/form state
  const [adjustMode, setAdjustMode] = useState<'EARN_BY_BILL' | 'ADD' | 'DEDUCT'>('EARN_BY_BILL');
  const [billAmountInput, setBillAmountInput] = useState<number | ''>('');
  const [adjustAmount, setAdjustAmount] = useState<number | ''>('');
  const [orderCode, setOrderCode] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustSubmitting, setAdjustSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  // Create / Edit Customer Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formInitialPoints, setFormInitialPoints] = useState('0');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

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
  }, [search, tierFilter]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

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

  // Handle Create or Edit Customer
  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSubmitting(true);
    setModalError(null);
    setActionMessage(null);
    try {
      if (editingCustomer) {
        const res = await fetch('/api/admin/customers', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingCustomer.id,
            full_name: formName,
            phone: formPhone,
            email: formEmail,
          }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          setActionMessage({ text: data.message || 'Đã cập nhật thông tin khách hàng!' });
          setEditingCustomer(null);
          setShowCreateModal(false);
          setModalError(null);
          await fetchCustomers();
          if (detailCustomer?.id === editingCustomer.id) {
            await loadCustomerDetail({ id: editingCustomer.id });
          }
        } else {
          setModalError(data.error || 'Lỗi cập nhật khách hàng');
        }
      } else {
        const cleanPassword = formPassword.trim();
        if (cleanPassword.length < 6) {
          setModalError('Mật khẩu đăng nhập phải có ít nhất 6 ký tự.');
          setFormSubmitting(false);
          return;
        }

        const res = await fetch('/api/admin/customers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            full_name: formName,
            phone: formPhone,
            email: formEmail,
            password: cleanPassword,
            require_password: true,
            initial_points: canAdjustPoints ? Number(formInitialPoints) || 0 : 0,
          }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          setActionMessage({ text: data.message || 'Đã tạo thành viên mới thành công!' });
          setShowCreateModal(false);
          setModalError(null);
          setFormName('');
          setFormPhone('');
          setFormEmail('');
          setFormPassword('');
          setShowPassword(false);
          setFormInitialPoints('0');
          await fetchCustomers();
          if (data.customer?.id) {
            setSubTab('detail');
            await loadCustomerDetail({ id: data.customer.id });
          }
        } else {
          setModalError(data.error || 'Lỗi tạo khách hàng mới');
        }
      }
    } catch {
      setModalError('Lỗi kết nối máy chủ');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Handle Point Adjustment (Owner/Admin only: Cộng theo % hóa đơn, Cộng trực tiếp, hoặc Trừ điểm)
  const handleAdjustPoints = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canAdjustPoints) {
      setActionMessage({
        text: 'Chỉ tài khoản Owner hoặc Admin mới có quyền thêm hoặc trừ điểm thành viên.',
        isError: true,
      });
      return;
    }
    if (!detailCustomer) {
      setActionMessage({ text: 'Vui lòng chọn khách hàng trước', isError: true });
      return;
    }

    const tierRate = Number(detailCustomer.tier?.cashback_rate) || 3;
    const billNum = Number(billAmountInput) || 0;
    const amountNum =
      adjustMode === 'EARN_BY_BILL'
        ? Math.floor((billNum * tierRate) / 100)
        : Number(adjustAmount) || 0;

    if (adjustMode === 'EARN_BY_BILL' && billNum < 1000) {
      setActionMessage({ text: 'Vui lòng nhập giá trị hóa đơn hợp lệ (từ 1.000đ trở lên)', isError: true });
      return;
    }

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

    if (adjustMode === 'DEDUCT' && billNum > 0 && amountNum > billNum) {
      setActionMessage({
        text: `Số điểm trừ (${formatVND(amountNum)}) không được vượt quá giá trị đơn hàng (${formatVND(billNum)})!`,
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
          billAmount:
            adjustMode === 'EARN_BY_BILL' || (adjustMode === 'DEDUCT' && billNum > 0)
              ? billNum
              : undefined,
          orderCode: orderCode.trim(),
          reason: adjustReason.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setActionMessage({ text: data.message });
        await loadCustomerDetail({ id: detailCustomer.id });
        await fetchCustomers();
        setBillAmountInput('');
        setAdjustAmount('');
        setOrderCode('');
        setAdjustReason('');
      } else {
        setActionMessage({ text: data.error || 'Lỗi thực hiện thao tác', isError: true });
      }
    } catch (err) {
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

  const openNewCustomerModal = (prefillPhone = '') => {
    setEditingCustomer(null);
    setModalError(null);
    setFormName('');
    setFormPhone(prefillPhone.replace(/\D/g, ''));
    setFormEmail('');
    setFormPassword('');
    setShowPassword(false);
    setFormInitialPoints('0');
    setShowCreateModal(true);
  };

  const openEditCustomerModal = (cust: Customer) => {
    setEditingCustomer(cust);
    setModalError(null);
    setFormName(cust.full_name || '');
    setFormPhone(cust.phone || '');
    setFormEmail(cust.email || '');
    setFormPassword('');
    setShowPassword(false);
    setShowCreateModal(true);
  };

  // Metrics
  const totalSpending = customers.reduce((sum, c) => sum + (Number(c.total_spending) || 0), 0);
  const totalPoints = customers.reduce((sum, c) => sum + (Number(c.point_balance) || 0), 0);

  return (
    <div className={styles.panel}>
      {/* Header */}
      <div className={styles.header} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div className={styles.titleArea}>
          <h2 className={styles.title}>👥 Quản lý Khách hàng &amp; Ví Điểm</h2>
          <span className={styles.badge}>{customers.length} tài khoản</span>
        </div>
        <button
          type="button"
          className={`${styles.actionBtn} ${styles.primaryActionBtn}`}
          style={{ padding: '9px 16px', fontWeight: 700 }}
          onClick={() => openNewCustomerModal(phoneLookup)}
        >
          + Thêm khách hàng mới
        </button>
      </div>

      {/* Unified feedback banner visible across both sub-tabs */}
      {actionMessage && (
        <div
          style={{
            marginBottom: '12px',
            padding: '10px 14px',
            borderRadius: '8px',
            backgroundColor: actionMessage.isError ? '#fde8e8' : '#def7ec',
            color: actionMessage.isError ? '#9b1c1c' : '#03543f',
            fontSize: '0.875rem',
            fontWeight: 600,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <span>{actionMessage.text}</span>
          {subTab === 'detail' && actionMessage.isError && phoneLookup.replace(/\D/g, '').length >= 9 && (
            <button
              type="button"
              onClick={() => openNewCustomerModal(phoneLookup)}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                background: '#006241',
                color: '#fff',
                border: 'none',
                fontWeight: 700,
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              + Tạo ngay khách mới ({phoneLookup.replace(/\D/g, '')})
            </button>
          )}
        </div>
      )}

      {/* Sub Tabs */}
      <div className={styles.subTabs}>
        <button
          className={`${styles.subTabBtn} ${subTab === 'detail' ? styles.activeSubTab : ''}`}
          onClick={() => setSubTab('detail')}
        >
          <span>🔍</span> {canAdjustPoints ? 'Tra cứu & Cộng/Trừ điểm' : 'Tra cứu khách hàng'}
        </button>
        <button
          className={`${styles.subTabBtn} ${subTab === 'list' ? styles.activeSubTab : ''}`}
          onClick={() => setSubTab('list')}
        >
          <span>📋</span> Danh sách thành viên ({customers.length})
        </button>
      </div>

      {/* TAB: MEMBERS LIST */}
      {subTab === 'list' && (
        <>
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
              <span className={styles.statLabel}>Khách hàng VIP (Gold &amp; Diamond)</span>
              <span className={styles.statValue}>
                {customers.filter((c) => ['GOLD', 'DIAMOND'].includes(c.tier?.code || '')).length}
              </span>
            </div>
          </div>

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
                        <td style={{ textAlign: 'right', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            className={styles.actionBtn}
                            onClick={() => openEditCustomerModal(c)}
                          >
                            ✏️ Sửa
                          </button>
                          <button
                            type="button"
                            className={`${styles.actionBtn} ${styles.primaryActionBtn}`}
                            onClick={() => handleSelectCustomerForDetail(c)}
                          >
                            {canAdjustPoints ? 'Cộng/Trừ điểm · Chi tiết' : 'Xem chi tiết'}
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

      {/* TAB: CUSTOMER DETAIL & QUICK POINT DEDUCTION */}
      {subTab === 'detail' && (
        <div>
          <div className={styles.card} style={{ marginBottom: 'var(--space-4)' }}>
            <h3 className={styles.cardTitle}>
              <span>⚡</span> Nhập Số Điện Thoại để Tra Cứu &amp; Trừ Điểm Khách Hàng
            </h3>
            <div style={{ position: 'relative' }}>
              <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  placeholder="Nhập số điện thoại khách (VD: 0947038325, 0907960109)..."
                  value={phoneLookup}
                  onChange={(e) => setPhoneLookup(e.target.value)}
                  onFocus={() => {
                    if (suggestions.length > 0) setShowSuggestions(true);
                  }}
                  className={styles.formInput}
                  style={{ flex: 1, minWidth: 220, fontSize: '1rem', fontWeight: 600, letterSpacing: '0.04em' }}
                />
                <button
                  type="button"
                  className={`${styles.actionBtn} ${styles.primaryActionBtn}`}
                  style={{ padding: '0 20px', whiteSpace: 'nowrap' }}
                  onClick={() => loadCustomerDetail({ phone: phoneLookup })}
                >
                  Tìm kiếm
                </button>
                <button
                  type="button"
                  className={styles.actionBtn}
                  style={{ padding: '0 16px', whiteSpace: 'nowrap', fontWeight: 700 }}
                  onClick={() => openNewCustomerModal(phoneLookup)}
                >
                  + Đăng ký SĐT mới
                </button>
              </div>

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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <h3 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--ink)' }}>
                        {detailCustomer.full_name || 'Khách hàng'}
                      </h3>
                      <button
                        type="button"
                        onClick={() => openEditCustomerModal(detailCustomer)}
                        style={{
                          padding: '2px 8px',
                          fontSize: '0.75rem',
                          borderRadius: 6,
                          border: '1px solid #cbd5e1',
                          background: '#f8fafc',
                          cursor: 'pointer',
                        }}
                      >
                        ✏️ Sửa
                      </button>
                    </div>
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

              {/* Right Column: Member Point Adjustment (OWNER & ADMIN only) */}
              <div className={styles.card}>
                {!canAdjustPoints ? (
                  <div
                    style={{
                      padding: '28px 20px',
                      borderRadius: 12,
                      background: '#f8fafc',
                      border: '1px dashed #cbd5e1',
                      textAlign: 'center',
                      color: '#334155',
                    }}
                  >
                    <div style={{ fontSize: '2rem', marginBottom: 8 }}>🔒</div>
                    <h4 style={{ margin: '0 0 8px', color: '#0f172a', fontSize: '1rem' }}>
                      Không có quyền cộng / trừ điểm thủ công
                    </h4>
                    <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: 1.55, color: '#475569' }}>
                      Chỉ tài khoản <strong>Owner</strong> hoặc <strong>Admin</strong> mới có quyền cộng hoặc trừ điểm thủ công cho thành viên. Nhân viên thu ngân vẫn tích/trừ điểm tự động theo đơn hàng tại màn hình POS.
                    </p>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className={`${styles.subTabBtn} ${adjustMode === 'EARN_BY_BILL' ? styles.activeSubTab : ''}`}
                        onClick={() => setAdjustMode('EARN_BY_BILL')}
                        style={{ flex: 1, justifyContent: 'center', minWidth: 120 }}
                      >
                        ➕ Tích theo hóa đơn
                      </button>
                      <button
                        type="button"
                        className={`${styles.subTabBtn} ${adjustMode === 'ADD' ? styles.activeSubTab : ''}`}
                        onClick={() => setAdjustMode('ADD')}
                        style={{ flex: 1, justifyContent: 'center', minWidth: 120 }}
                      >
                        🎁 Cộng điểm trực tiếp
                      </button>
                      <button
                        type="button"
                        className={`${styles.subTabBtn} ${adjustMode === 'DEDUCT' ? styles.activeSubTab : ''}`}
                        onClick={() => setAdjustMode('DEDUCT')}
                        style={{ flex: 1, justifyContent: 'center', minWidth: 110 }}
                      >
                        🔻 Trừ điểm
                      </button>
                    </div>

                    {adjustMode === 'EARN_BY_BILL' ? (
                      <div
                        style={{
                          marginBottom: 14,
                          padding: '10px 12px',
                          borderRadius: 8,
                          background: '#ecfdf5',
                          border: '1px solid #a7f3d0',
                          color: '#065f46',
                          fontSize: '0.8rem',
                          lineHeight: 1.45,
                        }}
                      >
                        <strong>🎁 Hạng hiện tại: {detailCustomer.tier?.name || 'Member'} (Hoàn {detailCustomer.tier?.cashback_rate || 3}%)</strong>
                        <div>
                          Nhập tổng tiền hóa đơn để tự động cộng <strong>{detailCustomer.tier?.cashback_rate || 3}%</strong> vào ví khách.{' '}
                          <span style={{ color: '#92400e', fontWeight: 700 }}>
                            (Lưu ý: Đơn nào có trừ tiền tích lũy thì đơn đó không tích điểm)
                          </span>
                        </div>
                      </div>
                    ) : adjustMode === 'ADD' ? (
                      <div
                        style={{
                          marginBottom: 14,
                          padding: '10px 12px',
                          borderRadius: 8,
                          background: '#eff6ff',
                          border: '1px solid #bfdbfe',
                          color: '#1e40af',
                          fontSize: '0.8rem',
                          lineHeight: 1.45,
                        }}
                      >
                        <strong>🎁 Cộng điểm trực tiếp (Owner / Admin):</strong>
                        <div>
                          Cộng thẳng số điểm mong muốn vào ví thành viên (thưởng sự kiện, bù điểm hoặc điều chỉnh thủ công).
                        </div>
                      </div>
                    ) : (
                      <div
                        style={{
                          marginBottom: 14,
                          padding: '10px 12px',
                          borderRadius: 8,
                          background: '#fffbeb',
                          border: '1px solid #fde68a',
                          color: '#92400e',
                          fontSize: '0.8rem',
                          lineHeight: 1.45,
                        }}
                      >
                        <strong>⚠️ Trừ điểm thành viên (Owner / Admin):</strong>
                        <div>
                          Trừ trực tiếp số dư ví điểm của khách hàng.{' '}
                          <strong>Đơn có áp dụng trừ tiền sẽ không được tích điểm mới (0đ).</strong>
                        </div>
                      </div>
                    )}

                    <form onSubmit={handleAdjustPoints}>
                      {adjustMode === 'EARN_BY_BILL' ? (
                        <div className={styles.formGroup}>
                          <label className={styles.formLabel}>
                            Giá trị đơn hàng / hóa đơn thanh toán (VNĐ) *
                          </label>
                          <input
                            type="number"
                            placeholder="Nhập tiền đơn nước (VD: 35000, 40000, 75000)..."
                            value={billAmountInput}
                            onChange={(e) => setBillAmountInput(e.target.value ? Number(e.target.value) : '')}
                            className={styles.formInput}
                            min="1000"
                            step="1000"
                            required
                          />

                          <div className={styles.quickPillRow}>
                            {[30000, 35000, 40000, 45000, 70000, 75000, 100000].map((val) => (
                              <button
                                key={val}
                                type="button"
                                className={styles.quickPill}
                                onClick={() => setBillAmountInput(val)}
                              >
                                {formatVND(val)}
                              </button>
                            ))}
                            <button
                              type="button"
                              className={styles.quickPill}
                              style={{ borderColor: '#006241', color: '#006241', fontWeight: 700 }}
                              onClick={() =>
                                setBillAmountInput((prev) => (Number(prev) || 0) + 5000)
                              }
                              title="Cộng thêm 5.000đ tiền topping vào giá trị hóa đơn"
                            >
                              +5.000đ (Topping)
                            </button>
                          </div>
                        </div>
                      ) : adjustMode === 'ADD' ? (
                        <div className={styles.formGroup}>
                          <label className={styles.formLabel}>
                            Số điểm muốn cộng trực tiếp (VNĐ) *
                          </label>
                          <input
                            type="number"
                            placeholder="VD: 10000"
                            value={adjustAmount}
                            onChange={(e) => setAdjustAmount(e.target.value ? Number(e.target.value) : '')}
                            className={styles.formInput}
                            min="1000"
                            step="1000"
                            required
                          />

                          <div className={styles.quickPillRow}>
                            {[5000, 10000, 20000, 50000, 100000].map((val) => (
                              <button
                                key={val}
                                type="button"
                                className={styles.quickPill}
                                onClick={() => setAdjustAmount(val)}
                              >
                                +{formatVND(val)}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className={styles.formGroup}>
                            <label className={styles.formLabel}>
                              Số điểm muốn trừ (VNĐ) *
                            </label>
                            <input
                              type="number"
                              placeholder="VD: 15000"
                              value={adjustAmount}
                              onChange={(e) => setAdjustAmount(e.target.value ? Number(e.target.value) : '')}
                              className={styles.formInput}
                              min="1000"
                              step="1000"
                              required
                            />

                            <div className={styles.quickPillRow}>
                              <button type="button" className={styles.quickPill} onClick={() => setAdjustAmount(10000)}>10.000đ</button>
                              <button type="button" className={styles.quickPill} onClick={() => setAdjustAmount(20000)}>20.000đ</button>
                              <button type="button" className={styles.quickPill} onClick={() => setAdjustAmount(30000)}>30.000đ</button>
                              <button type="button" className={styles.quickPill} onClick={() => setAdjustAmount(50000)}>50.000đ</button>
                              <button
                                type="button"
                                className={styles.quickPill}
                                onClick={() => setAdjustAmount(detailCustomer.point_balance || 0)}
                                style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
                              >
                                Trừ tối đa ({formatVND(detailCustomer.point_balance || 0)})
                              </button>
                            </div>
                          </div>

                          <div className={styles.formGroup}>
                            <label className={styles.formLabel}>
                              Tổng tiền đơn nước (Tùy chọn · Để tính tiền khách cần trả thêm)
                            </label>
                            <input
                              type="number"
                              placeholder="VD: 40000"
                              value={billAmountInput}
                              onChange={(e) => setBillAmountInput(e.target.value ? Number(e.target.value) : '')}
                              className={styles.formInput}
                              min="0"
                              step="1000"
                            />
                          </div>
                        </>
                      )}

                      <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Mã đơn hàng / Bàn số (Tùy chọn)</label>
                        <input
                          type="text"
                          placeholder="VD: POS-..., CF-0012..."
                          value={orderCode}
                          onChange={(e) => setOrderCode(e.target.value)}
                          className={styles.formInput}
                        />
                      </div>

                      <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Ghi chú / Lý do</label>
                        <input
                          type="text"
                          placeholder={
                            adjustMode === 'DEDUCT'
                              ? 'VD: Điều chỉnh trừ điểm thành viên'
                              : adjustMode === 'ADD'
                                ? 'VD: Thưởng / cộng bù điểm thành viên'
                                : 'VD: Khách đọc SĐT tích điểm tại quầy'
                          }
                          value={adjustReason}
                          onChange={(e) => setAdjustReason(e.target.value)}
                          className={styles.formInput}
                        />
                      </div>

                      {adjustMode === 'EARN_BY_BILL' && typeof billAmountInput === 'number' && billAmountInput > 0 && (
                        <div className={styles.previewBox}>
                          <div>
                            <div className={styles.previewLabel}>
                              Điểm cộng ({detailCustomer.tier?.cashback_rate || 3}% hạng {detailCustomer.tier?.name || 'Member'}):
                            </div>
                            <div className={styles.previewValue} style={{ color: '#1b8a5a' }}>
                              +{formatVND(Math.floor((billAmountInput * (Number(detailCustomer.tier?.cashback_rate) || 3)) / 100))}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', fontSize: '0.8rem', color: 'var(--ink-muted)' }}>
                            <div>Số dư ví mới:</div>
                            <strong style={{ color: '#1b8a5a', fontSize: '0.95rem' }}>
                              {formatVND(
                                (detailCustomer.point_balance || 0) +
                                  Math.floor((billAmountInput * (Number(detailCustomer.tier?.cashback_rate) || 3)) / 100)
                              )}
                            </strong>
                          </div>
                        </div>
                      )}

                      {adjustMode === 'ADD' && typeof adjustAmount === 'number' && adjustAmount > 0 && (
                        <div className={styles.previewBox}>
                          <div>
                            <div className={styles.previewLabel}>Số điểm cộng trực tiếp:</div>
                            <div className={styles.previewValue} style={{ color: '#1b8a5a' }}>
                              +{formatVND(adjustAmount)}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', fontSize: '0.8rem', color: 'var(--ink-muted)' }}>
                            <div>Số dư ví mới:</div>
                            <strong style={{ color: '#1b8a5a', fontSize: '0.95rem' }}>
                              {formatVND((detailCustomer.point_balance || 0) + adjustAmount)}
                            </strong>
                          </div>
                        </div>
                      )}

                      {adjustMode === 'DEDUCT' && typeof adjustAmount === 'number' && adjustAmount > 0 && (
                        <div className={styles.previewBox}>
                          <div>
                            <div className={styles.previewLabel}>Số dư ví sau khi trừ:</div>
                            <div
                              className={styles.previewValue}
                              style={{
                                color: detailCustomer.point_balance - adjustAmount < 0 ? '#d9381e' : '#1b8a5a',
                              }}
                            >
                              {formatVND(detailCustomer.point_balance - adjustAmount)}
                            </div>
                            {typeof billAmountInput === 'number' && billAmountInput > 0 && (
                              <div style={{ fontSize: '0.8rem', color: '#0f172a', marginTop: 4 }}>
                                Khách trả thêm tại quầy: <strong>{formatVND(Math.max(0, billAmountInput - adjustAmount))}</strong>
                              </div>
                            )}
                          </div>
                          <div style={{ fontSize: '0.78rem', color: '#92400e', fontWeight: 700, textAlign: 'right' }}>
                            Trừ ví: −{formatVND(adjustAmount)}
                            <br />
                            Điểm cộng đơn này: 0đ
                          </div>
                        </div>
                      )}

                      <button
                        type="submit"
                        className={`${styles.submitBtn} ${adjustMode !== 'DEDUCT' ? styles.addPointsBtn : ''}`}
                        disabled={adjustSubmitting}
                      >
                        {adjustSubmitting
                          ? 'Đang xử lý...'
                          : adjustMode === 'DEDUCT'
                            ? '✓ Xác nhận Trừ Điểm Thành Viên'
                            : adjustMode === 'ADD'
                              ? '✓ Xác nhận Cộng Điểm Trực Tiếp'
                              : `✓ Cộng +${detailCustomer.tier?.cashback_rate || 3}% Điểm Theo Hạng Thẻ`}
                      </button>
                    </form>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className={styles.card} style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--ink-muted)' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>📱</div>
              <h4 style={{ color: 'var(--ink)', margin: '0 0 6px' }}>Chưa chọn khách hàng</h4>
              <p style={{ margin: '0 0 16px', fontSize: '0.875rem' }}>
                Nhập số điện thoại vào ô tìm kiếm phía trên để tra cứu hồ sơ hoặc đăng ký thành viên mới tại quầy.
              </p>
              <button
                type="button"
                className={`${styles.actionBtn} ${styles.primaryActionBtn}`}
                onClick={() => openNewCustomerModal(phoneLookup)}
              >
                + Tạo nhanh khách hàng thành viên mới
              </button>
            </div>
          )}
        </div>
      )}

      {/* Create / Edit Customer Modal */}
      {showCreateModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 16,
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: 16,
              padding: 24,
              width: '100%',
              maxWidth: 440,
              boxShadow: '0 20px 45px rgba(0,0,0,0.2)',
            }}
          >
            <h3 style={{ margin: '0 0 6px', fontSize: '1.15rem', color: '#1e3932' }}>
              {editingCustomer ? `✏️ Cập nhật khách hàng` : '🌱 Đăng ký Thành viên Mới'}
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: '0.825rem', color: '#64748b' }}>
              {editingCustomer
                ? 'Chỉnh sửa họ tên, số điện thoại hoặc email của thành viên.'
                : 'Tạo nhanh tài khoản tích điểm theo SĐT ngay tại quầy POS.'}
            </p>

            <form onSubmit={handleSaveCustomer} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                <label className={styles.formLabel}>Họ và tên khách hàng *</label>
                <input
                  type="text"
                  required
                  placeholder="VD: Nguyễn Minh Anh"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className={styles.formInput}
                />
              </div>

              <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                <label className={styles.formLabel}>Số điện thoại tích điểm *</label>
                <input
                  type="tel"
                  required
                  placeholder="VD: 0909123456"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  className={styles.formInput}
                />
              </div>

              <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                <label className={styles.formLabel}>Email (Tùy chọn)</label>
                <input
                  type="email"
                  placeholder="VD: khachhang@gmail.com"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className={styles.formInput}
                />
              </div>

              {!editingCustomer && (
                <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 8 }}>
                    <label className={styles.formLabel} style={{ marginBottom: 0 }}>
                      Mật khẩu đăng nhập *
                    </label>
                    <button
                      type="button"
                      disabled={formPhone.replace(/\D/g, '').length < 6}
                      onClick={() => setFormPassword(formPhone.replace(/\D/g, ''))}
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: formPhone.replace(/\D/g, '').length >= 6 ? '#006241' : '#94a3b8',
                        background: 'none',
                        border: 'none',
                        cursor: formPhone.replace(/\D/g, '').length >= 6 ? 'pointer' : 'not-allowed',
                        padding: 0,
                        textDecoration: 'underline',
                      }}
                    >
                      Dùng SĐT làm mật khẩu
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      placeholder="Nhập mật khẩu cho khách (tối thiểu 6 ký tự)"
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                      className={styles.formInput}
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      className={styles.actionBtn}
                      onClick={() => setShowPassword((prev) => !prev)}
                      style={{ whiteSpace: 'nowrap' }}
                    >
                      {showPassword ? 'Ẩn' : 'Hiện'}
                    </button>
                  </div>
                </div>
              )}

              {!editingCustomer && canAdjustPoints && (
                <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                  <label className={styles.formLabel}>Điểm thưởng mở thẻ ban đầu (VNĐ)</label>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={formInitialPoints}
                    onChange={(e) => setFormInitialPoints(e.target.value)}
                    className={styles.formInput}
                  />
                </div>
              )}

              {modalError && (
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: '#fde8e8',
                    color: '#9b1c1c',
                    fontSize: '0.825rem',
                    fontWeight: 600,
                  }}
                >
                  {modalError}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                <button
                  type="button"
                  className={styles.actionBtn}
                  onClick={() => {
                    setShowCreateModal(false);
                    setModalError(null);
                  }}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className={`${styles.actionBtn} ${styles.primaryActionBtn}`}
                >
                  {formSubmitting ? 'Đang lưu...' : editingCustomer ? 'Lưu thay đổi' : '✓ Tạo thành viên'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
