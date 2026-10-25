'use client';

import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import styles from './page.module.css';
import { useAuth } from '@/hooks/useAuth';

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
      if (res.user?.role === 'ADMIN' && redirect === '/') {
        router.push('/admin');
      } else {
        router.push(redirect);
      }
    } else {
      setErrorMsg(res.error || 'Số điện thoại hoặc mật khẩu không chính xác');
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
          <h1 className={styles.logoText}>Ủ LAB</h1>
        </div>

        <p className={styles.description}>
          Đăng nhập tài khoản thành viên để tích điểm và nhận ưu đãi hoàn tiền tới 10%
        </p>

        {errorMsg && (
          <div className={styles.errorMsg}>
            {errorMsg}
          </div>
        )}

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

          <button
            type="submit"
            className={styles.submitBtn}
            disabled={loading}
          >
            {loading ? <span className={styles.spinner} /> : 'Đăng nhập'}
          </button>
        </form>

        <p className={styles.footer}>
          Chưa có tài khoản thành viên?
          <button
            type="button"
            className={styles.registerLink}
            onClick={() => router.push(`/register${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''}`)}
          >
            Đăng ký ngay (+10.000đ)
          </button>
        </p>

        <button
          type="button"
          className={styles.backBtn}
          onClick={() => router.push('/')}
        >
          ← Quay lại thực đơn
        </button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className={styles.page}>
        <div className={styles.card}>
          <div style={{ textAlign: 'center', padding: '2rem' }}>Đang tải...</div>
        </div>
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
