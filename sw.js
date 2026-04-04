const CACHE_NAME = 'volran-v18';

const ASSETS = [
  './',
  './index.html',
  './main.js',
  './ranking.js',
  './songs.js',
  './style.css',
  './icon.png',
  './favicon.png',
  './bg.jpg',
  './title1.png',
  './jacket_SStar.png',
  './jacket_Tlabyrinth.png',
  './jacket_betrayal.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.all(
        ASSETS.map(asset => cache.add(asset).catch(() => {}))
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  // Only handle same-origin requests to avoid intercepting cross-origin API calls
  if (!event.request.url.startsWith(self.location.origin)) return;

  // Skip audio/media requests: browsers stream these using Range requests,
  // but the SW cache can only return the full file (200 OK) instead of a
  // partial response (206 Partial Content), which resets the playback
  // position to the beginning and causes the title BGM to loop.
  const { pathname } = new URL(event.request.url);
  if (/\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(pathname)) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request);
    })
  );
});
