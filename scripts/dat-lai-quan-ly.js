#!/usr/bin/env node
// Quên hết mật khẩu quản lý: đặt mật khẩu tạm cho một tài khoản quản lý (chưa có thì tạo) và in ra màn hình. Chỉ người vào được máy chủ mới chạy được:
//   docker exec -it mndo-app node scripts/dat-lai-quan-ly.js quanly
'use strict';
const path = require('node:path');
const csdl = require('../lib/csdl'), MK = require('../lib/mat-khau');
const ten = String(process.argv[2] || '').trim().toLowerCase();
if (!/^[a-z0-9._-]{3,32}$/.test(ten)) { console.error('Dùng: node scripts/dat-lai-quan-ly.js <tên đăng nhập quản lý>'); process.exit(2); }
(async () => {
  const db = csdl.mo(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
  const mk = MK.sinh(14), bam = await MK.bam(mk), t = Date.now();
  const r = db.get('SELECT id, vai FROM tai_khoan WHERE ten = ?', ten);
  if (r && r.vai !== 'quan_ly') { console.error(`"${ten}" là tài khoản thợ, không phải quản lý.`); process.exit(1); }
  db.tx(() => {
    if (r) { db.run('UPDATE tai_khoan SET mk = ?, bat_doi_mk = 1, khoa_luc = NULL WHERE id = ?', bam, r.id); db.run('DELETE FROM phien WHERE tk = ?', r.id); }
    else db.run("INSERT INTO tai_khoan (ten, ten_hien, vai, mk, bat_doi_mk, tao_luc) VALUES (?, 'Quản lý', 'quan_ly', ?, 1, ?)", ten, bam, t);
    db.run('DELETE FROM dem_sai WHERE khoa = ?', 'ten:' + ten);
    db.run("INSERT INTO nhat_ky (luc, tk, viec, chi_tiet) VALUES (?, NULL, 'dat_lai_mk', ?)", t, 'dòng lệnh: ' + ten);
  });
  db.close();
  console.log(`Tài khoản quản lý: ${ten}\nMật khẩu tạm:      ${mk}\nĐăng nhập xong trang đo bắt đổi mật khẩu ngay.`);
})().catch(e => { console.error(e.message); process.exit(1); });
