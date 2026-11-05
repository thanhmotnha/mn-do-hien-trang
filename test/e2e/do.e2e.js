'use strict';
// Luồng đo trên điện thoại 390 px (mục 9.5) — Playwright có sẵn trên máy làm việc:
//   NODE_PATH=/opt/node22/lib/node_modules PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node test/e2e/do.e2e.js
// ANH_RA=<thư mục> để lưu ảnh chụp màn hình (do-1.png màn đo một phòng, do-2.png ảnh một mặt đã kẻ số).
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { moMay, quanLy, MK_QL } = require('../tro-giup');
const Ph = require(process.env.MNCF_PHONG || '/home/user/mn-chenfeng/src/mncf-phong.js');
const RA = process.env.ANH_RA || path.join(__dirname, 'ra');
fs.mkdirSync(RA, { recursive: true });

const W = 390;
let buoc = 0; const ghi = t => console.log(`  ${++buoc}. ${t}`);

async function kiemMan(page, ten) {
  const r = await page.evaluate(() => {
    const sw = document.documentElement.scrollWidth, nho = [];
    for (const el of document.querySelectorAll('button, input, select, textarea, a[href]')) {
      if (el.type === 'file' || el.type === 'hidden') continue;
      const b = el.getBoundingClientRect(), cs = getComputedStyle(el);
      if (!b.width || !b.height || cs.visibility === 'hidden' || cs.display === 'none') continue;
      if (el.type === 'checkbox') { const l = el.closest('label'); const lb = l && l.getBoundingClientRect(); if (lb && lb.height >= 44) continue; }
      if (b.width < 44 || b.height < 44) nho.push(`${el.tagName.toLowerCase()} "${(el.textContent || el.value || el.getAttribute('aria-label') || '').trim().slice(0, 30)}" ${Math.round(b.width)}×${Math.round(b.height)}`);
    }
    return { sw, nho };
  });
  assert.ok(r.sw <= W, `${ten}: cuộn ngang (scrollWidth ${r.sw})`);
  assert.deepEqual(r.nho, [], `${ten}: nút / ô bấm nhỏ hơn 44 × 44`);
}
const cho = async (fn, ms = 8000, ten = '') => { const het = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > het) throw new Error('chờ quá lâu: ' + ten); await new Promise(r => setTimeout(r, 100)); } };

(async () => {
  const M = await moMay();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mndo-e2e-'));
  const browser = await chromium.launch();
  const ngoai = [], loiTrang = [];
  const moCtx = async () => {
    const ctx = await browser.newContext({ viewport: { width: W, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, locale: 'vi-VN' });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: M.goc });
    await ctx.route('**/*', r => { const u = r.request().url(); if (u.startsWith(M.goc + '/') || u.startsWith('blob:') || u.startsWith('data:')) return r.continue(); ngoai.push(u); return r.abort(); });
    return ctx;
  };
  try {
    console.log('— Đo hiện trạng: luồng đo một phòng ở 390 px');
    const Q = await quanLy(M);
    const tam = 'Tam-thoi-hung-123';
    assert.equal((await Q.goi('POST', '/api/quan-ly/tai-khoan', { json: { ten: 'hung', ten_hien: 'Hùng thợ', vai: 'tho', mat_khau_tam: tam } })).st, 200);
    ghi('quản lý tạo thợ bằng API');

    const ctx = await moCtx(), page = await ctx.newPage();
    page.on('pageerror', e => loiTrang.push(String(e)));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_INTERNET_DISCONNECTED/.test(m.text())) loiTrang.push('console: ' + m.text()); });
    await page.goto(M.goc + '/');
    await page.fill('input[name="ten"]', 'hung'); await page.fill('input[name="mk"]', tam);
    await kiemMan(page, 'đăng nhập');
    await page.click('button[type="submit"]');
    await page.waitForSelector('form[data-form="doi-mk"]');
    await kiemMan(page, 'đổi mật khẩu');
    await page.fill('input[name="cu"]', tam); await page.fill('input[name="moi"]', 'Hung-moi-12345'); await page.fill('input[name="moi2"]', 'Hung-moi-12345');
    await page.click('button[type="submit"]');
    await page.waitForSelector('text=+ Công trình mới');
    ghi('thợ đăng nhập bằng giao diện, đổi mật khẩu tạm');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await kiemMan(page, 'danh sách công trình');

    await page.click('[data-act="ct-moi"]');
    await page.fill('form[data-form="ct"] input[name="ten"]', 'Nhà anh Hùng'); await page.fill('form[data-form="ct"] input[name="dia_chi"]', 'Chiềng Sinh');
    await kiemMan(page, 'công trình mới');
    await page.click('form[data-form="ct"] button[type="submit"]');
    await page.waitForSelector('[data-act="ph-moi"]');
    await kiemMan(page, 'công trình');
    await page.click('[data-act="ph-moi"]');
    await page.fill('form[data-form="ph"] input[name="ten"]', 'Phòng ngủ master');
    await kiemMan(page, 'phòng mới');
    await page.click('form[data-form="ph"] button[type="submit"]');
    await page.waitForSelector('[data-ui="mb"]');
    await page.fill('input[data-o="tuong.0.dai"]', '3600');
    await page.click('text=Tiếp: tường B ›');
    await page.fill('input[data-o="tuong.1.dai"]', '3000');
    await cho(async () => /≈ 3600 \(tự suy\)/.test(await page.textContent('[data-tom="2"]')), 4000, 'C tự suy');
    assert.equal(await page.locator('[data-ui="tt"] .msg.loi').count(), 0, 'không dòng đỏ');
    assert.ok(await page.locator('[data-ui="mb"] svg').count(), 'mặt bằng hiện');
    ghi('phòng chữ nhật: A 3600, B 3000, C D để trống → C ≈ 3600 (tự suy), không dòng đỏ');

    // tường C: cửa đi
    await page.click('.tuong[data-i="2"] .dau-t');
    await page.click('.tuong[data-i="2"] [data-act="them-ct"][data-nhom="mo"]');
    await page.fill('.tam input[data-f="cach"]', '200'); await page.fill('.tam input[data-f="rong"]', '900'); await page.fill('.tam input[data-f="cao"]', '2200');
    await kiemMan(page, 'sửa chi tiết');
    await page.click('[data-act="ct-xong"]');
    // tường B: cột
    await page.click('.tuong[data-i="1"] .dau-t');
    await page.click('.tuong[data-i="1"] [data-act="them-ct"][data-nhom="can"]');
    await page.fill('.tam input[data-f="cach"]', '1000'); await page.fill('.tam input[data-f="rong"]', '300'); await page.fill('.tam input[data-f="nho"]', '200');
    await page.click('[data-act="ct-xong"]');
    // tường A: ổ điện chỉ gõ cách
    await page.click('.tuong[data-i="0"] .dau-t');
    await page.click('.tuong[data-i="0"] [data-act="them-ct"][data-nhom="dn"]');
    await page.click('.tam [data-act="ct-loai"][data-v="o_dien"]');
    await page.fill('.tam input[data-f="cach"]', '400');
    await page.click('[data-act="ct-xong"]');
    await cho(async () => /Chưa đủ số: Ổ điện 1 \(mặt A\)/.test(await page.textContent('[data-ui="tt"]')), 4000, 'dòng xám');
    assert.equal(await page.locator('[data-ui="tt"] .msg.loi').count(), 0);
    ghi('cửa đi C, cột B, ổ điện A thiếu cao → "Chưa đủ số: Ổ điện 1 (mặt A)"');
    await kiemMan(page, 'phòng');

    // ảnh JPEG 4000 × 3000 dựng sẵn
    const b64 = await page.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 4000; c.height = 3000; const x = c.getContext('2d');
      x.fillStyle = '#d8cbb3'; x.fillRect(0, 0, 4000, 3000); x.fillStyle = '#9b8a6e'; x.fillRect(0, 2200, 4000, 800); x.fillStyle = '#fff'; x.fillRect(1500, 600, 1000, 1400); x.fillStyle = '#6b7a8f'; x.fillRect(300, 1500, 120, 80);
      const b = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9)); const a = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s);
    });
    const tepA = path.join(tmp, 'mat-a.jpg'); fs.writeFileSync(tepA, Buffer.from(b64, 'base64'));
    let [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('.tuong[data-i="0"] [data-act="chup"]')]);
    await fc.setFiles(tepA);
    await page.waitForSelector('[data-ui="ke-canvas"]');
    const a0 = await page.evaluate(() => window.MNDO.S.rec.anh[0]);
    assert.deepEqual([a0.w, a0.h, a0.tuong], [2048, 1536, 0], 'ảnh nén còn 2048 × 1536');
    await kiemMan(page, 'kẻ số');
    const cv = await page.locator('[data-ui="ke-canvas"]').boundingBox();
    const giua = cv.y + cv.height / 2;      // ảnh 4:3 nằm giữa khung; ổ điện giả ở mép trái, ngang giữa ảnh
    await page.mouse.move(40, giua + 70); await page.mouse.down(); for (let x = 40; x <= 350; x += 31) await page.mouse.move(x, giua + 70); await page.mouse.move(350, giua + 70); await page.mouse.up();
    await page.click('[data-act="chon-lien"][data-lien="tuong:0:dai"]');
    await cho(async () => /3600/.test(await page.textContent('[data-ui="ds-net"]')), 3000, 'nhãn 3600');
    // thêm một ghi chú có mũi tên cho ảnh giống thật
    await page.click('[data-act="ke-che"][data-v="chi"]');
    await page.mouse.move(150, giua - 90); await page.mouse.down(); for (let i = 1; i <= 8; i++) await page.mouse.move(150 - i * 13, giua - 90 + i * 11); await page.mouse.up();
    await page.fill('[data-ui="hoi-chu"]', 'ổ điện cũ'); await page.click('[data-act="hoi-xong"]');
    await page.fill('[data-ui="ghi-anh"]', 'mặt A — có ổ điện');
    await page.screenshot({ path: path.join(RA, 'do-2.png') });
    await page.click('[data-act="ke-xong"]');
    await page.waitForSelector('[data-anh="0"] img');
    ghi('chụp mặt A (4000 × 3000 → 2048 × 1536), kéo đường kích thước → chọn "Dài tường A 3600" → nhãn 3600');
    await page.evaluate(() => window.scrollTo(0, 0));
    await cho(async () => /Đã gửi/.test(await page.textContent('#thanh')), 15000, 'đã gửi lần đầu').catch(async e => { throw new Error(e.message + ' — ' + await page.textContent('#thanh') + ' ' + JSON.stringify(await page.evaluate(() => window.MNDO.DB.all('hang'))) + JSON.stringify(await page.evaluate(() => [window.MNDO.S.rec.phong.can, window.MNDO.S.rec.phong.mo, window.MNDO.S.rec.phong.dn]))); });
    await page.evaluate(() => { document.getElementById('thanh').style.display = 'none'; });      // thanh cố định đè giữa ảnh chụp cả trang
    await page.screenshot({ path: path.join(RA, 'do-1.png'), fullPage: true });
    await page.evaluate(() => { document.getElementById('thanh').style.display = ''; });

    // mất mạng: sửa + chụp thêm, tải lại, có mạng lại
    await ctx.setOffline(true);
    await page.fill('input[data-o="ten"]', 'Phòng ngủ master (sửa)'); await page.locator('input[data-o="ten"]').blur();
    const tepC = path.join(tmp, 'chung.jpg'); fs.writeFileSync(tepC, Buffer.from(b64, 'base64'));
    [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-act="chup"][data-tuong=""]')]);
    await fc.setFiles(tepC);
    await page.waitForSelector('[data-ui="ke-canvas"]'); await page.click('[data-act="ke-xong"]');
    await cho(async () => /chờ gửi/.test(await page.textContent('#thanh')), 6000, 'chờ gửi');
    ghi('mất mạng: sửa tên + chụp ảnh chung → "' + (await page.textContent('#thanh')) + '"');
    await page.reload();
    await page.waitForSelector('[data-ui="mb"]');
    assert.equal(await page.inputValue('input[data-o="ten"]'), 'Phòng ngủ master (sửa)');
    assert.equal(await page.evaluate(() => window.MNDO.S.rec.anh.length), 2);
    await cho(async () => /chờ gửi/.test(await page.textContent('#thanh')), 4000, 'chờ gửi sau tải lại');
    ghi('tải lại khi vẫn mất mạng: trang mở từ service worker, nháp còn nguyên');
    await ctx.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await cho(async () => /✓ Đã gửi/.test(await page.textContent('#thanh')), 20000, 'tự gửi lại');
    ghi('có mạng lại: tự gửi → "' + (await page.textContent('#thanh')) + '"');

    // quản lý cấp mã bằng giao diện
    const ctxQ = await moCtx(), pq = await ctxQ.newPage();
    pq.on('pageerror', e => loiTrang.push('ql: ' + e));
    await pq.goto(M.goc + '/');
    await pq.fill('input[name="ten"]', 'quanly'); await pq.fill('input[name="mk"]', MK_QL); await pq.click('button[type="submit"]');
    await pq.waitForSelector('text=Mã kết nối máy vẽ');
    await kiemMan(pq, 'danh sách (quản lý)');
    await pq.click('text=Mã kết nối máy vẽ');
    await pq.waitForSelector('[data-act="ma-cap"]');
    await kiemMan(pq, 'mã kết nối');
    await pq.click('[data-act="ma-cap"]'); await pq.click('form[data-form="ma"] button[type="submit"]');
    await pq.waitForSelector('[data-act="ma-chep"]');
    await kiemMan(pq, 'mã vừa cấp');
    await pq.click('[data-act="ma-chep"]');
    await cho(async () => /Đã chép/.test(await pq.textContent('[data-ui="chep-bao"]')), 3000, 'đã chép');
    const chuoi = await pq.evaluate(() => navigator.clipboard.readText());
    const k = Ph.docKetNoi(chuoi);
    assert.ok(k.goc && k.ma, 'chuỗi kết nối đọc được: ' + chuoi);
    ghi('quản lý: Mã kết nối máy vẽ → Cấp mã → Chép mã');
    await pq.click('[data-act="dong-tam"]');
    await pq.click('[data-act="di"][data-h="#/"]');
    await pq.click('text=Tài khoản thợ'); await pq.waitForSelector('text=Hùng thợ');
    await kiemMan(pq, 'tài khoản thợ');

    const r = await fetch(k.goc + '/phong', { headers: { authorization: 'Bearer ' + k.ma } });
    assert.equal(r.status, 200);
    const ds = Ph.phongDaDo((await r.json()).phong, {}), x = ds[0];
    assert.equal(x.ten, 'Phòng ngủ master (sửa)'); assert.equal(x.ve_duoc, true, JSON.stringify(x.loi));
    assert.equal(x.anh.length, 2); assert.equal(x.anh_thieu, 0);
    const aA = x.anh.find(a => a.mat === 'A');
    assert.ok(aA.net.length >= 3 && aA.chu.some(c => c.text === '3600'), JSON.stringify(aA.chu));
    assert.deepEqual(x.bo, ['Ổ điện 1 (mặt A)']); assert.equal(x.nguoi, 'Hùng thợ');
    const tep = await fetch(k.goc + '/anh/' + aA.id, { headers: { authorization: 'Bearer ' + k.ma } });
    assert.equal(tep.status, 200);
    assert.deepEqual(require('../../lib/anh').co(Buffer.from(await tep.arrayBuffer())), { w: 2048, h: 1536 });
    ghi('máy vẽ đọc bằng mã đó: vẽ được, 2 ảnh đủ trên máy chủ, ảnh A có nét + chữ 3600');

    assert.deepEqual(loiTrang, [], 'lỗi trong trang');
    assert.deepEqual(ngoai, [], 'không gọi mạng ra ngoài máy chủ thử');
    await ctxQ.close(); await ctx.close();
    console.log(`ĐẠT (${buoc} bước) — ảnh: ${path.join(RA, 'do-1.png')}, ${path.join(RA, 'do-2.png')}`);
  } catch (e) {
    console.error('HỎNG:', e.stack || e); if (loiTrang.length) console.error('lỗi trang:', loiTrang);
    process.exitCode = 1;
  } finally { await browser.close(); await M.dong(); fs.rmSync(tmp, { recursive: true, force: true }); }
})();
