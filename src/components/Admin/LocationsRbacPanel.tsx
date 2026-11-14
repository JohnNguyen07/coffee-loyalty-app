'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import styles from './LocationsRbacPanel.module.css';
import {
  type MvpRole,
  type UserRbacProfile,
  type BusinessItem,
  type LocationItem,
  type StaffMemberDto,
  type RolePermissionMatrixRow,
  type RbacAuditLogItem,
  canAssignRole,
  canResetStaffPassword,
  getRolePermissionMatrix,
} from '@/lib/rbac/domain';

const SEED_FALLBACK_LOCATIONS: LocationItem[] = [
  {
    id: '00000000-0000-0000-0000-000000000002',
    businessId: '00000000-0000-0000-0000-000000000001',
    code: 'ULAB-MAIN',
    name: 'Ủ LAB — Quầy Chính (Hồ Con Rùa)',
    address: 'Công Trường Quốc Tế, Quận 3, TP. Hồ Chí Minh',
    phone: '0909000001',
    openingHours: '06:30 - 22:00',
    managerName: 'Quản trị viên Ủ LAB',
    defaultOpeningCash: 500000,
    acceptWebOrders: true,
    receiptFooter: 'Cảm ơn quý khách — Hẹn gặp lại tại Ủ LAB Hồ Con Rùa!',
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
    openingHours: '07:00 - 22:30',
    managerName: 'Nguyễn cao Hoàng Minh',
    defaultOpeningCash: 500000,
    acceptWebOrders: true,
    receiptFooter: 'Cảm ơn quý khách — Hẹn gặp lại tại Ủ LAB Nguyễn Huệ!',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

function generateRandomPassword(length = 10): string {
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789@#';
  const array = new Uint32Array(length);
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(array);
  } else {
    for (let i = 0; i < length; i++) {
      array[i] = Math.floor(Math.random() * charset.length);
    }
  }
  return Array.from(array, (val) => charset[val % charset.length]).join('');
}

function getAuditActionLabel(action: string): string {
  switch (action) {
    case 'CREATE_LOCATION':
      return 'Tạo điểm bán';
    case 'UPDATE_LOCATION':
      return 'Sửa điểm bán';
    case 'CREATE_STAFF':
      return 'Thêm nhân sự';
    case 'UPDATE_STAFF':
      return 'Cập nhật nhân sự';
    case 'RESET_STAFF_PASSWORD':
      return 'Đặt lại mật khẩu';
    case 'TOGGLE_STAFF_STATUS':
      return 'Khóa / Mở khóa';
    case 'REVOKE_STAFF':
      return 'Hủy quyền nhân sự';
    case 'UPDATE_BUSINESS_PROFILE':
      return 'Sửa hồ sơ chuỗi';
    case 'SWITCH_LOCATION':
      return 'Chuyển chi nhánh';
    default:
      return action;
  }
}

export default function LocationsRbacPanel() {
  const [activeSubTab, setActiveSubTab] = useState<'locations' | 'staff' | 'business' | 'security'>('locations');
  const [profile, setProfile] = useState<UserRbacProfile | null>(null);
  const [business, setBusiness] = useState<BusinessItem | null>(null);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [staffList, setStaffList] = useState<StaffMemberDto[]>([]);
  const [permissionMatrix, setPermissionMatrix] = useState<RolePermissionMatrixRow[]>(() =>
    getRolePermissionMatrix()
  );
  const [auditLogs, setAuditLogs] = useState<RbacAuditLogItem[]>([]);
  const [activeLocationId, setActiveLocationId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [savingBiz, setSavingBiz] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Search & Filter states
  const [searchLoc, setSearchLoc] = useState('');
  const [filterLocStatus, setFilterLocStatus] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  const [searchStaff, setSearchStaff] = useState('');
  const [filterRole, setFilterRole] = useState<string>('ALL');
  const [filterStaffLocation, setFilterStaffLocation] = useState<string>('ALL');
  const [filterStaffStatus, setFilterStaffStatus] = useState<'ALL' | 'ACTIVE' | 'LOCKED'>('ALL');

  const [auditFilterType, setAuditFilterType] = useState<string>('ALL');
  const [auditSearch, setAuditSearch] = useState('');

  // Business Profile Form states
  const [bizName, setBizName] = useState('');
  const [bizPhone, setBizPhone] = useState('');
  const [bizEmail, setBizEmail] = useState('');
  const [bizAddress, setBizAddress] = useState('');
  const [bizTaxCode, setBizTaxCode] = useState('');
  const [bizReceiptFooter, setBizReceiptFooter] = useState('');

  // Create Location Modal states
  const [createLocModal, setCreateLocModal] = useState(false);
  const [newLocCode, setNewLocCode] = useState('');
  const [newLocName, setNewLocName] = useState('');
  const [newLocAddress, setNewLocAddress] = useState('');
  const [newLocPhone, setNewLocPhone] = useState('');
  const [newLocHours, setNewLocHours] = useState('06:30 - 22:00');
  const [newLocManager, setNewLocManager] = useState('');
  const [newLocCash, setNewLocCash] = useState('500000');
  const [newLocWebOrders, setNewLocWebOrders] = useState(true);
  const [newLocFooter, setNewLocFooter] = useState('');

  // Edit Location Modal states
  const [editLocModal, setEditLocModal] = useState(false);
  const [editingLoc, setEditingLoc] = useState<LocationItem | null>(null);
  const [editLocName, setEditLocName] = useState('');
  const [editLocAddress, setEditLocAddress] = useState('');
  const [editLocPhone, setEditLocPhone] = useState('');
  const [editLocHours, setEditLocHours] = useState('06:30 - 22:00');
  const [editLocManager, setEditLocManager] = useState('');
  const [editLocCash, setEditLocCash] = useState('500000');
  const [editLocWebOrders, setEditLocWebOrders] = useState(true);
  const [editLocFooter, setEditLocFooter] = useState('');
  const [editLocActive, setEditLocActive] = useState(true);

  // Staff Edit & Assignment Modal
  const [staffModal, setStaffModal] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<StaffMemberDto | null>(null);
  const [editStaffName, setEditStaffName] = useState('');
  const [editStaffPhone, setEditStaffPhone] = useState('');
  const [editStaffEmail, setEditStaffEmail] = useState('');
  const [targetRole, setTargetRole] = useState<MvpRole>('CASHIER');
  const [targetLocationIds, setTargetLocationIds] = useState<string[]>([]);

  // Add Staff Modal
  const [addStaffModal, setAddStaffModal] = useState(false);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffPhone, setNewStaffPhone] = useState('');
  const [newStaffPassword, setNewStaffPassword] = useState('');
  const [showNewStaffPass, setShowNewStaffPass] = useState(false);
  const [newStaffRole, setNewStaffRole] = useState<MvpRole>('CASHIER');
  const [newStaffLocIds, setNewStaffLocIds] = useState<string[]>([]);

  // Reset Password Modal
  const [resetPassModal, setResetPassModal] = useState(false);
  const [resetPassTarget, setResetPassTarget] = useState<StaffMemberDto | null>(null);
  const [resetPassValue, setResetPassValue] = useState('');
  const [showResetPass, setShowResetPass] = useState(false);

  const hydrateBusinessForm = useCallback((biz: BusinessItem | null) => {
    if (!biz) return;
    setBizName(biz.name || '');
    setBizPhone(biz.phone || '');
    setBizEmail(biz.email || '');
    setBizAddress(biz.address || '');
    setBizTaxCode(biz.taxCode || '');
    setBizReceiptFooter(biz.defaultReceiptFooter || '');
  }, []);

  // Fetch initial RBAC data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/rbac/profile', { cache: 'no-store' });
      const data = await res.json();

      if (data.success && data.profile) {
        setProfile(data.profile);
        const resolvedLocs: LocationItem[] =
          data.locations && data.locations.length > 0 ? data.locations : SEED_FALLBACK_LOCATIONS;
        setLocations(resolvedLocs);
        const activeId =
          data.activeLocationId || data.profile.assignedLocationIds?.[0] || resolvedLocs[0]?.id || '';
        setActiveLocationId(activeId);

        if (data.business) {
          setBusiness(data.business);
          hydrateBusinessForm(data.business);
        }
        if (Array.isArray(data.permissionMatrix) && data.permissionMatrix.length > 0) {
          setPermissionMatrix(data.permissionMatrix);
        }

        // If Owner or Admin, load staff list & audit logs
        if (data.profile.role === 'OWNER' || data.profile.role === 'ADMIN') {
          const [staffRes, bizRes] = await Promise.all([
            fetch('/api/rbac/staff', { cache: 'no-store' }).catch(() => null),
            fetch('/api/rbac/business?limit=100', { cache: 'no-store' }).catch(() => null),
          ]);

          if (staffRes) {
            const staffData = await staffRes.json().catch(() => null);
            if (staffRes.ok && staffData?.success && staffData.staff) {
              setStaffList(staffData.staff);
            } else if (staffData?.error) {
              setStatusMessage({ type: 'error', text: staffData.error });
            }
          }

          if (bizRes && bizRes.ok) {
            const bizData = await bizRes.json().catch(() => null);
            if (bizData?.business) {
              setBusiness(bizData.business);
              hydrateBusinessForm(bizData.business);
            }
            if (Array.isArray(bizData?.auditLogs)) {
              setAuditLogs(bizData.auditLogs);
            }
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
  }, [hydrateBusinessForm]);

  useEffect(() => {
    const initTimer = window.setTimeout(() => {
      void loadData();
    }, 0);
    const handleLocationChanged = () => {
      void loadData();
    };
    window.addEventListener('ulab:location-changed', handleLocationChanged);
    return () => {
      window.clearTimeout(initTimer);
      window.removeEventListener('ulab:location-changed', handleLocationChanged);
    };
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
      if (typeof window !== 'undefined') {
        localStorage.setItem('ulab_active_location_id', locId);
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
          openingHours: newLocHours,
          managerName: newLocManager,
          defaultOpeningCash: Number(newLocCash || 0),
          acceptWebOrders: newLocWebOrders,
          receiptFooter: newLocFooter,
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
      setNewLocHours('06:30 - 22:00');
      setNewLocManager('');
      setNewLocCash('500000');
      setNewLocWebOrders(true);
      setNewLocFooter('');
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
    setEditLocHours(loc.openingHours || '06:30 - 22:00');
    setEditLocManager(loc.managerName || '');
    setEditLocCash(String(loc.defaultOpeningCash ?? 500000));
    setEditLocWebOrders(loc.acceptWebOrders !== false);
    setEditLocFooter(loc.receiptFooter || '');
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
          openingHours: editLocHours,
          managerName: editLocManager,
          defaultOpeningCash: Number(editLocCash || 0),
          acceptWebOrders: editLocWebOrders,
          receiptFooter: editLocFooter,
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

  // Handle Save Business Profile
  const handleSaveBusinessProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingBiz(true);
      const res = await fetch('/api/rbac/business', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: bizName,
          phone: bizPhone,
          email: bizEmail,
          address: bizAddress,
          taxCode: bizTaxCode,
          defaultReceiptFooter: bizReceiptFooter,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Lỗi cập nhật hồ sơ doanh nghiệp');
      }
      setStatusMessage({ type: 'success', text: data.message });
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi cập nhật hồ sơ doanh nghiệp';
      setStatusMessage({ type: 'error', text: msg });
    } finally {
      setSavingBiz(false);
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
          initialPassword: newStaffPassword || undefined,
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
      setNewStaffPassword('');
      setShowNewStaffPass(false);
      setNewStaffLocIds([]);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi tạo nhân viên mới';
      setStatusMessage({ type: 'error', text: msg });
    }
  };

  // Handle Staff Assignment & Info Edit
  const handleOpenStaffModal = (staff: StaffMemberDto) => {
    setSelectedStaff(staff);
    setEditStaffName(staff.fullName || '');
    setEditStaffPhone(staff.phone || '');
    setEditStaffEmail(staff.email || '');
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
          fullName: editStaffName,
          phone: editStaffPhone,
          email: editStaffEmail,
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

  // Handle Open Reset Password
  const handleOpenResetPassword = (staff: StaffMemberDto) => {
    setResetPassTarget(staff);
    setResetPassValue('');
    setShowResetPass(false);
    setResetPassModal(true);
  };

  const handleResetStaffPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPassTarget) return;

    try {
      const res = await fetch('/api/rbac/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reset_password',
          targetUserId: resetPassTarget.userId,
          newPassword: resetPassValue,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Lỗi đặt lại mật khẩu');
      }

      setStatusMessage({ type: 'success', text: data.message });
      setResetPassModal(false);
      setResetPassTarget(null);
      setResetPassValue('');
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi đặt lại mật khẩu';
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

  // Staff grouped by Location
  const staffByLocation = useMemo(() => {
    const map = new Map<string, StaffMemberDto[]>();
    staffList.forEach((st) => {
      st.assignedLocations.forEach((l) => {
        const current = map.get(l.locationId) || [];
        current.push(st);
        map.set(l.locationId, current);
      });
    });
    return map;
  }, [staffList]);

  // Filtered Locations
  const filteredLocations = useMemo(() => {
    let list = locations;
    if (filterLocStatus === 'ACTIVE') {
      list = list.filter((l) => l.isActive);
    } else if (filterLocStatus === 'INACTIVE') {
      list = list.filter((l) => !l.isActive);
    }

    const q = searchLoc.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (l) =>
        l.code.toLowerCase().includes(q) ||
        l.name.toLowerCase().includes(q) ||
        (l.address && l.address.toLowerCase().includes(q)) ||
        (l.managerName && l.managerName.toLowerCase().includes(q))
    );
  }, [locations, searchLoc, filterLocStatus]);

  // Filtered Staff
  const filteredStaff = useMemo(() => {
    let list = staffList;
    if (filterRole !== 'ALL') {
      list = list.filter((st) => st.role === filterRole);
    }
    if (filterStaffLocation !== 'ALL') {
      list = list.filter(
        (st) =>
          st.role === 'OWNER' ||
          st.role === 'ADMIN' ||
          st.assignedLocations.some((l) => l.locationId === filterStaffLocation)
      );
    }
    if (filterStaffStatus === 'ACTIVE') {
      list = list.filter((st) => st.isActive);
    } else if (filterStaffStatus === 'LOCKED') {
      list = list.filter((st) => !st.isActive);
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
  }, [staffList, filterRole, filterStaffLocation, filterStaffStatus, searchStaff]);

  // Filtered Audit Logs
  const filteredAuditLogs = useMemo(() => {
    let list = auditLogs;
    if (auditFilterType !== 'ALL') {
      list = list.filter((log) => log.targetType === auditFilterType);
    }
    const q = auditSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (log) =>
          log.actorName.toLowerCase().includes(q) ||
          log.summary.toLowerCase().includes(q) ||
          (log.targetName && log.targetName.toLowerCase().includes(q))
      );
    }
    return list;
  }, [auditLogs, auditFilterType, auditSearch]);

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

  const getPermissionBadgeClass = (value: string) => {
    if (value.includes('Không được phép')) return styles.matrixPermNo;
    if (value.includes('Toàn') || value.includes('Mọi vai trò')) return styles.matrixPermYes;
    return styles.matrixPermPartial;
  };

  const isOwnerOrAdmin = profile?.role === 'OWNER' || profile?.role === 'ADMIN';
  const activeLocationCount = locations.filter((l) => l.isActive).length;

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
            Quản trị chuỗi điểm bán takeaway, cấu hình vận hành quầy, phân quyền nhân sự &amp; kiểm toán an ninh đa khách thuê.
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
          <button type="button" className={styles.secondaryBtn} onClick={() => void loadData()}>
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
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            background: statusMessage.type === 'success' ? '#dcfce7' : '#fee2e2',
            color: statusMessage.type === 'success' ? '#166534' : '#991b1b',
            border: `1px solid ${statusMessage.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
          }}
        >
          <span>{statusMessage.text}</span>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, color: 'inherit' }}
            aria-label="Đóng thông báo"
          >
            &times;
          </button>
        </div>
      )}

      {/* ── Key Metrics ── */}
      <div className={styles.metricsGrid}>
        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Điểm Bán Đang Quản Lý</span>
          <span className={styles.metricValue}>
            {activeLocationCount}/{locations.length}
          </span>
          <span className={styles.metricSub}>
            {isOwnerOrAdmin ? 'Đang hoạt động / Tổng chi nhánh' : 'Các điểm được phân công'}
          </span>
        </div>
        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Nhân Sự Đã Phân Quyền</span>
          <span className={styles.metricValue}>{staffList.length || '—'}</span>
          <span className={styles.metricSub}>
            {staffList.filter((s) => s.isActive).length} đang hoạt động
          </span>
        </div>
        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Doanh Nghiệp (Tenant)</span>
          <span className={styles.metricValue} style={{ fontSize: '1.05rem' }}>
            {business?.code || 'ULAB'} · {profile?.businessId?.slice(0, 8)}...
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
          className={`${styles.tabBtn} ${activeSubTab === 'business' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveSubTab('business')}
        >
          3. Hồ Sơ Doanh Nghiệp
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeSubTab === 'security' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveSubTab('security')}
        >
          4. Ma Trận Quyền &amp; Nhật Ký ({auditLogs.length})
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
                placeholder="Tìm điểm bán theo mã, tên, địa chỉ, quản lý..."
                value={searchLoc}
                onChange={(e) => setSearchLoc(e.target.value)}
                className={styles.searchInput}
              />
            </div>

            <div className={styles.filterGroup}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>Trạng thái:</label>
              <select
                value={filterLocStatus}
                onChange={(e) => setFilterLocStatus(e.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE')}
                className={styles.filterSelect}
              >
                <option value="ALL">Tất cả ({locations.length})</option>
                <option value="ACTIVE">Đang hoạt động ({activeLocationCount})</option>
                <option value="INACTIVE">Tạm dừng ({locations.length - activeLocationCount})</option>
              </select>
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
                    <th>Tên &amp; Địa Chỉ</th>
                    <th>Vận Hành &amp; Két Ca</th>
                    <th>Nhân Sự Trực Thuộc</th>
                    <th>Trạng Thái</th>
                    <th>Thao Tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLocations.map((loc) => {
                    const isActiveWorkplace = loc.id === activeLocationId;
                    const assignedStaff = staffByLocation.get(loc.id) || [];

                    return (
                      <tr key={loc.id}>
                        <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>
                          <div>{loc.code}</div>
                          {isActiveWorkplace && (
                            <span className={styles.activeLocationBadge} style={{ marginTop: 4 }}>
                              ✓ Đang làm việc
                            </span>
                          )}
                        </td>
                        <td>
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>{loc.name}</div>
                          <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>
                            {loc.address || 'Chưa cập nhật địa chỉ'}
                          </div>
                          {loc.phone && (
                            <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: 2 }}>
                              SĐT: {loc.phone}
                            </div>
                          )}
                        </td>
                        <td>
                          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1e293b' }}>
                            Giờ mở: {loc.openingHours || '06:30 - 22:00'}
                          </div>
                          <div style={{ fontSize: '0.775rem', color: '#475569', marginTop: 2 }}>
                            Quản lý: {loc.managerName || 'Chưa chỉ định'}
                          </div>
                          <div style={{ fontSize: '0.775rem', color: '#0369a1', marginTop: 2 }}>
                            Đầu ca: {(loc.defaultOpeningCash ?? 500000).toLocaleString('vi-VN')} đ
                          </div>
                          <div style={{ marginTop: 4 }}>
                            <span className={loc.acceptWebOrders !== false ? styles.webBadgeOn : styles.webBadgeOff}>
                              {loc.acceptWebOrders !== false ? 'Nhận đơn Web' : 'Tắt đơn Web'}
                            </span>
                          </div>
                        </td>
                        <td>
                          <div>
                            <span style={{ fontWeight: 700, color: '#0369a1' }}>{assignedStaff.length}</span> nhân viên
                          </div>
                          {assignedStaff.length > 0 && (
                            <div className={styles.staffChipList}>
                              {assignedStaff.slice(0, 4).map((st) => (
                                <span key={st.userId} className={styles.staffChip}>
                                  {st.fullName} ({st.role})
                                </span>
                              ))}
                              {assignedStaff.length > 4 && (
                                <span className={styles.staffChip}>+{assignedStaff.length - 4}</span>
                              )}
                            </div>
                          )}
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
                                style={{ padding: '4px 10px', fontSize: '0.75rem', background: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534' }}
                                onClick={() => void handleSwitchLocation(loc.id)}
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
                                Cấu hình / Sửa
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredLocations.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>
                        Không tìm thấy điểm bán phù hợp với điều kiện lọc.
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
              Bạn không có quyền quản lý danh sách nhân sự. Chỉ <strong>Owner</strong> hoặc <strong>Admin</strong> mới có thể gán quyền, cấp mật khẩu và phân công chi nhánh.
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

                <div className={styles.filterGroup}>
                  <select
                    value={filterRole}
                    onChange={(e) => setFilterRole(e.target.value)}
                    className={styles.filterSelect}
                    aria-label="Lọc theo vai trò"
                  >
                    <option value="ALL">Tất cả vai trò</option>
                    <option value="OWNER">Owner</option>
                    <option value="ADMIN">Admin</option>
                    <option value="MANAGER">Manager</option>
                    <option value="CASHIER">Cashier</option>
                    <option value="INVENTORY_STAFF">Inventory Staff</option>
                  </select>

                  <select
                    value={filterStaffLocation}
                    onChange={(e) => setFilterStaffLocation(e.target.value)}
                    className={styles.filterSelect}
                    aria-label="Lọc theo điểm bán"
                  >
                    <option value="ALL">Tất cả điểm bán</option>
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.code} — {loc.name}
                      </option>
                    ))}
                  </select>

                  <select
                    value={filterStaffStatus}
                    onChange={(e) => setFilterStaffStatus(e.target.value as 'ALL' | 'ACTIVE' | 'LOCKED')}
                    className={styles.filterSelect}
                    aria-label="Lọc theo trạng thái"
                  >
                    <option value="ALL">Mọi trạng thái</option>
                    <option value="ACTIVE">Đang hoạt động</option>
                    <option value="LOCKED">Đã khóa</option>
                  </select>
                </div>
              </div>

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Họ Và Tên</th>
                      <th>SĐT / Email Đăng Nhập</th>
                      <th>Vai Trò (Role)</th>
                      <th>Điểm Bán Được Phân Công</th>
                      <th>Trạng Thái</th>
                      <th>Hành Động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStaff.map((st) => {
                      const canManageTarget = canAssignRole(profile?.role || 'CASHIER', st.role);
                      const canResetTarget = canResetStaffPassword(profile?.role || 'CASHIER', st.role);

                      return (
                        <tr key={st.userId}>
                          <td style={{ fontWeight: 600 }}>{st.fullName}</td>
                          <td style={{ fontSize: '0.8rem', color: '#475569' }}>
                            <div>{st.phone || '—'}</div>
                            {st.email && <div style={{ color: '#64748b' }}>{st.email}</div>}
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
                                style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                                onClick={() => handleOpenStaffModal(st)}
                                disabled={!canManageTarget}
                              >
                                Sửa / Quyền
                              </button>
                              <button
                                type="button"
                                className={styles.infoBtn}
                                onClick={() => handleOpenResetPassword(st)}
                                disabled={!canResetTarget}
                              >
                                Đặt lại MK
                              </button>
                              {st.role !== 'OWNER' && canManageTarget && (
                                <>
                                  <button
                                    type="button"
                                    className={st.isActive ? styles.warningBtn : styles.successBtn}
                                    onClick={() => void handleToggleStaffStatus(st)}
                                  >
                                    {st.isActive ? 'Khóa' : 'Kích hoạt'}
                                  </button>
                                  <button
                                    type="button"
                                    className={styles.dangerBtn}
                                    onClick={() => void handleRevokeStaff(st)}
                                  >
                                    Xóa
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
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

      {/* ── Tab 3: Business Profile ── */}
      {activeSubTab === 'business' && (
        <div className={styles.contentCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <div>
              <h3 className={styles.sectionHeading}>Hồ Sơ Doanh Nghiệp &amp; Cấu Hình Chuỗi</h3>
              <p className={styles.sectionDesc} style={{ marginBottom: 0 }}>
                Thông tin thương hiệu hiển thị trên phiếu in nhiệt, cổng đặt hàng và định danh cô lập đa khách thuê.
              </p>
            </div>
            <span className={styles.badgeActive} style={{ background: '#fef3c7', color: '#92400e' }}>
              Pháp lý / Thuế: Chưa xác nhận
            </span>
          </div>

          <div className={`${styles.alertBox} ${styles.alertWarning}`} style={{ marginBottom: 18 }}>
            <strong>Nguyên tắc minh bạch pháp lý:</strong> Hệ thống lưu trữ thông tin liên hệ và cấu hình vận hành của chuỗi <strong>Ủ LAB</strong>, đồng thời tuyệt đối không giả lập trạng thái đã đăng ký thuế hay kết nối Hóa đơn điện tử khi chưa có cấu hình chính thức.
          </div>

          <form onSubmit={handleSaveBusinessProfile} className={styles.formGrid}>
            <div className={styles.formRow2}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Mã Doanh Nghiệp (Code)</label>
                <input
                  type="text"
                  value={business?.code || 'ULAB'}
                  disabled
                  className={styles.formInput}
                  style={{ background: '#f8fafc', color: '#64748b', fontFamily: 'monospace' }}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Tên Hiển Thị Chuỗi / Doanh Nghiệp *</label>
                <input
                  type="text"
                  required
                  value={bizName}
                  onChange={(e) => setBizName(e.target.value)}
                  disabled={!isOwnerOrAdmin}
                  className={styles.formInput}
                />
              </div>
            </div>

            <div className={styles.formRow2}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Hotline CSKH / Tổng Đài</label>
                <input
                  type="text"
                  placeholder="Ví dụ: 0909000001"
                  value={bizPhone}
                  onChange={(e) => setBizPhone(e.target.value)}
                  disabled={!isOwnerOrAdmin}
                  className={styles.formInput}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Email Liên Hệ Doanh Nghiệp</label>
                <input
                  type="email"
                  placeholder="Ví dụ: hello@ulab.vn"
                  value={bizEmail}
                  onChange={(e) => setBizEmail(e.target.value)}
                  disabled={!isOwnerOrAdmin}
                  className={styles.formInput}
                />
              </div>
            </div>

            <div className={styles.formRow2}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Địa Chỉ Trụ Sở</label>
                <input
                  type="text"
                  placeholder="Số nhà, đường, quận, thành phố..."
                  value={bizAddress}
                  onChange={(e) => setBizAddress(e.target.value)}
                  disabled={!isOwnerOrAdmin}
                  className={styles.formInput}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Mã Số Thuế (Tùy chọn)</label>
                <input
                  type="text"
                  placeholder="Chưa đăng ký / nhập khi có MST thực tế"
                  value={bizTaxCode}
                  onChange={(e) => setBizTaxCode(e.target.value)}
                  disabled={!isOwnerOrAdmin}
                  className={styles.formInput}
                />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Lời Chào Chân Trang Phiếu In Mặc Định (Receipt Footer)</label>
              <textarea
                placeholder="Cảm ơn quý khách — Hẹn gặp lại tại Ủ LAB!"
                value={bizReceiptFooter}
                onChange={(e) => setBizReceiptFooter(e.target.value)}
                disabled={!isOwnerOrAdmin}
                className={styles.formTextarea}
              />
            </div>

            {isOwnerOrAdmin && (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="submit" className={styles.primaryBtn} disabled={savingBiz}>
                  {savingBiz ? 'Đang lưu...' : 'Lưu Hồ Sơ Doanh Nghiệp'}
                </button>
              </div>
            )}
          </form>
        </div>
      )}

      {/* ── Tab 4: Permission Matrix, Audit Logs & Security ── */}
      {activeSubTab === 'security' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Section A: Role Permission Matrix */}
          <div className={styles.contentCard}>
            <h3 className={styles.sectionHeading}>Ma Trận Phân Quyền 5 Vai Trò (Role Permission Matrix)</h3>
            <p className={styles.sectionDesc}>
              Đối chiếu chi tiết thẩm quyền từng vai trò trên 9 nhóm nghiệp vụ. Mọi API backend đều xác thực lại theo ma trận này và chính sách PostgreSQL RLS.
            </p>

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Nhóm Nghiệp Vụ</th>
                    <th>OWNER</th>
                    <th>ADMIN</th>
                    <th>MANAGER</th>
                    <th>CASHIER</th>
                    <th>INVENTORY_STAFF</th>
                  </tr>
                </thead>
                <tbody>
                  {permissionMatrix.map((row) => (
                    <tr key={row.key}>
                      <td>
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>{row.capability}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>{row.description}</div>
                      </td>
                      {(['OWNER', 'ADMIN', 'MANAGER', 'CASHIER', 'INVENTORY_STAFF'] as MvpRole[]).map((roleKey) => (
                        <td key={roleKey}>
                          <span className={getPermissionBadgeClass(row.permissions[roleKey])}>
                            {row.permissions[roleKey]}
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section B: RBAC Audit Logs */}
          <div className={styles.contentCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
              <div>
                <h3 className={styles.sectionHeading} style={{ marginBottom: 4 }}>
                  Nhật Ký Kiểm Toán Phân Quyền (RBAC Audit Trail)
                </h3>
                <p className={styles.sectionDesc} style={{ marginBottom: 0 }}>
                  Ghi nhận tự động mọi thao tác tạo/sửa chi nhánh, cấp tài khoản, đổi mật khẩu, phân quyền và chuyển đổi điểm bán.
                </p>
              </div>
              <button type="button" className={styles.secondaryBtn} onClick={() => void loadData()}>
                Tải lại nhật ký
              </button>
            </div>

            {!isOwnerOrAdmin ? (
              <div className={`${styles.alertBox} ${styles.alertWarning}`}>
                Chỉ <strong>Owner</strong> hoặc <strong>Admin</strong> mới có quyền tra cứu nhật ký kiểm toán an ninh.
              </div>
            ) : (
              <>
                <div className={styles.filterBar}>
                  <div className={styles.searchBox}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                      type="text"
                      placeholder="Tìm theo người thao tác, đối tượng, nội dung..."
                      value={auditSearch}
                      onChange={(e) => setAuditSearch(e.target.value)}
                      className={styles.searchInput}
                    />
                  </div>

                  <div className={styles.filterGroup}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>Nhóm đối tượng:</label>
                    <select
                      value={auditFilterType}
                      onChange={(e) => setAuditFilterType(e.target.value)}
                      className={styles.filterSelect}
                    >
                      <option value="ALL">Tất cả ({auditLogs.length})</option>
                      <option value="LOCATION">Điểm bán</option>
                      <option value="STAFF">Nhân sự &amp; Mật khẩu</option>
                      <option value="BUSINESS">Hồ sơ doanh nghiệp</option>
                    </select>
                  </div>
                </div>

                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Thời Gian</th>
                        <th>Người Thực Hiện</th>
                        <th>Hành Động</th>
                        <th>Đối Tượng</th>
                        <th>Chi Tiết</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAuditLogs.map((log) => (
                        <tr key={log.id}>
                          <td style={{ whiteSpace: 'nowrap', fontSize: '0.78rem', color: '#475569' }}>
                            {new Date(log.createdAt).toLocaleString('vi-VN')}
                          </td>
                          <td>
                            <div style={{ fontWeight: 600 }}>{log.actorName}</div>
                            <span className={`${styles.roleBadge} ${getRoleClass(log.actorRole)}`} style={{ fontSize: '0.68rem', padding: '1px 7px' }}>
                              {log.actorRole}
                            </span>
                          </td>
                          <td>
                            <span className={styles.auditActionBadge}>{getAuditActionLabel(log.action)}</span>
                          </td>
                          <td style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                            {log.targetName || log.targetType}
                          </td>
                          <td style={{ fontSize: '0.82rem', color: '#334155' }}>{log.summary}</td>
                        </tr>
                      ))}
                      {filteredAuditLogs.length === 0 && (
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>
                            Chưa có bản ghi nhật ký nào khớp với bộ lọc.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {/* Section C: Security Invariants */}
          <div className={styles.contentCard}>
            <h3 className={styles.sectionHeading}>Quy Tắc An Ninh &amp; Kiểm Soát Truy Cập Server</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.875rem', lineHeight: 1.6, color: '#334155' }}>
              <div style={{ padding: '12px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <strong>1. Không tin client:</strong> Mọi truy vấn gửi từ frontend đều được server giải mã session độc lập, lấy quyền thực tế từ PostgreSQL và kiểm tra chéo trước khi trả dữ liệu.
              </div>
              <div style={{ padding: '12px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <strong>2. Ngăn chặn tuyệt đối truy cập chéo (Cross-tenant):</strong> Người dùng thuộc Business A khi cố tình gửi <code>business_id</code> hoặc <code>location_id</code> của Business B sẽ bị server từ chối với mã <code>403 FORBIDDEN_CROSS_BUSINESS</code>.
              </div>
              <div style={{ padding: '12px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <strong>3. Bảo vệ thông tin xác thực:</strong> Mật khẩu nhân viên chỉ được đồng bộ thẳng lên Supabase Auth trên server, không bao giờ lưu vào JSON store, nhật ký kiểm toán hay trả về client.
              </div>
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
              <div className={styles.formRow2}>
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
              </div>

              <div className={styles.formRow2}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Số Điện Thoại Quầy</label>
                  <input
                    type="text"
                    placeholder="Ví dụ: 0909123456"
                    value={newLocPhone}
                    onChange={(e) => setNewLocPhone(e.target.value)}
                    className={styles.formInput}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Quản Lý Phụ Trách</label>
                  <input
                    type="text"
                    placeholder="Tên quản lý chi nhánh"
                    value={newLocManager}
                    onChange={(e) => setNewLocManager(e.target.value)}
                    className={styles.formInput}
                  />
                </div>
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

              <div className={styles.formRow2}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Khung Giờ Hoạt Động</label>
                  <input
                    type="text"
                    placeholder="06:30 - 22:00"
                    value={newLocHours}
                    onChange={(e) => setNewLocHours(e.target.value)}
                    className={styles.formInput}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Tiền Đầu Ca Mặc Định (VND)</label>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={newLocCash}
                    onChange={(e) => setNewLocCash(e.target.value)}
                    className={styles.formInput}
                  />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Chân Trang In Bill Riêng (Tùy chọn)</label>
                <input
                  type="text"
                  placeholder="Để trống sẽ dùng lời chào mặc định của chuỗi"
                  value={newLocFooter}
                  onChange={(e) => setNewLocFooter(e.target.value)}
                  className={styles.formInput}
                />
              </div>

              <div className={styles.formGroup}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.85rem' }}>
                  <input
                    type="checkbox"
                    checked={newLocWebOrders}
                    onChange={(e) => setNewLocWebOrders(e.target.checked)}
                  />
                  <span>Cho phép nhận đơn đặt hàng từ Website (Pickup &amp; COD)</span>
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
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
              <h3 className={styles.modalTitle}>Cấu Hình Điểm Bán: {editingLoc.code}</h3>
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

              <div className={styles.formRow2}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Số Điện Thoại Quầy</label>
                  <input
                    type="text"
                    value={editLocPhone}
                    onChange={(e) => setEditLocPhone(e.target.value)}
                    className={styles.formInput}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Quản Lý Phụ Trách</label>
                  <input
                    type="text"
                    value={editLocManager}
                    onChange={(e) => setEditLocManager(e.target.value)}
                    className={styles.formInput}
                  />
                </div>
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

              <div className={styles.formRow2}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Khung Giờ Hoạt Động</label>
                  <input
                    type="text"
                    placeholder="06:30 - 22:00"
                    value={editLocHours}
                    onChange={(e) => setEditLocHours(e.target.value)}
                    className={styles.formInput}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Tiền Đầu Ca Mặc Định (VND)</label>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={editLocCash}
                    onChange={(e) => setEditLocCash(e.target.value)}
                    className={styles.formInput}
                  />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Chân Trang In Bill Riêng</label>
                <input
                  type="text"
                  placeholder="Cảm ơn quý khách..."
                  value={editLocFooter}
                  onChange={(e) => setEditLocFooter(e.target.value)}
                  className={styles.formInput}
                />
              </div>

              <div className={styles.formRow2}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.85rem' }}>
                  <input
                    type="checkbox"
                    checked={editLocWebOrders}
                    onChange={(e) => setEditLocWebOrders(e.target.checked)}
                  />
                  <span>Cho phép nhận đơn Web</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.85rem' }}>
                  <input
                    type="checkbox"
                    checked={editLocActive}
                    onChange={(e) => setEditLocActive(e.target.checked)}
                  />
                  <span>Điểm bán đang hoạt động</span>
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
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

              <div className={styles.formRow2}>
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
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Mật Khẩu Đăng Nhập Khởi Tạo (≥ 6 ký tự)</label>
                <div className={styles.passwordInputRow}>
                  <input
                    type={showNewStaffPass ? 'text' : 'password'}
                    placeholder="Nhập mật khẩu để nhân viên đăng nhập tại /login"
                    value={newStaffPassword}
                    onChange={(e) => setNewStaffPassword(e.target.value)}
                    className={styles.formInput}
                    minLength={newStaffPassword ? 6 : undefined}
                  />
                  <button
                    type="button"
                    className={styles.miniActionBtn}
                    onClick={() => setShowNewStaffPass((prev) => !prev)}
                  >
                    {showNewStaffPass ? 'Ẩn' : 'Hiện'}
                  </button>
                  <button
                    type="button"
                    className={styles.miniActionBtn}
                    onClick={() => {
                      setNewStaffPassword(generateRandomPassword(10));
                      setShowNewStaffPass(true);
                    }}
                  >
                    Tạo ngẫu nhiên
                  </button>
                </div>
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

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
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

      {/* ── Modal: Edit Staff Profile, Role & Multi-location Assignment ── */}
      {staffModal && selectedStaff && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalBox}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Cập Nhật &amp; Phân Quyền: {selectedStaff.fullName}</h3>
              <button type="button" className={styles.closeBtn} onClick={() => setStaffModal(false)}>
                &times;
              </button>
            </div>
            <form onSubmit={handleSaveStaffAssignment} className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Họ Và Tên *</label>
                <input
                  type="text"
                  required
                  value={editStaffName}
                  onChange={(e) => setEditStaffName(e.target.value)}
                  className={styles.formInput}
                />
              </div>

              <div className={styles.formRow2}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Số Điện Thoại</label>
                  <input
                    type="text"
                    value={editStaffPhone}
                    onChange={(e) => setEditStaffPhone(e.target.value)}
                    className={styles.formInput}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Email</label>
                  <input
                    type="email"
                    value={editStaffEmail}
                    onChange={(e) => setEditStaffEmail(e.target.value)}
                    className={styles.formInput}
                  />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Vai Trò (Role)</label>
                <select
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value as MvpRole)}
                  className={styles.formSelect}
                >
                  {profile?.role === 'OWNER' && <option value="OWNER">Owner (Toàn quyền doanh nghiệp)</option>}
                  {(profile?.role === 'OWNER' || selectedStaff.role === 'ADMIN') && (
                    <option value="ADMIN">Admin (Quản trị vận hành)</option>
                  )}
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

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
                <button type="button" className={styles.secondaryBtn} onClick={() => setStaffModal(false)}>
                  Hủy
                </button>
                <button type="submit" className={styles.primaryBtn}>
                  Lưu Thay Đổi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Reset Staff Password ── */}
      {resetPassModal && resetPassTarget && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalBox} style={{ maxWidth: 460 }}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Đặt Lại Mật Khẩu: {resetPassTarget.fullName}</h3>
              <button type="button" className={styles.closeBtn} onClick={() => setResetPassModal(false)}>
                &times;
              </button>
            </div>
            <form onSubmit={handleResetStaffPassword} className={styles.formGrid}>
              <div style={{ fontSize: '0.84rem', color: '#475569' }}>
                Tài khoản đăng nhập: <strong>{resetPassTarget.phone || resetPassTarget.email || resetPassTarget.userId}</strong> ({resetPassTarget.role})
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Mật Khẩu Mới (tối thiểu 6 ký tự) *</label>
                <div className={styles.passwordInputRow}>
                  <input
                    type={showResetPass ? 'text' : 'password'}
                    required
                    minLength={6}
                    placeholder="Nhập mật khẩu mới..."
                    value={resetPassValue}
                    onChange={(e) => setResetPassValue(e.target.value)}
                    className={styles.formInput}
                  />
                  <button
                    type="button"
                    className={styles.miniActionBtn}
                    onClick={() => setShowResetPass((prev) => !prev)}
                  >
                    {showResetPass ? 'Ẩn' : 'Hiện'}
                  </button>
                  <button
                    type="button"
                    className={styles.miniActionBtn}
                    onClick={() => {
                      setResetPassValue(generateRandomPassword(10));
                      setShowResetPass(true);
                    }}
                  >
                    Ngẫu nhiên
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
                <button type="button" className={styles.secondaryBtn} onClick={() => setResetPassModal(false)}>
                  Hủy
                </button>
                <button type="submit" className={styles.primaryBtn}>
                  Xác Nhận Đổi Mật Khẩu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
