'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import styles from './AdminHeader.module.css';
import { type LocationItem, type UserRbacProfile } from '@/lib/rbac/domain';

interface AdminHeaderProps {
  currentTab: string;
  onToggleSidebar: () => void;
  onSelectTab: (tab: string) => void;
}

export default function AdminHeader({
  currentTab,
  onToggleSidebar,
}: AdminHeaderProps) {
  const router = useRouter();
  const [profile, setProfile] = useState<UserRbacProfile | null>(null);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [activeLocation, setActiveLocation] = useState<LocationItem | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;

    const loadProfile = async () => {
      try {
        const res = await fetch('/api/rbac/profile');
        const data = await res.json();
        if (active && data.success && data.profile) {
          setProfile(data.profile);
          const locs: LocationItem[] = data.locations || [];
          setLocations(locs);

          // Find active location based on assignedLocationIds[0] or first location
          const activeId = data.profile.assignedLocationIds?.[0] || locs[0]?.id;
          const current = locs.find((l) => l.id === activeId) || locs[0] || null;
          setActiveLocation(current);
        }
      } catch (err) {
        console.warn('AdminHeader fetch profile fallback:', err);
      }
    };

    loadProfile();

    const handleLocationChanged = () => {
      loadProfile();
    };

    window.addEventListener('ulab:location-changed', handleLocationChanged);
    return () => {
      active = false;
      window.removeEventListener('ulab:location-changed', handleLocationChanged);
    };
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle Switch Working Location
  const handleSelectLocation = async (loc: LocationItem) => {
    setDropdownOpen(false);
    if (activeLocation?.id === loc.id) return;

    try {
      const res = await fetch('/api/rbac/switch-location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationId: loc.id }),
      });
      const data = await res.json();
      if (data.success) {
        setActiveLocation(loc);
        window.dispatchEvent(new CustomEvent('ulab:location-changed', { detail: { locationId: loc.id } }));
      }
    } catch (err) {
      console.error('Error switching location in header:', err);
    }
  };

  // Handle Logout
  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    if (typeof window !== 'undefined') {
      localStorage.removeItem('coffee_active_user');
      router.push('/login');
    }
  };

  // Breadcrumb mapping
  const getBreadcrumbLabel = (tab: string) => {
    switch (tab) {
      case 'dashboard':
        return 'Tổng quan vận hành';
      case 'pos':
        return 'Bán hàng POS & Tem QR';
      case 'orders':
        return 'Quản lý đơn hàng';
      case 'products':
        return 'Thực đơn & Giá bán';
      case 'customers':
        return 'Khách hàng & Ví điểm';
      case 'inventory':
        return 'Quản trị kho & Giá vốn';
      case 'revenue':
        return 'Báo cáo doanh thu & Sổ quỹ';
      case 'invoices':
        return 'Hóa đơn điện tử';
      case 'settings':
      case 'locations':
        return 'Cài đặt & Điểm bán (RBAC)';
      case 'loyalty':
        return 'Ủ LAB Rewards®';
      default:
        return 'Quản trị';
    }
  };

  const getRoleClass = (r?: string) => {
    switch (r) {
      case 'OWNER':
        return styles.roleOwner;
      case 'ADMIN':
        return styles.roleAdmin;
      case 'MANAGER':
        return styles.roleManager;
      case 'INVENTORY_STAFF':
        return styles.roleInventory;
      default:
        return styles.roleCashier;
    }
  };

  return (
    <header className={styles.header}>
      {/* ── Left: Hamburger & Breadcrumb ── */}
      <div className={styles.leftSection}>
        <button
          type="button"
          className={styles.menuToggleBtn}
          onClick={onToggleSidebar}
          aria-label="Mở Menu điều hướng"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        <nav className={styles.breadcrumbWrap} aria-label="Đường dẫn">
          <span className={styles.breadcrumbRoot}>Ủ LAB</span>
          <span className={styles.breadcrumbSep}>/</span>
          <span className={styles.breadcrumbCurrent}>{getBreadcrumbLabel(currentTab)}</span>
        </nav>
      </div>

      {/* ── Right: Location Selector, Status, User ── */}
      <div className={styles.rightSection}>
        {/* Location Selector (Only displays locations user has permission to access) */}
        <div className={styles.locationSelectorWrap} ref={dropdownRef}>
          <button
            type="button"
            className={styles.locationBtn}
            onClick={() => setDropdownOpen(!dropdownOpen)}
            title="Đổi điểm bán làm việc"
          >
            <svg
              className={styles.locationIcon}
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
            >
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <span className={styles.locationName}>
              {activeLocation ? activeLocation.name : 'Đang chọn điểm bán...'}
            </span>
            <svg
              className={styles.chevronIcon}
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {dropdownOpen && (
            <div className={styles.locationDropdown}>
              <div className={styles.dropdownHeader}>
                Điểm Bán Được Cấp Quyền ({locations.length})
              </div>
              {locations.map((loc) => {
                const isActive = activeLocation?.id === loc.id;
                return (
                  <button
                    key={loc.id}
                    type="button"
                    className={`${styles.locationOption} ${isActive ? styles.locationOptionActive : ''}`}
                    onClick={() => handleSelectLocation(loc)}
                  >
                    <span>{loc.name}</span>
                    {isActive && (
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#166534' }}>
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
              {locations.length === 0 && (
                <div style={{ padding: '8px 12px', fontSize: '0.8rem', color: '#94a3b8' }}>
                  Không có điểm bán khả dụng
                </div>
              )}
            </div>
          )}
        </div>

        {/* Live System Status */}
        <div className={styles.statusBadge} title="Trạng thái kết nối máy chủ">
          <span className={styles.statusDot} />
          <span>Hệ thống ổn định</span>
        </div>

        {/* User Profile & Logout */}
        <div className={styles.accountWrap}>
          <div className={styles.userMeta}>
            <span className={styles.userName}>{profile?.fullName || 'Quản trị viên'}</span>
            <span className={`${styles.roleTag} ${getRoleClass(profile?.role)}`}>
              {profile?.role || 'ADMIN'}
            </span>
          </div>

          <button
            type="button"
            className={styles.logoutBtn}
            onClick={handleLogout}
            title="Đăng xuất khỏi hệ thống"
          >
            Đăng xuất
          </button>
        </div>
      </div>
    </header>
  );
}
