const CACHE_NAME = '4m-padel-v3';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/favicon.png',
  '/og-default.png',
  '/manifest.json'
];

// Install Event - Caching basic shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching offline shell');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate Event - Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Clearing old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event - Dynamic caching strategy
self.addEventListener('fetch', (event) => {
  // Only cache GET requests
  if (event.request.method !== 'GET') return;

  // Skip supabase/analytics/api queries to avoid caching dynamic live database requests
  const url = new URL(event.request.url);
  if (
    url.hostname.includes('supabase') || 
    url.hostname.includes('google-analytics') || 
    url.hostname.includes('instagram.com') ||
    url.hostname.includes('cdninstagram.com') ||
    url.pathname.includes('/api/') || 
    url.pathname.startsWith('/rest/')
  ) {
    return;
  }

  // Network-First for HTML (Navigation) Requests to ensure users always get the latest code pointers
  if (event.request.mode === 'navigate' || event.request.headers.get('accept').includes('text/html')) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
          return networkResponse;
        })
        .catch(() => {
          // If offline, serve cached version
          return caches.match(event.request).then((cachedResponse) => {
            return cachedResponse || caches.match('/index.html');
          });
        })
    );
    return;
  }

  // Cache-First for everything else (Assets, Images) with stale-while-revalidate
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          // Prevent caching a 200 OK HTML fallback for a missing JS/CSS asset
          const contentType = networkResponse.headers.get('content-type');
          if (contentType && contentType.includes('text/html')) {
            return networkResponse;
          }

          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Silent catch for offline fetch failures
        });

      return cachedResponse || fetchPromise;
    })
  );
});
