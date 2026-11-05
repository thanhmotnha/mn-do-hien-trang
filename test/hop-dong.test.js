'use strict';
// HỢP ĐỒNG với máy vẽ (BẮT BUỘC, mục 9.2): nạp đúng src/mncf-phong.js của kho mn-chenfeng (không phải bản vendor) và cho nó đọc
// câu trả lời của máy chủ THẬT. Không có tệp → phép thử HỎNG, không bỏ qua.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const NGUON = process.env.MNCF_PHONG || '/home/user/mn-chenfeng/src/mncf-phong.js';
const Ph = require(NGUON);
const Anh = require('../lib/anh');
const { moMay, quanLy, thoMoi, jpegGia, idMoi, phongTho, taoCT, luuPhong } = require('./tro-giup');

let M, Q, T, ma, goc, ct;
const goiMay = (p, mma = ma) => fetch(goc + p, { headers: { authorization: 'Bearer ' + mma } });
const dsMay = async () => { const r = await goiMay('/phong'); assert.equal(r.status, 200); return (await r.json()).phong; };

test.before(async () => {
  assert.ok(fs.existsSync(NGUON), 'thiếu mncf-phong.js của máy vẽ: ' + NGUON);
  M = await moMay(); Q = await quanLy(M); T = await thoMoi(M, Q);
  ct = idMoi('ct'); await taoCT(T, ct);
  const r = await Q.goi('POST', '/api/quan-ly/ma-ket-noi', { json: { nhan: 'Máy vẽ xưởng' } });
  assert.equal(r.st, 200);
  const k = Ph.docKetNoi(r.j.chuoi);
  assert.deepEqual(Object.keys(k), ['goc', 'ma']);
  assert.equal(k.goc, M.goc + '/api/do');
  ma = k.ma; goc = k.goc;
});
test.after(async () => { await M.dong(); });

test('1–2. phòng chữ nhật đủ số + ảnh kẻ 3600: máy vẽ đọc ra vẽ được', async () => {
  const id = idMoi('ph'), anhId = idMoi('an');
  const anh = [{ id: anhId, tuong: 0, w: 800, h: 600, ghi: 'mặt A', ke: [{ loai: 'kt', a: [80, 300], b: [720, 300], lien: 'tuong:0:dai' }] }];
  const r = await luuPhong(T, id, ct, phongTho({ ten: 'Phòng ngủ master', tuong: [{ ten: 'A', dai: 3600, re: 90 }, { ten: 'B', dai: 3000, re: 90 }, { ten: 'C', dai: 3600, re: 90 }, { ten: 'D', dai: 3000, re: 90 }] }), anh);
  assert.equal(r.st, 200, JSON.stringify(r.j)); assert.deepEqual(r.j.can_gui, [anhId]);
  const u = await T.goi('PUT', '/api/anh/' + anhId, { body: jpegGia(800, 600), headers: { 'content-type': 'image/jpeg', 'x-phong': id } });
  assert.equal(u.st, 200, JSON.stringify(u.j));
  const ds = Ph.phongDaDo(await dsMay(), {}), x = ds.find(d => d.khoa === ct + '/' + id);
  assert.ok(x);
  assert.equal(x.goi, 'co'); assert.equal(x.ve_duoc, true); assert.deepEqual(x.loi, []);
  assert.match(x.tom, /4 tường/); assert.match(x.tom, /10,8 m²/); assert.match(x.tom, /trần 2700/);
  assert.equal(x.ten, 'Phòng ngủ master'); assert.equal(x.ct, 'Nhà anh Hùng'); assert.equal(x.nguoi, 'Thợ Một');
  assert.ok(x.anh[0].net.length > 0); assert.equal(x.anh[0].chu[0].text, '3600'); assert.equal(x.anh_thieu, 0);
  assert.equal(JSON.stringify(Ph.chuanHoa(x.phong)), JSON.stringify(x.phong));
});

test('3. thiếu B + D: chưa vẽ được, lời đúng; đủ cạnh mà hở: một lời "chưa khép kín"', async () => {
  const id = idMoi('ph');
  await luuPhong(T, id, ct, phongTho({ ten: 'Thiếu', tuong: [{ ten: 'A', dai: 3600, re: 90 }, { ten: 'B', dai: 0, re: 90 }, { ten: 'C', dai: 3600, re: 90 }, { ten: 'D', dai: 0, re: 90 }] }));
  let x = Ph.phongDaDo(await dsMay(), {}).find(d => d.khoa === ct + '/' + id);
  assert.equal(x.ve_duoc, false); assert.deepEqual(x.loi.slice(0, 2), ['Tường B chưa có chiều dài.', 'Tường D chưa có chiều dài.']);
  assert.ok(!x.loi.some(t => /khép kín/.test(t)), x.loi);
  const id2 = idMoi('ph');
  await luuPhong(T, id2, ct, phongTho({ ten: 'Hở', tuong: [{ ten: 'A', dai: 3600, re: 90 }, { ten: 'B', dai: 3000, re: 90 }, { ten: 'C', dai: 3000, re: 90 }, { ten: 'D', dai: 3000, re: 90 }] }));
  x = Ph.phongDaDo(await dsMay(), {}).find(d => d.khoa === ct + '/' + id2);
  assert.equal(x.ve_duoc, false); assert.equal(x.loi.length, 1); assert.match(x.loi[0], /chưa khép kín/);
});

test('4–5. ảnh khai mà chưa gửi tệp → anh_thieu 1; gửi xong → sua_luc tăng, ảnh đúng cỡ, không còn APP1', async () => {
  const id = idMoi('ph'), anhId = idMoi('an');
  await luuPhong(T, id, ct, phongTho({ ten: 'Có ảnh' }), [{ id: anhId, tuong: 1, w: 640, h: 480, ghi: '', ke: [] }]);
  let x = Ph.phongDaDo(await dsMay(), {}).find(d => d.khoa === ct + '/' + id);
  assert.equal(x.anh_thieu, 1); assert.equal(x.anh[0].tren_may_chu, false); assert.equal(x.anh[0].mat, 'B');
  const daLay = { [x.khoa]: x.sua_luc };
  const u = await T.goi('PUT', '/api/anh/' + anhId, { body: jpegGia(640, 480), headers: { 'content-type': 'image/jpeg', 'x-phong': id } });
  assert.equal(u.st, 200);
  x = Ph.phongDaDo(await dsMay(), daLay).find(d => d.khoa === ct + '/' + id);
  assert.equal(x.anh_thieu, 0); assert.equal(x.moi, true, 'ảnh lên xong: máy vẽ thấy "mới" để lấy lại kèm ảnh');
  const a = await goiMay('/anh/' + anhId);
  assert.equal(a.status, 200); assert.equal(a.headers.get('content-type'), 'image/jpeg'); assert.equal(a.headers.get('x-content-type-options'), 'nosniff');
  const b = Buffer.from(await a.arrayBuffer());
  assert.deepEqual(Anh.co(b), { w: 640, h: 480 }); assert.equal(Anh.coApp1(b), false); assert.ok(!b.includes(Buffer.from('GPS')));
});

test('6. mã thu hồi → 401 ở cả hai cửa', async () => {
  const r = await Q.goi('POST', '/api/quan-ly/ma-ket-noi', { json: { nhan: 'Tạm' } }), k = Ph.docKetNoi(r.j.chuoi);
  assert.equal((await goiMay('/phong', k.ma)).status, 200);
  await Q.goi('DELETE', '/api/quan-ly/ma-ket-noi/' + r.j.id);
  for (const p of ['/phong', '/anh/an0000000001']) {
    const x = await goiMay(p, k.ma);
    assert.equal(x.status, 401); assert.deepEqual(await x.json(), { error: 'Mã kết nối không đúng hoặc đã bị thu hồi', code: 'UNAUTHENTICATED' });
  }
});

test('7. hơn 400 phòng → ≤ 400, sửa gần nhất đầu; phòng xoá / công trình lưu trữ không có', async () => {
  // chèn thẳng CSDL cho nhanh (cùng dạng máy chủ ghi)
  const db = M.mc.db, gui = JSON.stringify(require('../lib/goi').tinhGoi(phongTho(), [], require('../vendor/mncf-phong.js')));
  const tk = db.get("SELECT id FROM tai_khoan WHERE ten = 'tho1'").id;
  db.tx(() => { for (let i = 0; i < 420; i++) db.run("INSERT INTO muc (id, ct, ten, phong, gui, goi_tinh, nguoi_gui, tao_luc, sua_luc) VALUES (?, ?, ?, '{}', ?, '0.1.0', ?, 1, ?)", 'nhieu' + String(i).padStart(4, '0'), ct, 'P' + i, gui, tk, 1000 + i); });
  const id = idMoi('ph'); await luuPhong(T, id, ct, phongTho({ ten: 'Mới nhất' }));
  let ds = await dsMay();
  assert.ok(ds.length <= 400); assert.equal(ds[0].muc.id, id);
  for (let i = 1; i < ds.length; i++) assert.ok(ds[i - 1].sua_luc >= ds[i].sua_luc);
  await T.goi('DELETE', '/api/phong/' + id);
  ds = await dsMay(); assert.ok(!ds.some(d => d.muc.id === id), 'phòng đã xoá');
  const ct2 = idMoi('ct'); await taoCT(T, ct2, 'Lưu trữ'); const id2 = idMoi('ph'); await luuPhong(T, id2, ct2, phongTho());
  assert.ok((await dsMay()).some(d => d.muc.id === id2));
  await T.goi('POST', `/api/cong-trinh/${ct2}/luu-tru`);
  assert.ok(!(await dsMay()).some(d => d.ct.id === ct2), 'công trình lưu trữ');
  // dạng vỏ ngoài đúng PHONG_DO: thứ tự khoá
  const mau = require('./mau/phong-do.json').phong;
  assert.deepEqual(Object.keys(ds[0]), Object.keys(mau)); assert.deepEqual(Object.keys(ds[0].ct), Object.keys(mau.ct)); assert.deepEqual(Object.keys(ds[0].muc), Object.keys(mau.muc));
});
