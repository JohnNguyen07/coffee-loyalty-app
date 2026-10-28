'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import styles from './RevenuePanel.module.css';
import { formatVND } from '@/data/menu';
import type {
  DateRangePreset,
  RevenueSummaryResult,
} from '@/lib/revenue/domain';
import type { DetailedRevenueOrder } from '@/lib/revenue/repository';

export default function RevenuePanel() {
  const [preset, setPreset] = useState<DateRangePreset>('TODAY');
  const [customFrom, setCustomFrom] = useState<string>('');
  const [customTo, setCustomTo] = useState<string>('');
  const [channelFilter, setChannelFilter] = useState<'ALL' | 'POS' | 'WEB'>('ALL');

  // Cash Drawer inputs
  const [openingCashInput, setOpeningCashInput] = useState<string>('0');
  const [cashPayoutsInput, setCashPayoutsInput] = useState<string>('0');
  const [actualCashCountedInput, setActualCashCountedInput] = useState<string>('');
  const [drawerNotesInput, setDrawerNotesInput] = useState<string>('');

  // Report state
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [reportData, setReportData] = useState<{
    boundaries: { from: string; to: string; label: string };
    summary: RevenueSummaryResult;
    orders: DetailedRevenueOrder[];
    staff: { fullName: string; staffRole: string; locationName: string };
  } | null>(null);

  const [savingDrawer, setSavingDrawer] = useState<boolean>(false);
  const [saveDrawerSuccess, setSaveDrawerSuccess] = useState<string | null>(null);
  const [orderSearchText, setOrderSearchText] = useState<string>('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('ALL');

  const fetchRevenueReport = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    setSaveDrawerSuccess(null);
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

      const openingCash = Number(openingCashInput.replace(/\D/g, '')) || 0;
      params.set('openingCash', String(openingCash));

      const payouts = Number(cashPayoutsInput.replace(/\D/g, '')) || 0;
      if (payouts > 0) params.set('cashPayouts', String(payouts));

      if (actualCashCountedInput.trim() !== '') {
        const actual = Number(actualCashCountedInput.replace(/\D/g, '')) || 0;
        params.set('actualCashCounted', String(actual));
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
  }, [preset, customFrom, customTo, channelFilter, openingCashInput, cashPayoutsInput, actualCashCountedInput]);

  useEffect(() => {
    let active = true;
    (async () => {
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

        const openingCash = Number(openingCashInput.replace(/\D/g, '')) || 0;
        params.set('openingCash', String(openingCash));

        const payouts = Number(cashPayoutsInput.replace(/\D/g, '')) || 0;
        if (payouts > 0) params.set('cashPayouts', String(payouts));

        if (actualCashCountedInput.trim() !== '') {
          const actual = Number(actualCashCountedInput.replace(/\D/g, '')) || 0;
          params.set('actualCashCounted', String(actual));
        }

        const res = await fetch(`/api/revenue/summary?${params.toString()}`, { cache: 'no-store' });
        if (!active) return;
        if (res.ok) {
          const data = await res.json();
          setReportData(data);
        }
      } catch {
        // ignore
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [preset, customFrom, customTo, channelFilter, openingCashInput, cashPayoutsInput, actualCashCountedInput]);

  // Handle saving cash drawer session
  const handleSaveDrawerCount = async () => {
    setSavingDrawer(true);
    setSaveDrawerSuccess(null);
    try {
      const openingCash = Number(openingCashInput.replace(/\D/g, '')) || 0;
      const actualCash = actualCashCountedInput.trim() !== ''
        ? Number(actualCashCountedInput.replace(/\D/g, ''))
        : (reportData?.summary.cashReconciliation.expectedCash || 0);
      const cashPayouts = Number(cashPayoutsInput.replace(/\D/g, '')) || 0;

      const res = await fetch('/api/revenue/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          openingCash,
          actualCash,
          cashPayouts,
          notes: drawerNotesInput.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSaveDrawerSuccess('✓ Đã lưu chốt két tiền mặt và nhật ký kiểm toán ca thành công!');
        await fetchRevenueReport();
      } else {
        setErrorMsg(data.error || 'Lỗi khi lưu phiên két.');
      }
    } catch {
      setErrorMsg('Không thể kết nối máy chủ để lưu phiên két.');
    } finally {
      setSavingDrawer(false);
    }
  };

  const rawOrders = reportData?.orders;
  const filteredOrders = useMemo(() => {
    if (!rawOrders) return [];
    const q = orderSearchText.trim().toLowerCase();
    return rawOrders.filter((ord) => {
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

  return (
    <div className={styles.panel}>
      {/* ── Top Header & Filter Bar ── */}
      <div className={styles.headerBar}>
        <div>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>M02 — Ghi Nhận Doanh Thu Tại Chỗ</h1>
            <span className={styles.locationBadge}>
              {reportData?.staff.locationName || 'Ủ LAB — Quầy Chính'}
            </span>
          </div>
          <p className={styles.subtitle}>
            Đối soát độc lập giữa <strong>Doanh thu đơn hàng</strong>, <strong>Tiền đã thu thực tế</strong>,{' '}
            <strong>Tiền hoàn lại</strong> và <strong>Chênh lệch tiền mặt</strong> tại quầy.
          </p>
        </div>

        <div className={styles.filterActionsRow}>
          {/* Preset Buttons */}
          <div className={styles.presetGroup} role="group" aria-label="Khoảng thời gian báo cáo">
            {(
              [
                { key: 'TODAY', label: 'Hôm nay' },
                { key: 'YESTERDAY', label: 'Hôm qua' },
                { key: 'LAST_7_DAYS', label: '7 ngày qua' },
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
            <option value="ALL">Tất cả kênh bán</option>
            <option value="POS">Tại quầy POS</option>
            <option value="WEB">Đơn đặt Website</option>
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

      {/* Custom Date Pickers when CUSTOM is selected */}
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

      {errorMsg && (
        <div className={styles.errorBanner} role="alert">
          ⚠️ {errorMsg}
        </div>
      )}

      {saveDrawerSuccess && (
        <div className={styles.successBanner} role="status">
          {saveDrawerSuccess}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          THE 4 CORE DASHBOARD METRIC CARDS (Exact Match to Design Mockup)
         ══════════════════════════════════════════════════════════════ */}
      <div className={styles.metricsGrid}>
        {/* CARD 1: Doanh thu đơn đã thanh toán */}
        <div className={styles.metricCard}>
          <div className={styles.metricIconWrap}>
            {/* Cash/Bill Icon */}
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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

        {/* CARD 2: Số đơn hàng */}
        <div className={styles.metricCard}>
          <div className={styles.metricIconWrap}>
            {/* Receipt Icon */}
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
              <path d="M8 7h8M8 11h8M8 15h5" />
            </svg>
          </div>
          <div className={styles.metricBody}>
            <span className={styles.metricLabel}>Số đơn hàng</span>
            <div className={styles.metricValueRow}>
              <span className={styles.metricNum}>{metrics ? metrics.orderCount : 0}</span>
              <span className={styles.metricUnit}>Đơn</span>
            </div>
            <div className={styles.metricSubInfo}>
              <span>AOV: {formatVND(summary?.orderRevenue.averageOrderValue || 0)}/đơn</span>
              {(summary?.refunds.cancelledOrderCount || 0) > 0 && (
                <span> · Hủy: {summary?.refunds.cancelledOrderCount} đơn</span>
              )}
            </div>
          </div>
        </div>

        {/* CARD 3: Tiền mặt thực tế */}
        <div className={styles.metricCard}>
          <div className={styles.metricIconWrap}>
            {/* Wallet Icon */}
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
              <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
              <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
            </svg>
          </div>
          <div className={styles.metricBody}>
            <span className={styles.metricLabel}>Tiền mặt thực tế</span>
            <div className={styles.metricValueRow}>
              <span className={styles.metricNum}>
                {metrics ? metrics.actualCash.toLocaleString('vi-VN') : '0'}
              </span>
              <span className={styles.metricUnit}>VND</span>
            </div>
            <div className={styles.metricSubInfo}>
              <span>Lý thuyết két: {formatVND(cashRec?.expectedCash || 0)}</span>
              {cashRec && cashRec.cashVariance !== 0 && (
                <span className={cashRec.cashVariance > 0 ? styles.varianceSurplus : styles.varianceShortage}>
                  {' '}· {cashRec.cashVariance > 0 ? `Thừa +${formatVND(cashRec.cashVariance)}` : `Thiếu ${formatVND(cashRec.cashVariance)}`}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* CARD 4: Chuyển khoản */}
        <div className={styles.metricCard}>
          <div className={styles.metricIconWrap}>
            {/* Arrows Transfer / Exchange Icon */}
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m8 3 4 4-4 4" />
              <path d="M4 7h8a4 4 0 0 1 4 4v1" />
              <path d="m16 21-4-4 4-4" />
              <path d="M20 17h-8a4 4 0 0 1-4-4v-1" />
            </svg>
          </div>
          <div className={styles.metricBody}>
            <span className={styles.metricLabel}>Chuyển khoản</span>
            <div className={styles.metricValueRow}>
              <span className={styles.metricNum}>
                {metrics ? metrics.bankTransferAmount.toLocaleString('vi-VN') : '0'}
              </span>
              <span className={styles.metricUnit}>VND</span>
            </div>
            <div className={styles.metricSubInfo}>
              <span>QR Ngân hàng: {formatVND(summary?.collection.bankTransferCollected || 0)}</span>
              {(summary?.collection.ewalletCollected || 0) > 0 && (
                <span> · Ví ĐT: {formatVND(summary?.collection.ewalletCollected || 0)}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          FINANCIAL RECONCILIATION BREAKDOWN (Phân Biệt 4 Cột Mốc)
         ══════════════════════════════════════════════════════════════ */}
      <div className={styles.sectionGrid}>
        {/* Left: 4-Way Reconciliation Table */}
        <div className={styles.reconcileCard}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>1. Đối Soát Dòng Tiền &amp; Doanh Thu Bán Hàng</h2>
            <span className={styles.cardBadge}>
              Thời gian: {reportData?.boundaries.label || 'Hôm nay'}
            </span>
          </div>

          <div className={styles.reconcileRows}>
            {/* Indicator 1: Doanh thu đơn hàng */}
            <div className={styles.reconcileRow}>
              <div className={styles.reconcileLabelGroup}>
                <span className={styles.stepBadge}>1</span>
                <div>
                  <strong>Doanh thu đơn hàng (Net Sales)</strong>
                  <p>Doanh thu thuần thực tế phát sinh từ các đơn đã hoàn tất thanh toán.</p>
                </div>
              </div>
              <span className={styles.reconcileAmount}>
                {formatVND(summary?.orderRevenue.netRevenue || 0)}
              </span>
            </div>

            {/* Indicator 2: Tiền đã thu */}
            <div className={styles.reconcileRow}>
              <div className={styles.reconcileLabelGroup}>
                <span className={styles.stepBadge}>2</span>
                <div>
                  <strong>Tiền đã thu (Payments Collected)</strong>
                  <p>
                    Tiền mặt: {formatVND(summary?.collection.cashCollected || 0)} · Chuyển khoản QR:{' '}
                    {formatVND(summary?.collection.bankTransferCollected || 0)}
                    {(summary?.collection.ewalletCollected || 0) > 0 &&
                      ` · Ví ĐT: ${formatVND(summary?.collection.ewalletCollected || 0)}`}
                  </p>
                </div>
              </div>
              <span className={`${styles.reconcileAmount} ${styles.greenAmount}`}>
                +{formatVND(summary?.collection.totalCollected || 0)}
              </span>
            </div>

            {/* Indicator 3: Tiền hoàn lại */}
            <div className={styles.reconcileRow}>
              <div className={styles.reconcileLabelGroup}>
                <span className={styles.stepBadge}>3</span>
                <div>
                  <strong>Tiền hoàn lại (Refunds)</strong>
                  <p>
                    Tiền mặt hoàn lại: {formatVND(summary?.refunds.cashRefunded || 0)} · Chuyển khoản hoàn lại:{' '}
                    {formatVND(summary?.refunds.bankTransferRefunded || 0)}
                    {(summary?.refunds.pointsRefunded || 0) > 0 &&
                      ` · Hoàn ${formatVND(summary?.refunds.pointsRefunded || 0)} điểm ví`}
                  </p>
                </div>
              </div>
              <span className={`${styles.reconcileAmount} ${styles.redAmount}`}>
                −{formatVND(summary?.refunds.totalRefunded || 0)}
              </span>
            </div>

            {/* Indicator 4: Chênh lệch tiền mặt */}
            <div className={`${styles.reconcileRow} ${styles.varianceRowHighlight}`}>
              <div className={styles.reconcileLabelGroup}>
                <span className={styles.stepBadge}>4</span>
                <div>
                  <strong>Chênh lệch tiền mặt (Cash Variance)</strong>
                  <p>
                    Lý thuyết két: {formatVND(cashRec?.expectedCash || 0)} vs Thực tế đếm được:{' '}
                    {formatVND(cashRec?.actualCash || 0)}
                  </p>
                </div>
              </div>
              <div className={styles.varianceBadgeWrap}>
                {cashRec?.varianceStatus === 'BALANCED' ? (
                  <span className={styles.badgeBalanced}>✓ Khớp 100% (0đ)</span>
                ) : cashRec?.varianceStatus === 'SURPLUS' ? (
                  <span className={styles.badgeSurplus}>
                    Thừa tiền: +{formatVND(cashRec.cashVariance)}
                  </span>
                ) : (
                  <span className={styles.badgeShortage}>
                    Thiếu hụt: {formatVND(cashRec?.cashVariance || 0)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Cash Drawer Count & Reconciliation Box */}
        <div className={styles.cashDrawerCard}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>2. Kiểm Đếm &amp; Chốt Két Tiền Mặt</h2>
            <span className={styles.cardBadge}>Thao tác tại quầy</span>
          </div>

          <p className={styles.drawerDesc}>
            Nhập tiền thối đầu ca và tiền mặt kiểm đếm thực tế để phần mềm tự động so khớp và tính chênh lệch két.
          </p>

          <div className={styles.drawerForm}>
            <div className={styles.formRow}>
              <label>1. Tiền thối đầu ca (Opening Cash):</label>
              <input
                type="text"
                value={openingCashInput}
                onChange={(e) => setOpeningCashInput(e.target.value)}
                placeholder="500000"
                className={styles.formInput}
              />
            </div>

            <div className={styles.formRow}>
              <label>2. Tiền mặt bán trong ca (Hệ thống tính):</label>
              <span className={styles.computedValueText}>
                +{formatVND(summary?.collection.cashCollected || 0)}
              </span>
            </div>

            <div className={styles.formRow}>
              <label>3. Tiền mặt hoàn đơn hủy (Hệ thống trừ):</label>
              <span className={styles.computedValueTextRed}>
                −{formatVND(summary?.refunds.cashRefunded || 0)}
              </span>
            </div>

            <div className={styles.formRow}>
              <label>4. Tiền chi khẩn cấp tại quầy (Mua đá, sữa...):</label>
              <input
                type="text"
                value={cashPayoutsInput}
                onChange={(e) => setCashPayoutsInput(e.target.value)}
                placeholder="0"
                className={styles.formInput}
              />
            </div>

            <div className={styles.formRowHighlight}>
              <label>👉 Tiền mặt LÝ THUYẾT phải có trong két:</label>
              <strong>{formatVND(cashRec?.expectedCash || 0)}</strong>
            </div>

            <div className={styles.formRow}>
              <label>5. Tiền mặt THỰC TẾ kiểm đếm được:</label>
              <input
                type="text"
                value={actualCashCountedInput}
                onChange={(e) => setActualCashCountedInput(e.target.value)}
                placeholder={String(cashRec?.expectedCash || '')}
                className={styles.formInputBold}
              />
            </div>

            <div className={styles.formRow}>
              <label>Ghi chú chốt ca / Lý do chênh lệch (nếu có):</label>
              <input
                type="text"
                value={drawerNotesInput}
                onChange={(e) => setDrawerNotesInput(e.target.value)}
                placeholder="VD: Khớp két cuối ca, tiền thối chuẩn..."
                className={styles.formInput}
              />
            </div>

            <button
              type="button"
              className={styles.saveDrawerBtn}
              onClick={handleSaveDrawerCount}
              disabled={savingDrawer}
            >
              {savingDrawer ? 'Đang lưu chốt két...' : '💾 Lưu & Chốt Phiên Kiểm Đếm Ca'}
            </button>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          TRANSACTION REVENUE DETAILS TABLE
         ══════════════════════════════════════════════════════════════ */}
      <div className={styles.tableSection}>
        <div className={styles.tableHeaderBar}>
          <div>
            <h2 className={styles.tableSectionTitle}>
              Chi Tiết Đơn Hàng &amp; Doanh Thu ({filteredOrders.length} đơn)
            </h2>
            <p className={styles.tableSectionSub}>
              Danh sách chi tiết từng đơn hàng phát sinh doanh thu trong kỳ đối soát.
            </p>
          </div>

          <div className={styles.tableFilters}>
            <select
              value={orderStatusFilter}
              onChange={(e) => setOrderStatusFilter(e.target.value)}
              className={styles.channelSelect}
              aria-label="Lọc theo trạng thái đơn"
            >
              <option value="ALL">Tất cả trạng thái</option>
              <option value="CONFIRMED">Đã thanh toán (CONFIRMED)</option>
              <option value="CANCELLED">Đã hủy (CANCELLED)</option>
              <option value="PENDING">Chờ xử lý (PENDING)</option>
            </select>

            <input
              type="search"
              placeholder="Tìm mã đơn, tên khách, món..."
              value={orderSearchText}
              onChange={(e) => setOrderSearchText(e.target.value)}
              className={styles.searchInput}
            />
          </div>
        </div>

        <div className={styles.tableCard}>
          {loading ? (
            <div className={styles.tableEmpty}>Đang tải danh sách giao dịch doanh thu...</div>
          ) : filteredOrders.length === 0 ? (
            <div className={styles.tableEmpty}>
              Không có giao dịch nào khớp với bộ lọc trong kỳ đối soát này.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className={styles.revenueTable}>
                <thead>
                  <tr>
                    <th>Mã đơn &amp; Thời gian</th>
                    <th>Kênh &amp; Khách hàng</th>
                    <th>Chi tiết món nước</th>
                    <th>Tạm tính</th>
                    <th>Giảm giá</th>
                    <th>Thực thu (Net)</th>
                    <th>Phương thức</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((ord) => {
                    const isCancelled = ord.status === 'CANCELLED';
                    return (
                      <tr key={ord.id}>
                        <td>
                          <div className={styles.codeCell}>
                            <span className={styles.codeMono}>#{ord.orderCode}</span>
                            <span className={styles.dateCell}>
                              {new Date(ord.createdAt).toLocaleString('vi-VN', {
                                hour: '2-digit',
                                minute: '2-digit',
                                day: '2-digit',
                                month: '2-digit',
                              })}
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className={styles.customerCell}>
                            <strong>{ord.customerName}</strong>
                            <span>
                              {ord.channel === 'POS' ? '🛒 POS Quầy' : '🌐 Website'}
                              {ord.customerPhone ? ` · ${ord.customerPhone}` : ''}
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className={styles.itemsSummaryText}>{ord.itemsSummary}</div>
                        </td>
                        <td>
                          <span>{formatVND(ord.subtotal)}</span>
                        </td>
                        <td>
                          {ord.discountAmount > 0 ? (
                            <span className={styles.discountText}>
                              -{formatVND(ord.discountAmount)}
                            </span>
                          ) : (
                            <span className={styles.mutedDash}>—</span>
                          )}
                        </td>
                        <td>
                          <strong className={styles.netAmountText}>
                            {formatVND(ord.totalDue)}
                          </strong>
                        </td>
                        <td>
                          <span className={styles.paymentMethodBadge}>
                            {ord.paymentMethod === 'CASH'
                              ? '💵 Tiền mặt'
                              : ord.paymentMethod === 'BANK_TRANSFER'
                                ? '🏦 Chuyển khoản'
                                : '📱 Ví ĐT'}
                          </span>
                        </td>
                        <td>
                          {isCancelled ? (
                            <div>
                              <span className={styles.badgeCancelled}>Đã hủy / Hoàn tiền</span>
                              {ord.cancelReason && (
                                <div className={styles.cancelReasonMini}>
                                  Lý do: {ord.cancelReason}
                                </div>
                              )}
                            </div>
                          ) : ord.status === 'PENDING' ? (
                            <span className={styles.badgePending}>Chờ xác nhận</span>
                          ) : (
                            <span className={styles.badgeConfirmed}>Đã thanh toán</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
