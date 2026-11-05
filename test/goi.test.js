'use strict';
// Hàm thuần tính gói `gui` (lib/goi.js) — mục 9.1 của thiết kế.
const test = require('node:test'), assert = require('node:assert/strict');
const Ph = require('../vendor/mncf-phong.js'), G = require('../lib/goi.js');
const MAU = require('./mau/phong-do.json').phong;

const T4 = (a, b, c, d) => [{ ten: 'A', dai: a, re: 90 }, { ten: 'B', dai: b, re: 90 }, { ten: 'C', dai: c, re: 90 }, { ten: 'D', dai: d, re: 90 }];
const phong = (o = {}) => Object.assign({ ban: 1, ten: 'Phòng thử', cao: 2700, day: 110, hinh: 'chu_nhat', tuong: T4(3600, 3000, 3600, 3000), mo: [], can: [], dn: [], khung: [] }, o);
const goi = (p, anh) => G.tinhGoi(p, anh || [], Ph);
const daiCua = gu => gu.phong.tuong.map(t => t.dai);

test('1. chữ nhật đủ 4 cạnh: không suy, không lỗi, đúng dạng chuanHoa', () => {
  const g = goi(phong());
  assert.deepEqual(daiCua(g), [3600, 3000, 3600, 3000]);
  assert.deepEqual(g.loi, []);
  assert.equal(JSON.stringify(Ph.chuanHoa(g.phong)), JSON.stringify(g.phong));
  assert.deepEqual(Object.keys(g.phong), ['ban', 'ten', 'cao', 'day', 'tuong', 'mo', 'can', 'dn', 'khung']);
});

test('2. suy cạnh: thiếu 1, thiếu 2 kề nhau, thiếu 2 song song', () => {
  assert.deepEqual(daiCua(goi(phong({ tuong: T4(3600, 3000, 0, 3000) }))), [3600, 3000, 3600, 3000]);
  const g2 = goi(phong({ tuong: T4(3600, 3000, 0, 0) }));
  assert.deepEqual(daiCua(g2), [3600, 3000, 3600, 3000]); assert.deepEqual(g2.loi, []);
  const g3 = goi(phong({ tuong: T4(3600, 0, 3600, 0) }));
  assert.deepEqual(daiCua(g3), [3600, 0, 3600, 0]);
  assert.deepEqual(g3.loi, ['Tường B chưa có chiều dài.', 'Tường D chưa có chiều dài.', 'Tường B và tường D song song — đo ít nhất một trong hai.']);
  // phân tích: biết tường nào tự suy (điện thoại hiện "≈ 3600 (tự suy)")
  assert.deepEqual(G.phanTich(phong({ tuong: T4(3600, 3000, 0, 0) }), [], Ph).suy, { 2: 3600, 3: 3000 });
});

test('3. thiếu 3 cạnh, nghiệm âm, lệch vuông góc', () => {
  const g = goi(phong({ tuong: T4(3600, 0, 0, 0) }));
  assert.ok(g.loi.includes('Còn 3 tường chưa đo — máy chỉ suy được tối đa 2 tường (không song song). Đo thêm 1 tường.'), g.loi);
  assert.deepEqual(g.loi.slice(0, 3), ['Tường B chưa có chiều dài.', 'Tường C chưa có chiều dài.', 'Tường D chưa có chiều dài.']);
  const am3 = G.suyTuong([{ ten: 'A', dai: 3600, re: 90 }, { ten: 'B', dai: 3000, re: 90 }, { ten: 'C', dai: 5000, re: 90 }, { ten: 'D', dai: 0, re: 90 }]);
  // C dài hơn A 1400: D phải chạy chéo mới khép → các tường đã đo lệch nhau theo chiều vuông góc với D
  assert.ok(am3.loi.some(t => /lệch nhau 1400 mm theo chiều vuông góc với tường D/.test(t)), am3.loi);
  const lech = goi(phong({ tuong: T4(3600, 3000, 3625, 0) }));
  assert.deepEqual(lech.loi.slice(0, 2), ['Tường D chưa có chiều dài.', 'Không suy được tường D: các tường đã đo lệch nhau 25 mm theo chiều vuông góc với tường D — đo lại, hoặc đo luôn tường D.']);
  assert.equal(lech.phong.tuong[3].dai, 0);
  const tg = G.suyTuong([{ ten: 'A', dai: 1000, re: 120 }, { ten: 'B', dai: 1000, re: 120 }, { ten: 'C', dai: 0, re: 120 }]);
  assert.deepEqual(tg.suy, { 2: 1000 }, 'tam giác đều');
  const amThat = G.suyTuong([{ ten: 'A', dai: 1000, re: 90 }, { ten: 'B', dai: 1000, re: 90 }, { ten: 'C', dai: 3000, re: 90 }, { ten: 'D', dai: 1000, re: 90 }, { ten: 'E', dai: 0, re: 0 }]);
  // năm tường, E cùng hướng A: A + E = C theo x → E = 2000. C 500 → E = −500: nghiệm âm, không chừa chỗ
  assert.deepEqual(amThat.suy, { 4: 2000 });
  const amHong = G.suyTuong([{ ten: 'A', dai: 1000, re: 90 }, { ten: 'B', dai: 1000, re: 90 }, { ten: 'C', dai: 500, re: 90 }, { ten: 'D', dai: 1000, re: 90 }, { ten: 'E', dai: 0, re: 0 }]);
  assert.deepEqual(amHong.loi, ['Tường E chưa có chiều dài.', 'Không suy được tường E: các tường còn lại không chừa chỗ cho nó (kiểm tra chiều dài và hướng rẽ).']);
});

test('4. chữ L thiếu 2 cạnh không song song, góc xiên', () => {
  // chữ L: A 4000 → B 3000 → C 1500 → D 1200 (lồi) → E 2500 → F 1800
  const L = [[4000, 90], [3000, 90], [1500, 90], [1200, -90], [2500, 90], [1800, 90]];
  const H0 = Ph.hinhHoc({ cao: 2700, tuong: L.map(([d, r], i) => ({ ten: Ph.tenTuong(i), dai: d, re: r })) });
  assert.ok(H0.khep.kin, 'mẫu chữ L khép kín');
  const tuong = L.map(([d, r], i) => ({ ten: Ph.tenTuong(i), dai: i === 2 || i === 5 ? 0 : d, re: r }));
  const g = goi(phong({ tuong }));
  assert.deepEqual(daiCua(g), L.map(x => x[0]));
  assert.ok(Ph.hinhHoc(g.phong).khep.kin);
  assert.deepEqual(g.loi, []);
  // góc xiên: hình thang A 3000 (re 90) → B 2000 (re 90) → C trống (re 45) → D trống chạy chéo về đầu A (re 135) — C, D không song song
  const X = [{ ten: 'A', dai: 3000, re: 90 }, { ten: 'B', dai: 2000, re: 90 }, { ten: 'C', dai: 0, re: 45 }, { ten: 'D', dai: 0, re: 135 }];
  const gx = goi(phong({ tuong: X }));
  assert.ok(Ph.hinhHoc(gx.phong).khep.kin, JSON.stringify([daiCua(gx), gx.loi]));
  assert.deepEqual(daiCua(gx), [3000, 2000, 1000, 2828.4]);
  assert.deepEqual(gx.loi, []);
});

test('5. góc không đủ 360 / đủ cạnh mà hở', () => {
  const g = goi(phong({ tuong: [{ ten: 'A', dai: 3600, re: 90 }, { ten: 'B', dai: 3000, re: 90 }, { ten: 'C', dai: 3600, re: 90 }, { ten: 'D', dai: 0, re: 80 }] }));
  assert.equal(g.loi[0], 'Phòng chưa khép kín: tổng các góc rẽ là 350° (phòng kín phải đủ 360°). Kiểm tra cột "Rẽ" của từng tường.');
  const ho = goi(phong({ tuong: T4(3600, 3000, 3000, 3000) }));
  assert.equal(ho.loi.length, 1);
  assert.match(ho.loi[0], /chưa khép kín: điểm cuối cách điểm đầu 600 mm/);
  // điện thoại: gợi ý để tường A hoặc C tự suy
  assert.deepEqual(G.phanTich(phong({ tuong: T4(3600, 3000, 3000, 3000) }), [], Ph).goi_y_suy, [0, 2]);
});

test('6. chi tiết: thiếu số → bo; đo từ đầu phải; tường chưa biết dài; cửa vượt tường', () => {
  const p = phong({
    mo: [{ id: 'm1', tuong: 2, loai: 'cua', tu: 'phai', cach: 300, rong: 900, cao: 2200, be: null }, { id: 'm2', tuong: 0, loai: 'cua_so', tu: 'trai', cach: 500, rong: 1200, cao: 1400, be: null }],
    can: [{ id: 'c1', tuong: 1, loai: 'dam', tu: 'trai', cach: 0, rong: 3000, nho: 250, z0: 2400, z1: null }],
    dn: [{ id: 'd1', tuong: 0, loai: 'o_dien', tu: 'trai', cach: 400, cao: null }, { id: 'd2', tuong: 0, loai: 'o_dien', tu: 'phai', cach: 600, cao: 300 }, { id: 'd3', tuong: 3, loai: 'thoat_san', tu: 'trai', cach: 800, ra: 250 }],
  });
  const g = goi(p);
  assert.deepEqual(g.phong.mo, [{ tuong: 2, loai: 'cua', cach: 2400, rong: 900, cao: 2200, be: 0 }]);
  assert.deepEqual(g.phong.can, [{ tuong: 1, loai: 'dam', cach: 0, rong: 3000, nho: 250, z0: 2400, z1: 2700 }]);
  assert.deepEqual(g.phong.dn, [{ tuong: 0, loai: 'o_dien', cach: 3000, cao: 300 }, { tuong: 3, loai: 'thoat_san', cach: 800, ra: 250 }]);
  assert.deepEqual(g.bo, ['Cửa sổ 1 (mặt A)', 'Ổ điện 1 (mặt A)']);
  assert.equal(JSON.stringify(Ph.chuanHoa(g.phong)), JSON.stringify(g.phong));
  // đo từ đầu phải trên tường chưa biết dài → bo
  const p2 = phong({ tuong: T4(3600, 0, 3600, 0), mo: [{ id: 'm1', tuong: 1, loai: 'cua', tu: 'phai', cach: 300, rong: 900, cao: 2200, be: 0 }] });
  assert.deepEqual(goi(p2).bo, ['Cửa đi 1 (mặt B)']);
  // cửa rộng hơn tường: lời của hinhHoc
  const p3 = phong({ mo: [{ id: 'm1', tuong: 2, loai: 'cua', tu: 'trai', cach: 200, rong: 5000, cao: 2200, be: 0 }] });
  assert.ok(goi(p3).loi.some(t => /vượt ra ngoài tường C/.test(t)), goi(p3).loi);
  // ô thiếu của từng chi tiết (điện thoại hiện "thiếu: cao")
  assert.deepEqual(G.phanTich(p, [], Ph).thieu.dn, [['cao'], [], []]);
  // chi tiết của tường đã xoá: bỏ hẳn
  assert.deepEqual(goi(phong({ dn: [{ id: 'x', tuong: 9, loai: 'o_dien', tu: 'trai', cach: 1, cao: 1 }] })).bo, []);
});

test('7. dựng lại đúng PHONG_DO của máy vẽ (trang đo 0.5.0)', () => {
  const tho = {
    ban: 1, ten: 'Phòng ngủ master', cao: 2700, day: 110, hinh: 'chu_nhat', tuong: T4(3600, 3000, 0, 0),
    mo: [{ id: 'm1', tuong: 2, loai: 'cua', tu: 'trai', cach: 200, rong: 900, cao: 2200, be: 0 }],
    can: [{ id: 'c1', tuong: 1, loai: 'cot', tu: 'trai', cach: 1000, rong: 300, nho: 200, z0: 0, z1: 2700 }],
    dn: [{ id: 'd1', tuong: 0, loai: 'o_dien', tu: 'trai', cach: 400, cao: null }], khung: [],
  };
  const anh = [
    { id: 'anh000000001', tuong: 0, w: 800, h: 600, ghi: 'mặt có cửa sổ', ke: [{ loai: 'kt', a: [80, 300], b: [720, 300], lien: 'tuong:0:dai' }, { loai: 'chi', a: [400, 120], b: [480, 240], text: '' }, { loai: 'chu', a: [160, 120], text: 'ổ điện cũ' }] },
    { id: 'anh000000002', tuong: null, w: 600, h: 800, ghi: 'toàn cảnh', ke: [] }];
  const g = goi(tho, anh), m = MAU.muc.gui;
  for (const k of ['ban', 'phong', 'bo', 'loi']) assert.equal(JSON.stringify(g[k]), JSON.stringify(m[k]), k);
  assert.equal(JSON.stringify(g.anh[1]), JSON.stringify(m.anh[1]));
  const a = g.anh[0], b = m.anh[0];
  for (const k of ['id', 'tuong', 'w', 'h', 'ghi', 'co', 'chu']) assert.equal(JSON.stringify(a[k]), JSON.stringify(b[k]), k);
  assert.equal(JSON.stringify(a.net.slice(0, 4)), JSON.stringify(b.net.slice(0, 4)));
  // hai đầu mũi tên của mẫu là số viết tay: lệch ≤ 0,15
  for (const i of [4, 5]) for (let k = 0; k < 4; k++) assert.ok(Math.abs(a.net[i][k] - b.net[i][k]) <= 0.15, `net[${i}][${k}] ${a.net[i][k]} ~ ${b.net[i][k]}`);
  // máy vẽ đọc gói này ra đúng như đọc mẫu
  const ra = Ph.phongDaDo([Object.assign({}, MAU, { muc: Object.assign({}, MAU.muc, { gui: g }) })], {})[0];
  assert.equal(ra.ve_duoc, true); assert.match(ra.tom, /10,8 m²/);
});

test('8. veKe: dọc / xiên, nét ngắn, kẹp mép, lien, "?", trần', () => {
  const lay = l => (l === 'tuong:0:dai' ? 3600 : l === 'mo:m1:rong' ? 1250.5 : null);
  const d = G.veKe([{ loai: 'kt', a: [100, 500], b: [100, 100], text: 'x' }], 800, 600, lay);
  assert.equal(d.chu[0].goc, 90, 'dọc: chữ quay 90 (đọc từ trên xuống), không −90');
  assert.ok(d.chu[0].goc > -90 && d.chu[0].goc <= 90);
  const x = G.veKe([{ loai: 'kt', a: [700, 500], b: [100, 100], lien: 'mo:m1:rong' }], 800, 600, lay);
  assert.ok(x.chu[0].goc > -90 && x.chu[0].goc <= 90); assert.equal(x.chu[0].text, '1250,5');
  assert.deepEqual(G.veKe([{ loai: 'kt', a: [10, 10], b: [12, 12] }], 800, 600, lay).net, [], 'nét < 4 px bị bỏ');
  const k = G.veKe([{ loai: 'kt', a: [-50, 300], b: [5000, 300], lien: 'can:c9:rong' }], 800, 600, lay);
  assert.deepEqual(k.net[0], [0, 300, 800, 300]); assert.equal(k.chu[0].text, '?');
  assert.equal(G.veKe([{ loai: 'kt', a: [0, 0], b: [100, 0], text: '1200', lien: 'mo:zz:rong' }], 800, 600, lay).chu[0].text, '1200', 'số liên kết chưa có → chữ gõ tay');
  const nhieu = G.veKe(Array.from({ length: 400 }, () => ({ loai: 'kt', a: [0, 0], b: [100, 0], text: '1' })), 800, 600, lay);
  assert.equal(nhieu.net.length, 450);
  // lien lấy số HIỆN TẠI: sửa số trong phòng thì ảnh đổi
  const p = phong({ tuong: T4(3600, 3000, 0, 0) }), a = [{ id: 'anh00001', tuong: 0, w: 800, h: 600, ke: [{ loai: 'kt', a: [0, 300], b: [800, 300], lien: 'tuong:2:dai' }] }];
  assert.equal(goi(p, a).anh[0].chu[0].text, '3600', 'tường tự suy: lấy số đã suy');
  p.tuong[0].dai = 3700; assert.equal(goi(p, a).anh[0].chu[0].text, '3700');
});

test('9. gói không mang goc / da_ve / khung / con / id', () => {
  const p = phong({ goc: [1, 2, 3], da_ve: { n: 1 }, khung: [{ ten: 'K', tuong: 0, cach: 0, rong: 1000, cao: 2000, sau: 600 }], con: [{ tuong: 0, rong: 1500, sau: 1800 }], id: 'P1', huong: 30, ghep: { phong: 'P2' }, nguon_do: 'x' });
  const g = goi(p);
  assert.deepEqual(Object.keys(g.phong), ['ban', 'ten', 'cao', 'day', 'tuong', 'mo', 'can', 'dn', 'khung']);
  assert.deepEqual(g.phong.khung, []);
  assert.ok(!/"(goc|da_ve|con|id|huong|ghep|nguon_do)"/.test(JSON.stringify(g.phong)));
});

test('10. thiếu trần: không điền 2700 thay thợ', () => {
  const g = goi(phong({ cao: null }));
  assert.equal(g.phong.cao, 0); assert.ok(g.loi.includes('Chưa có chiều cao trần.'));
});
