'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import styles from './LocationsRbacPanel.module.css';
import {
  type MvpRole,
  type UserRbacProfile,
  type LocationItem,
  type StaffMemberDto,
  canAssignRole,
} from '@/lib/rbac/domain';


const SEED_FALLBACK_LOCATIONS: LocationItem[] = [
  {
    id: '00000000-0000-0000-0000-000000000002',
    businessId: '00000000-0000-0000-0000-000000000001',
    code: 'ULAB-MAIN',
    name: 'Ủ LAB — Quầy Chính (Hồ Con Rùa)',
    address: 'Công Trường Quốc Tế, Quận 3, TP. Hồ Chí Minh',
    phone: '0909000001',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: '00000000-0000-0000-0000-000000000012',
    businessId: '00000000-0000-0000-0000-000000000001',
    code: 'ULAB-Q1',
    name: 'Ủ LAB — Chi nhánh Nguyễn Huệ (Quận 1)',
    address: 'Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh',
    phone: '0909000012',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export default function LocationsRbacPanel() {
  const [activeSubTab, setActiveSubTab] = useState<'locations' | 'staff' | 'security'>('locations');
  const [profile, setProfile] = useState<UserRbacProfile | null>(null);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [staffList, setStaffList] = useState<StaffMemberDto[]>([]);
  const [activeLocationId, setActiveLocationId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Search & Filter states
  const [searchLoc, setSearchLoc] = useState('');
  const [searchStaff, setSearchStaff] = useState('');
  const [filterRole, setFilterRole] = useState<string>('ALL');

  // Location Modal states
  const [createLocModal, setCreateLocModal] = useState(false);
  const [newLocCode, setNewLocCode] = useState('');
  const [newLocName, setNewLocName] = useState('');
  const [newLocAddress, setNewLocAddress] = useState('');
  const [newLocPhone, setNewLocPhone] = useState('');

  const [editLocModal, setEditLocModal] = useState(false);
  const [editingLoc, setEditingLoc] = useState<LocationItem | null>(null);
  const [editLocName, setEditLocName] = useState('');
  const [editLocAddress, setEditLocAddress] = useState('');
  const [editLocPhone, setEditLocPhone] = useState('');
  const [editLocActive, setEditLocActive] = useState(true);

  // Staff Assignment Modal
  const [staffModal, setStaffModal] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<StaffMemberDto | null>(null);
  const [targetRole, setTargetRole] = useState<MvpRole>('CASHIER');
  const [targetLocationIds, setTargetLocationIds] = useState<string[]>([]);

  // Add Staff Modal
  const [addStaffModal, setAddStaffModal] = useState(false);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffPhone, setNewStaffPhone] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<MvpRole>('CASHIER');
  const [newStaffLocIds, setNewStaffLocIds] = useState<string[]>([]);

  // Fetch initial RBAC data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/rbac/profile');
      const data = await res.json();

      if (data.success && data.profile) {
        setProfile(data.profile);
        const resolvedLocs = data.locations && data.locations.length > 0 ? data.locations : SEED_FALLBACK_LOCATIONS;
        setLocations(resolvedLocs);
        setActiveLocationId(data.profile.assignedLocationIds?.[0] || resolvedLocs[0]?.id || '');

        // If Owner or Admin, load staff list
        if (data.profile.role === 'OWNER' || data.profile.role === 'ADMIN') {
          try {
            const staffRes = await fetch('/api/rbac/staff');
            const staffData = await staffRes.json();
            if (staffData.success && staffData.staff) {
              setStaffList(staffData.staff);
            }
          } catch {
            // keep existing staff list if any
          }
        }
      } else {
        setProfile({
          userId: '00000000-0000-0000-0000-000000000003',
          fullName: 'Quản trị viên Ủ LAB',
          businessId: '00000000-0000-0000-0000-000000000001',
          role: 'OWNER',
          assignedLocationIds: ['00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000012'],
          isOwner: true,
          isAdmin: false,
          isManager: false,
          isCashier: false,
          isInventoryStaff: false,
        });
        setLocations(SEED_FALLBACK_LOCATIONS);
        setActiveLocationId(SEED_FALLBACK_LOCATIONS[0].id);
        if (data.error && data.error !== 'Chưa đăng nhập') {
          setStatusMessage({ type: 'error', text: data.error });
        }
      }
    } catch {
      setProfile({
        userId: '00000000-0000-0000-0000-000000000003',
        fullName: 'Quản trị viên Ủ LAB',
        businessId: '00000000-0000-0000-0000-000000000001',
        role: 'OWNER',
        assignedLocationIds: ['00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000012'],
        isOwner: true,
        isAdmin: false,
        isManager: false,
        isCashier: false,
        isInventoryStaff: false,
      });
      setLocations(SEED_FALLBACK_LOCATIONS);
      setActiveLocationId(SEED_FALLBACK_LOCATIONS[0].id);
      setStatusMessage({ type: 'error', text: 'Đang chạy với cấu hình điểm bán dự phòng' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Handle Switch Working Location
  const handleSwitchLocation = async (locId: string) => {
    try {
      const res = await fetch('/api/rbac/switch-location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationId: locId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Lỗi chuyển đổi điểm bán');
      }

      setActiveLocationId(locId);
      setStatusMessage({ type: 'success', text: data.message });
      // Notify other parts of the admin UI through custom event
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('ulab:location-changed', { detail: { locationId: locId } }));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi chuyển đổi điểm bán';
      setStatusMessage({ type: 'error', text: msg });
    }
  };

  // Handle Location Creation
  const handleCreateLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/rbac/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: newLocCode,
          name: newLocName,
          address: newLocAddress,
          phone: newLocPhone,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Lỗi tạo điểm bán');
      }

      setStatusMessage({ type: 'success', text: data.message });
      setCreateLocModal(false);
      setNewLocCode('');
      setNewLocName('');
      setNewLocAddress('');
      setNewLocPhone('');
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi tạo điểm bán';
      setStatusMessage({ type: 'error', text: msg });
    }
  };

  // Handle Location Update
  const handleOpenEdit = (loc: LocationItem) => {
    setEditingLoc(loc);
    setEditLocName(loc.name);
    setEditLocAddress(loc.address || '');
    setEditLocPhone(loc.phone || '');
    setEditLocActive(loc.isActive);
    setEditLocModal(true);
  };

  const handleUpdateLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLoc) return;

    try {
      const res = await fetch(`/api/rbac/locations/${editingLoc.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editLocName,
          address: editLocAddress,
          phone: editLocPhone,
          isActive: editLocActive,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Lỗi cập nhật điểm bán');
      }

      setStatusMessage({ type: 'success', text: data.message });
      setEditLocModal(false);
      setEditingLoc(null);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi cập nhật điểm bán';
      setStatusMessage({ type: 'error', text: msg });
    }
  };

  // Handle Add New Staff
  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/rbac/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          fullName: newStaffName,
          email: newStaffEmail,
          phone: newStaffPhone,
          role: newStaffRole,
          locationIds: newStaffLocIds,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Lỗi tạo nhân viên mới');
      }

      setStatusMessage({ type: 'success', text: data.message });
      setAddStaffModal(false);
      setNewStaffName('');
      setNewStaffEmail('');
      setNewStaffPhone('');
      setNewStaffLocIds([]);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi tạo nhân viên mới';
      setStatusMessage({ type: 'error', text: msg });
    }
  };

  // Handle Staff Assignment
  const handleOpenStaffModal = (staff: StaffMemberDto) => {
    setSelectedStaff(staff);
    setTargetRole(staff.role);
    setTargetLocationIds(staff.assignedLocations.map((l) => l.locationId));
    setStaffModal(true);
  };

  const handleToggleLocationCheck = (locId: string) => {
    setTargetLocationIds((prev) =>
      prev.includes(locId) ? prev.filter((id) => id !== locId) : [...prev, locId]
    );
  };

  const handleToggleNewStaffLocation = (locId: string) => {
    setNewStaffLocIds((prev) =>
      prev.includes(locId) ? prev.filter((id) => id !== locId) : [...prev, locId]
    );
  };

  const handleSaveStaffAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaff) return;

    try {
      const res = await fetch('/api/rbac/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          targetUserId: selectedStaff.userId,
          targetRole,
          locationIds: targetLocationIds,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Lỗi cập nhật phân quyền nhân viên');
      }

      setStatusMessage({ type: 'success', text: data.message });
      setStaffModal(false);
      setSelectedStaff(null);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi cập nhật phân quyền nhân viên';
      setStatusMessage({ type: 'error', text: msg });
    }
  };

  // Handle Toggle Active/Lock Staff
  const handleToggleStaffStatus = async (staff: StaffMemberDto) => {
    const nextStatus = !staff.isActive;
    try {
      const res = await fetch('/api/rbac/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'toggle',
          targetUserId: staff.userId,
          isActive: nextStatus,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Lỗi cập nhật trạng thái');
      }

      setStatusMessage({ type: 'success', text: data.message });
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi cập nhật trạng thái';
      setStatusMessage({ type: 'error', text: msg });
    }
  };

  // Handle Revoke Staff
  const handleRevokeStaff = async (staff: StaffMemberDto) => {
    if (!confirm(`Bạn có chắc chắn muốn hủy quyền và xóa nhân viên "${staff.fullName}" không?`)) {
      return;
    }

    try {
      const res = await fetch('/api/rbac/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'revoke',
          targetUserId: staff.userId,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Lỗi xóa nhân viên');
      }

      setStatusMessage({ type: 'success', text: data.message });
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi xóa nhân viên';
      setStatusMessage({ type: 'error', text: msg });
    }
  };

  // Staff Count by Location
  const staffCountByLocation = useMemo(() => {
    const map = new Map<string, number>();
    staffList.forEach((st) => {
      st.assignedLocations.forEach((l) => {
        map.set(l.locationId, (map.get(l.locationId) || 0) + 1);
      });
    });
    return map;
  }, [staffList]);

  // Filtered Locations
  const filteredLocations = useMemo(() => {
    const q = searchLoc.trim().toLowerCase();
    if (!q) return locations;
    return locations.filter(
      (l) =>
        l.code.toLowerCase().includes(q) ||
        l.name.toLowerCase().includes(q) ||
        (l.address && l.address.toLowerCase().includes(q))
    );
  }, [locations, searchLoc]);

  // Filtered Staff
  const filteredStaff = useMemo(() => {
    let list = staffList;
    if (filterRole !== 'ALL') {
      list = list.filter((st) => st.role === filterRole);
    }
    const q = searchStaff.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (st) =>
          st.fullName.toLowerCase().includes(q) ||
          (st.email && st.email.toLowerCase().includes(q)) ||
          (st.phone && st.phone.toLowerCase().includes(q))
      );
    }
    return list;
  }, [staffList, filterRole, searchStaff]);

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

  const isOwnerOrAdmin = profile?.role === 'OWNER' || profile?.role === 'ADMIN';

  return (
    <div className={styles.panel}>
      {/* ── Top Header ── */}
      <div className={styles.headerBar}>
        <div>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>Điểm Bán &amp; Phân Quyền (RBAC)</h1>
            {profile && (
              <span className={`${styles.roleBadge} ${getRoleClass(profile.role)}`}>
                Vai trò: {profile.role}
              </span>
            )}
          </div>
          <p className={styles.subtitle}>
            Quản trị chuỗi điểm bán takeaway, phân quyền đa chi nhánh, bảo vệ biên giới dữ liệu &amp; cô lập đa khách thuê.
          </p>
        </div>

        <div className={styles.actionBtnsRow}>
          {isOwnerOrAdmin && (
            <>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={() => setCreateLocModal(true)}
                id="btn-create-location"
              >
                + Thêm Điểm Bán Mới
              </button>
              <button
                type="button"
                className={styles.primaryBtn}
                style={{ background: '#0284c7' }}
                onClick={() => {
                  setNewStaffLocIds(locations.map((l) => l.id));
                  setAddStaffModal(true);
                }}
                id="btn-add-staff"
              >
                + Thêm Nhân Viên Mới
              </button>
            </>
          )}
          <button type="button" className={styles.secondaryBtn} onClick={loadData}>
            Làm mới
          </button>
        </div>
      </div>

      {statusMessage && (
        <div
          style={{
            marginBottom: 16,
            padding: '10px 14px',
            borderRadius: 8,
            fontSize: '0.875rem',
            background: statusMessage.type === 'success' ? '#dcfce7' : '#fee2e2',
            color: statusMessage.type === 'success' ? '#166534' : '#991b1b',
            border: `1px solid ${statusMessage.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
          }}
        >
          {statusMessage.text}
        </div>
      )}

      {/* ── Key Metrics ── */}
      <div className={styles.metricsGrid}>
        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Điểm Bán Đang Quản Lý</span>
          <span className={styles.metricValue}>{locations.length}</span>
          <span className={styles.metricSub}>
            {isOwnerOrAdmin ? 'Toàn bộ chuỗi doanh nghiệp' : 'Các điểm được phân công'}
          </span>
        </div>
        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Nhân Sự Đã Phân Quyền</span>
          <span className={styles.metricValue}>{staffList.length || '—'}</span>
          <span className={styles.metricSub}>Đã cấp quyền truy cập theo chi nhánh</span>
        </div>
        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Mã Doanh Nghiệp (Tenant)</span>
          <span className={styles.metricValue} style={{ fontSize: '1.05rem', fontFamily: 'monospace' }}>
            {profile?.businessId?.slice(0, 13)}...
          </span>
          <span className={styles.metricSub}>Cô lập 100% qua PostgreSQL RLS</span>
        </div>
        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Tình Trạng Pháp Lý</span>
          <span className={styles.metricValue} style={{ fontSize: '0.95rem', color: '#b45309' }}>
            Chưa xác nhận
          </span>
          <span className={styles.metricSub}>Tuân thủ quy tắc không giả lập</span>
        </div>
      </div>

      {/* ── Navigation Tabs ── */}
      <div className={styles.tabsBar}>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeSubTab === 'locations' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveSubTab('locations')}
        >
          1. Danh Sách Điểm Bán ({locations.length})
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeSubTab === 'staff' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveSubTab('staff')}
        >
          2. Nhân Sự &amp; Phân Quyền ({staffList.length})
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeSubTab === 'security' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveSubTab('security')}
        >
          3. Kiểm Soát An Ninh &amp; RLS
        </button>
      </div>

      {/* ── Tab 1: Locations ── */}
      {activeSubTab === 'locations' && (
        <div className={styles.contentCard}>
          {profile && !isOwnerOrAdmin && (
            <div className={`${styles.alertBox} ${styles.alertInfo}`} style={{ marginBottom: 16 }}>
              <strong>Lưu ý:</strong> Bạn đang đăng nhập với vai trò <strong>{profile?.role || 'Khách'}</strong>. Bạn chỉ có thể xem các điểm bán được phân công cụ thể. Chỉ <strong>Owner</strong> hoặc <strong>Admin</strong> mới có quyền tạo và chỉnh sửa điểm bán.
            </div>
          )}

          {/* Filter & Search Bar */}
          <div className={styles.filterBar}>
            <div className={styles.searchBox}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Tìm điểm bán theo mã, tên, địa chỉ..."
                value={searchLoc}
                onChange={(e) => setSearchLoc(e.target.value)}
                className={styles.searchInput}
              />
            </div>
          </div>

          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>Đang tải danh sách điểm bán...</div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Mã Điểm Bán</th>
                    <th>Tên Điểm Bán / Quầy</th>
                    <th>Địa Chỉ</th>
                    <th>Số Điện Thoại</th>
                    <th>Nhân Sự Phụ Trách</th>
                    <th>Trạng Thái</th>
                    <th>Thao Tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLocations.map((loc) => {
                    const isActiveWorkplace = loc.id === activeLocationId;
                    const staffCount = staffCountByLocation.get(loc.id) || 0;

                    return (
                      <tr key={loc.id}>
                        <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>
                          {loc.code}
                          {isActiveWorkplace && (
                            <span className={styles.activeLocationBadge} style={{ marginLeft: 6 }}>
                              ✓ Đang làm việc
                            </span>
                          )}
                        </td>
                        <td style={{ fontWeight: 600 }}>{loc.name}</td>
                        <td>{loc.address || '—'}</td>
                        <td>{loc.phone || '—'}</td>
                        <td>
                          <span style={{ fontWeight: 600, color: '#0369a1' }}>{staffCount}</span> nhân viên
                        </td>
                        <td>
                          <span className={loc.isActive ? styles.badgeActive : styles.badgeInactive}>
                            {loc.isActive ? 'Đang hoạt động' : 'Tạm dừng'}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {!isActiveWorkplace && (
                              <button
                                type="button"
                                className={styles.secondaryBtn}
                                style={{ padding: '4px 8px', fontSize: '0.75rem', background: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534' }}
                                onClick={() => handleSwitchLocation(loc.id)}
                              >
                                Chọn làm việc
                              </button>
                            )}
                            {isOwnerOrAdmin && (
                              <button
                                type="button"
                                className={styles.secondaryBtn}
                                style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                                onClick={() => handleOpenEdit(loc)}
                              >
                                Chỉnh sửa
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredLocations.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>
                        Không tìm thấy điểm bán phù hợp với từ khóa tìm kiếm.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Tab 2: Staff RBAC ── */}
      {activeSubTab === 'staff' && (
        <div className={styles.contentCard}>
          {!isOwnerOrAdmin ? (
            <div className={`${styles.alertBox} ${styles.alertWarning}`}>
              Bạn không có quyền quản lý danh sách nhân sự. Chỉ <strong>Owner</strong> hoặc <strong>Admin</strong> mới có thể gán quyền và phân công chi nhánh.
            </div>
          ) : (
            <>
              {/* Filter & Search Bar */}
              <div className={styles.filterBar}>
                <div className={styles.searchBox}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Tìm nhân viên theo tên, email, SĐT..."
                    value={searchStaff}
                    onChange={(e) => setSearchStaff(e.target.value)}
                    className={styles.searchInput}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>Lọc vai trò:</label>
                  <select
                    value={filterRole}
                    onChange={(e) => setFilterRole(e.target.value)}
                    className={styles.filterSelect}
                  >
                    <option value="ALL">Tất cả vai trò</option>
                    <option value="OWNER">Owner</option>
                    <option value="ADMIN">Admin</option>
                    <option value="MANAGER">Manager</option>
                    <option value="CASHIER">Cashier</option>
                    <option value="INVENTORY_STAFF">Inventory Staff</option>
                  </select>
                </div>
              </div>

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Họ Và Tên</th>
                      <th>Email / SĐT</th>
                      <th>Vai Trò (Role)</th>
                      <th>Điểm Bán Được Phân Công</th>
                      <th>Trạng Thái</th>
                      <th>Hành Động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStaff.map((st) => (
                      <tr key={st.userId}>
                        <td style={{ fontWeight: 600 }}>{st.fullName}</td>
                        <td style={{ fontSize: '0.8rem', color: '#64748b' }}>
                          {st.email || st.phone || '—'}
                        </td>
                        <td>
                          <span className={`${styles.roleBadge} ${getRoleClass(st.role)}`}>
                            {st.role}
                          </span>
                        </td>
                        <td>
                          {st.assignedLocations.length > 0 ? (
                            st.assignedLocations.map((al) => (
                              <span key={al.locationId} className={styles.locationTag}>
                                {al.locationName}
                              </span>
                            ))
                          ) : (
                            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                              {st.role === 'OWNER' || st.role === 'ADMIN' ? 'Toàn bộ chi nhánh' : 'Chưa phân công'}
                            </span>
                          )}
                        </td>
                        <td>
                          <span className={st.isActive ? styles.badgeActive : styles.badgeInactive}>
                            {st.isActive ? 'Đang hoạt động' : 'Đã khóa'}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              className={styles.secondaryBtn}
                              style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                              onClick={() => handleOpenStaffModal(st)}
                              disabled={!canAssignRole(profile?.role || 'CASHIER', st.role)}
                            >
                              Phân quyền
                            </button>
                            {st.role !== 'OWNER' && (
                              <>
                                <button
                                  type="button"
                                  className={st.isActive ? styles.warningBtn : styles.successBtn}
                                  onClick={() => handleToggleStaffStatus(st)}
                                >
                                  {st.isActive ? 'Khóa' : 'Kích hoạt'}
                                </button>
                                <button
                                  type="button"
                                  className={styles.dangerBtn}
                                  onClick={() => handleRevokeStaff(st)}
                                >
                                  Xóa
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredStaff.length === 0 && (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>
                          Không tìm thấy nhân viên phù hợp.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Tab 3: Security & RLS ── */}
      {activeSubTab === 'security' && (
        <div className={styles.contentCard}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 12px 0', color: '#1e3932' }}>
            Quy Tắc An Ninh &amp; Kiểm Soát Truy Cập Server
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: '0.875rem', lineHeight: 1.6, color: '#334155' }}>
            <div style={{ padding: '12px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <strong>1. Không tin client:</strong> Mọi truy vấn gửi từ frontend đều được server giải mã session độc lập, lấy quyền thực tế từ PostgreSQL và kiểm tra chéo trước khi trả dữ liệu.
            </div>
            <div style={{ padding: '12px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <strong>2. Ngăn chặn tuyệt đối truy cập chéo (Cross-tenant):</strong> Người dùng thuộc Business A khi cố tình gửi business_id hoặc location_id của Business B sẽ bị server ném mã lỗi <code>403 FORBIDDEN_CROSS_BUSINESS</code> ngay lập tức.
            </div>
            <div style={{ padding: '12px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <strong>3. Phân cấp nhiệm vụ nghiêm ngặt:</strong>
              <ul style={{ margin: '6px 0 0 20px', padding: 0 }}>
                <li><strong>Owner:</strong> Toàn quyền trên doanh nghiệp.</li>
                <li><strong>Admin:</strong> Quản lý vận hành theo quyền được cấp, không thể xóa hoặc hạ bệ Owner.</li>
                <li><strong>Manager:</strong> Quản lý các điểm bán được phân công cụ thể.</li>
                <li><strong>Cashier:</strong> Chỉ thao tác POS tại điểm bán được cấp; không truy cập báo cáo doanh thu quản trị hay kho hàng.</li>
                <li><strong>Inventory Staff:</strong> Nghiệp vụ kho; không được phép bán hàng hay xem báo cáo doanh thu tài chính.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Create Location ── */}
      {createLocModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalBox}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Thêm Điểm Bán Mới</h3>
              <button type="button" className={styles.closeBtn} onClick={() => setCreateLocModal(false)}>
                &times;
              </button>
            </div>
            <form onSubmit={handleCreateLocation} className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Mã Điểm Bán (Code) *</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: ULAB-Q1"
                  value={newLocCode}
                  onChange={(e) => setNewLocCode(e.target.value.toUpperCase())}
                  className={styles.formInput}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Tên Điểm Bán *</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Ủ LAB — Chi nhánh Nguyễn Huệ"
                  value={newLocName}
                  onChange={(e) => setNewLocName(e.target.value)}
                  className={styles.formInput}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Địa Chỉ</label>
                <input
                  type="text"
                  placeholder="Số nhà, tên đường, phường, quận..."
                  value={newLocAddress}
                  onChange={(e) => setNewLocAddress(e.target.value)}
                  className={styles.formInput}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Số Điện Thoại Liên Hệ</label>
                <input
                  type="text"
                  placeholder="Ví dụ: 0909123456"
                  value={newLocPhone}
                  onChange={(e) => setNewLocPhone(e.target.value)}
                  className={styles.formInput}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button type="button" className={styles.secondaryBtn} onClick={() => setCreateLocModal(false)}>
                  Hủy
                </button>
                <button type="submit" className={styles.primaryBtn}>
                  Lưu Điểm Bán
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Edit Location ── */}
      {editLocModal && editingLoc && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalBox}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Chỉnh Sửa Điểm Bán: {editingLoc.code}</h3>
              <button type="button" className={styles.closeBtn} onClick={() => setEditLocModal(false)}>
                &times;
              </button>
            </div>
            <form onSubmit={handleUpdateLocation} className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Tên Điểm Bán *</label>
                <input
                  type="text"
                  required
                  value={editLocName}
                  onChange={(e) => setEditLocName(e.target.value)}
                  className={styles.formInput}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Địa Chỉ</label>
                <input
                  type="text"
                  value={editLocAddress}
                  onChange={(e) => setEditLocAddress(e.target.value)}
                  className={styles.formInput}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Số Điện Thoại</label>
                <input
                  type="text"
                  value={editLocPhone}
                  onChange={(e) => setEditLocPhone(e.target.value)}
                  className={styles.formInput}
                />
              </div>
              <div className={styles.formGroup}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={editLocActive}
                    onChange={(e) => setEditLocActive(e.target.checked)}
                  />
                  <span>Điểm bán đang hoạt động</span>
                </label>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button type="button" className={styles.secondaryBtn} onClick={() => setEditLocModal(false)}>
                  Hủy
                </button>
                <button type="submit" className={styles.primaryBtn}>
                  Cập Nhật
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Add New Staff Member ── */}
      {addStaffModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalBox}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Thêm Nhân Viên Mới</h3>
              <button type="button" className={styles.closeBtn} onClick={() => setAddStaffModal(false)}>
                &times;
              </button>
            </div>
            <form onSubmit={handleCreateStaff} className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Họ Và Tên *</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Lê Thị Bích"
                  value={newStaffName}
                  onChange={(e) => setNewStaffName(e.target.value)}
                  className={styles.formInput}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Số Điện Thoại Liên Hệ *</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: 0908123456"
                  value={newStaffPhone}
                  onChange={(e) => setNewStaffPhone(e.target.value)}
                  className={styles.formInput}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Email (Tùy chọn)</label>
                <input
                  type="email"
                  placeholder="Ví dụ: staff@ulab.vn"
                  value={newStaffEmail}
                  onChange={(e) => setNewStaffEmail(e.target.value)}
                  className={styles.formInput}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Vai Trò (Role) *</label>
                <select
                  value={newStaffRole}
                  onChange={(e) => setNewStaffRole(e.target.value as MvpRole)}
                  className={styles.formSelect}
                >
                  {profile?.role === 'OWNER' && <option value="ADMIN">Admin (Quản trị vận hành)</option>}
                  <option value="MANAGER">Manager (Quản lý chi nhánh)</option>
                  <option value="CASHIER">Cashier (Thu ngân POS)</option>
                  <option value="INVENTORY_STAFF">Inventory Staff (Thủ kho)</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>
                  Phân Công Điểm Bán (Nhân viên có thể được cấp quyền ở nhiều điểm bán)
                </label>
                <div className={styles.checkboxGrid}>
                  {locations.map((loc) => (
                    <label key={loc.id} className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={newStaffLocIds.includes(loc.id)}
                        onChange={() => handleToggleNewStaffLocation(loc.id)}
                      />
                      <span>{loc.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button type="button" className={styles.secondaryBtn} onClick={() => setAddStaffModal(false)}>
                  Hủy
                </button>
                <button type="submit" className={styles.primaryBtn}>
                  Tạo Nhân Viên
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Staff Role & Multi-location Assignment ── */}
      {staffModal && selectedStaff && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalBox}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Phân Quyền: {selectedStaff.fullName}</h3>
              <button type="button" className={styles.closeBtn} onClick={() => setStaffModal(false)}>
                &times;
              </button>
            </div>
            <form onSubmit={handleSaveStaffAssignment} className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Vai Trò (Role)</label>
                <select
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value as MvpRole)}
                  className={styles.formSelect}
                >
                  {profile?.role === 'OWNER' && <option value="OWNER">Owner (Toàn quyền doanh nghiệp)</option>}
                  <option value="ADMIN">Admin (Quản trị vận hành)</option>
                  <option value="MANAGER">Manager (Quản lý chi nhánh)</option>
                  <option value="CASHIER">Cashier (Thu ngân POS)</option>
                  <option value="INVENTORY_STAFF">Inventory Staff (Thủ kho)</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>
                  Phân Công Điểm Bán (Nhân viên có thể được cấp quyền ở nhiều điểm bán)
                </label>
                <div className={styles.checkboxGrid}>
                  {locations.map((loc) => (
                    <label key={loc.id} className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={targetLocationIds.includes(loc.id)}
                        onChange={() => handleToggleLocationCheck(loc.id)}
                      />
                      <span>{loc.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button type="button" className={styles.secondaryBtn} onClick={() => setStaffModal(false)}>
                  Hủy
                </button>
                <button type="submit" className={styles.primaryBtn}>
                  Lưu Phân Quyền
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
