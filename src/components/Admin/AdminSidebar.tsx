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
import { type MvpRole, canAccessMenuTab } from '@/lib/rbac/domain';

export type AdminTab =
  | 'dashboard'
  | 'pos'
  | 'orders'
  | 'products'
  | 'customers'
  | 'inventory'
  | 'revenue'
  | 'invoices'
  | 'settings'
  | 'locations'
  | 'loyalty';

export interface AdminNavSelection {
  mainTab: AdminTab;
  subTab?: string;
}

interface AdminSidebarProps {
  currentTab: AdminTab;
  currentSubTab?: string;
  userRole?: MvpRole;
  onSelect: (selection: AdminNavSelection) => void;
  isOpen: boolean;
}

export default function AdminSidebar({
  currentTab,
  currentSubTab,
  userRole = 'OWNER',
  onSelect,
  isOpen,
}: AdminSidebarProps) {
  // Check permission for each tab
  const canShow = (tab: AdminTab) => canAccessMenuTab(userRole, tab);

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
          <span className={styles.brandSub}>Business OS</span>
        </div>
        <span className={styles.adminBadge}>{userRole}</span>
      </div>

      <nav className={styles.nav} aria-label="Điều hướng Quản trị">
        {/* 1. DASHBOARD */}
        {canShow('dashboard') && (
          <button
            type="button"
            className={`${styles.navItem} ${currentTab === 'dashboard' ? styles.active : ''}`}
            onClick={() => onSelect({ mainTab: 'dashboard' })}
            id="nav-dashboard"
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
            >
              <rect width="7" height="9" x="3" y="3" rx="1" />
              <rect width="7" height="5" x="14" y="3" rx="1" />
              <rect width="7" height="9" x="14" y="12" rx="1" />
              <rect width="7" height="5" x="3" y="16" rx="1" />
            </svg>
            <span className={styles.navLabel}>Dashboard</span>
          </button>
        )}

        {/* GROUP: VẬN HÀNH BÁN HÀNG */}
        <div className={styles.groupHeader}>
          <ShoppingBagIcon size={13} />
          <span>Bán hàng &amp; Vận hành</span>
        </div>

        {/* 2. POS */}
        {canShow('pos') && (
          <button
            type="button"
            className={`${styles.navItem} ${currentTab === 'pos' ? styles.active : ''}`}
            onClick={() => onSelect({ mainTab: 'pos' })}
            id="nav-pos"
          >
            <QrScanIcon size={16} />
            <span className={styles.navLabel}>POS &amp; Tạo Tem QR</span>
          </button>
        )}

        {/* 3. ĐƠN HÀNG */}
        {canShow('orders') && (
          <button
            type="button"
            className={`${styles.navItem} ${currentTab === 'orders' ? styles.active : ''}`}
            onClick={() => onSelect({ mainTab: 'orders' })}
            id="nav-orders"
          >
            <ShoppingBagIcon size={16} />
            <span className={styles.navLabel}>Đơn Hàng</span>
          </button>
        )}

        {/* 4. SẢN PHẨM & MENU */}
        {canShow('products') && (
          <button
            type="button"
            className={`${styles.navItem} ${currentTab === 'products' ? styles.active : ''}`}
            onClick={() => onSelect({ mainTab: 'products' })}
            id="nav-products"
          >
            <CategorySvgIcon slug="cold-brew" size={16} />
            <span className={styles.navLabel}>Sản Phẩm &amp; Giá</span>
          </button>
        )}

        {/* GROUP: KHO & TÀI CHÍNH */}
        {(canShow('inventory') || canShow('revenue') || canShow('invoices')) && (
          <div className={styles.groupHeader}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
            </svg>
            <span>Kho &amp; Tài chính</span>
          </div>
        )}

        {/* 5. KHO */}
        {canShow('inventory') && (
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
            >
              <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
              <path d="m3.3 7 8.7 5 8.7-5" />
              <path d="M12 22V12" />
            </svg>
            <span className={styles.navLabel}>Kho &amp; Nguyên Liệu</span>
          </button>
        )}

        {/* 6. BÁO CÁO DOANH THU */}
        {canShow('revenue') && (
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
            >
              <rect width="20" height="12" x="2" y="6" rx="2" />
              <circle cx="12" cy="12" r="2" />
              <path d="M6 12h.01M18 12h.01" />
            </svg>
            <span className={styles.navLabel}>Báo Cáo Doanh Thu</span>
          </button>
        )}

        {/* 7. HÓA ĐƠN ĐIỆN TỬ */}
        {canShow('invoices') && (
          <button
            type="button"
            className={`${styles.navItem} ${currentTab === 'invoices' ? styles.active : ''}`}
            onClick={() => onSelect({ mainTab: 'invoices' })}
            id="nav-invoices"
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
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            <span className={styles.navLabel}>Hóa Đơn</span>
          </button>
        )}

        {/* GROUP: KHÁCH HÀNG & CRM */}
        {canShow('customers') && (
          <>
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
          </>
        )}

        {/* GROUP: CÀI ĐẶT & HỆ THỐNG */}
        {(canShow('settings') || canShow('locations') || canShow('loyalty')) && (
          <div className={styles.groupHeader}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span>Cài đặt hệ thống</span>
          </div>
        )}

        {/* 8. CÀI ĐẶT & ĐIỂM BÁN (RBAC) */}
        {(canShow('settings') || canShow('locations')) && (
          <button
            type="button"
            className={`${styles.navItem} ${currentTab === 'settings' || currentTab === 'locations' ? styles.active : ''}`}
            onClick={() => onSelect({ mainTab: 'settings' })}
            id="nav-settings"
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
            >
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <span className={styles.navLabel}>Cài Đặt &amp; Điểm Bán</span>
          </button>
        )}

        {/* 9. LOYALTY REWARDS */}
        {canShow('loyalty') && (
          <button
            type="button"
            className={`${styles.navItem} ${currentTab === 'loyalty' ? styles.active : ''}`}
            onClick={() => onSelect({ mainTab: 'loyalty' })}
            id="nav-loyalty"
          >
            <StarSolidIcon size={16} />
            <span className={styles.navLabel}>Ủ LAB Rewards®</span>
          </button>
        )}
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
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span>Về trang khách hàng</span>
        </Link>
      </div>
    </aside>
  );
}
