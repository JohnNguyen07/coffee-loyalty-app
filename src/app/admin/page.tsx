'use client';

import { useState, useEffect } from 'react';
import styles from './page.module.css';
import AdminSidebar, { AdminTab, AdminNavSelection } from '@/components/Admin/AdminSidebar';
import POSPanel from '@/components/Admin/POSPanel';
import OrdersPanel from '@/components/Admin/OrdersPanel';
import CustomersPanel, { CustomerSubTab } from '@/components/Admin/CustomersPanel';
import ProductsPanel, { ProductSubTab } from '@/components/Admin/ProductsPanel';
import LoyaltyPanel, { LoyaltySubTab } from '@/components/Admin/LoyaltyPanel';
import QRPanel, { QRSubTab } from '@/components/Admin/QRPanel';

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<AdminTab>('customers');
  const [activeSubTab, setActiveSubTab] = useState<string>('detail');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Sync with URL search params on mount if available
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab') as AdminTab;
      const sub = params.get('sub');
      if (tab) {
        setActiveTab(tab);
        if (sub) setActiveSubTab(sub);
      }
    }
  }, []);

  const handleNavSelect = (selection: AdminNavSelection) => {
    setActiveTab(selection.mainTab);
    if (selection.subTab) {
      setActiveSubTab(selection.subTab);
    }
    setSidebarOpen(false);

    // Update URL query quietly without page reload
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', selection.mainTab);
      if (selection.subTab) {
        url.searchParams.set('sub', selection.subTab);
      } else {
        url.searchParams.delete('sub');
      }
      window.history.replaceState({}, '', url.toString());
    }
  };

  return (
    <div className={styles.admin}>
      {/* Mobile header */}
      <div className={styles.mobileHeader}>
        <button
          className={styles.menuBtn}
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-label="Menu"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <span className={styles.mobileTitle}>Ủ LAB Admin</span>
      </div>

      {/* Overlay for mobile sidebar */}
      {sidebarOpen && (
        <div
          className={styles.sidebarOverlay}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <AdminSidebar
        currentTab={activeTab}
        currentSubTab={activeSubTab}
        onSelect={handleNavSelect}
        isOpen={sidebarOpen}
      />

      <main className={styles.content}>
        {activeTab === 'customers' && (
          <CustomersPanel
            key={`cust-${activeSubTab}`}
            initialSubTab={(activeSubTab as CustomerSubTab) || 'detail'}
          />
        )}
        {activeTab === 'products' && (
          <ProductsPanel
            key={`prod-${activeSubTab}`}
            initialSubTab={(activeSubTab as ProductSubTab) || 'products'}
          />
        )}
        {activeTab === 'loyalty' && (
          <LoyaltyPanel
            key={`loy-${activeSubTab}`}
            initialSubTab={(activeSubTab as LoyaltySubTab) || 'tiers'}
          />
        )}
        {activeTab === 'qr' && (
          <QRPanel
            key={`qr-${activeSubTab}`}
            initialSubTab={(activeSubTab as QRSubTab) || 'generator'}
          />
        )}
        {activeTab === 'pos' && <POSPanel />}
        {activeTab === 'orders' && <OrdersPanel />}
      </main>
    </div>
  );
}
