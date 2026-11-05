'use strict';
// Trợ giúp chung cho phép thử: mở máy chủ thật ở cổng trống với thư mục tạm, khách có giữ cookie, ảnh giả đúng tiêu đề.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), net = require('node:net');
const { taoMayChu } = require('../lib/may-chu');

const MK_DAU = 'Mat-khau-dau-123', MK_QL = 'Quan-ly-moi-456', MK_THO = 'Tho-do-moi-789';

const congTrong = () => new Promise((ok, hong) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); s.on('error', hong); });

async function moMay(opt = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mndo-')), port = await congTrong();
  const mc = taoMayChu(Object.assign({ dataDir: dir, publicUrl: `http://localhost:${port}`, quanLyTen: 'quanly', quanLyMatKhauDau: MK_DAU, lich: false, corsThem: [] }, opt));
  await mc.san; await mc.listen(port, '127.0.0.1');
  const goc = `http://localhost:${port}`;
  return { mc, dir, port, goc, khach: () => khach(goc), async dong() { await mc.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

/** Khách HTTP giữ cookie phiên như trình duyệt. */
function khach(goc) {
  let cookie = '';
  const k = {
    get cookie() { return cookie; }, set cookie(v) { cookie = v; },
    async goi(method, p, o = {}) {
      const h = Object.assign({}, o.headers || {});
      if (cookie && !o.khongCookie) h.cookie = cookie;
      if (method !== 'GET' && method !== 'HEAD' && !('x-mndo' in h) && !o.khongMndo) h['x-mndo'] = '1';
      let body = o.body;
      if (o.json !== undefined) { body = JSON.stringify(o.json); h['content-type'] = 'application/json'; }
      const r = await fetch(goc + p, { method, headers: h, body, redirect: 'manual' });
      const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
      for (const c of sc) { const m = /^__Host-mndo=([^;]*)/.exec(c); if (m) cookie = m[1] ? `__Host-mndo=${m[1]}` : ''; }
      const buf = Buffer.from(await r.arrayBuffer());
      let j = null; if ((r.headers.get('content-type') || '').includes('json')) { try { j = JSON.parse(buf.toString()); } catch (e) { j = null; } }
      return { st: r.status, h: r.headers, j, b: buf, setCookie: sc };
    },
  };
  return k;
}

/** Quản lý đầu đăng nhập + đổi mật khẩu; trả khách quản lý. */
async function quanLy(M) {
  const q = M.khach();
  let r = await q.goi('POST', '/api/dang-nhap', { json: { ten: 'quanly', mat_khau: MK_DAU } });
  if (r.st !== 200) r = await q.goi('POST', '/api/dang-nhap', { json: { ten: 'quanly', mat_khau: MK_QL } });
  else if (r.j.bat_doi_mk) { const d = await q.goi('POST', '/api/doi-mat-khau', { json: { cu: MK_DAU, moi: MK_QL } }); if (d.st !== 200) throw new Error('đổi mk quản lý: ' + JSON.stringify(d.j)); }
  if (r.st !== 200) throw new Error('quản lý đăng nhập: ' + r.st);
  return q;
}
/** Quản lý tạo thợ, thợ đăng nhập + đổi mật khẩu; trả khách thợ. */
async function thoMoi(M, q, ten = 'tho1', tenHien = 'Thợ Một') {
  const tam = 'Tam-thoi-' + ten + '-1';
  const r = await q.goi('POST', '/api/quan-ly/tai-khoan', { json: { ten, ten_hien: tenHien, vai: 'tho', mat_khau_tam: tam } });
  if (r.st !== 200) throw new Error('tạo thợ: ' + JSON.stringify(r.j));
  const t = M.khach();
  await t.goi('POST', '/api/dang-nhap', { json: { ten, mat_khau: tam } });
  const d = await t.goi('POST', '/api/doi-mat-khau', { json: { cu: tam, moi: MK_THO } });
  if (d.st !== 200) throw new Error('thợ đổi mk: ' + JSON.stringify(d.j));
  t.id = r.j.id;
  return t;
}

/** JPEG "giả" đúng cấu trúc tiêu đề (APP0, APP1 EXIF, COM, DQT, SOF0 w × h, DHT, SOS, dữ liệu, EOI) — máy chủ chỉ đọc tiêu đề, không giải mã. */
function jpegGia(w, h, o = {}) {
  const doan = (m, data) => { const b = Buffer.alloc(4 + data.length); b[0] = 0xff; b[1] = m; b.writeUInt16BE(data.length + 2, 2); data.copy(b, 4); return b; };
  const sof = Buffer.alloc(15); sof[0] = 8; sof.writeUInt16BE(h, 1); sof.writeUInt16BE(w, 3); sof[5] = 3; for (let i = 0; i < 3; i++) { sof[6 + i * 3] = i + 1; sof[7 + i * 3] = 0x11; sof[8 + i * 3] = 0; }
  const ds = [Buffer.from([0xff, 0xd8]), doan(0xe0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1'))];
  if (o.exif !== false) ds.push(doan(0xe1, Buffer.from('Exif\0\0GPS 21.32N 103.90E vi-tri-nha-khach', 'latin1')), doan(0xfe, Buffer.from('ghi chu may anh', 'latin1')));
  ds.push(doan(0xdb, Buffer.alloc(65, 1)), doan(0xc0, sof), doan(0xc4, Buffer.alloc(30, 2)), doan(0xda, Buffer.from([3, 1, 0, 2, 0x11, 3, 0x11, 0, 63, 0])), Buffer.alloc(o.du || 200, 0x55), Buffer.from([0xff, 0xd9]));
  return Buffer.concat(ds);
}
function pngGia(w, h) { const b = Buffer.alloc(33); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b); b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'latin1'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return b; }
function webpGia(w, h) { const b = Buffer.alloc(40); b.write('RIFF', 0, 'latin1'); b.writeUInt32LE(32, 4); b.write('WEBPVP8X', 8, 'latin1'); b.writeUInt32LE(10, 16); b.writeUIntLE(w - 1, 24, 3); b.writeUIntLE(h - 1, 27, 3); return b; }

let soId = 0;
const idMoi = (dau = 'x') => dau + String(Date.now()).slice(-6) + String(++soId).padStart(6, '0');

/** Phòng chữ nhật thô (A × B, C D để tự suy). */
function phongTho(o = {}) {
  return Object.assign({ ban: 1, ten: 'Phòng ngủ', cao: 2700, day: 110, hinh: 'chu_nhat', tuong: [{ ten: 'A', dai: 3600, re: 90 }, { ten: 'B', dai: 3000, re: 90 }, { ten: 'C', dai: 0, re: 90 }, { ten: 'D', dai: 0, re: 90 }], mo: [], can: [], dn: [], khung: [] }, o);
}
async function taoCT(k, id, ten = 'Nhà anh Hùng') {
  const r = await k.goi('PUT', '/api/cong-trinh/' + id, { json: { ten, dia_chi: 'Chiềng Sinh', ngay: '2026-11-05', nguoi_do: 'Thợ Một' } });
  if (r.st !== 200) throw new Error('tạo ct: ' + JSON.stringify(r.j)); return r;
}
async function luuPhong(k, id, ct, phong, anh = [], o = {}) {
  return k.goi('PUT', '/api/phong/' + id, { json: Object.assign({ ct, ten: phong.ten || 'Phòng', xong: true, ghi_chu: '', phong, anh, rev: 0 }, o) });
}

module.exports = { moMay, khach, quanLy, thoMoi, jpegGia, pngGia, webpGia, idMoi, phongTho, taoCT, luuPhong, MK_DAU, MK_QL, MK_THO };
