// உங்கள் ஆசிரியர் — Service Worker v4.1
const CACHE = 'ua-v4.1';
const OFFLINE = './offline.html';

const CORE = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  './offline.html',
  './20260315_085358.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(CORE).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Never cache Firebase / API
  if (
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('openrouter.ai') ||
    url.hostname.includes('anthropic.com') ||
    url.hostname.includes('gstatic.com') && url.pathname.includes('firebase')
  ) {
    e.respondWith(fetch(e.request).catch(() => new Response('', {status:503})));
    return;
  }
  // Network first, cache fallback
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() =>
        caches.match(e.request).then(cached => {
          if (cached) return cached;
          if (e.request.mode === 'navigate') return caches.match(OFFLINE);
          return new Response('Offline', { status: 503 });
        })
      )
  );
});
