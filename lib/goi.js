/*!
 * goi.js — tính GÓI `gui` cho máy vẽ (tiện ích mn-chenfeng, thẻ Phòng → "Phòng đã đo trên điện thoại") từ số đo thô của trang đo.
 * Hàm thuần: không đọc giờ, không ngẫu nhiên, không mạng. Chạy được cả ở máy chủ (require) lẫn trên điện thoại (window.MNDOGoi) để thợ xem trước.
 * Máy chủ LUÔN tính lại khi lưu — không tin gói điện thoại gửi.
 * Ph = vendor/mncf-phong.js (bản chép của máy vẽ) — dùng chuanHoa / hinhHoc của nó để lời lỗi trùng chữ với lời máy vẽ tự soát lại.
 *
 * Dạng thô (muc.phong, ban 1 của trang đo):
 *   { ban: 1, ten, cao: số | null, day, hinh, tuong: [{ ten, dai (0 = chưa đo / để tự suy), re, cao? }],
 *     mo: [{ id, tuong, loai, tu, cach, rong, cao, be }], can: [{ id, tuong, loai, tu, cach, rong, nho, z0, z1 }],
 *     dn: [{ id, tuong, loai, tu, cach, cao | ra, rong?, cao_o?, ghi? }], khung: [] }   — số chưa đo = null
 * Ảnh thô: [{ id, tuong (chỉ số | null), w, h, ghi, ke: [nét thô] }] — xem veKe.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MNDOGoi = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const GOI_BAN = '0.1.1';      // đổi thuật toán → tăng → máy chủ tính lại mọi phòng lúc khởi động
  const rn = (v, d = 1) => { const k = Math.pow(10, d); return Math.round((v + Number.EPSILON) * k) / k; };
  const g = v => String(rn(v, 1)).replace('.', ',');
  const so = v => typeof v === 'number' && isFinite(v);
  const sach = v => (Math.abs(v) < 1e-9 ? 0 : v);
  const KHOA_PHONG = ['ban', 'ten', 'cao', 'day', 'tuong', 'mo', 'can', 'dn', 'khung'];
  const TRAN = { tuong: 40, chi_tiet: 200, anh: 120, ke: 150, loi: 20, bo: 60, net: 800, chu: 200 };
  // ô bắt buộc của từng loại chi tiết (bảng 3.3 của thiết kế) — thiếu một ô là chi tiết chưa "đủ số", chưa đưa sang máy vẽ
  const CAN_MO = { cua: ['cach', 'rong', 'cao'], cua_so: ['cach', 'rong', 'cao', 'be'], o_trong: ['cach', 'rong', 'cao'] };
  const CAN_CAN = { cot: ['cach', 'rong', 'nho'], hop: ['cach', 'rong', 'nho'], dam: ['cach', 'rong', 'nho', 'z0'] };
  const TEN_O = { cach: 'cách', rong: 'rộng', cao: 'cao', be: 'bệ', nho: 'nhô', z0: 'cao dưới', z1: 'cao trên', ra: 'cách tường', dai: 'dài' };

  /** Hướng chạy của các tường — y như hinhHoc của máy vẽ (a bắt đầu 0, a_{i+1} = a_i − re_i). */
  function huong(tuong) {
    let a = 0;
    return tuong.map(t => { const r = a * Math.PI / 180, d = [sach(Math.cos(r)), sach(Math.sin(r))]; a -= so(t.re) ? t.re : 90; return d; });
  }
  const daiDo = t => (so(t.dai) && t.dai > 0 ? t.dai : 0);

  /**
   * Suy chiều dài các tường chưa đo cho phòng khép kín (mục 4.1 của thiết kế).
   * @returns {{ dai: [số], suy: {i: L}, loi: [chuỗi] }}
   */
  function suyTuong(tuong) {
    const ten = i => tuong[i].ten, dai = tuong.map(daiDo), loi = [], suy = {};
    if (tuong.length < 3) { if (tuong.length) loi.push('Phòng cần ít nhất 3 tường.'); return { dai, suy, loi }; }
    const tong = tuong.reduce((s, t) => s + (so(t.re) ? t.re : 90), 0);
    const U = []; dai.forEach((v, i) => { if (!(v > 0)) U.push(i); });
    const chua = () => U.forEach(i => loi.push(`Tường ${ten(i)} chưa có chiều dài.`));
    if (Math.abs(tong - 360) >= 0.01) {      // góc sai: hướng tường sai thì suy gì cũng sai — chỉ nói góc (lời của hinhHoc, xem tinh())
      loi.push(`Phòng chưa khép kín: tổng các góc rẽ là ${g(tong)}° (phòng kín phải đủ 360°). Kiểm tra cột "Rẽ" của từng tường.`);
      return { dai, suy, loi };
    }
    if (!U.length) return { dai, suy, loi };
    const d = huong(tuong);
    let S = [0, 0]; dai.forEach((v, i) => { if (v > 0) S = [S[0] + d[i][0] * v, S[1] + d[i][1] * v]; });
    const khongCho = i => `Không suy được tường ${ten(i)}: các tường còn lại không chừa chỗ cho nó (kiểm tra chiều dài và hướng rẽ).`;
    if (U.length === 1) {
      const k = U[0], L = -(S[0] * d[k][0] + S[1] * d[k][1]), vuong = Math.abs(S[0] * d[k][1] - S[1] * d[k][0]);
      // ngưỡng 0,9 (thiết kế ghi 1): số suy làm tròn 0,1 cộng thêm ≤ 0,05 — để hở sau cùng vẫn < 1 mm như hinhHoc đòi
      if (vuong > 0.9) { chua(); loi.push(`Không suy được tường ${ten(k)}: các tường đã đo lệch nhau ${g(vuong)} mm theo chiều vuông góc với tường ${ten(k)} — đo lại, hoặc đo luôn tường ${ten(k)}.`); }
      else if (L <= 0.5) { chua(); loi.push(khongCho(k)); }
      else { dai[k] = rn(L, 1); suy[k] = dai[k]; }
      return { dai, suy, loi };
    }
    if (U.length === 2) {
      const [j, k] = U, a = d[j], b = d[k], det = a[0] * b[1] - a[1] * b[0], c = [-S[0], -S[1]];
      if (Math.abs(det) < 1e-6) { chua(); loi.push(`Tường ${ten(j)} và tường ${ten(k)} song song — đo ít nhất một trong hai.`); return { dai, suy, loi }; }
      const Lj = (c[0] * b[1] - c[1] * b[0]) / det, Lk = (a[0] * c[1] - a[1] * c[0]) / det;
      if (Lj <= 0.5 || Lk <= 0.5) { chua(); if (Lj <= 0.5) loi.push(khongCho(j)); if (Lk <= 0.5) loi.push(khongCho(k)); return { dai, suy, loi }; }
      dai[j] = rn(Lj, 1); dai[k] = rn(Lk, 1); suy[j] = dai[j]; suy[k] = dai[k];
      return { dai, suy, loi };
    }
    chua();
    loi.push(`Còn ${U.length} tường chưa đo — máy chỉ suy được tối đa 2 tường (không song song). Đo thêm ${U.length - 2} tường.`);
    return { dai, suy, loi };
  }

  const SO_MAX = 100000;
  // NGƯỠNG SỐ — trùng từng chữ với lib/soat.js (máy chủ từ chối CẢ phòng nếu một số ra ngoài; phép thử đối chiếu hai bên)
  const KHOANG = { phong: { cao: 0, day: 10 }, tuong: { dai: 0, re: -360, cao: 0, dai_cu: 0 },
    mo: { cach: -SO_MAX, rong: 0, cao: 0, be: 0 }, can: { cach: -SO_MAX, rong: 0, nho: 0, z0: 0, z1: 0 }, dn: { cach: -SO_MAX, cao: 0, ra: 0, rong: 0, cao_o: 0 } };
  const KHOANG_MAX = { phong: { day: 2000 }, tuong: { re: 360 } };
  /** Số ngoài khoảng máy chủ nhận: [{ truong ('phong.mo[0].rong'), nhom, j, o, v }]. */
  function soSai(tho) {
    const ra = [], t = tho && typeof tho === 'object' ? tho : {};
    const xet = (truong, nhom, j, o, v) => { if (v === undefined || v === null) return; const mn = KHOANG[nhom][o], mx = (KHOANG_MAX[nhom] || {})[o] !== undefined ? KHOANG_MAX[nhom][o] : SO_MAX; if (mn === undefined) return; if (typeof v !== 'number' || !isFinite(v) || v < mn || v > mx) ra.push({ truong, nhom, j, o, v, min: mn, max: mx }); };
    for (const o of ['cao', 'day']) xet('phong.' + o, 'phong', -1, o, t[o]);
    (Array.isArray(t.tuong) ? t.tuong : []).forEach((w, j) => { if (w && typeof w === 'object') for (const o of ['dai', 're', 'cao', 'dai_cu']) xet(`phong.tuong[${j}].${o}`, 'tuong', j, o, w[o]); });
    for (const nhom of ['mo', 'can', 'dn']) (Array.isArray(t[nhom]) ? t[nhom] : []).forEach((x, j) => { if (x && typeof x === 'object') for (const o of Object.keys(KHOANG[nhom])) xet(`phong.${nhom}[${j}].${o}`, nhom, j, o, x[o]); });
    return ra;
  }
  /** Bản sao phòng thô với mọi số ngoài khoảng → null (điện thoại gửi bản này: một ô gõ nhầm không làm máy chủ từ chối cả phòng). */
  function boSoSai(tho) {
    const c = JSON.parse(JSON.stringify(tho || {}));
    for (const s of soSai(c)) { if (s.nhom === 'phong') c[s.o] = null; else if (s.nhom === 'tuong') { if (s.o === 'dai') c.tuong[s.j].dai = 0; else if (s.o === 're') c.tuong[s.j].re = 90; else delete c.tuong[s.j][s.o]; } else c[s.nhom][s.j][s.o] = null; }
    return c;
  }
  /**
   * Đọc số thợ gõ (mm): "3 650", "3650mm", "3.600" (chấm nhóm nghìn kiểu Việt), "1.234,5", "117,5" → { v } ; trống → { v: null } ; không hiểu → { v: null, sai: lý do }.
   * Không bao giờ lặng lẽ coi chữ lạ là ô trống (ô trống của tường = để máy tự suy).
   */
  function docSo(raw) {
    let s = String(raw === null || raw === undefined ? '' : raw).replace(/[\u00a0\u2009\u202f]/g, ' ').trim().toLowerCase();
    if (!s) return { v: null };
    s = s.replace(/\s*mm$/, '');
    if (/^-?\d{1,3}( \d{3})+([.,]\d+)?$/.test(s)) s = s.replace(/ /g, '');
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '');
    s = s.replace(',', '.');
    if (!/^-?(\d+(\.\d*)?|\.\d+)$/.test(s)) return { v: null, sai: `“${String(raw).trim().slice(0, 20)}” không phải số (gõ số mm, vd 3650)` };
    return { v: Number(s) };
  }
  const coSo = v => so(v);      // ô "đã đo": có số hữu hạn (0 là số đo được: bệ 0, cách 0)
  /** Tên chi tiết theo loại, đánh số trong CÙNG loại theo thứ tự thô — đúng mẫu 'Ổ điện 1 (mặt A)'. */
  function tenChiTiet(tho, Ph) {
    const ra = { mo: [], can: [], dn: [] }, dem = {};
    const tenT = i => (tho.tuong && tho.tuong[i] ? tho.tuong[i].ten : '?');
    for (const [nhom, bang] of [['mo', Ph.LOAI_MO], ['can', Ph.LOAI_CAN], ['dn', null]]) {
      for (const x of (tho[nhom] || [])) {
        const loai = x && x.loai, tl = nhom === 'dn' ? (Ph.LOAI_DN[loai] || {}).ten : bang[loai];
        const k = nhom + ':' + loai, n = dem[k] = (dem[k] || 0) + 1;
        ra[nhom].push({ ten: `${tl || 'Chi tiết'} ${n}`, day_du: `${tl || 'Chi tiết'} ${n} (mặt ${tenT(x && x.tuong)})` });
      }
    }
    return ra;
  }

  /** Ô còn thiếu của một chi tiết (để điện thoại hiện "thiếu: cao"). */
  function thieuO(nhom, x, Ph) {
    if (!x) return ['cach'];
    let can = [];
    if (nhom === 'mo') can = CAN_MO[x.loai] || CAN_MO.cua;
    else if (nhom === 'can') can = CAN_CAN[x.loai] || CAN_CAN.cot;
    else { const L = Ph.LOAI_DN[x.loai] || {}; can = ['cach', L.san ? 'ra' : 'cao']; }
    return can.filter(k => !coSo(x[k]));
  }

  /**
   * Phân tích đủ: gói cho máy vẽ + thứ điện thoại cần hiện (lưu ý vàng, tường tự suy, tường nên để tự suy, ô thiếu của từng chi tiết).
   * @returns {{ gui, suy: {i: L}, luu_y: [], goi_y_suy: [i], thieu: { mo: [[ô]], can, dn }, H }}
   */
  function phanTich(thoIn, anhTho, Ph) {
    const thoGoc = thoIn && typeof thoIn === 'object' ? thoIn : {}, sai = soSai(thoGoc), tho = sai.length ? boSoSai(thoGoc) : thoGoc;
    const tuongTho = (Array.isArray(tho.tuong) ? tho.tuong : []).slice(0, TRAN.tuong).map((t, i) => {
      t = t && typeof t === 'object' ? t : {};
      const w = { ten: String(t.ten || Ph.tenTuong(i)).slice(0, 12), dai: daiDo(t), re: so(t.re) ? t.re : 90 };
      if (so(t.cao) && t.cao > 0) w.cao = t.cao;
      return w;
    });
    const cao = so(tho.cao) && tho.cao > 0 ? tho.cao : 0;
    const S = suyTuong(tuongTho), loi = [];
    if (sai.length) {      // số ngoài khoảng: nói đúng ô (máy chủ cũng không nhận số này — điện thoại gửi ô đó là trống)
      const tenS = tenChiTiet(thoGoc, Ph), tenT = j => (tuongTho[j] ? tuongTho[j].ten : '?');
      for (const x of sai) {
        const ai = x.nhom === 'phong' ? (x.o === 'cao' ? 'Cao trần' : 'Bề dày tường') : x.nhom === 'tuong' ? `Tường ${tenT(x.j)}: ${x.o === 're' ? 'góc rẽ' : TEN_O[x.o] || x.o}` : `${tenS[x.nhom][x.j].day_du}: ${TEN_O[x.o] || x.o}`;
        loi.push(`${ai} ${typeof x.v === 'number' && isFinite(x.v) ? g(x.v) : String(x.v).slice(0, 20)} không hợp lệ (phải từ ${g(x.min)} tới ${g(x.max)}).`);
      }
    }
    for (const t of S.loi) loi.push(t);
    const tuong = tuongTho.map((t, i) => Object.assign({}, t, { dai: S.dai[i] }));
    const nT = tuong.length, ten = tenChiTiet(tho, Ph), bo = [], thieu = { mo: [], can: [], dn: [] };
    const dsBo = [];      // [tường, nhóm, thứ tự, tên] — xếp theo tường rồi thứ tự thô
    const NHOM = { mo: 0, can: 1, dn: 2 };
    const out = { mo: [], can: [], dn: [] };
    for (const nhom of ['mo', 'can', 'dn']) {
      (Array.isArray(tho[nhom]) ? tho[nhom] : []).slice(0, TRAN.chi_tiet).forEach((x, j) => {
        const th = thieuO(nhom, x, Ph); thieu[nhom].push(th);
        if (!x || !Number.isInteger(x.tuong) || x.tuong < 0 || x.tuong >= nT) return;      // tường đã xoá: chi tiết đi theo
        const dai = tuong[x.tuong].dai, phai = x.tu === 'phai';
        // chi tiết trên tường CHƯA BIẾT DÀI cũng chưa đưa sang: không biết đặt vào đâu, đưa sang là máy vẽ báo thêm "vượt ra ngoài tường" lạc đề
        if (th.length || !(dai > 0)) { dsBo.push([x.tuong, NHOM[nhom], j, ten[nhom][j].day_du]); return; }
        if (nhom === 'mo') {
          const cach = phai ? dai - x.cach - x.rong : x.cach;
          out.mo.push({ tuong: x.tuong, loai: Ph.LOAI_MO[x.loai] ? x.loai : 'cua', cach: rn(cach, 1), rong: x.rong, cao: x.cao, be: coSo(x.be) ? x.be : 0 });
        } else if (nhom === 'can') {
          const loaiC = Ph.LOAI_CAN[x.loai] ? x.loai : 'cot', cach = phai ? dai - x.cach - x.rong : x.cach;
          // "Cao độ trên" để trống = TRẦN PHÒNG (như chuanHoa của máy vẽ) — không phải cao riêng của tường (lan can thấp mà dầm / cột vẫn lên trần).
          // Trần chưa đo thì chưa biết đỉnh: chưa đưa sang (gửi z1 = 0 là máy vẽ báo "cao độ trên phải lớn hơn cao độ dưới" lạc đề).
          if (!coSo(x.z1) && !(cao > 0)) { dsBo.push([x.tuong, NHOM[nhom], j, ten[nhom][j].day_du + ' — chờ đo trần']); return; }
          out.can.push({ tuong: x.tuong, loai: loaiC, cach: rn(cach, 1), rong: x.rong, nho: x.nho, z0: coSo(x.z0) ? x.z0 : 0, z1: coSo(x.z1) ? x.z1 : cao });
        } else {
          const L = Ph.LOAI_DN[x.loai] ? x.loai : 'o_dien', LD = Ph.LOAI_DN[L], q = { tuong: x.tuong, loai: L, cach: rn(phai ? dai - x.cach : x.cach, 1) };      // cach của điểm là tới TÂM
          if (LD.san) q.ra = x.ra; else q.cao = x.cao;
          if (so(x.rong) && x.rong > 0) q.rong = x.rong;
          if (so(x.cao_o) && x.cao_o > 0) q.cao_o = x.cao_o;
          if (x.ghi) q.ghi = String(x.ghi);
          out.dn.push(q);
        }
      });
    }
    dsBo.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
    for (const x of dsBo) if (bo.length < TRAN.bo) bo.push(x[3].slice(0, 80));
    const p0 = Ph.chuanHoa({ ban: 1, ten: String(tho.ten || 'Phòng').slice(0, 60), cao, day: so(tho.day) && tho.day >= 10 ? tho.day : 110, tuong, mo: out.mo, can: out.can, dn: out.dn, khung: [] });
    const phong = {}; for (const k of KHOA_PHONG) phong[k] = p0[k];      // phòng thủ: chỉ các khoá máy vẽ đọc
    phong.khung = [];
    const H = Ph.hinhHoc(phong);
    for (const t of H.loi) if (loi.indexOf(t) < 0) loi.push(t);
    // đủ số mà không khép (số đo lệch nhau): lời của hinhHoc — máy vẽ cũng chặn đúng lời đó
    if (!loi.length && !H.khep.kin) for (const t of H.luu_y) if (/chưa khép kín/.test(t) && loi.indexOf(t) < 0) loi.push(t);
    const luu_y = H.luu_y.filter(t => !/chưa khép kín/.test(t));
    // tường ngắn bất thường: hay là gõ mét ("3,6") hoặc chấm nhóm nghìn bị đọc thành phần thập phân
    tuongTho.forEach(t => { if (t.dai > 0 && t.dai < 100) luu_y.unshift(`Tường ${t.ten} chỉ dài ${g(t.dai)} mm — kiểm tra lại số (3,6 m gõ 3600).`); });
    // tường nên để tự suy: bỏ số của nó thì phòng khép được
    const goi_y_suy = [];
    if (nT >= 3 && !H.khep.kin && tuongTho.every(t => t.dai > 0)) {
      tuongTho.forEach((t, i) => { const thu = tuongTho.map((x, k) => Object.assign({}, x, { dai: k === i ? 0 : x.dai })), r = suyTuong(thu); if (!r.loi.length && r.suy[i] > 0) goi_y_suy.push(i); });
    }
    const anh = (Array.isArray(anhTho) ? anhTho : []).slice(0, TRAN.anh).map(a => veAnh(a, tho, phong));
    const gui = { ban: 1, phong, bo, loi: loi.slice(0, TRAN.loi).map(t => t.slice(0, 200)), anh };
    return { gui, suy: S.suy, luu_y, goi_y_suy, thieu, ten, H };
  }

  function tinhGoi(tho, anhTho, Ph) { return phanTich(tho, anhTho, Ph).gui; }

  /** Số đo liên kết: 'tuong:0:dai' | 'mo:<id>:rong' … → số hiện tại (null khi chưa có). Dài tường lấy theo gói (đã suy). */
  function giaTriLien(lien, tho, phong) {
    const m = /^(tuong|mo|can|dn):([a-z0-9]{1,12}):([a-z0-9_]{1,8})$/.exec(String(lien || ''));
    if (!m) return null;
    if (m[1] === 'tuong') { const t = phong && phong.tuong[+m[2]]; if (!t) return null; const v = m[3] === 'cao' ? (t.cao > 0 ? t.cao : phong.cao) : t[m[3]]; return so(v) && v > 0 ? v : null; }
    const x = (Array.isArray(tho[m[1]]) ? tho[m[1]] : []).find(q => q && q.id === m[2]);
    if (!x) return null;
    const v = x[m[3]]; return so(v) ? v : null;
  }
  const chuSo = v => String(rn(v, 1)).replace('.', ',');

  /** Một ảnh thô → mục `gui.anh`. */
  function veAnh(a, tho, phong) {
    a = a && typeof a === 'object' ? a : {};
    const w = Math.round(so(a.w) ? a.w : 0), h = Math.round(so(a.h) ? a.h : 0);
    const tuong = Number.isInteger(a.tuong) && a.tuong >= 0 && a.tuong < phong.tuong.length ? a.tuong : null;
    const k = veKe(a.ke, w, h, l => giaTriLien(l, tho, phong));
    return { id: String(a.id || ''), tuong, w, h, ghi: String(a.ghi || '').slice(0, 200), co: k.co, net: k.net, chu: k.chu };
  }

  /**
   * Nét thô → net / chu theo điểm ảnh của tệp (mục 5 của thiết kế). Cách kẻ ra ảnh: anhCoNet của máy vẽ.
   *   { loai: 'kt', a, b, text?, lien? } đường kích thước · { loai: 'chi', a, b, text } ghi chú có mũi tên (chữ ở a, mũi tên chỉ b) · { loai: 'chu', a, text } chữ rời
   * @param layLien (lien) → số | null
   */
  function veKe(ke, w, h, layLien) {
    const co = w > 0 && h > 0 ? rn(Math.max(w, h) / 26, 1) : 0, net = [], chu = [];
    if (!(co > 0)) return { co, net, chu };
    const kep = q => [rn(Math.min(Math.max(so(q && q[0]) ? q[0] : 0, 0), w), 1), rn(Math.min(Math.max(so(q && q[1]) ? q[1] : 0, 0), h), 1)];
    const chuC = v => String(v === null || v === undefined ? '' : v).slice(0, 80);
    for (const x of (Array.isArray(ke) ? ke : []).slice(0, TRAN.ke)) {
      if (!x || typeof x !== 'object') continue;
      if (x.loai === 'chu') { const t = chuC(x.text).trim(); if (t) { const a = kep(x.a); chu.push({ text: t, x: a[0], y: a[1], co, goc: 0 }); } continue; }
      if (x.loai !== 'kt' && x.loai !== 'chi') continue;
      const a = kep(x.a), b = kep(x.b), dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
      if (L < 4) continue;
      if (x.loai === 'kt') {
        let u = [dx / L, dy / L], goc = Math.atan2(u[1], u[0]) * 180 / Math.PI;
        if (goc <= -90 || goc > 90) { u = [-u[0], -u[1]]; goc = Math.atan2(u[1], u[0]) * 180 / Math.PI; }
        const n = [u[1], -u[0]], hh = rn(0.45 * co, 1);
        const v = x.lien ? layLien(x.lien) : null;
        const t = v !== null && v !== undefined ? chuSo(v) : (chuC(x.text).trim() || '?');
        net.push([a[0], a[1], b[0], b[1]], [rn(a[0] + n[0] * hh, 1), rn(a[1] + n[1] * hh, 1), rn(a[0] - n[0] * hh, 1), rn(a[1] - n[1] * hh, 1)], [rn(b[0] + n[0] * hh, 1), rn(b[1] + n[1] * hh, 1), rn(b[0] - n[0] * hh, 1), rn(b[1] - n[1] * hh, 1)]);
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        chu.push({ text: t, x: rn(mx + n[0] * 0.8 * co, 1), y: rn(my + n[1] * 0.8 * co, 1), co, goc: rn(goc, 1) + 0 });
      } else {
        const v = [-dx / L, -dy / L], dm = 0.9 * co, quay = d => { const r = d * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); return [v[0] * c - v[1] * s, v[0] * s + v[1] * c]; };
        net.push([a[0], a[1], b[0], b[1]]);
        for (const d of [26, -26]) { const q = quay(d); net.push([b[0], b[1], rn(b[0] + q[0] * dm, 1), rn(b[1] + q[1] * dm, 1)]); }
        const t = chuC(x.text).trim(); if (t) chu.push({ text: t, x: a[0], y: a[1], co, goc: 0 });
      }
    }
    return { co, net: net.map(d => d.map(z => z + 0)), chu };
  }

  /** Các số đo của một tường để chọn khi kẻ kích thước lên ảnh: [{ lien, nhan, gia }]. */
  function soCuaTuong(tho, i, Ph, phong) {
    const ds = [], t = (tho.tuong || [])[i]; if (!t) return ds;
    const ten = tenChiTiet(tho, Ph), dai = phong && phong.tuong[i] ? phong.tuong[i].dai : daiDo(t);
    ds.push({ lien: `tuong:${i}:dai`, nhan: `Dài tường ${t.ten}`, gia: dai > 0 ? dai : null });
    ds.push({ lien: `tuong:${i}:cao`, nhan: `Cao tường ${t.ten}`, gia: (so(t.cao) && t.cao > 0) ? t.cao : (so(tho.cao) && tho.cao > 0 ? tho.cao : null) });
    const O = { mo: ['rong', 'cao', 'cach', 'be'], can: ['rong', 'nho', 'cach', 'z0', 'z1'] };
    for (const nhom of ['mo', 'can', 'dn']) (tho[nhom] || []).forEach((x, j) => {
      if (!x || x.tuong !== i || !x.id) return;
      const ds0 = nhom === 'dn' ? ['cach', (Ph.LOAI_DN[x.loai] || {}).san ? 'ra' : 'cao'] : O[nhom];
      for (const o of ds0) {
        if (x.tu === 'phai' && o === 'cach') continue;      // đo từ góc phải: không liên kết "cách" (số trên ảnh khác số máy vẽ dùng)
        ds.push({ lien: `${nhom}:${x.id}:${o}`, nhan: `${ten[nhom][j].ten} ${TEN_O[o] || o}`, gia: so(x[o]) ? x[o] : null });
      }
    });
    return ds;
  }

  /** Dựng sẵn tường khi tạo phòng (3.2): chữ nhật = 4 tường re 90; chữ L = 6 tường, góc lồi ở cuối tường D; tự do = 3 tường trống. */
  function tuongMau(hinh, Ph) {
    const re = hinh === 'chu_l' ? [90, 90, 90, -90, 90, 90] : hinh === 'tu_do' ? [90, 90, 90] : [90, 90, 90, 90];
    return re.map((r, i) => ({ ten: Ph.tenTuong(i), dai: 0, re: r }));
  }

  return { GOI_BAN, TRAN, SO_MAX, rn, chuSo, soSai, boSoSai, docSo, suyTuong, phanTich, tinhGoi, veKe, veAnh, giaTriLien, tenChiTiet, thieuO, soCuaTuong, tuongMau, TEN_O };
});
