import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  type MvpRole,
  type UserRbacProfile,
  type LocationItem,
  canManageLocations,
  canAssignRole,
  canAssignLocations,
  canOperatePos,
  canManageInventory,
  canViewFinancialRevenue,
  canAccessLocation,
  filterAccessibleLocations,
  validateServerLocationAccess,
  validateCreateLocationInput,
  buildUserRbacProfile,
  canAccessMenuTab,
  validateStaffCreateInput,
  canToggleStaffStatus,
  canRevokeStaff,
} from '../domain';

const BIZ_A = '00000000-0000-0000-0000-000000000001'; // Ủ LAB
const BIZ_B = '00000000-0000-0000-0000-000000000021'; // Doanh nghiệp đối thủ B

const LOC_A1 = '00000000-0000-0000-0000-000000000002'; // Quầy chính
const LOC_A2 = '00000000-0000-0000-0000-000000000012'; // Chi nhánh Quận 1
const LOC_A3 = '00000000-0000-0000-0000-000000000013'; // Chi nhánh Quận 7
const LOC_B1 = '00000000-0000-0000-0000-000000000022'; // Chi nhánh Doanh nghiệp B

const allLocations: LocationItem[] = [
  { id: LOC_A1, businessId: BIZ_A, code: 'ULAB-MAIN', name: 'Ủ LAB — Quầy Chính', isActive: true },
  { id: LOC_A2, businessId: BIZ_A, code: 'ULAB-Q1', name: 'Ủ LAB — Chi nhánh Q1', isActive: true },
  { id: LOC_A3, businessId: BIZ_A, code: 'ULAB-Q7', name: 'Ủ LAB — Chi nhánh Q7', isActive: true },
  { id: LOC_B1, businessId: BIZ_B, code: 'BIZ2-LOC1', name: 'Điểm B — Hoàn Kiếm', isActive: true },
];

describe('Module M04: Business, Locations & Role-Based Access Control (RBAC)', () => {
  // Test 1: Owner tạo và chỉnh sửa điểm bán
  it('1. Owner và Admin có toàn quyền tạo và chỉnh sửa điểm bán', () => {
    assert.strictEqual(canManageLocations('OWNER'), true);
    assert.strictEqual(canManageLocations('ADMIN'), true);

    const valid = validateCreateLocationInput({
      code: 'ulab-q1',
      name: 'Ủ LAB — Chi nhánh Nguyễn Huệ',
    });
    assert.strictEqual(valid.code, 'ULAB-Q1');
    assert.strictEqual(valid.name, 'Ủ LAB — Chi nhánh Nguyễn Huệ');
  });

  // Test 2: Manager, Cashier, Inventory Staff KHÔNG thể tạo hoặc sửa điểm bán
  it('2. Manager, Cashier, Inventory Staff bị từ chối khi tạo hoặc sửa điểm bán (403)', () => {
    assert.strictEqual(canManageLocations('MANAGER'), false);
    assert.strictEqual(canManageLocations('CASHIER'), false);
    assert.strictEqual(canManageLocations('INVENTORY_STAFF'), false);
  });

  // Test 3: Manager chỉ xem điểm được phân công
  it('3. Manager chỉ xem và truy cập các điểm bán được phân công cụ thể', () => {
    const manager: UserRbacProfile = buildUserRbacProfile({
      userId: 'usr-mgr-1',
      fullName: 'Quản lý Nguyễn Văn A',
      businessId: BIZ_A,
      role: 'MANAGER',
      assignedLocationIds: [LOC_A1, LOC_A2], // Chỉ quản lý LOC_A1 và LOC_A2, không có LOC_A3
    });

    // Được truy cập LOC_A1 và LOC_A2
    assert.strictEqual(canAccessLocation(manager, BIZ_A, LOC_A1), true);
    assert.strictEqual(canAccessLocation(manager, BIZ_A, LOC_A2), true);

    // Bị chặn khi truy cập LOC_A3 (không được phân công)
    assert.strictEqual(canAccessLocation(manager, BIZ_A, LOC_A3), false);

    // Danh sách điểm bán trả về cho Manager chỉ gồm LOC_A1 và LOC_A2
    const accessible = filterAccessibleLocations(allLocations, manager);
    assert.strictEqual(accessible.length, 2);
    assert.deepStrictEqual(
      accessible.map((l) => l.id),
      [LOC_A1, LOC_A2]
    );
  });

  // Test 4: Manager truy cập điểm không được phân công bị server ném lỗi
  it('4. Server chặn và ném lỗi khi Manager gửi location_id chưa được cấp quyền', () => {
    const manager: UserRbacProfile = buildUserRbacProfile({
      userId: 'usr-mgr-1',
      fullName: 'Quản lý Nguyễn Văn A',
      businessId: BIZ_A,
      role: 'MANAGER',
      assignedLocationIds: [LOC_A1], // Chỉ được cấp quyền ở LOC_A1
    });

    assert.throws(
      () => {
        validateServerLocationAccess(manager, BIZ_A, LOC_A2); // Cố tình yêu cầu LOC_A2
      },
      (err: unknown) => err instanceof Error && err.message.includes('FORBIDDEN_LOCATION_ACCESS')
    );
  });

  // Test 5: Cashier không thể tự cấp quyền hoặc thay đổi role
  it('5. Cashier không thể tự cấp quyền hoặc gán vai trò (Chống leo thang đặc quyền)', () => {
    const cashierRole: MvpRole = 'CASHIER';

    // Không thể gán bất kỳ role nào
    assert.strictEqual(canAssignRole(cashierRole, 'CASHIER'), false);
    assert.strictEqual(canAssignRole(cashierRole, 'MANAGER'), false);
    assert.strictEqual(canAssignRole(cashierRole, 'ADMIN'), false);
    assert.strictEqual(canAssignRole(cashierRole, 'OWNER'), false);

    // Không thể gán location
    assert.strictEqual(canAssignLocations(cashierRole), false);
  });

  // Test 6: Admin và Owner gán quyền theo phân cấp
  it('6. Phân cấp gán quyền: Owner gán mọi quyền, Admin chỉ gán cấp dưới (không gán Owner/Admin)', () => {
    // Owner toàn quyền
    assert.strictEqual(canAssignRole('OWNER', 'OWNER'), true);
    assert.strictEqual(canAssignRole('OWNER', 'ADMIN'), true);
    assert.strictEqual(canAssignRole('OWNER', 'MANAGER'), true);
    assert.strictEqual(canAssignRole('OWNER', 'CASHIER'), true);
    assert.strictEqual(canAssignRole('OWNER', 'INVENTORY_STAFF'), true);

    // Admin chỉ gán Manager, Cashier, Inventory staff
    assert.strictEqual(canAssignRole('ADMIN', 'MANAGER'), true);
    assert.strictEqual(canAssignRole('ADMIN', 'CASHIER'), true);
    assert.strictEqual(canAssignRole('ADMIN', 'INVENTORY_STAFF'), true);
    assert.strictEqual(canAssignRole('ADMIN', 'ADMIN'), false); // Không tự nâng cấp Admin
    assert.strictEqual(canAssignRole('ADMIN', 'OWNER'), false); // Không thể cướp quyền Owner
  });

  // Test 7: Một nhân viên có thể được cấp quyền ở nhiều locations
  it('7. Một nhân viên có thể được cấp quyền ở nhiều điểm bán cùng lúc', () => {
    const multiLocationCashier: UserRbacProfile = buildUserRbacProfile({
      userId: 'usr-cashier-multi',
      fullName: 'Thu ngân Trực Thay Ca',
      businessId: BIZ_A,
      role: 'CASHIER',
      assignedLocationIds: [LOC_A1, LOC_A2, LOC_A3], // Được cấp quyền cả 3 chi nhánh
    });

    assert.strictEqual(canAccessLocation(multiLocationCashier, BIZ_A, LOC_A1), true);
    assert.strictEqual(canAccessLocation(multiLocationCashier, BIZ_A, LOC_A2), true);
    assert.strictEqual(canAccessLocation(multiLocationCashier, BIZ_A, LOC_A3), true);

    // Danh sách điểm bán truy cập được chứa cả 3
    const accessible = filterAccessibleLocations(allLocations, multiLocationCashier);
    assert.strictEqual(accessible.length, 3);
  });

  // Test 8: Truy cập chéo business bị từ chối tuyệt đối
  it('8. Truy cập chéo business bị từ chối tuyệt đối (Cross-tenant Isolation)', () => {
    const ownerA: UserRbacProfile = buildUserRbacProfile({
      userId: 'usr-owner-a',
      fullName: 'Chủ Doanh Nghiệp A',
      businessId: BIZ_A,
      role: 'OWNER',
      assignedLocationIds: [LOC_A1],
    });

    // Dù là OWNER của BIZ_A, truy cập điểm bán LOC_B1 của BIZ_B vẫn bị từ chối
    assert.strictEqual(canAccessLocation(ownerA, BIZ_B, LOC_B1), false);

    // Server guard ném lỗi khi client gửi businessId của doanh nghiệp khác
    assert.throws(
      () => {
        validateServerLocationAccess(ownerA, BIZ_B, LOC_B1);
      },
      (err: unknown) => err instanceof Error && err.message.includes('FORBIDDEN_CROSS_BUSINESS')
    );
  });

  // Test 9: Không tin business_id hoặc location_id do client gửi
  it('9. Không tin client gửi fake location_id hoặc fake business_id', () => {
    const cashier: UserRbacProfile = buildUserRbacProfile({
      userId: 'usr-cashier-1',
      fullName: 'Thu ngân Chi Nhánh 1',
      businessId: BIZ_A,
      role: 'CASHIER',
      assignedLocationIds: [LOC_A1],
    });

    // 1. Client gửi location_id của chi nhánh khác trong cùng doanh nghiệp -> BỊ CHẶN
    assert.throws(
      () => {
        validateServerLocationAccess(cashier, BIZ_A, LOC_A2);
      },
      (err: unknown) => err instanceof Error && err.message.includes('FORBIDDEN_LOCATION_ACCESS')
    );

    // 2. Client gửi location_id hoàn toàn giả mạo (fake UUID) -> BỊ CHẶN
    assert.throws(
      () => {
        validateServerLocationAccess(cashier, BIZ_A, '00000000-9999-9999-9999-000000000000');
      },
      (err: unknown) => err instanceof Error && err.message.includes('FORBIDDEN_LOCATION_ACCESS')
    );

    // 3. Client gửi location_id hợp lệ được phân công -> THÀNH CÔNG
    const resolved = validateServerLocationAccess(cashier, BIZ_A, LOC_A1);
    assert.strictEqual(resolved.businessId, BIZ_A);
    assert.strictEqual(resolved.locationId, LOC_A1);
  });

  // Test 10: Cashier không thể truy cập dữ liệu quản trị doanh thu hoặc kho
  it('10. Cashier bị chặn khi truy cập dữ liệu quản trị doanh thu hoặc kho hàng (403)', () => {
    assert.strictEqual(canOperatePos('CASHIER'), true);
    assert.strictEqual(canManageInventory('CASHIER'), false);
    assert.strictEqual(canViewFinancialRevenue('CASHIER'), false);
  });

  // Test 11: Inventory Staff chỉ thao tác kho, không thao tác bán hàng POS hay xem doanh thu
  it('11. Inventory Staff chỉ thực hiện nghiệp vụ kho, không được bán hàng POS hay xem doanh thu', () => {
    assert.strictEqual(canManageInventory('INVENTORY_STAFF'), true);
    assert.strictEqual(canOperatePos('INVENTORY_STAFF'), false);
    assert.strictEqual(canViewFinancialRevenue('INVENTORY_STAFF'), false);
  });

  // Test 12: Owner và Admin có toàn quyền trên toàn bộ các điểm bán trong doanh nghiệp
  it('12. Owner và Admin mặc định truy cập được mọi điểm bán trong doanh nghiệp mà không cần gán thủ công', () => {
    const admin: UserRbacProfile = buildUserRbacProfile({
      userId: 'usr-admin-1',
      fullName: 'Admin Tổng Vận Hành',
      businessId: BIZ_A,
      role: 'ADMIN',
      assignedLocationIds: [], // Không cần gán lẻ từng location
    });

    assert.strictEqual(canAccessLocation(admin, BIZ_A, LOC_A1), true);
    assert.strictEqual(canAccessLocation(admin, BIZ_A, LOC_A2), true);
    assert.strictEqual(canAccessLocation(admin, BIZ_A, LOC_A3), true);

    const accessible = filterAccessibleLocations(allLocations, admin);
    // Nhìn thấy đủ 3 điểm bán của BIZ_A, không bị lộ điểm bán của BIZ_B
    assert.strictEqual(accessible.length, 3);
    assert.strictEqual(accessible.some((l) => l.businessId === BIZ_B), false);
  });

  // Test 13: Xác thực input tạo điểm bán (chống mã độc, định dạng chuẩn)
  it('13. Ràng buộc chuẩn hóa dữ liệu khi tạo điểm bán (Validation)', () => {
    // Mã quá ngắn hoặc chứa ký tự đặc biệt không hợp lệ
    assert.throws(() => validateCreateLocationInput({ code: 'A', name: 'Ủ LAB' }));
    assert.throws(() => validateCreateLocationInput({ code: 'ULAB@Q1!', name: 'Ủ LAB' }));
    assert.throws(() => validateCreateLocationInput({ code: 'ULAB-Q1', name: ' ' }));

    const clean = validateCreateLocationInput({
      code: '  ulab_landmark81  ',
      name: '  Ủ LAB Landmark 81  ',
    });
    assert.strictEqual(clean.code, 'ULAB_LANDMARK81');
    assert.strictEqual(clean.name, 'Ủ LAB Landmark 81');
  });

  // Test 14: Phân quyền hiển thị Menu Sidebar (canAccessMenuTab)
  it('14. Phân quyền hiển thị Menu Sidebar nghiêm ngặt theo vai trò', () => {
    // Owner & Admin xem được toàn bộ 9 module
    const tabs = ['dashboard', 'pos', 'orders', 'products', 'customers', 'inventory', 'revenue', 'invoices', 'settings', 'locations', 'loyalty'];
    tabs.forEach((tab) => {
      assert.strictEqual(canAccessMenuTab('OWNER', tab), true);
      assert.strictEqual(canAccessMenuTab('ADMIN', tab), true);
    });

    // Manager xem được nghiệp vụ vận hành, nhưng không được vào Cài đặt / Điểm bán
    assert.strictEqual(canAccessMenuTab('MANAGER', 'dashboard'), true);
    assert.strictEqual(canAccessMenuTab('MANAGER', 'pos'), true);
    assert.strictEqual(canAccessMenuTab('MANAGER', 'orders'), true);
    assert.strictEqual(canAccessMenuTab('MANAGER', 'inventory'), true);
    assert.strictEqual(canAccessMenuTab('MANAGER', 'revenue'), true);
    assert.strictEqual(canAccessMenuTab('MANAGER', 'settings'), false);
    assert.strictEqual(canAccessMenuTab('MANAGER', 'locations'), false);

    // Cashier chỉ được vào POS và Tra cứu Đơn
    assert.strictEqual(canAccessMenuTab('CASHIER', 'pos'), true);
    assert.strictEqual(canAccessMenuTab('CASHIER', 'orders'), true);
    assert.strictEqual(canAccessMenuTab('CASHIER', 'inventory'), false);
    assert.strictEqual(canAccessMenuTab('CASHIER', 'revenue'), false);
    assert.strictEqual(canAccessMenuTab('CASHIER', 'settings'), false);
    assert.strictEqual(canAccessMenuTab('CASHIER', 'dashboard'), false);

    // Inventory staff chỉ được vào Kho và Đơn hàng
    assert.strictEqual(canAccessMenuTab('INVENTORY_STAFF', 'inventory'), true);
    assert.strictEqual(canAccessMenuTab('INVENTORY_STAFF', 'orders'), true);
    assert.strictEqual(canAccessMenuTab('INVENTORY_STAFF', 'pos'), false);
    assert.strictEqual(canAccessMenuTab('INVENTORY_STAFF', 'revenue'), false);
    assert.strictEqual(canAccessMenuTab('INVENTORY_STAFF', 'settings'), false);
  });

  // Test 15: Kiểm tra xác thực thông tin khi tạo nhân viên mới (validateStaffCreateInput)
  it('15. Ràng buộc xác thực thông tin nhân viên mới', () => {
    // Hợp lệ
    assert.doesNotThrow(() => {
      validateStaffCreateInput({
        fullName: 'Nguyễn Văn Pha Chế',
        role: 'CASHIER',
        phone: '0901234567',
        locationIds: [LOC_A1],
      });
    });

    // Tên quá ngắn
    assert.throws(
      () => {
        validateStaffCreateInput({
          fullName: 'A',
          role: 'CASHIER',
          phone: '0901234567',
          locationIds: [LOC_A1],
        });
      },
      (err: unknown) => err instanceof Error && err.message.includes('ít nhất 2 ký tự')
    );

    // Thiếu cả phone và email
    assert.throws(
      () => {
        validateStaffCreateInput({
          fullName: 'Trần Thị Kho',
          role: 'INVENTORY_STAFF',
          locationIds: [LOC_A1],
        });
      },
      (err: unknown) => err instanceof Error && err.message.includes('ít nhất số điện thoại hoặc email')
    );

    // Số điện thoại sai định dạng
    assert.throws(
      () => {
        validateStaffCreateInput({
          fullName: 'Lê Quản Lý',
          role: 'MANAGER',
          phone: 'abcxyz123',
          locationIds: [LOC_A1],
        });
      },
      (err: unknown) => err instanceof Error && err.message.includes('Số điện thoại không đúng định dạng')
    );
  });

  // Test 16: Thẩm quyền khóa tài khoản và thu hồi nhân sự (canToggleStaffStatus & canRevokeStaff)
  it('16. Thẩm quyền khóa/mở và thu hồi tài khoản nhân sự tuân thủ phân cấp', () => {
    // Owner khóa/thu hồi được tất cả
    assert.strictEqual(canToggleStaffStatus('OWNER', 'ADMIN'), true);
    assert.strictEqual(canToggleStaffStatus('OWNER', 'MANAGER'), true);
    assert.strictEqual(canRevokeStaff('OWNER', 'CASHIER'), true);

    // Admin chỉ thao tác với Manager, Cashier, Inventory Staff; không thể khóa Owner hoặc Admin khác
    assert.strictEqual(canToggleStaffStatus('ADMIN', 'MANAGER'), true);
    assert.strictEqual(canToggleStaffStatus('ADMIN', 'CASHIER'), true);
    assert.strictEqual(canToggleStaffStatus('ADMIN', 'ADMIN'), false);
    assert.strictEqual(canRevokeStaff('ADMIN', 'OWNER'), false);

    // Cashier không có thẩm quyền khóa hoặc thu hồi ai
    assert.strictEqual(canToggleStaffStatus('CASHIER', 'CASHIER'), false);
    assert.strictEqual(canRevokeStaff('CASHIER', 'INVENTORY_STAFF'), false);
  });
});
