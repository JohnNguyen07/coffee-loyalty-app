'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import styles from './POSPanel.module.css';
import { menuData, getQuickPrices, formatVND } from '@/data/menu';
import QRCode from 'qrcode';

interface GeneratedQR {
  code: string;
  price: number;
  label?: string;
  qrDataUrl: string;
  scanUrl: string;
  createdAt: string;
}

interface DBQRToken {
  id?: string;
  code: string;
  drink_value: number;
  status: 'ACTIVE' | 'USED' | 'EXPIRED';
  scanned_by?: string | null;
  scanned_at?: string | null;
  expires_at?: string;
  created_at?: string;
  scanner?: {
    full_name?: string;
    phone?: string;
    email?: string;
  } | null;
}

export default function POSPanel() {
  const quickPrices = getQuickPrices();
  const [selectedPrice, setSelectedPrice] = useState<number | null>(null);
  const [customPrice, setCustomPrice] = useState('');
  const [activeCategorySlug, setActiveCategorySlug] = useState<string>('all');
  const [currentQR, setCurrentQR] = useState<GeneratedQR | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  // Database QR list state
  const [dbTokens, setDbTokens] = useState<DBQRToken[]>([]);
  const [dbStats, setDbStats] = useState({ active: 0, used: 0, total: 0 });
  const [loadingTokens, setLoadingTokens] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'USED'>('ALL');
  const [searchCode, setSearchCode] = useState('');
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [deletingCode, setDeletingCode] = useState<string | null>(null);

  const buildScanUrl = (qrCode: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    return `${origin}/scan?code=${encodeURIComponent(qrCode)}`;
  };

  const fetchDBTokens = useCallback(async () => {
    setLoadingTokens(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (searchCode.trim()) params.set('search', searchCode.trim());
      params.set('_t', Date.now().toString());

      const res = await fetch(`/api/admin/qr?${params.toString()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
      });
      if (res.ok) {
        const data = await res.json();
        setDbTokens(data.tokens || []);
        if (data.stats) setDbStats(data.stats);
      }
    } catch (err) {
      console.error('Fetch QR tokens error:', err);
    } finally {
      setLoadingTokens(false);
    }
  }, [statusFilter, searchCode]);

  useEffect(() => {
    fetchDBTokens();
  }, [fetchDBTokens]);

  const generateQR = async (price: number, label?: string) => {
    if (!price || price <= 0) return;
    setIsGenerating(true);

    try {
      // Single QR generate (1 sticker only)
      let code = `QR-${price}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      try {
        const res = await fetch('/api/qr/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ drink_value: price, custom_code: code }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.code) code = data.code;
        }
      } catch {
        // Offline / demo fallback
      }

      const scanUrl = buildScanUrl(code);
      const qrDataUrl = await QRCode.toDataURL(scanUrl, {
        width: 340,
        margin: 2,
        color: { dark: '#1E3932', light: '#FFFFFF' },
      });

      const newQR: GeneratedQR = {
        code,
        price,
        label,
        qrDataUrl,
        scanUrl,
        createdAt: new Date().toLocaleTimeString('vi-VN'),
      };

      setCurrentQR(newQR);
      fetchDBTokens();
    } catch (err) {
      console.error('QR generation failed:', err);
    }

    setIsGenerating(false);
  };

  const handleQuickPrice = (price: number) => {
    setSelectedPrice(price);
    setCustomPrice('');
    generateQR(price, undefined);
  };

  const handleMenuDrinkSelect = (drinkName: string, sizeLabel: string, price: number) => {
    setSelectedPrice(price);
    setCustomPrice('');
    generateQR(price, `${drinkName} (${sizeLabel})`);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const price = parseInt(customPrice.replace(/\D/g, ''), 10);
    if (price && price >= 1000) {
      setSelectedPrice(null);
      generateQR(price, undefined);
    }
  };

  const handleCopyLink = (qrCode: string) => {
    const url = buildScanUrl(qrCode);
    navigator.clipboard.writeText(url);
    setCopiedCode(qrCode);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // Single 75x100mm sticker print (1 sheet only)
  const handlePrintSingle = async (
    qrCode: string,
    price: number,
    existingDataUrl?: string,
    drinkLabel?: string
  ) => {
    const scanUrl = buildScanUrl(qrCode);
    const dataUrl =
      existingDataUrl ||
      (await QRCode.toDataURL(scanUrl, {
        width: 360,
        margin: 2,
        color: { dark: '#1E3932', light: '#FFFFFF' },
      }));

    const printWindow = window.open('', '_blank', 'width=450,height=600');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>In Tem QR 75x100mm - Ủ LAB</title>
        <style>
          @page {
            size: 75mm 100mm;
            margin: 0;
          }
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }
          html, body {
            width: 75mm;
            height: 100mm;
            overflow: hidden;
            page-break-after: avoid;
            page-break-before: avoid;
            page-break-inside: avoid;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 4mm;
            text-align: center;
            color: #1E3932;
            background: #FFFFFF;
          }
          .brand {
            font-size: 13pt;
            font-weight: 800;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            margin-bottom: 2mm;
          }
          .label {
            font-size: 10pt;
            font-weight: 700;
            color: #006241;
            margin-bottom: 1.5mm;
            max-width: 67mm;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .qr {
            width: 48mm;
            height: 48mm;
            margin: 2mm 0;
            display: block;
          }
          .price {
            font-size: 15pt;
            font-weight: 800;
            margin-top: 1mm;
          }
          .hint {
            font-size: 8.5pt;
            font-weight: 600;
            color: #333;
            margin-top: 1.5mm;
            line-height: 1.3;
          }
          .code {
            font-size: 7.5pt;
            font-family: monospace;
            color: #555;
            margin-top: 1.5mm;
            word-break: break-all;
          }
        </style>
      </head>
      <body>
        <div class="brand">Ủ LAB · TÍCH ĐIỂM</div>
        ${drinkLabel ? `<div class="label">${drinkLabel}</div>` : ''}
        <img class="qr" src="${dataUrl}" alt="QR" />
        <div class="price">${formatVND(price)}</div>
        <div class="hint">Mở Camera ĐT quét nhận hoàn điểm 3-10%</div>
        <div class="code">${qrCode}</div>
        <script>
          window.onload = () => {
            window.focus();
            window.print();
            window.close();
          };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleDeleteToken = async (codeToDelete: string) => {
    setDeletingCode(codeToDelete);
    try {
      const res = await fetch('/api/admin/qr', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: codeToDelete }),
      });

      if (res.ok) {
        setDbTokens((prev) => prev.filter((t) => t.code !== codeToDelete));
        setSelectedCodes((prev) => prev.filter((c) => c !== codeToDelete));
        if (currentQR?.code === codeToDelete) setCurrentQR(null);
        await fetchDBTokens();
      }
    } catch (err) {
      console.error('Delete QR error:', err);
    } finally {
      setDeletingCode(null);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedCodes.length === 0) return;
    if (!confirm(`Xóa ${selectedCodes.length} mã QR đã chọn?`)) return;

    try {
      const res = await fetch('/api/admin/qr', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codes: selectedCodes }),
      });

      if (res.ok) {
        const deletedSet = new Set(selectedCodes);
        setDbTokens((prev) => prev.filter((t) => !deletedSet.has(t.code)));
        setSelectedCodes([]);
        await fetchDBTokens();
      }
    } catch (err) {
      console.error('Batch delete error:', err);
    }
  };

  const toggleSelectCode = (code: string) => {
    setSelectedCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const toggleSelectAll = () => {
    if (selectedCodes.length === dbTokens.length) {
      setSelectedCodes([]);
    } else {
      setSelectedCodes(dbTokens.map((t) => t.code));
    }
  };

  const filteredMenuCategories = menuData.filter(
    (cat) => activeCategorySlug === 'all' || cat.slug === activeCategorySlug
  );

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h1 className={styles.title}>POS Quầy Pha Chế &amp; Tạo Tem QR</h1>
        <p className={styles.subtitle}>
          Chọn món hoặc mệnh giá để in <strong>1 tem QR duy nhất (khổ 75×100mm)</strong> dán lên ly. Khi khách dùng <strong>Camera điện thoại</strong> quét tem, điện thoại sẽ tự mở đường dẫn <code>/scan?code=...</code> để cộng điểm hoàn tự động.
        </p>
      </div>

      <div className={styles.posGrid}>
        {/* Left Column: Menu Item Picker & Quick Price Generator */}
        <div className={styles.leftCol}>
          {/* 1. Pick by Menu Item */}
          <div className={styles.cardBox}>
            <div className={styles.cardHeaderRow}>
              <h2 className={styles.sectionTitle}>1. Chọn nhanh theo Món trong Menu</h2>
              <div className={styles.catFilterPills}>
                <button
                  type="button"
                  className={`${styles.catPill} ${activeCategorySlug === 'all' ? styles.catPillActive : ''}`}
                  onClick={() => setActiveCategorySlug('all')}
                >
                  Tất cả
                </button>
                {menuData.map((c) => (
                  <button
                    key={c.slug}
                    type="button"
                    className={`${styles.catPill} ${activeCategorySlug === c.slug ? styles.catPillActive : ''}`}
                    onClick={() => setActiveCategorySlug(c.slug)}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.menuDrinkGrid}>
              {filteredMenuCategories.map((cat) =>
                cat.items.map((item) => (
                  <div key={item.id} className={styles.posDrinkCard}>
                    <span className={styles.posDrinkName}>{item.name}</span>
                    <div className={styles.posDrinkSizes}>
                      {item.sizes.map((sz) => (
                        <button
                          key={sz.label}
                          type="button"
                          className={styles.posSizeBtn}
                          disabled={isGenerating}
                          onClick={() => handleMenuDrinkSelect(item.name, sz.label, sz.price)}
                        >
                          <span className={styles.posSizeLabel}>{sz.label}</span>
                          <span className={styles.posSizePrice}>{formatVND(sz.price)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 2. Quick Prices (Single Sticker 75x100mm) */}
          <div className={styles.cardBox}>
            <div className={styles.cardHeaderRow}>
              <h2 className={styles.sectionTitle}>2. Chọn Mệnh Giá Nhanh (1 Tem · Khổ 75×100mm)</h2>
            </div>

            <div className={styles.priceGrid}>
              {quickPrices.map((price) => (
                <button
                  type="button"
                  key={price}
                  className={`${styles.priceBtn} ${selectedPrice === price ? styles.priceActive : ''}`}
                  onClick={() => handleQuickPrice(price)}
                  disabled={isGenerating}
                >
                  {formatVND(price)}
                </button>
              ))}
            </div>

            <form onSubmit={handleCustomSubmit} className={styles.customRow}>
              <input
                type="number"
                placeholder="Hoặc nhập tổng tiền hóa đơn (VD: 105000)..."
                value={customPrice}
                onChange={(e) => setCustomPrice(e.target.value)}
                className={styles.input}
                min={1000}
                step={1000}
              />
              <button
                type="submit"
                className={styles.generateBtn}
                disabled={isGenerating || !customPrice}
              >
                {isGenerating ? <span className={styles.spinner} /> : 'Tạo 1 tem QR'}
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Active QR Sticker & Link Preview */}
        <div className={styles.rightCol}>
          <div className={styles.qrPreviewCard} ref={printRef}>
            {currentQR ? (
              <>
                <span className={styles.previewBadge}>TEM QR VỪA TẠO (75×100mm · 1 TỜ)</span>
                {currentQR.label && <div className={styles.qrDrinkLabel}>{currentQR.label}</div>}
                <div className={styles.qrPrice}>{formatVND(currentQR.price)}</div>
                <img
                  src={currentQR.qrDataUrl}
                  alt="QR Code"
                  className={styles.qrImage}
                />
                <span className={styles.qrCode}>{currentQR.code}</span>

                <div className={styles.cashbackHintBox}>
                  Hoàn điểm tự động: <strong>+{formatVND(Math.round(currentQR.price * 0.03))}</strong> (Member) →{' '}
                  <strong>+{formatVND(Math.round(currentQR.price * 0.1))}</strong> (Diamond)
                </div>

                {/* Exact Link Box for Native Camera */}
                <div className={styles.linkPreviewBox}>
                  <span className={styles.linkPreviewLabel}>
                    Đường dẫn mở khi khách quét bằng Camera điện thoại:
                  </span>
                  <code className={styles.linkPreviewUrl}>{currentQR.scanUrl}</code>
                  <div className={styles.linkPreviewActions}>
                    <button
                      type="button"
                      className={styles.secondaryActionBtn}
                      onClick={() => handleCopyLink(currentQR.code)}
                    >
                      {copiedCode === currentQR.code ? '✓ Đã sao chép link' : 'Sao chép link'}
                    </button>
                    <a
                      href={currentQR.scanUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.secondaryActionBtn}
                    >
                      Mở thử link ↗
                    </a>
                  </div>
                </div>

                <button
                  type="button"
                  className={styles.printBtn}
                  onClick={() =>
                    handlePrintSingle(
                      currentQR.code,
                      currentQR.price,
                      currentQR.qrDataUrl,
                      currentQR.label
                    )
                  }
                >
                  🖨️ In 1 Tem QR (Khổ 75×100mm · 1 Tờ)
                </button>
              </>
            ) : (
              <div className={styles.emptyPreview}>
                <div className={styles.emptyQrIcon}>QR</div>
                <h3>Chưa chọn món hoặc mệnh giá</h3>
                <p>
                  Bấm vào một món nước hoặc mệnh giá bên trái để tạo 1 tem QR khổ 75×100mm duy nhất.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. Database QR Tokens Table */}
      <div className={styles.section} style={{ marginTop: 28 }}>
        <div className={styles.tableHeaderBar}>
          <div>
            <h2 className={styles.sectionTitle} style={{ marginBottom: 4 }}>
              3. Quản lý Danh sách Mã QR ({dbStats.total} mã)
            </h2>
            <div className={styles.statsBadges}>
              <span className={styles.statBadgeActive}>
                Chưa quét: <strong>{dbStats.active}</strong>
              </span>
              <span className={styles.statBadgeUsed}>
                Đã tích điểm: <strong>{dbStats.used}</strong>
              </span>
            </div>
          </div>

          <div className={styles.tableFilterActions}>
            {selectedCodes.length > 0 && (
              <button
                type="button"
                onClick={handleBatchDelete}
                className={styles.batchDeleteBtn}
              >
                Xóa ({selectedCodes.length})
              </button>
            )}

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'ALL' | 'ACTIVE' | 'USED')}
              className={styles.filterSelect}
            >
              <option value="ALL">Tất cả trạng thái</option>
              <option value="ACTIVE">Chưa quét (ACTIVE)</option>
              <option value="USED">Đã quét (USED)</option>
            </select>

            <input
              type="text"
              placeholder="Tìm mã QR..."
              value={searchCode}
              onChange={(e) => setSearchCode(e.target.value)}
              className={styles.searchInput}
            />

            <button
              type="button"
              onClick={fetchDBTokens}
              className={styles.refreshBtn}
            >
              Làm mới
            </button>
          </div>
        </div>

        <div className={styles.tableCard}>
          {loadingTokens ? (
            <div className={styles.tableEmpty}>Đang tải danh sách mã QR...</div>
          ) : dbTokens.length === 0 ? (
            <div className={styles.tableEmpty}>Chưa có mã QR nào trong danh sách.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className={styles.qrTable}>
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>
                      <input
                        type="checkbox"
                        checked={dbTokens.length > 0 && selectedCodes.length === dbTokens.length}
                        onChange={toggleSelectAll}
                      />
                    </th>
                    <th>Mã QR &amp; Link Quét</th>
                    <th>Giá trị ly</th>
                    <th>Trạng thái</th>
                    <th>Khách hàng đã quét</th>
                    <th>Thời gian tạo</th>
                    <th style={{ textAlign: 'right' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {dbTokens.map((t) => {
                    const isUsed = t.status === 'USED';
                    return (
                      <tr key={t.code}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedCodes.includes(t.code)}
                            onChange={() => toggleSelectCode(t.code)}
                          />
                        </td>
                        <td>
                          <div className={styles.codeCell}>
                            <span className={styles.codeMono}>{t.code}</span>
                            <span className={styles.codeSubLink}>
                              /scan?code={t.code}
                            </span>
                          </div>
                        </td>
                        <td className={styles.priceCell}>{formatVND(t.drink_value)}</td>
                        <td>
                          <span
                            className={isUsed ? styles.badgeUsed : styles.badgeActive}
                          >
                            {isUsed ? 'Đã tích điểm' : 'Chưa quét'}
                          </span>
                        </td>
                        <td>
                          {t.scanner ? (
                            <div className={styles.scannerCell}>
                              <strong>{t.scanner.full_name || 'Thành viên'}</strong>
                              <span>{t.scanner.phone || t.scanner.email}</span>
                            </div>
                          ) : (
                            <span className={styles.mutedDash}>—</span>
                          )}
                        </td>
                        <td className={styles.dateCell}>
                          {t.created_at
                            ? new Date(t.created_at).toLocaleString('vi-VN', {
                                day: '2-digit',
                                month: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '—'}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div className={styles.rowActions}>
                            <button
                              type="button"
                              className={styles.rowBtn}
                              onClick={() => handlePrintSingle(t.code, t.drink_value)}
                              title="In 1 tem 75x100mm"
                            >
                              In tem (75×100)
                            </button>
                            <button
                              type="button"
                              className={styles.rowBtn}
                              onClick={() => handleCopyLink(t.code)}
                              title="Sao chép đường dẫn QR"
                            >
                              {copiedCode === t.code ? '✓ Đã chép' : 'Copy link'}
                            </button>
                            <button
                              type="button"
                              className={styles.rowDeleteBtn}
                              disabled={deletingCode === t.code}
                              onClick={() => handleDeleteToken(t.code)}
                            >
                              {deletingCode === t.code ? '...' : 'Xóa'}
                            </button>
                          </div>
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
