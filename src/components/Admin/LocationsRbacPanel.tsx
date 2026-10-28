'use client';

import React, { useState, useEffect, useCallback } from 'react';
import styles from './LocationsRbacPanel.module.css';
import {
  type MvpRole,
  type UserRbacProfile,
  type LocationItem,
  type StaffMemberDto,
  canAssignRole,
} from '@/lib/rbac/domain';

export default function LocationsRbacPanel() {
  const [activeSubTab, setActiveSubTab] = useState<'locations' | 'staff' | 'security'>('locations');
  const [profile, setProfile] = useState<UserRbacProfile | null>(null);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [staffList, setStaffList] = useState<StaffMemberDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modal states
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

  // Staff assignment modal
  const [staffModal, setStaffModal] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<StaffMemberDto | null>(null);
  const [targetRole, setTargetRole] = useState<MvpRole>('CASHIER');
  const [targetLocationIds, setTargetLocationIds] = useState<string[]>([]);

  // Fetch initial RBAC data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/rbac/profile');
      const data = await res.json();

      if (data.success) {
        setProfile(data.profile);
        setLocations(data.locations || []);

        // If Owner or Admin, load staff list
        if (data.profile.role === 'OWNER' || data.profile.role === 'ADMIN') {
          const staffRes = await fetch('/api/rbac/staff');
          const staffData = await staffRes.json();
          if (staffData.success) {
            setStaffList(staffData.staff || []);
          }
        }
      } else {
        setStatusMessage({ type: 'error', text: data.error || 'Lỗi tải thông tin phân quyền' });
      }
    } catch {
      setStatusMessage({ type: 'error', text: 'Không thể kết nối máy chủ' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const fetchInitial = async () => {
      try {
        const res = await fetch('/api/rbac/profile');
        const data = await res.json();
        if (!active) return;
        if (data.success) {
          setProfile(data.profile);
          setLocations(data.locations || []);
          if (data.profile.role === 'OWNER' || data.profile.role === 'ADMIN') {
            const staffRes = await fetch('/api/rbac/staff');
            const staffData = await staffRes.json();
            if (active && staffData.success) {
              setStaffList(staffData.staff || []);
            }
          }
        }
      } catch {
        if (active) {
          setStatusMessage({ type: 'error', text: 'Không thể kết nối máy chủ' });
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void fetchInitial();
    return () => {
      active = false;
    };
  }, []);

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
      const msg = err instanceof Error ? err.message : 'Lỗi tạo điểm bán';
      setStatusMessage({ type: 'error', text: msg });
    }
  };

  // Handle Staff Assignment Modal Open
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

  const handleSaveStaffAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaff) return;

    try {
      const res = await fetch('/api/rbac/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
      const msg = err instanceof Error ? err.message : 'Lỗi tạo điểm bán';
      setStatusMessage({ type: 'error', text: msg });
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
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={() => setCreateLocModal(true)}
              id="btn-create-location"
            >
              + Thêm Điểm Bán Mới
            </button>
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
          {!isOwnerOrAdmin && (
            <div className={`${styles.alertBox} ${styles.alertInfo}`} style={{ marginBottom: 16 }}>
              <strong>Lưu ý:</strong> Bạn đang đăng nhập với vai trò <strong>{profile?.role}</strong>. Bạn chỉ có thể xem các điểm bán được phân công cụ thể. Chỉ <strong>Owner</strong> hoặc <strong>Admin</strong> mới có quyền tạo và chỉnh sửa điểm bán.
            </div>
          )}

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
                    <th>Trạng Thái</th>
                    {isOwnerOrAdmin && <th>Thao Tác</th>}
                  </tr>
                </thead>
                <tbody>
                  {locations.map((loc) => (
                    <tr key={loc.id}>
                      <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>{loc.code}</td>
                      <td style={{ fontWeight: 600 }}>{loc.name}</td>
                      <td>{loc.address || '—'}</td>
                      <td>{loc.phone || '—'}</td>
                      <td>
                        <span className={loc.isActive ? styles.badgeActive : styles.badgeInactive}>
                          {loc.isActive ? 'Đang hoạt động' : 'Tạm dừng'}
                        </span>
                      </td>
                      {isOwnerOrAdmin && (
                        <td>
                          <button
                            type="button"
                            className={styles.secondaryBtn}
                            style={{ padding: '4px 10px', fontSize: '0.775rem' }}
                            onClick={() => handleOpenEdit(loc)}
                          >
                            Chỉnh sửa
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
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
              <div style={{ marginBottom: 16, fontSize: '0.875rem', color: '#475569' }}>
                Một nhân viên có thể được cấp quyền ở nhiều điểm bán cùng lúc. Cashier chỉ được thao tác POS tại chi nhánh được cấp.
              </div>

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Họ Và Tên</th>
                      <th>Email / SĐT</th>
                      <th>Vai Trò (Role)</th>
                      <th>Điểm Bán Được Phân Công</th>
                      <th>Hành Động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffList.map((st) => (
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
                          <button
                            type="button"
                            className={styles.secondaryBtn}
                            style={{ padding: '4px 10px', fontSize: '0.775rem' }}
                            onClick={() => handleOpenStaffModal(st)}
                            disabled={!canAssignRole(profile?.role || 'CASHIER', st.role)}
                          >
                            Phân quyền
                          </button>
                        </td>
                      </tr>
                    ))}
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
