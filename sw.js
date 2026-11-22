const VERSION = 'gss-v5';
const SHELL_CACHE = VERSION + '-shell';
const LIB_CACHE = VERSION + '-lib';
const SHELL = ['./', './index.html', './manifest.json', './icon.svg', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'];
const LIBS = [
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.js',
  'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.wasm',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
];
const LIB_HOSTS = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL_CACHE);
    await Promise.all(SHELL.map(u => shell.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    const lib = await caches.open(LIB_CACHE);
    await Promise.all(LIBS.map(async u => {
      try {
        const r = await fetch(u, { mode: 'cors' });
        if (r.ok) await lib.put(u, r);
      } catch (e) {}
    }));
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function networkFirst(request, cacheName, fallbackKey, timeout) {
  const cache = await caches.open(cacheName);
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    const res = await fetch(request, { signal: ctrl.signal });
    clearTimeout(timer);
    if (res && res.ok) cache.put(fallbackKey || request, res.clone());
    return res;
  } catch (e) {
    const hit = (await cache.match(fallbackKey || request, { ignoreSearch: true })) || (await cache.match('./index.html'));
    if (hit) return hit;
    return new Response('Offline', { status: 503, statusText: 'Offline', headers: { 'Content-Type': 'text/plain' } });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const refresh = fetch(request).then(res => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone());
    return res;
  }).catch(() => null);
  if (hit) { refresh.catch(() => {}); return hit; }
  const res = await refresh;
  return res || new Response('', { status: 504, statusText: 'Offline' });
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.headers.has('range')) return;
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req, SHELL_CACHE, './index.html', 3500));
    return;
  }
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(req, SHELL_CACHE));
    return;
  }
  if (LIB_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(req, LIB_CACHE));
  }
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
  if (event.data === 'GET_VERSION' && event.source) event.source.postMessage({ type: 'version', version: VERSION });
});
