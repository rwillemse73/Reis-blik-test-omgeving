/* Reisblik 9.8.5 — vakantie offline voorbereiden */
(function(){
  'use strict';
  const VERSION='9.8.5';
  const APP_CACHE_NAME='reisblik-app-v9.8.5';
  const OFFLINE_ACTIVE_KEY='reisblik.offline.active';
  const OFFLINE_PREFIX='reisblik-offline-vacation-';
  const byId=id=>document.getElementById(id);
  const sameOrigin=u=>{try{return new URL(u,location.href).origin===location.origin;}catch(e){return false;}};
  function abs(u,base=location.href){try{return new URL(u,base).href;}catch(e){return null;}}
  function vacationName(v){return v?.naam||v?.name||v?.titel||v?.title||v?.id||'Vakantie';}
  function vacationId(v){return String(v?.id||vacationName(v)).trim().toLowerCase().replace(/[^a-z0-9_-]+/g,'-')||'vakantie';}
  function vacationCacheName(v){return OFFLINE_PREFIX+vacationId(v);}
  async function getVacations(){
    const r=await fetch('config/vakanties.json',{cache:'no-store'}); if(!r.ok)throw new Error('HTTP '+r.status);
    const d=await r.json(); return Array.isArray(d.vakanties)?d.vakanties:[];
  }
  function categoryUrls(v){
    const base=String(v?.basePath||'').replace(/^\/+|\/+$/g,''); const p=base?base+'/':'';
    return [p+'locaties/locaties.json',p+'kunst/kunst.json',p+'winkels/winkels.json',p+'horeca/horeca.json'];
  }
  function addLocalResource(url,set,base=location.href){
    const a=abs(url,base); if(a&&sameOrigin(a))set.add(a);
  }
  function collectFromObject(obj,base,set){
    if(!obj)return;
    if(typeof obj==='string'){
      if(/\.(?:html?|json|js|css|png|jpe?g|webp|gif|svg|woff2?|ttf)$/i.test(obj)) addLocalResource(obj,set,base);
      return;
    }
    if(Array.isArray(obj)){obj.forEach(x=>collectFromObject(x,base,set));return;}
    if(typeof obj==='object')Object.entries(obj).forEach(([k,x])=>{
      if(/^(id|naam|name|titel|title|lat|lon|category|categorie)$/i.test(k))return;
      collectFromObject(x,base,set);
    });
  }
  async function fetchJson(url){const r=await fetch(url+'?offlinePrep='+Date.now(),{cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status+' '+url);return r.json();}
  async function prepare(v,status){
    if(!('caches' in window))throw new Error('Lokale cache wordt niet ondersteund door deze browser.');
    const newCacheName=vacationCacheName(v);
    const previousId=localStorage.getItem(OFFLINE_ACTIVE_KEY);
    const previousCacheName=previousId?OFFLINE_PREFIX+previousId:null;
    // Only remove the previous TEMPORARY vacation cache. Never clear localStorage or the app cache.
    if(previousCacheName && previousCacheName!==newCacheName){await caches.delete(previousCacheName);}
    if(previousId && previousId!==vacationId(v)) localStorage.removeItem('reisblik.offline.prepared.'+previousId);
    const cache=await caches.open(newCacheName); const urls=new Set();
    addLocalResource('config/vakanties.json',urls);
    const base=String(v?.basePath||'').replace(/^\/+|\/+$/g,'');
    const prefix=base?base+'/':'';
    let loaded=0;
    // Cache the vacation's category manifests and every location/item content URL they reference.
    for(const rel of categoryUrls(v)){
      try{
        const full=abs(rel); const data=await fetchJson(rel); addLocalResource(rel,urls); loaded++;
        const arr=Array.isArray(data?.locations)?data.locations:[];
        arr.forEach(item=>{
          if(item?.content)addLocalResource(item.content,urls,full);
          if(item?.file)addLocalResource(item.file,urls,full);
          collectFromObject(item,full,urls);
        });
      }catch(e){ /* category may not exist; that is allowed */ }
    }
    // Fixed HTML locations explicitly configured in the vacation.
    if(Array.isArray(v?.htmlLocations))v.htmlLocations.forEach(item=>addLocalResource(prefix+'locaties/'+String(item?.path||item),urls));
    // Fetch HTML resources, then collect local images/styles/scripts referenced inside them.
    const initial=[...urls];
    for(const u of initial){
      if(!/\.html?$/i.test(u))continue;
      try{
        const r=await fetch(u,{cache:'no-store'}); if(!r.ok)continue; await cache.put(u,r.clone());
        const html=await r.text(); const doc=new DOMParser().parseFromString(html,'text/html');
        doc.querySelectorAll('[src],[href]').forEach(el=>{
          const raw=el.getAttribute('src')||el.getAttribute('href'); const a=abs(raw,u); if(a&&sameOrigin(a))urls.add(a);
        });
      }catch(e){}
    }
    let done=0,total=urls.size;
    for(const u of urls){
      try{
        const r=await fetch(u,{cache:'no-store'}); if(r.ok){await cache.put(u,r.clone());done++;}
      }catch(e){}
      status.textContent='Offline voorbereiden… '+done+'/'+total;
    }
    const id=vacationId(v);
    localStorage.setItem('reisblik.offline.prepared.'+id,JSON.stringify({version:VERSION,name:vacationName(v),preparedAt:new Date().toISOString(),files:done,cacheName:newCacheName}));
    localStorage.setItem(OFFLINE_ACTIVE_KEY,id);
    if(navigator.serviceWorker?.controller)navigator.serviceWorker.controller.postMessage({type:'CACHE_URLS',cacheName:newCacheName,urls:[...urls]});
    status.innerHTML='✓ <strong>'+vacationName(v)+'</strong> is offline voorbereid.<br>'+done+' bestanden lokaal opgeslagen.';
  }
  async function open(){
    const modal=byId('offlinePrepareModal'),select=byId('offlineVacationSelect'),status=byId('offlinePrepareStatus');
    if(!modal||!select)return; modal.style.display='flex'; select.innerHTML=''; status.textContent='Vakanties laden…';
    try{const vs=await getVacations();select._vacations=vs;vs.forEach((v,i)=>{const o=document.createElement('option');o.value=i;o.textContent=vacationName(v);select.appendChild(o);});status.textContent='Kies de vakantie die je offline wilt voorbereiden.';}
    catch(e){status.textContent='Vakanties konden niet worden geladen: '+e.message;}
  }
  document.addEventListener('DOMContentLoaded',()=>{
    byId('offlinePrepareBtn')?.addEventListener('click',open);
    byId('offlinePrepareCloseBtn')?.addEventListener('click',()=>byId('offlinePrepareModal').style.display='none');
    byId('offlinePrepareStartBtn')?.addEventListener('click',async()=>{const s=byId('offlineVacationSelect'),st=byId('offlinePrepareStatus');const v=s?._vacations?.[Number(s.value)];if(!v)return;try{await prepare(v,st);}catch(e){st.textContent='Offline voorbereiden mislukt: '+e.message;}});
  });
})();
