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

export type AdminTab = 'pos' | 'customers' | 'orders' | 'products' | 'loyalty';

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
        {/* GROUP 1: COUNTER POS & ORDERS */}
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
