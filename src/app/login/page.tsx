'use client';

import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import styles from './page.module.css';
import { useAuth } from '@/hooks/useAuth';
import Header from '@/components/Header/Header';
import { StarSolidIcon } from '@/components/Icons/LabIcons';

function LoginContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const redirect = searchParams.get('redirect') || '/';

  const { login } = useAuth();

  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!account.trim()) {
      setErrorMsg('Vui lòng nhập số điện thoại hoặc email');
      return;
    }

    if (!password) {
      setErrorMsg('Vui lòng nhập mật khẩu');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    const res = await login({ account: account.trim(), password });

    if (res.success) {
      const isStaffOrAdmin = res.user?.role === 'ADMIN' || String(res.user?.role) !== 'USER';
      const targetUrl = (isStaffOrAdmin && redirect === '/') ? '/admin' : redirect;
      window.location.href = targetUrl;
    } else {
      setErrorMsg(res.error || 'Số điện thoại hoặc mật khẩu không chính xác');
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
                src="/logo-mark.png"
                alt="Ủ LAB Logo"
                width={56}
                height={56}
                className={styles.logoImg}
                priority
              />
            </div>
            <div className={styles.eyebrow}>
              <StarSolidIcon size={12} />
              <span>Ủ LAB REWARDS®</span>
            </div>
            <h1 className={styles.logoText}>Đăng nhập thành viên</h1>
            <p className={styles.description}>
              Quản lý ví điểm thưởng và nhận hoàn điểm tới 10% cho mỗi ly nước
            </p>
          </div>

          <div className={styles.cardBody}>
            {errorMsg && <div className={styles.errorMsg}>{errorMsg}</div>}

            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.field}>
                <label htmlFor="login-account" className={styles.label}>
                  Số điện thoại hoặc Email
                </label>
                <input
                  id="login-account"
                  type="text"
                  placeholder="VD: 0901234567 hoặc email..."
                  value={account}
                  onChange={(e) => {
                    setAccount(e.target.value);
                    setErrorMsg('');
                  }}
                  className={styles.input}
                  autoFocus
                  required
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="login-password" className={styles.label}>
                  Mật khẩu
                </label>
                <input
                  id="login-password"
                  type="password"
                  placeholder="Nhập mật khẩu của bạn..."
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setErrorMsg('');
                  }}
                  className={styles.input}
                  required
                />
              </div>

              <button type="submit" className={styles.submitBtn} disabled={loading}>
                {loading ? <span className={styles.spinner} /> : 'Đăng nhập'}
              </button>
            </form>

            <div className={styles.joinBanner}>
              <p className={styles.footer}>
                Chưa có tài khoản thành viên?
                <button
                  type="button"
                  className={styles.registerLink}
                  onClick={() =>
                    router.push(
                      `/register${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''}`
                    )
                  }
                >
                  Đăng ký ngay (+10.000đ)
                </button>
              </p>
            </div>

            <button
              type="button"
              className={styles.backBtn}
              onClick={() => router.push('/')}
            >
              ← Quay lại thực đơn Ủ LAB
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function LoginPage() {
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
      <LoginContent />
    </Suspense>
  );
}
