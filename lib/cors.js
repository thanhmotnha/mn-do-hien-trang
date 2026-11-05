'use strict';
// CORS chỉ cho cửa máy vẽ /api/do/*: trang Chenfeng (https://cfcad.cn, https://*.cfcad.cn) đọc bằng mã Bearer, KHÔNG cookie.
// Không bao giờ Access-Control-Allow-Credentials, không '*'.
const RE_CF = /^https:\/\/([a-z0-9-]+\.)*cfcad\.cn$/;

function nhan(origin, them) {
  if (typeof origin !== 'string' || !origin) return false;
  return RE_CF.test(origin) || (Array.isArray(them) && them.includes(origin));
}

/** Gắn tiêu đề CORS cho câu trả lời của /api/do/* (mọi mã trạng thái — để bảng đọc được 401 / 404 / 429). */
function dat(res, origin, them) {
  res.setHeader('Vary', 'Origin');
  if (nhan(origin, them)) res.setHeader('Access-Control-Allow-Origin', origin);
}

function preflight(res, origin, them) {
  dat(res, origin, them);
  if (nhan(origin, them)) {
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'authorization');
    res.setHeader('Access-Control-Max-Age', '600');
  }
  res.writeHead(204); res.end();
}

module.exports = { nhan, dat, preflight, RE_CF };
