# Hướng Dẫn Cài Đặt & Triển Khai (Supabase + Vercel)
## Hệ Thống Tích Điểm Quán Cafe & Đặt Hàng Web-to-Messenger

Dự án đã được hoàn thiện toàn diện với 2 phân hệ:
1. **Dành cho Khách hàng (Customer)**:
   - Menu thức uống take-away tối ưu trải nghiệm di động (Matcha series, Cold Brew series, Nước đóng lon).
   - Chọn size linh hoạt (M / L / Lon), tùy chỉnh độ ngọt, đá, ghi chú món.
   - Giỏ hàng động với hiệu ứng micro-interaction (nút nảy giỏ hàng, thanh trượt dùng điểm ví).
   - Luồng đặt hàng **Web-to-Messenger**: Tự động định dạng đơn hàng, sao chép vào Clipboard và chuyển tiếp trực tiếp sang Facebook Messenger của quán.
   - Ví điểm thưởng hoàn tiền theo 4 hạng thành viên:
     - 🌱 **Member**: Hoàn 3% (+10.000đ chào mừng)
     - 🥈 **Silver** (≥ 500k): Hoàn 5% (+100.000đ thăng hạng)
     - 🥇 **Gold** (≥ 1.25M): Hoàn 7% (+200.000đ thăng hạng)
     - 💎 **Diamond** (≥ 6M): Hoàn 10% (+45.000đ/tháng)
   - Quét mã QR tem in trên ly nước để tích điểm ngay lập tức.

2. **Dành cho Quản trị viên (Admin)**:
   - **POS Tạo tem in QR**: Bấm 1 chạm theo mức giá đồ uống (28k, 29k, 35k, 38k, 42k, 47k...), xuất tem mã QR chuẩn cho máy in nhiệt (58mm/80mm) kèm link quét thử ngay.
   - **Quản lý Đơn hàng**: Theo dõi trạng thái đơn (Chờ xác nhận, Đã xác nhận, Đã hủy).
   - **Quản lý Khách hàng**: Tra cứu chi tiêu tích lũy, số dư ví điểm, phân hạng thành viên.

---

## 1. Cấu Trúc Mã Nguồn

```
coffee-app/
├── database/
│   └── schema.sql            # Script khởi tạo PostgreSQL (Bảng, Triggers, RPC Tích điểm)
├── src/
│   ├── app/
│   │   ├── page.tsx          # Trang chủ người dùng (Menu + Giỏ hàng)
│   │   ├── admin/            # Phân hệ Admin (POS QR, Đơn hàng, Khách hàng)
│   │   ├── login/            # Đăng nhập Google OAuth & Demo Mode
│   │   ├── scan/             # Giao diện quét mã QR tem in
│   │   └── api/              # API Route Handlers (Auth, Orders, QR, Users)
│   ├── components/           # Components chuẩn thiết kế UI/UX
│   ├── data/menu.ts          # Dữ liệu thực đơn trích xuất từ hình ảnh
│   ├── hooks/useAuth.ts      # Quản lý phiên đăng nhập, ví điểm & thăng hạng
│   ├── store/cart.ts         # Quản lý giỏ hàng Zustand
│   └── lib/supabase/         # Supabase Client, Server & Middleware
├── .env.local.example        # File mẫu biến môi trường
└── vercel.json               # Cấu hình tối ưu Vercel deployment
```

---

## 2. Hướng Dẫn Cài Đặt Supabase (PostgreSQL Database & Auth)

### Bước 2.1: Tạo dự án Supabase
1. Truy cập [https://supabase.com](https://supabase.com) và đăng nhập (hoặc đăng ký miễn phí).
2. Bấm **New project**, chọn tên dự án (ví dụ: `coffee-loyalty`) và đặt Database Password an toàn.
3. Chọn khu vực server gần nhất (ví dụ: `Singapore - ap-southeast-1`).

### Bước 2.2: Chạy Script Database
1. Trong menu bên trái của Supabase Dashboard, chọn **SQL Editor**.
2. Mở file [database/schema.sql](database/schema.sql) trong project, sao chép toàn bộ nội dung và dán vào SQL Editor.
3. Bấm **Run** để thực thi.
   - Lệnh này sẽ tự động tạo các bảng `tiers`, `users`, `qr_tokens`, `point_transactions`, `orders`, `order_items`.
   - Thiết lập các RLS policies, trigger tự động nâng hạng thành viên và function RPC `process_qr_scan` xử lý giao dịch điểm hoàn tiền nguyên tử (ACID).

### Bước 2.3: Kích hoạt Đăng nhập Google OAuth
1. Trong Supabase Dashboard, vào mục **Authentication** -> **Providers**.
2. Chọn **Google** và bật công tắc **Enable Google provider**.
3. Điền **Client ID** và **Client Secret** từ [Google Cloud Console](https://console.cloud.google.com/apis/credentials):
   - Thêm Authorized redirect URIs: `https://<YOUR-PROJECT-REF>.supabase.co/auth/v1/callback`
4. Bấm **Save**.

### Bước 2.4: Lấy API Keys
1. Vào **Project Settings** -> **API**.
2. Sao chép 3 thông số:
   - **Project URL** -> `NEXT_PUBLIC_SUPABASE_URL`
   - **Project API Keys (anon / public)** -> `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **Project API Keys (service_role)** -> `SUPABASE_SERVICE_ROLE_KEY`

---

## 3. Cấu Hình File Môi Trường (.env.local)

Mở file `.env.local` tại thư mục gốc và điền các giá trị:

```env
# Supabase Keys (từ Dashboard)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJh......
SUPABASE_SERVICE_ROLE_KEY=eyJh......

# URL ứng dụng (Local hoặc Vercel Domain)
NEXT_PUBLIC_APP_URL=http://localhost:3000

# ID hoặc Username Trang Facebook của quán để nhận đơn hàng (ID của trang Ủ LAB)
NEXT_PUBLIC_MESSENGER_FANPAGE_ID=61595629718216
```

*(Lưu ý: Nếu chưa cấu hình Supabase, hệ thống sẽ tự động kích hoạt **Chế độ Demo** mượt mà để bạn kiểm thử toàn bộ giao diện).*

---

## 4. Hướng Dẫn Deploy Lên Vercel

### Bước 4.1: Đưa code lên GitHub
1. Khởi tạo Git repository (nếu chưa có):
   ```bash
   git init
   git add .
   git commit -m "feat: coffee loyalty & web-to-messenger ordering system"
   ```
2. Đẩy code lên GitHub repository cá nhân hoặc tổ chức.

### Bước 4.2: Import dự án vào Vercel
1. Truy cập [https://vercel.com](https://vercel.com) và đăng nhập bằng GitHub.
2. Bấm **Add New...** -> **Project** -> Chọn repository vừa tải lên.
3. Framework Preset: **Next.js** (Root Directory: `./`).

### Bước 4.3: Điền Environment Variables trên Vercel
Trong mục **Environment Variables**, thêm 5 biến sau:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`: Tên miền Vercel của bạn (ví dụ: `https://coffee-takeaway.vercel.app`)
- `NEXT_PUBLIC_MESSENGER_FANPAGE_ID`: Tên người dùng Fanpage Messenger của bạn

### Bước 4.4: Deploy & Kiểm tra
1. Bấm **Deploy**. Vercel sẽ tự động build sản phẩm trong khoảng 1 phút.
2. Sau khi deploy thành công, vào **Supabase Dashboard** -> **Authentication** -> **URL Configuration**:
   - Thêm Vercel Domain vào mục **Site URL** và **Redirect URLs** (ví dụ: `https://coffee-takeaway.vercel.app/**`).

---

## 5. Hướng Dẫn Trải Nghiệm & Vận Hành Thực Tế

### Trải nghiệm Luồng Đặt Hàng Web-to-Messenger:
1. Mở trang chủ: Chọn món yêu thích (VD: Matcha Thuần, Matcha Dừa Tươi, Cold Brew SODA...).
2. Bấm nút chọn Size (M/L) -> Thêm vào giỏ.
3. Mở giỏ hàng -> Nhập tên & SĐT nhận món -> Ghi chú (VD: *Ít ngọt, nhiều đá*).
4. Nhập số điểm cần dùng trong ví (nếu muốn giảm giá) -> Bấm **Gửi đơn qua Facebook Messenger**.
5. Đơn hàng lập tức được định dạng đẹp mắt, sao chép vào bộ nhớ tạm và mở hộp chat trực tiếp với Fanpage của quán.

### Trải nghiệm Luồng Tạo & Quét Tem QR Tích Điểm:
1. Vào phân hệ Admin: [http://localhost:3000/admin](http://localhost:3000/admin) -> Tab **POS**.
2. Chọn giá ly nước (ví dụ: `38.000đ`) -> Hệ thống tạo ngay mã QR và tem in nhiệt.
3. Bấm **📷 Quét thử ngay** -> Trình duyệt mở trang quét QR tích điểm.
4. Hệ thống tính toán hoàn tiền chính xác theo hạng (VD: Hạng Silver hoàn 5% = +1.900đ vào ví), hiển thị pháo hoa chúc mừng và tiến trình thăng hạng tiếp theo!
