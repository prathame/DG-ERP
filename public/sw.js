// Bump when SW strategy changes so clients drop old caches
const CACHE_NAME = 'dg-erp-v2.3.0';
const OFFLINE_URL = '/offline.html';

// Install — cache offline page only
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll([OFFLINE_URL])));
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))),
  );
  self.clients.claim();
});

// Fetch — never cache hashed /assets or document navigations (stale shell after deploy).
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return;

  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/') || url.pathname.includes('manifest.json')) return;

  // Hashed Vite chunks: network only. A missing file must surface as failure, not HTML/cache.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Tenant paths / app shell: always revalidate from network; offline page on total failure.
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request).then(r => r || caches.match(OFFLINE_URL))),
  );
});
