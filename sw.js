/* Reisblik service worker: cacheversie komt uit config/version.json. */
const VERSION_URL = './config/version.json';
const OFFLINE_PREFIX = 'reisblik-offline-vacation-';
const APP_CACHE_PREFIX = 'reisblik-app-v';
const APP_SHELL = [
  './','./index.html','./app.html','./mijn-reisdag.html','./manifest.json',
  './logo/icon-192.png','./logo/icon-512.png','./config/version.json',
  './css/reisblik.css','./js/version.js',
  './js/visited.js','./js/navigation.js','./js/extra-info.js','./js/agenda.js',
  './js/vakantie.js','./js/vakantie-keuze.js','./js/voorlezen.js','./js/app.js',
  './js/ui.js','./js/backup.js','./js/clear-local-storage.js','./js/update-json-export.js',
  './js/mijn-reisdag.js','./js/vakantie-archief.js','./js/restore.js','./js/search.js',
  './js/help.js','./js/offline-prepare.js','./js/aantekeningen.js','./js/dagverslag.js',
  './js/quiz.js','./js/docx-html.js','./js/slideshow-auto-layout.js','./js/maintenance.js','./praag/horeca/horeca.json','./praag/locaties/locaties.json','./praag/kunst/kunst.json','./praag/winkels/winkels.json'
];

async function getVersionInfo() {
  try {
    const response = await fetch(new URL(VERSION_URL, self.location.href).href, { cache: 'no-store' });
    if (response.ok) {
      const info = await response.json();
      if (info && typeof info.version === 'string' && info.version.trim()) return info;
    }
  } catch (error) { console.warn('[Reisblik SW] versiebestand niet beschikbaar:', error); }
  try {
    const cached = await caches.match(new URL(VERSION_URL, self.location.href).href);
    if (cached) {
      const info = await cached.json();
      if (info && typeof info.version === 'string' && info.version.trim()) return info;
    }
  } catch (_) {}
  return { version: '10.0.25' };
}
async function getCacheName() {
  const info = await getVersionInfo();
  return APP_CACHE_PREFIX + info.version.replace(/[^a-zA-Z0-9._-]/g, '-');
}
async function fillAppCache(cacheName) {
  const cache = await caches.open(cacheName);
  await Promise.all(APP_SHELL.map(async path => {
    try {
      const url = new URL(path, self.location.href);
      url.searchParams.set('rbv', cacheName.slice(APP_CACHE_PREFIX.length));
      const response = await fetch(new Request(url.href, { cache: 'no-store' }));
      if (response.ok) await cache.put(new Request(new URL(path, self.location.href).href), response.clone());
    } catch (error) { console.warn('[Reisblik SW] cachebestand overgeslagen:', path, error); }
  }));
}

self.addEventListener('install', event => event.waitUntil((async () => {
  const cacheName = await getCacheName();
  await fillAppCache(cacheName);
  await self.skipWaiting();
})()));

self.addEventListener('activate', event => event.waitUntil((async () => {
  const current = await getCacheName();
  const keys = await caches.keys();
  await Promise.all(keys.filter(key => key.startsWith(APP_CACHE_PREFIX) && key !== current).map(key => caches.delete(key)));
  await self.clients.claim();
})()));

self.addEventListener('message', event => {
  if (!event.data) return;
  if (event.data.type === 'CACHE_URLS') {
    const urls = Array.isArray(event.data.urls) ? event.data.urls : [];
    const requested = typeof event.data.cacheName === 'string' && event.data.cacheName.startsWith(OFFLINE_PREFIX) ? event.data.cacheName : null;
    event.waitUntil((async () => {
      const cacheName = requested || await getCacheName();
      const cache = await caches.open(cacheName);
      await Promise.all(urls.map(async url => {
        try { const response = await fetch(url, { cache: 'no-store' }); if (response.ok) await cache.put(new Request(new URL(url, self.location.href).href), response.clone()); } catch (_) {}
      }));
    })());
  }
  if (event.data.type === 'REISBLIK_VERSION_SEEN') {
    event.waitUntil((async () => {
      const current = await getCacheName();
      const keys = await caches.keys();
      await Promise.all(keys.filter(key => key.startsWith(APP_CACHE_PREFIX) && key !== current).map(key => caches.delete(key)));
      await fillAppCache(current);
    })());
  }
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  event.respondWith((async () => {
    const url = new URL(request.url), same = url.origin === self.location.origin;
    if (!same) return fetch(request);
    const clean = new URL(url.href); clean.search = ''; clean.hash = '';
    const cacheName = await getCacheName();
    const isLiveConfig = url.pathname.endsWith('/config/version.json') || url.pathname.endsWith('/config/vakanties.json') || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/app.html') || url.pathname.endsWith('/sw.js');
    const isDataJson = url.pathname.endsWith('.json') && !url.pathname.includes('/archief/');
    if (url.pathname.includes('/archief/')) return fetch(request);
    // Network-first for JSON datasets: uploaded GitHub changes appear online,
    // while the cached version remains available if the device is offline.
    if (isLiveConfig || isDataJson) {
      try {
        const response = await fetch(request, { cache: 'no-store' });
        if (response.ok && !url.pathname.endsWith('/sw.js')) await (await caches.open(cacheName)).put(new Request(clean.href), response.clone());
        return response;
      } catch (error) {
        const fallback = await (await caches.open(cacheName)).match(new Request(clean.href));
        if (fallback) return fallback;
        throw error;
      }
    }
    const cache = await caches.open(cacheName);
    let cached = await cache.match(request) || await cache.match(new Request(clean.href));
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok) await cache.put(new Request(clean.href), response.clone());
      return response;
    } catch (error) {
      if (request.mode === 'navigate') {
        const fallback = await cache.match('./index.html');
        if (fallback) return fallback;
      }
      throw error;
    }
  })());
});
