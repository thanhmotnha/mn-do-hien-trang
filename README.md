# Đo hiện trạng · Một Nhà

Trang web cho **thợ đo dùng điện thoại**: đăng nhập tài khoản riêng → tạo công trình → phòng → gõ số tường / cửa / cột / dầm / điện – nước → chụp ảnh từng mặt rồi kẻ số đo lên ảnh. Mất mạng vẫn đo, chụp được (nháp nằm trong máy), có mạng lại thì tự gửi.

Phòng đo xong **tự hiện ở máy vẽ**: tiện ích *Một Nhà · Vẽ tủ vào Chenfeng* (kho `mn-chenfeng`, từ bản 1.24) → thẻ **Phòng** → khối **Phòng đã đo trên điện thoại** → dán *chuỗi kết nối* (quản lý cấp ở trang này: **Mã kết nối máy vẽ → Cấp mã → Chép mã**) → **Nối máy chủ**.

Triển khai trên máy chủ ERP: xem **[HUONG-DAN-TRIEN-KHAI.md](HUONG-DAN-TRIEN-KHAI.md)**.

## Thợ dùng thế nào

1. Mở `https://do.motnha.vn` → đăng nhập (lần đầu đổi mật khẩu tạm) → *Thêm vào màn hình chính*.
2. **+ Công trình mới** → **+ Phòng mới** (Chữ nhật / Chữ L / Tự thêm tường, cao trần).
3. Đứng trong phòng, quay mặt vào **tường A** — tường B ở bên phải tay, đi vòng theo chiều kim đồng hồ; mọi “cách” đo từ góc TRÁI của tường (bật *Đo từ góc phải* khi đo từ góc kia).
4. Mỗi thẻ tường: **Dài** (để trống = máy tự suy, tối đa 2 tường không song song), **Góc cuối** (Vuông / Lồi / Khác…), **+ Cửa**, **+ Cột / dầm / hộp**, **+ Điện – nước**, **📷 Chụp mặt này**.
5. Kẻ số lên ảnh: *Kích thước* (kéo một đường → chọn số đo của phòng — sửa số trong phòng thì ảnh tự đổi), *Ghi chú* (kéo = mũi tên + chữ), *Chữ*; hai ngón để phóng / kéo.
6. Dòng đỏ = máy vẽ chưa vẽ được (thiếu gì); dòng xám = chi tiết chưa đủ số (chưa đưa sang máy vẽ). Bấm **Đo xong phòng này** khi xong.

Thanh dưới cùng: *✓ Đã gửi 10:42* / *● 3 thay đổi chờ gửi — đang mất mạng* / *↑ Đang gửi ảnh 2/5*.

## Kỹ thuật

- Node ≥ 22.13, **không thư viện chạy nào** (`node:http`, `node:sqlite`, `crypto.scrypt`). Ảnh lưu tệp trong volume (`/data/anh/<công trình>/<ảnh>.jpg`), CSDL `/data/do.sqlite`, sao lưu hằng ngày `/data/sao-luu/`.
- Vì sao `node:sqlite` mà không better-sqlite3: có sẵn trong Node 22, khỏi dựng mã máy (Alpine cần python / make / g++, dễ hỏng khi đổi bản Node). API còn "experimental" nên mọi truy vấn đi qua một tệp `lib/csdl.js` — đổi thì chỉ sửa tệp đó.
- Gói `gui` cho máy vẽ tính bằng `lib/goi.js` (hàm thuần, chạy cả trên điện thoại để xem trước) + `vendor/mncf-phong.js` (bản chép đúng `src/mncf-phong.js` của mn-chenfeng, nguồn ở `vendor/mncf-phong.nguon.json`). Máy chủ luôn tính lại khi lưu. Cập nhật bản chép: `node scripts/lay-mncf-phong.js /đường/dẫn/mn-chenfeng`.
- Hợp đồng với máy vẽ: `GET /api/do/phong`, `GET /api/do/anh/<id>` bằng `Authorization: Bearer mn-…`, CORS chỉ `https://cfcad.cn` / `https://*.cfcad.cn`, không cookie.

## Phép thử

```bash
npm test                    # hàm thuần, hợp đồng với máy vẽ (nạp mn-chenfeng thật: MNCF_PHONG=…/src/mncf-phong.js), quyền, CORS
NODE_PATH=/opt/node22/lib/node_modules PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node test/e2e/do.e2e.js   # luồng đo 390 px
```
