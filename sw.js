// 福岡散步繪本 Service Worker
// 只改 data/trip.json 或 index.html 時不用動這裡（這兩個是「網路優先」，連得上就會拿到新版）。
// 換了字型、圖示、Leaflet 等其他檔案時，把 VERSION 加 1，手機才會重新下載。
const VERSION = 'v9';
const CORE_CACHE = `fukuoka-core-${VERSION}`;
const TILE_CACHE = 'fukuoka-tiles';
const TILE_LIMIT = 800;

const CORE_FILES = [
  './',
  './index.html',
  './data/trip.json',
  './manifest.webmanifest',
  './vendor/leaflet/leaflet.js',
  './vendor/leaflet/leaflet.css',
  './fonts/huninn-subset.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CORE_CACHE)
      .then((cache) => cache.addAll(CORE_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('fukuoka-core-') && key !== CORE_CACHE)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // 頁面和行程資料：網路優先（最多等 4 秒），失敗就用快取，出國網路不穩也打得開
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, './index.html'));
    return;
  }
  if (url.origin === self.location.origin && url.pathname.endsWith('/data/trip.json')) {
    event.respondWith(networkFirst(request, './data/trip.json'));
    return;
  }

  // 同網域的靜態檔：快取優先
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request, CORE_CACHE));
    return;
  }

  // 地圖圖磚：看過的區域存起來，離線時還能看
  if (url.hostname === 'tile.openstreetmap.org' || url.hostname.endsWith('basemaps.cartocdn.com')) {
    event.respondWith(tileCache(request));
  }
});

async function networkFirst(request, cacheKey) {
  const cache = await caches.open(CORE_CACHE);
  const network = fetch(request).then((response) => {
    if (response.ok) cache.put(cacheKey, response.clone());
    return response;
  });
  network.catch(() => {}); // 離線時改用快取，不需要報錯
  try {
    return await withTimeout(network, 4000);
  } catch (err) {
    const cached = (await cache.match(cacheKey)) || (cacheKey === './index.html' && (await cache.match('./')));
    // 沒有快取時就繼續等網路
    return cached || network;
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function tileCache(request) {
  const cache = await caches.open(TILE_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok || response.type === 'opaque') {
      await cache.put(request, response.clone());
      trimCache(cache, TILE_LIMIT);
    }
    return response;
  } catch (err) {
    return Response.error();
  }
}

async function trimCache(cache, limit) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - limit; i++) await cache.delete(keys[i]);
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}
