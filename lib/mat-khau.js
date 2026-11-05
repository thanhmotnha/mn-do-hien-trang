'use strict';
// Mật khẩu: scrypt N = 32768, r = 8, p = 1 (~32 MB, ~0,1 s một lần), muối 16 byte, khoá 64 byte. Chuỗi lưu: 'scrypt$N$r$p$<muối b64>$<băm b64>'.
const crypto = require('node:crypto');
const N = 32768, R = 8, P = 1, DAI = 64, MAXMEM = 64 * 1024 * 1024;

const scrypt = (mk, muoi, n, r, p) => new Promise((ok, hong) => crypto.scrypt(String(mk).normalize('NFC'), muoi, DAI, { N: n, r, p, maxmem: MAXMEM }, (e, k) => (e ? hong(e) : ok(k))));

async function bam(mk) {
  const muoi = crypto.randomBytes(16), k = await scrypt(mk, muoi, N, R, P);
  return `scrypt$${N}$${R}$${P}$${muoi.toString('base64')}$${k.toString('base64')}`;
}

/** So mật khẩu với chuỗi đã băm. Chuỗi hỏng → false (vẫn tốn một lần scrypt cho thời gian đều). */
async function kiem(mk, chuoi) {
  const m = /^scrypt\$(\d+)\$(\d+)\$(\d+)\$([A-Za-z0-9+/=]+)\$([A-Za-z0-9+/=]+)$/.exec(String(chuoi || ''));
  const n = m ? +m[1] : N, r = m ? +m[2] : R, p = m ? +m[3] : P;
  const muoi = m ? Buffer.from(m[4], 'base64') : crypto.randomBytes(16), dung = m ? Buffer.from(m[5], 'base64') : crypto.randomBytes(DAI);
  if (n > 1 << 20 || r > 16 || p > 4) return false;
  const k = await scrypt(mk, muoi, n, r, p);
  return !!m && k.length === dung.length && crypto.timingSafeEqual(k, dung);
}

/** Luật mật khẩu: ≥ 10 ký tự, ≤ 200, khác tên đăng nhập. Trả lời lỗi hoặc ''. */
function luat(mk, ten) {
  const s = typeof mk === 'string' ? mk : '';
  if (s.length < 10) return 'Mật khẩu cần ít nhất 10 ký tự.';
  if (s.length > 200) return 'Mật khẩu dài quá 200 ký tự.';
  if (ten && s.toLowerCase() === String(ten).toLowerCase()) return 'Mật khẩu không được trùng tên đăng nhập.';
  return '';
}

/** Mật khẩu tạm 12 ký tự dễ đọc (bỏ 0 O 1 l I). */
function sinh(n = 12) {
  const ky = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789', b = crypto.randomBytes(n);
  let s = ''; for (let i = 0; i < n; i++) s += ky[b[i] % ky.length];
  return s;
}

module.exports = { bam, kiem, luat, sinh };
