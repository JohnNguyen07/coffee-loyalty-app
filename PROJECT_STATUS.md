# Ủ LAB — MVP 01: POS + DOANH THU + KHO + QUẢN TRỊ ĐA ĐIỂM BÁN
**Master Project Status & Implementation Tracking**

---

## 1. Mục tiêu & Phạm vi Hệ thống (MVP 01)
Xây dựng nền tảng vận hành **Ủ LAB Business OS** tinh gọn, đồng nhất cho chuỗi cà phê takeaway, hội tụ vào **4 phân hệ (Module) cốt lõi**:
1. **Module A — POS Bán Hàng, Thực Đơn & Đơn Hàng Đa Kênh** *(Gộp POS tại quầy, Quản lý Thực đơn/Báo hết, Đặt hàng Web & Xử lý đơn giao hàng)*.
2. **Module B — Doanh Thu, Sổ Quỹ Thống Nhất & Quản Lý Ca** *(Báo cáo bán hàng, Sổ cái Quỹ Tiền Cửa Hàng, Mở/Chốt ca & Kiểm đếm mệnh giá)*.
3. **Module C — Quản Lý Kho, Định Giá FIFO, Lô FEFO & Sản Xuất** *(Nguyên vật liệu, Bao bì, Thành phẩm đóng chai, Tự động trừ kho POS & Kiểm kê)*.
4. **Module D — Đa Điểm Bán, Phân Quyền RBAC & Không Gian Quản Trị** *(Gộp Multi-location, 5 vai trò RBAC, RLS & Admin Layout/Navigation thống nhất)*.

---

## 2. Ma trận Tính năng & Trạng thái Chi tiết

### Module A — POS Bán Hàng, Thực Đơn & Đơn Hàng Đa Kênh
*(Hợp nhất từ các module POS, Thực đơn/Báo hết, Định giá sản phẩm chai & Đơn hàng Web/Ship)*

| Tính năng | Trạng thái | Đánh giá hiện trạng |
| :--- | :---: | :--- |
| **Danh mục Thực đơn & Định giá chuẩn** | ✅ Hoàn thành | Đồng bộ bảng giá & size mới trên toàn hệ thống: **Cold Brew** (M 30k–35k / L 35k–40k), **Matcha** (1 size M duy nhất: 40k–45k) và **Cold Brew Chai** (Chanh Vàng 74k / Pure Black 69k); bảo toàn nguyên vẹn lịch sử doanh thu và số lượng đã bán. |
| **Báo hết / Mở bán & Sửa giá tức thì** | ✅ Hoàn thành | Bật/tắt trạng thái còn hàng hoặc cập nhật giá theo size ngay trên `ProductsPanel`, lưu bền vững vào Supabase `menu_items` và đồng bộ tức thì sang POS. |
| **Giỏ hàng POS & Tính tiền Backend** | ✅ Hoàn thành | Tùy chọn size, độ ngọt, đá, topping, ghi chú riêng từng món; backend xác thực lại toàn bộ đơn giá gốc, phụ phí và hạn mức giảm giá theo vai trò. |
| **Mã đơn chuẩn & Chống ghi trùng** | ✅ Hoàn thành | Sinh mã `POS-YYMMDD-XXXX` (tại quầy) và `#CF-XXXX` (đặt web), kèm `idempotency_key` ngăn bấm đúp tạo đơn trùng và lưu snapshot vào `order_items`. |
| **Đặt hàng Web tinh gọn (Pickup & COD)** | ✅ Hoàn thành | Đẩy thẳng đơn vào CSDL qua `/api/orders` với 2 hình thức rõ ràng: **🏪 Lấy tại quán** và **🛵 COD giao tới nhà** (loại bỏ copy-paste Messenger và bước quét QR rườm rà trên web). |
| **Quản lý Đơn hàng (`OrdersPanel`) sạch sẽ** | ✅ Hoàn thành | Tự động bóc tách metadata `[[ULAB_POS_META:...]]`, phân biệt rõ `Khách lẻ tại quầy` với `🧑‍💼 Thu ngân`, bộ lọc đa kênh (`🏪 POS` vs `🌐 Web`). |
| **Tính phí ship & Liên hệ khách 1 chạm** | ✅ Hoàn thành | Hỗ trợ nhập/đổi phí ship trực tiếp trên đơn giao hàng (`total_due` tự cập nhật), tích hợp nút **[💬 Chat Zalo]**, **[✉️ Gửi SMS]** (soạn sẵn tiền nước + ship) và **[📞 Gọi]**. |
| **Thu tiền 1 Tài khoản duy nhất ("Tiền")** | ✅ Hoàn thành | Gộp toàn bộ phương thức Tiền mặt và QR thành một tài khoản duy nhất **💵 Tiền** trên POS, Đơn hàng, Biên nhận in và Sổ quỹ; hủy đơn chuyển `CANCELLED` bắt buộc lý do, lưu audit log, hoàn điểm và hoàn kho. |
| **Tích hợp Tạo & Quản lý Tem QR** | ✅ Hoàn thành | Chuyển đổi nhanh ngay trong `POSPanel` giữa chế độ Bán hàng POS và Tạo Tem QR tích điểm. |

---

### Module B — Doanh Thu, Sổ Quỹ Thống Nhất & Quản Lý Ca
*(Chuẩn hóa theo kiến trúc dòng tiền thống nhất — Quỹ Tiền Cửa Hàng Ủ LAB)*

| Tính năng | Trạng thái | Đánh giá hiện trạng |
| :--- | :---: | :--- |
| **Giao diện 3 Tab nghiệp vụ chuyên biệt** | ✅ Hoàn thành | Tách bạch rõ: `📊 Báo Cáo Doanh Thu & Bán Hàng`, `📒 Sổ Quỹ Thu - Chi`, `🔒 Quản Lý Ca & Két Tiền`. |
| **Thống nhất Quỹ Tiền Cửa Hàng (Ủ LAB)** | ✅ Hoàn thành | Hợp nhất dòng tiền bán hàng và thu - chi vào một tài khoản quỹ cửa hàng duy nhất để đơn giản hóa vận hành và đối soát thực tế tại quầy. |
| **Dashboard chỉ số & Biểu đồ khung giờ** | ✅ Hoàn thành | Theo dõi Doanh thu thuần, Số đơn, AOV, Tiền thực thu, Hoàn hủy; biểu đồ cột doanh thu theo giờ (06:00 – 22:00) nhận diện khung giờ cao điểm (Peak Hours). |
| **Bảng xếp hạng Top đồ uống (Best Sellers)** | ✅ Hoàn thành | Xếp hạng món bán chạy nhất theo doanh thu và số lượng ly/chai bán ra theo từng danh mục. |
| **Sổ Quỹ Thu - Chi & Số dư lũy kế** | ✅ Hoàn thành | Lập Phiếu Thu (`RECEIPT`) & Phiếu Chi (`PAYMENT`) theo danh mục (mua đá, sữa, bao bì, điện nước, ship ngoài...) kèm cột `Running Balance` tự động. |
| **Mở Ca, Kiểm đếm mệnh giá & So khớp két** | ✅ Hoàn thành | Khai báo tiền đầu ca (Opening Float), bảng đếm tờ tiền từ 500.000đ đến 1.000đ, tự động tính chênh lệch Lý thuyết vs Thực đếm (Khớp / Thừa / Thiếu). |
| **Bàn giao ca & In phiếu chốt ca (Z-Report)** | ✅ Hoàn thành | Tách tiền giữ lại két cho ca sau và tiền nộp về chủ quán; hỗ trợ xem và in trực tiếp biên bản chốt ca chuẩn máy in nhiệt 80mm/58mm. |

---

### Module C — Quản Lý Kho, Định Giá FIFO, Lô FEFO & Sản Xuất
*(Kiểm soát chặt nguyên vật liệu, bao bì, thành phẩm đóng chai và giá vốn)*

| Tính năng | Trạng thái | Đánh giá hiện trạng |
| :--- | :---: | :--- |
| **Danh mục 3 loại hàng & Quy đổi đơn vị** | ✅ Hoàn thành | Phân loại `raw_material` (NVL), `packaging` (Bao bì), `finished_good` (Thành phẩm đóng chai) cùng bảng quy đổi `unit_conversions`. |
| **Quản lý Lô vật lý & Hạn sử dụng (FEFO)** | ✅ Hoàn thành | Bảng `inventory_lots` tự động ưu tiên xuất lô có hạn sử dụng gần nhất và chặn tự động xuất các lô đã hết hạn. |
| **Định giá xuất kho FIFO & Cost Layers** | ✅ Hoàn thành | Bảng `inventory_cost_layers` phân bổ giá vốn multi-layer theo thứ tự nhập trước - xuất trước, độc lập với thứ tự lô vật lý FEFO. |
| **Sổ cái biến động kho (Immutable Ledger)** | ✅ Hoàn thành | Bảng `inventory_movements` lưu vết toàn bộ biến động nhập mua, hao hụt, sản xuất, bán hàng POS và điều chỉnh kiểm kê. |
| **Phiếu nhập hàng & Sản xuất đóng chai** | ✅ Hoàn thành | Nhập hàng từ NCC tự tạo lô FEFO + lớp giá FIFO; lệnh sản xuất đóng chai tự động tiêu hao NVL & bao bì, tính giá vốn 1 chai và cộng tồn thành phẩm. |
| **Trừ kho tự động từ POS & Hoàn kho khi hủy** | ✅ Hoàn thành | Bán đồ uống pha tại quầy trừ NVL theo công thức; bán món đóng chai chỉ trừ tồn chai thành phẩm (không trừ NVL lần 2); hủy đơn tự động hoàn kho. |
| **Kiểm kê định kỳ & Cảnh báo tồn kho** | ✅ Hoàn thành | `InventoryPanel` 6 tabs quản lý, lập phiếu kiểm kê thực tế (`inventory_audits`), tự sinh bút toán `ADJUST_AUDIT`, cảnh báo chạm mức tồn tối thiểu & cận date. |

---

### Module D — Đa Điểm Bán, Phân Quyền RBAC & Không Gian Quản Trị
*(Hợp nhất từ Business/Locations RBAC & Unified Admin Layout/Navigation)*

| Tính năng | Trạng thái | Đánh giá hiện trạng |
| :--- | :---: | :--- |
| **Kiến trúc Multi-business & Multi-location** | ✅ Hoàn thành | Bảng `businesses`, `locations`, `user_location_assignments` cho phép mở rộng nhiều chi nhánh và phân công nhân sự linh hoạt theo điểm bán. |
| **5 Vai trò RBAC & Bảo vệ Server/RLS** | ✅ Hoàn thành | `OWNER`, `ADMIN`, `MANAGER`, `CASHIER`, `INVENTORY_STAFF`; xác thực chặt tại `server-guard.ts` và PostgreSQL RLS, chặn tuyệt đối truy cập chéo (`403 FORBIDDEN_CROSS_BUSINESS`). |
| **Tự động gán quyền Quản trị viên & Điểm bán** | ✅ Hoàn thành | Đảm bảo tài khoản quản trị (`0947038325`) nhận quyền vận hành chuỗi điểm bán và fallback điểm bán an toàn khi khởi tạo. |
| **Admin Layout, Sidebar 9 Menu & Header** | ✅ Hoàn thành | `AdminSidebar` ẩn/hiện menu theo đúng role (`canAccessMenuTab`); `AdminHeader` tích hợp bộ chuyển chi nhánh thời gian thực qua cookie `ulab_active_location_id`. |
| **Quản trị Nhân sự & Minh bạch Tính năng** | ✅ Hoàn thành | `LocationsRbacPanel` quản lý chi nhánh & tài khoản nhân viên; `UnimplementedPanel` hiển thị lộ trình minh bạch cho Hóa đơn điện tử (không dùng dữ liệu giả). |

---

## 3. Lộ trình Migrations & Kiểm thử Hệ thống
- [x] **Database Migrations (`0001` → `0010`)**: Đã thiết lập đầy đủ 10 phiên bản migration chuẩn hóa trong `coffee-app/database/migrations/` (POS foundation, Revenue reconciliation, Inventory foundation/ledger/FIFO/recipes/audits/POS integration, Multi-location RBAC, Cashbook & Shifts).
- [x] **Unit Tests & Chất lượng Mã nguồn**: Toàn bộ 49/49 bài kiểm thử domain (`pos`, `revenue`, `inventory`, `rbac`) đạt 100% pass, TypeScript `0 error`, ESLint `0 error`.
