/* Đo hiện trạng — trang điện thoại cho thợ đo (Một Nhà Design & Build).
 * Một tệp, không khung. Mọi sửa đổi ghi NGAY vào IndexedDB (nháp trong máy), hàng đợi gửi dần lên máy chủ khi có mạng.
 * Gói cho máy vẽ (`gui`) tính trên máy bằng ĐÚNG lib/goi.js + mncf-phong.js của máy vẽ để thợ thấy trước; máy chủ tính lại khi lưu.
 */
(function () {
  'use strict';
  const Ph = window.MNCFPhong, G = window.MNDOGoi, C = window.MNDOCua;
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = v => String(v === undefined || v === null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const g = v => String(G.rn(v, 1)).replace('.', ',');
  // đọc số thợ gõ: "3 650", "3650mm", "3.600" (chấm nhóm nghìn) đều là 3650 / 3600; chữ lạ, số âm, số quá lớn → { sai } (không lặng lẽ thành ô trống)
  const docO = (v, min = 0) => { const r = G.docSo(v); if (r.sai || r.v === null) return r; if (r.v < min) return { v: null, sai: 'số âm' }; if (r.v > G.SO_MAX) return { v: null, sai: `quá lớn (tối đa ${G.SO_MAX})` }; return r; };
  const soDoc = v => docO(v).v;
  const app = $('#app'), lop = $('#lop'), thanh = $('#thanh');
  const gioPhut = ms => { const d = new Date(ms); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  const homNay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const ngauNhien = n => { const k = 'abcdefghijklmnopqrstuvwxyz0123456789', b = new Uint8Array(n); crypto.getRandomValues(b); let s = ''; for (let i = 0; i < n; i++) s += k[b[i] % 36]; return s; };
  const idMoi = dau => dau + ngauNhien(20);
  const S = { toi: null, rec: null, mo: 0, hen: 0, gui_luc: 0, dang_gui: null, xoa_cho: {}, sai: {}, may: '', can_dn: false, ls: false, bo_pop: false };

  /* ================= IndexedDB ================= */
  const DB = {
    db: null,
    mo() {
      return new Promise((ok, hong) => {
        const r = indexedDB.open('mndo', 2);      // bản 2 (0.3.0): thêm kho 'cua' — nâng chỉ THÊM kho, nháp cũ giữ nguyên
        r.onupgradeneeded = () => { const d = r.result; for (const [n, k] of [['meta', 'k'], ['ct', 'id'], ['phong', 'id'], ['anh', 'id'], ['hang', 'k'], ['cua', 'id']]) if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, { keyPath: k }); };
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
    /** Đọc – sửa – ghi trong MỘT giao dịch: lần gửi nền không ghi đè bản thợ vừa lưu (đọc bản cũ trước, ghi sau lần lưu = mất nét / số). */
    sua(store, k, fn) {
      return new Promise((ok, hong) => { const t = DB.db.transaction(store, 'readwrite'), x = t.objectStore(store); let kq; const r = x.get(k); r.onsuccess = () => { const v = r.result; if (v === undefined) return; const m = fn(v); if (m) { kq = m; x.put(m); } }; t.oncomplete = () => ok(kq); t.onerror = () => hong(t.error); t.onabort = () => hong(t.error); });
    },
    async xoaHet() { for (const s of ['meta', 'ct', 'phong', 'anh', 'hang', 'cua']) await DB.lam(s, 'readwrite', x => x.clear()); },
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
  const BAO_HET_PHIEN = 'Phiên đăng nhập đã hết — đăng nhập lại. Nháp trong máy vẫn giữ nguyên.';
  /** Phiên hết giữa chừng: đang ở trong phòng / đang mở tấm hay màn kẻ thì KHÔNG cắt ngang (mất nét, mất số đang gõ) — chỉ báo ở thanh; đóng tấm / bấm thanh mới sang đăng nhập. */
  function canDangNhap() {
    if (!S.toi) return; S.toi = null;
    if (/^#\/(ph|cua)\//.test(location.hash) || lop.innerHTML) { S.can_dn = true; capThanh(); return; }
    veDangNhap(BAO_HET_PHIEN);
  }
  function dangNhapLai() { S.can_dn = false; Promise.resolve(luuNgay()).catch(() => null).then(() => veDangNhap(BAO_HET_PHIEN)); }

  /* ================= hàng đợi gửi ================= */
  const TH = { ct: 0, phong: 1, cua: 1, anh: 2, xoa: 3, xoa_cua: 3 };
  async function xepHang(loai, id) { await DB.put('hang', { k: loai + ':' + id, loai, id, th: TH[loai], lan: 0, cho_den: 0, dung: '' }); capThanh(); henChay(200); }
  let henC = 0; function henChay(ms) { clearTimeout(henC); henC = setTimeout(() => chayHang().catch(e => console.error(e)), ms); }
  const LUI = [5000, 15000, 60000, 300000];
  async function chayHang() {
    if (S.dang_gui || !S.toi) return;
    S.dang_gui = { anh: 0, tong: 0 };
    try {
      for (;;) {
        const ds = (await DB.all('hang')).filter(j => !j.dung).sort((a, b) => a.th - b.th);
        const conPhong = new Set(ds.filter(j => j.loai === 'phong').map(j => j.id)), conCua = new Set(ds.filter(j => j.loai === 'cua').map(j => j.id));
        const anhJ = ds.filter(j => j.loai === 'anh');
        S.dang_gui.tong = Math.max(S.dang_gui.tong, S.dang_gui.anh + anhJ.length);
        const j = ds.find(x => x.cho_den <= Date.now() && !(x.loai === 'anh' && (x.cua ? conCua.has(x.cua) : conPhong.has(x.phong))));
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
      // số ngoài khoảng máy chủ nhận → gửi là ô trống (máy chủ từ chối CẢ phòng vì một ô); điện thoại vẫn giữ + báo đỏ số đó
      const r = await api('PUT', '/api/phong/' + p.id, { ct: p.ct, ten: p.ten, xong: !!p.xong, ghi_chu: p.ghi_chu || '', phong: G.boSoSai(p.phong), anh: p.anh, rev: p.rev || 0, ghi_de: !!p.ghi_de, may: S.may || undefined });
      if (r.st >= 500) nem(r); if (r.st === 401) return 'het_phien';
      let moi = await DB.get('phong', j.id);
      if (!moi) {      // thợ xoá phòng trong lúc lần gửi này đang đi: không hồi sinh; máy chủ đã nhận thì xoá luôn ở đó
        if (r.ok) await DB.put('hang', { k: 'xoa:' + p.id, loai: 'xoa', id: p.id, th: 3, lan: 0, cho_den: 0, dung: '' });
        return 'xong';
      }
      if (r.ok) {
        moi = await DB.sua('phong', j.id, m => { m.rev = r.j.rev; m.ghi_de = false; m.anh_co = r.j.anh_co; m.sua_luc = r.j.sua_luc; delete m.xung_dot; delete m.loi_gui; return m; }) || moi;
        for (const id of r.j.can_gui || []) { const a = await DB.get('anh', id); if (a && a.blob) await DB.put('hang', { k: 'anh:' + id, loai: 'anh', id, phong: p.id, th: 2, lan: 0, cho_den: 0, dung: '' }); }
        // bản đang mở trong bộ nhớ cũng phải mang số bản mới — không thì lần lưu kế gửi số bản cũ, tự đụng chính mình (409)
        if (S.rec && S.rec.id === moi.id) { S.rec.rev = moi.rev; S.rec.ghi_de = false; S.rec.anh_co = moi.anh_co; S.rec.sua_luc = moi.sua_luc; delete S.rec.loi_gui; }
        if (moi.dem !== dem) return 'giu';      // thợ sửa tiếp trong lúc gửi: giữ việc, gửi lại bản mới
        return 'xong';
      }
      if (r.st === 409 && r.j.hien_tai) { moi = await DB.sua('phong', j.id, m => { m.xung_dot = r.j.hien_tai; return m; }) || moi; await dungViec(j, 'xung_dot'); if (S.rec && S.rec.id === moi.id) { S.rec.xung_dot = moi.xung_dot; hoiXungDot(); } return 'dung'; }
      if (r.st === 422 && r.j.chi_tiet && r.j.chi_tiet.some(c => c.truong === 'ct')) {      // công trình chưa lên: gửi lại công trình trước
        const c = await DB.get('ct', p.ct); if (c) { await xepHang('ct', c.id); return 'giu'; }
      }
      const lg = (r.j.error || 'Máy chủ không nhận') + (r.j.chi_tiet ? ': ' + r.j.chi_tiet.slice(0, 3).map(c => c.truong + ' ' + c.loi).join('; ') : '');
      await DB.sua('phong', j.id, m => { m.loi_gui = lg; return m; }); if (S.rec && S.rec.id === j.id) S.rec.loi_gui = lg; await dungViec(j, lg); return 'dung';
    }
    if (j.loai === 'anh') {
      const a = await DB.get('anh', j.id); if (!a || !a.blob) return 'xong';
      // ảnh của mục "Cửa & vách kính" mang `cua` (tiêu đề X-Cua), ảnh phòng mang `phong` (X-Phong)
      const kho = a.cua ? 'cua' : 'phong', cuaId = a.cua || a.phong;
      const r = await api('PUT', '/api/anh/' + a.id, a.blob, Object.assign({ 'content-type': 'image/jpeg' }, a.cua ? { 'x-cua': a.cua } : { 'x-phong': a.phong }));
      if (r.st >= 500) nem(r); if (r.st === 401) return 'het_phien';
      if (r.ok || r.st === 409) { a.len = Date.now(); await DB.put('anh', a); const p = await DB.sua(kho, cuaId, m => { m.anh_co = Array.from(new Set((m.anh_co || []).concat(a.id))); return m; }); if (p && S.rec && S.rec.id === p.id) S.rec.anh_co = p.anh_co; return 'xong'; }
      if (r.st === 410) { await boAnhMay(a.id); return 'xong'; }      // phòng / mục cửa / công trình đã xoá trên máy chủ: thôi gửi
      if (r.st === 404) {
        const p = await DB.get(kho, cuaId), conKhai = p && p.anh.some(x => x.id === a.id);
        if (!conKhai) { await boAnhMay(a.id); return 'xong'; }      // ảnh không còn trong phòng / mục ở máy này nữa
        if (await DB.get('hang', kho + ':' + cuaId)) { const e = new Error('chờ gửi ' + kho); e.st = 503; throw e; }      // còn chờ gửi / chờ chọn bản: lùi lại
        await xepHang(kho, cuaId); return 'giu';      // máy chủ thiếu phòng / mục / thiếu khai ảnh: gửi lại (kèm ảnh) trước
      }
      await dungViec(j, r.j.error || 'Máy chủ không nhận ảnh'); return 'dung';
    }
    if (j.loai === 'cua') return guiCua(j);
    if (j.loai === 'xoa_cua') {
      const r = await api('DELETE', '/api/cua/' + j.id);
      if (r.st >= 500) nem(r); if (r.st === 401) return 'het_phien';
      if (r.ok || r.st === 404) return 'xong';
      await dungViec(j, r.j.error || 'Máy chủ không xoá mục cửa'); return 'dung';
    }
    if (j.loai === 'xoa') {
      const r = await api('DELETE', '/api/phong/' + j.id);
      if (r.st >= 500) nem(r); if (r.st === 401) return 'het_phien';
      if (r.ok || r.st === 404) return 'xong';
      await dungViec(j, r.j.error || 'Máy chủ không xoá phòng'); return 'dung';
    }
    return 'xong';
  }
  async function boAnhMay(id) { await DB.del('anh', id); await DB.del('hang', 'anh:' + id); if (urlAnh[id]) { URL.revokeObjectURL(urlAnh[id]); delete urlAnh[id]; } }
  async function capThanh() {
    if (S.can_dn && !S.toi) { thanh.textContent = '⚠ Phiên đăng nhập đã hết — bấm đây để đăng nhập lại (nháp vẫn giữ)'; thanh.className = 'thanh loi'; thanh.dataset.act = 'dang-nhap-lai'; return; }
    delete thanh.dataset.act;
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
  /** Tấm chi tiết / màn kẻ có một mục lịch sử riêng: nút / cử chỉ Quay lại của điện thoại đóng tấm (giữ số, giữ nét) thay vì rời phòng. */
  function dayLS() { if (!S.ls) { history.pushState({ mndo_tam: 1 }, ''); S.ls = true; } }
  function dongTam() {
    lop.innerHTML = ''; S.ct = null;
    if (S.ls) { S.ls = false; S.bo_pop = true; history.back(); }      // đóng bằng nút: bỏ mục lịch sử của tấm (Quay lại sau đó rời phòng ngay)
    if (S.can_dn && !S.toi) dangNhapLai();
  }
  window.addEventListener('popstate', () => {
    if (S.bo_pop) { S.bo_pop = false; return; }
    if (!S.ls) return;
    S.ls = false;
    if (K.cv && K.cv.isConnected) luuKe();
    else if (S.ct) { if ($$('.tam input[data-f]', lop).some(el => el.value.trim())) xongChiTiet(true); else dongTam(); }
    else dongTam();
  });
  /** Bấm hai lần trong 3 giây (không dùng confirm). Khoá theo nút + phòng / ảnh đang mở: lần bấm ở phòng này không tính cho phòng khác. */
  function haiLan(b, chu) {
    const k = [b.dataset.act, b.dataset.i || '', b.dataset.id || '', S.rec ? S.rec.id : '', K.cv && K.a ? K.a.id : ''].join(':');
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
    S.toi = r.j; S.can_dn = false; await DB.put('meta', { k: 'toi', v: r.j }); await napMay();
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
    document.documentElement.style.scrollPaddingTop = '';
    if (!S.toi) return veDangNhap();
    if (S.toi.bat_doi_mk) return veDoiMk(true);
    dongTam(); capThanh();
    const h = location.hash.replace(/^#\/?/, '').split('/');
    if (h[0] === 'ct' && h[1]) return veCongTrinh(h[1]);
    if (h[0] === 'ph' && h[1]) return vePhong(h[1]);
    if (h[0] === 'cua' && h[1]) return veCua(h[1]);
    if (h[0] === 'ql' && h[1] === 'tk' && S.toi.vai === 'quan_ly') return veTaiKhoan();
    if (h[0] === 'ql' && h[1] === 'ma' && S.toi.vai === 'quan_ly') return veMa();
    return veDanhSach();
  }
  window.addEventListener('hashchange', () => { giuTam(); luuNgay(); dinhTuyen(); });
  /** Rời trang khi đang mở tấm chi tiết / màn kẻ: giữ những gì đã gõ / đã kẻ (không bao giờ bỏ lặng lẽ). */
  function giuTam() {
    S.ls = false;
    if (K.cv && K.cv.isConnected) { giuKe(ROI); K.a.ke = JSON.parse(JSON.stringify(K.ke)); K.cv = null; if (S.rec) S.rec.ban = true; }
    else if (S.ct && S.rec && $$('.tam input[data-f]', lop).some(el => el.value.trim())) { try { ghiChiTiet(true); } catch (e) { /* bỏ qua */ } if (S.rec) S.rec.ban = true; }
  }
  const di = h => { if (location.hash === h) dinhTuyen(); else location.hash = h; };

  /* ================= công trình ================= */
  async function hangCua() {
    const ds = await DB.all('hang');
    return { ct: new Set(ds.filter(j => j.loai === 'ct').map(j => j.id)), phong: new Set(ds.filter(j => j.loai === 'phong' || (j.loai === 'anh' && j.phong)).map(j => j.loai === 'anh' ? j.phong : j.id)), xoa: new Set(ds.filter(j => j.loai === 'xoa').map(j => j.id)),
      cua: new Set(ds.filter(j => j.loai === 'cua' || (j.loai === 'anh' && j.cua)).map(j => j.loai === 'anh' ? j.cua : j.id)), xoa_cua: new Set(ds.filter(j => j.loai === 'xoa_cua').map(j => j.id)) };
  }
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
        for (const c of r.j.cong_trinh) { const cu = ds.find(x => x.id === c.id); if (!cu || !hang.ct.has(c.id)) await DB.put('ct', Object.assign(cu || {}, { id: c.id, ten: c.ten, dia_chi: c.dia_chi, ngay: c.ngay, nguoi_do: c.nguoi_do, tren_may: true, so_phong: c.so_phong, so_xong: c.so_xong, so_cua: c.so_cua || 0, so_cua_xong: c.so_cua_xong || 0, sua_luc: c.sua_luc, cua_toi: c.cua_toi !== false })); }
        for (const c of ds) if (c.tren_may && !tren.has(c.id) && !hang.ct.has(c.id)) await DB.del('ct', c.id);      // đã xoá / lưu trữ ở máy khác
        if (location.hash.replace(/^#\/?/, '') === '') await veDsCt();
      }
    } catch (e) { /* mất mạng: bày bản trong máy */ }
  }
  async function veDsCt() {
    const el = $('[data-ui="ds-ct"]'); if (!el) return;
    const ds = await DB.all('ct'), ph = await DB.all('phong'), cuas = await DB.all('cua'), hang = await hangCua();
    ds.sort((a, b) => (b.sua_luc || b.tao_may || 0) - (a.sua_luc || a.tao_may || 0));
    el.innerHTML = ds.length ? ds.map(c => {
      const cua = ph.filter(p => p.ct === c.id), moi = cua.filter(p => !p.rev);
      const n = Math.max(c.so_phong || 0, cua.length) + (c.so_phong >= cua.length ? moi.length : 0), x = Math.max(c.so_xong || 0, cua.filter(p => p.xong).length);
      const cu = cuas.filter(q => q.ct === c.id), cmoi = cu.filter(q => !q.rev).length;
      const nc = Math.max(c.so_cua || 0, cu.length) + ((c.so_cua || 0) >= cu.length ? cmoi : 0), xc = Math.max(c.so_cua_xong || 0, cu.filter(q => q.cua.xong).length);
      const cho = hang.ct.has(c.id) || cua.some(p => hang.phong.has(p.id)) || cu.some(q => hang.cua.has(q.id));
      return `<li><button data-act="di" data-h="#/ct/${esc(c.id)}"><b>${esc(c.ten)}${cho ? '<span class="cham" title="Còn thay đổi chưa gửi"></span>' : ''}</b><small>${esc([c.dia_chi, c.ngay, c.nguoi_do].filter(Boolean).join(' · '))}</small><small>${x}/${n} phòng xong${nc ? ` · ${xc}/${nc} cửa xong` : ''}</small></button></li>`;
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
    const chu = c.cua_toi !== false;      // người tạo / quản lý mới sửa / lưu trữ / xoá được (máy chủ cũng chặn)
    app.innerHTML = `<header class="dau"><button class="lui" data-act="di" data-h="#/" aria-label="Về danh sách">‹</button><h1>${esc(c.ten)}</h1>${chu ? `<button data-act="ct-sua" data-id="${esc(id)}">Sửa</button>` : ''}</header>
<p class="nhat">${esc([c.dia_chi, c.ngay, c.nguoi_do].filter(Boolean).join(' · '))}</p>
<ul class="ds" data-ui="ds-ph"></ul>
<p><button class="chinh to" data-act="ph-moi" data-id="${esc(id)}">+ Phòng mới</button></p>
<h2>Cửa &amp; vách kính <small class="nhat">(đo để đặt hàng)</small></h2>
<ul class="ds" data-ui="ds-cua"></ul>
<p><button class="chinh to" data-act="cua-them" data-id="${esc(id)}">+ Thêm cửa / vách kính</button></p>
<p><button class="to" data-act="cua-phieu" data-id="${esc(id)}">🧾 Phiếu đo cửa (in / CSV)</button></p>
${chu ? `<div class="hang" style="margin-top:28px"><button data-act="ct-luu-tru" data-id="${esc(id)}">Lưu trữ công trình</button><button class="do" data-act="ct-xoa" data-id="${esc(id)}">Xoá công trình</button></div>
<p class="nhat"><small>Lưu trữ: máy vẽ thôi thấy các phòng của công trình này (bỏ lưu trữ được).</small></p>` : '<p class="nhat"><small>Công trình của thợ khác: bạn đo thêm phòng được; sửa / lưu trữ / xoá là việc của người tạo hoặc quản lý.</small></p>'}`;
    await veDsPh(id); await veDsCua(id);
    dongBoCua(id).catch(() => null);
    try {
      const r = await api('GET', `/api/cong-trinh/${id}/phong`);
      if (r.ok) {
        const hang = await hangCua(), tren = new Set();
        for (const s of r.j.phong) {
          tren.add(s.id);
          if (hang.xoa.has(s.id)) continue;      // thợ đã xoá ở máy này, việc xoá trên máy chủ còn chờ: đừng tải về lại
          const cu = await DB.get('phong', s.id);
          if (cu && (cu.rev >= s.rev || hang.phong.has(s.id))) { if (cu.xoa_duoc !== s.xoa_duoc && !(S.rec && S.rec.id === cu.id)) { cu.xoa_duoc = s.xoa_duoc; await DB.put('phong', cu); } continue; }
          const d = await api('GET', '/api/phong/' + s.id);
          if (d.ok) await DB.put('phong', { id: d.j.id, ct: d.j.ct, ten: d.j.ten, xong: d.j.xong, ghi_chu: d.j.ghi_chu, phong: d.j.phong, anh: d.j.anh, rev: d.j.rev, dem: 0, anh_co: d.j.anh_co, sua_luc: d.j.sua_luc, xoa_duoc: d.j.xoa_duoc });
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
    // cao_san: trần đang là số điền sẵn (chưa đo) — chỉ ở máy này, không gửi; để "còn thiếu: Cao trần" và để số trần đo trên ảnh không bị coi là "khác số cũ"
    const rec = { id, ct: f.dataset.ct, ten, xong: false, ghi_chu: '', rev: 0, dem: 1, tao_may: Date.now(), anh: [], cao_san: f.cao.value.trim() === '2700' || undefined,
      phong: { ban: 1, ten, cao: soDoc(f.cao.value), day: 110, hinh, tuong: G.tuongMau(hinh, Ph), mo: [], can: [], dn: [], khung: [] } };
    await DB.put('phong', rec); await xepHang('phong', id); dongTam();
    S.mo = 0; di('#/ph/' + id);
  }

  /* ================= phòng ================= */
  const phanTich = rec => G.phanTich(Object.assign({}, rec.phong, { ten: rec.ten }), rec.anh, Ph);
  async function vePhong(id) {
    let rec = await DB.get('phong', id);
    if (!rec) { try { const d = await api('GET', '/api/phong/' + id); if (d.ok) { rec = { id, ct: d.j.ct, ten: d.j.ten, xong: d.j.xong, ghi_chu: d.j.ghi_chu, phong: d.j.phong, anh: d.j.anh, rev: d.j.rev, dem: 0, anh_co: d.j.anh_co, xoa_duoc: d.j.xoa_duoc }; await DB.put('phong', rec); } } catch (e) { /* mất mạng */ } }
    if (!rec) { app.innerHTML = '<header class="dau"><button class="lui" data-act="di" data-h="#/">‹</button><h1>Không thấy phòng</h1></header>'; return; }
    if (!S.rec || S.rec.id !== id) { S.mo = 0; S.sai = {}; delete S.bao_m; delete S.bao_xong; }
    S.rec = rec;
    if (chotNhap(rec)) { rec.ban = true; henLuu(); }
    const p = rec.phong;
    // đầu trang + mặt bằng nhỏ dính trên cùng (khó hình dung → luôn thấy tường đang gõ), chạm để phóng to
    app.innerHTML = `<div class="dinh" data-ui="dinh"><header class="dau"><button class="lui" data-act="di" data-h="#/ct/${esc(rec.ct)}" aria-label="Về công trình">‹</button><h1 data-ui="ten-ph">${esc(rec.ten)}</h1></header>
<div class="mb mini${S.mb_to ? ' to' : ''}" data-ui="mb"></div></div>
<div data-ui="tt"></div>
<p class="huong">🧭 Đứng TRONG phòng, quay mặt vào tường A — tường B ở bên <b>PHẢI</b> tay. Đi vòng theo chiều kim đồng hồ; mọi “cách” đo từ góc TRÁI của tường.</p>
<div data-ui="tuongs"></div>
<p><button class="to" data-act="them-tuong">+ Thêm tường</button></p>
<h2>Ảnh chung của phòng</h2><div class="anhs" data-anh=""></div>
<p><button class="to" data-act="chup" data-tuong="">📷 Ảnh toàn cảnh</button></p>
<h2>Thông tin phòng</h2>
<label>Tên phòng<input data-o="ten" maxlength="60" value="${esc(rec.ten)}"></label>
<label>Cao trần (mm)${rec.cao_san ? '<small data-ui="cao-san">Đang là số điền sẵn 2700 — đo rồi sửa</small>' : ''}<input data-o="cao" inputmode="decimal" value="${p.cao > 0 ? esc(p.cao) : ''}"${S.sai.cao ? ' aria-invalid="true"' : ''}></label>
<label>Ghi chú phòng<textarea data-o="ghi_chu" maxlength="500">${esc(rec.ghi_chu || '')}</textarea></label>
<label class="cong-tac"><input type="checkbox" data-o="xong"${rec.xong ? ' checked' : ''}> Đo xong phòng này</label>
${rec.xoa_duoc === false ? '' : `<p><button class="do" data-act="xoa-phong" data-id="${esc(rec.id)}">Xoá phòng</button></p>`}
<input type="file" accept="image/*" capture="environment" class="an" data-ui="tep" multiple>`;
    veTuongs(); capPhanTich(); veAnhs();
    if (rec.xung_dot) hoiXungDot();
  }
  function veTuongs() {
    const el = $('[data-ui="tuongs"]'); if (!el || !S.rec) return;
    const p = S.rec.phong, A = phanTich(S.rec);
    for (const k of Object.keys(S.sai)) if (k.startsWith('tuong.')) delete S.sai[k];      // ô dựng lại hiện số đang giữ
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
    const A = phanTich(r), H = A.H, SO = soatSo(r, A);
    if (S.bao_xong && !SO.do.length) delete S.bao_xong;
    veMB(A);
    const tt = $('[data-ui="tt"]');
    if (tt) {
      const L = [];
      L.push(`<div class="msg ok">${esc(Ph.tomTat(H)[0] || '')}</div>`);
      for (const [o, t] of Object.entries(S.sai)) L.push(`<div class="msg loi">${esc(tenO(o))}: ${esc(t)} — máy đang giữ số cũ.</div>`);
      if (S.bao_m) L.push(`<div class="msg vang" data-ui="bao-m">${esc(S.bao_m)}</div>`);
      if (S.bao_xong) L.push(`<div class="msg loi" data-ui="bao-xong">${esc(S.bao_xong)}</div>`);
      for (const t of A.gui.loi) L.push(`<div class="msg loi">${esc(t)}</div>`);
      for (const x of SO.do) if (!x.an) L.push(`<div class="msg loi" data-soat="do">${esc(x.t)}</div>`);
      if (A.goi_y_suy.length) L.push(`<div class="hang">${A.goi_y_suy.map(i => `<button data-act="de-suy" data-i="${i}">Để tường ${esc(r.phong.tuong[i].ten)} tự suy</button>`).join('')}</div>`);
      // "Tường A chỉ dài 3,6 mm": dưới 50 mm là số vô lý (đỏ, chặn Đo xong) — lời của gói giữ nguyên chữ
      for (const t of A.luu_y) { const m = /^Tường (\S+) chỉ dài/.exec(t), w = m && r.phong.tuong.find(x => x.ten === m[1]); L.push(w && w.dai > 0 && w.dai < SOAT.tuong_min ? `<div class="msg loi" data-soat="do">${esc(t)}</div>` : `<div class="msg vang">${esc(t)}</div>`); }
      for (const x of SO.vang) L.push(`<div class="msg vang" data-soat="vang">${esc(x.t)}${x.nut || ''}</div>`);
      for (const x of SO.xam) L.push(`<div class="msg xam" data-soat="xam">${esc(x.t)}</div>`);
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
  const tenO = o => { const m = /^tuong\.(\d+)\.(\w+)$/.exec(o), t = m && S.rec.phong.tuong[+m[1]]; if (o === 'cao') return 'Cao trần'; if (!t) return o; return m[2] === 'dai' ? `Dài tường ${t.ten}` : m[2] === 'cao' ? `Cao riêng tường ${t.ten}` : `Góc trong tường ${t.ten}`; };

  /* ----- soát số vô lý (1.11, mục 5 của phương án ImageMeter) -----
   * Chỉ ở điện thoại: gói `gui` và máy chủ (lib/soat.js, trần SO_MAX 100 000) không đổi — máy vẽ vẫn tự soát bằng hinhHoc.
   * Đỏ = chặn đánh dấu "Đo xong"; vàng = cảnh báo; xám = lưu ý. Số [CĐ] — anh Thanh xác nhận ở xưởng. */
  const SOAT = { tuong_max: 30000, tuong_min: 50, tuong_vang: 15000, tran_min: 2200, tran_max: 4500, doi_dien: 50, suy_lech: 0.3, anh_lech: 10, uoc_lech: 0.05 };
  const LIEN_RE = /^(tuong|mo|can|dn):([a-z0-9]{1,12}):([a-z0-9_]{1,8})$/;
  /** 3650 → "3 650", 1200,5 → "1 200,5" (đọc nhanh số lớn: thấy ngay gõ thừa số 0). Dấu cách KHÔNG NGẮT (U+00A0): "3 / 650" xuống dòng giữa số là thợ đọc nhầm "3". */
  const nghin = v => { const x = G.rn(v, 1), [n, t] = String(Math.abs(x)).split('.'); return (x < 0 ? '−' : '') + n.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0') + (t ? ',' + t : ''); };
  /** Chữ lưu của số thợ gõ trên ảnh: giữ tới 2 số lẻ ("2,65" không thành "2,7"). */
  const chuGo = v => String(G.rn(v, 2)).replace('.', ',');
  /** Đoạn mang số ƯỚC (thước chuẩn): nguon 'uoc' (trong máy) hoặc chữ "≈…" (máy chủ chỉ giữ text — sau khi lấy lại từ máy chủ vẫn nhận ra). */
  const laUoc = k => !!k && (k.nguon === 'uoc' || /^\s*≈/.test(String(k.text || '')));
  /** Số THỢ ĐÃ GÕ ở ô của phòng (không tính số máy suy, không tính trần điền sẵn) — null = ô trống. */
  function giaTriTho(lien, rec) {
    rec = rec || S.rec;
    if (rec.la_cua) { const v = layD(rec.cua, String(lien || '')); return typeof v === 'number' && isFinite(v) && v > 0 ? v : null; }
    const p = rec.phong, m = LIEN_RE.exec(String(lien || '')); if (!m) return null;
    if (m[1] === 'tuong') { const t = p.tuong[+m[2]]; if (!t) return null; if (m[3] === 'dai') return t.dai > 0 ? t.dai : null; if (m[3] === 'cao') return t.cao > 0 ? t.cao : p.cao > 0 && !rec.cao_san ? p.cao : null; return null; }
    const x = (p[m[1]] || []).find(q => q && q.id === m[2]); if (!x) return null;
    const v = x[m[3]]; return typeof v === 'number' && isFinite(v) ? v : null;
  }
  /** Tên ô của phòng mà đoạn gắn vào: "Dài tường A", "Cao trần", "Cửa đi 1 rộng". */
  function tenLien(lien, rec, A) {
    rec = rec || S.rec; if (rec.la_cua) return tenCuaLien(lien);
    const p = rec.phong, m = LIEN_RE.exec(String(lien || '')); if (!m) return '';
    if (m[1] === 'tuong') { const t = p.tuong[+m[2]]; if (!t) return ''; return m[3] === 'dai' ? `Dài tường ${t.ten}` : t.cao > 0 ? `Cao tường ${t.ten}` : 'Cao trần'; }
    const j = (p[m[1]] || []).findIndex(q => q && q.id === m[2]), ten = j >= 0 && (A || phanTich(rec)).ten[m[1]][j];
    return ten ? `${ten.ten} ${G.TEN_O[m[3]] || m[3]}` : '';
  }
  /** Số của một đoạn kích thước: số phòng (đoạn gắn) → số đã gõ → chữ là số. */
  function soDoan(k, layLien) {
    if (!k || k.loai !== 'kt') return null;
    if (k.lien) { const v = layLien(k.lien); if (v !== null && v !== undefined && v > 0) return v; }
    if (typeof k.so === 'number' && isFinite(k.so) && k.so > 0) return k.so;
    const d = docO(String(k.text || '').replace(/^\s*≈/, '')); return d.v > 0 ? d.v : null;
  }
  /**
   * Số ĐO THẬT của đoạn (làm thước chuẩn, đếm "N kích thước"): đoạn gắn → số THỢ GÕ ở ô của phòng (không tính số máy suy, trần điền sẵn);
   * đoạn không gắn → số đã gõ trên ảnh; số ước → null.
   */
  function soDo(k, rec) {
    if (!k || k.loai !== 'kt' || laUoc(k)) return null;
    if (k.lien) { const o = giaTriTho(k.lien, rec); if (o !== null && o > 0) return o; if (!(typeof k.so === 'number' && k.so > 0)) return null; }
    if (typeof k.so === 'number' && isFinite(k.so) && k.so > 0) return k.so;
    const d = docO(k.text); return d.v > 0 ? d.v : null;
  }
  /**
   * Thước chuẩn (1.8, ảnh chụp thẳng): đoạn có số dài nhất (không tính số ước đã dùng) làm thước → mm / điểm ảnh.
   * @returns { m: Map(đoạn → số ước, tròn 10), lech: [{ i, v, u, p }] (đoạn đo thật mà số ước lệch > 5 %), ref }
   */
  function uocNet(ke, layLien, rec) {
    const ds = (ke || []).map((k, i) => ({ k, i, L: k && k.loai === 'kt' && k.a && k.b ? Math.hypot(k.b[0] - k.a[0], k.b[1] - k.a[1]) : 0, v: soDoan(k, layLien), t: soDo(k, rec) })).filter(d => d.L >= 4);
    // thước = số ĐO THẬT (số ước, số máy suy, trần điền sẵn không làm thước)
    const doT = ds.filter(d => d.t > 0).map(d => Object.assign(d, { v: d.t })), m = new Map();
    if (!doT.length) return { m, lech: [], ref: -1 };
    const ref = doT.reduce((a, b) => (b.L > a.L ? b : a)), s = ref.v / ref.L;
    for (const d of ds) if (!(d.v > 0)) m.set(d.k, Math.round(d.L * s / 10) * 10);
    const lech = doT.filter(d => d !== ref).map(d => ({ i: d.i, v: d.v, u: d.L * s, p: Math.abs(d.L * s - d.v) / d.v })).filter(x => x.p > SOAT.uoc_lech);
    return { m, lech, ref: ref.i };
  }
  const tenAnh = (rec, a) => { if (!Number.isInteger(a.tuong) || !rec.phong.tuong[a.tuong]) return 'ảnh chung'; const cung = rec.anh.filter(x => x.tuong === a.tuong); return `ảnh tường ${rec.phong.tuong[a.tuong].ten}${cung.length > 1 ? ` (${cung.indexOf(a) + 1})` : ''}`; };
  const hoa = t => t.charAt(0).toUpperCase() + t.slice(1);
  function soatSo(r, A) {
    const p = r.phong, D = [], V = [], X = [], tr = p.cao > 0 ? p.cao : 0, L = i => (A.gui.phong.tuong[i] ? A.gui.phong.tuong[i].dai : 0);
    const chuNhat = p.hinh === 'chu_nhat' && p.tuong.length === 4 && p.tuong.every(t => t.re === 90);
    p.tuong.forEach(t => {
      if (t.dai > SOAT.tuong_max) D.push({ t: `Tường ${t.ten} dài ${nghin(t.dai)} mm — quá ${nghin(SOAT.tuong_max)}, kiểm tra lại số.` });
      else if (t.dai > 0 && t.dai < SOAT.tuong_min) D.push({ an: true, t: `Tường ${t.ten} dài ${g(t.dai)} mm` });      // lời "chỉ dài … (3,6 m gõ 3600)" của gói hiện thành dòng đỏ
      else if (t.dai > SOAT.tuong_vang) V.push({ t: `Tường ${t.ten} dài ${nghin(t.dai)} — có gõ thừa số 0 không?` });
    });
    if (tr && !r.cao_san && (tr < SOAT.tran_min || tr > SOAT.tran_max)) V.push({ t: `Cao trần ${nghin(tr)} — ngoài khoảng thường gặp ${nghin(SOAT.tran_min)} … ${nghin(SOAT.tran_max)}, kiểm tra lại.` });
    if (chuNhat) for (const [i, j] of [[0, 2], [1, 3]]) {
      const a = p.tuong[i], c = p.tuong[j];
      if (a.dai > 0 && c.dai > 0 && Math.abs(a.dai - c.dai) > SOAT.doi_dien) V.push({ t: `Tường ${a.ten} ${nghin(a.dai)} và tường ${c.ten} ${nghin(c.dai)} lệch ${nghin(Math.abs(a.dai - c.dai))} mm — phòng chữ nhật thì hai tường đối diện phải bằng nhau (đo lại một trong hai).` });
    }
    // tường máy suy: nói rõ suy từ đâu; dài bất thường / lệch xa tường đối diện thì vàng
    const Hw = A.H.tuong;
    for (const k of Object.keys(A.suy)) {
      const i = +k, t = p.tuong[i], v = A.suy[k], di = Hw[i] && Hw[i].d; if (!t || !(v > 0)) continue;
      const doi = di ? p.tuong.map((x, j) => j).filter(j => j !== i && p.tuong[j].dai > 0 && Hw[j] && Hw[j].d[0] * di[0] + Hw[j].d[1] * di[1] < -0.9) : [];
      const tu = chuNhat && p.tuong[(i + 2) % 4].dai > 0 ? (i + 2) % 4 : doi.length === 1 ? doi[0] : -1;
      const c = `Tường ${t.ten} ≈ ${nghin(v)} do máy suy ${tu >= 0 ? 'từ ' + p.tuong[tu].ten : 'từ các tường còn lại'}.`;
      const lech = doi.length === 1 ? Math.abs(v - p.tuong[doi[0]].dai) / p.tuong[doi[0]].dai : 0;
      if (tu >= 0 && p.tuong[tu].dai > SOAT.tuong_vang) X.push({ t: c });      // tường đối diện đã có dòng "gõ thừa số 0" / đỏ: không báo vàng lần hai cùng một ý
      else if (v > SOAT.tuong_vang) V.push({ t: `${c} Dài hơn ${nghin(SOAT.tuong_vang)} — kiểm tra số các tường kia.` });
      else if (lech > SOAT.suy_lech) V.push({ t: `${c} Lệch ${Math.round(lech * 100)} % so với tường ${p.tuong[doi[0]].ten} đối diện — kiểm tra lại số / góc rẽ, hoặc đo hẳn tường ${t.ten}.` });
      else X.push({ t: c });
    }
    // cửa / cột: rộng hơn tường, cách + rộng quá tường, cao quá trần (gói đã báo chi tiết nào thì không nhắc lại)
    const so = v => typeof v === 'number' && isFinite(v);
    for (const nhom of ['mo', 'can']) (p[nhom] || []).forEach((x, j) => {
      const t = p.tuong[x.tuong]; if (!t || !A.ten[nhom][j]) return;
      const ten = A.ten[nhom][j].ten, dai = L(x.tuong), wt = t.cao > 0 ? t.cao : tr;
      if (A.gui.loi.some(s => s.startsWith(ten + ' '))) return;
      if (dai > 0 && so(x.rong) && x.rong > dai) D.push({ t: `${ten} (tường ${t.ten}) rộng ${nghin(x.rong)} — rộng hơn cả tường (${nghin(dai)}).` });
      else if (dai > 0 && so(x.rong) && so(x.cach) && x.cach + x.rong > dai + 0.5) D.push({ t: `${ten} (tường ${t.ten}): cách ${nghin(x.cach)} + rộng ${nghin(x.rong)} = ${nghin(x.cach + x.rong)} — dài hơn tường (${nghin(dai)}).` });
      const dinh = nhom === 'mo' ? (so(x.cao) ? (x.loai === 'cua_so' && so(x.be) ? x.be : 0) + x.cao : null) : so(x.z1) ? x.z1 : null;
      if (wt > 0 && dinh !== null && dinh > wt + 0.5) D.push({ t: `${ten} (tường ${t.ten}) cao tới +${nghin(dinh)} — cao hơn trần ${nghin(wt)}.` });
    });
    // ảnh: số trên ảnh khác số trong thẻ tường; số ước lệch số đo; ảnh chưa kẻ số; tường có cửa mà chưa có ảnh
    const lv = l => G.giaTriLien(l, p, A.gui.phong);
    for (const a of r.anh) {
      (a.ke || []).forEach((k, ki) => {
        // chỉ khi số ảnh CỐ Ý chưa vào phòng (rời màn khi câu "khác số cũ" chưa trả lời — k.lech); sửa số ở thẻ phòng sau khi gắn thì ảnh đổi theo, không báo
        if (k.loai !== 'kt' || !k.lien || !k.lech || !(typeof k.so === 'number' && k.so > 0)) return;
        const o = giaTriTho(k.lien, r); if (o === null || Math.abs(o - k.so) <= SOAT.anh_lech) return;
        V.push({ t: `${hoa(tenAnh(r, a))} ghi ${nghin(k.so)}, ${tenLien(k.lien, r, A)} đang ${nghin(o)} (lệch ${nghin(Math.abs(o - k.so))} mm).`,
          nut: `<span class="hang nut-lech"><button data-act="lech-anh" data-id="${esc(a.id)}" data-k="${ki}">Dùng số ảnh</button><button data-act="lech-giu" data-id="${esc(a.id)}" data-k="${ki}">Giữ số cũ</button></span>` });
      });
      const u = uocNet(a.ke, lv, r);
      if (u.lech.length) { const x = u.lech.reduce((m, y) => (y.p > m.p ? y : m)); V.push({ t: `${hoa(tenAnh(r, a))}: số ước (tính theo số đã gõ trên ảnh) lệch số đo ${Math.round(x.p * 100)} % (đo ${nghin(x.v)}, ước ≈${nghin(Math.round(x.u / 10) * 10)}) — ảnh chụp xiên, số ước không tin được.` }); }
      if (Number.isInteger(a.tuong) && p.tuong[a.tuong] && !(a.ke || []).some(k => soDoan(k, lv) > 0)) X.push({ t: `${hoa(tenAnh(r, a))} chưa kẻ số nào.` });
    }
    p.tuong.forEach((t, i) => { if (p.mo.some(x => x.tuong === i) && !r.anh.some(a => a.tuong === i)) X.push({ t: `Tường ${t.ten} có cửa mà chưa có ảnh.` }); });
    return { do: D, vang: V, xam: X };
  }

  /* ----- mặt bằng nhỏ dính trên cùng ----- */
  const M_NEN = '#fbfaf7', M_NHAN = '#1c5fb8';      // màu nền / nhãn của matBangSVG (mncf-phong)
  /**
   * Chiều cao (px) của mặt bằng: thu nhỏ 22 % màn; phóng to ≤ 60 % và luôn chừa ≥ 340 px cho ô đang gõ + bàn phím; bàn phím đang che
   * (khung nhìn thấy < 80 % chiều cao màn) thì chỉ còn dải mỏng. h = phần màn cố định (tấm chi tiết).
   */
  function caoMB(to, h) {
    const ih = window.innerHeight || 800, vv = window.visualViewport, vh = vv ? Math.min(vv.height, ih) : ih;
    if (h) return Math.round(ih * h);
    if (vh < 0.8 * ih) return Math.max(64, Math.round(vh * 0.16));
    const nho = Math.round(ih * 0.22), hd = $('[data-ui="dinh"] header'), dau = hd ? hd.offsetHeight + 14 : 80;      // cả phần dính (đầu trang + mặt bằng) chừa ≥ 340 px
    return to ? Math.max(nho, Math.round(Math.min(ih * 0.6, ih - 340 - dau))) : nho;
  }
  /** Cỡ chữ nhãn tường trên màn (px) — chữ của mncf-phong theo cỡ phòng, thu vào khung 200 px còn ~5 px không đọc được. */
  const CHU_MB = 12;
  /**
   * Mặt bằng (chon = tường đang sửa, tô xanh) vẽ ĐÚNG cỡ khung (rong × cao px, không co giãn theo số đang gõ). Tường máy suy: nét đứt + chữ "máy suy".
   * Nhãn tường "A 3600" vẽ lại ở cỡ đọc được (CHU_MB px) thay nhãn của mncf-phong; chữ khác phóng theo (≤ 2,5×). Không sửa mncf-phong.
   */
  function mbHTML(A, chon, to, h, rong) {
    const H = A.H;
    if (!H.tuong.some(w => w.dai > 0)) return '<p class="nhat" style="padding:12px;margin:0">Gõ chiều dài tường để thấy mặt bằng.</p>';
    const cao = caoMB(to, h), W = Math.max(160, Math.round(rong || 358));
    let s = Ph.matBangSVG(H, { rong_px: W, cao_px: cao, chon_tuong: chon });
    const vb = (/viewBox="([^"]+)"/.exec(s) || [0, '0 0 1 1'])[1].split(/\s+/).map(Number);
    const hop = H.hop, lon = Math.max(hop.x1 - hop.x0, hop.y1 - hop.y0, 1000), fs = lon / 30, day = Math.max(60, lon / 40), f = v => G.rn(v, 1);
    const k = Math.min(W / (vb[2] || 1), cao / (vb[3] || 1)), F = CHU_MB / k, tang = Math.min(2.5, Math.max(1, F / fs));
    // khung svg cố định: rộng 100 %, cao `cao` px
    s = s.replace(/<svg([^>]*?) width="[^"]*" style="[^"]*"/, `<svg$1 width="100%" height="${cao}" style="display:block;width:100%;height:${cao}px;font-family:inherit"`);
    // bỏ nhãn tên + dài tường của mncf-phong (vòng tròn + chữ ngay trước vùng bấm data-tuong), chữ còn lại phóng theo
    s = s.replace(/<circle [^>]*pointer-events="none"\/><text [^>]*>[^<]*<\/text>(<text [^>]*pointer-events="none">[^<]*<\/text>)?(?=<line data-tuong=)/g, '');
    s = s.replace(/font-size="([\d.]+)"/g, (m, v) => `font-size="${f(+v * tang)}"`);
    const xuoi = w => { let q = ((-w.a % 360) + 360) % 360; if (q > 90 && q < 270) q -= 180; return q; };
    const P = (w, s0, t) => [w.p0[0] + w.d[0] * s0 + w.n[0] * t, w.p0[1] + w.d[1] * s0 + w.n[1] * t];
    let them = '';
    for (const w of H.tuong) {
      if (!(w.dai > 0)) continue;
      const on = chon === w.i, suy = !!A.suy[w.i], c = P(w, w.dai / 2, -(day / 2 + F * 0.95)), q = xuoi(w);
      them += `<text data-nhan-mb="${w.i}" x="${f(c[0])}" y="${f(-c[1])}" font-size="${f(F)}" text-anchor="middle" dominant-baseline="middle" fill="${on ? M_NHAN : '#1b2420'}" paint-order="stroke" stroke="${M_NEN}" stroke-width="${f(F / 5)}" transform="rotate(${f(q)} ${f(c[0])} ${f(-c[1])})" pointer-events="none"><tspan font-weight="700">${esc(w.ten)}</tspan> ${suy ? '≈' : ''}${esc(g(w.dai))}</text>`;
    }
    for (const kk of Object.keys(A.suy)) {
      const w = H.tuong[+kk]; if (!w || !(w.dai > 0)) continue;
      const t0 = H.khep.kin ? -day / 2 : 0, a = P(w, 0, t0), b = P(w, w.dai, t0), c = P(w, w.dai / 2, F * 1.1), q = xuoi(w);
      them += `<g data-suy-mb="${w.i}" pointer-events="none"><line x1="${f(a[0])}" y1="${f(-a[1])}" x2="${f(b[0])}" y2="${f(-b[1])}" stroke="${M_NEN}" stroke-width="${f(day * 0.72)}" stroke-dasharray="${f(fs * 0.55)} ${f(fs * 0.45)}"/>`
        + `<text x="${f(c[0])}" y="${f(-c[1])}" font-size="${f(F * 0.85)}" font-style="italic" text-anchor="middle" dominant-baseline="middle" fill="${M_NHAN}" transform="rotate(${f(q)} ${f(c[0])} ${f(-c[1])})">máy suy</text></g>`;
    }
    if (them) { const i = s.lastIndexOf('</svg>'); s = s.slice(0, i) + them + s.slice(i); }
    return s + (h ? '' : `<button class="mb-to" data-act="mb-to" aria-label="${to ? 'Thu nhỏ mặt bằng' : 'Phóng to mặt bằng'}" title="${to ? 'Thu nhỏ' : 'Phóng to'}">${to ? '⤡' : '⤢'}</button>`);
  }
  /** Vẽ lại mặt bằng dính (sau khi đổi cỡ màn / bàn phím). */
  function veMB(A) {
    const mb = $('[data-ui="mb"]'); if (!mb || !S.rec) return;
    mb.innerHTML = mbHTML(A || phanTich(S.rec), S.mo, !!S.mb_to, 0, mb.clientWidth); mb.dataset.chon = S.mo >= 0 ? String(S.mo) : '';
    capDinh();
  }
  let mbCo = '';
  const doiCoMB = () => { const vv = window.visualViewport, c = [window.innerWidth, window.innerHeight, vv ? Math.round(vv.height) : 0].join('x'); if (c === mbCo) return; mbCo = c; if (!lop.querySelector('[data-ui="ke"]')) veMB(); };
  window.addEventListener('resize', doiCoMB);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', doiCoMB);
  /** Ô đang gõ không được nằm khuất dưới phần dính trên cùng. */
  function capDinh() { const d = $('[data-ui="dinh"]'); document.documentElement.style.scrollPaddingTop = d ? (d.offsetHeight + 8) + 'px' : ''; }
  document.addEventListener('focusin', e => {
    const el = e.target; if (!el || !app.contains(el) || !el.matches('input, textarea, select')) return;
    // mặt bằng đang phóng to mà thợ gõ một ô của phòng: thu nhỏ lại (không thì nó che ô đang gõ / bàn phím)
    if (S.mb_to && S.rec && !el.closest('[data-ui="dinh"]')) { S.mb_to = false; const mb = $('[data-ui="mb"]'); if (mb) mb.classList.remove('to'); veMB(); }
    setTimeout(() => { const d = $('[data-ui="dinh"]'); if (!d || !el.isConnected || d.contains(el)) return; const b = d.getBoundingClientRect().bottom, r = el.getBoundingClientRect(); if (r.top < b + 4) window.scrollBy(0, r.top - b - 12); }, 80);
  });
  /** Ghi phòng đang mở: ngay vào IndexedDB (sau 800 ms không gõ), xếp việc gửi. */
  function henLuu() { clearTimeout(S.hen); S.hen = setTimeout(luuNgay, 800); }
  async function luuNgay() {
    clearTimeout(S.hen); S.hen = 0;
    if (!S.rec || !S.rec.ban) return;
    const r = S.rec; delete r.ban; r.dem = (r.dem || 0) + 1;
    const kho = r.la_cua ? 'cua' : 'phong';      // S.rec là phòng HOẶC mục "Cửa & vách kính" đang mở
    await DB.put(kho, r);
    await DB.put('hang', { k: kho + ':' + r.id, loai: kho, id: r.id, th: 1, lan: 0, cho_den: 0, dung: '', ver: r.dem });
    capThanh(); henChay(300);
  }
  const doi = () => { S.rec.ban = true; henLuu(); };
  /**
   * Số đang gõ dở trong ô số (k.nhap — ghi mỗi lần gõ, lưu cùng phòng sau 800 ms): app bị tắt / tải lại trước khi kịp ghi thì lần mở phòng sau
   * ghi nó vào đoạn (ghi ngầm: không vào phòng; đoạn đã gắn mà số khác → k.lech, dòng vàng). @returns có đổi gì không
   */
  function chotNhap(rec) {
    let doi = false;
    for (const a of rec.anh || []) for (const k of a.ke || []) {
      if (!k || k.nhap === undefined) continue;
      const d = docO(String(k.nhap).replace(/^\s*≈\s*/, '')); delete k.nhap; doi = true;
      if (d.sai || !(d.v > 0) || d.v > G.SO_MAX) continue;
      const v = d.v < SOAT.tuong_min && !Number.isInteger(d.v) ? G.rn(d.v * 1000, 1) : d.v;
      k.so = v; k.text = chuGo(v); k.nguon = 'go';
      if (k.lien) { const o = giaTriTho(k.lien, rec); if (o !== null && Math.abs(o - v) > SOAT.anh_lech) k.lech = true; else if (o === null) delete k.lien; }
    }
    return doi;
  }
  /** Ghi số đang gõ dở của ô số vào đoạn (k.nhap) — xem chotNhap. */
  function ghiNhap(v) {
    const k = K.o !== null ? K.ke[K.o] : null; if (!k) return;
    const t = String(v || '').trim().slice(0, 24);
    if (t && t !== soHien(k)) k.nhap = t; else if (k.nhap === undefined) return; else delete k.nhap;
    ghiNet();
  }
  /** App bị che / bị đóng (máy tắt app, tải lại): số đang gõ trong ô số của màn kẻ ghi vào đoạn trước khi lưu (ghi ngầm — không vào phòng). */
  function anTrang() {
    if (K.cv && K.cv.isConnected && K.o !== null) { try { giuKe(ROI); ghiNet(); } catch (e) { /* bỏ qua */ } }
    luuNgay();
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') anTrang(); });
  window.addEventListener('pagehide', anTrang);

  function suaO(o, v, el) {
    const r = S.rec, p = r.phong, m = /^tuong\.(\d+)\.(\w+)$/.exec(o);
    delete S.bao_m;
    if (o === 'cao' || m) {      // ô số: chữ lạ / số âm / quá lớn → báo đỏ ngay ở ô, giữ số cũ (không lặng lẽ thành "để trống = tự suy")
      const d = docO(v, m && m[2] === 'goc_trong' ? 1 : 0);
      if (d.sai) { S.sai[o] = d.sai; if (el) el.setAttribute('aria-invalid', 'true'); capPhanTich(); return; }
      delete S.sai[o]; if (el) el.removeAttribute('aria-invalid');
    }
    if (o === 'ten') { r.ten = v.slice(0, 60); p.ten = r.ten; const h = $('[data-ui="ten-ph"]'); if (h) h.textContent = r.ten || 'Phòng'; }
    else if (o === 'cao') { p.cao = soDoc(v); delete r.cao_san; const cs = $('[data-ui="cao-san"]'); if (cs) cs.remove(); }
    else if (o === 'ghi_chu') r.ghi_chu = v.slice(0, 500);
    else if (o === 'xong') {
      // số vô lý (đỏ) chặn "Đo xong": sửa trước đã (máy vẽ vẫn tự soát, đây là để thợ không rời nhà khách với số sai)
      const nd = el.checked ? soatSo(r, phanTich(r)).do.length : 0;
      if (nd) { el.checked = false; S.bao_xong = `Còn ${nd} số vô lý (dòng đỏ) — sửa trước khi đánh dấu đo xong.`; capPhanTich(); return; }
      if (el.checked) delete S.bao_xong; r.xong = !!el.checked;
    }
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
    S.ct = { nhom, j, x, go: {} };
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
      : `<label>${esc(nh)} (mm)<input data-f="${k}" data-nhan="${esc(nh)}" inputmode="decimal" value="${S.ct.go[k] !== undefined ? esc(S.ct.go[k]) : x[k] === null || x[k] === undefined ? '' : esc(x[k])}"${goiY(k) !== null ? ` placeholder="gợi ý ${goiY(k)}"` : ''}></label>${goiY(k) !== null ? `<button type="button" data-act="dung-goi-y" data-f="${k}" data-v="${goiY(k)}">Đúng như gợi ý (${goiY(k)})</button>` : ''}`).join('');
    moTam(`<h3>${j !== undefined ? 'Sửa' : 'Thêm'} chi tiết — tường ${esc(S.rec.phong.tuong[x.tuong].ten)}</h3>
<div class="mb mini tam-mb" data-ui="mb-tam"></div>
<div data-ui="loai">${Object.entries(ten).map(([k, t]) => `<button type="button" class="chip" data-act="ct-loai" data-v="${k}" aria-pressed="${x.loai === k}">${esc(t)}</button>`).join('')}</div>
<label class="cong-tac"><input type="checkbox" data-act="ct-phai" data-khong-tu="1"${x.tu === 'phai' ? ' checked' : ''}> Đo từ góc phải</label>
${o}
<div class="loi-o" data-ui="loi-ct"></div>
<div class="hang" style="margin-top:12px">${j !== undefined ? '<button class="do" data-act="ct-xoa">Xoá</button>' : '<button data-act="dong-tam">Thôi</button>'}<button class="chinh" data-act="ct-xong">Xong</button></div>`);
    dayLS();
    xemCT();
    const dau = $('.tam input[data-f]', lop); if (dau) dau.focus();
  }
  /** Mặt bằng trong tấm chi tiết: vẽ phòng như thể chi tiết đang gõ đã ghi (đọc ô, không đụng S.ct / phòng) — gõ số là thấy cửa / cột dời theo. */
  function xemCT() {
    const el = $('[data-ui="mb-tam"]', lop); if (!el || !S.ct || !S.rec) return;
    const { nhom, j } = S.ct, x = JSON.parse(JSON.stringify(S.ct.x)), rec = JSON.parse(JSON.stringify(S.rec)), p = rec.phong;
    for (const o of $$('.tam [data-f]', lop)) { if (o.dataset.f === 'ghi') continue; const d = docO(o.value); x[o.dataset.f] = d.sai ? null : d.v; }
    if (!x.id) x.id = 'xemtruoc';
    if (j === undefined) p[nhom].push(x); else p[nhom][j] = x;
    el.innerHTML = mbHTML(phanTich(rec), x.tuong, false, 0.2, el.clientWidth);
  }
  /** Đọc các ô của tấm chi tiết. Ô gõ sai giữ nguyên chữ (S.ct.go) để dựng lại tấm không mất; trả danh sách lỗi. */
  function docChiTiet() {
    const x = S.ct.x, loi = [];
    S.ct.go = {};
    for (const el of $$('.tam [data-f]', lop)) {
      const k = el.dataset.f;
      if (k === 'ghi') { if (el.value.trim()) x.ghi = el.value.trim(); else delete x.ghi; continue; }
      const d = docO(el.value);
      if (d.sai) { S.ct.go[k] = el.value; x[k] = null; loi.push(`${el.dataset.nhan || k}: ${d.sai}`); el.setAttribute('aria-invalid', 'true'); } else { x[k] = d.v; el.removeAttribute('aria-invalid'); }
    }
    return { x, loi };
  }
  /** Ghi chi tiết đang mở vào phòng (boQuaLoi: ô sai thành trống — dùng khi rời tấm bằng Quay lại). */
  function ghiChiTiet(boQuaLoi) {
    const { nhom, j } = S.ct, { x, loi } = docChiTiet(), p = S.rec.phong;
    if (loi.length && !boQuaLoi) return loi;
    if (nhom === 'dn') { const L = Ph.LOAI_DN[x.loai]; if (L.san) delete x.cao; else delete x.ra; }
    if (j === undefined) { x.id = (nhom === 'mo' ? 'm' : nhom === 'can' ? 'c' : 'd') + ngauNhien(6); p[nhom].push(x); } else p[nhom][j] = x;
    return [];
  }
  function xongChiTiet(boQuaLoi) {
    const loi = ghiChiTiet(boQuaLoi);
    if (loi.length) { const o = $('[data-ui="loi-ct"]', lop); if (o) o.textContent = loi.join(' · ') + ' — sửa rồi bấm Xong.'; return; }
    dongTam(); doi(); veTuongs(); capPhanTich(); veAnhs();
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
      const t = el.dataset.anh === '' ? null : +el.dataset.anh, ds = S.rec.anh.filter(a => (a.tuong === undefined ? null : a.tuong) === t);
      const co = new Set(S.rec.anh_co || []);
      const ht = await Promise.all(ds.map(async a => `<button data-act="ke" data-id="${esc(a.id)}" aria-label="Kẻ số lên ảnh"><img alt="" src="${esc(await srcAnh(a.id))}"><span class="nhan" data-nhan-anh="${esc(a.id)}">${esc(nhanAnh(a))}${co.has(a.id) ? '' : ' · chưa gửi'}</span></button>`));
      el.innerHTML = ht.join('');
    }
  }
  /** Nhãn ảnh thu nhỏ (1.9): "3 kích thước · 1 ghi chú" — không bao giờ "0 nét" (thợ không hiểu "nét"). */
  function nhanAnh(a) {
    const ke = a.ke || [], kt = ke.filter(k => k.loai === 'kt'), lv = lienCua();
    // "kích thước" = số ĐO THẬT; số ước, số máy suy / trần điền sẵn (đoạn chỉ gắn ô) đếm riêng
    const co = kt.filter(k => soDo(k, S.rec) > 0).length, uoc = kt.filter(k => laUoc(k) && soDoan(k, lv) > 0).length, chua = kt.length - co - uoc, gc = ke.length - kt.length;
    if (!ke.length) return 'Chưa kẻ số — chạm để kẻ';
    return [co ? `${co} kích thước` : '', uoc ? `${uoc} số ước` : '', chua ? `${chua} chưa có số` : '', gc ? `${gc} ghi chú` : ''].filter(Boolean).join(' · ');
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
        await DB.put('anh', Object.assign({ id, blob: n.blob, w: n.w, h: n.h, len: 0, luc: Date.now() }, r.la_cua ? { cua: r.id } : { phong: r.id }));
        r.anh.push({ id, tuong: chupCho, w: n.w, h: n.h, ghi: '', ke: [] });
        if (!dau) dau = id;
      } catch (e) { alertNho(e.message); }
    }
    doi(); await luuNgay(); veAnhs();
    if (dau) moKe(dau);
  }
  function alertNho(t) { const tt = $('[data-ui="tt"]'); if (tt) tt.insertAdjacentHTML('afterbegin', `<div class="msg loi">${esc(t)}</div>`); }

  /* ================= KẺ SỐ LÊN ẢNH ================= */
  // Kiểu ImageMeter (đợt 1): một ngón = vẽ / sửa, hai ngón = kéo / phóng, chạm hai lần = vừa khung; chạm nhãn = gõ số; chạm đoạn = chọn (núm hai đầu, kéo khúc giữa = dời cả đoạn).
  // Ngón tay: điểm đang đặt nằm cao hơn ngón LECH px (ngón không che), kính lúp 3× ở góc xa ngón. Mỗi việc (vẽ, sửa, xoá, gõ số) là một bước ↶ / ↷.
  // Đoạn lưu: { loai, a, b, text?, lien?, so?, nguon?, nhan? } — `text` luôn mang số đã gõ (máy chủ chỉ giữ loai / a / b / text / lien; gói `gui` kẻ theo text / lien như cũ).
  const K = {};
  // CHAM_*: ngón đi quá ngần ấy px mới là kéo (chuột 8, ngón 14, đặt trên nhãn 20 — chạm nhãn hơi run vẫn là sửa số); DOAN_MIN: đoạn mới ngắn hơn (px màn) = chạm, không kẻ
  const LECH = 60, DINH_PX = 12, DINH_GOC = 4, NUM_PX = 28, DOAN_PX = 18, CHAM_PX = 8, CHAM_TAY = 14, CHAM_NHAN = 20, DOAN_MIN = 24, LS_MAX = 100, KINH = 120, PHONG_KINH = 3;
  async function moKe(id) {
    const r = S.rec, a = r.anh.find(x => x.id === id); if (!a) return;
    Object.assign(K, { a, ke: JSON.parse(JSON.stringify(a.ke || [])), che: 'kt', dang: null, keo: null, ptr: new Map(), pinch: null, img: null, sel: -1, o: null, ls: [], rs: [], oLien: '', oGoiY: '', oCho: null, uoc: null, baoM: '', dinh: null,
 cham: null, chamTruoc: null, sauPinch: false, hoi: null, lv: null, cw: 0, ch: 0 });
    const vi = r.anh.indexOf(a), tiep = r.anh[vi + 1];
    lop.innerHTML = `<div class="ke" data-ui="ke"><div class="cong-cu">
<button data-act="ke-che" data-v="kt" aria-pressed="true">↔ Kích thước</button><button data-act="ke-che" data-v="chi" aria-pressed="false">↗ Ghi chú</button><button data-act="ke-che" data-v="chu" aria-pressed="false">T Chữ</button></div>
<div class="vung" data-ui="ke-vung"><canvas class="hinh" data-ui="ke-canvas" aria-label="Ảnh để kẻ số đo — một ngón kẻ / sửa, hai ngón kéo / phóng, chạm hai lần vừa khung"></canvas><canvas class="kinh" data-ui="kinh"></canvas></div>
<div class="cong-cu"><button data-act="ke-lui" aria-label="Hoàn tác" title="Hoàn tác">↶</button><button data-act="ke-lam-lai" aria-label="Làm lại" title="Làm lại">↷</button><button data-act="ke-bo-chon" aria-label="Xoá đoạn đang chọn" title="Xoá đoạn đang chọn">🗑</button><button data-act="ke-xong" class="chinh">Xong</button></div>
<div class="ke-tt" data-ui="ke-tt"></div>
<ul class="ds-net" data-ui="ds-net"></ul>

<div class="cong-cu"><button data-act="ke-chup-tiep">📷 Chụp tiếp</button>${tiep ? `<button data-act="ke-anh-ke" data-id="${esc(tiep.id)}">Ảnh kế › <small>${vi + 2}/${r.anh.length}</small></button>` : ''}<button data-act="ke-xoa-anh">Xoá ảnh</button></div></div>`;
    const img = new Image(); img.src = await srcAnh(id);
    await new Promise(ok => { img.onload = ok; img.onerror = ok; });
    if (K.a !== a) return;      // đã sang ảnh khác trong lúc tải
    K.img = img; K.cv = $('[data-ui="ke-canvas"]', lop); K.kinh = $('[data-ui="kinh"]', lop);
    dayLS();
    // dựng các phần dưới ảnh TRƯỚC rồi mới đo khung (đo trước thì khung co lại sau đó, ảnh bị bóp dẹt — nét không nằm dưới ngón)
    veDsNet(); capNut(); khopKe(true); veKeCanvas();
    if (K.ro) K.ro.disconnect();
    if (window.ResizeObserver) { K.ro = new ResizeObserver(() => doiCoKe()); K.ro.observe(K.cv); }
    K.cv.addEventListener('pointerdown', keXuong); K.cv.addEventListener('pointermove', keDi); K.cv.addEventListener('pointerup', keLen); K.cv.addEventListener('pointercancel', keLen);
  }
  /**
   * Bộ đệm canvas = đúng cỡ khung trên màn (× dpr). vua: đặt lại cho cả ảnh vừa khung; không thì giữ mức phóng, chỉ dời cho tâm đứng yên.
   * Ảnh đang "vừa khung" (thợ chưa phóng / kéo — K.vua) thì đổi cỡ khung vẫn vừa khung.
   */
  function khopKe(vua) {
    const cv = K.cv, dpr = window.devicePixelRatio || 1, cw = cv.clientWidth, ch = cv.clientHeight, cuW = K.cw, cuH = K.ch;
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); K.dpr = dpr; K.cw = cw; K.ch = ch;
    if (K.kinh) K.kinh.width = K.kinh.height = Math.round(KINH * dpr);
    if (vua || !cuW || !K.s) { const s = Math.min(cw / K.a.w, ch / K.a.h); K.s = s; K.tx = (cw - K.a.w * s) / 2; K.ty = (ch - K.a.h * s) / 2; K.vua = true; }
    else { K.tx += (cw - cuW) / 2; K.ty += (ch - cuH) / 2; }
  }
  /** Khung ảnh đổi cỡ (danh sách đoạn dài ra, bàn phím bật, xoay máy): khớp lại bộ đệm — không thì trình duyệt co giãn hình, nét lệch khỏi ngón. */
  function doiCoKe() {
    if (!K.cv || !K.cv.isConnected) return;
    if (K.cv.clientWidth === K.cw && K.cv.clientHeight === K.ch && Math.round(K.cw * (window.devicePixelRatio || 1)) === K.cv.width) return;
    khopKe(!!K.vua && !K.pinch); veKeCanvas(); datO();
  }
  /** Bàn phím bật (khung nhìn thấy < 80 % chiều cao) khi ô số đang mở: màn kẻ co theo phần nhìn thấy, ẩn danh sách / dòng việc cho ảnh đủ chỗ. */
  function capBanPhim() {
    const ke = $('[data-ui="ke"]', lop); if (!ke) return;
    const vv = window.visualViewport, ih = window.innerHeight || 0; K.hMax = Math.max(K.hMax || 0, ih);
    const h = vv ? Math.min(vv.height, ih) : ih, bp = K.o !== null && h < 0.8 * K.hMax;
    ke.classList.toggle('ban-phim', bp);
    if (bp && vv && vv.height < ih - 1) { ke.style.top = Math.max(0, vv.offsetTop) + 'px'; ke.style.height = vv.height + 'px'; ke.style.bottom = 'auto'; }
    else { ke.style.top = ''; ke.style.height = ''; ke.style.bottom = ''; }
  }
  window.addEventListener('resize', () => { if (K.cv && K.cv.isConnected) { capBanPhim(); doiCoKe(); } });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', () => { if (K.cv && K.cv.isConnected) { capBanPhim(); doiCoKe(); } });
  const lienCua = () => { if (S.rec.la_cua) { const r = S.rec; return l => giaTriTho(l, r); } const A = phanTich(S.rec); return l => G.giaTriLien(l, S.rec.phong, A.gui.phong); };
  const layLV = () => K.lv || (K.lv = lienCua());
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
  /* --- hình học: toạ độ ảnh ↔ màn hình, nhãn, chạm --- */
  const coKe = () => G.rn(Math.max(K.a.w, K.a.h) / 26, 1);      // cỡ chữ của veKe (gói gui)
  const kepK = q => [Math.min(Math.max(q[0], 0), K.a.w), Math.min(Math.max(q[1], 0), K.a.h)];
  const raMan = q => { const r = K.cv.getBoundingClientRect(); return [r.left + K.tx + q[0] * K.s, r.top + K.ty + q[1] * K.s]; };
  const vaoAnh = (cx, cy) => { const r = K.cv.getBoundingClientRect(); return [(cx - r.left - K.tx) / K.s, (cy - r.top - K.ty) / K.s]; };
  const xa = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const xaDoan = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy; const t = L ? Math.min(1, Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
  /** Chữ hiện trên nhãn: số của phòng (đoạn liên kết) → số đã gõ → chữ cũ; '' = đoạn chưa có số (nét đứt + "gõ số", không bao giờ "?"). */
  function soHien(k) {
    if (k.loai !== 'kt') return String(k.text || '').trim();
    if (k.lien && !k.lech) { const v = layLV()(k.lien); if (v !== null && v !== undefined) return g(v); }
    if (typeof k.so === 'number' && isFinite(k.so) && k.so > 0) return (laUoc(k) ? '≈' : '') + chuGo(k.so);
    const t = String(k.text || '').trim(); return t && t !== '?' && t !== '…' ? t : '';
  }
  /** Khung nhãn theo toạ độ ảnh — cùng chỗ với veKe (giữa đoạn, lệch 0,8 cỡ chữ ra một bên). */
  function nhanCua(k, cx) {
    const co = coKe(), so = soHien(k);
    if (k.loai !== 'kt') { if (!so || !k.a) return null; cx.font = `700 ${co}px sans-serif`; return { x: k.a[0], y: k.a[1], goc: 0, rong: Math.max(cx.measureText(so).width, co * 0.6) + co * 0.7, cao: co * 1.35, t: so, c: co }; }
    if (!k.a || !k.b) return null;
    const dx = k.b[0] - k.a[0], dy = k.b[1] - k.a[1], L = Math.hypot(dx, dy); if (L < 4) return null;
    let u = [dx / L, dy / L], goc = Math.atan2(u[1], u[0]) * 180 / Math.PI;
    if (goc <= -90 || goc > 90) { u = [-u[0], -u[1]]; goc = Math.atan2(u[1], u[0]) * 180 / Math.PI; }
    const n = [u[1], -u[0]];
    // chưa có số: số ƯỚC theo thước chuẩn (xám nghiêng "≈1 230"), không có thước thì "gõ số"
    const uoc = !so && K.uoc ? K.uoc.m.get(k) : undefined, t = so || (uoc > 0 ? '≈' + nghin(uoc) : 'gõ số'), c = so ? co : co * 0.72;
    cx.font = `${uoc > 0 ? 'italic ' : ''}700 ${c}px sans-serif`;
    return { x: (k.a[0] + k.b[0]) / 2 + n[0] * 0.8 * co, y: (k.a[1] + k.b[1]) / 2 + n[1] * 0.8 * co, goc, rong: Math.max(cx.measureText(t).width, c * 0.6) + c * 0.7, cao: c * 1.35, t, c, trong: !so, uoc: uoc > 0 };
  }
  function trungNhan(tay) {
    const cx = K.cv.getContext('2d'), p = vaoAnh(tay[0], tay[1]), pad = 8 / K.s;
    for (let i = K.ke.length - 1; i >= 0; i--) {
      const n = nhanCua(K.ke[i], cx); if (!n) continue;
      const r = n.goc * Math.PI / 180, dx = p[0] - n.x, dy = p[1] - n.y, lx = dx * Math.cos(r) + dy * Math.sin(r), ly = -dx * Math.sin(r) + dy * Math.cos(r);
      if (Math.abs(lx) <= n.rong / 2 + pad && Math.abs(ly) <= n.cao / 2 + pad) return i;
    }
    return -1;
  }
  function trungDoan(tay) {
    let tot = -1, d0 = DOAN_PX;
    K.ke.forEach((k, i) => { const d = k.b ? xaDoan(tay, raMan(k.a), raMan(k.b)) : xa(tay, raMan(k.a)); if (d <= d0) { d0 = d; tot = i; } });
    return tot;
  }
  /** Bắt dính (1.5): gần đầu một đoạn khác (≤ DINH_PX px màn hình) → dính vào đó; không thì gần ngang / dọc (± DINH_GOC°) so với `goc` → thẳng hẳn. K.dinh = vòng xanh. */
  function datDinh(p, goc, bo) {
    let q = null, d0 = DINH_PX / K.s;
    K.ke.forEach((k, i) => { if (i === bo) return; for (const z of [k.a, k.b]) if (z && k.loai !== 'chu') { const d = xa(p, z); if (d <= d0) { d0 = d; q = z; } } });
    if (q) { K.dinh = { p: [q[0], q[1]], kieu: 'diem' }; return [q[0], q[1]]; }
    if (goc) {
      const dx = p[0] - goc[0], dy = p[1] - goc[1];
      if (Math.hypot(dx, dy) * K.s >= 16) {
        const ang = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI), m = ang % 90, lech = Math.min(m, 90 - m);
        if (lech <= DINH_GOC) { const ngang = Math.abs(dx) >= Math.abs(dy), z = ngang ? [p[0], goc[1]] : [goc[0], p[1]]; K.dinh = { p: z, kieu: ngang ? 'ngang' : 'doc' }; return z; }
      }
    }
    K.dinh = null; return p;
  }
  function veKeCanvas() {
    const cv = K.cv, x = cv.getContext('2d'), a = K.a, co = coKe();
    capUoc();
    x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = '#000'; x.fillRect(0, 0, cv.width, cv.height);
    x.setTransform(K.dpr * K.s, 0, 0, K.dpr * K.s, K.dpr * K.tx, K.dpr * K.ty);
    if (K.img && K.img.naturalWidth) x.drawImage(K.img, 0, 0, a.w, a.h); else { x.fillStyle = '#555'; x.fillRect(0, 0, a.w, a.h); }
    const k0 = K.sel >= 0 ? K.ke[K.sel] : null;
    if (k0 && k0.b) { x.lineCap = 'round'; x.strokeStyle = 'rgba(255,212,0,.85)'; x.lineWidth = Math.max(co / 2.4, 10 / K.s); x.beginPath(); x.moveTo(k0.a[0], k0.a[1]); x.lineTo(k0.b[0], k0.b[1]); x.stroke(); }
    const hien = [], trong = [];
    K.ke.forEach(k => { if (k.loai === 'kt' && !soHien(k)) trong.push(k); else hien.push(k.loai === 'kt' ? { loai: 'kt', a: k.a, b: k.b, text: soHien(k) } : k); });
    if (K.dang && K.dang.b) hien.push({ loai: K.che === 'chi' ? 'chi' : 'kt', a: K.dang.a, b: K.dang.b, text: K.che === 'kt' ? '…' : '' });
    veNet(x, G.veKe(hien, a.w, a.h, () => null));
    for (const k of trong) {      // chưa có số: nét đứt + chữ nhỏ "gõ số"
      x.save(); x.lineCap = 'butt'; x.setLineDash([co * 0.45, co * 0.3]);
      for (const [mau, day] of [['#ffffff', co / 5], ['#e8281e', co / 10]]) { x.strokeStyle = mau; x.lineWidth = day; x.beginPath(); x.moveTo(k.a[0], k.a[1]); x.lineTo(k.b[0], k.b[1]); x.stroke(); }
      x.restore();
      const n = nhanCua(k, x); if (!n) continue;
      x.save(); x.translate(n.x, n.y); x.rotate(n.goc * Math.PI / 180); x.font = `${n.uoc ? 'italic ' : ''}700 ${n.c}px sans-serif`;
      x.fillStyle = 'rgba(40,40,40,.85)'; x.strokeStyle = n.uoc ? '#b9c2bd' : '#ffffff'; x.lineWidth = n.c / 14; x.setLineDash([n.c * 0.3, n.c * 0.2]); x.beginPath();
      if (x.roundRect) x.roundRect(-n.rong / 2, -n.cao / 2, n.rong, n.cao, n.c * 0.25); else x.rect(-n.rong / 2, -n.cao / 2, n.rong, n.cao);
      x.fill(); x.stroke(); x.fillStyle = n.uoc ? '#c9d0cc' : '#ffffff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(n.t, 0, n.c * 0.04); x.restore();
    }
    if (k0) {      // núm hai đầu đoạn đang chọn
      for (const q of [k0.a, k0.b]) if (q) { x.beginPath(); x.arc(q[0], q[1], 12 / K.s, 0, 2 * Math.PI); x.fillStyle = 'rgba(255,255,255,.9)'; x.fill(); x.lineWidth = 3 / K.s; x.strokeStyle = '#1c5fb8'; x.stroke(); }
    }
    if (K.dinh) { const q = K.dinh.p; x.beginPath(); x.arc(q[0], q[1], 16 / K.s, 0, 2 * Math.PI); x.lineWidth = 4 / K.s; x.strokeStyle = '#19c37d'; x.stroke(); }
  }
  /** Thước chuẩn của ảnh đang kẻ (1.8) — tính lại mỗi lần vẽ (đoạn vừa kéo / số vừa gõ đổi tỉ lệ). */
  function capUoc() { K.uoc = uocNet(K.ke, layLV(), S.rec); return K.uoc; }
  /** Dòng việc của màn kẻ (1.9): "Tường A còn thiếu: …", số ước lệch số đo, đổi mét → mm. */
  function veKeTT() {
    const el = $('[data-ui="ke-tt"]', lop); if (!el || !S.rec) return;
    const L = [], r = S.rec, p = r.phong, i = K.a.tuong, A = r.la_cua ? null : phanTich(r);
    if (K.baoM) L.push(`<div class="msg vang">${esc(K.baoM)}</div>`);
    if (r.la_cua) L.push(`<div class="ke-thieu${C.tinh(r.cua).muc === 'ok' ? ' du' : ''}" data-ui="ke-thieu">${esc(tomCua(r.cua))}</div>`);
    else if (Number.isInteger(i) && p.tuong[i]) {
      const t = p.tuong[i], thieu = [];
      if (!(t.dai > 0)) thieu.push(`Dài tường ${t.ten}${A.suy[i] ? ` (máy đang suy ≈${nghin(A.suy[i])})` : ''}`);
      if (!(t.cao > 0) && (!(p.cao > 0) || r.cao_san)) thieu.push('Cao trần');
      for (const nhom of ['mo', 'can', 'dn']) p[nhom].forEach((x, j) => { const th = A.thieu[nhom][j] || []; if (x.tuong === i && th.length) thieu.push(`${A.ten[nhom][j].ten} (${th.map(k => G.TEN_O[k] || k).join(', ')})`); });
      L.push(thieu.length ? `<div class="ke-thieu" data-ui="ke-thieu">Tường ${esc(t.ten)} còn thiếu: ${esc(thieu.join(', '))}</div>` : `<div class="ke-thieu du" data-ui="ke-thieu">Tường ${esc(t.ten)}: đủ số ✓</div>`);
    }
    const u = K.uoc || capUoc();
    if (u.lech.length) { const x = u.lech.reduce((m, y) => (y.p > m.p ? y : m)); L.push(`<div class="msg vang" data-ui="uoc-lech">Số ước lệch số đo ${Math.round(x.p * 100)} % (đoạn ${x.i + 1}: đo ${esc(nghin(x.v))}, ước ≈${esc(nghin(Math.round(x.u / 10) * 10))}) — ảnh chụp xiên, đừng dùng số ước.</div>`); }
    el.innerHTML = L.join('');
  }
  function veDsNet() {
    const el = $('[data-ui="ds-net"]', lop); if (!el) return;
    const TEN = { kt: 'Kích thước', chi: 'Ghi chú', chu: 'Chữ' };
    capUoc(); veKeTT();
    el.innerHTML = `<li class="ghi"><span><input data-ui="ghi-anh" maxlength="200" placeholder="Ghi chú cho ảnh (vd “mặt có cửa sổ”)" value="${esc(K.a.ghi || '')}"></span></li>` + (K.ke.length ? '' : '<li class="goi-y"><small>Kéo một ngón để kẻ đoạn rồi gõ số · hai ngón kéo / phóng · chạm hai lần: vừa khung</small></li>') + K.ke.map((k, i) => {
      const so = soHien(k), uoc = !so && K.uoc.m.get(k);
      const chu = k.loai === 'kt' ? (so ? `<b>${esc(so)}</b>` : `<i class="trong">gõ số</i>${uoc ? ` <i class="uoc">≈${esc(nghin(uoc))} ước</i>` : ''}`) : `<b>${esc(so || '(mũi tên)')}</b>`;
      const lienT = k.lien ? tenLien(k.lien) : '', o = k.lien ? giaTriTho(k.lien) : null, lech = !!k.lech && o !== null && typeof k.so === 'number' && Math.abs(o - k.so) > SOAT.anh_lech;
      return `<li data-net="${i}"${i === K.sel ? ' class="chon"' : ''}><span>${i + 1}. ${TEN[k.loai]} ${chu}${lienT ? ` <small>= ${esc(lienT)}</small>` : ''}${lech ? ` <small class="lech">⚠ ảnh ghi ${esc(nghin(k.so))}</small>` : ''}${laUoc(k) ? ' <small>(số ước)</small>' : ''}</span><button data-act="ke-bo" data-i="${i}" aria-label="Bỏ nét ${i + 1}">✕</button></li>`;

    }).join('');
  }
  function capNut() {
    const n = (act, on) => { const b = $(`[data-act="${act}"]`, lop); if (b) b.disabled = !on; };
    n('ke-lui', K.ls.length > 0); n('ke-lam-lai', K.rs.length > 0); n('ke-bo-chon', K.sel >= 0 && !!K.ke[K.sel]);
  }
  /* --- hoàn tác / làm lại (1.7): ảnh chụp trạng thái nét + số của phòng (gõ số trên đoạn liên kết sửa cả số phòng) --- */
  const chupK = () => ({ ke: JSON.stringify(K.ke), ph: JSON.stringify(S.rec.la_cua ? S.rec.cua : S.rec.phong), cs: !!S.rec.cao_san });
  function ghiBuoc(b) { K.ls.push(b || chupK()); if (K.ls.length > LS_MAX) K.ls.shift(); K.rs = []; }
  function apBuoc(b) { K.ke = JSON.parse(b.ke); const kh = S.rec.la_cua ? 'cua' : 'phong'; if (b.ph !== JSON.stringify(S.rec[kh])) S.rec[kh] = JSON.parse(b.ph); if (S.rec.la_cua) { K.sel = -1; K.lv = null; return; } if (b.cs) S.rec.cao_san = true; else delete S.rec.cao_san; K.sel = -1; K.lv = null; }
  function hoanTac(lai) {
    dongSo(); const tu = lai ? K.rs : K.ls, sang = lai ? K.ls : K.rs; if (!tu.length) return;
    sang.push(chupK()); apBuoc(tu.pop()); xongNet();
  }
  /* --- cử chỉ (1.3 – 1.6) --- */
  const diemTay = (x, y, loai) => [x, y - (loai === 'touch' ? LECH : 0)];
  function keXuong(e) {
    if (K.o !== null && !ketSo(NGAM)) return;      // ô số đang mở mà số gõ sai: giữ ô, chạm này không làm gì
    try { K.cv.setPointerCapture(e.pointerId); } catch (x) { /* bỏ qua */ }
    K.ptr.set(e.pointerId, [e.clientX, e.clientY]);
    if (K.ptr.size === 2) {      // ngón thứ hai: thôi vẽ / thôi kéo, sang kéo – phóng
      huyKeo(); K.dang = null; K.dinh = null; K.cham = null;
      const [p, q] = Array.from(K.ptr.values()); K.pinch = { d: Math.hypot(p[0] - q[0], p[1] - q[1]), c: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], s: K.s, tx: K.tx, ty: K.ty }; kinh(null); veKeCanvas(); return;
    }
    if (K.ptr.size > 2 || K.sauPinch) return;
    const tay = [e.clientX, e.clientY];
    K.cham = { id: e.pointerId, x: tay[0], y: tay[1], loai: e.pointerType, di: false, tol: e.pointerType === 'touch' ? CHAM_TAY : CHAM_PX };
    const k = K.sel >= 0 ? K.ke[K.sel] : null;
    if (k) {
      const A = raMan(k.a), B = k.b ? raMan(k.b) : null, da = xa(tay, A), db = B ? xa(tay, B) : Infinity;
      const keo = kieu => { K.keo = { kieu, i: K.sel, x0: tay[0], y0: tay[1], a0: k.a.slice(), b0: k.b ? k.b.slice() : null, truoc: chupK(), di: false }; };
      if (B && Math.min(da, db) <= NUM_PX) { keo(da <= db ? 'a' : 'b'); kinh(da <= db ? A : B, tay); return; }
      if ((B && xaDoan(tay, A, B) <= DOAN_PX) || (!B && da <= NUM_PX)) { keo('ca'); return; }
    }
    if (trungNhan(tay) >= 0) K.cham.tol = CHAM_NHAN;
    K.dang = { x0: tay[0], y0: tay[1], a: null, b: null };
    kinh(diemTay(tay[0], tay[1], e.pointerType), tay);
  }
  function keDi(e) {
    if (!K.ptr.has(e.pointerId)) return;
    K.ptr.set(e.pointerId, [e.clientX, e.clientY]);
    if (K.pinch && K.ptr.size >= 2) {
      const [p, q] = Array.from(K.ptr.values()), d = Math.hypot(p[0] - q[0], p[1] - q[1]), c = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], r = K.cv.getBoundingClientRect();
      const s = Math.min(Math.max(K.pinch.s * d / (K.pinch.d || 1), 0.05), 8), ax = (K.pinch.c[0] - r.left - K.pinch.tx) / K.pinch.s, ay = (K.pinch.c[1] - r.top - K.pinch.ty) / K.pinch.s;
      K.s = s; K.tx = c[0] - r.left - ax * s; K.ty = c[1] - r.top - ay * s; K.vua = false; veKeCanvas(); return;
    }
    const c = K.cham; if (K.sauPinch || !c || e.pointerId !== c.id) return;
    const tay = [e.clientX, e.clientY];
    if (!c.di && Math.hypot(tay[0] - c.x, tay[1] - c.y) > c.tol) c.di = true;
    if (K.keo) {
      if (!c.di) return;
      const q = K.keo, k = K.ke[q.i], dx = (tay[0] - q.x0) / K.s, dy = (tay[1] - q.y0) / K.s;
      if (!k) return;
      if (q.kieu === 'ca') {      // dời cả đoạn: kẹp ĐỘ DỜI (không kẹp từng đầu — đoạn chạm mép ảnh mà co lại thì số ghi trên nó sai)
        const ds = [q.a0, q.b0].filter(Boolean), kx = v => Math.min(Math.max(v, -Math.min(...ds.map(z => z[0]))), K.a.w - Math.max(...ds.map(z => z[0]))), ky = v => Math.min(Math.max(v, -Math.min(...ds.map(z => z[1]))), K.a.h - Math.max(...ds.map(z => z[1])));
        const mx = kx(dx), my = ky(dy); k.a = [q.a0[0] + mx, q.a0[1] + my]; if (q.b0) k.b = [q.b0[0] + mx, q.b0[1] + my]; K.dinh = null;
      }
      else k[q.kieu] = datDinh(kepK([q[q.kieu + '0'][0] + dx, q[q.kieu + '0'][1] + dy]), q.kieu === 'a' ? k.b : k.a, q.i);
      q.di = true; veKeCanvas(); kinh(q.kieu === 'ca' ? tay : raMan(k[q.kieu]), tay); return;
    }
    if (!K.dang) return;
    const d = diemTay(tay[0], tay[1], c.loai);
    if (c.di && K.che !== 'chu') {
      if (!K.dang.a) { const d0 = diemTay(K.dang.x0, K.dang.y0, c.loai); K.dang.a = datDinh(kepK(vaoAnh(d0[0], d0[1])), null, -1); }
      K.dang.b = datDinh(kepK(vaoAnh(d[0], d[1])), K.dang.a, -1);
      veKeCanvas(); kinh(raMan(K.dang.b), tay);
    } else kinh(d, tay);
  }
  function huyKeo() { if (K.keo && K.keo.di) { K.ke = JSON.parse(K.keo.truoc.ke); } K.keo = null; }
  function keLen(e) {
    if (!K.ptr.has(e.pointerId)) return;
    K.ptr.delete(e.pointerId);
    if (K.pinch) { if (K.ptr.size < 2) { K.pinch = null; K.sauPinch = K.ptr.size > 0; } return; }
    if (K.sauPinch) { if (!K.ptr.size) K.sauPinch = false; return; }
    const c = K.cham; if (!c || c.id !== e.pointerId) return;
    K.cham = null; kinh(null); K.dinh = null;
    if (e.type === 'pointercancel') { huyKeo(); K.dang = null; veKeCanvas(); return; }
    if (K.keo) { const q = K.keo; K.keo = null; if (q.di) { ghiBuoc(q.truoc); xongNet(); return; } }
    const d = K.dang; K.dang = null;
    if (d && d.a && d.b && c.di && xa(d.a, d.b) * K.s >= DOAN_MIN) {
      if (K.che === 'chi') { veKeCanvas(); hoiChu('Ghi chú (để trống = chỉ mũi tên)', '', t => { ghiBuoc(); K.ke.push({ loai: 'chi', a: d.a, b: d.b, text: t || '' }); K.sel = -1; xongNet(); }, true); return; }
      ghiBuoc(); K.ke.push({ loai: 'kt', a: d.a, b: d.b }); K.sel = K.ke.length - 1; xongNet(); moSo(K.sel, goiYLien(K.sel)); return;
    }
    if (c.di && !(d && Math.hypot(e.clientX - c.x, e.clientY - c.y) < DOAN_MIN)) { veKeCanvas(); return; }
    chamMot([c.x, c.y]);      // ngón run (đi < DOAN_MIN px): vẫn là một lần chạm
  }
  /** Một lần chạm (không kéo): nhãn → sửa số / chữ; đoạn → chọn; chỗ trống → bỏ chọn (chạm hai lần: vừa khung) hoặc đặt chữ. */
  function chamMot(tay) {
    const n = trungNhan(tay);
    if (n >= 0) { K.sel = n; K.chamTruoc = null; veKeCanvas(); veDsNet(); capNut(); suaNhan(n); return; }
    const dn = trungDoan(tay);
    if (dn >= 0) { K.sel = dn; K.chamTruoc = null; veKeCanvas(); veDsNet(); capNut(); return; }
    const truoc = K.chamTruoc, bay = Date.now(); K.chamTruoc = { x: tay[0], y: tay[1], t: bay };
    if (truoc && bay - truoc.t < 400 && Math.hypot(tay[0] - truoc.x, tay[1] - truoc.y) < 40) { K.chamTruoc = null; K.sel = -1; khopKe(true); veKeCanvas(); veDsNet(); capNut(); return; }
    if (K.che === 'chu' || K.che === 'chi') { const p = kepK(vaoAnh(tay[0], tay[1])); hoiChu('Chữ đặt lên ảnh', '', t => { if (t) { ghiBuoc(); K.ke.push({ loai: 'chu', a: p, text: t }); K.sel = -1; } xongNet(); }); return; }
    if (K.sel >= 0) { K.sel = -1; veKeCanvas(); veDsNet(); capNut(); }
  }
  function suaNhan(i) {
    const k = K.ke[i]; if (!k) return;
    if (k.loai === 'kt') return moSo(i);
    hoiChu(k.loai === 'chu' ? 'Sửa chữ (để trống = bỏ chữ)' : 'Sửa ghi chú (để trống = chỉ mũi tên)', k.text || '', t => {
      if ((t || '') !== (k.text || '')) { ghiBuoc(); if (k.loai === 'chu' && !t) { K.ke.splice(i, 1); K.sel = -1; } else k.text = t || ''; }
      xongNet();
    }, true);
  }
  function kinh(diem, tay) {      // kính lúp 3×, chữ thập ở điểm đang đặt, đứng ở góc xa ngón tay
    const k = K.kinh; if (!k) return;
    if (!diem) { k.style.display = 'none'; return; }
    const r = K.cv.getBoundingClientRect(), d = K.dpr, x = k.getContext('2d'), W = k.width, n = W / PHONG_KINH / 2;
    const trai = tay[0] - r.left >= r.width / 2, tren = tay[1] - r.top >= r.height / 2;
    k.style.left = (trai ? 8 : Math.max(8, r.width - KINH - 8)) + 'px'; k.style.top = (tren ? 8 : Math.max(8, r.height - KINH - 8)) + 'px';
    k.dataset.goc = (tren ? 'tren' : 'duoi') + '-' + (trai ? 'trai' : 'phai');
    k.style.display = 'block'; x.fillStyle = '#000'; x.fillRect(0, 0, W, W);
    x.drawImage(K.cv, (diem[0] - r.left) * d - n, (diem[1] - r.top) * d - n, 2 * n, 2 * n, 0, 0, W, W);
    const c = W / 2, h = 6 * d, L = 22 * d;
    for (const [mau, day] of [['#000', 4 * d], ['#fff', 1.6 * d]]) { x.strokeStyle = mau; x.lineWidth = day; x.beginPath(); x.moveTo(c - L, c); x.lineTo(c - h, c); x.moveTo(c + h, c); x.lineTo(c + L, c); x.moveTo(c, c - L); x.lineTo(c, c - h); x.moveTo(c, c + h); x.lineTo(c, c + L); x.stroke(); }
  }
  /* --- ô số trên nhãn (1.1) --- */
  /**
   * Mở ô số của đoạn i. goiY = ô của phòng gợi ý sẵn (1.2: đoạn ngang đầu tiên trên ảnh tường A → "Dài tường A") — chỉ là chip bật sẵn;
   * số chỉ vào phòng khi thợ gõ số rồi Enter / ✓ (Esc: không gắn gì).
   */
  function moSo(i, goiY) {
    const k = K.ke[i]; if (!k || k.loai !== 'kt') return;
    K.o = i; K.sel = i; K.oCho = null; K.baoM = ''; K.oLien = k.lien || goiY || ''; K.oGoiY = !k.lien && goiY ? goiY : '';
    let el = $('[data-ui="o-so"]', lop);
    if (!el) { el = document.createElement('div'); el.className = 'o-so'; el.dataset.ui = 'o-so'; $('[data-ui="ke-vung"]', lop).appendChild(el); }
    el.innerHTML = '';
    veKeCanvas(); veO(soHien(k)); datO(); veDsNet(); capNut(); capBanPhim();
    const o = $('[data-ui="o-so-nhap"]', el); if (o) { o.focus(); o.select(); }
  }
  /** Dựng nội dung ô số từ trạng thái (giữ chữ đang gõ + con trỏ): chip ô của phòng, số ước, câu hỏi "khác số cũ". */
  function veO(gt) {
    const el = $('[data-ui="o-so"]', lop), k = K.o !== null ? K.ke[K.o] : null; if (!el || !k) return;
    const cu = $('[data-ui="o-so-nhap"]', el), dangGo = cu && document.activeElement === cu, val = gt !== undefined ? gt : cu ? cu.value : soHien(k);
    const loiCu = ($('[data-ui="o-so-loi"]', el) || {}).textContent || '', p = S.rec.phong, laC = !!S.rec.la_cua;
    const A = laC ? null : phanTich(S.rec), tuongs = laC ? [] : Number.isInteger(K.a.tuong) && p.tuong[K.a.tuong] ? [K.a.tuong] : p.tuong.map((t, j) => j);
    const ds = laC ? dsLienCua(S.rec.cua) : []; for (const j of tuongs) for (const s of G.soCuaTuong(p, j, Ph, A.gui.phong)) ds.push(s);
    const nhanChip = s => { if (laC) return `${s.nhan} ${s.gia === null ? '(chưa có)' : g(s.gia)}`; const m = /^tuong:(\d+):cao$/.exec(s.lien), t = m && p.tuong[+m[1]]; if (t && !(t.cao > 0)) return `Cao trần ${s.gia === null ? '(chưa có)' : S.rec.cao_san ? g(s.gia) + ' (điền sẵn)' : g(s.gia)}`; return `${s.nhan} ${s.gia === null ? '(chưa có)' : g(s.gia)}`; };
    const uoc = !soHien(k) && K.uoc ? K.uoc.m.get(k) : 0, c = K.oCho, tenC = c ? tenLien(c.lien, S.rec, A) : '';
    el.innerHTML = `<div class="o-so-hang"><input data-ui="o-so-nhap" inputmode="decimal" enterkeyhint="done" autocomplete="off" aria-label="Số đo của đoạn (mm)" placeholder="${uoc ? esc('≈' + nghin(uoc) + ' (ước)') : 'gõ số mm'}" value="${esc(val)}"${loiCu ? ' aria-invalid="true"' : ''}><span class="dv">mm</span><button class="chinh" data-act="so-xong" aria-label="Xong số">✓</button></div>
<div class="loi-o" data-ui="o-so-loi">${esc(loiCu)}</div>
${c ? `<div class="msg vang o-so-lech" data-ui="o-so-lech">${esc(tenC)} đang là ${esc(nghin(c.o))}, số trên ảnh ${esc(nghin(c.v))} — khác ${esc(nghin(Math.abs(c.o - c.v)))} mm.<div class="hang"><button data-act="so-dung-anh">Dùng số ảnh</button><button data-act="so-giu-cu">Giữ số cũ</button></div><div class="hang"><button data-act="so-khong-gan">Không phải ${esc(tenC)}</button></div></div>` : ''}
${uoc ? `<div class="o-so-uoc"><small>Số ƯỚC theo đoạn đã có số (chỉ đúng với ảnh chụp thẳng) — chỉ ghi lên ảnh, KHÔNG vào số của phòng:</small><button data-act="so-dung-uoc" data-v="${uoc}">Ghi số ước ≈${esc(nghin(uoc))} lên ảnh</button></div>` : ''}
${ds.length ? `<div class="o-so-lien"><small>${K.oGoiY && K.oLien === K.oGoiY ? `Gợi ý: đoạn ngang đầu tiên = ${esc(tenLien(K.oGoiY, S.rec, A))} (vào phòng khi bấm ✓ / Enter) — sai thì chạm ô khác bên dưới.` : (laC ? `Đoạn này là số nào của ${esc(S.rec.cua.ky_hieu)}? (sửa số ở thẻ thì ảnh đổi theo)` : 'Đoạn này là số nào của phòng? (sửa số phòng thì ảnh đổi theo)')}</small><div>${ds.map(s => `<button class="chip" data-act="chon-lien" data-lien="${esc(s.lien)}" aria-pressed="${K.oLien === s.lien}">${esc(nhanChip(s))}</button>`).join('')}<button class="chip" data-act="chon-lien" data-lien="" aria-pressed="${K.oLien === ''}">Không gắn</button></div></div>` : ''}`;
    if (dangGo) { const o = $('[data-ui="o-so-nhap"]', el); if (o) { o.focus(); const n = o.value.length; try { o.setSelectionRange(n, n); } catch (e) { /* bỏ qua */ } } }
  }
  /**
   * Gợi ý ô của phòng cho đoạn mới (1.2): ảnh của tường X, đoạn gần ngang (± 20°), chưa đoạn nào của ảnh gắn "Dài tường X", các đoạn ngang trước đó đã gắn ô khác,
   * và chưa ảnh KHÁC nào của tường X gắn "Dài tường X" (ảnh thứ hai của cùng tường thường chụp cửa / chi tiết — gợi ý lại là sai).
   */
  function goiYLien(i) {
    if (S.rec.la_cua) return '';
    const t = K.a.tuong, k = K.ke[i]; if (!Number.isInteger(t) || !S.rec.phong.tuong[t] || !k || !k.b) return '';
    const ngang = q => q.loai === 'kt' && q.a && q.b && Math.abs(q.b[1] - q.a[1]) <= Math.abs(q.b[0] - q.a[0]) * Math.tan(20 * Math.PI / 180);
    const L = `tuong:${t}:dai`;
    if (!ngang(k) || K.ke.some((q, j) => j !== i && q.loai === 'kt' && (q.lien === L || (j < i && ngang(q) && !q.lien)))) return '';
    if (S.rec.anh.some(a => a !== K.a && (a.ke || []).some(q => q && q.lien === L))) return '';
    return L;
  }

  function datO() {      // ô số đứng ngay trên / dưới nhãn giữa đoạn, không ra ngoài khung
    const el = $('[data-ui="o-so"]', lop), k = K.o !== null ? K.ke[K.o] : null; if (!el || !k || !K.cv) return;
    const vung = el.parentNode.getBoundingClientRect(), n = nhanCua(k, K.cv.getContext('2d')); if (!n) return;
    const p = raMan([n.x, n.y]), w = Math.min(vung.width - 16, 340); el.style.width = w + 'px';
    const h = el.offsetHeight, lx = p[0] - vung.left, ly = p[1] - vung.top, cao = n.cao * K.s / 2 + 10;
    el.style.left = Math.min(Math.max(lx - w / 2, 8), vung.width - w - 8) + 'px';
    let top = ly > vung.height / 2 ? ly - cao - h : ly + cao; top = Math.min(Math.max(top, 4), Math.max(4, vung.height - h - 4)); el.style.top = top + 'px';
  }
  /** Đóng ô số. Đoạn vừa kẻ / vừa sửa thôi được chọn: lần kéo sau là kẻ đoạn mới (bắt dính đầu đoạn cũ), không nắm núm đoạn cũ. */
  function dongSo() {
    const el = $('[data-ui="o-so"]', lop); if (el) el.remove();
    const k = K.o !== null ? K.ke[K.o] : null; if (k && k.nhap !== undefined) { delete k.nhap; ghiNet(); }
    if (K.o !== null) K.sel = -1; K.o = null; K.oCho = null; capBanPhim();
  }
  /**
   * Ghi số trong ô vào đoạn (một bước ↶). opt:
   *   ngam — ghi NGẦM (chạm ảnh, đổi công cụ, Xong, Chụp tiếp, Ảnh kế, rời màn): chip gợi ý bật sẵn KHÔNG tính — số chỉ vào phòng khi bấm ✓ / Enter / chạm chip;
   *   roi  — câu "khác số cũ" chưa trả lời (hoặc sắp hỏi): đoạn giữ số ảnh, ô của phòng giữ số cũ (k.lech → dòng vàng ở phòng), không hỏi;
   *   bo   — số gõ sai thì bỏ (rời hẳn màn kẻ); không thì báo đỏ ở ô, giữ ô.
   * @returns đã đóng ô chưa
   */
  function ketSo(opt = {}) {
    const lien = K.oCho ? K.oCho.lien : opt.ngam && K.oGoiY && K.oLien === K.oGoiY ? '' : (K.oLien || '');
    return chotSo(lien, opt);
  }
  const NGAM = { ngam: true, roi: true }, ROI = { ngam: true, roi: true, bo: true };
  /** Đọc ô của phòng mà đoạn sắp ghi vào (để trả lại khi đoạn thôi gắn ô đó). */
  function chupO(lien) {
    if (S.rec.la_cua) { const v = layD(S.rec.cua, String(lien || '')); return v === undefined ? null : { lien, v }; }
    const r = S.rec, p = r.phong, m = LIEN_RE.exec(String(lien || '')); if (!m) return null;
    if (m[1] === 'tuong') { const t = p.tuong[+m[2]]; if (!t) return null; if (m[3] === 'dai') return { lien, v: t.dai, dc: t.dai_cu }; if (t.cao > 0) return { lien, tc: t.cao }; return { lien, pc: p.cao, cs: !!r.cao_san }; }
    const x = (p[m[1]] || []).find(q => q && q.id === m[2]); if (!x) return null;
    return { lien, v: x[m[3]] === undefined ? null : x[m[3]] };
  }
  function traO(c) {
    if (S.rec.la_cua) { if (c && c.lien) datD(S.rec.cua, c.lien, c.v === undefined ? null : c.v); K.lv = null; return; }
    const r = S.rec, p = r.phong, m = LIEN_RE.exec(String(c && c.lien || '')); if (!m) return;
    if (m[1] === 'tuong') {
      const t = p.tuong[+m[2]]; if (!t) return;
      if (m[3] === 'dai') { t.dai = c.v > 0 ? c.v : 0; if (c.dc !== undefined) t.dai_cu = c.dc; }
      else if (c.tc !== undefined) t.cao = c.tc; else { p.cao = c.pc; if (c.cs) r.cao_san = true; else delete r.cao_san; }
    } else { const x = (p[m[1]] || []).find(q => q && q.id === m[2]); if (x) x[m[3]] = c.v; }
    K.lv = null;
  }
  /**
   * Đoạn thôi gắn ô `k.lien` (đổi chip / Không gắn / số ước): ô của phòng còn đúng số đoạn này đã ghi thì trả lại số trước khi gắn (k.truoc) —
   * không để "Dài tường A = 830" (bề ngang cửa gắn nhầm) nằm lại trong phòng.
   */
  function thoiGan(k, lienMoi) {
    if (!k.lien || k.lien === lienMoi) return;
    const c = k.truoc, o = giaTriTho(k.lien);
    if (c && c.lien === k.lien && o !== null && typeof k.so === 'number' && Math.abs(o - k.so) < 0.5) traO(c);
    delete k.truoc; delete k.lech;
  }
  /** Ghi số v vào đoạn k (gắn lienMoi, '' = không gắn). */
  function ghiDoan(k, lienMoi, v, nguon) {
    thoiGan(k, lienMoi);
    if (lienMoi) k.lien = lienMoi; else { delete k.lien; delete k.truoc; }
    k.so = v; k.text = (nguon === 'uoc' ? '≈' : '') + chuGo(v); k.nguon = nguon; delete k.lech;
  }
  /**
   * Ghi số trong ô vào đoạn, gắn đoạn với ô `lienMoi` của phòng ('' = không gắn) — MỘT bước ↶.
   * Ô của phòng đã có số khác (> 10 mm) mà đoạn chưa gắn ô đó → hỏi "Dùng số ảnh / Giữ số cũ / Không phải …", không ghi đè lặng lẽ;
   * opt.roi: không hỏi — đoạn giữ số ảnh (k.lech), ô của phòng giữ số cũ → dòng vàng ở phòng. opt: xem ketSo + { chip (bấm chip) } — @returns đã đóng ô chưa
   */
  function chotSo(lienMoi, opt = {}) {
    if (K.o === null) return true;
    const k = K.ke[K.o], inp = $('[data-ui="o-so-nhap"]', lop);
    if (!k || !inp) { dongSo(); return true; }
    delete k.nhap;      // số gõ dở: ghi thật ngay dưới đây (hoặc bỏ) — không vào ảnh chụp ↶
    const cu = soHien(k), lienCu = k.lien || '';
    let raw = inp.value.trim();
    const dong = () => { K.oCho = null; dongSo(); xongNet(); return true; };
    if (raw === cu && lienMoi === lienCu && !(K.oCho && opt.roi)) { dongSo(); veKeCanvas(); return true; }
    const loi = t => {
      if (opt.bo) { dongSo(); veKeCanvas(); return true; }
      inp.setAttribute('aria-invalid', 'true'); const l = $('[data-ui="o-so-loi"]', lop); if (l) l.textContent = t;
      inp.focus(); return false;
    };
    // số ước để nguyên trong ô ("≈1 350") → giữ là số ước; thợ sửa số thì là số đo
    const giuUoc = laUoc(k) && raw === cu;
    raw = raw.replace(/^≈\s*/, '');
    if (!raw) {
      if (!opt.chip) { if (!cu) { dongSo(); veKeCanvas(); return true; } ghiBuoc(); thoiGan(k, ''); for (const x of ['so', 'text', 'nguon', 'lien', 'lech', 'truoc']) delete k[x]; return dong(); }
      // ô trống + bấm chip: CHỈ gắn (nhãn hiện số của phòng theo ô đó) — không chép số máy suy / trần điền sẵn vào đoạn như thể đã đo
      ghiBuoc(); thoiGan(k, lienMoi);
      for (const x of ['so', 'text', 'nguon', 'lech']) delete k[x];
      if (lienMoi) k.lien = lienMoi; else { delete k.lien; delete k.truoc; }
      return dong();
    }
    const d = docO(raw);
    if (d.sai || !(d.v > 0)) return loi((d.sai || 'số phải lớn hơn 0') + ' — chữ thì dùng ↗ Ghi chú.');
    const moiGo = raw !== cu.replace(/^≈\s*/, '') || (giuUoc ? false : laUoc(k)); let v = d.v;
    if (moiGo && v < SOAT.tuong_min && (/^tuong:\d+:(dai|cao)$/.test(lienMoi) || !Number.isInteger(v))) {      // "3,6" / "2,65" = mét
      const mm = G.rn(v * 1000, 1); K.baoM = `Đã đổi ${chuGo(v)} m thành ${nghin(mm)} mm${lienMoi ? ` (${tenLien(lienMoi)})` : ''}.`; v = mm;
    }
    if (/^tuong:\d+:dai$/.test(lienMoi) && v > SOAT.tuong_max) return loi(`Tường dài ${nghin(v)} mm — quá ${nghin(SOAT.tuong_max)}, kiểm tra lại số (gõ mm).`);
    if (giuUoc) { ghiBuoc(); ghiDoan(k, '', v, 'uoc'); return dong(); }
    const nguon = opt.nguon || 'go';
    if (!lienMoi) { ghiBuoc(); ghiDoan(k, '', v, nguon); return dong(); }
    const o = giaTriTho(lienMoi), dongBo = lienCu === lienMoi && !k.lech;      // đoạn đã gắn (nhãn đang hiện số của phòng): sửa nhãn = sửa số phòng
    if (o !== null && Math.abs(o - v) > SOAT.anh_lech && !dongBo) {
      if (opt.roi) { ghiBuoc(); ghiDoan(k, lienMoi, v, nguon); k.lech = true; return dong(); }
      K.oLien = lienMoi; K.oCho = { lien: lienMoi, v, o, nguon }; veO(); datO(); return false;
    }
    ghiBuoc(); ghiDoan(k, lienMoi, v, nguon); ghiLien(lienMoi, v, k);
    return dong();
  }
  /** Trả lời câu hỏi "khác số cũ" của ô số: 'anh' Dùng số ảnh · 'cu' Giữ số cũ (đoạn theo số của phòng) · 'khong' đoạn không phải ô đó (giữ số vừa gõ, không gắn). */
  function traLech(cach) {
    const c = K.oCho, k = K.o !== null ? K.ke[K.o] : null; if (!c || !k) return;
    ghiBuoc();
    if (cach === 'anh') { ghiDoan(k, c.lien, c.v, c.nguon); ghiLien(c.lien, c.v, k); }
    else if (cach === 'cu') { ghiDoan(k, c.lien, c.o, 'go'); }
    else ghiDoan(k, '', c.v, c.nguon);
    K.oCho = null; dongSo(); xongNet();
  }
  /** Đoạn liên kết: số gõ trên ảnh ghi vào đúng ô số của phòng (Dài tường, Rộng cửa…). k: đoạn ghi — nhớ số trước khi gắn (k.truoc) để thôi gắn thì trả lại. */
  function ghiLien(lien, v, k) {
    if (S.rec.la_cua) { if (!C.lienCua(S.rec.cua.nhom).has(lien)) return; if (k && !(k.truoc && k.truoc.lien === lien)) { const c = chupO(lien); if (c) k.truoc = c; } datD(S.rec.cua, lien, v); K.lv = null; return; }
    const m = LIEN_RE.exec(String(lien || '')), p = S.rec.phong; if (!m) return;
    if (k && !(k.truoc && k.truoc.lien === lien)) { const c = chupO(lien); if (c) k.truoc = c; }
    if (m[1] === 'tuong') { const t = p.tuong[+m[2]]; if (!t) return; if (m[3] === 'dai') { t.dai = v; delete t.dai_cu; } else if (m[3] === 'cao') { if (t.cao > 0) t.cao = v; else { p.cao = v; delete S.rec.cao_san; } } }
    else { const x = (p[m[1]] || []).find(q => q && q.id === m[2]); if (x) x[m[3]] = v; }
    K.lv = null;
  }
  /** Mỗi nét thêm / bỏ ghi NGAY vào phòng (rồi IndexedDB sau 800 ms): đóng màn kẻ kiểu gì (Quay lại, hết phiên, tải lại) cũng không mất nét. */
  function ghiNet() { if (!K.a || !S.rec) return; K.a.ke = JSON.parse(JSON.stringify(K.ke)); doi(); }
  function xongNet() { dongTamTren(); K.lv = null; if (K.cv) veKeCanvas(); veDsNet(); capNut(); ghiNet(); }
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
  /** Giữ ghi chú ảnh + số đang gõ (trước khi rời / sang ảnh khác). */
  function giuKe(opt) { if (!ketSo(opt)) return false; const gh = $('[data-ui="ghi-anh"]', lop); if (gh) K.a.ghi = gh.value.slice(0, 200); return true; }
  /** Dòng vàng "số ảnh khác số thẻ tường": Dùng số ảnh (ghi vào ô của phòng) / Giữ số cũ (đoạn theo số của phòng). */
  function lechAnh(b, dungAnh) {
    const a = S.rec && S.rec.anh.find(x => x.id === b.dataset.id), k = a && (a.ke || [])[+b.dataset.k]; if (!k || !k.lien) return;
    if (dungAnh) { ghiLien(k.lien, k.so, k); delete k.lech; }
    else { const o = giaTriTho(k.lien); if (o === null) return; k.so = o; k.text = chuGo(o); delete k.lech; }
    doi(); if (S.rec.la_cua) { veCuaThan(); return; } veTuongs(); capPhanTich(); veAnhs();
  }
  function luuKe() {
    giuKe(ROI);
    K.a.ke = K.ke; K.cv = null; doi(); luuNgay(); dongTam();
    if (S.rec.la_cua) { veCuaThan(); return; }
    veTuongs(); veAnhs(); capPhanTich();
  }

  /* ================= CỬA & VÁCH KÍNH (0.3.0) =================
   * Danh sách RIÊNG của công trình (đặt hàng / sản xuất), thợ tự thêm tay — KHÔNG gắn với lỗ cửa trong phòng, KHÔNG vào gói của máy vẽ.
   * Ba nhóm: cửa gỗ thông phòng (go), cửa nhôm – cửa sổ nhôm (nhom, khối riêng `nhom_ct`), vách kính tắm (kinh, đo theo từng mặt).
   * Dạng dữ liệu, phép soát, số đặt hàng (số NHỎ NHẤT của 3 điểm) và cảnh báo: lib/cua.js (C = window.MNDOCua) — cùng một phép tính với máy chủ.
   * Bản ghi trong máy (kho 'cua'): { id, ct, la_cua: true, cua, anh, rev, dem, tao_may, anh_co, sua_luc, xoa_duoc, xung_dot?, loi_gui? }.
   * Đường tới một ô số: chuỗi `lien` của lib/cua.js ('rong.0', 'go.cot_san', 'kinh.mat.1.rong.2') — ô nhập mang data-c = đường đó, đoạn trên ảnh gắn đúng chuỗi đó.
   */
  const layD = (o, d) => String(d).split('.').reduce((x, k) => (x === null || x === undefined ? undefined : x[k]), o);
  function datD(o, d, v) {
    const ks = String(d).split('.'); let x = o;
    for (let i = 0; i < ks.length - 1; i++) { const k = ks[i]; if (x[k] === null || x[k] === undefined || typeof x[k] !== 'object') x[k] = /^\d+$/.test(ks[i + 1]) ? [] : {}; x = x[k]; }
    x[ks[ks.length - 1]] = v;
  }
  // trần riêng của vài ô (lib/cua.js soát: cốt sàn / tường nghiêng ≤ 1000, kính ≤ 100) — gõ quá thì đỏ ở ô, gửi đi là ô trống (máy chủ từ chối CẢ mục vì một ô)
  const CUA_MAX = { 'go.cot_san': 1000, 'kinh.nghieng.trai': 1000, 'kinh.nghieng.phai': 1000, 'nhom_ct.kinh_day': 100, 'kinh.kinh_day': 100 };
  const CUA_CHU = { ky_hieu: 12, vi_tri: 80, chat_lieu: 80, mau: 60, phu_kien: 200, ghi_chu: 500, 'go.kieu_khac': 40, 'nhom_ct.he': 40, 'nhom_ct.tang_ghi': 80, 'kinh.doc': 80, 'kinh.vat': 300 };
  const KY_RE = /^[\p{L}\p{N} ._/#-]{1,12}$/u;
  const NHOM_ICON = { go: '🚪', nhom: '🪟', kinh: '🚿' };
  const NHOM_GIAI = { go: 'cửa phòng ngủ, WC, cửa chính gỗ — khuôn, ốp chỉ', nhom: 'cửa đi / cửa sổ / vách nhôm kính (Xingfa, PMI…)', kinh: 'vách tắm thẳng / góc L / chữ U / cửa lùa' };
  const MAT_CAN = { thang: 1, goc_l: 2, chu_u: 3, lua: 1 };
  function cuaMoi(nhom, ky) {
    const c = { nhom, ky_hieu: ky, vi_tri: '', so_luong: 1, rong: [null, null, null], cao: [null, null, null], cheo: [null, null], chat_lieu: '', mau: '', phu_kien: '', ghi_chu: '', xong: false };
    if (nhom === 'go') c.go = { day_tuong: [null, null], san: null, cot_san: null, kieu: null, kieu_khac: '', ban_le: null, mo: null, lua: null, op_chi: null };
    else if (nhom === 'nhom') c.nhom_ct = { loai: null, be: null, day_tuong: [null, null], lap: null, he: '', kieu_mo: null, so_canh: null, ban_le: null, mo: null, kinh_day: null, kinh_loai: null, fix: null, fix_tren: null, fix_duoi: null, tang_cao: false, tang_ghi: '' };
    else c.kinh = { dang: null, mat: [{ rong: [null, null, null], cao: [null, null, null] }], nghieng: { trai: null, phai: null }, bac: { co: null, cao: null, rong: null }, doc: '', cua: { kieu: null, rong: null, mo: null, ban_le_ben: null, ban_le: null }, kinh_day: 10, kinh_loai: null, pk_mau: null, vat: '' };
    return c;
  }
  async function kyMoi(ct, nhom) {
    const dau = C.KY_DAU[nhom], re = new RegExp('^' + dau + '(\\d+)$', 'i'); let n = 0;
    for (const x of await DB.all('cua')) if (x.ct === ct && x.cua.nhom === nhom) { const m = re.exec(x.cua.ky_hieu || ''); if (m) n = Math.max(n, +m[1]); }
    return dau + (n + 1);
  }
  const TEN_DIEM = { rong: ['trên', 'giữa', 'dưới'], cao: ['trái', 'giữa', 'phải'] };
  const TEN_LIEN = { 'go.cot_san': 'Cốt sàn hoàn thiện', 'nhom_ct.be': 'Bệ', 'nhom_ct.fix_tren': 'Cao ô fix trên', 'nhom_ct.fix_duoi': 'Cao ô fix dưới', 'nhom_ct.kinh_day': 'Kính dày',
    'kinh.nghieng.trai': 'Tường trái nghiêng', 'kinh.nghieng.phai': 'Tường phải nghiêng', 'kinh.bac.cao': 'Gờ cao', 'kinh.bac.rong': 'Gờ rộng', 'kinh.cua.rong': 'Cánh cửa rộng', 'kinh.kinh_day': 'Kính dày' };
  /** "Rộng dưới", "Mặt 2 cao trái", "Dày tường 1"… */
  function tenCuaLien(l) {
    const p = String(l || '').split('.');
    if ((p[0] === 'rong' || p[0] === 'cao') && p.length === 2) return `${p[0] === 'rong' ? 'Rộng' : 'Cao'} ${TEN_DIEM[p[0]][+p[1]] || ''}`;
    if (p[0] === 'cheo') return `Chéo ${+p[1] + 1}`;
    if (p[1] === 'day_tuong') return `Dày tường ${+p[2] + 1}`;
    if (TEN_LIEN[l]) return TEN_LIEN[l];
    if (p[0] === 'kinh' && p[1] === 'mat') return `Mặt ${+p[2] + 1} ${p[3] === 'rong' ? 'rộng' : 'cao'} ${(TEN_DIEM[p[3]] || [])[+p[4]] || ''}`;
    return '';
  }
  /** Chip "đoạn này là số nào" trên màn kẻ: các ô số ĐANG HIỆN của mục (theo nhóm + lựa chọn), giá trị hiện tại. */
  function dsLienCua(c) {
    const ds = [], them = l => ds.push({ lien: l, nhan: tenCuaLien(l), gia: giaTriTho(l, { la_cua: true, cua: c }) });
    if (c.nhom === 'kinh') {
      const K2 = c.kinh || {};
      ((K2.mat) || []).forEach((m, i) => { for (const a of ['rong', 'cao']) for (let j = 0; j < 3; j++) them(`kinh.mat.${i}.${a}.${j}`); });
      them('kinh.nghieng.trai'); them('kinh.nghieng.phai');
      if (K2.bac && K2.bac.co) { them('kinh.bac.cao'); them('kinh.bac.rong'); }
      if (K2.cua && K2.cua.kieu && K2.cua.kieu !== 'khong') them('kinh.cua.rong');
      return ds;
    }
    for (const a of ['rong', 'cao']) for (let j = 0; j < 3; j++) them(`${a}.${j}`);
    them('cheo.0'); them('cheo.1');
    const kh = c.nhom === 'go' ? 'go' : 'nhom_ct', G2 = c[kh] || {};
    them(kh + '.day_tuong.0'); them(kh + '.day_tuong.1');
    if (c.nhom === 'go' && G2.san === 'chua_lat') them('go.cot_san');
    if (c.nhom === 'nhom') {
      if (G2.loai === 'cua_so') them('nhom_ct.be');
      if (G2.fix === 'tren' || G2.fix === 'ca_hai') them('nhom_ct.fix_tren');
      if (G2.fix === 'duoi' || G2.fix === 'ca_hai') them('nhom_ct.fix_duoi');
    }
    return ds;
  }
  /** "D1: rộng đặt 815 · cao đặt 2 150" (màn kẻ, thẻ danh sách). */
  function tomCua(c) {
    const t = C.tinh(c), so = x => (x ? nghin(x.min) : '?');
    if (c.nhom === 'kinh') { const m = t.mat || []; return `${c.ky_hieu}: ${m.length ? m.map((x, i) => `mặt ${i + 1} ${so(x.rong)} × ${so(x.cao)}`).join(' · ') : 'chưa có mặt'}`; }
    return `${c.ky_hieu}: rộng đặt ${so(t.rong)} × cao đặt ${typeof t.cao_dat === 'number' ? nghin(t.cao_dat) : so(t.cao)}`;
  }
  /** Bản gửi máy chủ: ô vượt trần riêng → ô trống (vẫn giữ + báo đỏ ở máy này). */
  function guiBanCua(c) { const x = JSON.parse(JSON.stringify(c)); for (const [d, m] of Object.entries(CUA_MAX)) { const v = layD(x, d); if (typeof v === 'number' && v > m) datD(x, d, null); } return x; }
  /** Gửi một mục cửa (PUT /api/cua/:id) — y như phòng: số bản, ghi đè, gửi lại theo `may`, 409 xung đột, công trình chưa lên → gửi công trình trước. */
  async function guiCua(j) {
    const nem = r => { const e = new Error('máy chủ ' + r.st); e.st = r.st; throw e; };
    const p = await DB.get('cua', j.id); if (!p) return 'xong';
    const dem = p.dem;
    const r = await api('PUT', '/api/cua/' + p.id, { ct: p.ct, rev: p.rev || 0, ghi_de: !!p.ghi_de, may: S.may || undefined, cua: guiBanCua(p.cua), anh: p.anh });
    if (r.st >= 500) nem(r); if (r.st === 401) return 'het_phien';
    let moi = await DB.get('cua', j.id);
    if (!moi) { if (r.ok) await DB.put('hang', { k: 'xoa_cua:' + p.id, loai: 'xoa_cua', id: p.id, th: 3, lan: 0, cho_den: 0, dung: '' }); return 'xong'; }      // thợ xoá trong lúc gửi
    if (r.ok) {
      moi = await DB.sua('cua', j.id, m => { m.rev = r.j.rev; m.ghi_de = false; m.anh_co = r.j.anh_co; m.sua_luc = r.j.sua_luc; delete m.xung_dot; delete m.loi_gui; return m; }) || moi;
      for (const id of r.j.can_gui || []) { const a = await DB.get('anh', id); if (a && a.blob) await DB.put('hang', { k: 'anh:' + id, loai: 'anh', id, cua: p.id, th: 2, lan: 0, cho_den: 0, dung: '' }); }
      if (S.rec && S.rec.id === moi.id) { S.rec.rev = moi.rev; S.rec.ghi_de = false; S.rec.anh_co = moi.anh_co; S.rec.sua_luc = moi.sua_luc; delete S.rec.loi_gui; }
      if (moi.dem !== dem) return 'giu';
      return 'xong';
    }
    if (r.st === 409 && r.j.hien_tai) { moi = await DB.sua('cua', j.id, m => { m.xung_dot = r.j.hien_tai; return m; }) || moi; await dungViec(j, 'xung_dot'); if (S.rec && S.rec.id === moi.id) { S.rec.xung_dot = moi.xung_dot; hoiXungDot(); } return 'dung'; }
    if (r.st === 422 && r.j.chi_tiet && r.j.chi_tiet.some(c => c.truong === 'ct' && /chưa có/.test(c.loi))) { const c = await DB.get('ct', p.ct); if (c) { await xepHang('ct', c.id); return 'giu'; } }
    const lg = r.st === 409 && r.j.xoa ? 'Mục này (hoặc công trình) đã bị xoá trên máy chủ ở máy khác.'
      : (r.j.error || 'Máy chủ không nhận') + (r.j.chi_tiet ? ': ' + r.j.chi_tiet.slice(0, 3).map(c => c.truong + ' ' + c.loi).join('; ') : '');
    await DB.sua('cua', j.id, m => { m.loi_gui = lg; return m; }); if (S.rec && S.rec.id === j.id) { S.rec.loi_gui = lg; capCua(); }
    await dungViec(j, lg); return 'dung';
  }
  /** Tải danh sách cửa của công trình từ máy chủ (máy khác đo) — bản trong máy còn chờ gửi / mới hơn thì giữ. */
  async function dongBoCua(id) {
    const r = await api('GET', `/api/cong-trinh/${id}/cua`);
    if (!r.ok) return;
    const hang = await hangCua(), tren = new Set();
    for (const s of r.j.cua) {
      tren.add(s.id);
      if (hang.xoa_cua.has(s.id)) continue;
      const cu = await DB.get('cua', s.id);
      if (cu && (cu.rev >= s.rev || hang.cua.has(s.id))) { if (cu.xoa_duoc !== s.xoa_duoc && !(S.rec && S.rec.id === cu.id)) { cu.xoa_duoc = s.xoa_duoc; await DB.put('cua', cu); } continue; }
      await DB.put('cua', { id: s.id, ct: s.ct, la_cua: true, cua: s.cua, anh: s.anh, rev: s.rev, dem: 0, anh_co: s.anh_co, sua_luc: s.sua_luc, xoa_duoc: s.xoa_duoc, tao_may: cu ? cu.tao_may : s.sua_luc });
    }
    for (const p of await DB.all('cua')) if (p.ct === id && p.rev && !tren.has(p.id) && !hang.cua.has(p.id)) await DB.del('cua', p.id);
    if (location.hash === '#/ct/' + id) await veDsCua(id);
  }
  const xepCua = (a, b) => C.NHOM.indexOf(a.cua.nhom) - C.NHOM.indexOf(b.cua.nhom) || String(a.cua.ky_hieu).localeCompare(String(b.cua.ky_hieu), 'vi', { numeric: true, sensitivity: 'base' });
  /** tinh + cảnh báo cấp danh sách (trùng ký hiệu) của mọi mục cửa một công trình. */
  function tinhDs(ds) {
    const trung = C.kiemDs(ds.map(x => ({ id: x.id, cua: x.cua })));
    return ds.map(x => { const t = C.tinh(x.cua), th = trung.get(x.id); if (th) { t.canh_bao = t.canh_bao.concat(th); if (t.muc === 'ok') t.muc = 'vang'; } return { id: x.id, cua: x.cua, tinh: t, rec: x }; });
  }
  async function veDsCua(id) {
    const el = $('[data-ui="ds-cua"]'); if (!el) return;
    const ds = (await DB.all('cua')).filter(x => x.ct === id).sort(xepCua), hang = await hangCua();
    if (!ds.length) { el.innerHTML = '<li class="nhat">Chưa có cửa nào — bấm “+ Thêm cửa / vách kính”.</li>'; return; }
    const T = tinhDs(ds); let nhomTruoc = '';
    el.innerHTML = T.map(({ cua: c, tinh: t, rec }) => {
      const dau = c.nhom !== nhomTruoc ? `<li class="ds-nhom" data-nhom="${c.nhom}">${NHOM_ICON[c.nhom]} ${esc(C.NHOM_TEN[c.nhom])}</li>` : ''; nhomTruoc = c.nhom;
      const nd = t.canh_bao.filter(x => x.muc === 'do').length, nv = t.canh_bao.filter(x => x.muc === 'vang').length;
      const tt = [c.xong ? '✓ đo xong' : 'đang đo', nd ? `<span class="loi-o">${nd} lỗi đỏ</span>` : '', nv ? `${nv} cần xem` : '', `${rec.anh.length} ảnh`].filter(Boolean).join(' · ');
      return `${dau}<li><button data-act="di" data-h="#/cua/${esc(rec.id)}" data-cua="${esc(rec.id)}" class="muc-${t.muc}"><b>${esc(c.ky_hieu)}${c.vi_tri ? ' · ' + esc(c.vi_tri) : ''}${c.so_luong > 1 ? ` <small>× ${c.so_luong}</small>` : ''}${hang.cua.has(rec.id) ? '<span class="cham" title="Còn thay đổi chưa gửi"></span>' : ''}</b><small>${esc(tomCua(c).replace(/^[^:]*: /, ''))}</small><small>${tt}</small></button></li>`;
    }).join('');
  }
  function moThemCua(ct) {
    moTam(`<h3>Thêm cửa / vách kính</h3><p class="nhat">Chọn loại — mỗi loại có phần đo riêng:</p>
${C.NHOM.map(n => `<p><button class="to nhom-chon" data-act="cua-nhom" data-ct="${esc(ct)}" data-nhom="${n}"><b>${NHOM_ICON[n]} ${esc(C.NHOM_TEN[n])}</b><small>${esc(NHOM_GIAI[n])}</small></button></p>`).join('')}
<p><button data-act="dong-tam">Thôi</button></p>`);
  }
  async function taoCua(ct, nhom) {
    const id = idMoi('cu'), rec = { id, ct, la_cua: true, cua: cuaMoi(nhom, await kyMoi(ct, nhom)), anh: [], rev: 0, dem: 1, tao_may: Date.now() };
    await DB.put('cua', rec); await xepHang('cua', id); dongTam();
    di('#/cua/' + id);
  }

  /* ----- màn một mục cửa ----- */
  async function veCua(id) {
    let rec = await DB.get('cua', id);
    if (!rec) { try { const d = await api('GET', '/api/cua/' + id); if (d.ok) { rec = { id, ct: d.j.ct, la_cua: true, cua: d.j.cua, anh: d.j.anh, rev: d.j.rev, dem: 0, anh_co: d.j.anh_co, sua_luc: d.j.sua_luc, xoa_duoc: d.j.xoa_duoc }; await DB.put('cua', rec); } } catch (e) { /* mất mạng */ } }
    if (!rec) { app.innerHTML = '<header class="dau"><button class="lui" data-act="di" data-h="#/">‹</button><h1>Không thấy mục cửa</h1></header>'; return; }
    if (!S.rec || S.rec.id !== id) { S.sai = {}; S.goC = {}; delete S.bao_m; delete S.bao_xong; }
    S.rec = rec;
    if (chotNhap(rec)) { rec.ban = true; henLuu(); }
    S.dsCua = (await DB.all('cua')).filter(x => x.ct === rec.ct && x.id !== id).map(x => ({ id: x.id, cua: x.cua }));
    app.innerHTML = `<header class="dau"><button class="lui" data-act="di" data-h="#/ct/${esc(rec.ct)}" aria-label="Về công trình">‹</button><h1 data-ui="ten-cua">${esc(rec.cua.ky_hieu)} · ${esc(C.NHOM_TEN[rec.cua.nhom])}</h1></header>
<div data-ui="tt"></div><div data-ui="cua-than"></div>
<input type="file" accept="image/*" capture="environment" class="an" data-ui="tep" multiple>`;
    veCuaThan();
    if (rec.xung_dot) hoiXungDot();
  }
  const vS = v => (v === null || v === undefined ? '' : String(v).replace('.', ','));
  function oSo(d, nhan, o = {}) {
    const sai = S.sai[d], v = sai && S.goC[d] !== undefined ? S.goC[d] : vS(layD(S.rec.cua, d));
    return `<label${o.lop ? ` class="${o.lop}"` : ''}>${esc(nhan)}${o.goi ? `<small>${esc(o.goi)}</small>` : ''}<input data-c="${d}" inputmode="${o.nguyen ? 'numeric' : 'decimal'}" enterkeyhint="next" autocomplete="off" value="${esc(v)}"${o.ph ? ` placeholder="${esc(o.ph)}"` : ''}${sai ? ' aria-invalid="true"' : ''} aria-label="${esc(o.aria || nhan)}"></label>`;
  }
  function oChu(d, nhan, o = {}) {
    const v = layD(S.rec.cua, d), sai = S.sai[d];
    if (o.dai) return `<label>${esc(nhan)}<textarea data-c="${d}" maxlength="${CUA_CHU[d]}"${o.ph ? ` placeholder="${esc(o.ph)}"` : ''}>${esc(v || '')}</textarea></label>`;
    return `<label>${esc(nhan)}${o.goi ? `<small>${esc(o.goi)}</small>` : ''}<input data-c="${d}" maxlength="${CUA_CHU[d]}" value="${esc(sai && S.goC[d] !== undefined ? S.goC[d] : v || '')}"${o.list ? ` list="${o.list}"` : ''}${o.ph ? ` placeholder="${esc(o.ph)}"` : ''}${sai ? ' aria-invalid="true"' : ''}></label>`;
  }
  /** Hàng chip chọn một: bấm lại chip đang chọn = bỏ chọn. t: 'so' | 'bool' (kiểu giá trị). */
  function chips(d, ds, t) {
    const cu = layD(S.rec.cua, d);
    return `<div class="chips">${ds.map(([v, nh]) => `<button type="button" class="chip" data-act="cua-chon" data-c="${d}" data-v="${esc(v)}"${t ? ` data-t="${t}"` : ''} aria-pressed="${cu !== null && cu !== undefined && String(cu) === String(v)}">${esc(nh)}</button>`).join('')}</div>`;
  }
  /** Ba điểm đo cạnh nhau + số đặt hàng (nhỏ nhất) hiện to. */
  function baDiem(d, ten, diem, min) {
    return `<fieldset class="ba" data-cb="${d}"><legend>${esc(ten)} <small>(mm, lọt lòng)</small></legend><div class="ba-o">${diem.map((nh, i) => oSo(`${d}.${i}`, nh, { aria: `${ten} ${nh.toLowerCase()}` })).join('')}</div>
<div class="ba-min" data-min="${min || d}"></div><div class="cb"></div></fieldset>`;
  }
  /** Hình mặt bằng nhỏ chiều mở (đứng NGOÀI = phía dưới hình, nhìn vào): tường xám, bản lề chấm, cánh + cung quét. */
  function hinhMo(ben, mo) {
    const hx = ben === 'trai' ? 17 : 47, ox = ben === 'trai' ? 47 : 17, ty = mo === 'vao' ? 10 : 70, sw = (ben === 'trai') === (mo === 'vao') ? 1 : 0;
    return `<svg viewBox="0 0 64 80" width="56" height="70" aria-hidden="true" class="hinh-mo"><rect x="0" y="0" width="64" height="40" class="trong"/><rect x="0" y="37" width="17" height="6" class="tuong-h"/><rect x="47" y="37" width="17" height="6" class="tuong-h"/>`
      + `<path d="M${hx} ${ty} A30 30 0 0 ${sw} ${ox} 40" class="cung"/><line x1="${hx}" y1="40" x2="${hx}" y2="${ty}" class="canh"/><circle cx="${hx}" cy="40" r="3.5" class="ban-le"/><path d="M32 79 l-4 -6 h8 z" class="mat"/></svg>`;
  }
  function hinhLua(ben) {
    const x0 = ben === 'trai' ? 4 : 30, ax = ben === 'trai' ? 12 : 52, bx = ben === 'trai' ? 34 : 30;
    return `<svg viewBox="0 0 64 80" width="56" height="70" aria-hidden="true" class="hinh-mo"><rect x="0" y="0" width="64" height="40" class="trong"/><rect x="0" y="37" width="17" height="6" class="tuong-h"/><rect x="47" y="37" width="17" height="6" class="tuong-h"/>`
      + `<rect x="${x0}" y="30" width="30" height="5" class="canh-lua"/><line x1="${bx}" y1="22" x2="${ax}" y2="22" class="canh"/><path d="M${ax} 22 l${ben === 'trai' ? 6 : -6} -5 v10 z" class="mui"/><path d="M32 79 l-4 -6 h8 z" class="mat"/></svg>`;
  }
  /** Chiều mở cửa quay: 4 ô bấm (bản lề trái / phải × mở vào / ra). kh = khối ('go', 'nhom_ct', 'kinh.cua'); khBen = khoá bên bản lề. */
  function chonMo(kh, khBen, moDs) {
    const G2 = layD(S.rec.cua, kh) || {};
    const o = [];
    for (const mo of moDs) for (const ben of ['trai', 'phai']) o.push(`<button type="button" class="mo-o" data-act="cua-mo" data-kh="${kh}" data-kben="${khBen}" data-ben="${ben}" data-mo="${mo}" aria-pressed="${G2[khBen] === ben && G2.mo === mo}" aria-label="Bản lề ${ben === 'trai' ? 'trái' : 'phải'}, mở ${mo}">${hinhMo(ben, mo)}<small>${ben === 'trai' ? 'Bản lề trái' : 'Bản lề phải'} · mở ${mo === 'vao' ? 'VÀO' : 'RA'}</small></button>`);
    return `<div class="mo-luoi">${o.join('')}</div><p class="nhat goi"><small>Hình nhìn từ trên xuống — bạn đứng NGOÀI (▲ phía dưới hình), nhìn vào.</small></p>`;
  }
  function chonLua(d) {
    const cu = layD(S.rec.cua, d);
    return `<div class="mo-luoi hai">${['trai', 'phai'].map(b => `<button type="button" class="mo-o" data-act="cua-chon" data-c="${d}" data-v="${b}" aria-pressed="${cu === b}" aria-label="Cánh chạy về bên ${b === 'trai' ? 'trái' : 'phải'}">${hinhLua(b)}<small>Lùa về ${b === 'trai' ? 'TRÁI' : 'PHẢI'}</small></button>`).join('')}</div><p class="nhat goi"><small>Đứng NGOÀI nhìn vào — cánh chạy về phía nào khi mở.</small></p>`;
  }
  const NHOM_DAY = { go: 'go', nhom: 'nhom_ct' };
  function thanGo() {
    const G2 = S.rec.cua.go || {}, quay = !G2.kieu || ['mot_canh', 'hai_canh', 'me_con'].includes(G2.kieu);
    return `<fieldset data-cb="go.day_tuong"><legend>Dày tường (đã trát, mm) <small>— làm khuôn / ốp chỉ</small></legend><div class="hai-o">${oSo('go.day_tuong.0', 'Đầu 1')}${oSo('go.day_tuong.1', 'Đầu 2', { goi: 'tuỳ, nếu không đều' })}</div><div class="cb"></div></fieldset>
<fieldset data-cb="go.san go.cot_san"><legend>Sàn</legend>${chips('go.san', [['da_lat', 'Đã lát'], ['chua_lat', 'Chưa lát']])}
${G2.san === 'chua_lat' ? oSo('go.cot_san', 'Sàn hoàn thiện sẽ cao thêm (mm)', { goi: 'gạch + vữa / sàn gỗ — cao đặt hàng trừ phần này' }) : ''}<div class="cb"></div></fieldset>
<fieldset data-cb="go.kieu go.kieu_khac"><legend>Kiểu cửa</legend>${chips('go.kieu', [['mot_canh', '1 cánh'], ['hai_canh', '2 cánh đều'], ['me_con', 'Mẹ con'], ['lua', 'Lùa'], ['xep', 'Xếp'], ['khac', 'Khác']])}
${G2.kieu === 'khac' ? oChu('go.kieu_khac', 'Kiểu khác', { ph: 'vd cửa vòm' }) : ''}<div class="cb"></div></fieldset>
<fieldset data-cb="go.mo go.ban_le go.lua"><legend>Chiều mở</legend>${G2.kieu === 'lua' || G2.kieu === 'xep' ? chonLua('go.lua') : G2.kieu === 'khac' ? '<p class="nhat"><small>Kiểu khác: ghi chiều mở ở ghi chú.</small></p>' : quay ? chonMo('go', 'ban_le', ['vao', 'ra']) : ''}<div class="cb"></div></fieldset>
<fieldset data-cb="go.op_chi"><legend>Ốp chỉ</legend>${chips('go.op_chi', [[1, '1 mặt'], [2, '2 mặt']], 'so')}<div class="cb"></div></fieldset>`;
  }
  function thanNhom() {
    const G2 = S.rec.cua.nhom_ct || {};
    return `<fieldset data-cb="nhom_ct.loai nhom_ct.be"><legend>Loại</legend>${chips('nhom_ct.loai', [['cua_di', 'Cửa đi'], ['cua_so', 'Cửa sổ'], ['vach', 'Vách cố định']])}
${G2.loai === 'cua_so' ? oSo('nhom_ct.be', 'Bệ: sàn → mép dưới ô (mm)') : ''}<div class="cb"></div></fieldset>
<fieldset data-cb="nhom_ct.day_tuong nhom_ct.lap"><legend>Tường &amp; vị trí lắp khuôn</legend><div class="hai-o">${oSo('nhom_ct.day_tuong.0', 'Dày tường 1')}${oSo('nhom_ct.day_tuong.1', 'Dày tường 2', { goi: 'tuỳ' })}</div>
${chips('nhom_ct.lap', [['trong', 'Sát mặt trong'], ['giua', 'Giữa tường'], ['ngoai', 'Sát mặt ngoài']])}<div class="cb"></div></fieldset>
<fieldset data-cb="nhom_ct.he"><legend>Hệ nhôm</legend>${oChu('nhom_ct.he', 'Hệ nhôm', { list: 'goi-y-he', ph: 'Xingfa, PMI, Việt Pháp…' })}<datalist id="goi-y-he">${C.HE_NHOM.map(h => `<option value="${esc(h)}">`).join('')}</datalist><div class="cb"></div></fieldset>
<fieldset data-cb="nhom_ct.kieu_mo nhom_ct.mo nhom_ct.ban_le nhom_ct.so_canh"><legend>Kiểu mở</legend>${chips('nhom_ct.kieu_mo', [['quay', 'Mở quay'], ['hat', 'Mở hất'], ['lua', 'Lùa'], ['xep', 'Xếp trượt'], ['co_dinh', 'Cố định']])}
${oSo('nhom_ct.so_canh', 'Số cánh', { nguyen: true, lop: 'hep' })}
${G2.kieu_mo === 'quay' ? chonMo('nhom_ct', 'ban_le', ['vao', 'ra']) : G2.kieu_mo === 'hat' ? `<label>Mở hất</label>${chips('nhom_ct.mo', [['ra', 'Hất ra ngoài'], ['vao', 'Hất vào trong']])}` : ''}<div class="cb"></div></fieldset>
<fieldset data-cb="nhom_ct.kinh nhom_ct.kinh_day nhom_ct.kinh_loai"><legend>Kính</legend><div class="hai-o">${oSo('nhom_ct.kinh_day', 'Kính dày (mm)', { ph: '8' })}<div class="goi-y-o">${G2.kinh_day === 8 && G2.kinh_loai === 'cuong_luc' ? '' : '<button type="button" data-act="cua-kinh8">8 mm cường lực</button>'}</div></div>
${chips('nhom_ct.kinh_loai', [['thuong', 'Thường'], ['cuong_luc', 'Cường lực'], ['dan', 'Dán an toàn'], ['hop', 'Kính hộp']])}<div class="cb"></div></fieldset>
<fieldset data-cb="nhom_ct.fix nhom_ct.fix_tren nhom_ct.fix_duoi"><legend>Ô fix (kính cố định)</legend>${chips('nhom_ct.fix', [['khong', 'Không'], ['tren', 'Fix trên'], ['duoi', 'Fix dưới'], ['ca_hai', 'Trên + dưới']])}
<div class="hai-o">${G2.fix === 'tren' || G2.fix === 'ca_hai' ? oSo('nhom_ct.fix_tren', 'Cao ô fix trên') : ''}${G2.fix === 'duoi' || G2.fix === 'ca_hai' ? oSo('nhom_ct.fix_duoi', 'Cao ô fix dưới') : ''}</div><div class="cb"></div></fieldset>
<fieldset data-cb="nhom_ct.tang_cao nhom_ct.tang_ghi"><legend>Lắp đặt</legend><label class="cong-tac"><input type="checkbox" data-c="nhom_ct.tang_cao"${G2.tang_cao ? ' checked' : ''}> Tầng cao / ngoài trời — cần giàn</label>
${G2.tang_cao ? oChu('nhom_ct.tang_ghi', 'Ghi chú lắp', { ph: 'vd tầng 5, mặt tiền, cần giàn 2 tầng' }) : ''}<div class="cb"></div></fieldset>`;
  }
  function thanKinh() {
    const G2 = S.rec.cua.kinh || {}, mat = G2.mat || [], Cu = G2.cua || {};
    return `<fieldset data-cb="kinh.dang kinh.mat"><legend>Dạng vách</legend>${chips('kinh.dang', [['thang', 'Thẳng 1 mặt'], ['goc_l', 'Góc L (2 mặt)'], ['chu_u', 'Chữ U (3 mặt)'], ['lua', 'Cửa lùa']])}<div class="cb"></div></fieldset>
${mat.map((m, i) => `<div class="mat-kinh" data-mat="${i}"><h2>Mặt ${i + 1}${mat.length > 1 ? ` <small class="nhat">/ ${mat.length}</small>` : ''}</h2>
${baDiem(`kinh.mat.${i}.rong`, `Mặt ${i + 1} — rộng`, ['Trên', 'Giữa', 'Dưới'])}${baDiem(`kinh.mat.${i}.cao`, `Mặt ${i + 1} — cao`, ['Trái', 'Giữa', 'Phải'])}</div>`).join('')}
<fieldset data-cb="kinh.nghieng"><legend>Tường hai bên có thẳng đứng? <small>(lệch đỉnh – chân, mm — thả dọi / thước nivô)</small></legend><div class="hai-o">${oSo('kinh.nghieng.trai', 'Tường trái lệch')}${oSo('kinh.nghieng.phai', 'Tường phải lệch')}</div><div class="cb"></div></fieldset>
<fieldset data-cb="kinh.bac kinh.doc"><legend>Gờ / bậc chắn nước</legend>${chips('kinh.bac.co', [[true, 'Có gờ'], [false, 'Không gờ']], 'bool')}
${G2.bac && G2.bac.co ? `<div class="hai-o">${oSo('kinh.bac.cao', 'Gờ cao')}${oSo('kinh.bac.rong', 'Gờ rộng')}</div>` : ''}${oChu('kinh.doc', 'Sàn dốc về đâu', { ph: 'vd về góc trong bên phải (ga thoát)' })}<div class="cb"></div></fieldset>
<fieldset data-cb="kinh.cua"><legend>Cửa kính</legend>${chips('kinh.cua.kieu', [['quay', 'Mở quay'], ['lua', 'Lùa'], ['khong', 'Không cửa']])}
${Cu.kieu && Cu.kieu !== 'khong' ? oSo('kinh.cua.rong', 'Rộng cánh cửa (mm)') : ''}
${Cu.kieu === 'quay' ? chonMo('kinh.cua', 'ban_le_ben', ['ra', 'vao']) + `<label>Bản lề</label>${chips('kinh.cua.ban_le', [['kinh_tuong', 'Kính – tường'], ['kinh_kinh', 'Kính – kính']])}` : ''}<div class="cb"></div></fieldset>
<fieldset data-cb="kinh.kinh_day kinh.kinh_loai kinh.pk_mau"><legend>Kính &amp; phụ kiện</legend><label>Kính dày (cường lực)</label>${chips('kinh.kinh_day', [[8, '8 mm'], [10, '10 mm'], [12, '12 mm']], 'so')}
${chips('kinh.kinh_loai', [['trong', 'Kính trong'], ['mo', 'Kính mờ']])}<label>Phụ kiện</label>${chips('kinh.pk_mau', [['inox', 'Inox 304'], ['den', 'Màu đen'], ['vang', 'Màu vàng'], ['khac', 'Khác']])}<div class="cb"></div></fieldset>
<fieldset data-cb="kinh.vat"><legend>Gần mép kính (để tránh khoan)</legend>${oChu('kinh.vat', 'Vòi sen / ổ điện / ống nước — cách mép bao nhiêu', { dai: true, ph: 'vd vòi sen cách mép trái 250, ống nước âm tường cao 1100' })}<p class="nhat"><small>Chụp thêm ảnh chỗ đó và kẻ số lên ảnh.</small></p><div class="cb"></div></fieldset>`;
  }
  /** Dựng lại phần thân của màn mục cửa (giữ chỗ cuộn) — gọi khi chọn chip / đóng màn kẻ; gõ số thì chỉ capCua (giữ tiêu điểm). */
  function veCuaThan() {
    const el = $('[data-ui="cua-than"]'); if (!el || !S.rec || !S.rec.la_cua) return;
    const r = S.rec, c = r.cua, y = window.scrollY, kinh = c.nhom === 'kinh';
    el.innerHTML = `<fieldset data-cb="ky_hieu vi_tri so_luong"><legend>Chung</legend><div class="hai-o">${oChu('ky_hieu', 'Ký hiệu')}${oSo('so_luong', 'Số lượng', { nguyen: true })}</div>
${oChu('vi_tri', 'Vị trí', { list: 'goi-y-vt', ph: 'vd WC tầng 2, phòng ngủ master' })}<datalist id="goi-y-vt">${GOI_Y_TEN.map(t => `<option value="${esc(t)}">`).join('')}</datalist><div class="cb"></div></fieldset>
${kinh ? '' : `${baDiem('rong', 'Rộng', ['Trên', 'Giữa', 'Dưới'])}${baDiem('cao', 'Cao', ['Trái', 'Giữa', 'Phải'])}
<details class="cheo" data-cb="cheo"${(c.cheo || []).some(v => v > 0) ? ' open' : ''}><summary>⋯ Đo 2 đường chéo (kiểm ô vuông)</summary><div class="hai-o">${oSo('cheo.0', 'Chéo 1')}${oSo('cheo.1', 'Chéo 2')}</div><div class="cb"></div></details>`}
${c.nhom === 'go' ? thanGo() : c.nhom === 'nhom' ? thanNhom() : thanKinh()}
<fieldset data-cb="chat_lieu mau phu_kien ghi_chu"><legend>Vật liệu &amp; ghi chú</legend>${oChu('chat_lieu', c.nhom === 'go' ? 'Chất liệu (gỗ, cánh)' : c.nhom === 'nhom' ? 'Chất liệu' : 'Chất liệu khung / nẹp', { ph: c.nhom === 'go' ? 'vd MDF chống ẩm phủ melamine' : '' })}
${oChu('mau', c.nhom === 'nhom' ? 'Màu nhôm' : 'Màu', { ph: c.nhom === 'nhom' ? 'vd ghi xám, nâu cafe' : '' })}${oChu('phu_kien', 'Phụ kiện', { ph: c.nhom === 'go' ? 'vd khoá tay gạt, bản lề lá 4 cái' : '' })}${oChu('ghi_chu', 'Ghi chú', { dai: true })}<div class="cb"></div></fieldset>
<h2>Ảnh</h2><div class="anhs" data-anh=""></div>
<p><button class="to" data-act="chup" data-tuong="">📷 Chụp ô cửa — kẻ số lên ảnh</button></p>
<label class="cong-tac"><input type="checkbox" data-c="xong"${c.xong ? ' checked' : ''}> Đo xong mục này</label>
${r.xoa_duoc === false ? '' : `<p><button class="do" data-act="cua-xoa" data-id="${esc(r.id)}">Xoá ${esc(c.ky_hieu)}</button></p>`}`;
    window.scrollTo(0, y);
    capCua(); veAnhs();
  }
  const MUC_LOP = { do: 'loi', vang: 'vang', ghi: 'xam' };
  /** Số đặt hàng + cảnh báo tại chỗ (đặt dưới đúng phần), phần còn lại + tóm tắt ở đầu màn. Không dựng lại ô nhập (giữ tiêu điểm khi đang gõ). */
  function capCua() {
    const r = S.rec; if (!r || !r.la_cua || !$('[data-ui="cua-than"]')) return;
    const c = r.cua, t = C.tinh(c), th = C.kiemDs((S.dsCua || []).concat([{ id: r.id, cua: c }])).get(r.id) || [];
    const cb = t.canh_bao.concat(th);
    if (th.length && t.muc === 'ok') t.muc = 'vang';
    const minH = (x, them) => x ? `<span>Đặt hàng</span> <b>${esc(nghin(x.min))}</b>${x.n > 1 ? ` <small class="${x.lech > C.NGUONG.lech_do ? 'loi-o' : x.lech > C.NGUONG.lech_vang ? 'vang-o' : ''}">lệch ${esc(g(x.lech))} mm</small>` : ''}${them || ''}` : '<small>Số đặt hàng = số NHỎ NHẤT của 3 điểm</small>';
    for (const el of $$('[data-min]')) {
      const k = el.dataset.min, m = /^kinh\.mat\.(\d+)\.(rong|cao)$/.exec(k);
      const x = m ? (t.mat && t.mat[+m[1]] ? t.mat[+m[1]][m[2]] : null) : t[k];
      el.innerHTML = minH(x, k === 'cao' && typeof t.cao_dat === 'number' ? ` <span class="dat">→ đặt <b>${esc(nghin(t.cao_dat))}</b> <small>(trừ sàn hoàn thiện)</small></span>` : '');
      el.dataset.muc = x ? (x.lech > C.NGUONG.lech_do ? 'do' : x.lech > C.NGUONG.lech_vang ? 'vang' : 'ok') : '';
    }
    const hop = $$('[data-cb]').map(el => ({ el, ks: el.dataset.cb.split(' '), L: [] }));
    const con = [];
    for (const x of cb) {
      let tot = null, dai = -1;
      for (const h of hop) for (const k of h.ks) if ((x.truong === k || x.truong.startsWith(k + '.')) && k.length > dai) { dai = k.length; tot = h; }
      (tot ? tot.L : con).push(x);
    }
    for (const [d, loi] of Object.entries(S.sai)) { const h = hop.find(q => q.ks.some(k => d === k || d.startsWith(k + '.'))); (h ? h.L : con).push({ muc: 'do', truong: d, loi: `${tenO2(d)}: ${loi} — máy đang giữ số cũ.` }); }
    for (const h of hop) { const o = $(':scope > .cb', h.el); if (o) o.innerHTML = h.L.map(x => `<div class="msg ${MUC_LOP[x.muc]}" data-cb-muc="${x.muc}">${esc(x.loi)}</div>`).join(''); }
    const tt = $('[data-ui="tt"]'); if (!tt) return;
    const nd = cb.filter(x => x.muc === 'do').length + Object.keys(S.sai).length, nv = cb.filter(x => x.muc === 'vang').length;
    const L = [`<div class="msg ${nd ? 'loi' : nv ? 'vang' : 'ok'}" data-ui="cua-tom">${esc(tomCua(c))}${nd ? ` · ${nd} lỗi đỏ` : ''}${nv ? ` · ${nv} cần xem` : ''}${!nd && !nv ? ' · đủ số ✓' : ''}</div>`];
    if (S.bao_m) L.push(`<div class="msg vang" data-ui="bao-m">${esc(S.bao_m)}</div>`);
    if (S.bao_xong) L.push(`<div class="msg loi" data-ui="bao-xong">${esc(S.bao_xong)}</div>`);
    for (const x of con) L.push(`<div class="msg ${MUC_LOP[x.muc]}" data-cb-muc="${x.muc}">${esc(x.loi)}</div>`);
    if (r.loi_gui) L.push(`<div class="msg loi">Máy chủ chưa nhận: ${esc(r.loi_gui)}</div>`);
    tt.innerHTML = L.join('');
    const h1 = $('[data-ui="ten-cua"]'); if (h1) h1.textContent = `${c.ky_hieu || '?'} · ${C.NHOM_TEN[c.nhom]}`;
  }
  const tenO2 = d => ({ ky_hieu: 'Ký hiệu', so_luong: 'Số lượng', 'nhom_ct.so_canh': 'Số cánh' })[d] || tenCuaLien(d) || d;
  /** Gõ một ô của mục cửa. Số: chữ lạ / âm / quá trần → đỏ ở ô, giữ số cũ (như phòng). */
  function suaC(d, v, el) {
    const r = S.rec, c = r.cua; delete S.bao_m;
    const sai = t => { S.sai[d] = t; S.goC[d] = v; if (el) el.setAttribute('aria-invalid', 'true'); capCua(); };
    const dung = () => { delete S.sai[d]; delete S.goC[d]; if (el) el.removeAttribute('aria-invalid'); };
    if (d === 'ky_hieu') { const k = v.trim(); if (!k) return sai('cần ký hiệu (vd D1)'); if (!KY_RE.test(k)) return sai('chỉ gồm chữ, số, dấu cách . _ / # - (tối đa 12)'); dung(); c.ky_hieu = k; }
    else if (CUA_CHU[d]) { dung(); datD(c, d, v.slice(0, CUA_CHU[d])); }
    else if (d === 'so_luong' || d === 'nhom_ct.so_canh') {
      const t = v.trim(), lo = d === 'so_luong' ? 1 : 0, hi = d === 'so_luong' ? 99 : 12;
      if (!t) { dung(); datD(c, d, d === 'so_luong' ? 1 : null); }
      else if (!/^\d{1,2}$/.test(t) || +t < lo || +t > hi) return sai(`số nguyên ${lo} … ${hi}`);
      else { dung(); datD(c, d, +t); }
    } else {
      const x = docO(v);
      if (x.sai) return sai(x.sai);
      if (x.v !== null && CUA_MAX[d] && x.v > CUA_MAX[d]) return sai(`quá lớn (tối đa ${CUA_MAX[d]})`);
      dung(); datD(c, d, x.v);
    }
    doi(); capCua();
  }
  async function xoaCua(b) {
    if (!haiLan(b, 'Bấm lần nữa để xoá mục này')) return;
    const r = S.rec;
    if (r.rev) { const x = await api('DELETE', '/api/cua/' + r.id).catch(() => null); if (!x || (!x.ok && x.st !== 404)) return alertNho(x && x.j.error ? x.j.error : 'Cần mạng để xoá mục đã gửi lên máy chủ.'); }
    for (const a of r.anh) await boAnhMay(a.id);
    await DB.del('cua', r.id); await DB.del('hang', 'cua:' + r.id); clearTimeout(S.hen); S.rec = null;
    if (!r.rev) await xepHang('xoa_cua', r.id);      // lần gửi đầu có khi đang đi: xoá sau nó (404 = máy chủ chưa từng có)
    di('#/ct/' + r.ct);
  }
  function chonCua(b) {
    const r = S.rec, c = r.cua, d = b.dataset.c, t = b.dataset.t;
    const v = t === 'so' ? +b.dataset.v : t === 'bool' ? b.dataset.v === 'true' : b.dataset.v;
    const cu = layD(c, d), moi = cu !== null && cu !== undefined && String(cu) === String(v) ? null : v;      // bấm lại = bỏ chọn
    datD(c, d, moi);
    if (d === 'kinh.dang' && moi) {      // số mặt theo dạng vách (giữ số đã đo của các mặt còn lại)
      const n = MAT_CAN[moi], mat = c.kinh.mat || (c.kinh.mat = []);
      while (mat.length < n) mat.push({ rong: [null, null, null], cao: [null, null, null] });
      if (mat.length > n && !mat.slice(n).some(m => m.rong.concat(m.cao).some(x => x !== null))) mat.length = n;
      if (moi === 'lua' && !c.kinh.cua.kieu) c.kinh.cua.kieu = 'lua';
    }
    if (d === 'kinh.cua.kieu' && moi === 'quay' && !c.kinh.cua.mo) c.kinh.cua.mo = null;
    doi(); veCuaThan();
  }

  /* ----- phiếu đo cửa ----- */
  function moPhieu(ct) {
    S.phieu = S.phieu && S.phieu.ct === ct ? S.phieu : { ct, nhom: C.NHOM.slice() };
    veTamPhieu();
  }
  async function veTamPhieu() {
    const P = S.phieu, ds = (await DB.all('cua')).filter(x => x.ct === P.ct), hang = await hangCua(), cho = ds.filter(x => hang.cua.has(x.id) || !x.rev).length;
    const dem = n => ds.filter(x => x.cua.nhom === n).length;
    moTam(`<h3>Phiếu đo cửa</h3><p class="nhat"><small>Chọn nhóm — gửi riêng cho xưởng gỗ / nhà cung cấp nhôm / kính:</small></p>
<div class="chips" data-ui="phieu-nhom">${C.NHOM.map(n => `<button type="button" class="chip" data-act="phieu-nhom" data-v="${n}" aria-pressed="${P.nhom.includes(n)}">${NHOM_ICON[n]} ${esc(C.NHOM_TEN[n])} (${dem(n)})</button>`).join('')}</div>
${cho ? `<div class="msg vang" data-ui="phieu-cho">${cho} mục chưa lên máy chủ — phiếu in lấy bản trên máy chủ (cần mạng); Tải CSV lấy bản trong máy này.</div>` : ''}
<div class="loi-o" data-ui="phieu-loi"></div>
<p><button class="chinh to" data-act="phieu-xem"${P.nhom.length ? '' : ' disabled'}>Xem / in phiếu (A4)</button></p>
<p><button class="to" data-act="phieu-csv"${P.nhom.length ? '' : ' disabled'}>Tải CSV (Excel)</button></p>
<p><button data-act="dong-tam">Đóng</button></p>`);
  }
  const urlPhieu = (ct, nhom, dang) => `/api/cong-trinh/${encodeURIComponent(ct)}/phieu-cua?nhom=${nhom.join(',')}&dang=${dang}`;
  async function xemPhieu() {
    const P = S.phieu; if (!P || !P.nhom.length) return;
    const loi = t => { const o = $('[data-ui="phieu-loi"]', lop); if (o) o.textContent = t; };
    await chayHang().catch(() => null);      // gửi nốt những gì đang chờ trước khi lấy phiếu
    const u = urlPhieu(P.ct, P.nhom, 'html');
    let r; try { r = await fetch(u, { credentials: 'same-origin', cache: 'no-store' }); } catch (e) { return loi('Mất mạng — phiếu in cần mạng. Tải CSV vẫn được.'); }
    if (r.status === 401) { canDangNhap(); return; }
    if (!r.ok) return loi(r.status === 404 ? 'Công trình chưa lên máy chủ — chờ gửi xong rồi thử lại.' : 'Máy chủ không trả phiếu (' + r.status + ').');
    lop.innerHTML = `<div class="phieu" data-ui="phieu"><div class="cong-cu"><button data-act="phieu-dong">‹ Đóng</button><button class="chinh" data-act="phieu-in">🖨 In / lưu PDF</button></div>
<iframe data-ui="phieu-khung" title="Phiếu đo cửa" src="${esc(u)}"></iframe></div>`;
    dayLS();
  }
  async function taiCsv() {
    const P = S.phieu; if (!P || !P.nhom.length) return;
    const ds = (await DB.all('cua')).filter(x => x.ct === P.ct && P.nhom.includes(x.cua.nhom)), ct = await DB.get('ct', P.ct);
    const csv = C.phieuCsv(tinhDs(ds), P.nhom), b = new Blob([csv], { type: 'text/csv;charset=utf-8' }), u = URL.createObjectURL(b);
    const ten = ((ct && ct.ten) || 'cong-trinh').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'cong-trinh';
    const a = document.createElement('a'); a.href = u; a.download = `phieu-do-cua-${ten}${P.nhom.length < 3 ? '-' + P.nhom.join('-') : ''}.csv`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 10000);
  }

  /* ================= xung đột ================= */
  /** Ảnh chụp ở máy này mà máy chủ chưa từng có (chưa lên) — bản máy chủ không thể biết tới chúng, "Lấy bản máy chủ" vẫn giữ. */
  const anhChiMayNay = (r, h) => { const tren = new Set((h.anh || []).map(a => a.id).concat(h.anh_co || [], r.anh_co || [])); return r.anh.filter(a => !tren.has(a.id)); };
  function hoiXungDot() {
    const r = S.rec, h = r.xung_dot; if (!h) return;
    const n = anhChiMayNay(r, h).length;
    moTam(`<h3>${r.la_cua ? `Mục ${esc(r.cua.ky_hieu)}` : `Phòng “${esc(r.ten)}”`} vừa được sửa ở máy khác</h3><p>Máy chủ đang giữ bản sửa lúc ${esc(gioPhut(h.sua_luc))}. Chọn bản giữ lại:</p>
<ul class="nhat"><li><b>Giữ bản máy này</b>: bản trên máy chủ bị thay bằng số đo của máy này.</li><li><b>Lấy bản máy chủ</b>: số đo / nét kẻ sửa ở máy này từ lần gửi trước bị bỏ.${n ? ` ${n} ảnh chụp ở máy này chưa lên máy chủ — giữ lại (kèm nét đã kẻ) ở cả hai cách.` : ''}</li></ul>
<div class="hang"><button data-act="xd-giu">Giữ bản máy này</button><button data-act="xd-lay">Lấy bản máy chủ</button></div>`);
  }
  async function xungDot(giu) {
    const r = S.rec, h = r.xung_dot; if (!h) return dongTam();
    let guiLai = giu;
    if (giu) { r.rev = h.rev; r.ghi_de = true; }
    else {
      const giuAnh = anhChiMayNay(r, h), cu = r.anh, caoCu = r.la_cua ? 0 : r.phong.cao;
      // trần "điền sẵn 2700" chỉ còn đúng khi bản máy chủ vẫn mang đúng số đó (máy kia đo trần 2850 → trần đã đo)
      if (r.cao_san && !(h.phong && h.phong.cao === caoCu)) delete r.cao_san;
      if (r.la_cua) Object.assign(r, { cua: h.cua, anh: h.anh.concat(giuAnh), rev: h.rev, anh_co: h.anh_co, ghi_de: false });
      else Object.assign(r, { ten: h.ten, xong: h.xong, ghi_chu: h.ghi_chu, phong: h.phong, anh: h.anh.concat(giuAnh), rev: h.rev, anh_co: h.anh_co, ghi_de: false });
      // ảnh máy này đã lên rồi mà bản máy chủ bỏ (máy kia xoá): dọn tệp trong máy
      const con = new Set(r.anh.map(a => a.id)); for (const a of cu) if (!con.has(a.id)) await boAnhMay(a.id);
      if (giuAnh.length) { guiLai = true; r.dem = (r.dem || 0) + 1; }      // khai ảnh còn giữ lên máy chủ
    }
    const kho = r.la_cua ? 'cua' : 'phong';
    delete r.xung_dot; await DB.put(kho, r);
    if (guiLai) await DB.put('hang', { k: kho + ':' + r.id, loai: kho, id: r.id, th: 1, lan: 0, cho_den: 0, dung: '', ver: r.dem });
    else await DB.del('hang', kho + ':' + r.id);
    dongTam(); if (r.la_cua) veCua(r.id); else vePhong(r.id); capThanh(); henChay(200);
  }

  /* ================= quản lý ================= */
  async function veTaiKhoan() {
    app.innerHTML = `<header class="dau"><button class="lui" data-act="di" data-h="#/">‹</button><h1>Tài khoản thợ</h1></header>
<p><button class="chinh to" data-act="tk-moi">+ Thợ mới</button></p><ul class="ds" data-ui="ds-tk"><li class="nhat">Đang tải…</li></ul>`;
    const r = await api('GET', '/api/quan-ly/tai-khoan').catch(() => null);
    const el = $('[data-ui="ds-tk"]'); if (!el) return;
    if (!r || !r.ok) { el.innerHTML = '<li class="msg loi">Cần mạng để quản lý tài khoản.</li>'; return; }
    api('GET', '/api/quan-ly/dung-luong').then(d => {      // dung lượng ảnh: máy chủ dùng chung với ERP — đầy đĩa là ERP chết
      if (!d.ok || !el.isConnected) return; const G1 = 1024 * 1024 * 1024, x = d.j, day = x.anh_bytes / x.tran_bytes;
      el.insertAdjacentHTML('beforebegin', `<div class="msg ${day > 0.8 || (x.dia_trong !== null && x.dia_trong < 2 * x.dia_trong_min) ? 'loi' : 'xam'}" data-ui="dung-luong">Ảnh: ${x.so_anh} tệp, ${g(x.anh_bytes / G1)} / ${g(x.tran_bytes / G1)} GB${x.dia_trong !== null ? ` · đĩa còn trống ${g(x.dia_trong / G1)} GB` : ''}</div>`);
    }).catch(() => null);
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
    'dong-tam-nen': (b, e) => { if (e.target === b && !$('.tam input, .tam textarea, .tam select', lop)) dongTam(); },      // tấm có ô nhập: chạm nhầm nền không đóng (mất số vừa gõ)
    'dang-nhap-lai': () => { lop.innerHTML = ''; S.ls = false; giuTam(); dangNhapLai(); },
    've-dau': () => di('#/'),
    'menu': () => moTam(`<h3>${esc(S.toi.ten_hien)} <small class="nhat">(${esc(S.toi.ten)})</small></h3><div class="hang"><button data-act="doi-mk">Đổi mật khẩu</button><button class="do" data-act="dang-xuat">Đăng xuất</button></div><p><button data-act="dong-tam">Đóng</button></p>`),
    'doi-mk': () => { dongTam(); veDoiMk(false); },
    'dang-xuat': async b => {
      const n = (await DB.all('hang')).length;
      if (n && !haiLan(b, `Còn ${n} thay đổi chưa gửi — bấm lần nữa để BỎ và đăng xuất`)) return;
      await api('POST', '/api/dang-xuat').catch(() => null);
      await DB.xoaHet(); S.toi = null; S.rec = null; S.may = ''; location.hash = '#/'; veDangNhap('Đã đăng xuất.');
    },
    'ct-moi': () => moFormCt(null),
    'ct-sua': async b => moFormCt(await DB.get('ct', b.dataset.id)),
    'ct-luu-tru': async b => { const r = await api('POST', `/api/cong-trinh/${b.dataset.id}/luu-tru`).catch(() => null); if (!r || !r.ok) return alertCt('Cần mạng (và công trình đã lên máy chủ) để lưu trữ.'); await DB.del('ct', b.dataset.id); di('#/'); },
    'ct-xoa': async b => {
      if (!haiLan(b, 'Bấm lần nữa để XOÁ cả công trình')) return;
      const c = await DB.get('ct', b.dataset.id);
      if (c && c.tren_may) { const r = await api('DELETE', '/api/cong-trinh/' + c.id).catch(() => null); if (!r || !r.ok) return alertCt(r && r.j.error ? r.j.error : 'Cần mạng để xoá.'); }
      for (const p of await DB.all('phong')) if (p.ct === b.dataset.id) { for (const a of p.anh) await boAnhMay(a.id); await DB.del('phong', p.id); await DB.del('hang', 'phong:' + p.id); }
      for (const p of await DB.all('cua')) if (p.ct === b.dataset.id) { for (const a of p.anh) await boAnhMay(a.id); await DB.del('cua', p.id); await DB.del('hang', 'cua:' + p.id); }
      await DB.del('ct', b.dataset.id); await DB.del('hang', 'ct:' + b.dataset.id); di('#/');
    },
    'ph-moi': b => moFormPh(b.dataset.id),
    'chon-hinh': b => { for (const c of $$('[data-act="chon-hinh"]', lop)) c.setAttribute('aria-pressed', String(c === b)); },
    'mb-to': () => { S.mb_to = !S.mb_to; const mb = $('[data-ui="mb"]'); if (mb) mb.classList.toggle('to', S.mb_to); capPhanTich(); },
    'lech-anh': b => lechAnh(b, true), 'lech-giu': b => lechAnh(b, false),
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
    'ke-che': b => { if (!ketSo(NGAM)) return; K.che = b.dataset.v; K.sel = -1; for (const c of $$('[data-act="ke-che"]', lop)) c.setAttribute('aria-pressed', String(c === b)); veKeCanvas(); veDsNet(); capNut(); },
    'ke-lui': () => hoanTac(false),
    'ke-lam-lai': () => hoanTac(true),
    'ke-bo': b => { const i = +b.dataset.i; if (!K.ke[i]) return; dongSo(); ghiBuoc(); K.ke.splice(i, 1); K.sel = K.sel === i ? -1 : K.sel > i ? K.sel - 1 : K.sel; xongNet(); },
    'ke-bo-chon': () => { const i = K.sel; if (!(i >= 0) || !K.ke[i]) return; dongSo(); ghiBuoc(); K.ke.splice(i, 1); K.sel = -1; xongNet(); },
    // câu "khác số cũ" đang mở mà thợ bấm Xong / Chụp tiếp / Ảnh kế: không kẹt — đoạn giữ số ảnh, phòng giữ số cũ, dòng vàng ở phòng (như Quay lại)
    'ke-xong': () => { if (!ketSo(NGAM)) return; luuKe(); },
    'ke-chup-tiep': () => { if (!giuKe(NGAM)) return; ghiNet(); chup(Number.isInteger(K.a.tuong) ? K.a.tuong : null); },
    'ke-anh-ke': b => { if (!giuKe(NGAM)) return; ghiNet(); moKe(b.dataset.id); },
    'so-xong': () => ketSo(),
    'so-dung-anh': () => traLech('anh'), 'so-giu-cu': () => traLech('cu'), 'so-khong-gan': () => traLech('khong'),
    // số ước chỉ ghi lên ảnh ("≈3 560", nguon 'uoc'), KHÔNG gắn ô của phòng (chip gợi ý bật sẵn không tính) — muốn vào phòng thì đo rồi gõ số
    'so-dung-uoc': b => { const k = K.o !== null ? K.ke[K.o] : null, v = +b.dataset.v; if (!k || !(v > 0)) return; ghiBuoc(); ghiDoan(k, '', v, 'uoc'); dongSo(); xongNet(); },
    'ke-xoa-anh': async b => {
      if (!haiLan(b, 'Bấm lần nữa để xoá ảnh')) return;
      const id = K.a.id; S.rec.anh = S.rec.anh.filter(a => a !== K.a); await DB.del('anh', id); await DB.del('hang', 'anh:' + id);
      K.cv = null; doi(); luuNgay(); dongTam(); veAnhs();
    },
    'hoi-thoi': () => { K.hoi = null; K.cho = null; xongNet(); },
    'hoi-xong': () => { const i = $('[data-ui="hoi-chu"]', lop), f = K.hoi; K.hoi = null; if (f) f((i ? i.value : '').trim()); },
    'chon-lien': b => {      // "đoạn này là Dài tường A": số vừa gõ (hoặc số đã có của đoạn khi ô của phòng còn trống) điền vào ô của phòng; khác số cũ thì hỏi
      if (K.o === null || !K.ke[K.o]) return;
      K.oLien = b.dataset.lien || ''; K.oCho = null;
      if (!chotSo(K.oLien, { chip: true })) for (const c of $$('[data-act="chon-lien"]', lop)) c.setAttribute('aria-pressed', String((c.dataset.lien || '') === K.oLien));
    },
    'xoa-phong': async b => {
      if (!haiLan(b, 'Bấm lần nữa để xoá phòng này')) return;
      const r = S.rec;
      if (r.rev) { const x = await api('DELETE', '/api/phong/' + r.id).catch(() => null); if (!x || (!x.ok && x.st !== 404)) return alertNho(x && x.j.error ? x.j.error : 'Cần mạng để xoá phòng đã gửi lên máy chủ.'); }
      for (const a of r.anh) await boAnhMay(a.id);
      await DB.del('phong', r.id); await DB.del('hang', 'phong:' + r.id); clearTimeout(S.hen); S.rec = null;
      // phòng chưa có số bản: có khi lần gửi đầu đang đi (máy chủ sắp có phòng) — xếp việc xoá, chạy sau lần gửi đó (404 = máy chủ chưa từng có: xong)
      if (!r.rev) await xepHang('xoa', r.id);
      di('#/ct/' + r.ct);
    },
    'xd-giu': () => xungDot(true), 'xd-lay': () => xungDot(false),
    'cua-them': b => moThemCua(b.dataset.id),
    'cua-nhom': b => taoCua(b.dataset.ct, b.dataset.nhom),
    'cua-chon': b => chonCua(b),
    'cua-mo': b => { const c = S.rec.cua, G2 = layD(c, b.dataset.kh); if (!G2) return; const on = G2[b.dataset.kben] === b.dataset.ben && G2.mo === b.dataset.mo; G2[b.dataset.kben] = on ? null : b.dataset.ben; G2.mo = on ? null : b.dataset.mo; doi(); veCuaThan(); },
    'cua-kinh8': () => { const G2 = S.rec.cua.nhom_ct; G2.kinh_day = 8; G2.kinh_loai = 'cuong_luc'; delete S.sai['nhom_ct.kinh_day']; doi(); veCuaThan(); },
    'cua-xoa': b => xoaCua(b),
    'cua-phieu': b => moPhieu(b.dataset.id),
    'phieu-nhom': b => { const P = S.phieu, n = b.dataset.v; P.nhom = P.nhom.includes(n) ? P.nhom.filter(x => x !== n) : C.NHOM.filter(x => x === n || P.nhom.includes(x)); veTamPhieu(); },
    'phieu-xem': () => xemPhieu(),
    'phieu-csv': () => taiCsv(),
    'phieu-in': () => { const f = $('[data-ui="phieu-khung"]', lop); try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { window.print(); } },
    'phieu-dong': () => dongTam(),
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
      else if (!b && S.rec && e.target.closest('[data-ui="mb"] svg')) XL['mb-to']();      // chạm chỗ trống của mặt bằng: phóng to / thu nhỏ
      return;

    }
    const f = XL[b.dataset.act]; if (!f) return;
    if (b.dataset.act !== 'ct-phai' && b.tagName !== 'INPUT') e.preventDefault();
    Promise.resolve(f(b, e)).catch(x => console.error(x));
  });
  document.addEventListener('submit', e => { const f = e.target.closest('form[data-form]'); if (!f) return; e.preventDefault(); nop(f).catch(x => console.error(x)); });
  document.addEventListener('input', e => {
    const el = e.target; if (!el.dataset) return;
    if (el.dataset.o && S.rec && app.contains(el)) suaO(el.dataset.o, el.value, el);
    else if (el.dataset.c && S.rec && S.rec.la_cua && app.contains(el) && el.type !== 'checkbox') suaC(el.dataset.c, el.value, el);
    else if (el.dataset.f && S.ct && lop.contains(el)) xemCT();
    else if (el.dataset.ui === 'o-so-nhap') { if (K.oCho) { K.oCho = null; veO(); } ghiNhap(el.value); }      // gõ lại số: bỏ câu hỏi "khác số cũ"; giữ số gõ dở
  });

  document.addEventListener('change', e => {
    const el = e.target;
    if (el.dataset && el.dataset.ui === 'tep') return nhanTep(Array.from(el.files || []));
    if (el.dataset && el.dataset.o === 'xong') suaO('xong', '', el);
    // gõ "3,6" (mét) vào dài tường / trần: rời ô thì đổi hẳn thành 3600 mm và báo (đổi lúc đang gõ thì "3" của "3600" thành 3000)
    if (el.dataset && el.dataset.o && S.rec && /^(cao|tuong\.\d+\.(dai|cao))$/.test(el.dataset.o)) {
      const d = docO(el.value);
      if (!d.sai && d.v > 0 && d.v < SOAT.tuong_min) { const mm = G.rn(d.v * 1000, 1); el.value = String(mm); suaO(el.dataset.o, el.value, el); S.bao_m = `${tenO(el.dataset.o)}: đã đổi ${g(d.v)} m thành ${nghin(mm)} mm.`; capPhanTich(); }
    }
    if (el.dataset && el.dataset.o && S.rec) luuNgay();
    if (el.dataset && el.dataset.c && S.rec && S.rec.la_cua && app.contains(el)) {
      const d = el.dataset.c, c = S.rec.cua;
      if (el.type === 'checkbox') {
        if (d === 'xong') {      // lỗi đỏ chặn "Đo xong" (như phòng): sửa trước khi đặt hàng
          const nd = el.checked ? C.tinh(c).canh_bao.filter(x => x.muc === 'do').length + Object.keys(S.sai).length : 0;
          if (nd) { el.checked = false; S.bao_xong = `Còn ${nd} lỗi đỏ — sửa trước khi đánh dấu đo xong.`; capCua(); window.scrollTo(0, 0); return; }
          delete S.bao_xong;
        }
        datD(c, d, !!el.checked); doi(); if (d === 'xong') capCua(); else veCuaThan();
      } else if (/^(rong|cao|cheo)\.\d$|^kinh\.mat\.\d\.(rong|cao)\.\d$/.test(d)) {      // "0,82" (mét) → 820 mm khi rời ô
        const x = docO(el.value);
        if (!x.sai && x.v > 0 && x.v < SOAT.tuong_min && !Number.isInteger(x.v)) { const mm = G.rn(x.v * 1000, 1); el.value = String(mm); suaC(d, el.value, el); S.bao_m = `${tenCuaLien(d)}: đã đổi ${chuGo(x.v)} m thành ${nghin(mm)} mm.`; capCua(); }
      }
      luuNgay();
    }

  });
  document.addEventListener('focusout', e => { if (e.target.dataset && (e.target.dataset.o || e.target.dataset.c)) luuNgay(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.dataset && e.target.dataset.ui === 'hoi-chu') { e.preventDefault(); const b = $('[data-act="hoi-xong"]', lop); if (b) b.click(); }
    if (e.target.dataset && e.target.dataset.ui === 'o-so-nhap') { if (e.key === 'Enter') { e.preventDefault(); ketSo(); } else if (e.key === 'Escape') { e.preventDefault(); dongSo(); veKeCanvas(); } }
    if (e.key === 'Enter' && e.target.dataset && e.target.dataset.c && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') {      // Enter: sang ô số kế tiếp (đo 3 điểm liền tay)
      e.preventDefault(); const ds = $$('[data-ui="cua-than"] input[data-c]:not([type="checkbox"])'), i = ds.indexOf(e.target); if (i >= 0 && i < ds.length - 1) ds[i + 1].focus(); else e.target.blur();
    }
    if (e.key === 'Enter' && e.target.dataset && e.target.dataset.f) { e.preventDefault(); const ds = $$('.tam input[data-f]', lop), i = ds.indexOf(e.target); if (i >= 0 && i < ds.length - 1) ds[i + 1].focus(); else xongChiTiet(); }
  });

  /* ================= mở trang ================= */
  /** Mã máy (ngẫu nhiên, nhớ trong máy): máy chủ nhận ra lần gửi lại của chính máy này sau khi mất trả lời — không báo oan "sửa ở máy khác". */
  async function napMay() { const m = await DB.get('meta', 'may'); if (m && m.v) S.may = m.v; else { S.may = 'may' + ngauNhien(16); await DB.put('meta', { k: 'may', v: S.may }); } }
  async function batDau() {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => null);
    await DB.mo();
    const m = await DB.get('meta', 'toi'); S.toi = m ? m.v : null;
    await napMay();
    try {
      const r = await api('GET', '/api/toi');
      if (r.ok) { S.toi = r.j; await DB.put('meta', { k: 'toi', v: r.j }); }
      else if (r.st === 401) S.toi = null;
    } catch (e) { /* mất mạng: dùng tài khoản đã nhớ, làm việc với nháp */ S.mat_mang = true; }
    dinhTuyen(); henChay(500);
  }
  window.MNDO = { S, K, DB, chayHang, keMan: { diem: q => raMan(q), nhan: i => { const n = K.ke[i] && nhanCua(K.ke[i], K.cv.getContext('2d')); return n ? raMan([n.x, n.y]) : null; }, anh: (x, y) => vaoAnh(x, y) }, trangThai: async () => ({ hang: (await DB.all('hang')).length, toi: S.toi }) };
  batDau().catch(e => { app.innerHTML = `<div class="msg loi">Không mở được: ${esc(e.message)}</div>`; });
})();
