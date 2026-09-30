/* Monster Mash Trade Hub — offline support.
   - Install: precache only the small app shell so the first visit stays fast.
   - Code (html/js/css/manifest): network-first, so a new deploy shows up on the next load.
   - Artwork and everything else: cache-first, cached the first time it is seen.
   - After the page settles it may ask us to warm the sticker thumbnails in the background. */
const VERSION = 'v16-cloud';
const SHELL_CACHE = 'mm-shell-' + VERSION;
const ART_CACHE = 'mm-art-v1'; // survives app updates; artwork paths do not change between builds
const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './assets/mm-juice.css', './assets/mm-juice.js',
  './assets/mm-cloud.css', './assets/mm-cloud.js', './assets/mm-cloud-config.js',
  './assets/mm-art-core.js', './assets/mm-stickers-a.js', './assets/mm-stickers-b.js',
  './assets/ui/monster-mash-header.webp', './assets/ui/monster-mash-header-blur.webp',
  './assets/pwa/icon-180.png', './assets/pwa/icon-192.png', './assets/pwa/icon-512.png',
  './assets/pwa/maskable-192.png', './assets/pwa/maskable-512.png',
];
const CODE = /\.(?:html|js|css|webmanifest)$/;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL_CACHE && k !== ART_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const put = (cacheName, req, res) => { if (res && res.ok) { const cp = res.clone(); caches.open(cacheName).then((c) => c.put(req, cp)); } return res; };

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => put(SHELL_CACHE, './index.html', r)).catch(() => caches.match('./index.html')));
    return;
  }
  if (CODE.test(url.pathname)) {
    e.respondWith(fetch(req).then((r) => put(SHELL_CACHE, req, r)).catch(() => caches.match(req)));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => put(ART_CACHE, req, r))));
});

// { type: 'warm', urls: [...] } — cache a list of files quietly, a few at a time.
self.addEventListener('message', (e) => {
  const d = e.data || {};
  if (d.type !== 'warm' || !Array.isArray(d.urls)) return;
  e.waitUntil((async () => {
    const cache = await caches.open(ART_CACHE);
    const todo = [];
    for (const u of d.urls) if (!(await cache.match(u))) todo.push(u);
    for (let i = 0; i < todo.length; i += 4) {
      await Promise.all(todo.slice(i, i + 4).map((u) => fetch(u).then((r) => r.ok && cache.put(u, r)).catch(() => {})));
    }
  })());
});
