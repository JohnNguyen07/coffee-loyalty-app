'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import styles from './RevenuePanel.module.css';
import { formatVND } from '@/data/menu';
import {
  CASH_CATEGORY_LABELS,
  DENOMINATION_VALUES,
  calculateDenominationsTotal,
  type CashTransactionCategory,
  type CashTransactionType,
  type DateRangePreset,
  type DenominationKey,
  type RevenueSummaryResult,
  type ShiftSession,
} from '@/lib/revenue/domain';
import type {
  DetailedRevenueOrder,
  RevenueReportResponse,
} from '@/lib/revenue/repository';

export default function RevenuePanel() {
  const [activeTab, setActiveTab] = useState<'SALES' | 'CASHBOOK' | 'SHIFTS'>('SALES');
  const [preset, setPreset] = useState<DateRangePreset>('TODAY');
  const [customFrom, setCustomFrom] = useState<string>('');
  const [customTo, setCustomTo] = useState<string>('');
  const [channelFilter, setChannelFilter] = useState<'ALL' | 'POS' | 'WEB'>('ALL');

  // Report data from server
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [reportData, setReportData] = useState<RevenueReportResponse | null>(null);

  // Table filters
  const [orderSearchText, setOrderSearchText] = useState<string>('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('ALL');

  // Modal states
  const [showTransactionModal, setShowTransactionModal] = useState<boolean>(false);
  const [txType, setTxType] = useState<CashTransactionType>('PAYMENT');
  const [txCategory, setTxCategory] = useState<CashTransactionCategory>('RAW_MATERIAL');
  const [txAmount, setTxAmount] = useState<string>('');
  const [txPaymentMethod, setTxPaymentMethod] = useState<'CASH' | 'BANK_TRANSFER'>('CASH');
  const [txRecipientPayer, setTxRecipientPayer] = useState<string>('');
  const [txNotes, setTxNotes] = useState<string>('');
  const [submittingTx, setSubmittingTx] = useState<boolean>(false);

  // Open Shift Modal
  const [showOpenShiftModal, setShowOpenShiftModal] = useState<boolean>(false);
  const [shiftNameInput, setShiftNameInput] = useState<string>('Ca Sáng');
  const [openingCashInput, setOpeningCashInput] = useState<string>('500000');
  const [openShiftNotes, setOpenShiftNotes] = useState<string>('');
  const [submittingOpenShift, setSubmittingOpenShift] = useState<boolean>(false);

  // Close Shift Modal & Denomination Counter
  const [showCloseShiftModal, setShowCloseShiftModal] = useState<boolean>(false);
  const [denomCounts, setDenomCounts] = useState<Partial<Record<DenominationKey, number>>>({});
  const [retainedCashInput, setRetainedCashInput] = useState<string>('500000');
  const [closeShiftNotes, setCloseShiftNotes] = useState<string>('');
  const [submittingCloseShift, setSubmittingCloseShift] = useState<boolean>(false);

  // Print Z-Report Modal
  const [zReportShift, setZReportShift] = useState<ShiftSession | null>(null);

  const fetchRevenueReport = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const params = new URLSearchParams();
      params.set('preset', preset);
      if (preset === 'CUSTOM' && customFrom && customTo) {
        params.set('customFrom', customFrom);
        params.set('customTo', customTo);
      }
      if (channelFilter !== 'ALL') {
        params.set('channel', channelFilter);
      }

      const res = await fetch(`/api/revenue/summary?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || 'Không thể tải báo cáo doanh thu.');
      } else {
        setReportData(data);
      }
    } catch {
      setErrorMsg('Lỗi kết nối máy chủ khi tải báo cáo doanh thu.');
    } finally {
      setLoading(false);
    }
  }, [preset, customFrom, customTo, channelFilter]);

  useEffect(() => {
    fetchRevenueReport();
  }, [fetchRevenueReport]);

  // Denomination counter sum
  const countedActualCash = useMemo(() => {
    return calculateDenominationsTotal(denomCounts);
  }, [denomCounts]);

  // Handle Create Cash Transaction
  const handleCreateTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(txAmount.replace(/\D/g, '')) || 0;
    if (amount <= 0) {
      alert('Vui lòng nhập số tiền hợp lệ lớn hơn 0đ');
      return;
    }
    setSubmittingTx(true);
    try {
      const res = await fetch('/api/revenue/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_transaction',
          type: txType,
          category: txCategory,
          amount,
          paymentMethod: txPaymentMethod,
          recipientPayer: txRecipientPayer,
          notes: txNotes,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMsg(`✓ Đã lập ${txType === 'RECEIPT' ? 'Phiếu Thu' : 'Phiếu Chi'} #${data.transaction?.code || ''} thành công!`);
        setShowTransactionModal(false);
        setTxAmount('');
        setTxRecipientPayer('');
        setTxNotes('');
        await fetchRevenueReport();
      } else {
        setErrorMsg(data.error || 'Không thể tạo phiếu thu chi.');
      }
    } catch {
      setErrorMsg('Lỗi kết nối máy chủ khi lập phiếu.');
    } finally {
      setSubmittingTx(false);
    }
  };

  // Handle Open Shift
  const handleOpenShift = async (e: React.FormEvent) => {
    e.preventDefault();
    const openingCash = Number(openingCashInput.replace(/\D/g, '')) || 0;
    setSubmittingOpenShift(true);
    try {
      const res = await fetch('/api/revenue/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'open_shift',
          shiftName: shiftNameInput,
          openingCash,
          notes: openShiftNotes,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMsg(`✓ Đã mở ca bán hàng [${data.shift?.shiftName || shiftNameInput}] thành công!`);
        setShowOpenShiftModal(false);
        await fetchRevenueReport();
      } else {
        setErrorMsg(data.error || 'Lỗi mở ca bán hàng.');
      }
    } catch {
      setErrorMsg('Lỗi kết nối máy chủ khi mở ca.');
    } finally {
      setSubmittingOpenShift(false);
    }
  };

  // Handle Close Shift
  const handleCloseShift = async (e: React.FormEvent) => {
    e.preventDefault();
    const actualCash = countedActualCash;
    const cashRetained = Number(retainedCashInput.replace(/\D/g, '')) || 0;
    setSubmittingCloseShift(true);
    try {
      const res = await fetch('/api/revenue/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'close_shift',
          actualCash,
          cashRetained,
          notes: closeShiftNotes,
          denominations: denomCounts,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMsg('✓ Đã chốt ca bán hàng và lưu kết quả đối soát thành công!');
        setShowCloseShiftModal(false);
        setDenomCounts({});
        if (data.shift) {
          setZReportShift(data.shift);
        }
        await fetchRevenueReport();
      } else {
        setErrorMsg(data.error || 'Lỗi khi chốt ca.');
      }
    } catch {
      setErrorMsg('Lỗi kết nối khi chốt ca.');
    } finally {
      setSubmittingCloseShift(false);
    }
  };

  const rawOrders = reportData?.orders;
  const filteredOrders = useMemo(() => {
    if (!rawOrders) return [];
    const q = orderSearchText.trim().toLowerCase();
    return rawOrders.filter((ord: DetailedRevenueOrder) => {
      const matchesStatus = orderStatusFilter === 'ALL' || ord.status === orderStatusFilter;
      const matchesSearch =
        !q ||
        ord.orderCode.toLowerCase().includes(q) ||
        ord.customerName.toLowerCase().includes(q) ||
        ord.customerPhone.includes(q) ||
        ord.itemsSummary.toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [rawOrders, orderSearchText, orderStatusFilter]);

  const summary = reportData?.summary;
  const metrics = summary?.metrics;
  const cashRec = summary?.cashReconciliation;
  const cashbook = reportData?.cashbook;
  const activeShift = reportData?.activeShift;
  const shiftHistory = reportData?.shiftHistory || [];

  // Max revenue for hourly chart scaling
  const maxHourlyRevenue = useMemo(() => {
    if (!summary?.hourlySales) return 100000;
    return Math.max(...summary.hourlySales.map((h) => h.revenue), 100000);
  }, [summary?.hourlySales]);

  return (
    <div className={styles.panel}>
      {/* ── Top Header & Filter Bar ── */}
      <div className={styles.headerBar}>
        <div>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>Module B — Quản Trị Doanh Thu &amp; Sổ Quỹ</h1>
            <span className={styles.locationBadge}>
              {reportData?.staff.locationName || 'Ủ LAB — Quầy Chính'}
            </span>
          </div>
          <p className={styles.subtitle}>
            Báo cáo bán hàng, sổ quỹ thu chi thời gian thực, quản lý ca và kiểm đếm két tiền mặt chuẩn F&amp;B.
          </p>
        </div>

        <div className={styles.filterActionsRow}>
          {/* Preset Buttons */}
          <div className={styles.presetGroup} role="group" aria-label="Khoảng thời gian báo cáo">
            {(
              [
                { key: 'TODAY', label: 'Hôm nay' },
                { key: 'YESTERDAY', label: 'Hôm qua' },
                { key: 'LAST_7_DAYS', label: '7 ngày' },
                { key: 'THIS_MONTH', label: 'Tháng này' },
                { key: 'CUSTOM', label: 'Tùy chọn...' },
              ] as const
            ).map((p) => (
              <button
                key={p.key}
                type="button"
                className={`${styles.presetBtn} ${preset === p.key ? styles.presetBtnActive : ''}`}
                onClick={() => setPreset(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Channel Filter */}
          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value as 'ALL' | 'POS' | 'WEB')}
            className={styles.channelSelect}
            aria-label="Kênh bán hàng"
          >
            <option value="ALL">Tất cả kênh</option>
            <option value="POS">🛒 POS Quầy</option>
            <option value="WEB">🌐 Đặt Web</option>
          </select>

          <button
            type="button"
            className={styles.refreshBtn}
            onClick={fetchRevenueReport}
            disabled={loading}
          >
            {loading ? 'Đang tính...' : '↻ Làm mới'}
          </button>
        </div>
      </div>

      {/* Custom Date Pickers */}
      {preset === 'CUSTOM' && (
        <div className={styles.customDateBar}>
          <span>Từ ngày:</span>
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className={styles.dateInput}
          />
          <span>Đến ngày:</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className={styles.dateInput}
          />
          <button
            type="button"
            className={styles.applyDateBtn}
            onClick={fetchRevenueReport}
          >
            Xem số liệu
          </button>
        </div>
      )}

      {/* Shift Banner Status */}
      <div className={styles.shiftBannerBar}>
        <div className={styles.shiftStatusGroup}>
          <span>Trạng thái ca:</span>
          {activeShift ? (
            <span className={styles.shiftOpenBadge}>
              🟢 {activeShift.shiftName} (#{activeShift.code}) · Mở lúc {new Date(activeShift.openedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} · {activeShift.openedByName}
            </span>
          ) : (
            <span className={styles.shiftClosedBadge}>
              ⚪ Chưa có ca làm việc nào đang mở
            </span>
          )}
        </div>

        <div className={styles.shiftActionBtns}>
          {activeShift ? (
            <button
              type="button"
              className={styles.closeShiftBtn}
              onClick={() => setShowCloseShiftModal(true)}
            >
              🏁 Chốt Ca &amp; Bàn Giao Két
            </button>
          ) : (
            <button
              type="button"
              className={styles.openShiftBtn}
              onClick={() => setShowOpenShiftModal(true)}
            >
              ▶ Mở Ca Bán Hàng Mới
            </button>
          )}
        </div>
      </div>

      {/* Notifications */}
      {errorMsg && <div className={styles.errorBanner}>⚠️ {errorMsg}</div>}
      {successMsg && <div className={styles.successBanner}>{successMsg}</div>}

      {/* ── 3 Main Navigation Tabs ── */}
      <div className={styles.mainNavTabs}>
        <button
          type="button"
          className={`${styles.navTabBtn} ${activeTab === 'SALES' ? styles.navTabBtnActive : ''}`}
          onClick={() => setActiveTab('SALES')}
        >
          📊 Báo Cáo Bán Hàng &amp; Doanh Thu
        </button>
        <button
          type="button"
          className={`${styles.navTabBtn} ${activeTab === 'CASHBOOK' ? styles.navTabBtnActive : ''}`}
          onClick={() => setActiveTab('CASHBOOK')}
        >
          📒 Sổ Quỹ Thu - Chi (Tiền Mặt &amp; Ngân Hàng)
        </button>
        <button
          type="button"
          className={`${styles.navTabBtn} ${activeTab === 'SHIFTS' ? styles.navTabBtnActive : ''}`}
          onClick={() => setActiveTab('SHIFTS')}
        >
          🔒 Quản Lý Ca &amp; Két Tiền ({shiftHistory.length} ca)
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          TAB 1: BÁO CÁO DOANH THU & BÁN HÀNG
         ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'SALES' && (
        <>
          {/* 4 Core Dashboard Metric Cards */}
          <div className={styles.metricsGrid}>
            <div className={styles.metricCard}>
              <div className={styles.metricIconWrap}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="6" width="20" height="12" rx="2" />
                  <circle cx="12" cy="12" r="2" />
                  <path d="M6 12h.01M18 12h.01" />
                </svg>
              </div>
              <div className={styles.metricBody}>
                <span className={styles.metricLabel}>Doanh thu đơn đã thanh toán</span>
                <div className={styles.metricValueRow}>
                  <span className={styles.metricNum}>
                    {metrics ? metrics.paidOrderRevenue.toLocaleString('vi-VN') : '0'}
                  </span>
                  <span className={styles.metricUnit}>VND</span>
                </div>
                <div className={styles.metricSubInfo}>
                  <span>Gộp: {formatVND(summary?.orderRevenue.grossSales || 0)}</span>
                  {(summary?.orderRevenue.discounts || 0) > 0 && (
                    <span> · Giảm: -{formatVND(summary?.orderRevenue.discounts || 0)}</span>
                  )}
                </div>
              </div>
            </div>

            <div className={styles.metricCard}>
              <div className={styles.metricIconWrapBlue}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
                  <path d="M8 7h8M8 11h8M8 15h5" />
                </svg>
              </div>
              <div className={styles.metricBody}>
                <span className={styles.metricLabel}>Số đơn hàng &amp; AOV</span>
                <div className={styles.metricValueRow}>
                  <span className={styles.metricNum}>{metrics ? metrics.orderCount : 0}</span>
                  <span className={styles.metricUnit}>Đơn</span>
                </div>
                <div className={styles.metricSubInfo}>
                  <span>AOV: {formatVND(summary?.orderRevenue.averageOrderValue || 0)}/đơn</span>
                </div>
              </div>
            </div>

            <div className={styles.metricCard}>
              <div className={styles.metricIconWrapGold}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
                  <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
                  <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
                </svg>
              </div>
              <div className={styles.metricBody}>
                <span className={styles.metricLabel}>Tiền mặt thu bán hàng</span>
                <div className={styles.metricValueRow}>
                  <span className={styles.metricNum}>
                    {summary ? summary.collection.cashCollected.toLocaleString('vi-VN') : '0'}
                  </span>
                  <span className={styles.metricUnit}>VND</span>
                </div>
                <div className={styles.metricSubInfo}>
                  <span>Lý thuyết két: {formatVND(cashRec?.expectedCash || 0)}</span>
                </div>
              </div>
            </div>

            <div className={styles.metricCard}>
              <div className={styles.metricIconWrap}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m8 3 4 4-4 4" />
                  <path d="M4 7h8a4 4 0 0 1 4 4v1" />
                  <path d="m16 21-4-4 4-4" />
                  <path d="M20 17h-8a4 4 0 0 1-4-4v-1" />
                </svg>
              </div>
              <div className={styles.metricBody}>
                <span className={styles.metricLabel}>Chuyển khoản VietQR</span>
                <div className={styles.metricValueRow}>
                  <span className={styles.metricNum}>
                    {summary ? summary.collection.bankTransferCollected.toLocaleString('vi-VN') : '0'}
                  </span>
                  <span className={styles.metricUnit}>VND</span>
                </div>
                <div className={styles.metricSubInfo}>
                  <span>Ví ĐT: {formatVND(summary?.collection.ewalletCollected || 0)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Visual Analytics Row: Hourly Chart + Best Sellers */}
          <div className={styles.analyticsRow}>
            {/* Hourly Sales Bar Chart */}
            <div className={styles.chartCard}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>📈 Doanh Thu Theo Giờ (06:00 - 22:00)</h3>
                <span className={styles.cardBadge}>Hôm nay</span>
              </div>
              <div className={styles.hourlyChartWrap}>
                {summary?.hourlySales.map((h) => {
                  const heightPercent = maxHourlyRevenue > 0 ? Math.round((h.revenue / maxHourlyRevenue) * 100) : 0;
                  return (
                    <div key={h.hourLabel} className={styles.hourlyBarCol}>
                      {h.revenue > 0 && (
                        <span className={styles.hourlyBarVal}>
                          {h.revenue >= 1000000 ? `${(h.revenue / 1000000).toFixed(1)}M` : `${Math.round(h.revenue / 1000)}k`}
                        </span>
                      )}
                      <div
                        className={styles.hourlyBar}
                        style={{ height: `${Math.max(4, heightPercent)}%` }}
                        title={`${h.hourLabel}: ${h.orderCount} đơn · ${formatVND(h.revenue)}`}
                      />
                      <span className={styles.hourlyBarLabel}>{h.hourLabel.slice(0, 2)}h</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Top Best Sellers */}
            <div className={styles.bestSellerCard}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>🏆 Top Đồ Uống Bán Chạy</h3>
                <span className={styles.cardBadge}>Xếp hạng</span>
              </div>
              <div className={styles.bestSellerList}>
                {summary?.bestSellers && summary.bestSellers.length > 0 ? (
                  summary.bestSellers.map((item, idx) => (
                    <div key={item.productName} className={styles.bestSellerRow}>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <span className={styles.rankBadge}>{idx + 1}</span>
                        <div>
                          <span className={styles.bestSellerName}>{item.productName}</span>
                          <span className={styles.bestSellerCategory}>[{item.categoryName}]</span>
                        </div>
                      </div>
                      <div className={styles.bestSellerNumbers}>
                        <span className={styles.bestSellerQty}>{item.quantitySold} ly</span>
                        <span className={styles.bestSellerRev}>{formatVND(item.totalRevenue)}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p style={{ color: '#94a3b8', fontSize: '0.8125rem', textAlign: 'center', margin: '20px 0' }}>
                    Chưa có số liệu đồ uống bán ra trong kỳ đối soát.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Detailed Orders Table */}
          <div className={styles.tableSection}>
            <div className={styles.tableHeaderBar}>
              <div>
                <h3 className={styles.tableSectionTitle}>
                  Chi Tiết Đơn Hàng Bán Ra ({filteredOrders.length} đơn)
                </h3>
                <p className={styles.tableSectionSub}>
                  Toàn bộ đơn hàng ghi nhận doanh thu trong kỳ đối soát.
                </p>
              </div>

              <div className={styles.tableFilters}>
                <select
                  value={orderStatusFilter}
                  onChange={(e) => setOrderStatusFilter(e.target.value)}
                  className={styles.channelSelect}
                >
                  <option value="ALL">Tất cả trạng thái</option>
                  <option value="CONFIRMED">Đã thanh toán (CONFIRMED)</option>
                  <option value="CANCELLED">Đã hủy (CANCELLED)</option>
                  <option value="PENDING">Chờ xử lý (PENDING)</option>
                </select>

                <input
                  type="search"
                  placeholder="Tìm mã đơn, khách, món..."
                  value={orderSearchText}
                  onChange={(e) => setOrderSearchText(e.target.value)}
                  className={styles.searchInput}
                />
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className={styles.revenueTable}>
                <thead>
                  <tr>
                    <th>Mã đơn &amp; Thời gian</th>
                    <th>Kênh &amp; Khách hàng</th>
                    <th>Món nước</th>
                    <th>Tạm tính</th>
                    <th>Giảm giá</th>
                    <th>Thực thu (Net)</th>
                    <th>Phương thức</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={8} className={styles.tableEmpty}>
                        Không có đơn hàng nào khớp với bộ lọc.
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.map((ord) => (
                      <tr key={ord.id}>
                        <td>
                          <span className={styles.codeMono}>#{ord.orderCode}</span>
                          <span className={styles.dateCell}>
                            {new Date(ord.createdAt).toLocaleString('vi-VN', {
                              hour: '2-digit',
                              minute: '2-digit',
                              day: '2-digit',
                              month: '2-digit',
                            })}
                          </span>
                        </td>
                        <td>
                          <strong>{ord.customerName}</strong>
                          <span className={styles.dateCell}>
                            {ord.channel === 'POS' ? '🛒 POS Quầy' : '🌐 Website'}
                            {ord.customerPhone ? ` · ${ord.customerPhone}` : ''}
                          </span>
                        </td>
                        <td>{ord.itemsSummary}</td>
                        <td>{formatVND(ord.subtotal)}</td>
                        <td>
                          {ord.discountAmount > 0 ? (
                            <span style={{ color: '#dc2626', fontWeight: 600 }}>-{formatVND(ord.discountAmount)}</span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>
                          <strong style={{ color: '#006241' }}>{formatVND(ord.totalDue)}</strong>
                        </td>
                        <td>
                          {ord.paymentMethod === 'CASH'
                            ? '💵 Tiền mặt'
                            : ord.paymentMethod === 'BANK_TRANSFER'
                              ? '🏦 Chuyển khoản'
                              : '📱 Ví ĐT'}
                        </td>
                        <td>
                          {ord.status === 'CONFIRMED' ? (
                            <span className={styles.receiptBadge}>✓ Đã thanh toán</span>
                          ) : ord.status === 'CANCELLED' ? (
                            <span className={styles.paymentBadge}>✕ Đã hủy &amp; hoàn</span>
                          ) : (
                            <span>Chờ xử lý</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB 2: SỔ QUỸ THU - CHI (TIỀN MẶT & NGÂN HÀNG)
         ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'CASHBOOK' && (
        <>
          {/* 4 Cashbook Overview Cards */}
          <div className={styles.metricsGrid}>
            <div className={styles.metricCard}>
              <div className={styles.metricIconWrapBlue}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="M6 12h12M12 6v12" />
                </svg>
              </div>
              <div className={styles.metricBody}>
                <span className={styles.metricLabel}>Số dư quỹ đầu kỳ</span>
                <div className={styles.metricValueRow}>
                  <span className={styles.metricNum}>
                    {cashbook ? cashbook.openingBalance.toLocaleString('vi-VN') : '0'}
                  </span>
                  <span className={styles.metricUnit}>VND</span>
                </div>
                <div className={styles.metricSubInfo}>
                  <span>Tiền thối &amp; tiền quỹ chuyển sang</span>
                </div>
              </div>
            </div>

            <div className={styles.metricCard}>
              <div className={styles.metricIconWrap}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m16 8-8 8M8 8v8h8" />
                </svg>
              </div>
              <div className={styles.metricBody}>
                <span className={styles.metricLabel}>Tổng Thu trong kỳ (+)</span>
                <div className={styles.metricValueRow}>
                  <span className={styles.metricNum} style={{ color: '#15803d' }}>
                    +{cashbook ? cashbook.totalIn.toLocaleString('vi-VN') : '0'}
                  </span>
                  <span className={styles.metricUnit}>VND</span>
                </div>
                <div className={styles.metricSubInfo}>
                  <span>Rót tiền thối, thu nợ, thu khác</span>
                </div>
              </div>
            </div>

            <div className={styles.metricCard}>
              <div className={styles.metricIconWrapRed}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m8 16 8-8M8 8h8v8" />
                </svg>
              </div>
              <div className={styles.metricBody}>
                <span className={styles.metricLabel}>Tổng Chi trong kỳ (−)</span>
                <div className={styles.metricValueRow}>
                  <span className={styles.metricNum} style={{ color: '#dc2626' }}>
                    −{cashbook ? cashbook.totalOut.toLocaleString('vi-VN') : '0'}
                  </span>
                  <span className={styles.metricUnit}>VND</span>
                </div>
                <div className={styles.metricSubInfo}>
                  <span>Mua đá, sữa, bao bì, điện nước, ship</span>
                </div>
              </div>
            </div>

            <div className={styles.metricCard}>
              <div className={styles.metricIconWrapGold}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
                  <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
                  <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
                </svg>
              </div>
              <div className={styles.metricBody}>
                <span className={styles.metricLabel}>Số dư quỹ hiện tại</span>
                <div className={styles.metricValueRow}>
                  <span className={styles.metricNum}>
                    {cashbook ? cashbook.closingBalance.toLocaleString('vi-VN') : '0'}
                  </span>
                  <span className={styles.metricUnit}>VND</span>
                </div>
                <div className={styles.metricSubInfo}>
                  <span>Số dư thực tế trong sổ quỹ</span>
                </div>
              </div>
            </div>
          </div>

          {/* Cashbook Action Bar */}
          <div className={styles.cashbookActionRow}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                Nhật Ký Dòng Tiền (Sổ Cái Thu - Chi)
              </h3>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                Ghi nhận minh bạch mọi biến động tiền mặt và chuyển khoản tại cửa hàng.
              </span>
            </div>

            <div className={styles.actionBtnGroup}>
              <button
                type="button"
                className={styles.createReceiptBtn}
                onClick={() => {
                  setTxType('RECEIPT');
                  setTxCategory('OPENING_FLOAT');
                  setShowTransactionModal(true);
                }}
              >
                + Lập Phiếu Thu
              </button>
              <button
                type="button"
                className={styles.createPaymentBtn}
                onClick={() => {
                  setTxType('PAYMENT');
                  setTxCategory('RAW_MATERIAL');
                  setShowTransactionModal(true);
                }}
              >
                − Lập Phiếu Chi
              </button>
            </div>
          </div>

          {/* Cash Transactions Table */}
          <div className={styles.tableSection}>
            <div style={{ overflowX: 'auto' }}>
              <table className={styles.revenueTable}>
                <thead>
                  <tr>
                    <th>Mã phiếu &amp; Thời gian</th>
                    <th>Loại &amp; Phương thức</th>
                    <th>Danh mục thu / chi</th>
                    <th>Người nhận / Nộp</th>
                    <th>Diễn giải lý do</th>
                    <th>Số tiền</th>
                    <th>Số dư tích lũy</th>
                    <th>Người lập</th>
                  </tr>
                </thead>
                <tbody>
                  {!cashbook || cashbook.transactions.length === 0 ? (
                    <tr>
                      <td colSpan={8} className={styles.tableEmpty}>
                        Chưa có phiếu thu / chi nào trong kỳ này. Bấm [+ Lập Phiếu Thu] hoặc [− Lập Phiếu Chi] để ghi nhận.
                      </td>
                    </tr>
                  ) : (
                    cashbook.transactions.map((tx) => (
                      <tr key={tx.id}>
                        <td>
                          <span className={styles.codeMono}>#{tx.code}</span>
                          <span className={styles.dateCell}>
                            {new Date(tx.createdAt).toLocaleString('vi-VN', {
                              hour: '2-digit',
                              minute: '2-digit',
                              day: '2-digit',
                              month: '2-digit',
                            })}
                          </span>
                        </td>
                        <td>
                          {tx.type === 'RECEIPT' ? (
                            <span className={styles.receiptBadge}>+ Phiếu Thu</span>
                          ) : (
                            <span className={styles.paymentBadge}>− Phiếu Chi</span>
                          )}
                          <span className={styles.dateCell}>
                            {tx.paymentMethod === 'CASH' ? '💵 Tiền mặt' : '🏦 Ngân hàng'}
                          </span>
                        </td>
                        <td>
                          <strong>{CASH_CATEGORY_LABELS[tx.category] || tx.category}</strong>
                        </td>
                        <td>{tx.recipientPayer}</td>
                        <td>{tx.notes || '—'}</td>
                        <td>
                          <strong style={{ color: tx.type === 'RECEIPT' ? '#15803d' : '#dc2626' }}>
                            {tx.type === 'RECEIPT' ? `+${formatVND(tx.amount)}` : `−${formatVND(tx.amount)}`}
                          </strong>
                        </td>
                        <td>
                          <strong>{formatVND(tx.runningBalance || 0)}</strong>
                        </td>
                        <td>{tx.createdByName}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB 3: QUẢN LÝ CA & KÉT TIỀN (SHIFTS & RECONCILIATION)
         ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'SHIFTS' && (
        <>
          {/* Active Shift Card */}
          {activeShift ? (
            <div className={styles.activeShiftCard}>
              <div className={styles.activeShiftHeader}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#006241' }}>
                    🟢 {activeShift.shiftName} (#{activeShift.code}) — ĐANG MỞ
                  </h3>
                  <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                    Bắt đầu lúc: {new Date(activeShift.openedAt).toLocaleString('vi-VN')} · Thu ngân trực: {activeShift.openedByName}
                  </span>
                </div>
                <button
                  type="button"
                  className={styles.closeShiftBtn}
                  onClick={() => setShowCloseShiftModal(true)}
                >
                  🏁 Kiểm Đếm &amp; Chốt Ca
                </button>
              </div>

              <div className={styles.shiftStatsGrid}>
                <div className={styles.shiftStatBox}>
                  <span>1. Tiền thối đầu ca</span>
                  <strong>{formatVND(activeShift.openingCash)}</strong>
                </div>
                <div className={styles.shiftStatBox}>
                  <span>2. Tiền mặt bán trong ca</span>
                  <strong style={{ color: '#15803d' }}>+{formatVND(activeShift.cashSales)}</strong>
                </div>
                <div className={styles.shiftStatBox}>
                  <span>3. Tiền hoàn đơn hủy</span>
                  <strong style={{ color: '#dc2626' }}>−{formatVND(activeShift.cashRefunds)}</strong>
                </div>
                <div className={`${styles.shiftStatBox} ${styles.expectedBox}`}>
                  <span>4. Tiền lý thuyết trong két</span>
                  <strong>{formatVND(activeShift.expectedCash)}</strong>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ background: '#f8fafc', padding: '24px', borderRadius: '12px', textAlign: 'center', marginBottom: '24px', border: '1px dashed #cbd5e1' }}>
              <p style={{ margin: '0 0 12px 0', fontSize: '0.9375rem', fontWeight: 600, color: '#475569' }}>
                Hiện chưa có ca làm việc nào đang mở tại quầy.
              </p>
              <button
                type="button"
                className={styles.openShiftBtn}
                onClick={() => setShowOpenShiftModal(true)}
              >
                ▶ Mở Ca Bán Hàng Đầu Ngày
              </button>
            </div>
          )}

          {/* Shift History List */}
          <div className={styles.tableSection}>
            <div className={styles.tableHeaderBar}>
              <div>
                <h3 className={styles.tableSectionTitle}>Lịch Sử Các Ca Bán Hàng Đã Chốt</h3>
                <p className={styles.tableSectionSub}>Lưu vết đối soát kiểm đếm, chênh lệch tiền két và biên bản bàn giao.</p>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className={styles.revenueTable}>
                <thead>
                  <tr>
                    <th>Mã ca &amp; Tên ca</th>
                    <th>Thời gian ca</th>
                    <th>Thu ngân</th>
                    <th>Tiền đầu ca</th>
                    <th>Bán tiền mặt</th>
                    <th>Lý thuyết két</th>
                    <th>Thực tế đếm</th>
                    <th>Chênh lệch</th>
                    <th>Nộp chủ quán</th>
                    <th>Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {shiftHistory.length === 0 ? (
                    <tr>
                      <td colSpan={10} className={styles.tableEmpty}>
                        Chưa có ca làm việc nào được chốt trong lịch sử.
                      </td>
                    </tr>
                  ) : (
                    shiftHistory.map((sh) => (
                      <tr key={sh.id}>
                        <td>
                          <span className={styles.codeMono}>#{sh.code}</span>
                          <span className={styles.dateCell}>{sh.shiftName}</span>
                        </td>
                        <td>
                          <span>{new Date(sh.openedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} - {sh.closedAt ? new Date(sh.closedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                          <span className={styles.dateCell}>{new Date(sh.openedAt).toLocaleDateString('vi-VN')}</span>
                        </td>
                        <td>
                          <strong>{sh.closedByName || sh.openedByName}</strong>
                        </td>
                        <td>{formatVND(sh.openingCash)}</td>
                        <td>{formatVND(sh.cashSales)}</td>
                        <td>{formatVND(sh.expectedCash)}</td>
                        <td>
                          <strong>{formatVND(sh.actualCash || 0)}</strong>
                        </td>
                        <td>
                          {sh.varianceStatus === 'BALANCED' ? (
                            <span className={styles.receiptBadge}>✓ Khớp (0đ)</span>
                          ) : sh.varianceStatus === 'SURPLUS' ? (
                            <span style={{ color: '#15803d', fontWeight: 700 }}>Thừa +{formatVND(sh.cashVariance || 0)}</span>
                          ) : (
                            <span style={{ color: '#dc2626', fontWeight: 700 }}>Thiếu {formatVND(sh.cashVariance || 0)}</span>
                          )}
                        </td>
                        <td>
                          <strong style={{ color: '#006241' }}>{formatVND(sh.cashHandedOver || 0)}</strong>
                        </td>
                        <td>
                          <button
                            type="button"
                            className={styles.refreshBtn}
                            style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                            onClick={() => setZReportShift(sh)}
                          >
                            🖨️ In Phiếu Z
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── MODAL: LẬP PHIẾU THU / PHIẾU CHI ── */}
      {showTransactionModal && (
        <div className={styles.modalOverlay} onClick={() => setShowTransactionModal(false)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                {txType === 'RECEIPT' ? '➕ Lập Phiếu Thu Tiền' : '➖ Lập Phiếu Chi Tiền Mặt'}
              </h3>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setShowTransactionModal(false)}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateTransaction}>
              <div className={styles.modalBody}>
                <div className={styles.formGroup}>
                  <label>Loại phiếu:</label>
                  <select
                    value={txType}
                    onChange={(e) => setTxType(e.target.value as CashTransactionType)}
                    className={styles.formSelect}
                  >
                    <option value="PAYMENT">Phiếu Chi (Tiền ra khỏi két)</option>
                    <option value="RECEIPT">Phiếu Thu (Tiền vào két)</option>
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label>Danh mục phân loại:</label>
                  <select
                    value={txCategory}
                    onChange={(e) => setTxCategory(e.target.value as CashTransactionCategory)}
                    className={styles.formSelect}
                  >
                    {txType === 'PAYMENT' ? (
                      <>
                        <option value="RAW_MATERIAL">Nguyên liệu mua ngoài (Đá bi, sữa, chanh sả...)</option>
                        <option value="PACKAGING">Bao bì &amp; Dụng cụ (Ly, ống hút, túi...)</option>
                        <option value="UTILITIES">Sinh hoạt &amp; Tiện ích (Điện, nước, rác, gửi xe...)</option>
                        <option value="SALARY_ADVANCE">Tạm ứng lương nhân viên</option>
                        <option value="SHIPPING">Chi phí giao hàng (Shipper ngoài)</option>
                        <option value="BANK_DEPOSIT">Nộp tiền vào ngân hàng (Chuyển quỹ)</option>
                        <option value="OTHER">Chi phí khác</option>
                      </>
                    ) : (
                      <>
                        <option value="OPENING_FLOAT">Nạp thêm tiền thối quầy (Rót quỹ)</option>
                        <option value="OTHER">Thu hồi / Thu khác</option>
                      </>
                    )}
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label>Số tiền (VND):</label>
                  <input
                    type="text"
                    required
                    placeholder="VD: 50000"
                    value={txAmount}
                    onChange={(e) => setTxAmount(e.target.value)}
                    className={styles.formInput}
                    autoFocus
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Phương thức giao dịch:</label>
                  <select
                    value={txPaymentMethod}
                    onChange={(e) => setTxPaymentMethod(e.target.value as 'CASH' | 'BANK_TRANSFER')}
                    className={styles.formSelect}
                  >
                    <option value="CASH">Tiền mặt tại két</option>
                    <option value="BANK_TRANSFER">Chuyển khoản ngân hàng</option>
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label>{txType === 'PAYMENT' ? 'Người nhận tiền:' : 'Người nộp tiền:'}</label>
                  <input
                    type="text"
                    required
                    placeholder="VD: Chú Tư giao đá bi, Shipper Viettel..."
                    value={txRecipientPayer}
                    onChange={(e) => setTxRecipientPayer(e.target.value)}
                    className={styles.formInput}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Diễn giải / Ghi chú chi tiết:</label>
                  <input
                    type="text"
                    placeholder="VD: Mua 5 bao đá bi ca chiều"
                    value={txNotes}
                    onChange={(e) => setTxNotes(e.target.value)}
                    className={styles.formInput}
                  />
                </div>

                <div className={styles.modalFooter}>
                  <button
                    type="button"
                    className={styles.cancelModalBtn}
                    onClick={() => setShowTransactionModal(false)}
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="submit"
                    className={styles.submitBtn}
                    disabled={submittingTx}
                  >
                    {submittingTx ? 'Đang lưu...' : 'Xác Nhận Lưu Phiếu'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: MỞ CA BÁN HÀNG ── */}
      {showOpenShiftModal && (
        <div className={styles.modalOverlay} onClick={() => setShowOpenShiftModal(false)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>▶ Mở Ca Bán Hàng Mới</h3>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setShowOpenShiftModal(false)}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleOpenShift}>
              <div className={styles.modalBody}>
                <div className={styles.formGroup}>
                  <label>Tên ca làm việc:</label>
                  <input
                    type="text"
                    required
                    value={shiftNameInput}
                    onChange={(e) => setShiftNameInput(e.target.value)}
                    placeholder="Ca Sáng (06:30 - 14:00)"
                    className={styles.formInput}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Tiền thối nhận đầu ca (Opening Float):</label>
                  <input
                    type="text"
                    required
                    value={openingCashInput}
                    onChange={(e) => setOpeningCashInput(e.target.value)}
                    placeholder="500000"
                    className={styles.formInput}
                  />
                  <span style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '4px', display: 'block' }}>
                    Số tiền mặt có sẵn trong két để thối tiền cho khách hàng.
                  </span>
                </div>

                <div className={styles.formGroup}>
                  <label>Ghi chú ca (nếu có):</label>
                  <input
                    type="text"
                    value={openShiftNotes}
                    onChange={(e) => setOpenShiftNotes(e.target.value)}
                    placeholder="VD: Nhận đủ tiền thối từ quản lý"
                    className={styles.formInput}
                  />
                </div>

                <div className={styles.modalFooter}>
                  <button
                    type="button"
                    className={styles.cancelModalBtn}
                    onClick={() => setShowOpenShiftModal(false)}
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className={styles.submitBtn}
                    disabled={submittingOpenShift}
                  >
                    {submittingOpenShift ? 'Đang mở ca...' : 'Xác Nhận Mở Ca'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: CHỐT CA & BẢNG KÊ MỆNH GIÁ TỜ TIỀN ── */}
      {showCloseShiftModal && activeShift && (
        <div className={styles.modalOverlay} onClick={() => setShowCloseShiftModal(false)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>🏁 Chốt Ca &amp; Bảng Kê Tiền Mặt Két</h3>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setShowCloseShiftModal(false)}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCloseShift}>
              <div className={styles.modalBody}>
                <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', marginBottom: '14px', fontSize: '0.8125rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span>1. Tiền lý thuyết phải có trong két:</span>
                    <strong style={{ color: '#006241' }}>{formatVND(activeShift.expectedCash)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span>2. Tiền mặt THỰC TẾ kiểm đếm được:</span>
                    <strong style={{ color: '#0f172a' }}>{formatVND(countedActualCash)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '4px', borderTop: '1px dashed #cbd5e1' }}>
                    <span>👉 Chênh lệch két:</span>
                    <strong>
                      {countedActualCash === activeShift.expectedCash ? (
                        <span style={{ color: '#15803d' }}>✓ Khớp 100% (0đ)</span>
                      ) : countedActualCash > activeShift.expectedCash ? (
                        <span style={{ color: '#15803d' }}>Thừa +{formatVND(countedActualCash - activeShift.expectedCash)}</span>
                      ) : (
                        <span style={{ color: '#dc2626' }}>Thiếu {formatVND(countedActualCash - activeShift.expectedCash)}</span>
                      )}
                    </strong>
                  </div>
                </div>

                <label style={{ fontSize: '0.8125rem', fontWeight: 700, display: 'block', marginBottom: '6px' }}>
                  Bảng kê chi tiết số tờ tiền kiểm đếm:
                </label>

                <table className={styles.denominationTable}>
                  <thead>
                    <tr>
                      <th>Mệnh giá</th>
                      <th>Số tờ</th>
                      <th>Thành tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(Object.keys(DENOMINATION_VALUES) as DenominationKey[]).map((key) => {
                      const denomVal = DENOMINATION_VALUES[key];
                      const count = denomCounts[key] || 0;
                      return (
                        <tr key={key}>
                          <td><strong>{formatVND(denomVal)}</strong></td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              placeholder="0"
                              value={count > 0 ? count : ''}
                              onChange={(e) => {
                                const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                                setDenomCounts((prev) => ({ ...prev, [key]: val }));
                              }}
                              className={styles.denomCountInput}
                            />
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {formatVND(count * denomVal)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <div className={styles.formGroup}>
                  <label>Giữ lại két cho ca sau làm tiền thối:</label>
                  <input
                    type="text"
                    value={retainedCashInput}
                    onChange={(e) => setRetainedCashInput(e.target.value)}
                    className={styles.formInput}
                  />
                  <span style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px', display: 'block' }}>
                    Tiền nộp về chủ quán / két an toàn: <strong>{formatVND(Math.max(0, countedActualCash - (Number(retainedCashInput.replace(/\D/g, '')) || 0)))}</strong>
                  </span>
                </div>

                <div className={styles.formGroup}>
                  <label>Ghi chú chốt ca / Lý do chênh lệch (nếu có):</label>
                  <input
                    type="text"
                    placeholder="VD: Tiền két khớp chuẩn, đã nộp cho quản lý..."
                    value={closeShiftNotes}
                    onChange={(e) => setCloseShiftNotes(e.target.value)}
                    className={styles.formInput}
                  />
                </div>

                <div className={styles.modalFooter}>
                  <button
                    type="button"
                    className={styles.cancelModalBtn}
                    onClick={() => setShowCloseShiftModal(false)}
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className={styles.submitBtn}
                    disabled={submittingCloseShift}
                  >
                    {submittingCloseShift ? 'Đang chốt ca...' : 'Xác Nhận Chốt Ca & Két'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: IN PHIẾU CHỐT CA (Z-REPORT) ── */}
      {zReportShift && (
        <div className={styles.modalOverlay} onClick={() => setZReportShift(null)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>🖨️ Phiếu Chốt Ca Bán Hàng (Z-Report)</h3>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setZReportShift(null)}
              >
                &times;
              </button>
            </div>

            <div className={styles.modalBody}>
              {/* Thermal Receipt Visual Preview */}
              <div className={styles.thermalReceipt}>
                <div className={styles.thermalReceiptHeader}>
                  <h4>Ủ LAB COFFEE &amp; MATCHA</h4>
                  <span>BIÊN BẢN CHỐT CA BÁN HÀNG</span>
                  <div>#{zReportShift.code}</div>
                </div>

                <div className={styles.thermalRow}>
                  <span>Điểm bán:</span>
                  <strong>{reportData?.staff.locationName || 'Ủ LAB'}</strong>
                </div>
                <div className={styles.thermalRow}>
                  <span>Tên ca:</span>
                  <strong>{zReportShift.shiftName}</strong>
                </div>
                <div className={styles.thermalRow}>
                  <span>Bắt đầu:</span>
                  <span>{new Date(zReportShift.openedAt).toLocaleString('vi-VN')}</span>
                </div>
                <div className={styles.thermalRow}>
                  <span>Kết thúc:</span>
                  <span>{zReportShift.closedAt ? new Date(zReportShift.closedAt).toLocaleString('vi-VN') : '—'}</span>
                </div>
                <div className={styles.thermalRow}>
                  <span>Thu ngân:</span>
                  <strong>{zReportShift.closedByName || zReportShift.openedByName}</strong>
                </div>

                <div className={styles.thermalDivider} />

                <div className={styles.thermalRow}>
                  <span>Tiền thối đầu ca:</span>
                  <span>{formatVND(zReportShift.openingCash)}</span>
                </div>
                <div className={styles.thermalRow}>
                  <span>+ Bán hàng tiền mặt:</span>
                  <span>{formatVND(zReportShift.cashSales)}</span>
                </div>
                <div className={styles.thermalRow}>
                  <span>− Hoàn tiền đơn hủy:</span>
                  <span>−{formatVND(zReportShift.cashRefunds)}</span>
                </div>
                <div className={styles.thermalRow}>
                  <span>− Chi khẩn cấp tại quầy:</span>
                  <span>−{formatVND(zReportShift.cashOut || 0)}</span>
                </div>

                <div className={styles.thermalDivider} />

                <div className={styles.thermalRow}>
                  <strong>LÝ THUYẾT KÉT:</strong>
                  <strong>{formatVND(zReportShift.expectedCash)}</strong>
                </div>
                <div className={styles.thermalRow}>
                  <strong>THỰC TẾ ĐẾM:</strong>
                  <strong>{formatVND(zReportShift.actualCash || 0)}</strong>
                </div>
                <div className={styles.thermalRow}>
                  <span>CHÊNH LỆCH:</span>
                  <strong>
                    {zReportShift.cashVariance === 0
                      ? 'KHỚP (0đ)'
                      : (zReportShift.cashVariance || 0) > 0
                        ? `THỪA +${formatVND(zReportShift.cashVariance || 0)}`
                        : `THIẾU ${formatVND(zReportShift.cashVariance || 0)}`}
                  </strong>
                </div>

                <div className={styles.thermalDivider} />

                <div className={styles.thermalRow}>
                  <span>Giữ lại ca sau:</span>
                  <span>{formatVND(zReportShift.cashRetained || 0)}</span>
                </div>
                <div className={styles.thermalRow}>
                  <strong>NỘP VỀ QUẢN LÝ:</strong>
                  <strong>{formatVND(zReportShift.cashHandedOver || 0)}</strong>
                </div>

                {zReportShift.notes && (
                  <div style={{ marginTop: '8px', fontSize: '0.72rem' }}>
                    Ghi chú: {zReportShift.notes}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px', textAlign: 'center' }}>
                  <div>
                    <span>Thu ngân ký</span>
                    <div style={{ height: '35px' }} />
                    <small>({zReportShift.closedByName || 'Thu ngân'})</small>
                  </div>
                  <div>
                    <span>Quản lý nhận tiền</span>
                    <div style={{ height: '35px' }} />
                    <small>(Ký và ghi rõ họ tên)</small>
                  </div>
                </div>
              </div>

              <button
                type="button"
                className={styles.printBtn}
                onClick={() => window.print()}
              >
                🖨️ In Phiếu Z Ra Máy In Nhiệt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
