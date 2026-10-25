'use client';

import { useEffect, useState, useRef, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import styles from './page.module.css';
import { formatVND } from '@/data/menu';
import { useAuth } from '@/hooks/useAuth';
import { isSupabaseConfigured } from '@/lib/supabase/client';

type ScanStatus = 'idle' | 'scanning' | 'phone_prompt' | 'looking_up' | 'success' | 'error' | 'login';

interface LookedUpUser {
  id: string;
  full_name: string;
  phone: string;
  point_balance: number;
  total_spending: number;
  tier: {
    id: string;
    code: string;
    name: string;
    cashback_rate: number;
  };
}

function ScanContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialCode = searchParams.get('code');
  const initialPhone = searchParams.get('phone');

  const { profile, earnPoints, refreshProfile } = useAuth();

  const [code, setCode] = useState(initialCode || '');
  const [inputCode, setInputCode] = useState('');
  const [phoneInput, setPhoneInput] = useState(initialPhone || profile?.phone || '');
  const [status, setStatus] = useState<ScanStatus>('idle');
  const [message, setMessage] = useState('');
  const [lookedUpUser, setLookedUpUser] = useState<LookedUpUser | null>(null);

  // Camera scanner state
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [result, setResult] = useState<{
    cashback: number;
    drink_value: number;
    new_balance: number;
    tier_changed: boolean;
    new_tier_name: string;
    tier_bonus: number;
    cashback_rate: number;
  } | null>(null);

  // Stop camera helper
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  }, []);

  // Start camera helper
  const startCamera = useCallback(async () => {
    setCameraError('');
    if (!navigator?.mediaDevices?.getUserMedia) {
      setCameraError('Trình duyệt không hỗ trợ mở camera trực tiếp.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsCameraActive(true);
    } catch (err: any) {
      console.warn('Cannot open camera:', err);
      setCameraError('Không thể mở camera. Vui lòng cho phép quyền camera hoặc nhập mã.');
      setIsCameraActive(false);
    }
  }, []);

  // Barcode scanning loop using native BarcodeDetector if available
  useEffect(() => {
    if (!isCameraActive || typeof window === 'undefined') return;

    let animationFrameId: number;
    // Check if BarcodeDetector is available
    const BarcodeDetectorClass = (window as any).BarcodeDetector;

    if (BarcodeDetectorClass) {
      const barcodeDetector = new BarcodeDetectorClass({ formats: ['qr_code'] });

      const scanFrame = async () => {
        if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
          try {
            const barcodes = await barcodeDetector.detect(videoRef.current);
            if (barcodes.length > 0) {
              const rawValue = barcodes[0].rawValue;
              stopCamera();

              // Extract code from URL if it's a link
              let detectedCode = rawValue;
              try {
                if (rawValue.includes('code=')) {
                  const url = new URL(rawValue);
                  detectedCode = url.searchParams.get('code') || rawValue;
                }
              } catch {
                // Ignore url parse error
              }

              handleCodeScanned(detectedCode);
              return;
            }
          } catch {
            // Frame detection error, continue
          }
        }
        animationFrameId = requestAnimationFrame(scanFrame);
      };

      animationFrameId = requestAnimationFrame(scanFrame);
    }

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [isCameraActive, stopCamera]);

  // Clean up camera on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // Handle scanned or selected code
  const handleCodeScanned = (scannedCode: string) => {
    const cleanCode = scannedCode.trim();
    if (!cleanCode) return;
    setCode(cleanCode);

    // If customer already has an identified profile, process immediately!
    if (profile) {
      processCode(cleanCode, profile.id, profile.phone || undefined);
    } else {
      // Prompt for phone number to assign points
      setStatus('phone_prompt');
    }
  };

  const processCode = async (qrCodeToProcess: string, userId?: string, userPhone?: string) => {
    if (!qrCodeToProcess || qrCodeToProcess.trim() === '') {
      setStatus('error');
      setMessage('Vui lòng nhập hoặc quét mã QR hợp lệ');
      return;
    }

    setStatus('scanning');
    stopCamera();

    // 1. Try Live Supabase API first if configured
    if (isSupabaseConfigured()) {
      try {
        const res = await fetch('/api/qr/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: qrCodeToProcess,
            user_id: userId,
            phone: userPhone,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          setResult({
            cashback: data.cashback,
            drink_value: data.drink_value,
            new_balance: data.new_balance,
            tier_changed: Boolean(data.tier_changed),
            new_tier_name: data.new_tier_name,
            tier_bonus: data.tier_bonus || 0,
            cashback_rate: data.cashback_rate,
          });
          setStatus('success');
          refreshProfile();
          return;
        } else {
          const errData = await res.json().catch(() => null);
          if (errData?.error) {
            setStatus('error');
            setMessage(errData.error);
            return;
          }
        }
      } catch (err) {
        console.warn('Scan API network error, falling back to local simulation:', err);
      }
    }

    // 2. Local / Demo mode fallback
    setTimeout(() => {
      let drinkPrice = 38000;
      const match = qrCodeToProcess.match(/(\d{4,6})/);
      if (match) {
        const parsed = parseInt(match[1], 10);
        if (parsed >= 10000 && parsed <= 500000) {
          drinkPrice = parsed;
        }
      }

      const userToUse = lookedUpUser || profile;
      const rate = userToUse?.tier?.cashback_rate || 5;
      const cashback = Math.round((drinkPrice * rate) / 100);

      const { newBalance, newTier } = earnPoints(
        cashback,
        drinkPrice,
        `Hoàn ${rate}% cho mã ${qrCodeToProcess.slice(0, 14)} (${formatVND(drinkPrice)})`
      );

      setResult({
        cashback,
        drink_value: drinkPrice,
        new_balance: newBalance,
        tier_changed: Boolean(newTier),
        new_tier_name: newTier || userToUse?.tier?.name || 'Silver',
        tier_bonus: newTier ? 100000 : 0,
        cashback_rate: rate,
      });

      setStatus('success');
    }, 600);
  };

  const handlePhoneLookup = async (phone?: string, qrCodeOverride?: string) => {
    const phoneToCheck = (phone || phoneInput).replace(/[\s\-()]/g, '');
    const codeToUse = qrCodeOverride || code;

    if (!phoneToCheck || phoneToCheck.length < 9) {
      setMessage('Vui lòng nhập số điện thoại hợp lệ (ít nhất 9 chữ số)');
      return;
    }

    setStatus('looking_up');

    // Check with Supabase API
    if (isSupabaseConfigured()) {
      try {
        const res = await fetch(`/api/user/by-phone?phone=${encodeURIComponent(phoneToCheck)}`);
        const data = await res.json();

        if (data.found && data.user) {
          setLookedUpUser(data.user);
          processCode(codeToUse, data.user.id, data.user.phone);
          return;
        } else if (res.ok && !data.found) {
          // User not found in database, redirect to registration
          router.push(`/register?phone=${encodeURIComponent(phoneToCheck)}&code=${encodeURIComponent(codeToUse)}`);
          return;
        }
      } catch {
        // Fallback to local simulation
      }
    }

    // Demo lookup
    setTimeout(() => {
      const demoUser: LookedUpUser = {
        id: 'user-' + phoneToCheck,
        full_name: phoneToCheck === '0901234567' ? 'Nguyễn Văn A' : `Thành viên (${phoneToCheck.slice(-4)})`,
        phone: phoneToCheck,
        point_balance: profile?.point_balance || 150000,
        total_spending: profile?.total_spending || 720000,
        tier: {
          id: 'tier-silver',
          code: 'SILVER',
          name: 'Silver',
          cashback_rate: 5,
        },
      };
      setLookedUpUser(demoUser);
      processCode(codeToUse, demoUser.id, demoUser.phone);
    }, 500);
  };

  // Initial code detection
  useEffect(() => {
    if (initialCode) {
      setCode(initialCode);
      if (initialPhone) {
        handlePhoneLookup(initialPhone, initialCode);
      } else if (profile) {
        processCode(initialCode, profile.id, profile.phone || undefined);
      } else {
        setStatus('phone_prompt');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode, initialPhone]);

  const handleManualScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputCode.trim()) {
      handleCodeScanned(inputCode.trim());
    }
  };

  const handleQuickDemoScan = (demoPrice: number, label: string) => {
    const mockCode = `QR-${demoPrice}-${label.replace(/\s+/g, '').toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
    handleCodeScanned(mockCode);
  };

  const handlePhoneSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handlePhoneLookup();
  };

  const resetScan = () => {
    stopCamera();
    setStatus('idle');
    setResult(null);
    setInputCode('');
    setCode('');
    setLookedUpUser(null);
    setMessage('');
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        {/* Identified active user banner */}
        {profile && status !== 'success' && (
          <div className={styles.userHeaderCard}>
            <div className={styles.userHeaderLeft}>
              <div className={styles.userAvatarMini}>
                {(profile.full_name || 'U').charAt(0).toUpperCase()}
              </div>
              <div className={styles.userHeaderInfo}>
                <span className={styles.userHeaderName}>{profile.full_name || 'Khách hàng'}</span>
                <span className={styles.userHeaderTier}>
                  {profile.tier?.name || 'Member'} · Hoàn {profile.tier?.cashback_rate || 3}%
                </span>
              </div>
            </div>
            <div className={styles.userHeaderBalance}>
              {formatVND(profile.point_balance || 0)}
            </div>
          </div>
        )}

        {/* State: IDLE / SCANNER */}
        {status === 'idle' && (
          <div className={styles.center}>
            <div className={styles.scannerHeader}>
              <span className={styles.icon}>📷</span>
              <h1 className={styles.title}>Quét mã QR ly nước</h1>
              <p className={styles.subtitle}>
                Quét tem in trên ly nước để nhận hoàn tiền{' '}
                <strong>{profile?.tier?.cashback_rate || 5}%</strong> vào ví thành viên
              </p>
            </div>

            {/* Viewfinder frame */}
            <div className={styles.viewfinder}>
              {isCameraActive ? (
                <video ref={videoRef} className={styles.cameraVideo} playsInline muted />
              ) : (
                <>
                  <div className={styles.laser} />
                  <div className={styles.cornerTL} />
                  <div className={styles.cornerTR} />
                  <div className={styles.cornerBL} />
                  <div className={styles.cornerBR} />
                  <div className={styles.viewfinderText}>
                    <span>Hướng camera vào tem in trên ly</span>
                  </div>
                </>
              )}
            </div>

            {cameraError && (
              <p style={{ color: '#E53E3E', fontSize: 'var(--text-xs)', marginTop: '4px' }}>
                {cameraError}
              </p>
            )}

            {/* Camera Controls */}
            <div className={styles.cameraActions}>
              <button
                type="button"
                className={styles.cameraToggleBtn}
                onClick={isCameraActive ? stopCamera : startCamera}
              >
                {isCameraActive ? '⏹ Tắt camera' : '📸 Bật camera quét QR'}
              </button>
            </div>

            {/* Manual input */}
            <form onSubmit={handleManualScan} className={styles.manualForm}>
              <input
                type="text"
                placeholder="Hoặc nhập mã tem in (VD: QR-38000)..."
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value)}
                className={styles.codeInput}
              />
              <button type="submit" className={styles.submitBtn}>
                Tích điểm
              </button>
            </form>

            {/* Quick Demo Test Buttons */}
            <div className={styles.demoSection}>
              <span className={styles.demoLabel}>⚡ Thử nghiệm nhanh mã QR mẫu:</span>
              <div className={styles.demoPills}>
                <button
                  type="button"
                  className={styles.demoPill}
                  onClick={() => handleQuickDemoScan(38000, 'Matcha Dừa')}
                >
                  🍵 Ly Matcha 38k (+{formatVND(Math.round(38000 * (profile?.tier?.cashback_rate || 5) / 100))})
                </button>
                <button
                  type="button"
                  className={styles.demoPill}
                  onClick={() => handleQuickDemoScan(34000, 'Cold Brew')}
                >
                  🧊 Cold Brew 34k (+{formatVND(Math.round(34000 * (profile?.tier?.cashback_rate || 5) / 100))})
                </button>
                <button
                  type="button"
                  className={styles.demoPill}
                  onClick={() => handleQuickDemoScan(47000, 'Dirty Matcha')}
                >
                  ✨ Dirty Matcha 47k (+{formatVND(Math.round(47000 * (profile?.tier?.cashback_rate || 5) / 100))})
                </button>
              </div>
            </div>

            <div className={styles.footerLinks}>
              {profile?.role === 'ADMIN' && (
                <button
                  type="button"
                  className={styles.linkBtn}
                  onClick={() => router.push('/admin')}
                >
                  Mở POS Quán để tạo tem QR mới →
                </button>
              )}
              <button
                type="button"
                className={styles.linkBtnMuted}
                onClick={() => router.push('/')}
              >
                ← Về menu thức uống
              </button>
            </div>
          </div>
        )}

        {/* State: PHONE PROMPT */}
        {status === 'phone_prompt' && (
          <div className={styles.center}>
            <div className={styles.phonePromptIcon}>📱</div>
            <h2 className={styles.title}>Nhập số điện thoại</h2>
            <p className={styles.subtitle}>
              Nhập SĐT để tích điểm ly nước vào tài khoản thành viên
            </p>

            {code && (
              <div className={styles.scannedCodeChip}>
                <span>📋</span>
                <span>Mã QR: <strong>{code.length > 25 ? code.slice(0, 25) + '...' : code}</strong></span>
              </div>
            )}

            {message && (
              <div className={styles.phoneErrorMsg}>{message}</div>
            )}

            <form onSubmit={handlePhoneSubmit} className={styles.phoneForm}>
              <input
                type="tel"
                placeholder="Nhập số điện thoại (VD: 0901234567)"
                value={phoneInput}
                onChange={(e) => {
                  setPhoneInput(e.target.value);
                  setMessage('');
                }}
                className={styles.phoneInput}
                autoFocus
                id="scan-phone-input"
              />
              <button type="submit" className={styles.phoneLookupBtn}>
                🔍 Tra cứu & Tích điểm
              </button>
            </form>

            <div className={styles.phoneHint}>
              <p>Chưa có tài khoản?{' '}
                <button
                  type="button"
                  className={styles.registerLink}
                  onClick={() => router.push(`/register${code ? `?code=${encodeURIComponent(code)}` : ''}&phone=${encodeURIComponent(phoneInput)}`)}
                >
                  Đăng ký nhận ngay 10.000đ
                </button>
              </p>
            </div>

            <button
              type="button"
              className={styles.linkBtnMuted}
              onClick={resetScan}
            >
              ← Quay lại quét mã
            </button>
          </div>
        )}

        {/* State: LOOKING UP phone */}
        {status === 'looking_up' && (
          <div className={styles.center}>
            <div className={styles.spinner} />
            <h2 className={styles.title}>Đang tra cứu thành viên...</h2>
            <p className={styles.subtitle}>SĐT: {phoneInput}</p>
          </div>
        )}

        {/* State: SCANNING / PROCESSING */}
        {status === 'scanning' && (
          <div className={styles.center}>
            <div className={styles.spinner} />
            <h2 className={styles.title}>Đang xử lý tích điểm...</h2>
            <p className={styles.subtitle}>
              {lookedUpUser && <span>Thành viên: {lookedUpUser.full_name}<br /></span>}
              Mã: {code.length > 25 ? code.slice(0, 25) + '...' : code}
            </p>
          </div>
        )}

        {/* State: SUCCESS */}
        {status === 'success' && result && (
          <div className={styles.center}>
            <span className={styles.successIcon}>🎉</span>
            <h2 className={styles.title}>Tích điểm thành công!</h2>
            <p className={styles.subtitle}>
              {lookedUpUser
                ? <>Đã cộng điểm cho <strong>{lookedUpUser.full_name}</strong> ({lookedUpUser.phone})</>
                : <>Đã cộng điểm hoàn tiền vào tài khoản <strong>{profile?.full_name || 'của bạn'}</strong></>}
            </p>

            <div className={styles.resultCard}>
              <div className={styles.resultRow}>
                <span>Giá ly nước</span>
                <span className={styles.resultValue}>{formatVND(result.drink_value)}</span>
              </div>
              <div className={styles.resultRow}>
                <span>Hoàn tiền theo hạng ({result.cashback_rate}%)</span>
                <span className={styles.resultValue} style={{ color: 'var(--accent)', fontWeight: 700 }}>
                  +{formatVND(result.cashback)}
                </span>
              </div>
              {result.tier_changed && (
                <div className={styles.tierUpBanner}>
                  <span>🎊 Chúc mừng bạn đã thăng hạng {result.new_tier_name}!</span>
                  {result.tier_bonus > 0 && (
                    <small>+{formatVND(result.tier_bonus)} thưởng thăng hạng</small>
                  )}
                </div>
              )}
              <div className={`${styles.resultRow} ${styles.resultTotal}`}>
                <span>Số dư ví điểm hiện tại</span>
                <span className={styles.resultValue} style={{ color: 'var(--accent)', fontSize: '1.25rem', fontWeight: 800 }}>
                  {formatVND(result.new_balance)}
                </span>
              </div>
            </div>

            <div className={styles.successActions}>
              <button className={styles.homeBtn} onClick={() => router.push('/')}>
                🛍️ Dùng điểm đặt món take-away
              </button>
              <button className={styles.scanAgainBtn} onClick={resetScan}>
                📷 Quét tiếp ly khác
              </button>
            </div>
          </div>
        )}

        {/* State: LOGIN REQUIRED */}
        {status === 'login' && (
          <div className={styles.center}>
            <span className={styles.icon}>🔑</span>
            <h2 className={styles.title}>Đăng nhập để nhận điểm</h2>
            <p className={styles.subtitle}>Bạn cần tài khoản thành viên để cộng điểm vào ví</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', maxWidth: '280px' }}>
              <button
                className={styles.homeBtn}
                onClick={() => router.push(`/login?redirect=${encodeURIComponent('/scan' + (code ? `?code=${code}` : ''))}`)}
              >
                🔑 Đăng nhập tài khoản
              </button>
              <button
                className={styles.scanAgainBtn}
                onClick={() => router.push(`/register?code=${encodeURIComponent(code)}`)}
              >
                🎁 Đăng ký nhận ngay 10.000đ
              </button>
            </div>
          </div>
        )}

        {/* State: ERROR */}
        {status === 'error' && (
          <div className={styles.center}>
            <span className={styles.errorIcon}>⚠️</span>
            <h2 className={styles.title}>Không thể tích điểm</h2>
            <p className={styles.subtitle}>{message}</p>
            <button className={styles.homeBtn} onClick={resetScan}>
              Thử lại mã khác
            </button>
            <button className={styles.linkBtnMuted} onClick={() => router.push('/')}>
              ← Về trang chủ
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ScanPage() {
  return (
    <Suspense fallback={
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.center}>
            <div className={styles.spinner} />
            <p>Đang tải trang quét mã...</p>
          </div>
        </div>
      </div>
    }>
      <ScanContent />
    </Suspense>
  );
}
