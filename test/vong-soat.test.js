'use strict';
// Vòng soát đối kháng 0.1.0 (05/11/2026): mỗi lỗi máy chủ / gói `gui` đã tái hiện một phép thử. Lỗi phía điện thoại ở test/e2e/vong-soat.e2e.js.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const Ph = require('../vendor/mncf-phong.js'), G = require('../lib/goi.js'), Soat = require('../lib/soat.js');
const PhMay = require(process.env.MNCF_PHONG || '/home/user/mn-chenfeng/src/mncf-phong.js');
const { moMay, quanLy, thoMoi, jpegGia, idMoi, phongTho, taoCT, luuPhong, MK_THO, MK_QL } = require('./tro-giup');

const T4 = (a, b, c, d) => [{ ten: 'A', dai: a, re: 90 }, { ten: 'B', dai: b, re: 90 }, { ten: 'C', dai: c, re: 90 }, { ten: 'D', dai: d, re: 90 }];
const phong = (o = {}) => Object.assign({ ban: 1, ten: 'Phòng thử', cao: 2700, day: 110, hinh: 'chu_nhat', tuong: T4(3600, 3000, 3600, 3000), mo: [], can: [], dn: [], khung: [] }, o);
// máy vẽ đọc gói qua phongDaDo (mục "Phòng đã đo" của mn-chenfeng)
const mayVe = gui => PhMay.phongDaDo([{ ct: { id: 'ctabcdef', ten: 'CT', dia_chi: '', ngay: '2026-11-05', nguoi_do: '' }, nguoi_gui: 'Thợ', sua_luc: 1, muc: { id: 'phabcdef', loai: 'phong', ten: 'P', xong: true, ghi_chu: '', phong: {}, gui }, anh_co: [] }])[0];

test('R-cao (cao): cột / dầm để trống "Cao độ trên" trên tường thấp → lên tới TRẦN phòng, không tới cao tường', () => {
  const p = phong({ tuong: [{ ten: 'A', dai: 3600, re: 90, cao: 1000 }, { ten: 'B', dai: 3000, re: 90 }, { ten: 'C', dai: 3600, re: 90 }, { ten: 'D', dai: 3000, re: 90 }],
    can: [{ id: 'c1aaaaa', tuong: 0, loai: 'cot', cach: 100, rong: 300, nho: 200, z0: null, z1: null }, { id: 'c2aaaaa', tuong: 0, loai: 'dam', cach: 0, rong: 3600, nho: 200, z0: 2400, z1: null }] });
  const g = G.tinhGoi(p, [], Ph);
  assert.deepEqual(g.loi, []);
  assert.deepEqual(g.phong.can.map(c => c.z1), [2700, 2700]);
  const v = mayVe(g); assert.equal(v.ve_duoc, true, JSON.stringify(v.loi));
});

test('R-tran (trung bình): trần chưa đo → cột / dầm để trống Cao độ trên vào `bo`, không gửi z1 = 0, không lời lạc đề', () => {
  const p = phong({ cao: null, can: [{ id: 'c1aaaaa', tuong: 0, loai: 'cot', cach: 100, rong: 300, nho: 200, z0: null, z1: null }, { id: 'c2aaaaa', tuong: 1, loai: 'dam', cach: 0, rong: 3000, nho: 200, z0: 2400, z1: null }, { id: 'c3aaaaa', tuong: 2, loai: 'cot', cach: 100, rong: 300, nho: 200, z0: 0, z1: 2500 }] });
  const g = G.tinhGoi(p, [], Ph);
  assert.deepEqual(g.loi, ['Chưa có chiều cao trần.']);
  assert.deepEqual(g.phong.can.map(c => c.z1), [2500], 'chỉ cột đã gõ cao độ trên được đưa sang');
  assert.deepEqual(g.bo, ['Cột 1 (mặt A) — chờ đo trần', 'Dầm 1 (mặt B) — chờ đo trần']);
});

test('R-so (thấp): số âm / quá 100 000 → phanTich báo lỗi đúng chỗ (như soatPhong), điện thoại không gửi bản máy chủ sẽ từ chối', () => {
  const p = phong({ mo: [{ id: 'm1aaaaa', tuong: 0, loai: 'cua', tu: 'trai', cach: 200, rong: -900, cao: 2200, be: 0 }] });
  const A = G.phanTich(p, [], Ph);
  assert.ok(A.gui.loi.some(t => /Cửa đi 1 \(mặt A\): rộng -900 không hợp lệ/.test(t)), A.gui.loi.join(' | '));
  assert.ok(Soat.soatPhong(p, [], Ph).loi.length, 'máy chủ vẫn chặn');
  // ô khác: dài tường gõ nhầm 360 000 000
  const q = phong({ tuong: T4(360000000, 3000, 0, 0) });
  assert.ok(G.phanTich(q, [], Ph).gui.loi.some(t => /Tường A: dài 360000000 không hợp lệ/.test(t)));
  // điện thoại có hàm soát chung — đúng ngưỡng của máy chủ
  assert.deepEqual(G.soSai(p).map(s => s.truong), ['phong.mo[0].rong']);
  assert.deepEqual(G.soSai(q).map(s => s.truong), ['phong.tuong[0].dai']);
  assert.deepEqual(G.soSai(phong()), []);
});

test('R-go (cao): đọc số kiểu thợ gõ: "3 650", "3650mm", "3.600", "1.234,5"; số không hiểu = sai, không phải ô trống', () => {
  const d = G.docSo;
  assert.deepEqual(['3 650', '3650mm', '3650 mm', '3.600', '3,600', '1.234,5', '117,5', '117.5', '3 650', ' 2700 ', '0', ''].map(s => d(s)),
    [{ v: 3650 }, { v: 3650 }, { v: 3650 }, { v: 3600 }, { v: 3.6 }, { v: 1234.5 }, { v: 117.5 }, { v: 117.5 }, { v: 3650 }, { v: 2700 }, { v: 0 }, { v: null }]);
  for (const s of ['3 6 5', 'abc', '36o0', '3650cm', '-', '1,2,3']) assert.ok(d(s).sai, s);
  // tường ngắn bất thường (gõ "3,6" thay vì 3600): lưu ý vàng
  const A = G.phanTich(phong({ tuong: T4(3.6, 3000, 0, 0) }), [], Ph);
  assert.ok(A.luu_y.some(t => /Tường A chỉ dài 3,6 mm/.test(t)), A.luu_y.join(' | '));
});

test('R-quyen (cao): xoá phòng / lưu trữ / sửa công trình của người khác: chỉ người tạo (công trình / phòng) hoặc quản lý', async () => {
  const M = await moMay();
  try {
    const q = await quanLy(M), A = await thoMoi(M, q, 'thoa', 'A'), B = await thoMoi(M, q, 'thob', 'B');
    const ct = idMoi('ct'); await taoCT(A, ct);
    const ph = idMoi('ph'); assert.equal((await luuPhong(A, ph, ct, phongTho())).st, 200);
    assert.equal((await B.goi('DELETE', '/api/cong-trinh/' + ct)).st, 403);
    assert.equal((await B.goi('DELETE', '/api/phong/' + ph)).st, 403, 'B không xoá phòng của A');
    assert.equal((await A.goi('GET', `/api/cong-trinh/${ct}/phong`)).j.phong.length, 1);
    assert.equal((await B.goi('POST', `/api/cong-trinh/${ct}/luu-tru`)).st, 403);
    assert.equal((await B.goi('PUT', '/api/cong-trinh/' + ct, { json: { ten: 'đổi bởi B', dia_chi: '', ngay: '2026-11-05', nguoi_do: '' } })).st, 403);
    // B vẫn đo thêm phòng vào công trình của A (nhiều thợ cùng đo một nhà) và xoá được phòng CỦA MÌNH
    const phB = idMoi('ph'); assert.equal((await luuPhong(B, phB, ct, phongTho())).st, 200);
    assert.equal((await B.goi('DELETE', '/api/phong/' + phB)).st, 200);
    // A (người tạo công trình) xoá được phòng B tạo; quản lý làm được mọi thứ
    const phB2 = idMoi('ph'); await luuPhong(B, phB2, ct, phongTho());
    assert.equal((await A.goi('DELETE', '/api/phong/' + phB2)).st, 200);
    assert.equal((await q.goi('POST', `/api/cong-trinh/${ct}/luu-tru`)).st, 200);
    assert.equal((await q.goi('POST', `/api/cong-trinh/${ct}/bo-luu-tru`)).st, 200);
    // danh sách nói trước được người này có xoá / lưu trữ được không
    const ds = (await B.goi('GET', '/api/cong-trinh')).j.cong_trinh.find(c => c.id === ct);
    assert.equal(ds.cua_toi, false);
    assert.equal((await A.goi('GET', '/api/cong-trinh')).j.cong_trinh.find(c => c.id === ct).cua_toi, true);
    const dp = (await B.goi('GET', `/api/cong-trinh/${ct}/phong`)).j.phong;
    assert.deepEqual(dp.map(p => p.xoa_duoc), [false]);
  } finally { await M.dong(); }
});

test('R-khoa-ql (trung bình): người lạ gõ sai 5 lần không khoá được quản lý ở máy khác', async () => {
  const M = await moMay({ tinCf: true });
  try {
    await quanLy(M);
    const la = M.khach();
    for (let i = 0; i < 6; i++) assert.equal((await la.goi('POST', '/api/dang-nhap', { json: { ten: 'quanly', mat_khau: 'doan-' + i + 'xxxxxx' }, headers: { 'cf-connecting-ip': '203.0.113.9' } })).st, 401);
    // chính máy đoán bị khoá tên (kể cả gõ đúng)
    const r1 = await la.goi('POST', '/api/dang-nhap', { json: { ten: 'quanly', mat_khau: MK_QL }, headers: { 'cf-connecting-ip': '203.0.113.9' } });
    assert.equal(r1.st, 401); assert.match(r1.j.error, /tạm khoá/);
    // quản lý thật ở máy khác vẫn vào được
    const r2 = await M.khach().goi('POST', '/api/dang-nhap', { json: { ten: 'quanly', mat_khau: MK_QL }, headers: { 'cf-connecting-ip': '198.51.100.7' } });
    assert.equal(r2.st, 200, JSON.stringify(r2.j));
  } finally { await M.dong(); }
});

test('R-khoa-tk (thấp): tài khoản đã khoá — đúng hay sai mật khẩu đều cùng một câu trả lời', async () => {
  const M = await moMay();
  try {
    const q = await quanLy(M); await thoMoi(M, q, 'thoc', 'C');
    const idc = (await q.goi('GET', '/api/quan-ly/tai-khoan')).j.tai_khoan.find(t => t.ten === 'thoc').id;
    await q.goi('POST', `/api/quan-ly/tai-khoan/${idc}/khoa`);
    const x = M.khach();
    const sai = await x.goi('POST', '/api/dang-nhap', { json: { ten: 'thoc', mat_khau: 'sai-sai-sai-1' } });
    const dung = await x.goi('POST', '/api/dang-nhap', { json: { ten: 'thoc', mat_khau: MK_THO } });
    assert.equal(sai.st, 401); assert.equal(dung.st, 401);
    assert.deepEqual(dung.j, sai.j);
    assert.ok(!dung.setCookie.some(c => /__Host-mndo=[^;]/.test(c)), 'không có phiên');
  } finally { await M.dong(); }
});

test('R-dia (trung bình): trần dung lượng ảnh — theo phòng và tổng; ảnh bị thay chưa ai đọc thì xoá ngay', async () => {
  const M = await moMay({ anhPhongMb: 2.5, anhTongMb: 3.2 });
  try {
    const q = await quanLy(M), T = await thoMoi(M, q);
    const ct = idMoi('ct'); await taoCT(T, ct);
    const ph = idMoi('ph'), dsId = n => Array.from({ length: n }, () => idMoi('an'));
    let rev = 0;
    const dot = async ids => {
      const r = await luuPhong(T, ph, ct, phongTho(), ids.map(id => ({ id, tuong: 0, w: 100, h: 80, ghi: '', ke: [] })), { rev }); assert.equal(r.st, 200); rev = r.j.rev;
      const st = []; for (const id of ids) st.push((await T.goi('PUT', '/api/anh/' + id, { body: jpegGia(100, 80, { du: 700 * 1024 }), headers: { 'x-phong': ph, 'content-type': 'image/jpeg' } })).st);
      return st;
    };
    assert.deepEqual(await dot(dsId(3)), [200, 200, 200]);
    // thay cả 3 ảnh bằng 3 ảnh mới: 3 ảnh cũ chưa máy vẽ nào đọc → xoá ngay khỏi đĩa, ảnh mới vẫn lên
    assert.deepEqual(await dot(dsId(3)), [200, 200, 200]);
    assert.equal(fs.readdirSync(path.join(M.dir, 'anh', ct)).filter(f => f.endsWith('.jpg')).length, 3);
    // trần mỗi phòng 2,5 MB: ảnh thứ 4 bị từ chối 507 với lời rõ
    const id4 = idMoi('an'), cu = (await T.goi('GET', '/api/phong/' + ph)).j;
    await luuPhong(T, ph, ct, phongTho(), cu.anh.concat([{ id: id4, tuong: 0, w: 100, h: 80, ghi: '', ke: [] }]), { rev: cu.rev });
    const r4 = await T.goi('PUT', '/api/anh/' + id4, { body: jpegGia(100, 80, { du: 700 * 1024 }), headers: { 'x-phong': ph, 'content-type': 'image/jpeg' } });
    assert.equal(r4.st, 507); assert.match(r4.j.error, /phòng này đã có .* ảnh/);
    // trần tổng 3,2 MB: phòng khác cũng bị chặn khi tổng đầy
    const ph2 = idMoi('ph'), a = idMoi('an'), b = idMoi('an');
    await luuPhong(T, ph2, ct, phongTho(), [{ id: a, tuong: 0, w: 100, h: 80, ghi: '', ke: [] }, { id: b, tuong: 0, w: 100, h: 80, ghi: '', ke: [] }]);
    assert.equal((await T.goi('PUT', '/api/anh/' + a, { body: jpegGia(100, 80, { du: 700 * 1024 }), headers: { 'x-phong': ph2, 'content-type': 'image/jpeg' } })).st, 200);
    const rb = await T.goi('PUT', '/api/anh/' + b, { body: jpegGia(100, 80, { du: 700 * 1024 }), headers: { 'x-phong': ph2, 'content-type': 'image/jpeg' } });
    assert.equal(rb.st, 507); assert.match(rb.j.error, /đầy/);
    // quản lý thấy dung lượng
    const dl = (await q.goi('GET', '/api/quan-ly/dung-luong')).j;
    assert.ok(dl.anh_bytes > 0 && dl.tran_bytes === Math.round(3.2 * 1024 * 1024) && typeof dl.dia_trong === 'number');
    // ảnh máy vẽ ĐÃ đọc thì giữ (30 ngày) khi bị thay
    const ma = (await q.goi('POST', '/api/quan-ly/ma-ket-noi', { json: { nhan: 'x' } })).j.chuoi.split('#')[1];
    assert.equal((await fetch(M.goc + '/api/do/anh/' + a, { headers: { authorization: 'Bearer ' + ma } })).status, 200);
    const c2 = (await T.goi('GET', '/api/phong/' + ph2)).j;
    await luuPhong(T, ph2, ct, phongTho(), [], { rev: c2.rev });
    assert.ok(fs.existsSync(path.join(M.dir, 'anh', ct, a + '.jpg')), 'ảnh máy vẽ đã đọc còn giữ');
  } finally { await M.dong(); }
});

test('R-dua (thấp): hai lần tải cùng mã ảnh song song → không 500, tệp khớp bản ghi', async () => {
  const M = await moMay();
  try {
    const q = await quanLy(M), A = await thoMoi(M, q);
    const ct = idMoi('ct'); await taoCT(A, ct);
    for (let k = 0; k < 4; k++) {
      const ph = idMoi('ph'), aid = idMoi('an');
      await luuPhong(A, ph, ct, phongTho(), [{ id: aid, tuong: 0, w: 100, h: 80, ghi: '', ke: [] }]);
      const gui = j => A.goi('PUT', '/api/anh/' + aid, { body: j, headers: { 'x-phong': ph, 'content-type': 'image/jpeg' } });
      const rs = await Promise.all([gui(jpegGia(100, 80, { du: 300000 })), gui(jpegGia(100, 80, { du: 300001 }))]);
      assert.ok(rs.every(x => x.st < 500), rs.map(x => x.st).join(','));
      assert.ok(rs.some(x => x.st === 200));
      const row = M.mc.db.get('SELECT sha256, bytes FROM anh WHERE id = ?', aid);
      const tep = fs.readFileSync(path.join(M.dir, 'anh', ct, aid + '.jpg'));
      assert.equal(tep.length, row.bytes); assert.equal(crypto.createHash('sha256').update(tep).digest('hex'), row.sha256);
    }
  } finally { await M.dong(); }
});

test('R-lap (cao): gửi lại sau khi mất trả lời không ra 409 oan; máy khác chen giữa vẫn 409', async () => {
  const M = await moMay();
  try {
    const q = await quanLy(M), T = await thoMoi(M, q), B = await thoMoi(M, q, 'thob', 'B');
    const ct = idMoi('ct'); await taoCT(T, ct);
    const ph = idMoi('ph'), may = 'mayaaaa1111';
    assert.equal((await luuPhong(T, ph, ct, phongTho(), [], { rev: 0, may })).j.rev, 1);
    // lần gửi rev 1 tới máy chủ (rev → 2) nhưng mất trả lời; máy gửi lại vẫn rev 1, đã sửa thêm
    assert.equal((await luuPhong(T, ph, ct, phongTho({ cao: 2750 }), [], { rev: 1, may })).j.rev, 2);
    const lai = await luuPhong(T, ph, ct, phongTho({ cao: 2760 }), [], { rev: 1, may });
    assert.equal(lai.st, 200, JSON.stringify(lai.j).slice(0, 200)); assert.equal(lai.j.rev, 3);
    // máy khác (B) sửa sau đó — máy này còn rev 1 thì phải hỏi
    assert.equal((await luuPhong(B, ph, ct, phongTho({ cao: 2800 }), [], { rev: 3, may: 'maybbbb2222' })).j.rev, 4);
    const xd = await luuPhong(T, ph, ct, phongTho({ cao: 2770 }), [], { rev: 1, may });
    assert.equal(xd.st, 409); assert.equal(xd.j.hien_tai.phong.cao, 2800);
    // máy không gửi mã máy (bản cũ): như trước
    assert.equal((await luuPhong(T, ph, ct, phongTho(), [], { rev: 1 })).st, 409);
  } finally { await M.dong(); }
});

test('R-410 (trung bình): ảnh của phòng / công trình đã xoá → 410 (điện thoại thôi gửi), ảnh chưa khai → 404 CHUA_KHAI', async () => {
  const M = await moMay();
  try {
    const q = await quanLy(M), T = await thoMoi(M, q);
    const ct = idMoi('ct'); await taoCT(T, ct);
    const ph = idMoi('ph'), a = idMoi('an');
    await luuPhong(T, ph, ct, phongTho(), [{ id: a, tuong: 0, w: 100, h: 80, ghi: '', ke: [] }]);
    const gui = (id, idp = ph) => T.goi('PUT', '/api/anh/' + id, { body: jpegGia(100, 80), headers: { 'x-phong': idp, 'content-type': 'image/jpeg' } });
    const k = await gui(idMoi('an')); assert.equal(k.st, 404); assert.equal(k.j.code, 'CHUA_KHAI');
    await q.goi('DELETE', '/api/phong/' + ph);
    const x = await gui(a); assert.equal(x.st, 410); assert.equal(x.j.code, 'GONE');
    const ph2 = idMoi('ph'), b = idMoi('an');
    await luuPhong(T, ph2, ct, phongTho(), [{ id: b, tuong: 0, w: 100, h: 80, ghi: '', ke: [] }]);
    await T.goi('DELETE', '/api/cong-trinh/' + ct);
    assert.equal((await gui(b, ph2)).st, 410);
    const kc = await gui(b, 'khongcophong1'); assert.equal(kc.st, 404, 'phòng chưa lên máy chủ: điện thoại gửi phòng trước'); assert.equal(kc.j.code, 'CHUA_CO_PHONG');
  } finally { await M.dong(); }
});

test('R-env (cao): bước "Ghi .env" của workflow giữ nguyên mật khẩu có $ ` # " \' và không chạy lệnh', () => {
  const y = fs.readFileSync(path.join(__dirname, '..', '.github/workflows/deploy.yml'), 'utf8');
  // không dán bí mật thẳng vào kịch bản: mọi ${{ secrets.* }} chỉ được nằm trong khối env:
  const run = []; let dang = false, thut = 0;
  for (const dong of y.split('\n')) {
    const m = /^(\s*)(- )?run: \|\s*$/.exec(dong);
    if (m) { dang = true; thut = m[1].length + (m[2] ? 2 : 0); continue; }
    if (dang) { if (dong.trim() && dong.search(/\S/) <= thut) dang = false; else { run.push(dong); continue; } }
  }
  assert.ok(!run.join('\n').includes('${{ secrets'), 'bí mật nằm trong run:');
  // chạy đúng đoạn ghi .env (nằm giữa hai dấu) với một mật khẩu hiểm — bằng sh (POSIX): phép thử còn chạy trong node:22-alpine của workflow
  const m = /# ghi-env:bat-dau\n([\s\S]*?)# ghi-env:het/.exec(y); assert.ok(m, 'thiếu dấu ghi-env');
  const kb = m[1].split('\n').map(s => s.replace(/^ {10}/, '')).join('\n');
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'mndo-env-'));
  const MK = 'Mk$HOME`echo PWNED`#ab"c $(id) 12345 \\n';
  execFileSync('sh', ['-e', '-c', kb], { cwd: dir, env: Object.assign({}, process.env, { MNDO_PUBLIC_URL: 'https://do.motnha.vn', MNDO_QL_TEN: 'quanly', MNDO_QL_MK: MK }) });
  const env = fs.readFileSync(path.join(dir, '.env'), 'utf8');
  assert.ok(!/PWNED|uid=/.test(env), env);
  assert.ok(!env.includes('QUAN_LY_MAT_KHAU_DAU'), 'mật khẩu không ghi vào .env (đi thẳng qua biến môi trường của docker compose)');
  assert.equal((fs.statSync(path.join(dir, '.env')).mode & 0o077), 0, '.env chỉ chủ đọc');
  // mật khẩu có xuống dòng → dừng, nói rõ
  assert.throws(() => execFileSync('sh', ['-e', '-c', kb], { cwd: dir, stdio: 'pipe', env: Object.assign({}, process.env, { MNDO_PUBLIC_URL: 'https://x', MNDO_QL_TEN: 'quanly', MNDO_QL_MK: 'a\nb' }) }));
  // compose chuyển mật khẩu nguyên chữ: dạng "- TÊN" (không "=" / không ${…}) thì compose không nội suy
  const c = fs.readFileSync(path.join(__dirname, '..', 'docker-compose.yml'), 'utf8');
  assert.match(c, /^\s+- QUAN_LY_MAT_KHAU_DAU\s*(#.*)?$/m);
  assert.ok(!/QUAN_LY_MAT_KHAU_DAU\s*[:=]/.test(c));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('nâng CSDL bản 1 → 2: giữ dữ liệu, người tạo phòng = người gửi', () => {
  const os = require('node:os'), csdl = require('../lib/csdl'), { DatabaseSync } = require('node:sqlite');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mndo-csdl-'));
  const d = new DatabaseSync(path.join(dir, 'do.sqlite'));
  d.exec(csdl.LUOC_DO); d.exec('PRAGMA user_version=1');
  d.exec("INSERT INTO tai_khoan (id, ten, ten_hien, vai, mk, tao_luc) VALUES (7, 'tho', 'Thợ', 'tho', 'x', 1)");
  d.exec("INSERT INTO cong_trinh (id, ten, ngay, tao_boi, tao_luc, sua_luc) VALUES ('ctabcdef', 'CT', '2026-11-05', 7, 1, 1)");
  d.exec("INSERT INTO muc (id, ct, ten, phong, gui, goi_tinh, nguoi_gui, tao_luc, sua_luc) VALUES ('phabcdef', 'ctabcdef', 'P', '{}', '{}', '0.1.0', 7, 1, 1)");
  d.close();
  const db = csdl.mo(dir);
  assert.equal(db.get('PRAGMA user_version').user_version, 2);
  assert.deepEqual(db.get('SELECT tao_boi, may, goc FROM muc'), { tao_boi: 7, may: null, goc: null });
  db.close(); fs.rmSync(dir, { recursive: true, force: true });
});
