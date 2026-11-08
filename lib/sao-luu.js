'use strict';
// Việc hằng ngày lúc 02:17 giờ Việt Nam (UTC+7): sao lưu CSDL (VACUUM INTO, giữ 14 bản) rồi dọn
// phòng / công trình đã xoá quá 30 ngày (kèm tệp ảnh), ảnh thợ đã bỏ khỏi phòng quá 30 ngày, phiên hết hạn, bộ đếm sai cũ. [CĐ] 30 ngày / 14 bản.
const fs = require('node:fs'), path = require('node:path');
const NGAY = 24 * 3600 * 1000, GIU_BAN = 14, GIU_XOA = 30 * NGAY;

function ngayVN(ms) { return new Date(ms + 7 * 3600 * 1000).toISOString().slice(0, 10); }

function saoLuu(db, dataDir, bayGio) {
  const thu = path.join(dataDir, 'sao-luu'); fs.mkdirSync(thu, { recursive: true });
  const dich = path.join(thu, `do-${ngayVN(bayGio())}.sqlite`);
  try { fs.unlinkSync(dich); } catch (e) { /* chưa có */ }
  db.saoLuu(dich);
  const ds = fs.readdirSync(thu).filter(f => /^do-\d{4}-\d{2}-\d{2}\.sqlite$/.test(f)).sort();
  for (const f of ds.slice(0, Math.max(0, ds.length - GIU_BAN))) fs.unlinkSync(path.join(thu, f));
  return dich;
}

function don({ db, anhDir, CD, bayGio }) {
  const t = bayGio(), han = t - GIU_XOA, xoaTep = (ct, id) => { try { fs.unlinkSync(path.join(anhDir, ct, id + '.jpg')); } catch (e) { /* đã mất */ } };
  const dem = { phong: 0, ct: 0, anh: 0, cua: 0 };
  db.tx(() => {
    // phòng đã xoá (hoặc thuộc công trình đã xoá) quá hạn
    const mucs = db.all('SELECT m.id FROM muc m JOIN cong_trinh c ON c.id = m.ct WHERE (m.xoa_luc IS NOT NULL AND m.xoa_luc < ?) OR (c.xoa_luc IS NOT NULL AND c.xoa_luc < ?)', han, han);
    for (const m of mucs) {
      for (const a of db.all('SELECT id, ct FROM anh WHERE muc = ?', m.id)) { xoaTep(a.ct, a.id); dem.anh++; }
      db.run('DELETE FROM anh WHERE muc = ?', m.id); db.run('DELETE FROM muc WHERE id = ?', m.id); dem.phong++;
    }
    // mục "Cửa & vách kính" đã xoá (hoặc thuộc công trình đã xoá) quá hạn — kèm ảnh của nó
    const cuas = db.all('SELECT x.id FROM cua x JOIN cong_trinh c ON c.id = x.ct WHERE (x.xoa_luc IS NOT NULL AND x.xoa_luc < ?) OR (c.xoa_luc IS NOT NULL AND c.xoa_luc < ?)', han, han);
    for (const x of cuas) {
      for (const a of db.all('SELECT id, ct FROM anh_cua WHERE cua = ?', x.id)) { xoaTep(a.ct, a.id); dem.anh++; }
      db.run('DELETE FROM anh_cua WHERE cua = ?', x.id); db.run('DELETE FROM cua WHERE id = ?', x.id); dem.cua++;
    }
    for (const c of db.all('SELECT id FROM cong_trinh WHERE xoa_luc IS NOT NULL AND xoa_luc < ?', han)) {
      if (!db.get('SELECT 1 FROM muc WHERE ct = ?', c.id) && !db.get('SELECT 1 FROM cua WHERE ct = ?', c.id)) { db.run('DELETE FROM cong_trinh WHERE id = ?', c.id); dem.ct++; }
    }
    // ảnh đã lên mà thợ bỏ khỏi phòng (không còn trong muc.anh) quá hạn
    for (const m of db.all('SELECT id, anh FROM muc')) {
      const con = new Set(JSON.parse(m.anh).map(a => a.id));
      for (const a of db.all('SELECT id, ct FROM anh WHERE muc = ? AND tao_luc < ?', m.id, han)) if (!con.has(a.id)) { xoaTep(a.ct, a.id); db.run('DELETE FROM anh WHERE id = ?', a.id); dem.anh++; }
    }
    for (const x of db.all('SELECT id, anh FROM cua')) {
      const con = new Set(JSON.parse(x.anh).map(a => a.id));
      for (const a of db.all('SELECT id, ct FROM anh_cua WHERE cua = ? AND tao_luc < ?', x.id, han)) if (!con.has(a.id)) { xoaTep(a.ct, a.id); db.run('DELETE FROM anh_cua WHERE id = ?', a.id); dem.anh++; }
    }
    db.run('DELETE FROM phien WHERE het_luc < ?', t);
  });
  CD.don();
  return dem;
}

/** Hẹn việc hằng ngày. @returns { dung() } */
function hen(o) {
  let h = 0;
  const tiep = () => {
    const t = o.bayGio(), vn = t + 7 * 3600 * 1000, d = new Date(vn), moc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 2, 17) - 7 * 3600 * 1000;
    let cho = moc - t; if (cho <= 0) cho += NGAY;
    h = setTimeout(() => {
      try { const f = saoLuu(o.db, o.dataDir, o.bayGio), dm = don(o); console.log(`[mndo] sao lưu ${path.basename(f)}; dọn ${dm.phong} phòng, ${dm.cua} mục cửa, ${dm.ct} công trình, ${dm.anh} ảnh`); } catch (e) { console.error('[mndo] việc hằng ngày hỏng:', e.message); }
      tiep();
    }, cho);
    if (h.unref) h.unref();
  };
  tiep();
  return { dung: () => clearTimeout(h) };
}

module.exports = { hen, saoLuu, don, ngayVN };
