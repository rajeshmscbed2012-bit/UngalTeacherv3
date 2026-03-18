// உங்கள் ஆசிரியர் — Service Worker v5
const CACHE_NAME = 'ungal-aasiriyar-v5';
const OFFLINE_URL = 'student-v3.html';

const PRECACHE = [
  './student-v3.html',
  './app.js',
  './manifest.json',
  './20260315_085358.png'
];

// ── INSTALL: precache core assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => {
        if (key !== CACHE_NAME) return caches.delete(key);
      }))
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: serve from cache, fallback to network
self.addEventListener('fetch', event => {
  const { request } = event;

  // Skip non-GET and cross-origin firebase requests
  if (request.method !== 'GET') return;
  if (request.url.includes('firebasejs') || request.url.includes('firestore') || 
      request.url.includes('googleapis') || request.url.includes('gstatic')) {
    return; // Let firebase requests go directly to network
  }

  // Navigation: always try network first, fallback to cache
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Cache the fresh response
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match('./student-v3.html'))
    );
    return;
  }

  // Assets: cache first, then network
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      }).catch(() => cached);
    })
  );
});

// ── PUSH NOTIFICATIONS
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'உங்கள் ஆசிரியர்', {
      body: data.body || 'இன்று படிக்கவில்லையா? வாருங்கள்!',
      icon: './20260315_085358.png',
      badge: './20260315_085358.png',
      vibrate: [200, 100, 200],
      data: { url: './student-v3.html' }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow('./student-v3.html'));
});
