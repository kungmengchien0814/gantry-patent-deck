/* 龍門溫差式均溫系統｜專利互動簡報：離線用 Service Worker
   - 第一次打開網站時，先把 offline.html（單一檔案，內含 three.js、圖片、字型）存在裝置上。
   - 打開網頁時：有網路就用最新版；沒有網路、或 4 秒內沒回應，就改用存好的 offline.html。
   - 有網路時順便檢查 offline.html 有沒有更新（用 ETag 比對，沒變就不重抓）。
   - three.js 與圖片也先存好，網路很慢時 3D 照樣載得出來。
   - 改了 vendor/ 或 img/ 裡的檔案，要把下面 CACHE 的版本號加一（v1 → v2），裝置才會重抓。 */
const PREFIX = 'gantry-deck-';
const CACHE = PREFIX + 'v1';
const CORE = ['offline.html', 'manifest.webmanifest', 'favicon.svg', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png',
  'vendor/three.module.js', 'vendor/OrbitControls.js', 'img/tilt.jpg', 'img/g8.png', 'img/g23.png', 'img/fig_system.png'];
const TIMEOUT = 4000;

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(CORE.map(u => new Request(u, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    const old = keys.filter(k => k.startsWith(PREFIX) && k !== CACHE);
    await Promise.all(old.map(k => caches.delete(k)));
    await self.clients.claim();
    if (!old.length) {
      const cs = await self.clients.matchAll({ type: 'window' });
      cs.forEach(c => c.postMessage({ type: 'offline-ready' }));
    }
  })());
});

let lastCheck = 0;
async function refreshOffline() {
  if (Date.now() - lastCheck < 60000) return;
  lastCheck = Date.now();
  try {
    const c = await caches.open(CACHE), old = await c.match('offline.html');
    const res = await fetch('offline.html', { cache: 'no-cache' });
    if (!res.ok) return;
    const tag = r => r && (r.headers.get('etag') || r.headers.get('last-modified'));
    if (!old || !tag(res) || tag(res) !== tag(old)) await c.put('offline.html', res);
  } catch (err) { /* 沒網路就算了，下次再檢查 */ }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (req.mode !== 'navigate') {
    /* 同網站的檔案：有存就用存檔（three.js、圖片、圖示），沒有就照常下載 */
    if (new URL(req.url).origin !== self.location.origin) return;
    e.respondWith((async () => (await caches.match(req, { cacheName: CACHE, ignoreSearch: true })) || fetch(req))());
    return;
  }
  e.respondWith((async () => {
    try {
      const res = await Promise.race([
        fetch(req),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT)),
      ]);
      e.waitUntil(refreshOffline());
      return res;
    } catch (err) {
      const hit = await caches.match('offline.html', { cacheName: CACHE });
      return hit || Response.error();
    }
  })());
});
