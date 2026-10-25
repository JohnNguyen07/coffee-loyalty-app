'use client';

import Image from 'next/image';
import styles from './AdminSidebar.module.css';

export type AdminTab = 'products' | 'customers' | 'loyalty' | 'qr' | 'pos' | 'orders';

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
            src="/logo.png"
            alt="Ủ LAB"
            width={32}
            height={32}
            className={styles.logoImg}
          />
        </div>
        <span className={styles.logoText}>Ủ LAB</span>
        <span className={styles.adminBadge}>Admin</span>
      </div>

      <nav className={styles.nav}>
        {/* GROUP 1: PRODUCTS */}
        <div className={styles.groupHeader}>☕ Products</div>
        <button
          className={`${styles.subItem} ${currentTab === 'products' && (!currentSubTab || currentSubTab === 'products') ? styles.activeSub : ''}`}
          onClick={() => onSelect({ mainTab: 'products', subTab: 'products' })}
          id="nav-products-list"
        >
          Products
        </button>
        <button
          className={`${styles.subItem} ${currentTab === 'products' && currentSubTab === 'categories' ? styles.activeSub : ''}`}
          onClick={() => onSelect({ mainTab: 'products', subTab: 'categories' })}
          id="nav-products-categories"
        >
          Categories
        </button>
        <button
          className={`${styles.subItem} ${currentTab === 'products' && currentSubTab === 'inventory' ? styles.activeSub : ''}`}
          onClick={() => onSelect({ mainTab: 'products', subTab: 'inventory' })}
          id="nav-products-inventory"
        >
          Inventory
        </button>

        {/* GROUP 2: CUSTOMERS */}
        <div className={styles.groupHeader}>👥 Customers</div>
        <button
          className={`${styles.subItem} ${currentTab === 'customers' && (!currentSubTab || currentSubTab === 'all') ? styles.activeSub : ''}`}
          onClick={() => onSelect({ mainTab: 'customers', subTab: 'all' })}
          id="nav-customers-all"
        >
          All Customers
        </button>
        <button
          className={`${styles.subItem} ${currentTab === 'customers' && currentSubTab === 'members' ? styles.activeSub : ''}`}
          onClick={() => onSelect({ mainTab: 'customers', subTab: 'members' })}
          id="nav-customers-members"
        >
          Members
        </button>
        <button
          className={`${styles.subItem} ${currentTab === 'customers' && currentSubTab === 'detail' ? styles.activeSub : ''}`}
          onClick={() => onSelect({ mainTab: 'customers', subTab: 'detail' })}
          id="nav-customers-detail"
        >
          Customer Detail (Trừ điểm)
        </button>

        {/* GROUP 3: LOYALTY */}
        <div className={styles.groupHeader}>🎁 Loyalty</div>
        <button
          className={`${styles.subItem} ${currentTab === 'loyalty' && (!currentSubTab || currentSubTab === 'tiers') ? styles.activeSub : ''}`}
          onClick={() => onSelect({ mainTab: 'loyalty', subTab: 'tiers' })}
          id="nav-loyalty-tiers"
        >
          Tiers
        </button>
        <button
          className={`${styles.subItem} ${currentTab === 'loyalty' && currentSubTab === 'cashback' ? styles.activeSub : ''}`}
          onClick={() => onSelect({ mainTab: 'loyalty', subTab: 'cashback' })}
          id="nav-loyalty-cashback"
        >
          Cashback
        </button>
        <button
          className={`${styles.subItem} ${currentTab === 'loyalty' && currentSubTab === 'transactions' ? styles.activeSub : ''}`}
          onClick={() => onSelect({ mainTab: 'loyalty', subTab: 'transactions' })}
          id="nav-loyalty-transactions"
        >
          Transactions
        </button>
        <button
          className={`${styles.subItem} ${currentTab === 'loyalty' && currentSubTab === 'vouchers' ? styles.activeSub : ''}`}
          onClick={() => onSelect({ mainTab: 'loyalty', subTab: 'vouchers' })}
          id="nav-loyalty-vouchers"
        >
          Vouchers
        </button>

        {/* GROUP 4: QR MANAGEMENT */}
        <div className={styles.groupHeader}>📱 QR Management</div>
        <button
          className={`${styles.subItem} ${currentTab === 'qr' && (!currentSubTab || currentSubTab === 'generator') ? styles.activeSub : ''}`}
          onClick={() => onSelect({ mainTab: 'qr', subTab: 'generator' })}
          id="nav-qr-generator"
        >
          QR Generator
        </button>
        <button
          className={`${styles.subItem} ${currentTab === 'qr' && currentSubTab === 'list' ? styles.activeSub : ''}`}
          onClick={() => onSelect({ mainTab: 'qr', subTab: 'list' })}
          id="nav-qr-list"
        >
          QR List
        </button>
        <button
          className={`${styles.subItem} ${currentTab === 'qr' && currentSubTab === 'redemption' ? styles.activeSub : ''}`}
          onClick={() => onSelect({ mainTab: 'qr', subTab: 'redemption' })}
          id="nav-qr-redemption"
        >
          QR Redemption
        </button>
        <button
          className={`${styles.subItem} ${currentTab === 'qr' && currentSubTab === 'print' ? styles.activeSub : ''}`}
          onClick={() => onSelect({ mainTab: 'qr', subTab: 'print' })}
          id="nav-qr-print"
        >
          Print QR
        </button>

        {/* QUICK ACCESS: POS & ORDERS */}
        <div className={styles.groupHeader} style={{ marginTop: '12px' }}>⚡ Bán Hàng & Đơn</div>
        <button
          className={`${styles.navItem} ${currentTab === 'pos' ? styles.active : ''}`}
          onClick={() => onSelect({ mainTab: 'pos' })}
          id="nav-pos"
        >
          <span className={styles.navIcon}>🏷️</span>
          <span className={styles.navLabel}>POS Thu Ngân</span>
        </button>
        <button
          className={`${styles.navItem} ${currentTab === 'orders' ? styles.active : ''}`}
          onClick={() => onSelect({ mainTab: 'orders' })}
          id="nav-orders"
        >
          <span className={styles.navIcon}>📦</span>
          <span className={styles.navLabel}>Đơn Hàng Web</span>
        </button>
      </nav>

      <div className={styles.footer}>
        <a href="/" className={styles.backLink}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Về trang khách
        </a>
      </div>
    </aside>
  );
}
