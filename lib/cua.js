/*!
 * cua.js — "Cửa & vách kính" của một công trình (bản 0.3.0, anh Thanh 08/11/2026: "Cửa cũng tự tay thêm vào nhé, mỗi công trình có cả
 * phần đo cửa nữa nhé", "Có đo cửa nhôm nữa mà, cửa nhôm cửa thông phòng, vách kính tắm"). Mục đích: ĐẶT HÀNG / SẢN XUẤT.
 * Danh sách RIÊNG của công trình, mỗi mục thợ tự thêm tay — KHÔNG gắn với lỗ cửa trong phòng, KHÔNG BAO GIỜ vào /api/do/* hay gói `gui`
 * của máy vẽ (bảng `cua` / `anh_cua` riêng, CSDL bản 3 — truy vấn của máy vẽ chỉ đọc `muc` / `anh`).
 * Hàm thuần (không giờ, không mạng): máy chủ dùng để SOÁT (không tin điện thoại) + tính số đặt hàng / cảnh báo + dựng phiếu;
 * điện thoại nạp /cua.js (window.MNDOCua) để xem trước cùng một phép tính.
 *
 * ── DẠNG MỘT MỤC (`cua`, thân PUT /api/cua/:id = { ct, rev, may?, ghi_de?, cua: <mục>, anh: [<ảnh>] }) ──────────────────────────
 * Số đo: mm, số hữu hạn ≥ 0, null = chưa đo. Ba điểm luôn là mảng 3 phần tử (gửi ít hơn thì máy chủ bù null).
 * {
 *   nhom: 'go' | 'nhom' | 'kinh',         // cửa gỗ thông phòng · cửa nhôm – cửa sổ nhôm · vách kính tắm (BẮT BUỘC)
 *   ky_hieu: 'D1',                         // tự đặt theo nhóm (KY_DAU: go D, nhom N, kinh K), sửa được; 1 … 12 ký tự (BẮT BUỘC)
 *   vi_tri: 'WC tầng 2',                   // ≤ 80
 *   so_luong: 1,                           // số nguyên 1 … 99 (thiếu = 1)
 *   rong: [trên, giữa, dưới],              // lọt lòng ô chờ — số ĐẶT HÀNG = số nhỏ nhất (kính: bỏ trống, đo theo từng mặt `kinh.mat`)
 *   cao:  [trái, giữa, phải],
 *   cheo: [chéo 1, chéo 2],                // tuỳ chọn
 *   chat_lieu (≤ 80), mau (≤ 60), phu_kien (≤ 200), ghi_chu (≤ 500): chữ tự do,
 *   xong: true | false,                    // trạng thái "đo xong"
 *   go:   { day_tuong: [đầu 1, đầu 2], san: 'da_lat' | 'chua_lat' | null, cot_san: mm sàn hoàn thiện sẽ cao thêm | null,
 *           kieu: 'mot_canh' | 'hai_canh' | 'me_con' | 'lua' | 'xep' | 'khac' | null, kieu_khac: chữ ≤ 40,
 *           ban_le: 'trai' | 'phai' | null, mo: 'vao' | 'ra' | null,     // ĐỨNG NGOÀI NHÌN VÀO (cửa quay)
 *           lua: 'trai' | 'phai' | null,                              // cửa lùa / xếp: cánh chạy về phía nào (đứng ngoài nhìn vào)
 *           op_chi: 1 | 2 | null },                                    // ốp chỉ 1 mặt / 2 mặt
 *   nhom_ct: { loai: 'cua_di' | 'cua_so' | 'vach' | null, be: mm sàn → mép dưới (cửa sổ) | null, day_tuong: [a, b],
 *           lap: 'trong' | 'giua' | 'ngoai' | null,                   // khuôn sát mặt trong / giữa / sát mặt ngoài tường
 *           he: chữ ≤ 40 (gợi ý HE_NHOM), kieu_mo: 'quay' | 'hat' | 'lua' | 'xep' | 'co_dinh' | null, so_canh: 0 … 12 | null,
 *           ban_le: 'trai' | 'phai' | null, mo: 'vao' | 'ra' | null,   // đứng ngoài nhìn vào
 *           kinh_day: mm | null, kinh_loai: 'thuong' | 'cuong_luc' | 'dan' | 'hop' | null,
 *           fix: 'khong' | 'tren' | 'duoi' | 'ca_hai' | null, fix_tren: mm | null, fix_duoi: mm | null,
 *           tang_cao: true | false, tang_ghi: chữ ≤ 80 (vd "tầng 5, cần giàn") },
 *   kinh: { dang: 'thang' | 'goc_l' | 'chu_u' | 'lua' | null,
 *           mat: [{ rong: [trên, giữa, dưới], cao: [trái, giữa, phải] }],   // 0 … 3 mặt
 *           nghieng: { trai: mm lệch đỉnh – chân | null, phai: … },          // tường hai bên có thẳng đứng không
 *           bac: { co: true | false | null, cao: mm | null, rong: mm | null }, // gờ / bậc chắn nước
 *           doc: chữ ≤ 80 (sàn dốc về đâu),
 *           cua: { kieu: 'quay' | 'lua' | 'khong' | null, rong: mm | null, mo: 'ra' | 'vao' | null,
 *                  ban_le_ben: 'trai' | 'phai' | null, ban_le: 'kinh_tuong' | 'kinh_kinh' | null },
 *           kinh_day: mm | null (thiếu = 10), kinh_loai: 'trong' | 'mo' | null, pk_mau: 'inox' | 'den' | 'vang' | 'khac' | null,
 *           vat: chữ ≤ 300 (vòi sen / ổ điện / ống nước gần mép kính — cách mép bao nhiêu, để tránh khoan) }
 * }
 * (Khối riêng của cửa nhôm tên `nhom_ct` vì `nhom` đã là tên nhóm.) Chỉ khối của ĐÚNG nhóm được giữ (gửi `go` cho mục nhóm 'kinh' thì máy chủ bỏ). Khoá lạ bị bỏ.
 * Ảnh: [{ id, w, h, ghi (≤ 200), ke: [{ loai 'kt' | 'chi' | 'chu', a: [x, y], b?, text?, lien? }] }] (≤ 40 ảnh, ≤ 150 nét) —
 * `lien` = đường tới ô số của CHÍNH mục đó: 'rong.0' … 'cao.2', 'cheo.1', 'go.day_tuong.0', 'go.cot_san', 'nhom_ct.be', 'nhom_ct.fix_tren',
 * 'kinh.mat.1.rong.2', 'kinh.nghieng.trai', 'kinh.bac.cao', 'kinh.cua.rong'… (danh sách: lienCua(nhom)). Đường đúng dạng mà không thuộc
 * nhóm hiện tại (đổi nhóm sau khi gắn) thì bỏ liên kết, giữ số trên ảnh; sai dạng → 422.
 * Tệp ảnh: PUT /api/anh/<id> với tiêu đề `X-Cua: <id mục>` (thay `X-Phong`).
 *
 * ── TÍNH (`tinh(cua)`, máy chủ trả kèm mỗi mục — không lưu, đổi ngưỡng là áp ngay) ──────────────────────────────────────────────
 * { rong: { min, so: [3], lech } | null, cao: …, cheo_lech, mat: [{ rong, cao }] (kính), cao_dat (gỗ, sàn chưa lát: cao − cốt sàn),
 *   canh_bao: [{ muc: 'do' | 'vang' | 'ghi', truong, loi }], muc: 'do' | 'vang' | 'ok' }
 * Ngưỡng [CĐ — chưa hỏi xưởng]: NGUONG.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MNDOCua = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const SO_MAX = 100000, ANH_MAX = 40, KE_MAX = 150, CUA_MAX_CT = 300;
  const ID_DO = /^[a-z0-9]{6,40}$/, KY = /^[\p{L}\p{N} ._/#-]{1,12}$/u, LIEN_DANG = /^[a-z_]{2,12}(\.[a-z0-9_]{1,12}){0,4}$/;
  const NHOM = ['go', 'nhom', 'kinh'];
  const NHOM_TEN = { go: 'Cửa gỗ thông phòng', nhom: 'Cửa nhôm – cửa sổ nhôm', kinh: 'Vách kính tắm' };
  const KY_DAU = { go: 'D', nhom: 'N', kinh: 'K' };
  const HE_NHOM = ['Xingfa', 'PMI', 'Việt Pháp', 'Topal', 'Euro'];
  // [CĐ] mọi ngưỡng: chưa hỏi xưởng / nhà cung cấp
  const NGUONG = {
    lech_vang: 5, lech_do: 15,          // chênh giữa 3 điểm đo (ô xéo / không vuông)
    cheo_vang: 5, cheo_do: 15,
    nghieng_vang: 5,                    // tường cạnh vách kính lệch đỉnh – chân
    day_tuong: [60, 400], day_lech: 10,
    cot_san_max: 150,
    go: { rong: [500, 1600], rong_rong: 2400, cao: [1800, 3000] },
    nhom: { rong: [300, 6000], cao: [300, 3500] },
    kinh: { rong: [200, 2000], cao: [1700, 2600], cua_rong: [500, 1000], day: [8, 10, 12] },
    vo_ly: 10,                          // số > 10 × trần khoảng → đỏ (gõ thừa số 0?)
  };
  const MAT_CAN = { thang: 1, goc_l: 2, chu_u: 3, lua: 1 };
  const E = {
    go_kieu: ['mot_canh', 'hai_canh', 'me_con', 'lua', 'xep', 'khac'], ben: ['trai', 'phai'], mo: ['vao', 'ra'], san: ['da_lat', 'chua_lat'],
    nhom_loai: ['cua_di', 'cua_so', 'vach'], lap: ['trong', 'giua', 'ngoai'], kieu_mo: ['quay', 'hat', 'lua', 'xep', 'co_dinh'],
    kinh_loai_nhom: ['thuong', 'cuong_luc', 'dan', 'hop'], fix: ['khong', 'tren', 'duoi', 'ca_hai'],
    dang: ['thang', 'goc_l', 'chu_u', 'lua'], cua_kinh: ['quay', 'lua', 'khong'], mo_kinh: ['ra', 'vao'], ban_le_kinh: ['kinh_tuong', 'kinh_kinh'],
    kinh_loai: ['trong', 'mo'], pk_mau: ['inox', 'den', 'vang', 'khac'],
  };
  const TEN = {
    mot_canh: '1 cánh', hai_canh: '2 cánh đều', me_con: 'mẹ con', lua: 'lùa', xep: 'xếp', khac: 'khác',
    cua_di: 'cửa đi', cua_so: 'cửa sổ', vach: 'vách cố định', trong: 'sát mặt trong', giua: 'giữa tường', ngoai: 'sát mặt ngoài',
    quay: 'mở quay', hat: 'mở hất', co_dinh: 'cố định', thuong: 'thường', cuong_luc: 'cường lực', dan: 'dán an toàn', hop: 'hộp',
    thang: 'thẳng 1 mặt', goc_l: 'góc L (2 mặt)', chu_u: 'chữ U (3 mặt)', kinh_tuong: 'kính – tường', kinh_kinh: 'kính – kính',
    inox: 'inox 304', den: 'màu đen', vang: 'màu vàng',
  };

  /* ---------- soát ---------- */
  function taoSoat() {
    const loi = [];
    const sai = (truong, l) => { if (loi.length < 50) loi.push({ truong, loi: l }); };
    const chu = (v, truong, max, batBuoc) => {
      if (v === undefined || v === null) { if (batBuoc) sai(truong, 'thiếu'); return ''; }
      if (typeof v !== 'string') { sai(truong, 'phải là chữ'); return ''; }
      if (v.length > max) { sai(truong, `dài quá ${max} ký tự`); return ''; }
      if (batBuoc && !v.trim()) sai(truong, 'trống');
      return v.trim();
    };
    const so = (v, truong, min = 0, max = SO_MAX) => {
      if (v === undefined || v === null) return null;
      if (typeof v !== 'number' || !isFinite(v)) { sai(truong, 'phải là số'); return null; }
      if (v < min || v > max) { sai(truong, `ngoài khoảng ${min} … ${max}`); return null; }
      return v;
    };
    const mang = (v, truong, n) => {
      if (v === undefined || v === null) return new Array(n).fill(null);
      if (!Array.isArray(v) || v.length > n) { sai(truong, `phải là danh sách tối đa ${n} số`); return new Array(n).fill(null); }
      const r = []; for (let i = 0; i < n; i++) r.push(so(v[i], `${truong}[${i}]`)); return r;
    };
    const chon = (v, truong, ds) => {
      if (v === undefined || v === null || v === '') return null;
      if (!ds.includes(v)) { sai(truong, 'giá trị lạ'); return null; }
      return v;
    };
    const dung = (v, truong) => { if (v === undefined || v === null) return false; if (typeof v !== 'boolean') { sai(truong, 'phải là đúng / sai'); return false; } return v; };
    const doiTuong = (v, truong) => { if (v === undefined || v === null) return {}; if (typeof v !== 'object' || Array.isArray(v)) { sai(truong, 'phải là đối tượng'); return {}; } return v; };
    return { loi, sai, chu, so, mang, chon, dung, doiTuong };
  }

  /** Các đường `lien` hợp lệ cho một nhóm. */
  function lienCua(nhom) {
    const s = new Set();
    if (nhom !== 'kinh') { for (let i = 0; i < 3; i++) { s.add('rong.' + i); s.add('cao.' + i); } s.add('cheo.0'); s.add('cheo.1'); }
    if (nhom === 'go') { s.add('go.day_tuong.0'); s.add('go.day_tuong.1'); s.add('go.cot_san'); }
    if (nhom === 'nhom') { for (const k of ['be', 'fix_tren', 'fix_duoi', 'kinh_day']) s.add('nhom_ct.' + k); s.add('nhom_ct.day_tuong.0'); s.add('nhom_ct.day_tuong.1'); }
    if (nhom === 'kinh') {
      for (let m = 0; m < 3; m++) for (let i = 0; i < 3; i++) { s.add(`kinh.mat.${m}.rong.${i}`); s.add(`kinh.mat.${m}.cao.${i}`); }
      for (const k of ['nghieng.trai', 'nghieng.phai', 'bac.cao', 'bac.rong', 'cua.rong', 'kinh_day']) s.add('kinh.' + k);
    }
    return s;
  }

  function soatGo(x, S, f) {
    const g = S.doiTuong(x, f);
    return {
      day_tuong: S.mang(g.day_tuong, f + '.day_tuong', 2), san: S.chon(g.san, f + '.san', E.san), cot_san: S.so(g.cot_san, f + '.cot_san', 0, 1000),
      kieu: S.chon(g.kieu, f + '.kieu', E.go_kieu), kieu_khac: S.chu(g.kieu_khac, f + '.kieu_khac', 40),
      ban_le: S.chon(g.ban_le, f + '.ban_le', E.ben), mo: S.chon(g.mo, f + '.mo', E.mo), lua: S.chon(g.lua, f + '.lua', E.ben),
      op_chi: g.op_chi === undefined || g.op_chi === null ? null : g.op_chi === 1 || g.op_chi === 2 ? g.op_chi : (S.sai(f + '.op_chi', 'chỉ 1 hoặc 2 mặt'), null),
    };
  }
  function soatNhom(x, S, f) {
    const g = S.doiTuong(x, f);
    const so_canh = g.so_canh === undefined || g.so_canh === null ? null : Number.isInteger(g.so_canh) && g.so_canh >= 0 && g.so_canh <= 12 ? g.so_canh : (S.sai(f + '.so_canh', 'số cánh 0 … 12'), null);
    return {
      loai: S.chon(g.loai, f + '.loai', E.nhom_loai), be: S.so(g.be, f + '.be'), day_tuong: S.mang(g.day_tuong, f + '.day_tuong', 2),
      lap: S.chon(g.lap, f + '.lap', E.lap), he: S.chu(g.he, f + '.he', 40), kieu_mo: S.chon(g.kieu_mo, f + '.kieu_mo', E.kieu_mo), so_canh,
      ban_le: S.chon(g.ban_le, f + '.ban_le', E.ben), mo: S.chon(g.mo, f + '.mo', E.mo),
      kinh_day: S.so(g.kinh_day, f + '.kinh_day', 0, 100), kinh_loai: S.chon(g.kinh_loai, f + '.kinh_loai', E.kinh_loai_nhom),
      fix: S.chon(g.fix, f + '.fix', E.fix), fix_tren: S.so(g.fix_tren, f + '.fix_tren'), fix_duoi: S.so(g.fix_duoi, f + '.fix_duoi'),
      tang_cao: S.dung(g.tang_cao, f + '.tang_cao'), tang_ghi: S.chu(g.tang_ghi, f + '.tang_ghi', 80),
    };
  }
  function soatKinh(x, S, f) {
    const g = S.doiTuong(x, f);
    let mat = [];
    if (g.mat !== undefined && g.mat !== null) {
      if (!Array.isArray(g.mat) || g.mat.length > 3) S.sai(f + '.mat', 'tối đa 3 mặt');
      else mat = g.mat.map((m, i) => { const o = S.doiTuong(m, `${f}.mat[${i}]`); return { rong: S.mang(o.rong, `${f}.mat[${i}].rong`, 3), cao: S.mang(o.cao, `${f}.mat[${i}].cao`, 3) }; });
    }
    const ng = S.doiTuong(g.nghieng, f + '.nghieng'), bac = S.doiTuong(g.bac, f + '.bac'), cua = S.doiTuong(g.cua, f + '.cua');
    return {
      dang: S.chon(g.dang, f + '.dang', E.dang), mat,
      nghieng: { trai: S.so(ng.trai, f + '.nghieng.trai', 0, 1000), phai: S.so(ng.phai, f + '.nghieng.phai', 0, 1000) },
      bac: { co: bac.co === undefined || bac.co === null ? null : S.dung(bac.co, f + '.bac.co'), cao: S.so(bac.cao, f + '.bac.cao'), rong: S.so(bac.rong, f + '.bac.rong') },
      doc: S.chu(g.doc, f + '.doc', 80),
      cua: { kieu: S.chon(cua.kieu, f + '.cua.kieu', E.cua_kinh), rong: S.so(cua.rong, f + '.cua.rong'), mo: S.chon(cua.mo, f + '.cua.mo', E.mo_kinh),
        ban_le_ben: S.chon(cua.ban_le_ben, f + '.cua.ban_le_ben', E.ben), ban_le: S.chon(cua.ban_le, f + '.cua.ban_le', E.ban_le_kinh) },
      kinh_day: g.kinh_day === undefined || g.kinh_day === null ? 10 : S.so(g.kinh_day, f + '.kinh_day', 0, 100),
      kinh_loai: S.chon(g.kinh_loai, f + '.kinh_loai', E.kinh_loai), pk_mau: S.chon(g.pk_mau, f + '.pk_mau', E.pk_mau),
      vat: S.chu(g.vat, f + '.vat', 300),
    };
  }

  function soatAnh(A, nhom, S) {
    const ra = [];
    if (A === undefined || A === null) return ra;
    if (!Array.isArray(A)) { S.sai('anh', 'phải là danh sách'); return ra; }
    if (A.length > ANH_MAX) { S.sai('anh', `quá ${ANH_MAX} ảnh một mục`); return ra; }
    const da = new Set(), hop = lienCua(nhom);
    A.forEach((a, i) => {
      const f = `anh[${i}]`;
      if (!a || typeof a !== 'object') return S.sai(f, 'hỏng');
      if (typeof a.id !== 'string' || !ID_DO.test(a.id)) return S.sai(f + '.id', 'mã ảnh lạ');
      if (da.has(a.id)) return S.sai(f + '.id', 'trùng mã'); da.add(a.id);
      const w = a.w, h = a.h;
      if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > 4096 || h > 4096) return S.sai(f, 'cỡ ảnh phải 1 … 4096 điểm ảnh');
      const K = a.ke === undefined || a.ke === null ? [] : a.ke;
      if (!Array.isArray(K) || K.length > KE_MAX) return S.sai(f + '.ke', `tối đa ${KE_MAX} nét`);
      const diem = (v, ff) => { if (!Array.isArray(v) || v.length !== 2 || !v.every(z => typeof z === 'number' && isFinite(z) && Math.abs(z) <= SO_MAX)) { S.sai(ff, 'điểm hỏng'); return [0, 0]; } return [v[0], v[1]]; };
      const ke = K.map((x, k) => {
        const ff = `${f}.ke[${k}]`;
        if (!x || typeof x !== 'object' || !['kt', 'chi', 'chu'].includes(x.loai)) { S.sai(ff, 'nét lạ'); return null; }
        const q = { loai: x.loai, a: diem(x.a, ff + '.a') };
        if (x.loai !== 'chu') q.b = diem(x.b, ff + '.b');
        const t = S.chu(x.text, ff + '.text', 80); if (t) q.text = t;
        if (x.lien !== undefined && x.lien !== null && x.lien !== '') {
          if (typeof x.lien !== 'string' || !LIEN_DANG.test(x.lien)) S.sai(ff + '.lien', 'liên kết lạ');
          else if (hop.has(x.lien)) q.lien = x.lien;      // đúng dạng mà không thuộc nhóm này (vừa đổi nhóm): bỏ liên kết, giữ số trên ảnh
        }
        return q;
      }).filter(Boolean);
      ra.push({ id: a.id, w, h, ghi: S.chu(a.ghi, f + '.ghi', 200), ke });
    });
    return ra;
  }

  /** Thân PUT /api/cua/:id → { loi } | { loi: [], muc: { ct, rev, may, ghi_de, cua, anh } }. */
  function soatCua(b) {
    const S = taoSoat();
    if (!b || typeof b !== 'object' || Array.isArray(b)) return { loi: [{ truong: '', loi: 'thân phải là đối tượng JSON' }] };
    const ct = typeof b.ct === 'string' && ID_DO.test(b.ct) ? b.ct : (S.sai('ct', 'mã công trình lạ'), '');
    const rev = Number.isInteger(b.rev) && b.rev >= 0 ? b.rev : (S.sai('rev', 'thiếu số bản'), 0);
    const x = b.cua;
    if (!x || typeof x !== 'object' || Array.isArray(x)) { S.sai('cua', 'thiếu số đo cửa'); return { loi: S.loi }; }
    const nhom = NHOM.includes(x.nhom) ? x.nhom : (S.sai('cua.nhom', 'nhóm phải là go / nhom / kinh'), 'go');
    const ky = S.chu(x.ky_hieu, 'cua.ky_hieu', 12, true);
    if (ky && !KY.test(ky)) S.sai('cua.ky_hieu', 'ký hiệu chỉ gồm chữ, số, dấu cách . _ / # -');
    const sl = x.so_luong === undefined || x.so_luong === null ? 1 : Number.isInteger(x.so_luong) && x.so_luong >= 1 && x.so_luong <= 99 ? x.so_luong : (S.sai('cua.so_luong', 'số lượng 1 … 99'), 1);
    const c = {
      nhom, ky_hieu: ky, vi_tri: S.chu(x.vi_tri, 'cua.vi_tri', 80), so_luong: sl,
      rong: S.mang(x.rong, 'cua.rong', 3), cao: S.mang(x.cao, 'cua.cao', 3), cheo: S.mang(x.cheo, 'cua.cheo', 2),
      chat_lieu: S.chu(x.chat_lieu, 'cua.chat_lieu', 80), mau: S.chu(x.mau, 'cua.mau', 60), phu_kien: S.chu(x.phu_kien, 'cua.phu_kien', 200),
      ghi_chu: S.chu(x.ghi_chu, 'cua.ghi_chu', 500), xong: S.dung(x.xong, 'cua.xong'),
    };
    if (nhom === 'kinh') { c.rong = [null, null, null]; c.cao = [null, null, null]; c.cheo = [null, null]; }      // kính đo theo từng mặt
    if (nhom === 'go') c.go = soatGo(x.go, S, 'cua.go');
    else if (nhom === 'nhom') c.nhom_ct = soatNhom(x.nhom_ct, S, 'cua.nhom_ct');
    else c.kinh = soatKinh(x.kinh, S, 'cua.kinh');
    const anh = soatAnh(b.anh, nhom, S);
    if (S.loi.length) return { loi: S.loi };
    const may = typeof b.may === 'string' && ID_DO.test(b.may) ? b.may : '';
    return { loi: [], muc: { ct, rev, may, ghi_de: b.ghi_de === true, cua: c, anh } };
  }

  /* ---------- tính số đặt hàng + cảnh báo ---------- */
  const g = v => String(Math.round(v * 10) / 10).replace('.', ',');
  function ba(arr) {
    const so = (arr || []).filter(v => typeof v === 'number' && v > 0);
    if (!so.length) return null;
    const min = Math.min(...so), max = Math.max(...so);
    return { min, so: (arr || []).slice(), lech: Math.round((max - min) * 10) / 10, n: so.length };
  }
  function tinh(c) {
    const cb = [], add = (muc, truong, loi) => cb.push({ muc, truong, loi });
    const N = NGUONG, ra = { rong: null, cao: null, cheo_lech: null, canh_bao: cb };
    const kiemBa = (arr, truong, ten, khoang, viDiem) => {
      if ((arr || []).some(v => v === 0)) add('do', truong, `${ten} có số 0 — gõ lại hoặc để trống.`);
      const r = ba(arr);
      if (!r) { add('vang', truong, `Chưa đo ${ten.toLowerCase()}.`); return null; }
      if (r.n < 3) add('ghi', truong, `${ten}: mới đo ${r.n}/3 điểm (${viDiem}) — đo đủ 3 điểm để biết ô có xéo không.`);
      if (r.lech > N.lech_do) add('do', truong, `${ten} lệch ${g(r.lech)} mm giữa các điểm đo — ô xéo / không vuông, kiểm lại trước khi đặt; đặt hàng theo số nhỏ nhất ${g(r.min)}.`);
      else if (r.lech > N.lech_vang) add('vang', truong, `${ten} lệch ${g(r.lech)} mm giữa các điểm đo — ô hơi xéo; đặt hàng theo số nhỏ nhất ${g(r.min)}.`);
      if (khoang) {
        const [lo, hi] = khoang, mx = Math.max(...r.so.filter(v => typeof v === 'number'));
        if (mx > hi * N.vo_ly) add('do', truong, `${ten} ${g(mx)} mm — số lạ (gõ thừa số 0?).`);
        else if (r.min < lo || r.min > hi) add('vang', truong, `${ten} ${g(r.min)} mm ngoài khoảng thường gặp ${lo} … ${hi} — kiểm lại.`);
      }
      return r;
    };
    const kiemTuong = (dt, truong) => {
      const so = (dt || []).filter(v => typeof v === 'number' && v > 0);
      if (!so.length) { add('vang', truong, 'Chưa đo dày tường (đã trát).'); return; }
      for (const v of so) {
        if (v > N.day_tuong[1] * N.vo_ly) add('do', truong, `Dày tường ${g(v)} mm — số lạ.`);
        else if (v < N.day_tuong[0] || v > N.day_tuong[1]) add('vang', truong, `Dày tường ${g(v)} mm ngoài khoảng thường gặp ${N.day_tuong[0]} … ${N.day_tuong[1]}.`);
      }
      if (so.length === 2 && Math.abs(so[0] - so[1]) > N.day_lech) add('vang', truong, `Tường dày không đều (${g(so[0])} / ${g(so[1])}) — khuôn / ốp chỉ làm theo số lớn hơn.`);
    };
    const kiemCheo = ch => {
      const so = (ch || []).filter(v => typeof v === 'number' && v > 0);
      if (so.length !== 2) return;
      const d = Math.abs(so[0] - so[1]); ra.cheo_lech = Math.round(d * 10) / 10;
      if (d > N.cheo_do) add('do', 'cheo', `Hai đường chéo lệch ${g(d)} mm — ô không vuông.`);
      else if (d > N.cheo_vang) add('vang', 'cheo', `Hai đường chéo lệch ${g(d)} mm — ô hơi lệch vuông.`);
    };
    if (c.nhom === 'go') {
      const G = c.go || {}, rongTo = ['hai_canh', 'me_con', 'lua', 'xep'].includes(G.kieu);
      ra.rong = kiemBa(c.rong, 'rong', 'Rộng', [N.go.rong[0], rongTo ? N.go.rong_rong : N.go.rong[1]], 'trên / giữa / dưới');
      ra.cao = kiemBa(c.cao, 'cao', 'Cao', N.go.cao, 'trái / giữa / phải');
      kiemCheo(c.cheo); kiemTuong(G.day_tuong, 'go.day_tuong');
      if (!G.san) add('vang', 'go.san', 'Chưa ghi sàn đã lát hay chưa.');
      else if (G.san === 'chua_lat') {
        if (G.cot_san === null || G.cot_san === undefined) add('vang', 'go.cot_san', 'Sàn chưa lát: chưa có cốt sàn hoàn thiện — cao đặt hàng phải trừ phần sàn sẽ lát thêm.');
        else {
          if (G.cot_san > N.cot_san_max) add('vang', 'go.cot_san', `Cốt sàn hoàn thiện ${g(G.cot_san)} mm — lớn bất thường, kiểm lại.`);
          if (ra.cao) { ra.cao_dat = Math.round((ra.cao.min - G.cot_san) * 10) / 10; add('vang', 'go.cot_san', `Sàn chưa lát: cao đặt hàng = ${g(ra.cao.min)} − ${g(G.cot_san)} = ${g(ra.cao_dat)} (đã trừ cốt sàn hoàn thiện).`); }
        }
      }
      if (!G.kieu) add('vang', 'go.kieu', 'Chưa chọn kiểu cửa.');
      else if (G.kieu === 'lua' || G.kieu === 'xep') { if (!G.lua) add('vang', 'go.lua', 'Chưa chọn lùa / xếp về phía nào.'); }
      else if (G.kieu !== 'khac' && (!G.ban_le || !G.mo)) add('vang', 'go.mo', 'Chưa chọn chiều mở (bản lề trái / phải, mở vào / ra — đứng ngoài nhìn vào).');
      if (!G.op_chi) add('vang', 'go.op_chi', 'Chưa chọn ốp chỉ 1 mặt hay 2 mặt.');
    } else if (c.nhom === 'nhom') {
      const G = c.nhom_ct || {};
      ra.rong = kiemBa(c.rong, 'rong', 'Rộng', N.nhom.rong, 'trên / giữa / dưới');
      ra.cao = kiemBa(c.cao, 'cao', 'Cao', N.nhom.cao, 'trái / giữa / phải');
      kiemCheo(c.cheo); kiemTuong(G.day_tuong, 'nhom_ct.day_tuong');
      if (!G.loai) add('vang', 'nhom_ct.loai', 'Chưa chọn cửa đi / cửa sổ / vách cố định.');
      if (G.loai === 'cua_so' && (G.be === null || G.be === undefined)) add('vang', 'nhom_ct.be', 'Cửa sổ: chưa đo bệ (sàn → mép dưới ô).');
      if (!G.lap) add('vang', 'nhom_ct.lap', 'Chưa chọn vị trí lắp khuôn trong tường (sát trong / giữa / sát ngoài).');
      if (!G.kieu_mo) add('vang', 'nhom_ct.kieu_mo', 'Chưa chọn kiểu mở.');
      else if ((G.kieu_mo === 'quay' || G.kieu_mo === 'hat') && (!G.mo || (G.kieu_mo === 'quay' && !G.ban_le))) add('vang', 'nhom_ct.mo', 'Chưa chọn chiều mở (đứng ngoài nhìn vào).');
      if (G.kinh_day === null || G.kinh_day === undefined || !G.kinh_loai) add('ghi', 'nhom_ct.kinh', 'Chưa ghi kính (gợi ý: 8 mm cường lực).');
      if (G.loai === 'cua_di' && G.kinh_loai === 'thuong') add('vang', 'nhom_ct.kinh_loai', 'Cửa đi dùng kính thường — nên cường lực / dán an toàn.');
      if (G.fix && G.fix !== 'khong') {
        const can = (G.fix === 'tren' || G.fix === 'ca_hai' ? ['fix_tren'] : []).concat(G.fix === 'duoi' || G.fix === 'ca_hai' ? ['fix_duoi'] : []);
        if (can.some(k => G[k] === null || G[k] === undefined)) add('vang', 'nhom_ct.fix', 'Có ô fix mà chưa đo cao ô fix.');
        const tong = can.reduce((s, k) => s + (G[k] || 0), 0);
        if (ra.cao && tong >= ra.cao.min) add('do', 'nhom_ct.fix', `Ô fix cao ${g(tong)} ≥ cao cả ô ${g(ra.cao.min)}.`);
      }
      if (G.tang_cao) add('ghi', 'nhom_ct.tang_cao', 'Lắp ở tầng cao / ngoài trời — cần giàn' + (G.tang_ghi ? ` (${G.tang_ghi})` : '') + '.');
    } else {
      const G = c.kinh || {}, mat = G.mat || [];
      ra.mat = mat.map((m, i) => ({
        rong: kiemBa(m.rong, `kinh.mat.${i}.rong`, `Mặt ${i + 1} rộng`, N.kinh.rong, 'trên / giữa / dưới'),
        cao: kiemBa(m.cao, `kinh.mat.${i}.cao`, `Mặt ${i + 1} cao`, N.kinh.cao, 'trái / giữa / phải'),
      }));
      if (!G.dang) add('vang', 'kinh.dang', 'Chưa chọn dạng vách (thẳng / góc L / chữ U / cửa lùa).');
      else if (mat.length !== MAT_CAN[G.dang]) add('vang', 'kinh.mat', `Dạng ${TEN[G.dang] || G.dang} cần ${MAT_CAN[G.dang]} mặt, đang có ${mat.length}.`);
      for (const b of ['trai', 'phai']) {
        const v = G.nghieng && G.nghieng[b];
        if (typeof v === 'number' && v > N.nghieng_vang) add('vang', 'kinh.nghieng.' + b, `Tường ${b === 'trai' ? 'trái' : 'phải'} nghiêng ${g(v)} mm (đỉnh – chân) — kính cắt theo số nhỏ / dùng nẹp U bù.`);
      }
      if (G.bac && G.bac.co === true && (G.bac.cao === null || G.bac.rong === null)) add('vang', 'kinh.bac', 'Có gờ chắn nước mà chưa đo cao / rộng gờ.');
      if (G.bac && G.bac.co === null) add('ghi', 'kinh.bac', 'Chưa ghi có gờ / bậc chắn nước không.');
      const C = G.cua || {};
      if (C.kieu === 'quay') {
        if (C.mo === 'vao') add('vang', 'kinh.cua.mo', 'Cửa kính mở VÀO trong — nước nhỏ ra sàn khi mở; nên mở ra ngoài.');
        if (!C.mo) add('vang', 'kinh.cua.mo', 'Chưa chọn chiều mở cửa kính.');
        if (!C.ban_le || !C.ban_le_ben) add('vang', 'kinh.cua.ban_le', 'Chưa chọn bản lề (kính – tường / kính – kính, bên trái / phải).');
      }
      if (C.kieu && C.kieu !== 'khong') {
        if (C.rong === null || C.rong === undefined) add('vang', 'kinh.cua.rong', 'Chưa ghi rộng cánh cửa kính.');
        else if (C.rong < N.kinh.cua_rong[0] || C.rong > N.kinh.cua_rong[1]) add('vang', 'kinh.cua.rong', `Cánh cửa kính rộng ${g(C.rong)} ngoài khoảng thường gặp ${N.kinh.cua_rong[0]} … ${N.kinh.cua_rong[1]}.`);
      }
      if (typeof G.kinh_day === 'number' && !N.kinh.day.includes(G.kinh_day)) add('vang', 'kinh.kinh_day', `Kính dày ${g(G.kinh_day)} mm — vách tắm thường 8 / 10 / 12 mm cường lực.`);
      if (!G.vat) add('ghi', 'kinh.vat', 'Chưa ghi vị trí vòi sen / ổ điện / ống nước gần mép kính (để tránh khoan).');
    }
    if (c.xong && cb.some(x => x.muc === 'do')) add('vang', 'xong', 'Đã đánh dấu đo xong mà còn lỗi đỏ.');
    ra.muc = cb.some(x => x.muc === 'do') ? 'do' : cb.some(x => x.muc === 'vang') ? 'vang' : 'ok';
    return ra;
  }

  /** Cảnh báo cấp danh sách (trùng ký hiệu trong cùng nhóm). ds = [{ id, cua }] → Map id → [cảnh báo]. */
  function kiemDs(ds) {
    const dem = new Map(), ra = new Map();
    for (const x of ds) { const k = x.cua.nhom + '|' + x.cua.ky_hieu.toLowerCase(); dem.set(k, (dem.get(k) || 0) + 1); }
    for (const x of ds) if (dem.get(x.cua.nhom + '|' + x.cua.ky_hieu.toLowerCase()) > 1) ra.set(x.id, [{ muc: 'vang', truong: 'ky_hieu', loi: `Trùng ký hiệu ${x.cua.ky_hieu} với mục khác cùng nhóm.` }]);
    return ra;
  }

  /* ---------- phiếu đo cửa (đặt hàng) ---------- */
  const so3 = (r, arr) => !r ? '' : `${g(r.min)} (${(arr || r.so).map(v => typeof v === 'number' ? g(v) : '–').join(' / ')})`;
  const xep = (a, b) => NHOM.indexOf(a.cua.nhom) - NHOM.indexOf(b.cua.nhom) || a.cua.ky_hieu.localeCompare(b.cua.ky_hieu, 'vi', { numeric: true, sensitivity: 'base' });
  const noi = ds => ds.filter(Boolean).join('; ');
  const COT = [['ky_hieu', 'Ký hiệu'], ['vi_tri', 'Vị trí'], ['sl', 'SL'], ['rong', 'Rộng đặt (trên / giữa / dưới)'], ['cao', 'Cao đặt (trái / giữa / phải)'],
    ['day_tuong', 'Dày tường'], ['san', 'Sàn / bệ / gờ'], ['kieu', 'Kiểu'], ['mo', 'Chiều mở (đứng ngoài nhìn vào)'], ['vat_lieu', 'Chất liệu / màu / phụ kiện'],
    ['ghi_chu', 'Ghi chú'], ['canh_bao', 'Cảnh báo'], ['xong', 'Đo xong']];

  function moTa(c) {
    const r = { day_tuong: '', san: '', kieu: '', mo: '', them: '' }, ben = v => v === 'trai' ? 'trái' : v === 'phai' ? 'phải' : '';
    const moV = v => v === 'vao' ? 'vào' : v === 'ra' ? 'ra' : '';      // chữ có dấu (không in khoá "vao")
    const dt = a => (a || []).filter(v => typeof v === 'number').map(g).join(' / ');
    if (c.nhom === 'go') {
      const G = c.go || {};
      r.day_tuong = dt(G.day_tuong);
      r.san = G.san === 'da_lat' ? 'đã lát' : G.san === 'chua_lat' ? 'chưa lát' + (typeof G.cot_san === 'number' ? ` (sàn hoàn thiện +${g(G.cot_san)})` : '') : '';
      r.kieu = G.kieu === 'khac' ? (G.kieu_khac || 'khác') : (TEN[G.kieu] || '');
      if (G.op_chi) r.kieu += (r.kieu ? ', ' : '') + `ốp chỉ ${G.op_chi} mặt`;
      r.mo = G.kieu === 'lua' || G.kieu === 'xep' ? (G.lua ? `${TEN[G.kieu]} về ${ben(G.lua)}` : '') : noi([G.ban_le && `bản lề ${ben(G.ban_le)}`, G.mo && `mở ${moV(G.mo)}`]);
    } else if (c.nhom === 'nhom') {
      const G = c.nhom_ct || {};
      r.day_tuong = dt(G.day_tuong) + (G.lap ? (dt(G.day_tuong) ? ', ' : '') + 'khuôn ' + TEN[G.lap] : '');
      r.san = typeof G.be === 'number' ? `bệ ${g(G.be)}` : '';
      r.kieu = noi([TEN[G.loai], G.kieu_mo && TEN[G.kieu_mo], typeof G.so_canh === 'number' && `${G.so_canh} cánh`, G.he && `hệ ${G.he}`,
        G.fix && G.fix !== 'khong' && `fix ${noi([typeof G.fix_tren === 'number' && 'trên ' + g(G.fix_tren), typeof G.fix_duoi === 'number' && 'dưới ' + g(G.fix_duoi)]) || TEN[G.fix] || G.fix}`]);
      r.mo = noi([G.ban_le && `bản lề ${ben(G.ban_le)}`, G.mo && `mở ${moV(G.mo)}`]);
      r.them = noi([(typeof G.kinh_day === 'number' || G.kinh_loai) && `kính ${typeof G.kinh_day === 'number' ? g(G.kinh_day) + ' mm ' : ''}${TEN[G.kinh_loai] || ''}`.trim(), G.tang_cao && ('tầng cao, cần giàn' + (G.tang_ghi ? ` (${G.tang_ghi})` : ''))]);
    } else {
      const G = c.kinh || {}, C = G.cua || {}, B = G.bac || {};
      r.san = noi([B.co === true ? `gờ ${noi([typeof B.cao === 'number' && 'cao ' + g(B.cao), typeof B.rong === 'number' && 'rộng ' + g(B.rong)])}`.trim() : B.co === false ? 'không gờ' : '', G.doc && `dốc về ${G.doc}`]);
      r.kieu = TEN[G.dang] || (G.dang === 'lua' ? 'cửa lùa' : '');
      r.mo = C.kieu === 'khong' ? 'không cửa' : noi([C.kieu && (C.kieu === 'lua' ? 'cửa lùa' : 'cửa mở quay'), C.mo && `mở ${moV(C.mo)}`, C.ban_le && `bản lề ${TEN[C.ban_le]}${C.ban_le_ben ? ' bên ' + ben(C.ban_le_ben) : ''}`, typeof C.rong === 'number' && `cánh rộng ${g(C.rong)}`]);
      r.them = noi([`kính ${typeof G.kinh_day === 'number' ? g(G.kinh_day) + ' mm ' : ''}cường lực${G.kinh_loai ? ' ' + TEN[G.kinh_loai] : ''}`, G.pk_mau && `phụ kiện ${TEN[G.pk_mau] || G.pk_mau}`,
        (G.nghieng && (typeof G.nghieng.trai === 'number' || typeof G.nghieng.phai === 'number')) && `tường nghiêng trái ${typeof G.nghieng.trai === 'number' ? g(G.nghieng.trai) : '–'} / phải ${typeof G.nghieng.phai === 'number' ? g(G.nghieng.phai) : '–'}`,
        G.vat && `gần mép kính: ${G.vat}`]);
    }
    return r;
  }

  /** Hàng của phiếu: ds = [{ id, cua, tinh }] (đã có tinh + cảnh báo danh sách). Kính: mỗi mặt một hàng. */
  function hangPhieu(ds) {
    const ra = [];
    for (const x of ds.slice().sort(xep)) {
      const c = x.cua, t = x.tinh, m = moTa(c);
      const chung = {
        nhom: c.nhom, ky_hieu: c.ky_hieu, vi_tri: c.vi_tri, sl: String(c.so_luong), day_tuong: m.day_tuong, san: m.san, kieu: m.kieu, mo: m.mo,
        vat_lieu: noi([c.chat_lieu, c.mau && 'màu ' + c.mau, c.phu_kien, m.them]), ghi_chu: c.ghi_chu,
        canh_bao: t.canh_bao.filter(b => b.muc !== 'ghi').map(b => (b.muc === 'do' ? '[ĐỎ] ' : '') + b.loi).join(' '), muc: t.muc, xong: c.xong ? 'xong' : 'chưa',
      };
      if (c.nhom === 'kinh') {
        const mat = (c.kinh && c.kinh.mat) || [];
        if (!mat.length) ra.push(Object.assign({}, chung, { rong: '', cao: '' }));
        mat.forEach((mm, i) => ra.push(Object.assign({}, chung, { ky_hieu: mat.length > 1 ? `${c.ky_hieu} · mặt ${i + 1}` : c.ky_hieu, rong: so3(t.mat[i].rong, mm.rong), cao: so3(t.mat[i].cao, mm.cao) })));
      } else {
        let cao = so3(t.cao, c.cao);
        if (typeof t.cao_dat === 'number') cao += ` → đặt ${g(t.cao_dat)}`;
        ra.push(Object.assign({}, chung, { rong: so3(t.rong, c.rong), cao }));
      }
    }
    return ra;
  }

  const esc = s => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  /** Trang in (A4 ngang). ct = { ten, dia_chi, ngay, nguoi_do }, nhoms = các nhóm cần in. Không script (CSP riêng: chỉ style nội dòng). */
  function phieuHtml(ct, ds, nhoms, luc) {
    const hang = hangPhieu(ds);
    const phan = nhoms.map(n => {
      const h = hang.filter(r => r.nhom === n);
      const than = h.length ? h.map(r => `<tr class="${r.muc}">${COT.map(([k]) => `<td class="c-${k}">${esc(r[k])}</td>`).join('')}</tr>`).join('\n')
        : `<tr><td colspan="${COT.length}" class="trong">Chưa có mục nào.</td></tr>`;
      return `<section data-nhom="${n}"><h2>${esc(NHOM_TEN[n])} — ${h.length ? new Set(h.map(r => r.ky_hieu.split(' · ')[0])).size : 0} mục</h2>
<table><thead><tr>${COT.map(([k, t]) => `<th class="c-${k}">${esc(t)}</th>`).join('')}</tr></thead><tbody>
${than}
</tbody></table></section>`;
    }).join('\n');
    return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Phiếu đo cửa — ${esc(ct.ten)}</title><style>
@page{size:A4 landscape;margin:10mm}body{font:11px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#111;margin:0 auto;max-width:1200px;padding:8px;background:#fff}
h1{font-size:16px;margin:0 0 4px}.dau{margin-bottom:8px}.dau div{margin:1px 0}.ghi{color:#555}h2{font-size:13px;margin:14px 0 4px}
section+section{break-before:page}table{border-collapse:collapse;width:100%}th,td{border:1px solid #888;padding:3px 4px;vertical-align:top;text-align:left;word-break:break-word}
th{background:#eee}tr{break-inside:avoid}tr.do td.c-canh_bao{color:#b00020;font-weight:600}tr.vang td.c-canh_bao{color:#8a5a00}.c-sl,.c-xong{text-align:center;white-space:nowrap}
.c-rong,.c-cao{white-space:nowrap}.trong{text-align:center;color:#777}@media screen{body{padding:12px}table{min-width:1100px}}
</style></head><body>
<div class="dau"><h1>Phiếu đo cửa — ${esc(ct.ten)}</h1>
<div>${esc(ct.dia_chi || '')}${ct.dia_chi ? ' · ' : ''}ngày đo ${esc(ct.ngay || '')}${ct.nguoi_do ? ' · người đo ' + esc(ct.nguoi_do) : ''}</div>
<div class="ghi">Số mm, lọt lòng ô chờ. Số đặt hàng = số NHỎ NHẤT trong 3 điểm đo (trong ngoặc). Chiều mở: đứng NGOÀI nhìn vào. In lúc ${esc(luc || '')}.</div></div>
${phan}
</body></html>`;
  }

  /** CSV (UTF-8 có BOM để Excel đọc đúng dấu). Ô chữ bắt đầu bằng = + - @ được thêm ' (chống công thức). */
  function phieuCsv(ds, nhoms) {
    const o = v => { let s = String(v === undefined || v === null ? '' : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
    const dong = [['Nhóm'].concat(COT.map(c => c[1])).map(o).join(',')];
    for (const r of hangPhieu(ds).filter(r => nhoms.includes(r.nhom))) dong.push([NHOM_TEN[r.nhom]].concat(COT.map(([k]) => r[k])).map(o).join(','));
    return '﻿' + dong.join('\r\n') + '\r\n';
  }

  return { soatCua, tinh, kiemDs, hangPhieu, phieuHtml, phieuCsv, lienCua, moTa, NHOM, NHOM_TEN, KY_DAU, HE_NHOM, NGUONG, TEN, ANH_MAX, CUA_MAX_CT, ID_DO };
});
