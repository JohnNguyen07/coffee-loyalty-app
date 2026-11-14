'use client';

import React, { useState, useEffect, useCallback } from 'react';
import styles from './DashboardOverview.module.css';

interface DashboardOverviewProps {
  onNavigate: (tab: string) => void;
}

export default function DashboardOverview({ onNavigate }: DashboardOverviewProps) {
  const [stats, setStats] = useState({
    allTimeRevenue: 0,
    todayRevenue: 0,
    allTimeOrders: 0,
    todayOrders: 0,
    activeLocationName: 'Ủ LAB — Quầy Chính',
    lowStockCount: 0,
    expiringLotsCount: 0,
    totalInventoryItems: 0,
  });

  const fetchQuickStats = useCallback(async () => {
    try {
      const [allRevRes, todayRevRes, invRes, rbacRes] = await Promise.all([
        fetch('/api/admin/cashbook?preset=ALL_TIME', { cache: 'no-store' }).catch(() => fetch('/api/revenue/summary?preset=ALL_TIME').catch(() => null)),
        fetch('/api/admin/cashbook?preset=TODAY', { cache: 'no-store' }).catch(() => fetch('/api/revenue/summary?preset=TODAY').catch(() => null)),
        fetch('/api/inventory/summary', { cache: 'no-store' }).catch(() => null),
        fetch('/api/rbac/profile', { cache: 'no-store' }).catch(() => null),
      ]);

      let allTimeRevenue = 0;
      let todayRevenue = 0;
      let allTimeOrders = 0;
      let todayOrders = 0;
      let locName = 'Ủ LAB — Quầy Chính';
      let lowStockCount = 0;
      let expiringLotsCount = 0;
      let totalInventoryItems = 0;

      if (allRevRes && allRevRes.ok) {
        const revData = await allRevRes.json().catch(() => null);
        if (revData?.summary) {
          allTimeRevenue = revData.summary.metrics?.paidOrderRevenue ?? 0;
          allTimeOrders = revData.summary.metrics?.orderCount ?? 0;
        }
      }

      if (todayRevRes && todayRevRes.ok) {
        const todayData = await todayRevRes.json().catch(() => null);
        if (todayData?.summary) {
          todayRevenue = todayData.summary.metrics?.paidOrderRevenue ?? 0;
          todayOrders = todayData.summary.metrics?.orderCount ?? 0;
        }
      }

      if (invRes && invRes.ok) {
        const invData = await invRes.json();
        if (invData.summary) {
          lowStockCount = invData.summary.lowStockCount || 0;
          expiringLotsCount = invData.summary.expiringLotsCount || 0;
          totalInventoryItems = invData.summary.totalItems || 0;
        }
      }

      if (rbacRes && rbacRes.ok) {
        const rbacData = await rbacRes.json();
        if (rbacData.activeLocation?.name) {
          locName = rbacData.activeLocation.name;
          if (typeof window !== 'undefined' && rbacData.activeLocation.id) {
            localStorage.setItem('ulab_active_location_id', rbacData.activeLocation.id);
          }
        } else if (rbacData.locations && rbacData.locations.length > 0) {
          const serverLocId = rbacData.activeLocationId || rbacData.profile?.assignedLocationIds?.[0];
          const matchedByServer = serverLocId
            ? rbacData.locations.find((l: { id: string; name: string }) => l.id === serverLocId)
            : null;
          const savedLocId = typeof window !== 'undefined' ? localStorage.getItem('ulab_active_location_id') : null;
          const matchedLoc =
            matchedByServer ||
            (savedLocId
              ? rbacData.locations.find((l: { id: string; name: string }) => l.id === savedLocId)
              : null);
          locName = matchedLoc ? matchedLoc.name : rbacData.locations[0].name;
        }
      }

      setStats({
        allTimeRevenue,
        todayRevenue,
        allTimeOrders,
        todayOrders,
        activeLocationName: locName,
        lowStockCount,
        expiringLotsCount,
        totalInventoryItems,
      });
    } catch (err) {
      console.warn('Dashboard stats fetch fallback:', err);
    }
  }, []);

  useEffect(() => {
    const initTimer = window.setTimeout(() => {
      void fetchQuickStats();
    }, 0);
    const handleLocationChanged = () => {
      void fetchQuickStats();
    };
    window.addEventListener('ulab:location-changed', handleLocationChanged);
    return () => {
      window.clearTimeout(initTimer);
      window.removeEventListener('ulab:location-changed', handleLocationChanged);
    };
  }, [fetchQuickStats]);

  const totalAlerts = stats.lowStockCount + stats.expiringLotsCount;

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
        <div className={styles.metricCard} onClick={() => onNavigate('revenue')} style={{ cursor: 'pointer' }}>
          <div className={styles.metricHeader}>
            <span className={styles.metricLabel}>Tổng Doanh Thu Thực Tế</span>
            <div className={styles.metricIconWrap}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect width="20" height="12" x="2" y="6" rx="2" />
                <circle cx="12" cy="12" r="2" />
              </svg>
            </div>
          </div>
          <span className={styles.metricValue}>
            {stats.allTimeRevenue.toLocaleString('vi-VN')} đ
          </span>
          <span className={styles.metricSub}>
            Hôm nay: {stats.todayRevenue.toLocaleString('vi-VN')} đ · Quỹ Tiền Cửa Hàng
          </span>
        </div>

        <div className={styles.metricCard} onClick={() => onNavigate('orders')} style={{ cursor: 'pointer' }}>
          <div className={styles.metricHeader}>
            <span className={styles.metricLabel}>Tổng Đơn Hoàn Tất</span>
            <div className={styles.metricIconWrap}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
                <path d="M3 6h18" />
                <path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
            </div>
          </div>
          <span className={styles.metricValue}>{stats.allTimeOrders} đơn</span>
          <span className={styles.metricSub}>
            Hôm nay: {stats.todayOrders} đơn · Tại quầy &amp; website
          </span>
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

        <div className={styles.metricCard} onClick={() => onNavigate('inventory')} style={{ cursor: 'pointer' }}>
          <div className={styles.metricHeader}>
            <span className={styles.metricLabel}>An Toàn Tồn Kho</span>
            <div className={styles.metricIconWrap}>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke={totalAlerts > 0 ? '#d97706' : '#16a34a'}
                strokeWidth="2"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
              </svg>
            </div>
          </div>
          {totalAlerts > 0 ? (
            <>
              <span className={styles.metricValue} style={{ color: '#d97706', fontSize: '1.35rem' }}>
                ⚠️ {stats.lowStockCount} sắp hết
              </span>
              <span className={styles.metricSub}>
                {stats.expiringLotsCount > 0
                  ? `${stats.expiringLotsCount} lô cận hạn · Bấm để nhập kho`
                  : 'Cần nhập bổ sung nguyên liệu'}
              </span>
            </>
          ) : (
            <>
              <span className={styles.metricValue} style={{ color: '#16a34a' }}>
                ✓ Ổn định
              </span>
              <span className={styles.metricSub}>
                {stats.totalInventoryItems > 0
                  ? `Đang theo dõi ${stats.totalInventoryItems} mặt hàng kho`
                  : 'Định giá FIFO & Lô FEFO tự động'}
              </span>
            </>
          )}
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
            Quản Trị Kho &amp; Nguyên Liệu
          </h3>
          <p className={styles.actionCardDesc}>
            Nhập kho nhanh, xuất hủy hao hụt, kiểm kê cuối ca 1-click và sản xuất đóng chai Cold Brew.
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
            Báo cáo doanh thu thực tế, quản lý 1 tài khoản Tiền duy nhất (Quỹ Tiền Cửa Hàng), quản lý ca bán và kiểm đếm két.
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
