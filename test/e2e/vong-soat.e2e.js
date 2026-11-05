'use strict';
// Vòng soát 0.1.0 — lỗi phía điện thoại (màn 390 px), mỗi lỗi đã tái hiện một ca. Chạy:
//   NODE_PATH=/opt/node22/lib/node_modules PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node test/e2e/vong-soat.e2e.js [số ca]
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { moMay, quanLy, thoMoi, MK_THO } = require('../tro-giup');

const sl = ms => new Promise(r => setTimeout(r, ms));
const cho = async (fn, ms = 8000, ten = '') => { const het = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > het) throw new Error('chờ quá lâu: ' + ten); await sl(100); } };
const CHI = process.argv[2] || '';

(async () => {
  const M = await moMay(), Q = await quanLy(M), T = await thoMoi(M, Q, 'hung', 'Hùng');
  await thoMoi(M, Q, 'lan', 'Lan');
  const browser = await chromium.launch(), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mndo-vs-'));
  const loiTrang = [];
  const moTrang = async (ten = 'hung') => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: 'vi-VN' });
    const page = await ctx.newPage();
    page.on('pageerror', e => loiTrang.push(String(e)));
    await page.goto(M.goc + '/'); await page.fill('input[name="ten"]', ten); await page.fill('input[name="mk"]', MK_THO); await page.click('button[type="submit"]');
    await page.waitForSelector('[data-act="ct-moi"]');
    return { ctx, page };
  };
  const taoCt = async page => {
    await page.click('[data-act="ct-moi"]'); await page.fill('form[data-form="ct"] input[name="ten"]', 'Nhà thử'); await page.click('form[data-form="ct"] button[type="submit"]');
    await page.waitForSelector('[data-act="ph-moi"]');
  };
  const taoPh = async (page, ten = 'P1') => {
    await page.click('[data-act="ph-moi"]'); await page.fill('form[data-form="ph"] input[name="ten"]', ten); await page.click('form[data-form="ph"] button[type="submit"]');
    await page.waitForSelector('[data-ui="mb"]');
    await page.fill('input[data-o="tuong.0.dai"]', '3600');
  };
  const taoPhong = async page => { await taoCt(page); await taoPh(page); };
  const jpeg = async page => page.evaluate(async () => { const c = document.createElement('canvas'); c.width = 800; c.height = 600; const x = c.getContext('2d'); x.fillStyle = '#ccc'; x.fillRect(0, 0, 800, 600); const b = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9)); const a = new Uint8Array(await b.arrayBuffer()); let s = ''; for (const v of a) s += String.fromCharCode(v); return btoa(s); });
  const chup = async (page, sel = '[data-act="chup"][data-tuong=""]') => { const f = path.join(tmp, Math.random() + '.jpg'); fs.writeFileSync(f, Buffer.from(await jpeg(page), 'base64')); const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(sel)]); await fc.setFiles(f); await page.waitForSelector('[data-ui="ke-canvas"]'); };
  const net = async page => { const cv = await page.locator('[data-ui="ke-canvas"]').boundingBox(); const y = cv.y + cv.height / 2; await page.mouse.move(60, y); await page.mouse.down(); for (let x = 60; x <= 320; x += 20) await page.mouse.move(x, y); await page.mouse.up(); };
  const hang = page => page.evaluate(() => window.MNDO.DB.all('hang'));
  const th = page => page.textContent('#thanh');
  const daGui = page => cho(async () => /Đã gửi|Đã lưu/.test(await th(page)), 10000, 'đã gửi');
  const chayLai = page => page.evaluate(async () => { for (const j of await window.MNDO.DB.all('hang')) { j.cho_den = 0; await window.MNDO.DB.put('hang', j); } await window.MNDO.chayHang(); });
  const phongMay = page => page.evaluate(() => window.MNDO.DB.all('phong'));
  const ca = async (so, ten, fn) => { if (CHI && CHI !== String(so)) return; process.stdout.write(`  R${so}. ${ten} … `); await fn(); console.log('đạt'); };

  try {
    console.log('— Vòng soát 0.1.0: điện thoại');
    await ca(1, 'ảnh chờ gửi mà phòng bị xoá ở máy chủ → thôi gửi, không treo "chờ gửi"', async () => {
      const { ctx, page } = await moTrang(); await taoPhong(page); await daGui(page);
      await ctx.route('**/api/anh/**', r => r.request().method() === 'PUT' ? r.abort('internetdisconnected') : r.continue());
      await chup(page); await page.click('[data-act="ke-xong"]');
      await cho(async () => (await hang(page)).some(j => j.loai === 'anh' && j.lan > 0), 8000, 'ảnh lùi');
      const id = await page.evaluate(() => window.MNDO.S.rec.id);
      assert.equal((await Q.goi('DELETE', '/api/phong/' + id)).st, 200);
      await ctx.unroute('**/api/anh/**');
      for (let k = 0; k < 3; k++) { await chayLai(page); await sl(300); }
      const h = await hang(page);
      assert.ok(!h.some(j => j.loai === 'anh' && !j.dung), JSON.stringify(h));
      assert.ok(!/chờ gửi/.test(await th(page)), await th(page));
      assert.equal(await page.evaluate(() => window.MNDO.DB.all('anh').then(a => a.length)), 0, 'blob ảnh đã dọn');
      await ctx.close();
    });
    await ca(2, 'Quay lại (nút / vuốt) khi đang kẻ số → đóng màn kẻ, nét giữ, vẫn ở phòng', async () => {
      const { ctx, page } = await moTrang(); await taoPhong(page);
      const hash = await page.evaluate(() => location.hash);
      await chup(page); await net(page); await page.click('[data-act="chon-lien"][data-lien="tuong:0:dai"]');
      assert.equal(await page.locator('[data-ui="ds-net"] li[data-net]').count(), 1);
      await page.goBack(); await sl(500);
      assert.equal(await page.locator('[data-ui="ke"]').count(), 0, 'màn kẻ đóng');
      assert.equal(await page.evaluate(() => location.hash), hash, 'vẫn ở phòng');
      assert.equal(await page.evaluate(() => window.MNDO.DB.get('phong', window.MNDO.S.rec.id).then(p => p.anh[0].ke.length)), 1, 'nét đã lưu');
      // thêm lần nữa: quay lại khi tấm chi tiết đang mở → đóng tấm, số đã gõ giữ (thành chi tiết), vẫn ở phòng
      await page.click('.tuong[data-i="0"] [data-act="them-ct"][data-nhom="mo"]');
      await page.fill('.tam input[data-f="cach"]', '200'); await page.fill('.tam input[data-f="rong"]', '900');
      await page.goBack(); await sl(500);
      assert.equal(await page.locator('.tam').count(), 0);
      assert.equal(await page.evaluate(() => location.hash), hash);
      assert.deepEqual(await page.evaluate(() => window.MNDO.S.rec.phong.mo.map(m => [m.cach, m.rong, m.cao])), [[200, 900, null]]);
      // đóng bằng nút rồi quay lại: rời phòng ngay một lần (không phải bấm hai lần)
      await page.click('.tuong[data-i="0"] [data-act="them-ct"][data-nhom="dn"]'); await page.click('.tam [data-act="dong-tam"]'); await sl(300);
      await page.goBack(); await page.waitForSelector('[data-act="ph-moi"]');
      await ctx.close();
    });
    await ca(3, 'chạm nền tối của tấm chi tiết → không đóng, số đã gõ còn', async () => {
      const { ctx, page } = await moTrang(); await taoPhong(page);
      await page.click('.tuong[data-i="0"] [data-act="them-ct"][data-nhom="mo"]');
      await page.fill('.tam input[data-f="cach"]', '200'); await page.fill('.tam input[data-f="rong"]', '900'); await page.fill('.tam input[data-f="cao"]', '2200');
      const bb = await page.locator('.tam').boundingBox();
      await page.touchscreen.tap(195, Math.max(5, bb.y - 20)); await sl(300);
      assert.equal(await page.locator('.tam').count(), 1, 'tấm còn');
      assert.equal(await page.inputValue('.tam input[data-f="rong"]'), '900');
      await page.click('[data-act="ct-xong"]');
      assert.equal(await page.evaluate(() => window.MNDO.S.rec.phong.mo.length), 1);
      // tấm không có ô nhập (menu) vẫn đóng khi chạm nền
      await page.click('[data-act="di"][data-h^="#/ct/"]'); await page.click('[data-act="di"][data-h="#/"]'); await page.click('[data-act="menu"]');
      const b2 = await page.locator('.tam').boundingBox(); await page.touchscreen.tap(195, Math.max(5, b2.y - 20)); await sl(300);
      assert.equal(await page.locator('.tam').count(), 0);
      await ctx.close();
    });
    await ca(4, 'gõ "3.600" / "3 650" / "3650mm" / "-900" / "abc" → đọc đúng hoặc báo đỏ, không lặng lẽ tự suy', async () => {
      const { ctx, page } = await moTrang(); await taoPhong(page);
      await page.click('.tuong[data-i="1"] .dau-t'); await page.fill('input[data-o="tuong.1.dai"]', '3000');
      await page.click('.tuong[data-i="2"] .dau-t'); await page.fill('input[data-o="tuong.2.dai"]', '3600');
      await page.click('.tuong[data-i="0"] .dau-t');
      for (const [go, v] of [['3.600', 3600], ['3 650', 3650], ['3650mm', 3650], ['3.650', 3650]]) {
        await page.fill('input[data-o="tuong.0.dai"]', go); await sl(200);
        assert.equal(await page.evaluate(() => window.MNDO.S.rec.phong.tuong[0].dai), v, go);
      }
      await page.fill('input[data-o="tuong.0.dai"]', '36o0'); await sl(200);
      assert.equal(await page.evaluate(() => window.MNDO.S.rec.phong.tuong[0].dai), 3650, 'số không hiểu: giữ số cũ');
      assert.match(await page.textContent('[data-ui="tt"]'), /“36o0” không phải số/);
      assert.ok(await page.locator('input[data-o="tuong.0.dai"][aria-invalid="true"]').count());
      assert.ok(!/tự suy/.test(await page.textContent('[data-tom="0"]')));
      await page.fill('input[data-o="tuong.0.dai"]', '3600'); await sl(200);
      assert.equal(await page.locator('[data-ui="tt"] .msg.loi').count(), 0);
      // tấm chi tiết: số âm báo ngay, không đóng tấm
      await page.click('.tuong[data-i="0"] [data-act="them-ct"][data-nhom="mo"]');
      await page.fill('.tam input[data-f="cach"]', '200'); await page.fill('.tam input[data-f="rong"]', '-900'); await page.fill('.tam input[data-f="cao"]', '2200');
      await page.click('[data-act="ct-xong"]');
      assert.equal(await page.locator('.tam').count(), 1, 'tấm còn mở');
      assert.match(await page.textContent('.tam'), /Rộng.*số âm/);
      await page.fill('.tam input[data-f="rong"]', '900'); await page.click('[data-act="ct-xong"]');
      assert.equal(await page.locator('.tam').count(), 0);
      // tường 3,6 mm: lưu ý vàng
      await page.fill('input[data-o="tuong.0.dai"]', '3,6'); await sl(200);
      assert.match(await page.textContent('[data-ui="tt"]'), /Tường A chỉ dài 3,6 mm/);
      await ctx.close();
    });
    await ca(5, 'xung đột → "Lấy bản máy chủ" giữ ảnh vừa chụp ở máy này (nói trước trong hộp)', async () => {
      const { ctx, page } = await moTrang(); await taoPhong(page); await daGui(page);
      await ctx.setOffline(true);
      await chup(page); await net(page); await page.click('[data-act="chon-lien"][data-lien="tuong:0:dai"]'); await page.click('[data-act="ke-xong"]');
      const id = await page.evaluate(() => window.MNDO.S.rec.id);
      const cu = (await T.goi('GET', '/api/phong/' + id)).j;
      assert.equal((await T.goi('PUT', '/api/phong/' + id, { json: { ct: cu.ct, ten: 'P1 (máy B)', xong: false, ghi_chu: '', phong: cu.phong, anh: cu.anh, rev: cu.rev } })).st, 200);
      await ctx.setOffline(false); await page.evaluate(() => window.dispatchEvent(new Event('online')));
      await page.waitForSelector('[data-act="xd-lay"]', { timeout: 10000 });
      assert.match(await page.textContent('.tam'), /1 ảnh chụp ở máy này chưa lên máy chủ — giữ lại/);
      await page.click('[data-act="xd-lay"]'); await sl(500);
      assert.equal(await page.evaluate(() => window.MNDO.S.rec.ten), 'P1 (máy B)');
      assert.equal(await page.evaluate(() => window.MNDO.S.rec.anh.length), 1, 'ảnh giữ');
      assert.equal(await page.evaluate(() => window.MNDO.S.rec.anh[0].ke.length), 1, 'nét giữ');
      await cho(async () => (await T.goi('GET', '/api/phong/' + id)).j.anh_co.length === 1, 10000, 'ảnh lên máy chủ');
      await ctx.close();
    });
    await ca(6, 'xoá phòng mới trong lúc lần gửi đầu đang đi → máy chủ cũng không còn phòng', async () => {
      const { ctx, page } = await moTrang(); await taoCt(page); await daGui(page);
      const ct = await page.evaluate(() => location.hash.split('/')[2]);      // KHÔNG lấy DB.all('ct')[0]: máy đã tải về công trình của các ca trước
      let thay = false;
      await ctx.route('**/api/phong/**', async r => { if (r.request().method() !== 'PUT') return r.continue(); thay = true; const res = await r.fetch(); await sl(1500); r.fulfill({ response: res }); });
      if (process.env.DBG) page.on('request', q => { if (/\/api\/(phong|cong-trinh)/.test(q.url())) console.log('\n   >', q.method(), q.url().replace(M.goc, ''), Date.now() % 100000); });
      if (process.env.DBG) page.on('response', q => { if (/\/api\/(phong|cong-trinh)/.test(q.url())) console.log('   <', q.status(), q.request().method(), q.url().replace(M.goc, ''), Date.now() % 100000); });
      await taoPh(page); await cho(async () => thay, 5000, 'PUT đang đi');
      await page.click('[data-act="xoa-phong"]'); await page.click('[data-act="xoa-phong"]');
      await page.waitForSelector('[data-act="ph-moi"]');
      await sl(2500); await chayLai(page); await sl(800);
      assert.deepEqual((await T.goi('GET', `/api/cong-trinh/${ct}/phong`)).j.phong, [], 'máy chủ không còn phòng ma');
      assert.deepEqual((await phongMay(page)).filter(p => p.ct === ct), [], 'máy không hồi sinh phòng');
      await ctx.close();
    });
    await ca(8, 'bấm hai lần để xoá: lần bấm ở phòng 1 không tính cho phòng 2', async () => {
      const { ctx, page } = await moTrang(); await taoPhong(page);
      await page.click('[data-act="di"][data-h^="#/ct/"]'); await taoPh(page, 'P2');
      await page.click('[data-act="xoa-phong"]');
      await page.click('[data-act="di"][data-h^="#/ct/"]'); await page.click('[data-ui="ds-ph"] li:first-child button'); await page.waitForSelector('[data-ui="mb"]');
      assert.equal(await page.textContent('[data-ui="ten-ph"]'), 'P1');
      await page.click('[data-act="xoa-phong"]'); await sl(400);
      assert.equal((await phongMay(page)).length, 2, 'một lần bấm không xoá');
      await ctx.close();
    });
    await ca(10, 'mất trả lời đúng lúc gửi → gửi lại không báo oan "sửa ở máy khác"', async () => {
      const { ctx, page } = await moTrang(); await taoPhong(page); await daGui(page);
      let lan = 0;
      await ctx.route('**/api/phong/**', async r => { if (r.request().method() === 'PUT' && lan++ === 0) { await r.fetch(); return r.abort('internetdisconnected'); } r.continue(); });
      await page.fill('textarea[data-o="ghi_chu"]', 'góc trái có ống nước'); await page.locator('textarea[data-o="ghi_chu"]').blur();
      await cho(async () => lan > 0, 5000, 'PUT bị cắt'); await sl(500);
      await page.fill('textarea[data-o="ghi_chu"]', 'góc trái có ống nước, ổ điện cũ'); await page.locator('textarea[data-o="ghi_chu"]').blur(); await sl(900);
      await chayLai(page); await sl(1000);
      assert.equal(await page.locator('[data-act="xd-lay"]').count(), 0, 'không hộp xung đột');
      assert.ok(!/máy khác/.test(await th(page)), await th(page));
      const id = await page.evaluate(() => window.MNDO.S.rec.id);
      assert.equal((await T.goi('GET', '/api/phong/' + id)).j.ghi_chu, 'góc trái có ống nước, ổ điện cũ');
      await ctx.close();
    });
    await ca(11, 'phiên hết hạn giữa lúc kẻ số → màn kẻ ở lại, nét giữ, đăng nhập sau khi Xong', async () => {
      const { ctx, page } = await moTrang(); await taoPhong(page); await daGui(page);
      await ctx.clearCookies();
      await chup(page); await net(page); await page.click('[data-act="chon-lien"][data-lien="tuong:0:dai"]');
      await chayLai(page); await sl(1500);
      assert.equal(await page.locator('[data-ui="ke"]').count(), 1, 'màn kẻ còn');
      assert.equal(await page.locator('form[data-form="dang-nhap"]').count(), 0);
      assert.match(await th(page), /Phiên đăng nhập đã hết/);
      assert.equal(await page.evaluate(() => window.MNDO.DB.get('phong', window.MNDO.S.rec.id).then(p => p.anh[0].ke.length)), 1, 'nét đã lưu ngay');
      await page.click('[data-act="ke-xong"]');
      await page.waitForSelector('form[data-form="dang-nhap"]');
      await page.fill('input[name="ten"]', 'hung'); await page.fill('input[name="mk"]', MK_THO); await page.click('button[type="submit"]');
      await page.waitForSelector('[data-ui="mb"]');      // đăng nhập lại: về đúng phòng đang đo
      const id = await page.evaluate(() => window.MNDO.S.rec.id);
      await cho(async () => { const r = await T.goi('GET', '/api/phong/' + id); return r.j && r.j.anh[0] && r.j.anh[0].ke.length === 1; }, 10000, 'nét lên máy chủ');
      await ctx.close();
    });
    await ca(13, 'thợ khác: không có nút Xoá / Lưu trữ / Sửa công trình, không xoá được phòng người khác', async () => {
      const { ctx, page } = await moTrang(); await taoPhong(page); await daGui(page);
      const ct = await page.evaluate(() => window.MNDO.S.rec.ct);
      await cho(async () => { const r = await T.goi('GET', `/api/cong-trinh/${ct}/phong`); return r.st === 200 && r.j.phong.length === 1; }, 10000, 'phòng của A lên máy chủ');
      await ctx.close();
      const B = await moTrang('lan');
      await B.page.click(`[data-act="di"][data-h="#/ct/${ct}"]`); await B.page.waitForSelector('[data-act="ph-moi"]');
      assert.equal(await B.page.locator('[data-act="ct-xoa"], [data-act="ct-luu-tru"], [data-act="ct-sua"]').count(), 0);
      await cho(async () => await B.page.locator('[data-ui="ds-ph"] li button').count(), 5000, 'phòng của A');
      await B.page.click('[data-ui="ds-ph"] li:first-child button'); await B.page.waitForSelector('[data-ui="mb"]');
      assert.equal(await B.page.locator('[data-act="xoa-phong"]').count(), 0);
      await B.ctx.close();
    });
    assert.deepEqual(loiTrang, [], 'lỗi trong trang');
    console.log('— xong: mọi ca đạt');
  } catch (e) { console.error('\nHỎNG:', e); process.exitCode = 1; } finally { await browser.close(); await M.dong(); fs.rmSync(tmp, { recursive: true, force: true }); }
})();
