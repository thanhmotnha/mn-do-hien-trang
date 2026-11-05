'use strict';
// MỌI truy vấn đi qua tệp này. node:sqlite (DatabaseSync) có sẵn trong Node 22 (từ 22.13 không cần cờ) — khỏi dựng mã máy như better-sqlite3
// (Alpine cần python / make / g++, dễ hỏng khi đổi bản Node). API còn "experimental": đổi thì chỉ sửa tệp này, hoặc thay better-sqlite3 cùng giao diện
// (prepare / get / all / run / tx).
const path = require('node:path'), fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const BAN_CSDL = 1;
const LUOC_DO = `
CREATE TABLE tai_khoan (
  id INTEGER PRIMARY KEY,
  ten TEXT NOT NULL UNIQUE COLLATE NOCASE,
  ten_hien TEXT NOT NULL,
  vai TEXT NOT NULL CHECK (vai IN ('quan_ly','tho')),
  mk TEXT NOT NULL,
  bat_doi_mk INTEGER NOT NULL DEFAULT 1,
  khoa_luc INTEGER,
  tao_luc INTEGER NOT NULL, doi_mk_luc INTEGER
);
CREATE TABLE phien (
  bam TEXT PRIMARY KEY,
  tk INTEGER NOT NULL REFERENCES tai_khoan(id) ON DELETE CASCADE,
  tao_luc INTEGER NOT NULL, dung_luc INTEGER NOT NULL, het_luc INTEGER NOT NULL, ua TEXT
);
CREATE INDEX phien_tk ON phien(tk);
CREATE TABLE ma_ket_noi (
  id INTEGER PRIMARY KEY,
  nhan TEXT NOT NULL,
  bam TEXT NOT NULL UNIQUE,
  dau TEXT NOT NULL,
  tao_boi INTEGER NOT NULL, tao_luc INTEGER NOT NULL,
  dung_luc INTEGER, thu_hoi_luc INTEGER
);
CREATE TABLE cong_trinh (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 6 AND 40),
  ten TEXT NOT NULL, dia_chi TEXT NOT NULL DEFAULT '', ngay TEXT NOT NULL, nguoi_do TEXT NOT NULL DEFAULT '',
  tao_boi INTEGER NOT NULL, tao_luc INTEGER NOT NULL, sua_luc INTEGER NOT NULL,
  luu_tru_luc INTEGER, xoa_luc INTEGER
);
CREATE TABLE muc (
  id TEXT PRIMARY KEY, ct TEXT NOT NULL REFERENCES cong_trinh(id),
  loai TEXT NOT NULL DEFAULT 'phong',
  ten TEXT NOT NULL, xong INTEGER NOT NULL DEFAULT 0, ghi_chu TEXT NOT NULL DEFAULT '',
  phong TEXT NOT NULL,
  anh TEXT NOT NULL DEFAULT '[]',
  gui TEXT NOT NULL,
  goi_tinh TEXT NOT NULL,
  rev INTEGER NOT NULL DEFAULT 1,
  nguoi_gui INTEGER NOT NULL REFERENCES tai_khoan(id),
  tao_luc INTEGER NOT NULL, sua_luc INTEGER NOT NULL, xoa_luc INTEGER
);
CREATE INDEX muc_sua ON muc(sua_luc DESC) WHERE xoa_luc IS NULL;
CREATE INDEX muc_ct ON muc(ct);
CREATE TABLE anh (
  id TEXT PRIMARY KEY, muc TEXT NOT NULL REFERENCES muc(id), ct TEXT NOT NULL,
  w INTEGER NOT NULL, h INTEGER NOT NULL, bytes INTEGER NOT NULL, sha256 TEXT NOT NULL,
  tao_boi INTEGER NOT NULL, tao_luc INTEGER NOT NULL
);
CREATE INDEX anh_muc ON anh(muc);
CREATE TABLE dem_sai (
  khoa TEXT PRIMARY KEY, so INTEGER NOT NULL, tu_luc INTEGER NOT NULL, khoa_den INTEGER, lan INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE nhat_ky (id INTEGER PRIMARY KEY, luc INTEGER NOT NULL, tk INTEGER, viec TEXT NOT NULL, chi_tiet TEXT);
`;

function mo(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'do.sqlite'));
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA synchronous=NORMAL;');
  const v = db.prepare('PRAGMA user_version').get().user_version;
  if (v === 0) { db.exec('BEGIN'); db.exec(LUOC_DO); db.exec(`PRAGMA user_version=${BAN_CSDL}`); db.exec('COMMIT'); }
  else if (v > BAN_CSDL) throw new Error(`CSDL bản ${v} mới hơn ứng dụng (bản ${BAN_CSDL}) — không mở để khỏi làm hỏng dữ liệu`);
  const bo = new Map();
  const stmt = sql => { let s = bo.get(sql); if (!s) { s = db.prepare(sql); bo.set(sql, s); } return s; };
  let trongTx = false;
  return {
    get: (sql, ...p) => { const r = stmt(sql).get(...p); return r ? Object.assign({}, r) : undefined; },
    all: (sql, ...p) => stmt(sql).all(...p).map(r => Object.assign({}, r)),
    run: (sql, ...p) => stmt(sql).run(...p),
    exec: sql => db.exec(sql),
    /** Chạy fn trong một giao dịch (lồng nhau thì chạy thẳng). */
    tx(fn) {
      if (trongTx) return fn();
      db.exec('BEGIN IMMEDIATE'); trongTx = true;
      try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { try { db.exec('ROLLBACK'); } catch (e2) { /* đã huỷ */ } throw e; } finally { trongTx = false; }
    },
    saoLuu: dich => db.prepare('VACUUM INTO ?').run(dich),
    close: () => db.close(),
  };
}

module.exports = { mo, BAN_CSDL };
