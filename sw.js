/* Reisblik 9.9.52 — betrouwbare actuele configuratie + cache-update */
const CACHE_NAME = 'reisblik-app-v9.9.52';
const OFFLINE_PREFIX = 'reisblik-offline-vacation-';
const APP_SHELL = [
  './','./index.html','./app.html','./mijn-reisdag.html','./manifest.json','./logo/icon-192.png','./logo/icon-512.png','./css/reisblik.css?v=9.9.52',
  './js/visited.js?v=9.9.52','./js/navigation.js?v=9.9.52','./js/extra-info.js?v=9.9.52',
  './js/agenda.js?v=9.9.52','./js/vakantie.js?v=9.9.52','./js/vakantie-keuze.js?v=9.9.52',
  './js/voorlezen.js?v=9.9.52','./js/app.js?v=9.9.52','./js/ui.js?v=9.9.52','./js/backup.js?v=9.9.52',
  './js/clear-local-storage.js?v=9.9.52','./js/mijn-reisdag.js?v=9.9.52',
  './js/vakantie-archief.js?v=9.9.52','./js/restore.js?v=9.9.52','./js/search.js?v=9.9.52',
  './js/help.js?v=9.9.52','./js/offline-prepare.js?v=9.9.52','./config/vakanties.json?v=9.9.52',
  './js/aantekeningen.js?v=9.9.52','./js/dagverslag.js?v=9.9.52','./js/quiz.js?v=9.9.52'
];

self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE_NAME);

  // Cache each resource separately. One missing/temporarily unavailable
  // file must not abort the complete service-worker installation.
  await Promise.all(APP_SHELL.map(async path=>{
    try{
      const request=new Request(new URL(path,self.location.href).href,{cache:'no-store'});
      const response=await fetch(request);
      if(!response.ok) throw new Error(`HTTP ${response.status}`);
      const cachedResponse=response.clone();
      await cache.put(request,cachedResponse);
    }catch(error){
      console.warn('[Reisblik SW] cache skipped:',path,error);
    }
  }));

  await self.skipWaiting();
})()));

self.addEventListener('activate',event=>event.waitUntil(
  caches.keys()
    .then(keys=>Promise.all(keys.filter(k=>k.startsWith('reisblik-app-')&&k!==CACHE_NAME).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim())
));

self.addEventListener('message',event=>{
  if(!event.data || event.data.type!=='CACHE_URLS') return;
  const urls=Array.isArray(event.data.urls)?event.data.urls:[];
  const targetCache=(typeof event.data.cacheName==='string' && event.data.cacheName.startsWith(OFFLINE_PREFIX)) ? event.data.cacheName : CACHE_NAME;
  event.waitUntil(caches.open(targetCache).then(cache=>Promise.all(urls.map(async url=>{
    try { const r=await fetch(url,{cache:'no-store'}); if(r.ok){ const cached=r.clone(); await cache.put(new Request(new URL(url,self.location.href).href),cached); } } catch(e) {}
  }))));
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET') return;
  event.respondWith((async()=>{
    const url=new URL(request.url), same=url.origin===self.location.origin;

    // These files control the visible app version and the available vacations.
    // Always use the live network first so a phone cannot remain on an old
    // config/index/app after a new version is published.
    const livePath = same && (
      url.pathname.endsWith('/config/vakanties.json') ||
      url.pathname.endsWith('/index.html') ||
      url.pathname.endsWith('/app.html') ||
      url.pathname.endsWith('/sw.js')
    );
    if(livePath){
      try{
        const response=await fetch(request,{cache:'no-store'});
        if(response.ok && !url.pathname.endsWith('/sw.js')){
          const cache=await caches.open(CACHE_NAME);
          const clean=new URL(url.href); clean.search=''; clean.hash='';
          await cache.put(new Request(clean.href),response.clone());
        }
        return response;
      }catch(error){
        const fallback=await caches.match(request) || await caches.match(new Request((()=>{const u=new URL(url.href);u.search='';u.hash='';return u.href;})()));
        if(fallback)return fallback;
        throw error;
      }
    }

    // The vacation archive is deliberately not service-worker-cached.
    if(same && url.pathname.includes('/archief/')) return fetch(request);

    let cached=await caches.match(request);
    if(!cached && same){
      const clean=new URL(url.href); clean.search=''; clean.hash='';
      cached=await caches.match(new Request(clean.href));
    }
    if(cached)return cached;

    try{
      const response=await fetch(request);
      if(response.ok && same){
        const clean=new URL(url.href); clean.search=''; clean.hash='';
        caches.open(CACHE_NAME).then(c=>c.put(new Request(clean.href),response.clone()));
      }
      return response;
    }catch(error){
      if(request.mode==='navigate'){
        const fallback=await caches.match('./index.html');
        if(fallback)return fallback;
      }
      throw error;
    }
  })());
});
