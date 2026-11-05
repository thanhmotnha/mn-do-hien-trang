'use strict';
// node server.js — chạy trang "Đo hiện trạng". Cấu hình lấy từ biến môi trường (xem HUONG-DAN-TRIEN-KHAI.md):
//   PORT (3100) · DATA_DIR (/data) · PUBLIC_URL (https://do.motnha.vn) · QUAN_LY_TEN · QUAN_LY_MAT_KHAU_DAU (chỉ dùng lần chạy đầu)
//   ANH_MAX_MB (4) · TIN_CF=1 (lấy IP từ CF-Connecting-IP — chỉ khi cổng chỉ nghe 127.0.0.1 sau Cloudflare Tunnel) · CORS_THEM (cho phép thử)
const { taoMayChu } = require('./lib/may-chu');
const port = Number(process.env.PORT) || 3100, host = process.env.HOST || '0.0.0.0';
const mc = taoMayChu();
mc.san.then(() => mc.listen(port, host)).then(p => console.log(`[mndo] Đo hiện trạng ${require('./lib/may-chu').BAN} — nghe cổng ${p}, địa chỉ ngoài ${mc.cfg.publicUrl}`))
  .catch(e => { console.error('[mndo] không khởi động được:', e.message); process.exit(1); });
const thoi = () => { mc.close().finally(() => process.exit(0)); setTimeout(() => process.exit(0), 5000).unref(); };
process.on('SIGTERM', thoi); process.on('SIGINT', thoi);
