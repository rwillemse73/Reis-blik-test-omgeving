/* Reisblik 9.7.5 – Eigen locaties + onderhoudsversie */
let locations=[];
let userLat=null,userLon=null;
let map=L.map('map').setView([52.72,4.88],13);
let markers=[];
let userMarker=null,userCircle=null,userWatchId=null;

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
 maxZoom:19,attribution:'© OpenStreetMap contributors'
}).addTo(map);

function reisblikVakantieStorageKey(baseKey){return window.reisblikVakantie?.getVakantieStorageKey ? window.reisblikVakantie.getVakantieStorageKey(baseKey) : baseKey;}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
function distance(a,b,c,d){
 const R=6371000,p=Math.PI/180,A=(c-a)*p,B=(d-b)*p;
 const q=Math.sin(A/2)**2+Math.cos(a*p)*Math.cos(c*p)*Math.sin(B/2)**2;
 return 2*R*Math.atan2(Math.sqrt(q),Math.sqrt(1-q));
}
function formatDistance(n){return n<1000?Math.round(n)+' m':(n/1000).toFixed(1)+' km';}

async function loadFixedHtmlLocations(){
 const result=[];
 const ctx=window.reisblikVakantie;
 const roots=getActiveDataRoots();
 const configured=ctx?.getActieveVakantieHtmlLocations ? ctx.getActieveVakantieHtmlLocations() : [];
 if(configured.length){
  for(const f0 of configured){
   const f=typeof f0==='string'?{id:String(f0).replace(/\.html$/i,'').split('/').pop(),file:f0}:f0;
   for(const root of roots){
    const relative=String(f.path||f.file||f).replace(/^locaties\//,'');
    const path=[root,'locaties',relative].filter(Boolean).join('/');
    try{
     const response=await fetch(path+'?v='+Date.now(),{cache:'no-store'});
     if(!response.ok)continue;
     const doc=new DOMParser().parseFromString(await response.text(),'text/html');
     const dataEl=doc.querySelector('#location-data');
     if(!dataEl)continue;
     const d=JSON.parse(dataEl.textContent); d.id=f.id; d.content=path; d.userCreated=false; result.push(d); break;
    }catch(e){console.error('Kon '+path+' niet laden',e);}
   }
  }
 }
 return result;
}

async function loadNewLocalHtmlLocations(){
 const result=[];
 try{
  const manifestResponse=await fetch('nieuwe-lok/index.json?v='+Date.now(),{cache:'no-store'});
  if(!manifestResponse.ok) return result;
  const manifest=await manifestResponse.json();
  const files=Array.isArray(manifest)
    ? manifest
    : (Array.isArray(manifest.files) ? manifest.files : []);
  for(const file of files){
   if(typeof file!=='string' || !file.toLowerCase().endsWith('.html')) continue;
   try{
    const response=await fetch('nieuwe-lok/'+file+'?v='+Date.now(),{cache:'no-store'});
    if(!response.ok) continue;
    const doc=new DOMParser().parseFromString(await response.text(),'text/html');
    const dataEl=doc.querySelector('#location-data');
    if(!dataEl) continue;
    const data=JSON.parse(dataEl.textContent);
    if(!data.id) data.id='new-'+file.replace(/\.html$/i,'');
    data.content='nieuwe-lok/'+file;
    data.userCreated=false;
    result.push(data);
   }catch(err){
    console.error('Kon nieuwe-lok/'+file+' niet laden',err);
   }
  }
 }catch(err){
  console.error('nieuwe-lok index.json kon niet worden gelezen',err);
 }
 return result;
}

function getActiveDataRoots(){
 const ctx=window.reisblikVakantie;
 const base=ctx?.getActieveVakantieBasePath ? ctx.getActieveVakantieBasePath() : '';
 const parts=ctx?.getActieveVakantieOnderdelen ? ctx.getActieveVakantieOnderdelen() : [];
 const selected=ctx?.getGeselecteerdeOnderdeelIds ? ctx.getGeselecteerdeOnderdeelIds() : [];
 if(!parts.length) return [base ? base : ''];
 const wanted=new Set(selected.map(String));
 return parts.filter(p=>wanted.has(String(p.id))).map(p=>{
   const partPath=String(p.path||p.id||'').replace(/^\/+|\/+$/g,'');
   return [base,partPath].filter(Boolean).join('/');
 });
}
function getCategorySources(){
 const roots=getActiveDataRoots();
 const make=(key,label)=>({key,label,urls:roots.map(root=>[root,key].filter(Boolean).join('/')+'/'+key+'.json')});
 return [
  make('locaties','📍 Locaties'),
  make('kunst','🎨 Kunst'),
  make('winkels','🛍️ Winkels'),
  make('horeca','🍴 Horeca'),
  make('informatie','ℹ️ Informatie'),
  {key:'evenementen',label:'📅 Evenementen',urls:[],virtual:true}
 ];
}
let CATEGORY_SOURCES=getCategorySources();
let activeCategory='locaties';
let selectedCategories=new Set(['locaties','kunst','winkels','horeca','informatie','evenementen']);
let categoryData={};
let openOnly=false;
let openingStatusCache={};

function categoryBase(key){
 const s=CATEGORY_SOURCES.find(x=>x.key===key);
 return s ? new URL(s.url,location.href) : new URL('./',location.href);
}

async function loadCategory(key){
 const s=CATEGORY_SOURCES.find(x=>x.key===key);
 if(!s || s.virtual)return [];
 const merged=[];
 for(const url of (s.urls||[])){
  try{
   const response=await fetch(url+'?v='+Date.now(),{cache:'no-store'});
   if(!response.ok)continue;
   const data=await response.json();
   if(Array.isArray(data.locations))merged.push(...data.locations);
  }catch(e){console.warn('Kon '+url+' niet laden',e);}
 }
 categoryData[key]=merged;
 return merged;
}

async function loadLocations(){
 try{
  const loading=document.getElementById('vakantieStatus');
  if(loading && window.reisblikVakantie?.getActieveVakantieNaam) {
   const naam=window.reisblikVakantie.getActieveVakantieNaam();
   if(naam && window.reisblikVakantieLoading?.toonLaden) window.reisblikVakantieLoading.toonLaden(naam);
  }
  CATEGORY_SOURCES=getCategorySources();
  const loaded={};
  for(const s of CATEGORY_SOURCES) loaded[s.key]=await loadCategory(s.key);

  // Existing 5.1.5 fixed/local mechanisms remain available.
  const fixedHtml=await loadFixedHtmlLocations();
  const fixedIds=new Set(fixedHtml.map(x=>x.id));
  const newLocalHtml=await loadNewLocalHtmlLocations();

  const combined=[];
  for(const s of CATEGORY_SOURCES){
   for(const x of (loaded[s.key]||[])){
    if(!fixedIds.has(x.id)){
      combined.push(normalizeLocation({...x,category:s.key,content:x.content||x.html||x.file}, s.key));
    }
   }
  }

  const knownIds=new Set([...fixedHtml,...combined].map(x=>x.id));
  const uniqueNewLocalHtml=newLocalHtml.filter(x=>!knownIds.has(x.id));

  locations=fixedHtml.map(x=>normalizeLocation(x,'locaties'))
    .concat(combined)
    .concat(uniqueNewLocalHtml.map(x=>normalizeLocation(x,x.category||'locaties')))
    .concat(getUserLocations().map(x=>normalizeLocation({...x,userCreated:true,category:x.category||'locaties'},x.category||'locaties')));

  const counts=CATEGORY_SOURCES.filter(s=>!s.virtual).map(s=>s.label+': '+((loaded[s.key]||[]).length)).join(' · ');
  document.getElementById('message').innerHTML='<div class="status">✓ '+counts+' · HTML: '+fixedHtml.length+'</div>';

  drawMarkers();render();
  // Start the existing GPS watch automatically after the active vacation is loaded.
  startLocationWatch();
  if(window.reisblikVakantieLoading?.verbergLaden) window.reisblikVakantieLoading.verbergLaden();
  const vakantieStatus=document.getElementById('vakantieStatus');
  if(vakantieStatus && window.reisblikVakantie?.getActieveVakantieNaam) vakantieStatus.textContent='Actieve vakantie: '+window.reisblikVakantie.getActieveVakantieNaam();
 }catch(e){
  document.getElementById('status').textContent='Locaties konden niet worden geladen.';
  document.getElementById('message').innerHTML='<div class="error">Locaties konden niet worden geladen: '+esc(e.message)+'</div>';
 }
}

function renderCategoryButtons(){
 let bar=document.getElementById('categoryBar');
 if(!bar){
  bar=document.createElement('div');
  bar.id='categoryBar';
  bar.style.cssText='display:flex;gap:14px;flex-wrap:wrap;align-items:center;padding:10px 14px;background:#fff;border-bottom:1px solid #ddd';
  const near=document.getElementById('nearbyBar');
  near?.after(bar);
 }
 bar.innerHTML='<button type="button" class="my-position-button" style="background:#000 !important;background-color:#000 !important;color:#fff !important;border:1px solid #000 !important;" onclick="myPosition()">📍 Mijn positie</button>'+
  '<span style="font-weight:700">Toon op kaart:</span>'+
  CATEGORY_SOURCES.map(src=>
   '<label style="display:flex;align-items:center;gap:6px;cursor:pointer">'+
   '<input type="checkbox" class="category-filter" data-category="'+esc(src.key)+'" '+
   (selectedCategories.has(src.key)?'checked':'')+
   ' onchange="toggleCategory(\''+src.key+'\',this.checked)" style="width:auto;margin:0">'+
   '<span>'+esc(src.label)+'</span></label>'
  ).join('')+
  '<label style="display:flex;align-items:center;gap:6px;cursor:pointer">'+
   '<input type="checkbox" id="openOnlyFilter" '+(openOnly?'checked':'')+
   ' onchange="toggleOpenOnly(this.checked)" style="width:auto;margin:0">'+
   '<span>Alleen geopend</span>'+
  '</label>';
}

const DAY_NUMBER={maandag:1,ma:1,dinsdag:2,di:2,woensdag:3,wo:3,donderdag:4,do:4,vrijdag:5,vr:5,zaterdag:6,za:6,zondag:0,zo:0};
const OPEN_CHECK_CATEGORIES=new Set(['horeca','kunst','winkels']);

function dayNumber(v){
 const k=String(v??'').toLowerCase().trim().replace(/\./g,'');
 return DAY_NUMBER[k];
}

function minutesFromTime(v){
 const m=String(v??'').trim().replace('.',':').match(/^(\d{1,2})(?::(\d{2}))?$/);
 if(!m)return null;
 const h=Number(m[1]), min=m[2]===undefined?0:Number(m[2]);
 if(h>23||min>59)return null;
 return h*60+min;
}

function addInterval(schedule,days,a,b){
 for(const d of days){
  if(!schedule[d])schedule[d]=[];
  schedule[d].push([a,b]);
 }
}

function parseTimeRanges(text){
 const out=[];
 const re=/(\d{1,2}(?:[.:]\d{2})?)\s*(?:-|–|—|tot|t\/m)\s*(\d{1,2}(?:[.:]\d{2})?)/gi;
 let m;
 while((m=re.exec(text))!==null){
  const a=minutesFromTime(m[1]),b=minutesFromTime(m[2]);
  if(a!==null&&b!==null)out.push([a,b]);
 }
 return out;
}

function parseDayList(text){
 const days=[];
 const re=/(maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag|ma|di|wo|do|vr|za|zo)/gi;
 let m;
 while((m=re.exec(text))!==null){
  const d=dayNumber(m[1]);
  if(d!==undefined&&!days.includes(d))days.push(d);
 }
 return days;
}

function expandDayRange(a,b){
 const out=[];
 if(a===undefined||b===undefined)return out;
 let d=a;
 while(true){
  if(!out.includes(d))out.push(d);
  if(d===b)break;
  d=(d+1)%7;
  if(out.length>7)break;
 }
 return out;
}

function parseOpeningHoursText(text){
 if(!text)return null;
 const raw=String(text)
  .replace(/\u00a0/g,' ')
  .replace(/\r/g,'\n')
  .replace(/[–—]/g,'-');

 const lines=raw.split(/\n+/).map(x=>x.trim()).filter(Boolean);
 const schedule={};
 let recognizedDayInfo=false;
 let recognizedOpeningInfo=false;

 for(let i=0;i<lines.length;i++){
  const line=lines[i];
  const lower=line.toLowerCase();

  // Ignore navigation/metadata lines that contain no opening information.
  const dayMatches=parseDayList(line);
  if(!dayMatches.length)continue;
  recognizedDayInfo=true;

  // Support: maandag t/m vrijdag 10:00-17:00
  const rangeMatch=lower.match(/(maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag|ma|di|wo|do|vr|za|zo)\s*(?:t\/m|tot en met|-)\s*(maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag|ma|di|wo|do|vr|za|zo)/i);
  let days=dayMatches;

  if(rangeMatch){
   const a=dayNumber(rangeMatch[1]), b=dayNumber(rangeMatch[2]);
   days=expandDayRange(a,b);
  }

  const ranges=parseTimeRanges(line);
  if(ranges.length){
   for(const [a,b] of ranges)addInterval(schedule,days,a,b);
   recognizedOpeningInfo=true;
   continue;
  }

  if(/\b(gesloten|dicht|closed)\b/i.test(line)){
   for(const d of days) if(!schedule[d])schedule[d]=[];
   recognizedOpeningInfo=true;
   continue;
  }

  // Support HTML where the day is on one line and the time is on the next line.
  if(i+1<lines.length){
   const next=lines[i+1];
   const nextRanges=parseTimeRanges(next);
   if(nextRanges.length && !parseDayList(next).length){
    for(const [a,b] of nextRanges)addInterval(schedule,days,a,b);
    recognizedOpeningInfo=true;
   }else if(/\b(gesloten|dicht|closed)\b/i.test(next) && !parseDayList(next).length){
    for(const d of days) if(!schedule[d])schedule[d]=[];
    recognizedOpeningInfo=true;
   }
  }
 }

 // Also support compact text where the schedule is separated by semicolons/pipes.
 if(!recognizedOpeningInfo){
  const chunks=raw.split(/[;|]+/).map(x=>x.trim()).filter(Boolean);
  for(const chunk of chunks){
   const days=parseDayList(chunk);
   if(!days.length)continue;
   recognizedDayInfo=true;
   const rangeMatch=chunk.toLowerCase().match(/(maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag|ma|di|wo|do|vr|za|zo)\s*(?:t\/m|tot en met|-)\s*(maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag|ma|di|wo|do|vr|za|zo)/i);
   const actualDays=rangeMatch?expandDayRange(dayNumber(rangeMatch[1]),dayNumber(rangeMatch[2])):days;
   const ranges=parseTimeRanges(chunk);
   if(ranges.length){
    for(const [a,b] of ranges)addInterval(schedule,actualDays,a,b);
    recognizedOpeningInfo=true;
   }else if(/\b(gesloten|dicht|closed)\b/i.test(chunk)){
    for(const d of actualDays)if(!schedule[d])schedule[d]=[];
    recognizedOpeningInfo=true;
   }
  }
 }

 if(!recognizedDayInfo || !recognizedOpeningInfo)return null;
 return schedule;
}

function openingHoursFromEmbeddedData(doc){
 const el=doc.querySelector('#location-data');
 if(!el)return null;
 try{
  const data=JSON.parse(el.textContent);
  for(const key of ['openingHours','opening_hours','openingstijden','openingstijdenText','hours','hoursText','openingTimes','opening_times']){
   if(data && data[key]!==undefined){
    const v=data[key];
    const parsed=typeof v==='string' ? parseOpeningHoursText(v) : parseOpeningObject(v);
    if(parsed)return parsed;
   }
  }
 }catch(e){}
 return null;
}

function parseOpeningObject(obj){
 if(!obj || typeof obj!=='object')return null;
 const schedule={}; let foundDay=false,foundInfo=false;
 for(const [key,value] of Object.entries(obj)){
  const d=dayNumber(key);
  if(d===undefined)continue;
  foundDay=true;
  const text=Array.isArray(value)?value.join(' '):String(value??'');
  const ranges=parseTimeRanges(text);
  if(ranges.length){
   ranges.forEach(([a,b])=>addInterval(schedule,[d],a,b));
   foundInfo=true;
  }else if(/\b(gesloten|dicht|closed)\b/i.test(text)){
   schedule[d]=[];
   foundInfo=true;
  }
 }
 return foundDay&&foundInfo?schedule:null;
}

function contentUrlCandidates(x){
 const candidates=[];
 if(!x || !x.content)return candidates;
 const raw=String(x.content).trim().replace(/^\.\//,'');
 if(!raw)return candidates;
 try{
  if(/^(https?:)?\/\//i.test(raw) || raw.startsWith('/') || raw.startsWith('../')){
   candidates.push(new URL(raw,location.href).href);
   return [...new Set(candidates)];
  }
  const base=window.reisblikVakantie?.getActieveVakantieBasePath ? window.reisblikVakantie.getActieveVakantieBasePath() : '';
  const cat=userLocationCategory(x);
  const prefix=base?base+'/':'';

  // Exact stored path first.
  if(base && (raw===base || raw.startsWith(base+'/'))) candidates.push(new URL(raw,location.href).href);
  else if(raw.toLowerCase().startsWith(cat.toLowerCase()+'/')) candidates.push(new URL(prefix+raw,location.href).href);
  else candidates.push(new URL(prefix+cat+'/'+raw,location.href).href);

  // Legacy Praag sublocation path: keep the EXISTING filename, change only folder.
  if(raw.includes('/sublocaties/')){
   const fixed=raw.replace('/sublocaties/','/locaties/');
   candidates.push(new URL(prefix+fixed,location.href).href);
  }

  // If a legacy path was stored without the vacation prefix, also try the
  // active vacation's Praag locations folder with the same basename.
  if(/(^|\/)praag\/sublocaties\//i.test(raw)){
   const basename=raw.split('/').pop();
   candidates.push(new URL(prefix+'praag/locaties/'+basename,location.href).href);
  }

  return [...new Set(candidates)];
 }catch(e){ return []; }
}

function resolveContentUrl(x){
 const list=contentUrlCandidates(x);
 return list.length?list[0]:null;
}

async function fetchContentHtml(x, queryName){
 const candidates=contentUrlCandidates(x);
 let lastError=null;
 for(const url of candidates){
  try{
   const sep=url.includes('?')?'&':'?';
   const response=await fetch(url+sep+(queryName||'v')+'='+Date.now(),{cache:'no-store'});
   if(response.ok) return {response,url};
   lastError=new Error('HTTP '+response.status+' voor '+url);
  }catch(e){ lastError=e; }
 }
 throw lastError||new Error('Geen geldig HTML-pad gevonden');
}

async function readOpeningHoursFromHtml(x){
 try{
  const fetched=await fetchContentHtml(x,'openhours');
  const response=fetched.response;
  const html=await response.text();
  const doc=new DOMParser().parseFromString(html,'text/html');

  // The HTML file itself is the primary source. Check visible text first.
  const bodyText=doc.body?.innerText||doc.body?.textContent||'';
  const parsed=parseOpeningHoursText(bodyText);
  if(parsed)return parsed;

  // Then check structured location data embedded in the same HTML.
  return openingHoursFromEmbeddedData(doc);
 }catch(e){
  console.warn('Openingstijden niet leesbaar voor',x?.name,e);
  return null;
 }
}

async function getOpeningStatus(x){
 const category=userLocationCategory(x);
 if(!OPEN_CHECK_CATEGORIES.has(category))return true;

 const id=String(x.id);
 if(Object.prototype.hasOwnProperty.call(openingStatusCache,id))return openingStatusCache[id];

 const hours=await readOpeningHoursFromHtml(x);
 if(!hours){
  // Geen bruikbare dagen/tijden gevonden: tonen.
  openingStatusCache[id]=null;
  return null;
 }

 const now=new Date();
 const day=now.getDay();
 const mins=now.getHours()*60+now.getMinutes();

 // Als een openingsschema dagen noemt en vandaag ontbreekt, is vandaag gesloten.
 if(!Object.prototype.hasOwnProperty.call(hours,day)){
  openingStatusCache[id]=false;
  return false;
 }

 const intervals=hours[day]||[];
 const isOpen=intervals.some(([a,b])=>
  a<=b ? mins>=a&&mins<b : mins>=a||mins<b
 );
 openingStatusCache[id]=isOpen;
 return isOpen;
}

function passesOpenOnly(x){
 if(!openOnly)return true;
 const category=userLocationCategory(x);
 if(!OPEN_CHECK_CATEGORIES.has(category))return true;
 const id=String(x.id);
 if(!Object.prototype.hasOwnProperty.call(openingStatusCache,id))return true;
 const status=openingStatusCache[id];
 return status===null ? true : status===true;
}

async function toggleOpenOnly(checked){
 openOnly=!!checked;
 updateCategoryButtons();
 if(openOnly){
  const targets=locations.filter(x=>
   OPEN_CHECK_CATEGORIES.has(userLocationCategory(x))
  );
  await Promise.all(targets.map(getOpeningStatus));
 }
 render();
 if(typeof drawMarkers==='function')drawMarkers();
}

function updateCategoryButtons(){
 document.querySelectorAll('.category-filter').forEach(cb=>{
   cb.checked=selectedCategories.has(cb.dataset.category);
 });
}
function toggleCategory(key,checked){
 if(checked) selectedCategories.add(key);
 else selectedCategories.delete(key);
 updateCategoryButtons();
 render();
 if(typeof drawMarkers==='function') drawMarkers();
}

const originalRender=render;
render=function(){
 originalRender();
 document.querySelectorAll('#locations .card').forEach(card=>{
   const id=card.id.replace(/^card-/,'');
   const x=locations.find(a=>String(a.id)===id);
   if(x) card.style.display=(x && selectedCategories.has(userLocationCategory(x)) && passesOpenOnly(x))?'':'none';
 });
 updateCategoryButtons();
 if(typeof drawMarkers==='function') drawMarkers();
};

renderCategoryButtons();
function normalizeLocation(x, category){
  if(!x) return x;
  const lat = x.lat ?? x.latitude;
  const lon = x.lon ?? x.longitude;
  const name = x.name ?? x.naam ?? x.title ?? x.id ?? 'Onbekende locatie';
  const content = x.content ?? x.html ?? x.file;
  return {
    ...x,
    id: x.id ?? ('loc-'+Date.now()+'-'+Math.random().toString(36).slice(2,7)),
    name,
    lat: Number(lat),
    lon: Number(lon),
    content,
    category: x.category || category
  };
}

function categorySymbol(category){
  return ({locaties:'📍',kunst:'🎨',winkels:'🛍️',horeca:'🍴',informatie:'ℹ️',evenementen:'📅'})[category||'locaties']||'📍';
}
function categoryIcon(category){
  const symbol=categorySymbol(category);
  return L.divIcon({
    className:'trekvogel-category-marker',
    html:'<span aria-label="'+esc(category||'locaties')+'">'+symbol+'</span>',
    iconSize:[34,34],
    iconAnchor:[17,17],
    popupAnchor:[0,-17]
  });
}

function userLocationCategory(x){
 const c=x && (x.category||x.type);
 return ['locaties','kunst','winkels','horeca','evenementen'].includes(c)?c:'locaties';
}

function drawMarkers(){
 markers.forEach(m=>map.removeLayer(m));markers=[];
 locations.forEach(x=>{
  if(!selectedCategories.has(userLocationCategory(x)))return;
  if(!passesOpenOnly(x))return;
  if(!Number.isFinite(Number(x.lat))||!Number.isFinite(Number(x.lon)))return;
  const id=String(x.id);
  const popup=
    '<div class="marker-popup">'+
    '<div style="font-weight:700;font-size:16px">'+esc(x.name)+'</div>'+ 
    (x.address?'<div style="margin:3px 0 8px;color:#555">'+esc(x.address)+'</div>':'')+
    '<div style="display:flex;gap:6px;flex-wrap:wrap">'+
    '<button type="button" class="map-action" onclick="openLocationFromMap(\''+esc(id)+'\')">📖 Bekijk</button>'+
    '<button type="button" class="map-action" onclick="return openNavigationToLocationById(\''+esc(id)+'\')">🧭 Navigeer</button>'+
    '</div></div>';
  const m=L.marker([x.lat,x.lon],{icon:categoryIcon(userLocationCategory(x))}).addTo(map).bindPopup(popup);
  m._locationId=x.id;
  markers.push(m);
 });

 // Locally saved agenda events are shown as a separate map category.
 // They deliberately stay outside the normal location array.
 if(selectedCategories.has('evenementen') && typeof window.reisblikAgendaGetEvenementen==='function'){
  window.reisblikAgendaGetEvenementen().forEach(ev=>{
   const lat=Number(ev.lat), lon=Number(ev.lon);
   if(!Number.isFinite(lat)||!Number.isFinite(lon))return;
   const popup='<div class="marker-popup">'+
     '<div style="font-weight:700;font-size:16px">📅 '+esc(ev.name||'Evenement')+'</div>'+
     (ev.date?'<div style="margin-top:4px"><strong>Datum:</strong> '+esc(ev.date)+'</div>':'')+
     (ev.location?'<div style="margin-top:3px;color:#555">'+esc(ev.location)+'</div>':'')+
     (ev.type?'<div style="margin-top:3px"><strong>Type:</strong> '+esc(ev.type)+'</div>':'')+
     (ev.organizer?'<div style="margin-top:3px"><strong>Organisator:</strong> '+esc(ev.organizer)+'</div>':'')+
     '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">'+
     '<button type="button" class="map-action" onclick="reisblikOpenAgenda()">📅 Agenda</button>'+
     '</div></div>';
   const m=L.marker([lat,lon],{icon:categoryIcon('evenementen')}).addTo(map).bindPopup(popup);
   m._agendaEventId=ev.id||null;
   markers.push(m);
  });
 }
}
function renderNearbyBar(){
 const el=document.getElementById('nearbyList');
 if(!el)return;
 if(userLat===null){
  el.textContent='Druk op 🧪 Testpositie of 📍 Mijn locatie.';
  return;
 }
 const nearby=locations
  .map(x=>({...x,distance:distance(userLat,userLon,x.lat,x.lon)}))
  .filter(x=>x.distance<=500 && selectedCategories.has(userLocationCategory(x)) && passesOpenOnly(x))
  .sort((a,b)=>a.distance-b.distance);

 if(!nearby.length){
  el.innerHTML='<span style="font-weight:400;color:#6c777b">Geen locaties binnen 500 meter.</span>';
  return;
 }
 el.innerHTML=nearby.map(x=>`
   <div style="display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid #eee;cursor:pointer"
        onclick="openLocationFromMap('${esc(x.id)}')">
     <span>📍 ${esc(x.name)}</span>
     <strong>${formatDistance(x.distance)}</strong>
   </div>`).join('');
}

function startLocationWatch(){
 if(!navigator.geolocation)return;
 if(userWatchId!==null)navigator.geolocation.clearWatch(userWatchId);
 userWatchId=navigator.geolocation.watchPosition(
  p=>{
   userLat=p.coords.latitude;
   userLon=p.coords.longitude;
   updateUserMarker();
   renderNearbyBar();
   updateVisibleLocationDistances();
  },
  ()=>{},
  {enableHighAccuracy:true,maximumAge:5000,timeout:15000}
 );
}

function updateVisibleLocationDistances(){
 if(userLat===null||userLon===null)return;

 const nearby=locations
  .map(x=>({...x,distance:distance(userLat,userLon,x.lat,x.lon)}))
  .sort((a,b)=>a.distance-b.distance);
 const within=nearby.filter(x=>x.distance<=500);
 const nextIds=within.map(x=>String(x.id)).join('|');
 const previousIds=window.__visibleLocationIds||'';

 document.getElementById('status').textContent=
  within.length+' locatie(s) binnen 500 meter · 250 m is de verhaalzone · positie '+
  userLat.toFixed(5)+', '+userLon.toFixed(5);

 // Only rebuild the cards when the set of visible locations changes.
 // Normal GPS movement updates the existing cards in place.
 if(nextIds!==previousIds){
  // Terwijl een locatie-detail geopend is mag een nieuwe GPS-locatie niet
  // de hele lijst opnieuw opbouwen. Dat zou de gebruiker uit zijn verhaal
  // laten springen. De detailweergave blijft staan; bij verlaten/nieuw
  // openen van een andere locatie wordt de lijst weer normaal bijgewerkt.
  if(!window.__reisblikDetailLocationId){
   render();
  }
  return;
 }

 within.forEach(x=>{
  const card=document.getElementById('card-'+esc(x.id));
  if(!card)return;

  const meta=card.querySelector('.meta');
  if(meta){
   meta.textContent=(x.type||'')+' · '+formatDistance(x.distance)+' · '+(x.address||'');
  }

  const distanceBox=card.querySelector('[data-distance-display]');
  if(distanceBox){
   distanceBox.innerHTML='📍 '+formatDistance(x.distance)+
    ' <span style="font-size:13px;font-weight:400;color:#6c777b"> vanaf jouw positie</span>';
  }

  const story=card.querySelector('#story-'+esc(x.id));
  if(story && !isLocalLocation(x) && x.distance<=250 &&
     story.textContent.includes('Buiten 250 meter')){
   loadStory(x,false);
  }
 });
}


function updateUserMarker(){
 if(userLat==null)return;
 if(userMarker)map.removeLayer(userMarker);
 if(userCircle)map.removeLayer(userCircle);
 userMarker=L.circleMarker([userLat,userLon],{radius:8,weight:3,fillOpacity:.9}).addTo(map).bindPopup('<b>Jouw positie</b>');
 userCircle=L.circle([userLat,userLon],{radius:250,weight:1,fillOpacity:.05}).addTo(map);
}



function locationEditButton(x){
 if(!isLocalLocation(x))return '';
 return '<button type="button" title="Locatie bewerken" aria-label="Locatie bewerken" onclick="openEditLocation(\''+esc(x.id)+'\')" style="padding:4px 8px;font-size:18px;border:1px solid #c9d2d6;border-radius:8px;background:#f5f7f8;cursor:pointer">✏️</button>';
}

function renderOriginal(){
 if(userLat===null){
  // Bezocht must be usable without GPS. Show the selected location
  // categories without applying the 500 m distance filter. Distance is
  // explicitly shown as unknown until a position is available.
  const available=locations
    .filter(x=>selectedCategories.has(userLocationCategory(x)))
    .filter(x=>passesOpenOnly(x))
    .sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));

  document.getElementById('status').textContent=
    available.length+' locatie(s) beschikbaar · GPS niet actief';

  document.getElementById('locations').innerHTML=available.length?
    available.map(x=>`
      <div class="card" id="card-${esc(x.id)}">
       <h2 style="display:flex;align-items:center;gap:8px">${esc(x.name)}${locationEditButton(x)}</h2>${reisblikVisitedHtml(x.id,x.name,x.category)}
       <div class="meta">${esc(x.type||'')} · afstand onbekend · ${esc(x.address||'')}</div>
       <div data-distance-display style="font-size:18px;font-weight:700;margin:8px 0">
         📍 <span style="font-size:13px;font-weight:400;color:#6c777b">afstand wordt bepaald zodra je Mijn locatie gebruikt</span>
       </div>
       <div class="story" id="story-${esc(x.id)}">
         ${isLocalLocation(x)
           ? ((x.description?'<p>'+esc(x.description)+'</p>':'')+
              (x.story?'<p>'+esc(x.story).replace(/\n/g,'<br>')+'</p>':'<p class="meta">Nog geen tekst toegevoegd.</p>'))
           : '<span class="meta">GPS is niet actief — klik op de locatie om het verhaal te bekijken.</span>'}
       </div>
       <div style="margin-top:10px">
         <button type="button" onclick="openSimpleExtra('${esc(x.id)}')">➕ Extra informatie</button>
         <div id="simple-extra-${esc(x.id)}"></div>
       </div>
       ${isLocalLocation(x)?'<div style="margin-top:8px"><button type="button" onclick="deleteUserLocation(\''+esc(x.id)+'\')" style="background:#a33">🗑️ Locatie verwijderen</button></div>':''}
      </div>`).join(''):
    '<div class="card">Geen locaties beschikbaar.</div>';

  window.__visibleLocationIds=available.map(x=>String(x.id)).join('|');
  renderAllSimpleExtra();
  available.filter(x=>isLocalLocation(x)).forEach(x=>window.reisblikVoorlezen?.add(document.getElementById('story-'+esc(x.id))));
  return;
 }
 const nearby=locations
  .map(x=>({...x,distance:distance(userLat,userLon,x.lat,x.lon)}))
  .filter(x=>selectedCategories.has(userLocationCategory(x)) && passesOpenOnly(x))
  .sort((a,b)=>a.distance-b.distance);
 const within=nearby.filter(x=>x.distance<=500);
 document.getElementById('status').textContent=within.length+' locatie(s) binnen 500 meter · 250 m is de verhaalzone · positie '+userLat.toFixed(5)+', '+userLon.toFixed(5);
 document.getElementById('locations').innerHTML=within.length?
  within.map(x=>`
   <div class="card" id="card-${esc(x.id)}">
    <h2 style="display:flex;align-items:center;gap:8px">${esc(x.name)}${locationEditButton(x)}</h2>${reisblikVisitedHtml(x.id,x.name,x.category)}
    <div class="meta">${esc(x.type)} · ${formatDistance(x.distance)} · ${esc(x.address||'')}</div>
    <div data-distance-display style="font-size:22px;font-weight:700;margin:8px 0">📍 ${formatDistance(x.distance)}
      <span style="font-size:13px;font-weight:400;color:#6c777b"> vanaf jouw positie</span>
    </div>
    <div class="story" id="story-${esc(x.id)}">
      ${isLocalLocation(x)
        ? ((x.description?'<p>'+esc(x.description)+'</p>':'')+
           (x.story?'<p>'+esc(x.story).replace(/\n/g,'<br>')+'</p>':'<p class="meta">Nog geen extra tekst toegevoegd.</p>'))
        : (x.distance<=250?'Verhaal wordt geladen…':'<span class="meta">Buiten 250 meter — klik op de locatie om het verhaal te bekijken.</span>')}
    </div>
    <div style="margin-top:10px">
      <button type="button" onclick="openSimpleExtra('${esc(x.id)}')">➕ Extra informatie</button>
      <div id="simple-extra-${esc(x.id)}"></div>
    </div>
    ${isLocalLocation(x)?'<div style="margin-top:8px"><button type="button" onclick="deleteUserLocation(\''+esc(x.id)+'\')" style="background:#a33">🗑️ Locatie verwijderen</button></div>':''}
   </div>`).join(''):
  '<div class="card">Geen locaties binnen 500 meter.</div>';
 within.filter(x=>x.distance<=250).forEach(x=>loadStory(x,false));
 within.filter(x=>isLocalLocation(x)).forEach(x=>window.reisblikVoorlezen?.add(document.getElementById('story-'+esc(x.id))));
 window.__visibleLocationIds=within.map(x=>String(x.id)).join('|');
 renderAllSimpleExtra();
}
function render(){ renderOriginal(); }

function reisblikFixedHtmlVisited(x, storyEl){
 const existing=storyEl.querySelector('.reisblik-fixed-visited');
 if(existing) return;
 const control=document.createElement('div');
 control.className='reisblik-fixed-visited';
 control.innerHTML=reisblikVisitedHtml(x.id,x.name,x.category);
 storyEl.insertBefore(control,storyEl.firstChild);
 // The card already has the same control. Hide that outer copy once the
 // fixed HTML has been successfully loaded, so there is never a duplicate.
 const card=document.getElementById('card-'+x.id);
 const outer=card ? card.querySelector(':scope > .reisblik-visited') : null;
 if(outer) outer.style.display='none';
}
async function loadStory(x,clicked){
 const el=document.getElementById('story-'+x.id);if(!el)return;
 if(x.userCreated){
  el.innerHTML=
   (x.description?'<p>'+esc(x.description)+'</p>':'')+
   (x.story?'<p>'+esc(x.story).replace(/\n/g,'<br>')+'</p>':'<p class="meta">Nog geen tekst toegevoegd.</p>')+
   (x.photo?'<div class="location-photo-placeholder"><img class="location-photo" src="'+x.photo+'" alt="'+esc(x.name)+'"></div>':'');
  window.reisblikVoorlezen?.add(el);
  el.insertAdjacentHTML('beforeend','<div class="content-meta">Eigen locatie · lokaal opgeslagen</div>');
  return;
 }
 try{
  const fetched=await fetchContentHtml(x,'v');
  const response=fetched.response;
  const html=await response.text();
  const doc=new DOMParser().parseFromString(html,'text/html');

  // Resolve every relative resource against the actual URL from which
  // this location HTML was loaded. This is the important part for
  // images such as <img src="ruinekerk.jpg">.
  const locationBase=new URL(response.url);
  doc.querySelectorAll('[src]').forEach(node=>{
   const value=node.getAttribute('src');
   if(value && !/^(data:|blob:|https?:|\/\/|#)/i.test(value)){
    node.setAttribute('src',new URL(value,locationBase).href);
   }
  });
  doc.querySelectorAll('[href]').forEach(node=>{
   const value=node.getAttribute('href');
   if(value && !/^(data:|blob:|https?:|\/\/|#|javascript:|mailto:)/i.test(value)){
    node.setAttribute('href',new URL(value,locationBase).href);
   }
  });

  const article=doc.querySelector('article');
  el.innerHTML=(article?article.innerHTML:doc.body.innerHTML);
  window.reisblikVoorlezen?.add(el);
  el.insertAdjacentHTML('beforeend','<div class="content-meta">Tekst vastgelegd: <b>22 augustus 2026</b> · Contentversie: <b>v6.5.7</b></div>');
  // Fixed HTML content gets the same central Bezocht control as app-generated
  // cards. The control is supplied by visited.js; the fixed HTML files
  // themselves do not need individual JavaScript implementations.
  reisblikFixedHtmlVisited(x,el);

  // Keep locally referenced images visible after the imported HTML is
  // inserted. If an image fails, show a small diagnostic instead of
  // silently changing the rest of the location page.
  el.querySelectorAll('img').forEach(img=>{
   img.addEventListener('error',()=>{
    img.style.display='none';
    const note=document.createElement('div');
    note.className='error';
    note.textContent='Afbeelding kon niet worden geladen: '+img.getAttribute('src');
    img.parentNode?.insertBefore(note,img.nextSibling);
   },{once:true});
  });
 }catch(e){
  console.error('Het locatieverhaal kon niet worden geladen:',e);
  el.textContent='Het locatieverhaal kon niet worden geladen.';
 }
}
function openLocationFromMap(id){
 window.reisblikVoorlezen?.stop();
 const x=locations.find(a=>a.id===id);if(!x)return;
 window.__reisblikDetailLocationId=String(id);
 if(userLat!==null)x.distance=distance(userLat,userLon,x.lat,x.lon);
 let card=document.getElementById('card-'+id);
 if(!card){
  // A map marker can be opened even when the location is outside the normal 500 m list.
  const container=document.getElementById('locations');
  const temp=document.createElement('div');
  temp.className='card';
  temp.id='card-'+x.id;
  temp.innerHTML='<h2 style="display:flex;align-items:center;gap:8px">'+esc(x.name)+locationEditButton(x)+'</h2>'+reisblikVisitedHtml(x.id,x.name,x.category)+'<div class="meta">'+esc(x.type||'')+' · '+(typeof x.distance==='number'?formatDistance(x.distance):'')+' · '+esc(x.address||'')+'</div>'+
    '<div style="font-size:22px;font-weight:700;margin:8px 0">📍 '+(typeof x.distance==='number'?formatDistance(x.distance):'')+
    ' <span style="font-size:13px;font-weight:400;color:#6c777b">vanaf jouw positie</span></div>'+
    '<div class="story" id="story-'+esc(x.id)+'">'+
    (isLocalLocation(x)?((x.description?'<p>'+esc(x.description)+'</p>':'')+(x.story?'<p>'+esc(x.story).replace(/\n/g,'<br>')+'</p>':'<p class="meta">Nog geen extra tekst toegevoegd.</p>')):'')+
    '</div>'+
    '<div style="margin-top:10px"><button type="button" onclick="openSimpleExtra(\''+esc(x.id)+'\')">➕ Extra informatie</button><div id="simple-extra-'+esc(x.id)+'"></div></div>'+
    (isLocalLocation(x)?'<div style="margin-top:8px"><button type="button" onclick="deleteUserLocation(\''+esc(x.id)+'\')" style="background:#a33">🗑️ Locatie verwijderen</button></div>':'');
  container.prepend(temp);
  card=temp;
  renderSimpleExtra(x.id);
 }
 card.scrollIntoView({behavior:'smooth'});
 loadStory(x,x.distance>250);
}
function isLocalLocation(x){
 if(!x)return false;
 return getUserLocations().some(item=>item.id===x.id);
}
let editingLocationId=null;
let pendingEditGeocode=null;
let editingPhotoData=null;
let editingPhotoName='';

function openEditLocation(id){
 const activeId=window.reisblikVakantie?.getActieveVakantieId ? window.reisblikVakantie.getActieveVakantieId() : '';
 if(!activeId){alert('Kies eerst een actieve vakantie.');return;}
 const key=String(id);
 const x=locations.find(a=>String(a.id)===key);
 if(!x || !isLocalLocation(x)){alert('Alleen lokaal opgeslagen locaties kunnen worden bewerkt.');return;}
 editingLocationId=key; pendingEditGeocode=null; editingPhotoData=null; editingPhotoName='';
 document.getElementById('editName').value=x.name||'';
 document.getElementById('editAddress').value=x.address||'';
 document.getElementById('editType').value=userLocationCategory(x);
 document.getElementById('editDescription').value=x.description||'';
 document.getElementById('editStory').value=x.story||'';
 document.getElementById('editRemovePhoto').checked=false;
 const input=document.getElementById('editLocationPhoto'); const preview=document.getElementById('editLocationPhotoPreview');
 if(input)input.value='';
 if(preview){preview.innerHTML=x.photo?'<img class="location-photo" style="max-width:260px;width:auto;height:auto;display:block" alt="Huidige foto">':'';if(x.photo)preview.querySelector('img').src=x.photo;}
 document.getElementById('editGeocodeResult').textContent='Bestaande GPS-coördinaten worden behouden tenzij je een nieuwe locatie kiest.';
 document.getElementById('editLocationModal').style.display='block';
 setupEditPhotoInput();
}
function setupEditPhotoInput(){
 const input=document.getElementById('editLocationPhoto'); if(!input||input.dataset.bound==='1')return; input.dataset.bound='1';
 input.addEventListener('change',()=>{const file=input.files&&input.files[0];editingPhotoData=null;editingPhotoName='';if(!file)return;const reader=new FileReader();reader.onload=()=>{editingPhotoData=reader.result;editingPhotoName=file.name;const preview=document.getElementById('editLocationPhotoPreview');if(preview)preview.innerHTML='<img class="location-add-preview" alt="Nieuwe foto">';const img=preview?.querySelector('img');if(img)img.src=editingPhotoData;document.getElementById('editRemovePhoto').checked=false;};reader.readAsDataURL(file);});
}
function closeEditLocation(){editingLocationId=null;pendingEditGeocode=null;editingPhotoData=null;editingPhotoName='';const input=document.getElementById('editLocationPhoto');if(input)input.value='';document.getElementById('editLocationModal').style.display='none';}
function useCurrentLocationForEdit(){
 const result=document.getElementById('editGeocodeResult');if(!navigator.geolocation){result.textContent='GPS wordt niet ondersteund op dit apparaat.';return;}result.textContent='Huidige locatie wordt bepaald…';navigator.geolocation.getCurrentPosition(p=>{pendingEditGeocode={lat:Number(p.coords.latitude),lon:Number(p.coords.longitude),label:'Huidige locatie'};result.textContent='✓ Nieuwe GPS-positie ingesteld.';},()=>{result.textContent='GPS kon niet worden bepaald.';},{enableHighAccuracy:true,maximumAge:5000,timeout:15000});
}
async function findAddressForEdit(){
 const address=document.getElementById('editAddress').value.trim();const result=document.getElementById('editGeocodeResult');if(!address){result.textContent='Vul eerst een adres in.';return;}result.textContent='Adres wordt gezocht…';try{const url='https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q='+encodeURIComponent(address);const response=await fetch(url,{headers:{'Accept':'application/json'}});if(!response.ok)throw new Error();const data=await response.json();if(!data.length){result.textContent='Adres niet gevonden.';return;}pendingEditGeocode={lat:Number(data[0].lat),lon:Number(data[0].lon),label:data[0].display_name};result.textContent='✓ Gevonden: '+data[0].display_name+' — de nieuwe GPS-coördinaten worden gebruikt bij Opslaan.';}catch(e){result.textContent='Adres zoeken mislukt. Controleer het adres en probeer opnieuw.';}
}
async function saveEditedLocation(){
 if(!editingLocationId)return;const saveButton=document.querySelector('#editLocationModal button[onclick="saveEditedLocation()"]');if(saveButton?.dataset.saving==='1')return;if(saveButton){saveButton.dataset.saving='1';saveButton.disabled=true;}
 try{
  const key=String(editingLocationId);const user=getUserLocations();const index=user.findIndex(x=>String(x.id)===key);if(index<0){alert('De lokale locatie kon niet worden gevonden.');return;}const old=user[index];
  const name=document.getElementById('editName').value.trim();const address=document.getElementById('editAddress').value.trim();const typeRaw=document.getElementById('editType').value;const type=['locaties','kunst','winkels','horeca','evenementen'].includes(typeRaw)?typeRaw:'locaties';if(!name){alert('Vul een naam in.');return;}if(!address){alert('Vul een adres in.');return;}
  let photo=old.photo||null;let photoName=old.photoName||'';if(document.getElementById('editRemovePhoto').checked){photo=null;photoName='';}else if(editingPhotoData){try{photo=await compressLocationPhoto(dataUrlToFile(editingPhotoData,editingPhotoName||'foto'));photoName=editingPhotoName||'foto.jpg';}catch(e){console.error('Reisblik: nieuwe foto verwerken mislukt',e);alert('De nieuwe foto kon niet worden verwerkt. De locatie is niet gewijzigd.');return;}}
  const edited={...old,name,address,type,category:type,description:document.getElementById('editDescription').value.trim(),story:document.getElementById('editStory').value.trim(),photo,photoName,lat:pendingEditGeocode?pendingEditGeocode.lat:old.lat,lon:pendingEditGeocode?pendingEditGeocode.lon:old.lon,coordinate_status:pendingEditGeocode?'geocoded_from_edit':'edited',updated_at:new Date().toISOString()};
  user[index]=edited;setUserLocations(user);const liveIndex=locations.findIndex(x=>String(x.id)===key);if(liveIndex>=0)locations[liveIndex]=edited;drawMarkers();render();closeEditLocation();if(map&&Number.isFinite(Number(edited.lat))&&Number.isFinite(Number(edited.lon)))map.setView([edited.lat,edited.lon],16);alert('Locatie gewijzigd. De wijzigingen zijn lokaal op dit apparaat opgeslagen.');
 }catch(e){console.error('Reisblik: locatie bewerken mislukt',e);alert('De locatie kon niet worden gewijzigd. De bestaande gegevens zijn behouden.');}finally{if(saveButton){saveButton.dataset.saving='0';saveButton.disabled=false;}}
}

function deleteUserLocation(id){
 if(!confirm('Deze zelf aangemaakte locatie verwijderen?'))return;
 const key=String(id);

 // Remove the location itself first.
 const user=getUserLocations().filter(x=>String(x.id)!==key);
 localStorage.setItem(reisblikVakantieStorageKey('ruinekerk_user_locations_v1'),JSON.stringify(user));

 // Remove every personal data record linked to this location ID.
 // Object-based stores use the location ID as key; array-based stores are
 // also handled so future storage changes cannot leave linked records behind.
 const cleanupKeys=[
  'reisblik_visited_v1',
  'ruinekerk_extra_info_v1',
  'ruinekerk_extra_simple_v1',
  'ruinekerk_notes_v1'
 ];
 cleanupKeys.forEach(storageKey=>{
  try{
   const scopedKey=reisblikVakantieStorageKey(storageKey);
   const raw=localStorage.getItem(scopedKey);
   if(raw===null)return;
   const data=JSON.parse(raw);
   let changed=false;

   if(Array.isArray(data)){
    const filtered=data.filter(item=>{
     if(!item || typeof item!=='object')return true;
     const itemId=item.id ?? item.locationId ?? item.location_id;
     const remove=itemId!==undefined && String(itemId)===key;
     if(remove)changed=true;
     return !remove;
    });
    if(changed)localStorage.setItem(scopedKey,JSON.stringify(filtered));
   }else if(data && typeof data==='object'){
    if(Object.prototype.hasOwnProperty.call(data,key)){
     delete data[key];
     changed=true;
    }
    if(changed)localStorage.setItem(scopedKey,JSON.stringify(data));
   }
  }catch(e){
   console.warn('Reisblik: gekoppelde data kon niet worden opgeschoond',storageKey,e);
  }
 });

 // Rebuild the current location list and UI.
 loadLocations();
}

// Expose the currently loaded Reisblik locations to auxiliary modules such as cleanup.js.
// This is read-only: the cleanup module only uses these IDs to identify orphaned personal data.
window.reisblikGetCurrentLocationIds = function(){
 try {
  return locations.map(function(x){ return x && x.id != null ? String(x.id) : null; }).filter(Boolean);
 } catch(e) {
  return [];
 }
};

function getUserLocations(){
 try{
  const raw=JSON.parse(localStorage.getItem(reisblikVakantieStorageKey('ruinekerk_user_locations_v1'))||'[]');
  if(!Array.isArray(raw))return [];
  const activeId=window.reisblikVakantie?.getActieveVakantieId ? window.reisblikVakantie.getActieveVakantieId() : '';
  if(!activeId)return raw;
  return raw.filter(item=>!item?.vacationId || String(item.vacationId)===String(activeId));
 }catch(e){return []}
}
function setUserLocations(items){
 const scopedKey=reisblikVakantieStorageKey('ruinekerk_user_locations_v1');
 const activeId=window.reisblikVakantie?.getActieveVakantieId ? window.reisblikVakantie.getActieveVakantieId() : '';
 // Replace only the active vacation's records; never overwrite other vacations.
 let all=[];
 try{
  const raw=JSON.parse(localStorage.getItem(scopedKey)||'[]');
  if(Array.isArray(raw)) all=raw;
 }catch(e){ all=[]; }
 if(activeId){
  const others=all.filter(item=>!item?.vacationId || String(item.vacationId)!==String(activeId));
  all=others.concat(Array.isArray(items)?items:[]);
 }else{
  all=Array.isArray(items)?items:[];
 }
 localStorage.setItem(scopedKey,JSON.stringify(all));
 return all;
}
function openAddLocation(){
 const activeId=window.reisblikVakantie?.getActieveVakantieId ? window.reisblikVakantie.getActieveVakantieId() : '';
 if(!activeId){
  alert('Kies eerst een actieve vakantie.');
  return;
 }
 document.getElementById('newName').value='';
 document.getElementById('newAddress').value='';
 document.getElementById('newType').value='locaties';
 document.getElementById('newDescription').value='';
 document.getElementById('newStory').value='';
 document.getElementById('geocodeResult').textContent='';
 const photoApi=window.__locationPhoto;
 if(photoApi && typeof photoApi.reset==='function') photoApi.reset();
 else {
  const input=document.getElementById('newLocationPhoto');
  const preview=document.getElementById('newLocationPhotoPreview');
  if(input) input.value='';
  if(preview) preview.innerHTML='';
 }
 window.pendingGeocode=null;
 document.getElementById('addLocationModal').style.display='block';
}
function closeAddLocation(){
 const photoApi=window.__locationPhoto;
 if(photoApi && typeof photoApi.reset==='function') photoApi.reset();
 document.getElementById('addLocationModal').style.display='none';
}

function useCurrentLocation(){
 if(!navigator.geolocation){
  document.getElementById('geocodeResult').textContent='GPS wordt niet ondersteund op dit apparaat.';
  return;
 }
 const result=document.getElementById('geocodeResult');
 result.textContent='Huidige locatie wordt bepaald…';
 navigator.geolocation.getCurrentPosition(async p=>{
  const lat=p.coords.latitude,lon=p.coords.longitude;
  try{
   const url='https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat='+lat+'&lon='+lon+'&zoom=18&addressdetails=1';
   const response=await fetch(url,{headers:{'Accept':'application/json'}});
   const data=await response.json();
   if(data.display_name){
    document.getElementById('newAddress').value=data.display_name;
    result.textContent='✓ Huidige locatie gevonden: '+data.display_name;
   }else{
    result.textContent='✓ GPS gevonden, maar geen bekend adres. De GPS-positie wordt wel gebruikt.';
   }
  }catch(e){
   result.textContent='✓ GPS gevonden. Het adres kon niet worden opgehaald.';
  }
  window.pendingGeocode={lat:lat,lon:lon};
 },()=>{
  result.textContent='De huidige locatie kon niet worden bepaald. Controleer de GPS-toestemming.';
 });
}

async function findAddress(){
 const address=document.getElementById('newAddress').value.trim();
 if(!address){alert('Vul eerst een adres in.');return}
 const result=document.getElementById('geocodeResult');
 result.textContent='Adres wordt gezocht…';
 try{
  const url='https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=nl&q='+encodeURIComponent(address);
  const response=await fetch(url,{headers:{'Accept':'application/json'}});
  if(!response.ok)throw new Error();
  const data=await response.json();
  if(!data.length){
   result.textContent='Adres niet gevonden. Probeer straat, huisnummer, postcode en plaats.';
   return;
  }
  const p=data[0];
  window.pendingGeocode={lat:Number(p.lat),lon:Number(p.lon)};
  result.textContent='✓ Gevonden: '+p.display_name+' · '+Number(p.lat).toFixed(5)+', '+Number(p.lon).toFixed(5);
 }catch(e){
  result.textContent='Adres zoeken is mislukt. Controleer je internetverbinding of probeer een uitgebreider adres.';
 }
}


function exportLocalLocationsTxt(){
 const items=getUserLocations();
 if(!items.length){
  alert('Er zijn geen lokaal opgeslagen locaties om te exporteren.');
  return;
 }

 const blocks=items.map(x=>[
  '[LOCATION]',
  'id='+String(x.id??''),
  'name='+String(x.name??''),
  'type='+String(x.type??''),
  'address='+String(x.address??''),
  'lat='+String(x.lat??''),
  'lon='+String(x.lon??''),
  'coordinate_status='+String(x.coordinate_status??''),
  'description='+String(x.description??'').replace(/\r?\n/g,'\\n'),
  'story='+String(x.story??'').replace(/\r?\n/g,'\\n'),
  'added_at='+String(x.added_at??''),
  ...(x.photo ? ['photo='+String(
    (x.photoName || (x.name ? x.name.replace(/[^\w\-]+/g,'-').replace(/^-+|-+$/g,'').toLowerCase() : 'locatie')) + '.jpg'
  )] : []),
  '[/LOCATION]'
 ].join('\n')).join('\n\n');

 const content=
  '# Reis locatie app - lokale locaties\n'+
  '# Exportdatum: '+new Date().toISOString()+'\n\n'+
  blocks+'\n';

 const blob=new Blob([content],{type:'text/plain;charset=utf-8'});
 const url=URL.createObjectURL(blob);
 const a=document.createElement('a');
 a.href=url;
 a.download='lokale-locaties-'+new Date().toISOString().slice(0,10)+'.txt';
 document.body.appendChild(a);
 a.click();
 a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),60000);
}


async function loadNewLocalHtmlLocationsManual(){
 const button=document.querySelector('button[onclick="loadNewLocalHtmlLocationsManual()"]');
 if(button) button.disabled=true;

 const errors=[];
 const loaded=[];
 try{
  const manifestUrl='nieuwe-lok/index.json?v='+Date.now();
  const manifestResponse=await fetch(manifestUrl,{cache:'no-store'});
  if(!manifestResponse.ok){
   throw new Error('nieuwe-lok/index.json kon niet worden gelezen (HTTP '+manifestResponse.status+').');
  }

  let manifest;
  try{
   manifest=await manifestResponse.json();
  }catch(e){
   throw new Error('nieuwe-lok/index.json bevat geen geldige JSON.');
  }

  const files=Array.isArray(manifest) ? manifest : manifest.files;
  if(!Array.isArray(files)){
   throw new Error('In index.json ontbreekt een geldige "files" lijst.');
  }

  for(const file of files){
   if(typeof file!=='string' || !file.trim()){
    errors.push('Ongeldige bestandsnaam in index.json.');
    continue;
   }
   if(!file.toLowerCase().endsWith('.html')){
    errors.push('Overgeslagen: "'+file+'" is geen HTML-bestand.');
    continue;
   }

   try{
    const response=await fetch('nieuwe-lok/'+file+'?v='+Date.now(),{cache:'no-store'});
    if(!response.ok){
     errors.push(file+': bestand niet gevonden (HTTP '+response.status+').');
     continue;
    }

    const source=await response.text();
    const doc=new DOMParser().parseFromString(source,'text/html');
    const dataEl=doc.querySelector('#location-data');

    if(!dataEl){
     errors.push(file+': location-data ontbreekt.');
     continue;
    }

    let data;
    try{
     data=JSON.parse(dataEl.textContent);
    }catch(e){
     errors.push(file+': location-data bevat geen geldige JSON.');
     continue;
    }

    const required=['id','name','lat','lon'];
    const missing=required.filter(k=>data[k]===undefined || data[k]===null || String(data[k]).trim()==='');
    if(missing.length){
     errors.push(file+': ontbrekende gegevens: '+missing.join(', ')+'.');
     continue;
    }

    data.content='nieuwe-lok/'+file;
    data.userCreated=false;
    loaded.push(data);
   }catch(e){
    errors.push(file+': '+(e.message||'kon niet worden ingelezen')+'.');
   }
  }

  // Replace previously loaded new-lok HTML entries, leave all other locations intact.
  locations=locations.filter(x=>!String(x.content||'').startsWith('nieuwe-lok/'));
  locations.push(...loaded);
  drawMarkers();

  let message=loaded.length+' nieuwe locatie(s) ingelezen.';
  if(errors.length){
   message+='\n\nNiet ingelezen:\n• '+errors.join('\n• ');
  }
  alert(message);
 }catch(e){
  alert('Nieuwe-lok kon niet worden ingelezen.\n\n'+e.message);
 }finally{
  if(button) button.disabled=false;
 }
}

function dataUrlToFile(dataUrl,name){
 const parts=dataUrl.split(','); const mime=(parts[0].match(/:(.*?);/)||[])[1]||'image/jpeg';
 const bin=atob(parts[1]); const arr=new Uint8Array(bin.length);
 for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
 return new File([arr],name||'foto.jpg',{type:mime});
}

async function compressLocationPhoto(file){
 if(!file) return null;
 if(!file.type || !file.type.startsWith('image/')) throw new Error('Het gekozen bestand is geen afbeelding.');
 const maxSide=1600, quality=0.80;
 return await new Promise((resolve,reject)=>{
  const img=new Image(); const url=URL.createObjectURL(file);
  img.onload=()=>{
   try{
    let w=img.naturalWidth||img.width, h=img.naturalHeight||img.height;
    const scale=Math.min(1,maxSide/Math.max(w,h)); w=Math.max(1,Math.round(w*scale)); h=Math.max(1,Math.round(h*scale));
    const canvas=document.createElement('canvas'); canvas.width=w; canvas.height=h;
    const ctx=canvas.getContext('2d'); if(!ctx) throw new Error('Fotoverwerking wordt niet ondersteund.');
    ctx.drawImage(img,0,0,w,h);
    canvas.toBlob(blob=>{
     URL.revokeObjectURL(url);
     if(!blob) return reject(new Error('De foto kon niet worden gecomprimeerd.'));
     const reader=new FileReader();
     reader.onload=()=>resolve(reader.result); reader.onerror=()=>reject(new Error('De foto kon niet worden gelezen.'));
     reader.readAsDataURL(blob);
    },'image/jpeg',quality);
   }catch(e){ URL.revokeObjectURL(url); reject(e); }
  };
  img.onerror=()=>{URL.revokeObjectURL(url); reject(new Error('De foto kon niet worden gelezen.'));};
  img.src=url;
 });
}

async function saveNewLocation(){
 const activeId=window.reisblikVakantie?.getActieveVakantieId ? window.reisblikVakantie.getActieveVakantieId() : '';
 if(!activeId){alert('Kies eerst een actieve vakantie.');return;}
 const saveButton=document.querySelector('#addLocationModal button[onclick="saveNewLocation()"]');
 if(saveButton && saveButton.dataset.saving==='1') return;
 if(saveButton) { saveButton.dataset.saving='1'; saveButton.disabled=true; }
 try{
 const name=document.getElementById('newName').value.trim();
 const address=document.getElementById('newAddress').value.trim();
 const typeRaw=document.getElementById('newType').value;
 const type=(["locaties","kunst","winkels","horeca","evenementen"]).includes(typeRaw)?typeRaw:'locaties';
 if(!name){alert('Vul een naam in.');return}
 if(!address){alert('Vul een adres in.');return}
 if(!window.pendingGeocode || !Number.isFinite(Number(window.pendingGeocode.lat)) || !Number.isFinite(Number(window.pendingGeocode.lon))){
  alert('Kies eerst een locatie via “📍 Huidige locatie gebruiken” of “📍 Adres zoeken”.');
  return;
 }

 const photoApi=window.__locationPhoto || {
  get:()=>null,
  getName:()=>''
 };

 let compressedPhoto=photoApi.get();
 if(compressedPhoto){
  try{ compressedPhoto=await compressLocationPhoto(dataUrlToFile(compressedPhoto, photoApi.getName()||'foto')); }
  catch(e){ console.error('Reisblik: foto verwerken mislukt',e); alert('De foto kon niet worden verwerkt. De locatie is niet opgeslagen.'); return; }
 }

 const item={
  id:'user-'+Date.now(),
  vacationId:activeId,
  name:name,
  type:type,
  category:type,
  address:address,
  description:document.getElementById('newDescription').value.trim(),
  story:document.getElementById('newStory').value.trim(),
   photo:compressedPhoto,
   photoName:photoApi.getName(),
  lat:window.pendingGeocode.lat,
  lon:window.pendingGeocode.lon,
  coordinate_status:'geocoded_from_address',
  userCreated:true,
  added_at:new Date().toISOString()
 };
 const user=getUserLocations();
 user.push(item);
 try{
  setUserLocations(user);
 }catch(e){
  console.error('Reisblik: opslaan eigen locatie mislukt',e);
  alert('De locatie kon niet worden opgeslagen. Mogelijk is de lokale opslag vol, bijvoorbeeld door een grote foto. Probeer zonder foto of met een kleinere foto.');
  return;
 }
 locations.push(item);
 drawMarkers();
 closeAddLocation();
 render();
 if(map && Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lon))) map.setView([item.lat,item.lon],16);
 alert('Locatie toegevoegd. Deze locatie wordt lokaal op dit apparaat bewaard.');
 }catch(e){
  console.error('Reisblik: onverwachte fout bij nieuwe locatie',e);
  alert('Er ging iets mis bij het opslaan van de nieuwe locatie. De bestaande gegevens zijn behouden.');
 }finally{
  if(saveButton){ saveButton.dataset.saving='0'; saveButton.disabled=false; }
 }
}

async function searchTestAddress31(){
 const input=document.getElementById('testAddress');
 const status=document.getElementById('testAddressStatus31');
 const address=input.value.trim();
 if(!address){status.textContent='Vul eerst een adres in.';return;}
 status.textContent='Adres wordt gezocht…';
 try{
  const url='https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q='+encodeURIComponent(address);
  const response=await fetch(url,{headers:{'Accept':'application/json'}});
  if(!response.ok)throw new Error();
  const data=await response.json();
  if(!data.length){status.textContent='Adres niet gevonden.';return;}
  status.textContent='✓ Gevonden: '+data[0].display_name+' — druk op “📍 Deze locatie gebruiken”.';
 window.pendingTestAddress31={lat:Number(data[0].lat),lon:Number(data[0].lon),label:data[0].display_name};
 let btn=document.getElementById('useTestAddress31');
 if(!btn){
  btn=document.createElement('button');
  btn.id='useTestAddress31';
  btn.type='button';
  btn.textContent='📍 Deze locatie gebruiken';
  btn.onclick=useTestAddress31;
  status.after(btn);
 }
 btn.style.display='inline-block';
 }catch(e){
  status.textContent='Adres zoeken mislukt. Controleer het adres en probeer opnieuw.';
 }
}

function useTestAddress31(){
 const p=window.pendingTestAddress31;
 if(!p)return;
 userLat=p.lat;
 userLon=p.lon;
 window.reisblikLocationSource={type:"test",label:"Testpositie: "+p.label};
 updateUserMarker();
 renderNearbyBar();
 map.setView([userLat,userLon],16);
 render();
 const status=document.getElementById('testAddressStatus31');
 status.textContent='✓ Testpositie ingesteld: '+p.label;
}

function testPosition(){
 userLat=52.719804;userLon=4.878203;
 window.reisblikLocationSource={type:"test",label:"Testpositie"};
 updateUserMarker();renderNearbyBar();map.setView([userLat,userLon],15);render();
}
function myPosition(){
 if(!navigator.geolocation){alert('GPS wordt niet ondersteund.');return;}
 navigator.geolocation.getCurrentPosition(
  p=>{
   userLat=p.coords.latitude;userLon=p.coords.longitude;
   window.reisblikLocationSource={type:"gps",label:"Mijn positie"};
   updateUserMarker();renderNearbyBar();map.setView([userLat,userLon],16);render();
   startLocationWatch();
  },
  ()=>alert('Locatie kon niet worden bepaald. Controleer de locatie-toestemming.'),
  {enableHighAccuracy:true,maximumAge:5000,timeout:15000}
 );
}
function showAll(){
 window.reisblikVoorlezen?.stop();
 window.__reisblikDetailLocationId=null;
 if(markers.length)map.fitBounds(L.featureGroup(markers).getBounds().pad(.25));
 render();
}
renderNearbyBar();
let locationReloadTimer=null;
function reloadLocationsForActiveVacation(){
 clearTimeout(locationReloadTimer);
 locationReloadTimer=setTimeout(()=>loadLocations(),0);
}
if(window.reisblikVakantie?.whenReady){
 window.reisblikVakantie.whenReady().then(reloadLocationsForActiveVacation);
 window.reisblikVakantie.onVakantieGewijzigd(reloadLocationsForActiveVacation);
}else{
 loadLocations();
}
