# Ủ LAB — MVP 01: POS + DOANH THU + KHO
**Master Project Status & Implementation Tracking**

---

## 1. Mục tiêu & Phạm vi MVP 01
Xây dựng phiên bản MVP đầu tiên hoàn chỉnh, tinh gọn cho chuỗi cà phê takeaway Ủ LAB theo đúng thứ tự ưu tiên:
1. **Bán hàng tại quầy bằng POS (Module A)**.
2. **Ghi nhận đơn hàng và thanh toán (Module A & B)**.
3. **Theo dõi doanh thu theo ngày và phương thức thanh toán (Module B)**.
4. **Quản lý nguyên liệu, nhập hàng, tồn kho và hao hụt (Module C)**.
5. **Định giá xuất kho FIFO & Ưu tiên lô FEFO (Module C)**.
6. **Sản xuất đóng chai đơn giản & Kết nối trừ kho tự động tại POS (Module C & A)**.
7. **Business, Locations & Role-Based Access Control (Module D)**.
8. **Admin Layout & Navigation Thống Nhất (Module E)**.
9. **Quản lý Thực Đơn, Báo Hết & Đồng Bộ POS Thời Gian Thực (Module F)**.

---

## 2. Ma trận Tính năng & Trạng thái Chi tiết

### Module A — POS Bán Hàng Tại Quầy
| Tính năng | Trạng thái | Đánh giá hiện trạng |
| :--- | :---: | :--- |
| Danh mục đồ uống theo menu | ✅ Hoàn thành | Phân loại Cold brew, Matcha, Pha máy, Đóng chai. |
| Sản phẩm, size và giá bán | ✅ Hoàn thành | Tùy chọn size M/L/Chai, độ ngọt, đá, topping và giá bán đồng bộ. |
| Giỏ hàng, số lượng, ghi chú | ✅ Hoàn thành | Tăng/giảm số lượng, xóa món, thêm ghi chú riêng từng ly. |
| Tính tổng tiền ở backend | ✅ Hoàn thành | Backend xác thực lại toàn bộ giá gốc và phụ phí từ menu server. |
| Thanh toán tiền mặt / Chuyển khoản | ✅ Hoàn thành | Tính tiền khách đưa, tiền thừa thối lại, tích hợp mã QR chuyển khoản. |
| Tạo mã đơn duy nhất | ✅ Hoàn thành | Sinh mã chuẩn `POS-YYMMDD-XXXX` kèm `idempotency_key` chống tạo trùng. |
| Lưu snapshot tại thời điểm bán | ✅ Hoàn thành | Lưu snapshot món, size, số lượng, đơn giá tại thời điểm bán vào `order_items`. |
| Tra cứu & Hủy đơn theo quyền | ✅ Hoàn thành | Chuyển `CANCELLED`, yêu cầu lý do hủy, ghi nhận audit log và hoàn điểm. |
| Bảng `payments` độc lập | ✅ Hoàn thành | Đã tách riêng bảng `payments` chuẩn hóa hạch toán thanh toán. |
| Tích hợp trừ kho tự động | ✅ Hoàn thành | Bán pha quầy trừ công thức; bán chai chỉ trừ tồn chai, không trừ NVL lần 2. |
| Nhận diện món báo hết | ✅ Hoàn thành | Hiển thị tag [Hết hàng], vô hiệu hóa nút chọn size, chặn thêm vào giỏ hàng. |

---

### Module B — Doanh Thu & Sổ Quỹ
| Tính năng | Trạng thái | Đánh giá hiện trạng |
| :--- | :---: | :--- |
| Dashboard doanh thu ngày | ✅ Hoàn thành | 4 thẻ chỉ số: Doanh thu đơn đã thanh toán, Số đơn, Tiền mặt thực tế, Chuyển khoản. |
| Số đơn và giá trị trung bình (AOV) | ✅ Hoàn thành | Tự động tính AOV = Doanh thu thuần / Số đơn CONFIRMED. |
| Tổng tiền theo phương thức thanh toán | ✅ Hoàn thành | Phân định tiền mặt, chuyển khoản ngân hàng và ví điện tử. |
| Theo dõi hoàn tiền & hủy đơn riêng biệt | ✅ Hoàn thành | Tách bạch: Doanh thu đơn hàng (Net Sales), Tiền đã thu, Tiền hoàn trả đơn hủy. |
| Mở ca, đóng ca, tiền đầu/cuối ca, chênh lệch két | ✅ Hoàn thành | Đã có bảng `cash_drawer_sessions` lưu vết kiểm đếm và phân loại thừa/thiếu/khớp. |
| Lọc theo ngày và điểm bán | ✅ Hoàn thành | Bộ lọc ngày hôm nay, hôm qua, 7 ngày, tháng này, tùy chọn ngày gắn `location_id`. |

---

### Module C — Quản Lý Kho, FIFO Costing, FEFO & Sản Xuất
| Tính năng | Trạng thái | Đánh giá hiện trạng |
| :--- | :---: | :--- |
| Danh mục 3 loại hàng & Đơn vị tính | ✅ Hoàn thành | `raw_material`, `packaging`, `finished_good`, bảng `unit_conversions`. |
| Quản lý Lô vật lý & Hạn sử dụng (FEFO) | ✅ Hoàn thành | Bảng `inventory_lots`, ưu tiên lô hạn sớm nhất, chặn tự động chọn lô hết hạn. |
| Định giá xuất kho FIFO & Cost Layers | ✅ Hoàn thành | Bảng `inventory_cost_layers`, phân bổ multi-layer, tách biệt độc lập với lô FEFO. |
| Sổ cái biến động kho (Immutable Ledger) | ✅ Hoàn thành | Bảng `inventory_movements` ghi nhận mọi biến động nhập/xuất/sản xuất/bán hàng. |
| Phiếu nhập hàng (Goods Receipt) | ✅ Hoàn thành | Bảng `inventory_receipts` & `inventory_receipt_items`, tạo lô và lớp giá FIFO tự động. |
| Lệnh sản xuất đóng chai đơn giản | ✅ Hoàn thành | Tiêu hao NVL & bao bì theo FEFO/FIFO, tính giá vốn 1 chai, tăng tồn thành phẩm. |
| Kết nối bán hàng tại quầy POS | ✅ Hoàn thành | Trừ NVL pha quầy theo công thức; bán chai chỉ trừ chai; hủy đơn hoàn kho chuẩn. |
| Kiểm kê định kỳ & Hao hụt | ✅ Hoàn thành | Bảng `inventory_audits`, tính chênh lệch thừa/thiếu và tạo bút toán điều chỉnh `ADJUST_AUDIT`. |
| Giao diện Quản lý Kho hoàn chỉnh | ✅ Hoàn thành | `InventoryPanel.tsx`: 4 thẻ chỉ số, 6 tabs quản lý, cảnh báo tồn tối thiểu & cận date. |

---

### Module D — Business, Locations & Role-Based Access Control (RBAC)
| Tính năng | Trạng thái | Đánh giá hiện trạng |
| :--- | :---: | :--- |
| Đa điểm bán trong một business | ✅ Hoàn thành | Bảng `locations` liên kết `business_id`, hỗ trợ mở rộng không giới hạn điểm bán. |
| Nhân viên thuộc nhiều điểm bán | ✅ Hoàn thành | Bảng `user_location_assignments` cho phép 1 nhân viên được cấp quyền ở nhiều điểm bán. |
| 5 Vai trò MVP nghiêm ngặt | ✅ Hoàn thành | `OWNER` (toàn quyền), `ADMIN` (vận hành), `MANAGER` (chi nhánh), `CASHIER` (POS), `INVENTORY_STAFF` (kho). |
| Server-side Authorization Guard | ✅ Hoàn thành | Không tin client, giải mã session, kiểm tra `business_memberships` và assignments tại server. |
| Chặn tuyệt đối Cross-tenant | ✅ Hoàn thành | Truy cập chéo business bị ném lỗi `403 FORBIDDEN_CROSS_BUSINESS`. |
| Bảo vệ RLS trong PostgreSQL | ✅ Hoàn thành | Hàm `rbac_user_has_location_access` và policies trên `businesses`, `locations`, `memberships`. |
| Giao diện Quản trị Điểm bán & Phân quyền | ✅ Hoàn thành | `LocationsRbacPanel.tsx`: Thêm/sửa điểm bán, bảng nhân sự, thêm nhân sự mới, toggle khóa/mở, thu hồi, đổi điểm bán làm việc. |
| Không giả lập tình trạng pháp lý | ✅ Hoàn thành | Hiển thị rõ "Chưa xác nhận" tuân thủ đúng yêu cầu. |

---

### Module E — Admin Layout & Navigation Thống Nhất
| Tính năng | Trạng thái | Đánh giá hiện trạng |
| :--- | :---: | :--- |
| Sidebar 9 Menu Chuẩn | ✅ Hoàn thành | Dashboard, POS, Đơn hàng, Sản phẩm, Khách hàng, Kho, Báo cáo, Hóa đơn, Cài đặt. |
| Phân quyền hiển thị Menu (`canAccessMenuTab`) | ✅ Hoàn thành | Cashier chỉ thấy POS & Đơn hàng; Inventory chỉ thấy Kho & Đơn hàng; Manager thấy vận hành; Owner/Admin thấy 9 menu. |
| Header Quản Trị Đa Năng | ✅ Hoàn thành | Bộ chọn điểm bán (chỉ hiện chi nhánh được cấp quyền), breadcrumbs ngữ cảnh, profile & role badge, đăng xuất. |
| Chuyển điểm bán làm việc tức thì | ✅ Hoàn thành | Cookie `ulab_active_location_id` và sự kiện `ulab:location-changed` đồng bộ toàn app. |
| Trang Chưa Triển Khai Minh Bạch | ✅ Hoàn thành | `UnimplementedPanel.tsx`: Hóa đơn điện tử hiển thị roadmap rõ ràng, không fake mock data. |
| Responsive Layout | ✅ Hoàn thành | Tối ưu trải nghiệm cho laptop, máy tính bảng và điện thoại với mobile hamburger & backdrop. |

---

### Module F — Thực Đơn, Báo Hết & Sửa Giá Bán
| Tính năng | Trạng thái | Đánh giá hiện trạng |
| :--- | :---: | :--- |
| Báo hết / Mở bán lại tức thì | ✅ Hoàn thành | Bật tắt trạng thái còn hàng/hết hàng ngay tại bảng danh sách sản phẩm. |
| Đồng bộ thời gian thực sang POS | ✅ Hoàn thành | Quầy POS tự động nhận diện món hết hàng, khóa nút chọn size, chặn tạo đơn. |
| Lưu trữ Backend & Database bền vững | ✅ Hoàn thành | API `/api/admin/products` lưu vào Supabase `menu_items` và cache server, reload không mất. |
| Sửa giá theo Size và Lưu vĩnh viễn | ✅ Hoàn thành | Modal điều chỉnh giá size M/L/Chai, cập nhật DB và đồng bộ đơn giá sang POS. |
| Giao diện & Toast xác nhận | ✅ Hoàn thành | Huy hiệu xanh `✓ Đang mở bán`, đỏ `✕ Tạm hết hàng`, hiệu ứng làm mờ dòng hết hàng, banner thông báo nổi góc phải. |

---

## 3. Tiến Độ Thực Hiện Các Bước Triển Khai
- [x] **Bước 1: Kiểm tra repository và báo cáo kế hoạch** ✅ (Đã nghiệm thu)
- [x] **Bước 2: Thiết kế database và migration** ✅ (9 file migration `0001` đến `0009`)
- [x] **Bước 3: Xây POS và đơn hàng (Module A)** ✅ (Hoàn thiện snapshot, bảng `payments`, tích hợp kho)
- [x] **Bước 4: Xây thanh toán, ca bán và doanh thu (Module B)** ✅ (Đồng bộ đa phương thức và chốt sổ quỹ)
- [x] **Bước 5: Xây quản lý kho (Module C)** ✅ (FIFO, FEFO, sản xuất đơn giản, kiểm kê, UI InventoryPanel)
- [x] **Bước 6: Xây Business, Locations & RBAC (Module D)** ✅ (5 roles, multi-location, RLS, UI LocationsRbacPanel)
- [x] **Bước 7: Xây Admin Layout, Header & Navigation (Module E)** ✅ (Sidebar 9 menu, Header selector, Breadcrumb, Mobile)
- [x] **Bước 8: Quản lý Sản phẩm, Báo Hết & Đồng bộ POS (Module F)** ✅ (Tồn tại bền vững, CSS chuẩn, POS khóa tức thì)
- [x] **Bước 9: Kiểm thử toàn bộ hệ thống** ✅ (44 unit tests pass 100%, TypeScript 0 error, ESLint 0 error)
