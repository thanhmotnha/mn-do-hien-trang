'use strict';
// Quyền, phiên, chống đoán, nhận ảnh, soát dữ liệu (mục 9.3).
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { moMay, quanLy, thoMoi, jpegGia, pngGia, webpGia, idMoi, phongTho, taoCT, luuPhong, MK_THO, MK_QL } = require('./tro-giup');

let M, Q, T, ma;
test.before(async () => {
  M = await moMay(); Q = await quanLy(M); T = await thoMoi(M, Q);
  const r = await Q.goi('POST', '/api/quan-ly/ma-ket-noi', { json: { nhan: 'Máy vẽ' } });
  ma = r.j.chuoi.split('#')[1];
});
test.after(async () => { await M.dong(); });

test('không phiên → 401; thợ → 403 ở quản lý', async () => {
  const k = M.khach();
  for (const [m, p] of [['GET', '/api/cong-trinh'], ['GET', '/api/phong/abcdef1'], ['GET', '/api/anh/abcdef1'], ['GET', '/api/quan-ly/tai-khoan'], ['PUT', '/api/cong-trinh/abcdef1'], ['GET', '/api/toi']]) {
    const r = await k.goi(m, p); assert.equal(r.st, 401, m + ' ' + p); assert.equal(r.j.code, 'UNAUTHENTICATED');
  }
  for (const p of ['/api/quan-ly/tai-khoan', '/api/quan-ly/ma-ket-noi']) { const r = await T.goi('GET', p); assert.equal(r.st, 403); }
  assert.equal((await T.goi('POST', '/api/quan-ly/ma-ket-noi', { json: {} })).st, 403);
});

test('cookie không mở /api/do; Bearer không mở /api/phong', async () => {
  assert.equal((await T.goi('GET', '/api/do/phong')).st, 401);
  const r = await fetch(M.goc + '/api/cong-trinh', { headers: { authorization: 'Bearer ' + ma } });
  assert.equal(r.status, 401);
  const r2 = await fetch(M.goc + '/api/do/phong', { headers: { authorization: 'Bearer ' + ma } });
  assert.equal(r2.status, 200);
});

test('bat_doi_mk → 403 DOI_MK; khoá thợ → phiên chết ngay; quản lý không tự khoá', async () => {
  const tam = 'Tam-thoi-tho2-xx';
  const r = await Q.goi('POST', '/api/quan-ly/tai-khoan', { json: { ten: 'tho2', ten_hien: 'Thợ Hai', vai: 'tho', mat_khau_tam: tam } });
  assert.equal(r.st, 200);
  const k = M.khach(); const d = await k.goi('POST', '/api/dang-nhap', { json: { ten: 'tho2', mat_khau: tam } });
  assert.equal(d.st, 200); assert.equal(d.j.bat_doi_mk, true);
  assert.ok(d.setCookie[0].includes('HttpOnly') && d.setCookie[0].includes('Secure') && d.setCookie[0].includes('SameSite=Strict') && d.setCookie[0].includes('Path=/'));
  const x = await k.goi('GET', '/api/cong-trinh'); assert.equal(x.st, 403); assert.equal(x.j.code, 'DOI_MK');
  assert.equal((await k.goi('GET', '/api/toi')).st, 200);
  assert.equal((await k.goi('POST', '/api/doi-mat-khau', { json: { cu: tam, moi: 'tho2' } })).st, 422, 'mật khẩu ngắn / trùng tên');
  assert.equal((await k.goi('POST', '/api/doi-mat-khau', { json: { cu: tam, moi: 'Mat-khau-tho2-moi' } })).st, 200);
  assert.equal((await k.goi('GET', '/api/cong-trinh')).st, 200);
  await Q.goi('POST', `/api/quan-ly/tai-khoan/${r.j.id}/khoa`);
  assert.equal((await k.goi('GET', '/api/cong-trinh')).st, 401, 'khoá = phiên chết ngay');
  const l = await M.khach().goi('POST', '/api/dang-nhap', { json: { ten: 'tho2', mat_khau: 'Mat-khau-tho2-moi' } });
  assert.equal(l.st, 403);
  const toi = (await Q.goi('GET', '/api/quan-ly/tai-khoan')).j.tai_khoan.find(t => t.ten === 'quanly');
  assert.equal((await Q.goi('POST', `/api/quan-ly/tai-khoan/${toi.id}/khoa`)).st, 403);
  assert.ok(!JSON.stringify((await Q.goi('GET', '/api/quan-ly/tai-khoan')).j).includes('scrypt'), 'danh sách không trả băm');
  await Q.goi('POST', `/api/quan-ly/tai-khoan/${r.j.id}/mo-khoa`);
  assert.equal((await M.khach().goi('POST', '/api/dang-nhap', { json: { ten: 'tho2', mat_khau: 'Mat-khau-tho2-moi' } })).st, 200);
  // đặt lại mật khẩu: phiên cũ chết, đăng nhập lại phải đổi
  const k3 = M.khach(); await k3.goi('POST', '/api/dang-nhap', { json: { ten: 'tho2', mat_khau: 'Mat-khau-tho2-moi' } });
  await Q.goi('POST', `/api/quan-ly/tai-khoan/${r.j.id}/dat-lai-mk`, { json: { mat_khau_tam: 'Tam-moi-abc-123' } });
  assert.equal((await k3.goi('GET', '/api/toi')).st, 401);
  assert.equal((await M.khach().goi('POST', '/api/dang-nhap', { json: { ten: 'tho2', mat_khau: 'Tam-moi-abc-123' } })).j.bat_doi_mk, true);
});

test('POST thiếu X-MNDO / Origin lạ → 403', async () => {
  assert.equal((await T.goi('PUT', '/api/cong-trinh/ctabcdef', { json: { ten: 'x', ngay: '2026-11-05' }, khongMndo: true })).st, 403);
  assert.equal((await T.goi('PUT', '/api/cong-trinh/ctabcdef', { json: { ten: 'x', ngay: '2026-11-05' }, headers: { origin: 'https://evil.example' } })).st, 403);
  assert.equal((await M.khach().goi('POST', '/api/dang-nhap', { json: { ten: 'quanly', mat_khau: 'x' }, khongMndo: true })).st, 403);
  assert.equal((await T.goi('PUT', '/api/cong-trinh/ctabcdef', { json: { ten: 'x', ngay: '2026-11-05' }, headers: { origin: M.goc } })).st, 200);
});

test('CSDL không giữ mật khẩu / mã / mã phiên dạng thô; băm scrypt', async () => {
  M.mc.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  const tho = fs.readFileSync(path.join(M.dir, 'do.sqlite')).toString('latin1');
  const phien = T.cookie.split('=')[1];
  for (const s of [MK_THO, MK_QL, ma, phien]) assert.ok(!tho.includes(s), 'lộ: ' + s.slice(0, 6));
  const r = M.mc.db.get("SELECT mk FROM tai_khoan WHERE ten = 'tho1'");
  assert.match(r.mk, /^scrypt\$32768\$8\$1\$/);
});

test('ảnh: id lạ, chưa khai, xét theo byte, PNG / WebP / rác 415, quá cỡ 413, cỡ khác 422', async () => {
  const ct = idMoi('ct'); await taoCT(T, ct);
  const id = idMoi('ph'), a1 = idMoi('an'), a2 = idMoi('an');
  await luuPhong(T, id, ct, phongTho(), [{ id: a1, tuong: 0, w: 800, h: 600, ghi: '', ke: [] }, { id: a2, tuong: 1, w: 640, h: 480, ghi: '', ke: [] }]);
  const gui = (aid, body, ct2 = 'image/jpeg', idp = id) => T.goi('PUT', '/api/anh/' + aid, { body, headers: { 'content-type': ct2, 'x-phong': idp } });
  assert.equal((await T.goi('GET', '/api/anh/..%2Fx')).st, 404);
  assert.equal((await T.goi('GET', '/api/anh/../x')).st, 404);
  assert.equal((await gui('khongkhai1', jpegGia(800, 600))).st, 404, 'ảnh không có trong muc.anh');
  assert.equal((await gui(a1, jpegGia(800, 600), 'image/png')).st, 200, 'khai PNG mà byte là JPEG: nhận');
  assert.equal((await gui(a1, jpegGia(800, 600), 'image/png')).st, 200, 'gửi lại cùng tệp: 200');
  assert.equal((await gui(a1, jpegGia(800, 600, { du: 300 }))).st, 409, 'khác tệp mà id đã có');
  assert.equal((await gui(a2, pngGia(640, 480), 'image/png')).st, 415);
  assert.equal((await gui(a2, webpGia(640, 480), 'image/webp')).st, 415);
  assert.equal((await gui(a2, Buffer.from('xin chào đây không phải ảnh nhé 123456'))).st, 415);
  assert.equal((await gui(a2, jpegGia(640, 480, { du: 5 * 1024 * 1024 }))).st, 413);
  const c = await gui(a2, jpegGia(641, 480)); assert.equal(c.st, 422); assert.match(c.j.chi_tiet[0].loi, /khác cỡ/);
  assert.equal((await gui(a2, jpegGia(640, 480))).st, 200);
  const g = await T.goi('GET', '/api/anh/' + a2); assert.equal(g.st, 200); assert.equal(g.h.get('content-type'), 'image/jpeg');
  assert.equal((await M.khach().goi('GET', '/api/anh/' + a2)).st, 401, 'không phiên không thấy ảnh');
});

test('dữ liệu thô hỏng → 422; rev cũ → 409, ghi_de thì qua', async () => {
  const ct = idMoi('ct'); await taoCT(T, ct);
  const id = idMoi('ph');
  for (const p of [phongTho({ cao: 'cao lắm' }), phongTho({ mo: Array.from({ length: 300 }, (x, i) => ({ id: 'm' + i, tuong: 0, loai: 'cua', tu: 'trai', cach: 0, rong: 1, cao: 1, be: 0 })) }), phongTho({ ten: 'x'.repeat(10000) }), phongTho({ tuong: [] }), phongTho({ mo: [{ id: 'm1', tuong: 9, loai: 'cua', cach: 1 }] })]) {
    const r = await luuPhong(T, id, ct, p); assert.equal(r.st, 422, JSON.stringify(r.j).slice(0, 200)); assert.equal(r.j.code, 'INVALID'); assert.ok(r.j.chi_tiet.length);
  }
  assert.equal((await T.goi('PUT', '/api/phong/' + id, { body: '{hỏng', headers: { 'content-type': 'application/json' } })).st, 422);
  assert.equal((await T.goi('PUT', '/api/phong/' + id, { body: 'x'.repeat(1.2 * 1024 * 1024), headers: { 'content-type': 'application/json' } })).st, 413);
  const r1 = await luuPhong(T, id, ct, phongTho()); assert.equal(r1.st, 200); assert.equal(r1.j.rev, 1);
  const Q2 = await quanLy(M);
  const r2 = await luuPhong(Q2, id, ct, phongTho({ cao: 2800 }), [], { rev: 1 }); assert.equal(r2.j.rev, 2);
  const cu = await luuPhong(T, id, ct, phongTho({ cao: 2600 }), [], { rev: 1 });
  assert.equal(cu.st, 409); assert.equal(cu.j.code, 'CONFLICT'); assert.equal(cu.j.hien_tai.phong.cao, 2800);
  const de = await luuPhong(T, id, ct, phongTho({ cao: 2600 }), [], { rev: 1, ghi_de: true });
  assert.equal(de.st, 200); assert.equal(de.j.rev, 3);
  assert.equal((await T.goi('GET', '/api/phong/' + id)).j.phong.cao, 2600);
  // công trình chưa có
  assert.equal((await luuPhong(T, idMoi('ph'), 'chuaco123', phongTho())).st, 422);
});

test('chống đoán: 6 sai → khoá tên (đúng vẫn 401); 21 sai một IP → 429; Bearer sai 31 → 429', async () => {
  // máy chủ riêng để đếm IP không lẫn phép thử khác
  const { moMay: mo } = require('./tro-giup'), N = await mo();
  try {
    const q = await quanLy(N); await thoMoi(N, q, 'tho9', 'Thợ Chín');
    const k = N.khach();
    for (let i = 0; i < 6; i++) assert.equal((await k.goi('POST', '/api/dang-nhap', { json: { ten: 'tho9', mat_khau: 'sai-sai-sai-' + i } })).st, 401);
    const dung = await k.goi('POST', '/api/dang-nhap', { json: { ten: 'tho9', mat_khau: MK_THO } });
    assert.equal(dung.st, 401); assert.match(dung.j.error, /tạm khoá/);
    // IP: tổng số lần sai của IP này đã 7 (gồm lần đúng-mà-bị-khoá); thêm tên lạ cho đủ 20
    let st = 0; for (let i = 0; i < 13; i++) st = (await k.goi('POST', '/api/dang-nhap', { json: { ten: 'khongco' + i, mat_khau: 'x'.repeat(12) } })).st;
    assert.equal(st, 401);
    const r = await k.goi('POST', '/api/dang-nhap', { json: { ten: 'khongco99', mat_khau: 'x'.repeat(12) } });
    assert.equal(r.st, 429); assert.ok(Number(r.h.get('retry-after')) > 0);
    for (let i = 0; i < 30; i++) assert.equal((await fetch(N.goc + '/api/do/phong', { headers: { authorization: 'Bearer mn-' + 'a'.repeat(43) } })).status, 401);
    const b = await fetch(N.goc + '/api/do/phong', { headers: { authorization: 'Bearer mn-' + 'b'.repeat(43) } });
    assert.equal(b.status, 429); assert.ok(b.headers.get('retry-after'));
  } finally { await N.dong(); }
});

test('khởi động lại: quản lý đầu không tạo lại, biến mật khẩu đầu không đặt lại mật khẩu', async () => {
  const { taoMayChu } = require('../lib/may-chu');
  const mc = taoMayChu({ dataDir: M.dir, publicUrl: M.goc, quanLyMatKhauDau: 'khac-han-mat-khau-cu', lich: false });
  await mc.san;
  assert.equal(mc.db.get("SELECT COUNT(*) n FROM tai_khoan WHERE vai = 'quan_ly'").n, 1);
  mc.db.close();
});
