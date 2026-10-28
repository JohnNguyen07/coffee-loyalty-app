'use client';

import React, { useState, useEffect } from 'react';
import styles from './DashboardOverview.module.css';

interface DashboardOverviewProps {
  onNavigate: (tab: string) => void;
}

export default function DashboardOverview({ onNavigate }: DashboardOverviewProps) {
  const [stats, setStats] = useState({
    todayRevenue: 0,
    orderCount: 0,
    activeLocationName: 'Ủ LAB — Quầy Chính',
    inventoryAlerts: 0,
  });

  useEffect(() => {
    let active = true;
    const fetchQuickStats = async () => {
      try {
        const [revRes, orderRes, rbacRes] = await Promise.all([
          fetch('/api/revenue/summary?preset=TODAY').catch(() => null),
          fetch('/api/pos/orders?limit=10').catch(() => null),
          fetch('/api/rbac/profile').catch(() => null),
        ]);

        if (!active) return;

        let revenue = 0;
        let orders = 0;
        let locName = 'Ủ LAB — Quầy Chính';

        if (revRes && revRes.ok) {
          const revData = await revRes.json();
          if (revData.summary) {
            revenue = revData.summary.netSales || 0;
            orders = revData.summary.confirmedOrdersCount || 0;
          }
        }

        if (orderRes && orderRes.ok) {
          const orderData = await orderRes.json();
          if (orderData.orders && orders === 0) {
            orders = orderData.orders.length;
          }
        }

        if (rbacRes && rbacRes.ok) {
          const rbacData = await rbacRes.json();
          if (rbacData.locations && rbacData.locations.length > 0) {
            locName = rbacData.locations[0].name;
          }
        }

        setStats({
          todayRevenue: revenue,
          orderCount: orders,
          activeLocationName: locName,
          inventoryAlerts: 0,
        });
      } catch (err) {
        console.warn('Dashboard stats fetch fallback:', err);
      }
    };

    fetchQuickStats();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className={styles.dashboard}>
      {/* ── Welcome Bar ── */}
      <div className={styles.welcomeBar}>
        <h1 className={styles.welcomeTitle}>Tổng Quan Vận Hành Ủ LAB</h1>
        <p className={styles.welcomeDesc}>
          Hệ điều hành bán hàng takeaway, phân phối đa chi nhánh và kiểm soát tài chính tập trung.
        </p>
      </div>

      {/* ── 4 Quick Metric Cards ── */}
      <div className={styles.metricsGrid}>
        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <span className={styles.metricLabel}>Doanh Thu Hôm Nay</span>
            <div className={styles.metricIconWrap}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect width="20" height="12" x="2" y="6" rx="2" />
                <circle cx="12" cy="12" r="2" />
              </svg>
            </div>
          </div>
          <span className={styles.metricValue}>
            {stats.todayRevenue.toLocaleString('vi-VN')} đ
          </span>
          <span className={styles.metricSub}>Doanh thu thuần đơn đã thanh toán</span>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <span className={styles.metricLabel}>Số Đơn Hàng Hôm Nay</span>
            <div className={styles.metricIconWrap}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
                <path d="M3 6h18" />
                <path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
            </div>
          </div>
          <span className={styles.metricValue}>{stats.orderCount}</span>
          <span className={styles.metricSub}>Đơn hoàn tất tại quầy &amp; website</span>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <span className={styles.metricLabel}>Điểm Bán Hiện Tại</span>
            <div className={styles.metricIconWrap}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00754a" strokeWidth="2.2">
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
            </div>
          </div>
          <span className={styles.metricValue} style={{ fontSize: '1.1rem', lineHeight: 1.4 }}>
            {stats.activeLocationName}
          </span>
          <span className={styles.metricSub}>Có thể chuyển đổi tại Header phía trên</span>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <span className={styles.metricLabel}>An Toàn Tồn Kho</span>
            <div className={styles.metricIconWrap}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
              </svg>
            </div>
          </div>
          <span className={styles.metricValue} style={{ color: '#16a34a' }}>Ổn định</span>
          <span className={styles.metricSub}>Định giá FIFO &amp; Lô FEFO tự động</span>
        </div>
      </div>

      {/* ── Quick Action Navigators ── */}
      <h2 className={styles.sectionTitle}>Truy Cập Nhanh Vận Hành</h2>
      <div className={styles.actionsGrid}>
        <div className={styles.actionCard} onClick={() => onNavigate('pos')}>
          <h3 className={styles.actionCardTitle}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00754a" strokeWidth="2">
              <path d="M3 7V5a2 2 0 0 1 2-2h2" />
              <path d="M17 3h2a2 2 0 0 1 2 2v2" />
              <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
              <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
              <rect width="10" height="10" x="7" y="7" rx="1" />
            </svg>
            Bán Hàng POS &amp; In Tem QR
          </h3>
          <p className={styles.actionCardDesc}>
            Mở quầy bán hàng takeaway, chọn size, độ ngọt, đá, topping và in tem nhãn pha chế ly nước.
          </p>
          <span className={styles.actionLinkText}>Mở POS &rarr;</span>
        </div>

        <div className={styles.actionCard} onClick={() => onNavigate('inventory')}>
          <h3 className={styles.actionCardTitle}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2">
              <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
              <path d="m3.3 7 8.7 5 8.7-5" />
              <path d="M12 22V12" />
            </svg>
            Quản Trị Kho &amp; Giá Vốn
          </h3>
          <p className={styles.actionCardDesc}>
            Theo dõi lớp giá vốn FIFO, quản lý hạn dùng lô hàng FEFO, sản xuất đóng chai và kiểm kê hao hụt.
          </p>
          <span className={styles.actionLinkText} style={{ color: '#0284c7' }}>Vào Kho hàng &rarr;</span>
        </div>

        <div className={styles.actionCard} onClick={() => onNavigate('revenue')}>
          <h3 className={styles.actionCardTitle}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2">
              <line x1="12" x2="12" y1="2" y2="22" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
            Doanh Thu &amp; Sổ Quỹ Két
          </h3>
          <p className={styles.actionCardDesc}>
            Báo cáo dòng tiền thực tế, phân tách tiền mặt và chuyển khoản, quản lý ca bán và chênh lệch két.
          </p>
          <span className={styles.actionLinkText} style={{ color: '#b45309' }}>Xem Doanh thu &rarr;</span>
        </div>

        <div className={styles.actionCard} onClick={() => onNavigate('settings')}>
          <h3 className={styles.actionCardTitle}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7e22ce" strokeWidth="2">
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            Điểm Bán &amp; Phân Quyền
          </h3>
          <p className={styles.actionCardDesc}>
            Quản trị chuỗi chi nhánh, thêm nhân sự mới và phân công quyền hạn đa điểm bán an toàn qua RLS.
          </p>
          <span className={styles.actionLinkText} style={{ color: '#7e22ce' }}>Cài đặt &rarr;</span>
        </div>
      </div>

      {/* ── System Status & Compliance Notice ── */}
      <div className={styles.noticeCard}>
        <div className={styles.noticeMeta}>
          <h4 className={styles.noticeTitle}>Bảo Vệ Đa Khách Thuê &amp; Kiểm Soát Truy Cập</h4>
          <p className={styles.noticeDesc}>
            Mọi thao tác dữ liệu đều tuân thủ nguyên tắc kiểm tra quyền ở backend. Tuyệt đối không lưu trữ dữ liệu giả trong môi trường chính thức.
          </p>
        </div>
        <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '4px 10px', background: '#e2e8f0', borderRadius: 9999, color: '#334155' }}>
          Ủ LAB OS v1.0
        </span>
      </div>
    </div>
  );
}

