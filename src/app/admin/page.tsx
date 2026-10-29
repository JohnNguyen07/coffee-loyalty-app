'use client';

import { useState, useEffect } from 'react';
import styles from './page.module.css';
import AdminSidebar, { AdminTab, AdminNavSelection } from '@/components/Admin/AdminSidebar';
import AdminHeader from '@/components/Admin/AdminHeader';
import DashboardOverview from '@/components/Admin/DashboardOverview';
import UnimplementedPanel from '@/components/Admin/UnimplementedPanel';
import POSPanel from '@/components/Admin/POSPanel';
import OrdersPanel from '@/components/Admin/OrdersPanel';
import CustomersPanel, { CustomerSubTab } from '@/components/Admin/CustomersPanel';
import ProductsPanel from '@/components/Admin/ProductsPanel';
import LoyaltyPanel, { LoyaltySubTab } from '@/components/Admin/LoyaltyPanel';
import RevenuePanel from '@/components/Admin/RevenuePanel';
import InventoryPanel from '@/components/Admin/InventoryPanel';
import LocationsRbacPanel from '@/components/Admin/LocationsRbacPanel';
import { type MvpRole } from '@/lib/rbac/domain';

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<AdminTab>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const rawTab = params.get('tab');
      if (rawTab) {
        return (rawTab === 'qr' ? 'pos' : rawTab) as AdminTab;
      }
    }
    return 'dashboard';
  });

  const [activeSubTab, setActiveSubTab] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('sub') || 'detail';
    }
    return 'detail';
  });

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userRole, setUserRole] = useState<MvpRole>('OWNER');

  // Fetch RBAC profile to know role for menu visibility
  useEffect(() => {
    let active = true;
    fetch('/api/rbac/profile')
      .then((res) => res.json())
      .then((data) => {
        if (active && data.success && data.profile?.role) {
          setUserRole(data.profile.role as MvpRole);
        }
      })
      .catch((err) => {
        console.warn('AdminPage rbac profile fetch fallback:', err);
      });

    return () => {
      active = false;
    };
  }, []);

  // Listen for navigation events from panels (e.g. Nạp vào POS)
  useEffect(() => {
    const handleNavChange = (e: Event) => {
      const customEvent = e as CustomEvent;
      const tab = customEvent.detail?.tab as AdminTab | undefined;
      if (tab) {
        handleNavSelect({ mainTab: tab });
      }
    };
    window.addEventListener('ulab:nav-change', handleNavChange);
    return () => {
      window.removeEventListener('ulab:nav-change', handleNavChange);
    };
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
      {/* Overlay for mobile sidebar */}
      {sidebarOpen && (
        <div
          className={styles.sidebarOverlay}
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Unified Sidebar */}
      <AdminSidebar
        currentTab={activeTab}
        currentSubTab={activeSubTab}
        userRole={userRole}
        onSelect={handleNavSelect}
        isOpen={sidebarOpen}
      />

      {/* Main Area with Header and Content */}
      <div className={styles.mainArea}>
        <AdminHeader
          currentTab={activeTab}
          onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
          onSelectTab={(tab) => handleNavSelect({ mainTab: tab as AdminTab })}
        />

        <main className={styles.content}>
          {activeTab === 'dashboard' && (
            <DashboardOverview
              onNavigate={(tab) => handleNavSelect({ mainTab: tab as AdminTab })}
            />
          )}
          {activeTab === 'pos' && <POSPanel />}
          {activeTab === 'orders' && <OrdersPanel />}
          {activeTab === 'products' && <ProductsPanel />}
          {activeTab === 'customers' && (
            <CustomersPanel
              key={`cust-${activeSubTab}`}
              initialSubTab={(activeSubTab as CustomerSubTab) || 'detail'}
            />
          )}
          {activeTab === 'inventory' && <InventoryPanel />}
          {activeTab === 'revenue' && <RevenuePanel />}
          {activeTab === 'invoices' && (
            <UnimplementedPanel
              title="Hóa Đơn Điện Tử"
              description="Hệ thống phát hành và quản lý hóa đơn điện tử khởi tạo từ máy tính tiền (TT78/NĐ123) kết nối cơ quan thuế."
              moduleKey="invoices"
              onBackToDashboard={() => handleNavSelect({ mainTab: 'dashboard' })}
            />
          )}
          {(activeTab === 'settings' || activeTab === 'locations') && (
            <LocationsRbacPanel />
          )}
          {activeTab === 'loyalty' && (
            <LoyaltyPanel
              key={`loy-${activeSubTab}`}
              initialSubTab={(activeSubTab as LoyaltySubTab) || 'tiers'}
            />
          )}
        </main>
      </div>
    </div>
  );
}
