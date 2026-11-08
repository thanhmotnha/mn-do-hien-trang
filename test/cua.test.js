'use strict';
// "Cửa & vách kính" của công trình (bản 0.3.0): CSDL bản 3, soát, quyền, đồng bộ (rev), ảnh, phiếu đặt hàng — và HỢP ĐỒNG máy vẽ KHÔNG đổi
// (cửa không bao giờ lọt vào /api/do/phong, /api/do/anh, gói `gui`).
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { moMay, quanLy, thoMoi, jpegGia, idMoi, phongTho, taoCT, luuPhong } = require('./tro-giup');
const Cua = require('../lib/cua'), csdl = require('../lib/csdl'), SL = require('../lib/sao-luu');
const NGUON = process.env.MNCF_PHONG || '/home/user/mn-chenfeng/src/mncf-phong.js';

let M, Q, T, T2, ma;
test.before(async () => {
  M = await moMay(); Q = await quanLy(M); T = await thoMoi(M, Q); T2 = await thoMoi(M, Q, 'tho2', 'Thợ Hai');
  ma = (await Q.goi('POST', '/api/quan-ly/ma-ket-noi', { json: { nhan: 'Máy vẽ' } })).j.chuoi.split('#')[1];
});
test.after(async () => { await M.dong(); });

const cuaGo = (o = {}) => Object.assign({ nhom: 'go', ky_hieu: 'D1', vi_tri: 'WC tầng 2', so_luong: 1, rong: [800, 802, 801], cao: [2100, 2101, 2100], cheo: [2250, 2252],
  chat_lieu: 'MDF chống ẩm', mau: 'óc chó', phu_kien: 'khoá tay gạt', ghi_chu: '', xong: false,
  go: { day_tuong: [110, 112], san: 'da_lat', cot_san: null, kieu: 'mot_canh', ban_le: 'trai', mo: 'vao', op_chi: 2 } }, o);
const cuaNhom = (o = {}) => Object.assign({ nhom: 'nhom', ky_hieu: 'N1', vi_tri: 'Phòng khách', rong: [1800, 1801, 1800], cao: [1400, 1400, 1401],
  nhom_ct: { loai: 'cua_so', be: 900, day_tuong: [220], lap: 'giua', he: 'Xingfa', kieu_mo: 'lua', so_canh: 2, kinh_day: 8, kinh_loai: 'cuong_luc', fix: 'khong' } }, o);
const cuaKinh = (o = {}) => Object.assign({ nhom: 'kinh', ky_hieu: 'K1', vi_tri: 'WC master',
  kinh: { dang: 'goc_l', mat: [{ rong: [900, 902, 898], cao: [2000, 2000, 2001] }, { rong: [1200, 1200, 1201], cao: [2000, 2001, 2000] }],
    nghieng: { trai: 3, phai: 8 }, bac: { co: true, cao: 40, rong: 60 }, doc: 'ống thoát góc trái', cua: { kieu: 'quay', rong: 700, mo: 'ra', ban_le_ben: 'trai', ban_le: 'kinh_tuong' },
    kinh_day: 10, kinh_loai: 'trong', pk_mau: 'den', vat: 'vòi sen cách mép kính 150, ổ điện cách 300' } }, o);
const luuCua = (k, id, ct, cua, anh = [], o = {}) => k.goi('PUT', '/api/cua/' + id, { json: Object.assign({ ct, rev: 0, cua, anh }, o) });

test('CSDL bản 2 → 3: giữ nguyên phòng / ảnh, thêm bảng cua + anh_cua; máy chủ mở được dữ liệu cũ', async () => {
  const { DatabaseSync } = require('node:sqlite');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mndo-csdl3-'));
  const d = new DatabaseSync(path.join(dir, 'do.sqlite'));
  d.exec(csdl.LUOC_DO); d.exec(csdl.NANG[2]); d.exec('PRAGMA user_version=2');
  d.exec("INSERT INTO tai_khoan (id, ten, ten_hien, vai, mk, tao_luc) VALUES (7, 'tho', 'Thợ', 'tho', 'x', 1)");
  d.exec("INSERT INTO cong_trinh (id, ten, ngay, tao_boi, tao_luc, sua_luc) VALUES ('ctabcdef', 'CT cũ', '2026-11-05', 7, 1, 1)");
  d.exec(`INSERT INTO muc (id, ct, ten, phong, anh, gui, goi_tinh, nguoi_gui, tao_luc, sua_luc, tao_boi) VALUES ('phabcdef', 'ctabcdef', 'P', '${JSON.stringify(phongTho())}', '[]', '{"loi":[],"bo":[],"anh":[],"phong":{}}', 'cu', 7, 1, 1, 7)`);
  d.exec("INSERT INTO anh (id, muc, ct, w, h, bytes, sha256, tao_boi, tao_luc) VALUES ('anabcdef', 'phabcdef', 'ctabcdef', 10, 10, 5, 'x', 7, 1)");
  d.close();
  const db = csdl.mo(dir);
  assert.equal(db.get('PRAGMA user_version').user_version, 3);
  assert.equal(db.get('SELECT ten FROM muc').ten, 'P');
  assert.equal(db.get('SELECT COUNT(*) n FROM anh').n, 1);
  assert.equal(db.get('SELECT COUNT(*) n FROM cua').n, 0);
  assert.equal(db.get('SELECT COUNT(*) n FROM anh_cua').n, 0);
  db.close();
  // máy chủ thật trên dữ liệu đã nâng: phòng cũ vẫn ra cho máy vẽ (gói tính lại vì goi_tinh 'cu')
  const N = await moMay({ dataDir: dir });
  try {
    const q = await quanLy(N);
    const m = (await q.goi('POST', '/api/quan-ly/ma-ket-noi', { json: { nhan: 'x' } })).j.chuoi.split('#')[1];
    const r = await (await fetch(N.goc + '/api/do/phong', { headers: { authorization: 'Bearer ' + m } })).json();
    assert.deepEqual(r.phong.map(x => x.muc.id), ['phabcdef']);
  } finally { await N.dong(); }
});

test('CSDL: nâng hỏng giữa chừng → lùi hết, dữ liệu + bản 2 giữ nguyên', () => {
  const { DatabaseSync } = require('node:sqlite');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mndo-csdl3h-'));
  const d = new DatabaseSync(path.join(dir, 'do.sqlite'));
  d.exec(csdl.LUOC_DO); d.exec(csdl.NANG[2]); d.exec('PRAGMA user_version=2');
  d.exec("INSERT INTO tai_khoan (id, ten, ten_hien, vai, mk, tao_luc) VALUES (7, 'tho', 'Thợ', 'tho', 'x', 1)");
  d.exec('CREATE TABLE anh_cua (x INTEGER)');      // bảng trùng tên → bước 3 hỏng SAU khi đã tạo bảng cua
  d.close();
  assert.throws(() => csdl.mo(dir));
  const d2 = new DatabaseSync(path.join(dir, 'do.sqlite'));
  assert.equal(d2.prepare('PRAGMA user_version').get().user_version, 2);
  assert.equal(d2.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name = 'cua'").get().n, 0, 'bảng cua của lần nâng hỏng đã lùi');
  assert.equal(d2.prepare('SELECT ten FROM tai_khoan').get().ten, 'tho');
  d2.close(); fs.rmSync(dir, { recursive: true, force: true });
});

test('tinh: số đặt hàng = số nhỏ nhất; lệch 3 điểm > 5 vàng, > 15 đỏ; chéo; khoảng thường gặp; số lạ', () => {
  const s = c => Cua.soatCua({ ct: 'ctabcdef', rev: 0, cua: c }).muc.cua;
  let t = Cua.tinh(s(cuaGo()));
  assert.equal(t.rong.min, 800); assert.equal(t.cao.min, 2100); assert.equal(t.muc, 'ok', JSON.stringify(t.canh_bao));
  t = Cua.tinh(s(cuaGo({ rong: [800, 806, 801] })));
  assert.equal(t.muc, 'vang'); assert.ok(t.canh_bao.some(b => b.truong === 'rong' && b.muc === 'vang' && /xéo/.test(b.loi)));
  t = Cua.tinh(s(cuaGo({ cao: [2100, 2116, 2100] })));
  assert.equal(t.muc, 'do'); assert.ok(t.canh_bao.some(b => b.truong === 'cao' && b.muc === 'do' && /không vuông/.test(b.loi)));
  t = Cua.tinh(s(cuaGo({ cheo: [2250, 2260] }))); assert.ok(t.canh_bao.some(b => b.truong === 'cheo' && b.muc === 'vang'));
  t = Cua.tinh(s(cuaGo({ rong: [1800, 1800, 1800] }))); assert.ok(t.canh_bao.some(b => b.truong === 'rong' && b.muc === 'vang' && /ngoài khoảng/.test(b.loi)), 'cửa 1 cánh 1800');
  t = Cua.tinh(s(cuaGo({ rong: [1800, 1800, 1800], go: Object.assign(cuaGo().go, { kieu: 'hai_canh', ban_le: 'trai', mo: 'vao' }) }))); assert.ok(!t.canh_bao.some(b => b.truong === 'rong'), '2 cánh 1800 thường');
  t = Cua.tinh(s(cuaGo({ rong: [80000, 800, 800] }))); assert.ok(t.canh_bao.some(b => b.muc === 'do' && /số lạ/.test(b.loi)));
  t = Cua.tinh(s(cuaGo({ rong: [0, 800, 800] }))); assert.ok(t.canh_bao.some(b => b.muc === 'do' && /số 0/.test(b.loi)));
  t = Cua.tinh(s(cuaGo({ rong: [null, 800, null] }))); assert.equal(t.rong.min, 800); assert.ok(t.canh_bao.some(b => b.muc === 'ghi' && /1\/3/.test(b.loi)));
  t = Cua.tinh(s(cuaGo({ rong: null }))); assert.equal(t.rong, null); assert.ok(t.canh_bao.some(b => /Chưa đo rộng/.test(b.loi)));
  t = Cua.tinh(s(cuaGo({ go: Object.assign(cuaGo().go, { day_tuong: [40, 110] }) }))); assert.ok(t.canh_bao.some(b => b.truong === 'go.day_tuong' && /40/.test(b.loi)));
});

test('tinh: gỗ sàn chưa lát trừ cốt sàn; chiều mở; nhôm / kính có cảnh báo riêng', () => {
  const s = c => Cua.soatCua({ ct: 'ctabcdef', rev: 0, cua: c }).muc.cua;
  let t = Cua.tinh(s(cuaGo({ go: Object.assign(cuaGo().go, { san: 'chua_lat', cot_san: 30 }) })));
  assert.equal(t.cao_dat, 2070); assert.ok(t.canh_bao.some(b => b.truong === 'go.cot_san' && /2070/.test(b.loi)));
  t = Cua.tinh(s(cuaGo({ go: Object.assign(cuaGo().go, { san: 'chua_lat', cot_san: null }) }))); assert.ok(t.canh_bao.some(b => b.truong === 'go.cot_san' && b.muc === 'vang'));
  t = Cua.tinh(s(cuaGo({ go: Object.assign(cuaGo().go, { ban_le: null }) }))); assert.ok(t.canh_bao.some(b => b.truong === 'go.mo'));
  t = Cua.tinh(s(cuaGo({ go: Object.assign(cuaGo().go, { kieu: 'lua', ban_le: null, mo: null, lua: null }) }))); assert.ok(t.canh_bao.some(b => b.truong === 'go.lua'));
  // nhôm
  t = Cua.tinh(s(cuaNhom())); assert.equal(t.muc, 'ok', JSON.stringify(t.canh_bao));
  t = Cua.tinh(s(cuaNhom({ nhom_ct: Object.assign(cuaNhom().nhom_ct, { be: null }) }))); assert.ok(t.canh_bao.some(b => b.truong === 'nhom_ct.be'));
  t = Cua.tinh(s(cuaNhom({ nhom_ct: Object.assign(cuaNhom().nhom_ct, { loai: 'cua_di', kinh_loai: 'thuong' }) }))); assert.ok(t.canh_bao.some(b => b.truong === 'nhom_ct.kinh_loai'));
  t = Cua.tinh(s(cuaNhom({ nhom_ct: Object.assign(cuaNhom().nhom_ct, { fix: 'ca_hai', fix_tren: 800, fix_duoi: 700 }) }))); assert.ok(t.canh_bao.some(b => b.truong === 'nhom_ct.fix' && b.muc === 'do'));
  t = Cua.tinh(s(cuaNhom({ nhom_ct: Object.assign(cuaNhom().nhom_ct, { tang_cao: true, tang_ghi: 'tầng 5' }) }))); assert.ok(t.canh_bao.some(b => b.muc === 'ghi' && /giàn \(tầng 5\)/.test(b.loi)));
  // kính
  t = Cua.tinh(s(cuaKinh()));
  assert.deepEqual(t.mat.map(m => [m.rong.min, m.cao.min]), [[898, 2000], [1200, 2000]]);
  assert.ok(t.canh_bao.some(b => b.truong === 'kinh.nghieng.phai' && b.muc === 'vang')); assert.ok(!t.canh_bao.some(b => b.truong === 'kinh.nghieng.trai'));
  t = Cua.tinh(s(cuaKinh({ kinh: Object.assign(cuaKinh().kinh, { dang: 'chu_u' }) }))); assert.ok(t.canh_bao.some(b => b.truong === 'kinh.mat' && /3 mặt/.test(b.loi)));
  t = Cua.tinh(s(cuaKinh({ kinh: Object.assign(cuaKinh().kinh, { cua: { kieu: 'quay', rong: 700, mo: 'vao', ban_le_ben: 'trai', ban_le: 'kinh_tuong' } }) }))); assert.ok(t.canh_bao.some(b => b.truong === 'kinh.cua.mo' && /VÀO/.test(b.loi)));
  t = Cua.tinh(s(cuaKinh({ kinh: Object.assign(cuaKinh().kinh, { kinh_day: 6 }) }))); assert.ok(t.canh_bao.some(b => b.truong === 'kinh.kinh_day'));
  t = Cua.tinh(s(cuaKinh({ kinh: Object.assign(cuaKinh().kinh, { mat: [{ rong: [900, 900, 900], cao: [1500, 1500, 1500] }], dang: 'thang' }) }))); assert.ok(t.canh_bao.some(b => b.truong === 'kinh.mat.0.cao' && /ngoài khoảng/.test(b.loi)));
  const dk = Cua.soatCua({ ct: 'ctabcdef', rev: 0, cua: { nhom: 'kinh', ky_hieu: 'K2' } }).muc.cua; assert.equal(dk.kinh.kinh_day, null, 'kính để trống thì giữ trống (mặc định 10 chỉ ở điện thoại lúc tạo mục)');
});

test('soát: dữ liệu hỏng → 422 kèm chỗ sai; khối của nhóm khác + khoá lạ bị bỏ; kính bỏ rộng / cao chung', async () => {
  const ct = idMoi('ct'); await taoCT(T, ct);
  const id = idMoi('cu');
  const hong = [
    cuaGo({ nhom: 'sat' }), cuaGo({ ky_hieu: '' }), cuaGo({ ky_hieu: 'D1<script>' }), cuaGo({ ky_hieu: 'x'.repeat(13) }), cuaGo({ so_luong: 0 }), cuaGo({ so_luong: 1.5 }),
    cuaGo({ rong: [-5, 800, 800] }), cuaGo({ rong: [800, '802', 801] }), cuaGo({ rong: [1, 2, 3, 4] }), cuaGo({ cao: 2100 }), cuaGo({ ghi_chu: 'x'.repeat(501) }),
    cuaGo({ go: { kieu: 'quay_tron' } }), cuaGo({ go: { op_chi: 3 } }), cuaGo({ go: { mo: 'len' } }), cuaGo({ xong: 'rồi' }),
    cuaNhom({ nhom_ct: { so_canh: 40 } }), cuaKinh({ kinh: { mat: [{}, {}, {}, {}] } }), cuaKinh({ kinh: { cua: { mo: 'xuong' } } }),
  ];
  for (const c of hong) { const r = await luuCua(T, id, ct, c); assert.equal(r.st, 422, JSON.stringify(c).slice(0, 120)); assert.equal(r.j.code, 'INVALID'); assert.ok(r.j.chi_tiet.length); }
  assert.equal((await luuCua(T, id, ct, cuaGo(), [{ id: idMoi('an'), w: 10, h: 10, ke: [{ loai: 'kt', a: [0, 0], b: [1, 1], lien: 'rong;0' }] }])).st, 422, 'liên kết sai dạng');
  assert.equal((await T.goi('PUT', '/api/cua/' + id, { json: { ct, rev: 0 } })).st, 422, 'thiếu cua');
  assert.equal((await T.goi('PUT', '/api/cua/' + id, { json: { ct: 'CT LẠ', rev: 0, cua: cuaGo() } })).st, 422);
  assert.equal((await T.goi('PUT', '/api/cua/' + id, { body: '{hỏng', headers: { 'content-type': 'application/json' } })).st, 422);
  assert.equal((await luuCua(T, id, 'chuaco123', cuaGo())).st, 422, 'công trình chưa có');
  assert.equal((await T.goi('PUT', '/api/cua/AB', { json: {} })).st, 404, 'mã mục lạ');
  // khối của nhóm khác + khoá lạ: bỏ; liên kết đúng dạng mà không thuộc nhóm: bỏ liên kết, giữ số
  const anhId = idMoi('an');
  const r = await luuCua(T, id, ct, Object.assign(cuaGo(), { kinh: { dang: 'thang' }, nhom_ct: { loai: 'vach' }, la: 'x', tinh: { muc: 'ok' } }),
    [{ id: anhId, w: 800, h: 600, ghi: 'ô cửa', ke: [{ loai: 'kt', a: [1, 1], b: [700, 1], text: '800', lien: 'rong.0' }, { loai: 'kt', a: [1, 1], b: [1, 500], text: '40', lien: 'kinh.bac.cao' }] }]);
  assert.equal(r.st, 200, JSON.stringify(r.j)); assert.deepEqual(r.j.can_gui, [anhId]);
  const g = await T.goi('GET', '/api/cua/' + id);
  assert.equal(g.st, 200);
  assert.equal(g.j.cua.kinh, undefined); assert.equal(g.j.cua.nhom_ct, undefined); assert.equal(g.j.cua.la, undefined); assert.equal(g.j.cua.tinh, undefined);
  assert.deepEqual(g.j.cua.go.day_tuong, [110, 112]);
  assert.equal(g.j.anh[0].ke[0].lien, 'rong.0'); assert.equal(g.j.anh[0].ke[1].lien, undefined); assert.equal(g.j.anh[0].ke[1].text, '40');
  assert.equal(g.j.tinh.rong.min, 800); assert.equal(g.j.xoa_duoc, true);
  // rộng 2 số → bù null
  const r2 = await luuCua(T, idMoi('cu'), ct, cuaGo({ ky_hieu: 'D2', rong: [800, 801] })); assert.equal(r2.st, 200); assert.equal(r2.j.tinh.rong.so.length, 3);
  // kính: rộng / cao chung bỏ
  const ik = idMoi('cu'); await luuCua(T, ik, ct, cuaKinh({ rong: [5, 5, 5] }));
  assert.deepEqual((await T.goi('GET', '/api/cua/' + ik)).j.cua.rong, [null, null, null]);
});

test('đồng bộ: rev cũ → 409 kèm bản máy chủ; ghi_de qua; gửi lại của chính máy (may + goc) không 409; mục đã xoá 409', async () => {
  const ct = idMoi('ct'); await taoCT(T, ct);
  const id = idMoi('cu');
  assert.equal((await luuCua(T, id, ct, cuaGo())).j.rev, 1);
  const r2 = await luuCua(T2, id, ct, cuaGo({ vi_tri: 'Phòng ngủ 1' }), [], { rev: 1 }); assert.equal(r2.j.rev, 2);
  const cu = await luuCua(T, id, ct, cuaGo({ vi_tri: 'Bếp' }), [], { rev: 1 });
  assert.equal(cu.st, 409); assert.equal(cu.j.hien_tai.cua.vi_tri, 'Phòng ngủ 1');
  const de = await luuCua(T, id, ct, cuaGo({ vi_tri: 'Bếp' }), [], { rev: 1, ghi_de: true }); assert.equal(de.j.rev, 3);
  const may = 'maydt123456';
  assert.equal((await luuCua(T, id, ct, cuaGo({ vi_tri: 'A' }), [], { rev: 3, may })).j.rev, 4);
  const lai = await luuCua(T, id, ct, cuaGo({ vi_tri: 'A' }), [], { rev: 3, may });      // mất trả lời, gửi lại
  assert.equal(lai.st, 200); assert.equal(lai.j.rev, 5);
  assert.equal((await luuCua(T, id, ct, cuaGo(), [], { rev: 3, may: 'maykhac1234' })).st, 409);
  const ct2 = idMoi('ct'); await taoCT(T, ct2);
  assert.equal((await luuCua(T, id, ct2, cuaGo(), [], { rev: 5 })).st, 422, 'đổi công trình');
  await T.goi('DELETE', '/api/cua/' + id);
  const x = await luuCua(T, id, ct, cuaGo(), [], { rev: 5 }); assert.equal(x.st, 409); assert.equal(x.j.xoa, true);
  assert.equal((await T.goi('GET', '/api/cua/' + id)).st, 404);
});

test('quyền: không phiên 401; thiếu X-MNDO 403; xoá = người tạo mục / công trình / quản lý', async () => {
  const ct = idMoi('ct'); await taoCT(T, ct);
  const a = idMoi('cu'), b = idMoi('cu'), c = idMoi('cu');
  for (const [id, ky] of [[a, 'D1'], [b, 'D2']]) await luuCua(T2, id, ct, cuaGo({ ky_hieu: ky }));      // thợ 2 tạo mục trong công trình của thợ 1
  await luuCua(T, c, ct, cuaGo({ ky_hieu: 'D3' }));
  const k = M.khach();
  for (const [m, p] of [['GET', '/api/cua/' + a], ['PUT', '/api/cua/' + a], ['DELETE', '/api/cua/' + a], ['GET', `/api/cong-trinh/${ct}/cua`], ['GET', `/api/cong-trinh/${ct}/phieu-cua`]]) assert.equal((await k.goi(m, p)).st, 401, m + ' ' + p);
  assert.equal((await T.goi('DELETE', '/api/cua/' + a, { khongMndo: true })).st, 403);
  assert.equal((await T.goi('PUT', '/api/cua/' + a, { json: { ct, rev: 1, cua: cuaGo() }, headers: { origin: 'https://evil.example' } })).st, 403);
  // thợ 3 (không tạo gì) không xoá được; người tạo công trình (thợ 1) xoá được mục của thợ 2; thợ 2 xoá được mục của mình; quản lý xoá được
  const T3 = await thoMoi(M, Q, 'tho3', 'Thợ Ba');
  const ds3 = (await T3.goi('GET', `/api/cong-trinh/${ct}/cua`)).j.cua; assert.ok(ds3.every(x => x.xoa_duoc === false));
  const d3 = await T3.goi('DELETE', '/api/cua/' + c); assert.equal(d3.st, 403); assert.match(d3.j.error, /người tạo/);
  assert.equal((await T3.goi('PUT', '/api/cua/' + c, { json: { ct, rev: 1, cua: cuaGo({ ky_hieu: 'D3', vi_tri: 'sửa bởi thợ 3' }) } })).st, 200, 'sửa: như phòng, mọi thợ');
  assert.equal((await T2.goi('DELETE', '/api/cua/' + c)).st, 403, 'thợ 2 không xoá được mục của thợ 1');
  assert.equal((await T.goi('DELETE', '/api/cua/' + a)).st, 200, 'người tạo công trình');
  assert.equal((await T2.goi('DELETE', '/api/cua/' + b)).st, 200, 'người tạo mục');
  assert.equal((await Q.goi('DELETE', '/api/cua/' + c)).st, 200, 'quản lý');
  assert.equal((await Q.goi('DELETE', '/api/cua/' + c)).st, 404, 'đã xoá');
  assert.equal((await T.goi('GET', `/api/cong-trinh/${ct}/cua`)).j.cua.length, 0);
});

test('ảnh của cửa: X-Cua; chưa khai 404; cỡ khác 422; gửi lại 200; mục xoá 410; máy vẽ KHÔNG đọc được', async () => {
  const ct = idMoi('ct'); await taoCT(T, ct);
  const id = idMoi('cu'), a1 = idMoi('an'), a2 = idMoi('an');
  await luuCua(T, id, ct, cuaGo(), [{ id: a1, w: 800, h: 600, ke: [] }, { id: a2, w: 640, h: 480, ke: [] }]);
  const gui = (aid, body, idc = id) => T.goi('PUT', '/api/anh/' + aid, { body, headers: { 'content-type': 'image/jpeg', 'x-cua': idc } });
  assert.equal((await gui('khongkhai1', jpegGia(800, 600))).st, 404);
  assert.equal((await gui(a1, jpegGia(800, 600), 'chuacocua1')).j.code, 'CHUA_CO_PHONG');
  assert.equal((await gui(a1, jpegGia(801, 600))).st, 422);
  assert.equal((await gui(a1, Buffer.from('không phải ảnh nhé 1234567890'))).st, 415);
  assert.equal((await gui(a1, jpegGia(800, 600))).st, 200);
  assert.equal((await gui(a1, jpegGia(800, 600))).j.da_co, true);
  assert.equal((await gui(a1, jpegGia(800, 600, { du: 300 }))).st, 409);
  const g = await T.goi('GET', '/api/anh/' + a1); assert.equal(g.st, 200); assert.equal(g.h.get('content-type'), 'image/jpeg');
  assert.ok(!g.b.toString('latin1').includes('GPS'), 'bỏ EXIF');
  assert.deepEqual((await T.goi('GET', '/api/cua/' + id)).j.anh_co, [a1]);
  // máy vẽ: 404 dù ảnh có thật
  assert.equal((await fetch(M.goc + '/api/do/anh/' + a1, { headers: { authorization: 'Bearer ' + ma } })).status, 404);
  // mã ảnh đã là ảnh phòng → không dùng lại cho cửa (và ngược lại)
  const ph = idMoi('ph'), ap = idMoi('an');
  await luuPhong(T, ph, ct, phongTho(), [{ id: ap, tuong: 0, w: 800, h: 600, ghi: '', ke: [] }]);
  await T.goi('PUT', '/api/anh/' + ap, { body: jpegGia(800, 600), headers: { 'content-type': 'image/jpeg', 'x-phong': ph } });
  assert.equal((await luuCua(T, id, ct, cuaGo(), [{ id: ap, w: 800, h: 600, ke: [] }], { rev: 1 })).st, 422);
  const ph2 = idMoi('ph'); await luuPhong(T, ph2, ct, phongTho(), [{ id: a1, tuong: 0, w: 800, h: 600, ghi: '', ke: [] }]);
  assert.equal((await T.goi('PUT', '/api/anh/' + a1, { body: jpegGia(800, 600), headers: { 'content-type': 'image/jpeg', 'x-phong': ph2 } })).st, 409, 'mã ảnh cửa không thành ảnh phòng');
  // bỏ ảnh của chính mình khỏi mục → xoá ngay (tệp + bản ghi)
  const tep = path.join(M.dir, 'anh', ct, a1 + '.jpg'); assert.ok(fs.existsSync(tep));
  assert.equal((await luuCua(T, id, ct, cuaGo(), [{ id: a2, w: 640, h: 480, ke: [] }], { rev: 1 })).st, 200);
  await new Promise(r => setTimeout(r, 50));
  assert.ok(!fs.existsSync(tep)); assert.equal((await T.goi('GET', '/api/anh/' + a1)).st, 404);
  // dung lượng tính cả ảnh cửa
  assert.ok((await Q.goi('GET', '/api/quan-ly/dung-luong')).j.so_anh >= 1);
  await T.goi('DELETE', '/api/cua/' + id);
  assert.equal((await gui(a2, jpegGia(640, 480))).st, 410);
});

test('HỢP ĐỒNG máy vẽ không đổi: cửa không vào /api/do/phong, gói gui, phongDaDo', async () => {
  const Ph = require(NGUON);
  const ct = idMoi('ct'); await taoCT(T, ct, 'Nhà có cửa');
  const ph = idMoi('ph');
  await luuPhong(T, ph, ct, phongTho({ ten: 'Phòng ngủ', tuong: [{ ten: 'A', dai: 3600, re: 90 }, { ten: 'B', dai: 3000, re: 90 }, { ten: 'C', dai: 3600, re: 90 }, { ten: 'D', dai: 3000, re: 90 }] }));
  const doc = async () => (await (await fetch(M.goc + '/api/do/phong', { headers: { authorization: 'Bearer ' + ma } })).json()).phong;
  const truoc = (await doc()).filter(x => x.ct.id === ct);
  const ids = [idMoi('cu'), idMoi('cu'), idMoi('cu')], a = idMoi('an');
  await luuCua(T, ids[0], ct, cuaGo({ ky_hieu: 'DKYHIEUGO', vi_tri: 'VITRICUAGO' }), [{ id: a, w: 800, h: 600, ke: [{ loai: 'kt', a: [1, 1], b: [5, 5], text: '800', lien: 'rong.0' }] }]);
  await T.goi('PUT', '/api/anh/' + a, { body: jpegGia(800, 600), headers: { 'content-type': 'image/jpeg', 'x-cua': ids[0] } });
  await luuCua(T, ids[1], ct, cuaNhom({ ky_hieu: 'NKYHIEU' }));
  await luuCua(T, ids[2], ct, cuaKinh({ ky_hieu: 'KKYHIEU' }));
  const sau = await doc(), cuaCt = sau.filter(x => x.ct.id === ct);
  // đúng một mục (phòng), giống hệt trước — trừ mốc sua_luc không đổi vì mục cửa không chạm muc
  assert.deepEqual(cuaCt, truoc);
  const chuoi = JSON.stringify(sau);
  for (const s of ids.concat([a, 'DKYHIEUGO', 'VITRICUAGO', 'NKYHIEU', 'KKYHIEU'])) assert.ok(!chuoi.includes(s), 'lọt sang máy vẽ: ' + s);
  assert.ok(sau.every(x => x.muc.loai === 'phong'));
  for (const x of sau) assert.deepEqual(Object.keys(x.muc.gui).sort(), Object.keys(truoc[0].muc.gui).sort());
  const ds = Ph.phongDaDo(sau, {}).filter(d => d.khoa.startsWith(ct + '/'));
  assert.deepEqual(ds.map(d => d.khoa), [ct + '/' + ph]);
  assert.equal(ds[0].ve_duoc, true);
  // trang đo vẫn thấy phòng + cửa riêng
  const cts = (await T.goi('GET', '/api/cong-trinh')).j.cong_trinh.find(c => c.id === ct);
  assert.equal(cts.so_phong, 1); assert.equal(cts.so_cua, 3); assert.equal(cts.so_cua_xong, 0);
  assert.equal((await T.goi('GET', `/api/cong-trinh/${ct}/phong`)).j.phong.length, 1);
});

test('danh sách: trùng ký hiệu cùng nhóm → vàng; công trình lạ / đã xoá 404; trần mục mỗi công trình', async () => {
  const ct = idMoi('ct'); await taoCT(T, ct);
  await luuCua(T, idMoi('cu'), ct, cuaGo({ ky_hieu: 'D1' }));
  await luuCua(T, idMoi('cu'), ct, cuaGo({ ky_hieu: 'd1' }));
  await luuCua(T, idMoi('cu'), ct, cuaNhom({ ky_hieu: 'D1' }));      // khác nhóm: không trùng
  const ds = (await T.goi('GET', `/api/cong-trinh/${ct}/cua`)).j.cua;
  assert.equal(ds.length, 3);
  assert.deepEqual(ds.map(x => x.tinh.canh_bao.some(b => b.truong === 'ky_hieu')), [true, true, false]);
  assert.equal((await T.goi('GET', '/api/cong-trinh/khongco123/cua')).st, 404);
  // trần 300 mục
  const db = M.mc.db, tk = db.get("SELECT id FROM tai_khoan WHERE ten = 'tho1'").id, du = JSON.stringify(Cua.soatCua({ ct, rev: 0, cua: cuaGo() }).muc.cua);
  db.tx(() => { for (let i = 0; i < Cua.CUA_MAX_CT - 3; i++) db.run('INSERT INTO cua (id, ct, nhom, ky_hieu, du_lieu, nguoi_gui, tao_boi, tao_luc, sua_luc) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1)', 'tran' + ct + i, ct, 'go', 'X' + i, du, tk, tk); });
  const r = await luuCua(T, idMoi('cu'), ct, cuaGo({ ky_hieu: 'D999' })); assert.equal(r.st, 422); assert.match(r.j.chi_tiet[0].loi, /300/);
  await T.goi('DELETE', '/api/cong-trinh/' + ct);
  assert.equal((await T.goi('GET', `/api/cong-trinh/${ct}/cua`)).st, 404);
  assert.equal((await luuCua(T, idMoi('cu'), ct, cuaGo())).st, 409);
});

test('phiếu đo cửa: HTML in được (mỗi nhóm một phần, không script, chữ được thoát), lọc nhóm, CSV có BOM + chống công thức', async () => {
  const ct = idMoi('ct'); await taoCT(T, ct, 'Nhà <anh> Hùng');
  await luuCua(T, idMoi('cu'), ct, cuaGo({ ky_hieu: 'D2', vi_tri: '<script>alert(1)</script>' }));
  await luuCua(T, idMoi('cu'), ct, cuaGo({ ky_hieu: 'D10', rong: [800, 820, 801], ghi_chu: '=HYPERLINK("x")' }));
  await luuCua(T, idMoi('cu'), ct, cuaGo({ ky_hieu: 'D1', go: Object.assign(cuaGo().go, { san: 'chua_lat', cot_san: 30 }) }));
  await luuCua(T, idMoi('cu'), ct, cuaNhom());
  await luuCua(T, idMoi('cu'), ct, cuaKinh());
  const h = await T.goi('GET', `/api/cong-trinh/${ct}/phieu-cua`);
  assert.equal(h.st, 200); assert.match(h.h.get('content-type'), /text\/html/);
  const csp = h.h.get('content-security-policy'); assert.match(csp, /default-src 'none'/); assert.ok(!/script-src/.test(csp));
  const html = h.b.toString('utf8');
  assert.ok(!/<script/i.test(html), 'không có thẻ script'); assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;')); assert.ok(html.includes('Nhà &lt;anh&gt; Hùng'));
  assert.equal((html.match(/<section data-nhom=/g) || []).length, 3);
  assert.ok(html.indexOf('>D1<') < html.indexOf('>D2<') && html.indexOf('>D2<') < html.indexOf('>D10<'), 'xếp ký hiệu tự nhiên');
  assert.ok(html.includes('<b>800</b> (800 / 820 / 801)')); assert.ok(html.includes('→ đặt <b>2070</b>')); assert.ok(html.includes('[ĐỎ]'));
  assert.ok(html.includes('K1 · mặt 2')); assert.ok(html.includes('@page{size:A4 landscape'));
  // lọc một nhóm: gửi riêng xưởng nhôm
  const n = (await T.goi('GET', `/api/cong-trinh/${ct}/phieu-cua?nhom=nhom`)).b.toString('utf8');
  assert.equal((n.match(/<section data-nhom=/g) || []).length, 1); assert.ok(n.includes('>N1<') && !n.includes('>D1<') && !n.includes('K1'));
  assert.ok(n.includes('hệ Xingfa') && n.includes('bệ 900'));
  // CSV
  const c = await T.goi('GET', `/api/cong-trinh/${ct}/phieu-cua?dang=csv&nhom=go,kinh`);
  assert.equal(c.st, 200); assert.match(c.h.get('content-type'), /text\/csv/); assert.match(c.h.get('content-disposition'), /attachment; filename="phieu-do-cua-.*-go-kinh\.csv"/);
  assert.deepEqual([...c.b.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  const csv = c.b.toString('utf8').slice(1), dong = csv.trim().split('\r\n');
  assert.equal(dong.length, 1 + 3 + 2, 'tiêu đề + 3 cửa gỗ + 2 mặt kính');
  assert.match(dong[0], /^"Nhóm","Ký hiệu","Vị trí","SL"/);
  assert.ok(csv.includes(`"'=HYPERLINK(""x"")"`), 'ô bắt đầu bằng = có dấu nháy');
  assert.ok(!csv.includes('N1'));
  // tham số lạ, công trình lạ
  assert.equal((await T.goi('GET', `/api/cong-trinh/${ct}/phieu-cua?nhom=sat`)).st, 422);
  assert.equal((await T.goi('GET', `/api/cong-trinh/${ct}/phieu-cua?dang=pdf`)).st, 422);
  assert.equal((await T.goi('GET', '/api/cong-trinh/khongco123/phieu-cua')).st, 404);
  assert.equal((await fetch(M.goc + `/api/do/phong`, { headers: { authorization: 'Bearer ' + ma } })).status, 200);
  assert.equal((await fetch(M.goc + `/api/do/cong-trinh/${ct}/phieu-cua`, { headers: { authorization: 'Bearer ' + ma } })).status, 404, 'máy vẽ không có đường tới phiếu');
});

test('dọn hằng ngày: mục cửa đã xoá quá 30 ngày (kèm ảnh) đi; công trình xoá có mục cửa vẫn dọn được', async () => {
  const ct = idMoi('ct'); await taoCT(T, ct);
  const id = idMoi('cu'), a = idMoi('an'), giu = idMoi('cu');
  await luuCua(T, id, ct, cuaGo(), [{ id: a, w: 800, h: 600, ke: [] }]);
  await T.goi('PUT', '/api/anh/' + a, { body: jpegGia(800, 600), headers: { 'content-type': 'image/jpeg', 'x-cua': id } });
  await luuCua(T, giu, ct, cuaGo({ ky_hieu: 'D2' }));
  const tep = path.join(M.dir, 'anh', ct, a + '.jpg'); assert.ok(fs.existsSync(tep));
  await T.goi('DELETE', '/api/cua/' + id);
  const db = M.mc.db, CD = { don() {} }, anhDir = path.join(M.dir, 'anh');
  let dm = SL.don({ db, anhDir, CD, bayGio: () => Date.now() });
  assert.equal(dm.cua, 0, 'chưa quá hạn'); assert.ok(fs.existsSync(tep));
  dm = SL.don({ db, anhDir, CD, bayGio: () => Date.now() + 31 * 24 * 3600 * 1000 });
  assert.ok(dm.cua >= 1); assert.equal(db.get('SELECT COUNT(*) n FROM cua WHERE id = ?', id).n, 0); assert.ok(!fs.existsSync(tep)); assert.equal(db.get('SELECT COUNT(*) n FROM anh_cua WHERE cua = ?', id).n, 0);
  assert.ok(db.get('SELECT 1 FROM cua WHERE id = ?', giu), 'mục còn dùng giữ nguyên');
  db.run('UPDATE cong_trinh SET xoa_luc = ? WHERE id = ?', Date.now(), ct);      // (phiên đã bị lần dọn +31 ngày ở trên xoá — đặt thẳng)
  dm = SL.don({ db, anhDir, CD, bayGio: () => Date.now() + 31 * 24 * 3600 * 1000 });
  assert.ok(dm.ct >= 1); assert.equal(db.get('SELECT COUNT(*) n FROM cong_trinh WHERE id = ?', ct).n, 0);
});

test('/cua.js chạy được trên điện thoại (cùng phép tính, CSP self)', async () => {
  const r = await fetch(M.goc + '/cua.js'); assert.equal(r.status, 200); assert.match(r.headers.get('content-type'), /javascript/);
  const vm = require('node:vm'), ctx = { self: {} }; vm.createContext(ctx); vm.runInContext(await r.text(), ctx);
  assert.equal(typeof ctx.self.MNDOCua.tinh, 'function'); assert.equal(ctx.self.MNDOCua.KY_DAU.kinh, 'K');
});

/* ===================== VÒNG SOÁT 0.3.0 (08/11/2026) — mỗi lỗi một phép thử ===================== */
const tinhMot = (c, id = 'a') => ({ id, cua: Cua.soatCua({ ct: 'ctabcdef', rev: 0, cua: c }).muc.cua, tinh: Cua.tinh(Cua.soatCua({ ct: 'ctabcdef', rev: 0, cua: c }).muc.cua) });

test('VS1: vách kính đổi dạng sang ít mặt hơn mà còn mặt đã đo → LỖI ĐỎ; phiếu ghi rõ MẶT THỪA, không đặt', () => {
  const ba = cuaKinh({ kinh: Object.assign(cuaKinh().kinh, { mat: cuaKinh().kinh.mat.concat([{ rong: [700, 700, 700], cao: [2000, 2000, 2000] }]) }) });      // góc L mà 3 mặt
  const x = tinhMot(ba);
  assert.equal(x.tinh.muc, 'do'); assert.ok(x.tinh.canh_bao.some(b => b.muc === 'do' && b.truong === 'kinh.mat' && /góc L \(2 mặt\) cần 2 mặt, đang có 3/.test(b.loi)));
  const h = Cua.hangPhieu([x]);
  assert.equal(h.length, 3); assert.ok(!h[0].thua && !h[1].thua); assert.ok(h[2].thua && /^\[ĐỎ\] MẶT THỪA/.test(h[2].canh_bao));
  const html = Cua.phieuHtml({ ten: 'x' }, [x], ['kinh']); assert.ok(/<tr class="do thua">/.test(html));
  assert.ok(Cua.phieuCsv([x], ['kinh']).includes('MẶT THỪA'));
  assert.equal(tinhMot(cuaKinh()).tinh.canh_bao.filter(b => b.truong === 'kinh.mat').length, 0, 'đúng số mặt: không báo');
});

test('VS2: kính dày để trống → máy chủ giữ null (không tự ghi 10 rồi trả về máy thợ)', async () => {
  const T3 = await thoMoi(M, await quanLy(M), 'tho9vs', 'Thợ Chín');      // (lần dọn +31 ngày ở trên đã xoá mọi phiên)
  const ct = idMoi('ct'); await taoCT(T3, ct); const id = idMoi('cu');
  const c = cuaKinh(); c.kinh = Object.assign({}, c.kinh, { kinh_day: null });
  assert.equal((await luuCua(T3, id, ct, c)).st, 200);
  const g = await T3.goi('GET', '/api/cua/' + id); assert.equal(g.j.cua.kinh.kinh_day, null);
  const html = (await T3.goi('GET', `/api/cong-trinh/${ct}/phieu-cua?nhom=kinh`)).b.toString('utf8');
  assert.ok(!/kính 10 mm/.test(html) && html.includes('kính cường lực trong'));
});

test('VS3: đầu phần phiếu đếm theo MỤC (id), không theo ký hiệu — hai mục trùng "D1" là 2 mục', () => {
  const html = Cua.phieuHtml({ ten: 'x' }, [tinhMot(cuaGo(), 'a'), tinhMot(cuaGo(), 'b'), tinhMot(cuaKinh(), 'c')], ['go', 'kinh']);
  assert.ok(html.includes('Cửa gỗ thông phòng — 2 mục')); assert.ok(html.includes('Vách kính tắm — 1 mục'), 'kính 2 mặt vẫn là 1 mục');
});

test('VS5: nâng CSDL có dữ liệu → chép bản cũ ra sao-luu/do-truoc-ban3-*.sqlite trước (quay lại bản 0.2.0 được); CSDL mới thì không chép', () => {
  const { DatabaseSync } = require('node:sqlite');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mndo-csdl3b-'));
  const d = new DatabaseSync(path.join(dir, 'do.sqlite'));
  d.exec(csdl.LUOC_DO); d.exec(csdl.NANG[2]); d.exec('PRAGMA user_version=2');
  d.exec("INSERT INTO tai_khoan (id, ten, ten_hien, vai, mk, tao_luc) VALUES (7, 'tho', 'Thợ', 'tho', 'x', 1)"); d.close();
  const db = csdl.mo(dir);
  assert.ok(db.banTruoc && /sao-luu[\\/]do-truoc-ban3-\d{8}-\d{6}\.sqlite$/.test(db.banTruoc), String(db.banTruoc)); db.close();
  const b = new DatabaseSync(db.banTruoc, { readOnly: true });
  assert.equal(b.prepare('PRAGMA user_version').get().user_version, 2, 'tệp chép là bản 2 (bản 0.2.0 mở được)');
  assert.equal(b.prepare('SELECT ten FROM tai_khoan').get().ten, 'tho'); assert.equal(b.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name = 'cua'").get().n, 0); b.close();
  const db2 = csdl.mo(dir); assert.equal(db2.banTruoc, null, 'mở lại (đã bản 3) không chép nữa'); db2.close();
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'mndo-csdl3n-')), db3 = csdl.mo(dir2); assert.equal(db3.banTruoc, null); db3.close();
  assert.ok(!fs.existsSync(path.join(dir2, 'sao-luu')));
  // sao lưu hằng ngày không xoá tệp này (giữ 14 bản chỉ áp cho do-YYYY-MM-DD)
  const db4 = csdl.mo(dir); for (let i = 0; i < 16; i++) SL.saoLuu(db4, dir, () => Date.UTC(2026, 0, 1 + i)); db4.close();
  assert.ok(fs.existsSync(db.banTruoc));
  fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(dir2, { recursive: true, force: true });
});

test('VS6 + R2-6 + R2-7: tên dạng vách / loại kính / sàn dốc trên phiếu đúng chữ', () => {
  const k = o => tinhMot(cuaKinh({ kinh: Object.assign(cuaKinh().kinh, o) }));
  const lua = k({ dang: 'lua', mat: [cuaKinh().kinh.mat[0]], cua: { kieu: 'lua', rong: 700 } });
  assert.equal(Cua.moTa(lua.cua).kieu, 'cửa lùa'); assert.ok(!lua.tinh.canh_bao.some(b => /Dạng lùa/.test(b.loi)));
  const sai = k({ dang: 'lua' }); assert.ok(sai.tinh.canh_bao.some(b => /Dạng cửa lùa cần 1 mặt/.test(b.loi)));
  assert.match(Cua.moTa(k({ kinh_loai: 'trong' }).cua).them, /kính 10 mm cường lực trong(;|$)/); assert.ok(!/sát mặt trong/.test(Cua.moTa(k({ kinh_loai: 'trong' }).cua).them));
  assert.match(Cua.moTa(k({ kinh_loai: 'mo' }).cua).them, /kính 10 mm cường lực mờ/); assert.ok(!/undefined/.test(Cua.moTa(k({ kinh_loai: 'mo' }).cua).them));
  assert.match(Cua.moTa(k({ doc: 'về góc trong bên phải' }).cua).san, /; sàn dốc về góc trong bên phải$/); assert.ok(!/về về/.test(Cua.moTa(k({ doc: 'về góc trong' }).cua).san));
  assert.match(Cua.moTa(k({ doc: 'góc trái' }).cua).san, /; sàn dốc về góc trái$/);
});

test('R2-4: phiếu chỉ in chiều mở ĐÚNG với kiểu đang chọn (khoá cũ còn trong dữ liệu không lên phiếu)', () => {
  const g = o => Cua.moTa(tinhMot(cuaGo({ go: Object.assign(cuaGo().go, o) })).cua);
  assert.equal(g({ kieu: 'khac', kieu_khac: 'vòm' }).mo, '');
  assert.equal(g({ kieu: 'lua', lua: 'phai' }).mo, 'lùa về phải (đứng ngoài nhìn vào phía trong)');
  const n = o => Cua.moTa(tinhMot(cuaNhom({ nhom_ct: Object.assign(cuaNhom().nhom_ct, o) })).cua);
  assert.equal(n({ kieu_mo: 'hat', ban_le: 'phai', mo: 'ra' }).mo, 'hất ra ngoài');
  assert.equal(n({ kieu_mo: 'lua', ban_le: 'phai', mo: 'ra' }).mo, '');
  assert.equal(n({ kieu_mo: 'quay', ban_le: 'phai', mo: 'ra' }).mo, 'bản lề phải; mở ra ngoài (đứng trong nhà nhìn ra)');
  assert.equal(n({ loai: 'cua_di', be: 900 }).san, '', 'bệ chỉ của cửa sổ');
  assert.ok(!/dưới/.test(n({ fix: 'tren', fix_tren: 400, fix_duoi: 300 }).kieu));
  const k = Cua.moTa(tinhMot(cuaKinh({ kinh: Object.assign(cuaKinh().kinh, { cua: { kieu: 'lua', rong: 700, mo: 'ra', ban_le_ben: 'trai', ban_le: 'kinh_tuong' } }) })).cua);
  assert.equal(k.mo, 'cửa lùa; cánh rộng 700');
});

test('R2-2 + R2-3: cửa gỗ 2 cánh đều chỉ vào / ra; mẹ con = cánh mẹ bên nào; phía TRONG là phòng nào lên phiếu', () => {
  const g = o => tinhMot(cuaGo({ go: Object.assign(cuaGo().go, o) }));
  let x = g({ kieu: 'hai_canh', ban_le: null, mo: 'vao', phia_trong: 'phòng ngủ master' });
  assert.equal(Cua.moTa(x.cua).mo, '2 cánh mở vào phía phòng ngủ master (đứng ngoài nhìn vào phía trong)');
  assert.ok(!x.tinh.canh_bao.some(b => b.truong === 'go.mo'), '2 cánh đều không đòi bản lề trái / phải');
  x = g({ kieu: 'hai_canh', ban_le: 'trai', mo: 'vao' }); assert.ok(!/bản lề/.test(Cua.moTa(x.cua).mo));
  x = g({ kieu: 'me_con', ban_le: 'phai', mo: 'ra', phia_trong: 'WC' });
  assert.equal(Cua.moTa(x.cua).mo, 'cánh mẹ bên phải; mở ra, phía trong là WC (đứng ngoài nhìn vào phía trong)');
  x = g({ kieu: 'me_con', ban_le: null, mo: 'ra' }); assert.ok(x.tinh.canh_bao.some(b => b.truong === 'go.mo' && /cánh mẹ/.test(b.loi)));
  x = g({ phia_trong: '' }); assert.ok(x.tinh.canh_bao.some(b => b.muc === 'ghi' && b.truong === 'go.phia_trong'));
  assert.ok(Cua.soatCua({ ct: 'ctabcdef', rev: 0, cua: cuaGo({ go: { phia_trong: 'x'.repeat(41) } }) }).loi.some(l => l.truong === 'cua.go.phia_trong'));
  assert.equal(Cua.soatCua({ ct: 'ctabcdef', rev: 0, cua: cuaGo({ go: { phia_trong: ' WC ' } }) }).muc.cua.go.phia_trong, 'WC');
  const h = Cua.phieuHtml({ ten: 'x' }, [g({})], ['go']); assert.ok(h.includes('Chiều mở: đứng ngoài nhìn vào phía trong.'));
  assert.ok(Cua.phieuHtml({ ten: 'x' }, [tinhMot(cuaNhom())], ['nhom']).includes('Chiều mở: đứng trong nhà nhìn ra.'));
});

test('R2-5: phiếu A4 — cột có bề rộng đặt trước (không bẻ vụn số / chữ), Cảnh báo ≤ 18 %, số đặt hàng in đậm', () => {
  const html = Cua.phieuHtml({ ten: 'x' }, [tinhMot(cuaGo({ rong: [820, 815, 808] }))], ['go']);
  assert.ok(html.includes('table-layout:fixed')); assert.ok(!/word-break:break-word/.test(html));
  const w = [...html.matchAll(/<col class="c-([a-z_]+)" style="width:(\d+)%">/g)].map(m => [m[1], +m[2]]);
  assert.equal(w.length, 13); assert.equal(w.reduce((s, x) => s + x[1], 0), 100); assert.ok(Object.fromEntries(w).canh_bao <= 18);
  assert.ok(html.includes('<td class="c-rong"><b>808</b> (820 / 815 / 808)</td>'));
  assert.match(html, /td\.c-ky_hieu,td\.c-sl,td\.c-xong\{white-space:nowrap\}/);
});
