'use strict';
// Máy chủ "Đo hiện trạng": node:http thuần, không thư viện. Hai loại khách:
//   • điện thoại của thợ (trang đo, phiên cookie __Host-mndo) — /api/* trừ /api/do
//   • máy vẽ (tiện ích mn-chenfeng trong trang Chenfeng, mã Bearer, CORS, không cookie) — CHỈ ĐỌC /api/do/phong, /api/do/anh/<id>
const http = require('node:http'), fs = require('node:fs'), fsp = require('node:fs/promises'), path = require('node:path'), crypto = require('node:crypto');
const csdl = require('./csdl'), MK = require('./mat-khau'), Anh = require('./anh'), Cors = require('./cors'), ChongDoan = require('./chong-doan');
const Soat = require('./soat'), Goi = require('./goi'), Cua = require('./cua');
const Ph = require('../vendor/mncf-phong.js');

const BAN = '0.2.0';
const COOKIE = '__Host-mndo';
const ID_DO = /^[a-z0-9]{6,40}$/, MA_KN = /^mn-[A-Za-z0-9_-]{20,80}$/, TEN_TK = /^[a-z0-9._-]{3,32}$/;
const GIO = 3600 * 1000, NGAY = 24 * GIO;
const HAN_PHIEN = { tho: 30 * NGAY, quan_ly: 7 * NGAY };
const JSON_MAX = 1024 * 1024;
const SAI_DN = 'Sai tên hoặc mật khẩu (tài khoản đã bị khoá cũng báo như vậy — hỏi quản lý nếu chắc đã gõ đúng).';
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const CSP = "default-src 'self'; img-src 'self' blob: data:; style-src 'self'; style-src-attr 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; worker-src 'self'; manifest-src 'self'";
const TINH = {      // tệp tĩnh: đường dẫn → [tệp, loại]
  '/': ['public/index.html', 'text/html; charset=utf-8'],
  '/index.html': ['public/index.html', 'text/html; charset=utf-8'],
  '/app.js': ['public/app.js', 'text/javascript; charset=utf-8'],
  '/app.css': ['public/app.css', 'text/css; charset=utf-8'],
  '/sw.js': ['public/sw.js', 'text/javascript; charset=utf-8'],
  '/manifest.webmanifest': ['public/manifest.webmanifest', 'application/manifest+json; charset=utf-8'],
  '/icon-192.png': ['public/icon-192.png', 'image/png'],
  '/icon-512.png': ['public/icon-512.png', 'image/png'],
  '/icon.svg': ['public/icon.svg', 'image/svg+xml'],
  '/goi.js': ['lib/goi.js', 'text/javascript; charset=utf-8'],
  '/cua.js': ['lib/cua.js', 'text/javascript; charset=utf-8'],
  '/mncf-phong.js': ['vendor/mncf-phong.js', 'text/javascript; charset=utf-8'],
};
const GOC_APP = path.join(__dirname, '..');

class LoiHttp extends Error { constructor(st, code, msg, them) { super(msg); this.st = st; this.code = code; this.them = them; } }
const E = {
  chuaDangNhap: () => new LoiHttp(401, 'UNAUTHENTICATED', 'Chưa đăng nhập hoặc phiên đã hết'),
  cam: (m) => new LoiHttp(403, 'FORBIDDEN', m || 'Không có quyền'),
  khong: () => new LoiHttp(404, 'NOT_FOUND', 'Không tìm thấy'),
  sai: (chi_tiet, m) => new LoiHttp(422, 'INVALID', m || 'Dữ liệu không hợp lệ', { chi_tiet }),
};

function taoMayChu(opt = {}) {
  const cfg = {
    dataDir: opt.dataDir || process.env.DATA_DIR || path.join(GOC_APP, 'data'),
    publicUrl: String(opt.publicUrl || process.env.PUBLIC_URL || 'http://localhost:3100').replace(/\/+$/, ''),
    quanLyTen: String(opt.quanLyTen || process.env.QUAN_LY_TEN || 'quanly').toLowerCase(),
    quanLyMk: opt.quanLyMatKhauDau !== undefined ? opt.quanLyMatKhauDau : process.env.QUAN_LY_MAT_KHAU_DAU,
    anhMax: Math.round((Number(opt.anhMaxMb || process.env.ANH_MAX_MB) || 4) * 1024 * 1024),
    // trần dung lượng (máy chủ dùng chung với ERP — đĩa đầy là Postgres của ERP chết) [CĐ]: mỗi phòng 500 MB, tổng 20 GB, chừa trống ≥ 2 GB
    anhPhong: Math.round((Number(opt.anhPhongMb || process.env.ANH_PHONG_MB) || 500) * 1024 * 1024),
    anhTong: Math.round(opt.anhTongMb ? opt.anhTongMb * 1024 * 1024 : (Number(process.env.ANH_TONG_GB) || 20) * 1024 * 1024 * 1024),
    diaTrongMin: Math.round((opt.diaTrongMinMb !== undefined ? opt.diaTrongMinMb : (Number(process.env.DIA_TRONG_MIN_GB) || 2) * 1024) * 1024 * 1024),
    tinCf: opt.tinCf !== undefined ? !!opt.tinCf : process.env.TIN_CF === '1',
    corsThem: (opt.corsThem !== undefined ? opt.corsThem : String(process.env.CORS_THEM || '').split(',')).map(s => s.trim()).filter(Boolean),
    bayGio: opt.bayGio || (() => Date.now()),
    lich: opt.lich !== false,
  };
  const goc = new URL(cfg.publicUrl), gocOrigin = goc.origin, chuoiGoc = cfg.publicUrl + '/api/do';
  const db = csdl.mo(cfg.dataDir), CD = ChongDoan.tao(db, cfg.bayGio), now = cfg.bayGio;
  const anhDir = path.join(cfg.dataDir, 'anh');
  fs.mkdirSync(anhDir, { recursive: true });
  const tepAnh = (ct, id) => path.join(anhDir, ct, id + '.jpg');
  const nhatKy = (tk, viec, chi) => db.run('INSERT INTO nhat_ky (luc, tk, viec, chi_tiet) VALUES (?, ?, ?, ?)', now(), tk || null, viec, chi ? String(chi).slice(0, 300) : null);
  let bamGia = '';      // băm giả: tên không có vẫn chạy scrypt cho thời gian trả lời đều

  /* ---------- tiện ích trả lời ---------- */
  const json = (res, st, o) => { const b = Buffer.from(JSON.stringify(o)); res.writeHead(st, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': b.length }); res.end(b); };
  const traLoi = (res, e) => { const o = { error: e.message, code: e.code }; if (e.them) Object.assign(o, e.them); if (e.retry) res.setHeader('Retry-After', String(e.retry)); json(res, e.st, o); };
  const ipCua = req => { const h = cfg.tinCf ? req.headers['cf-connecting-ip'] : ''; return String((typeof h === 'string' && h) || req.socket.remoteAddress || '?').slice(0, 64); };
  const cookieCua = req => { const c = req.headers.cookie || ''; for (const p of c.split(';')) { const i = p.indexOf('='); if (i > 0 && p.slice(0, i).trim() === COOKIE) return p.slice(i + 1).trim(); } return ''; };
  const datCookie = (res, v, giay) => res.setHeader('Set-Cookie', `${COOKIE}=${v}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${giay}`);

  /** Đọc thân yêu cầu, tối đa `max` byte; quá thì đọc bỏ (để còn trả được 413), quá xa thì cắt kết nối. */
  function docThan(req, max) {
    return new Promise((ok, hong) => {
      const dai = Number(req.headers['content-length']);
      if (dai > max * 3) { req.destroy(); return hong(new LoiHttp(413, 'TOO_LARGE', 'Tệp quá lớn')); }
      const ds = []; let n = 0, qua = false;
      const hen = setTimeout(() => { req.destroy(); hong(new LoiHttp(408, 'TIMEOUT', 'Gửi quá lâu')); }, 60000);
      req.on('data', c => { n += c.length; if (n > max) { qua = true; ds.length = 0; if (n > max * 3) { clearTimeout(hen); req.destroy(); hong(new LoiHttp(413, 'TOO_LARGE', 'Tệp quá lớn')); } } else ds.push(c); });
      req.on('end', () => { clearTimeout(hen); if (qua) hong(new LoiHttp(413, 'TOO_LARGE', 'Tệp quá lớn')); else ok(Buffer.concat(ds)); });
      req.on('error', e => { clearTimeout(hen); hong(e); });
    });
  }
  async function docJson(req) {
    const b = await docThan(req, JSON_MAX);
    if (!b.length) return {};
    try { return JSON.parse(b.toString('utf8')); } catch (e) { throw E.sai([{ truong: '', loi: 'JSON hỏng' }]); }
  }

  /* ---------- phiên ---------- */
  function phienCua(req) {
    const tok = cookieCua(req);
    if (!tok || !/^[A-Za-z0-9_-]{40,60}$/.test(tok)) return null;
    const bam = sha(tok), t = now();
    const r = db.get('SELECT p.bam, p.dung_luc, p.het_luc, t.id, t.ten, t.ten_hien, t.vai, t.bat_doi_mk, t.khoa_luc FROM phien p JOIN tai_khoan t ON t.id = p.tk WHERE p.bam = ?', bam);
    if (!r) return null;
    if (r.het_luc <= t || r.khoa_luc) { db.run('DELETE FROM phien WHERE bam = ?', bam); return null; }
    if (t - r.dung_luc > GIO) db.run('UPDATE phien SET dung_luc = ?, het_luc = ? WHERE bam = ?', t, t + HAN_PHIEN[r.vai], bam);
    return { bam, id: r.id, ten: r.ten, ten_hien: r.ten_hien, vai: r.vai, bat_doi_mk: !!r.bat_doi_mk };
  }
  function taoPhien(res, tk, req) {
    const tok = crypto.randomBytes(32).toString('base64url'), t = now();
    db.run('INSERT INTO phien (bam, tk, tao_luc, dung_luc, het_luc, ua) VALUES (?, ?, ?, ?, ?, ?)', sha(tok), tk.id, t, t, t + HAN_PHIEN[tk.vai], String(req.headers['user-agent'] || '').slice(0, 200));
    datCookie(res, tok, 30 * 24 * 3600);
  }
  // QUYỀN (vòng soát 0.1.0): mọi thợ xem / đo thêm phòng vào mọi công trình [CĐ]; việc làm MẤT dữ liệu của người khác — xoá / lưu trữ /
  // sửa thông tin công trình, xoá phòng — chỉ người tạo (công trình; phòng: người tạo phòng hoặc người tạo công trình) hoặc quản lý.
  const quyenCt = (tk, c) => tk.vai === 'quan_ly' || (c && c.tao_boi === tk.id);
  const quyenPhong = (tk, m, c) => quyenCt(tk, c) || (m && m.tao_boi === tk.id);
  const KHONG_QUYEN = 'Chỉ người tạo hoặc quản lý mới làm được việc này';
  const toiCua = tk => ({ ten: tk.ten, ten_hien: tk.ten_hien, vai: tk.vai, bat_doi_mk: !!tk.bat_doi_mk });

  /* ---------- phòng: đọc / tính ---------- */
  const mucCua = id => db.get('SELECT * FROM muc WHERE id = ?', id);
  const anhCo = idMuc => db.all('SELECT id FROM anh WHERE muc = ?', idMuc).map(r => r.id);
  function mucDayDu(m) {
    const anh = JSON.parse(m.anh), co = new Set(anhCo(m.id));
    return { id: m.id, ct: m.ct, ten: m.ten, xong: !!m.xong, ghi_chu: m.ghi_chu, phong: JSON.parse(m.phong), anh, gui: JSON.parse(m.gui), rev: m.rev, sua_luc: m.sua_luc, anh_co: anh.map(a => a.id).filter(id => co.has(id)) };
  }
  const tinh = (phong, anh) => Goi.tinhGoi(phong, anh, Ph);
  const moc = cu => Math.max(now(), (cu || 0) + 1);      // sua_luc luôn TĂNG (máy vẽ so mốc để đánh dấu "mới")

  /* ---------- quản lý đầu + tính lại gói ---------- */
  async function khoiDong() {
    bamGia = await MK.bam(crypto.randomBytes(18).toString('base64'));
    const co = db.get("SELECT COUNT(*) n FROM tai_khoan WHERE vai = 'quan_ly'").n;
    if (!co && typeof cfg.quanLyMk === 'string' && cfg.quanLyMk.length >= 12 && TEN_TK.test(cfg.quanLyTen)) {
      const mk = await MK.bam(cfg.quanLyMk);
      db.run("INSERT INTO tai_khoan (ten, ten_hien, vai, mk, bat_doi_mk, tao_luc) VALUES (?, ?, 'quan_ly', ?, 1, ?)", cfg.quanLyTen, 'Quản lý', mk, now());
      nhatKy(null, 'tao_tk', 'tạo quản lý đầu: ' + cfg.quanLyTen);
      console.log(`[mndo] đã tạo tài khoản quản lý đầu "${cfg.quanLyTen}" (đăng nhập xong phải đổi mật khẩu)`);
    } else if (!co) console.log('[mndo] CHƯA có tài khoản quản lý: đặt QUAN_LY_MAT_KHAU_DAU (≥ 12 ký tự) rồi chạy lại, hoặc chạy scripts/dat-lai-quan-ly.js');
    // thuật toán tính gói đổi → tính lại mọi phòng (máy vẽ chỉ đọc gói)
    const cu = db.all('SELECT id, phong, anh FROM muc WHERE goi_tinh <> ?', Goi.GOI_BAN);
    for (const m of cu) db.run('UPDATE muc SET gui = ?, goi_tinh = ? WHERE id = ?', JSON.stringify(tinh(JSON.parse(m.phong), JSON.parse(m.anh))), Goi.GOI_BAN, m.id);
    if (cu.length) console.log(`[mndo] đã tính lại gói cho ${cu.length} phòng (thuật toán ${Goi.GOI_BAN})`);
  }

  /* ---------- MÁY VẼ: /api/do/* ---------- */
  async function apiDo(req, res, p) {
    const origin = req.headers.origin;
    if (req.method === 'OPTIONS') return Cors.preflight(res, origin, cfg.corsThem);
    Cors.dat(res, origin, cfg.corsThem);
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new LoiHttp(405, 'METHOD', 'Chỉ đọc');
    const ip = ipCua(req), chan = CD.chan('ma', ip);
    if (chan) { const e = new LoiHttp(429, 'TOO_MANY', 'Sai mã quá nhiều lần — thử lại sau'); e.retry = chan; throw e; }
    const m = /^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization || '')), ma = m ? m[1] : '';
    const r = MA_KN.test(ma) ? db.get('SELECT id, dung_luc FROM ma_ket_noi WHERE bam = ? AND thu_hoi_luc IS NULL', sha(ma)) : null;
    if (!r) { CD.sai('ma', ip); throw new LoiHttp(401, 'UNAUTHENTICATED', 'Mã kết nối không đúng hoặc đã bị thu hồi'); }
    if (!r.dung_luc || now() - r.dung_luc > 60000) db.run('UPDATE ma_ket_noi SET dung_luc = ? WHERE id = ?', now(), r.id);
    if (p === '/api/do/phong') return json(res, 200, { phong: dsMayVe() });
    const a = /^\/api\/do\/anh\/([^/]+)$/.exec(p);
    if (a) return guiAnh(res, a[1], true);
    throw E.khong();
  }
  function dsMayVe() {
    const ds = db.all(`SELECT m.id, m.ct, m.ten, m.xong, m.ghi_chu, m.phong, m.gui, m.sua_luc, c.ten AS cten, c.dia_chi, c.ngay, c.nguoi_do, t.ten_hien
      FROM muc m JOIN cong_trinh c ON c.id = m.ct JOIN tai_khoan t ON t.id = m.nguoi_gui
      WHERE m.xoa_luc IS NULL AND c.xoa_luc IS NULL AND c.luu_tru_luc IS NULL ORDER BY m.sua_luc DESC LIMIT 400`);
    return ds.map(m => {
      const gui = JSON.parse(m.gui), co = new Set(anhCo(m.id));
      return { ct: { id: m.ct, ten: m.cten, dia_chi: m.dia_chi, ngay: m.ngay, nguoi_do: m.nguoi_do }, nguoi_gui: m.ten_hien, sua_luc: m.sua_luc,
        muc: { id: m.id, loai: 'phong', ten: m.ten, xong: !!m.xong, ghi_chu: m.ghi_chu, phong: JSON.parse(m.phong), gui },
        anh_co: gui.anh.map(x => x.id).filter(id => co.has(id)) };
    });
  }
  async function guiAnh(res, id, mayVe) {
    if (!ID_DO.test(id)) throw E.khong();
    let r = db.get(`SELECT a.id, a.ct, a.bytes FROM anh a JOIN muc m ON m.id = a.muc JOIN cong_trinh c ON c.id = a.ct
      WHERE a.id = ? AND m.xoa_luc IS NULL AND c.xoa_luc IS NULL ${mayVe ? 'AND c.luu_tru_luc IS NULL' : ''}`, id);
    // ảnh của "Cửa & vách kính": CHỈ trang đo xem được — máy vẽ (mayVe) không bao giờ đọc bảng anh_cua
    if (!r && !mayVe) r = db.get(`SELECT a.id, a.ct, a.bytes FROM anh_cua a JOIN cua x ON x.id = a.cua JOIN cong_trinh c ON c.id = a.ct
      WHERE a.id = ? AND x.xoa_luc IS NULL AND c.xoa_luc IS NULL`, id);
    if (!r) throw E.khong();
    let b; try { b = await fsp.readFile(tepAnh(r.ct, r.id)); } catch (e) { throw E.khong(); }
    if (mayVe) db.run('UPDATE anh SET doc_luc = COALESCE(doc_luc, ?) WHERE id = ?', now(), r.id);
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': b.length, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store', 'Content-Disposition': 'inline' });
    res.end(b);
  }

  /* ---------- TRANG ĐO: /api/* (cookie) ---------- */
  async function api(req, res, u) {
    const p = u.pathname, M = req.method;
    if (p === '/api/suc-khoe' && M === 'GET') return json(res, 200, { ok: true, ban: BAN });
    if (p === '/api/do' || p.startsWith('/api/do/')) return apiDo(req, res, p);
    // chống giả yêu cầu: SameSite=Strict + mọi yêu cầu không phải GET phải có X-MNDO: 1 và Origin (nếu có) đúng trang đo
    if (M !== 'GET' && M !== 'HEAD') {
      const o = req.headers.origin;
      if (req.headers['x-mndo'] !== '1' || (o && o !== gocOrigin)) throw E.cam('Yêu cầu không đến từ trang đo');
    }
    if (p === '/api/dang-nhap' && M === 'POST') return dangNhap(req, res);
    if (p === '/api/dang-xuat' && M === 'POST') { const s = phienCua(req); if (s) db.run('DELETE FROM phien WHERE bam = ?', s.bam); datCookie(res, '', 0); return json(res, 200, { ok: true }); }
    const tk = phienCua(req);
    if (!tk) throw E.chuaDangNhap();
    if (p === '/api/toi' && M === 'GET') return json(res, 200, toiCua(tk));
    if (p === '/api/doi-mat-khau' && M === 'POST') return doiMk(req, res, tk);
    if (tk.bat_doi_mk) throw new LoiHttp(403, 'DOI_MK', 'Phải đổi mật khẩu trước');
    let m;
    if (p === '/api/cong-trinh' && M === 'GET') return json(res, 200, { cong_trinh: dsCongTrinh(u.searchParams.get('luu_tru') === '1', tk) });
    if ((m = /^\/api\/cong-trinh\/([^/]+)(\/(luu-tru|bo-luu-tru|phong|cua|phieu-cua))?$/.exec(p))) {
      const id = m[1]; if (!ID_DO.test(id)) throw E.khong();
      if (!m[2] && M === 'PUT') return luuCongTrinh(req, res, tk, id);
      if (!m[2] && M === 'DELETE') return xoaCongTrinh(res, tk, id);
      if (m[3] === 'phong' && M === 'GET') return dsPhongCua(res, id, tk);
      if (m[3] === 'cua' && M === 'GET') return json(res, 200, { cua: dsCuaCt(id, tk) });
      if (m[3] === 'phieu-cua' && M === 'GET') return phieuCua(res, id, tk, u.searchParams);
      if ((m[3] === 'luu-tru' || m[3] === 'bo-luu-tru') && M === 'POST') return luuTru(res, tk, id, m[3] === 'luu-tru');
      throw E.khong();
    }
    if ((m = /^\/api\/phong\/([^/]+)$/.exec(p))) {
      const id = m[1]; if (!ID_DO.test(id)) throw E.khong();
      if (M === 'GET') { const r = mucCua(id); if (!r || r.xoa_luc) throw E.khong(); return json(res, 200, Object.assign(mucDayDu(r), { xoa_duoc: quyenPhong(tk, r, db.get('SELECT tao_boi FROM cong_trinh WHERE id = ?', r.ct)) })); }
      if (M === 'PUT') return luuPhong(req, res, tk, id);
      if (M === 'DELETE') {
        const r = mucCua(id); if (!r || r.xoa_luc) throw E.khong();
        if (!quyenPhong(tk, r, db.get('SELECT tao_boi FROM cong_trinh WHERE id = ?', r.ct))) throw E.cam(KHONG_QUYEN + ' (người tạo phòng / công trình).');
        db.run('UPDATE muc SET xoa_luc = ? WHERE id = ?', now(), id); nhatKy(tk.id, 'xoa_phong', id); return json(res, 200, { ok: true });
      }
      throw E.khong();
    }
    if ((m = /^\/api\/cua\/([^/]+)$/.exec(p))) {
      const id = m[1]; if (!ID_DO.test(id)) throw E.khong();
      if (M === 'GET') { const r = cuaCua(id); if (!r || r.xoa_luc) throw E.khong(); const c = db.get('SELECT tao_boi, xoa_luc FROM cong_trinh WHERE id = ?', r.ct); if (!c || c.xoa_luc) throw E.khong(); return json(res, 200, cuaDayDu(r, tk, c)); }
      if (M === 'PUT') return luuCua(req, res, tk, id);
      if (M === 'DELETE') return xoaCua(res, tk, id);
      throw E.khong();
    }
    if ((m = /^\/api\/anh\/([^/]+)$/.exec(p))) {
      if (M === 'GET') return guiAnh(res, m[1], false);
      if (M === 'PUT') return nhanAnh(req, res, tk, m[1]);
      throw E.khong();
    }
    if (p.startsWith('/api/quan-ly/')) { if (tk.vai !== 'quan_ly') throw E.cam('Chỉ quản lý'); return quanLy(req, res, tk, p, M); }
    throw E.khong();
  }

  async function dangNhap(req, res) {
    const ip = ipCua(req), chanIp = CD.chan('ip', ip);
    if (chanIp) { const e = new LoiHttp(429, 'TOO_MANY', 'Đăng nhập sai quá nhiều lần từ máy này — thử lại sau ít phút'); e.retry = chanIp; throw e; }
    const b = await docJson(req);
    const ten = typeof b.ten === 'string' ? b.ten.trim().toLowerCase().slice(0, 64) : '', mk = typeof b.mat_khau === 'string' ? b.mat_khau.slice(0, 200) : '';
    const tk = ten ? db.get('SELECT * FROM tai_khoan WHERE ten = ?', ten) : null;
    // khoá theo CẶP (tên, máy): người lạ đoán sai 5 lần chỉ khoá chính máy họ — quản lý thật ở máy khác vẫn vào được. Đoán từ nhiều máy vẫn vướng trần mỗi IP.
    const kTen = ten + '|' + ip, chanTen = ten ? CD.chan('ten', kTen) : 0;
    const dung = await MK.kiem(mk, tk ? tk.mk : bamGia);
    if (chanTen) { CD.sai('ip', ip); nhatKy(tk && tk.id, 'dang_nhap_hong', 'tên đang tạm khoá'); throw new LoiHttp(401, 'UNAUTHENTICATED', `Tên này đang tạm khoá ở máy này vì gõ sai nhiều lần — thử lại sau ${Math.ceil(chanTen / 60)} phút.`); }
    // tài khoản đã khoá: trả ĐÚNG câu của sai mật khẩu (khác câu là lộ mật khẩu nào đúng)
    if (!tk || !dung || tk.khoa_luc) { CD.sai('ip', ip); if (ten) CD.sai('ten', kTen); nhatKy(tk && tk.id, 'dang_nhap_hong', !ten ? 'thiếu tên' : tk && tk.khoa_luc ? 'tài khoản đã khoá' : 'sai mật khẩu'); throw new LoiHttp(401, 'UNAUTHENTICATED', SAI_DN); }
    CD.xoa('ten', kTen);
    taoPhien(res, tk, req); nhatKy(tk.id, 'dang_nhap');
    return json(res, 200, toiCua(tk));
  }
  async function doiMk(req, res, tk) {
    const b = await docJson(req), ip = ipCua(req), kTen = tk.ten + '|' + ip;
    if (CD.chan('ten', kTen)) throw new LoiHttp(429, 'TOO_MANY', 'Gõ sai nhiều lần — thử lại sau');
    const r = db.get('SELECT mk FROM tai_khoan WHERE id = ?', tk.id);
    if (!(await MK.kiem(typeof b.cu === 'string' ? b.cu : '', r.mk))) { CD.sai('ten', kTen); CD.sai('ip', ip); throw E.sai([{ truong: 'cu', loi: 'Mật khẩu hiện tại không đúng' }], 'Mật khẩu hiện tại không đúng'); }
    const l = MK.luat(b.moi, tk.ten) || (b.moi === b.cu ? 'Mật khẩu mới phải khác mật khẩu cũ.' : '');
    if (l) throw E.sai([{ truong: 'moi', loi: l }], l);
    const moi = await MK.bam(b.moi);
    db.tx(() => {
      db.run('UPDATE tai_khoan SET mk = ?, bat_doi_mk = 0, doi_mk_luc = ? WHERE id = ?', moi, now(), tk.id);
      db.run('DELETE FROM phien WHERE tk = ? AND bam <> ?', tk.id, tk.bam);      // đổi mật khẩu = các máy khác đang đăng nhập bị đăng xuất
    });
    nhatKy(tk.id, 'doi_mk');
    return json(res, 200, Object.assign(toiCua(tk), { bat_doi_mk: false }));
  }

  function dsCongTrinh(caLuuTru, tk) {
    return db.all(`SELECT c.id, c.ten, c.dia_chi, c.ngay, c.nguoi_do, c.tao_boi, c.luu_tru_luc, c.sua_luc AS csua,
        (SELECT COUNT(*) FROM muc m WHERE m.ct = c.id AND m.xoa_luc IS NULL) AS so_phong,
        (SELECT COUNT(*) FROM muc m WHERE m.ct = c.id AND m.xoa_luc IS NULL AND m.xong = 1) AS so_xong,
        (SELECT MAX(m.sua_luc) FROM muc m WHERE m.ct = c.id AND m.xoa_luc IS NULL) AS msua,
        (SELECT COUNT(*) FROM cua x WHERE x.ct = c.id AND x.xoa_luc IS NULL) AS so_cua,
        (SELECT COUNT(*) FROM cua x WHERE x.ct = c.id AND x.xoa_luc IS NULL AND x.xong = 1) AS so_cua_xong,
        (SELECT MAX(x.sua_luc) FROM cua x WHERE x.ct = c.id AND x.xoa_luc IS NULL) AS xsua
      FROM cong_trinh c WHERE c.xoa_luc IS NULL ${caLuuTru ? '' : 'AND c.luu_tru_luc IS NULL'}`)
      .map(c => ({ id: c.id, ten: c.ten, dia_chi: c.dia_chi, ngay: c.ngay, nguoi_do: c.nguoi_do, luu_tru: !!c.luu_tru_luc, cua_toi: quyenCt(tk, c), so_phong: c.so_phong, so_xong: c.so_xong, so_cua: c.so_cua, so_cua_xong: c.so_cua_xong, sua_luc: Math.max(c.csua, c.msua || 0, c.xsua || 0) }))
      .sort((a, b) => b.sua_luc - a.sua_luc);
  }
  async function luuCongTrinh(req, res, tk, id) {
    const r = Soat.soatCongTrinh(await docJson(req));
    if (r.loi.length) throw E.sai(r.loi);
    const cu = db.get('SELECT id, xoa_luc, tao_boi FROM cong_trinh WHERE id = ?', id), c = r.ct, t = now();
    if (cu && cu.xoa_luc) throw new LoiHttp(409, 'CONFLICT', 'Công trình này đã bị xoá', { xoa: true });
    if (cu && !quyenCt(tk, cu)) throw E.cam(KHONG_QUYEN + ' (sửa thông tin công trình).');
    if (cu) db.run('UPDATE cong_trinh SET ten = ?, dia_chi = ?, ngay = ?, nguoi_do = ?, sua_luc = ? WHERE id = ?', c.ten, c.dia_chi, c.ngay, c.nguoi_do, t, id);
    else db.run('INSERT INTO cong_trinh (id, ten, dia_chi, ngay, nguoi_do, tao_boi, tao_luc, sua_luc) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', id, c.ten, c.dia_chi, c.ngay, c.nguoi_do, tk.id, t, t);
    return json(res, 200, { ok: true, id, sua_luc: t });
  }
  function xoaCongTrinh(res, tk, id) {
    const c = db.get('SELECT tao_boi, xoa_luc FROM cong_trinh WHERE id = ?', id);
    if (!c || c.xoa_luc) throw E.khong();
    if (!quyenCt(tk, c)) throw E.cam('Chỉ người tạo công trình hoặc quản lý mới xoá được');
    db.run('UPDATE cong_trinh SET xoa_luc = ? WHERE id = ?', now(), id); nhatKy(tk.id, 'xoa_ct', id);
    return json(res, 200, { ok: true });
  }
  function luuTru(res, tk, id, bat) {
    const c = db.get('SELECT xoa_luc, tao_boi FROM cong_trinh WHERE id = ?', id);
    if (!c || c.xoa_luc) throw E.khong();
    if (!quyenCt(tk, c)) throw E.cam(KHONG_QUYEN + ' (lưu trữ công trình).');
    db.run('UPDATE cong_trinh SET luu_tru_luc = ?, sua_luc = ? WHERE id = ?', bat ? now() : null, now(), id);
    if (bat) nhatKy(tk.id, 'luu_tru_ct', id);
    return json(res, 200, { ok: true });
  }
  function dsPhongCua(res, id, tk) {
    const c = db.get('SELECT xoa_luc, tao_boi FROM cong_trinh WHERE id = ?', id);
    if (!c || c.xoa_luc) throw E.khong();
    const ds = db.all('SELECT id, ten, xong, rev, sua_luc, gui, anh, tao_boi FROM muc WHERE ct = ? AND xoa_luc IS NULL ORDER BY tao_luc', id).map(m => {
      const g = JSON.parse(m.gui); return { id: m.id, ten: m.ten, xong: !!m.xong, rev: m.rev, sua_luc: m.sua_luc, loi: g.loi.length, bo: g.bo.length, so_anh: JSON.parse(m.anh).length, xoa_duoc: quyenPhong(tk, m, c) };
    });
    return json(res, 200, { phong: ds });
  }
  async function luuPhong(req, res, tk, id) {
    const r = Soat.soatMuc(await docJson(req), Ph);
    if (r.loi.length) throw E.sai(r.loi);
    const q = r.muc, cu = mucCua(id), t = now();
    if (cu && cu.xoa_luc) throw new LoiHttp(409, 'CONFLICT', 'Phòng này đã bị xoá trên máy chủ', { xoa: true });
    if (cu && cu.ct !== q.ct) throw E.sai([{ truong: 'ct', loi: 'phòng thuộc công trình khác' }]);
    // gửi lại sau khi mất trả lời: bản sau cùng trên máy chủ là của CHÍNH máy này, dựng trên đúng số bản máy này còn giữ → không phải xung đột
    const cuaMinh = cu && q.may && cu.may === q.may && cu.goc === q.rev;
    if (cu && cu.rev !== q.rev && !q.ghi_de && !cuaMinh) throw new LoiHttp(409, 'CONFLICT', 'Phòng đã được sửa ở máy khác', { hien_tai: mucDayDu(cu) });
    const ct = db.get('SELECT xoa_luc FROM cong_trinh WHERE id = ?', q.ct);
    if (!ct) throw E.sai([{ truong: 'ct', loi: 'công trình chưa có trên máy chủ — gửi công trình trước' }]);
    if (ct.xoa_luc) throw new LoiHttp(409, 'CONFLICT', 'Công trình này đã bị xoá', { xoa: true });
    const gui = JSON.stringify(tinh(q.phong, q.anh));
    const rev = cu ? cu.rev + 1 : 1, sua = moc(cu && cu.sua_luc), bo = [];
    db.tx(() => {
      if (cu) db.run('UPDATE muc SET ten = ?, xong = ?, ghi_chu = ?, phong = ?, anh = ?, gui = ?, goi_tinh = ?, rev = ?, nguoi_gui = ?, sua_luc = ?, may = ?, goc = ? WHERE id = ?', q.ten, q.xong ? 1 : 0, q.ghi_chu, JSON.stringify(q.phong), JSON.stringify(q.anh), gui, Goi.GOI_BAN, rev, tk.id, sua, q.may || null, q.rev, id);
      else db.run('INSERT INTO muc (id, ct, loai, ten, xong, ghi_chu, phong, anh, gui, goi_tinh, rev, nguoi_gui, tao_luc, sua_luc, tao_boi, may, goc) VALUES (?, ?, \'phong\', ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)', id, q.ct, q.ten, q.xong ? 1 : 0, q.ghi_chu, JSON.stringify(q.phong), JSON.stringify(q.anh), gui, Goi.GOI_BAN, tk.id, t, sua, tk.id, q.may || null, q.rev);
      db.run('UPDATE cong_trinh SET sua_luc = ? WHERE id = ?', t, q.ct);
      // ảnh CHÍNH người này tải lên rồi bỏ khỏi phòng mà máy vẽ chưa từng đọc: xoá ngay (giữ 30 ngày là cho ảnh của người khác / ảnh máy vẽ đã dùng)
      if (cu) { const con = new Set(q.anh.map(a => a.id)); for (const a of db.all('SELECT id, ct FROM anh WHERE muc = ? AND doc_luc IS NULL AND tao_boi = ?', id, tk.id)) if (!con.has(a.id)) { bo.push(a); db.run('DELETE FROM anh WHERE id = ?', a.id); } }
    });
    for (const a of bo) fsp.unlink(tepAnh(a.ct, a.id)).catch(() => null);
    const co = new Set(anhCo(id));
    return json(res, 200, { rev, sua_luc: sua, gui: JSON.parse(gui), anh_co: q.anh.map(a => a.id).filter(x => co.has(x)), can_gui: q.anh.map(a => a.id).filter(x => !co.has(x)) });
  }
  async function nhanAnh(req, res, tk, id) {
    if (!ID_DO.test(id)) throw E.khong();
    if (req.headers['x-cua'] !== undefined) return nhanAnhCua(req, res, tk, id);
    const idPhong = String(req.headers['x-phong'] || '');
    const m = ID_DO.test(idPhong) ? mucCua(idPhong) : null;
    // phòng / công trình đã xoá: 410 — điện thoại thôi gửi (404 trước đây làm nó thử lại mãi). Phòng chưa lên: 404 CHUA_CO_PHONG (gửi phòng trước).
    if (!m) { req.resume(); throw new LoiHttp(404, 'CHUA_CO_PHONG', 'Phòng của ảnh chưa có trên máy chủ'); }
    const ctr = db.get('SELECT xoa_luc FROM cong_trinh WHERE id = ?', m.ct);
    if (m.xoa_luc || !ctr || ctr.xoa_luc) { req.resume(); throw new LoiHttp(410, 'GONE', 'Phòng (hoặc công trình) của ảnh đã bị xoá trên máy chủ'); }
    const khai = JSON.parse(m.anh).find(a => a.id === id);
    if (!khai) { req.resume(); throw new LoiHttp(404, 'CHUA_KHAI', 'Phòng trên máy chủ không có ảnh này'); }
    const b = await docThan(req, cfg.anhMax);
    const l = Anh.loai(b);
    if (l !== 'jpeg') throw new LoiHttp(415, 'UNSUPPORTED_MEDIA', l ? 'Trình duyệt này chưa nén được ảnh — cập nhật trình duyệt' : 'Tệp không phải ảnh');
    const c = Anh.co(b);
    if (!c) throw new LoiHttp(415, 'UNSUPPORTED_MEDIA', 'Ảnh hỏng');
    if (c.w > 4096 || c.h > 4096) throw E.sai([{ truong: 'anh', loi: 'cạnh ảnh quá 4096' }]);
    if (c.w !== khai.w || c.h !== khai.h) throw E.sai([{ truong: 'anh', loi: `ảnh ${c.w} × ${c.h}, khác cỡ đã khai ${khai.w} × ${khai.h}` }]);
    const sach = Anh.locJpeg(b);
    if (!sach) throw new LoiHttp(415, 'UNSUPPORTED_MEDIA', 'Ảnh hỏng');
    const bam = sha(sach);
    // một mã ảnh chỉ một lần nhận cùng lúc: hai lần tải song song (bấm gửi hai lần, hai tab) chạy lần lượt — lần sau thấy bản ghi của lần trước
    return voiKhoa(id, async () => {
      const cu = db.get('SELECT sha256, w, h, bytes FROM anh WHERE id = ?', id);
      if (!cu && db.get('SELECT 1 FROM anh_cua WHERE id = ?', id)) throw new LoiHttp(409, 'CONFLICT', 'Mã ảnh này đã có tệp khác — chụp lại là ảnh mới');
      if (cu) { if (cu.sha256 === bam) return json(res, 200, { ok: true, w: cu.w, h: cu.h, bytes: cu.bytes, da_co: true }); throw new LoiHttp(409, 'CONFLICT', 'Mã ảnh này đã có tệp khác — chụp lại là ảnh mới'); }
      kiemDungLuong(m.id, sach.length);
      const dich = tepAnh(m.ct, id), tam = dich + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
      await fsp.mkdir(path.dirname(dich), { recursive: true });
      await fsp.writeFile(tam, sach); await fsp.rename(tam, dich);
      db.tx(() => {
        db.run('INSERT INTO anh (id, muc, ct, w, h, bytes, sha256, tao_boi, tao_luc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', id, m.id, m.ct, c.w, c.h, sach.length, bam, tk.id, now());
        const mm = mucCua(m.id); db.run('UPDATE muc SET sua_luc = ? WHERE id = ?', moc(mm.sua_luc), m.id);      // ảnh vừa lên: máy vẽ thấy phòng "mới" để lấy lại kèm ảnh
      });
      return json(res, 200, { ok: true, w: c.w, h: c.h, bytes: sach.length });
    });
  }
  /* ---------- CỬA & VÁCH KÍNH (bản 0.3.0): bảng `cua` / `anh_cua` riêng — KHÔNG BAO GIỜ vào /api/do/* hay gói gửi máy vẽ ---------- */
  const cuaCua = id => db.get('SELECT * FROM cua WHERE id = ?', id);
  const anhCuaCo = idCua => db.all('SELECT id FROM anh_cua WHERE cua = ?', idCua).map(r => r.id);
  function cuaDayDu(r, tk, c, them) {
    const cua = JSON.parse(r.du_lieu), anh = JSON.parse(r.anh), co = new Set(anhCuaCo(r.id)), t = Cua.tinh(cua);
    if (them && them.length) { t.canh_bao = t.canh_bao.concat(them); if (t.muc === 'ok') t.muc = 'vang'; }
    return { id: r.id, ct: r.ct, cua, anh, tinh: t, rev: r.rev, sua_luc: r.sua_luc, anh_co: anh.map(a => a.id).filter(id => co.has(id)), xoa_duoc: quyenPhong(tk, r, c) };
  }
  function dsCuaCt(id, tk) {
    const c = db.get('SELECT xoa_luc, tao_boi FROM cong_trinh WHERE id = ?', id);
    if (!c || c.xoa_luc) throw E.khong();
    const ds = db.all('SELECT * FROM cua WHERE ct = ? AND xoa_luc IS NULL ORDER BY tao_luc, id', id);
    const trung = Cua.kiemDs(ds.map(r => ({ id: r.id, cua: JSON.parse(r.du_lieu) })));
    return ds.map(r => cuaDayDu(r, tk, c, trung.get(r.id)));
  }
  async function luuCua(req, res, tk, id) {
    const r = Cua.soatCua(await docJson(req));
    if (r.loi.length) throw E.sai(r.loi);
    const q = r.muc, cu = cuaCua(id), t = now();
    if (cu && cu.xoa_luc) throw new LoiHttp(409, 'CONFLICT', 'Mục cửa này đã bị xoá trên máy chủ', { xoa: true });
    if (cu && cu.ct !== q.ct) throw E.sai([{ truong: 'ct', loi: 'mục cửa thuộc công trình khác' }]);
    const ct = db.get('SELECT xoa_luc, tao_boi FROM cong_trinh WHERE id = ?', q.ct);
    if (!ct) throw E.sai([{ truong: 'ct', loi: 'công trình chưa có trên máy chủ — gửi công trình trước' }]);
    if (ct.xoa_luc) throw new LoiHttp(409, 'CONFLICT', 'Công trình này đã bị xoá', { xoa: true });
    const cuaMinh = cu && q.may && cu.may === q.may && cu.goc === q.rev;      // gửi lại sau khi mất trả lời (như phòng)
    if (cu && cu.rev !== q.rev && !q.ghi_de && !cuaMinh) throw new LoiHttp(409, 'CONFLICT', 'Mục cửa đã được sửa ở máy khác', { hien_tai: cuaDayDu(cu, tk, ct) });
    if (!cu && db.get('SELECT COUNT(*) n FROM cua WHERE ct = ? AND xoa_luc IS NULL', q.ct).n >= Cua.CUA_MAX_CT) throw E.sai([{ truong: 'cua', loi: `công trình đã có ${Cua.CUA_MAX_CT} mục cửa` }]);
    // mã ảnh trùng với ảnh PHÒNG đã có trên máy chủ → từ chối (một mã ảnh một tệp)
    for (const a of q.anh) if (db.get('SELECT 1 FROM anh WHERE id = ?', a.id) || db.get('SELECT 1 FROM anh_cua WHERE id = ? AND cua <> ?', a.id, id)) throw E.sai([{ truong: 'anh', loi: 'mã ảnh đã dùng ở chỗ khác — chụp lại là ảnh mới' }]);
    const rev = cu ? cu.rev + 1 : 1, sua = moc(cu && cu.sua_luc), bo = [], du = JSON.stringify(q.cua), anh = JSON.stringify(q.anh);
    db.tx(() => {
      if (cu) db.run('UPDATE cua SET nhom = ?, ky_hieu = ?, xong = ?, du_lieu = ?, anh = ?, rev = ?, nguoi_gui = ?, sua_luc = ?, may = ?, goc = ? WHERE id = ?', q.cua.nhom, q.cua.ky_hieu, q.cua.xong ? 1 : 0, du, anh, rev, tk.id, sua, q.may || null, q.rev, id);
      else db.run('INSERT INTO cua (id, ct, nhom, ky_hieu, xong, du_lieu, anh, rev, nguoi_gui, tao_boi, may, goc, tao_luc, sua_luc) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)', id, q.ct, q.cua.nhom, q.cua.ky_hieu, q.cua.xong ? 1 : 0, du, anh, tk.id, tk.id, q.may || null, q.rev, t, sua);
      db.run('UPDATE cong_trinh SET sua_luc = ? WHERE id = ?', t, q.ct);
      // ảnh CHÍNH người này tải lên rồi bỏ khỏi mục: xoá ngay (ảnh của người khác giữ 30 ngày như phòng)
      if (cu) { const con = new Set(q.anh.map(a => a.id)); for (const a of db.all('SELECT id, ct FROM anh_cua WHERE cua = ? AND tao_boi = ?', id, tk.id)) if (!con.has(a.id)) { bo.push(a); db.run('DELETE FROM anh_cua WHERE id = ?', a.id); } }
    });
    for (const a of bo) fsp.unlink(tepAnh(a.ct, a.id)).catch(() => null);
    const co = new Set(anhCuaCo(id));
    return json(res, 200, { rev, sua_luc: sua, tinh: Cua.tinh(q.cua), anh_co: q.anh.map(a => a.id).filter(x => co.has(x)), can_gui: q.anh.map(a => a.id).filter(x => !co.has(x)) });
  }
  function xoaCua(res, tk, id) {
    const r = cuaCua(id); if (!r || r.xoa_luc) throw E.khong();
    if (!quyenPhong(tk, r, db.get('SELECT tao_boi FROM cong_trinh WHERE id = ?', r.ct))) throw E.cam(KHONG_QUYEN + ' (người tạo mục cửa / công trình).');
    db.run('UPDATE cua SET xoa_luc = ? WHERE id = ?', now(), id); nhatKy(tk.id, 'xoa_cua', id);
    return json(res, 200, { ok: true });
  }
  async function nhanAnhCua(req, res, tk, id) {
    const idCua = String(req.headers['x-cua'] || '');
    const m = ID_DO.test(idCua) ? cuaCua(idCua) : null;
    if (!m) { req.resume(); throw new LoiHttp(404, 'CHUA_CO_PHONG', 'Mục cửa của ảnh chưa có trên máy chủ'); }
    const ctr = db.get('SELECT xoa_luc FROM cong_trinh WHERE id = ?', m.ct);
    if (m.xoa_luc || !ctr || ctr.xoa_luc) { req.resume(); throw new LoiHttp(410, 'GONE', 'Mục cửa (hoặc công trình) của ảnh đã bị xoá trên máy chủ'); }
    const khai = JSON.parse(m.anh).find(a => a.id === id);
    if (!khai) { req.resume(); throw new LoiHttp(404, 'CHUA_KHAI', 'Mục cửa trên máy chủ không có ảnh này'); }
    const b = await docThan(req, cfg.anhMax);
    const l = Anh.loai(b);
    if (l !== 'jpeg') throw new LoiHttp(415, 'UNSUPPORTED_MEDIA', l ? 'Trình duyệt này chưa nén được ảnh — cập nhật trình duyệt' : 'Tệp không phải ảnh');
    const c = Anh.co(b);
    if (!c) throw new LoiHttp(415, 'UNSUPPORTED_MEDIA', 'Ảnh hỏng');
    if (c.w > 4096 || c.h > 4096) throw E.sai([{ truong: 'anh', loi: 'cạnh ảnh quá 4096' }]);
    if (c.w !== khai.w || c.h !== khai.h) throw E.sai([{ truong: 'anh', loi: `ảnh ${c.w} × ${c.h}, khác cỡ đã khai ${khai.w} × ${khai.h}` }]);
    const sach = Anh.locJpeg(b);
    if (!sach) throw new LoiHttp(415, 'UNSUPPORTED_MEDIA', 'Ảnh hỏng');
    const bam = sha(sach);
    return voiKhoa(id, async () => {
      if (db.get('SELECT 1 FROM anh WHERE id = ?', id)) throw new LoiHttp(409, 'CONFLICT', 'Mã ảnh này đã có tệp khác — chụp lại là ảnh mới');
      const cu = db.get('SELECT sha256, w, h, bytes, cua FROM anh_cua WHERE id = ?', id);
      if (cu) { if (cu.sha256 === bam && cu.cua === m.id) return json(res, 200, { ok: true, w: cu.w, h: cu.h, bytes: cu.bytes, da_co: true }); throw new LoiHttp(409, 'CONFLICT', 'Mã ảnh này đã có tệp khác — chụp lại là ảnh mới'); }
      kiemDungLuong(m.id, sach.length, true);
      const dich = tepAnh(m.ct, id), tam = dich + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
      await fsp.mkdir(path.dirname(dich), { recursive: true });
      await fsp.writeFile(tam, sach); await fsp.rename(tam, dich);
      db.run('INSERT INTO anh_cua (id, cua, ct, w, h, bytes, sha256, tao_boi, tao_luc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', id, m.id, m.ct, c.w, c.h, sach.length, bam, tk.id, now());
      return json(res, 200, { ok: true, w: c.w, h: c.h, bytes: sach.length });
    });
  }
  /** GET /api/cong-trinh/:id/phieu-cua?nhom=go,nhom,kinh&dang=html|csv — phiếu đặt hàng (mỗi nhóm một phần; lọc theo nhóm để gửi riêng xưởng gỗ / nhôm / kính). */
  function phieuCua(res, id, tk, sp) {
    const c = db.get('SELECT ten, dia_chi, ngay, nguoi_do FROM cong_trinh WHERE id = ? AND xoa_luc IS NULL', id);
    if (!c) throw E.khong();
    const nh = sp.get('nhom'), dang = sp.get('dang') || 'html';
    const nhoms = nh ? [...new Set(nh.split(','))] : Cua.NHOM.slice();
    if (!nhoms.length || nhoms.some(n => !Cua.NHOM.includes(n))) throw E.sai([{ truong: 'nhom', loi: 'nhóm phải là go / nhom / kinh' }]);
    if (dang !== 'html' && dang !== 'csv') throw E.sai([{ truong: 'dang', loi: 'dạng phải là html / csv' }]);
    const ds = dsCuaCt(id, tk).filter(x => nhoms.includes(x.cua.nhom)).map(x => ({ id: x.id, cua: x.cua, tinh: x.tinh }));
    const ten = 'phieu-do-cua-' + id + (nh ? '-' + nhoms.join('-') : '');
    if (dang === 'csv') {
      const b = Buffer.from(Cua.phieuCsv(ds, nhoms), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Length': b.length, 'Content-Disposition': `attachment; filename="${ten}.csv"` });
      return res.end(b);
    }
    const luc = new Date(now() + 7 * GIO).toISOString().slice(0, 16).replace('T', ' ');
    const b = Buffer.from(Cua.phieuHtml(c, ds, nhoms, luc), 'utf8');
    // trang in: KHÔNG script; chỉ cho phép <style> nội dòng của chính trang
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'");
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': b.length, 'Content-Disposition': `inline; filename="${ten}.html"` });
    return res.end(b);
  }

  const khoaAnh = new Map();
  async function voiKhoa(id, fn) {
    const truoc = khoaAnh.get(id) || Promise.resolve();
    let mo; const cua = new Promise(ok => { mo = ok; }), chuoi = truoc.then(() => cua);
    khoaAnh.set(id, chuoi);
    await truoc;
    try { return await fn(); } finally { mo(); if (khoaAnh.get(id) === chuoi) khoaAnh.delete(id); }
  }
  const dungLuong = () => {
    const a = db.get('SELECT (SELECT COUNT(*) FROM anh) + (SELECT COUNT(*) FROM anh_cua) n, (SELECT COALESCE(SUM(bytes), 0) FROM anh) + (SELECT COALESCE(SUM(bytes), 0) FROM anh_cua) b');
    let trong = null; try { const f = fs.statfsSync(cfg.dataDir); trong = f.bavail * f.bsize; } catch (e) { /* hệ thống không có statfs */ }
    return { so_anh: a.n, anh_bytes: a.b, tran_bytes: cfg.anhTong, tran_phong_bytes: cfg.anhPhong, dia_trong: trong, dia_trong_min: cfg.diaTrongMin };
  };
  const MB = v => String(Math.round(v / 1024 / 1024 * 10) / 10).replace('.', ',');
  /** Trần dung lượng ảnh (mỗi phòng, tổng, đĩa còn trống) — vượt thì 507 với lời nói rõ. Ảnh bị thay vẫn giữ 30 ngày nên cũng tính. */
  function kiemDungLuong(idMuc, them, laCua) {
    const p = laCua ? db.get('SELECT COUNT(*) n, COALESCE(SUM(bytes), 0) b FROM anh_cua WHERE cua = ?', idMuc) : db.get('SELECT COUNT(*) n, COALESCE(SUM(bytes), 0) b FROM anh WHERE muc = ?', idMuc), d = dungLuong();
    const loi = m => { console.warn('[mndo] dung lượng ảnh:', m); return new LoiHttp(507, 'HET_CHO', m); };
    if (p.b + them > cfg.anhPhong) throw loi(`Ảnh của ${laCua ? 'mục cửa' : 'phòng'} này đã có ${p.n} ảnh, ${MB(p.b)} MB trên máy chủ (trần ${MB(cfg.anhPhong)} MB một phòng) — xoá bớt ảnh không cần rồi gửi lại.`);
    if (d.anh_bytes + them > cfg.anhTong) throw loi(`Kho ảnh của máy chủ đã đầy (${MB(d.anh_bytes)} / ${MB(cfg.anhTong)} MB) — báo quản lý.`);
    if (d.dia_trong !== null && d.dia_trong - them < cfg.diaTrongMin) throw loi(`Đĩa máy chủ sắp đầy (còn ${MB(d.dia_trong)} MB) — báo quản lý.`);
    if (d.anh_bytes + them > cfg.anhTong * 0.8) console.warn(`[mndo] kho ảnh đã dùng ${MB(d.anh_bytes + them)} / ${MB(cfg.anhTong)} MB`);
  }

  /* ---------- quản lý ---------- */
  async function quanLy(req, res, tk, p, M) {
    let m;
    if (p === '/api/quan-ly/tai-khoan' && M === 'GET') return json(res, 200, { tai_khoan: db.all('SELECT id, ten, ten_hien, vai, bat_doi_mk, khoa_luc, tao_luc, doi_mk_luc FROM tai_khoan ORDER BY id').map(r => Object.assign(r, { bat_doi_mk: !!r.bat_doi_mk, khoa: !!r.khoa_luc })) });
    if (p === '/api/quan-ly/tai-khoan' && M === 'POST') {
      const b = await docJson(req), ten = typeof b.ten === 'string' ? b.ten.trim().toLowerCase() : '', ten_hien = typeof b.ten_hien === 'string' ? b.ten_hien.trim() : '', ct = [];
      if (!TEN_TK.test(ten)) ct.push({ truong: 'ten', loi: 'Tên đăng nhập 3 … 32 ký tự: chữ thường không dấu, số, . _ -' });
      if (!ten_hien || ten_hien.length > 60) ct.push({ truong: 'ten_hien', loi: 'Tên hiện 1 … 60 ký tự' });
      if (b.vai !== 'tho' && b.vai !== 'quan_ly') ct.push({ truong: 'vai', loi: 'Vai: tho hoặc quan_ly' });
      const l = MK.luat(b.mat_khau_tam, ten); if (l) ct.push({ truong: 'mat_khau_tam', loi: l });
      if (ct.length) throw E.sai(ct, ct[0].loi);
      if (db.get('SELECT id FROM tai_khoan WHERE ten = ?', ten)) throw new LoiHttp(409, 'CONFLICT', 'Tên đăng nhập này đã có');
      const r = db.run('INSERT INTO tai_khoan (ten, ten_hien, vai, mk, bat_doi_mk, tao_luc) VALUES (?, ?, ?, ?, 1, ?)', ten, ten_hien, b.vai, await MK.bam(b.mat_khau_tam), now());
      nhatKy(tk.id, 'tao_tk', ten);
      return json(res, 200, { id: Number(r.lastInsertRowid), ten, ten_hien, vai: b.vai });
    }
    if ((m = /^\/api\/quan-ly\/tai-khoan\/(\d+)\/(khoa|mo-khoa|dat-lai-mk)$/.exec(p)) && M === 'POST') {
      const id = +m[1], r = db.get('SELECT * FROM tai_khoan WHERE id = ?', id);
      if (!r) throw E.khong();
      if (m[2] === 'khoa') {
        if (id === tk.id) throw E.cam('Không tự khoá chính mình được');
        if (r.vai === 'quan_ly' && db.get("SELECT COUNT(*) n FROM tai_khoan WHERE vai = 'quan_ly' AND khoa_luc IS NULL").n <= 1) throw E.cam('Không khoá được quản lý cuối cùng');
        db.tx(() => { db.run('UPDATE tai_khoan SET khoa_luc = ? WHERE id = ?', now(), id); db.run('DELETE FROM phien WHERE tk = ?', id); });
        nhatKy(tk.id, 'khoa_tk', r.ten);
      } else if (m[2] === 'mo-khoa') { db.run('UPDATE tai_khoan SET khoa_luc = NULL WHERE id = ?', id); CD.xoaTen(r.ten); nhatKy(tk.id, 'mo_tk', r.ten); }
      else {
        const b = await docJson(req), l = MK.luat(b.mat_khau_tam, r.ten);
        if (l) throw E.sai([{ truong: 'mat_khau_tam', loi: l }], l);
        const mk = await MK.bam(b.mat_khau_tam);
        db.tx(() => { db.run('UPDATE tai_khoan SET mk = ?, bat_doi_mk = 1 WHERE id = ?', mk, id); db.run('DELETE FROM phien WHERE tk = ?', id); });
        CD.xoaTen(r.ten); nhatKy(tk.id, 'dat_lai_mk', r.ten);
      }
      return json(res, 200, { ok: true });
    }
    if (p === '/api/quan-ly/dung-luong' && M === 'GET') return json(res, 200, dungLuong());
    if (p === '/api/quan-ly/ma-ket-noi' && M === 'GET') return json(res, 200, { ma: db.all('SELECT k.id, k.nhan, k.dau, t.ten_hien AS tao_boi, k.tao_luc, k.dung_luc, k.thu_hoi_luc FROM ma_ket_noi k LEFT JOIN tai_khoan t ON t.id = k.tao_boi ORDER BY k.id DESC') });
    if (p === '/api/quan-ly/ma-ket-noi' && M === 'POST') {
      const b = await docJson(req), nhan = (typeof b.nhan === 'string' ? b.nhan.trim() : '').slice(0, 60) || 'Máy vẽ';
      const ma = 'mn-' + crypto.randomBytes(32).toString('base64url');
      const r = db.run('INSERT INTO ma_ket_noi (nhan, bam, dau, tao_boi, tao_luc) VALUES (?, ?, ?, ?, ?)', nhan, sha(ma), ma.slice(0, 7), tk.id, now());
      nhatKy(tk.id, 'cap_ma', nhan + ' ' + ma.slice(0, 7));
      return json(res, 200, { id: Number(r.lastInsertRowid), nhan, dau: ma.slice(0, 7), chuoi: chuoiGoc + '#' + ma });      // mã thật CHỈ ra một lần, ở đây
    }
    if ((m = /^\/api\/quan-ly\/ma-ket-noi\/(\d+)$/.exec(p)) && M === 'DELETE') {
      const r = db.get('SELECT id, nhan, dau FROM ma_ket_noi WHERE id = ?', +m[1]); if (!r) throw E.khong();
      db.run('UPDATE ma_ket_noi SET thu_hoi_luc = COALESCE(thu_hoi_luc, ?) WHERE id = ?', now(), r.id); nhatKy(tk.id, 'thu_hoi_ma', r.nhan + ' ' + r.dau);
      return json(res, 200, { ok: true });
    }
    throw E.khong();
  }

  /* ---------- tệp tĩnh ---------- */
  const boNho = new Map();
  async function tinhTep(req, res, p) {
    const t = TINH[p];
    if (!t || (req.method !== 'GET' && req.method !== 'HEAD')) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Không tìm thấy'); }
    let b = boNho.get(t[0]);
    if (!b) { b = await fsp.readFile(path.join(GOC_APP, t[0])); if (process.env.NODE_ENV === 'production') boNho.set(t[0], b); }
    const h = { 'Content-Type': t[1], 'Content-Length': b.length, 'Cache-Control': 'no-cache' };
    if (p === '/sw.js') h['Service-Worker-Allowed'] = '/';
    res.writeHead(200, h); res.end(req.method === 'HEAD' ? undefined : b);
  }

  async function xuLy(req, res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(self), geolocation=()');
    res.setHeader('Content-Security-Policy', CSP);
    let u; try { u = new URL(req.url, 'http://x'); } catch (e) { res.writeHead(400); return res.end(); }
    const laApi = u.pathname === '/api' || u.pathname.startsWith('/api/');
    try {
      if (laApi) { res.setHeader('Cache-Control', 'no-store'); await api(req, res, u); }
      else await tinhTep(req, res, u.pathname);
    } catch (e) {
      if (res.headersSent) { res.destroy(); return; }
      if (e instanceof LoiHttp) return traLoi(res, e);
      console.error('[mndo] lỗi:', e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e);
      traLoi(res, new LoiHttp(500, 'SERVER', 'Lỗi máy chủ'));
    }
  }

  const server = http.createServer((req, res) => { xuLy(req, res); });
  server.requestTimeout = 120000; server.headersTimeout = 20000;
  const san = khoiDong();
  let lich = null;
  if (cfg.lich) lich = require('./sao-luu').hen({ db, dataDir: cfg.dataDir, anhDir, CD, bayGio: now });
  return {
    server, db, cfg, san, chuoiGoc,
    listen(port, host) { return new Promise(ok => server.listen(port, host, () => ok(server.address().port))); },
    async close() { if (lich) lich.dung(); await new Promise(ok => server.close(() => ok())); server.closeAllConnections && server.closeAllConnections(); db.close(); },
  };
}

module.exports = { taoMayChu, BAN, COOKIE };
