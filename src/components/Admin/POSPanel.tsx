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
  const [batchQty, setBatchQty] = useState<number>(1);
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

  const generateQR = async (price: number, label?: string, qty: number = 1) => {
    if (!price || price <= 0) return;
    setIsGenerating(true);

    try {
      if (qty > 1) {
        // Batch generate via /api/admin/qr
        const res = await fetch('/api/admin/qr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ drink_value: price, quantity: qty, prefix: 'QR' }),
        });

        if (res.ok) {
          const data = await res.json();
          const firstToken = data.tokens?.[0];
          if (firstToken) {
            const scanUrl = buildScanUrl(firstToken.code);
            const qrDataUrl = await QRCode.toDataURL(scanUrl, {
              width: 280,
              margin: 2,
              color: { dark: '#1E3932', light: '#FFFFFF' },
            });
            setCurrentQR({
              code: firstToken.code,
              price,
              label: label ? `${label} (Lô ${qty} tem)` : `Lô ${qty} tem · ${formatVND(price)}`,
              qrDataUrl,
              scanUrl,
              createdAt: new Date().toLocaleTimeString('vi-VN'),
            });
          }
          fetchDBTokens();
          setIsGenerating(false);
          return;
        }
      }

      // Single QR generate
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
        width: 280,
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
    generateQR(price, undefined, batchQty);
  };

  const handleMenuDrinkSelect = (drinkName: string, sizeLabel: string, price: number) => {
    setSelectedPrice(price);
    setCustomPrice('');
    generateQR(price, `${drinkName} (${sizeLabel})`, 1);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const price = parseInt(customPrice.replace(/\D/g, ''), 10);
    if (price && price >= 1000) {
      setSelectedPrice(null);
      generateQR(price, undefined, batchQty);
    }
  };

  const handleCopyLink = (qrCode: string) => {
    const url = buildScanUrl(qrCode);
    navigator.clipboard.writeText(url);
    setCopiedCode(qrCode);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handlePrintSingle = async (qrCode: string, price: number, existingDataUrl?: string) => {
    const scanUrl = buildScanUrl(qrCode);
    const dataUrl =
      existingDataUrl ||
      (await QRCode.toDataURL(scanUrl, {
        width: 260,
        margin: 2,
        color: { dark: '#1E3932', light: '#FFFFFF' },
      }));

    const printWindow = window.open('', '_blank', 'width=420,height=520');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>In Tem QR - Ủ LAB</title>
        <style>
          @page { size: 50mm 30mm; margin: 1.5mm; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            margin: 0;
            padding: 4px;
            text-align: center;
            color: #1E3932;
          }
          .brand { font-size: 9px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }
          .qr { width: 76px; height: 76px; margin: 2px 0; }
          .price { font-size: 11px; font-weight: 800; }
          .hint { font-size: 7px; color: #444; }
          .code { font-size: 6px; font-family: monospace; color: #666; margin-top: 1px; }
        </style>
      </head>
      <body>
        <div class="brand">Ủ LAB · TÍCH ĐIỂM</div>
        <img class="qr" src="${dataUrl}" alt="QR" />
        <div class="price">${formatVND(price)}</div>
        <div class="hint">Mở Camera ĐT quét nhận hoàn tiền 3-10%</div>
        <div class="code">${qrCode}</div>
        <script>
          window.onload = () => { window.print(); window.close(); };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleBatchPrintSelected = async () => {
    const targets = dbTokens.filter((t) => selectedCodes.includes(t.code));
    if (targets.length === 0) return;

    const stickersHtml: string[] = [];
    for (const t of targets) {
      const url = buildScanUrl(t.code);
      const dataUrl = await QRCode.toDataURL(url, {
        width: 220,
        margin: 2,
        color: { dark: '#1E3932', light: '#FFFFFF' },
      });
      stickersHtml.push(`
        <div class="sticker">
          <div class="brand">Ủ LAB · REWARDS</div>
          <img class="qr" src="${dataUrl}" alt="QR" />
          <div class="price">${formatVND(t.drink_value)}</div>
          <div class="hint">Quét bằng Camera ĐT</div>
          <div class="code">${t.code}</div>
        </div>
      `);
    }

    const printWindow = window.open('', '_blank', 'width=800,height=700');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>In Lô Tem QR (${targets.length} tem) - Ủ LAB</title>
        <style>
          body { font-family: sans-serif; margin: 12px; color: #1E3932; }
          .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
          .sticker {
            border: 1px dashed #1E3932;
            border-radius: 8px;
            padding: 8px;
            text-align: center;
            page-break-inside: avoid;
          }
          .brand { font-size: 10px; font-weight: 800; }
          .qr { width: 100px; height: 100px; margin: 4px auto; display: block; }
          .price { font-size: 12px; font-weight: 800; }
          .hint { font-size: 9px; color: #555; }
          .code { font-size: 8px; font-family: monospace; color: #666; margin-top: 2px; word-break: break-all; }
        </style>
      </head>
      <body>
        <div class="grid">${stickersHtml.join('')}</div>
        <script>window.onload = () => { window.print(); };</script>
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
          Chọn món hoặc mệnh giá để in tem QR dán lên ly. Khi khách dùng <strong>Camera điện thoại</strong> quét tem, điện thoại sẽ tự mở đường dẫn <code>/scan?code=...</code> để cộng tiền hoàn tự động.
        </p>
      </div>

      <div className={styles.posGrid}>
        {/* Left Column: Menu Item Picker & Quick Price Generator */}
        <div className={styles.leftCol}>
          {/* 1. Pick by Menu Item */}
          <div className={styles.cardBox}>
            <div className={styles.cardHeaderRow}>
              <h2 className={styles.sectionTitle}>1. Chọn nhanh theo Món trong Thực Đơn</h2>
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

          {/* 2. Quick Prices & Batch Quantity */}
          <div className={styles.cardBox}>
            <div className={styles.cardHeaderRow}>
              <h2 className={styles.sectionTitle}>2. Chọn Mệnh Giá Nhanh / Tạo Theo Lô</h2>
              <div className={styles.qtySelector}>
                <span>Số lượng tem:</span>
                {[1, 5, 10, 20].map((q) => (
                  <button
                    key={q}
                    type="button"
                    className={`${styles.qtyPill} ${batchQty === q ? styles.qtyPillActive : ''}`}
                    onClick={() => setBatchQty(q)}
                  >
                    {q}
                  </button>
                ))}
              </div>
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
                {isGenerating ? <span className={styles.spinner} /> : `Tạo ${batchQty > 1 ? `${batchQty} tem` : 'tem QR'}`}
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Active QR Sticker & Link Preview */}
        <div className={styles.rightCol}>
          <div className={styles.qrPreviewCard} ref={printRef}>
            {currentQR ? (
              <>
                <span className={styles.previewBadge}>TEM QR VỪA TẠO</span>
                {currentQR.label && <div className={styles.qrDrinkLabel}>{currentQR.label}</div>}
                <div className={styles.qrPrice}>{formatVND(currentQR.price)}</div>
                <img
                  src={currentQR.qrDataUrl}
                  alt="QR Code"
                  className={styles.qrImage}
                />
                <span className={styles.qrCode}>{currentQR.code}</span>

                <div className={styles.cashbackHintBox}>
                  Hoàn tiền tự động: <strong>+{formatVND(Math.round(currentQR.price * 0.03))}</strong> (Member) →{' '}
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
                    handlePrintSingle(currentQR.code, currentQR.price, currentQR.qrDataUrl)
                  }
                >
                  🖨️ In Tem Dán Ly (50×30mm)
                </button>
              </>
            ) : (
              <div className={styles.emptyPreview}>
                <div className={styles.emptyQrIcon}>QR</div>
                <h3>Chưa chọn món hoặc mệnh giá</h3>
                <p>
                  Bấm vào một món nước hoặc mệnh giá bên trái để tạo mã QR chứa đường dẫn tích điểm tự động.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. Database QR Tokens Table & Batch Print */}
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
              <>
                <button
                  type="button"
                  onClick={handleBatchPrintSelected}
                  className={styles.batchPrintBtn}
                >
                  🖨️ In {selectedCodes.length} tem đã chọn
                </button>
                <button
                  type="button"
                  onClick={handleBatchDelete}
                  className={styles.batchDeleteBtn}
                >
                  Xóa ({selectedCodes.length})
                </button>
              </>
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
                              title="In tem này"
                            >
                              In tem
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
