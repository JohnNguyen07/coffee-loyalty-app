# Ủ LAB BUSINESS OS — TECHNICAL DECISIONS (ADR)

## ADR-001: Giữ tương thích với codebase `coffee-app` và nâng cấp qua Versioned Migrations
- **Bối cảnh**: Dự án đã có sẵn ứng dụng `coffee-app` đang hoạt động (Menu, Loyalty 4 hạng, QR tích điểm, Đặt hàng Web).
- **Quyết định**:
  - Giữ nguyên các bảng và luồng hiện có.
  - Bổ sung thư mục `coffee-app/database/migrations/` để quản lý các thay đổi schema có phiên bản (`0001_m01_pos_foundation.sql`).
  - Thiết kế tầng Repository (`src/lib/pos/repository.ts`) có khả năng hoạt động ngay trên database hiện tại và tự động tận dụng các cột mở rộng (`business_id`, `location_id`, `discount_amount`, `payment_method`, `item_options`, `order_audit_logs`) ngay khi migration được chạy.

## ADR-002: Kiến trúc Module A — POS Bán Hàng tại quầy
- **Bối cảnh**: Nhân viên quầy cần tạo đơn nhanh, chọn size/tùy chọn (độ ngọt, đá, topping, ghi chú), áp dụng giảm giá theo quyền, thu tiền, in phiếu pha chế & biên nhận, tra cứu và hủy đơn mà không cần can thiệp thủ công vào Supabase.
- **Quyết định**:
  - **Tách tầng**: Toàn bộ tính toán tiền, kiểm tra hạn mức giảm giá theo vai trò (`CASHIER` tối đa 10% hoặc 20.000đ; `MANAGER`/`ADMIN` tối đa 100% kèm lý do bắt buộc), kiểm tra thanh toán và quyền hủy đơn được đặt tại `src/lib/pos/domain.ts` và xác thực lại ở server (`POST /api/pos/orders`, `POST /api/pos/orders/[id]/cancel`).
  - **Mã đơn tự động**: Sinh mã đơn chuẩn `POS-YYMMDD-XXXX` (độ dài ≤ 16 ký tự, tương thích cột `VARCHAR(20)` của `orders.order_code`).
  - **Chống ghi trùng**: Mỗi phiên thanh toán trên POS kèm `idempotency_key` để đảm bảo bấm đúp không tạo 2 đơn trùng.
  - **Không xóa cứng đơn hàng**: Hủy đơn chuyển trạng thái sang `CANCELLED`, bắt buộc nhập lý do hủy, ghi nhận người hủy và hoàn trả điểm thưởng thành viên (nếu đơn có dùng điểm).
  - **Giữ tính năng Tạo Tem QR**: Tích hợp chế độ chuyển đổi nhanh ngay trong `POSPanel` giữa **Bán hàng tại quầy (POS)** và **Tạo & Quản lý Tem QR** để không làm mất tính năng hiện hữu.

## ADR-003: Xác lập phạm vi MVP 01 (POS + Doanh thu + Kho) và Kiến trúc Module Kho
- **Bối cảnh**: Thay đổi chiến lược sản phẩm: Tập trung vào 3 trụ cột sống còn của quán cà phê takeaway: POS Bán hàng, Doanh thu tại chỗ và Quản lý Kho nguyên liệu. Tạm hoãn CRM, Voucher, Loyalty và Kê khai thuế.
- **Quyết định**:
  - **Quy tắc xuất kho**: Không tự động trừ kho theo công thức pha chế trong MVP 01. Chuẩn bị sẵn trường quan hệ và loại biến động `OUT_RECIPE` để kết nối khi module công thức được thống nhất sau.
  - **Cơ chế tồn kho**: Quản lý tồn kho dựa trên Sổ cái biến động kho (`inventory_movements`), hỗ trợ:
    - Nhập hàng (`IN_PURCHASE`) kèm phiếu nhập có nhà cung cấp, giá vốn và tổng tiền.
    - Hao hụt/Hỏng hóc (`OUT_LOSS`) kèm lý do giải trình.
    - Điều chỉnh kiểm kê (`ADJUST_AUDIT`) tự động bù trừ khi chốt phiếu kiểm kê thực tế.
  - **Đơn vị tiền tệ & định lượng**: Tiền lưu `BIGINT` VND; Định lượng nguyên liệu lưu `DECIMAL(12, 3)` (chính xác đến 0.001 g hoặc 0.001 ml) để đảm bảo không sai số tích lũy khi mở rộng sang công thức.
