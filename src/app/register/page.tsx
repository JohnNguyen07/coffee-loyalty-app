'use client';

import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import styles from './page.module.css';
import { useAuth } from '@/hooks/useAuth';

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
          router.push(`/scan?code=${encodeURIComponent(qrCode)}&phone=${encodeURIComponent(cleanPhone)}`);
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
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <div className={styles.logoWrap}>
            <Image
              src="/logo.png"
              alt="Ủ LAB Logo"
              width={64}
              height={64}
              className={styles.logoImg}
              priority
            />
          </div>
          <h1 className={styles.logoText}>Đăng ký thành viên Ủ LAB</h1>
        </div>

        {status === 'success' ? (
          <div className={styles.successState}>
            <span className={styles.successIcon}>🎉</span>
            <h2 className={styles.successTitle}>Đăng ký thành công!</h2>
            <p className={styles.successText}>
              Chào mừng bạn đến với Ủ LAB! Bạn được tặng ngay <strong>10.000đ</strong> vào ví thành viên.
            </p>
            <p className={styles.redirectText}>Đang đưa bạn vào hệ thống...</p>
          </div>
        ) : (
          <>
            <p className={styles.description}>
              Đăng ký tài khoản nhận ngay <strong>10.000đ</strong> vào ví và hoàn tiền tới 10% mỗi lần uống nước
            </p>

            {status === 'error' && errorMsg && (
              <div className={styles.errorMsg}>{errorMsg}</div>
            )}

            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.field}>
                <label htmlFor="reg-name" className={styles.label}>Họ và tên *</label>
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
                <label htmlFor="reg-phone" className={styles.label}>Số điện thoại *</label>
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
                <label htmlFor="reg-email" className={styles.label}>Email (không bắt buộc)</label>
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

              <div className={styles.field}>
                <label htmlFor="reg-password" className={styles.label}>Mật khẩu *</label>
                <input
                  id="reg-password"
                  name="password"
                  type="password"
                  placeholder="Ít nhất 6 ký tự..."
                  value={form.password}
                  onChange={handleChange}
                  className={styles.input}
                  required
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="reg-confirm" className={styles.label}>Xác nhận mật khẩu *</label>
                <input
                  id="reg-confirm"
                  name="confirm_password"
                  type="password"
                  placeholder="Nhập lại mật khẩu..."
                  value={form.confirm_password}
                  onChange={handleChange}
                  className={styles.input}
                  required
                />
              </div>

              <button
                type="submit"
                className={styles.submitBtn}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className={styles.btnSpinner} />
                    <span>Đang tạo tài khoản...</span>
                  </>
                ) : (
                  '🎁 Đăng ký nhận 10.000đ'
                )}
              </button>
            </form>

            <div className={styles.benefits}>
              <span className={styles.benefitsTitle}>Quyền lợi thành viên Ủ LAB:</span>
              <div className={styles.benefitsList}>
                <div className={styles.benefit}>
                  <span>🎁</span>
                  <span>10.000đ chào mừng</span>
                </div>
                <div className={styles.benefit}>
                  <span>📷</span>
                  <span>Hoàn 3% - 10% mỗi ly</span>
                </div>
                <div className={styles.benefit}>
                  <span>🏆</span>
                  <span>Thưởng lên hạng</span>
                </div>
              </div>
            </div>

            <p className={styles.footer}>
              Đã có tài khoản?{' '}
              <button
                type="button"
                className={styles.linkBtn}
                onClick={() => router.push(`/login${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''}`)}
              >
                Đăng nhập ngay
              </button>
            </p>

            <button className={styles.backBtn} onClick={() => router.push('/')}>
              ← Quay lại thực đơn
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={
      <div className={styles.page}>
        <div className={styles.card}>
          <div style={{ textAlign: 'center', padding: '2rem' }}>Đang tải...</div>
        </div>
      </div>
    }>
      <RegisterContent />
    </Suspense>
  );
}
