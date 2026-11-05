/* Đo hiện trạng — trang điện thoại cho thợ đo (Một Nhà Design & Build).
 * Một tệp, không khung. Mọi sửa đổi ghi NGAY vào IndexedDB (nháp trong máy), hàng đợi gửi dần lên máy chủ khi có mạng.
 * Gói cho máy vẽ (`gui`) tính trên máy bằng ĐÚNG lib/goi.js + mncf-phong.js của máy vẽ để thợ thấy trước; máy chủ tính lại khi lưu.
 */
(function () {
  'use strict';
  const Ph = window.MNCFPhong, G = window.MNDOGoi;
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = v => String(v === undefined || v === null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const g = v => String(G.rn(v, 1)).replace('.', ',');
  const soDoc = v => { if (v === null || v === undefined) return null; const s = String(v).trim().replace(',', '.'); if (!s) return null; const x = Number(s); return isFinite(x) ? x : null; };
  const app = $('#app'), lop = $('#lop'), thanh = $('#thanh');
  const gioPhut = ms => { const d = new Date(ms); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  const homNay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const ngauNhien = n => { const k = 'abcdefghijklmnopqrstuvwxyz0123456789', b = new Uint8Array(n); crypto.getRandomValues(b); let s = ''; for (let i = 0; i < n; i++) s += k[b[i] % 36]; return s; };
  const idMoi = dau => dau + ngauNhien(20);
  const S = { toi: null, rec: null, mo: 0, hen: 0, gui_luc: 0, dang_gui: null, xoa_cho: {} };

  /* ================= IndexedDB ================= */
  const DB = {
    db: null,
    mo() {
      return new Promise((ok, hong) => {
        const r = indexedDB.open('mndo', 1);
        r.onupgradeneeded = () => { const d = r.result; for (const [n, k] of [['meta', 'k'], ['ct', 'id'], ['phong', 'id'], ['anh', 'id'], ['hang', 'k']]) if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, { keyPath: k }); };
        r.onsuccess = () => { DB.db = r.result; ok(); }; r.onerror = () => hong(r.error);
      });
    },
    lam(store, mode, fn) {
      return new Promise((ok, hong) => { const t = DB.db.transaction(store, mode), s = t.objectStore(store); let kq; const r = fn(s); if (r) r.onsuccess = () => { kq = r.result; }; t.oncomplete = () => ok(kq); t.onerror = () => hong(t.error); t.onabort = () => hong(t.error); });
    },
    get: (s, k) => DB.lam(s, 'readonly', x => x.get(k)),
    put: (s, v) => DB.lam(s, 'readwrite', x => x.put(v)),
    del: (s, k) => DB.lam(s, 'readwrite', x => x.delete(k)),
    all: s => DB.lam(s, 'readonly', x => x.getAll()),
    async xoaHet() { for (const s of ['meta', 'ct', 'phong', 'anh', 'hang']) await DB.lam(s, 'readwrite', x => x.clear()); },
  };

  /* ================= mạng ================= */
  async function api(method, path, body, hd) {
    const o = { method, headers: Object.assign({}, hd || {}), credentials: 'same-origin', cache: 'no-store' };
    if (method !== 'GET') o.headers['x-mndo'] = '1';
    if (body !== undefined) { if (body instanceof Blob) o.body = body; else { o.body = JSON.stringify(body); o.headers['content-type'] = 'application/json'; } }
    let r; try { r = await fetch(path, o); } catch (e) { const x = new Error('Mất mạng'); x.mang = true; throw x; }
    let j = {}; try { j = await r.json(); } catch (e) { j = {}; }
    if (r.status === 401 && path !== '/api/dang-nhap' && path !== '/api/toi') canDangNhap();
    return { st: r.status, ok: r.ok, j };
  }
  function canDangNhap() { if (!S.toi) return; S.toi = null; veDangNhap('Phiên đăng nhập đã hết — đăng nhập lại. Nháp trong máy vẫn giữ nguyên.'); }

  /* ================= hàng đợi gửi ================= */
  const TH = { ct: 0, phong: 1, anh: 2 };
  async function xepHang(loai, id) { await DB.put('hang', { k: loai + ':' + id, loai, id, th: TH[loai], lan: 0, cho_den: 0, dung: '' }); capThanh(); henChay(200); }
  let henC = 0; function henChay(ms) { clearTimeout(henC); henC = setTimeout(() => chayHang().catch(e => console.error(e)), ms); }
  const LUI = [5000, 15000, 60000, 300000];
  async function chayHang() {
    if (S.dang_gui || !S.toi) return;
    S.dang_gui = { anh: 0, tong: 0 };
    try {
      for (;;) {
        const ds = (await DB.all('hang')).filter(j => !j.dung).sort((a, b) => a.th - b.th);
        const conPhong = new Set(ds.filter(j => j.loai === 'phong').map(j => j.id));
        const anhJ = ds.filter(j => j.loai === 'anh');
        S.dang_gui.tong = Math.max(S.dang_gui.tong, S.dang_gui.anh + anhJ.length);
        const j = ds.find(x => x.cho_den <= Date.now() && !(x.loai === 'anh' && conPhong.has(x.phong)));
        if (!j) break;
        if (j.loai === 'anh') { S.dang_gui.anh++; capThanh(); }
        let kq;
        try { kq = await guiViec(j); } catch (e) {
          // mất mạng / máy chủ lỗi / lỗi lạ: lùi 5 s, 15 s, 60 s, 5 phút rồi thử lại — không bao giờ bỏ việc
          if (!e.mang && !(e.st >= 500)) console.error(e);
          j.lan = (j.lan || 0) + 1; j.cho_den = Date.now() + LUI[Math.min(j.lan - 1, LUI.length - 1)]; await DB.put('hang', j); S.mat_mang = !!e.mang; break;
        }
        S.mat_mang = false;
        if (kq === 'xong') { const cu = await DB.get('hang', j.k); if (cu && (cu.ver || 0) === (j.ver || 0)) await DB.del('hang', j.k); S.gui_luc = Date.now(); }
        else if (kq === 'dung' || kq === 'het_phien') { if (kq === 'het_phien') break; }
      }
    } finally { S.dang_gui = null; capThanh(); }
    const ds = await DB.all('hang'), tiep = ds.filter(j => !j.dung).map(j => j.cho_den).sort((a, b) => a - b)[0];
    if (tiep) henChay(Math.max(1000, tiep - Date.now()));
  }
  async function dungViec(j, loi) { j.dung = loi; await DB.put('hang', j); }
  /** @returns 'xong' | 'dung' | 'het_phien'; lỗi mạng / 5xx thì ném */
  async function guiViec(j) {
    const nem = r => { const e = new Error('máy chủ ' + r.st); e.st = r.st; throw e; };
    if (j.loai === 'ct') {
      const c = await DB.get('ct', j.id); if (!c) return 'xong';
      const r = await api('PUT', '/api/cong-trinh/' + c.id, { ten: c.ten, dia_chi: c.dia_chi, ngay: c.ngay, nguoi_do: c.nguoi_do });
      if (r.st >= 500) nem(r); if (r.st === 401) return 'het_phien';
      if (r.ok) { c.tren_may = true; await DB.put('ct', c); return 'xong'; }
      await dungViec(j, r.j.error || 'Máy chủ không nhận công trình'); return 'dung';
    }
    if (j.loai === 'phong') {
      const p = await DB.get('phong', j.id); if (!p) return 'xong';
      const dem = p.dem;
      const r = await api('PUT', '/api/phong/' + p.id, { ct: p.ct, ten: p.ten, xong: !!p.xong, ghi_chu: p.ghi_chu || '', phong: p.phong, anh: p.anh, rev: p.rev || 0, ghi_de: !!p.ghi_de });
      if (r.st >= 500) nem(r); if (r.st === 401) return 'het_phien';
      const moi = await DB.get('phong', j.id) || p;
      if (r.ok) {
        moi.rev = r.j.rev; moi.ghi_de = false; moi.anh_co = r.j.anh_co; moi.sua_luc = r.j.sua_luc; delete moi.xung_dot; delete moi.loi_gui;
        await DB.put('phong', moi);
        for (const id of r.j.can_gui || []) { const a = await DB.get('anh', id); if (a && a.blob) await DB.put('hang', { k: 'anh:' + id, loai: 'anh', id, phong: p.id, th: 2, lan: 0, cho_den: 0, dung: '' }); }
        // bản đang mở trong bộ nhớ cũng phải mang số bản mới — không thì lần lưu kế gửi số bản cũ, tự đụng chính mình (409)
        if (S.rec && S.rec.id === moi.id) { S.rec.rev = moi.rev; S.rec.ghi_de = false; S.rec.anh_co = moi.anh_co; S.rec.sua_luc = moi.sua_luc; delete S.rec.loi_gui; }
        if (moi.dem !== dem) return 'giu';      // thợ sửa tiếp trong lúc gửi: giữ việc, gửi lại bản mới
        return 'xong';
      }
      if (r.st === 409 && r.j.hien_tai) { moi.xung_dot = r.j.hien_tai; await DB.put('phong', moi); await dungViec(j, 'xung_dot'); if (S.rec && S.rec.id === moi.id) { S.rec.xung_dot = moi.xung_dot; hoiXungDot(); } return 'dung'; }
      if (r.st === 422 && r.j.chi_tiet && r.j.chi_tiet.some(c => c.truong === 'ct')) {      // công trình chưa lên: gửi lại công trình trước
        const c = await DB.get('ct', p.ct); if (c) { await xepHang('ct', c.id); return 'giu'; }
      }
      moi.loi_gui = (r.j.error || 'Máy chủ không nhận') + (r.j.chi_tiet ? ': ' + r.j.chi_tiet.slice(0, 3).map(c => c.truong + ' ' + c.loi).join('; ') : '');
      await DB.put('phong', moi); await dungViec(j, moi.loi_gui); return 'dung';
    }
    if (j.loai === 'anh') {
      const a = await DB.get('anh', j.id); if (!a || !a.blob) return 'xong';
      const r = await api('PUT', '/api/anh/' + a.id, a.blob, { 'content-type': 'image/jpeg', 'x-phong': a.phong });
      if (r.st >= 500) nem(r); if (r.st === 401) return 'het_phien';
      if (r.ok || r.st === 409) { a.len = Date.now(); await DB.put('anh', a); const p = await DB.get('phong', a.phong); if (p) { p.anh_co = Array.from(new Set((p.anh_co || []).concat(a.id))); await DB.put('phong', p); if (S.rec && S.rec.id === p.id) S.rec.anh_co = p.anh_co; } return 'xong'; }
      if (r.st === 404) { const e = new Error('chưa có phòng'); e.st = 503; throw e; }      // phòng chưa lên kịp: thử lại sau
      await dungViec(j, r.j.error || 'Máy chủ không nhận ảnh'); return 'dung';
    }
    return 'xong';
  }
  async function capThanh() {
    if (!S.toi || !DB.db) { thanh.classList.add('an'); return; }
    const ds = await DB.all('hang'), cho = ds.filter(j => !j.dung), dung = ds.filter(j => j.dung && j.dung !== 'xung_dot'), xd = ds.filter(j => j.dung === 'xung_dot');
    let t = '', lp = '';
    const matMang = !navigator.onLine || S.mat_mang;
    if (xd.length) { t = `⚠ ${xd.length} phòng vừa sửa ở máy khác — mở phòng để chọn bản giữ`; lp = 'loi'; }
    else if (dung.length) { t = `⚠ ${dung.length} việc máy chủ không nhận — mở phòng để xem`; lp = 'loi'; }
    else if (S.dang_gui && S.dang_gui.anh) { t = `↑ Đang gửi ảnh ${S.dang_gui.anh}/${Math.max(S.dang_gui.tong, S.dang_gui.anh)}`; lp = 'cho'; }
    else if (cho.length) { t = `● ${cho.length} thay đổi chờ gửi${matMang ? ' — đang mất mạng' : ''}`; lp = 'cho'; }
    else t = S.gui_luc ? `✓ Đã gửi ${gioPhut(S.gui_luc)}` : '✓ Đã lưu trên máy chủ';
    thanh.textContent = t; thanh.className = 'thanh ' + lp;
  }
  window.addEventListener('online', () => { S.mat_mang = false; capThanh(); henChay(300); });
  window.addEventListener('offline', () => capThanh());
  setInterval(() => { if (document.visibilityState === 'visible') henChay(0); }, 30000);

  /* ================= tấm trượt ================= */
  function moTam(html, tren) { lop.innerHTML = `<div class="man-che${tren ? ' tren' : ''}" data-act="dong-tam-nen"><div class="tam" role="dialog" aria-modal="true">${html}</div></div>`; const o = $('.tam input, .tam textarea, .tam select', lop); if (o && !o.dataset.khongTu) o.focus(); }      // ngay, không hẹn giờ: hẹn giờ là giành tiêu điểm khỏi ô người dùng vừa bấm
  function dongTam() { lop.innerHTML = ''; }
  /** Bấm hai lần trong 3 giây (không dùng confirm). */
  function haiLan(b, chu) {
    const k = b.dataset.act + ':' + (b.dataset.i || b.dataset.id || '');
    if (S.xoa_cho[k] && Date.now() - S.xoa_cho[k] < 3000) { delete S.xoa_cho[k]; return true; }
    S.xoa_cho[k] = Date.now(); const cu = b.textContent; b.textContent = chu || 'Bấm lần nữa để chắc chắn'; b.classList.add('xn');
    setTimeout(() => { if (b.isConnected) { b.textContent = cu; b.classList.remove('xn'); } }, 3000);
    return false;
  }

  /* ================= đăng nhập ================= */
  function veDangNhap(bao) {
    dongTam(); thanh.classList.add('an');
    app.innerHTML = `<header class="dau"><h1>Đo hiện trạng</h1></header>
<form class="the" data-form="dang-nhap" autocomplete="on">
<p class="nhat">Một Nhà Design &amp; Build — trang đo cho thợ.</p>
${bao ? `<div class="msg vang">${esc(bao)}</div>` : ''}
<label>Tên đăng nhập<input name="ten" autocomplete="username" autocapitalize="none" spellcheck="false" required></label>
<label>Mật khẩu<input name="mk" type="password" autocomplete="current-password" required></label>
<div class="loi-o" data-ui="loi"></div>
<p><button class="chinh to" type="submit">Đăng nhập</button></p></form>`;
  }
  function veDoiMk(bat) {
    app.innerHTML = `<header class="dau">${bat ? '' : '<button class="lui" data-act="ve-dau" aria-label="Quay lại">‹</button>'}<h1>Đổi mật khẩu</h1></header>
<form class="the" data-form="doi-mk">${bat ? '<div class="msg vang">Đây là mật khẩu tạm — đặt mật khẩu riêng của bạn để dùng tiếp.</div>' : ''}
<label>Mật khẩu hiện tại<input name="cu" type="password" autocomplete="current-password" required></label>
<label>Mật khẩu mới<small>Ít nhất 10 ký tự, khác tên đăng nhập</small><input name="moi" type="password" autocomplete="new-password" minlength="10" required></label>
<label>Gõ lại mật khẩu mới<input name="moi2" type="password" autocomplete="new-password" required></label>
<div class="loi-o" data-ui="loi"></div>
<p><button class="chinh to" type="submit">Lưu mật khẩu mới</button></p></form>`;
  }
  async function nopDangNhap(f) {
    const r = await api('POST', '/api/dang-nhap', { ten: f.ten.value, mat_khau: f.mk.value }).catch(e => ({ st: 0, j: { error: 'Mất mạng — cần mạng để đăng nhập.' } }));
    if (!r.ok) { $('[data-ui="loi"]', f).textContent = r.j.error || 'Không đăng nhập được'; return; }
    S.toi = r.j; await DB.put('meta', { k: 'toi', v: r.j });
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* không xin được */ }
    if (r.j.bat_doi_mk) return veDoiMk(true);
    dinhTuyen(); henChay(100);
  }
  async function nopDoiMk(f) {
    const loi = $('[data-ui="loi"]', f);
    if (f.moi.value !== f.moi2.value) { loi.textContent = 'Hai lần gõ mật khẩu mới không giống nhau.'; return; }
    const r = await api('POST', '/api/doi-mat-khau', { cu: f.cu.value, moi: f.moi.value }).catch(() => ({ j: { error: 'Mất mạng' } }));
    if (!r.ok) { loi.textContent = r.j.error || 'Không đổi được'; return; }
    S.toi = r.j; await DB.put('meta', { k: 'toi', v: r.j });
    location.hash = '#/'; dinhTuyen(); henChay(100);
  }

  /* ================= định tuyến ================= */
  function dinhTuyen() {
    if (!S.toi) return veDangNhap();
    if (S.toi.bat_doi_mk) return veDoiMk(true);
    dongTam(); capThanh();
    const h = location.hash.replace(/^#\/?/, '').split('/');
    if (h[0] === 'ct' && h[1]) return veCongTrinh(h[1]);
    if (h[0] === 'ph' && h[1]) return vePhong(h[1]);
    if (h[0] === 'ql' && h[1] === 'tk' && S.toi.vai === 'quan_ly') return veTaiKhoan();
    if (h[0] === 'ql' && h[1] === 'ma' && S.toi.vai === 'quan_ly') return veMa();
    return veDanhSach();
  }
  window.addEventListener('hashchange', () => { luuNgay(); dinhTuyen(); });
  const di = h => { if (location.hash === h) dinhTuyen(); else location.hash = h; };

  /* ================= công trình ================= */
  async function hangCua() { const ds = await DB.all('hang'); return { ct: new Set(ds.filter(j => j.loai === 'ct').map(j => j.id)), phong: new Set(ds.filter(j => j.loai !== 'ct').map(j => j.loai === 'anh' ? j.phong : j.id)) }; }
  async function veDanhSach() {
    const ql = S.toi.vai === 'quan_ly';
    app.innerHTML = `<header class="dau"><h1>Công trình</h1><button data-act="menu" aria-label="Tài khoản">☰</button></header>
<p><button class="chinh to" data-act="ct-moi">+ Công trình mới</button></p>
${ql ? '<div class="hang"><button data-act="di" data-h="#/ql/tk">Tài khoản thợ</button><button data-act="di" data-h="#/ql/ma">Mã kết nối máy vẽ</button></div>' : ''}
<ul class="ds" data-ui="ds-ct"><li class="nhat">Đang tải…</li></ul>${laIOSChuaCai() ? '<div class="msg vang">iPhone: bấm Chia sẻ → <b>Thêm vào MH chính</b> để máy không xoá nháp khi lâu không mở.</div>' : ''}`;
    await veDsCt();
    try {
      const r = await api('GET', '/api/cong-trinh');
      if (r.ok) {
        const ds = await DB.all('ct'), hang = await hangCua();
        const tren = new Set(r.j.cong_trinh.map(c => c.id));
        for (const c of r.j.cong_trinh) { const cu = ds.find(x => x.id === c.id); if (!cu || !hang.ct.has(c.id)) await DB.put('ct', Object.assign(cu || {}, { id: c.id, ten: c.ten, dia_chi: c.dia_chi, ngay: c.ngay, nguoi_do: c.nguoi_do, tren_may: true, so_phong: c.so_phong, so_xong: c.so_xong, sua_luc: c.sua_luc })); }
        for (const c of ds) if (c.tren_may && !tren.has(c.id) && !hang.ct.has(c.id)) await DB.del('ct', c.id);      // đã xoá / lưu trữ ở máy khác
        if (location.hash.replace(/^#\/?/, '') === '') await veDsCt();
      }
    } catch (e) { /* mất mạng: bày bản trong máy */ }
  }
  async function veDsCt() {
    const el = $('[data-ui="ds-ct"]'); if (!el) return;
    const ds = await DB.all('ct'), ph = await DB.all('phong'), hang = await hangCua();
    ds.sort((a, b) => (b.sua_luc || b.tao_may || 0) - (a.sua_luc || a.tao_may || 0));
    el.innerHTML = ds.length ? ds.map(c => {
      const cua = ph.filter(p => p.ct === c.id), moi = cua.filter(p => !p.rev);
      const n = Math.max(c.so_phong || 0, cua.length) + (c.so_phong >= cua.length ? moi.length : 0), x = Math.max(c.so_xong || 0, cua.filter(p => p.xong).length);
      const cho = hang.ct.has(c.id) || cua.some(p => hang.phong.has(p.id));
      return `<li><button data-act="di" data-h="#/ct/${esc(c.id)}"><b>${esc(c.ten)}${cho ? '<span class="cham" title="Còn thay đổi chưa gửi"></span>' : ''}</b><small>${esc([c.dia_chi, c.ngay, c.nguoi_do].filter(Boolean).join(' · '))}</small><small>${x}/${n} phòng xong</small></button></li>`;
    }).join('') : '<li class="nhat">Chưa có công trình nào — bấm “+ Công trình mới”.</li>';
  }
  const laIOSChuaCai = () => /iphone|ipad/i.test(navigator.userAgent) && !navigator.standalone;
  function moFormCt(c) {
    moTam(`<h3>${c ? 'Sửa công trình' : 'Công trình mới'}</h3><form data-form="ct" data-id="${c ? esc(c.id) : ''}">
<label>Tên công trình<input name="ten" required maxlength="80" value="${esc(c ? c.ten : '')}" placeholder="Nhà anh Hùng"></label>
<label>Địa chỉ<input name="dia_chi" maxlength="200" value="${esc(c ? c.dia_chi : '')}"></label>
<label>Ngày đo<input name="ngay" type="date" required value="${esc(c ? c.ngay : homNay())}"></label>
<label>Người đo<input name="nguoi_do" maxlength="60" value="${esc(c ? c.nguoi_do : S.toi.ten_hien)}"></label>
<div class="loi-o" data-ui="loi"></div>
<div class="hang"><button type="button" data-act="dong-tam">Thôi</button><button class="chinh" type="submit">${c ? 'Lưu' : 'Tạo công trình'}</button></div></form>`);
  }
  async function nopCt(f) {
    const ten = f.ten.value.trim(); if (!ten) { $('[data-ui="loi"]', f).textContent = 'Cần tên công trình.'; return; }
    const id = f.dataset.id || idMoi('ct'), cu = (await DB.get('ct', id)) || { id, tao_may: Date.now() };
    Object.assign(cu, { ten, dia_chi: f.dia_chi.value.trim(), ngay: f.ngay.value || homNay(), nguoi_do: f.nguoi_do.value.trim(), sua_luc: Date.now() });
    await DB.put('ct', cu); await xepHang('ct', id); dongTam();
    di('#/ct/' + id);
  }
  async function veCongTrinh(id) {
    const c = await DB.get('ct', id);
    if (!c) { app.innerHTML = '<header class="dau"><button class="lui" data-act="di" data-h="#/">‹</button><h1>Không thấy công trình</h1></header>'; return; }
    app.innerHTML = `<header class="dau"><button class="lui" data-act="di" data-h="#/" aria-label="Về danh sách">‹</button><h1>${esc(c.ten)}</h1><button data-act="ct-sua" data-id="${esc(id)}">Sửa</button></header>
<p class="nhat">${esc([c.dia_chi, c.ngay, c.nguoi_do].filter(Boolean).join(' · '))}</p>
<ul class="ds" data-ui="ds-ph"></ul>
<p><button class="chinh to" data-act="ph-moi" data-id="${esc(id)}">+ Phòng mới</button></p>
<div class="hang" style="margin-top:28px"><button data-act="ct-luu-tru" data-id="${esc(id)}">Lưu trữ công trình</button><button class="do" data-act="ct-xoa" data-id="${esc(id)}">Xoá công trình</button></div>
<p class="nhat"><small>Lưu trữ: máy vẽ thôi thấy các phòng của công trình này (bỏ lưu trữ được).</small></p>`;
    await veDsPh(id);
    try {
      const r = await api('GET', `/api/cong-trinh/${id}/phong`);
      if (r.ok) {
        const hang = await hangCua(), tren = new Set();
        for (const s of r.j.phong) {
          tren.add(s.id);
          const cu = await DB.get('phong', s.id);
          if (cu && (cu.rev >= s.rev || hang.phong.has(s.id))) continue;
          const d = await api('GET', '/api/phong/' + s.id);
          if (d.ok) await DB.put('phong', { id: d.j.id, ct: d.j.ct, ten: d.j.ten, xong: d.j.xong, ghi_chu: d.j.ghi_chu, phong: d.j.phong, anh: d.j.anh, rev: d.j.rev, dem: 0, anh_co: d.j.anh_co, sua_luc: d.j.sua_luc });
        }
        for (const p of await DB.all('phong')) if (p.ct === id && p.rev && !tren.has(p.id) && !hang.phong.has(p.id)) await DB.del('phong', p.id);
        if (location.hash === '#/ct/' + id) await veDsPh(id);
      }
    } catch (e) { /* mất mạng */ }
  }
  async function veDsPh(id) {
    const el = $('[data-ui="ds-ph"]'); if (!el) return;
    const ds = (await DB.all('phong')).filter(p => p.ct === id).sort((a, b) => (a.tao_may || 0) - (b.tao_may || 0)), hang = await hangCua();
    el.innerHTML = ds.length ? ds.map(p => {
      const A = phanTich(p), nl = A.gui.loi.length, nb = A.gui.bo.length;
      const tt = nl ? `<span class="loi-o">${nl} chỗ cần sửa</span>` : nb ? `chưa đủ số ${nb} chi tiết` : 'vẽ được';
      return `<li><button data-act="di" data-h="#/ph/${esc(p.id)}"><b>${esc(p.ten)}${hang.phong.has(p.id) ? '<span class="cham" title="Còn thay đổi chưa gửi"></span>' : ''}</b><small>${p.xong ? '✓ đo xong' : 'đang đo'} · ${tt} · ${p.anh.length} ảnh</small></button></li>`;
    }).join('') : '<li class="nhat">Chưa có phòng — bấm “+ Phòng mới”.</li>';
  }
  const GOI_Y_TEN = ['Phòng ngủ', 'Phòng ngủ master', 'Phòng ngủ 2', 'Phòng khách', 'Bếp', 'Phòng ăn', 'Phòng thờ', 'Phòng làm việc', 'WC', 'Hành lang', 'Sảnh'];
  function moFormPh(ct) {
    moTam(`<h3>Phòng mới</h3><form data-form="ph" data-ct="${esc(ct)}">
<label>Tên phòng<input name="ten" list="goi-y-ten" required maxlength="60" placeholder="Phòng ngủ"></label><datalist id="goi-y-ten">${GOI_Y_TEN.map(t => `<option value="${esc(t)}">`).join('')}</datalist>
<label>Dạng phòng</label><div data-ui="hinh">${[['chu_nhat', 'Chữ nhật'], ['chu_l', 'Chữ L'], ['tu_do', 'Tự thêm tường']].map(([k, t], i) => `<button type="button" class="chip" data-act="chon-hinh" data-v="${k}" aria-pressed="${i === 0}">${t}</button>`).join('')}</div>
<label>Cao trần (mm)<small>Điền sẵn 2700 — đo lại rồi sửa</small><input name="cao" inputmode="decimal" value="2700"></label>
<div class="hang"><button type="button" data-act="dong-tam">Thôi</button><button class="chinh" type="submit">Tạo phòng</button></div></form>`);
  }
  async function nopPh(f) {
    const ten = f.ten.value.trim() || 'Phòng', hinh = ($('[data-act="chon-hinh"][aria-pressed="true"]', f) || {}).dataset.v || 'chu_nhat';
    const id = idMoi('ph');
    const rec = { id, ct: f.dataset.ct, ten, xong: false, ghi_chu: '', rev: 0, dem: 1, tao_may: Date.now(), anh: [],
      phong: { ban: 1, ten, cao: soDoc(f.cao.value), day: 110, hinh, tuong: G.tuongMau(hinh, Ph), mo: [], can: [], dn: [], khung: [] } };
    await DB.put('phong', rec); await xepHang('phong', id); dongTam();
    S.mo = 0; di('#/ph/' + id);
  }

  /* ================= phòng ================= */
  const phanTich = rec => G.phanTich(Object.assign({}, rec.phong, { ten: rec.ten }), rec.anh, Ph);
  async function vePhong(id) {
    let rec = await DB.get('phong', id);
    if (!rec) { try { const d = await api('GET', '/api/phong/' + id); if (d.ok) { rec = { id, ct: d.j.ct, ten: d.j.ten, xong: d.j.xong, ghi_chu: d.j.ghi_chu, phong: d.j.phong, anh: d.j.anh, rev: d.j.rev, dem: 0, anh_co: d.j.anh_co }; await DB.put('phong', rec); } } catch (e) { /* mất mạng */ } }
    if (!rec) { app.innerHTML = '<header class="dau"><button class="lui" data-act="di" data-h="#/">‹</button><h1>Không thấy phòng</h1></header>'; return; }
    if (!S.rec || S.rec.id !== id) S.mo = 0;
    S.rec = rec;
    const p = rec.phong;
    app.innerHTML = `<header class="dau"><button class="lui" data-act="di" data-h="#/ct/${esc(rec.ct)}" aria-label="Về công trình">‹</button><h1 data-ui="ten-ph">${esc(rec.ten)}</h1></header>
<div class="mb" data-ui="mb"></div>
<div data-ui="tt"></div>
<p class="huong">🧭 Đứng TRONG phòng, quay mặt vào tường A — tường B ở bên <b>PHẢI</b> tay. Đi vòng theo chiều kim đồng hồ; mọi “cách” đo từ góc TRÁI của tường.</p>
<div data-ui="tuongs"></div>
<p><button class="to" data-act="them-tuong">+ Thêm tường</button></p>
<h2>Ảnh chung của phòng</h2><div class="anhs" data-anh=""></div>
<p><button class="to" data-act="chup" data-tuong="">📷 Ảnh toàn cảnh</button></p>
<h2>Thông tin phòng</h2>
<label>Tên phòng<input data-o="ten" maxlength="60" value="${esc(rec.ten)}"></label>
<label>Cao trần (mm)<input data-o="cao" inputmode="decimal" value="${p.cao > 0 ? esc(p.cao) : ''}"></label>
<label>Ghi chú phòng<textarea data-o="ghi_chu" maxlength="500">${esc(rec.ghi_chu || '')}</textarea></label>
<label class="cong-tac"><input type="checkbox" data-o="xong"${rec.xong ? ' checked' : ''}> Đo xong phòng này</label>
<p><button class="do" data-act="xoa-phong">Xoá phòng</button></p>
<input type="file" accept="image/*" capture="environment" class="an" data-ui="tep" multiple>`;
    veTuongs(); capPhanTich(); veAnhs();
    if (rec.xung_dot) hoiXungDot();
  }
  function veTuongs() {
    const el = $('[data-ui="tuongs"]'); if (!el || !S.rec) return;
    const p = S.rec.phong, A = phanTich(S.rec);
    el.innerHTML = p.tuong.map((t, i) => {
      const mo = S.mo === i;
      return `<div class="tuong${mo ? ' mo' : ''}" data-i="${i}"><button class="dau-t" data-act="mo-tuong" data-i="${i}" aria-expanded="${mo}"><b>${esc(t.ten)}</b><span data-tom="${i}" class="nhat"></span><span style="margin-left:auto">${mo ? '▾' : '▸'}</span></button>${mo ? thanTuong(i, A) : ''}</div>`;
    }).join('');
  }
  const CHI = { mo: { ten: () => Ph.LOAI_MO, mac: 'cua' }, can: { ten: () => Ph.LOAI_CAN, mac: 'cot' }, dn: { ten: () => Object.fromEntries(Object.entries(Ph.LOAI_DN).map(([k, v]) => [k, v.ten])), mac: 'o_dien' } };
  function tomChiTiet(nhom, x) {
    const v = k => (x[k] === null || x[k] === undefined ? '?' : g(x[k]));
    const tu = x.tu === 'phai' ? 'từ phải ' : '';
    if (nhom === 'mo') return `${v('rong')} × ${v('cao')} · cách ${tu}${v('cach')}${x.loai === 'cua_so' ? ` · bệ ${v('be')}` : ''}`;
    if (nhom === 'can') return `${v('rong')} × nhô ${v('nho')} · cách ${tu}${v('cach')}${x.loai === 'dam' ? ` · đáy +${v('z0')}` : ''}`;
    const L = Ph.LOAI_DN[x.loai] || {}; return `cách ${tu}${v('cach')} · ${L.san ? 'ra ' + v('ra') : 'cao ' + v('cao')}`;
  }
  function thanTuong(i, A) {
    const r = S.rec, p = r.phong, t = p.tuong[i], re = t.re, khac = re !== 90 && re !== -90;
    const ds = [];
    for (const nhom of ['mo', 'can', 'dn']) p[nhom].forEach((x, j) => { if (x.tuong !== i) return; const th = A.thieu[nhom][j] || [], ten = A.ten[nhom][j].ten; ds.push(`<div class="ct-item${th.length ? ' thieu' : ''}"><button data-act="sua-ct" data-nhom="${nhom}" data-j="${j}"><b>${esc(ten)}</b> <small>${esc(tomChiTiet(nhom, x))}${th.length ? ` — thiếu: ${th.map(k => G.TEN_O[k] || k).join(', ')}` : ''}</small></button></div>`); });
    const ke = p.tuong[i + 1];
    return `<div class="than">
<label>Dài tường ${esc(t.ten)} (mm)<small>Để trống = máy tự suy (tối đa 2 tường không song song)</small><input data-o="tuong.${i}.dai" inputmode="decimal" value="${t.dai > 0 ? esc(t.dai) : ''}" aria-label="Dài tường ${esc(t.ten)}"></label>
<div class="suy" data-suy="${i}"></div>
<label>Góc cuối tường ${esc(t.ten)}</label>
<div><button class="chip" data-act="goc" data-i="${i}" data-v="90" aria-pressed="${re === 90}">Vuông 90°</button><button class="chip" data-act="goc" data-i="${i}" data-v="-90" aria-pressed="${re === -90}">Lồi −90°</button><button class="chip" data-act="goc" data-i="${i}" data-v="khac" aria-pressed="${khac}">Khác…</button></div>
<div class="${khac || S.goc_khac === i ? '' : 'an'}" data-goc-khac="${i}"><label>Góc TRONG đo được (°)<small>Máy tính góc rẽ = 180 − góc trong</small><input data-o="tuong.${i}.goc_trong" inputmode="decimal" value="${khac ? esc(G.rn(180 - re, 2)) : ''}"></label></div>
<details${t.cao > 0 ? ' open' : ''}><summary class="nhat" style="min-height:44px;padding:10px 0">⋯ Tường thấp hơn trần (lan can, vách lửng)</summary><label>Cao riêng tường ${esc(t.ten)} (mm)<input data-o="tuong.${i}.cao" inputmode="decimal" value="${t.cao > 0 ? esc(t.cao) : ''}"></label></details>
${ds.length ? `<h2>Chi tiết trên tường ${esc(t.ten)}</h2>${ds.join('')}` : ''}
<div class="hang" style="margin-top:10px"><button data-act="them-ct" data-nhom="mo" data-i="${i}">+ Cửa</button><button data-act="them-ct" data-nhom="can" data-i="${i}">+ Cột / dầm / hộp</button></div>
<div class="hang" style="margin-top:8px"><button data-act="them-ct" data-nhom="dn" data-i="${i}">+ Điện – nước</button><button data-act="chup" data-tuong="${i}">📷 Chụp mặt này</button></div>
<div class="anhs" data-anh="${i}"></div>
<div class="hang" style="margin-top:12px"><button class="do" data-act="xoa-tuong" data-i="${i}">Xoá tường ${esc(t.ten)}</button>${ke ? `<button data-act="mo-tuong" data-i="${i + 1}">Tiếp: tường ${esc(ke.ten)} ›</button>` : ''}</div></div>`;
  }
  function capPhanTich() {
    const r = S.rec; if (!r) return;
    const A = phanTich(r), H = A.H;
    const mb = $('[data-ui="mb"]');
    if (mb) mb.innerHTML = H.tuong.some(w => w.dai > 0) ? Ph.matBangSVG(H, { rong_px: 520, chon_tuong: S.mo }) : '<p class="nhat" style="padding:20px">Gõ chiều dài tường để thấy mặt bằng.</p>';
    const tt = $('[data-ui="tt"]');
    if (tt) {
      const L = [];
      L.push(`<div class="msg ok">${esc(Ph.tomTat(H)[0] || '')}</div>`);
      for (const t of A.gui.loi) L.push(`<div class="msg loi">${esc(t)}</div>`);
      if (A.goi_y_suy.length) L.push(`<div class="hang">${A.goi_y_suy.map(i => `<button data-act="de-suy" data-i="${i}">Để tường ${esc(r.phong.tuong[i].ten)} tự suy</button>`).join('')}</div>`);
      for (const t of A.luu_y) L.push(`<div class="msg vang">${esc(t)}</div>`);
      if (A.gui.bo.length) L.push(`<div class="msg xam">Chưa đủ số: ${esc(A.gui.bo.join(', '))}</div>`);
      if (r.loi_gui) L.push(`<div class="msg loi">Máy chủ chưa nhận: ${esc(r.loi_gui)}</div>`);
      tt.innerHTML = L.join('');
    }
    r.phong.tuong.forEach((t, i) => {
      const s = $(`[data-suy="${i}"]`), tm = $(`[data-tom="${i}"]`), n = ['mo', 'can', 'dn'].reduce((k, nh) => k + r.phong[nh].filter(x => x.tuong === i).length, 0);
      const dai = A.gui.phong.tuong[i] ? A.gui.phong.tuong[i].dai : 0;
      if (s) s.innerHTML = A.suy[i] ? `≈ ${g(A.suy[i])} (tự suy)` : t.dai_cu && !(t.dai > 0) ? `Số đã gõ trước: ${g(t.dai_cu)} <button data-act="lay-dai-cu" data-i="${i}">Lấy lại</button>` : '';
      if (tm) tm.textContent = (dai > 0 ? (A.suy[i] ? `≈ ${g(dai)} (tự suy)` : g(dai)) : 'chưa đo') + (n ? ` · ${n} chi tiết` : '') + (t.re !== 90 ? ` · rẽ ${g(t.re)}°` : '');
    });
  }
  /** Ghi phòng đang mở: ngay vào IndexedDB (sau 800 ms không gõ), xếp việc gửi. */
  function henLuu() { clearTimeout(S.hen); S.hen = setTimeout(luuNgay, 800); }
  async function luuNgay() {
    clearTimeout(S.hen); S.hen = 0;
    if (!S.rec || !S.rec.ban) return;
    const r = S.rec; delete r.ban; r.dem = (r.dem || 0) + 1;
    await DB.put('phong', r);
    await DB.put('hang', { k: 'phong:' + r.id, loai: 'phong', id: r.id, th: 1, lan: 0, cho_den: 0, dung: '', ver: r.dem });
    capThanh(); henChay(300);
  }
  const doi = () => { S.rec.ban = true; henLuu(); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') luuNgay(); });

  function suaO(o, v, el) {
    const r = S.rec, p = r.phong, m = /^tuong\.(\d+)\.(\w+)$/.exec(o);
    if (o === 'ten') { r.ten = v.slice(0, 60); p.ten = r.ten; const h = $('[data-ui="ten-ph"]'); if (h) h.textContent = r.ten || 'Phòng'; }
    else if (o === 'cao') p.cao = soDoc(v);
    else if (o === 'ghi_chu') r.ghi_chu = v.slice(0, 500);
    else if (o === 'xong') r.xong = !!el.checked;
    else if (m) {
      const t = p.tuong[+m[1]]; if (!t) return;
      if (m[2] === 'dai') { const x = soDoc(v); t.dai = x > 0 ? x : 0; if (t.dai > 0) delete t.dai_cu; }
      else if (m[2] === 'cao') { const x = soDoc(v); if (x > 0) t.cao = x; else delete t.cao; }
      else if (m[2] === 'goc_trong') { const x = soDoc(v); if (x !== null && x > 0 && x < 360) t.re = G.rn(180 - x, 2); }
    }
    doi(); capPhanTich();
  }

  /* ----- tường ----- */
  function doiChiSo(i, bo) {      // bỏ tường i: chi tiết trên nó đi theo, chỉ số sau nó lùi một; ảnh của nó thành ảnh chung
    const p = S.rec.phong;
    for (const nh of ['mo', 'can', 'dn']) p[nh] = p[nh].filter(x => x.tuong !== i).map(x => (x.tuong > i ? Object.assign(x, { tuong: x.tuong - 1 }) : x));
    for (const a of S.rec.anh) {
      if (a.tuong === i) a.tuong = null; else if (a.tuong > i) a.tuong--;
      for (const k of a.ke || []) if (k.lien) { const m = /^tuong:(\d+):(\w+)$/.exec(k.lien); if (m) { const n = +m[1]; if (n === i) { delete k.lien; k.text = k.text || '?'; } else if (n > i) k.lien = `tuong:${n - 1}:${m[2]}`; } }
    }
    void bo;
  }
  function tenLai() { S.rec.phong.tuong.forEach((t, i) => { t.ten = Ph.tenTuong(i); }); }

  /* ----- chi tiết ----- */
  function moChiTiet(nhom, i, j) {
    const p = S.rec.phong, cu = j !== undefined ? p[nhom][j] : null;
    const x = cu ? JSON.parse(JSON.stringify(cu)) : { id: '', tuong: i, loai: CHI[nhom].mac, tu: 'trai' };
    S.ct = { nhom, j, x };
    veChiTiet();
  }
  function oChiTiet(nhom, x) {
    const phai = x.tu === 'phai', L = Ph.LOAI_DN[x.loai] || {};
    if (nhom === 'mo') return [['cach', phai ? 'Cách: từ góc PHẢI tới mép phải cửa' : 'Cách: từ góc trái tới mép trái cửa'], ['rong', 'Rộng (lọt lòng)'], ['cao', x.loai === 'cua_so' ? 'Cao cửa sổ (mép dưới → mép trên)' : 'Cao (từ sàn tới đỉnh)'], ['be', x.loai === 'cua_so' ? 'Bệ: sàn → mép dưới cửa sổ' : 'Bệ (để trống = 0)']];
    if (nhom === 'can') return [['cach', phai ? 'Cách: từ góc PHẢI tới mép phải' : 'Cách: từ góc trái tới mép trái'], ['rong', 'Rộng (dọc tường)'], ['nho', 'Nhô ra khỏi mặt tường'], ['z0', x.loai === 'dam' ? 'Đáy dầm cách sàn' : 'Cao độ dưới (để trống = 0)'], ['z1', 'Cao độ trên (để trống = trần)']];
    return [['cach', phai ? 'Cách: từ góc PHẢI tới TÂM điểm' : 'Cách: từ góc trái tới TÂM điểm'], L.san ? ['ra', 'Tâm cách mặt tường'] : ['cao', 'Tâm cách sàn'], ['ghi', 'Ghi chú (vd “ổ đôi”)']];
  }
  function veChiTiet() {
    const { nhom, j, x } = S.ct, ten = CHI[nhom].ten(), L = Ph.LOAI_DN[x.loai] || {};
    const goiY = k => (nhom === 'dn' && (k === 'cao' || k === 'ra') && L[k] !== undefined ? L[k] : null);
    const o = oChiTiet(nhom, x).map(([k, nh]) => k === 'ghi'
      ? `<label>${esc(nh)}<input data-f="ghi" maxlength="40" value="${esc(x.ghi || '')}"></label>`
      : `<label>${esc(nh)} (mm)<input data-f="${k}" inputmode="decimal" value="${x[k] === null || x[k] === undefined ? '' : esc(x[k])}"${goiY(k) !== null ? ` placeholder="gợi ý ${goiY(k)}"` : ''}></label>${goiY(k) !== null ? `<button type="button" data-act="dung-goi-y" data-f="${k}" data-v="${goiY(k)}">Đúng như gợi ý (${goiY(k)})</button>` : ''}`).join('');
    moTam(`<h3>${j !== undefined ? 'Sửa' : 'Thêm'} chi tiết — tường ${esc(S.rec.phong.tuong[x.tuong].ten)}</h3>
<div data-ui="loai">${Object.entries(ten).map(([k, t]) => `<button type="button" class="chip" data-act="ct-loai" data-v="${k}" aria-pressed="${x.loai === k}">${esc(t)}</button>`).join('')}</div>
<label class="cong-tac"><input type="checkbox" data-act="ct-phai" data-khong-tu="1"${x.tu === 'phai' ? ' checked' : ''}> Đo từ góc phải</label>
${o}
<div class="hang" style="margin-top:12px">${j !== undefined ? '<button class="do" data-act="ct-xoa">Xoá</button>' : '<button data-act="dong-tam">Thôi</button>'}<button class="chinh" data-act="ct-xong">Xong</button></div>`);
    const dau = $('.tam input[data-f]', lop); if (dau) dau.focus();
  }
  function docChiTiet() {
    const x = S.ct.x;
    for (const el of $$('.tam [data-f]', lop)) { const k = el.dataset.f; if (k === 'ghi') { if (el.value.trim()) x.ghi = el.value.trim(); else delete x.ghi; } else x[k] = soDoc(el.value); }
    return x;
  }
  function xongChiTiet() {
    const { nhom, j } = S.ct, x = docChiTiet(), p = S.rec.phong;
    if (nhom === 'dn') { const L = Ph.LOAI_DN[x.loai]; if (L.san) delete x.cao; else delete x.ra; }
    if (j === undefined) { x.id = (nhom === 'mo' ? 'm' : nhom === 'can' ? 'c' : 'd') + ngauNhien(6); p[nhom].push(x); } else p[nhom][j] = x;
    S.ct = null; dongTam(); doi(); veTuongs(); capPhanTich(); veAnhs();
  }

  /* ----- ảnh ----- */
  const urlAnh = {};
  async function srcAnh(id) {
    if (urlAnh[id]) return urlAnh[id];
    const a = await DB.get('anh', id);
    if (a && (a.blob || a.nho)) return (urlAnh[id] = URL.createObjectURL(a.blob || a.nho));
    return '/api/anh/' + encodeURIComponent(id);
  }
  async function veAnhs() {
    if (!S.rec) return;
    for (const el of $$('[data-anh]')) {
      const t = el.dataset.anh === '' ? null : +el.dataset.anh, ds = S.rec.anh.filter(a => a.tuong === t);
      const co = new Set(S.rec.anh_co || []);
      const ht = await Promise.all(ds.map(async a => `<button data-act="ke" data-id="${esc(a.id)}" aria-label="Kẻ số lên ảnh"><img alt="" src="${esc(await srcAnh(a.id))}"><span class="nhan">${(a.ke || []).length} nét${co.has(a.id) ? '' : ' · chưa gửi'}</span></button>`));
      el.innerHTML = ht.join('');
    }
  }
  let chupCho = null;
  function chup(tuong) { chupCho = tuong; const t = $('[data-ui="tep"]'); if (t) { t.value = ''; t.click(); } }
  async function nen(tep) {
    let bm;
    try { bm = await createImageBitmap(tep, { imageOrientation: 'from-image' }); } catch (e) {
      bm = await new Promise((ok, hong) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => hong(new Error('Không đọc được ảnh')); i.src = URL.createObjectURL(tep); });
    }
    const W = bm.width, H = bm.height, k = Math.min(1, 2048 / Math.max(W, H)), w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
    const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(bm, 0, 0, w, h);
    const blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.82));
    if (!blob || blob.type !== 'image/jpeg') throw new Error('Trình duyệt này chưa nén được ảnh — cập nhật trình duyệt.');
    return { blob, w, h };
  }
  async function nhanTep(ds) {
    const r = S.rec; if (!r || !ds.length) return;
    let dau = null;
    for (const tep of ds) {
      try {
        const n = await nen(tep), id = idMoi('an');
        await DB.put('anh', { id, phong: r.id, blob: n.blob, w: n.w, h: n.h, len: 0, luc: Date.now() });
        r.anh.push({ id, tuong: chupCho, w: n.w, h: n.h, ghi: '', ke: [] });
        if (!dau) dau = id;
      } catch (e) { alertNho(e.message); }
    }
    doi(); await luuNgay(); veAnhs();
    if (dau) moKe(dau);
  }
  function alertNho(t) { const tt = $('[data-ui="tt"]'); if (tt) tt.insertAdjacentHTML('afterbegin', `<div class="msg loi">${esc(t)}</div>`); }

  /* ================= KẺ SỐ LÊN ẢNH ================= */
  const K = {};
  async function moKe(id) {
    const r = S.rec, a = r.anh.find(x => x.id === id); if (!a) return;
    Object.assign(K, { a, ke: JSON.parse(JSON.stringify(a.ke || [])), che: 'kt', dang: null, ptr: new Map(), pinch: null, img: null });
    lop.innerHTML = `<div class="ke" data-ui="ke"><div class="cong-cu">
<button data-act="ke-che" data-v="kt" aria-pressed="true">↔ Kích thước</button><button data-act="ke-che" data-v="chi" aria-pressed="false">↗ Ghi chú</button><button data-act="ke-che" data-v="chu" aria-pressed="false">T Chữ</button><button data-act="ke-che" data-v="keo" aria-pressed="false">✋ Kéo</button></div>
<div class="vung"><canvas class="hinh" data-ui="ke-canvas" aria-label="Ảnh để kẻ số đo"></canvas><canvas class="kinh" data-ui="kinh" width="240" height="240"></canvas></div>
<ul class="ds-net" data-ui="ds-net"></ul>
<div class="cong-cu"><button data-act="ke-lui">↶ Lùi</button><button data-act="ke-xoa-anh">Xoá ảnh</button><button data-act="ke-xong" class="chinh">Xong</button></div></div>`;
    const img = new Image(); img.src = await srcAnh(id);
    await new Promise(ok => { img.onload = ok; img.onerror = ok; });
    K.img = img; K.cv = $('[data-ui="ke-canvas"]', lop); K.kinh = $('[data-ui="kinh"]', lop);
    khopKe(); veKeCanvas(); veDsNet();
    K.cv.addEventListener('pointerdown', keXuong); K.cv.addEventListener('pointermove', keDi); K.cv.addEventListener('pointerup', keLen); K.cv.addEventListener('pointercancel', keLen);
  }
  function khopKe() {
    const cv = K.cv, dpr = window.devicePixelRatio || 1, cw = cv.clientWidth, ch = cv.clientHeight;
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); K.dpr = dpr;
    const s = Math.min(cw / K.a.w, ch / K.a.h); K.s = s; K.tx = (cw - K.a.w * s) / 2; K.ty = (ch - K.a.h * s) / 2;
  }
  window.addEventListener('resize', () => { if (K.cv && K.cv.isConnected) { khopKe(); veKeCanvas(); } });
  const lienCua = () => { const A = phanTich(S.rec); return l => G.giaTriLien(l, S.rec.phong, A.gui.phong); };
  function veNet(x, v) {      // y như anhCoNet của máy vẽ: nét trắng dày rồi đỏ, nhãn nền đỏ chữ trắng
    x.lineCap = 'round';
    for (const [mau, day] of [['#ffffff', v.co / 4.2], ['#e8281e', v.co / 8.5]]) { x.strokeStyle = mau; x.lineWidth = day; for (const d of v.net) { x.beginPath(); x.moveTo(d[0], d[1]); x.lineTo(d[2], d[3]); x.stroke(); } }
    for (const t of v.chu) {
      x.save(); x.translate(t.x, t.y); x.rotate(t.goc * Math.PI / 180); x.font = `700 ${t.co}px sans-serif`;
      const rong = Math.max(x.measureText(t.text).width, t.co * 0.6) + t.co * 0.7, cao = t.co * 1.35;
      x.fillStyle = '#e8281e'; x.strokeStyle = '#ffffff'; x.lineWidth = t.co / 14; x.beginPath();
      if (x.roundRect) x.roundRect(-rong / 2, -cao / 2, rong, cao, t.co * 0.25); else x.rect(-rong / 2, -cao / 2, rong, cao);
      x.fill(); x.stroke(); x.fillStyle = '#ffffff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(t.text, 0, t.co * 0.04); x.restore();
    }
  }
  function veKeCanvas() {
    const cv = K.cv, x = cv.getContext('2d'), a = K.a;
    x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = '#000'; x.fillRect(0, 0, cv.width, cv.height);
    x.setTransform(K.dpr * K.s, 0, 0, K.dpr * K.s, K.dpr * K.tx, K.dpr * K.ty);
    if (K.img && K.img.naturalWidth) x.drawImage(K.img, 0, 0, a.w, a.h); else { x.fillStyle = '#555'; x.fillRect(0, 0, a.w, a.h); }
    const ds = K.ke.slice(); if (K.dang && K.dang.b) ds.push({ loai: K.che === 'chi' ? 'chi' : 'kt', a: K.dang.a, b: K.dang.b, text: K.che === 'kt' ? '…' : '' });
    veNet(x, G.veKe(ds, a.w, a.h, lienCua()));
  }
  function veDsNet() {
    const el = $('[data-ui="ds-net"]', lop); if (!el) return;
    const v = lienCua(), TEN = { kt: 'Kích thước', chi: 'Ghi chú', chu: 'Chữ' };
    el.innerHTML = `<li class="ghi"><span><input data-ui="ghi-anh" maxlength="200" placeholder="Ghi chú cho ảnh (vd “mặt có cửa sổ”)" value="${esc(K.a.ghi || '')}"></span></li>` + K.ke.map((k, i) => {
      const so = k.lien ? v(k.lien) : null, chu = k.loai === 'kt' ? (so !== null ? g(so) : (k.text || '?')) : (k.text || '(mũi tên)');
      return `<li data-net="${i}"><span>${i + 1}. ${TEN[k.loai]} <b>${esc(chu)}</b>${k.lien ? ' <small>(liên kết số đo)</small>' : ''}</span><button data-act="ke-bo" data-i="${i}" aria-label="Bỏ nét ${i + 1}">✕</button></li>`;
    }).join('');
  }
  const veAnh = e => { const r = K.cv.getBoundingClientRect(); return [(e.clientX - r.left - K.tx) / K.s, (e.clientY - r.top - K.ty) / K.s]; };
  function keXuong(e) {
    K.cv.setPointerCapture(e.pointerId);
    K.ptr.set(e.pointerId, [e.clientX, e.clientY]);
    if (K.ptr.size === 2) { const [p, q] = Array.from(K.ptr.values()); K.pinch = { d: Math.hypot(p[0] - q[0], p[1] - q[1]), c: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], s: K.s, tx: K.tx, ty: K.ty }; K.dang = null; kinh(null); veKeCanvas(); return; }
    if (K.ptr.size > 2) return;
    if (K.che === 'keo') { K.keo = { x: e.clientX, y: e.clientY, tx: K.tx, ty: K.ty }; return; }
    K.dang = { a: veAnh(e), b: null, x0: e.clientX, y0: e.clientY };
  }
  function keDi(e) {
    if (!K.ptr.has(e.pointerId)) return;
    K.ptr.set(e.pointerId, [e.clientX, e.clientY]);
    if (K.pinch && K.ptr.size >= 2) {
      const [p, q] = Array.from(K.ptr.values()), d = Math.hypot(p[0] - q[0], p[1] - q[1]), c = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], r = K.cv.getBoundingClientRect();
      const s = Math.min(Math.max(K.pinch.s * d / (K.pinch.d || 1), 0.05), 8), ax = (K.pinch.c[0] - r.left - K.pinch.tx) / K.pinch.s, ay = (K.pinch.c[1] - r.top - K.pinch.ty) / K.pinch.s;
      K.s = s; K.tx = c[0] - r.left - ax * s; K.ty = c[1] - r.top - ay * s; veKeCanvas(); return;
    }
    if (K.keo) { K.tx = K.keo.tx + e.clientX - K.keo.x; K.ty = K.keo.ty + e.clientY - K.keo.y; veKeCanvas(); return; }
    if (K.dang && Math.hypot(e.clientX - K.dang.x0, e.clientY - K.dang.y0) > 8 && K.che !== 'chu') { K.dang.b = veAnh(e); veKeCanvas(); kinh(e); }
  }
  function kinh(e) {      // kính lúp góc trên: phóng 2 lần quanh đầu ngón tay
    const k = K.kinh; if (!k) return;
    if (!e) { k.style.display = 'none'; return; }
    const r = K.cv.getBoundingClientRect(), sx = (e.clientX - r.left) * K.dpr, sy = (e.clientY - r.top) * K.dpr, x = k.getContext('2d'), n = 60 * K.dpr;
    k.style.display = 'block'; x.clearRect(0, 0, 240, 240); x.drawImage(K.cv, sx - n, sy - n, 2 * n, 2 * n, 0, 0, 240, 240);
    x.strokeStyle = '#fff'; x.lineWidth = 2; x.beginPath(); x.moveTo(110, 120); x.lineTo(130, 120); x.moveTo(120, 110); x.lineTo(120, 130); x.stroke();
  }
  function keLen(e) {
    K.ptr.delete(e.pointerId);
    if (K.pinch) { if (K.ptr.size < 2) K.pinch = null; return; }
    if (K.keo) { K.keo = null; return; }
    const d = K.dang; K.dang = null; kinh(null);
    if (!d) return;
    if (K.che === 'chu' || (K.che === 'chi' && !d.b)) { hoiChu('Chữ đặt lên ảnh', '', t => { if (t) K.ke.push({ loai: 'chu', a: d.a, text: t }); xongNet(); }); return; }
    if (!d.b) { veKeCanvas(); return; }
    if (K.che === 'chi') { hoiChu('Ghi chú (để trống = chỉ mũi tên)', '', t => { K.ke.push({ loai: 'chi', a: d.a, b: d.b, text: t || '' }); xongNet(); }, true); return; }
    hoiSo(d);
  }
  function xongNet() { dongTamTren(); veKeCanvas(); veDsNet(); }
  function moTamTren(html) {
    let el = $('[data-ui="tam-tren"]', lop); if (!el) { el = document.createElement('div'); el.dataset.ui = 'tam-tren'; lop.appendChild(el); }
    el.innerHTML = `<div class="man-che" style="z-index:40"><div class="tam" role="dialog" aria-modal="true">${html}</div></div>`;
  }
  function dongTamTren() { const el = $('[data-ui="tam-tren"]', lop); if (el) el.remove(); }
  function hoiChu(tieuDe, cu, xong, choTrong) {
    K.hoi = xong;
    moTamTren(`<h3>${esc(tieuDe)}</h3><input data-ui="hoi-chu" maxlength="80" value="${esc(cu)}"><div class="hang" style="margin-top:12px"><button data-act="hoi-thoi">Thôi</button><button class="chinh" data-act="hoi-xong">${choTrong ? 'Xong' : 'Đặt chữ'}</button></div>`);
    { const i = $('[data-ui="hoi-chu"]', lop); if (i) i.focus(); }
  }
  function hoiSo(d) {
    const A = phanTich(S.rec), tuongs = K.a.tuong === null || K.a.tuong === undefined ? S.rec.phong.tuong.map((t, i) => i) : [K.a.tuong];
    const ds = []; for (const i of tuongs) for (const s of G.soCuaTuong(S.rec.phong, i, Ph, A.gui.phong)) ds.push(s);
    K.cho = d;
    moTamTren(`<h3>Đoạn này là số đo nào?</h3><p class="nhat"><small>Chọn số của phòng: sửa số trong phòng thì ảnh tự đổi theo.</small></p>
<div data-ui="chon-so">${ds.map(s => `<button class="chip" data-act="chon-lien" data-lien="${esc(s.lien)}">${esc(s.nhan)} ${s.gia === null ? '(chưa có)' : esc(g(s.gia))}</button>`).join('')}</div>
<label>…hoặc gõ số / chữ<input data-ui="hoi-chu" maxlength="80"></label>
<div class="hang" style="margin-top:12px"><button data-act="hoi-thoi">Bỏ đoạn này</button><button class="chinh" data-act="chon-go">Dùng chữ đã gõ</button></div>`);
  }
  function luuKe() {
    const gh = $('[data-ui="ghi-anh"]', lop);
    K.a.ghi = gh ? gh.value.slice(0, 200) : K.a.ghi;
    K.a.ke = K.ke; doi(); luuNgay(); lop.innerHTML = ''; K.cv = null;
    veAnhs(); capPhanTich();
  }

  /* ================= xung đột ================= */
  function hoiXungDot() {
    const r = S.rec, h = r.xung_dot; if (!h) return;
    moTam(`<h3>Phòng “${esc(r.ten)}” vừa được sửa ở máy khác</h3><p>Máy chủ đang giữ bản sửa lúc ${esc(gioPhut(h.sua_luc))}. Chọn bản giữ lại:</p>
<div class="hang"><button data-act="xd-giu">Giữ bản máy này</button><button class="chinh" data-act="xd-lay">Lấy bản máy chủ</button></div>`);
  }
  async function xungDot(giu) {
    const r = S.rec, h = r.xung_dot; if (!h) return dongTam();
    if (giu) { r.rev = h.rev; r.ghi_de = true; }
    else { Object.assign(r, { ten: h.ten, xong: h.xong, ghi_chu: h.ghi_chu, phong: h.phong, anh: h.anh, rev: h.rev, anh_co: h.anh_co, ghi_de: false }); }
    delete r.xung_dot; await DB.put('phong', r);
    if (giu) await DB.put('hang', { k: 'phong:' + r.id, loai: 'phong', id: r.id, th: 1, lan: 0, cho_den: 0, dung: '', ver: r.dem });
    else await DB.del('hang', 'phong:' + r.id);
    dongTam(); vePhong(r.id); capThanh(); henChay(200);
  }

  /* ================= quản lý ================= */
  async function veTaiKhoan() {
    app.innerHTML = `<header class="dau"><button class="lui" data-act="di" data-h="#/">‹</button><h1>Tài khoản thợ</h1></header>
<p><button class="chinh to" data-act="tk-moi">+ Thợ mới</button></p><ul class="ds" data-ui="ds-tk"><li class="nhat">Đang tải…</li></ul>`;
    const r = await api('GET', '/api/quan-ly/tai-khoan').catch(() => null);
    const el = $('[data-ui="ds-tk"]'); if (!el) return;
    if (!r || !r.ok) { el.innerHTML = '<li class="msg loi">Cần mạng để quản lý tài khoản.</li>'; return; }
    el.innerHTML = r.j.tai_khoan.map(t => `<li class="the"><b>${esc(t.ten_hien)}</b> <small>${esc(t.ten)} · ${t.vai === 'quan_ly' ? 'quản lý' : 'thợ'}${t.khoa ? ' · ĐÃ KHOÁ' : ''}${t.bat_doi_mk ? ' · chưa đổi mật khẩu tạm' : ''}</small>
<div class="hang" style="margin-top:8px">${t.ten === S.toi.ten ? '<span class="nhat">(bạn)</span>' : `${t.khoa ? `<button data-act="tk-mo" data-id="${t.id}">Mở khoá</button>` : `<button class="do" data-act="tk-khoa" data-id="${t.id}">Khoá</button>`}<button data-act="tk-mk" data-id="${t.id}" data-ten="${esc(t.ten)}">Đặt lại mật khẩu</button>`}</div></li>`).join('');
  }
  function moFormTk() {
    moTam(`<h3>Thợ mới</h3><form data-form="tk">
<label>Tên đăng nhập<small>chữ thường không dấu, số, . _ - (vd “hung.tho”)</small><input name="ten" autocapitalize="none" spellcheck="false" required pattern="[a-z0-9._\\-]{3,32}"></label>
<label>Tên hiện<small>hiện ở máy vẽ là “người gửi”</small><input name="ten_hien" required maxlength="60"></label>
<label>Vai<select name="vai"><option value="tho">Thợ đo</option><option value="quan_ly">Quản lý</option></select></label>
<label>Mật khẩu tạm<small>thợ đăng nhập lần đầu sẽ phải đổi</small><input name="mk" required minlength="10"></label>
<button type="button" data-act="sinh-mk">Sinh mật khẩu</button>
<div class="loi-o" data-ui="loi"></div>
<div class="hang" style="margin-top:12px"><button type="button" data-act="dong-tam">Thôi</button><button class="chinh" type="submit">Tạo tài khoản</button></div></form>`);
  }
  const sinhMk = () => { const k = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789', b = new Uint8Array(12); crypto.getRandomValues(b); return Array.from(b, x => k[x % k.length]).join(''); };
  async function veMa() {
    app.innerHTML = `<header class="dau"><button class="lui" data-act="di" data-h="#/">‹</button><h1>Mã kết nối máy vẽ</h1></header>
<p class="nhat">Mã cho bảng Một Nhà trong Chenfeng đọc các phòng đã đo. Mã chỉ hiện MỘT lần lúc cấp; mất máy / lộ mã thì Thu hồi rồi cấp mã mới.</p>
<p><button class="chinh to" data-act="ma-cap">Cấp mã</button></p><ul class="ds" data-ui="ds-ma"><li class="nhat">Đang tải…</li></ul>`;
    const r = await api('GET', '/api/quan-ly/ma-ket-noi').catch(() => null);
    const el = $('[data-ui="ds-ma"]'); if (!el) return;
    if (!r || !r.ok) { el.innerHTML = '<li class="msg loi">Cần mạng để quản lý mã.</li>'; return; }
    const ngay = ms => (ms ? new Date(ms).toLocaleString('vi-VN') : '—');
    el.innerHTML = r.j.ma.length ? r.j.ma.map(m => `<li class="the"><b>${esc(m.nhan)}</b> <small>${esc(m.dau)}…</small><small class="nhat" style="display:block">Cấp ${esc(ngay(m.tao_luc))}${m.tao_boi ? ' bởi ' + esc(m.tao_boi) : ''} · dùng lần cuối ${esc(ngay(m.dung_luc))}</small>
${m.thu_hoi_luc ? `<small class="loi-o">Đã thu hồi ${esc(ngay(m.thu_hoi_luc))}</small>` : `<p><button class="do" data-act="ma-thu-hoi" data-id="${m.id}">Thu hồi</button></p>`}</li>`).join('') : '<li class="nhat">Chưa cấp mã nào.</li>';
  }

  /* ================= sự kiện ================= */
  const XL = {
    'di': b => di(b.dataset.h),
    'dong-tam': () => dongTam(),
    'dong-tam-nen': (b, e) => { if (e.target === b) dongTam(); },
    've-dau': () => di('#/'),
    'menu': () => moTam(`<h3>${esc(S.toi.ten_hien)} <small class="nhat">(${esc(S.toi.ten)})</small></h3><div class="hang"><button data-act="doi-mk">Đổi mật khẩu</button><button class="do" data-act="dang-xuat">Đăng xuất</button></div><p><button data-act="dong-tam">Đóng</button></p>`),
    'doi-mk': () => { dongTam(); veDoiMk(false); },
    'dang-xuat': async b => {
      const n = (await DB.all('hang')).length;
      if (n && !haiLan(b, `Còn ${n} thay đổi chưa gửi — bấm lần nữa để BỎ và đăng xuất`)) return;
      await api('POST', '/api/dang-xuat').catch(() => null);
      await DB.xoaHet(); S.toi = null; S.rec = null; location.hash = '#/'; veDangNhap('Đã đăng xuất.');
    },
    'ct-moi': () => moFormCt(null),
    'ct-sua': async b => moFormCt(await DB.get('ct', b.dataset.id)),
    'ct-luu-tru': async b => { const r = await api('POST', `/api/cong-trinh/${b.dataset.id}/luu-tru`).catch(() => null); if (!r || !r.ok) return alertCt('Cần mạng (và công trình đã lên máy chủ) để lưu trữ.'); await DB.del('ct', b.dataset.id); di('#/'); },
    'ct-xoa': async b => {
      if (!haiLan(b, 'Bấm lần nữa để XOÁ cả công trình')) return;
      const c = await DB.get('ct', b.dataset.id);
      if (c && c.tren_may) { const r = await api('DELETE', '/api/cong-trinh/' + c.id).catch(() => null); if (!r || !r.ok) return alertCt(r && r.j.error ? r.j.error : 'Cần mạng để xoá.'); }
      for (const p of await DB.all('phong')) if (p.ct === b.dataset.id) { await DB.del('phong', p.id); await DB.del('hang', 'phong:' + p.id); }
      await DB.del('ct', b.dataset.id); await DB.del('hang', 'ct:' + b.dataset.id); di('#/');
    },
    'ph-moi': b => moFormPh(b.dataset.id),
    'chon-hinh': b => { for (const c of $$('[data-act="chon-hinh"]', lop)) c.setAttribute('aria-pressed', String(c === b)); },
    'mo-tuong': b => { const i = +b.dataset.i; S.mo = S.mo === i && b.classList.contains('dau-t') ? -1 : i; veTuongs(); capPhanTich(); veAnhs(); const el = $(`.tuong[data-i="${i}"]`); if (el && S.mo === i) el.scrollIntoView({ block: 'start', behavior: 'smooth' }); },
    'goc': b => {
      const i = +b.dataset.i, t = S.rec.phong.tuong[i];
      if (b.dataset.v === 'khac') { S.goc_khac = i; const k = $(`[data-goc-khac="${i}"]`); if (k) { k.classList.remove('an'); const o = $('input', k); if (o) o.focus(); } for (const c of $$(`[data-act="goc"][data-i="${i}"]`)) c.setAttribute('aria-pressed', String(c === b)); return; }
      t.re = +b.dataset.v; S.goc_khac = -1; doi(); veTuongs(); capPhanTich(); veAnhs();
    },
    'them-tuong': () => { const p = S.rec.phong; p.tuong.push({ ten: Ph.tenTuong(p.tuong.length), dai: 0, re: 90 }); S.mo = p.tuong.length - 1; doi(); veTuongs(); capPhanTich(); veAnhs(); },
    'xoa-tuong': b => {
      const i = +b.dataset.i, p = S.rec.phong;
      if (p.tuong.length <= 1) return;
      if (!haiLan(b, `Bấm lần nữa để xoá tường ${p.tuong[i].ten} (và chi tiết trên nó)`)) return;
      p.tuong.splice(i, 1); doiChiSo(i); tenLai(); S.mo = Math.min(i, p.tuong.length - 1); doi(); veTuongs(); capPhanTich(); veAnhs();
    },
    'de-suy': b => { const t = S.rec.phong.tuong[+b.dataset.i]; t.dai_cu = t.dai; t.dai = 0; S.mo = +b.dataset.i; doi(); veTuongs(); capPhanTich(); veAnhs(); },
    'lay-dai-cu': b => { const t = S.rec.phong.tuong[+b.dataset.i]; t.dai = t.dai_cu; delete t.dai_cu; doi(); veTuongs(); capPhanTich(); veAnhs(); },
    'them-ct': b => moChiTiet(b.dataset.nhom, +b.dataset.i),
    'sua-ct': b => moChiTiet(b.dataset.nhom, undefined, +b.dataset.j),
    'ct-loai': b => { docChiTiet(); S.ct.x.loai = b.dataset.v; veChiTiet(); },
    'ct-phai': b => { docChiTiet(); S.ct.x.tu = b.checked ? 'phai' : 'trai'; veChiTiet(); },
    'dung-goi-y': b => { const o = $(`.tam input[data-f="${b.dataset.f}"]`, lop); if (o) o.value = b.dataset.v; },
    'ct-xong': () => xongChiTiet(),
    'ct-xoa': b => { if (!haiLan(b, 'Bấm lần nữa để xoá')) return; const { nhom, j } = S.ct; S.rec.phong[nhom].splice(j, 1); S.ct = null; dongTam(); doi(); veTuongs(); capPhanTich(); veAnhs(); },
    'chup': b => chup(b.dataset.tuong === '' ? null : +b.dataset.tuong),
    'ke': b => moKe(b.dataset.id),
    'ke-che': b => { K.che = b.dataset.v; for (const c of $$('[data-act="ke-che"]', lop)) c.setAttribute('aria-pressed', String(c === b)); },
    'ke-lui': () => { K.ke.pop(); veKeCanvas(); veDsNet(); },
    'ke-bo': b => { K.ke.splice(+b.dataset.i, 1); veKeCanvas(); veDsNet(); },
    'ke-xong': () => luuKe(),
    'ke-xoa-anh': async b => {
      if (!haiLan(b, 'Bấm lần nữa để xoá ảnh')) return;
      const id = K.a.id; S.rec.anh = S.rec.anh.filter(a => a !== K.a); await DB.del('anh', id); await DB.del('hang', 'anh:' + id);
      doi(); luuNgay(); lop.innerHTML = ''; K.cv = null; veAnhs();
    },
    'hoi-thoi': () => { K.hoi = null; K.cho = null; xongNet(); },
    'hoi-xong': () => { const i = $('[data-ui="hoi-chu"]', lop), f = K.hoi; K.hoi = null; if (f) f((i ? i.value : '').trim()); },
    'chon-lien': b => { const d = K.cho; K.cho = null; if (d) K.ke.push({ loai: 'kt', a: d.a, b: d.b, lien: b.dataset.lien }); xongNet(); },
    'chon-go': () => { const d = K.cho, t = ($('[data-ui="hoi-chu"]', lop) || {}).value || ''; K.cho = null; if (d && t.trim()) K.ke.push({ loai: 'kt', a: d.a, b: d.b, text: t.trim() }); xongNet(); },
    'xoa-phong': async b => {
      if (!haiLan(b, 'Bấm lần nữa để xoá phòng này')) return;
      const r = S.rec;
      if (r.rev) { const x = await api('DELETE', '/api/phong/' + r.id).catch(() => null); if (!x || (!x.ok && x.st !== 404)) return alertNho('Cần mạng để xoá phòng đã gửi lên máy chủ.'); }
      for (const a of r.anh) { await DB.del('anh', a.id); await DB.del('hang', 'anh:' + a.id); }
      await DB.del('phong', r.id); await DB.del('hang', 'phong:' + r.id); clearTimeout(S.hen); S.rec = null; di('#/ct/' + r.ct);
    },
    'xd-giu': () => xungDot(true), 'xd-lay': () => xungDot(false),
    'tk-moi': () => moFormTk(),
    'sinh-mk': () => { const o = $('.tam input[name="mk"]', lop); if (o) o.value = sinhMk(); },
    'tk-khoa': async b => { if (!haiLan(b, 'Bấm lần nữa để khoá (máy thợ bị đăng xuất ngay)')) return; await api('POST', `/api/quan-ly/tai-khoan/${b.dataset.id}/khoa`).catch(() => null); veTaiKhoan(); },
    'tk-mo': async b => { await api('POST', `/api/quan-ly/tai-khoan/${b.dataset.id}/mo-khoa`).catch(() => null); veTaiKhoan(); },
    'tk-mk': b => moTam(`<h3>Đặt lại mật khẩu — ${esc(b.dataset.ten)}</h3><form data-form="tk-mk" data-id="${esc(b.dataset.id)}"><label>Mật khẩu tạm mới<input name="mk" required minlength="10" value="${esc(sinhMk())}"></label><div class="loi-o" data-ui="loi"></div><div class="hang" style="margin-top:12px"><button type="button" data-act="dong-tam">Thôi</button><button class="chinh" type="submit">Đặt lại</button></div></form>`),
    'ma-cap': () => moTam(`<h3>Cấp mã cho máy vẽ</h3><form data-form="ma"><label>Nhãn (để nhận ra máy)<input name="nhan" maxlength="60" value="Máy vẽ xưởng"></label><div class="loi-o" data-ui="loi"></div><div class="hang" style="margin-top:12px"><button type="button" data-act="dong-tam">Thôi</button><button class="chinh" type="submit">Cấp mã</button></div></form>`),
    'ma-chep': async () => {
      const t = ($('[data-ui="chuoi"]', lop) || {}).textContent || '', bao = $('[data-ui="chep-bao"]', lop);
      try { await navigator.clipboard.writeText(t); if (bao) bao.textContent = '✓ Đã chép — dán vào bảng Một Nhà.'; }
      catch (e) { const el = $('[data-ui="chuoi"]', lop), s = window.getSelection(), rg = document.createRange(); rg.selectNodeContents(el); s.removeAllRanges(); s.addRange(rg); if (bao) bao.textContent = 'Máy không cho chép tự động — chữ đã được chọn sẵn: nhấn giữ rồi chọn Sao chép.'; }
    },
    'ma-thu-hoi': async b => { if (!haiLan(b, 'Bấm lần nữa để thu hồi (máy vẽ dùng mã này thôi đọc được)')) return; await api('DELETE', '/api/quan-ly/ma-ket-noi/' + b.dataset.id).catch(() => null); veMa(); },
  };
  function alertCt(t) { app.insertAdjacentHTML('beforeend', `<div class="msg loi">${esc(t)}</div>`); }
  async function nop(f) {
    const loai = f.dataset.form;
    if (loai === 'dang-nhap') return nopDangNhap(f);
    if (loai === 'doi-mk') return nopDoiMk(f);
    if (loai === 'ct') return nopCt(f);
    if (loai === 'ph') return nopPh(f);
    const loi = $('[data-ui="loi"]', f);
    if (loai === 'tk') {
      const r = await api('POST', '/api/quan-ly/tai-khoan', { ten: f.ten.value.trim().toLowerCase(), ten_hien: f.ten_hien.value.trim(), vai: f.vai.value, mat_khau_tam: f.mk.value }).catch(() => ({ j: { error: 'Mất mạng' } }));
      if (!r.ok) { loi.textContent = r.j.error || 'Không tạo được'; return; }
      moTam(`<h3>Đã tạo tài khoản</h3><p>Gửi RIÊNG cho thợ (thợ đăng nhập lần đầu sẽ phải đổi mật khẩu):</p><div class="ma-hien" data-ui="chuoi">Tên: ${esc(r.j.ten)}\nMật khẩu tạm: ${esc(f.mk.value)}</div><p><button data-act="dong-tam">Đóng</button></p>`); veTaiKhoan(); return;
    }
    if (loai === 'tk-mk') {
      const r = await api('POST', `/api/quan-ly/tai-khoan/${f.dataset.id}/dat-lai-mk`, { mat_khau_tam: f.mk.value }).catch(() => ({ j: { error: 'Mất mạng' } }));
      if (!r.ok) { loi.textContent = r.j.error || 'Không đặt được'; return; }
      moTam(`<h3>Đã đặt lại</h3><p>Mật khẩu tạm mới (gửi riêng cho thợ):</p><div class="ma-hien">${esc(f.mk.value)}</div><p><button data-act="dong-tam">Đóng</button></p>`); veTaiKhoan(); return;
    }
    if (loai === 'ma') {
      const r = await api('POST', '/api/quan-ly/ma-ket-noi', { nhan: f.nhan.value }).catch(() => ({ j: { error: 'Mất mạng' } }));
      if (!r.ok) { loi.textContent = r.j.error || 'Không cấp được'; return; }
      moTam(`<h3>Mã kết nối — ${esc(r.j.nhan)}</h3><div class="ma-hien" data-ui="chuoi">${esc(r.j.chuoi)}</div>
<p><button class="chinh to" data-act="ma-chep">Chép mã</button></p><p data-ui="chep-bao" class="nhat"></p>
<div class="msg vang">Mã chỉ hiện MỘT lần. Dán vào bảng Một Nhà → thẻ Phòng → Phòng đã đo trên điện thoại → Nối máy chủ.</div><p><button data-act="dong-tam">Đóng</button></p>`);
      veMa();
    }
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b || (b.dataset.act === 'dong-tam-nen' && e.target !== b)) {      // bấm vào tường trên mặt bằng = mở thẻ tường đó
      const t = e.target.closest('[data-ui="mb"] [data-tuong]');
      if (t && S.rec && /^\d+$/.test(t.dataset.tuong)) { S.mo = +t.dataset.tuong; veTuongs(); capPhanTich(); veAnhs(); }
      return;
    }
    const f = XL[b.dataset.act]; if (!f) return;
    if (b.dataset.act !== 'ct-phai' && b.tagName !== 'INPUT') e.preventDefault();
    Promise.resolve(f(b, e)).catch(x => console.error(x));
  });
  document.addEventListener('submit', e => { const f = e.target.closest('form[data-form]'); if (!f) return; e.preventDefault(); nop(f).catch(x => console.error(x)); });
  document.addEventListener('input', e => { const el = e.target; if (el.dataset && el.dataset.o && S.rec && app.contains(el)) suaO(el.dataset.o, el.value, el); });
  document.addEventListener('change', e => {
    const el = e.target;
    if (el.dataset && el.dataset.ui === 'tep') return nhanTep(Array.from(el.files || []));
    if (el.dataset && el.dataset.o === 'xong') suaO('xong', '', el);
    if (el.dataset && el.dataset.o && S.rec) luuNgay();
  });
  document.addEventListener('focusout', e => { if (e.target.dataset && e.target.dataset.o) luuNgay(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.dataset && e.target.dataset.ui === 'hoi-chu') { e.preventDefault(); const b = $('[data-act="hoi-xong"], [data-act="chon-go"]', lop); if (b) b.click(); }
    if (e.key === 'Enter' && e.target.dataset && e.target.dataset.f) { e.preventDefault(); const ds = $$('.tam input[data-f]', lop), i = ds.indexOf(e.target); if (i >= 0 && i < ds.length - 1) ds[i + 1].focus(); else xongChiTiet(); }
  });

  /* ================= mở trang ================= */
  async function batDau() {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => null);
    await DB.mo();
    const m = await DB.get('meta', 'toi'); S.toi = m ? m.v : null;
    try {
      const r = await api('GET', '/api/toi');
      if (r.ok) { S.toi = r.j; await DB.put('meta', { k: 'toi', v: r.j }); }
      else if (r.st === 401) S.toi = null;
    } catch (e) { /* mất mạng: dùng tài khoản đã nhớ, làm việc với nháp */ S.mat_mang = true; }
    dinhTuyen(); henChay(500);
  }
  window.MNDO = { S, DB, chayHang, trangThai: async () => ({ hang: (await DB.all('hang')).length, toi: S.toi }) };
  batDau().catch(e => { app.innerHTML = `<div class="msg loi">Không mở được: ${esc(e.message)}</div>`; });
})();
