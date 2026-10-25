'use client';

import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import styles from './page.module.css';
import { useAuth } from '@/hooks/useAuth';
import Header from '@/components/Header/Header';
import {
  StarSolidIcon,
  GiftIcon,
  QrScanIcon,
  CheckCircleIcon,
  TierSvgIcon,
} from '@/components/Icons/LabIcons';

function RegisterContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const prefillPhone = searchParams.get('phone') || '';
  const qrCode = searchParams.get('code') || '';
  const redirect = searchParams.get('redirect') || '/';

  const { register } = useAuth();

  const [form, setForm] = useState({
    full_name: '',
    phone: prefillPhone,
    email: '',
    password: '',
    confirm_password: '',
  });

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    if (status === 'error') setStatus('idle');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.full_name.trim()) {
      setErrorMsg('Vui lòng nhập họ và tên');
      setStatus('error');
      return;
    }

    const cleanPhone = form.phone.replace(/[\s\-()]/g, '');
    if (!cleanPhone || cleanPhone.length < 9) {
      setErrorMsg('Số điện thoại không hợp lệ (tối thiểu 9 số)');
      setStatus('error');
      return;
    }

    if (!form.password || form.password.length < 6) {
      setErrorMsg('Mật khẩu phải có ít nhất 6 ký tự');
      setStatus('error');
      return;
    }

    if (form.password !== form.confirm_password) {
      setErrorMsg('Xác nhận mật khẩu không khớp');
      setStatus('error');
      return;
    }

    setLoading(true);
    setStatus('idle');
    setErrorMsg('');

    const res = await register({
      full_name: form.full_name.trim(),
      phone: cleanPhone,
      email: form.email.trim() || undefined,
      password: form.password,
    });

    if (res.success) {
      setStatus('success');
      setTimeout(() => {
        if (qrCode) {
          router.push(
            `/scan?code=${encodeURIComponent(qrCode)}&phone=${encodeURIComponent(cleanPhone)}`
          );
        } else {
          router.push(redirect);
        }
      }, 1500);
    } else {
      setErrorMsg(res.error || 'Đăng ký thất bại, vui lòng thử lại');
      setStatus('error');
      setLoading(false);
    }
  };

  return (
    <div className={styles.pageWrapper}>
      <Header />

      <main className={styles.page}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.logoWrap}>
              <Image
                src="/logo.png"
                alt="Ủ LAB Logo"
                width={56}
                height={56}
                className={styles.logoImg}
                priority
              />
            </div>
            <div className={styles.eyebrow}>
              <StarSolidIcon size={12} />
              <span>Ủ LAB REWARDS® · WELCOME BONUS</span>
            </div>
            <h1 className={styles.logoText}>Đăng ký thành viên Ủ LAB</h1>
            <p className={styles.description}>
              Nhận ngay <strong>10.000đ</strong> vào ví thưởng &amp; hoàn tiền tới 10% mỗi lần uống nước
            </p>
          </div>

          <div className={styles.cardBody}>
            {status === 'success' ? (
              <div className={styles.successState}>
                <div className={styles.successIconWrap}>
                  <CheckCircleIcon size={36} />
                </div>
                <h2 className={styles.successTitle}>Đăng ký thành công!</h2>
                <p className={styles.successText}>
                  Chào mừng bạn đến với Ủ LAB! Bạn vừa nhận được <strong>+10.000đ</strong> vào ví thưởng thành viên.
                </p>
                <p className={styles.redirectText}>Đang chuyển vào hệ thống...</p>
              </div>
            ) : (
              <>
                {status === 'error' && errorMsg && (
                  <div className={styles.errorMsg}>{errorMsg}</div>
                )}

                <form onSubmit={handleSubmit} className={styles.form}>
                  <div className={styles.field}>
                    <label htmlFor="reg-name" className={styles.label}>
                      Họ và tên *
                    </label>
                    <input
                      id="reg-name"
                      name="full_name"
                      type="text"
                      placeholder="VD: Nguyễn Văn A"
                      value={form.full_name}
                      onChange={handleChange}
                      className={styles.input}
                      autoFocus
                      required
                    />
                  </div>

                  <div className={styles.field}>
                    <label htmlFor="reg-phone" className={styles.label}>
                      Số điện thoại *
                    </label>
                    <input
                      id="reg-phone"
                      name="phone"
                      type="tel"
                      placeholder="0901234567"
                      value={form.phone}
                      onChange={handleChange}
                      className={styles.input}
                      required
                    />
                  </div>

                  <div className={styles.field}>
                    <label htmlFor="reg-email" className={styles.label}>
                      Email (không bắt buộc)
                    </label>
                    <input
                      id="reg-email"
                      name="email"
                      type="email"
                      placeholder="email@example.com"
                      value={form.email}
                      onChange={handleChange}
                      className={styles.input}
                    />
                  </div>

                  <div className={styles.formRow}>
                    <div className={styles.field}>
                      <label htmlFor="reg-password" className={styles.label}>
                        Mật khẩu *
                      </label>
                      <input
                        id="reg-password"
                        name="password"
                        type="password"
                        placeholder="Tối thiểu 6 ký tự"
                        value={form.password}
                        onChange={handleChange}
                        className={styles.input}
                        required
                      />
                    </div>

                    <div className={styles.field}>
                      <label htmlFor="reg-confirm" className={styles.label}>
                        Nhập lại *
                      </label>
                      <input
                        id="reg-confirm"
                        name="confirm_password"
                        type="password"
                        placeholder="Xác nhận mật khẩu"
                        value={form.confirm_password}
                        onChange={handleChange}
                        className={styles.input}
                        required
                      />
                    </div>
                  </div>

                  <button type="submit" className={styles.submitBtn} disabled={loading}>
                    {loading ? (
                      <>
                        <span className={styles.btnSpinner} />
                        <span>Đang tạo tài khoản...</span>
                      </>
                    ) : (
                      <>
                        <GiftIcon size={17} />
                        <span>Đăng ký nhận ngay 10.000đ</span>
                      </>
                    )}
                  </button>
                </form>

                {/* Gold Lightest Member Benefits Box */}
                <div className={styles.benefits}>
                  <span className={styles.benefitsTitle}>ĐẶC QUYỀN THÀNH VIÊN Ủ LAB</span>
                  <div className={styles.benefitsList}>
                    <div className={styles.benefit}>
                      <span className={styles.benefitIcon}>
                        <GiftIcon size={16} />
                      </span>
                      <span>+10.000đ chào mừng</span>
                    </div>
                    <div className={styles.benefit}>
                      <span className={styles.benefitIcon}>
                        <QrScanIcon size={16} />
                      </span>
                      <span>Hoàn 3% – 10% mỗi ly</span>
                    </div>
                    <div className={styles.benefit}>
                      <span className={styles.benefitIcon}>
                        <TierSvgIcon code="GOLD" size={16} />
                      </span>
                      <span>Thưởng thăng hạng</span>
                    </div>
                  </div>
                </div>

                <p className={styles.footer}>
                  Đã có tài khoản?{' '}
                  <button
                    type="button"
                    className={styles.linkBtn}
                    onClick={() =>
                      router.push(
                        `/login${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''}`
                      )
                    }
                  >
                    Đăng nhập ngay
                  </button>
                </p>

                <button
                  type="button"
                  className={styles.backBtn}
                  onClick={() => router.push('/')}
                >
                  ← Quay lại thực đơn Ủ LAB
                </button>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className={styles.pageWrapper}>
          <div className={styles.page}>
            <div className={styles.card}>
              <div style={{ textAlign: 'center', padding: '2rem' }}>Đang tải...</div>
            </div>
          </div>
        </div>
      }
    >
      <RegisterContent />
    </Suspense>
  );
}
