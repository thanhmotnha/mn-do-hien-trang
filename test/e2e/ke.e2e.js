'use strict';
// Màn kẻ số + màn phòng kiểu ImageMeter (đợt 1: 1.1 – 1.11; K7 mặt bằng dính, K8 gắn số phòng 1.2, K9 thước chuẩn 1.8 + 1.9, K10 soát số 1.11) ở 390 px. Chạy:
//   NODE_PATH=/opt/node22/lib/node_modules PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node test/e2e/ke.e2e.js [số ca]
// Kéo / chạm bằng chuột thật (page.mouse) và ngón thật (CDP Input.dispatchTouchEvent → pointerType 'touch').
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { moMay, quanLy, thoMoi, MK_THO } = require('../tro-giup');

const sl = ms => new Promise(r => setTimeout(r, ms));
const cho = async (fn, ms = 8000, ten = '') => { const het = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > het) throw new Error('chờ quá lâu: ' + ten); await sl(100); } };
const CHI = process.argv[2] || '';
const W = 390;

(async () => {
  const M = await moMay(), Q = await quanLy(M); await thoMoi(M, Q, 'hung', 'Hùng');
  const browser = await chromium.launch(), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mndo-ke-'));
  const loiTrang = [];
  const moTrang = async () => {
    const ctx = await browser.newContext({ viewport: { width: W, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: 'vi-VN' });
    const page = await ctx.newPage();
    page.on('pageerror', e => loiTrang.push(String(e)));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) loiTrang.push('console: ' + m.text()); });
    await page.goto(M.goc + '/'); await page.fill('input[name="ten"]', 'hung'); await page.fill('input[name="mk"]', MK_THO); await page.click('button[type="submit"]');
    await page.waitForSelector('[data-act="ct-moi"]');
    await page.click('[data-act="ct-moi"]'); await page.fill('form[data-form="ct"] input[name="ten"]', 'Nhà thử'); await page.click('form[data-form="ct"] button[type="submit"]');
    await page.waitForSelector('[data-act="ph-moi"]');
    await page.click('[data-act="ph-moi"]'); await page.fill('form[data-form="ph"] input[name="ten"]', 'P1'); await page.click('form[data-form="ph"] button[type="submit"]');
    await page.waitForSelector('[data-ui="mb"]');
    return { ctx, page, cdp: await ctx.newCDPSession(page) };
  };
  const jpeg = async page => page.evaluate(async () => { const c = document.createElement('canvas'); c.width = 800; c.height = 600; const x = c.getContext('2d'); x.fillStyle = '#ccc'; x.fillRect(0, 0, 800, 600); x.fillStyle = '#345'; x.fillRect(300, 200, 200, 300); const b = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9)); const a = new Uint8Array(await b.arrayBuffer()); let s = ''; for (const v of a) s += String.fromCharCode(v); return btoa(s); });
  const tepAnh = async page => { const f = path.join(tmp, Math.random() + '.jpg'); fs.writeFileSync(f, Buffer.from(await jpeg(page), 'base64')); return f; };
  const chup = async (page, sel = '.tuong[data-i="0"] [data-act="chup"]', n = 1) => { const ds = []; for (let i = 0; i < n; i++) ds.push(await tepAnh(page)); const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(sel)]); await fc.setFiles(ds); await page.waitForSelector('[data-ui="ke-canvas"]'); await sl(150); };
  const keo = async (page, x0, y0, x1, y1, buoc = 12) => { await page.mouse.move(x0, y0); await page.mouse.down(); for (let i = 1; i <= buoc; i++) await page.mouse.move(x0 + (x1 - x0) * i / buoc, y0 + (y1 - y0) * i / buoc); await page.mouse.up(); };
  const cham = async (page, x, y) => { await page.mouse.click(x, y); await sl(450); };      // chờ quá cửa sổ chạm hai lần
  const ke = page => page.evaluate(() => JSON.parse(JSON.stringify(window.MNDO.K.ke)));
  const K = (page, k) => page.evaluate(k => window.MNDO.K[k], k);
  const man = (page, q) => page.evaluate(q => window.MNDO.keMan.diem(q), q);
  const nhan = (page, i) => page.evaluate(i => window.MNDO.keMan.nhan(i), i);
  const giua = async page => { const b = await page.locator('[data-ui="ke-canvas"]').boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, b }; };
  const tc = (cdp, type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i })) });
  async function kiemMan(page, ten) {
    const r = await page.evaluate(() => {
      const sw = document.documentElement.scrollWidth, nho = [];
      for (const el of document.querySelectorAll('button, input, select, textarea')) {
        if (el.type === 'file' || el.type === 'hidden') continue;
        const b = el.getBoundingClientRect(), cs = getComputedStyle(el);
        if (!b.width || !b.height || cs.visibility === 'hidden' || cs.display === 'none' || el.closest('.an')) continue;
        if (el.type === 'checkbox') { const l = el.closest('label'); const lb = l && l.getBoundingClientRect(); if (lb && lb.height >= 44) continue; }
        if (b.width < 44 || b.height < 44) nho.push(`${el.tagName.toLowerCase()} "${(el.textContent || el.value || el.getAttribute('aria-label') || '').trim().slice(0, 30)}" ${Math.round(b.width)}×${Math.round(b.height)}`);
        if (el.tagName === 'INPUT' && parseFloat(cs.fontSize) < 16) nho.push('chữ ô nhập < 16px');
      }
      return { sw, nho };
    });
    assert.ok(r.sw <= W, `${ten}: cuộn ngang (scrollWidth ${r.sw})`);
    assert.deepEqual(r.nho, [], `${ten}: nút / ô bấm nhỏ hơn 44 × 44`);
  }
  const ca = async (so, ten, fn) => { if (CHI && CHI !== String(so)) return; process.stdout.write(`  K${so}. ${ten} … `); await fn(); console.log('đạt'); };

  try {
    console.log('— Màn kẻ số (đợt 1)');
    await ca(1, 'kẻ xong mở ô số ngay trên nhãn; "3 650" → 3650 (gõ tay), "abc" đỏ giữ ô; đoạn chưa số = "gõ số", không "?"; chạm nhãn cũ = sửa', async () => {
      const { ctx, page } = await moTrang(); await chup(page);
      assert.equal(await page.locator('[data-act="ke-che"][data-v="keo"]').count(), 0, 'không còn nút ✋ Kéo');
      await kiemMan(page, 'màn kẻ');
      const { y } = await giua(page);
      await keo(page, 60, y + 40, 330, y + 43);
      await page.waitForSelector('[data-ui="o-so-nhap"]');
      assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.dataset.ui), 'o-so-nhap', 'ô số được chọn sẵn');
      assert.equal(await page.getAttribute('[data-ui="o-so-nhap"]', 'inputmode'), 'decimal');
      // ô số đứng sát nhãn giữa đoạn
      const nh = await nhan(page, 0), ob = await page.locator('[data-ui="o-so"]').boundingBox();
      assert.ok(Math.abs(ob.y + ob.height - nh[1]) < 60 || Math.abs(ob.y - nh[1]) < 60, `ô số gần nhãn (${ob.y}…${ob.y + ob.height} / ${nh[1]})`);
      assert.ok(ob.x >= 0 && ob.x + ob.width <= W, 'ô số trong màn');
      await kiemMan(page, 'màn kẻ có ô số');
      await page.fill('[data-ui="o-so-nhap"]', 'abc'); await page.keyboard.press('Enter');
      assert.equal(await page.getAttribute('[data-ui="o-so-nhap"]', 'aria-invalid'), 'true');
      assert.match(await page.textContent('[data-ui="o-so-loi"]'), /không phải số/);
      await page.fill('[data-ui="o-so-nhap"]', '3 650'); await page.keyboard.press('Enter');
      await cho(async () => !(await page.locator('[data-ui="o-so"]').count()), 2000, 'ô số đóng');
      let k = await ke(page);
      assert.deepEqual([k[0].so, k[0].text, k[0].nguon], [3650, '3650', 'go']);
      assert.match(await page.textContent('[data-ui="ds-net"]'), /Kích thước 3650/);
      // đoạn thứ hai không gõ số: Esc → nét đứt "gõ số"
      await keo(page, 80, y - 60, 300, y - 120);
      await page.waitForSelector('[data-ui="o-so-nhap"]'); await page.keyboard.press('Escape');
      k = await ke(page); assert.equal(k.length, 2); assert.equal(k[1].text, undefined);
      assert.match(await page.textContent('[data-net="1"]'), /gõ số/); assert.doesNotMatch(await page.textContent('[data-ui="ds-net"]'), /\?/);
      // chạm nhãn của đoạn cũ → sửa số
      const n0 = await nhan(page, 0); await cham(page, n0[0], n0[1]);
      await page.waitForSelector('[data-ui="o-so-nhap"]');
      assert.equal(await page.inputValue('[data-ui="o-so-nhap"]'), '3650');
      await page.fill('[data-ui="o-so-nhap"]', '3700'); await page.click('[data-act="so-xong"]');
      k = await ke(page); assert.equal(k[0].so, 3700);
      // chạm nhãn "gõ số" của đoạn 2
      const n1 = await nhan(page, 1); await cham(page, n1[0], n1[1]);
      await page.waitForSelector('[data-ui="o-so-nhap"]'); assert.equal(await page.inputValue('[data-ui="o-so-nhap"]'), '');
      await page.fill('[data-ui="o-so-nhap"]', '1200,5'); await page.keyboard.press('Enter');
      k = await ke(page); assert.deepEqual([k[1].so, k[1].text], [1200.5, '1200,5']);
      // nét ghi ngay; gói gửi đi vẽ số vào chu như cũ
      await cho(async () => (await page.evaluate(() => window.MNDO.S.rec.anh[0].ke.length)) === 2, 2000, 'nét giữ trong phòng');
      await page.click('[data-act="ke-xong"]');
      const chu = await page.evaluate(() => { const r = window.MNDO.S.rec; return window.MNDOGoi.phanTich(Object.assign({}, r.phong, { ten: r.ten }), r.anh, window.MNCFPhong).gui.anh[0].chu.map(c => c.text); });
      assert.deepEqual(chu.sort(), ['1200,5', '3700']);
      await ctx.close();
    });

    await ca(2, 'chạm đoạn = chọn (2 núm), kéo núm sửa đầu đoạn, kéo khúc giữa dời cả đoạn, 🗑 xoá; ↶ / ↷ mọi việc', async () => {
      const { ctx, page } = await moTrang(); await chup(page);
      const { y } = await giua(page);
      await keo(page, 60, y, 300, y + 2); await page.fill('[data-ui="o-so-nhap"]', '2400'); await page.keyboard.press('Enter');
      let k = await ke(page); const a0 = k[0].a, b0 = k[0].b;
      assert.equal(a0[1], b0[1], 'lệch < 4° → thẳng ngang');
      await cham(page, 20, y + 200); assert.equal(await K(page, 'sel'), -1, 'chạm chỗ trống bỏ chọn');
      assert.equal(await page.isDisabled('[data-act="ke-bo-chon"]'), true);
      // chạm đoạn (xa nhãn) → chọn
      const p1 = await man(page, [a0[0] + (b0[0] - a0[0]) * 0.2, a0[1]]);
      await cham(page, p1[0], p1[1] + 4); assert.equal(await K(page, 'sel'), 0); assert.equal(await page.isDisabled('[data-act="ke-bo-chon"]'), false);
      // kéo núm b xuống 60 px → đầu b đổi, a giữ
      const B = await man(page, b0);
      await keo(page, B[0], B[1], B[0] - 20, B[1] + 60);
      k = await ke(page); assert.deepEqual(k[0].a, a0); assert.ok(k[0].b[1] > b0[1] + 20, 'b xuống'); assert.ok(Math.abs(k[0].b[0] - (b0[0] - 20 / (await K(page, 's')))) < 2);
      // kéo gần thẳng đứng (lệch ~2°) → dính dọc
      const A = await man(page, a0), B2 = await man(page, k[0].b);
      await keo(page, B2[0], B2[1], A[0] + 4, A[1] + 120);
      k = await ke(page); assert.equal(k[0].b[0], a0[0], 'dính dọc'); const b1 = k[0].b;
      // kéo khúc giữa: dời cả đoạn
      const M1 = await man(page, [(k[0].a[0] + k[0].b[0]) / 2, (k[0].a[1] + k[0].b[1]) / 2 + 10]);
      await keo(page, M1[0], M1[1], M1[0] + 50, M1[1] - 30);
      k = await ke(page); const s = await K(page, 's');
      assert.ok(Math.abs(k[0].a[0] - a0[0] - 50 / s) < 1.5 && Math.abs(k[0].b[1] - b1[1] + 30 / s) < 1.5, `dời cả đoạn ${JSON.stringify(k[0])} ${b1}`);
      assert.equal(k[0].so, 2400, 'số giữ khi sửa đoạn');
      // ↶ ba lần: về đoạn ban đầu
      for (let i = 0; i < 3; i++) await page.click('[data-act="ke-lui"]');
      k = await ke(page); assert.deepEqual([k[0].a, k[0].b], [a0, b0]);
      await page.click('[data-act="ke-lam-lai"]'); k = await ke(page); assert.ok(k[0].b[1] > b0[1] + 20, '↷ làm lại');
      // 🗑 xoá đoạn đang chọn, ↶ lấy lại; ↶ cả số đã gõ
      await cham(page, p1[0], p1[1] + 4); await page.click('[data-act="ke-bo-chon"]');
      assert.equal((await ke(page)).length, 0);
      assert.equal(await page.evaluate(() => window.MNDO.S.rec.anh[0].ke.length), 0, 'xoá ghi ngay');
      await page.click('[data-act="ke-lui"]'); assert.equal((await ke(page)).length, 1, '↶ lấy lại đoạn đã xoá');
      for (let i = 0; i < 2; i++) await page.click('[data-act="ke-lui"]');
      k = await ke(page); assert.equal(k.length, 1); assert.equal(k[0].so, undefined, '↶ bỏ số đã gõ');
      await page.click('[data-act="ke-lui"]'); assert.equal((await ke(page)).length, 0, '↶ bỏ cả nét');
      assert.equal(await page.isDisabled('[data-act="ke-lui"]'), true);
      // ✕ trong danh sách cũng lùi được
      await page.click('[data-act="ke-lam-lai"]'); await page.click('[data-act="ke-bo"][data-i="0"]'); await page.click('[data-act="ke-lui"]');
      assert.equal((await ke(page)).length, 1);
      await ctx.close();
    });

    await ca(3, 'bắt dính đầu đoạn khác (≤ 12 px) có vòng xanh', async () => {
      const { ctx, page } = await moTrang(); await chup(page);
      const { y } = await giua(page);
      await keo(page, 60, y, 250, y + 1); await page.keyboard.press('Escape');
      await cham(page, 20, y + 220);      // bỏ chọn: đặt ngón cạnh núm của đoạn ĐANG CHỌN là kéo núm, không vẽ mới
      const k0 = (await ke(page))[0], B = await man(page, k0.b);
      // bắt đầu cách đầu b 7 px, kết thúc nghiêng 30° (không dính ngang / dọc) — chụp vòng xanh giữa chừng
      await page.mouse.move(B[0] + 5, B[1] + 5); await page.mouse.down();
      for (let i = 1; i <= 10; i++) await page.mouse.move(B[0] + 5 + 9 * i, B[1] + 5 - 5 * i);
      const dinh = await K(page, 'dinh'); assert.equal(dinh, null, 'giữa đường không dính');
      // về gần đầu a của đoạn 1 → dính + vòng xanh
      const A = await man(page, k0.a);
      for (let i = 1; i <= 8; i++) await page.mouse.move(B[0] + 95 + (A[0] + 6 - B[0] - 95) * i / 8, B[1] - 45 + (A[1] - 9 - B[1] + 45) * i / 8);
      const d2 = await K(page, 'dinh'); assert.equal(d2 && d2.kieu, 'diem'); assert.deepEqual(d2.p, k0.a);
      await page.mouse.up(); await page.keyboard.press('Escape');
      const k = await ke(page); assert.deepEqual(k[1].a, k0.b, 'đầu đoạn mới dính đầu b'); assert.deepEqual(k[1].b, k0.a, 'cuối dính đầu a');
      assert.equal(await K(page, 'dinh'), null, 'nhả tay: thôi vòng xanh');
      await ctx.close();
    });

    await ca(4, 'ngón tay: kính lúp 3× hiện ngay khi đặt ngón, ở góc xa ngón; điểm đặt cao hơn ngón 60 px; hai ngón phóng, không vẽ; chạm hai lần vừa khung', async () => {
      const { ctx, page, cdp } = await moTrang(); await chup(page);
      const { y, b } = await giua(page);
      const at = await page.evaluate(([x, yy]) => window.MNDO.keMan.anh(x, yy), [80, y]);      // đo TRƯỚC khi kẻ: danh sách dài ra thì khung co, ảnh vừa khung lại
      await tc(cdp, 'touchStart', [[80, y + 60]]);
      await cho(() => page.evaluate(() => getComputedStyle(document.querySelector('[data-ui="kinh"]')).display === 'block'), 2000, 'kính hiện ngay');
      assert.equal(await page.getAttribute('[data-ui="kinh"]', 'data-goc'), 'tren-phai', 'ngón dưới-trái → kính trên-phải');
      const kb = await page.locator('[data-ui="kinh"]').boundingBox(); assert.ok(kb.x > W / 2 && kb.x + kb.width <= W);
      assert.equal(await page.evaluate(() => document.querySelector('[data-ui="kinh"]').width / (window.devicePixelRatio || 1)), 120);
      for (let i = 1; i <= 10; i++) await tc(cdp, 'touchMove', [[80 + i * 22, y + 60]]);
      await tc(cdp, 'touchEnd', []);
      await page.waitForSelector('[data-ui="o-so-nhap"]'); await page.keyboard.press('Escape');
      let k = await ke(page);
      assert.ok(Math.abs(k[0].a[0] - at[0]) < 1 && Math.abs(k[0].a[1] - at[1]) < 1, `điểm đầu cao hơn ngón 60 px: ${k[0].a} / ${at}`);
      // ngón ở góc trên-phải → kính dưới-trái
      await tc(cdp, 'touchStart', [[W - 40, b.y + 90]]); await sl(50);
      assert.equal(await page.getAttribute('[data-ui="kinh"]', 'data-goc'), 'duoi-trai');
      await tc(cdp, 'touchEnd', []); await sl(450);
      // hai ngón: phóng to, không thêm nét
      const s0 = await K(page, 's');
      await tc(cdp, 'touchStart', [[150, y]]); await tc(cdp, 'touchStart', [[150, y], [240, y]]);
      for (let i = 1; i <= 8; i++) await tc(cdp, 'touchMove', [[150 - i * 8, y], [240 + i * 8, y]]);
      await tc(cdp, 'touchEnd', [[86, y]]); await tc(cdp, 'touchEnd', []);
      assert.ok(await K(page, 's') > s0 * 1.4, 'phóng to'); assert.equal((await ke(page)).length, 1, 'hai ngón không vẽ');
      // chạm hai lần chỗ trống → vừa khung
      await page.mouse.click(30, b.y + b.height - 20); await sl(80); await page.mouse.click(32, b.y + b.height - 22);
      assert.ok(Math.abs(await K(page, 's') - s0) < 1e-6, 'chạm hai lần: vừa khung');
      k = await ke(page); assert.equal(k.length, 1);
      await ctx.close();
    });

    await ca(5, 'chip "Dài tường A": số gõ trên ảnh điền ô của phòng; ↶ trả lại số phòng', async () => {
      const { ctx, page } = await moTrang(); await chup(page);
      assert.equal(await page.evaluate(() => window.MNDO.S.rec.phong.tuong[0].dai), 0);
      const { y } = await giua(page);
      await keo(page, 60, y, 320, y);
      await page.fill('[data-ui="o-so-nhap"]', '3600');
      await page.click('[data-act="chon-lien"][data-lien="tuong:0:dai"]');
      assert.equal(await page.evaluate(() => window.MNDO.S.rec.phong.tuong[0].dai), 3600);
      let k = await ke(page); assert.deepEqual([k[0].lien, k[0].text], ['tuong:0:dai', '3600']);
      // sửa số trên nhãn của đoạn liên kết → sửa luôn số phòng
      const n = await nhan(page, 0); await cham(page, n[0], n[1]);
      await page.fill('[data-ui="o-so-nhap"]', '3620'); await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => window.MNDO.S.rec.phong.tuong[0].dai), 3620);
      await page.click('[data-act="ke-lui"]'); assert.equal(await page.evaluate(() => window.MNDO.S.rec.phong.tuong[0].dai), 3600);
      await page.click('[data-act="ke-lui"]'); assert.equal(await page.evaluate(() => window.MNDO.S.rec.phong.tuong[0].dai), 0, '↶ trả ô phòng về trống');
      await page.click('[data-act="ke-lam-lai"]'); await page.click('[data-act="ke-xong"]');
      assert.equal(await page.inputValue('input[data-o="tuong.0.dai"]'), '3600', 'thẻ tường thấy số mới');
      await ctx.close();
    });

    await ca(6, '"📷 Chụp tiếp" mở ảnh mới ngay trong màn kẻ; chụp nhiều ảnh một lần → "Ảnh kế ›" lần lượt', async () => {
      const { ctx, page } = await moTrang(); await chup(page, undefined, 2);
      assert.equal(await page.evaluate(() => window.MNDO.S.rec.anh.length), 2);
      assert.match(await page.textContent('[data-act="ke-anh-ke"]'), /2\/2/);
      const { y } = await giua(page);
      await keo(page, 60, y, 320, y); await page.fill('[data-ui="o-so-nhap"]', '1000');
      const id2 = await page.evaluate(() => window.MNDO.S.rec.anh[1].id);
      await page.click('[data-act="ke-anh-ke"]');      // số đang gõ được giữ
      await cho(() => page.evaluate(id => window.MNDO.K.a.id === id, id2), 3000, 'sang ảnh 2');
      assert.equal(await page.evaluate(() => window.MNDO.S.rec.anh[0].ke[0].so), 1000);
      assert.equal(await page.locator('[data-act="ke-anh-ke"]').count(), 0, 'ảnh cuối: không còn Ảnh kế');
      const f = await tepAnh(page);
      const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-act="ke-chup-tiep"]')]);
      await fc.setFiles(f);
      await cho(() => page.evaluate(() => window.MNDO.S.rec.anh.length === 3 && window.MNDO.K.a === window.MNDO.S.rec.anh[2]), 4000, 'ảnh mới mở');
      assert.equal(await page.evaluate(() => window.MNDO.S.rec.anh[2].tuong), 0, 'ảnh chụp tiếp cùng tường');
      await kiemMan(page, 'màn kẻ ảnh 3');
      await page.click('[data-act="ke-xong"]'); await page.waitForSelector('[data-anh="0"] img');
      assert.equal(await page.locator('[data-anh="0"] img').count(), 3);
      await ctx.close();
    });

    const bb = (page, sel) => page.locator(sel).first().boundingBox();
    const go = async (page, o, v) => { await page.fill(`input[data-o="${o}"]`, v); await sl(150); };
    const tt = page => page.textContent('[data-ui="tt"]');
    const moT = async (page, i) => { if (await page.getAttribute(`.tuong[data-i="${i}"] .dau-t`, 'aria-expanded') !== 'true') await page.click(`.tuong[data-i="${i}"] .dau-t`); };

    await ca(7, 'mặt bằng nhỏ dính trên cùng (≤ 30 % màn), đổi ngay khi gõ, tường đang sửa tô xanh, tường máy suy nét đứt "máy suy", chạm để phóng; tấm cửa có mặt bằng', async () => {
      const { ctx, page } = await moTrang();
      await go(page, 'tuong.0.dai', '3600');
      await moT(page, 1); await go(page, 'tuong.1.dai', '3000');
      assert.equal(await page.locator('[data-ui="mb"] [data-suy-mb]').count(), 2, 'C, D máy suy');
      assert.match(await page.textContent('[data-ui="mb"] [data-suy-mb="2"]'), /máy suy/);
      assert.equal(await page.getAttribute('[data-ui="mb"] [data-suy-mb="2"] line', 'stroke-dasharray') !== null, true, 'nét đứt');
      assert.equal(await page.getAttribute('[data-ui="mb"]', 'data-chon'), '1', 'tường B đang sửa');
      let b = await bb(page, '[data-ui="mb"] svg'); assert.ok(b.height <= 844 * 0.3, `mặt bằng ${b.height}px > 30 %`);
      // cuộn xuống ô Cao trần: mặt bằng vẫn trên màn
      await page.locator('input[data-o="cao"]').scrollIntoViewIfNeeded(); await page.focus('input[data-o="cao"]'); await sl(250);
      b = await bb(page, '[data-ui="mb"] svg'); assert.ok(b.y >= 0 && b.y + b.height <= 844 * 0.45, `mặt bằng dính trên cùng (${b.y})`);
      const oc = await bb(page, 'input[data-o="cao"]'); assert.ok(oc.y >= b.y + b.height, 'ô đang gõ không nằm dưới mặt bằng');
      // gõ là đổi ngay (chưa rời ô)
      await moT(page, 1); await page.locator('input[data-o="tuong.1.dai"]').fill('3250'); await sl(150);
      assert.match(await page.textContent('[data-ui="mb"] svg'), /3250/);
      assert.equal(await page.locator('[data-ui="mb"] [data-suy-mb="3"]').count(), 1);
      await kiemMan(page, 'phòng có mặt bằng dính');
      // phóng to / thu nhỏ
      const h0 = (await bb(page, '[data-ui="mb"] svg')).height;
      await page.click('[data-act="mb-to"]'); assert.ok((await bb(page, '[data-ui="mb"] svg')).height > h0 * 1.5, 'phóng to');
      await page.click('[data-act="mb-to"]'); assert.ok(Math.abs((await bb(page, '[data-ui="mb"] svg')).height - h0) < 2, 'thu nhỏ');
      // tấm thêm cửa: mặt bằng trong tấm, cửa hiện khi gõ số
      await page.click('.tuong[data-i="1"] [data-act="them-ct"][data-nhom="mo"]');
      assert.ok(await page.locator('[data-ui="mb-tam"] svg').count(), 'mặt bằng trong tấm');
      await page.fill('.tam input[data-f="cach"]', '300'); await page.fill('.tam input[data-f="rong"]', '900'); await page.fill('.tam input[data-f="cao"]', '2100'); await sl(100);
      assert.match(await page.textContent('[data-ui="mb-tam"]'), /cửa 900/);
      await page.fill('.tam input[data-f="rong"]', '800'); await sl(100);
      assert.match(await page.textContent('[data-ui="mb-tam"]'), /cửa 800/);
      assert.equal(await page.evaluate(() => window.MNDO.S.rec.phong.mo.length), 0, 'chưa ghi khi chưa bấm Xong');
      await kiemMan(page, 'tấm cửa có mặt bằng');
      await ctx.close();
    });

    await ca(8, 'đoạn ngang đầu tiên gợi ý "Dài tường A"; số khác ô phòng → vàng "Dùng số ảnh / Giữ số cũ", không ghi đè lặng lẽ; chip Cao trần / Không gắn', async () => {
      const { ctx, page } = await moTrang();
      await go(page, 'tuong.0.dai', '3600');
      await chup(page);
      const { y } = await giua(page);
      await keo(page, 60, y, 320, y + 3);
      assert.equal(await page.getAttribute('[data-act="chon-lien"][data-lien="tuong:0:dai"]', 'aria-pressed'), 'true', 'gợi ý Dài tường A');
      assert.match(await page.textContent('[data-ui="o-so"]'), /Gợi ý: đoạn ngang đầu tiên = Dài tường A.*sai thì chạm ô khác bên dưới/);
      assert.equal(await page.locator('[data-act="chon-lien"][data-lien=""]').count(), 1, 'chip Không gắn');
      assert.equal(await page.locator('[data-act="chon-lien"][data-lien="tuong:0:cao"]', { hasText: 'Cao trần' }).count(), 1);
      await page.fill('[data-ui="o-so-nhap"]', '3650'); await page.keyboard.press('Enter');
      await page.waitForSelector('[data-ui="o-so-lech"]');
      assert.match(await page.textContent('[data-ui="o-so-lech"]'), /Dài tường A đang là 3\u00a0600, số trên ảnh 3\u00a0650/);
      assert.equal(await page.evaluate(() => window.MNDO.S.rec.phong.tuong[0].dai), 3600, 'chưa ghi đè');
      await kiemMan(page, 'ô số hỏi khác số cũ');
      await page.click('[data-act="so-dung-anh"]');
      assert.equal(await page.evaluate(() => window.MNDO.S.rec.phong.tuong[0].dai), 3650);
      let k = await ke(page); assert.deepEqual([k[0].lien, k[0].so], ['tuong:0:dai', 3650]);
      await page.click('[data-act="ke-lui"]'); assert.equal(await page.evaluate(() => window.MNDO.S.rec.phong.tuong[0].dai), 3600, '↶ một bước');
      await page.click('[data-act="ke-lam-lai"]');
      // đoạn đứng: không gợi ý; Esc không gắn gì
      await keo(page, 200, y - 120, 202, y + 100);
      assert.equal(await page.getAttribute('[data-act="chon-lien"][data-lien=""]', 'aria-pressed'), 'true', 'đoạn đứng: không gợi ý');
      await page.fill('[data-ui="o-so-nhap"]', '2650');
      await page.click('[data-act="chon-lien"][data-lien="tuong:0:cao"]');      // trần đang là số điền sẵn 2700 → không coi là "khác số cũ"
      assert.equal(await page.locator('[data-ui="o-so"]').count(), 0);
      assert.deepEqual(await page.evaluate(() => [window.MNDO.S.rec.phong.cao, !!window.MNDO.S.rec.cao_san]), [2650, false]);
      await page.click('[data-act="ke-xong"]');
      // sửa thẻ tường SAU khi gắn: ảnh đổi theo, KHÔNG báo vàng (vòng soát: trước đây báo oan, nút "Dùng số ảnh" trả số sai về)
      await go(page, 'tuong.0.dai', '3600'); await sl(200);
      assert.doesNotMatch(await tt(page), /Ảnh tường A ghi/);
      assert.equal(await page.evaluate(() => window.MNDOGoi.phanTich(Object.assign({}, window.MNDO.S.rec.phong), window.MNDO.S.rec.anh, window.MNCFPhong).gui.anh[0].chu.some(c => c.text === '3600')), true, 'ảnh vẽ số mới của phòng');
      // đoạn MỚI gắn Dài tường A với số khác, câu hỏi chưa trả lời mà bấm Xong: không kẹt — đoạn giữ số ảnh, phòng giữ số cũ → dòng vàng
      const keLech = async (so, dau) => {
        await page.click('[data-anh="0"] [data-act="ke"]'); await page.waitForSelector('[data-ui="ke-canvas"]'); await sl(200);
        const g2 = await giua(page); await keo(page, 70, g2.y + dau, 300, g2.y + dau);
        await page.fill('[data-ui="o-so-nhap"]', so); await page.click('[data-act="chon-lien"][data-lien="tuong:0:dai"]');
        await page.waitForSelector('[data-ui="o-so-lech"]');
        await page.click('[data-act="ke-xong"]');
        await cho(async () => !(await page.locator('[data-ui="ke-canvas"]').count()), 3000, 'Xong đóng màn kẻ khi câu hỏi còn mở');
      };
      await keLech('3700', 90);
      await cho(async () => /Ảnh tường A ghi 3 700, Dài tường A đang 3 600/.test(await tt(page)), 3000, 'vàng số ảnh khác');
      assert.equal(await page.evaluate(() => window.MNDO.S.rec.phong.tuong[0].dai), 3600, 'phòng giữ số cũ');
      await page.click('[data-act="lech-anh"]');
      assert.equal(await page.evaluate(() => window.MNDO.S.rec.phong.tuong[0].dai), 3700, 'Dùng số ảnh');
      assert.doesNotMatch(await tt(page), /Ảnh tường A ghi/);
      await keLech('3650', 140);
      await page.waitForSelector('[data-act="lech-giu"]'); await page.click('[data-act="lech-giu"]');
      assert.equal(await page.evaluate(() => window.MNDO.S.rec.anh[0].ke.slice(-1)[0].so), 3700, 'Giữ số cũ: đoạn theo số phòng');
      assert.equal(await page.evaluate(() => window.MNDO.S.rec.phong.tuong[0].dai), 3700);
      assert.doesNotMatch(await tt(page), /Ảnh tường A ghi/);
      await ctx.close();
    });

    await ca(9, 'thước chuẩn: đoạn chưa số hiện "≈ … ước" (không vào số phòng), "Dùng số này"; ước lệch số đo > 5 % → vàng; "Tường A còn thiếu"; nhãn ảnh "N kích thước"', async () => {
      const { ctx, page } = await moTrang();
      await chup(page);
      assert.match(await page.textContent('[data-ui="ke-thieu"]'), /Tường A còn thiếu: Dài tường A, Cao trần/);
      const { y } = await giua(page);
      await keo(page, 60, y, 330, y); await page.fill('[data-ui="o-so-nhap"]', '2700'); await page.keyboard.press('Enter');
      assert.match(await page.textContent('[data-ui="ke-thieu"]'), /Tường A còn thiếu: Cao trần$/);
      await keo(page, 60, y + 80, 195, y + 80); await page.keyboard.press('Escape');
      const t1 = await page.textContent('[data-net="1"]'), m = /≈(\d[\d \u00a0]*) ước/.exec(t1);
      assert.ok(m && Math.abs(+m[1].replace(/[ \u00a0]/g, '') - 1350) <= 30, `số ước ≈1 350: ${t1}`);
      assert.match(t1, /gõ số/);
      let k = await ke(page); assert.equal(k[1].so, undefined, 'số ước không vào dữ liệu');
      const n1 = await nhan(page, 1); await cham(page, n1[0], n1[1]);
      await page.waitForSelector('[data-act="so-dung-uoc"]');
      assert.match(await page.getAttribute('[data-ui="o-so-nhap"]', 'placeholder'), /≈.*ước/);
      await kiemMan(page, 'ô số có số ước');
      await page.click('[data-act="so-dung-uoc"]');
      k = await ke(page); assert.equal(k[1].nguon, 'uoc'); assert.ok(Math.abs(k[1].so - 1350) <= 30);
      // đoạn thứ 3 dài bằng đoạn 2 mà gõ 2000: ước lệch > 5 %
      assert.equal(await page.locator('[data-ui="uoc-lech"]').count(), 0);
      await keo(page, 60, y + 140, 195, y + 140); await page.fill('[data-ui="o-so-nhap"]', '2000'); await page.keyboard.press('Enter');
      await page.waitForSelector('[data-ui="uoc-lech"]');
      assert.match(await page.textContent('[data-ui="uoc-lech"]'), /ảnh chụp xiên/);
      await page.click('[data-act="ke-xong"]');
      await page.waitForSelector('[data-anh="0"] .nhan');
      const nh = await page.textContent('[data-anh="0"] .nhan'); assert.match(nh, /^2 kích thước · 1 số ước/); assert.doesNotMatch(nh, /nét/);
      assert.match(await tt(page), /số ước \(tính theo số đã gõ trên ảnh\) lệch số đo/);
      // ảnh chưa kẻ: "Chưa kẻ số — chạm để kẻ" + lưu ý xám
      await moT(page, 0);
      await chup(page, '[data-act="chup"][data-tuong=""]'); await page.click('[data-act="ke-xong"]');
      await moT(page, 1); await chup(page, '.tuong[data-i="1"] [data-act="chup"]'); await page.click('[data-act="ke-xong"]');
      await cho(async () => /Chưa kẻ số — chạm để kẻ/.test(await page.textContent('[data-anh="1"]')), 3000, 'nhãn ảnh chưa kẻ');
      assert.match(await tt(page), /Ảnh tường B chưa kẻ số nào/);
      await ctx.close();
    });

    await ca(10, 'soát số: đỏ chặn Đo xong (tường > 30 000, cột cao hơn trần), vàng (> 15 000, trần lạ, chữ nhật lệch), xám (máy suy từ A, cửa chưa có ảnh), "3,6" → 3600', async () => {
      const { ctx, page } = await moTrang();
      await go(page, 'tuong.0.dai', '20000');
      assert.match(await tt(page), /Tường A dài 20\u00a0000 — có gõ thừa số 0 không\?/);
      await go(page, 'tuong.0.dai', '35000');
      assert.match(await page.textContent('[data-ui="tt"] [data-soat="do"]'), /Tường A dài 35\u00a0000 mm — quá 30\u00a0000/);
      await page.click('input[data-o="xong"]'); await sl(150);
      assert.equal(await page.isChecked('input[data-o="xong"]'), false, 'đỏ chặn Đo xong');
      assert.match(await page.textContent('[data-ui="bao-xong"]'), /Còn 1 số vô lý/);
      // "3,6" rời ô → 3600
      await go(page, 'tuong.0.dai', '3,6'); assert.ok(await page.locator('[data-ui="tt"] [data-soat="do"]').count(), '3,6 mm đỏ');
      await page.locator('input[data-o="tuong.0.dai"]').blur(); await sl(150);
      assert.equal(await page.inputValue('input[data-o="tuong.0.dai"]'), '3600');
      assert.equal(await page.evaluate(() => window.MNDO.S.rec.phong.tuong[0].dai), 3600);
      assert.match(await page.textContent('[data-ui="bao-m"]'), /đã đổi 3,6 m thành 3\u00a0600 mm/);
      await moT(page, 1); await go(page, 'tuong.1.dai', '3000');
      assert.match(await tt(page), /Tường C ≈ 3\u00a0600 do máy suy từ A/);
      await moT(page, 2); await go(page, 'tuong.2.dai', '3700');
      assert.match(await tt(page), /Tường A 3\u00a0600 và tường C 3\u00a0700 lệch 100 mm/);
      await go(page, 'tuong.2.dai', '3620'); assert.doesNotMatch(await tt(page), /lệch 20 mm/);
      await go(page, 'cao', '5000'); assert.match(await tt(page), /Cao trần 5\u00a0000 — ngoài khoảng/);
      await go(page, 'cao', '2700');
      // cột cao hơn trần
      await moT(page, 1);
      await page.click('.tuong[data-i="1"] [data-act="them-ct"][data-nhom="can"]');
      await page.fill('.tam input[data-f="cach"]', '100'); await page.fill('.tam input[data-f="rong"]', '300'); await page.fill('.tam input[data-f="nho"]', '300'); await page.fill('.tam input[data-f="z1"]', '3000');
      await page.click('[data-act="ct-xong"]');
      assert.match(await page.textContent('[data-ui="tt"] [data-soat="do"]'), /Cột 1 \(tường B\) cao tới \+3\u00a0000 — cao hơn trần 2\u00a0700/);
      // cửa trên C mà chưa có ảnh
      await moT(page, 2); await page.click('.tuong[data-i="2"] [data-act="them-ct"][data-nhom="mo"]');
      await page.fill('.tam input[data-f="cach"]', '200'); await page.fill('.tam input[data-f="rong"]', '900'); await page.fill('.tam input[data-f="cao"]', '2200'); await page.click('[data-act="ct-xong"]');
      assert.match(await tt(page), /Tường C có cửa mà chưa có ảnh/);
      await kiemMan(page, 'phòng có dòng soát');
      await ctx.close();
    });

    /* ===== vòng soát đợt 1 (0.2.0): mỗi lỗi một ca ===== */
    const R = page => page.evaluate(() => JSON.parse(JSON.stringify(window.MNDO.S.rec)));
    const goiTho = page => page.evaluate(() => { const r = window.MNDO.S.rec; return window.MNDOGoi.phanTich(Object.assign({}, r.phong, { ten: r.ten }), r.anh, window.MNCFPhong).gui; });

    await ca(11, 'số ước chỉ ghi lên ảnh "≈…", KHÔNG vào phòng dù chip gợi ý đang bật; về từ máy chủ (mất so / nguon) vẫn là số ước, không làm thước', async () => {
      const { ctx, page } = await moTrang(); await chup(page);
      const { y } = await giua(page);
      await keo(page, 200, y - 120, 202, y + 100); await page.fill('[data-ui="o-so-nhap"]', '2700'); await page.keyboard.press('Enter');
      await keo(page, 60, y + 130, 330, y + 130);
      assert.equal(await page.getAttribute('[data-act="chon-lien"][data-lien="tuong:0:dai"]', 'aria-pressed'), 'true', 'chip gợi ý bật sẵn');
      await page.waitForSelector('[data-act="so-dung-uoc"]');
      assert.match(await page.textContent('[data-ui="o-so"]'), /KHÔNG vào số của phòng/);
      await page.click('[data-act="so-dung-uoc"]');
      let r = await R(page), k = r.anh[0].ke[1];
      assert.equal(r.phong.tuong[0].dai, 0, 'số ước không vào Dài tường A');
      assert.equal(k.lien, undefined); assert.equal(k.nguon, 'uoc'); assert.match(k.text, /^≈\d+$/);
      const gui = await goiTho(page); assert.equal(gui.phong.tuong[0].dai, 0);
      assert.ok(gui.anh[0].chu.some(c => /^≈\d+$/.test(c.text)), 'ảnh gửi đi ghi "≈…"');
      assert.match(await page.textContent('[data-net="1"]'), /≈\d+.*\(số ước\)/);
      // giả lập bản về từ máy chủ: chỉ còn loai / a / b / text / lien
      await page.evaluate(() => { const K = window.MNDO.K; K.ke = K.ke.map(x => { const o = { loai: x.loai, a: x.a, b: x.b }; if (x.text !== undefined) o.text = x.text; if (x.lien) o.lien = x.lien; return o; }); });
      await keo(page, 60, y + 40, 330, y + 40); await page.keyboard.press('Escape');
      const t2 = await page.textContent('[data-net="2"]'), m = /≈([\d  ]+) ước/.exec(t2);
      assert.ok(m, 'đoạn mới có số ước theo đoạn đo thật'); assert.match(await page.textContent('[data-net="1"]'), /\(số ước\)/);
      await kiemMan(page, 'màn kẻ có số ước');
      await ctx.close();
    });

    await ca(12, 'chip trên ô trống chỉ GẮN — không chép trần điền sẵn / số máy suy vào đoạn như số đo; số máy suy không đè số đo thật', async () => {
      const { ctx, page } = await moTrang(); await chup(page);
      const { y } = await giua(page);
      await keo(page, 200, y - 120, 202, y + 100);
      await page.click('[data-act="chon-lien"][data-lien="tuong:0:cao"]');
      let r = await R(page), k = r.anh[0].ke[0];
      assert.equal(k.lien, 'tuong:0:cao'); assert.equal(k.so, undefined, 'không chép 2700 điền sẵn'); assert.equal(k.nguon, undefined);
      assert.equal(r.cao_san, true); assert.match(await page.textContent('[data-ui="ke-thieu"]'), /Cao trần/);
      await page.click('[data-act="ke-xong"]');
      assert.match(await page.textContent('[data-anh="0"] .nhan'), /1 chưa có số/, 'trần điền sẵn không đếm là kích thước');
      await go(page, 'tuong.0.dai', '3600'); await moT(page, 1); await go(page, 'tuong.1.dai', '3000');
      await chup(page, '[data-act="chup"][data-tuong=""]');
      await keo(page, 60, y, 320, y + 3);
      await page.click('[data-act="chon-lien"][data-lien="tuong:2:dai"]');
      r = await R(page); k = r.anh[1].ke[0]; assert.deepEqual([k.lien, k.so], ['tuong:2:dai', undefined], 'Dài tường C máy suy: chỉ gắn');
      await page.click('[data-act="ke-xong"]');
      await moT(page, 2); await go(page, 'tuong.2.dai', '3650'); await sl(200);
      assert.equal(await page.locator('[data-act="lech-anh"]').count(), 0, 'không có "Dùng số ảnh" trả 3600 máy suy về');
      assert.equal((await R(page)).phong.tuong[2].dai, 3650);
      await ctx.close();
    });

    await ca(13, 'đổi chip / Không gắn sau khi số đã vào phòng: ô của phòng trả lại số trước khi gắn', async () => {
      const { ctx, page } = await moTrang(); await chup(page);
      const { y } = await giua(page);
      await keo(page, 60, y, 320, y + 3); await page.fill('[data-ui="o-so-nhap"]', '830'); await page.keyboard.press('Enter');
      assert.equal((await R(page)).phong.tuong[0].dai, 830);
      let n = await nhan(page, 0); await cham(page, n[0], n[1]); await page.waitForSelector('[data-ui="o-so-nhap"]');
      await page.click('[data-act="chon-lien"][data-lien=""]');
      let r = await R(page); assert.equal(r.phong.tuong[0].dai, 0, 'Dài tường A về trống'); assert.deepEqual([r.anh[0].ke[0].lien, r.anh[0].ke[0].so], [undefined, 830]);
      // ô đã có số trước khi gắn: thôi gắn thì về số cũ
      await page.click('[data-act="ke-xong"]'); await go(page, 'tuong.0.dai', '3600');
      await page.click('[data-anh="0"] [data-act="ke"]'); await page.waitForSelector('[data-ui="ke-canvas"]'); await sl(150);
      n = await nhan(page, 0); await cham(page, n[0], n[1]); await page.waitForSelector('[data-ui="o-so-nhap"]');
      await page.fill('[data-ui="o-so-nhap"]', '3650'); await page.click('[data-act="chon-lien"][data-lien="tuong:0:dai"]');
      await page.click('[data-act="so-dung-anh"]'); assert.equal((await R(page)).phong.tuong[0].dai, 3650);
      n = await nhan(page, 0); await cham(page, n[0], n[1]); await page.waitForSelector('[data-ui="o-so-nhap"]');
      await page.click('[data-act="chon-lien"][data-lien="tuong:0:cao"]');
      r = await R(page); assert.equal(r.phong.tuong[0].dai, 3600, 'đổi sang Cao trần: Dài tường A về 3600'); assert.equal(r.phong.cao, 3650);
      await ctx.close();
    });

    await ca(14, 'không Enter thì không vào phòng: gõ rồi chạm ảnh / Xong / Ảnh kế với chip GỢI Ý → số chỉ trên đoạn', async () => {
      const { ctx, page } = await moTrang(); await chup(page, undefined, 2);
      const { y, b } = await giua(page);
      await keo(page, 60, y, 320, y + 3); await page.fill('[data-ui="o-so-nhap"]', '3650');
      const ob = await page.locator('[data-ui="o-so"]').boundingBox(), cy = ob.y > b.y + b.height / 2 ? b.y + 30 : b.y + b.height - 30;
      await cham(page, 30, cy);
      let r = await R(page); assert.equal(r.phong.tuong[0].dai, 0, 'chạm ảnh: không vào phòng'); assert.deepEqual([r.anh[0].ke[0].so, r.anh[0].ke[0].lien], [3650, undefined]);
      assert.equal(await K(page, 'sel'), -1);
      await keo(page, 60, y + 80, 320, y + 83); await page.keyboard.press('Escape');      // đoạn ngang thứ hai: không gợi ý nữa
      await keo(page, 200, y - 120, 202, y + 100); await page.fill('[data-ui="o-so-nhap"]', '2650');
      await page.click('[data-act="ke-anh-ke"]'); await sl(300);
      r = await R(page); assert.equal(r.anh[0].ke[2].so, 2650); assert.equal(r.cao_san, true, 'Ảnh kế: trần vẫn điền sẵn');
      await keo(page, 60, y, 320, y + 3); await page.fill('[data-ui="o-so-nhap"]', '3700'); await page.click('[data-act="ke-xong"]');
      await page.waitForSelector('[data-anh="0"] img');
      r = await R(page); assert.equal(r.phong.tuong[0].dai, 0, 'Xong: không vào phòng'); assert.equal(r.anh[1].ke[0].so, 3700);
      await ctx.close();
    });

    await ca(15, 'số gõ dở (chưa ✓) còn sau khi tải lại trang / app bị tắt', async () => {
      const { ctx, page } = await moTrang(); await chup(page);
      const { y } = await giua(page);
      await keo(page, 60, y, 320, y + 3); await page.fill('[data-ui="o-so-nhap"]', '3650'); await sl(1200);
      await page.reload(); await page.waitForSelector('[data-ui="mb"]'); await sl(400);
      const r = await R(page); assert.equal(r.anh[0].ke[0].so, 3650, 'số gõ dở còn'); assert.equal(r.anh[0].ke[0].nhap, undefined); assert.equal(r.phong.tuong[0].dai, 0);
      assert.match(await page.textContent('[data-anh="0"] .nhan'), /1 kích thước/);
      await ctx.close();
    });

    await ca(16, '"Lấy bản máy chủ": trần máy kia đã đo thì thôi "điền sẵn"', async () => {
      const { ctx, page } = await moTrang();
      assert.equal((await R(page)).cao_san, true);
      await page.evaluate(async () => {
        const M = window.MNDO, r = M.S.rec, h = JSON.parse(JSON.stringify(r)); h.phong.cao = 2850; h.rev = (r.rev || 0) + 5; h.sua_luc = Date.now(); h.anh = []; h.anh_co = [];
        r.xung_dot = h; await M.DB.put('phong', r);
      });
      await page.evaluate(() => { location.hash = '#/'; }); await page.waitForSelector('[data-act="ct-moi"]');
      await page.evaluate(id => { location.hash = '#/ph/' + id; }, (await R(page)).id); await page.waitForSelector('[data-act="xd-lay"]');
      await page.click('[data-act="xd-lay"]'); await page.waitForSelector('[data-ui="mb"]'); await sl(200);
      const r = await R(page); assert.equal(r.phong.cao, 2850); assert.equal(r.cao_san, undefined);
      assert.equal(await page.locator('[data-ui="cao-san"]').count(), 0, 'không còn "Đang là số điền sẵn"');
      await ctx.close();
    });

    await ca(17, 'khung ảnh: bộ đệm canvas = cỡ trên màn (mở ảnh, sau nhiều đoạn); nét đỏ nằm đúng chỗ chuột đã kéo; ảnh vừa khung', async () => {
      const { ctx, page } = await moTrang(); await chup(page);
      const kh = () => page.evaluate(() => { const c = document.querySelector('[data-ui="ke-canvas"]'), d = window.devicePixelRatio || 1; return { css: c.clientHeight, buf: c.height / d, w: c.clientWidth, bw: c.width / d }; });
      let c = await kh(); assert.ok(Math.abs(c.css - c.buf) < 1 && Math.abs(c.w - c.bw) < 1, `mở ảnh: ${JSON.stringify(c)}`);
      const { b } = await giua(page);
      for (const [i, yy] of [b.y + 80, b.y + 150, b.y + 220].entries()) { await keo(page, 60, yy, 330, yy); await page.fill('[data-ui="o-so-nhap"]', String(1000 + i)); await page.keyboard.press('Enter'); }
      await sl(200);
      c = await kh(); assert.ok(Math.abs(c.css - c.buf) < 1, `sau 3 đoạn: ${JSON.stringify(c)}`);
      const yy = b.y + 290; await keo(page, 60, yy, 330, yy); await page.keyboard.press('Escape'); await sl(150);
      const do_ = await page.evaluate(([x, y]) => {
        const c = document.querySelector('[data-ui="ke-canvas"]'), r = c.getBoundingClientRect(), d = window.devicePixelRatio || 1, x2 = c.getContext('2d');
        const ra = []; for (let dy = -12; dy <= 12; dy++) { const p = x2.getImageData(Math.round((x - r.left) * d), Math.round((y + dy - r.top) * d), 1, 1).data; if (p[0] > 180 && p[1] < 90 && p[2] < 90) ra.push(dy); }
        return ra;
      }, [130, yy]);
      assert.ok(do_.length && Math.min(...do_.map(Math.abs)) <= 2, `nét đỏ ở đúng chỗ chuột (lệch ${JSON.stringify(do_)})`);
      // ảnh 4:3 vừa khung: thấy trọn ảnh
      const v = await page.evaluate(() => { const K = window.MNDO.K; return { top: K.ty, bot: K.ty + K.a.h * K.s, ch: K.ch }; });
      assert.ok(v.top >= -0.5 && v.bot <= v.ch + 0.5, `ảnh trọn trong khung ${JSON.stringify(v)}`);
      await ctx.close();
    });

    await ca(18, 'đoạn vừa kẻ thôi được chọn khi ô số đóng: kẻ đoạn song song / nối tiếp không kéo mất đoạn cũ; dời cả đoạn ra mép không co đoạn', async () => {
      const { ctx, page, cdp } = await moTrang(); await chup(page);
      const { y } = await giua(page);
      for (let i = 0; i <= 10; i++) await tc(cdp, i ? 'touchMove' : 'touchStart', [[60 + i * 26, y + 60]]); await tc(cdp, 'touchEnd', []);
      await page.waitForSelector('[data-ui="o-so-nhap"]'); await page.fill('[data-ui="o-so-nhap"]', '3600'); await page.keyboard.press('Enter');
      assert.equal(await K(page, 'sel'), -1, 'ô số đóng: bỏ chọn');
      const k0 = (await ke(page))[0];
      // ngón đặt ĐÚNG lên nét cũ (điểm vẽ cao hơn ngón 60 px) → kẻ đoạn mới, không nắm nét cũ
      for (let i = 0; i <= 10; i++) await tc(cdp, i ? 'touchMove' : 'touchStart', [[70 + i * 24, y]]); await tc(cdp, 'touchEnd', []);
      await page.waitForSelector('[data-ui="o-so-nhap"]'); await page.keyboard.press('Escape');
      let k = await ke(page); assert.equal(k.length, 2, 'có đoạn mới'); assert.deepEqual([k[0].a, k[0].b], [k0.a, k0.b], 'đoạn cũ đứng yên');
      // nối tiếp từ đầu b của đoạn cũ bằng chuột
      const B = await man(page, k0.b); await keo(page, B[0] + 4, B[1] + 3, B[0] + 6, B[1] + 150); await page.keyboard.press('Escape');
      k = await ke(page); assert.equal(k.length, 3); assert.deepEqual(k[2].a, k0.b, 'dính đầu đoạn cũ'); assert.deepEqual([k[0].a, k[0].b], [k0.a, k0.b]);
      // chọn đoạn 1, dời cả đoạn ra quá mép phải: đoạn giữ nguyên chiều dài
      const L0 = Math.hypot(k0.b[0] - k0.a[0], k0.b[1] - k0.a[1]);
      const P = await man(page, [k0.a[0] + (k0.b[0] - k0.a[0]) * 0.25, k0.a[1]]); await cham(page, P[0], P[1] + 3); assert.equal(await K(page, 'sel'), 0);
      await keo(page, P[0], P[1] + 3, P[0] + 300, P[1] + 3, 20);
      k = await ke(page); const L1 = Math.hypot(k[0].b[0] - k[0].a[0], k[0].b[1] - k[0].a[1]);
      assert.ok(Math.abs(L1 - L0) < 0.01, `giữ chiều dài ${L0} → ${L1}`); assert.ok(Math.max(k[0].a[0], k[0].b[0]) <= 800 + 1e-6, 'trong ảnh');
      await ctx.close();
    });

    await ca(19, 'ngón chạm nhãn run ~11 px vẫn là sửa số (không thêm đoạn tí hon); vệt ngắn < 24 px không thành đoạn', async () => {
      const { ctx, page, cdp } = await moTrang(); await chup(page);
      const { y } = await giua(page);
      await keo(page, 60, y, 320, y + 3); await page.fill('[data-ui="o-so-nhap"]', '3600'); await page.keyboard.press('Enter');
      const n = await nhan(page, 0);
      await tc(cdp, 'touchStart', [[n[0], n[1]]]); await tc(cdp, 'touchMove', [[n[0] + 7, n[1] + 4]]); await tc(cdp, 'touchMove', [[n[0] + 10, n[1] + 5]]); await tc(cdp, 'touchEnd', []);
      await page.waitForSelector('[data-ui="o-so-nhap"]');
      assert.equal((await ke(page)).length, 1, 'không thêm đoạn'); assert.equal(await page.inputValue('[data-ui="o-so-nhap"]'), '3600', 'mở ô sửa số');
      await page.keyboard.press('Escape'); await sl(450);
      await keo(page, 100, y + 120, 115, y + 125, 4); await sl(450);
      assert.equal((await ke(page)).length, 1, 'vệt 15 px không thành đoạn'); assert.equal(await page.locator('[data-ui="o-so"]').count(), 0);
      await ctx.close();
    });

    await ca(20, 'mặt bằng dính: chữ tường ≥ 11 px, cao không đổi khi gõ; phóng to chừa ≥ 340 px; gõ ô của phòng thì tự thu nhỏ; bàn phím che thì còn dải mỏng', async () => {
      const { ctx, page } = await moTrang();
      const coChu = () => page.evaluate(() => { const sv = document.querySelector('[data-ui="mb"] svg'), vb = sv.viewBox.baseVal, k = Math.min(sv.clientWidth / vb.width, sv.clientHeight / vb.height); return Array.from(sv.querySelectorAll('[data-nhan-mb]'), t => +t.getAttribute('font-size') * k); });
      await go(page, 'tuong.0.dai', '3');
      const h1 = (await bb(page, '[data-ui="mb"] svg')).height;
      await go(page, 'tuong.0.dai', '36'); await go(page, 'tuong.0.dai', '360'); await go(page, 'tuong.0.dai', '3600');
      assert.ok(Math.abs((await bb(page, '[data-ui="mb"] svg')).height - h1) < 1, 'cao không đổi theo từng chữ số');
      await moT(page, 1); await go(page, 'tuong.1.dai', '3000');
      const cc = await coChu(); assert.equal(cc.length, 4); assert.ok(Math.min(...cc) >= 11, `chữ tường ${cc}`);
      assert.match(await page.textContent('[data-nhan-mb="0"]'), /A\s*3600/);
      // phòng hẹp sâu, phóng to: còn ≥ 340 px dưới phần dính
      await moT(page, 0); await go(page, 'tuong.0.dai', '2000'); await moT(page, 1); await go(page, 'tuong.1.dai', '6000');
      await page.click('[data-act="mb-to"]'); await sl(150);
      const d = await bb(page, '[data-ui="dinh"]'); assert.ok(d.y + d.height <= 844 - 330, `phóng to chừa chỗ (${d.y + d.height})`);
      await page.focus('input[data-o="tuong.1.dai"]'); await sl(250);
      assert.equal(await page.evaluate(() => window.MNDO.S.mb_to), false, 'gõ ô của phòng: thu nhỏ');
      const ib = await bb(page, 'input[data-o="tuong.1.dai"]'), d2 = await bb(page, '[data-ui="dinh"]');
      assert.ok(ib.y >= d2.y + d2.height - 1, 'ô đang gõ không khuất dưới mặt bằng');
      // bàn phím che (khung nhìn thấy 400 / 844): mặt bằng thu thành dải mỏng
      await page.evaluate(() => { Object.defineProperty(window.visualViewport, 'height', { configurable: true, get: () => 400 }); window.visualViewport.dispatchEvent(new Event('resize')); });
      await sl(150); assert.ok((await bb(page, '[data-ui="mb"] svg')).height <= 70, 'bàn phím che: mặt bằng ≤ 70 px');
      await page.evaluate(() => { delete window.visualViewport.height; window.visualViewport.dispatchEvent(new Event('resize')); });
      await kiemMan(page, 'phòng có mặt bằng mới');
      await ctx.close();
    });

    await ca(21, 'bàn phím làm trang co lại khi đang gõ số: ẩn danh sách / dòng việc, khung ảnh vẫn lớn và khớp bộ đệm', async () => {
      const { ctx, page } = await moTrang(); await chup(page);
      const { y } = await giua(page);
      await keo(page, 60, y, 320, y + 3); await page.waitForSelector('[data-ui="o-so-nhap"]');
      await page.setViewportSize({ width: W, height: 544 }); await sl(300);
      assert.equal(await page.evaluate(() => document.querySelector('[data-ui="ke"]').classList.contains('ban-phim')), true);
      const c = await page.evaluate(() => { const c = document.querySelector('[data-ui="ke-canvas"]'); return { h: c.clientHeight, buf: c.height / (window.devicePixelRatio || 1) }; });
      assert.ok(c.h >= 330 && Math.abs(c.h - c.buf) < 1, `khung ảnh ${JSON.stringify(c)}`);
      assert.equal(await page.isVisible('[data-ui="ds-net"]'), false);
      const ob = await page.locator('[data-ui="o-so-nhap"]').boundingBox(); assert.ok(ob.y >= 0 && ob.y + ob.height <= 544, 'ô số nhìn thấy');
      await page.fill('[data-ui="o-so-nhap"]', '3600'); await page.keyboard.press('Enter');
      await page.setViewportSize({ width: W, height: 844 }); await sl(300);
      assert.equal(await page.evaluate(() => document.querySelector('[data-ui="ke"]').classList.contains('ban-phim')), false);
      assert.equal(await page.isVisible('[data-ui="ds-net"]'), true);
      await ctx.close();
    });

    await ca(22, 'ảnh thứ hai của cùng tường không gợi ý lại "Dài tường A"; câu "khác số cũ" có "Không phải Dài tường A" giữ số vừa gõ; "2,65" không gắn → 2 650 mm; chữ dễ hiểu, số không ngắt dòng', async () => {
      const { ctx, page } = await moTrang(); await chup(page, undefined, 2);
      const { y } = await giua(page);
      await keo(page, 60, y, 320, y + 3); await page.fill('[data-ui="o-so-nhap"]', '3600'); await page.keyboard.press('Enter');
      assert.match(await page.textContent('[data-ui="ke-thieu"]'), /Cao trần/);
      await page.click('[data-act="ke-anh-ke"]'); await cho(() => page.evaluate(() => window.MNDO.K.a === window.MNDO.S.rec.anh[1]), 3000, 'ảnh 2');
      await sl(150);
      await keo(page, 100, y, 250, y + 2);
      assert.equal(await page.getAttribute('[data-act="chon-lien"][data-lien=""]', 'aria-pressed'), 'true', 'ảnh 2: không gợi ý');
      await page.fill('[data-ui="o-so-nhap"]', '900'); await page.click('[data-act="chon-lien"][data-lien="tuong:0:dai"]');
      await page.waitForSelector('[data-act="so-khong-gan"]');
      assert.match(await page.textContent('[data-act="so-khong-gan"]'), /Không phải Dài tường A/);
      await kiemMan(page, 'câu hỏi có ba nút');
      await page.click('[data-act="so-khong-gan"]');
      let r = await R(page); assert.deepEqual([r.anh[1].ke[0].so, r.anh[1].ke[0].lien, r.phong.tuong[0].dai], [900, undefined, 3600]);
      // "2,65" trên đoạn không gắn: mét → mm, giữ đủ số lẻ, có báo
      await keo(page, 200, y - 120, 202, y + 100); await page.fill('[data-ui="o-so-nhap"]', '2,65'); await page.keyboard.press('Enter');
      r = await R(page); assert.deepEqual([r.anh[1].ke[1].so, r.anh[1].ke[1].text], [2650, '2650']);
      assert.match(await page.textContent('[data-ui="ke-tt"]'), /Đã đổi 2,65 m thành 2 650 mm/);
      await sl(450); await keo(page, 40, y + 60, 160, y + 62); await page.fill('[data-ui="o-so-nhap"]', '1200,55'); await page.keyboard.press('Enter');
      assert.equal((await ke(page))[2].text, '1200,55', 'chữ giữ số thợ gõ');
      await page.click('[data-act="ke-xong"]');
      // lời ở màn phòng: không "đoạn 1", không "ô", không "thước chuẩn"; số có dấu cách không ngắt
      await go(page, 'tuong.0.dai', '20000'); await moT(page, 1); await go(page, 'tuong.1.dai', '3000');
      const v = await page.$$eval('[data-ui="tt"] [data-soat="vang"]', a => a.map(e => e.textContent));
      assert.equal(v.filter(t => /Tường C/.test(t)).length, 0, `tường máy suy không báo vàng trùng ý: ${v}`);
      const t = await tt(page); assert.doesNotMatch(t, /\d \d{3}/, 'số có dấu cách thường'); assert.doesNotMatch(t, /thước chuẩn|đoạn \d+ ghi/);
      await ctx.close();
    });

    assert.deepEqual(loiTrang, [], 'lỗi trong trang');

    console.log('— xong: mọi ca đạt');
  } catch (e) {
    console.error('\nHỎNG:', e.stack || e); if (loiTrang.length) console.error('lỗi trang:', loiTrang);
    process.exitCode = 1;
  } finally { await browser.close(); await M.dong(); fs.rmSync(tmp, { recursive: true, force: true }); }
})();
