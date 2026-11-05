/*!
 * mncf-phong.js — Một Nhà · phòng hiện trạng.
 * Mô hình phòng do người dùng TỰ ĐIỀN số đo (tường, cửa, dầm cột) + các "khung không gian" (chỗ đặt tủ) → mặt bằng, mặt đứng từng tường (SVG),
 * kiểm tra (phòng có khép kín không, khung có che cửa / vướng dầm cột / chồng nhau không), vị trí đặt tủ, thông số tủ vừa khung.
 *
 * Quy ước: đi vòng quanh phòng THEO CHIỀU KIM ĐỒNG HỒ (nhìn từ trên xuống). Đứng trong phòng nhìn vào một tường thì đầu tường nằm bên TRÁI,
 * tường kế tiếp nằm bên PHẢI. `re` = góc rẽ phải ở CUỐI tường (90 = góc phòng bình thường, −90 = góc lồi như chỗ cột / hộp kỹ thuật nhô ra).
 * Mọi khoảng `cach` đo từ đầu trái của tường. Toạ độ: tường đầu tiên chạy theo +x tại y = 0, lòng phòng ở phía y âm, z = cao (sàn = 0). Đơn vị mm.
 * Chạy được trong Node (require) lẫn trình duyệt (MNCFPhong). Không phụ thuộc thư viện nào.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MNCFPhong = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const BAN = 1;
  const rn = (v, d = 1) => { const k = Math.pow(10, d); return Math.round((v + Number.EPSILON) * k) / k; };
  const g = v => String(rn(v, 1)).replace('.', ',');
  const num = (v, dflt) => { if (typeof v === 'string') v = v.trim().replace(',', '.'); const x = Number(v); return (v === '' || v === null || v === undefined || !isFinite(x)) ? dflt : x; };
  const clone = o => JSON.parse(JSON.stringify(o));
  const esc = v => String(v === undefined || v === null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const tenTuong = i => { let s = ''; i++; while (i > 0) { s = String.fromCharCode(65 + (i - 1) % 26) + s; i = Math.floor((i - 1) / 26); } return s; };
  const LOAI_MO = { cua: 'Cửa đi', cua_so: 'Cửa sổ', o_trong: 'Ô trống' };
  const LOAI_CAN = { cot: 'Cột', dam: 'Dầm', hop: 'Hộp kỹ thuật' };
  // ĐIỆN – NƯỚC hiện trạng (bản 1.18 — anh Jason 03/10/2026 23:46: "nhiều phòng có ổ điện rồi thoát sàn, rồi cấp thoát nước cho điền vào hiện trạng").
  //   Điểm TRÊN TƯỜNG: `cach` = từ đầu trái tường tới TÂM điểm, `cao` = từ sàn tới tâm. Điểm DƯỚI SÀN (san): `cach` như trên, `ra` = từ mặt tường ra tâm.
  //   rong × cao_o = cỡ ô phải khoét trên tấm che nó (tron: đường kính); cao / ra ở đây là số điền sẵn khi thêm điểm mới — thợ đo lại rồi gõ đè.
  const LOAI_DN = {
    o_dien: { ten: 'Ổ điện', ky: 'Ổ', nhom: 'dien', cao: 300, rong: 120, cao_o: 80 },
    cong_tac: { ten: 'Công tắc', ky: 'CT', nhom: 'dien', cao: 1250, rong: 120, cao_o: 80 },
    cap_nuoc: { ten: 'Cấp nước', ky: 'CN', nhom: 'cap', cao: 550, rong: 60, tron: true },
    thoat_nuoc: { ten: 'Thoát nước', ky: 'TN', nhom: 'thoat', cao: 400, rong: 90, tron: true },
    khac: { ten: 'Điểm khác', ky: 'Đ', nhom: 'khac', cao: 300, rong: 120, cao_o: 120 },
    thoat_san: { ten: 'Thoát sàn', ky: 'TS', nhom: 'thoat', san: true, ra: 300, rong: 110, tron: true },
    ong_san: { ten: 'Ống chờ sàn', ky: 'ÔS', nhom: 'thoat', san: true, ra: 150, rong: 90, tron: true },
  };
  const MAU_DN = { dien: '#c26a00', cap: '#0a84c4', thoat: '#7a4a21', khac: '#6b46a8' };

  /** Phòng mẫu: 3600 × 3000, trần 2700, cửa đi ở tường C. Tường cuối để 'auto' = tự tính cho phòng khép kín. */
  const macDinh = () => ({
    ban: BAN, ten: 'Phòng ngủ', cao: 2700, day: 110,
    tuong: [{ ten: 'A', dai: 3600, re: 90 }, { ten: 'B', dai: 3000, re: 90 }, { ten: 'C', dai: 3600, re: 90 }, { ten: 'D', dai: 'auto', re: 90 }],
    mo: [{ tuong: 2, loai: 'cua', cach: 200, rong: 900, cao: 2200, be: 0 }],
    can: [],
    dn: [],
    khung: [],
  });

  function chuanHoa(pIn) {
    const p = pIn && typeof pIn === 'object' ? clone(pIn) : macDinh();
    const o = { ban: BAN, ten: String(p.ten || 'Phòng').slice(0, 60), cao: Math.max(0, num(p.cao, 2700)), day: Math.max(10, num(p.day, 110)) };      // day = bề dày tường khi vẽ vào Chenfeng (nằm ngoài lòng phòng)
    o.tuong = (Array.isArray(p.tuong) ? p.tuong : []).map((t, i) => {
      t = t || {};
      const auto = t.dai === 'auto' || t.dai === '' || t.dai === null || t.dai === undefined;
      const w = { ten: String(t.ten || tenTuong(i)).slice(0, 12), dai: auto ? 'auto' : Math.max(0, num(t.dai, 0)), re: num(t.re, 90) };
      if (num(t.cao, 0) > 0) w.cao = num(t.cao, 0);      // tường thấp hơn trần chung (vd lan can, vách lửng)
      return w;
    });
    let daCo = false;      // chỉ một tường được 'auto' (tường 'auto' cuối cùng); các tường 'auto' khác tính là 0
    for (let i = o.tuong.length - 1; i >= 0; i--) if (o.tuong[i].dai === 'auto') { if (daCo) o.tuong[i].dai = 0; daCo = true; }
    const n = o.tuong.length, iT = v => Math.min(Math.max(0, Math.round(num(v, 0))), Math.max(0, n - 1));
    o.mo = (Array.isArray(p.mo) ? p.mo : []).map(m => ({ tuong: iT(m.tuong), loai: LOAI_MO[m.loai] ? m.loai : 'cua', cach: num(m.cach, 0), rong: Math.max(0, num(m.rong, 900)), cao: Math.max(0, num(m.cao, 2200)), be: Math.max(0, num(m.be, 0)) }));
    o.can = (Array.isArray(p.can) ? p.can : []).map(c => {
      const loai = LOAI_CAN[c.loai] ? c.loai : 'cot';
      return { tuong: iT(c.tuong), loai, cach: num(c.cach, 0), rong: Math.max(0, num(c.rong, 300)), nho: Math.max(0, num(c.nho, 200)), z0: Math.max(0, num(c.z0, loai === 'dam' ? Math.max(0, o.cao - 300) : 0)), z1: Math.max(0, num(c.z1, o.cao)) };
    });
    o.dn = (Array.isArray(p.dn) ? p.dn : []).filter(d => d && typeof d === 'object').map(d => {
      const loai = LOAI_DN[d.loai] ? d.loai : 'o_dien', L = LOAI_DN[loai], q = { tuong: iT(d.tuong), loai, cach: num(d.cach, 0) };
      if (L.san) q.ra = Math.max(0, num(d.ra, L.ra)); else q.cao = Math.max(0, num(d.cao, L.cao));
      // cỡ ô chỉ giữ khi khác cỡ mặc định của loại (đổi loại thì cỡ đi theo loại mới)
      const r = num(d.rong, 0), c = num(d.cao_o, 0);
      if (r > 0 && r !== L.rong) q.rong = r;
      if (!L.tron && c > 0 && c !== L.cao_o) q.cao_o = c;
      if (d.ghi) q.ghi = String(d.ghi).slice(0, 40);
      return q;
    });
    o.khung = (Array.isArray(p.khung) ? p.khung : []).map((k, i) => {
      // (1.41.0) khung đặt trên MẶT NGOÀI vách phòng con: tuong = chuỗi mã mặt 'PC1.truoc' (không iT); mặt còn hay không thì hinhHoc báo
      const q = { ten: String(k.ten || 'K' + (i + 1)).slice(0, 24), tuong: RE_MAT.test(String(k.tuong)) ? String(k.tuong) : iT(k.tuong), cach: num(k.cach, 0), z: Math.max(0, num(k.z, 0)), rong: Math.max(0, num(k.rong, 1000)), cao: Math.max(0, num(k.cao, o.cao)), sau: Math.max(0, num(k.sau, 600)), mau: String(k.mau || ''), ghi_chu: String(k.ghi_chu || '').slice(0, 200) };
      if (k.tu_id) q.tu_id = String(k.tu_id);      // mã của tủ đã vẽ vào khung này (để biết khung nào đã vẽ)
      // bản 1.19 — khung đặt MẪU KHO Chenfeng thay cho tủ tự chia khoang: kieu = 'kho', kho = mẫu đã chọn (mã mẫu trong kho của tài khoản, tên, ảnh nhỏ, kích thước mặc định)
      if (k.kieu === 'kho') {
        q.kieu = 'kho';
        const m = k.kho, id = m && Math.round(num(m.id, 0));
        if (id > 0) { q.kho = { id, ten: String(m.ten || '').slice(0, 60), hinh: String(m.hinh || '').slice(0, 300) }; if (Array.isArray(m.kt) && m.kt.length === 3 && m.kt.every(v => num(v, 0) > 0)) q.kho.kt = m.kt.map(v => num(v, 0)); }
        if (k.nhom) q.nhom = String(k.nhom).slice(0, 24);      // nhóm mẫu đang xem cho khung này (tủ áo, tủ tivi…) — chỉ để bảng mở lại đúng nhóm
      }
      return q;
    });
    // PHÒNG CON (bản 1.41.0): khoá `con` / `dem_con` chỉ ghi khi có — phòng 1.40.2 chuẩn hoá ra đúng từng byte như cũ
    {
      const ds = (Array.isArray(p.con) ? p.con : []).filter(c => c && typeof c === 'object').slice(0, 20);
      let dem = Number.isInteger(p.dem_con) && p.dem_con > 0 && p.dem_con < 1000 ? p.dem_con : 0;
      for (const c of ds) { const m = /^PC(\d{1,3})$/.exec(typeof c.id === 'string' ? c.id : ''); if (m) dem = Math.max(dem, +m[1]); }
      const da = new Set();
      const con = ds.map(c => {
        let id = typeof c.id === 'string' && /^PC\d{1,3}$/.test(c.id) && !da.has(c.id) ? c.id : '';
        if (!id) { do dem++; while (da.has('PC' + dem)); id = 'PC' + dem; }
        da.add(id);
        const q = { id, ten: String(c.ten || 'WC').slice(0, 24), tuong: iT(c.tuong) };
        if (c.ap === 'dau' || c.ap === 'cuoi') q.ap = c.ap;
        q.cach = num(c.cach, 0); q.rong = Math.max(0, num(c.rong, 1500)); q.sau = Math.max(0, num(c.sau, 1800)); q.day = Math.max(10, num(c.day, 100));
        const ca = num(c.cao, 0); if (ca > 0 && ca !== o.cao) q.cao = ca;      // vách lửng; thiếu = cao tới trần
        q.cua = (Array.isArray(c.cua) ? c.cua : []).filter(d => d && typeof d === 'object').slice(0, CUA_CON_MAX).map(d => ({ mat: MAT_CON.indexOf(d.mat) >= 0 ? d.mat : 'truoc', cach: num(d.cach, 0), rong: Math.max(0, num(d.rong, 830)), cao: Math.max(0, num(d.cao, 2200)), be: Math.max(0, num(d.be, 0)), mo: d.mo === 'ngoai' ? 'ngoai' : 'trong', ban: d.ban === 'phai' ? 'phai' : 'trai' }));
        return q;
      });
      if (con.length) o.con = con;
      if (con.length || Number.isInteger(p.dem_con)) o.dem_con = dem;      // xoá hết phòng con vẫn nhớ mã đã cấp (khung cũ còn nhớ mã mặt)
    }
    if (Array.isArray(p.goc) && p.goc.length === 3) o.goc = p.goc.map(v => num(v, 0));      // điểm đặt đầu tường A trong bản vẽ Chenfeng
    const dv = chuanDaVe(p.da_ve); if (dv) o.da_ve = dv;      // bản ghi lần vẽ phòng này vào Chenfeng gần nhất (bản 1.23) — xem banGhiPhong
    // NHÀ NHIỀU PHÒNG (bản 1.36): các khoá chỉ ghi khi có — phòng 1.35 chuẩn hoá ra đúng từng byte như cũ
    if (typeof p.id === 'string' && ID_PH.test(p.id)) o.id = p.id;      // mã phòng trong công trình (khung, tủ, bản ghi lần vẽ nhớ phòng theo mã này)
    const hg = chuanHuong(p.huong); if (hg) o.huong = hg;      // hướng chạy của tường A trong bản vẽ (độ, ngược kim đồng hồ); phòng ghép: datNha tính rồi ghi vào
    if (p.ghep && typeof p.ghep === 'object' && ID_PH.test(String(p.ghep.phong || '')) && n) {
      const t = Math.round(num(p.ghep.tuong, -1));      // tường của phòng ĐÍCH — chưa biết phòng đích có bao nhiêu tường: datNha soát
      if (t >= 0) o.ghep = { phong: p.ghep.phong, tuong: t, tuong_minh: iT(p.ghep.tuong_minh), cach: num(p.ghep.cach, 0) };
    }
    if (typeof p.nguon_do === 'string' && p.nguon_do) o.nguon_do = p.nguon_do.slice(0, 80);      // phòng này lấy từ phòng đã đo nào (máy đo)
    return o;
  }
  const ID_PH = /^P\d{1,4}$/, ID_CT = /^C\d{1,4}$/;
  // (1.41.0) phòng con: mã mặt ngoài vách 'PC1.truoc' (khung đặt trên mặt đó mang mã này ở `tuong`); [CĐ] tối đa 6 cửa mỗi phòng con
  const RE_MAT = /^PC\d{1,3}\.(trai|truoc|phai)$/, MAT_CON = ['trai', 'truoc', 'phai'], TEN_MAT = { trai: 'trái', truoc: 'trước', phai: 'phải' }, CUA_CON_MAX = 6;
  /** Tường (số) hoặc mặt ngoài vách phòng con (chuỗi mã) của hình H — null khi không có. */
  function tuongTheoMa(H, k) {
    if (!H) return null;
    if (typeof k === 'string' && !/^\d+$/.test(k)) return (H.vach || []).find(f => f.i === k) || null;
    return (H.tuong && H.tuong[+k]) || null;
  }
  /** Góc về khoảng (−180, 180]; không phải số → 0. */
  function chuanHuong(v) {
    const x = num(v, NaN); if (!isFinite(x)) return 0;
    let a = ((x % 360) + 360) % 360; if (a > 180) a -= 360;
    a = rn(a, 6); return Math.abs(a) < 1e-9 ? 0 : a;
  }
  const so6 = a => Array.isArray(a) && a.length === 6 && a.every(v => typeof v === 'number' && isFinite(v));
  function chuanDaVe(v) {
    if (!v || typeof v !== 'object' || !Array.isArray(v.tuong)) return undefined;
    const dsT = ds => (Array.isArray(ds) ? ds : []).filter(r => Array.isArray(r) && r.length === 7 && r.every(x => typeof x === 'number' && isFinite(x))).map(r => r.slice());
    const tuong = dsT(v.tuong), muon = dsT(v.muon), giu = dsT(v.giu), vach = dsT(v.vach);
    const muc = ds => (Array.isArray(ds) ? ds : []).filter(r => r && so6(r.m)).map(r => (so6(r.t) ? { m: r.m.slice(), t: r.t.slice() } : { m: r.m.slice() }));
    const o = { tuong, mo: muc(v.mo), cot: muc(v.cot), dam: muc(v.dam) };
    if (muon.length) o.muon = muon; if (giu.length) o.giu = giu; if (vach.length) o.vach = vach; if (v.manh === 1) o.manh = 1;      // (1.41.0) vach = vách ngăn phòng con lần đó dựng · (1.36) tường chung giữ của phòng bên / tường giữ hộ phòng bên — xem banGhiPhong
    if (so6(v.dn)) { o.dn = v.dn.slice(); if (typeof v.dn_ma === 'string' && v.dn_ma) o.dn_ma = v.dn_ma.slice(0, 24); if (Number.isInteger(v.dn_so) && v.dn_so > 0) o.dn_so = v.dn_so; }
    return tuong.length || muon.length || giu.length || vach.length || o.mo.length || o.cot.length || o.dam.length || o.dn ? o : undefined;
  }

  /* ---------------- hình học ---------------- */
  // tên lỗ cửa viết thường giữa câu; lỗ bóng giữ nguyên tên phòng ("cửa đi của Phòng ngủ")
  const thuong = m => (m.chung || m.phu ? String(m.ten).charAt(0).toLowerCase() + String(m.ten).slice(1) : String(m.ten).toLowerCase());
  const cong = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const nhan = (a, k) => [a[0] * k, a[1] * k];
  const cham = (a, b) => a[0] * b[0] + a[1] * b[1];
  const sach = v => (Math.abs(v) < 1e-9 ? 0 : v);

  // (1.41.0) điểm trong đa giác (chẵn – lẻ); đoạn [a, b] cắt NGANG một cạnh của đa giác lồi P (chạm / trùng đường không tính); tia o + d·t gặp đoạn [a, b] ở t nào (Infinity = không gặp)
  function trongDa(q, P) { let c = false; for (let i = 0, k = P.length - 1; i < P.length; k = i++) { const a = P[i], b = P[k]; if ((a[1] > q[1]) !== (b[1] > q[1]) && q[0] < (b[0] - a[0]) * (q[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
  function catNhau(P, ab) {
    const T = 0.5, ben = (a, b, q) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return ((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0])) / L; }, [c, d] = ab;
    for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length], u = ben(a, b, c), v = ben(a, b, d), x = ben(c, d, a), y = ben(c, d, b); if (u * v < 0 && Math.abs(u) > T && Math.abs(v) > T && x * y < 0 && Math.abs(x) > T && Math.abs(y) > T) return true; }
    return false;
  }
  function catTia(o, d, a, b) {
    const ex = b[0] - a[0], ey = b[1] - a[1], de = d[0] * ey - d[1] * ex; if (Math.abs(de) < 1e-9) return Infinity;
    const t = ((a[0] - o[0]) * ey - (a[1] - o[1]) * ex) / de, u = ((a[0] - o[0]) * d[1] - (a[1] - o[1]) * d[0]) / de;
    return u >= -1e-6 && u <= 1 + 1e-6 ? t : Infinity;
  }
  const p0Ap = (H, j) => !!(H.p.con && H.p.con[j] && H.p.con[j].ap);      // phòng con đang áp góc: "cách đầu" do bảng tính, không sửa trên hình
  /** Hai đa giác lồi có chồng lên nhau không (chạm mép không tính; lấn dưới `eps` mm không tính). */
  function giao(A, B, eps) {
    eps = eps === undefined ? 0.5 : eps;
    for (const P of [A, B]) for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length], ax = [-(b[1] - a[1]), b[0] - a[0]], L = Math.hypot(ax[0], ax[1]);
      if (L < 1e-9) continue;
      const u = [ax[0] / L, ax[1] / L];
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const q of A) { const t = cham(q, u); a0 = Math.min(a0, t); a1 = Math.max(a1, t); }
      for (const q of B) { const t = cham(q, u); b0 = Math.min(b0, t); b1 = Math.max(b1, t); }
      if (a1 - b0 <= eps || b1 - a0 <= eps) return false;
    }
    return true;
  }

  /**
   * @returns {{p, tuong:[{i,ten,dai,cao,a,d,n,p0,p1,tu_tinh}], khep:{kin,ho,dx,dy,tong_re}, dien_tich, chu_vi, hop, loi:[], luu_y:[], ghi_chu:[]}}
   *   d = hướng chạy của tường, n = hướng vào lòng phòng. Điểm trên tường: p0 + d·s + n·t (s = cách đầu trái, t = nhô vào phòng).
   */
  function hinhHoc(pIn, nc) {
    // nc (bản 1.36) = ngữ cảnh nhà (nguCanh): { day: { i: dày tường chung — tường i là tường KHÁCH, vẽ theo dày của phòng chủ }, mo_chung: [lỗ bóng — cửa của phòng bên trên tường chung] }
    const p = chuanHoa(pIn), loi = [], luu_y = [], ghi_chu = [];
    const W = []; let a = p.huong || 0;
    p.tuong.forEach((t, i) => {
      const r = a * Math.PI / 180, d = [sach(Math.cos(r)), sach(Math.sin(r))];
      W.push({ i, ten: t.ten, dai: t.dai, cao: t.cao > 0 ? Math.min(t.cao, p.cao || t.cao) : p.cao, a, d, n: [d[1], sach(-d[0])], tu_tinh: false });
      a -= t.re;
    });
    if (nc && nc.day) W.forEach(w => { const d = num(nc.day[w.i], 0); if (d > 0) w.day = d; });
    const tongRe = p.tuong.reduce((s, t) => s + t.re, 0);
    // tường 'auto': dài sao cho điểm cuối về sát điểm đầu nhất
    const k = W.findIndex(w => w.dai === 'auto');
    if (k >= 0) {
      let S = [0, 0]; for (const w of W) if (w.i !== k) S = cong(S, nhan(w.d, w.dai));
      const L = -cham(S, W[k].d);
      W[k].tu_tinh = true;
      if (W.length < 3) { W[k].dai = 0; loi.push(`Tường ${W[k].ten} để tự tính nhưng phòng mới có ${W.length} tường — gõ chiều dài cho tường này.`); }
      else if (L > 0.5) W[k].dai = rn(L, 1);
      else { W[k].dai = 0; loi.push(`Không tự tính được chiều dài tường ${W[k].ten}: các tường còn lại không để chừa chỗ cho nó (kiểm tra chiều dài và hướng rẽ).`); }
    }
    let P = [0, 0];
    for (const w of W) { w.p0 = [rn(P[0], 3), rn(P[1], 3)]; P = cong(P, nhan(w.d, w.dai)); w.p1 = [rn(P[0], 3), rn(P[1], 3)]; if (!(w.dai > 0) && !w.tu_tinh) loi.push(`Tường ${w.ten} chưa có chiều dài.`); }
    const ho = Math.hypot(P[0], P[1]);
    const khep = { kin: W.length >= 3 && ho < 1 && Math.abs(tongRe - 360) < 0.01, ho: rn(ho, 1), dx: rn(-P[0], 1), dy: rn(-P[1], 1), tong_re: rn(tongRe, 2) };
    if (W.length >= 3 && !khep.kin) {
      if (Math.abs(tongRe - 360) >= 0.01) luu_y.push(`Phòng chưa khép kín: tổng các góc rẽ là ${g(tongRe)}° (phòng kín phải đủ 360°). Kiểm tra cột "Rẽ" của từng tường.`);
      else {
        // chỉ rõ lệch theo cặp tường nào: chiếu khe hở lên hướng từng tường
        const goi = W.filter(w => Math.abs(cham([khep.dx, khep.dy], w.d)) > 0.5).map(w => { const v = cham([khep.dx, khep.dy], w.d); return `${w.ten} ${v > 0 ? 'thiếu' : 'thừa'} ${g(Math.abs(v))}`; });
        luu_y.push(`Phòng chưa khép kín: điểm cuối cách điểm đầu ${g(ho)} mm${goi.length ? ` (để khép: tường ${goi.slice(0, 4).join(', hoặc tường ')})` : ''}. Đo lại, hoặc để trống chiều dài một tường để tự tính.`);
      }
    }
    let dt = 0, cv = 0; const hop = { x0: 0, x1: 0, y0: 0, y1: 0 };
    W.forEach(w => { dt += w.p0[0] * w.p1[1] - w.p1[0] * w.p0[1]; cv += w.dai; for (const q of [w.p0, w.p1]) { hop.x0 = Math.min(hop.x0, q[0]); hop.x1 = Math.max(hop.x1, q[0]); hop.y0 = Math.min(hop.y0, q[1]); hop.y1 = Math.max(hop.y1, q[1]); } });
    const H = { p, tuong: W, khep, dien_tich: khep.kin ? rn(Math.abs(dt) / 2, 0) : 0, chu_vi: rn(cv, 1), hop, loi, luu_y, ghi_chu };
    if (!W.length) { loi.push('Chưa có tường nào.'); return H; }
    if (!(p.cao > 0)) loi.push('Chưa có chiều cao trần.');

    // vùng chiếm chỗ: [s0, s1] dọc tường, [0, t] vào phòng, [z0, z1] theo cao
    const vung = (w, s0, s1, t) => [cong(cong(w.p0, nhan(w.d, s0)), nhan(w.n, 0)), cong(w.p0, nhan(w.d, s1)), cong(cong(w.p0, nhan(w.d, s1)), nhan(w.n, t)), cong(cong(w.p0, nhan(w.d, s0)), nhan(w.n, t))];
    const zGiao = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0) > 0.5;
    const trong = (ten, w, cach, rong) => { if (cach < -0.05 || cach + rong > w.dai + 0.05) { loi.push(`${ten} vượt ra ngoài tường ${w.ten} (tường dài ${g(w.dai)}, ${ten.toLowerCase().indexOf('khung') === 0 ? 'khung' : 'nó'} chiếm ${g(cach)} → ${g(cach + rong)}).`); return false; } return true; };
    // PHÒNG CON (bản 1.41.0 — anh Thanh 04/11/2026: "trong các phòng đều có nvs và cửa làm thêm các phòng con và cửa phụ"): ô chữ nhật áp tường chính.
    // rong × sau = LÒNG phòng con (thông thuỷ); vách dày `day` nằm NGOÀI lòng (phía phòng chính) như tường phòng. Áp góc thì tường kề làm mặt đó.
    // Mỗi mặt ngoài vách (phía phòng chính) là một "tường" để đặt tủ: cùng dạng với W[i] (p0, d, n, dai, cao, a), mã chuỗi 'PC1.truoc'.
    const con = [], vach = [];
    (p.con || []).forEach((c, j) => {
      const w = W[c.tuong], nW = W.length, L = w.dai, R = c.rong, S = c.sau, v = c.day;
      const a = c.ap === 'dau' ? 0 : c.ap === 'cuoi' ? rn(L - R, 1) : c.cach;
      const traiCo = a > 0.05, phaiCo = a + R < L - 0.05, vL = traiCo ? v : 0, vR = phaiCo ? v : 0, caoV = c.cao > 0 ? c.cao : w.cao;
      const Q = (s, t) => { const q = cong(cong(w.p0, nhan(w.d, s)), nhan(w.n, t)); return [rn(q[0], 3), rn(q[1], 3)]; };
      const hcn = (s0, s1, t0, t1) => [Q(s0, t0), Q(s1, t0), Q(s1, t1), Q(s0, t1)];
      const am = q => [sach(-q[0]), sach(-q[1])];
      const truocW = W[(c.tuong - 1 + nW) % nW], sauW = W[(c.tuong + 1) % nW], ten = c.ten;
      const md = {};
      if (traiCo) md.trai = { p0: Q(a - v, 0), d: w.n, n: am(w.d), dai: S + v, a: w.a - 90, ke: [w.ten, `${ten}·${TEN_MAT.truoc}`], lo: 0, hi: S };
      md.truoc = { p0: Q(a - vL, S + v), d: w.d, n: w.n, dai: R + vL + vR, a: w.a, ke: [traiCo ? `${ten}·${TEN_MAT.trai}` : truocW.ten, phaiCo ? `${ten}·${TEN_MAT.phai}` : sauW.ten], lo: vL, hi: vL + R };
      if (phaiCo) md.phai = { p0: Q(a + R + v, S + v), d: am(w.n), n: w.d, dai: S + v, a: w.a + 90, ke: [`${ten}·${TEN_MAT.truoc}`, w.ten], lo: v, hi: S + v };
      const mat = { trai: null, truoc: null, phai: null };
      for (const k of MAT_CON) {
        const m = md[k]; if (!m) continue;
        const f = { i: `${c.id}.${k}`, ten: `${ten}·${TEN_MAT[k]}`, dai: rn(m.dai, 1), cao: caoV, a: m.a, d: m.d, n: m.n, p0: m.p0, p1: [rn(m.p0[0] + m.d[0] * m.dai, 3), rn(m.p0[1] + m.d[1] * m.dai, 3)], day: v, tu_tinh: false, vach: { con: j, id: c.id, mat: k, lo: rn(m.lo, 1), hi: rn(m.hi, 1) }, ke: m.ke };
        mat[k] = f; vach.push(f);
      }
      const bang = { trai: traiCo ? hcn(a - v, a, 0, S + v) : null, truoc: hcn(a, a + R, S, S + v), phai: phaiCo ? hcn(a + R, a + R + v, 0, S + v) : null };
      // chuỗi mặt TRONG vách (đưa cho lệnh tường): đi quanh lòng phòng con theo chiều kim đồng hồ (lòng bên phải hướng đi) → bề dày bên trái = phía phòng chính
      const chuoi = [];
      if (phaiCo) chuoi.push(['phai', Q(a + R, 0), Q(a + R, S)]);
      chuoi.push(['truoc', Q(a + R, S), Q(a, S)]);
      if (traiCo) chuoi.push(['trai', Q(a, S), Q(a, 0)]);
      con.push({ j, id: c.id, ten, tuong: c.tuong, w, a: rn(a, 1), R, S, v, cao: caoV, trai: traiCo, phai: phaiCo, vL, vR, long: hcn(a, a + R, 0, S), ve: hcn(a - vL, a + R + vR, 0, S + v), bang, chuoi, mat, cua: [] });
    });
    const wCua = k => (typeof k === 'string' ? vach.find(f => f.i === k) || null : W[k]);
    const mo = p.mo.map((m, j) => { const w = W[m.tuong]; return Object.assign({ j, w, ten: `${LOAI_MO[m.loai]} ${j + 1}`, poly: vung(w, m.cach, m.cach + m.rong, 60), z0: m.be, z1: m.be + m.cao }, m); });
    const can = p.can.map((c, j) => { const w = W[c.tuong]; return Object.assign({ j, w, ten: `${LOAI_CAN[c.loai]} ${j + 1}`, poly: vung(w, c.cach, c.cach + c.rong, c.nho) }, c); });
    const kh = p.khung.map((q, j) => { const w = wCua(q.tuong); return Object.assign({ j, w, poly: w ? vung(w, q.cach, q.cach + q.rong, q.sau) : null, z0: q.z, z1: q.z + q.cao }, q); });
    for (const m of mo) {
      if (!(m.rong > 0) || !(m.cao > 0)) loi.push(`${m.ten} (tường ${m.w.ten}) chưa có rộng / cao.`);
      trong(m.ten, m.w, m.cach, m.rong);
      if (m.z1 > m.w.cao + 0.05) loi.push(`${m.ten} (tường ${m.w.ten}) cao tới +${g(m.z1)}, vượt trần ${g(m.w.cao)}.`);
    }
    for (let i = 0; i < mo.length; i++) for (let j = i + 1; j < mo.length; j++) if (mo[i].tuong === mo[j].tuong && giao(mo[i].poly, mo[j].poly) && zGiao(mo[i].z0, mo[i].z1, mo[j].z0, mo[j].z1)) luu_y.push(`${mo[i].ten} và ${mo[j].ten} trên tường ${mo[i].w.ten} chồng lên nhau.`);
    // LỖ BÓNG (bản 1.36): cửa của phòng bên trên tường chung — chặn chỗ đặt tủ, khung che thì báo, hiện trên mặt đứng; KHÔNG vẽ ở phòng này (phanPhong bỏ), không soát số đo (phòng chủ soát)
    for (const m of (nc && Array.isArray(nc.mo_chung) ? nc.mo_chung : [])) {
      const w = m && W[m.tuong]; if (!w || !m.chung) continue;
      const q = { tuong: m.tuong, loai: LOAI_MO[m.loai] ? m.loai : 'cua', cach: num(m.cach, 0), rong: Math.max(0, num(m.rong, 0)), cao: Math.max(0, num(m.cao, 0)), be: Math.max(0, num(m.be, 0)), chung: m.chung };
      mo.push(Object.assign({ j: mo.length, w, ten: `${LOAI_MO[q.loai]} của ${m.chung.ten || m.chung.phong}`, poly: vung(w, q.cach, q.cach + q.rong, 60), z0: q.be, z1: q.be + q.cao }, q));
    }
    // CỬA PHỤ (1.41.0): cửa của phòng con trên mặt ngoài vách — vào H.mo (chặn chỗ đặt tủ, khung che thì báo, mặt đứng, vẽ lỗ) với `phu` = { con, k }; `cach` đo trên mặt ngoài từ p0
    const nMoChinh = mo.length;
    con.forEach((c, j) => p.con[j].cua.forEach((d, k) => {
      const f = c.mat[d.mat], ten = `Cửa ${c.ten} ${k + 1}`;
      if (!f) { loi.push(`${ten} nằm trên mặt ${TEN_MAT[d.mat]} của ${c.ten} — mặt đó không có (${c.ten} áp góc ${d.mat === 'trai' ? 'đầu' : 'cuối'} tường ${c.w.ten}). Chọn mặt khác cho cửa.`); return; }
      const m = { j: mo.length, w: f, tuong: f.i, loai: 'cua', ten, poly: vung(f, d.cach, d.cach + d.rong, 60), z0: d.be, z1: d.be + d.cao, phu: { con: j, k }, cach: d.cach, rong: d.rong, cao: d.cao, be: d.be, mo: d.mo, ban: d.ban };
      c.cua.push(m); mo.push(m);
      if (!(d.rong > 0) || !(d.cao > 0)) loi.push(`${ten} chưa có rộng / cao.`);
      else if (d.cach < f.vach.lo - 0.05 || d.cach + d.rong > f.vach.hi + 0.05) loi.push(`${ten} chạm góc vách (mặt ${TEN_MAT[d.mat]} ${c.ten} chỉ từ ${g(f.vach.lo)} tới ${g(f.vach.hi)}, cửa chiếm ${g(d.cach)} → ${g(d.cach + d.rong)}).`);
      if (d.be + d.cao > c.cao + 0.05) loi.push(`${ten} cao tới +${g(d.be + d.cao)}, vượt vách ${c.ten} cao ${g(c.cao)}.`);
    }));
    for (let i = nMoChinh; i < mo.length; i++) for (let k = i + 1; k < mo.length; k++) if (mo[i].tuong === mo[k].tuong && giao(mo[i].poly, mo[k].poly) && zGiao(mo[i].z0, mo[i].z1, mo[k].z0, mo[k].z1)) luu_y.push(`${mo[i].ten} và ${mo[k].ten} trên mặt ${mo[i].w.ten} chồng lên nhau.`);
    for (const c of can) {
      if (!(c.rong > 0) || !(c.nho > 0)) loi.push(`${c.ten} (tường ${c.w.ten}) chưa có rộng / độ nhô.`);
      trong(c.ten, c.w, c.cach, c.rong);
      if (c.z1 <= c.z0) loi.push(`${c.ten} (tường ${c.w.ten}): cao độ trên phải lớn hơn cao độ dưới.`);
    }
    for (const q of kh) {
      const ten = `Khung ${q.ten}`;
      if (!q.w) { const m = /^(PC\d+)\.(\w+)$/.exec(String(q.tuong)) || [], c = con.find(x => x.id === m[1]); loi.push(`${ten} nằm trên ${c ? `${c.ten}·${TEN_MAT[m[2]] || m[2]}` : `mặt vách ${q.tuong}`} — mặt đó không còn (${c ? `${c.ten} đã áp góc` : 'phòng con đã bỏ'}). Chuyển khung sang tường khác.`); continue; }
      if (!(q.rong > 0) || !(q.cao > 0) || !(q.sau > 0)) { loi.push(`${ten} chưa đủ rộng / cao / sâu.`); continue; }
      trong(ten, q.w, q.cach, q.rong);
      if (q.z1 > q.w.cao + 0.05) loi.push(`${ten} cao tới +${g(q.z1)}, vượt trần ${g(q.w.cao)} của tường ${q.w.ten}.`);
      for (const m of mo) if (giao(q.poly, m.poly) && zGiao(q.z0, q.z1, m.z0, m.z1)) luu_y.push(m.tuong === q.tuong ? `${ten} che ${thuong(m)} trên tường ${m.w.ten}.` : `${ten} (sâu ${g(q.sau)}) chắn ${thuong(m)} ở tường ${m.w.ten} sát góc.`);
      for (const c of can) if (giao(q.poly, c.poly) && zGiao(q.z0, q.z1, c.z0, c.z1)) {
        if (q.kieu === 'kho') { luu_y.push(`${ten} (mẫu kho) vướng ${c.ten.toLowerCase()} ở tường ${c.w.ten} (${g(c.rong)} × nhô ${g(c.nho)}) — mẫu kho không khấu cột được: thu / dời khung cho né ra, hoặc đổi khung sang tủ tự chia khoang.`); continue; }
        const vc = viTriCot(q, c);
        if (vc && vc.vi_tri !== 'giua') { ghi_chu.push(`${ten}: ${c.ten.toLowerCase()} trùm đầu ${vc.vi_tri === 'trai' ? 'trái' : 'phải'} khung (${g(vc.rong)} × sâu ${g(vc.sau)}) — tủ vẽ vào khung này sẽ được KHẤU CỘT.`); continue; }
        if (vc && vc.sat_tuong) { ghi_chu.push(`${ten}: ${c.ten.toLowerCase()} nằm giữa khung (cách đầu trái ${g(vc.cach)}, ${g(vc.rong)} × sâu ${g(vc.sau)}) — tủ vẽ vào khung này sẽ được KHẤU CỘT GIỮA (cột nằm trong khoang, khoang giữ nguyên).`); continue; }
        const goi = c.loai === 'dam' && c.z0 > q.z0 + 300 ? ` Hạ khung xuống còn cao ${g(c.z0 - q.z0)} hoặc làm tủ né dầm.` : '';
        luu_y.push(`${ten} vướng ${c.ten.toLowerCase()} ở tường ${c.w.ten} (${g(c.rong)} × nhô ${g(c.nho)}, +${g(c.z0)} → +${g(c.z1)}).${goi}`);
      }
    }
    for (let i = 0; i < kh.length; i++) for (let j = i + 1; j < kh.length; j++) if (kh[i].rong > 0 && kh[j].rong > 0 && kh[i].poly && kh[j].poly && giao(kh[i].poly, kh[j].poly) && zGiao(kh[i].z0, kh[i].z1, kh[j].z0, kh[j].z1))
      loi.push(kh[i].tuong === kh[j].tuong ? `Khung ${kh[i].ten} và khung ${kh[j].ten} trên tường ${kh[i].w.ten} chồng lên nhau.` : `Khung ${kh[i].ten} (tường ${kh[i].w.ten}) và khung ${kh[j].ten} (tường ${kh[j].w.ten}) đâm vào nhau ở góc phòng — lùi một khung ra khỏi góc đúng bằng chiều sâu khung kia.`);
    // PHÒNG CON (1.41.0): kiểm. Ô [CĐ]: dưới 600 là lỗi, dưới 800 × 1000 là lưu ý (anh chỉnh số)
    const dinhL = W.map(w => w.p0);
    con.forEach((c, j) => {
      const L = c.w.dai, ten = c.ten, nW = W.length, iw = c.tuong;
      const reTruoc = (iw > 0 || khep.kin) ? p.tuong[(iw - 1 + nW) % nW].re : null, reSau = (iw < nW - 1 || khep.kin) ? p.tuong[iw].re : null;
      const loi0 = loi.length;
      if (c.a < -0.05 || c.a + c.R > L + 0.05) loi.push(`Phòng con ${ten} ra ngoài tường ${c.w.ten} (tường dài ${g(L)}, ${ten} chiếm ${g(c.a)} → ${g(c.a + c.R)}).`);
      else {
        if (c.a > 0.05 && c.a < c.v - 0.05) loi.push(`Vách trái ${ten} cách góc chỉ ${g(c.a)} — đặt áp góc, hoặc cách từ ${g(c.v)} (dày vách).`);
        const ph = L - c.a - c.R; if (ph > 0.05 && ph < c.v - 0.05) loi.push(`Vách phải ${ten} cách góc chỉ ${g(ph)} — đặt áp góc, hoặc cách từ ${g(c.v)} (dày vách).`);
        if (!c.trai && reTruoc === null) loi.push(`Đầu tường ${c.w.ten} không có tường kề (phòng chưa khép) — chưa đặt ${ten} áp góc đó được: đặt cách đầu tường.`);
        else if (!c.trai && Math.abs(reTruoc - 90) > 0.01) loi.push(`Góc ${W[(iw - 1 + nW) % nW].ten}–${c.w.ten} không vuông: chưa đặt phòng con áp góc được — đặt cách đầu tường.`);
        if (!c.phai && reSau === null) loi.push(`Cuối tường ${c.w.ten} không có tường kề (phòng chưa khép) — chưa đặt ${ten} áp góc đó được: đặt cách đầu tường.`);
        else if (!c.phai && Math.abs(reSau - 90) > 0.01) loi.push(`Góc ${c.w.ten}–${W[(iw + 1) % nW].ten} không vuông: chưa đặt phòng con áp góc được — đặt cách đầu tường.`);
      }
      const hongGoc = loi.length > loi0;
      if (c.R < 600 || c.S < 600) loi.push(`${ten} ${g(c.R)} × ${g(c.S)} quá nhỏ (mỗi chiều lòng phải từ 600).`);
      else if (c.R < 800 || c.S < 1000) luu_y.push(`${ten} ${g(c.R)} × ${g(c.S)} nhỏ hơn cỡ thường (≥ 800 × 1000) [CĐ].`);
      if (p.con[j].cao > p.cao + 0.05) loi.push(`Vách ${ten} cao ${g(p.con[j].cao)}, vượt trần ${g(p.cao)}.`);
      // dấu chân (cả vách) phải nằm trong lòng phòng: góc lùi vào 1 mm nằm trong đa giác, và không cạnh nào của dấu chân cắt ngang tường khác
      if (khep.kin && W.length >= 3 && !hongGoc) {      // đã báo ra ngoài tường / vách đâm vào góc thì thôi
        const tam = [(c.ve[0][0] + c.ve[2][0]) / 2, (c.ve[0][1] + c.ve[2][1]) / 2];
        const lui = c.ve.map(q => { const dx = tam[0] - q[0], dy = tam[1] - q[1], l = Math.hypot(dx, dy) || 1; return [q[0] + dx / l * 1.5, q[1] + dy / l * 1.5]; });
        if (!lui.every(q => trongDa(q, dinhL)) || W.some(w => w.dai > 0 && catNhau(c.ve, [w.p0, w.p1]))) {
          // tường đối diện gần nhất theo hướng vào phòng (đo từ giữa mặt tường chính)
          const o0 = cong(c.w.p0, nhan(c.w.d, c.a + c.R / 2)); let kc = Infinity, wk = null;
          for (const w of W) { if (w === c.w || !(w.dai > 0)) continue; const t = catTia(o0, c.w.n, w.p0, w.p1); if (t > 0.5 && t < kc) { kc = t; wk = w; } }
          loi.push(`${ten} sâu ${g(c.S)} (cả vách ${g(c.S + c.v)}) ra quá lòng phòng${wk ? ` (tường ${wk.ten} chỉ cách tường ${c.w.ten} ${g(kc)})` : ''} — thu sâu / rộng phòng con.`);
        }
      }
      for (let k = j + 1; k < con.length; k++) if (giao(c.ve, con[k].ve)) loi.push(`Phòng con ${ten} và ${con[k].ten} chồng lên nhau.`);
      const bang = MAT_CON.map(k => c.bang[k]).filter(Boolean);
      for (const m of mo) {
        if (m.phu && m.phu.con === j) continue;
        if (bang.some(b => giao(b, m.poly)) && zGiao(m.z0, m.z1, 0, c.cao)) loi.push(`Vách ${ten} đè lên ${thuong(m)} (${m.phu ? 'mặt' : 'tường'} ${m.w.ten}) — dời / thu phòng con.`);
      }
      for (const q of can) {
        if (q.loai === 'dam' || !(q.rong > 0) || !(q.nho > 0)) continue;
        if (bang.some(b => giao(b, q.poly))) loi.push(`Vách ${ten} đè lên ${q.ten.toLowerCase()} (tường ${q.w.ten}) — dời / thu phòng con.`);
        else if (giao(c.long, q.poly)) ghi_chu.push(`${q.ten} nằm trong ${ten}.`);
      }
      // bản này chưa đặt tủ trong lòng phòng con (choTrong không cho) → khung chồng dấu chân là lỗi
      for (const q of kh) if (q.poly && q.rong > 0 && q.sau > 0 && giao(q.poly, c.ve) && zGiao(q.z0, q.z1, 0, c.cao)) loi.push(`Khung ${q.ten} chồng lên phòng con ${ten}.`);
      if (!p.con[j].cua.length) luu_y.push(`${ten} chưa có cửa — thêm cửa ở thẻ phòng con.`);
    });
    // ĐIỆN – NƯỚC (bản 1.18): vị trí trên mặt bằng (P) + cao độ (z), tên đánh số theo từng loại ("Ổ điện 2"), cỡ ô phải khoét
    const dem = {};
    const dn = p.dn.map((d, j) => {
      const w = W[d.tuong], L = LOAI_DN[d.loai], so = dem[d.loai] = (dem[d.loai] || 0) + 1, rong = d.rong > 0 ? d.rong : L.rong;
      const P0 = cong(cong(w.p0, nhan(w.d, d.cach)), nhan(w.n, L.san ? d.ra : 0));
      const ten = d.loai === 'khac' && d.ghi ? `${d.ghi} ${so}` : `${L.ten} ${so}${d.ghi ? ` (${d.ghi})` : ''}`;
      return Object.assign({}, d, { j, w, so, ten, nhan: L.ky + so, nhom: L.nhom, san: !!L.san, tron: !!L.tron, rong, cao_o: L.tron ? rong : (d.cao_o > 0 ? d.cao_o : L.cao_o), P: [rn(P0[0], 2), rn(P0[1], 2)], z: L.san ? 0 : d.cao });
    });
    const trongPhong = q => { let c = false; for (let i = 0, k = W.length - 1; i < W.length; k = i++) { const a1 = W[i].p0, b1 = W[k].p0; if ((a1[1] > q[1]) !== (b1[1] > q[1]) && q[0] < (b1[0] - a1[0]) * (q[1] - a1[1]) / (b1[1] - a1[1]) + a1[0]) c = !c; } return c; };
    for (const d of dn) {
      if (d.cach < -0.05 || d.cach > d.w.dai + 0.05) { loi.push(`${d.ten} nằm ngoài tường ${d.w.ten}: cách đầu trái ${g(d.cach)} mà tường chỉ dài ${g(d.w.dai)}.`); continue; }
      if (d.san) { if (khep.kin && d.ra > 0.5 && !trongPhong(d.P)) luu_y.push(`${d.ten} nằm ngoài lòng phòng (cách tường ${d.w.ten} tới ${g(d.ra)}) — kiểm tra lại số đo.`); continue; }
      if (d.z > d.w.cao + 0.05) loi.push(`${d.ten} (tường ${d.w.ten}) cao +${g(d.z)}, vượt trần ${g(d.w.cao)}.`);
      for (const m of mo) if (m.tuong === d.tuong && d.cach > m.cach + 0.5 && d.cach < m.cach + m.rong - 0.5 && d.z > m.z0 + 0.5 && d.z < m.z1 - 0.5) luu_y.push(`${d.ten} đang nằm giữa ${thuong(m)} của tường ${d.w.ten} — kiểm tra lại “cách trái” / “cao”.`);
    }
    // điện – nước so với phòng con: vách trùm điểm (lưu ý), điểm nằm trong lòng phòng con (ghi chú)
    for (const c of con) for (const d of dn) {
      if (d.cach < -0.05 || d.cach > d.w.dai + 0.05) continue;
      const q = d.san ? d.P : cong(d.P, nhan(d.w.n, 1)), bang = MAT_CON.map(k => c.bang[k]).filter(Boolean);
      if (bang.some(b => trongDa(q, b)) && (d.san || d.z < c.cao)) luu_y.push(`Vách ${c.ten} đè lên ${d.ten.toLowerCase()} (tường ${d.w.ten}) — dời điểm hoặc phòng con.`);
      else if (trongDa(q, c.long)) ghi_chu.push(`${d.ten} (tường ${d.w.ten}) thuộc ${c.ten}.`);
    }
    H.mo = mo; H.can = can; H.khung = kh; H.dn = dn;
    if (con.length) { H.con = con; H.vach = vach; }
    // khung nào che điểm nào (tính theo hộp của khung; mở khung thành tủ thì `dienNuocChoTu` xét tới từng tấm)
    if (dn.length) kh.forEach((q, j) => {
      if (!(q.rong > 0 && q.cao > 0 && q.sau > 0)) return;
      const dk = datKhung(H, j); if (!dk) return;
      const che = diemTrongKhung(H, { goc: dk.goc, xoay: dk.xoay, rong: q.rong, sau: q.sau, cao: q.cao });
      if (!che.length) return;
      const ten = `Khung ${q.ten}`, ds = [];
      for (const c of che) {
        const d = c.d, t = d.ten.toLowerCase(), cao = `cao +${g(d.z)}${q.z > 0.5 ? ` (trên đáy khung ${g(c.z)})` : ''}`;
        if (c.mat === 'lung') ds.push(`${t} sau lưng tủ — cách mép trái khung ${g(c.x)}, ${cao}`);
        else if (c.mat === 'day') ds.push(`${t} dưới đáy tủ — cách mép trái khung ${g(c.x)}, cách tường lưng ${g(q.sau - c.y)}`);
        else ds.push(`${t} (tường ${d.w.ten}) sau hồi ${c.mat === 'trai' ? 'trái' : 'phải'} — cách tường lưng ${g(q.sau - c.y)}, ${cao}`);
        if (d.loai === 'cong_tac') luu_y.push(`${ten} che ${t} — công tắc sẽ không bấm được; dời khung hoặc chuyển công tắc.`);
        else if (d.loai === 'thoat_san') luu_y.push(`${ten} trùm lên ${t} — tủ che mất thoát sàn (nước không thoát, không thông ống được); dời khung hoặc để hở chân tủ chỗ đó.`);
        else if (c.cat) luu_y.push(`${ten}: mép khung cắt ngang ${t} — hồi / nóc tủ sẽ đè lên điểm này; dời khung hoặc dời điểm.`);
      }
      ghi_chu.push(`${ten} che ${che.length} điểm điện – nước: ${ds.join('; ')}. ${q.kieu === 'kho' ? 'Khung đặt mẫu kho: vẽ xong tự khoét tấm che điểm đó trong Chenfeng.' : 'Mở khung thành tủ để xem điểm rơi vào khoang nào, khoét tấm nào.'}`);
    });
    return H;
  }

  /**
   * Điểm điện – nước nào bị một tủ / một khung che (bản 1.18).
   * k = { goc: [x, y, z] góc trái – trước – dưới trong TOẠ ĐỘ BẢN VẼ (như `datKhung` trả về), xoay (độ), rong, sau, cao }.
   * @returns [{ d (phần tử của H.dn), mat: 'lung' | 'trai' | 'phai' | 'day', x, y, z, cat }]
   *   x, y, z = TÂM điểm trong hệ của tủ: x từ mép trái, y từ mặt trước vào lưng, z từ mép dưới. cat = mép tủ cắt ngang ô của điểm (điểm không nằm gọn sau một mặt).
   */
  function diemTrongKhung(H, k, opt) {
    const out = [], o = (H.p && H.p.goc) || [0, 0, 0], a = (k.xoay || 0) * Math.PI / 180, ex = [Math.cos(a), Math.sin(a)], ey = [-Math.sin(a), Math.cos(a)];
    const HO = opt && opt.ho >= 0 ? opt.ho : 60;      // tủ cách mặt tường tới 60 vẫn coi là áp tường đó (phào bên 50, lưng hở kỹ thuật)
    for (const d of H.dn || []) {
      const v = [d.P[0] + o[0] - k.goc[0], d.P[1] + o[1] - k.goc[1]], x = cham(v, ex), y = cham(v, ey), z = d.z + o[2] - k.goc[2], r = d.rong / 2, h = d.cao_o / 2;
      if (d.san) {
        if (Math.abs(z) > 50) continue;      // tủ treo: không che điểm dưới sàn
        if (x + r <= 0.5 || x - r >= k.rong - 0.5 || y + r <= 0.5 || y - r >= k.sau - 0.5) continue;
        out.push({ d, mat: 'day', x: rn(x), y: rn(y), z: 0, cat: x - r < -0.5 || x + r > k.rong + 0.5 || y - r < -0.5 || y + r > k.sau + 0.5 });
        continue;
      }
      if (z + h <= 0.5 || z - h >= k.cao - 0.5) continue;
      const nx = cham(d.w.n, ex), ny = cham(d.w.n, ey), catZ = z - h < -0.5 || z + h > k.cao + 0.5;
      if (ny < -0.99 && Math.abs(y - k.sau) <= HO) {      // tường sau lưng tủ
        if (x + r <= 0.5 || x - r >= k.rong - 0.5) continue;
        out.push({ d, mat: 'lung', x: rn(x), y: rn(k.sau), z: rn(z), cat: catZ || x - r < -0.5 || x + r > k.rong + 0.5 });
      } else if (Math.abs(nx) > 0.99 && Math.abs(x - (nx > 0 ? 0 : k.rong)) <= HO) {      // tường bên: sau hồi trái / phải
        if (y + r <= 0.5 || y - r >= k.sau - 0.5) continue;
        out.push({ d, mat: nx > 0 ? 'trai' : 'phai', x: nx > 0 ? 0 : rn(k.rong), y: rn(y), z: rn(z), cat: catZ || y - r < -0.5 || y + r > k.sau + 0.5 });
      }
    }
    return out;
  }

  /**
   * ĐIỆN – NƯỚC so với TỪNG TẤM của tủ đã dựng (bản 1.18). M = MNCFCore.build(spec); khung = { goc: [x, y, z], xoay } = chỗ đặt tủ trong bản vẽ
   * (góc trái – trước – dưới của cả tủ, đúng như lúc vẽ). Không cần MNCFCore: chỉ đọc M.parts / M.info.
   * @returns {{ diem: [{ j, ten, nhan, nhom, loai, mat, x, y, z (toạ độ thiết kế của tủ), rong, cao, tron, mau, khoang, trung: [tên tấm], hau }], luu_y: string[], ghi_chu: string[] }}
   *   luu_y = điểm trúng vách / đợt / hồi, nằm sau ngăn kéo, công tắc – thoát sàn bị tủ che; ghi_chu = điểm nằm gọn sau hậu / dưới đáy: khoét ở đâu.
   */
  function dienNuocChoTu(M, H, khung) {
    const kq = { diem: [], luu_y: [], ghi_chu: [] }, bb = M && M.info && M.info.hop;
    if (!bb || !H || !(H.dn || []).length || !khung || !Array.isArray(khung.goc)) return kq;
    const k = { goc: khung.goc, xoay: khung.xoay || 0, rong: bb.x1 - bb.x0, sau: bb.y1 - bb.y0, cao: bb.z1 - bb.z0 };
    const o = (H.p && H.p.goc) || [0, 0, 0], chamSan = Math.abs(k.goc[2] - o[2]) < 1;
    const xk = M.info.x_khoang || [], wk = M.info.khoang || [], cells = M.info.o || [];
    const chong = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0) > 0.5;
    // (1.31.1) đáy / nóc liền thùng (phủ hồi) mang den_khoang: ghi cả dải khoang, không chỉ khoang đầu
    const tenTam = q => String(q.ten || q.loai).toLowerCase() + (q.khoang >= 0 && /^(DOT|DAY|NOC|HAU)$/.test(q.loai) ? (q.den_khoang !== undefined && q.den_khoang !== q.khoang ? ` khoang ${q.khoang + 1}–${q.den_khoang + 1}` : ` khoang ${q.khoang + 1}`) : '');
    const khoangCua = x => xk.findIndex((x0, i) => x >= x0 - 0.5 && x <= x0 + wk[i] + 0.5);
    // tấm bị trúng kèm chỗ nó đang đứng (để biết phải kéo đi bao nhiêu): tấm đứng ghi theo chiều ngang, tấm nằm ghi theo cao độ — đều tính từ mép trái / mép dưới tủ
    const choTam = q => `${tenTam(q)} (${/^(HOI|VACH|DEM)$/.test(q.loai) ? `đang ở ${g(q.x0 - bb.x0)} → ${g(q.x1 - bb.x0)}` : `cao ${g(q.z0 - bb.z0)} → ${g(q.z1 - bb.z0)}`})`;
    for (const c of diemTrongKhung(H, k)) {
      const d = c.d, r = d.rong / 2, h = d.cao_o / 2, x = c.x + bb.x0, y = c.y + bb.y0, z = c.z + bb.z0, T = d.ten;
      const it = { j: d.j, ten: T, nhan: d.nhan, nhom: d.nhom, loai: d.loai, mat: c.mat, x: rn(x), y: rn(y), z: rn(z), rong: d.rong, cao: d.cao_o, tron: d.tron, mau: MAU_DN[d.nhom], khoang: -1, trung: [], hau: '' };
      const co = d.tron ? `Ø${g(d.rong)}` : `${g(d.rong)} × ${g(d.cao_o)}`, caoTxt = chamSan ? `cao +${g(d.z)}` : `cao ${g(c.z)} từ mép dưới tủ`;
      if (c.mat === 'lung') {
        it.khoang = khoangCua(x);
        const o2 = cells.find(q => x >= q.x0 - 0.5 && x <= q.x1 + 0.5 && z >= q.z0 - 0.5 && z <= q.z1 + 0.5);
        let hau = null; const cho2 = [], thanh = [];
        // (vòng soát 2 — 1.39.0) THANH NGANG sát lưng chạy suốt bề ngang khoang giữa hai tấm đứng (tủ bếp dưới: thanh sau 160 / giằng sau / đế sau của khung đế,
        // type 2 GIANG / DE — không phải đế hông): không có vách nào để "kéo tránh ra" → khoét chính tấm đó (chữ U khi ô lấn qua mép), như mặt 'day' ở vòng trước
        const laThanh = q => q.type === 2 && (q.loai === 'GIANG' || (q.loai === 'DE' && !q.de_hong));
        for (const q of M.parts) {
          if (q.loai === 'CANH' || !chong(q.x0, q.x1, x - r, x + r) || !chong(q.z0, q.z1, z - h, z + h)) continue;
          if (q.loai === 'HAU' && (!q.van_thung || q.ad)) { if (!hau || (x >= q.x0 && x <= q.x1 && z >= q.z0 && z <= q.z1)) hau = q; continue; }
          if (q.y1 < bb.y1 - 40) continue;      // tấm không ra tới lưng tủ (chân trước, phào, xà / nẹp hộc kéo…)
          if (laThanh(q)) { thanh.push(q); continue; }
          it.trung.push(tenTam(q)); cho2.push(choTam(q));
        }
        const cho = it.khoang >= 0 ? `khoang ${it.khoang + 1}${o2 ? `, ô +${g(o2.z0)} → +${g(o2.z1)}` : ''}` : '', vt = `tâm cách mép trái tủ ${g(c.x)}, ${caoTxt}`;
        if (hau) it.hau = `khoét ${tenTam(hau)} ${co}: tâm cách mép trái tấm ${g(x - hau.x0)}, cách mép dưới tấm ${g(z - hau.z0)} (nhìn từ trong tủ)`;
        // ô nằm gọn trong thanh: khoét lỗ (tâm cách mép trái / mép dưới); lấn qua mép dưới / trên: khoét chữ U từ mép đó, sâu = phần lấn
        const khoetThanh = q => { const a0 = z - h, a1 = z + h, rongU = d.tron ? `Ø${g(d.rong)}` : g(d.rong);
          if (a0 >= q.z0 - 0.5 && a1 <= q.z1 + 0.5) return `khoét ${tenTam(q)} ${co}: tâm cách mép trái tấm ${g(x - q.x0)}, cách mép dưới tấm ${g(z - q.z0)}`;
          return a0 < q.z0 ? `khoét chữ U mép dưới ${tenTam(q)} ${rongU} × ${g(Math.min(a1, q.z1) - q.z0)} (tâm cách mép trái tấm ${g(x - q.x0)})` : `khoét chữ U mép trên ${tenTam(q)} ${rongU} × ${g(q.z1 - Math.max(a0, q.z0))} (tâm cách mép trái tấm ${g(x - q.x0)})`; };
        const thTxt = thanh.map(khoetThanh).join('; ');
        // tủ không hậu (tủ chậu / hút mùi) ở khoang này: điểm nằm trong lòng một ô thì với tới từ trong tủ, không phải khoét
        const khongHau = !hau && it.khoang >= 0 && !M.parts.some(q => q.loai === 'HAU' && (!q.van_thung || q.ad) && chong(q.x0, q.x1, xk[it.khoang], xk[it.khoang] + wk[it.khoang])) && !!o2;
        const viet = t0 => t0.charAt(0).toUpperCase() + t0.slice(1);
        const che = d.loai === 'cong_tac' ? ' Tủ che công tắc — không bấm được nữa: dời tủ hoặc chuyển công tắc.' : '';
        if (it.trung.length) kq.luu_y.push(`${T} sau lưng tủ (${vt}) TRÚNG ${cho2.join(', ')}: ô ${co} chiếm ${g(c.x - r)} → ${g(c.x + r)} tính từ mép trái tủ, cao ${g(c.z - h)} → ${g(c.z + h)}. Kéo vách / đợt tránh ra, hoặc khoét tấm đó.${thTxt ? ` (Cũng phải ${thTxt}.)` : ''}${che}`);
        else if (o2 && (o2.kieu === 'nk_am' || o2.kieu === 'nk_trum')) kq.luu_y.push(`${T} nằm sau hộc ngăn kéo (${cho}; ${vt}) — ngăn kéo che mất, hộp kéo có thể vướng phích cắm / đầu ống. Đổi ô đó thành ô trống hoặc dời ngăn kéo.${thTxt ? ` (Cũng phải ${thTxt}.)` : ''}${che}`);
        else if (!hau && !thanh.length && !khongHau) kq.luu_y.push(`${T} sau lưng tủ (${vt}) không nằm trong lòng khoang nào (sau chân tủ / phào) — tủ che kín, không với tới từ trong tủ.${che}`);
        else if (!hau && !khongHau && thanh.every(q => q.loai === 'DE')) kq.luu_y.push(`${T} sau lưng tủ (${vt}) nằm sau khung đế (dưới đáy) — tủ che kín, không với tới từ trong tủ: ${thTxt}, rồi khoét đáy cho dây / ống lên khoang.${che}`);
        else {
          it.hau = [it.hau, thTxt].filter(Boolean).join('; ');
          (che ? kq.luu_y : kq.ghi_chu).push(`${T}: sau lưng tủ, ${cho || 'ngoài các khoang'} — ${vt}. ${it.hau ? viet(it.hau) + '.' : ''}${khongHau ? `${it.hau ? ' ' : ''}Không phải khoét hậu: tủ không hậu — điểm lộ trong lòng khoang.` : ''}${che}`);
        }
      } else if (c.mat === 'day') {
        it.khoang = khoangCua(x);
        let day = null, dayThap = null; const cho2 = [], de = [];
        for (const q of M.parts) {
          if (q.loai === 'CANH' || !chong(q.x0, q.x1, x - r, x + r) || !chong(q.y0, q.y1, y - r, y + r)) continue;
          if (q.loai === 'DAY' && (!dayThap || q.z0 < dayThap.z0)) dayThap = q;      // đáy thấp nhất kể cả đáy nằm sát sàn (phủ hồi không chân)
          if (q.z0 > bb.z0 + 0.5) { if (q.loai === 'DAY' && (!day || q.z0 < day.z0)) day = q; continue; }      // tấm không chạm sàn; đáy thấp nhất = tấm phải khoét
          // (vòng soát 1.39.0) thanh của KHUNG ĐẾ chạy dọc bề ngang tủ (đế sau sát lưng, xà chân) dưới một đáy: ống đi qua thì khoét chữ U từ mép dưới thanh đó
          // (không có vách nào để "kéo tránh ra") — đế hông / đế dọc đứng dưới hồi / vách thì vẫn là TRÚNG như hồi / vách
          if (q.type === 2 && (q.loai === 'DE' || q.loai === 'CHAN') && M.parts.some(d0 => d0.loai === 'DAY' && d0.z0 >= q.z1 - 0.5 && chong(d0.x0, d0.x1, x - r, x + r))) { de.push(q); continue; }
          it.trung.push(tenTam(q)); cho2.push(/^(HOI|VACH|DEM)$/.test(q.loai) ? choTam(q) : tenTam(q));
        }
        const deTxt = de.map(q => `Khoét chữ U mép dưới ${tenTam(q)} ${co} (tâm cách mép trái tấm ${g(x - q.x0)}, cao ${g(q.z1 - q.z0)}) cho ống đi qua khung đế`).join('; ');
        // (1.31.1) phủ hồi: hồi / vách đứng TRÊN đáy (không chạm sàn) — ống đi lên xuyên đáy vẫn đâm vào chân tấm đó
        if (dayThap) for (const q of M.parts) if (/^(HOI|VACH)$/.test(q.loai) && q.z0 > bb.z0 + 0.5 && Math.abs(q.z0 - dayThap.z1) < 0.6 && chong(q.x0, q.x1, x - r, x + r) && chong(q.y0, q.y1, y - r, y + r)) { it.trung.push(tenTam(q)); cho2.push(choTam(q)); }
        const vt = `tâm cách mép trái tủ ${g(c.x)}, cách lưng tủ ${g(k.sau - c.y)}`;
        if (d.loai === 'thoat_san') kq.luu_y.push(`${T} nằm dưới tủ (${it.khoang >= 0 ? `khoang ${it.khoang + 1}; ` : ''}${vt}) — tủ che mất thoát sàn: nước không thoát, không thông ống được. Dời tủ hoặc để hở chân tủ chỗ đó.`);
        else if (it.trung.length) kq.luu_y.push(`${T} dưới tủ (${vt}) TRÚNG ${cho2.join(', ')} — ống ${co} chiếm ${g(c.x - r)} → ${g(c.x + r)} tính từ mép trái tủ, đâm vào tấm chạm sàn. Kéo vách tránh ra hoặc dời tủ.${deTxt ? ` (Cũng đi qua khung đế: ${deTxt.charAt(0).toLowerCase() + deTxt.slice(1)}.)` : ''}`);
        else { if (day) it.hau = `khoét ${tenTam(day)} ${co}: tâm cách mép trái tấm ${g(x - day.x0)}, cách mép sau tấm ${g(day.y1 - y)}`; kq.ghi_chu.push(`${T}: dưới đáy tủ${it.khoang >= 0 ? `, khoang ${it.khoang + 1}` : ''} — ${vt}. ${deTxt ? deTxt + '. ' : ''}${it.hau ? it.hau.charAt(0).toUpperCase() + it.hau.slice(1) : `Khoét đáy ${co}`}.`); }
      } else {
        const ben = c.mat === 'trai' ? 'trái' : 'phải';
        kq.luu_y.push(`${T} (tường ${d.w.ten}) nằm sau hồi ${ben} của tủ — cách lưng tủ ${g(k.sau - c.y)}, ${caoTxt}: bị tủ che kín${d.loai === 'cong_tac' ? ', công tắc không bấm được nữa' : ''}. Dời tủ ra, dời điểm này, hoặc khoét hồi ${co}.`);
      }
      kq.diem.push(it);
    }
    return kq;
  }

  /**
   * Cột / hộp kỹ thuật `c` nằm thế nào so với khung `q` (cả hai là phần tử của H.khung / H.can): tính trong hệ toạ độ của tường khung
   * (s dọc tường từ đầu trái, t vào phòng). Trả về null nếu không chạm khung; không thì { vi_tri: 'trai' | 'phai' | 'giua', rong, sau, sat_tuong }:
   * 'trai' / 'phai' = cột trùm đầu trái / phải của khung → tủ KHẤU CỘT được (rong = cột lấn vào khung theo chiều ngang, sau = lấn theo chiều sâu).
   */
  function viTriCot(q, c) {
    if (!q || !c || c.loai === 'dam' || !q.w || !c.poly) return null;
    if (!(c.z1 > q.z0 + 0.5 && c.z0 < q.z1 - 0.5)) return null;
    const w = q.w, ss = c.poly.map(pt => cham([pt[0] - w.p0[0], pt[1] - w.p0[1]], w.d)), ts = c.poly.map(pt => cham([pt[0] - w.p0[0], pt[1] - w.p0[1]], w.n));
    const s0 = Math.min(...ss), s1 = Math.max(...ss), t0 = Math.min(...ts), t1 = Math.max(...ts);
    const a = Math.max(s0, q.cach), b = Math.min(s1, q.cach + q.rong), sau = Math.min(t1, q.sau) - Math.max(t0, 0);
    if (b - a < 0.5 || sau < 0.5) return null;
    const sat = t0 <= 1;
    const vi_tri = !sat ? 'giua' : s0 <= q.cach + 1 ? 'trai' : s1 >= q.cach + q.rong - 1 ? 'phai' : 'giua';
    return { vi_tri, rong: rn(b - a, 1), sau: rn(Math.min(t1, q.sau), 1), sat_tuong: sat, cach: rn(a - q.cach, 1) };      // cach = từ đầu trái khung tới mặt trái cột
  }
  /** Khấu cột cho tủ đặt vào khung j: { trai: {rong, sau}, phai: {rong, sau}, giua_cot: [{cach, rong, sau}] (cột sát tường nằm giữa khung), giua: [tên cột không khấu được — cột không sát tường] }. */
  function khauChoKhung(H, j) {
    const q = H && H.khung && H.khung[j], out = { trai: { rong: 0, sau: 0 }, phai: { rong: 0, sau: 0 }, giua_cot: [], giua: [] };
    if (!q) return out;
    for (const c of H.can || []) {
      const v = viTriCot(q, c); if (!v) continue;
      if (v.vi_tri === 'giua') { if (v.sat_tuong) out.giua_cot.push({ cach: v.cach, rong: v.rong, sau: v.sau }); else out.giua.push(c.ten); continue; }
      out[v.vi_tri].rong = Math.max(out[v.vi_tri].rong, v.rong); out[v.vi_tri].sau = Math.max(out[v.vi_tri].sau, v.sau);
    }
    return out;
  }

  /** Vị trí đặt tủ của một khung: góc trái – trước – dưới (mặt cánh) trong toạ độ phòng, và góc xoay quanh trục đứng (độ, ngược chiều kim đồng hồ). */
  function datKhung(H, j) {
    const q = H.khung && H.khung[j]; if (!q || !q.w) return null;
    const P = cong(cong(q.w.p0, nhan(q.w.d, q.cach)), nhan(q.w.n, q.sau)), o = H.p.goc || [0, 0, 0];
    let a = q.w.a % 360; if (a > 180) a -= 360; if (a <= -180) a += 360;
    return { goc: [rn(P[0] + o[0], 2), rn(P[1] + o[1], 2), rn(q.z + o[2], 2)], xoay: sach(a), tuong: q.w.ten };
  }

  /**
   * CHIA Ô (bản 1.19 — anh Jason 03/10/2026 20:49: "chia ô ra rồi chọn vào từng khu vực"): thay khung j bằng n khung con bằng nhau.
   * chieu = 'doc' (mặc định): n ô đứng cạnh nhau dọc theo tường, từ trái sang phải; 'ngang': n ô chồng lên nhau, từ dưới lên.
   * Ô con giữ sâu, loại (tủ tự chia / mẫu kho) và ruột tủ của khung mẹ; mẫu kho đã chọn và dấu "đã vẽ" thì bỏ (mỗi ô chọn lại). Số lẻ dồn vào ô cuối.
   * @returns {{ p, tu, den }} phòng mới + chỉ số ô đầu / ô cuối trong p.khung, hoặc null nếu không chia được.
   */
  function chiaKhung(pIn, j, n, chieu) {
    const p = chuanHoa(pIn), q = p.khung[j];
    n = Math.round(num(n, 0));
    if (!q || !(n >= 2 && n <= 12)) return null;
    const doc = chieu !== 'ngang', tong = doc ? q.rong : q.cao, moi_o = Math.floor(tong / n);
    if (!(moi_o >= 50)) return null;
    const ds = [], da = new Set(p.khung.filter((x, i) => i !== j).map(x => x.ten));
    for (let i = 0, tu = 0; i < n; i++) {
      const kt = i === n - 1 ? rn(tong - tu, 1) : moi_o;
      let ten = `${q.ten}.${i + 1}`.slice(0, 24); while (da.has(ten)) ten = (ten.slice(0, 23) + "'"); da.add(ten);
      const o = { ten, tuong: q.tuong, cach: doc ? rn(q.cach + tu, 1) : q.cach, z: doc ? q.z : rn(q.z + tu, 1), rong: doc ? kt : q.rong, cao: doc ? q.cao : kt, sau: q.sau, mau: q.mau, ghi_chu: '' };
      if (q.kieu === 'kho') { o.kieu = 'kho'; if (q.nhom) o.nhom = q.nhom; }
      ds.push(o); tu += kt;
    }
    p.khung.splice(j, 1, ...ds);
    return { p: chuanHoa(p), tu: j, den: j + n - 1 };
  }

  /**
   * Đổi RỘNG / CAO của một ô (khung j) mà không làm hở, không làm chồng (bản 1.19 — sửa số ngay trên mặt đứng):
   * ô KỀ = khung cùng tường, chạm mép với ô đang sửa và trùng khít phạm vi theo chiều kia (cùng hàng khi sửa rộng, cùng cột khi sửa cao).
   * Có ô kề phía sau (bên phải / phía trên) → mép đầu của ô đang sửa đứng yên, ô kề co / giãn bù. Không có mà có ô kề phía trước (trái / dưới)
   * → mép cuối đứng yên, ô kề trước nhận bù. Không có ô kề nào → chỉ đổi kích thước ô đó (mép trái / mép dưới đứng yên).
   * @returns {{ p, ke: tên ô nhận bù | '' }} | {{ loi }} | null
   */
  function doiCoKhung(pIn, j, chieu, v) {
    const p = chuanHoa(pIn), q = p.khung[j];
    v = num(v, NaN);
    if (!q || !(v >= 50)) return null;
    const doc = chieu !== 'cao', kt = doc ? 'rong' : 'cao', vt = doc ? 'cach' : 'z', d = rn(v - q[kt], 2);
    if (Math.abs(d) < 0.05) return { p, ke: '' };
    const khit = k => (doc ? Math.abs(k.z - q.z) < 0.5 && Math.abs(k.cao - q.cao) < 0.5 : Math.abs(k.cach - q.cach) < 0.5 && Math.abs(k.rong - q.rong) < 0.5);
    const ung = p.khung.filter((k, i) => i !== j && k.tuong === q.tuong && khit(k));
    const sau = ung.find(k => Math.abs(k[vt] - (q[vt] + q[kt])) < 0.5), truoc = ung.find(k => Math.abs(k[vt] + k[kt] - q[vt]) < 0.5);
    const ke = sau || truoc;
    if (ke && ke[kt] - d < 50) return { loi: `Ô kề ${ke.ten} chỉ còn ${g(ke[kt] - d)} — không đủ chỗ (mỗi ô phải từ 50 trở lên). Sửa ô kề trước, hoặc gõ số nhỏ hơn.` };
    q[kt] = v;
    if (sau) { sau[vt] = rn(sau[vt] + d, 1); sau[kt] = rn(sau[kt] - d, 1); }
    else if (truoc) { q[vt] = rn(q[vt] - d, 1); truoc[kt] = rn(truoc[kt] - d, 1); }
    return { p: chuanHoa(p), ke: ke ? ke.ten : '' };
  }

  /* ---- bản 1.25 — KÉO KHUNG trên mặt đứng (anh Thanh 05/10/2026 08:19: "vẽ khung nhưng không move được"; 08:20: "với có bắt điểm") ---- */
  // Mốc của tường i: `bo(k, mep)` = true thì bỏ mép đó của khung k (mep: 'trai' | 'phai' | 'duoi' | 'tren').
  function mocCua(H, i, bo) {
    const w = tuongTheoMa(H, i); if (!w || !(w.dai > 0)) return { s: [], z: [] };
    const L = w.dai, C = w.cao || H.p.cao || 2700, s = [0, L], z = [0, C];
    for (const k of H.khung || []) {
      if (k.tuong !== i || !(k.rong > 0) || !(k.cao > 0)) continue;
      if (!bo(k, 'trai')) s.push(k.cach); if (!bo(k, 'phai')) s.push(k.cach + k.rong);
      if (!bo(k, 'duoi')) z.push(k.z); if (!bo(k, 'tren')) z.push(k.z + k.cao);
    }
    for (const m of H.mo || []) if (m.tuong === i) { s.push(m.cach, m.cach + m.rong); z.push(m.be, m.be + m.cao); }
    for (const c of H.can || []) if (c.tuong === i) { s.push(c.cach, c.cach + c.rong); z.push(c.z0, c.z1); }
    const gon = (ds, max) => Array.from(new Set(ds.filter(v => v >= -0.05 && v <= max + 0.05).map(v => rn(Math.min(Math.max(v, 0), max), 1)))).sort((a, b) => a - b);
    return { s: gon(s, L), z: gon(z, C) };
  }
  /**
   * MỐC BẮT ĐIỂM của tường i trên mặt đứng: s = vị trí dọc tường (đầu / cuối tường, mép cửa, cột, dầm, khung), z = cao độ (sàn, trần, bệ / đỉnh cửa, đáy / đỉnh cột – dầm – khung).
   * `bo` = chỉ số khung đang kéo (mép của chính nó không phải mốc). Xếp tăng dần, không trùng.
   */
  function mocKhung(H, i, bo) { return mocCua(H, i, k => k.j === bo); }

  /**
   * Chỗ mới của khung j khi người dùng nắm THÂN khung (dời) hoặc nắm MÉP / GÓC (đổi cỡ) rồi kéo đi (ds, dz) mm kể từ lúc bấm chuột. Hàm thuần — giao diện gọi liên tục lúc kéo.
   * o = { trai, phai, duoi, tren: mép đang nắm (không mép nào = dời cả khung) · ds, dz · tam: tầm bắt điểm (mm) · tu_do: giữ Alt — không bắt điểm, ô kề không chạy theo ·
   *       giu_s, giu_z: chuột chưa rời trục đó → số của trục đó giữ NGUYÊN (kéo ngang không làm đổi / làm tròn cao độ) }
   * Mép đang chạy tới gần một mốc (≤ tam) thì bám đúng mốc; không thì số bắt chẵn 10. Khung không ra khỏi tường, không vượt trần, không nhỏ hơn 100 (khung vốn nhỏ hơn thì giữ cỡ đó).
   * Nắm đúng MỘT mép đang chạm một Ô KỀ khít (cùng quy tắc `doiCoKhung`): ô kề co / giãn theo, không hở không chồng, ô kề không nhỏ hơn 50.
   * @returns {{ cach, z, rong, cao, bat_s: mốc dọc tường đã bám | null, bat_z: cao độ đã bám | null, ke: [{ j, cach, z, rong, cao }] }} | null
   */
  function keoKhung(H, j, o) {
    const q = H && H.khung && H.khung[j], w = q && q.w;
    if (!q || !w || !(w.dai > 0) || !(q.rong > 0) || !(q.cao > 0)) return null;
    o = o || {};
    const L = w.dai, C = w.cao || H.p.cao || 2700, tuDo = !!o.tu_do, tam = tuDo ? 0 : Math.max(0, num(o.tam, 30));
    const nam = ['trai', 'phai', 'duoi', 'tren'].filter(c => o[c]), ds = num(o.ds, 0), dz = num(o.dz, 0);
    // ô kề chạy theo: chỉ khi nắm đúng một mép (nắm góc thì hai chiều cùng đổi, ô kề hết khít) và không kéo tự do
    let ke = null;
    if (nam.length === 1 && !tuDo) {
      const c = nam[0], ngang = c === 'trai' || c === 'phai';
      const khit = k => (ngang ? Math.abs(k.z - q.z) < 0.5 && Math.abs(k.cao - q.cao) < 0.5 : Math.abs(k.cach - q.cach) < 0.5 && Math.abs(k.rong - q.rong) < 0.5);
      const ho = k => (c === 'phai' ? k.cach - (q.cach + q.rong) : c === 'trai' ? k.cach + k.rong - q.cach : c === 'tren' ? k.z - (q.z + q.cao) : k.z + k.cao - q.z);
      ke = H.khung.find(k => k.j !== j && k.tuong === q.tuong && k.rong > 0 && k.cao > 0 && khit(k) && Math.abs(ho(k)) < 0.5) || null;
    }
    const DOI = { trai: 'phai', phai: 'trai', duoi: 'tren', tren: 'duoi' };
    // mép của chính khung đang kéo, và mép của ô kề đang chạy theo, không phải mốc (không thì mép chung bị hút về chỗ cũ)
    const moc = mocCua(H, q.tuong, (k, c) => k.j === j || (ke && k.j === ke.j && c === DOI[nam[0]]));
    const gan = (v, dsM) => { let b = null; if (tam > 0) for (const m of dsM) { const d = Math.abs(v - m); if (d <= tam && (b === null || d < Math.abs(v - b))) b = m; } return b; };
    const tron = v => Math.round(v / 10) * 10;
    // MỘT mép đang chạy: bám mốc gần nhất trong tầm, không thì chẵn 10; rồi ép vào [lo, hi] → [chỗ mới, mốc đã bám]
    const mep = (v, dsM, lo, hi) => {
      if (hi < lo) hi = lo;
      let a = gan(v, dsM), r = a !== null ? a : tron(v);
      if (r < lo || r > hi) { r = Math.min(Math.max(r, lo), hi); a = tam > 0 && dsM.some(m => Math.abs(m - r) < 0.05) ? r : null; }
      return [r, a];
    };
    // DỜI cả khung theo một trục: mép đầu / mép cuối, mép nào gần mốc hơn thì bám mép đó
    const doi = (v0, kt, d, dsM, max) => {
      const c0 = v0 + d, a = gan(c0, dsM), b = gan(c0 + kt, dsM), hi = Math.max(0, max - kt);
      let r, bat = null;
      if (a !== null && (b === null || Math.abs(c0 - a) <= Math.abs(c0 + kt - b))) { r = a; bat = a; }
      else if (b !== null) { r = b - kt; bat = b; }
      else r = tron(c0);
      if (r < 0 || r > hi) { r = Math.min(Math.max(r, 0), hi); bat = tam > 0 ? (r < 0.05 ? 0 : max) : null; }
      return [r, bat];
    };
    let x0 = q.cach, x1 = q.cach + q.rong, y0 = q.z, y1 = q.z + q.cao, bs = null, bz = null;
    if (!nam.length) {
      if (!o.giu_s) { [x0, bs] = doi(q.cach, q.rong, ds, moc.s, L); x1 = x0 + q.rong; }
      if (!o.giu_z) { [y0, bz] = doi(q.z, q.cao, dz, moc.z, C); y1 = y0 + q.cao; }
    } else {
      const nhoR = Math.min(100, q.rong), nhoC = Math.min(100, q.cao), nhoKe = ke ? Math.min(50, ke.rong, ke.cao) : 0;
      if (!o.giu_s) {
        if (o.phai) [x1, bs] = mep(x1 + ds, moc.s, x0 + nhoR, ke && nam[0] === 'phai' ? Math.min(L, ke.cach + ke.rong - nhoKe) : L);
        else if (o.trai) [x0, bs] = mep(x0 + ds, moc.s, ke && nam[0] === 'trai' ? Math.max(0, ke.cach + nhoKe) : 0, x1 - nhoR);
      }
      if (!o.giu_z) {
        if (o.tren) [y1, bz] = mep(y1 + dz, moc.z, y0 + nhoC, ke && nam[0] === 'tren' ? Math.min(C, ke.z + ke.cao - nhoKe) : C);
        else if (o.duoi) [y0, bz] = mep(y0 + dz, moc.z, ke && nam[0] === 'duoi' ? Math.max(0, ke.z + nhoKe) : 0, y1 - nhoC);
      }
    }
    const kq = { cach: rn(x0, 1), z: rn(y0, 1), rong: rn(x1 - x0, 1), cao: rn(y1 - y0, 1), bat_s: bs, bat_z: bz, ke: [] };
    if (ke) {
      const n = { j: ke.j, cach: ke.cach, z: ke.z, rong: ke.rong, cao: ke.cao }, c = nam[0];
      if (c === 'phai') { n.rong = rn(ke.cach + ke.rong - x1, 1); n.cach = rn(x1, 1); }
      else if (c === 'trai') n.rong = rn(x0 - ke.cach, 1);
      else if (c === 'tren') { n.cao = rn(ke.z + ke.cao - y1, 1); n.z = rn(y1, 1); }
      else n.cao = rn(y0 - ke.z, 1);
      kq.ke.push(n);
    }
    return kq;
  }

  /**
   * Thông số tủ vừa khít một khung. Core = MNCFCore, specNen = thông số đang dùng (giữ Chuẩn xưởng), q = khung {rong, cao, sau, mau, ten}.
   * @returns {{spec, mau:string[], ghi_chu:string[]}}
   */
  function tuChoKhung(Core, specNen, q, tenPhong, H, j) {
    const ghi = [], dsMau = [];
    let s = Core.normalize(specNen), cdGhep = 0;      // cdGhep = thân dưới của các mẫu tự ghép (xem dưới)
    // (bản 1.32) khung là chỗ đặt TỦ: giường / vách đầu giường đang mở trong bảng → đổi sang tủ áo (Chuẩn xưởng giữ nguyên);
    // táp chỉ giữ ngăn kéo của nó khi chỗ đặt cỡ táp (cao ≤ 1000, rộng ≤ 1200) — khung tủ áo (sàn → trần) thì cũng đổi sang tủ áo, không kéo táp cao 2 m
    const lsp = Core.loaiSP ? Core.loaiSP(s) : 'tu', tapNho = lsp === 'tap' && q.cao <= 1000 && q.rong <= 1200;
    // (bản 1.33) tủ bếp cũng đổi sang tủ áo: khung phòng chưa có kiểu 'bep' (bộ bếp theo tường là bản 1.34) — không để chân lùi / giằng / rổ / đá lọt vào khung tủ áo
    if ((lsp === 'giuong' || lsp === 'vach' || lsp === 'bep' || (lsp === 'tap' && !tapNho)) && Core.veTuAo) { s = Core.veTuAo(s); ghi.push(`Khung là chỗ đặt tủ — ${Core.TEN_SP[lsp].toLowerCase()} đang mở trong bảng được đổi sang tủ áo.`); }
    const coMau = q.mau && Core.MAU_TU.find(m => m.ma === q.mau);
    if (coMau) { s = Core.apMau(s, q.mau); dsMau.push(q.mau); }
    else if (q.giu_ruot || tapNho) dsMau.push(tapNho ? 'táp đang mở' : 'ruột đang mở');      // bản 1.16 (tủ theo hình): giữ cách chia khoang đang có trong bảng
    else {
      // tự chọn theo bề rộng: mỗi cánh ~500; ghép các mẫu 2–6 cánh cho đủ số cánh
      const theo = { 2: 'TA2-1000', 3: 'TA3-1500', 4: 'TA4-2000', 5: 'TA5-2500', 6: 'TA6-3000' };
      let n = Math.max(2, Math.round(q.rong / 500)); const khoang = [];
      if (q.rong < 600) { n = 0; khoang.push(Core.MAU_TU.find(x => x.ma === 'TA3-1500').khoang()[1]); dsMau.push('1 cánh, khoang trống'); }      // khung hẹp: 1 cánh, không ngăn kéo (1.36.4: khoang trống — mẫu tủ áo bỏ kiểu đợt đều)
      while (n > 0) { let c = n > 6 ? (n - 6 === 1 ? 5 : 6) : n; if (c === 1) c = 2; const m = Core.MAU_TU.find(x => x.ma === theo[c]); khoang.push(...m.khoang()); dsMau.push(m.ma); cdGhep = Math.max(cdGhep, m.cao_duoi || 0); n -= c; }
      s = Core.normalize(Object.assign(clone(s), { khoang }));
      ghi.push(`Tự chọn ruột tủ theo bề rộng: ${dsMau.join(' + ')}.`);
    }
    const khoVan = (s.van && s.van.kho_dai) || 2440;
    s.rong = q.rong; s.cao = q.cao;
    // khung treo (đáy cao hơn sàn — ô trên của vách tivi, tủ treo đầu giường): tủ không có chân
    if (q.z > 0.5 && s.chan && s.chan.cao > 0) { s.chan = Object.assign({}, s.chan, { cao: 0 }); ghi.push(`Khung treo (đáy +${g(q.z)}): bỏ chân tủ.`); }
    // cao hơn khổ ván thì chia thân dưới + thân kịch trần; thân trên không thấp hơn 400. Ruột lấy từ mẫu (chọn hay tự ghép) thì theo thân dưới CỦA MẪU (đợt
    // của mẫu tính theo nó): soát 1.36.4 — tủ mặc định mới thân dưới 2150, lấy số đó cho ruột MAU_TU (dựng ở 2200, đợt treo dài +1900) là đợt 1900 rơi khỏi
    // thân (lọc z < 2150 − 250) → báo oan "Khung thấp", thanh treo lên sát nóc thân dưới.
    s.than = Object.assign({}, s.than, { cao_duoi: q.cao > khoVan ? Math.min((coMau && coMau.cao_duoi) || cdGhep || (s.than && s.than.cao_duoi) || 2200, q.cao - 400) : 0 });
    // đợt của mẫu cao hơn thân tủ thì bỏ (khung thấp); nội dung ô mất đợt đỡ thì bỏ theo
    const tranThan = (s.than.cao_duoi || q.cao) - 250;
    let bo = 0;
    s.khoang = s.khoang.map(k => {
      const tat = Array.isArray(k.dot) ? k.dot : [], dot = tat.filter(z => z < tranThan), boDot = tat.filter(z => !(z < tranThan));
      // nội dung ô chỉ bỏ khi chính đợt ĐỠ nó bị bỏ. Ô sát đáy thì giữ: bảng ghi cao độ ô = mặt dưới tấm đáy (tủ có chân 100 → tu = 100, không phải 0) —
      // trước bản 1.23 phép lọc chỉ nhận tu = 0 nên suốt treo / ngăn kéo ở ô sát đáy của tủ có chân bị bỏ mất mỗi lần đổi khung.
      const o = (k.o || []).filter(c => !boDot.some(z => Math.abs(z - c.tu) < 0.6));
      bo += tat.length - dot.length;
      return Object.assign({}, k, { rong: 'auto', dot, o });
    });
    if (bo) ghi.push(`Khung thấp: đã bỏ ${bo} đợt của mẫu nằm quá cao.`);
    s.ten = q.ten || s.ten; s.ma = String(q.ten || s.ma || 'TA').replace(/\s+/g, '').slice(0, 16); if (tenPhong) s.phong = tenPhong;
    // trần chỗ đặt khung (bản 1.20) → lõi kiểm thân tủ ráp nằm rồi lật đứng có lọt trần không. Khung treo không lật từ sàn lên nên không kiểm.
    { const qH = H && j >= 0 && H.khung && H.khung[j]; if (qH) s.kiem = Object.assign({}, s.kiem, { tran: (qH.z0 > 0.5 || !(qH.w && qH.w.cao > 0)) ? 0 : qH.w.cao }); }
    s = Core.normalize(s);
    if (tapNho && Core.tapTuDong) s = Core.tapTuDong(s).spec;      // (1.34.1) táp theo kiểu: ruột chia lại theo cao của khung (người dùng chưa sửa ruột)
    // sâu khung = sâu phủ bì kể cả cánh → trừ phần cánh nhô ra trước thùng
    const bb = Core.bbox(Core.build(s).parts);
    if (bb) { const sauPB = bb.y1 - bb.y0; s.sau_thung = rn(s.sau_thung + (q.sau - sauPB), 1); }
    // khấu cột (bản 1.13): cột / hộp kỹ thuật trùm đầu khung → tủ khoét theo cột. Khung mới thì luôn đặt lại (không giữ khấu của tủ trước).
    s.khau = { trai: { rong: 0, sau: 0 }, phai: { rong: 0, sau: 0 }, giua: [], ho: (s.khau && s.khau.ho >= 0) ? s.khau.ho : Core.DEFAULT_SPEC.khau.ho };
    const kh0 = q.khau || (H && j >= 0 ? khauChoKhung(H, j) : null);      // q.khau: khấu đọc từ hình vẽ trên mặt bằng (bản 1.16)
    if (kh0) {
      const kh = { trai: kh0.trai || { rong: 0, sau: 0 }, phai: kh0.phai || { rong: 0, sau: 0 }, giua_cot: (kh0.giua_cot || []).slice(), giua: kh0.giua || [] };
      for (const b of ['trai', 'phai']) if (kh[b].rong > 0 && kh[b].sau > 0) { s.khau[b] = { rong: kh[b].rong, sau: kh[b].sau }; ghi.push(`Khấu cột ${b === 'trai' ? 'trái' : 'phải'}: cột lấn ${g(kh[b].rong)} ngang × ${g(kh[b].sau)} sâu (hở ${g(s.khau.ho)}).`); }
      kh.giua_cot.sort((a, b) => a.cach - b.cach).slice(0, 4).forEach(c => { s.khau.giua.push({ cach: c.cach, rong: c.rong, sau: c.sau }); ghi.push(`Khấu cột giữa: cách đầu trái ${g(c.cach)}, cột ${g(c.rong)} ngang × ${g(c.sau)} sâu (hở ${g(s.khau.ho)}).`); });
      if (kh.giua.length) ghi.push(`${kh.giua.join(', ')} không sát tường — bảng chưa khấu được, phải chia khung né ra.`);
      // Bản 1.23 (anh Jason 04/10/2026 23:02: "khấu cột … phải cân đối khoang tủ … thường khấu sẽ nằm trong khoang tủ, không can thiệp bổ sung các đợt ngang hay dọc"):
      // KHÔNG còn ghim bề rộng khoang sát cột, KHÔNG còn tự dời / thêm vách theo hai mép cột giữa (và chép đợt sang khoang mới). Khoang giữ nguyên như tủ không có cột;
      // cột nằm trong khoang — đáy / nóc / đợt khoét quanh cột, hộp che cột = vách khấu + hậu khấu. Mép cột rơi sát vách thì lõi tự nới vùng khấu tới mặt vách đó (Core.build).
      if (s.khau.giua.length) ghi.push('Cột giữa nằm trong khoang — khoang giữ nguyên, đáy / nóc / đợt khoét quanh cột (hộp che cột = 2 vách khấu + hậu khấu).');
      // Cột nằm sau khoang có NGĂN KÉO mà thùng trước cột không đủ sâu cho hộp ngăn kéo (lõi ghi ở info.nk_vuong_cot) — chỉ ĐỔI CHỖ khoang, không thêm bớt vách / đợt:
      //   (1) lật thứ tự các khoang trái ↔ phải;  (2) đổi chỗ khoang vướng với một khoang khác (ưu tiên khoang cùng số cánh, gần nhất);
      //   (3) vẫn vướng (cột trùm nhiều khoang) → bỏ ngăn kéo ở khoang vướng, báo rõ. Tủ nông sẵn (không do cột) thì không đụng tới.
      s = Core.normalize(s);
      const vuong = Mx => ((Mx.info && Mx.info.nk_vuong_cot) || []).slice().sort((a, b) => a - b);
      const ds = vuong(Core.build(s));
      if (ds.length) {
        const n = s.khoang.length;
        // khoang 1 cánh nằm ở đầu tủ thì bản lề quay ra hồi ngoài
        const xep = ks => { const c = clone(s); c.khoang = ks.map((k, i) => (k.canh === 1 && (i === 0 || i === n - 1) ? Object.assign({}, k, { ban_le: i === 0 ? 'trai' : 'phai' }) : k)); if (c.thung) delete c.thung.tach; return Core.normalize(c); };
        const dat = c => { const Mx = Core.build(c); return !Mx.errors.length; };
        const thu = [];
        if (n > 1) thu.push({ ks: s.khoang.slice().reverse(), ghi: 'Đã đổi chỗ các khoang (lật trái ↔ phải) cho ngăn kéo tránh cột' });
        if (ds.length === 1 && n > 2) {
          const i = ds[0], khac = s.khoang.map((k, j) => j).filter(j => j !== i).sort((u, v) => ((s.khoang[u].canh === s.khoang[i].canh ? 0 : 1) - (s.khoang[v].canh === s.khoang[i].canh ? 0 : 1)) || (Math.abs(u - i) - Math.abs(v - i)) || (u - v));
          for (const j of khac) { const ks = s.khoang.slice(); ks[i] = s.khoang[j]; ks[j] = s.khoang[i]; thu.push({ ks, ghi: `Đã đổi chỗ khoang ${i + 1} ↔ khoang ${j + 1} cho ngăn kéo tránh cột` }); }
        }
        let xong = false;
        for (const o of thu) { const c = xep(o.ks); if (dat(c)) { s = c; ghi.push(`${o.ghi}: khoang có cột phía sau không đủ sâu cho hộp ngăn kéo. Bề rộng khoang và các đợt giữ nguyên.`); xong = true; break; } }
        if (!xong) {
          for (const i of ds) s.khoang[i] = Object.assign({}, s.khoang[i], { o: (s.khoang[i].o || []).filter(c => !/^nk_/.test(c.kieu)) });
          ghi.push(`Khoang ${ds.map(i => i + 1).join(', ')}: cột phía sau làm thùng không đủ sâu cho hộp ngăn kéo → đã bỏ ngăn kéo ở khoang đó (đợt giữ nguyên; muốn có ngăn kéo thì đặt ở khoang không dính cột).`);
        }
      }
    }
    return { spec: Core.normalize(s), mau: dsMau, ghi_chu: ghi };
  }

  /**
   * HÌNH VẼ TRÊN MẶT BẰNG → KHUNG ĐẶT TỦ (bản 1.16 — anh Jason 03/10/2026 20:44: "anh vẽ hình lên không gian mặt bằng rồi chọn vẽ tủ").
   * dinh = [[x, y], …]: đỉnh đa giác kín theo toạ độ bản vẽ (mm), các cạnh vuông góc nhau, quay hướng nào cũng được.
   * Hình = phủ bì của tủ nhìn từ trên xuống. Chỗ khuyết so với hình chữ nhật bao là chỗ CỘT, phải chạm mép SAU của tủ (góc → chữ L, giữa → chữ U).
   * opt: { truoc: [x, y]  một điểm nằm về phía TRƯỚC tủ (phía người đứng mở cánh);
   *        tuong: [{ a: [x, y], b: [x, y] }]  các mặt tường trong bản vẽ — cạnh nào áp tường thì không phải mặt trước;
   *        cot: [{ x0, x1, y0, y1 }]  hộp bao các cột của phòng — cột lấn vào hình thì tủ tự khấu, không cần vẽ khuyết }
   * Quy ước tủ: đứng trước tủ nhìn vào, x chạy từ trái sang phải, y từ mặt cánh vào lưng; `goc` = góc trái – trước, `xoay` = góc quay của trục x (độ, ngược chiều kim đồng hồ).
   * @returns {{ ok, loi, can_diem, rong, sau, goc, xoay, khau: {trai, phai, giua_cot, giua}, chu_nhat, sat_tuong: {truoc, sau, trai, phai}, ghi_chu: string[] }}
   *   can_diem = true: hình không tự cho biết phía nào là mặt trước → gọi lại với opt.truoc.
   */
  function hinhThanhKhung(dinh, opt) {
    opt = opt || {};
    const kq = { ok: false, loi: '', can_diem: false, ghi_chu: [] };
    const hong = t => { kq.loi = t; return kq; };
    // 1. dọn đỉnh: bỏ đỉnh trùng, đỉnh thẳng hàng
    let P = (Array.isArray(dinh) ? dinh : []).map(q => [Number(q[0]), Number(q[1])]).filter(q => isFinite(q[0]) && isFinite(q[1]));
    P = P.filter((q, i) => { const r = P[(i + 1) % P.length]; return Math.hypot(q[0] - r[0], q[1] - r[1]) > 0.5; });
    for (let doi = true; doi && P.length > 3;) {
      doi = false;
      for (let i = 0; i < P.length; i++) {
        const a = P[(i + P.length - 1) % P.length], b = P[i], c = P[(i + 1) % P.length], u = [b[0] - a[0], b[1] - a[1]], v = [c[0] - b[0], c[1] - b[1]];
        if (Math.abs(u[0] * v[1] - u[1] * v[0]) <= 0.002 * Math.hypot(u[0], u[1]) * Math.hypot(v[0], v[1]) && cham(u, v) > 0) { P.splice(i, 1); doi = true; break; }
      }
    }
    if (P.length < 4) return hong('Hình phải là hình chữ nhật hoặc đa tuyến KHÉP KÍN có ít nhất 4 đỉnh.');
    // 2. quay cho cạnh dài nhất nằm ngang; mọi cạnh phải ngang hoặc dọc
    let dai = 0, th = 0;
    P.forEach((a, i) => { const b = P[(i + 1) % P.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L > dai) { dai = L; th = Math.atan2(b[1] - a[1], b[0] - a[0]); } });
    const c0 = Math.cos(th), s0 = Math.sin(th);
    const vao = q => [q[0] * c0 + q[1] * s0, -q[0] * s0 + q[1] * c0], ra = q => [q[0] * c0 - q[1] * s0, q[0] * s0 + q[1] * c0];
    const Q = P.map(vao);
    for (let i = 0; i < Q.length; i++) {
      const a = Q[i], b = Q[(i + 1) % Q.length], dx = Math.abs(b[0] - a[0]), dy = Math.abs(b[1] - a[1]), L = Math.hypot(dx, dy);
      if (Math.min(dx, dy) > Math.max(1, 0.004 * L)) return hong('Hình có cạnh xiên — bảng chỉ nhận hình có các cạnh vuông góc nhau (hình chữ nhật, có thể khuyết góc / khuyết giữa ở mép sau).');
    }
    // 3. lưới theo các toạ độ đỉnh (gộp các số lệch nhau dưới 0,5 mm)
    const gop = arr => { const o = []; for (const v of arr.slice().sort((x, y) => x - y)) if (!o.length || v - o[o.length - 1] > 0.5) o.push(v); return o; };
    const xs = gop(Q.map(q => q[0])), ys = gop(Q.map(q => q[1]));
    if (xs.length < 2 || ys.length < 2) return hong('Hình bị dẹt (không có bề rộng hoặc bề sâu).');
    const bat = (v, arr) => arr.reduce((m, x) => (Math.abs(x - v) < Math.abs(m - v) ? x : m), arr[0]);
    const R = Q.map(q => [bat(q[0], xs), bat(q[1], ys)]);
    const trong = (x, y) => { let c = false; for (let i = 0, j = R.length - 1; i < R.length; j = i++) { const a = R[i], b = R[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
    const bx0 = xs[0], bx1 = xs[xs.length - 1], by0 = ys[0], by1 = ys[ys.length - 1];
    // 4. phần khuyết: các ô lưới nằm ngoài đa giác, gom thành cụm liền nhau
    const nx = xs.length - 1, ny = ys.length - 1, ngoai = [];
    for (let i = 0; i < nx; i++) { ngoai.push([]); for (let j = 0; j < ny; j++) ngoai[i].push(!trong((xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2)); }
    const cum = [], da = ngoai.map(c => c.map(() => false));
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      if (!ngoai[i][j] || da[i][j]) continue;
      const o = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, dt: 0 }, st = [[i, j]]; da[i][j] = true;
      while (st.length) {
        const [a, b] = st.pop();
        o.x0 = Math.min(o.x0, xs[a]); o.x1 = Math.max(o.x1, xs[a + 1]); o.y0 = Math.min(o.y0, ys[b]); o.y1 = Math.max(o.y1, ys[b + 1]); o.dt += (xs[a + 1] - xs[a]) * (ys[b + 1] - ys[b]);
        for (const [u, v] of [[a + 1, b], [a - 1, b], [a, b + 1], [a, b - 1]]) if (u >= 0 && u < nx && v >= 0 && v < ny && ngoai[u][v] && !da[u][v]) { da[u][v] = true; st.push([u, v]); }
      }
      if (o.x1 - o.x0 < 2 || o.y1 - o.y0 < 2) continue;      // sai số vẽ
      o.cn = Math.abs(o.dt - (o.x1 - o.x0) * (o.y1 - o.y0)) < 1;
      o.cham = { D: Math.abs(o.y0 - by0) < 0.6, T: Math.abs(o.y1 - by1) < 0.6, L: Math.abs(o.x0 - bx0) < 0.6, P: Math.abs(o.x1 - bx1) < 0.6 };
      cum.push(o);
    }
    // cột của phòng (bản vẽ) lấn vào hình mà anh chưa vẽ khuyết → coi như một chỗ khuyết (tủ tự khấu theo mặt bằng)
    let soCot = 0;
    for (const c of opt.cot || []) {
      if (!c) continue;
      const g4 = [[c.x0, c.y0], [c.x1, c.y0], [c.x1, c.y1], [c.x0, c.y1]].map(vao);
      const x0 = Math.max(bx0, Math.min(...g4.map(q => q[0]))), x1 = Math.min(bx1, Math.max(...g4.map(q => q[0]))), y0 = Math.max(by0, Math.min(...g4.map(q => q[1]))), y1 = Math.min(by1, Math.max(...g4.map(q => q[1])));
      if (x1 - x0 < 2 || y1 - y0 < 2) continue;                                                                   // cột không lấn vào hình
      if (cum.some(o => x0 >= o.x0 - 1 && x1 <= o.x1 + 1 && y0 >= o.y0 - 1 && y1 <= o.y1 + 1)) continue;          // đã nằm gọn trong chỗ khuyết vẽ sẵn
      if (!trong((x0 + x1) / 2, (y0 + y1) / 2) && !trong(x0 + 1, y0 + 1) && !trong(x1 - 1, y1 - 1)) continue;     // phần lấn nằm ngoài đa giác
      cum.push({ x0, x1, y0, y1, dt: (x1 - x0) * (y1 - y0), cn: true, cot: true, cham: { D: Math.abs(y0 - by0) < 0.6, T: Math.abs(y1 - by1) < 0.6, L: Math.abs(x0 - bx0) < 0.6, P: Math.abs(x1 - bx1) < 0.6 } });
      soCot++;
    }
    if (cum.some(o => !o.cn)) return hong('Chỗ khuyết của hình không phải hình chữ nhật — bảng chỉ khấu được cột vuông (khuyết góc chữ L hoặc khuyết giữa chữ U).');
    // 5. bốn mép của hình chữ nhật bao: D (y nhỏ), T (y lớn), L (x nhỏ), P (x lớn). Mép TRƯỚC hợp lệ = không chạm chỗ khuyết nào, và mọi chỗ khuyết đều chạm mép đối diện (mép sau).
    const DOI = { D: 'T', T: 'D', L: 'P', P: 'L' }, MEP = ['D', 'T', 'L', 'P'];
    const hopLe = MEP.filter(m => cum.every(o => !o.cham[m] && o.cham[DOI[m]]));
    if (!hopLe.length) return hong(cum.length > 1 ? 'Các chỗ khuyết của hình không cùng nằm về một mép — bảng chỉ khấu cột ở mép SAU của tủ (chia hình thành nhiều tủ).' : 'Chỗ khuyết của hình không chạm mép nào của tủ (cột nằm lọt giữa tủ) — bảng chưa khấu được.');
    const dauMep = m => (m === 'D' ? [[bx0, by0], [bx1, by0]] : m === 'T' ? [[bx0, by1], [bx1, by1]] : m === 'L' ? [[bx0, by0], [bx0, by1]] : [[bx1, by0], [bx1, by1]]);
    const daiMep = m => (m === 'D' || m === 'T' ? bx1 - bx0 : by1 - by0);
    // phần của mỗi mép áp vào tường (0…1)
    const satTuong = {};
    for (const m of MEP) {
      const [a, b] = dauMep(m), L = daiMep(m), ngang = m === 'D' || m === 'T'; let phu = 0;
      for (const w of opt.tuong || []) {
        if (!w || !w.a || !w.b) continue;
        const wa = vao(w.a), wb = vao(w.b);
        if (ngang) { if (Math.abs(wa[1] - a[1]) > 8 || Math.abs(wb[1] - a[1]) > 8) continue; phu = Math.max(phu, Math.min(b[0], Math.max(wa[0], wb[0])) - Math.max(a[0], Math.min(wa[0], wb[0]))); }
        else { if (Math.abs(wa[0] - a[0]) > 8 || Math.abs(wb[0] - a[0]) > 8) continue; phu = Math.max(phu, Math.min(b[1], Math.max(wa[1], wb[1])) - Math.max(a[1], Math.min(wa[1], wb[1]))); }
      }
      satTuong[m] = L > 0 ? Math.max(0, Math.min(1, phu / L)) : 0;
    }
    let truoc = null, cach = '';
    if (Array.isArray(opt.truoc) && opt.truoc.length >= 2) {
      const t = vao(opt.truoc), cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2, hx = (bx1 - bx0) / 2, hy = (by1 - by0) / 2;
      const diem = { D: (cy - t[1]) / hy, T: (t[1] - cy) / hy, L: (cx - t[0]) / hx, P: (t[0] - cx) / hx };
      const m = MEP.slice().sort((p, q) => diem[q] - diem[p])[0];
      if (!hopLe.includes(m)) return hong('Phía anh bấm làm mặt TRƯỚC lại là phía có chỗ khuyết (hoặc chỗ khuyết không nằm ở mép sau so với phía đó) — cột phải nằm ở lưng tủ. Bấm lại điểm phía trước, hoặc vẽ lại hình.');
      truoc = m; cach = 'điểm anh bấm';
    } else {
      let ung = hopLe.filter(m => satTuong[m] < 0.5);                       // mặt trước không áp tường
      if (!ung.length) return hong('Mép nào của hình cũng áp tường — không biết mặt trước tủ ở đâu. Bấm 1 điểm phía trước tủ.');
      const coTuong = ung.filter(m => satTuong[DOI[m]] >= 0.5);             // lưng áp tường
      if (coTuong.length) { ung = coTuong; cach = 'lưng áp tường'; }
      if (ung.length > 1) { const mx = Math.max(...ung.map(daiMep)); const dai2 = ung.filter(m => daiMep(m) > mx - 1); if (dai2.length < ung.length) { ung = dai2; cach = cach || 'chỗ khuyết ở mép sau, mặt trước là cạnh dài'; } }
      if (ung.length > 1) { kq.can_diem = true; return hong('Hình không cho biết phía nào là mặt trước tủ — bấm 1 điểm ở phía TRƯỚC tủ (phía đứng mở cánh).'); }
      truoc = ung[0]; cach = cach || 'chỗ khuyết ở mép sau';
    }
    // 6. hệ toạ độ tủ: b = hướng từ mặt trước vào lưng, ex = trục x của tủ (trái → phải khi đứng trước tủ)
    const b = truoc === 'D' ? [0, 1] : truoc === 'T' ? [0, -1] : truoc === 'L' ? [1, 0] : [-1, 0], ex = [b[1], -b[0]];
    const goc4 = [[bx0, by0], [bx1, by0], [bx1, by1], [bx0, by1]];
    const O = goc4.slice().sort((p, q) => (cham(p, ex) + cham(p, b)) - (cham(q, ex) + cham(q, b)))[0];
    const tu = q => [cham([q[0] - O[0], q[1] - O[1]], ex), cham([q[0] - O[0], q[1] - O[1]], b)];
    const rong = rn(Math.abs(cham([bx1 - bx0, by1 - by0], ex)), 1), sau = rn(Math.abs(cham([bx1 - bx0, by1 - by0], b)), 1);
    const khau = { trai: { rong: 0, sau: 0 }, phai: { rong: 0, sau: 0 }, giua_cot: [], giua: [] };
    for (const o of cum) {
      const p = tu([o.x0, o.y0]), q = tu([o.x1, o.y1]), x0 = Math.min(p[0], q[0]), x1 = Math.max(p[0], q[0]), y0 = Math.min(p[1], q[1]);
      const r = rn(x1 - x0, 1), s2 = rn(sau - y0, 1);
      const lon = (cu, moi2) => ({ rong: Math.max(cu.rong, moi2.rong), sau: Math.max(cu.sau, moi2.sau) });      // chỗ khuyết vẽ sẵn + cột của phòng cùng một góc: lấy phần lớn hơn
      if (x0 < 0.6) khau.trai = lon(khau.trai, { rong: r, sau: s2 });
      else if (x1 > rong - 0.6) khau.phai = lon(khau.phai, { rong: r, sau: s2 });
      else khau.giua_cot.push({ cach: rn(x0, 1), rong: r, sau: s2 });
    }
    khau.giua_cot.sort((p, q) => p.cach - q.cach);
    const G = ra(O); let a = (th + Math.atan2(ex[1], ex[0])) * 180 / Math.PI; a = ((a % 360) + 360) % 360; if (a > 180) a -= 360;
    const mepTrai = truoc === 'D' ? 'L' : truoc === 'T' ? 'P' : truoc === 'L' ? 'T' : 'D', mepPhai = DOI[mepTrai];
    kq.ok = true; kq.rong = rong; kq.sau = sau; kq.goc = [rn(G[0], 2), rn(G[1], 2)]; kq.xoay = sach(rn(a, 3)); kq.khau = khau; kq.chu_nhat = cum.length === 0;
    kq.sat_tuong = { truoc: rn(satTuong[truoc], 2), sau: rn(satTuong[DOI[truoc]], 2), trai: rn(satTuong[mepTrai], 2), phai: rn(satTuong[mepPhai], 2) };
    kq.mat_truoc = cach;
    kq.so_cot = soCot;
    kq.ghi_chu.push(`Hình ${g(rong)} × ${g(sau)}${cum.length ? `, ${cum.length} chỗ khấu cột${soCot ? ` (${soCot} chỗ lấy theo cột của phòng trên bản vẽ)` : ''}` : ''}; mặt trước xác định theo ${cach}.`);
    if (rong < sau) kq.ghi_chu.push(`Tủ này SÂU (${g(sau)}) hơn RỘNG (${g(rong)}) — nếu mặt trước bị nhận sai, bấm "Chọn lại mặt trước".`);
    return kq;
  }

  /**
   * HAI ĐIỂM BẤM DỌC CHÂN TƯỜNG → HÌNH PHỦ BÌ CỦA TỦ (bản 1.17 — anh Jason 03/10/2026 23:13: "vẽ hình chữ nhật chọn rất khó, làm sao … nhanh").
   * p1, p2 = hai đầu LƯNG tủ trên mặt bằng (bấm theo thứ tự nào cũng được); sau = chiều sâu phủ bì của tủ. Trả về 4 đỉnh hình chữ nhật để đưa tiếp vào `hinhThanhKhung`.
   * Phía TRƯỚC tủ:
   *   opt.truoc = [x, y]  điểm người dùng bấm thêm → phía đó;
   *   không có thì dò tường: điểm ĐẦU nằm trên một MẶT tường (opt.tuong[i] = { a, b, ra: [nx, ny] hướng từ thân tường ra ngoài mặt đó }, lệch tối đa 30 mm) và điểm thứ hai
   *     chạy dọc mặt đó → tủ quay ra phía `ra`; hai điểm được chiếu về đúng mặt tường (lưng tủ áp sát tường, không lệch góc vì bấm trượt, bấm vào mép cột cũng được);
   *   vẫn không rõ → can_diem = true (gọi lại với opt.truoc).
   * Không bám tường nào mà đoạn p1–p2 lệch trục x / y dưới 1,5° thì nắn thẳng theo trục.
   * opt.rong > 0: bề rộng tủ đã biết (đang gõ trong bảng, hoặc người dùng gõ số) — p2 khi đó chỉ cho biết tủ chạy về PHÍA nào kể từ p1.
   * @returns {{ ok, loi, can_diem, dinh: number[][], truoc: number[], rong, bam_tuong, mat_truoc }}
   */
  function haiDiemThanhHinh(p1, p2, sau, opt) {
    opt = opt || {};
    const kq = { ok: false, loi: '', can_diem: false };
    const hong = t => { kq.loi = t; return kq; };
    const so2 = q => (Array.isArray(q) ? [Number(q[0]), Number(q[1])] : [NaN, NaN]);
    let a = so2(p1), b = so2(p2);
    if (![a[0], a[1], b[0], b[1]].every(isFinite)) return hong('Chưa đủ 2 điểm.');
    sau = Number(sau);
    if (!(sau >= (Number(opt.sau_min) > 0 ? Number(opt.sau_min) : 100))) return hong('Chiều sâu tủ chưa hợp lệ (ô Sâu ở thẻ Tủ).');      // sau_min: vách đầu giường chỉ dày ~35 (bản 1.32)
    const rongBiet = Number(opt.rong) > 0 ? Number(opt.rong) : 0;
    if (rongBiet && rongBiet < 200) return hong('Bề rộng tủ phải từ 200 trở lên.');
    if (!(Math.hypot(b[0] - a[0], b[1] - a[1]) >= (rongBiet ? 20 : 200))) return hong(rongBiet ? 'Chưa rõ tủ chạy về phía nào — rê chuột dọc tường về phía tủ chạy tới rồi mới Enter.' : 'Hai điểm quá gần nhau (tủ rộng dưới 200) — bấm lại điểm đầu và điểm cuối của tủ.');
    // Mặt tường đi qua điểm ĐẦU (lệch ≤ 30, hình chiếu nằm trong đoạn mặt tường nới 30). Điểm thứ hai chỉ cần cho biết chạy DỌC mặt đó tới đâu (được chiếu lên đường mặt tường),
    // nên bấm vào mép cột, hay rê chuột lệch khỏi tường rồi Enter đều được. Điểm đầu ở góc phòng (nằm trên 2 mặt tường): lấy mặt mà điểm thứ hai chạy dọc theo nhiều nhất.
    let bam = null;
    for (const w of opt.tuong || []) {
      if (!w || !w.a || !w.b) continue;
      const dx = w.b[0] - w.a[0], dy = w.b[1] - w.a[1], Lw = Math.hypot(dx, dy);
      if (Lw < 50) continue;
      const ux = dx / Lw, uy = dy / Lw, kc = q => Math.abs(-(q[0] - w.a[0]) * uy + (q[1] - w.a[1]) * ux), doc = q => (q[0] - w.a[0]) * ux + (q[1] - w.a[1]) * uy;
      const d1 = kc(a), t1 = doc(a);
      if (d1 > 30 || t1 < -30 || t1 > Lw + 30) continue;
      const t2 = doc(b), diem = Math.abs(t2 - t1) - kc(b);      // chạy dọc nhiều hơn lệch ngang thì mới coi là đi theo mặt này
      if (diem <= 0) continue;
      if (!bam || diem > bam.diem + 1 || (Math.abs(diem - bam.diem) <= 1 && d1 < bam.d1)) bam = { w, diem, d1, t1, t2, ux, uy };
    }
    if (bam) { const w = bam.w; a = [w.a[0] + bam.ux * bam.t1, w.a[1] + bam.uy * bam.t1]; b = [w.a[0] + bam.ux * bam.t2, w.a[1] + bam.uy * bam.t2]; }
    else {
      const dx = b[0] - a[0], dy = b[1] - a[1], GOC = Math.tan(1.5 * Math.PI / 180);
      if (Math.abs(dy) <= Math.abs(dx) * GOC) b = [b[0], a[1]]; else if (Math.abs(dx) <= Math.abs(dy) * GOC) b = [a[0], b[1]];
    }
    let L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!(L >= (rongBiet ? 5 : 200))) return hong(rongBiet ? 'Chưa rõ tủ chạy về phía nào — rê chuột dọc tường về phía tủ chạy tới rồi mới Enter.' : 'Hai điểm quá gần nhau (tủ rộng dưới 200) — bấm lại điểm đầu và điểm cuối của tủ.');
    const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], n1 = [-u[1], u[0]];
    if (rongBiet) { b = [a[0] + u[0] * rongBiet, a[1] + u[1] * rongBiet]; L = rongBiet; }
    let n = null, cach = '';
    if (Array.isArray(opt.truoc) && opt.truoc.length >= 2) {
      const d = cham([Number(opt.truoc[0]) - a[0], Number(opt.truoc[1]) - a[1]], n1);
      if (!(Math.abs(d) >= 1)) return hong('Điểm phía trước nằm ngay trên lưng tủ — bấm lại 1 điểm ở phía TRƯỚC tủ (phía đứng mở cánh).');
      n = d > 0 ? n1 : [-n1[0], -n1[1]]; cach = 'điểm anh bấm';
    } else if (bam && Array.isArray(bam.w.ra) && Math.abs(cham(bam.w.ra, n1)) > 0.5) {
      n = cham(bam.w.ra, n1) > 0 ? n1 : [-n1[0], -n1[1]]; cach = 'tường phía sau';
    } else { kq.can_diem = true; return hong('Hai điểm không nằm trên mặt tường nào của phòng — bấm thêm 1 điểm ở phía TRƯỚC tủ (phía đứng mở cánh).'); }
    const r2 = q => [rn(q[0], 2), rn(q[1], 2)];
    kq.ok = true;
    kq.dinh = [a, b, [b[0] + n[0] * sau, b[1] + n[1] * sau], [a[0] + n[0] * sau, a[1] + n[1] * sau]].map(r2);
    kq.truoc = r2([(a[0] + b[0]) / 2 + n[0] * (sau + 300), (a[1] + b[1]) / 2 + n[1] * (sau + 300)]);
    kq.rong = rn(L, 1); kq.bam_tuong = !!bam; kq.mat_truoc = cach;
    return kq;
  }

  /**
   * Dấu ĐIỆN – NƯỚC để vẽ vào bản vẽ (bản 1.18): một bản vẽ DXF nhỏ (chuỗi). Chenfeng nhận file .dxf thả vào vùng vẽ và dựng Line / Circle / Polyline / Text
   * đúng toạ độ trong file (lệnh "CAD图纸导入" — 1 bước hoàn tác).
   *   Điểm trên tường: ô đúng cỡ nằm trên mặt tường (nhô 2 mm vào phòng cho khỏi chìm vào mặt tường) + dấu riêng từng loại + nhãn "ký hiệu +cao".
   *   Điểm dưới sàn: vòng tròn trên sàn (thoát sàn gạch chéo, ống chờ có vòng trong) + nhãn.
   * Mặt tường trong DXF: hướng đùn (mã 210 / 220 / 230) = pháp tuyến n của tường; Chenfeng lấy trục x của mặt = ẑ × n (đúng bằng hướng chạy d của tường), trục y = ẑ
   * — đã đo trên Chenfeng thật 04/10/2026. Nhãn KHÔNG DẤU (phông của Chenfeng thiếu chữ Việt). Màu theo bảng màu CAD (đã xem trên nền tường xám lẫn sàn tối của Chenfeng): điện 30 (cam), cấp nước 140 (xanh), thoát 34 (nâu), khác 200 (tím).
   * @returns {{ dxf: string, so: number, hop: {x0, x1, y0, y1, z0, z1} | null }}  so = số điểm có dấu; hop = hộp bao các nét (không kể chữ) để máy vẽ đối chiếu sau khi thả
   */
  function dienNuocDXF(H, opt) {
    opt = Object.assign({ nho: 2, cao_chu: 40 }, opt || {});
    const o = (H && H.p && H.p.goc) || [0, 0, 0], E = [], hop = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
    const MAU = { dien: 30, cap: 140, thoat: 34, khac: 200 }, f = v => String(rn(v, 3)), ct = opt.cao_chu;
    const khongDau = t => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
    const ghi = (...kv) => { for (let i = 0; i < kv.length; i += 2) E.push(String(kv[i]), String(kv[i + 1])); };
    const bao = q => { hop.x0 = Math.min(hop.x0, q[0]); hop.x1 = Math.max(hop.x1, q[0]); hop.y0 = Math.min(hop.y0, q[1]); hop.y1 = Math.max(hop.y1, q[1]); hop.z0 = Math.min(hop.z0, q[2]); hop.z1 = Math.max(hop.z1, q[2]); };
    const doan = (a, b, mau) => { ghi(0, 'LINE', 8, '0', 62, mau, 10, f(a[0]), 20, f(a[1]), 30, f(a[2]), 11, f(b[0]), 21, f(b[1]), 31, f(b[2])); bao(a); bao(b); };
    let so = 0;
    ghi(0, 'SECTION', 2, 'ENTITIES');
    for (const d of (H && H.dn) || []) {
      const w = d.w, mau = MAU[d.nhom] || 7, r = d.rong / 2, h = d.cao_o / 2, nhan = khongDau(d.nhan);
      if (d.cach < -0.05 || d.cach > w.dai + 0.05) continue;
      so++;
      if (d.san) {
        // trên sàn: mặt phẳng XY, nhô 1 mm khỏi mặt sàn
        const c = [d.P[0] + o[0], d.P[1] + o[1], o[2] + 1], k = r * 0.7071;
        ghi(0, 'CIRCLE', 8, '0', 62, mau, 10, f(c[0]), 20, f(c[1]), 30, f(c[2]), 40, f(r));
        bao([c[0] - r, c[1] - r, c[2]]); bao([c[0] + r, c[1] + r, c[2]]);
        if (d.loai === 'thoat_san') { doan([c[0] - k, c[1] - k, c[2]], [c[0] + k, c[1] + k, c[2]], mau); doan([c[0] - k, c[1] + k, c[2]], [c[0] + k, c[1] - k, c[2]], mau); }
        else ghi(0, 'CIRCLE', 8, '0', 62, mau, 10, f(c[0]), 20, f(c[1]), 30, f(c[2]), 40, f(r * 0.45));
        ghi(0, 'TEXT', 8, '0', 62, mau, 10, f(c[0] + r + 20), 20, f(c[1] - ct / 2), 30, f(c[2]), 40, f(ct), 1, nhan);
        continue;
      }
      // trên tường: toạ độ trong mặt tường (u dọc tường = P·d, v = cao độ), cao trình của mặt = P·n + nhô
      const C = [d.P[0] + o[0], d.P[1] + o[1], d.z + o[2]], n = w.n, dd = w.d, u0 = C[0] * dd[0] + C[1] * dd[1], v0 = C[2], e = C[0] * n[0] + C[1] * n[1] + opt.nho;
      const W3 = (u, v) => [C[0] + dd[0] * (u - u0) + n[0] * opt.nho, C[1] + dd[1] * (u - u0) + n[1] * opt.nho, v];      // điểm (u, v) của mặt tường → toạ độ bản vẽ
      const dun = [210, f(n[0]), 220, f(n[1]), 230, 0], tron = (u, v, bk) => ghi(0, 'CIRCLE', 8, '0', 62, mau, 10, f(u), 20, f(v), 30, f(e), 40, f(bk), ...dun);
      if (d.tron) {
        tron(u0, v0, r);
        if (d.loai === 'thoat_nuoc') tron(u0, v0, r * 0.45);
        else { doan(W3(u0 - r * 0.6, v0), W3(u0 + r * 0.6, v0), mau); doan(W3(u0, v0 - r * 0.6), W3(u0, v0 + r * 0.6), mau); }
      } else {
        ghi(0, 'LWPOLYLINE', 8, '0', 62, mau, 90, 4, 70, 1, 38, f(e), 10, f(u0 - r), 20, f(v0 - h), 10, f(u0 + r), 20, f(v0 - h), 10, f(u0 + r), 20, f(v0 + h), 10, f(u0 - r), 20, f(v0 + h), ...dun);
        if (d.loai === 'o_dien') { const a = Math.min(19, r * 0.4), bk = Math.min(7, h * 0.35); tron(u0 - a, v0, bk); tron(u0 + a, v0, bk); }
        else if (d.loai === 'cong_tac') doan(W3(u0, v0 - h * 0.6), W3(u0, v0 + h * 0.6), mau);
        else { doan(W3(u0 - r, v0 - h), W3(u0 + r, v0 + h), mau); doan(W3(u0 - r, v0 + h), W3(u0 + r, v0 - h), mau); }
      }
      bao(W3(u0 - r, v0 - h)); bao(W3(u0 + r, v0 + h));
      // nhãn bên phải ô; sát cuối tường thì ghi sang bên trái (bề rộng chữ ≈ 0,82 × cao chữ mỗi ký tự — đo trên Chenfeng)
      const chu = `${nhan} +${g(d.z).replace(',', '.')}`, rongChu = chu.length * ct * 0.82, uc = d.cach + r + 20 + rongChu > w.dai && d.cach - r - 20 - rongChu > 0 ? u0 - r - 20 - rongChu : u0 + r + 20;
      ghi(0, 'TEXT', 8, '0', 62, mau, 10, f(uc), 20, f(v0 - ct / 2), 30, f(e), 40, f(ct), 1, chu, ...dun);
      // dấu trên SÀN ở chân tường (để nhìn từ trên xuống — lúc đặt tủ trên mặt bằng — vẫn thấy điểm nằm đâu): tam giác chỉ vào tường + ký hiệu, chữ chạy dọc tường và đọc xuôi
      const zs = o[2] + 1, F = (s2, t2) => [C[0] + dd[0] * s2 + n[0] * t2, C[1] + dd[1] * s2 + n[1] * t2, zs], ctn = ct * 0.75;
      doan(F(-30, opt.nho), F(30, opt.nho), mau); doan(F(30, opt.nho), F(0, 55), mau); doan(F(0, 55), F(-30, opt.nho), mau);
      let goc = ((w.a % 360) + 360) % 360, lat = false; if (goc > 90 && goc <= 270) { goc -= 180; lat = true; }      // chữ chạy theo d hoặc ngược d cho khỏi lộn đầu
      const tx = lat ? [-dd[0], -dd[1]] : dd, len = [-tx[1], tx[0]], rc = nhan.length * ctn * 0.82, tam = F(0, 70 + ctn / 2);      // len = hướng "lên" của chữ; tam = tâm chữ
      ghi(0, 'TEXT', 8, '0', 62, mau, 10, f(tam[0] - tx[0] * rc / 2 - len[0] * ctn / 2), 20, f(tam[1] - tx[1] * rc / 2 - len[1] * ctn / 2), 30, f(zs), 40, f(ctn), 1, nhan, 50, f(goc));
    }
    ghi(0, 'ENDSEC', 0, 'EOF');
    if (!so) return { dxf: '', so: 0, hop: null };
    for (const k in hop) hop[k] = rn(hop[k], 2);
    return { dxf: E.join('\n') + '\n', so, hop };
  }

  /* ------------------------------------------------------------------ *
   * VẼ LẠI PHÒNG KHÔNG VẼ CHỒNG (bản 1.23 — anh Jason 04/10/2026 23:06: "vẽ phòng hay bị … Chenfeng chỉ vẽ được 0/4 tường").
   * Đo trên Chenfeng thật 04/10/2026: lệnh vẽ tường KHÔNG dựng đoạn tường nào nằm trùng tường đã có (phòng y hệt vẽ lần hai → 0 tường mới, bảng cũ báo lỗi nhầm),
   * còn lỗ cửa / cột / dầm thì vẽ chồng thành hai. Xoá tường bằng ERASE thì lỗ cửa trên tường đó, sàn, trần, vùng phòng mất theo; cột, dầm, dấu điện – nước phải xoá riêng.
   * Tường thật: mặt TRONG của mỗi tường (RightCurves khi đi theo chiều kim đồng hồ) = đúng cạnh lòng phòng; mặt ngoài dài thêm một bề dày ở mỗi đầu.
   * → trước khi vẽ, bảng ĐỐI CHIẾU: cái gì đã có đúng chỗ thì giữ, cái gì của LẦN VẼ TRƯỚC (bản ghi `da_ve` đi theo phòng) mà nay không còn đúng thì bỏ, chỉ vẽ cái còn thiếu.
   * Không có bản ghi thì bảng không xoá gì (không chắc là của mình) — chỉ vẽ phần thiếu và báo tường cũ nằm chồng.
   * ------------------------------------------------------------------ */
  const TOL_BV = 1;      // mm: dung sai khi so đối tượng phòng trên bản vẽ với phòng của bảng
  const hop6 = (pts, z0, z1) => { const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]); return [rn(Math.min(...xs), 2), rn(Math.max(...xs), 2), rn(Math.min(...ys), 2), rn(Math.max(...ys), 2), rn(z0, 2), rn(z1, 2)]; };
  /**
   * Phòng sẽ chiếm những gì trên bản vẽ (toạ độ bản vẽ = toạ độ phòng + điểm đặt `goc`); day = bề dày tường khi vẽ (nằm NGOÀI lòng phòng).
   * @returns {{ kin, tuong: [{ i, ten, a: [x, y], b: [x, y], z, cao, day }], mo: [{ j, ten, tuong, loai, hop }], cot: [{ j, ten, tuong, hop }], dam: [...] }}
   *   a → b = mặt trong của tường (cạnh lòng phòng); hop = [x0, x1, y0, y1, z0, z1]. Chỉ gồm những thứ máy vẽ thật sự vẽ (bỏ cửa / cột chưa đủ số đo).
   */
  function phanPhong(H, day) {
    day = num(day, (H && H.p && H.p.day) || 110);
    const o = (H.p && H.p.goc) || [0, 0, 0], cao = H.p.cao, P2 = q => [rn(q[0] + o[0], 2), rn(q[1] + o[1], 2)];
    const tren = (w, s, t) => P2(cong(cong(w.p0, nhan(w.d, s)), nhan(w.n, t)));
    const W = (H.tuong || []).filter(w => w.dai > 0), dW = w => (w.day > 0 ? w.day : day);      // (1.36) tường khách của tường chung: dày theo phòng chủ (tim trùng → Chenfeng không dựng chồng)
    const out = { kin: !!(H.khep && H.khep.kin) && W.length >= 3, tuong: W.map(w => ({ i: w.i, ten: w.ten, a: P2(w.p0), b: P2(w.p1), z: rn(o[2], 2), cao, day: dW(w) })), mo: [], cot: [], dam: [] };
    for (const m of H.mo || []) if (!m.chung && m.rong > 0 && m.cao > 0) out.mo.push({ j: m.j, ten: m.ten, tuong: m.w.i, loai: m.loai, hop: hop6([tren(m.w, m.cach, 0), tren(m.w, m.cach + m.rong, -dW(m.w))], o[2] + m.be, o[2] + m.be + m.cao) });      // lỗ bóng: phòng sở hữu cửa khoét, một lần · cửa phụ: hộp mặt ngoài → mặt trong vách (w = mặt ngoài, dày = vách)
    // (1.41.0) vách ngăn phòng con: a → b = mặt TRONG vách (RightCurves của tường sẽ dựng), theo chuỗi chiều kim đồng hồ quanh lòng phòng con; chỉ có khoá khi phòng có phòng con
    if ((H.con || []).length) out.vach = H.con.flatMap(c => c.chuoi.map(([mat, A, B]) => ({ con: c.id, ten: `${c.ten}·${TEN_MAT[mat]}`, mat, a: P2(A), b: P2(B), z: rn(o[2], 2), cao: c.cao, day: c.v })));
    for (const c of H.can || []) {
      const dam = c.loai === 'dam';
      if (!(c.rong > 0 && c.nho > 0) || (dam && !(c.z1 > c.z0))) continue;
      (dam ? out.dam : out.cot).push({ j: c.j, ten: c.ten, tuong: c.w.i, hop: hop6([tren(c.w, c.cach, 0), tren(c.w, c.cach + c.rong, c.nho)], dam ? o[2] + c.z0 : o[2], dam ? o[2] + c.z1 : o[2] + cao) });      // cột: Chenfeng vẽ cao hết tường
    }
    return out;
  }
  /**
   * BẢN GHI một lần vẽ phòng (đi theo phòng, lưu cùng phòng): những gì lần vẽ đó đã đặt lên bản vẽ — để lần sau biết đối tượng nào trên bản vẽ là của chính phòng này.
   * moi = phanPhong lúc vẽ; that = { mo, cot, dam: [hộp thật của từng mục theo đúng thứ tự | false = không vẽ được], dn: hộp bao các dấu điện – nước, dn_ma, dn_so }.
   * Mục nào Chenfeng đặt khác số muốn (dầm bị hạ cho khỏi vượt trần, cột trên tường xiên) thì ghi cả hộp muốn `m` lẫn hộp thật `t`.
   */
  function banGhiPhong(moi, that) {
    that = that || {};
    const muc = (ds, tt) => { const o = []; ds.forEach((x, i) => { const t = tt && tt[i]; if (t === false) return; const r = { m: x.hop.slice() }; if (so6(t) && t.some((v, q) => Math.abs(v - x.hop[q]) > TOL_BV)) r.t = t.map(v => rn(v, 2)); o.push(r); }); return o; };
    const ghiT = w => [w.a[0], w.a[1], w.b[0], w.b[1], w.z, w.cao, w.day];
    const r = { tuong: moi.tuong.map(ghiT), mo: muc(moi.mo, that.mo), cot: muc(moi.cot, that.cot), dam: muc(moi.dam, that.dam) };
    // (1.41.0) vach = vách ngăn phòng con lần này dựng (đang CÓ trên bản vẽ — tuongGhi lọc) → lần sau nhận ra vách cũ, phòng con dời / bỏ thì bỏ vách cũ
    // (1.36) muon = tường của hình phòng này nằm trên tường phòng bên dựng (tường chung giữ của phòng bên — không đứng tên, nhưng phòng bên vẽ lại không được xoá);
    // giu = tường phòng này dựng trước đây, nay hình không cần mà phòng bên còn dựa vào (doiChieuPhong.giu_ghi) — vẫn đứng tên
    if (Array.isArray(that.muon) && that.muon.length) r.muon = that.muon.map(ghiT);
    if (Array.isArray(that.giu) && that.giu.length) r.giu = that.giu.filter(x => Array.isArray(x) && x.length >= 7).map(x => x.slice(0, 7));
    if (Array.isArray(that.vach) && that.vach.length) r.vach = that.vach.map(ghiT);
    if (that.manh === 1 || that.manh === true) r.manh = 1;      // (1.41.0 vòng soát) tường của phòng đã bị Chenfeng cắt mảnh ở chỗ vách chạm [CĐ] — xem doiChieuPhong
    if (so6(that.dn)) { r.dn = that.dn.map(v => rn(v, 2)); if (that.dn_ma) r.dn_ma = String(that.dn_ma).slice(0, 24); if (Number.isInteger(that.dn_so) && that.dn_so > 0) r.dn_so = that.dn_so; }      // dn = hộp bao các dấu điện – nước đã thả vào bản vẽ, dn_ma = mã của nội dung (đổi điểm nào thì mã đổi), dn_so = số nét + chữ Chenfeng đã dựng
    return r;
  }
  /**
   * (1.36) Tường của lần vẽ vừa xong chia cho bản ghi: k = doiChieuPhong SAU khi vẽ, co_tuong[i] = tường i đã có trên bản vẽ (tuongPhuKin).
   * → { tuong (đứng tên), muon (nằm trên tường phòng bên dựng), giu (k.giu_ghi) } — đưa thẳng vào banGhiPhong(Object.assign({}, moi, { tuong }), { muon, giu, … }).
   */
  function tuongGhi(moi, k, co_tuong, co_vach) {
    const W = (moi && moi.tuong) || [], t = (k && k.tuong) || [], co = i => !co_tuong || !!co_tuong[i];
    const r = { tuong: W.filter((w, i) => co(i) && !(t[i] && t[i].nam_tren)), muon: W.filter((w, i) => co(i) && t[i] && t[i].nam_tren), giu: (k && k.giu_ghi) || [] };
    // (1.41.0) vách ngăn phòng con: chỉ ghi vách đang CÓ trên bản vẽ và do lần này dựng (không nằm trên tường sẵn có khác)
    if (k && k.manh) r.manh = 1;
    if (moi && Array.isArray(moi.vach)) { const kv = (k && k.vach) || []; r.vach = moi.vach.filter((v, i) => (!co_vach || !!co_vach[i]) && !(kv[i] && kv[i].nam_tren)); }
    return r;
  }
  /**
   * ĐỐI CHIẾU phòng sắp vẽ với các đối tượng phòng đang có trên bản vẽ.
   * moi = phanPhong(H, day). co = { tuong: [{ mat: [[a, b], …] các mặt của tường, day, cao, z }], lo: [{ hop }], cot: [{ hop }], dam: [{ hop }] } — đọc từ bản vẽ (D.docPhong).
   * cu = bản ghi lần vẽ trước của chính phòng này (banGhiPhong) hoặc null.
   * @returns {{
   *   tuong: [{ co, nam_tren }]   theo thứ tự moi.tuong: co = chỉ số trong co.tuong của tường đã có đúng chỗ (−1 = phải vẽ); nam_tren = tường mới nằm gọn trên mặt một tường sẵn có KHÁC (tường chung với phòng bên) — coi như đã có,
   *   ve_tuong: [{ diem: [[x, y, z], …], khep, tuong: [vị trí trong moi.tuong] }]   các chuỗi điểm cho lệnh vẽ tường (đi theo chiều kim đồng hồ; khep = cả vòng, kết thúc bằng lệnh khép),
   *   mo, cot, dam: [{ co }]      như trên cho từng lỗ cửa / cột / dầm,
   *   bo: { tuong, lo, cot, dam: [chỉ số trong co.…] }   đối tượng của LẦN VẼ TRƯỚC nay không còn đúng → phải bỏ trước khi vẽ,
   *   trung: { lo, cot, dam: [chỉ số] }   lỗ cửa / cột / dầm thừa nằm chồng khít lên một cái đang giữ (vẽ trùng) → dọn,
   *   chong: [chỉ số trong co.tuong]   tường cũ KHÔNG phải của lần vẽ trước mà nằm chồng một phần lên tường mới / nằm trong lòng phòng mới — bảng không tự xoá,
   *   trong: [chỉ số trong co.tuong]   phần của `chong` nằm hẳn TRONG lòng phòng mới (tường cắt ngang phòng) — máy vẽ dừng lại hỏi người dùng trước khi vẽ,
   *   thua: { cot, dam: [chỉ số] }     cột / dầm cũ không khớp mục nào, nằm trong lòng phòng mới — chỉ bỏ khi người dùng đồng ý bỏ phòng cũ,
   *   co_ban_ghi: bản ghi `cu` có được dùng không (lần vẽ đó nằm chồng lên chỗ sắp vẽ),
   *   giu_ghi: [bản ghi tường của `cu`]   (1.36) tường của lần vẽ trước còn ở lại vì phòng bên dựa vào / tường mới nằm trên nó — ghi vào `giu` của bản ghi mới (tuongGhi) }}
   */
  function doiChieuPhong(moi, co, cu, opt) {
    co = co || {};
    // (1.36) opt.khac = bản ghi lần vẽ của các phòng KHÁC trong công trình: tường / lỗ / cột / dầm của chúng không bao giờ bị bỏ, không bị báo vướng
    const khac = (opt && Array.isArray(opt.khac) ? opt.khac : []).filter(r => r && typeof r === 'object');
    const T = TOL_BV, CT = co.tuong || [], n = moi.tuong.length;
    const gan = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= T;
    const trung = (m, a, b) => (gan(m[0], a) && gan(m[1], b)) || (gan(m[0], b) && gan(m[1], a));
    const kcDoan = (p, m) => { const dx = m[1][0] - m[0][0], dy = m[1][1] - m[0][1], L2 = dx * dx + dy * dy; const t = L2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((p[0] - m[0][0]) * dx + (p[1] - m[0][1]) * dy) / L2)); return Math.hypot(p[0] - m[0][0] - t * dx, p[1] - m[0][1] - t * dy); };
    const namTren = (m, a, b) => kcDoan(a, m) <= T && kcDoan(b, m) <= T;
    const hopGan = (h1, h2) => !!h1 && !!h2 && h1.every((v, i) => Math.abs(v - h2[i]) <= T);
    // Bản ghi chỉ có nghĩa khi lần vẽ đó nằm CHỒNG lên chỗ sắp vẽ (hộp bao lòng phòng giao nhau). Cùng một phòng mà điểm đặt đã dời hẳn sang chỗ khác
    // (đặt thêm một phòng giống hệt bên cạnh) thì phòng đã vẽ ở chỗ cũ không phải "phòng cũ phải bỏ".
    if (cu) {
      const bao = ds => ds.reduce((h, q) => [Math.min(h[0], q[0]), Math.max(h[1], q[0]), Math.min(h[2], q[1]), Math.max(h[3], q[1])], [Infinity, -Infinity, Infinity, -Infinity]);
      // (1.41.0 vòng soát) phòng có phòng con (bản ghi / hình mới có vách): hộp bao tính cả tường `muon` / `giu` + vách — phòng mà mọi tường chính nằm trên tường vẽ tay
      // (cu.tuong rỗng) không mất bản ghi, vách cũ của chính nó vẫn nhận ra (không thì dời WC là DỪNG hỏi vì "tường lạ trong lòng phòng"). Phòng không phòng con: y như cũ.
      const lien = Array.isArray(moi.vach) || (Array.isArray(cu.vach) && cu.vach.length > 0) || cu.manh === 1;
      const dsBao = (cu.tuong || []).concat(lien ? [].concat(cu.muon || [], cu.giu || [], cu.vach || []).filter(r => Array.isArray(r) && r.length >= 4) : []);
      const h1 = bao(dsBao.flatMap(r => [[r[0], r[1]], [r[2], r[3]]])), h2 = bao(moi.tuong.flatMap(w => [w.a, w.b]));
      if (!(Math.min(h1[1], h2[1]) - Math.max(h1[0], h2[0]) > T && Math.min(h1[3], h2[3]) - Math.max(h1[2], h2[2]) > T)) cu = null;
    }
    const dsT = (r, k) => (r && Array.isArray(r[k]) ? r[k] : []).filter(x => Array.isArray(x) && x.length >= 4);
    // (1.41.0) phòng con: MV = vách ngăn sắp vẽ (chỉ có khi phòng có phòng con), cuV = vách của lần vẽ trước. Mọi nhánh mới chỉ chạy khi có một trong hai → phòng cũ y hệt.
    // (vòng soát) cu.manh = lần vẽ trước đã nhận tường theo mảnh: bỏ hết phòng con thì bản ghi không còn vách nhưng mảnh tường do vách cũ cắt vẫn còn trên bản vẽ
    const MV = Array.isArray(moi.vach) ? moi.vach : null, cuV = dsT(cu, 'vach'), coCon = !!MV || cuV.length > 0 || !!(cu && cu.manh === 1);
    // [CĐ] Chenfeng có thể CẮT mặt tường cũ thành mảnh ở chỗ vách chạm giữa tường (chữ T): nhận tường theo các mảnh cùng đường phủ kín a → b (≥ 2 mảnh)
    let dungManh = false;
    const khopManh = (e, a, b) => { if (!coCon) return false; const ds = (e.mat || []).filter(m => namTren([a, b], m[0], m[1])); return ds.length >= 2 && tuongPhuKin({ a, b, day: e.day }, { tuong: [{ mat: ds, day: e.day }] }); };
    // (1.36) bản ghi `giu` = tường do phòng này dựng ở lần vẽ trước mà nay hình phòng không còn cần, nhưng phòng bên đang DỰA vào (giữ lại cho phòng bên) — vẫn là của phòng này
    const cuT = dsT(cu, 'tuong').concat(dsT(cu, 'giu'), cuV);
    const laCuT = CT.map(e => cuT.some(r => (e.mat || []).some(m => trung(m, [r[0], r[1]], [r[2], r[3]])) || (khopManh(e, [r[0], r[1]], [r[2], r[3]]) && (dungManh = true))));      // tường này do lần vẽ trước của phòng dựng
    // tường của phòng bên: bản ghi của nó trùng / nằm trên một mặt (tường chung do phòng kia dựng ghi mặt trong phía bên đó).
    // (1.36) cả tường phòng bên đang DỰA vào (`muon`: tường chung nó giữ mà phòng khác dựng) và tường nó giữ hộ (`giu`) — không có thì vẽ lại phòng dựng tường xoá mất tường của phòng bên
    // (1.41.0) và vách ngăn phòng con của phòng bên (`vach`)
    const khacT = khac.flatMap(r => dsT(r, 'tuong').concat(dsT(r, 'muon'), dsT(r, 'giu'), dsT(r, 'vach')));
    const laKhacT = CT.map(e => khacT.some(r => (e.mat || []).some(m => trung(m, [r[0], r[1]], [r[2], r[3]]) || namTren(m, [r[0], r[1]], [r[2], r[3]])) || khopManh(e, [r[0], r[1]], [r[2], r[3]])));
    // --- tường ---
    const giuT = new Set(), cheT = new Set();
    const tuong = moi.tuong.map(w => {
      const cung = e => Math.abs(e.day - w.day) <= T && Math.abs(e.cao - w.cao) <= T && Math.abs((e.z || 0) - w.z) <= T;
      let k = CT.findIndex(e => (e.mat || []).some(m => trung(m, w.a, w.b)) && cung(e));
      if (k < 0 && coCon) { k = CT.findIndex(e => khopManh(e, w.a, w.b) && cung(e)); if (k >= 0) dungManh = true; }
      if (k >= 0) { giuT.add(k); return { co: k, nam_tren: false }; }
      k = CT.findIndex((e, q) => (!laCuT[q] || laKhacT[q]) && (e.mat || []).some(m => namTren(m, w.a, w.b)));
      if (k >= 0) { cheT.add(k); return { co: k, nam_tren: true }; }
      return { co: -1, nam_tren: false };
    });
    // --- (1.41.0) vách ngăn phòng con: trùng mặt trong + dày / cao / z → giữ; nằm trên một tường sẵn có KHÁC → coi như đã có; không thì phải vẽ ---
    const giuV = new Set(), cheV = new Set();
    const vach = MV ? MV.map(v => {
      let k = CT.findIndex((e, q) => !giuT.has(q) && !giuV.has(q) && (e.mat || []).some(m => trung(m, v.a, v.b)) && Math.abs(e.day - v.day) <= T && Math.abs(e.cao - v.cao) <= T && Math.abs((e.z || 0) - v.z) <= T);
      if (k >= 0) { giuV.add(k); return { co: k, nam_tren: false }; }
      k = CT.findIndex((e, q) => (!laCuT[q] || laKhacT[q]) && (e.mat || []).some(m => namTren(m, v.a, v.b)));
      if (k >= 0) { cheV.add(k); return { co: k, nam_tren: true }; }
      return { co: -1, nam_tren: false };
    }) : null;
    const laVachMinh = q => giuV.has(q) || cheV.has(q);
    const boT = []; CT.forEach((e, q) => { if (laCuT[q] && !giuT.has(q) && !cheT.has(q) && !laKhacT[q] && !laVachMinh(q)) boT.push(q); });
    // (1.36) tường của phòng này còn ở lại (phòng bên dựa vào / tường mới nằm trên nó) mà không khớp tường nào của hình mới: chuyển bản ghi sang `giu` → vẫn đứng tên, lần sau bỏ được
    const giu_ghi = [];
    CT.forEach((e, q) => { if (!laCuT[q] || giuT.has(q) || laVachMinh(q) || boT.indexOf(q) >= 0) return; for (const r of cuT) if ((e.mat || []).some(m => trung(m, [r[0], r[1]], [r[2], r[3]])) && !giu_ghi.some(x => x.every((v, i) => v === r[i]))) giu_ghi.push(r.slice()); });
    // chuỗi điểm cho lệnh vẽ tường: các tường thiếu liền nhau đi chung một lệnh (theo đúng chiều đi quanh phòng → bề dày vẫn nằm ngoài)
    // (1.36) tường khác dày (tường khách dày theo phòng chủ) không đi chung một lệnh: mỗi chuỗi một bề dày, chuỗi mang `day` khi phòng có nhiều bề dày
    const thieu = tuong.map(t => t.co < 0), ve_tuong = [], d3 = (q, z) => [q[0], q[1], z];
    const cungDay = (i, k) => Math.abs((moi.tuong[i].day || 0) - (moi.tuong[k].day || 0)) <= 0.01, motDay = moi.tuong.every((w, i) => cungDay(0, i));
    if (n && thieu.every(Boolean) && moi.kin && motDay) ve_tuong.push({ diem: moi.tuong.map(w => d3(w.a, w.z)), khep: true, tuong: moi.tuong.map((w, i) => i) });
    else if (n) {
      const noi = i => (i + 1 < n || moi.kin) && gan(moi.tuong[i].b, moi.tuong[(i + 1) % n].a) && cungDay(i, (i + 1) % n);      // tường i nối liền sang tường kế tiếp (cùng dày)
      const da = new Set();
      for (let s0 = 0; s0 < n; s0++) {
        const tr = (s0 - 1 + n) % n;
        if (!thieu[s0] || da.has(s0) || (n > 1 && thieu[tr] && noi(tr))) continue;      // không thiếu, hoặc không phải đầu chuỗi
        const ds = []; let i = s0;
        while (thieu[i] && !da.has(i)) { ds.push(i); da.add(i); if (!noi(i)) break; i = (i + 1) % n; }
        const c = { diem: [d3(moi.tuong[ds[0]].a, moi.tuong[ds[0]].z)].concat(ds.map(q => d3(moi.tuong[q].b, moi.tuong[q].z))), khep: false, tuong: ds };
        if (!motDay) c.day = moi.tuong[ds[0]].day;
        ve_tuong.push(c);
      }
    }
    // --- lỗ cửa, cột, dầm: so hộp; có bản ghi thì nhận ra cả mục Chenfeng đã đặt lệch số muốn ---
    const hopKhac = ten => khac.flatMap(r => (Array.isArray(r[ten]) ? r[ten] : []).flatMap(x => [x && x.m, x && x.t].filter(so6)));
    const HK = { lo: hopKhac('mo'), cot: hopKhac('cot'), dam: hopKhac('dam') }, laKhacH = (h, ds) => !!h && ds.some(k => hopGan(h, k));
    const doi = (dsMoi, dsCo, dsCu, dsKhac) => {
      dsCo = dsCo || [];
      const giu = new Set();
      const kq = dsMoi.map(x => {
        let k = dsCo.findIndex((e, q) => !giu.has(q) && hopGan(e.hop, x.hop));
        if (k < 0 && dsCu) { const r = dsCu.find(r0 => r0.t && hopGan(r0.m, x.hop)); if (r) k = dsCo.findIndex((e, q) => !giu.has(q) && hopGan(e.hop, r.t)); }
        if (k >= 0) giu.add(k);
        return { co: k };
      });
      // vẽ TRÙNG: đối tượng thừa chồng khít lên một cái đang giữ (bản trước bấm "Vẽ phòng" hai lần là lỗ cửa / cột / dầm thành hai cái chồng nhau) → dọn, có bản ghi hay không cũng vậy
      const trung = []; dsCo.forEach((e, q) => { if (!giu.has(q) && e.hop && [...giu].some(k => hopGan(e.hop, dsCo[k].hop))) trung.push(q); });
      const bo = []; if (dsCu) dsCo.forEach((e, q) => { if (!giu.has(q) && trung.indexOf(q) < 0 && dsCu.some(r => hopGan(e.hop, r.t || r.m)) && !laKhacH(e.hop, dsKhac)) bo.push(q); });
      return { kq, bo, trung };
    };
    const M = doi(moi.mo, co.lo, cu && cu.mo, HK.lo), C = doi(moi.cot, co.cot, cu && cu.cot, HK.cot), D = doi(moi.dam, co.dam, cu && cu.dam, HK.dam);
    // CỘT vẽ trùng trên Chenfeng thật không chồng khít (đo 04/10/2026): vẽ cột vào chỗ đã có cột thì Chenfeng ĐẨY cột mới sang bên theo cạnh NGẮN của đáy cột (bằng nhau thì theo x),
    // về phía dương, đúng một bề cột; bấm nữa thì đẩy tiếp thành một dãy liền nhau. Cột thừa ra ngoài phòng cao mặc định 1000, vào trong phòng thì cao bằng tường.
    // → cột cùng cỡ đáy nằm đúng các bậc liền nhau đó (bậc 2 trở đi phải cao như bậc 1 — cột thật của phòng bên kia tường thường cao khác) là cột vẽ trùng.
    {
      const CC = co.cot || [], giuC = new Set(C.kq.map(x => x.co).filter(q => q >= 0)), day4 = (h1, h2) => [0, 1, 2, 3].every(i => Math.abs(h1[i] - h2[i]) <= T);
      for (const x of C.kq) {
        if (x.co < 0 || !CC[x.co].hop) continue;
        const g0 = CC[x.co].hop, truc = (g0[1] - g0[0]) <= (g0[3] - g0[2]) ? 0 : 1, be = g0[truc * 2 + 1] - g0[truc * 2];
        let z = null;
        for (let b = 1; b <= 30 && be > T; b++) {
          const muon = g0.slice(); muon[truc * 2] += b * be; muon[truc * 2 + 1] += b * be;
          const q = CC.findIndex((e, i) => !giuC.has(i) && C.trung.indexOf(i) < 0 && C.bo.indexOf(i) < 0 && e.hop && day4(e.hop, muon) && (!z || (Math.abs(e.hop[4] - z[0]) <= T && Math.abs(e.hop[5] - z[1]) <= T)));
          if (q < 0) break;
          if (!z) z = [CC[q].hop[4], CC[q].hop[5]];
          C.trung.push(q);
        }
      }
      C.trung.sort((p, q) => p - q);
    }
    // --- tường cũ không phải của lần vẽ trước mà vướng phòng mới: chồng một phần lên tường mới (cùng đường, có đoạn chung) hoặc nằm trong lòng phòng mới ---
    const chong = [], trong = [];
    const trongPhong = q => { if (!moi.kin) return false; let c = false; for (let i = 0, k = n - 1; i < n; k = i++) { const a1 = moi.tuong[i].a, b1 = moi.tuong[k].a; if ((a1[1] > q[1]) !== (b1[1] > q[1]) && q[0] < (b1[0] - a1[0]) * (q[1] - a1[1]) / (b1[1] - a1[1]) + a1[0]) c = !c; } return c && moi.tuong.every(w => kcDoan(q, [w.a, w.b]) > 5); };
    const chungDoan = (m, w) => {      // mặt m nằm trên đường thẳng của tường mới w và có đoạn chung dài hơn dung sai
      const dx = w.b[0] - w.a[0], dy = w.b[1] - w.a[1], L = Math.hypot(dx, dy); if (L < 1e-9) return false;
      const kc = p => Math.abs(-(p[0] - w.a[0]) * dy + (p[1] - w.a[1]) * dx) / L, doc = p => ((p[0] - w.a[0]) * dx + (p[1] - w.a[1]) * dy) / L;
      if (kc(m[0]) > T || kc(m[1]) > T) return false;
      const t0 = Math.min(doc(m[0]), doc(m[1])), t1 = Math.max(doc(m[0]), doc(m[1]));
      return Math.min(t1, L) - Math.max(t0, 0) > T;
    };
    CT.forEach((e, q) => {
      if (giuT.has(q) || cheT.has(q) || laVachMinh(q) || laCuT[q] || laKhacT[q]) return;
      const mat = e.mat || [];
      const o = mat.some(m => trongPhong([(m[0][0] + m[1][0]) / 2, (m[0][1] + m[1][1]) / 2]));
      if (o) trong.push(q);
      if (o || mat.some(m => moi.tuong.some(w => chungDoan(m, w)))) chong.push(q);
    });
    // cột / dầm đang có mà không khớp mục nào của phòng mới, không phải của lần vẽ trước, lại nằm trong lòng phòng mới (tâm hộp nằm trong đa giác lòng phòng)
    const trongDG = q => { if (!moi.kin) return false; let c = false; for (let i = 0, j = n - 1; i < n; j = i++) { const a1 = moi.tuong[i].a, b1 = moi.tuong[j].a; if ((a1[1] > q[1]) !== (b1[1] > q[1]) && q[0] < (b1[0] - a1[0]) * (q[1] - a1[1]) / (b1[1] - a1[1]) + a1[0]) c = !c; } return c; };
    const lac = (ds, R, dsKhac) => { const o = []; (ds || []).forEach((e, q) => { if (!e.hop || R.kq.some(x => x.co === q) || R.bo.indexOf(q) >= 0 || R.trung.indexOf(q) >= 0 || laKhacH(e.hop, dsKhac)) return; if (trongDG([(e.hop[0] + e.hop[1]) / 2, (e.hop[2] + e.hop[3]) / 2])) o.push(q); }); return o; };
    const R = { tuong, ve_tuong, mo: M.kq, cot: C.kq, dam: D.kq, bo: { tuong: boT, lo: M.bo, cot: C.bo, dam: D.bo }, trung: { lo: M.trung, cot: C.trung, dam: D.trung }, chong, trong, thua: { cot: lac(co.cot, C, HK.cot), dam: lac(co.dam, D, HK.dam) }, co_ban_ghi: !!cu, giu_ghi };
    if (coCon) {
      // bo_vach = phần của bo.tuong là vách phòng con của lần vẽ trước (driver đếm riêng; bo.tuong vẫn gồm cả — một lệnh ERASE)
      if (dungManh) R.manh = true;      // tuongGhi ghi `manh: 1` vào bản ghi → lần sau (kể cả khi đã bỏ hết phòng con) vẫn nhận tường theo mảnh
      R.bo_vach = boT.filter(q => cuV.some(r => (CT[q].mat || []).some(m => trung(m, [r[0], r[1]], [r[2], r[3]]))));
    }
    if (MV) {
      // chuỗi cho lệnh tường: mỗi phòng con một chuỗi HỞ; vách thiếu liền nhau (cùng phòng con, nối đuôi) đi chung một lệnh
      const ve_vach = [];
      for (let i = 0; i < MV.length; i++) {
        if (vach[i].co >= 0) continue;
        const v = MV[i], c = ve_vach[ve_vach.length - 1], tr = MV[i - 1];
        if (c && tr && c.vach[c.vach.length - 1] === i - 1 && tr.con === v.con && gan(tr.b, v.a) && Math.abs(tr.day - v.day) <= 0.01 && Math.abs(tr.cao - v.cao) <= 0.01) { c.diem.push([v.b[0], v.b[1], v.z]); c.vach.push(i); continue; }
        ve_vach.push({ diem: [[v.a[0], v.a[1], v.z], [v.b[0], v.b[1], v.z]], khep: false, vach: [i], day: v.day, cao: v.cao });
      }
      R.vach = vach; R.ve_vach = ve_vach;
    }
    return R;
  }
  /**
   * VÙNG của lần vẽ trước dựng lại từ bản ghi (cùng dạng với phanPhong, chỉ có `kin` + `tuong`) — cho trongLongPhong, để tìm dấu điện – nước cũ khi phòng đã đổi cỡ / dời chỗ.
   * Bản ghi đủ một vòng tường nối đuôi nhau → đa giác kín; thiếu tường (tường chung với phòng bên không ghi) → kin = false (tính theo hộp bao).
   */
  function vungBanGhi(cu) {
    const T = (cu && Array.isArray(cu.tuong) ? cu.tuong : []).filter(r => Array.isArray(r) && r.length >= 7).map(r => ({ a: [r[0], r[1]], b: [r[2], r[3]], z: r[4], cao: r[5], day: r[6] }));
    if (!T.length) return null;
    const gan = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= TOL_BV;
    return { kin: T.length >= 3 && T.every((w, i) => gan(w.b, T[(i + 1) % T.length].a)), tuong: T };
  }
  /**
   * Hộp `hop` ([x0, x1, y0, y1, z0, z1], toạ độ bản vẽ) có nằm TRONG LÒNG phòng `moi` (phanPhong) không: tâm hộp nằm trong đa giác lòng phòng hoặc cách mép tường không quá `du` (mặc định 5 mm),
   * cao độ tâm từ sàn tới trần. Phòng chưa khép kín thì tính theo hộp bao các tường. Dùng để nhận ra dấu điện – nước cũ của chính phòng này khi không có bản ghi lần vẽ trước
   * (dấu trên mặt tường nhô vào phòng 2 mm; dấu của phòng bên kia tường chung cách ít nhất một bề dày tường nên không dính).
   */
  function trongLongPhong(moi, hop, du) {
    du = du > 0 ? du : 5;
    const W = (moi && moi.tuong) || [];
    if (!W.length || !so6(hop)) return false;
    const q = [(hop[0] + hop[1]) / 2, (hop[2] + hop[3]) / 2], z = (hop[4] + hop[5]) / 2;
    const z0 = Math.min(...W.map(w => w.z)), z1 = Math.max(...W.map(w => w.z + w.cao));
    if (z < z0 - du || z > z1 + du) return false;
    if (!moi.kin) {
      const xs = W.flatMap(w => [w.a[0], w.b[0]]), ys = W.flatMap(w => [w.a[1], w.b[1]]);
      return q[0] >= Math.min(...xs) - du && q[0] <= Math.max(...xs) + du && q[1] >= Math.min(...ys) - du && q[1] <= Math.max(...ys) + du;
    }
    const kc = w => { const dx = w.b[0] - w.a[0], dy = w.b[1] - w.a[1], L2 = dx * dx + dy * dy, t = L2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((q[0] - w.a[0]) * dx + (q[1] - w.a[1]) * dy) / L2)); return Math.hypot(q[0] - w.a[0] - t * dx, q[1] - w.a[1] - t * dy); };
    if (W.some(w => kc(w) <= du)) return true;
    let c = false;
    for (let i = 0, j = W.length - 1; i < W.length; j = i++) { const a = W[i].a, b = W[j].a; if ((a[1] > q[1]) !== (b[1] > q[1]) && q[0] < (b[0] - a[0]) * (q[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; }
    return c;
  }
  /**
   * Kiểm SAU KHI VẼ: đoạn tường `w` ({ a, b, day } — mặt trong, toạ độ bản vẽ) đã có trên bản vẽ chưa = các mặt tường đang có (co.tuong[].mat) nằm trên đường đó phủ kín đoạn a → b.
   * Chenfeng không dựng phần tường nằm trùng tường cũ mà chỉ dựng phần thò ra, nên một tường mới có thể là nhiều mảnh; giữa hai mảnh có thể hở đúng một bề dày tường (tường khác cắt ngang) — vẫn tính là kín.
   */
  function tuongPhuKin(w, co) {
    const T = TOL_BV, dx = w.b[0] - w.a[0], dy = w.b[1] - w.a[1], L = Math.hypot(dx, dy); if (L < 1e-9) return true;
    const kc = p => Math.abs(-(p[0] - w.a[0]) * dy + (p[1] - w.a[1]) * dx) / L, doc = p => ((p[0] - w.a[0]) * dx + (p[1] - w.a[1]) * dy) / L, ds = [];
    for (const e of (co && co.tuong) || []) for (const m of e.mat || []) if (kc(m[0]) <= T && kc(m[1]) <= T) ds.push([Math.min(doc(m[0]), doc(m[1])), Math.max(doc(m[0]), doc(m[1])), e.day || 0]);
    ds.sort((p, q) => p[0] - q[0]);
    let toi = 0, ho = T;      // đã phủ tới đâu; khe hở cho phép kế tiếp = bề dày lớn nhất của các tường quanh đó
    for (const d of ds) { if (d[0] > toi + ho + T) break; if (d[1] > toi) toi = d[1]; ho = Math.max(w.day || 0, d[2]) + T; }
    return toi >= L - T;
  }

  /**
   * CHỖ TRỐNG trên một tường để đặt tủ (bản 1.23 — anh Jason 04/10/2026 23:08: "chọn tường rồi chọn không gian tủ thì hợp lý hơn làm chuột", "chọn mặt cắt đứng rồi chọn luôn trên đó").
   * Chạm vào mặt đứng của tường `i` tại điểm cách đầu trái tường `s` → đoạn tường trống rộng nhất quanh điểm đó, từ sàn tới trần (hoặc tới đáy dầm thấp nhất lấn vào đoạn đó).
   * Vật chắn: hai đầu tường; khung đã có (của tường này, hoặc của tường kề lấn vào góc — tính theo hình chiếu mặt bằng của khung); cửa đi, cửa sổ, ô trống trên tường này.
   * Cột, hộp kỹ thuật KHÔNG chắn: tủ phủ qua và được khấu cột. opt.sau = chiều sâu tủ định đặt (mặc định 600) — vật nào nằm sâu hơn thế tính từ mặt tường thì không vướng.
   * @returns { ok: true, cach, rong, z: 0, cao, chan: '', dam: tên dầm làm hạ chiều cao | '' }  hoặc  { ok: false, chan: tên thứ đang chiếm chỗ vừa chạm | '' }
   */
  function choTrong(H, i, s, opt) {
    opt = Object.assign({ sau: 600 }, opt || {});
    const w = tuongTheoMa(H, i);      // (1.41.0) i = mã mặt ngoài vách phòng con cũng được
    if (!w || !(w.dai > 0) || !(s >= 0 && s <= w.dai)) return { ok: false, chan: '' };
    const L = w.dai, C = w.cao || H.p.cao;
    const chieu = poly => { const ss = [], tt = []; for (const q of poly) { const dx = q[0] - w.p0[0], dy = q[1] - w.p0[1]; ss.push(dx * w.d[0] + dy * w.d[1]); tt.push(dx * w.n[0] + dy * w.n[1]); } return { s0: Math.min(...ss), s1: Math.max(...ss), t0: Math.min(...tt), t1: Math.max(...tt) }; };
    const lan = c => c.t0 < opt.sau - 1 && c.t1 > 1 && c.s1 > 1 && c.s0 < L - 1;      // hình chiếu lấn vào dải sát tường mà tủ sẽ đứng
    const chan = [];
    for (const k of H.khung || []) { if (!(k.rong > 0) || !k.poly) continue; const c = chieu(k.poly); if (lan(c)) chan.push([Math.max(0, c.s0), Math.min(L, c.s1), `khung ${k.ten}`]); }
    for (const m of H.mo || []) if (m.tuong === i && m.rong > 0) chan.push([m.cach, m.cach + m.rong, thuong(m)]);      // kể cả lỗ bóng (cửa thông của phòng bên) và cửa phụ (mặt vách)
    // (1.41.0) dấu chân phòng con (cả vách) chặn như khung; mặt ngoài vách của chính nó nằm trước dấu chân (t ≤ 0) nên không bị chặn
    for (const c of H.con || []) { const q = chieu(c.ve); if (lan(q)) chan.push([Math.max(0, q.s0), Math.min(L, q.s1), `phòng con ${c.ten}`]); }
    const dang = chan.find(c => s > c[0] + 0.5 && s < c[1] - 0.5);
    if (dang) return { ok: false, chan: dang[2] };
    let a = 0, b = L;
    for (const c of chan) { if (c[1] <= s + 0.5) a = Math.max(a, c[1]); if (c[0] >= s - 0.5) b = Math.min(b, c[0]); }
    if (!(b - a >= 1)) return { ok: false, chan: '' };
    let cao = C, dam = '';
    for (const c of H.can || []) { if (c.loai !== 'dam' || !c.poly) continue; const q = chieu(c.poly); if (q.t0 < opt.sau - 1 && q.t1 > 1 && q.s1 > a + 1 && q.s0 < b - 1 && c.z0 < cao) { cao = c.z0; dam = c.ten; } }
    return { ok: true, cach: rn(a, 1), rong: rn(b - a, 1), z: 0, cao: rn(cao, 1), chan: '', dam };
  }

  /** Nét khung dây của phòng (để vẽ vào bản vẽ): mỗi nét = [[x,y,z],[x,y,z]], kèm `lop` = 'tuong' | 'mo' | 'can'. */
  function duongNet(H) {
    const N = [], o = H.p.goc || [0, 0, 0], P3 = (q, z) => [rn(q[0] + o[0], 2), rn(q[1] + o[1], 2), rn(z + o[2], 2)];
    const them = (a, b, lop) => N.push({ lop, a, b });
    for (const w of H.tuong) {
      if (!(w.dai > 0)) continue;
      them(P3(w.p0, 0), P3(w.p1, 0), 'tuong'); them(P3(w.p0, w.cao), P3(w.p1, w.cao), 'tuong'); them(P3(w.p0, 0), P3(w.p0, w.cao), 'tuong');
      if (!H.khep.kin && w.i === H.tuong.length - 1) them(P3(w.p1, 0), P3(w.p1, w.cao), 'tuong');
    }
    const hopNet = (w, s0, s1, t, z0, z1, lop) => {
      const q = [cong(w.p0, nhan(w.d, s0)), cong(w.p0, nhan(w.d, s1))], sau = t > 0 ? q.map(x => cong(x, nhan(w.n, t))) : null;
      const vong = (r) => { them(P3(r[0], z0), P3(r[1], z0), lop); them(P3(r[1], z0), P3(r[1], z1), lop); them(P3(r[1], z1), P3(r[0], z1), lop); them(P3(r[0], z1), P3(r[0], z0), lop); };
      vong(q);
      if (sau) { vong(sau); for (const i of [0, 1]) for (const z of [z0, z1]) them(P3(q[i], z), P3(sau[i], z), lop); }
    };
    // (1.41.0) vách phòng con: hộp từng dải vách
    for (const c of H.con || []) for (const k of MAT_CON) { const b = c.bang[k]; if (!b) continue; for (let i = 0; i < 4; i++) { const a = b[i], e = b[(i + 1) % 4]; them(P3(a, 0), P3(e, 0), 'tuong'); them(P3(a, c.cao), P3(e, c.cao), 'tuong'); them(P3(a, 0), P3(a, c.cao), 'tuong'); } }
    for (const m of H.mo || []) hopNet(m.w, m.cach, m.cach + m.rong, 0, m.z0, m.z1, 'mo');
    for (const c of H.can || []) hopNet(c.w, c.cach, c.cach + c.rong, c.nho, c.z0, c.z1, 'can');
    return N;
  }

  function tomTat(H) {
    const p = H.p, L = [];
    const conTxt = () => (H.con || []).map(c => `${c.ten} ${g(c.R)} × ${g(c.S)} (${c.cua.length} cửa)`).join(' · ');
    L.push(`${H.tuong.length} tường · chu vi ${g(H.chu_vi / 1000)} m${H.khep.kin ? ` · diện tích ${String(rn(H.dien_tich / 1e6, 2)).replace('.', ',')} m²` : ''} · trần ${g(p.cao)}`);
    const tu = H.tuong.find(w => w.tu_tinh); if (tu && tu.dai > 0) L.push(`Tường ${tu.ten} tự tính: ${g(tu.dai)}`);
    if (p.mo.length) L.push(`${p.mo.length} cửa / ô trống` + (p.can.length ? ` · ${p.can.length} dầm, cột` : ''));
    else if (p.can.length) L.push(`${p.can.length} dầm, cột`);
    if ((H.con || []).length) L.push(`${H.con.length} phòng con: ${conTxt()}`);
    if ((p.dn || []).length) { const dem = {}; for (const d of p.dn) dem[d.loai] = (dem[d.loai] || 0) + 1; L.push('Điện – nước: ' + Object.keys(LOAI_DN).filter(k => dem[k]).map(k => `${dem[k]} ${LOAI_DN[k].ten.toLowerCase()}`).join(' · ')); }
    if (p.khung.length) L.push(`${p.khung.length} khung không gian: ` + p.khung.map(k => `${k.ten} ${g(k.rong)}×${g(k.cao)}×${g(k.sau)}${k.kieu === 'kho' ? (k.kho ? ` (mẫu kho: ${k.kho.ten})` : ' (mẫu kho)') : ''}`).join(' · '));
    return L;
  }

  /* ---------------- hình vẽ ---------------- */
  // Hình vẽ luôn là "tờ giấy sáng" (như hình đứng của tủ), kể cả khi giao diện ở chế độ tối → dùng màu cố định
  const M_NEN = '#fbfaf7', M_TUONG = '#1b2420', M_MO = '#5d6861', M_NHAN = '#1c5fb8', M_LOI = '#d9402b', M_CAN = '#8a9099', M_TRANG = '#ffffff', M_KHO = '#0b7a5e';      // M_KHO: khung đặt mẫu kho

  /** Mặt bằng. opts: { rong_px, cao_px, chon_tuong, chon_khung } — phần tử có data-tuong / data-khung để giao diện bắt bấm. */
  function matBangSVG(H, opts) {
    opts = Object.assign({ rong_px: 420 }, opts || {});
    const W = H.tuong, hop = H.hop, bx = hop.x1 - hop.x0, by = hop.y1 - hop.y0, lon = Math.max(bx, by, 1000);
    const m = lon * 0.13 + 160, fs = lon / 30, day = Math.max(60, lon / 40), f = v => rn(v, 1);
    const X = q => f(q[0]), Y = q => f(-q[1]);      // lật y: tường A nằm trên, lòng phòng ở dưới
    const vb = [hop.x0 - m, -hop.y1 - m, bx + 2 * m, by + 2 * m];
    const rongPx = rn(opts.cao_px > 0 ? Math.min(opts.rong_px, opts.cao_px * vb[2] / vb[3]) : opts.rong_px, 1);
    const pt = q => `${X(q)},${Y(q)}`, poly = P => P.map(pt).join(' ');
    let o = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.map(f).join(' ')}" width="${rongPx}" style="max-width:100%;height:auto;font-family:inherit" role="img" aria-label="Mặt bằng ${esc(H.p.ten)}">`;
    o += `<rect x="${f(vb[0])}" y="${f(vb[1])}" width="${f(vb[2])}" height="${f(vb[3])}" fill="${M_NEN}"/>`;
    if (!W.length) return o + '</svg>';
    const dinh = W.map(w => w.p0);
    // tường: nét dày nằm NGOÀI lòng phòng (vẽ nét dày gấp đôi rồi phủ lòng phòng lên)
    if (H.khep.kin) { o += `<polygon points="${poly(dinh)}" fill="none" stroke="${M_TUONG}" stroke-width="${f(day * 2)}" stroke-linejoin="miter"/><polygon points="${poly(dinh)}" fill="${M_NEN}"/>`; }
    else for (const w of W) o += `<line x1="${X(w.p0)}" y1="${Y(w.p0)}" x2="${X(w.p1)}" y2="${Y(w.p1)}" stroke="${M_TUONG}" stroke-width="${f(day)}" stroke-linecap="square"/>`;
    const tren = (w, s, t) => cong(cong(w.p0, nhan(w.d, s)), nhan(w.n, t));
    const xuoi = w => { let q = ((-w.a % 360) + 360) % 360; if (q > 90 && q < 270) q -= 180; return q; };      // góc xoay chữ chạy dọc tường mà vẫn đọc xuôi
    const ngoai = H.khep.kin ? day : day / 2;
    // opts.sua (bản 1.12): số đo trên hình bấm vào để gõ lại — chữ mang data-sua="đường dẫn trong phòng", có khung nét đứt để biết là bấm được
    const sua = !!opts.sua;
    const oSua = (path, chu, q, goc, co, mau) => {
      const rong = chu.length * co * 0.58 + co * 0.9, cao = co * 1.5;
      return `<g transform="rotate(${f(goc)} ${X(q)} ${Y(q)})" data-sua="${path}" style="cursor:text"><rect x="${f(q[0] - rong / 2)}" y="${f(-q[1] - cao / 2)}" width="${f(rong)}" height="${f(cao)}" rx="${f(co * 0.3)}" fill="${M_NEN}" fill-opacity=".85" stroke="${mau}" stroke-opacity=".55" stroke-width="${f(co / 14)}" stroke-dasharray="${f(co * 0.28)} ${f(co * 0.22)}"/><text x="${X(q)}" y="${Y(q)}" font-size="${f(co)}" text-anchor="middle" dominant-baseline="central" fill="${mau}">${chu}</text><title>Bấm để sửa số đo này</title></g>`;
    };
    let lopSua = '';      // vẽ SAU CÙNG để không bị vùng bấm của tường che
    // cửa / ô trống: xoá đoạn tường, vẽ 2 má; cửa sổ thêm nét giữa; cửa đi thêm cánh mở
    for (const mm of H.mo || []) {
      if (mm.phu) continue;      // cửa phụ (1.41.0) vẽ cùng vách phòng con, bên dưới
      const w = mm.w, a = tren(w, mm.cach, 0), b = tren(w, mm.cach + mm.rong, 0), a2 = tren(w, mm.cach, -ngoai), b2 = tren(w, mm.cach + mm.rong, -ngoai);
      o += `<polygon points="${poly([tren(w, mm.cach, ngoai * 0.5), tren(w, mm.cach + mm.rong, ngoai * 0.5), b2, a2])}" fill="${M_NEN}"/>`;
      o += `<line x1="${X(a)}" y1="${Y(a)}" x2="${X(a2)}" y2="${Y(a2)}" stroke="${M_MO}" stroke-width="${f(fs / 7)}"/><line x1="${X(b)}" y1="${Y(b)}" x2="${X(b2)}" y2="${Y(b2)}" stroke="${M_MO}" stroke-width="${f(fs / 7)}"/>`;
      if (mm.loai === 'cua_so') { const c1 = tren(w, mm.cach, -ngoai / 2), c2 = tren(w, mm.cach + mm.rong, -ngoai / 2); o += `<line x1="${X(c1)}" y1="${Y(c1)}" x2="${X(c2)}" y2="${Y(c2)}" stroke="${M_MO}" stroke-width="${f(fs / 5)}"/><line x1="${X(a)}" y1="${Y(a)}" x2="${X(b)}" y2="${Y(b)}" stroke="${M_MO}" stroke-width="${f(fs / 9)}"/>`; }
      else if (mm.loai === 'cua') { const c = tren(w, mm.cach, mm.rong); o += `<path d="M ${X(a)} ${Y(a)} L ${X(c)} ${Y(c)} A ${f(mm.rong)} ${f(mm.rong)} 0 0 1 ${X(b)} ${Y(b)}" fill="none" stroke="${M_MO}" stroke-width="${f(fs / 9)}" stroke-dasharray="${f(fs * 0.6)} ${f(fs * 0.4)}"/>`; }
      else o += `<line x1="${X(a)}" y1="${Y(a)}" x2="${X(b)}" y2="${Y(b)}" stroke="${M_MO}" stroke-width="${f(fs / 9)}" stroke-dasharray="${f(fs * 0.5)} ${f(fs * 0.5)}"/>`;
      const tm = tren(w, mm.cach + mm.rong / 2, -ngoai - fs * 0.9);
      const tenMo = (mm.loai === 'cua' ? 'cửa' : mm.loai === 'cua_so' ? 'cửa sổ' : 'ô') + (mm.chung ? ` của ${mm.chung.ten || mm.chung.phong}` : '');
      if (!sua || mm.chung) o += `<text x="${X(tm)}" y="${Y(tm)}" font-size="${f(fs * 0.78)}" text-anchor="middle" dominant-baseline="middle" fill="${M_MO}" transform="rotate(${f(xuoi(w))} ${X(tm)} ${Y(tm)})">${esc(tenMo)} ${g(mm.rong)}</text>`;
      else {
        // rộng cửa (ngoài tường) và khoảng cách từ đầu trái tường tới má cửa (trong phòng, có nét gióng)
        lopSua += oSua(`mo.${mm.j}.rong`, `${esc(tenMo)} ${g(mm.rong)}`, tm, xuoi(w), fs * 0.78, M_MO);
        const t0 = fs * 1.5, c0 = tren(w, 0, t0), c1 = tren(w, mm.cach, t0), cm = tren(w, mm.cach / 2, t0);
        if (mm.cach > 0.5) o += `<line x1="${X(c0)}" y1="${Y(c0)}" x2="${X(c1)}" y2="${Y(c1)}" stroke="${M_MO}" stroke-width="${f(fs / 12)}"/><line x1="${X(tren(w, mm.cach, t0 - fs * 0.5))}" y1="${Y(tren(w, mm.cach, t0 - fs * 0.5))}" x2="${X(tren(w, mm.cach, t0 + fs * 0.5))}" y2="${Y(tren(w, mm.cach, t0 + fs * 0.5))}" stroke="${M_MO}" stroke-width="${f(fs / 12)}"/>`;
        lopSua += oSua(`mo.${mm.j}.cach`, g(mm.cach), mm.cach > fs * 5 ? cm : tren(w, Math.max(mm.cach, 0) + fs * 1.6, t0 + fs * 1.4), xuoi(w), fs * 0.72, M_MO);
      }
    }
    for (const c of H.can || []) o += `<polygon points="${poly(c.poly)}" fill="${M_CAN}" fill-opacity="${c.loai === 'dam' ? '.28' : '.75'}" stroke="${M_TUONG}" stroke-width="${f(fs / 9)}"${c.loai === 'dam' ? ` stroke-dasharray="${f(fs * 0.5)} ${f(fs * 0.4)}"` : ''}><title>${esc(c.ten)}: ${g(c.rong)} × nhô ${g(c.nho)}, +${g(c.z0)} → +${g(c.z1)}</title></polygon>`;
    // PHÒNG CON (1.41.0): vách = dải đặc màu tường đúng bề dày; cửa phụ = khe + cung mở (mo 'trong' = vào phòng con, 'ngoai' = ra phòng chính; bản lề theo `ban`)
    for (const c of H.con || []) {
      for (const k of MAT_CON) if (c.bang[k]) o += `<polygon data-vach="${esc(c.id)}.${k}" points="${poly(c.bang[k])}" fill="${M_TUONG}" pointer-events="none"/>`;
      for (const mm of c.cua) {
        const w = mm.w, v = w.day, dlt = fs / 20, s0 = mm.cach, s1 = mm.cach + mm.rong;
        o += `<polygon points="${poly([tren(w, s0, dlt), tren(w, s1, dlt), tren(w, s1, -v - dlt), tren(w, s0, -v - dlt)])}" fill="${M_NEN}" pointer-events="none"/>`;
        for (const s of [s0, s1]) { const p1 = tren(w, s, 0), p2 = tren(w, s, -v); o += `<line x1="${X(p1)}" y1="${Y(p1)}" x2="${X(p2)}" y2="${Y(p2)}" stroke="${M_MO}" stroke-width="${f(fs / 9)}" pointer-events="none"/>`; }
        const vao = mm.mo !== 'ngoai', t0 = vao ? -v : 0, dau = vao ? -1 : 1, sH = mm.ban === 'phai' ? s1 : s0, sE = mm.ban === 'phai' ? s0 : s1;
        const h = tren(w, sH, t0), e = tren(w, sE, t0), c2 = tren(w, sH, t0 + dau * mm.rong);
        const v1 = [c2[0] - h[0], -(c2[1] - h[1])], v2 = [e[0] - h[0], -(e[1] - h[1])], quet = v1[0] * v2[1] - v1[1] * v2[0] > 0 ? 1 : 0;
        o += `<path data-cung="${mm.phu.con}:${mm.phu.k}" d="M ${X(h)} ${Y(h)} L ${X(c2)} ${Y(c2)} A ${f(mm.rong)} ${f(mm.rong)} 0 0 ${quet} ${X(e)} ${Y(e)}" fill="none" stroke="${M_MO}" stroke-width="${f(fs / 9)}" stroke-dasharray="${f(fs * 0.6)} ${f(fs * 0.4)}" pointer-events="none"><title>${esc(mm.ten)}: ${g(mm.rong)} × ${g(mm.cao)}, mở ${vao ? 'vào trong' : 'ra ngoài'}, bản lề ${mm.ban === 'phai' ? 'phải' : 'trái'}</title></path>`;
        const tm = tren(w, (s0 + s1) / 2, fs * 1.1);
        if (sua) lopSua += oSua(`con.${mm.phu.con}.cua.${mm.phu.k}.rong`, `cửa ${g(mm.rong)}`, tm, xuoi(w), fs * 0.7, M_MO);
      }
    }
    (H.khung || []).forEach((q, j) => {
      if (!(q.rong > 0) || !(q.sau > 0) || !q.w) return;
      const on = opts.chon_khung === j, tam = tren(q.w, q.cach + q.rong / 2, q.sau / 2), kho = q.kieu === 'kho', mau = kho ? M_KHO : M_NHAN;
      // nhiều ô chồng nhau trên cùng một đoạn tường (chia ngang) thì trên mặt bằng trùng nhau: ô đang chọn vẽ đậm, các ô còn lại vẫn bấm được ở mặt đứng
      o += `<polygon data-khung="${j}" points="${poly(q.poly)}" fill="${mau}" fill-opacity="${on ? '.38' : '.16'}" stroke="${mau}" stroke-width="${f(fs / (on ? 4 : 7))}" style="cursor:pointer"><title>Khung ${esc(q.ten)}: rộng ${g(q.rong)} × cao ${g(q.cao)} × sâu ${g(q.sau)}${q.z > 0.5 ? `, đáy +${g(q.z)}` : ''}${kho ? ` — mẫu kho${q.kho ? ': ' + esc(q.kho.ten) : ' (chưa chọn)'}` : ''}</title></polygon>`;
      const trung = (H.khung || []).map((x, i) => ({ x, i })).filter(t => t.i !== j && t.x.tuong === q.tuong && t.x.rong > 0 && Math.min(t.x.cach + t.x.rong, q.cach + q.rong) - Math.max(t.x.cach, q.cach) > 0.5);
      if (!on && (trung.some(t => t.i === opts.chon_khung) || trung.some(t => t.i < j))) return;
      const coT = Math.max(fs * 0.55, Math.min(fs, q.rong / (String(q.ten).length * 0.62 + 0.8)));
      o += `<text x="${X(tam)}" y="${f(-tam[1] + coT * 0.35)}" font-size="${f(coT)}" font-weight="700" text-anchor="middle" fill="${mau}" pointer-events="none" paint-order="stroke" stroke="${M_NEN}" stroke-width="${f(coT / 4)}">${esc(q.ten)}</text>`;
    });
    // tên tường (trong lòng phòng) + chiều dài (ngoài tường)
    for (const w of W) {
      if (!(w.dai > 0)) continue;
      // tên tường (chữ trong vòng tròn) đứng NGOÀI tường, ngay cạnh số chiều dài — lòng phòng để trống cho khung
      const on = opts.chon_tuong === w.i, chu = g(w.dai) + (w.tu_tinh ? ' (tự tính)' : ''), lech = chu.length * fs * 0.3 + fs * 1.5;
      const tn = tren(w, w.dai / 2 - lech, -ngoai - fs * 2.5), td = tren(w, w.dai / 2 + fs * 0.6, -ngoai - fs * 2.5);
      if (on) o += `<line x1="${X(w.p0)}" y1="${Y(w.p0)}" x2="${X(w.p1)}" y2="${Y(w.p1)}" stroke="${M_NHAN}" stroke-width="${f(fs / 2.2)}" pointer-events="none"/>`;
      o += `<circle cx="${X(tn)}" cy="${Y(tn)}" r="${f(fs * 0.95)}" fill="${on ? M_NHAN : M_NEN}" stroke="${on ? M_NHAN : M_TUONG}" stroke-width="${f(fs / 9)}" pointer-events="none"/><text x="${X(tn)}" y="${f(-tn[1] + fs * 0.36)}" font-size="${f(fs)}" font-weight="700" text-anchor="middle" fill="${on ? M_NEN : M_TUONG}" pointer-events="none">${esc(w.ten)}</text>`;
      if (!sua) o += `<text x="${X(td)}" y="${Y(td)}" font-size="${f(fs)}" text-anchor="middle" dominant-baseline="middle" fill="${w.tu_tinh ? M_NHAN : M_TUONG}" transform="rotate(${f(xuoi(w))} ${X(td)} ${Y(td)})" pointer-events="none">${chu}</text>`;
      else lopSua += oSua(`tuong.${w.i}.dai`, chu, td, xuoi(w), fs, w.tu_tinh ? M_NHAN : M_TUONG);
      o += `<line data-tuong="${w.i}" x1="${X(w.p0)}" y1="${Y(w.p0)}" x2="${X(w.p1)}" y2="${Y(w.p1)}" stroke="${M_NHAN}" stroke-opacity="0" stroke-width="${f(Math.max(day * 2.4, fs * 2.5))}" style="cursor:pointer"><title>Tường ${esc(w.ten)}: dài ${g(w.dai)}, cao ${g(w.cao)}</title></line>`;
    }
    // (1.41.0) mặt ngoài vách phòng con: vùng bấm chọn như tường (data-tuong = mã mặt) + tên phòng con trong lòng (data-con), số đo bấm sửa
    for (const c of H.con || []) {
      for (const k of MAT_CON) {
        const fw = c.mat[k]; if (!fw) continue;
        const on = opts.chon_tuong === fw.i;
        if (on) o += `<line x1="${X(fw.p0)}" y1="${Y(fw.p0)}" x2="${X(fw.p1)}" y2="${Y(fw.p1)}" stroke="${M_NHAN}" stroke-width="${f(fs / 2.2)}" pointer-events="none"/>`;
        o += `<line data-tuong="${esc(fw.i)}" x1="${X(fw.p0)}" y1="${Y(fw.p0)}" x2="${X(fw.p1)}" y2="${Y(fw.p1)}" stroke="${M_NHAN}" stroke-opacity="0" stroke-width="${f(Math.max(c.v * 2.4, fs * 2))}" style="cursor:pointer"><title>Vách ${esc(c.ten)} — mặt ${TEN_MAT[k]}: dài ${g(fw.dai)}, cao ${g(fw.cao)} (đặt tủ được)</title></line>`;
      }
      const tam = tren(c.w, c.a + c.R / 2, c.S / 2), co = Math.max(fs * 0.6, Math.min(fs * 1.1, c.R / (String(c.ten).length * 0.7 + 1)));
      o += `<text data-con="${c.j}" x="${X(tam)}" y="${f(-tam[1] + co * 0.35)}" font-size="${f(co)}" font-weight="700" text-anchor="middle" fill="${M_TUONG}" style="cursor:pointer" paint-order="stroke" stroke="${M_NEN}" stroke-width="${f(co / 4)}"><title>${esc(c.ten)}: lòng ${g(c.R)} × ${g(c.S)}, vách ${g(c.v)} — bấm để sửa</title>${esc(c.ten)}</text>`;
      if (sua) {
        const co2 = fs * 0.66, gw = xuoi(c.w);
        lopSua += oSua(`con.${c.j}.rong`, g(c.R), tren(c.w, c.a + c.R / 2, c.S - co2 * 1.4), gw, co2, M_TUONG);
        lopSua += oSua(`con.${c.j}.sau`, g(c.S), tren(c.w, c.a + c.R - co2 * 2.4, c.S / 2 + co * 1.6), gw, co2, M_TUONG);
        if (!c.trai && !c.phai) { /* rộng cả tường */ } else if (!p0Ap(H, c.j) && c.a > 0.5) lopSua += oSua(`con.${c.j}.cach`, g(c.a), tren(c.w, c.a / 2, co2 * 1.6), gw, co2, M_TUONG);
      }
    }
    // cột / hộp / dầm: rộng dọc tường × nhô — bấm sửa từng số
    if (sua) for (const c of H.can || []) {
      if (!(c.rong > 0) || !(c.nho > 0)) continue;
      const w = c.w, co = fs * 0.68;
      lopSua += oSua(`can.${c.j}.rong`, g(c.rong), tren(w, c.cach + c.rong / 2, c.nho + co * 1.1), xuoi(w), co, M_TUONG);
      lopSua += oSua(`can.${c.j}.nho`, g(c.nho), tren(w, c.cach + c.rong + co * 1.9, c.nho / 2), xuoi(w), co, M_TUONG);
    }
    // ĐIỆN – NƯỚC (bản 1.18): điểm trên tường = dấu nhỏ nhô vào phòng, sát mặt tường (điện: vuông · nước: tròn · khác: thoi); điểm dưới sàn = vòng tròn gạch chéo đúng chỗ.
    // Dấu mang data-dn = chỉ số điểm để giao diện đưa tới dòng của điểm đó.
    for (const d of H.dn || []) {
      const w = d.w, mau = MAU_DN[d.nhom], r0 = fs * 0.5;
      if (d.cach < -0.05 || d.cach > w.dai + 0.05) continue;
      const tip = `<title>${esc(d.ten)}: tường ${esc(w.ten)}, cách đầu trái ${g(d.cach)}, ${d.san ? `cách tường ${g(d.ra)}` : `cao +${g(d.z)}`}</title>`;
      let hd, nh;
      if (d.san) {
        const r = Math.max(d.rong / 2, r0), c = d.P, k = r * 0.7;
        hd = `<circle cx="${X(c)}" cy="${Y(c)}" r="${f(r)}" fill="${M_NEN}" stroke="${mau}" stroke-width="${f(fs / 6)}"/><path d="M ${f(c[0] - k)} ${f(-c[1] - k)} L ${f(c[0] + k)} ${f(-c[1] + k)} M ${f(c[0] - k)} ${f(-c[1] + k)} L ${f(c[0] + k)} ${f(-c[1] - k)}" stroke="${mau}" stroke-width="${f(fs / 9)}" fill="none"/>`;
        nh = [c[0], c[1] - r - fs * 0.65];
      } else {
        if (d.nhom === 'cap' || d.nhom === 'thoat') { const c = tren(w, d.cach, r0); hd = `<circle cx="${X(c)}" cy="${Y(c)}" r="${f(r0)}" fill="${mau}" stroke="${M_NEN}" stroke-width="${f(fs / 12)}"/>`; }
        else hd = `<polygon points="${poly(d.nhom === 'dien' ? [tren(w, d.cach - r0, 0), tren(w, d.cach + r0, 0), tren(w, d.cach + r0, r0 * 2), tren(w, d.cach - r0, r0 * 2)] : [tren(w, d.cach, 0), tren(w, d.cach + r0, r0), tren(w, d.cach, r0 * 2), tren(w, d.cach - r0, r0)])}" fill="${mau}" stroke="${M_NEN}" stroke-width="${f(fs / 12)}"/>`;
        nh = tren(w, d.cach, r0 * 2 + fs * 0.62);
      }
      o += `<g data-dn="${d.j}" style="cursor:pointer">${tip}${hd}<text x="${X(nh)}" y="${Y(nh)}" font-size="${f(fs * 0.82)}" font-weight="700" text-anchor="middle" dominant-baseline="central" fill="${mau}" paint-order="stroke" stroke="${M_NEN}" stroke-width="${f(fs / 4)}">${esc(d.nhan)}</text></g>`;
    }
    o += lopSua;
    // đầu tường A: mốc bắt đầu, và khe hở khi phòng chưa khép
    o += `<circle cx="${X(W[0].p0)}" cy="${Y(W[0].p0)}" r="${f(fs * 0.3)}" fill="${M_NHAN}" pointer-events="none"/>`;
    if (W.length >= 3 && !H.khep.kin && H.khep.ho >= 1) { const e = W[W.length - 1].p1; o += `<line x1="${X(e)}" y1="${Y(e)}" x2="${X(W[0].p0)}" y2="${Y(W[0].p0)}" stroke="${M_LOI}" stroke-width="${f(fs / 4)}" stroke-dasharray="${f(fs * 0.7)} ${f(fs * 0.5)}"/><circle cx="${X(e)}" cy="${Y(e)}" r="${f(fs * 0.4)}" fill="${M_LOI}"/><text x="${f((e[0] + W[0].p0[0]) / 2)}" y="${f(-(e[1] + W[0].p0[1]) / 2 - fs * 0.6)}" font-size="${f(fs)}" text-anchor="middle" fill="${M_LOI}" font-weight="700">hở ${g(H.khep.ho)}</text>`; }
    return o + '</svg>';
  }

  /**
   * Mặt đứng một tường (đứng trong phòng nhìn vào). opts: { rong_px, cao_px, chon_khung, sua, chu }
   * opts.chu: hệ số phóng chữ + lề (mặc định 1) — màn hình điện thoại hẹp (module Đo hiện trạng) cần chữ to hơn so với hình.
   */
  function matDungSVG(H, i, opts) {
    opts = Object.assign({ rong_px: 420 }, opts || {});
    const w = tuongTheoMa(H, i), fv = w && w.vach ? w : null;      // (1.41.0) fv = mặt ngoài vách phòng con
    if (!w || !(w.dai > 0)) return '';
    const kc = opts.chu > 0 ? opts.chu : 1;
    const conF = fv ? (H.con || [])[fv.vach.con] : null, tenMD = fv ? `vách ${conF ? conF.ten : ''} — mặt ${TEN_MAT[fv.vach.mat]}` : `tường ${w.ten}`;
    const L = w.dai, C = w.cao || H.p.cao || 2700, lon = Math.max(L, C), m = (lon * 0.1 + 120) * kc, fs = lon / 34 * kc, f = v => rn(v, 1), Y = z => f(C - z);
    // điện – nước (bản 1.18): điểm trên tường này + điểm dưới sàn nằm gần tường này (cách mặt tường ≤ 800) → chừa thêm 1–2 hàng chữ dưới vạch sàn
    const dnT = (H.dn || []).filter(d => !d.san && d.tuong === i && d.cach >= -0.05 && d.cach <= L + 0.05);
    const dnS = (H.dn || []).filter(d => d.san).map(d => { const v = [d.P[0] - w.p0[0], d.P[1] - w.p0[1]]; return { d, s: cham(v, w.d), t: cham(v, w.n) }; }).filter(q => q.s >= -0.5 && q.s <= L + 0.5 && q.t >= -0.5 && q.t <= 800);
    // chữ dưới vạch sàn: hàng "cách trái" của điểm trên tường (điểm sát nhau thì so le 2 hàng), rồi hàng nhãn của điểm dưới sàn (cũng so le)
    const soLe = (ds, lay, gan) => { const h = new Map(); let tr = null; ds.slice().sort((a1, b1) => lay(a1) - lay(b1)).forEach(q => { h.set(q, tr && lay(q) - lay(tr) < gan && h.get(tr) === 0 ? 1 : 0); tr = q; }); return h; };
    const hgT = soLe(dnT, d => d.cach, fs * 3.9), hgS = soLe(dnS, q => q.s, fs * 12.5), hgN = soLe(dnT, d => d.cach, fs * 6.2), buoc = fs;      // hgN: nhãn "ký hiệu +cao" — điểm sát nhau thì nhãn điểm sau ghi DƯỚI ô
    const nT = dnT.length ? 1 + Math.max(0, ...hgT.values()) : 0, nS = dnS.length ? 1 + Math.max(0, ...hgS.values()) : 0;
    const them = nT + nS ? (nT + nS) * buoc + fs * 0.35 : 0, yd = C + m * 0.45 + them;
    const vb = [-m, -m * 0.8, L + 2 * m, C + m * 1.9 + them];
    const rongPx = rn(opts.cao_px > 0 ? Math.min(opts.rong_px, opts.cao_px * vb[2] / vb[3]) : opts.rong_px, 1);
    let o = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.map(f).join(' ')}" width="${rongPx}" style="max-width:100%;height:auto;font-family:inherit" role="img" aria-label="Mặt đứng ${esc(tenMD)}">`;
    o += `<rect x="${f(vb[0])}" y="${f(vb[1])}" width="${f(vb[2])}" height="${f(vb[3])}" fill="${M_NEN}"/>`;
    o += `<rect x="0" y="0" width="${f(L)}" height="${f(C)}" fill="${M_TRANG}" stroke="${M_TUONG}" stroke-width="${f(fs / 5)}"/>`;
    o += `<line x1="${f(-m * 0.6)}" y1="${f(C)}" x2="${f(L + m * 0.6)}" y2="${f(C)}" stroke="${M_TUONG}" stroke-width="${f(fs / 3)}"/>`;
    const R = (s0, z0, rong, cao, extra) => `<rect x="${f(s0)}" y="${Y(z0 + cao)}" width="${f(rong)}" height="${f(cao)}" ${extra}/>`;
    // (1.41.0) phần tường chính nằm trong dấu chân phòng con: khối mờ gạch nét — chạm vào đó không lấy được chỗ đặt tủ
    if (!fv) for (const c of H.con || []) {
      const ss = c.ve.map(q => cham([q[0] - w.p0[0], q[1] - w.p0[1]], w.d)), ts = c.ve.map(q => cham([q[0] - w.p0[0], q[1] - w.p0[1]], w.n));
      const s0 = Math.max(0, Math.min(...ss)), s1 = Math.min(L, Math.max(...ss));
      if (!(Math.min(...ts) < 1 && Math.max(...ts) > 1 && s1 - s0 > 1)) continue;
      const hC = Math.min(c.cao, C);
      o += R(s0, 0, s1 - s0, hC, `data-con="${c.j}" fill="${M_CAN}" fill-opacity=".22" stroke="${M_TUONG}" stroke-width="${f(fs / 10)}" stroke-dasharray="${f(fs * 0.4)} ${f(fs * 0.3)}"`);
      o += `<text x="${f((s0 + s1) / 2)}" y="${f(C - hC / 2)}" font-size="${f(fs * 0.9)}" text-anchor="middle" fill="${M_TUONG}" pointer-events="none">${esc(c.ten)} (phòng con)</text>`;
    }
    for (const mm of (H.mo || []).filter(x => x.tuong === i)) {
      if (mm.chung) {      // (1.36) cửa thông của phòng bên: nét đứt, ghi của phòng nào
        o += R(mm.cach, mm.be, mm.rong, mm.cao, `fill="${M_NEN}" stroke="${M_MO}" stroke-width="${f(fs / 9)}" stroke-dasharray="${f(fs * 0.5)} ${f(fs * 0.35)}"`);
        o += `<text x="${f(mm.cach + mm.rong / 2)}" y="${f(C - mm.be - mm.cao / 2)}" font-size="${f(fs * 0.8)}" text-anchor="middle" fill="${M_MO}"><tspan x="${f(mm.cach + mm.rong / 2)}">${mm.loai === 'cua_so' ? 'cửa sổ' : mm.loai === 'o_trong' ? 'ô trống' : 'cửa'} của ${esc(mm.chung.ten || mm.chung.phong)}</tspan><tspan x="${f(mm.cach + mm.rong / 2)}" dy="${f(fs * 1.1)}">${g(mm.rong)} × ${g(mm.cao)}</tspan></text>`;
        continue;
      }
      o += R(mm.cach, mm.be, mm.rong, mm.cao, `fill="${M_NEN}" stroke="${M_MO}" stroke-width="${f(fs / 7)}"`);
      if (mm.loai === 'cua_so') o += `<line x1="${f(mm.cach + mm.rong / 2)}" y1="${Y(mm.be + mm.cao)}" x2="${f(mm.cach + mm.rong / 2)}" y2="${Y(mm.be)}" stroke="${M_MO}" stroke-width="${f(fs / 10)}"/>`;
      o += `<text x="${f(mm.cach + mm.rong / 2)}" y="${f(C - mm.be - mm.cao / 2)}" font-size="${f(fs * 0.85)}" text-anchor="middle" fill="${M_MO}"><tspan x="${f(mm.cach + mm.rong / 2)}">${esc(mm.phu ? mm.ten : LOAI_MO[mm.loai])}</tspan><tspan x="${f(mm.cach + mm.rong / 2)}" dy="${f(fs * 1.1)}">${g(mm.rong)} × ${g(mm.cao)}${mm.be > 0 ? ` · bệ ${g(mm.be)}` : ''}</tspan></text>`;
    }
    for (const c of (H.can || []).filter(x => x.tuong === i)) {
      o += R(c.cach, c.z0, c.rong, c.z1 - c.z0, `fill="${M_CAN}" fill-opacity=".55" stroke="${M_TUONG}" stroke-width="${f(fs / 9)}"`);
      const ngang = c.rong > (c.z1 - c.z0), cx = c.cach + c.rong / 2, cy = C - (c.z0 + c.z1) / 2;
      o += `<text x="${f(cx)}" y="${f(cy + fs * 0.3)}" font-size="${f(fs * 0.8)}" text-anchor="middle" fill="${M_TUONG}"${ngang ? '' : ` transform="rotate(-90 ${f(cx)} ${f(cy)})"`}>${esc(LOAI_CAN[c.loai])} nhô ${g(c.nho)}</text>`;
    }
    // KHUNG trên tường này. Bản 1.19: ô chia nhỏ (vách tivi, đầu giường) → chữ co theo ô; khung đặt mẫu kho có màu + nét riêng và ghi tên mẫu;
    // opts.sua: rộng / cao / sâu / cách trái / đáy của khung bấm vào để gõ lại ngay trên hình (data-sua = "khung.j.…").
    const dsK = (H.khung || []).map((q, j) => ({ q, j })).filter(x => x.q.tuong === i && x.q.rong > 0 && x.q.cao > 0);
    const cungHang = (a, b) => Math.min(a.z + a.cao, b.z + b.cao) - Math.max(a.z, b.z) > 0.5;
    const suaK = (path, chu, tip) => (opts.sua ? `<tspan data-sua="${path}" style="cursor:text" text-decoration="underline">${chu}<title>${tip} — bấm để sửa</title></tspan>` : chu);
    for (const { q, j } of dsK) {
      const on = opts.chon_khung === j, kho = q.kieu === 'kho', mau = kho ? M_KHO : M_NHAN, cx = q.cach + q.rong / 2;
      o += R(q.cach, q.z, q.rong, q.cao, `data-khung="${j}" fill="${mau}" fill-opacity="${on ? '.3' : '.13'}" stroke="${mau}" stroke-width="${f(fs / (on ? 4 : 7))}"${kho ? ` stroke-dasharray="${f(fs * 0.9)} ${f(fs * 0.35)}"` : ''} style="cursor:pointer"`);
      // chữ co theo ô; ô HẸP MÀ CAO (cột bên của vách tivi) thì chữ xoay dọc theo chiều cao cho đủ chỗ
      const chuKT = `${g(q.rong)} × ${g(q.cao)} · sâu ${g(q.sau)}`, tenMau = kho ? (q.kho ? 'mẫu: ' + q.kho.ten : 'mẫu kho — chưa chọn') : '';
      const dungChu = q.cao > q.rong * 1.5 && q.rong / (chuKT.length * 0.58) < fs * 0.8, dai = dungChu ? q.cao : q.rong, ngan = dungChu ? q.rong : q.cao;
      const co = Math.max(fs * 0.5, Math.min(fs * 1.05, dai / 7.5, ngan / 4));
      const soDong = kho ? 3 : 2, cy = C - q.z - q.cao / 2, y0 = cy - (soDong - 2) * co * 0.6;
      const cat = (t, n) => (t.length > n ? t.slice(0, Math.max(1, n - 1)) + '…' : t), vua = Math.max(6, Math.floor(dai / (co * 0.42)));
      const coKT = Math.max(fs * 0.42, Math.min(co, dai / (chuKT.length * 0.58)));      // dòng kích thước không tràn khỏi ô
      o += `<text x="${f(cx)}" y="${f(y0)}" font-size="${f(co)}" text-anchor="middle" fill="${mau}" font-weight="700"${dungChu ? ` transform="rotate(-90 ${f(cx)} ${f(cy)})"` : ''}${opts.sua ? '' : ' pointer-events="none"'}><tspan x="${f(cx)}" pointer-events="none">${esc(cat(q.ten, vua))}</tspan>`
        + `<tspan x="${f(cx)}" dy="${f(co * 1.25)}" font-weight="400" font-size="${f(coKT)}">${suaK(`khung.${j}.rong`, g(q.rong), 'Rộng khung')}${opts.sua ? '<tspan pointer-events="none"> × </tspan>' : ' × '}${suaK(`khung.${j}.cao`, g(q.cao), 'Cao khung')}${opts.sua ? '<tspan pointer-events="none"> · sâu </tspan>' : ' · sâu '}${suaK(`khung.${j}.sau`, g(q.sau), 'Sâu khung (cả cánh)')}</tspan>`
        + (kho ? `<tspan x="${f(cx)}" dy="${f(co * 1.2)}" font-weight="400" font-size="${f(co * 0.85)}" pointer-events="none">${esc(cat(tenMau, Math.floor(vua * 1.15)))}</tspan>` : '') + '</text>';
      // khoảng hở bên trái: tới khung liền trái cùng hàng, không có thì tới đầu tường (số "cách trái" — bấm sửa được); bên phải chỉ ghi khi không còn khung nào ở phải
      const trai = dsK.filter(x => x.j !== j && cungHang(x.q, q) && x.q.cach + x.q.rong <= q.cach + 0.5).sort((a, b) => (b.q.cach + b.q.rong) - (a.q.cach + a.q.rong))[0];
      const tu = trai ? trai.q.cach + trai.q.rong : 0, ho = q.cach - tu, yk = C - q.z - fs * 0.5;
      if (ho > 0.5) o += `<text x="${f(tu + ho / 2)}" y="${f(yk)}" font-size="${f(fs * 0.8)}" text-anchor="middle" fill="${mau}"${opts.sua && !trai ? ` data-sua="khung.${j}.cach" style="cursor:text" text-decoration="underline"` : ''}>${g(ho)}${opts.sua && !trai ? '<title>Khung cách đầu trái tường — bấm để sửa</title>' : ''}</text>`;
      const coPhai = dsK.some(x => x.j !== j && cungHang(x.q, q) && x.q.cach >= q.cach + q.rong - 0.5), con = L - q.cach - q.rong;
      if (!coPhai && con > 0.5) o += `<text x="${f(q.cach + q.rong + con / 2)}" y="${f(yk)}" font-size="${f(fs * 0.8)}" text-anchor="middle" fill="${mau}">${g(con)}</text>`;
      // khung treo: cao độ đáy ghi ở góc dưới trái ô
      if (q.z > 0.5) o += `<text x="${f(q.cach + co * 0.35)}" y="${f(C - q.z - co * 0.4)}" font-size="${f(co * 0.78)}" fill="${mau}"${opts.sua ? ` data-sua="khung.${j}.z" style="cursor:text" text-decoration="underline"` : ' pointer-events="none"'}>+${g(q.z)}${opts.sua ? '<title>Đáy khung cao hơn sàn — bấm để sửa</title>' : ''}</text>`;
    }
    // ĐIỆN – NƯỚC: ô đúng cỡ tại (cách trái, cao tâm), nét gióng xuống sàn; nhãn "ký hiệu +cao" và số "cách trái" bấm sửa được như các số đo khác
    const suaA = path => (opts.sua ? ` data-sua="${path}" style="cursor:text" text-decoration="underline"` : ' pointer-events="none"');
    for (const d of dnT) {
      const mau = MAU_DN[d.nhom], bw = Math.max(d.rong, fs * 0.75), bh = Math.max(d.cao_o, fs * 0.75), cy = C - d.z;
      o += `<line x1="${f(d.cach)}" y1="${f(cy + bh / 2)}" x2="${f(d.cach)}" y2="${f(C)}" stroke="${mau}" stroke-width="${f(fs / 14)}" stroke-dasharray="${f(fs * 0.3)} ${f(fs * 0.3)}" pointer-events="none"/>`;
      o += d.tron ? `<circle data-dnd="${d.j}" cx="${f(d.cach)}" cy="${f(cy)}" r="${f(bw / 2)}" fill="${mau}" stroke="${M_TRANG}" stroke-width="${f(fs / 12)}" pointer-events="none"/>`
        : `<rect data-dnd="${d.j}" x="${f(d.cach - bw / 2)}" y="${f(cy - bh / 2)}" width="${f(bw)}" height="${f(bh)}" rx="${f(fs / 8)}" fill="${mau}" stroke="${M_TRANG}" stroke-width="${f(fs / 12)}" pointer-events="none"/>`;
      o += `<text x="${f(d.cach)}" y="${f(hgN.get(d) ? cy + bh / 2 + fs * 0.95 : cy - bh / 2 - fs * 0.35)}" font-size="${f(fs * 0.85)}" font-weight="700" text-anchor="middle" fill="${mau}" paint-order="stroke" stroke="${M_TRANG}" stroke-width="${f(fs / 5)}"${suaA(`dn.${d.j}.cao`)}>${esc(d.nhan)} +${g(d.z)}<title>${esc(d.ten)}${opts.sua ? ' — bấm để sửa cao độ tâm' : ''}</title></text>`;
      o += `<text x="${f(d.cach)}" y="${f(C + fs * 1.05 + hgT.get(d) * buoc)}" font-size="${f(fs * 0.8)}" text-anchor="middle" fill="${mau}"${suaA(`dn.${d.j}.cach`)}>${g(d.cach)}<title>${esc(d.ten)}: cách đầu trái tường${opts.sua ? ' — bấm để sửa' : ''}</title></text>`;
    }
    for (const q of dnS) {
      // điểm dưới sàn: tam giác trên vạch sàn + nhãn "ký hiệu · cách trái · cách tường"; hai số chỉ bấm sửa được ở mặt đứng của chính tường mà điểm đó đo theo
      const d = q.d, mau = MAU_DN[d.nhom], a = fs * 0.42, cua = d.tuong === i, yS = C + fs * 1.05 + (nT + hgS.get(q)) * buoc + fs * 0.15;
      o += `<path data-dnd="${d.j}" d="M ${f(q.s - a)} ${f(C)} L ${f(q.s + a)} ${f(C)} L ${f(q.s)} ${f(C + a * 1.2)} Z" fill="${mau}" pointer-events="none"/>`;
      o += `<text x="${f(q.s)}" y="${f(yS)}" font-size="${f(fs * 0.8)}" text-anchor="middle" fill="${mau}"><title>${esc(d.ten)}: dưới sàn, cách đầu trái tường ${g(q.s)}, cách mặt tường ${g(q.t)}</title><tspan font-weight="700" pointer-events="none">${esc(d.nhan)} · </tspan><tspan${cua ? suaA(`dn.${d.j}.cach`) : ' pointer-events="none"'}>${g(q.s)}</tspan><tspan pointer-events="none"> · cách tường </tspan><tspan${cua ? suaA(`dn.${d.j}.ra`) : ' pointer-events="none"'}>${g(q.t)}</tspan></text>`;
    }
    const sw = f(fs / 9), tick = fs * 0.45;
    o += `<line x1="0" y1="${f(yd)}" x2="${f(L)}" y2="${f(yd)}" stroke="${M_TUONG}" stroke-width="${sw}"/><line x1="0" y1="${f(yd - tick)}" x2="0" y2="${f(yd + tick)}" stroke="${M_TUONG}" stroke-width="${sw}"/><line x1="${f(L)}" y1="${f(yd - tick)}" x2="${f(L)}" y2="${f(yd + tick)}" stroke="${M_TUONG}" stroke-width="${sw}"/><text x="${f(L / 2)}" y="${f(yd + fs * 1.3)}" font-size="${f(fs)}" text-anchor="middle" fill="${M_TUONG}"${opts.sua && !fv ? ` data-sua="tuong.${i}.dai" style="cursor:text" text-decoration="underline"` : ''}>${g(L)}${opts.sua && !fv ? '<title>Bấm để sửa chiều dài tường</title>' : ''}</text>`;
    const xr = L + m * 0.45;
    o += `<line x1="${f(xr)}" y1="0" x2="${f(xr)}" y2="${f(C)}" stroke="${M_TUONG}" stroke-width="${sw}"/><line x1="${f(xr - tick)}" y1="0" x2="${f(xr + tick)}" y2="0" stroke="${M_TUONG}" stroke-width="${sw}"/><line x1="${f(xr - tick)}" y1="${f(C)}" x2="${f(xr + tick)}" y2="${f(C)}" stroke="${M_TUONG}" stroke-width="${sw}"/><text x="${f(xr + fs * 1.2)}" y="${f(C / 2)}" font-size="${f(fs)}" text-anchor="middle" fill="${M_TUONG}" transform="rotate(-90 ${f(xr + fs * 1.2)} ${f(C / 2)})"${opts.sua && !fv ? ` data-sua="${H.p.tuong[i] && H.p.tuong[i].cao > 0 ? `tuong.${i}.cao` : 'cao'}" style="cursor:text" text-decoration="underline"` : ''}>${g(C)}${opts.sua && !fv ? '<title>Bấm để sửa chiều cao</title>' : ''}</text>`;
    if (fv) {
      o += `<text x="0" y="${f(-m * 0.3)}" font-size="${f(fs * 1.15)}" font-weight="700" fill="${M_TUONG}">Vách ${esc(conF ? conF.ten : '')} — mặt ${TEN_MAT[fv.vach.mat]}</text>`;
      o += `<text x="${f(-m * 0.15)}" y="${f(C + m * 0.98 + them)}" font-size="${f(fs * 0.8)}" fill="${M_MO}">◂ ${esc(fv.ke[0])}</text><text x="${f(L + m * 0.15)}" y="${f(C + m * 0.98 + them)}" font-size="${f(fs * 0.8)}" text-anchor="end" fill="${M_MO}">${esc(fv.ke[1])} ▸</text>`;
      return o + '</svg>';
    }
    const truoc = H.tuong[(i - 1 + H.tuong.length) % H.tuong.length], sau = H.tuong[(i + 1) % H.tuong.length];
    o += `<text x="0" y="${f(-m * 0.3)}" font-size="${f(fs * 1.15)}" font-weight="700" fill="${M_TUONG}">Tường ${esc(w.ten)}</text>`;
    if (H.tuong.length > 1) o += `<text x="${f(-m * 0.15)}" y="${f(C + m * 0.98 + them)}" font-size="${f(fs * 0.8)}" fill="${M_MO}">◂ tường ${esc(truoc.ten)}</text><text x="${f(L + m * 0.15)}" y="${f(C + m * 0.98 + them)}" font-size="${f(fs * 0.8)}" text-anchor="end" fill="${M_MO}">tường ${esc(sau.ten)} ▸</text>`;
    return o + '</svg>';
  }

  /** Đọc "mã phòng" (JSON, có thể lẫn chữ quanh) → phòng đã chuẩn hoá, hoặc null. */
  function docMa(text) {
    if (text && typeof text === 'object') return chuanHoa(text);
    const t = String(text || ''), a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a < 0 || b <= a) return null;
    try { const o = JSON.parse(t.slice(a, b + 1)); return o && Array.isArray(o.tuong) ? chuanHoa(o) : null; } catch (e) { return null; }
  }

  /* ---------------- NHÀ NHIỀU PHÒNG (bản 1.36 — anh Thanh 14/10/2026: "1 nhà nó có 5 phòng thì phải cho vẽ được 5 phòng") ----------------
   * Công trình = { ban: 1, id: 'C1', ten, chon: mã phòng đang chọn, phong: [phòng…] }; thứ tự `phong` = thứ tự người dùng thấy.
   * Phòng ghép: `ghep = { phong, tuong, tuong_minh, cach }` = "tường tuong_minh của phòng này áp vào mặt NGOÀI tường `tuong` của phòng `phong`";
   * `cach` = từ đầu TRÁI tường đích (đứng trong phòng đích nhìn ra) tới đầu PHẢI tường của phòng này (đứng trong phòng này nhìn ra) → 0 = phẳng đầu.
   * `goc` + `huong` của mọi phòng LUÔN là số thật (phòng ghép: datNha tính rồi ghi vào) → các hàm một phòng (datKhung, phanPhong, file phòng…) dùng thẳng.
   * Tường chung vẽ MỘT lần, dày theo phòng CHỦ (đứng trước trong thuTu): Chenfeng (đã đo) không dựng đoạn tường có tim trùng tim tường cũ — dày khác là tim lệch, hai tường chồng nhau.
   * ------------------------------------------------------------------ */
  const goc3 = p => (Array.isArray(p.goc) && p.goc.length === 3 ? p.goc : [0, 0, 0]);
  /** Xếp thứ tự vẽ: phòng gốc trước, phòng ghép sau phòng nó ghép vào; hoà thì theo thứ tự trong danh sách. Vòng ghép: phòng đầu tiên còn lại của vòng thành gốc (`vong`). */
  function xepThu(ds) {
    const vi = new Map(ds.map((p, i) => [p.id, i])), xong = new Set(), thu = [], vong = [];
    const san = (p, i) => !p.ghep || p.ghep.phong === p.id || !vi.has(p.ghep.phong) || xong.has(vi.get(p.ghep.phong));
    while (thu.length < ds.length) {
      let k = ds.findIndex((p, i) => !xong.has(i) && san(p, i));
      if (k < 0) { k = ds.findIndex((p, i) => !xong.has(i)); vong.push(k); }
      xong.add(k); thu.push(k);
    }
    return { thu, vong };
  }
  // số lớn nhất trong các mã "P<n>" của danh sách phòng và số `dem` đã ghi
  const soMa = (ds, dem) => { let n = Number.isInteger(dem) && dem > 0 && dem < 1e6 ? dem : 0; for (const p of ds || []) { const m = /^P(\d+)$/.exec(p && p.id || ''); if (m) n = Math.max(n, +m[1]); } return n; };
  /** Chuẩn hoá công trình: mã phòng duy nhất (thiếu / trùng → đánh mã mới), `chon` trỏ đúng một phòng, ít nhất một phòng. */
  function chuanNha(cIn) {
    const c = cIn && typeof cIn === 'object' ? cIn : {};
    const ds = (Array.isArray(c.phong) ? c.phong : []).filter(p => p && typeof p === 'object' && Array.isArray(p.tuong)).map(p => chuanHoa(p));
    if (!ds.length) ds.push(chuanHoa(macDinh()));
    const da = new Set(), moi = [];
    ds.forEach((p, i) => { if (p.id && !da.has(p.id)) da.add(p.id); else moi.push(i); });
    // (1.36 vòng soát) dem = số mã phòng lớn nhất từng cấp trong công trình (cả phòng đã xoá) — mã mới không bao giờ trùng mã cũ mà khung / tủ / lần vẽ còn nhớ
    let n = soMa(ds, c.dem);
    for (const i of moi) { do n++; while (da.has('P' + n)); ds[i].id = 'P' + n; da.add(ds[i].id); }
    const phong = ds.map(p => chuanHoa(p));
    return { ban: 1, id: typeof c.id === 'string' && ID_CT.test(c.id) ? c.id : 'C1', ten: String(c.ten || 'Công trình').slice(0, 80), chon: da.has(c.chon) ? c.chon : phong[0].id, dem: soMa(phong, c.dem), phong };
  }
  /** Đọc "file công trình" ({ phong: [...] }, có thể lẫn chữ quanh) → công trình đã chuẩn hoá, hoặc null (file một phòng thì dùng docMa). */
  function docNha(text) {
    let o = text && typeof text === 'object' ? text : null;
    if (!o) { const t = String(text || ''), a = t.indexOf('{'), b = t.lastIndexOf('}'); if (a < 0 || b <= a) return null; try { o = JSON.parse(t.slice(a, b + 1)); } catch (e) { return null; } }
    return o && Array.isArray(o.phong) && o.phong.length ? chuanNha(o) : null;
  }
  /**
   * NÂNG dữ liệu 1.35 (một phòng ở mncf.phong.v1) thành công trình mặc định: phòng cũ giữ nguyên từng khoá, thêm id 'P1' (+ nguon_do = phòng đo đã lấy, nếu có).
   * Đã là công trình thì chỉ chuẩn hoá (chạy lại như một). Không có phòng cũ → phòng mẫu.
   */
  function nangNha(phongCu, nguonCu) {
    if (phongCu && typeof phongCu === 'object' && Array.isArray(phongCu.phong)) return chuanNha(phongCu);
    const p = chuanHoa(phongCu && typeof phongCu === 'object' ? phongCu : macDinh());
    p.id = 'P1';
    if (!p.nguon_do && typeof nguonCu === 'string' && nguonCu) p.nguon_do = nguonCu.slice(0, 80);
    return chuanNha({ id: 'C1', ten: 'Công trình mặc định', chon: 'P1', phong: [p] });
  }
  /** Mã phòng mới: số lớn nhất đang có + 1 (không dùng lại mã của phòng đã xoá — khung / tủ cũ có thể còn nhớ mã đó). */
  function idMoi(ct) { return 'P' + (soMa(ct && ct.phong, ct && ct.dem) + 1); }
  // đỉnh lòng phòng trong toạ độ bản vẽ + hướng vào lòng của từng cạnh
  const longPhong = p => { const H = hinhHoc(p), o = goc3(p); return { p, H, o, P: H.tuong.map(w => [w.p0[0] + o[0], w.p0[1] + o[1]]), kin: H.khep.kin }; };
  function hopNha(ct) {
    let h = null;
    for (const p of (ct && ct.phong) || []) for (const q of longPhong(p).P) h = h ? [Math.min(h[0], q[0]), Math.max(h[1], q[0]), Math.min(h[2], q[1]), Math.max(h[3], q[1])] : [q[0], q[0], q[1], q[1]];
    return h && { x0: h[0], x1: h[1], y0: h[2], y1: h[3] };
  }
  /** Phòng mẫu mới cho công trình: mã kế tiếp, tên "Phòng N", đặt bên phải hộp bao cả nhà cách 1000 (chưa ghép), cùng cao độ sàn. */
  function phongMoi(ct, ten) {
    const c = chuanNha(ct), h = hopNha(c), z = goc3(c.phong[xepThu(c.phong).thu[0]])[2];
    return chuanHoa(Object.assign(macDinh(), { ten: ten || `Phòng ${c.phong.length + 1}`, id: idMoi(c), goc: [h ? rn(h.x1 + 1000, 3) : 0, h ? rn(h.y1, 3) : 0, z] }));
  }
  /** Thứ tự vẽ / quyền chủ tường chung (mã phòng). */
  function thuTu(ct) { const c = chuanNha(ct); return xepThu(c.phong).thu.map(i => c.phong[i].id); }
  /** Các phòng `id` ghép vào được mà không tạo vòng (theo thứ tự danh sách). */
  function dichGhep(ct, id) {
    const c = chuanNha(ct), vi = new Map(c.phong.map(p => [p.id, p]));
    return c.phong.filter(q => {
      if (q.id === id) return false;
      for (let r = q, k = 0; r && r.ghep && k <= c.phong.length; k++) { if (r.ghep.phong === id) return false; r = vi.get(r.ghep.phong); }
      return true;
    }).map(q => q.id);
  }

  /**
   * Chỗ đặt phòng B khi ghép tường iB của nó vào tường iX của phòng Y (HY = hinhHoc(Y), Y đã có goc / huong). Đi quanh mỗi phòng theo chiều kim đồng hồ nên
   * hai tường chung chạy NGƯỢC chiều nhau: hướng tường iB của B = hướng tường iX của Y + 180. Mặt trong tường iB của B = mặt NGOÀI tường iX của Y (cách một bề dày Y).
   * @returns {{ goc: [x, y, z], huong }} | null (tường không có / chưa có chiều dài)
   */
  function ghepPhong(HY, iX, pB, iB, cach) {
    const wY = HY && HY.tuong && HY.tuong[iX];
    if (!wY || !(wY.dai > 0)) return null;
    const b = chuanHoa(pB); if (!(iB >= 0 && iB < b.tuong.length)) return null;
    let re = 0; for (let k = 0; k < iB; k++) re += b.tuong[k].re;
    const huong = chuanHuong(wY.a + 180 + re), wB = hinhHoc(Object.assign({}, b, { huong, goc: [0, 0, 0] })).tuong[iB];
    if (!(wB.dai > 0)) return null;
    const o = goc3(HY.p), day = wY.day > 0 ? wY.day : HY.p.day, c = num(cach, 0);
    const T = [o[0] + wY.p0[0] - wY.n[0] * day + wY.d[0] * c, o[1] + wY.p0[1] - wY.n[1] * day + wY.d[1] * c];
    return { goc: [rn(T[0] - wB.p1[0], 3), rn(T[1] - wB.p1[1], 3), rn(o[2], 3)], huong };
  }
  /** Số `cach` cho nút nhanh: 'trai' (phẳng đầu trái tường đích) | 'giua' | 'phai'. HB = hinhHoc(phòng ghép). */
  function cachGhep(HY, iX, HB, iB, kieu) {
    const LY = HY && HY.tuong[iX] ? HY.tuong[iX].dai : 0, LB = HB && HB.tuong[iB] ? HB.tuong[iB].dai : 0;
    return kieu === 'phai' ? rn(LY - LB, 1) : kieu === 'giua' ? rn((LY - LB) / 2, 1) : 0;
  }
  /**
   * ĐẶT CẢ NHÀ: tính goc / huong của mọi phòng ghép theo thứ tự ghép (gọi ở mỗi lần cất → phòng đích đổi số đo thì phòng ghép dời theo).
   * Phòng đích không còn / tường đích không có / ghép vòng → bỏ ghép, phòng đứng nguyên chỗ, một dòng lưu ý. Mọi phòng cùng cao độ sàn của phòng gốc đầu tiên.
   * @returns {{ ct, thu_tu: [mã phòng], loi: [], luu_y: [] }}
   */
  function datNha(ctIn) {
    const ct = chuanNha(ctIn), ds = ct.phong, { thu, vong } = xepThu(ds), loi = [], luu_y = [];
    let z0 = null;
    for (const i of thu) {
      const p = ds[i], gp = p.ghep;
      if (gp) {
        const k = ds.findIndex(q => q.id === gp.phong);
        let bo = '';
        if (k < 0 || k === i) bo = `${p.ten}: phòng đích để ghép không còn — bỏ ghép, phòng đứng nguyên chỗ.`;
        else if (vong.indexOf(i) >= 0) bo = `${p.ten}: ghép thành vòng (${p.ten} → ${ds[k].ten} → … → ${p.ten}) — bỏ ghép của ${p.ten}, phòng đứng nguyên chỗ.`;
        else {
          const HY = hinhHoc(ds[k]);
          if (!HY.tuong[gp.tuong]) bo = `${p.ten}: tường ${tenTuong(gp.tuong)} của ${ds[k].ten} không còn — bỏ ghép, phòng đứng nguyên chỗ.`;
          else {
            const r = ghepPhong(HY, gp.tuong, p, gp.tuong_minh, gp.cach);
            if (!r) luu_y.push(`${p.ten}: tường ghép chưa có chiều dài — chưa đặt lại được, phòng đứng chỗ cũ.`);
            else { p.goc = r.goc; if (r.huong) p.huong = r.huong; else delete p.huong; }
          }
        }
        if (bo) { delete p.ghep; luu_y.push(bo); }
      }
      const g0 = goc3(p);
      if (z0 === null) z0 = g0[2];
      else if (Math.abs(g0[2] - z0) > 0.01) { p.goc = [g0[0], g0[1], z0]; luu_y.push(`${p.ten} đặt theo cao độ sàn chung +${g(z0)} của cả nhà (bảng chưa vẽ được phòng lệch cao độ sàn).`); }
    }
    ct.phong = ds.map(p => chuanHoa(p));
    return { ct, thu_tu: thu.map(i => ds[i].id), loi, luu_y };
  }
  /** Xoá phòng `id`: các phòng ghép vào nó thành phòng tự do, đứng nguyên chỗ (goc / huong của lần đặt gần nhất). */
  function xoaPhong(ct, id) {
    const c = datNha(ct).ct, i = c.phong.findIndex(p => p.id === id);
    if (i < 0) return c;
    c.dem = soMa(c.phong, c.dem);      // nhớ mã đã cấp trước khi bỏ phòng → phòng thêm sau không mang lại mã này
    c.phong.splice(i, 1);
    for (const p of c.phong) if (p.ghep && p.ghep.phong === id) delete p.ghep;
    if (c.chon === id) c.chon = c.phong.length ? c.phong[Math.min(i, c.phong.length - 1)].id : '';
    return chuanNha(c);
  }

  // Quét mọi cặp tường của hai phòng: tường chung (ngược chiều, mặt trong phòng sau cách mặt trong phòng trước đúng một bề dày của phòng trước) + phòng lấn vào tường
  function quetChung(ct) {
    const c = chuanNha(ct), { thu } = xepThu(c.phong), R = thu.map(i => longPhong(c.phong[i])), ds = [], luu_y = [];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1], tru = (a, b) => [a[0] - b[0], a[1] - b[1]];
    for (let x = 0; x < R.length; x++) for (let y = x + 1; y < R.length; y++) {
      const X = R[x], Y = R[y], day = X.p.day;
      for (const A of X.H.tuong) {
        if (!(A.dai > 0)) continue;
        const a0 = [A.p0[0] + X.o[0], A.p0[1] + X.o[1]];
        for (const B of Y.H.tuong) {
          if (!(B.dai > 0) || dot(A.d, B.d) > -0.9999) continue;
          const b0 = [B.p0[0] + Y.o[0], B.p0[1] + Y.o[1]], b1 = [B.p1[0] + Y.o[0], B.p1[1] + Y.o[1]];
          const t0 = dot(tru(b0, a0), A.n), t1 = dot(tru(b1, a0), A.n);
          if (Math.abs(t0 - t1) > 1) continue;
          const kh = -(t0 + t1) / 2, s0 = dot(tru(b0, a0), A.d), s1 = dot(tru(b1, a0), A.d);
          const u0 = Math.max(0, Math.min(s0, s1)), u1 = Math.min(A.dai, Math.max(s0, s1));
          if (u1 - u0 <= 1) continue;
          if (Math.abs(kh - day) <= 1) {
            const sB = u => dot(tru([a0[0] + A.d[0] * u - A.n[0] * kh, a0[1] + A.d[1] * u - A.n[1] * kh], b0), B.d);
            ds.push({ chu: { phong: X.p.id, i: A.i, s0: rn(u0, 1), s1: rn(u1, 1) }, khach: { phong: Y.p.id, j: B.i, s0: rn(sB(u1), 1), s1: rn(sB(u0), 1) }, day, cao: [A.cao, B.cao] });
          } else if (kh > -0.5 && kh < 0.5) luu_y.push(`${Y.p.ten} áp sát mặt trong tường ${A.ten} của ${X.p.ten}: mặt trong tường ${B.ten} trùng mặt trong tường đó — tường của ${X.p.ten} sẽ nằm trong lòng ${Y.p.ten} (lòng hụt ${g(day)}). Ghép lại phòng, hoặc dời cho cách đúng một bề dày tường (${g(day)}).`);
          else if (kh > day + 1 && kh < day + (Y.p.day > 0 ? Y.p.day : day) - 0.5) luu_y.push(`Tường ${B.ten} của ${Y.p.ten} chồng lên tường ${A.ten} của ${X.p.ten}: hai mặt trong cách nhau ${g(kh)} — hơn một bề dày (${g(day)}, tường chung) mà chưa đủ hai bề dày (${g(day + (Y.p.day > 0 ? Y.p.day : day))}), hai tường sẽ dựng chồng một phần lên nhau. Ghép lại phòng, hoặc dời cho cách đúng ${g(day)} (tường chung) / từ ${g(day + (Y.p.day > 0 ? Y.p.day : day))} trở ra (hai tường riêng).`);
          else if (kh >= 0.5 && kh < day - 1) luu_y.push(`${Y.p.ten} lấn vào tường ${A.ten} của ${X.p.ten}: mặt trong tường ${B.ten} cách mặt trong tường đó ${g(kh)}, mà tường dày ${g(day)} — chưa phải tường chung. Ghép lại phòng, hoặc dời cho cách đúng một bề dày tường.`);
        }
      }
    }
    return { c, R, ds, luu_y };
  }
  /** TƯỜNG CHUNG của công trình (theo HÌNH — phòng chạm nhau mà không khai ghép cũng nhận): [{ chu: { phong, i, s0, s1 }, khach: { phong, j, s0, s1 }, day }] — s đo từ đầu trái tường của phòng đó. */
  function tuongChung(ct) { return quetChung(ct).ds.map(x => ({ chu: x.chu, khach: x.khach, day: x.day })); }
  /**
   * NGỮ CẢNH NHÀ của phòng `id` cho hinhHoc: { day: { j: dày phòng chủ } cho các tường KHÁCH, mo_chung: [lỗ bóng], luu_y: [] }.
   * Lỗ bóng = cửa / cửa sổ / ô trống của phòng bên nằm gọn trên đoạn tường chung, đổi sang hệ toạ độ tường của phòng này: { tuong, loai, cach, rong, cao, be, chung: { phong, j, ten } }.
   */
  function nguCanh(ct, id) {
    const Q = quetChung(ct), me = Q.c.phong.find(p => p.id === id), out = { day: {}, mo_chung: [], luu_y: [] };
    if (!me) return out;
    const lo = (m, jm) => `${LOAI_MO[m.loai]} ${jm + 1}`;
    for (const s of Q.ds) {
      let toi, ben;
      if (s.khach.phong === id) { if (!(s.khach.j in out.day)) out.day[s.khach.j] = s.day; toi = { j: s.khach.j, a: s.khach.s0, b: s.khach.s1 }; ben = { id: s.chu.phong, j: s.chu.i, a: s.chu.s0, b: s.chu.s1 }; }
      else if (s.chu.phong === id) { toi = { j: s.chu.i, a: s.chu.s0, b: s.chu.s1 }; ben = { id: s.khach.phong, j: s.khach.j, a: s.khach.s0, b: s.khach.s1 }; }
      else continue;
      const kia = Q.c.phong.find(p => p.id === ben.id), tenW = (p, j) => (p.tuong[j] && p.tuong[j].ten) || tenTuong(j);
      kia.mo.forEach((m, jm) => {
        if (m.tuong !== ben.j || !(m.rong > 0)) return;
        const m0 = m.cach, m1 = m.cach + m.rong;
        if (m1 <= ben.a + 0.5 || m0 >= ben.b - 0.5) return;
        if (m0 < ben.a - 1 || m1 > ben.b + 1) { out.luu_y.push(`${lo(m, jm)} của ${kia.ten} (tường ${tenW(kia, m.tuong)}) thò ra ngoài đoạn tường chung với phòng này — cửa thông phải nằm gọn trong đoạn chung; sửa cách trái / rộng của cửa.`); return; }
        const cach = rn(toi.a + ben.b - m1, 1);
        if (me.mo.some(x => x.tuong === toi.j && Math.abs(x.cach - cach) <= 1 && Math.abs(x.rong - m.rong) <= 1 && Math.abs(x.be - m.be) <= 1 && Math.abs(x.cao - m.cao) <= 1)) { out.luu_y.push(`${lo(m, jm)} của ${kia.ten} đã nhập ở cả hai phòng (phòng này cũng có, tường ${tenW(me, toi.j)}) — cửa thông chỉ cần nhập một bên; vẽ vẫn chỉ khoét một lỗ.`); return; }
        out.mo_chung.push({ tuong: toi.j, loai: m.loai, cach, rong: m.rong, cao: m.cao, be: m.be, chung: { phong: kia.id, j: jm, ten: kia.ten } });
      });
      me.mo.forEach((m, jm) => {
        if (m.tuong !== toi.j || !(m.rong > 0)) return;
        const m0 = m.cach, m1 = m.cach + m.rong;
        if (m1 <= toi.a + 0.5 || m0 >= toi.b - 0.5) return;
        if (m0 < toi.a - 1 || m1 > toi.b + 1) out.luu_y.push(`${lo(m, jm)} (tường ${tenW(me, m.tuong)}) thò ra ngoài đoạn tường chung với ${kia.ten} — cửa thông phải nằm gọn trong đoạn chung; sửa cách trái / rộng của cửa.`);
      });
    }
    return out;
  }
  /** hinhHoc của phòng `id` trong công trình (kèm ngữ cảnh nhà: tường khách dày theo chủ, lỗ bóng của cửa thông). */
  function hinhNha(ct, id) {
    const c = chuanNha(ct), p = c.phong.find(q => q.id === id) || c.phong[0];
    return hinhHoc(p, nguCanh(c, p.id));
  }
  /**
   * Phòng đã vẽ mà hình hiện tại (H = hinhHoc kèm ngữ cảnh nhà) không còn khớp bản ghi lần vẽ (sửa số đo, phòng đích của ghép đổi / dời) → cần vẽ lại.
   * Xét cả tường đứng tên (`tuong`) lẫn tường chung đang giữ của phòng bên (`muon`).
   */
  function lechDaVe(H, p) {
    if (!p || !p.da_ve || !Array.isArray(p.da_ve.tuong)) return false;
    if (H.loi.length) return true;
    const m = phanPhong(H, p.day), g = (x, y) => Math.abs(x - y) <= 1, khop = ds => r => !ds.some(w => g(w.a[0], r[0]) && g(w.a[1], r[1]) && g(w.b[0], r[2]) && g(w.b[1], r[3]) && g(w.cao, r[5]) && g(w.day, r[6]));
    // (1.41.0) vách phòng con đã vẽ mà nay phòng con dời / đổi cỡ / bỏ → lệch (thêm phòng con sau khi vẽ thì không — như thêm cửa)
    return p.da_ve.tuong.concat(Array.isArray(p.da_ve.muon) ? p.da_ve.muon : []).some(khop(m.tuong)) || (Array.isArray(p.da_ve.vach) && p.da_ve.vach.some(khop(m.vach || [])));
  }
  /**
   * Bản ghi lần vẽ (da_ve) của các phòng KHÁC trong công trình — opt.khac của doiChieuPhong.
   * Bỏ bản ghi của phòng đã LỆCH (dời / đổi số đo mà chưa vẽ lại): bản ghi đó tả chỗ cũ, nhận nó làm "của phòng bên" thì tường cũ nằm cắt ngang phòng mới
   * cũng không dừng hỏi như một phòng (bản 1.36 vòng soát).
   */
  function khacDaVe(ct, id) {
    const c = chuanNha(ct);
    return c.phong.filter(p => p.id !== id && p.da_ve).filter(p => { try { return !lechDaVe(hinhHoc(p, nguCanh(c, p.id)), p); } catch (e) { return true; } }).map(p => p.da_ve);
  }

  // hai lòng phòng (đa giác đơn, có thể lõm) chồng nhau: điểm sát mép trong của phòng này nằm hẳn trong phòng kia, hoặc hai cạnh cắt ngang nhau
  function chongLong(A, B) {
    const T = 0.5, trongDG = (q, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > q[1]) !== (b[1] > q[1]) && q[0] < (b[0] - a[0]) * (q[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
    const kc = (q, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, t = L2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L2)); return Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dy); };
    const hanTrong = (q, P) => trongDG(q, P) && P.every((a, i) => kc(q, a, P[(i + 1) % P.length]) > T);
    const mau = X => X.H.tuong.filter(w => w.dai > 0).flatMap(w => [0.02, 0.5, 0.98].map(k => [w.p0[0] + w.d[0] * w.dai * k + w.n[0] * 2 + X.o[0], w.p0[1] + w.d[1] * w.dai * k + w.n[1] * 2 + X.o[1]]));
    if (mau(A).some(q => hanTrong(q, B.P)) || mau(B).some(q => hanTrong(q, A.P))) return true;
    const ben = (a, b, q) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return ((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0])) / L; };
    for (let i = 0; i < A.P.length; i++) for (let j = 0; j < B.P.length; j++) {
      const a = A.P[i], b = A.P[(i + 1) % A.P.length], c = B.P[j], d = B.P[(j + 1) % B.P.length];
      if (ben(a, b, c) * ben(a, b, d) < 0 && Math.abs(ben(a, b, c)) > T && Math.abs(ben(a, b, d)) > T && ben(c, d, a) * ben(c, d, b) < 0 && Math.abs(ben(c, d, a)) > T && Math.abs(ben(c, d, b)) > T) return true;
    }
    return false;
  }
  /** KIỂM CẢ NHÀ: lòng hai phòng chồng nhau (LỖI), phòng lấn tường / trần khác bên tường chung (lưu ý), tường khách chỉ chung một đoạn (ghi chú). */
  function kiemNha(ct) {
    const Q = quetChung(ct), loi = [], luu_y = Q.luu_y.slice(), ghi_chu = [], R = Q.R, ten = id => (Q.c.phong.find(p => p.id === id) || {}).ten || id;
    for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) if (R[i].kin && R[j].kin && chongLong(R[i], R[j])) loi.push(`Lòng ${R[j].p.ten} chồng lên lòng ${R[i].p.ten} — dời hoặc ghép lại cho hai phòng nằm hai bên một bức tường.`);
    const daBao = new Set();
    for (const s of Q.ds) {
      if (Math.abs(s.cao[0] - s.cao[1]) > 0.5) luu_y.push(`${ten(s.khach.phong)} và ${ten(s.chu.phong)}: trần hai bên tường chung khác nhau (${g(s.cao[1])} và ${g(s.cao[0])}) — tường chung vẽ cao theo ${ten(s.chu.phong)}.`);
      const k = s.khach.phong + ':' + s.khach.j; if (daBao.has(k)) continue;
      const p = Q.c.phong.find(q => q.id === s.khach.phong), w = R.find(r => r.p.id === p.id).H.tuong[s.khach.j];
      const phu = Q.ds.filter(x => x.khach.phong === s.khach.phong && x.khach.j === s.khach.j).reduce((t, x) => t + (x.khach.s1 - x.khach.s0), 0);
      if (phu < w.dai - 1) { daBao.add(k); ghi_chu.push(`Tường ${w.ten} của ${p.ten} chỉ chung một đoạn với ${ten(s.chu.phong)} (${g(phu)} / ${g(w.dai)}) — cả tường vẽ dày theo ${ten(s.chu.phong)} (${g(s.day)}).`); }
    }
    return { loi, luu_y, ghi_chu };
  }

  /** Mặt bằng CẢ NHÀ (nhỏ, để chọn phòng / chọn tường đích khi ghép). opts: { chon: mã phòng, ghep: mã phòng đang ghép (tường của các phòng khác bấm được), dich: { phong, tuong }, cao_px } */
  function matBangNhaSVG(ct, opts) {
    opts = Object.assign({ cao_px: 180 }, opts || {});
    const Q = quetChung(ct), R = Q.R, h = hopNha(Q.c);
    const bx = h.x1 - h.x0, by = h.y1 - h.y0, lon = Math.max(bx, by, 1000), m = lon * 0.06 + 300, fs = lon / 28, f = v => rn(v, 1);
    const X = q => f(q[0]), Y = q => f(-q[1]), pt = q => `${X(q)},${Y(q)}`;
    const vb = [h.x0 - m, -h.y1 - m, bx + 2 * m, by + 2 * m];
    let o = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.map(f).join(' ')}" width="100%" height="${f(opts.cao_px)}" style="font-family:inherit" role="img" aria-label="Mặt bằng cả nhà ${esc(Q.c.ten)}">`;
    o += `<rect x="${f(vb[0])}" y="${f(vb[1])}" width="${f(vb[2])}" height="${f(vb[3])}" fill="${M_NEN}"/>`;
    const sw = Math.max(lon / 250, 20);
    for (const r of R) {
      const on = opts.chon === r.p.id, dang = opts.ghep === r.p.id;
      o += `<g data-phong="${esc(r.p.id)}"${on ? ' class="chon"' : ''} style="cursor:pointer"><title>${esc(r.p.ten)}</title>`;
      o += `<polygon points="${r.P.map(pt).join(' ')}" fill="${on ? M_NHAN : M_TRANG}" fill-opacity="${on ? '.18' : '1'}" stroke="${M_TUONG}" stroke-width="${f(sw)}"${dang ? ` stroke-dasharray="${f(sw * 3)} ${f(sw * 2)}"` : ''} stroke-linejoin="miter"/>`;
      const xs = r.P.map(q => q[0]), ys = r.P.map(q => q[1]), c = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
      // (1.41.0) phòng con: dải vách + tên (không có vùng bấm riêng — bấm vẫn là chọn phòng)
      for (const pc of r.H.con || []) {
        for (const k of MAT_CON) if (pc.bang[k]) o += `<polygon data-nha-vach="${esc(r.p.id)}:${esc(pc.id)}" points="${pc.bang[k].map(q => pt([q[0] + r.o[0], q[1] + r.o[1]])).join(' ')}" fill="${M_TUONG}" pointer-events="none"/>`;
        // (1.41.0 vòng soát) cửa phụ: khe trong vách + cung mở (như mặt bằng một phòng, không chữ) — trước đây vách vẽ kín qua chỗ cửa
        (pc.cua || []).forEach((mm, k) => {
          const w = mm.w; if (!w) return;
          const tr = (s0, t0) => [w.p0[0] + w.d[0] * s0 + w.n[0] * t0 + r.o[0], w.p0[1] + w.d[1] * s0 + w.n[1] * t0 + r.o[1]];
          const v = w.day, dl = fs / 20, s0 = mm.cach, s1 = mm.cach + mm.rong;
          o += `<polygon points="${[tr(s0, dl), tr(s1, dl), tr(s1, -v - dl), tr(s0, -v - dl)].map(pt).join(' ')}" fill="${on ? M_NHAN : M_TRANG}" fill-opacity="${on ? '.18' : '1'}" pointer-events="none"/>`;
          const vao = mm.mo !== 'ngoai', t0 = vao ? -v : 0, dau = vao ? -1 : 1, sH = mm.ban === 'phai' ? s1 : s0, sE = mm.ban === 'phai' ? s0 : s1;
          const h0 = tr(sH, t0), e = tr(sE, t0), c2 = tr(sH, t0 + dau * mm.rong);
          const v1 = [c2[0] - h0[0], -(c2[1] - h0[1])], v2 = [e[0] - h0[0], -(e[1] - h0[1])], quet = v1[0] * v2[1] - v1[1] * v2[0] > 0 ? 1 : 0;
          o += `<path data-nha-cung="${esc(r.p.id)}:${esc(pc.id)}:${k}" d="M ${X(h0)} ${Y(h0)} L ${X(c2)} ${Y(c2)} A ${f(mm.rong)} ${f(mm.rong)} 0 0 ${quet} ${X(e)} ${Y(e)}" fill="none" stroke="${M_MO}" stroke-width="${f(Math.max(sw / 2, fs / 12))}" pointer-events="none"/>`;
        });
        const t = [(pc.long[0][0] + pc.long[2][0]) / 2 + r.o[0], (pc.long[0][1] + pc.long[2][1]) / 2 + r.o[1]];
        o += `<text x="${X(t)}" y="${f(-t[1] + fs * 0.25)}" font-size="${f(fs * 0.7)}" text-anchor="middle" fill="${M_MO}" pointer-events="none">${esc(pc.ten)}</text>`;
      }
      o += `<text x="${X(c)}" y="${f(-c[1] + fs * 0.35)}" font-size="${f(fs)}" font-weight="${on ? 700 : 400}" text-anchor="middle" fill="${on ? M_NHAN : M_TUONG}" pointer-events="none">${esc(r.p.ten)}</text></g>`;
    }
    // tường chung: nét đậm đúng bề dày trên đoạn chung (mặt ngoài phía phòng chủ)
    for (const s of Q.ds) {
      const r = R.find(x => x.p.id === s.chu.phong), w = r.H.tuong[s.chu.i], q = u => [w.p0[0] + w.d[0] * u - w.n[0] * s.day / 2 + r.o[0], w.p0[1] + w.d[1] * u - w.n[1] * s.day / 2 + r.o[1]];
      const a = q(s.chu.s0), b = q(s.chu.s1);
      o += `<line data-chung="${esc(s.chu.phong)}:${s.chu.i}" x1="${X(a)}" y1="${Y(a)}" x2="${X(b)}" y2="${Y(b)}" stroke="${M_TUONG}" stroke-width="${f(s.day)}" pointer-events="none"/>`;
    }
    // đang ghép: tường của các phòng khác là vùng bấm chọn tường đích
    if (opts.ghep) for (const r of R) {
      if (r.p.id === opts.ghep) continue;
      for (const w of r.H.tuong) {
        if (!(w.dai > 0)) continue;
        const a = [w.p0[0] + r.o[0], w.p0[1] + r.o[1]], b = [w.p1[0] + r.o[0], w.p1[1] + r.o[1]], on = opts.dich && opts.dich.phong === r.p.id && opts.dich.tuong === w.i;
        if (on) o += `<line x1="${X(a)}" y1="${Y(a)}" x2="${X(b)}" y2="${Y(b)}" stroke="${M_NHAN}" stroke-width="${f(sw * 4)}" pointer-events="none"/>`;
        const t = [(a[0] + b[0]) / 2 - w.n[0] * fs * 1.2, (a[1] + b[1]) / 2 - w.n[1] * fs * 1.2];
        o += `<text x="${X(t)}" y="${f(-t[1] + fs * 0.3)}" font-size="${f(fs * 0.8)}" text-anchor="middle" fill="${on ? M_NHAN : M_MO}" pointer-events="none">${esc(w.ten)}</text>`;
        o += `<line data-nha-tuong="${esc(r.p.id)}:${w.i}" x1="${X(a)}" y1="${Y(a)}" x2="${X(b)}" y2="${Y(b)}" stroke="${M_NHAN}" stroke-opacity="0" stroke-width="${f(Math.max(sw * 8, fs * 1.6))}" style="cursor:pointer"><title>Tường ${esc(w.ten)} của ${esc(r.p.ten)}</title></line>`;
      }
    }
    return o + '</svg>';
  }

  /* ---------------- phòng đã đo trên điện thoại (bản 1.24) ---------------- */
  // Trang "Đo hiện trạng" của xưởng gửi số đo lên kho trên máy chủ của xưởng; máy vẽ (bảng này, chạy trong trang Chenfeng) ĐỌC kho đó bằng một mã kết nối
  // do quản lý cấp. Hai hàm dưới đây chỉ đọc + soát dữ liệu tới từ mạng; việc gọi mạng nằm ở giao diện.
  const MA_KN = /^mn-[A-Za-z0-9_-]{20,80}$/, ID_DO = /^[a-z0-9]{6,40}$/;
  /**
   * Đọc "chuỗi kết nối" trang đo cấp cho máy vẽ: "<địa chỉ kho trên máy chủ>#<mã>". Địa chỉ nằm trong chuỗi nên bảng không ghi cứng máy chủ của xưởng nào.
   * Máy chủ ngoài bắt buộc https (mã không đi trên đường không mã hoá); http chỉ nhận cho localhost.
   * @returns {{goc: string, ma: string}} | {{loi: string}}
   */
  function docKetNoi(text) {
    const t = String(text === null || text === undefined ? '' : text).replace(/\s+/g, ''), LAY = ' — chép lại cả chuỗi ở trang đo (Mã kết nối máy vẽ → Chép mã).';
    if (!t) return { loi: 'Dán chuỗi kết nối vào ô này (lấy ở trang đo: Mã kết nối máy vẽ → Cấp mã → Chép mã).' };
    const i = t.lastIndexOf('#'), ma = i >= 0 ? t.slice(i + 1) : t, dc = i >= 0 ? t.slice(0, i) : '';
    if (!MA_KN.test(ma)) return { loi: 'Mã kết nối không đúng dạng' + LAY };
    if (!dc) return { loi: 'Chuỗi này thiếu địa chỉ máy chủ' + LAY };
    let u; try { u = new URL(dc); } catch (e) { u = null; }
    if (!u || !u.hostname || u.username || u.password) return { loi: 'Địa chỉ máy chủ trong chuỗi không đọc được' + LAY };
    const taiMay = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname);
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && taiMay)) return { loi: 'Địa chỉ máy chủ phải bắt đầu bằng https://' + LAY };
    return { goc: (u.origin + u.pathname).replace(/\/+$/, ''), ma };
  }

  /**
   * Danh sách PHÒNG ĐÃ ĐO máy chủ trả về (cửa /phong của kho đo hiện trạng) → các dòng cho thẻ Phòng, phòng sửa gần nhất đứng đầu.
   * Mỗi phòng mang gói `muc.gui` do MÁY ĐO tính sẵn (cạnh suy ra đã điền, chỉ gồm chi tiết đủ số, nét + chữ chú thích của từng ảnh theo điểm ảnh):
   * ở đây CHỈ ĐỌC gói đó, không tính lại số đo, không dựng phòng từ số đo thô. Dữ liệu tới từ mạng nên đọc phòng thủ — trường hỏng thì bỏ / về mặc định, có trần số lượng.
   * @param ds     mảng `phong` của câu trả lời
   * @param daLay  { khoá phòng: mốc sửa của bản máy vẽ này đã lấy } — để đánh dấu phòng "mới"
   * @returns [{ khoa, ten, ct, dia_chi, ngay, nguoi, sua_luc, xong, moi, goi: 'co' | 'khong' (trang đo bản cũ, chưa có gói) | 'la' (gói bản mới hơn),
   *             phong (null = không có gì để lấy), loi (vì sao chưa "lấy & vẽ" ngay được), ve_duoc (loi trống), bo (chi tiết máy đo chưa đưa sang), tom,
   *             anh: [{ id, mat, w, h, ghi, co, net, chu, tren_may_chu }], anh_thieu }]
   */
  function phongDaDo(ds, daLay) {
    const chuC = (v, n) => (typeof v === 'string' ? v.slice(0, n) : ''), soT = v => typeof v === 'number' && isFinite(v), doiTuong = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
    const mang = v => (Array.isArray(v) ? v : []), ra = [];
    for (const x of mang(ds)) {
      if (ra.length >= 400) break;
      const ct = doiTuong(x && x.ct), m = doiTuong(x && x.muc);
      if (!ct || !m || typeof ct.id !== 'string' || !ID_DO.test(ct.id) || typeof m.id !== 'string' || !ID_DO.test(m.id)) continue;
      const khoa = ct.id + '/' + m.id, sua = soT(x.sua_luc) && x.sua_luc > 0 ? x.sua_luc : 0, gui = doiTuong(m.gui);
      const r = { khoa, ten: chuC(m.ten, 60).trim() || 'Phòng', ct: chuC(ct.ten, 80), dia_chi: chuC(ct.dia_chi, 200), ngay: /^\d{4}-\d{2}-\d{2}$/.test(ct.ngay) ? ct.ngay : '', nguoi: chuC(x.nguoi_gui, 60), sua_luc: sua,
        xong: m.xong === true, moi: !(daLay && daLay[khoa] >= sua && sua > 0), goi: !gui ? 'khong' : gui.ban === 1 ? 'co' : 'la', phong: null, loi: [], bo: [], tom: '', ve_duoc: false, anh: [], anh_thieu: 0 };
      if (r.goi === 'co') {
        let p = null;
        try {
          const src = doiTuong(gui.phong);
          if (src && Array.isArray(src.tuong) && src.tuong.length) {
            // chỉ nhận HÌNH phòng: chỗ đặt trên bản vẽ, bản ghi đã vẽ, khung tủ là việc của máy vẽ này, không lấy từ mạng
            const sach = { ten: r.ten, cao: src.cao, day: src.day };
            for (const k of ['tuong', 'mo', 'can', 'dn']) sach[k] = mang(src[k]).filter(doiTuong).slice(0, 200);
            p = chuanHoa(sach);
          }
        } catch (e) { p = null; }
        r.loi = mang(gui.loi).filter(t => typeof t === 'string' && t).slice(0, 20).map(t => t.slice(0, 200));
        r.bo = mang(gui.bo).filter(t => typeof t === 'string' && t).slice(0, 60).map(t => t.slice(0, 80));
        if (!p) r.loi.push('Gói số đo của phòng này không đọc được.');
        else {
          const H = hinhHoc(p);
          for (const t of H.loi) if (r.loi.indexOf(t) < 0) r.loi.push(t);      // máy vẽ tự soát lại hình trước khi cho vẽ
          // đủ số mà hình không khép kín (số đo lệch nhau): vẫn LẤY về xem được, nhưng không cho "lấy & vẽ" một chạm — phải nhìn mặt bằng trước
          if (!r.loi.length && !H.khep.kin) { const k = H.luu_y.filter(t => /chưa khép kín/.test(t)); r.loi = k.length ? k.slice(0, 2) : ['Phòng chưa khép kín.']; }
          r.phong = p; r.tom = tomTat(H)[0] || ''; r.ve_duoc = r.loi.length === 0;
          const coMC = new Set(mang(x.anh_co).filter(v => typeof v === 'string'));
          for (const a of mang(gui.anh)) {
            if (r.anh.length >= 120) break;
            if (!doiTuong(a) || typeof a.id !== 'string' || !ID_DO.test(a.id)) continue;
            const co1 = v => (soT(v) && v >= 1 && v <= 20000 ? Math.round(v) : 0), w = co1(a.w), h = co1(a.h), biet = w > 0 && h > 0;      // không biết cỡ ảnh gốc thì không biết đặt chú thích vào đâu
            const t = Number.isInteger(a.tuong) && a.tuong >= 0 && a.tuong < p.tuong.length ? a.tuong : -1, co = !biet ? 0 : soT(a.co) && a.co > 0 ? a.co : rn(Math.max(w, h) / 26, 1);
            const q = { id: a.id, mat: t >= 0 ? p.tuong[t].ten : '', w: biet ? w : 0, h: biet ? h : 0, ghi: chuC(a.ghi, 200), co, net: [], chu: [], tren_may_chu: coMC.has(a.id) };
            if (biet) {
              for (const d of mang(a.net)) { if (q.net.length >= 800) break; if (Array.isArray(d) && d.length === 4 && d.every(soT)) q.net.push(d.slice()); }
              for (const c of mang(a.chu)) { if (q.chu.length >= 200) break; if (doiTuong(c) && typeof c.text === 'string' && c.text && soT(c.x) && soT(c.y)) q.chu.push({ text: c.text.slice(0, 80), x: c.x, y: c.y, co: soT(c.co) && c.co > 0 ? c.co : co, goc: soT(c.goc) ? c.goc : 0 }); }
            }
            r.anh.push(q);
          }
          r.anh_thieu = r.anh.filter(a => !a.tren_may_chu).length;
        }
      }
      ra.push(r);
    }
    return ra.map((r, i) => [r, i]).sort((a, b) => (b[0].sua_luc - a[0].sua_luc) || (a[1] - b[1])).map(v => v[0]);
  }

  return { BAN, MAT_CON, TEN_MAT, CUA_CON_MAX, tuongTheoMa, LOAI_MO, LOAI_CAN, LOAI_DN, MAU_DN, macDinh, chuanHoa, hinhHoc, phanPhong, banGhiPhong, tuongGhi, vungBanGhi, doiChieuPhong, trongLongPhong, tuongPhuKin, choTrong, datKhung, chiaKhung, doiCoKhung, mocKhung, keoKhung, tuChoKhung, hinhThanhKhung, haiDiemThanhHinh, viTriCot, khauChoKhung, diemTrongKhung, dienNuocChoTu, dienNuocDXF, duongNet, tomTat, matBangSVG, matDungSVG, docMa, docKetNoi, phongDaDo, giao, tenTuong,
    chuanHuong, chuanNha, docNha, nangNha, idMoi, phongMoi, thuTu, dichGhep, ghepPhong, cachGhep, datNha, xoaPhong, tuongChung, nguCanh, hinhNha, khacDaVe, lechDaVe, kiemNha, matBangNhaSVG };
});
