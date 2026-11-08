'use strict';
// "Cửa & vách kính" (0.3.0) trên điện thoại 390 px: thêm tay ba nhóm (cửa gỗ / cửa nhôm / vách kính tắm), 3 điểm đo → số đặt hàng nhỏ nhất,
// cảnh báo ô xéo tại chỗ, hình chiều mở là ô bấm, ảnh + màn kẻ gắn đoạn vào ô số của MỤC, nháp không mạng + hàng đợi, máy khác thấy,
// phiếu đo cửa (in theo nhóm + CSV có BOM), và máy vẽ (/api/do/phong) KHÔNG thấy gì của cửa.
//   NODE_PATH=/opt/node22/lib/node_modules PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node test/e2e/cua.e2e.js
// ANH_RA=<thư mục> để lưu ảnh chụp màn hình (cua-*.png).
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { moMay, quanLy, thoMoi, MK_THO } = require('../tro-giup');
const RA = process.env.ANH_RA || path.join(__dirname, 'ra');
fs.mkdirSync(RA, { recursive: true });
const sl = ms => new Promise(r => setTimeout(r, ms));
const cho = async (fn, ms = 8000, ten = '') => { const het = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > het) throw new Error('chờ quá lâu: ' + ten); await sl(100); } };
const W = 390;
let buoc = 0; const ghi = t => console.log(`  ${++buoc}. ${t}`);

async function kiemMan(page, ten) {
  const r = await page.evaluate(() => {
    const sw = document.documentElement.scrollWidth, nho = [];
    for (const el of document.querySelectorAll('button, input, select, textarea')) {
      if (el.type === 'file' || el.type === 'hidden') continue;
      const b = el.getBoundingClientRect(), cs = getComputedStyle(el);
      if (!b.width || !b.height || cs.visibility === 'hidden' || cs.display === 'none' || el.closest('.an')) continue;
      if (el.type === 'checkbox') { const l = el.closest('label'); const lb = l && l.getBoundingClientRect(); if (lb && lb.height >= 44) continue; }
      if (b.width < 44 || b.height < 44) nho.push(`${el.tagName.toLowerCase()} "${(el.textContent || el.value || el.getAttribute('aria-label') || '').trim().slice(0, 30)}" ${Math.round(b.width)}×${Math.round(b.height)}`);
      if ((el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && parseFloat(cs.fontSize) < 16) nho.push(`chữ ô nhập < 16px (${el.dataset.c || el.name || ''})`);
    }
    return { sw, nho };
  });
  assert.ok(r.sw <= W, `${ten}: cuộn ngang (scrollWidth ${r.sw})`);
  assert.deepEqual(r.nho, [], `${ten}: nút / ô bấm nhỏ hơn 44 × 44`);
}

(async () => {
  const M = await moMay(), Q = await quanLy(M); await thoMoi(M, Q, 'hung', 'Hùng');
  const ma = (await Q.goi('POST', '/api/quan-ly/ma-ket-noi', { json: { nhan: 'Máy vẽ' } })).j.chuoi.split('#')[1];
  const doPhong = async () => (await fetch(M.goc + '/api/do/phong', { headers: { authorization: 'Bearer ' + ma } })).text();
  const browser = await chromium.launch(), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mndo-cua-'));
  const loiTrang = [];
  const moCtx = async () => {
    const ctx = await browser.newContext({ viewport: { width: W, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: 'vi-VN', acceptDownloads: true });
    const page = await ctx.newPage();
    page.on('pageerror', e => loiTrang.push(String(e)));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_INTERNET_DISCONNECTED/.test(m.text())) loiTrang.push('console: ' + m.text()); });
    await page.goto(M.goc + '/'); await page.fill('input[name="ten"]', 'hung'); await page.fill('input[name="mk"]', MK_THO); await page.click('button[type="submit"]');
    await page.waitForSelector('[data-act="ct-moi"]');
    return { ctx, page };
  };
  const jpeg = async page => page.evaluate(async () => { const c = document.createElement('canvas'); c.width = 600; c.height = 900; const x = c.getContext('2d'); x.fillStyle = '#ddd'; x.fillRect(0, 0, 600, 900); x.fillStyle = '#7a5230'; x.fillRect(120, 100, 360, 760); const b = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9)); const a = new Uint8Array(await b.arrayBuffer()); let s = ''; for (const v of a) s += String.fromCharCode(v); return btoa(s); });
  const keo = async (page, x0, y0, x1, y1, n = 12) => { await page.mouse.move(x0, y0); await page.mouse.down(); for (let i = 1; i <= n; i++) await page.mouse.move(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n); await page.mouse.up(); };
  const rec = page => page.evaluate(() => JSON.parse(JSON.stringify(window.MNDO.S.rec)));
  const hangRong = page => cho(async () => (await page.evaluate(() => window.MNDO.trangThai())).hang === 0, 15000, 'hàng đợi gửi hết');
  const go = async (page, sel, v) => { await page.fill(sel, v); await page.dispatchEvent(sel, 'change'); };
  const chup = async (page, ten) => page.screenshot({ path: path.join(RA, ten), fullPage: true });
  try {
    console.log('— Cửa & vách kính (0.3.0) ở 390 px');
    const { ctx, page } = await moCtx();
    await page.click('[data-act="ct-moi"]'); await page.fill('form[data-form="ct"] input[name="ten"]', 'Nhà chị Lan'); await page.click('form[data-form="ct"] button[type="submit"]');
    await page.waitForSelector('[data-act="cua-them"]');
    const ctId = await page.evaluate(() => location.hash.split('/')[2]);
    assert.match(await page.textContent('[data-ui="ds-cua"]'), /Chưa có cửa nào/);
    await kiemMan(page, 'công trình (có phần Cửa)');
    ghi('màn công trình có phần "Cửa & vách kính" riêng, cạnh danh sách phòng');

    // ---------- 1. CỬA GỖ ----------
    await page.click('[data-act="cua-them"]');
    await page.waitForSelector('[data-act="cua-nhom"][data-nhom="kinh"]');
    assert.equal(await page.locator('[data-act="cua-nhom"]').count(), 3);
    await kiemMan(page, 'chọn nhóm cửa'); await chup(page, 'cua-1-chon-nhom.png');
    await page.click('[data-act="cua-nhom"][data-nhom="go"]');
    await page.waitForSelector('[data-ui="cua-than"] [data-c="rong.0"]');
    assert.equal(await page.inputValue('[data-c="ky_hieu"]'), 'D1', 'ký hiệu tự đặt D1');
    assert.match(await page.textContent('[data-ui="ten-cua"]'), /D1 · Cửa gỗ thông phòng/);
    // chỉ phần của cửa gỗ
    assert.equal(await page.locator('[data-c="nhom_ct.he"], [data-c="kinh.vat"]').count(), 0, 'không có ô của nhôm / kính');
    await page.fill('[data-c="vi_tri"]', 'Phòng ngủ master');
    await page.fill('[data-c="rong.0"]', '820'); await page.fill('[data-c="rong.1"]', '815'); await page.fill('[data-c="rong.2"]', '818');
    let min = await page.textContent('[data-min="rong"]');
    assert.match(min, /Đặt hàng 815/); assert.match(min, /lệch 5 mm/);
    assert.equal(await page.locator('[data-cb="rong"] .msg').count(), 0, 'lệch 5 mm: chưa cảnh báo');
    await page.fill('[data-c="rong.2"]', '808');
    await cho(async () => /ô hơi xéo/.test(await page.textContent('[data-cb="rong"] .cb')), 2000, 'vàng ô hơi xéo');
    assert.equal(await page.getAttribute('[data-cb="rong"] .msg', 'data-cb-muc'), 'vang');
    assert.equal(await page.getAttribute('[data-min="rong"]', 'data-muc'), 'vang');
    assert.equal(await page.locator('[data-c="rong.2"]').evaluate(el => el === document.activeElement), true, 'gõ số không mất tiêu điểm');
    // Enter sang ô kế tiếp
    await page.focus('[data-c="cao.0"]'); await page.keyboard.type('2150'); await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.c), 'cao.1', 'Enter sang ô giữa');
    await page.keyboard.type('2160'); await page.keyboard.press('Enter'); await page.keyboard.type('2190');
    await cho(async () => /ô xéo \/ không vuông/.test(await page.textContent('[data-cb="cao"] .cb')), 2000, 'đỏ ô xéo');
    assert.equal(await page.getAttribute('[data-min="cao"]', 'data-muc'), 'do');
    // gõ sai: đỏ ở ô, giữ số cũ
    await page.fill('[data-c="cao.2"]', '21x0');
    assert.equal(await page.getAttribute('[data-c="cao.2"]', 'aria-invalid'), 'true');
    assert.equal((await rec(page)).cua.cao[2], 2190, 'giữ số cũ khi gõ sai');
    await page.fill('[data-c="cao.2"]', '2155');
    assert.equal(await page.getAttribute('[data-c="cao.2"]', 'aria-invalid'), null);
    assert.match(await page.textContent('[data-min="cao"]'), /Đặt hàng 2 150/);
    // "0,82" mét → 820 khi rời ô (ô chéo nằm trong ⋯ — mở ra)
    await page.click('details.cheo summary');
    await go(page, '[data-c="cheo.0"]', '0,82');
    assert.equal(await page.inputValue('[data-c="cheo.0"]'), '820'); assert.match(await page.textContent('[data-ui="bao-m"]'), /đã đổi 0,82 m thành 820 mm/);
    await page.fill('[data-c="cheo.0"]', '');
    ghi('cửa gỗ: 3 điểm cạnh nhau → số đặt hàng nhỏ nhất to; lệch > 5 vàng / > 15 đỏ ngay dưới phần đó; gõ sai đỏ ở ô giữ số cũ; Enter sang ô kế');

    // sàn chưa lát → cốt sàn → cao đặt hàng trừ
    await page.fill('[data-c="go.day_tuong.0"]', '110');
    await page.click('[data-act="cua-chon"][data-c="go.san"][data-v="chua_lat"]');
    await page.waitForSelector('[data-c="go.cot_san"]');
    await page.fill('[data-c="go.cot_san"]', '30');
    await cho(async () => /→ đặt 2 120/.test(await page.textContent('[data-min="cao"]')), 2000, 'cao đặt trừ cốt sàn');
    assert.match(await page.textContent('[data-cb~="go.san"] .cb'), /cao đặt hàng = 2150 − 30 = 2120/);
    // kiểu + chiều mở bằng hình
    await page.click('[data-act="cua-chon"][data-c="go.kieu"][data-v="mot_canh"]');
    assert.equal(await page.locator('.mo-o[data-act="cua-mo"]').count(), 4, '4 ô hình chiều mở');
    await page.click('[data-act="cua-mo"][data-ben="trai"][data-mo="vao"]');
    let r = await rec(page);
    assert.deepEqual([r.cua.go.ban_le, r.cua.go.mo, r.cua.go.kieu, r.cua.go.san, r.cua.go.cot_san], ['trai', 'vao', 'mot_canh', 'chua_lat', 30]);
    assert.equal(await page.getAttribute('[data-act="cua-mo"][data-ben="trai"][data-mo="vao"]', 'aria-pressed'), 'true');
    // lùa: hình lùa trái / phải thay chiều mở quay
    await page.click('[data-act="cua-chon"][data-c="go.kieu"][data-v="lua"]');
    assert.equal(await page.locator('[data-act="cua-mo"]').count(), 0); assert.equal(await page.locator('.mo-o[data-c="go.lua"]').count(), 2);
    await page.click('[data-act="cua-chon"][data-c="go.kieu"][data-v="mot_canh"]');
    await page.click('[data-act="cua-chon"][data-c="go.op_chi"][data-v="2"]');
    assert.equal((await rec(page)).cua.go.op_chi, 2);
    await kiemMan(page, 'cửa gỗ');
    // Đo xong bị chặn khi còn đỏ
    await page.fill('[data-c="cao.2"]', '2190');      // lệch 40 mm: đỏ
    await page.click('[data-c="xong"]');
    assert.equal(await page.isChecked('[data-c="xong"]'), false); assert.match(await page.textContent('[data-ui="bao-xong"]'), /lỗi đỏ/);
    await page.fill('[data-c="cao.2"]', '2155');
    await page.click('[data-c="xong"]');
    assert.equal(await page.isChecked('[data-c="xong"]'), true); assert.equal(await page.locator('[data-ui="bao-xong"]').count(), 0);
    ghi('sàn chưa lát: cao đặt = cao − cốt sàn; kiểu + chiều mở chọn bằng hình (4 ô / lùa 2 ô); Đo xong bị chặn khi còn lỗi đỏ');

    // ảnh + màn kẻ: đoạn gắn vào ô số của chính D1
    const f = path.join(tmp, 'd1.jpg'); fs.writeFileSync(f, Buffer.from(await jpeg(page), 'base64'));
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-act="chup"]')]); await fc.setFiles([f]);
    await page.waitForSelector('[data-ui="ke-canvas"]'); await sl(200);
    const bb = await page.locator('[data-ui="ke-canvas"]').boundingBox(), y = bb.y + bb.height * 0.85;
    await keo(page, bb.x + bb.width * 0.3, y, bb.x + bb.width * 0.7, y + 2);
    await page.waitForSelector('[data-ui="o-so-nhap"]');
    const chipL = await page.$$eval('[data-act="chon-lien"]', ds => ds.map(b => b.dataset.lien));
    assert.ok(chipL.includes('rong.2') && chipL.includes('cao.0') && chipL.includes('go.day_tuong.0') && chipL.includes('go.cot_san'), 'chip là ô số của D1: ' + chipL.join(','));
    assert.ok(!chipL.some(l => /^tuong:/.test(l)), 'không có chip của phòng');
    assert.match(await page.textContent('[data-ui="o-so"]'), /Rộng dưới 808/);
    await page.fill('[data-ui="o-so-nhap"]', '812');
    await page.click('[data-act="chon-lien"][data-lien="rong.2"]');
    // 808 → 812: khác 4 mm (≤ 10) — ghi thẳng, không hỏi "khác số cũ"
    await cho(async () => (await rec(page)).cua.rong[2] === 812, 3000, 'số ảnh vào ô Rộng dưới');
    assert.match(await page.textContent('[data-ui="ds-net"]'), /= Rộng dưới/);
    assert.match(await page.textContent('[data-ui="ke-thieu"]'), /D1: rộng đặt 812/);
    await kiemMan(page, 'màn kẻ của cửa'); await chup(page, 'cua-3-ke-anh.png');
    await page.click('[data-act="ke-xong"]');
    await page.waitForSelector('[data-ui="cua-than"] [data-c="rong.2"]');
    assert.equal(await page.inputValue('[data-c="rong.2"]'), '812', 'thẻ D1 theo số trên ảnh');
    assert.match(await page.textContent('[data-anh=""]'), /1 kích thước/);
    await chup(page, 'cua-2-go.png');
    // sửa số ở thẻ: ảnh đổi theo
    await page.fill('[data-c="rong.2"]', '810');
    r = await rec(page);
    assert.equal(r.anh[0].ke[0].lien, 'rong.2');
    ghi('ảnh cửa: màn kẻ dùng chung, chip = ô số của chính mục (Rộng dưới, Cao trái, Dày tường, Cốt sàn…), số ảnh vào thẻ');

    await page.locator('[data-c="rong.2"]').blur(); await sl(300);      // rời ô = ghi ngay (không chờ 800 ms)
    await hangRong(page);
    let sv = await Q.goi('GET', `/api/cong-trinh/${ctId}/cua`);
    assert.equal(sv.st, 200); assert.equal(sv.j.cua.length, 1);
    const d1 = sv.j.cua[0];
    assert.deepEqual([d1.cua.ky_hieu, d1.cua.rong, d1.cua.cao, d1.cua.go.ban_le, d1.cua.go.mo, d1.tinh.rong.min, d1.tinh.cao_dat], ['D1', [820, 815, 810], [2150, 2160, 2155], 'trai', 'vao', 810, 2120]);
    assert.equal(d1.cua.xong, true);
    assert.equal(d1.anh.length, 1); assert.equal(d1.anh[0].ke[0].lien, 'rong.2'); assert.deepEqual(d1.anh_co, [d1.anh[0].id], 'ảnh đã lên máy chủ');
    ghi('máy chủ nhận D1 đủ số + ảnh (X-Cua), số đặt hàng máy chủ tính trùng điện thoại');

    // ---------- 2. CỬA NHÔM ----------
    await page.click('[aria-label="Về công trình"]'); await page.waitForSelector('[data-ui="ds-cua"] [data-cua]');
    await page.click('[data-act="cua-them"]'); await page.click('[data-act="cua-nhom"][data-nhom="nhom"]');
    await page.waitForSelector('[data-c="nhom_ct.he"]');
    assert.equal(await page.inputValue('[data-c="ky_hieu"]'), 'N1');
    assert.equal(await page.locator('[data-c="go.cot_san"], [data-c="kinh.vat"]').count(), 0);
    assert.equal(await page.locator('[data-c="nhom_ct.be"]').count(), 0, 'bệ chỉ hiện với cửa sổ');
    await page.click('[data-act="cua-chon"][data-c="nhom_ct.loai"][data-v="cua_so"]');
    await page.waitForSelector('[data-c="nhom_ct.be"]');
    await page.fill('[data-c="nhom_ct.be"]', '900');
    for (const [i, v] of [[0, '1400'], [1, '1402'], [2, '1398']]) await page.fill(`[data-c="rong.${i}"]`, v);
    for (const [i, v] of [[0, '1200'], [1, '1201'], [2, '1203']]) await page.fill(`[data-c="cao.${i}"]`, v);
    await page.fill('[data-c="nhom_ct.he"]', 'Xingfa');
    assert.equal(await page.getAttribute('[data-c="nhom_ct.he"]', 'list'), 'goi-y-he');
    await page.click('[data-act="cua-chon"][data-c="nhom_ct.lap"][data-v="giua"]');
    await page.click('[data-act="cua-chon"][data-c="nhom_ct.kieu_mo"][data-v="quay"]');
    await page.click('[data-act="cua-mo"][data-kh="nhom_ct"][data-ben="phai"][data-mo="ra"]');
    await page.click('[data-act="cua-kinh8"]');
    await page.click('[data-act="cua-chon"][data-c="nhom_ct.fix"][data-v="tren"]');
    await page.fill('[data-c="nhom_ct.fix_tren"]', '400');
    await page.check('[data-c="nhom_ct.tang_cao"]');
    await page.waitForSelector('[data-c="nhom_ct.tang_ghi"]');
    await page.fill('[data-c="nhom_ct.tang_ghi"]', 'tầng 3 mặt tiền');
    await page.fill('[data-c="mau"]', 'ghi xám');
    r = await rec(page);
    assert.deepEqual([r.cua.nhom_ct.loai, r.cua.nhom_ct.be, r.cua.nhom_ct.kinh_day, r.cua.nhom_ct.kinh_loai, r.cua.nhom_ct.ban_le, r.cua.nhom_ct.mo, r.cua.nhom_ct.fix_tren, r.cua.nhom_ct.tang_cao], ['cua_so', 900, 8, 'cuong_luc', 'phai', 'ra', 400, true]);
    assert.match(await page.textContent('[data-min="rong"]'), /Đặt hàng 1 398/);
    assert.match(await page.textContent('[data-cb~="nhom_ct.tang_cao"] .cb'), /cần giàn/);
    // số vô lý: rộng 70 000 (> 10 × trần 6 000) → đỏ "số lạ"
    await page.fill('[data-c="rong.0"]', '70000');
    await cho(async () => /số lạ/.test(await page.textContent('[data-cb="rong"] .cb')), 2000, 'đỏ số lạ');
    await page.fill('[data-c="rong.0"]', '1400');
    await kiemMan(page, 'cửa nhôm'); await chup(page, 'cua-4-nhom.png');
    ghi('cửa nhôm: loại / bệ (cửa sổ) / lắp khuôn / hệ (gợi ý) / kiểu mở + hình / nút "8 mm cường lực" / ô fix / tầng cao; số vô lý đỏ');

    // ---------- 3. VÁCH KÍNH TẮM ----------
    await page.click('[aria-label="Về công trình"]'); await page.waitForSelector('[data-ui="ds-cua"] [data-cua]');
    await page.click('[data-act="cua-them"]'); await page.click('[data-act="cua-nhom"][data-nhom="kinh"]');
    await page.waitForSelector('[data-c="kinh.vat"]');
    assert.equal(await page.inputValue('[data-c="ky_hieu"]'), 'K1');
    assert.equal(await page.locator('[data-c="rong.0"]').count(), 0, 'kính: không có rộng chung — đo theo từng mặt');
    assert.equal(await page.locator('.mat-kinh').count(), 1);
    await page.click('[data-act="cua-chon"][data-c="kinh.dang"][data-v="goc_l"]');
    await cho(async () => (await page.locator('.mat-kinh').count()) === 2, 2000, 'góc L = 2 mặt');
    for (const [m, a, ds] of [[0, 'rong', [900, 902, 905]], [0, 'cao', [2000, 2000, 2001]], [1, 'rong', [1200, 1195, 1190]], [1, 'cao', [2000, 2002, 2001]]]) for (let i = 0; i < 3; i++) await page.fill(`[data-c="kinh.mat.${m}.${a}.${i}"]`, String(ds[i]));
    assert.match(await page.textContent('[data-min="kinh.mat.1.rong"]'), /Đặt hàng 1 190/);
    assert.match(await page.textContent('[data-cb="kinh.mat.1.rong"] .cb'), /lệch 10 mm/);
    await page.fill('[data-c="kinh.nghieng.trai"]', '8');
    await cho(async () => /Tường trái nghiêng 8 mm/.test(await page.textContent('[data-cb="kinh.nghieng"] .cb')), 2000, 'tường nghiêng');
    await page.click('[data-act="cua-chon"][data-c="kinh.bac.co"][data-v="true"]');
    await page.fill('[data-c="kinh.bac.cao"]', '40'); await page.fill('[data-c="kinh.bac.rong"]', '60');
    await page.click('[data-act="cua-chon"][data-c="kinh.cua.kieu"][data-v="quay"]');
    await page.fill('[data-c="kinh.cua.rong"]', '700');
    await page.click('[data-act="cua-mo"][data-kh="kinh.cua"][data-ben="trai"][data-mo="vao"]');
    await cho(async () => /mở VÀO trong/.test(await page.textContent('[data-cb="kinh.cua"] .cb')), 2000, 'cảnh báo mở vào');
    await page.click('[data-act="cua-mo"][data-kh="kinh.cua"][data-ben="trai"][data-mo="ra"]');
    assert.doesNotMatch(await page.textContent('[data-cb="kinh.cua"] .cb'), /mở VÀO/);
    await page.click('[data-act="cua-chon"][data-c="kinh.cua.ban_le"][data-v="kinh_tuong"]');
    assert.equal(await page.getAttribute('[data-act="cua-chon"][data-c="kinh.kinh_day"][data-v="10"]', 'aria-pressed'), 'true', 'mặc định kính 10 mm');
    await page.click('[data-act="cua-chon"][data-c="kinh.pk_mau"][data-v="den"]');
    await page.fill('[data-c="kinh.vat"]', 'vòi sen cách mép trái 250');
    r = await rec(page);
    assert.deepEqual([r.cua.kinh.dang, r.cua.kinh.mat.length, r.cua.kinh.nghieng.trai, r.cua.kinh.bac.co, r.cua.kinh.cua.mo, r.cua.kinh.cua.ban_le_ben, r.cua.kinh.pk_mau], ['goc_l', 2, 8, true, 'ra', 'trai', 'den']);
    await kiemMan(page, 'vách kính'); await chup(page, 'cua-5-kinh.png');
    ghi('vách kính: dạng → số mặt, mỗi mặt rộng 3 điểm + cao 3 điểm, tường nghiêng > 5 vàng, cửa mở vào vàng, mặc định kính 10');

    // ---------- 4. KHÔNG MẠNG: nháp + hàng đợi ----------
    await page.click('[aria-label="Về công trình"]'); await page.waitForSelector('[data-ui="ds-cua"] [data-cua]');
    await ctx.setOffline(true);
    await page.click('[data-act="cua-them"]'); await page.click('[data-act="cua-nhom"][data-nhom="go"]');
    await page.waitForSelector('[data-c="rong.0"]');
    assert.equal(await page.inputValue('[data-c="ky_hieu"]'), 'D2', 'ký hiệu nối tiếp trong nhóm');
    await page.fill('[data-c="ky_hieu"]', 'D1');      // trùng ký hiệu trong nhóm → vàng
    await cho(async () => /Trùng ký hiệu D1/.test(await page.textContent('[data-ui="cua-than"]')), 2000, 'trùng ký hiệu');
    await page.fill('[data-c="ky_hieu"]', 'D 2/x?');
    assert.equal(await page.getAttribute('[data-c="ky_hieu"]', 'aria-invalid'), 'true', 'ký tự lạ → đỏ');
    await page.fill('[data-c="ky_hieu"]', 'D2'); await page.fill('[data-c="vi_tri"]', 'WC tầng 2');
    for (let i = 0; i < 3; i++) { await page.fill(`[data-c="rong.${i}"]`, '700'); await page.fill(`[data-c="cao.${i}"]`, '2100'); }
    await page.focus('[data-c="ghi_chu"]'); await sl(900);
    await cho(async () => /chờ gửi/.test(await page.textContent('#thanh')), 4000, 'thanh "chờ gửi"');
    await page.click('[aria-label="Về công trình"]'); await page.waitForSelector('[data-cua]');
    assert.equal(await page.locator('[data-ui="ds-cua"] [data-cua]').count(), 4);
    assert.equal(await page.locator('[data-ui="ds-cua"] .cham').count() >= 1, true, 'chấm cam = chưa gửi');
    assert.deepEqual(await page.$$eval('[data-ui="ds-cua"] .ds-nhom', ds => ds.map(x => x.dataset.nhom)), ['go', 'nhom', 'kinh'], 'xếp theo nhóm');
    await kiemMan(page, 'danh sách cửa'); await chup(page, 'cua-6-ds.png');
    await ctx.setOffline(false); await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await hangRong(page);
    sv = await Q.goi('GET', `/api/cong-trinh/${ctId}/cua`);
    assert.deepEqual(sv.j.cua.map(x => x.cua.ky_hieu).sort(), ['D1', 'D2', 'K1', 'N1']);
    ghi('mất mạng: thêm D2 vẫn được (nháp + chấm "chưa gửi"), ký hiệu trùng vàng / ký tự lạ đỏ; có mạng lại thì gửi hết');

    // ---------- 5. HỢP ĐỒNG máy vẽ ----------
    const dp = await doPhong();
    for (const s of ['D1', 'N1', 'K1', 'Xingfa', 'WC tầng 2', 'vòi sen'].concat(sv.j.cua.map(x => x.id))) assert.ok(!dp.includes(s), 'lọt sang máy vẽ: ' + s);
    assert.equal((await fetch(M.goc + '/api/do/anh/' + d1.anh[0].id, { headers: { authorization: 'Bearer ' + ma } })).status, 404);
    ghi('/api/do/phong (máy vẽ) không có chữ nào của cửa; ảnh cửa 404 với máy vẽ');

    // ---------- 6. PHIẾU ĐO CỬA ----------
    await page.click('[data-act="cua-phieu"]');
    await page.waitForSelector('[data-act="phieu-xem"]');
    await kiemMan(page, 'phiếu đo cửa');
    await page.click('[data-act="phieu-nhom"][data-v="nhom"]'); await page.click('[data-act="phieu-nhom"][data-v="kinh"]');
    assert.equal(await page.isDisabled('[data-act="phieu-xem"]'), false);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="phieu-csv"]')]);
    const csv = fs.readFileSync(await dl.path(), 'utf8');
    assert.equal(csv.charCodeAt(0), 0xfeff, 'CSV có BOM'); assert.match(dl.suggestedFilename(), /^phieu-do-cua-Nha-chi-Lan-go\.csv$/);
    assert.match(csv, /"D1"/); assert.match(csv, /"D2"/); assert.doesNotMatch(csv, /"N1"|"K1"/, 'CSV chỉ nhóm gỗ');
    assert.match(csv, /810 \(820 \/ 815 \/ 810\)/);
    await page.click('[data-act="phieu-xem"]');
    await page.waitForSelector('[data-ui="phieu-khung"]');
    const fr = await cho(async () => { const x = page.frames().find(q => /phieu-cua/.test(q.url())); return x && (await x.locator('h1').count()) ? x : null; }, 6000, 'khung phiếu');
    assert.match(fr.url(), /nhom=go&dang=html/);
    const tp = await fr.textContent('body');
    assert.match(tp, /Phiếu đo cửa — Nhà chị Lan/); assert.match(tp, /D1/); assert.match(tp, /D2/); assert.doesNotMatch(tp, /N1|K1/);
    assert.match(tp, /bản lề trái; mở vào/);
    await kiemMan(page, 'xem phiếu'); await page.screenshot({ path: path.join(RA, 'cua-7-phieu.png') });
    await page.click('[data-act="phieu-dong"]'); assert.equal(await page.locator('[data-ui="phieu"]').count(), 0);
    // in cả ba nhóm: mỗi nhóm một phần
    await page.click('[data-act="cua-phieu"]');
    for (const n of ['nhom', 'kinh']) if ((await page.getAttribute(`[data-act="phieu-nhom"][data-v="${n}"]`, 'aria-pressed')) !== 'true') await page.click(`[data-act="phieu-nhom"][data-v="${n}"]`);
    const ph = await Q.goi('GET', `/api/cong-trinh/${ctId}/phieu-cua?nhom=go,nhom,kinh&dang=html`);
    assert.equal((ph.b.toString().match(/<section data-nhom=/g) || []).length, 3);
    await page.click('[data-act="dong-tam"]');
    ghi('Phiếu đo cửa: lọc theo nhóm, Tải CSV (BOM, chỉ nhóm chọn), xem / in trong khung (A4 của máy chủ), mỗi nhóm một phần');

    // ---------- 7. MÁY KHÁC thấy, xoá hai lần ----------
    const { ctx: ctx2, page: p2 } = await moCtx();
    await p2.click(`[data-h="#/ct/${ctId}"]`);
    await cho(async () => (await p2.locator('[data-ui="ds-cua"] [data-cua]').count()) === 4, 8000, 'máy khác thấy 4 mục');
    await p2.click('[data-ui="ds-cua"] [data-cua] >> text=D2');
    await p2.waitForSelector('[data-c="rong.0"]');
    assert.equal(await p2.inputValue('[data-c="vi_tri"]'), 'WC tầng 2');
    await p2.click('[data-act="cua-xoa"]'); assert.match(await p2.textContent('[data-act="cua-xoa"]'), /Bấm lần nữa/);
    await p2.click('[data-act="cua-xoa"]');
    await p2.waitForSelector('[data-ui="ds-cua"]');
    await cho(async () => (await Q.goi('GET', `/api/cong-trinh/${ctId}/cua`)).j.cua.length === 3, 5000, 'máy chủ xoá D2');
    await ctx2.close();
    // máy thứ nhất mở lại công trình: D2 biến mất
    await page.click('[aria-label="Về danh sách"]'); await page.click(`[data-h="#/ct/${ctId}"]`);
    await cho(async () => (await page.locator('[data-ui="ds-cua"] [data-cua]').count()) === 3, 5000, 'máy 1 bỏ D2');
    assert.match(await page.textContent('[data-ui="ds-cua"]'), /D1/);
    await page.click('[aria-label="Về danh sách"]');
    await cho(async () => /\d\/3 cửa xong/.test(await page.textContent('[data-ui="ds-ct"]')), 5000, 'danh sách công trình đếm cửa');
    ghi('máy khác tải danh sách cửa từ máy chủ; xoá = bấm hai lần; máy kia bỏ mục đã xoá; danh sách công trình đếm "N/M cửa xong"');

    await ctx.close();
    assert.deepEqual(loiTrang, [], 'lỗi trong trang');
    console.log('— mọi ca đạt. Ảnh: ' + RA);
  } catch (e) {
    console.error(e); process.exitCode = 1;
  } finally {
    await browser.close(); await M.dong(); fs.rmSync(tmp, { recursive: true, force: true });
  }
})();
