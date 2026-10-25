'use client';

import { useState, useEffect, useCallback } from 'react';
import styles from './QRPanel.module.css';
import { formatVND } from '@/data/menu';

export type QRSubTab = 'generator' | 'list' | 'redemption' | 'print';

interface QRToken {
  code: string;
  drink_value: number;
  status: 'ACTIVE' | 'USED' | 'EXPIRED';
  scanned_by?: string | null;
  scanned_at?: string | null;
  expires_at: string;
  created_at: string;
  scanner?: {
    full_name: string;
    phone: string;
    email: string;
  };
  qrDataUrl?: string;
  scan_url?: string;
}

const commonPrices = [28000, 29000, 32000, 35000, 38000, 39000, 42000, 45000, 47000, 55000, 59000];

interface QRPanelProps {
  initialSubTab?: QRSubTab;
}

export default function QRPanel({ initialSubTab = 'generator' }: QRPanelProps) {
  const [subTab, setSubTab] = useState<QRSubTab>(initialSubTab);

  // Generator state
  const [selectedPrice, setSelectedPrice] = useState<number>(35000);
  const [customPrice, setCustomPrice] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [generating, setGenerating] = useState(false);
  const [generatedTokens, setGeneratedTokens] = useState<QRToken[]>([]);

  // Token list state
  const [tokens, setTokens] = useState<QRToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [stats, setStats] = useState({ active: 0, used: 0, total: 0 });

  // Delete & Confirmation Modal State
  const [confirmDeleteCode, setConfirmDeleteCode] = useState<string | null>(null);
  const [confirmDeleteBulk, setConfirmDeleteBulk] = useState(false);
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  // Redemption state
  const [redeemCode, setRedeemCode] = useState('');
  const [redeemPhone, setRedeemPhone] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemResult, setRedeemResult] = useState<{ message: string; isError?: boolean } | null>(null);

  // Fetch token list with cache-busting
  const fetchTokens = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== 'ALL') params.set('status', statusFilter);
      if (search) params.set('search', search);
      params.set('_t', Date.now().toString());

      const res = await fetch(`/api/admin/qr?${params.toString()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });

      if (res.ok) {
        const data = await res.json();
        setTokens(data.tokens || []);
        if (data.stats) setStats(data.stats);
      }
    } catch (err) {
      console.error('Fetch QR error:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    if (subTab === 'list' || subTab === 'print') {
      fetchTokens();
    }
  }, [subTab, fetchTokens]);

  // Execute Delete Single Token with Optimistic UI Update
  const executeDeleteSingle = async (code: string) => {
    setConfirmDeleteCode(null);
    setDeleting(true);
    setNoticeMessage(null);

    // 1. Optimistic removal - disappears from screen immediately!
    const previousTokens = [...tokens];
    setTokens((prev) => prev.filter((t) => t.code !== code));
    setSelectedCodes((prev) => prev.filter((c) => c !== code));
    setStats((prev) => ({
      ...prev,
      total: Math.max(0, prev.total - 1),
      active: Math.max(0, prev.active - 1),
    }));

    try {
      const res = await fetch('/api/admin/qr', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setNoticeMessage({ text: `✅ Đã xóa thành công mã tem ${code}` });
      } else {
        // Rollback on failure
        setTokens(previousTokens);
        setNoticeMessage({ text: data.error || 'Lỗi khi xóa mã tem trong cơ sở dữ liệu', isError: true });
      }
    } catch (err) {
      console.error('Delete error:', err);
      setTokens(previousTokens);
      setNoticeMessage({ text: 'Lỗi kết nối máy chủ khi xóa mã tem', isError: true });
    } finally {
      setDeleting(false);
    }
  };

  // Execute Delete Selected Tokens (Bulk Delete)
  const executeDeleteBulk = async () => {
    const codesToDelete = [...selectedCodes];
    setConfirmDeleteBulk(false);
    if (codesToDelete.length === 0) return;

    setDeleting(true);
    setNoticeMessage(null);

    // Optimistic removal
    const previousTokens = [...tokens];
    setTokens((prev) => prev.filter((t) => !codesToDelete.includes(t.code)));
    setSelectedCodes([]);
    setStats((prev) => ({
      ...prev,
      total: Math.max(0, prev.total - codesToDelete.length),
      active: Math.max(0, prev.active - codesToDelete.length),
    }));

    try {
      const res = await fetch('/api/admin/qr', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codes: codesToDelete }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setNoticeMessage({ text: `✅ Đã xóa thành công ${codesToDelete.length} mã tem QR!` });
      } else {
        setTokens(previousTokens);
        setNoticeMessage({ text: data.error || 'Lỗi khi xóa các mã tem', isError: true });
      }
    } catch (err) {
      console.error('Bulk delete error:', err);
      setTokens(previousTokens);
      setNoticeMessage({ text: 'Lỗi kết nối máy chủ khi xóa', isError: true });
    } finally {
      setDeleting(false);
    }
  };

  // Select all toggler
  const handleToggleSelectAll = () => {
    if (selectedCodes.length === tokens.length && tokens.length > 0) {
      setSelectedCodes([]);
    } else {
      setSelectedCodes(tokens.map((t) => t.code));
    }
  };

  const handleToggleRow = (code: string) => {
    setSelectedCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  // Handle Generate QR Tokens
  const handleGenerate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const price = customPrice ? parseInt(customPrice, 10) : selectedPrice;
    if (!price || price <= 0) return;

    setGenerating(true);
    try {
      const res = await fetch('/api/admin/qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          drink_value: price,
          quantity,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const QRCode = (await import('qrcode')).default;

        const renderedTokens = await Promise.all(
          (data.tokens || []).map(async (t: any) => {
            const qrDataUrl = await QRCode.toDataURL(t.scan_url, {
              width: 160,
              margin: 1,
              color: { dark: '#1e293b', light: '#ffffff' },
              errorCorrectionLevel: 'M',
            });
            return {
              ...t,
              qrDataUrl,
            };
          })
        );

        setGeneratedTokens(renderedTokens);
      }
    } catch (err) {
      console.error('Generate QR error:', err);
    } finally {
      setGenerating(false);
    }
  };

  // Handle Manual Redemption at counter
  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!redeemCode || !redeemPhone) {
      setRedeemResult({ message: 'Vui lòng nhập cả mã QR và số điện thoại khách hàng', isError: true });
      return;
    }

    setRedeeming(true);
    setRedeemResult(null);

    try {
      const res = await fetch('/api/admin/qr/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: redeemCode.trim(),
          phone: redeemPhone.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setRedeemResult({ message: data.message });
        setRedeemCode('');
      } else {
        setRedeemResult({ message: data.error || 'Lỗi thực hiện đổi điểm', isError: true });
      }
    } catch (err) {
      console.error('Redemption error:', err);
      setRedeemResult({ message: 'Lỗi kết nối máy chủ', isError: true });
    } finally {
      setRedeeming(false);
    }
  };

  return (
    <div className={styles.panel}>
      {/* Confirmation Modal for Single Delete */}
      {confirmDeleteCode && (
        <div className={styles.modalOverlay} onClick={() => setConfirmDeleteCode(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalTitle}>
              <span>⚠️</span> Xác nhận xóa tem QR
            </div>
            <p className={styles.modalDesc}>
              Bạn có chắc chắn muốn xóa vĩnh viễn tem mã <strong style={{ color: 'var(--ink)' }}>{confirmDeleteCode}</strong> khỏi hệ thống? Thao tác này không thể hoàn tác.
            </p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.cancelModalBtn}
                onClick={() => setConfirmDeleteCode(null)}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                className={styles.confirmDeleteBtn}
                onClick={() => executeDeleteSingle(confirmDeleteCode)}
                disabled={deleting}
              >
                {deleting ? 'Đang xóa...' : 'Xóa Vĩnh Viễn'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Bulk Delete */}
      {confirmDeleteBulk && (
        <div className={styles.modalOverlay} onClick={() => setConfirmDeleteBulk(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalTitle}>
              <span>⚠️</span> Xác nhận xóa hàng loạt
            </div>
            <p className={styles.modalDesc}>
              Bạn đang chọn xóa <strong style={{ color: '#e11d48' }}>{selectedCodes.length}</strong> mã tem QR. Tất cả các tem này sẽ bị xóa khỏi cơ sở dữ liệu.
            </p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.cancelModalBtn}
                onClick={() => setConfirmDeleteBulk(false)}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                className={styles.confirmDeleteBtn}
                onClick={executeDeleteBulk}
                disabled={deleting}
              >
                {deleting ? 'Đang xóa...' : `Xóa ${selectedCodes.length} Tem`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <h2 className={styles.title}>📱 Quản lý Tem QR Tích Điểm</h2>
          <span className={styles.badge}>{stats.active} tem khả dụng</span>
        </div>
      </div>

      {/* Sub Tabs */}
      <div className={`${styles.subTabs} ${styles.noPrint}`}>
        <button
          className={`${styles.subTabBtn} ${subTab === 'generator' ? styles.activeSubTab : ''}`}
          onClick={() => setSubTab('generator')}
        >
          <span>✨</span> Sinh mã QR (Generator)
        </button>
        <button
          className={`${styles.subTabBtn} ${subTab === 'list' ? styles.activeSubTab : ''}`}
          onClick={() => setSubTab('list')}
        >
          <span>📋</span> Danh sách mã QR (List)
        </button>
        <button
          className={`${styles.subTabBtn} ${subTab === 'redemption' ? styles.activeSubTab : ''}`}
          onClick={() => setSubTab('redemption')}
        >
          <span>🏷️</span> Quét & Đổi tem tại quầy (Redemption)
        </button>
        <button
          className={`${styles.subTabBtn} ${subTab === 'print' ? styles.activeSubTab : ''}`}
          onClick={() => setSubTab('print')}
        >
          <span>🖨️</span> In tem nhãn hàng loạt (Print QR)
        </button>
      </div>

      {/* SUBTAB 1: QR GENERATOR */}
      {subTab === 'generator' && (
        <div className={styles.noPrint}>
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>
              <span>⚡</span> Chọn Mệnh Giá Ly Nước để Sinh Mã Tem QR
            </h3>

            <div className={styles.priceGrid}>
              {commonPrices.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`${styles.priceBtn} ${selectedPrice === p && !customPrice ? styles.activePrice : ''}`}
                  onClick={() => {
                    setSelectedPrice(p);
                    setCustomPrice('');
                  }}
                >
                  {formatVND(p)}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '20px' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                  Hoặc nhập giá tùy chỉnh:
                </label>
                <input
                  type="number"
                  placeholder="VD: 52000"
                  value={customPrice}
                  onChange={(e) => setCustomPrice(e.target.value)}
                  style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '6px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                  Số lượng tem in một lần:
                </label>
                <select
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '6px' }}
                >
                  <option value={1}>1 tem</option>
                  <option value={5}>5 tem</option>
                  <option value={10}>10 tem</option>
                  <option value={20}>20 tem</option>
                  <option value={50}>50 tem</option>
                </select>
              </div>

              <div style={{ alignSelf: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => handleGenerate()}
                  disabled={generating}
                  style={{
                    padding: '9px 24px',
                    background: 'var(--accent)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {generating ? 'Đang tạo...' : `Sinh ${quantity} mã QR`}
                </button>
              </div>
            </div>

            {/* Generated results */}
            {generatedTokens.length > 0 && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h4 style={{ margin: 0, color: 'var(--ink)' }}>
                    ✅ Đã tạo thành công {generatedTokens.length} tem QR ({formatVND(generatedTokens[0].drink_value)})
                  </h4>
                  <button
                    type="button"
                    onClick={() => {
                      setSubTab('print');
                    }}
                    style={{
                      padding: '8px 16px',
                      background: '#1b8a5a',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Xem & In Tem Ngay 🖨️
                  </button>
                </div>

                <div className={styles.printGrid}>
                  {generatedTokens.map((t) => (
                    <div key={t.code} className={styles.stickerLabel}>
                      <div className={styles.stickerHeader}>Ủ LAB</div>
                      <div className={styles.stickerPrice}>{formatVND(t.drink_value)}</div>
                      {t.qrDataUrl && (
                        <img src={t.qrDataUrl} alt="QR Code" width="130" height="130" />
                      )}
                      <div className={styles.stickerCode}>{t.code}</div>
                      <div className={styles.stickerFooter}>Quét để nhận hoàn tiền</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUBTAB 2: QR LIST */}
      {subTab === 'list' && (
        <div className={styles.noPrint}>
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>Tem đang khả dụng</span>
              <span className={styles.statValue} style={{ color: '#15803d' }}>{stats.active}</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>Tem đã quét nhận tiền</span>
              <span className={styles.statValue} style={{ color: '#475569' }}>{stats.used}</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>Tổng số tem đã phát hành</span>
              <span className={styles.statValue}>{stats.total}</span>
            </div>
          </div>

          {noticeMessage && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: '6px',
                marginBottom: '16px',
                backgroundColor: noticeMessage.isError ? '#fde8e8' : '#def7ec',
                color: noticeMessage.isError ? '#9b1c1c' : '#03543f',
                fontSize: '0.875rem',
                fontWeight: 600,
              }}
            >
              {noticeMessage.text}
            </div>
          )}

          <div className={styles.toolbar}>
            <div className={styles.searchBox}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={styles.searchIcon}>
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Tìm theo mã tem QR..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={styles.searchInput}
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={styles.select}
            >
              <option value="ALL">Tất cả trạng thái</option>
              <option value="ACTIVE">Khả dụng (Chưa quét)</option>
              <option value="USED">Đã sử dụng</option>
              <option value="EXPIRED">Đã hết hạn</option>
            </select>
          </div>

          {/* Bulk Action Bar when items selected */}
          {selectedCodes.length > 0 && (
            <div className={styles.bulkBar}>
              <span>Đang chọn <strong>{selectedCodes.length}</strong> mã tem QR</span>
              <button
                type="button"
                className={styles.bulkDeleteBtn}
                onClick={() => setConfirmDeleteBulk(true)}
                disabled={deleting}
              >
                🗑️ Xóa {selectedCodes.length} tem đã chọn
              </button>
            </div>
          )}

          <div className={styles.tableContainer}>
            {loading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ink-muted)' }}>
                Đang tải danh sách tem QR...
              </div>
            ) : tokens.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ink-muted)' }}>
                Không tìm thấy tem QR nào.
              </div>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th style={{ width: '40px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={tokens.length > 0 && selectedCodes.length === tokens.length}
                        onChange={handleToggleSelectAll}
                        title="Chọn tất cả"
                      />
                    </th>
                    <th>Mã tem QR</th>
                    <th>Mệnh giá ly</th>
                    <th>Trạng thái</th>
                    <th>Người quét nhận điểm</th>
                    <th>Thời gian quét</th>
                    <th>Hạn dùng</th>
                    <th style={{ textAlign: 'right' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {tokens.map((t) => {
                    const isSelected = selectedCodes.includes(t.code);
                    return (
                      <tr key={t.code} style={{ background: isSelected ? 'rgba(225, 29, 72, 0.04)' : undefined }}>
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleRow(t.code)}
                          />
                        </td>
                        <td>
                          <code style={{ fontWeight: 700, color: 'var(--ink)' }}>{t.code}</code>
                        </td>
                        <td>
                          <strong>{formatVND(t.drink_value)}</strong>
                        </td>
                        <td>
                          <span className={
                            t.status === 'ACTIVE'
                              ? styles.statusActive
                              : t.status === 'USED'
                              ? styles.statusUsed
                              : styles.statusExpired
                          }>
                            {t.status === 'ACTIVE' ? '● Chưa quét' : t.status === 'USED' ? '✓ Đã quét' : '✕ Hết hạn'}
                          </span>
                        </td>
                        <td>
                          {t.scanner ? (
                            <div>
                              <div style={{ fontWeight: 600 }}>{t.scanner.full_name}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>{t.scanner.phone}</div>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--ink-muted)', fontSize: '0.8rem' }}>Chưa ai quét</span>
                          )}
                        </td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--ink-secondary)' }}>
                          {t.scanned_at ? new Date(t.scanned_at).toLocaleString('vi-VN') : '—'}
                        </td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--ink-muted)' }}>
                          {new Date(t.expires_at).toLocaleString('vi-VN')}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className={styles.deleteBtn}
                            onClick={() => setConfirmDeleteCode(t.code)}
                            disabled={deleting}
                            title="Xóa tem QR này"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                            Xóa
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* SUBTAB 3: REDEMPTION AT COUNTER */}
      {subTab === 'redemption' && (
        <div className={styles.noPrint}>
          <div className={styles.card} style={{ maxWidth: '600px', margin: '0 auto' }}>
            <h3 className={styles.cardTitle}>
              <span>🏷️</span> Quét / Nhập Thủ Công Đổi Tem QR Cho Khách Tại Quầy
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--ink-secondary)', marginBottom: '16px' }}>
              Dành cho trường hợp khách hàng không có điện thoại kết nối mạng hoặc yêu cầu nhân viên cộng điểm trực tiếp vào số điện thoại.
            </p>

            <form onSubmit={handleRedeem}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '6px' }}>
                  Mã tem QR trên ly nước:
                </label>
                <input
                  type="text"
                  placeholder="VD: QR-35000-M2A3B4-XY89"
                  value={redeemCode}
                  onChange={(e) => setRedeemCode(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '1rem', fontFamily: 'monospace' }}
                  required
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '6px' }}>
                  Số điện thoại khách hàng nhận điểm:
                </label>
                <input
                  type="text"
                  placeholder="VD: 0947038325, 0938123456"
                  value={redeemPhone}
                  onChange={(e) => setRedeemPhone(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '1rem' }}
                  required
                />
              </div>

              {redeemResult && (
                <div
                  style={{
                    padding: '12px',
                    borderRadius: '6px',
                    marginBottom: '16px',
                    backgroundColor: redeemResult.isError ? '#fde8e8' : '#def7ec',
                    color: redeemResult.isError ? '#9b1c1c' : '#03543f',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                  }}
                >
                  {redeemResult.message}
                </div>
              )}

              <button
                type="submit"
                disabled={redeeming}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: 'var(--accent)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontSize: '0.95rem',
                }}
              >
                {redeeming ? 'Đang kiểm tra & tích điểm...' : 'Xác Nhận Tích Điểm'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* SUBTAB 4: PRINT QR STICKER LABELS */}
      {subTab === 'print' && (
        <div className={styles.printSection}>
          <div className={`${styles.card} ${styles.noPrint}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ margin: '0 0 4px', color: 'var(--ink)' }}>
                🖨️ Khổ In Tem Nhãn Dán Ly Nước (Thermal Stickers / Decal)
              </h3>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--ink-secondary)' }}>
                Hiển thị các tem QR khả dụng. Bấm "In Tem Ngay" để gửi lệnh tới máy in tem nhiệt (Xprinter/Gprinter) hoặc in khổ giấy A4.
              </p>
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              style={{
                padding: '10px 24px',
                background: '#1b8a5a',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 700,
                fontSize: '0.95rem',
                cursor: 'pointer',
              }}
            >
              In Tem Ngay 🖨️
            </button>
          </div>

          {/* Stickers Grid */}
          <div className={styles.printGrid}>
            {(generatedTokens.length > 0 ? generatedTokens : tokens.filter((t) => t.status === 'ACTIVE')).slice(0, 30).map((t) => (
              <div key={t.code} className={styles.stickerLabel}>
                <div className={styles.stickerHeader}>Ủ LAB</div>
                <div className={styles.stickerPrice}>{formatVND(t.drink_value)}</div>
                {t.qrDataUrl ? (
                  <img src={t.qrDataUrl} alt="QR Code" width="120" height="120" />
                ) : (
                  <div style={{ width: '120px', height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '4px' }}>
                    <span style={{ fontSize: '0.7rem', color: '#64748b' }}>QR: {t.code.slice(-6)}</span>
                  </div>
                )}
                <div className={styles.stickerCode}>{t.code}</div>
                <div className={styles.stickerFooter}>Quét để nhận hoàn tiền</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
