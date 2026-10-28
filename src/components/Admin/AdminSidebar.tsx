'use client';

import Image from 'next/image';
import Link from 'next/link';
import styles from './AdminSidebar.module.css';
import {
  CategorySvgIcon,
  UserIcon,
  StarSolidIcon,
  QrScanIcon,
  ShoppingBagIcon,
} from '@/components/Icons/LabIcons';

export type AdminTab = 'pos' | 'revenue' | 'inventory' | 'locations' | 'customers' | 'orders' | 'products' | 'loyalty';

export interface AdminNavSelection {
  mainTab: AdminTab;
  subTab?: string;
}

interface AdminSidebarProps {
  currentTab: AdminTab;
  currentSubTab?: string;
  onSelect: (selection: AdminNavSelection) => void;
  isOpen: boolean;
}

export default function AdminSidebar({
  currentTab,
  currentSubTab,
  onSelect,
  isOpen,
}: AdminSidebarProps) {
  return (
    <aside className={`${styles.sidebar} ${isOpen ? styles.open : ''}`}>
      <div className={styles.logo}>
        <div className={styles.logoWrap}>
          <Image
            src="/logo-mark.png"
            alt="Ủ LAB"
            width={34}
            height={34}
            className={styles.logoImg}
          />
        </div>
        <div className={styles.brandMeta}>
          <span className={styles.logoText}>Ủ LAB</span>
          <span className={styles.brandSub}>POS &amp; CRM</span>
        </div>
        <span className={styles.adminBadge}>Admin</span>
      </div>

      <nav className={styles.nav} aria-label="Điều hướng Quản trị">
        {/* GROUP 1: COUNTER POS, REVENUE & INVENTORY */}
        <div className={styles.groupHeader}>
          <ShoppingBagIcon size={13} />
          <span>Vận hành tại quầy</span>
        </div>
        <button
          type="button"
          className={`${styles.navItem} ${currentTab === 'pos' ? styles.active : ''}`}
          onClick={() => onSelect({ mainTab: 'pos' })}
          id="nav-pos"
        >
          <QrScanIcon size={16} />
          <span className={styles.navLabel}>POS &amp; Tạo Tem QR</span>
        </button>
        <button
          type="button"
          className={`${styles.navItem} ${currentTab === 'revenue' ? styles.active : ''}`}
          onClick={() => onSelect({ mainTab: 'revenue' })}
          id="nav-revenue"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect width="20" height="12" x="2" y="6" rx="2" />
            <circle cx="12" cy="12" r="2" />
            <path d="M6 12h.01M18 12h.01" />
          </svg>
          <span className={styles.navLabel}>Doanh Thu &amp; Sổ Quỹ</span>
        </button>
        <button
          type="button"
          className={`${styles.navItem} ${currentTab === 'inventory' ? styles.active : ''}`}
          onClick={() => onSelect({ mainTab: 'inventory' })}
          id="nav-inventory"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
            <path d="m3.3 7 8.7 5 8.7-5" />
            <path d="M12 22V12" />
          </svg>
          <span className={styles.navLabel}>Kho &amp; Nguyên Liệu</span>
        </button>
        <button
          type="button"
          className={`${styles.navItem} ${currentTab === 'locations' ? styles.active : ''}`}
          onClick={() => onSelect({ mainTab: 'locations' })}
          id="nav-locations"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <span className={styles.navLabel}>Điểm Bán &amp; Phân Quyền</span>
        </button>
        <button
          type="button"
          className={`${styles.navItem} ${currentTab === 'orders' ? styles.active : ''}`}
          onClick={() => onSelect({ mainTab: 'orders' })}
          id="nav-orders"
        >
          <ShoppingBagIcon size={16} />
          <span className={styles.navLabel}>Đơn Hàng Website</span>
        </button>

        {/* GROUP 2: CUSTOMERS & WALLET */}
        <div className={styles.groupHeader}>
          <UserIcon size={13} />
          <span>Khách hàng &amp; Ví điểm</span>
        </div>
        <button
          type="button"
          className={`${styles.subItem} ${currentTab === 'customers' && (!currentSubTab || currentSubTab === 'detail') ? styles.activeSub : ''}`}
          onClick={() => onSelect({ mainTab: 'customers', subTab: 'detail' })}
          id="nav-customers-detail"
        >
          Tra cứu &amp; Cộng/Trừ điểm
        </button>
        <button
          type="button"
          className={`${styles.subItem} ${currentTab === 'customers' && currentSubTab === 'list' ? styles.activeSub : ''}`}
          onClick={() => onSelect({ mainTab: 'customers', subTab: 'list' })}
          id="nav-customers-list"
        >
          Danh sách thành viên
        </button>

        {/* GROUP 3: MENU */}
        <div className={styles.groupHeader}>
          <CategorySvgIcon slug="matcha" size={13} />
          <span>Thực đơn</span>
        </div>
        <button
          type="button"
          className={`${styles.navItem} ${currentTab === 'products' ? styles.active : ''}`}
          onClick={() => onSelect({ mainTab: 'products' })}
          id="nav-products"
        >
          <CategorySvgIcon slug="cold-brew" size={16} />
          <span className={styles.navLabel}>Quản lý Món &amp; Giá</span>
        </button>

        {/* GROUP 4: LOYALTY CONFIG & LEDGER */}
        <div className={styles.groupHeader}>
          <StarSolidIcon size={13} />
          <span>Ủ LAB Rewards®</span>
        </div>
        <button
          type="button"
          className={`${styles.subItem} ${currentTab === 'loyalty' && (!currentSubTab || currentSubTab === 'tiers') ? styles.activeSub : ''}`}
          onClick={() => onSelect({ mainTab: 'loyalty', subTab: 'tiers' })}
          id="nav-loyalty-tiers"
        >
          Hạng &amp; Tỷ lệ hoàn điểm
        </button>
        <button
          type="button"
          className={`${styles.subItem} ${currentTab === 'loyalty' && currentSubTab === 'transactions' ? styles.activeSub : ''}`}
          onClick={() => onSelect({ mainTab: 'loyalty', subTab: 'transactions' })}
          id="nav-loyalty-transactions"
        >
          Sổ cái giao dịch điểm
        </button>
      </nav>

      <div className={styles.footer}>
        <Link href="/" className={styles.backLink}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span>Về trang khách hàng</span>
        </Link>
      </div>
    </aside>
  );
}
