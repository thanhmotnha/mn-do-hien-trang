#!/usr/bin/env node
// Dựng biểu tượng PNG 192 / 512 (nền xanh, khung phòng trắng, vạch kích thước đỏ) bằng zlib — không thư viện ảnh.
'use strict';
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib');
const crc = b => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } c = 0xffffffff; for (const x of b) c = t[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const khuc = (loai, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(loai, 'latin1'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
function ve(n) {
  const px = Buffer.alloc(n * (n * 4 + 1)), dat = (x, y, m) => { const i = y * (n * 4 + 1) + 1 + x * 4; px[i] = m[0]; px[i + 1] = m[1]; px[i + 2] = m[2]; px[i + 3] = 255; };
  const s = v => Math.round(v * n / 512);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let m = [11, 110, 79];
    const tr = (a, b, c, d) => x >= s(a) && x < s(c) && y >= s(b) && y < s(d);
    if (tr(112, 132, 400, 380) && !tr(140, 160, 372, 352)) m = [255, 255, 255];      // khung phòng
    if (tr(220, 132, 300, 160)) m = [11, 110, 79];      // cửa
    if (tr(112, 420, 400, 432) || tr(112, 404, 124, 448) || tr(388, 404, 400, 448)) m = [232, 40, 30];      // vạch kích thước
    dat(x, y, m);
  }
  for (let y = 0; y < n; y++) px[y * (n * 4 + 1)] = 0;
  const ih = Buffer.alloc(13); ih.writeUInt32BE(n, 0); ih.writeUInt32BE(n, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), khuc('IHDR', ih), khuc('IDAT', zlib.deflateSync(px)), khuc('IEND', Buffer.alloc(0))]);
}
const pub = path.join(__dirname, '..', 'public');
for (const n of [192, 512]) fs.writeFileSync(path.join(pub, `icon-${n}.png`), ve(n));
fs.writeFileSync(path.join(pub, 'icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="#0b6e4f"/><path d="M126 146h100M300 146h86v220H126V146" fill="none" stroke="#fff" stroke-width="28"/><path d="M112 426h288M118 404v44M394 404v44" stroke="#e8281e" stroke-width="12"/></svg>\n');
console.log('đã dựng biểu tượng');
