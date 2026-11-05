# mn-do-hien-trang — ghi nhớ cho Claude

Trang "Đo hiện trạng" của Một Nhà Design & Build (anh Thanh). Trả lời bằng tiếng Việt, ngắn. Kho RIÊNG TƯ; chạy trên máy chủ ERP (compose `-p mndo`, cổng 127.0.0.1:3100, volume `mndo_data`) — không đụng container / cổng / DB của ERP.

- HỢP ĐỒNG với máy vẽ (tiện ích mn-chenfeng ≥ 1.24, `src/mncf-phong.js` → `docKetNoi`, `phongDaDo`) phải khớp từng chữ. Sửa `/api/do/*` hoặc `lib/goi.js` thì chạy `test/hop-dong.test.js` (nạp mn-chenfeng THẬT qua `MNCF_PHONG`, không có thì hỏng — không bỏ qua). Không sửa tiện ích từ kho này.
- Gói `gui` = hàm thuần `lib/goi.js` + `vendor/mncf-phong.js` (bản chép, ghi nguồn ở `vendor/mncf-phong.nguon.json`; lấy lại bằng `scripts/lay-mncf-phong.js`). Đổi thuật toán → tăng `GOI_BAN` (máy chủ tính lại mọi phòng khi khởi động). Máy chủ không tin gói điện thoại gửi.
- Chi tiết thiếu số HOẶC nằm trên tường chưa biết dài → `bo`, không vào `gui.phong` (đưa sang là máy vẽ báo thêm "vượt ra ngoài tường" lạc đề). Trần chưa đo → `cao: 0` + lỗi (chuanHoa sẽ tự điền 2700 nếu gửi null).
- Mọi truy vấn SQLite qua `lib/csdl.js`. Không thư viện chạy nào (`dependencies` rỗng) — thêm thư viện phải có lý do.
- Bảo mật: mật khẩu scrypt, phiên `__Host-mndo` (CSDL chỉ giữ sha256), mã máy vẽ chỉ giữ sha256 + hiện một lần, CSRF = SameSite Strict + `X-MNDO: 1` + Origin. Không ghi bí mật vào mã / nhật ký.
- Điện thoại: `public/app.js` một tệp, CSP `script-src 'self'` (không script / onclick nội dòng). Nút ≥ 44 px, chữ ô nhập 16 px, không cuộn ngang ở 390 px (phép thử e2e kiểm mọi màn). Không dùng alert / confirm — xoá = bấm hai lần trong 3 s.
- Phép thử: `npm test`; e2e `NODE_PATH=/opt/node22/lib/node_modules PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node test/e2e/do.e2e.js`. Đừng dùng `node --test test/` (nó chạy cả tro-giup.js và e2e).
- [CĐ] chưa đo / chưa hỏi: tên miền do.motnha.vn, ảnh 2048 px / JPEG 0,82 / 4 MB / 120 ảnh, giữ đã xoá 30 ngày, sao lưu 14 bản, mọi tài khoản xem mọi công trình, không dung sai khép kín, chưa có phòng con (máy vẽ không nhận `con` từ mạng).
