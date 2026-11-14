'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import styles from './RevenuePanel.module.css';
import { formatVND } from '@/data/menu';
import {
  CASH_CATEGORY_LABELS,
  DENOMINATION_VALUES,
  calculateDenominationsTotal,
  type CashTransaction,
  type CashTransactionCategory,
  type CashTransactionType,
  type DateRangePreset,
  type DenominationKey,
  type ShiftSession,
} from '@/lib/revenue/domain';
import type {
  DetailedRevenueOrder,
  RevenueReportResponse,
} from '@/lib/revenue/repository';

const TX_PAYMENT_METHOD = 'CASH' as const;

function createClientIdempotencyKey(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function RevenuePanel() {
  const [activeTab, setActiveTab] = useState<'SALES' | 'CASHBOOK' | 'SHIFTS'>('SALES');
  const [preset, setPreset] = useState<DateRangePreset>('ALL_TIME');
  const [customFrom, setCustomFrom] = useState<string>('');
  const [customTo, setCustomTo] = useState<string>('');
  const [channelFilter, setChannelFilter] = useState<'ALL' | 'POS' | 'WEB'>('ALL');

  // Report data from server
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [reportData, setReportData] = useState<RevenueReportResponse | null>(null);

  // Orders table filters
  const [orderSearchText, setOrderSearchText] = useState<string>('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('ALL');

  // Cashbook table filters
  const [txTypeFilter, setTxTypeFilter] = useState<'ALL' | 'RECEIPT' | 'PAYMENT'>('ALL');
  const [txCategoryFilter, setTxCategoryFilter] = useState<string>('ALL');
  const [txStatusFilter, setTxStatusFilter] = useState<'ALL' | 'POSTED' | 'VOIDED'>('ALL');
  const [txSearchText, setTxSearchText] = useState<string>('');

  // Create Voucher Modal states
  const [showTransactionModal, setShowTransactionModal] = useState<boolean>(false);
  const [txType, setTxType] = useState<CashTransactionType>('PAYMENT');
  const [txCategory, setTxCategory] = useState<CashTransactionCategory>('RAW_MATERIAL');
  const [txAmount, setTxAmount] = useState<string>('');
  const [txRecipientPayer, setTxRecipientPayer] = useState<string>('');
  const [txNotes, setTxNotes] = useState<string>('');
  const [txIdemKey, setTxIdemKey] = useState<string>('');
  const [submittingTx, setSubmittingTx] = useState<boolean>(false);

  // Void Voucher Modal
  const [voidTargetTx, setVoidTargetTx] = useState<CashTransaction | null>(null);
  const [voidReason, setVoidReason] = useState<string>('');
  const [submittingVoid, setSubmittingVoid] = useState<boolean>(false);

  // Print Cashbook Voucher Modal
  const [voucherModalTx, setVoucherModalTx] = useState<CashTransaction | null>(null);

  // Open Shift Modal
  const [showOpenShiftModal, setShowOpenShiftModal] = useState<boolean>(false);
  const [shiftNameInput, setShiftNameInput] = useState<string>('Ca Sáng');
  const [openingCashInput, setOpeningCashInput] = useState<string>('500000');
  const [openShiftNotes, setOpenShiftNotes] = useState<string>('');
  const [openShiftIdemKey, setOpenShiftIdemKey] = useState<string>('');
  const [submittingOpenShift, setSubmittingOpenShift] = useState<boolean>(false);

  // Close Shift Modal & Denomination Counter
  const [showCloseShiftModal, setShowCloseShiftModal] = useState<boolean>(false);
  const [denomCounts, setDenomCounts] = useState<Partial<Record<DenominationKey, number>>>({});
  const [retainedCashInput, setRetainedCashInput] = useState<string>('500000');
  const [closeShiftNotes, setCloseShiftNotes] = useState<string>('');
  const [autoRecordHandover, setAutoRecordHandover] = useState<boolean>(true);
  const [closeShiftIdemKey, setCloseShiftIdemKey] = useState<string>('');
  const [submittingCloseShift, setSubmittingCloseShift] = useState<boolean>(false);

  // Mid-shift X-Report Check Modal
  const [showMidCheckModal, setShowMidCheckModal] = useState<boolean>(false);
  const [midDenomCounts, setMidDenomCounts] = useState<Partial<Record<DenominationKey, number>>>({});

  // Print Z-Report Modal
  const [zReportShift, setZReportShift] = useState<ShiftSession | null>(null);

  // Resilient fetch helper: tries AdBlock-safe /api/admin/cashbook first, falls back to /api/revenue/summary
  const requestCashbookApi = useCallback(async (querySuffix: string, init?: RequestInit): Promise<Response> => {
    const primaryUrl = `/api/admin/cashbook${querySuffix}`;
    const fallbackUrl = `/api/revenue/summary${querySuffix}`;
    try {
      const res = await fetch(primaryUrl, init);
      if (res.status !== 404) {
        return res;
      }
    } catch {
      // Fallback if primary endpoint could not be reached
    }
    return fetch(fallbackUrl, init);
  }, []);

  const fetchRevenueReport = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
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

      const res = await requestCashbookApi(`?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const statusDesc = res.status === 504 ? 'Quá thời gian chờ phản hồi máy chủ (504 Timeout).' : `Mã lỗi HTTP ${res.status}`;
        setErrorMsg(data?.error || `Không thể tải báo cáo doanh thu (${statusDesc}).`);
      } else if (!data) {
        setErrorMsg('Dữ liệu phản hồi từ máy chủ không hợp lệ.');
      } else {
        setReportData(data);
      }
    } catch (err) {
      const detail = err instanceof Error && err.message ? ` (${err.message})` : '';
      setErrorMsg(`Lỗi kết nối máy chủ khi tải báo cáo doanh thu${detail}. Hãy thử tắt trình chặn quảng cáo (AdBlock) hoặc làm mới trang.`);
    } finally {
      setLoading(false);
    }
  }, [preset, customFrom, customTo, channelFilter, requestCashbookApi]);

  useEffect(() => {
    const initTimer = window.setTimeout(() => {
      void fetchRevenueReport();
    }, 0);
    const handleLocationChanged = () => {
      void fetchRevenueReport();
    };
    window.addEventListener('ulab:location-changed', handleLocationChanged);
    return () => {
      window.clearTimeout(initTimer);
      window.removeEventListener('ulab:location-changed', handleLocationChanged);
    };
  }, [fetchRevenueReport]);

  // Denomination counter sums
  const countedActualCash = useMemo(() => calculateDenominationsTotal(denomCounts), [denomCounts]);
  const midCountedCash = useMemo(() => calculateDenominationsTotal(midDenomCounts), [midDenomCounts]);

  const openTransactionModal = (type: CashTransactionType, category: CashTransactionCategory) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setTxType(type);
    setTxCategory(category);
    setTxAmount('');
    setTxRecipientPayer('');
    setTxNotes('');
    setTxIdemKey(createClientIdempotencyKey('tx'));
    setShowTransactionModal(true);
  };

  const handleOpenShiftModal = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    const suggested = reportData?.suggestedOpeningCash ?? 500000;
    setOpeningCashInput(String(suggested));
    setOpenShiftNotes('');
    setOpenShiftIdemKey(createClientIdempotencyKey('shift-open'));
    setShowOpenShiftModal(true);
  };

  const handleOpenCloseShiftModal = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    const suggested = reportData?.suggestedOpeningCash ?? 500000;
    setRetainedCashInput(String(suggested));
    setCloseShiftNotes('');
    setDenomCounts({});
    setAutoRecordHandover(true);
    setCloseShiftIdemKey(createClientIdempotencyKey('shift-close'));
    setShowCloseShiftModal(true);
  };

  // Handle Create Cash Transaction
  const handleCreateTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(txAmount.replace(/\D/g, '')) || 0;
    if (amount <= 0) {
      setErrorMsg('Vui lòng nhập số tiền hợp lệ lớn hơn 0đ.');
      return;
    }
    setSubmittingTx(true);
    setErrorMsg(null);
    try {
      const res = await requestCashbookApi('', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_transaction',
          type: txType,
          category: txCategory,
          amount,
          paymentMethod: TX_PAYMENT_METHOD,
          recipientPayer: txRecipientPayer,
          notes: txNotes,
          shiftId: reportData?.activeShift?.id || null,
          idempotencyKey: txIdemKey || undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setSuccessMsg(`✓ Đã lập ${txType === 'RECEIPT' ? 'Phiếu Thu' : 'Phiếu Chi'} #${data.transaction?.code || ''} thành công!`);
        setShowTransactionModal(false);
        setTxAmount('');
        setTxRecipientPayer('');
        setTxNotes('');
        await fetchRevenueReport();
      } else {
        setErrorMsg(data?.error || `Không thể tạo phiếu thu chi (HTTP ${res.status}).`);
      }
    } catch {
      setErrorMsg('Lỗi kết nối máy chủ khi lập phiếu.');
    } finally {
      setSubmittingTx(false);
    }
  };

  // Handle Void Cash Transaction
  const handleVoidTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidTargetTx) return;
    const trimmedReason = voidReason.trim();
    if (trimmedReason.length < 3) {
      setErrorMsg('Vui lòng nhập lý do hủy phiếu (ít nhất 3 ký tự).');
      return;
    }

    setSubmittingVoid(true);
    setErrorMsg(null);
    try {
      const res = await requestCashbookApi('', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'void_transaction',
          transactionId: voidTargetTx.id || voidTargetTx.code,
          reason: trimmedReason,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setSuccessMsg(`✓ Đã hủy phiếu #${voidTargetTx.code} và cập nhật lại số dư Sổ Quỹ.`);
        setVoidTargetTx(null);
        setVoidReason('');
        await fetchRevenueReport();
      } else {
        setErrorMsg(data?.error || `Không thể hủy phiếu (HTTP ${res.status}).`);
      }
    } catch {
      setErrorMsg('Lỗi kết nối máy chủ khi hủy phiếu.');
    } finally {
      setSubmittingVoid(false);
    }
  };

  // Handle Open Shift
  const handleOpenShift = async (e: React.FormEvent) => {
    e.preventDefault();
    const openingCash = Number(openingCashInput.replace(/\D/g, '')) || 0;
    setSubmittingOpenShift(true);
    setErrorMsg(null);
    try {
      const res = await requestCashbookApi('', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'open_shift',
          shiftName: shiftNameInput,
          openingCash,
          notes: openShiftNotes,
          idempotencyKey: openShiftIdemKey || undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setSuccessMsg(`✓ Đã mở ca bán hàng [${data.shift?.shiftName || shiftNameInput}] thành công!`);
        setShowOpenShiftModal(false);
        await fetchRevenueReport();
      } else {
        setErrorMsg(data?.error || `Lỗi mở ca bán hàng (HTTP ${res.status}).`);
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
    const currentShift = reportData?.activeShift;
    if (!currentShift) return;

    const actualCash = countedActualCash;
    const cashRetained = Number(retainedCashInput.replace(/\D/g, '')) || 0;

    if (cashRetained > actualCash) {
      setErrorMsg('Tiền giữ lại két cho ca sau không được vượt quá tiền mặt thực tế kiểm đếm.');
      return;
    }

    if (actualCash !== currentShift.expectedCash && closeShiftNotes.trim().length < 3) {
      setErrorMsg('Khi két tiền bị lệch (Thừa/Thiếu), bắt buộc phải nhập lý do giải trình (ít nhất 3 ký tự) trước khi chốt ca.');
      return;
    }

    setSubmittingCloseShift(true);
    setErrorMsg(null);
    try {
      const res = await requestCashbookApi('', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'close_shift',
          shiftId: currentShift.id,
          actualCash,
          cashRetained,
          notes: closeShiftNotes,
          denominations: denomCounts,
          autoRecordHandover,
          idempotencyKey: closeShiftIdemKey || undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setSuccessMsg('✓ Đã chốt ca bán hàng và lưu kết quả đối soát thành công!');
        setShowCloseShiftModal(false);
        setDenomCounts({});
        if (data.shift) {
          setZReportShift(data.shift);
        }
        await fetchRevenueReport();
      } else {
        setErrorMsg(data?.error || `Lỗi khi chốt ca (HTTP ${res.status}).`);
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

  const rawCashTxs = reportData?.cashbook?.transactions;
  const filteredCashTxs = useMemo(() => {
    if (!rawCashTxs) return [];
    const q = txSearchText.trim().toLowerCase();
    return rawCashTxs.filter((tx) => {
      const txStatus = tx.status === 'VOIDED' ? 'VOIDED' : 'POSTED';
      const matchesType = txTypeFilter === 'ALL' || tx.type === txTypeFilter;
      const matchesCat = txCategoryFilter === 'ALL' || tx.category === txCategoryFilter;
      const matchesStatus = txStatusFilter === 'ALL' || txStatus === txStatusFilter;
      const matchesSearch =
        !q ||
        tx.code.toLowerCase().includes(q) ||
        tx.recipientPayer.toLowerCase().includes(q) ||
        (tx.notes || '').toLowerCase().includes(q) ||
        tx.createdByName.toLowerCase().includes(q);
      return matchesType && matchesCat && matchesStatus && matchesSearch;
    });
  }, [rawCashTxs, txTypeFilter, txCategoryFilter, txStatusFilter, txSearchText]);

  const summary = reportData?.summary;
  const metrics = summary?.metrics;
  const cashbook = reportData?.cashbook;
  const storeFund = reportData?.storeFund || cashbook?.storeFund;
  const netCashflow = reportData?.netCashflow;
  const activeShift = reportData?.activeShift;
  const shiftHistory = reportData?.shiftHistory || [];

  const maxHourlyRevenue = useMemo(() => {
    if (!summary?.hourlySales) return 100000;
    return Math.max(...summary.hourlySales.map((h) => h.revenue), 100000);
  }, [summary]);

  const maxDailyRevenue = useMemo(() => {
    if (!summary?.dailySales || summary.dailySales.length === 0) return 100000;
    return Math.max(...summary.dailySales.map((d) => d.netRevenue), 100000);
  }, [summary]);

  const expenseBreakdownEntries = useMemo(() => {
    const breakdown = cashbook?.categoryBreakdown;
    if (!breakdown) return [];
    const totalOut = cashbook?.totalOut || 0;
    return Object.entries(breakdown)
      .map(([cat, amount]) => ({
        category: cat as CashTransactionCategory,
        label: CASH_CATEGORY_LABELS[cat as CashTransactionCategory] || cat,
        amount,
        sharePercent: totalOut > 0 ? Math.round((amount / totalOut) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [cashbook]);

  const closeShiftHandoverPreview = Math.max(
    0,
    countedActualCash - (Number(retainedCashInput.replace(/\D/g, '')) || 0)
  );

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
            Báo cáo bán hàng, đối soát dòng tiền thuần, sổ quỹ thu chi &amp; quản lý ca chuẩn F&amp;B.
          </p>
        </div>

        <div className={styles.filterActionsRow}>
          {/* Preset Buttons */}
          <div className={styles.presetGroup} role="group" aria-label="Khoảng thời gian báo cáo">
            {(
              [
                { key: 'ALL_TIME', label: 'Tất cả (Lũy kế)' },
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
            onClick={() => {
              setSuccessMsg(null);
              void fetchRevenueReport();
            }}
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
            onClick={() => void fetchRevenueReport()}
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
              🟢 {activeShift.shiftName} (#{activeShift.code}) · Mở lúc{' '}
              {new Date(activeShift.openedAt).toLocaleTimeString('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
              })}{' '}
              · {activeShift.openedByName} · Lý thuyết két: {formatVND(activeShift.expectedCash)}
            </span>
          ) : (
            <span className={styles.shiftClosedBadge}>
              ⚪ Chưa có ca làm việc nào đang mở
            </span>
          )}
        </div>

        <div className={styles.shiftActionBtns}>
          {activeShift ? (
            <>
              <button
                type="button"
                className={styles.midCheckBtn}
                onClick={() => {
                  setMidDenomCounts({});
                  setShowMidCheckModal(true);
                }}
              >
                🧮 Kiểm Két / X-Report
              </button>
              <button
                type="button"
                className={styles.closeShiftBtn}
                onClick={handleOpenCloseShiftModal}
              >
                🏁 Chốt Ca &amp; Bàn Giao Két
              </button>
            </>
          ) : (
            <button
              type="button"
              className={styles.openShiftBtn}
              onClick={handleOpenShiftModal}
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
          📒 Sổ Quỹ Thu - Chi ({cashbook?.activeCount || 0} phiếu)
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
                  <span>
                    AOV: {formatVND(summary?.orderRevenue.averageOrderValue || 0)}/đơn · Hủy:{' '}
                    {summary?.cancelledOrdersCount || 0}
                  </span>
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
                <span className={styles.metricLabel}>Tổng tiền thực tế đã thu</span>
                <div className={styles.metricValueRow}>
                  <span className={styles.metricNum}>
                    {summary ? summary.collection.totalCollected.toLocaleString('vi-VN') : '0'}
                  </span>
                  <span className={styles.metricUnit}>VND</span>
                </div>
                <div className={styles.metricSubInfo}>
                  <span>1 tài khoản Tiền duy nhất (Gộp POS &amp; Web)</span>
                </div>
              </div>
            </div>

            <div className={styles.metricCard}>
              <div className={styles.metricIconWrap}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="M6 12h12M12 6v12" />
                </svg>
              </div>
              <div className={styles.metricBody}>
                <span className={styles.metricLabel}>Số dư Quỹ Tiền Cửa Hàng</span>
                <div className={styles.metricValueRow}>
                  <span className={styles.metricNum}>
                    {storeFund ? storeFund.theoreticalClosingBalance.toLocaleString('vi-VN') : '0'}
                  </span>
                  <span className={styles.metricUnit}>VND</span>
                </div>
                <div className={styles.metricSubInfo}>
                  <span>
                    +Thu sổ quỹ: {formatVND(cashbook?.totalIn || 0)} · −Chi sổ quỹ:{' '}
                    {formatVND(cashbook?.totalOut || 0)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Net Operating Cashflow Reconciliation Strip */}
          {netCashflow && (
            <div className={styles.netCashflowStrip}>
              <div className={styles.netCashflowHeader}>
                <h3 className={styles.cardTitle}>
                  💧 Đối Soát Dòng Tiền Thuần Tại Điểm Bán ({reportData?.boundaries.label || 'Trong kỳ'})
                </h3>
                <span className={styles.cardBadge}>
                  Tỷ lệ chi phí quầy / doanh thu: {netCashflow.expenseToRevenueRatio}%
                </span>
              </div>
              <div className={styles.netCashflowGrid}>
                <div className={styles.netCashflowItem}>
                  <span className={styles.netCashflowLabel}>1. Doanh thu gộp</span>
                  <strong className={styles.netCashflowValue}>
                    {formatVND(netCashflow.grossSales)}
                  </strong>
                </div>
                <div className={styles.netCashflowItem}>
                  <span className={styles.netCashflowLabel}>2. − Giảm giá &amp; Điểm ví</span>
                  <strong className={styles.netCashflowValue} style={{ color: '#b45309' }}>
                    −{formatVND(netCashflow.totalDiscounts)}
                  </strong>
                </div>
                <div className={styles.netCashflowItem}>
                  <span className={styles.netCashflowLabel}>3. = Doanh thu thuần (Net)</span>
                  <strong className={styles.netCashflowValue} style={{ color: '#0f172a' }}>
                    {formatVND(netCashflow.netSalesRevenue)}
                  </strong>
                </div>
                <div className={styles.netCashflowItem}>
                  <span className={styles.netCashflowLabel}>4. − Chi phí vận hành (PC)</span>
                  <strong className={styles.netCashflowValue} style={{ color: '#dc2626' }}>
                    −{formatVND(netCashflow.storeExpenseOutflows)}
                  </strong>
                </div>
                <div className={`${styles.netCashflowItem} ${styles.netCashflowItemHighlight}`}>
                  <span className={styles.netCashflowLabel}>5. = Thặng dư dòng tiền</span>
                  <strong
                    className={styles.netCashflowValue}
                    style={{
                      color: netCashflow.netOperatingCashflow >= 0 ? '#006241' : '#dc2626',
                    }}
                  >
                    {formatVND(netCashflow.netOperatingCashflow)}
                  </strong>
                </div>
              </div>
            </div>
          )}

          {/* Visual Analytics Row 1: Hourly Chart + Best Sellers */}
          <div className={styles.analyticsRow}>
            {/* Hourly Sales Bar Chart */}
            <div className={styles.chartCard}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>📈 Doanh Thu Theo Giờ (06:00 - 22:00)</h3>
                <span className={styles.cardBadge}>{reportData?.boundaries.label || 'Trong kỳ'}</span>
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

          {/* Visual Analytics Row 2: Daily Sales Trend + Category & Channel Breakdown */}
          <div className={styles.analyticsRow}>
            {/* Daily Revenue Trend */}
            <div className={styles.chartCard}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>📅 Xu Hướng Doanh Thu Theo Ngày</h3>
                <span className={styles.cardBadge}>{summary?.dailySales.length || 0} ngày có đơn</span>
              </div>
              {summary?.dailySales && summary.dailySales.length > 0 ? (
                <div className={styles.breakdownList}>
                  {summary.dailySales.slice(-10).map((day) => {
                    const pct = maxDailyRevenue > 0 ? Math.round((day.netRevenue / maxDailyRevenue) * 100) : 0;
                    return (
                      <div key={day.date} className={styles.breakdownItem}>
                        <div className={styles.breakdownMeta}>
                          <span>
                            <strong>{day.label}</strong> ({day.orderCount} đơn
                            {day.cancelledCount > 0 ? ` · ${day.cancelledCount} hủy` : ''})
                          </span>
                          <strong style={{ color: '#006241' }}>{formatVND(day.netRevenue)}</strong>
                        </div>
                        <div className={styles.progressTrack}>
                          <div
                            className={styles.progressFill}
                            style={{ width: `${Math.max(4, pct)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p style={{ color: '#94a3b8', fontSize: '0.8125rem', textAlign: 'center', margin: '20px 0' }}>
                  Chưa có dữ liệu đơn hàng theo ngày trong kỳ đã chọn.
                </p>
              )}
            </div>

            {/* Category Revenue + Channel Breakdown */}
            <div className={styles.bestSellerCard}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>🧭 Cơ Cấu Danh Mục &amp; Kênh Bán</h3>
                <span className={styles.cardBadge}>Tỷ trọng doanh thu</span>
              </div>

              {/* Channel Breakdown */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', marginBottom: '8px', textTransform: 'uppercase' }}>
                  Tỷ trọng Kênh bán (POS vs Web)
                </div>
                <div className={styles.breakdownList}>
                  {summary?.channelBreakdown?.map((ch) => (
                    <div key={ch.channel} className={styles.breakdownItem}>
                      <div className={styles.breakdownMeta}>
                        <span>
                          <strong>{ch.channel === 'POS' ? '🛒' : '🌐'} {ch.label}</strong> ({ch.orderCount} đơn · AOV {formatVND(ch.averageOrderValue)})
                        </span>
                        <strong>
                          {formatVND(ch.netRevenue)} ({ch.sharePercent}%)
                        </strong>
                      </div>
                      <div className={styles.progressTrack}>
                        <div
                          className={`${styles.progressFill} ${ch.channel === 'WEB' ? styles.progressFillBlue : ''}`}
                          style={{ width: `${Math.max(ch.netRevenue > 0 ? 4 : 0, ch.sharePercent)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Category Breakdown */}
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', marginBottom: '8px', textTransform: 'uppercase' }}>
                  Cơ cấu Danh mục Đồ uống
                </div>
                {summary?.categoryRevenue && summary.categoryRevenue.length > 0 ? (
                  <div className={styles.breakdownList}>
                    {summary.categoryRevenue.map((cat) => (
                      <div key={cat.categoryName} className={styles.breakdownItem}>
                        <div className={styles.breakdownMeta}>
                          <span>
                            <strong>{cat.categoryName}</strong> ({cat.quantitySold} ly/chai)
                          </span>
                          <strong>
                            {formatVND(cat.totalRevenue)} ({cat.sharePercent}%)
                          </strong>
                        </div>
                        <div className={styles.progressTrack}>
                          <div
                            className={`${styles.progressFill} ${styles.progressFillGold}`}
                            style={{ width: `${Math.max(4, cat.sharePercent)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: '#94a3b8', fontSize: '0.8125rem', margin: 0 }}>
                    Chưa có số liệu danh mục.
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
                  Toàn bộ đơn hàng ghi nhận doanh thu trong kỳ đối soát của chi nhánh hiện tại.
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

                <button
                  type="button"
                  className={styles.refreshBtn}
                  onClick={() => {
                    if (filteredOrders.length === 0) return;
                    const headers = ['Mã đơn', 'Thời gian', 'Kênh', 'Khách hàng', 'SĐT', 'Món nước', 'Tạm tính', 'Giảm giá', 'Thực thu', 'Trạng thái'];
                    const rows = filteredOrders.map((o) => [
                      o.orderCode,
                      new Date(o.createdAt).toLocaleString('vi-VN'),
                      o.channel,
                      `"${String(o.customerName || '').replace(/"/g, '""')}"`,
                      o.customerPhone || '',
                      `"${String(o.itemsSummary || '').replace(/"/g, '""')}"`,
                      o.subtotal,
                      o.discountAmount,
                      o.totalDue,
                      o.status,
                    ]);
                    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
                    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `ULAB_DoanhThu_${preset}_${new Date().toISOString().slice(0, 10)}.csv`;
                    link.click();
                    URL.revokeObjectURL(url);
                  }}
                  title="Tải xuống báo cáo đơn hàng định dạng Excel CSV"
                >
                  📥 Xuất CSV
                </button>
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
                    <th>Tài khoản</th>
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
                        <td>💵 Tiền</td>
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
          TAB 2: SỔ QUỸ THU - CHI (QUỸ TIỀN CỬA HÀNG)
         ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'CASHBOOK' && (
        <>
          {/* 4 Cashbook Unified Fund Cards */}
          <div className={styles.metricsGrid}>
            <div className={styles.metricCard}>
              <div className={styles.metricIconWrapBlue}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="M6 12h12M12 6v12" />
                </svg>
              </div>
              <div className={styles.metricBody}>
                <span className={styles.metricLabel}>1. Tiền đầu kỳ / Đầu ca</span>
                <div className={styles.metricValueRow}>
                  <span className={styles.metricNum}>
                    {(storeFund?.openingFloat ?? 0).toLocaleString('vi-VN')}
                  </span>
                  <span className={styles.metricUnit}>VND</span>
                </div>
                <div className={styles.metricSubInfo}>
                  <span>Tiền thối &amp; tiền quỹ mở ca hiện tại</span>
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
                <span className={styles.metricLabel}>2. + Tổng thu Bán hàng &amp; PT</span>
                <div className={styles.metricValueRow}>
                  <span className={styles.metricNum} style={{ color: '#15803d' }}>
                    +{((storeFund?.paidSalesInflow || 0) + (storeFund?.manualReceiptInflow || 0)).toLocaleString('vi-VN')}
                  </span>
                  <span className={styles.metricUnit}>VND</span>
                </div>
                <div className={styles.metricSubInfo}>
                  <span>
                    Bán hàng: {formatVND(storeFund?.paidSalesInflow || 0)} · Phiếu thu: {formatVND(storeFund?.manualReceiptInflow || 0)}
                  </span>
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
                <span className={styles.metricLabel}>3. − Tổng chi Vận hành &amp; Hoàn hủy</span>
                <div className={styles.metricValueRow}>
                  <span className={styles.metricNum} style={{ color: '#dc2626' }}>
                    −{((storeFund?.manualPaymentOutflow || 0) + (storeFund?.refundOutflow || 0)).toLocaleString('vi-VN')}
                  </span>
                  <span className={styles.metricUnit}>VND</span>
                </div>
                <div className={styles.metricSubInfo}>
                  <span>
                    Phiếu chi: {formatVND(storeFund?.manualPaymentOutflow || 0)} · Hoàn hủy: {formatVND(storeFund?.refundOutflow || 0)}
                  </span>
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
                <span className={styles.metricLabel}>4. = Số dư Quỹ Tiền Cửa Hàng</span>
                <div className={styles.metricValueRow}>
                  <span className={styles.metricNum}>
                    {(storeFund?.theoreticalClosingBalance ?? 0).toLocaleString('vi-VN')}
                  </span>
                  <span className={styles.metricUnit}>VND</span>
                </div>
                <div className={styles.metricSubInfo}>
                  <span>
                    Riêng sổ PT/PC: {formatVND(cashbook?.closingBalance || 0)} · {cashbook?.activeCount || 0} hiệu lực
                    {(cashbook?.voidedCount || 0) > 0 ? ` · ${cashbook?.voidedCount} đã hủy` : ''}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Expense Breakdown by Category */}
          {expenseBreakdownEntries.length > 0 && (
            <div className={styles.chartCard} style={{ marginBottom: '20px' }}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>💸 Cơ Cấu Khoản Chi Theo Danh Mục ({formatVND(cashbook?.totalOut || 0)})</h3>
                <span className={styles.cardBadge}>Chỉ tính phiếu hiệu lực</span>
              </div>
              <div className={styles.breakdownList}>
                {expenseBreakdownEntries.map((item) => (
                  <div key={item.category} className={styles.breakdownItem}>
                    <div className={styles.breakdownMeta}>
                      <span>
                        <strong>{item.label}</strong>
                      </span>
                      <strong style={{ color: '#dc2626' }}>
                        {formatVND(item.amount)} ({item.sharePercent}%)
                      </strong>
                    </div>
                    <div className={styles.progressTrack}>
                      <div
                        className={`${styles.progressFill} ${styles.progressFillRed}`}
                        style={{ width: `${Math.max(4, item.sharePercent)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cashbook Action Bar */}
          <div className={styles.cashbookActionRow}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                Nhật Ký Dòng Tiền (Sổ Cái Thu - Chi)
              </h3>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                Ghi nhận minh bạch mọi biến động thu - chi; phiếu lập sai được hủy trạng thái (VOIDED) thay vì xóa cứng.
              </span>
            </div>

            <div className={styles.actionBtnGroup}>
              <button
                type="button"
                className={styles.createReceiptBtn}
                onClick={() => openTransactionModal('RECEIPT', 'OPENING_FLOAT')}
              >
                + Lập Phiếu Thu
              </button>
              <button
                type="button"
                className={styles.createPaymentBtn}
                onClick={() => openTransactionModal('PAYMENT', 'RAW_MATERIAL')}
              >
                − Lập Phiếu Chi
              </button>
            </div>
          </div>

          {/* Cash Transactions Table with Filters */}
          <div className={styles.tableSection}>
            <div className={styles.filterToolbar}>
              <select
                value={txTypeFilter}
                onChange={(e) => setTxTypeFilter(e.target.value as 'ALL' | 'RECEIPT' | 'PAYMENT')}
                className={styles.channelSelect}
              >
                <option value="ALL">Tất cả loại phiếu</option>
                <option value="RECEIPT">+ Phiếu Thu</option>
                <option value="PAYMENT">− Phiếu Chi</option>
              </select>

              <select
                value={txCategoryFilter}
                onChange={(e) => setTxCategoryFilter(e.target.value)}
                className={styles.channelSelect}
              >
                <option value="ALL">Tất cả danh mục</option>
                {(Object.keys(CASH_CATEGORY_LABELS) as CashTransactionCategory[]).map((cat) => (
                  <option key={cat} value={cat}>
                    {CASH_CATEGORY_LABELS[cat]}
                  </option>
                ))}
              </select>

              <select
                value={txStatusFilter}
                onChange={(e) => setTxStatusFilter(e.target.value as 'ALL' | 'POSTED' | 'VOIDED')}
                className={styles.channelSelect}
              >
                <option value="ALL">Mọi trạng thái</option>
                <option value="POSTED">✓ Hiệu lực</option>
                <option value="VOIDED">✕ Đã hủy (VOIDED)</option>
              </select>

              <input
                type="search"
                placeholder="Tìm mã phiếu, người nhận/nộp, diễn giải..."
                value={txSearchText}
                onChange={(e) => setTxSearchText(e.target.value)}
                className={styles.searchInput}
                style={{ flex: 1, minWidth: '180px' }}
              />

              <button
                type="button"
                className={styles.refreshBtn}
                onClick={() => {
                  if (filteredCashTxs.length === 0) return;
                  const headers = ['Mã phiếu', 'Thời gian', 'Loại phiếu', 'Danh mục', 'Người nhận/nộp', 'Diễn giải', 'Số tiền', 'Số dư sổ', 'Người lập', 'Trạng thái', 'Lý do hủy'];
                  const rows = filteredCashTxs.map((tx) => [
                    tx.code,
                    new Date(tx.createdAt).toLocaleString('vi-VN'),
                    tx.type === 'RECEIPT' ? 'Phiếu Thu' : 'Phiếu Chi',
                    `"${(CASH_CATEGORY_LABELS[tx.category] || tx.category).replace(/"/g, '""')}"`,
                    `"${String(tx.recipientPayer || '').replace(/"/g, '""')}"`,
                    `"${String(tx.notes || '').replace(/"/g, '""')}"`,
                    tx.amount,
                    tx.runningBalance || 0,
                    `"${String(tx.createdByName || '').replace(/"/g, '""')}"`,
                    tx.status === 'VOIDED' ? 'VOIDED' : 'POSTED',
                    `"${String(tx.voidReason || '').replace(/"/g, '""')}"`,
                  ]);
                  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
                  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = `ULAB_SoQuy_${preset}_${new Date().toISOString().slice(0, 10)}.csv`;
                  link.click();
                  URL.revokeObjectURL(url);
                }}
              >
                📥 Xuất CSV Sổ Quỹ
              </button>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className={styles.revenueTable}>
                <thead>
                  <tr>
                    <th>Mã phiếu &amp; Thời gian</th>
                    <th>Loại phiếu</th>
                    <th>Danh mục thu / chi</th>
                    <th>Người nhận / Nộp</th>
                    <th>Diễn giải &amp; Ca</th>
                    <th>Số tiền</th>
                    <th>Số dư sổ PT/PC</th>
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCashTxs.length === 0 ? (
                    <tr>
                      <td colSpan={9} className={styles.tableEmpty}>
                        Không có phiếu thu / chi nào khớp với bộ lọc. Bấm [+ Lập Phiếu Thu] hoặc [− Lập Phiếu Chi] để ghi nhận.
                      </td>
                    </tr>
                  ) : (
                    filteredCashTxs.map((tx) => {
                      const isVoided = tx.status === 'VOIDED';
                      return (
                        <tr key={tx.id} className={isVoided ? styles.voidedRow : ''}>
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
                          </td>
                          <td>
                            <strong>{CASH_CATEGORY_LABELS[tx.category] || tx.category}</strong>
                          </td>
                          <td>{tx.recipientPayer}</td>
                          <td>
                            <div>{tx.notes || '—'}</div>
                            <span className={styles.dateCell}>
                              Lập bởi: {tx.createdByName}
                              {tx.shiftId ? ' · Gắn ca' : ''}
                            </span>
                          </td>
                          <td>
                            <strong
                              style={{
                                color: isVoided
                                  ? '#64748b'
                                  : tx.type === 'RECEIPT'
                                    ? '#15803d'
                                    : '#dc2626',
                                textDecoration: isVoided ? 'line-through' : 'none',
                              }}
                            >
                              {tx.type === 'RECEIPT' ? `+${formatVND(tx.amount)}` : `−${formatVND(tx.amount)}`}
                            </strong>
                          </td>
                          <td>
                            <strong>{formatVND(tx.runningBalance || 0)}</strong>
                          </td>
                          <td>
                            {isVoided ? (
                              <div>
                                <span className={styles.voidedBadge}>Đã hủy</span>
                                {tx.voidReason && (
                                  <span className={styles.dateCell}>Lý do: {tx.voidReason}</span>
                                )}
                              </div>
                            ) : (
                              <span className={styles.receiptBadge}>✓ Hiệu lực</span>
                            )}
                          </td>
                          <td>
                            <div className={styles.rowActionBtns}>
                              <button
                                type="button"
                                className={styles.smallActionBtn}
                                onClick={() => setVoucherModalTx(tx)}
                              >
                                🖨️ In
                              </button>
                              {!isVoided && (
                                <button
                                  type="button"
                                  className={styles.smallDangerBtn}
                                  onClick={() => {
                                    setVoidReason('');
                                    setErrorMsg(null);
                                    setVoidTargetTx(tx);
                                  }}
                                >
                                  ✕ Hủy
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
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
              <div className={styles.activeShiftHeader} style={{ flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#006241' }}>
                    🟢 {activeShift.shiftName} (#{activeShift.code}) — ĐANG MỞ
                  </h3>
                  <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                    Bắt đầu lúc: {new Date(activeShift.openedAt).toLocaleString('vi-VN')} · Thu ngân trực: {activeShift.openedByName}
                  </span>
                </div>
                <div className={styles.actionBtnGroup} style={{ flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className={styles.createReceiptBtn}
                    onClick={() => openTransactionModal('RECEIPT', 'OPENING_FLOAT')}
                  >
                    + Thu Trong Ca
                  </button>
                  <button
                    type="button"
                    className={styles.createPaymentBtn}
                    onClick={() => openTransactionModal('PAYMENT', 'RAW_MATERIAL')}
                  >
                    − Chi Trong Ca
                  </button>
                  <button
                    type="button"
                    className={styles.midCheckBtn}
                    onClick={() => {
                      setMidDenomCounts({});
                      setShowMidCheckModal(true);
                    }}
                  >
                    🧮 Kiểm Két / X-Report
                  </button>
                  <button
                    type="button"
                    className={styles.closeShiftBtn}
                    onClick={handleOpenCloseShiftModal}
                  >
                    🏁 Kiểm Đếm &amp; Chốt Ca
                  </button>
                </div>
              </div>

              <div className={styles.shiftStatsGrid}>
                <div className={styles.shiftStatBox}>
                  <span>1. Tiền thối đầu ca</span>
                  <strong>{formatVND(activeShift.openingCash)}</strong>
                </div>
                <div className={styles.shiftStatBox}>
                  <span>2. + Bán hàng ({activeShift.orderCount || 0} đơn)</span>
                  <strong style={{ color: '#15803d' }}>+{formatVND(activeShift.cashSales)}</strong>
                </div>
                <div className={styles.shiftStatBox}>
                  <span>3. + Phiếu thu trong ca (PT)</span>
                  <strong style={{ color: '#15803d' }}>+{formatVND(activeShift.cashIn)}</strong>
                </div>
                <div className={styles.shiftStatBox}>
                  <span>4. − Hoàn tiền đơn hủy</span>
                  <strong style={{ color: '#dc2626' }}>−{formatVND(activeShift.cashRefunds)}</strong>
                </div>
                <div className={styles.shiftStatBox}>
                  <span>5. − Phiếu chi trong ca (PC)</span>
                  <strong style={{ color: '#dc2626' }}>−{formatVND(activeShift.cashOut)}</strong>
                </div>
                <div className={`${styles.shiftStatBox} ${styles.expectedBox}`}>
                  <span>6. = Tiền lý thuyết trong két</span>
                  <strong>{formatVND(activeShift.expectedCash)}</strong>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ background: '#f8fafc', padding: '24px', borderRadius: '12px', textAlign: 'center', marginBottom: '24px', border: '1px dashed #cbd5e1' }}>
              <p style={{ margin: '0 0 12px 0', fontSize: '0.9375rem', fontWeight: 600, color: '#475569' }}>
                Hiện chưa có ca làm việc nào đang mở tại quầy ({reportData?.staff.locationName || 'Ủ LAB'}).
              </p>
              <button
                type="button"
                className={styles.openShiftBtn}
                onClick={handleOpenShiftModal}
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
                <p className={styles.tableSectionSub}>
                  Lưu vết đối soát kiểm đếm, phiếu thu/chi phát sinh trong ca, chênh lệch két và biên bản bàn giao.
                </p>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className={styles.revenueTable}>
                <thead>
                  <tr>
                    <th>Mã ca &amp; Tên ca</th>
                    <th>Thời gian ca</th>
                    <th>Thu ngân</th>
                    <th>Đầu ca</th>
                    <th>Bán hàng</th>
                    <th>Thu / Chi ca</th>
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
                      <td colSpan={11} className={styles.tableEmpty}>
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
                          <span>
                            {new Date(sh.openedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} -{' '}
                            {sh.closedAt ? new Date(sh.closedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—'}
                          </span>
                          <span className={styles.dateCell}>{new Date(sh.openedAt).toLocaleDateString('vi-VN')}</span>
                        </td>
                        <td>
                          <strong>{sh.closedByName || sh.openedByName}</strong>
                        </td>
                        <td>{formatVND(sh.openingCash)}</td>
                        <td>
                          <div>{formatVND(sh.cashSales)}</div>
                          {typeof sh.orderCount === 'number' && sh.orderCount > 0 && (
                            <span className={styles.dateCell}>{sh.orderCount} đơn</span>
                          )}
                        </td>
                        <td>
                          <div style={{ color: '#15803d', fontSize: '0.75rem' }}>+{formatVND(sh.cashIn || 0)}</div>
                          <div style={{ color: '#dc2626', fontSize: '0.75rem' }}>−{formatVND(sh.cashOut || 0)}</div>
                        </td>
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
                {txType === 'RECEIPT' ? '➕ Lập Phiếu Thu Tiền' : '➖ Lập Phiếu Chi Tiền'}
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
                {activeShift && (
                  <div className={styles.successBanner}>
                    🔗 Phiếu này sẽ tự động gắn vào <strong>{activeShift.shiftName}</strong> (#{activeShift.code})
                  </div>
                )}

                <div className={styles.formGroup}>
                  <label>Loại phiếu:</label>
                  <select
                    value={txType}
                    onChange={(e) => {
                      const nextType = e.target.value as CashTransactionType;
                      setTxType(nextType);
                      setTxCategory(nextType === 'RECEIPT' ? 'OPENING_FLOAT' : 'RAW_MATERIAL');
                    }}
                    className={styles.formSelect}
                  >
                    <option value="PAYMENT">Phiếu Chi (Tiền ra khỏi quỹ)</option>
                    <option value="RECEIPT">Phiếu Thu (Tiền vào quỹ)</option>
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
                        <option value="BANK_DEPOSIT">Nộp tiền doanh thu về chủ quán / Ngân hàng</option>
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
                  <label>Tài khoản ghi sổ:</label>
                  <input
                    type="text"
                    disabled
                    value="💵 Tiền (Quỹ Tiền Cửa Hàng)"
                    className={styles.formInput}
                  />
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

      {/* ── MODAL: HỦY PHIẾU THU / CHI (VOIDED) ── */}
      {voidTargetTx && (
        <div className={styles.modalOverlay} onClick={() => setVoidTargetTx(null)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>✕ Hủy Phiếu Sổ Quỹ #{voidTargetTx.code}</h3>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setVoidTargetTx(null)}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleVoidTransaction}>
              <div className={styles.modalBody}>
                <div className={styles.warningBanner}>
                  Lưu ý kế toán: Phiếu bị hủy sẽ chuyển sang trạng thái <strong>VOIDED</strong> và không còn cộng/trừ vào số dư quỹ hoặc ca bán hàng, nhưng vẫn giữ vết kiểm toán.
                </div>

                <div style={{ fontSize: '0.8125rem', marginBottom: '14px', color: '#334155', lineHeight: 1.6 }}>
                  <div>Loại phiếu: <strong>{voidTargetTx.type === 'RECEIPT' ? 'Phiếu Thu' : 'Phiếu Chi'}</strong></div>
                  <div>Số tiền: <strong>{formatVND(voidTargetTx.amount)}</strong></div>
                  <div>Người nhận/nộp: <strong>{voidTargetTx.recipientPayer}</strong></div>
                </div>

                <div className={styles.formGroup}>
                  <label>Lý do hủy phiếu (Bắt buộc, tối thiểu 3 ký tự):</label>
                  <input
                    type="text"
                    required
                    minLength={3}
                    placeholder="VD: Nhập nhầm số tiền 500k thành 5000k"
                    value={voidReason}
                    onChange={(e) => setVoidReason(e.target.value)}
                    className={styles.formInput}
                    autoFocus
                  />
                </div>

                <div className={styles.modalFooter}>
                  <button
                    type="button"
                    className={styles.cancelModalBtn}
                    onClick={() => setVoidTargetTx(null)}
                  >
                    Đóng
                  </button>
                  <button
                    type="submit"
                    className={styles.createPaymentBtn}
                    disabled={submittingVoid}
                  >
                    {submittingVoid ? 'Đang hủy...' : 'Xác Nhận Hủy Phiếu'}
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
                    Gợi ý tự động theo tiền giữ lại từ ca trước / cấu hình điểm bán: <strong>{formatVND(reportData?.suggestedOpeningCash ?? 500000)}</strong>.
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

      {/* ── MODAL: KIỂM KÉT GIỮA CA / IN X-REPORT ── */}
      {showMidCheckModal && activeShift && (
        <div className={styles.modalOverlay} onClick={() => setShowMidCheckModal(false)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>🧮 Kiểm Két Giữa Ca &amp; Phiếu Tạm Tính (X-Report)</h3>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setShowMidCheckModal(false)}
              >
                &times;
              </button>
            </div>

            <div className={styles.modalBody}>
              <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', marginBottom: '12px', fontSize: '0.8125rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span>Lý thuyết két hiện tại ({activeShift.orderCount || 0} đơn):</span>
                  <strong style={{ color: '#006241' }}>{formatVND(activeShift.expectedCash)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span>Thực tế đếm thử:</span>
                  <strong>{formatVND(midCountedCash)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '4px', borderTop: '1px dashed #cbd5e1' }}>
                  <span>Chênh lệch tạm tính:</span>
                  <strong style={{ color: midCountedCash === activeShift.expectedCash ? '#15803d' : midCountedCash > activeShift.expectedCash ? '#15803d' : '#dc2626' }}>
                    {midCountedCash === activeShift.expectedCash
                      ? '✓ Khớp (0đ)'
                      : midCountedCash > activeShift.expectedCash
                        ? `Thừa +${formatVND(midCountedCash - activeShift.expectedCash)}`
                        : `Thiếu ${formatVND(midCountedCash - activeShift.expectedCash)}`}
                  </strong>
                </div>
              </div>

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
                    const count = midDenomCounts[key] || 0;
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
                              setMidDenomCounts((prev) => ({ ...prev, [key]: val }));
                            }}
                            className={styles.denomCountInput}
                          />
                        </td>
                        <td style={{ textAlign: 'right' }}>{formatVND(count * denomVal)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className={styles.thermalReceipt}>
                <div className={styles.thermalReceiptHeader}>
                  <h4>Ủ LAB COFFEE &amp; MATCHA</h4>
                  <span>PHIẾU TẠM TÍNH CA (X-REPORT)</span>
                  <div>#{activeShift.code}</div>
                </div>
                <div className={styles.thermalRow}>
                  <span>Điểm bán:</span>
                  <strong>{reportData?.staff.locationName || 'Ủ LAB'}</strong>
                </div>
                <div className={styles.thermalRow}>
                  <span>Thời điểm xem:</span>
                  <span>{new Date().toLocaleString('vi-VN')}</span>
                </div>
                <div className={styles.thermalDivider} />
                <div className={styles.thermalRow}>
                  <span>Tiền đầu ca:</span>
                  <span>{formatVND(activeShift.openingCash)}</span>
                </div>
                <div className={styles.thermalRow}>
                  <span>+ Bán hàng ({activeShift.orderCount || 0} đơn):</span>
                  <span>{formatVND(activeShift.cashSales)}</span>
                </div>
                <div className={styles.thermalRow}>
                  <span>+ Phiếu thu (PT):</span>
                  <span>{formatVND(activeShift.cashIn)}</span>
                </div>
                <div className={styles.thermalRow}>
                  <span>− Hoàn hủy đơn:</span>
                  <span>−{formatVND(activeShift.cashRefunds)}</span>
                </div>
                <div className={styles.thermalRow}>
                  <span>− Phiếu chi (PC):</span>
                  <span>−{formatVND(activeShift.cashOut)}</span>
                </div>
                <div className={styles.thermalDivider} />
                <div className={styles.thermalRow}>
                  <strong>LÝ THUYẾT KÉT:</strong>
                  <strong>{formatVND(activeShift.expectedCash)}</strong>
                </div>
                {midCountedCash > 0 && (
                  <div className={styles.thermalRow}>
                    <strong>ĐẾM THỬ HIỆN TẠI:</strong>
                    <strong>{formatVND(midCountedCash)}</strong>
                  </div>
                )}
              </div>

              <button
                type="button"
                className={styles.printBtn}
                onClick={() => window.print()}
              >
                🖨️ In Phiếu Tạm Tính (X-Report)
              </button>
            </div>
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
                <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', marginBottom: '12px', fontSize: '0.8125rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                    <span>• Tiền đầu ca:</span>
                    <span>{formatVND(activeShift.openingCash)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                    <span>• + Tiền bán hàng ({activeShift.orderCount || 0} đơn):</span>
                    <span style={{ color: '#15803d' }}>+{formatVND(activeShift.cashSales)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                    <span>• + Phiếu thu trong ca (PT):</span>
                    <span style={{ color: '#15803d' }}>+{formatVND(activeShift.cashIn)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                    <span>• − Hoàn hủy đơn:</span>
                    <span style={{ color: '#dc2626' }}>−{formatVND(activeShift.cashRefunds)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span>• − Phiếu chi trong ca (PC):</span>
                    <span style={{ color: '#dc2626' }}>−{formatVND(activeShift.cashOut)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', paddingTop: '4px', borderTop: '1px dashed #cbd5e1' }}>
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

                {countedActualCash !== activeShift.expectedCash && (
                  <div className={styles.warningBanner}>
                    ⚠️ Tiền thực tế kiểm đếm đang lệch so với lý thuyết ({countedActualCash > activeShift.expectedCash ? 'Thừa' : 'Thiếu'}). Bắt buộc nhập lý do giải trình bên dưới trước khi chốt ca.
                  </div>
                )}

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
                    Tiền nộp về chủ quán / két an toàn: <strong>{formatVND(closeShiftHandoverPreview)}</strong>
                  </span>
                </div>

                {closeShiftHandoverPreview > 0 && (
                  <label className={styles.checkboxRow}>
                    <input
                      type="checkbox"
                      checked={autoRecordHandover}
                      onChange={(e) => setAutoRecordHandover(e.target.checked)}
                    />
                    <span>
                      Tự động lập Phiếu Chi nộp doanh thu ({formatVND(closeShiftHandoverPreview)}) vào Sổ Quỹ
                    </span>
                  </label>
                )}

                <div className={styles.formGroup}>
                  <label>
                    Ghi chú chốt ca / Lý do chênh lệch{' '}
                    {countedActualCash !== activeShift.expectedCash ? '(Bắt buộc *)' : '(tùy chọn)'}:
                  </label>
                  <input
                    type="text"
                    required={countedActualCash !== activeShift.expectedCash}
                    placeholder="VD: Tiền két khớp chuẩn / Giải trình lý do thừa thiếu..."
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

      {/* ── MODAL: IN PHIẾU THU / CHI SỔ QUỸ (80MM) ── */}
      {voucherModalTx && (
        <div className={styles.modalOverlay} onClick={() => setVoucherModalTx(null)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                🖨️ In {voucherModalTx.type === 'RECEIPT' ? 'Phiếu Thu Tiền' : 'Phiếu Chi Tiền'} #{voucherModalTx.code}
              </h3>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setVoucherModalTx(null)}
              >
                &times;
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.thermalReceipt}>
                <div className={styles.thermalReceiptHeader}>
                  <h4>Ủ LAB COFFEE &amp; MATCHA</h4>
                  <span>
                    {voucherModalTx.type === 'RECEIPT' ? 'PHIẾU THU TIỀN QUỸ' : 'PHIẾU CHI TIỀN QUỸ'}
                  </span>
                  <div>#{voucherModalTx.code}</div>
                  {voucherModalTx.status === 'VOIDED' && (
                    <div style={{ color: '#dc2626', fontWeight: 700, marginTop: '4px' }}>
                      *** PHIẾU ĐÃ HỦY (VOIDED) ***
                    </div>
                  )}
                </div>

                <div className={styles.thermalRow}>
                  <span>Điểm bán:</span>
                  <strong>{reportData?.staff.locationName || 'Ủ LAB'}</strong>
                </div>
                <div className={styles.thermalRow}>
                  <span>Thời gian lập:</span>
                  <span>{new Date(voucherModalTx.createdAt).toLocaleString('vi-VN')}</span>
                </div>
                <div className={styles.thermalRow}>
                  <span>Danh mục:</span>
                  <strong>{CASH_CATEGORY_LABELS[voucherModalTx.category] || voucherModalTx.category}</strong>
                </div>
                <div className={styles.thermalRow}>
                  <span>{voucherModalTx.type === 'RECEIPT' ? 'Người nộp:' : 'Người nhận:'}</span>
                  <strong>{voucherModalTx.recipientPayer}</strong>
                </div>

                <div className={styles.thermalDivider} />

                <div className={styles.thermalRow}>
                  <strong>SỐ TIỀN:</strong>
                  <strong>{formatVND(voucherModalTx.amount)}</strong>
                </div>
                {voucherModalTx.notes && (
                  <div style={{ marginTop: '4px', fontSize: '0.72rem' }}>
                    Diễn giải: {voucherModalTx.notes}
                  </div>
                )}
                {voucherModalTx.status === 'VOIDED' && voucherModalTx.voidReason && (
                  <div style={{ marginTop: '4px', fontSize: '0.72rem', color: '#dc2626' }}>
                    Lý do hủy ({voucherModalTx.voidedByName || 'Quản lý'}): {voucherModalTx.voidReason}
                  </div>
                )}

                <div className={styles.thermalDivider} />

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '14px', textAlign: 'center', fontSize: '0.7rem' }}>
                  <div>
                    <span>Người lập</span>
                    <div style={{ height: '32px' }} />
                    <small>({voucherModalTx.createdByName})</small>
                  </div>
                  <div>
                    <span>{voucherModalTx.type === 'RECEIPT' ? 'Người nộp' : 'Người nhận'}</span>
                    <div style={{ height: '32px' }} />
                    <small>(Ký tên)</small>
                  </div>
                  <div>
                    <span>Quản lý duyệt</span>
                    <div style={{ height: '32px' }} />
                    <small>(Ký tên)</small>
                  </div>
                </div>
              </div>

              <button
                type="button"
                className={styles.printBtn}
                onClick={() => window.print()}
              >
                🖨️ In Phiếu Ra Máy In Nhiệt
              </button>
            </div>
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
                {typeof zReportShift.orderCount === 'number' && (
                  <div className={styles.thermalRow}>
                    <span>Số đơn hoàn thành:</span>
                    <strong>{zReportShift.orderCount} đơn</strong>
                  </div>
                )}

                <div className={styles.thermalDivider} />

                <div className={styles.thermalRow}>
                  <span>Tiền thối đầu ca:</span>
                  <span>{formatVND(zReportShift.openingCash)}</span>
                </div>
                <div className={styles.thermalRow}>
                  <span>+ Tiền bán hàng:</span>
                  <span>{formatVND(zReportShift.cashSales)}</span>
                </div>
                <div className={styles.thermalRow}>
                  <span>+ Phiếu thu tại quầy (PT):</span>
                  <span>{formatVND(zReportShift.cashIn || 0)}</span>
                </div>
                <div className={styles.thermalRow}>
                  <span>− Hoàn tiền đơn hủy:</span>
                  <span>−{formatVND(zReportShift.cashRefunds)}</span>
                </div>
                <div className={styles.thermalRow}>
                  <span>− Phiếu chi tại quầy (PC):</span>
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

                {zReportShift.denominations &&
                  Object.values(zReportShift.denominations).some((v) => (v || 0) > 0) && (
                    <>
                      <div className={styles.thermalDivider} />
                      <div style={{ fontWeight: 700, marginBottom: '2px' }}>BẢNG KÊ MỆNH GIÁ ĐẾM:</div>
                      {(Object.keys(DENOMINATION_VALUES) as DenominationKey[]).map((key) => {
                        const qty = zReportShift.denominations?.[key] || 0;
                        if (qty <= 0) return null;
                        return (
                          <div key={key} className={styles.thermalRow}>
                            <span>
                              {formatVND(DENOMINATION_VALUES[key])} × {qty} tờ
                            </span>
                            <span>{formatVND(DENOMINATION_VALUES[key] * qty)}</span>
                          </div>
                        );
                      })}
                    </>
                  )}

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
