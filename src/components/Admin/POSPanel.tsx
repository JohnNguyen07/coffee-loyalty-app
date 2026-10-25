'use client';

import { useState, useCallback, useEffect } from 'react';
import styles from './POSPanel.module.css';
import { formatVND, getQuickPrices } from '@/data/menu';

interface GeneratedQR {
  code: string;
  drinkValue: number;
  qrDataUrl: string;
  createdAt: Date;
}

export default function POSPanel() {
  const [selectedPrice, setSelectedPrice] = useState<number | null>(null);
  const [customPrice, setCustomPrice] = useState('');
  const [generatedQR, setGeneratedQR] = useState<GeneratedQR | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [recentQRs, setRecentQRs] = useState<GeneratedQR[]>([]);

  const quickPrices = getQuickPrices();
  // Group common prices for quick selection based on current menu
  const commonPrices = quickPrices.length > 0 ? quickPrices : [29000, 34000, 39000, 42000, 46000, 69000, 74000];

  const generateQRCode = useCallback(async (price: number) => {
    setIsGenerating(true);

    let code = `QR-${price}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    let scanUrl = `${window.location.origin}/scan?code=${encodeURIComponent(code)}`;

    try {
      // Attempt to register token with API
      const res = await fetch('/api/qr/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ drink_value: price }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.code) {
          code = data.code;
          scanUrl = `${window.location.origin}/scan?code=${encodeURIComponent(code)}`;
        }
      }
    } catch {
      // Fallback to client-generated code
    }

    try {
      // Dynamic import QRCode to avoid SSR issues
      const QRCode = (await import('qrcode')).default;
      const qrDataUrl = await QRCode.toDataURL(scanUrl, {
        width: 200,
        margin: 1,
        color: { dark: '#2E3440', light: '#FFFFFF' },
        errorCorrectionLevel: 'M',
      });

      const newQR: GeneratedQR = {
        code,
        drinkValue: price,
        qrDataUrl,
        createdAt: new Date(),
      };

      setGeneratedQR(newQR);
      setRecentQRs((prev) => [newQR, ...prev.slice(0, 19)]);
    } catch (err) {
      console.error('QR generation failed:', err);
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const handleQuickPrice = (price: number) => {
    setSelectedPrice(price);
    setCustomPrice('');
    generateQRCode(price);
  };

  const handleCustomPrice = () => {
    const price = parseInt(customPrice);
    if (price > 0) {
      setSelectedPrice(price);
      generateQRCode(price);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Only auto-print if explicitly enabled by user
  const [autoPrintEnabled, setAutoPrintEnabled] = useState(false);

  useEffect(() => {
    if (generatedQR && autoPrintEnabled) {
      const timer = setTimeout(() => {
        handlePrint();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [generatedQR, autoPrintEnabled]);

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h2 className={styles.title}>POS · In tem QR tích điểm</h2>
        <p className={styles.subtitle}>Bấm chọn nhanh mức giá để tạo tem QR dán lên ly nước</p>
      </div>

      {/* Quick price buttons */}
      <div className={styles.section}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <h3 className={styles.sectionTitle}>Chọn nhanh mức giá menu</h3>
          <label style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={autoPrintEnabled}
              onChange={(e) => setAutoPrintEnabled(e.target.checked)}
            />
            Tự động mở hộp thoại in
          </label>
        </div>
        <div className={styles.priceGrid}>
          {commonPrices.map((price) => (
            <button
              key={price}
              className={`${styles.priceBtn} ${selectedPrice === price ? styles.priceActive : ''}`}
              onClick={() => handleQuickPrice(price)}
              disabled={isGenerating}
            >
              {formatVND(price)}
            </button>
          ))}
        </div>
      </div>

      {/* Custom price */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Hoặc nhập giá tùy chỉnh</h3>
        <div className={styles.customRow}>
          <input
            type="number"
            value={customPrice}
            onChange={(e) => setCustomPrice(e.target.value)}
            placeholder="Nhập giá (VNĐ)"
            className={styles.input}
            min="0"
            step="1000"
          />
          <button
            className={styles.generateBtn}
            onClick={handleCustomPrice}
            disabled={!customPrice || isGenerating}
          >
            {isGenerating ? (
              <span className={styles.spinner} />
            ) : (
              'Tạo QR'
            )}
          </button>
        </div>
      </div>

      {/* QR Preview */}
      {generatedQR && (
        <div className={styles.qrPreview}>
          <div className={styles.qrCard}>
            <div className={styles.qrPrice}>{formatVND(generatedQR.drinkValue)}</div>
            <img
              src={generatedQR.qrDataUrl}
              alt={`QR code for ${formatVND(generatedQR.drinkValue)}`}
              className={styles.qrImage}
            />
            <span className={styles.qrCode}>{generatedQR.code}</span>
          </div>

          <div style={{ display: 'flex', gap: '8px', width: '100%', maxWidth: '300px' }}>
            <button className={styles.printBtn} onClick={handlePrint} style={{ flex: 1 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
              In tem
            </button>

            <a
              href={`/scan?code=${encodeURIComponent(generatedQR.code)}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '10px 14px',
                background: 'var(--accent)',
                color: 'white',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              📷 Quét thử ngay
            </a>
          </div>
        </div>
      )}

      {/* Print label (hidden, only shown during print) */}
      {generatedQR && (
        <div className="print-label">
          <div className="print-label__price">{formatVND(generatedQR.drinkValue)}</div>
          <div className="print-label__qr">
            <img src={generatedQR.qrDataUrl} alt="QR" />
          </div>
        </div>
      )}

      {/* Recent QRs */}
      {recentQRs.length > 0 && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Mã QR gần đây</h3>
          <div className={styles.recentList}>
            {recentQRs.map((qr) => (
              <div key={qr.code} className={styles.recentItem}>
                <img src={qr.qrDataUrl} alt="" className={styles.recentQR} />
                <div className={styles.recentInfo}>
                  <span className={styles.recentPrice}>{formatVND(qr.drinkValue)}</span>
                  <span className={styles.recentCode}>{qr.code}</span>
                </div>
                <span className={styles.recentTime}>
                  {qr.createdAt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
