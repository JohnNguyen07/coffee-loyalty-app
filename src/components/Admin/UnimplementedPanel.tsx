'use client';

import React from 'react';
import styles from './UnimplementedPanel.module.css';

interface UnimplementedPanelProps {
  title: string;
  description: string;
  moduleKey: string;
  onBackToDashboard: () => void;
}

export default function UnimplementedPanel({
  title,
  description,
  moduleKey,
  onBackToDashboard,
}: UnimplementedPanelProps) {
  return (
    <div className={styles.wrap}>
      <div className={styles.iconWrap}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>

      <h2 className={styles.title}>{title}</h2>
      <p className={styles.desc}>{description}</p>

      <div className={styles.metaCard}>
        <strong>Nguyên tắc triển khai Ủ LAB:</strong>
        <div style={{ marginTop: 4 }}>
          Mô-đun <code>{moduleKey}</code> tuân thủ nghiêm ngặt quy tắc kiến trúc: Không sử dụng dữ liệu giả hoặc tự giả định API nhà cung cấp. Tính năng sẽ được kích hoạt ngay khi nhận được tài liệu kết nối và cấu hình thực tế từ ban quản lý sản phẩm.
        </div>
      </div>

      <button type="button" className={styles.backBtn} onClick={onBackToDashboard}>
        &larr; Quay lại Dashboard Tổng Quan
      </button>
    </div>
  );
}

