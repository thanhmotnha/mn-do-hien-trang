'use strict';
// Chống đoán mật khẩu / mã: đếm lần sai trong bảng dem_sai (còn sau khi khởi động lại).
//   ten:<tên>  5 sai / 15 phút → khoá tên 15 phút, gấp đôi mỗi lần bị khoá, tới 24 h
//   ip:<ip>    20 sai / 15 phút → 429
//   ma:<ip>    30 mã Bearer sai / 10 phút → 429
const PHUT = 60000;
const LUAT = {
  ten: { so: 5, cua_so: 15 * PHUT, khoa: 15 * PHUT, tran: 24 * 60 * PHUT },
  ip: { so: 20, cua_so: 15 * PHUT },
  ma: { so: 30, cua_so: 10 * PHUT },
};

function tao(db, bayGio = () => Date.now()) {
  const doc = k => db.get('SELECT so, tu_luc, khoa_den, lan FROM dem_sai WHERE khoa = ?', k);
  return {
    /** Đang bị chặn? → số giây còn lại, hoặc 0. */
    chan(loai, k) {
      const r = doc(loai + ':' + k), L = LUAT[loai], t = bayGio();
      if (!r) return 0;
      if (r.khoa_den && r.khoa_den > t) return Math.ceil((r.khoa_den - t) / 1000);
      if (!L.khoa && t - r.tu_luc < L.cua_so && r.so >= L.so) return Math.ceil((r.tu_luc + L.cua_so - t) / 1000);
      return 0;
    },
    sai(loai, k) {
      const key = loai + ':' + k, L = LUAT[loai], t = bayGio();
      db.tx(() => {
        const r = doc(key) || { so: 0, tu_luc: t, khoa_den: null, lan: 0 };
        if (t - r.tu_luc >= L.cua_so) { r.so = 0; r.tu_luc = t; }
        r.so++;
        if (L.khoa && r.so >= L.so) { r.khoa_den = t + Math.min(L.khoa * Math.pow(2, r.lan), L.tran); r.lan++; r.so = 0; r.tu_luc = t; }
        db.run('INSERT INTO dem_sai (khoa, so, tu_luc, khoa_den, lan) VALUES (?, ?, ?, ?, ?) ON CONFLICT(khoa) DO UPDATE SET so = excluded.so, tu_luc = excluded.tu_luc, khoa_den = excluded.khoa_den, lan = excluded.lan', key, r.so, r.tu_luc, r.khoa_den, r.lan);
      });
    },
    xoa(loai, k) { db.run('DELETE FROM dem_sai WHERE khoa = ?', loai + ':' + k); },
    don() { const t = bayGio(); db.run('DELETE FROM dem_sai WHERE tu_luc < ? AND (khoa_den IS NULL OR khoa_den < ?)', t - 2 * 24 * 60 * PHUT, t); },
  };
}

module.exports = { tao, LUAT };
