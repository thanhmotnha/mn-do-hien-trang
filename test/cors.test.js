'use strict';
// CORS (mục 9.4): chỉ /api/do/*, chỉ https://cfcad.cn + https://*.cfcad.cn, không bao giờ allow-credentials.
const test = require('node:test'), assert = require('node:assert/strict');
const { moMay, quanLy } = require('./tro-giup');

let M, ma;
test.before(async () => { M = await moMay(); const q = await quanLy(M); ma = (await q.goi('POST', '/api/quan-ly/ma-ket-noi', { json: { nhan: 'x' } })).j.chuoi.split('#')[1]; M.q = q; });
test.after(async () => { await M.dong(); });
const goi = (method, p, h = {}) => fetch(M.goc + p, { method, headers: h });

test('preflight từ nguồn nhận', async () => {
  for (const o of ['https://cfcad.cn', 'https://www.cfcad.cn', 'https://a.b.cfcad.cn']) {
    const r = await goi('OPTIONS', '/api/do/phong', { origin: o, 'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization' });
    assert.equal(r.status, 204); assert.equal(r.headers.get('access-control-allow-origin'), o);
    assert.match(r.headers.get('access-control-allow-headers'), /authorization/);
    assert.match(r.headers.get('access-control-allow-methods'), /GET/);
    assert.equal(r.headers.get('access-control-allow-credentials'), null);
    assert.match(r.headers.get('vary'), /Origin/);
  }
});

test('nguồn lạ: không ACAO', async () => {
  for (const o of ['http://cfcad.cn', 'https://cfcad.cn.evil.com', 'https://evilcfcad.cn', 'null', 'https://cfcad.cn:8443', 'https://xcfcad.cn']) {
    const r = await goi('OPTIONS', '/api/do/phong', { origin: o });
    assert.equal(r.status, 204); assert.equal(r.headers.get('access-control-allow-origin'), null, o);
    const g = await goi('GET', '/api/do/phong', { origin: o, authorization: 'Bearer ' + ma });
    assert.equal(g.headers.get('access-control-allow-origin'), null, o);
  }
});

test('GET 200 / 401 / 404 mang ACAO cho nguồn nhận; không allow-credentials', async () => {
  const o = 'https://cfcad.cn';
  for (const [p, a, st] of [['/api/do/phong', ma, 200], ['/api/do/phong', 'mn-' + 'z'.repeat(43), 401], ['/api/do/anh/khongco123', ma, 404], ['/api/do/khac', ma, 404]]) {
    const r = await goi('GET', p, { origin: o, authorization: 'Bearer ' + a });
    assert.equal(r.status, st, p); assert.equal(r.headers.get('access-control-allow-origin'), o);
    assert.equal(r.headers.get('access-control-allow-credentials'), null); assert.equal(r.headers.get('cache-control'), 'no-store');
  }
});

test('/api khác không bao giờ có ACAO; mọi /api có no-store', async () => {
  for (const [m, p] of [['GET', '/api/cong-trinh'], ['OPTIONS', '/api/cong-trinh'], ['GET', '/api/toi'], ['GET', '/api/suc-khoe'], ['POST', '/api/dang-nhap']]) {
    const r = await goi(m, p, { origin: 'https://cfcad.cn', cookie: M.q.cookie });
    assert.equal(r.headers.get('access-control-allow-origin'), null, p); assert.equal(r.headers.get('cache-control'), 'no-store', p);
  }
  const s = await goi('GET', '/api/suc-khoe'); assert.deepEqual(await s.json(), { ok: true, ban: '0.1.0' });
});

test('tiêu đề bảo mật trên trang', async () => {
  const r = await goi('GET', '/');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/); assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(r.headers.get('x-frame-options'), 'DENY'); assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
  assert.equal((await goi('GET', '/../server.js')).status, 404);
  assert.equal((await goi('GET', '/lib/may-chu.js')).status, 404);
});
