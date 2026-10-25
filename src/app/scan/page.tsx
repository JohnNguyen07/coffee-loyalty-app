'use client';

import { useEffect, useState, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import styles from './page.module.css';
import { formatVND } from '@/data/menu';
import { useAuth } from '@/hooks/useAuth';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import Header from '@/components/Header/Header';
import {
  QrScanIcon,
  StarSolidIcon,
  CheckCircleIcon,
  GiftIcon,
  TierSvgIcon,
} from '@/components/Icons/LabIcons';

type ClaimStatus = 'no_code' | 'phone_prompt' | 'looking_up' | 'processing' | 'success' | 'error';

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

function parseDrinkPriceFromCode(qrCode: string): number {
  const match = qrCode.match(/(\d{4,6})/);
  if (match) {
    const parsed = parseInt(match[1], 10);
    if (parsed >= 10000 && parsed <= 500000) {
      return parsed;
    }
  }
  return 34000;
}

function ScanContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialCode = searchParams.get('code')?.trim() || '';
  const initialPhone = searchParams.get('phone')?.trim() || '';

  const { profile, earnPoints, refreshProfile } = useAuth();

  const [code, setCode] = useState(initialCode);
  const [manualInputCode, setManualInputCode] = useState('');
  const [phoneInput, setPhoneInput] = useState(initialPhone || profile?.phone || '');
  const [status, setStatus] = useState<ClaimStatus>(initialCode ? 'phone_prompt' : 'no_code');
  const [message, setMessage] = useState('');
  const [lookedUpUser, setLookedUpUser] = useState<LookedUpUser | null>(null);

  const [result, setResult] = useState<{
    cashback: number;
    drink_value: number;
    new_balance: number;
    tier_changed: boolean;
    new_tier_name: string;
    tier_bonus: number;
    cashback_rate: number;
  } | null>(null);

  const detectedDrinkPrice = useMemo(() => (code ? parseDrinkPriceFromCode(code) : 34000), [code]);
  const estimatedRate = profile?.tier?.cashback_rate || 5;
  const estimatedCashback = Math.round((detectedDrinkPrice * estimatedRate) / 100);

  const processCode = async (qrCodeToProcess: string, userId?: string, userPhone?: string) => {
    const cleanCode = qrCodeToProcess.trim();
    if (!cleanCode) {
      setStatus('error');
      setMessage('Đường dẫn không chứa mã tích điểm hợp lệ.');
      return;
    }

    setStatus('processing');

    if (isSupabaseConfigured()) {
      try {
        const res = await fetch('/api/qr/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: cleanCode,
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

    // Local fallback when Supabase is in demo mode
    setTimeout(() => {
      const drinkPrice = parseDrinkPriceFromCode(cleanCode);
      const userToUse = lookedUpUser || profile;
      const rate = userToUse?.tier?.cashback_rate || 5;
      const cashback = Math.round((drinkPrice * rate) / 100);

      const { newBalance, newTier } = earnPoints(
        cashback,
        drinkPrice,
        `Hoàn ${rate}% cho mã ${cleanCode.slice(0, 16)} (${formatVND(drinkPrice)})`
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
    }, 450);
  };

  const handlePhoneLookup = async (phone?: string, qrCodeOverride?: string) => {
    const phoneToCheck = (phone || phoneInput).replace(/[\s\-()]/g, '');
    const codeToUse = qrCodeOverride || code;

    if (!phoneToCheck || phoneToCheck.length < 9) {
      setMessage('Vui lòng nhập số điện thoại hợp lệ (ít nhất 9 chữ số)');
      return;
    }

    setStatus('looking_up');

    if (isSupabaseConfigured()) {
      try {
        const res = await fetch(`/api/user/by-phone?phone=${encodeURIComponent(phoneToCheck)}`);
        const data = await res.json();

        if (data.found && data.user) {
          setLookedUpUser(data.user);
          processCode(codeToUse, data.user.id, data.user.phone);
          return;
        } else if (res.ok && !data.found) {
          router.push(
            `/register?phone=${encodeURIComponent(phoneToCheck)}&code=${encodeURIComponent(codeToUse)}`
          );
          return;
        }
      } catch {
        // Fallback to local simulation
      }
    }

    setTimeout(() => {
      const demoUser: LookedUpUser = {
        id: 'user-' + phoneToCheck,
        full_name:
          phoneToCheck === '0901234567'
            ? 'Nguyễn Văn A'
            : `Thành viên (${phoneToCheck.slice(-4)})`,
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
    }, 400);
  };

  // Auto-process when opened from QR link (?code=...)
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
    } else {
      setStatus('no_code');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode, initialPhone, profile?.id]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = manualInputCode.trim();
    if (!raw) return;

    // Extract ?code= if user pasted a full link
    let extractedCode = raw;
    try {
      if (raw.includes('code=')) {
        const parsedUrl = new URL(raw.startsWith('http') ? raw : `https://ulab.vn/${raw}`);
        extractedCode = parsedUrl.searchParams.get('code') || raw;
      }
    } catch {
      // keep raw
    }

    setCode(extractedCode);
    router.replace(`/scan?code=${encodeURIComponent(extractedCode)}`);
    if (profile) {
      processCode(extractedCode, profile.id, profile.phone || undefined);
    } else {
      setStatus('phone_prompt');
    }
  };

  const handlePhoneSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handlePhoneLookup();
  };

  return (
    <div className={styles.pageWrapper}>
      <Header />

      <main className={styles.page}>
        <div className={styles.card}>
          {/* Top House Green Banner */}
          <div className={styles.cardBanner}>
            <div className={styles.bannerEyebrow}>
              <StarSolidIcon size={12} />
              <span>Ủ LAB REWARDS® · TÍCH ĐIỂM TỪ TEM LY</span>
            </div>
            <h1 className={styles.bannerTitle}>Nhận Hoàn Tiền Thành Viên</h1>
            <p className={styles.bannerSubtitle}>
              Hoàn tiền từ <strong>3% – 10%</strong> giá trị mỗi ly nước vào ví thưởng
            </p>

            {profile && (
              <div className={styles.userHeaderCard}>
                <div className={styles.userHeaderLeft}>
                  <div className={styles.userAvatarMini}>
                    {(profile.full_name || 'U').charAt(0).toUpperCase()}
                  </div>
                  <div className={styles.userHeaderInfo}>
                    <span className={styles.userHeaderName}>
                      {profile.full_name || 'Thành viên'}
                    </span>
                    <span className={styles.userHeaderTier}>
                      <TierSvgIcon code={profile.tier?.code} size={12} />
                      <span>
                        {profile.tier?.name || 'Member'} · Hoàn {profile.tier?.cashback_rate || 3}%
                      </span>
                    </span>
                  </div>
                </div>
                <div className={styles.userHeaderBalance}>
                  {formatVND(profile.point_balance || 0)}
                </div>
              </div>
            )}
          </div>

          <div className={styles.cardBody}>
            {/* State 1: Customer arrived via QR Link (?code=...) and needs to enter Phone or Login */}
            {status === 'phone_prompt' && (
              <div className={styles.center}>
                <div className={styles.qrDetectedBox}>
                  <div className={styles.qrDetectedTop}>
                    <span className={styles.qrDetectedBadge}>
                      <CheckCircleIcon size={14} />
                      <span>Đã nhận diện mã tem hợp lệ</span>
                    </span>
                    <span className={styles.qrCodeMono}>{code}</span>
                  </div>
                  <div className={styles.qrDetectedPreview}>
                    <div>
                      <span className={styles.previewLabel}>Giá trị ly nước</span>
                      <strong className={styles.previewValue}>
                        {formatVND(detectedDrinkPrice)}
                      </strong>
                    </div>
                    <div className={styles.previewRight}>
                      <span className={styles.previewLabel}>Hoàn tiền tích điểm</span>
                      <strong className={styles.previewCashback}>
                        +{formatVND(estimatedCashback)} ★
                      </strong>
                    </div>
                  </div>
                </div>

                <h2 className={styles.title}>Nhập SĐT để nhận điểm</h2>
                <p className={styles.subtitle}>
                  Nhập số điện thoại thành viên của bạn để cộng ngay tiền hoàn từ ly nước này vào ví.
                </p>

                {message && <div className={styles.phoneErrorMsg}>{message}</div>}

                <form onSubmit={handlePhoneSubmit} className={styles.phoneForm}>
                  <input
                    type="tel"
                    placeholder="Nhập SĐT của bạn (VD: 0901234567)"
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
                    Nhận hoàn tiền ngay
                  </button>
                </form>

                <div className={styles.phoneHint}>
                  <p>
                    Chưa có tài khoản thành viên?{' '}
                    <button
                      type="button"
                      className={styles.registerLink}
                      onClick={() =>
                        router.push(
                          `/register?code=${encodeURIComponent(code)}${phoneInput ? `&phone=${encodeURIComponent(phoneInput)}` : ''}`
                        )
                      }
                    >
                      Đăng ký nhận 10.000đ + cộng mã này
                    </button>
                  </p>
                </div>
              </div>
            )}

            {/* State 2: Looking up or Processing */}
            {(status === 'looking_up' || status === 'processing') && (
              <div className={styles.center}>
                <div className={styles.spinner} />
                <h2 className={styles.title}>
                  {status === 'looking_up'
                    ? 'Đang kiểm tra tài khoản thành viên...'
                    : 'Đang cộng tiền hoàn vào ví...'}
                </h2>
                <p className={styles.subtitle}>
                  Mã tem: <strong>{code}</strong>
                </p>
              </div>
            )}

            {/* State 3: SUCCESS */}
            {status === 'success' && result && (
              <div className={styles.center}>
                <div className={styles.successBadgeCircle}>
                  <CheckCircleIcon size={36} />
                </div>
                <h2 className={styles.title}>Tích điểm thành công!</h2>
                <p className={styles.subtitle}>
                  {lookedUpUser ? (
                    <>
                      Đã cộng hoàn tiền vào ví của <strong>{lookedUpUser.full_name}</strong> (
                      {lookedUpUser.phone})
                    </>
                  ) : (
                    <>
                      Đã cộng hoàn tiền vào ví của{' '}
                      <strong>{profile?.full_name || 'bạn'}</strong>
                    </>
                  )}
                </p>

                <div className={styles.resultCard}>
                  <div className={styles.resultRow}>
                    <span>Mã tem trên ly</span>
                    <span className={styles.resultCodeText}>{code}</span>
                  </div>
                  <div className={styles.resultRow}>
                    <span>Giá trị ly nước</span>
                    <span className={styles.resultValue}>{formatVND(result.drink_value)}</span>
                  </div>
                  <div className={styles.resultRow}>
                    <span>Hoàn tiền theo hạng ({result.cashback_rate}%)</span>
                    <span className={styles.resultCashback}>
                      +{formatVND(result.cashback)} ★
                    </span>
                  </div>
                  {result.tier_changed && (
                    <div className={styles.tierUpBanner}>
                      <span>Chúc mừng thăng hạng {result.new_tier_name}!</span>
                      {result.tier_bonus > 0 && (
                        <small>+{formatVND(result.tier_bonus)} thưởng lên hạng</small>
                      )}
                    </div>
                  )}
                  <div className={`${styles.resultRow} ${styles.resultTotal}`}>
                    <span>Số dư ví thưởng mới</span>
                    <span className={styles.resultTotalVal}>
                      {formatVND(result.new_balance)}
                    </span>
                  </div>
                </div>

                <div className={styles.successActions}>
                  <button
                    type="button"
                    className={styles.homeBtn}
                    onClick={() => router.push('/')}
                  >
                    Về thực đơn &amp; Dùng điểm đặt món
                  </button>
                </div>
              </div>
            )}

            {/* State 4: Visited /scan without ?code= parameter */}
            {status === 'no_code' && (
              <div className={styles.center}>
                <div className={styles.statusCircleIcon}>
                  <QrScanIcon size={28} />
                </div>
                <h2 className={styles.title}>Quét bằng Camera điện thoại</h2>
                <p className={styles.subtitle}>
                  Mở ứng dụng <strong>Camera</strong> trên điện thoại và hướng vào tem QR dán trên ly nước Ủ LAB. Điện thoại sẽ tự động mở đường dẫn nhận điểm hoàn tiền.
                </p>

                <div className={styles.guideStepsBox}>
                  <div className={styles.guideStepRow}>
                    <span className={styles.guideStepNum}>1</span>
                    <span>Mở ứng dụng Camera mặc định trên iPhone hoặc Android</span>
                  </div>
                  <div className={styles.guideStepRow}>
                    <span className={styles.guideStepNum}>2</span>
                    <span>Hướng vào tem QR dán trên ly Matcha / Cold Brew</span>
                  </div>
                  <div className={styles.guideStepRow}>
                    <span className={styles.guideStepNum}>3</span>
                    <span>Chạm vào thông báo đường link để tự động cộng tiền vào ví</span>
                  </div>
                </div>

                {/* Fallback manual input if sticker is torn */}
                <form onSubmit={handleManualSubmit} className={styles.manualForm}>
                  <input
                    type="text"
                    placeholder="Hoặc nhập mã in dưới tem nếu tem bị mờ..."
                    value={manualInputCode}
                    onChange={(e) => setManualInputCode(e.target.value)}
                    className={styles.codeInput}
                    aria-label="Mã tem QR"
                  />
                  <button type="submit" className={styles.submitBtn}>
                    Xác nhận
                  </button>
                </form>

                <button
                  type="button"
                  className={styles.linkBtnMuted}
                  onClick={() => router.push('/')}
                >
                  ← Quay về thực đơn đặt món
                </button>
              </div>
            )}

            {/* State 5: ERROR */}
            {status === 'error' && (
              <div className={styles.center}>
                <div className={styles.errorCircleIcon}>!</div>
                <h2 className={styles.title}>Không thể tích điểm</h2>
                <p className={styles.subtitle}>{message}</p>
                <div className={styles.successActions}>
                  <button
                    type="button"
                    className={styles.homeBtn}
                    onClick={() => {
                      setMessage('');
                      setStatus('no_code');
                    }}
                  >
                    Nhập lại mã tem khác
                  </button>
                  <button
                    type="button"
                    className={styles.linkBtnMuted}
                    onClick={() => router.push('/')}
                  >
                    ← Quay về thực đơn
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function ScanPage() {
  return (
    <Suspense
      fallback={
        <div className={styles.pageWrapper}>
          <div className={styles.page}>
            <div className={styles.card}>
              <div className={styles.cardBody}>
                <div className={styles.center}>
                  <div className={styles.spinner} />
                  <p>Đang kiểm tra đường dẫn tích điểm...</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      }
    >
      <ScanContent />
    </Suspense>
  );
}
