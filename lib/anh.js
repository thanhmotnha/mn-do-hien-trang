'use strict';
// Nhận dạng + đọc cỡ ảnh từ TIÊU ĐỀ tệp (không giải mã điểm ảnh, không thư viện), và lọc siêu dữ liệu JPEG (EXIF / GPS…).

/** 'jpeg' | 'png' | 'webp' | null — theo byte đầu, không tin Content-Type. */
function loai(b) {
  if (!Buffer.isBuffer(b) || b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}

const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
/** Đi qua các đoạn JPEG tới SOS. cb(marker, đầu đoạn, độ dài kể cả 2 byte độ dài). Trả vị trí đoạn SOS (hoặc -1 khi hỏng). */
function diJpeg(b, cb) {
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return -1;
    let m = b[i + 1];
    if (m === 0xff) { i++; continue; }      // byte đệm
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    if (m === 0xd9) return -1;
    const dai = b.readUInt16BE(i + 2);
    if (dai < 2 || i + 2 + dai > b.length) return -1;
    if (m === 0xda) return i;
    cb(m, i, dai);
    i += 2 + dai;
  }
  return -1;
}

/** { w, h } hoặc null. */
function co(b) {
  const l = loai(b);
  if (l === 'jpeg') {
    let r = null;
    diJpeg(b, (m, i, dai) => { if (!r && SOF.has(m) && dai >= 7) r = { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) }; });
    return r && r.w > 0 && r.h > 0 ? r : null;
  }
  if (l === 'png') return b.length >= 24 && b.toString('latin1', 12, 16) === 'IHDR' ? { w: b.readUInt32BE(16), h: b.readUInt32BE(20) } : null;
  if (l === 'webp' && b.length >= 30) {
    const k = b.toString('latin1', 12, 16);
    if (k === 'VP8 ' && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
    if (k === 'VP8L' && b[20] === 0x2f) { const v = b.readUInt32LE(21); return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 }; }
    if (k === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
  }
  return null;
}

/** Bỏ mọi đoạn APP1 … APP15 và COM (EXIF, GPS, XMP, ghi chú) — giữ APP0, DQT, SOF, DHT, DRI, SOS và phần sau. Hỏng → null. */
function locJpeg(b) {
  if (loai(b) !== 'jpeg') return null;
  const giu = [b.slice(0, 2)];
  const sos = diJpeg(b, (m, i, dai) => { if ((m >= 0xe1 && m <= 0xef) || m === 0xfe) return; giu.push(b.slice(i, i + 2 + dai)); });
  if (sos < 0) return null;
  giu.push(b.slice(sos));
  return Buffer.concat(giu);
}

/** Còn đoạn APPn (n ≥ 1) không — cho phép thử. */
function coApp1(b) { let c = false; diJpeg(b, m => { if (m >= 0xe1 && m <= 0xef) c = true; }); return c; }

module.exports = { loai, co, locJpeg, coApp1 };
