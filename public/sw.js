// Giữ VỎ ứng dụng trong máy để mất mạng vẫn mở được trang, xem / sửa nháp, chụp ảnh. /api/* luôn đi mạng (không bao giờ giữ số đo / ảnh ở đây).
// Đổi bản = đổi tên bộ nhớ đệm (bộ cũ bị xoá khi bản mới bật).
const BAN = 'mndo-0.3.0';
const VO = ['/', '/app.js', '/app.css', '/goi.js', '/cua.js', '/mncf-phong.js', '/manifest.webmanifest', '/icon.svg', '/icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(BAN).then(c => c.addAll(VO)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== BAN).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== 'GET' || u.pathname.startsWith('/api/')) return;
  const khoa = e.request.mode === 'navigate' ? '/' : u.pathname;
  if (!VO.includes(khoa)) return;
  // mạng trước (có bản mới thì lấy); mất mạng / mạng treo quá 4 giây thì bản trong máy
  const trongMay = () => caches.match(khoa).then(r => r || new Response('Mất mạng', { status: 503 }));
  const mang = fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(BAN).then(b => b.put(khoa, c)); } return r; });
  e.respondWith(new Promise(ok => {
    let xong = false; const tre = setTimeout(() => { caches.match(khoa).then(r => { if (r && !xong) { xong = true; ok(r); } }); }, 4000);
    mang.then(r => { if (!xong) { xong = true; clearTimeout(tre); ok(r); } }, () => { if (!xong) { xong = true; clearTimeout(tre); ok(trongMay()); } });
  }));
});
