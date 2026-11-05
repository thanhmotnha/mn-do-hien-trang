'use strict';
// Soát dữ liệu điện thoại gửi lên (máy chủ không tin điện thoại). Sai → danh sách { truong, loi } (422). Đúng → bản SẠCH (chỉ các khoá biết).
const ID_DO = /^[a-z0-9]{6,40}$/, ID_CT = /^[a-z0-9]{1,12}$/, LIEN = /^(tuong|mo|can|dn):[a-z0-9]{1,12}:[a-z0-9_]{1,8}$/;
const HINH = ['chu_nhat', 'chu_l', 'tu_do'];
const SO_MAX = 100000;

function taoSoat() {
  const loi = [];
  const sai = (truong, l) => { if (loi.length < 50) loi.push({ truong, loi: l }); };
  const chu = (v, truong, max, batBuoc) => {
    if (v === undefined || v === null) { if (batBuoc) sai(truong, 'thiếu'); return ''; }
    if (typeof v !== 'string') { sai(truong, 'phải là chữ'); return ''; }
    if (v.length > max) { sai(truong, `dài quá ${max} ký tự`); return ''; }
    if (batBuoc && !v.trim()) sai(truong, 'trống');
    return v;
  };
  // số: null / undefined = chưa đo (giữ null); khác số hữu hạn → lỗi
  const so = (v, truong, min = -SO_MAX, max = SO_MAX) => {
    if (v === undefined || v === null) return null;
    if (typeof v !== 'number' || !isFinite(v)) { sai(truong, 'phải là số'); return null; }
    if (v < min || v > max) { sai(truong, `ngoài khoảng ${min} … ${max}`); return null; }
    return v;
  };
  return { loi, sai, chu, so };
}

/** Phòng thô + ảnh thô. Ph = mncf-phong (danh sách loại). */
function soatPhong(phong, anh, Ph) {
  const S = taoSoat(), { sai, chu, so } = S;
  if (!phong || typeof phong !== 'object' || Array.isArray(phong)) { sai('phong', 'thiếu số đo'); return { loi: S.loi }; }
  if (phong.ban !== undefined && phong.ban !== 1) sai('phong.ban', 'bản số đo lạ');
  const p = { ban: 1, ten: chu(phong.ten, 'phong.ten', 60), cao: so(phong.cao, 'phong.cao', 0), day: so(phong.day, 'phong.day', 10, 2000), hinh: HINH.includes(phong.hinh) ? phong.hinh : 'tu_do' };
  if (p.day === null) p.day = 110;
  const T = Array.isArray(phong.tuong) ? phong.tuong : null;
  if (!T || T.length < 1 || T.length > 40) sai('phong.tuong', 'cần 1 … 40 tường');
  p.tuong = (T || []).slice(0, 40).map((t, i) => {
    const f = `phong.tuong[${i}]`;
    if (!t || typeof t !== 'object') { sai(f, 'hỏng'); return { ten: '', dai: 0, re: 90 }; }
    const w = { ten: chu(t.ten, f + '.ten', 12, true), dai: so(t.dai, f + '.dai', 0), re: so(t.re, f + '.re', -360, 360) };
    if (w.dai === null) w.dai = 0;
    if (w.re === null) { if (t.re !== undefined && t.re !== null) { /* đã báo */ } w.re = 90; }
    if (t.cao !== undefined && t.cao !== null) { const c = so(t.cao, f + '.cao', 0); if (c > 0) w.cao = c; }
    if (t.dai_cu !== undefined && t.dai_cu !== null) { const c = so(t.dai_cu, f + '.dai_cu', 0); if (c > 0) w.dai_cu = c; }
    return w;
  });
  const nT = p.tuong.length;
  const nhom = (ten, loaiHop, oSo, them) => {
    const ds = phong[ten];
    if (ds === undefined || ds === null) return [];
    if (!Array.isArray(ds)) { sai('phong.' + ten, 'phải là danh sách'); return []; }
    if (ds.length > 200) { sai('phong.' + ten, 'quá 200 chi tiết'); return []; }
    const da = new Set();
    return ds.map((x, j) => {
      const f = `phong.${ten}[${j}]`;
      if (!x || typeof x !== 'object') { sai(f, 'hỏng'); return null; }
      const q = { id: typeof x.id === 'string' && ID_CT.test(x.id) ? x.id : '', tuong: x.tuong, loai: x.loai, tu: x.tu === 'phai' ? 'phai' : 'trai' };
      if (!q.id) sai(f + '.id', 'mã lạ'); else if (da.has(q.id)) sai(f + '.id', 'trùng mã'); da.add(q.id);
      if (!Number.isInteger(x.tuong) || x.tuong < 0 || x.tuong >= nT) sai(f + '.tuong', 'tường không có');
      if (!loaiHop[x.loai]) sai(f + '.loai', 'loại lạ');
      for (const [k, min] of oSo) q[k] = so(x[k], `${f}.${k}`, min);
      if (them) them(q, x, f);
      return q;
    }).filter(Boolean);
  };
  p.mo = nhom('mo', Ph.LOAI_MO, [['cach', -SO_MAX], ['rong', 0], ['cao', 0], ['be', 0]]);
  p.can = nhom('can', Ph.LOAI_CAN, [['cach', -SO_MAX], ['rong', 0], ['nho', 0], ['z0', 0], ['z1', 0]]);
  p.dn = nhom('dn', Ph.LOAI_DN, [['cach', -SO_MAX], ['cao', 0], ['ra', 0], ['rong', 0], ['cao_o', 0]], (q, x, f) => { const gh = chu(x.ghi, f + '.ghi', 40); if (gh) q.ghi = gh; });
  p.khung = [];
  // ảnh thô
  const A = anh === undefined || anh === null ? [] : anh, ra = [];
  if (!Array.isArray(A)) sai('anh', 'phải là danh sách');
  else if (A.length > 120) sai('anh', 'quá 120 ảnh');
  else {
    const da = new Set();
    A.forEach((a, i) => {
      const f = `anh[${i}]`;
      if (!a || typeof a !== 'object') return sai(f, 'hỏng');
      if (typeof a.id !== 'string' || !ID_DO.test(a.id)) return sai(f + '.id', 'mã ảnh lạ');
      if (da.has(a.id)) return sai(f + '.id', 'trùng mã'); da.add(a.id);
      const w = a.w, h = a.h;
      if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > 4096 || h > 4096) return sai(f, 'cỡ ảnh phải 1 … 4096 điểm ảnh');
      const tuong = a.tuong === null || a.tuong === undefined ? null : Number.isInteger(a.tuong) && a.tuong >= 0 && a.tuong < nT ? a.tuong : (sai(f + '.tuong', 'tường không có'), null);
      const K = a.ke === undefined || a.ke === null ? [] : a.ke;
      if (!Array.isArray(K) || K.length > 150) return sai(f + '.ke', 'tối đa 150 nét');
      const diem = (v, ff) => { if (!Array.isArray(v) || v.length !== 2 || !v.every(z => typeof z === 'number' && isFinite(z) && Math.abs(z) <= SO_MAX)) { sai(ff, 'điểm hỏng'); return [0, 0]; } return [v[0], v[1]]; };
      const ke = K.map((x, k) => {
        const ff = `${f}.ke[${k}]`;
        if (!x || typeof x !== 'object' || !['kt', 'chi', 'chu'].includes(x.loai)) { sai(ff, 'nét lạ'); return null; }
        const q = { loai: x.loai, a: diem(x.a, ff + '.a') };
        if (x.loai !== 'chu') q.b = diem(x.b, ff + '.b');
        const t = chu(x.text, ff + '.text', 80); if (t) q.text = t;
        if (x.lien !== undefined && x.lien !== null && x.lien !== '') { if (typeof x.lien === 'string' && LIEN.test(x.lien)) q.lien = x.lien; else sai(ff + '.lien', 'liên kết lạ'); }
        return q;
      }).filter(Boolean);
      ra.push({ id: a.id, tuong, w, h, ghi: chu(a.ghi, f + '.ghi', 200), ke });
    });
  }
  return { loi: S.loi, phong: p, anh: ra };
}

/** Thân PUT /api/phong/:id. */
function soatMuc(b, Ph) {
  const S = taoSoat();
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { loi: [{ truong: '', loi: 'thân phải là đối tượng JSON' }] };
  const ct = typeof b.ct === 'string' && ID_DO.test(b.ct) ? b.ct : (S.sai('ct', 'mã công trình lạ'), '');
  const ten = S.chu(b.ten, 'ten', 60, true).trim();
  if (b.xong !== undefined && typeof b.xong !== 'boolean') S.sai('xong', 'phải là đúng / sai');
  const ghi_chu = S.chu(b.ghi_chu, 'ghi_chu', 500);
  const rev = Number.isInteger(b.rev) && b.rev >= 0 ? b.rev : (S.sai('rev', 'thiếu số bản'), 0);
  const r = soatPhong(b.phong, b.anh, Ph);
  const loi = S.loi.concat(r.loi);
  if (loi.length) return { loi };
  r.phong.ten = ten;      // một tên: tên phòng = tên mục
  return { loi: [], muc: { ct, ten, xong: b.xong === true, ghi_chu, rev, ghi_de: b.ghi_de === true, phong: r.phong, anh: r.anh } };
}

const RE_NGAY = /^\d{4}-\d{2}-\d{2}$/;
function soatCongTrinh(b) {
  const S = taoSoat();
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { loi: [{ truong: '', loi: 'thân phải là đối tượng JSON' }] };
  const ten = S.chu(b.ten, 'ten', 80, true).trim(), dia_chi = S.chu(b.dia_chi, 'dia_chi', 200).trim(), nguoi_do = S.chu(b.nguoi_do, 'nguoi_do', 60).trim();
  const ngay = typeof b.ngay === 'string' && RE_NGAY.test(b.ngay) && !isNaN(Date.parse(b.ngay)) ? b.ngay : (S.sai('ngay', 'ngày phải dạng YYYY-MM-DD'), '');
  return S.loi.length ? { loi: S.loi } : { loi: [], ct: { ten, dia_chi, ngay, nguoi_do } };
}

module.exports = { soatPhong, soatMuc, soatCongTrinh, ID_DO };
