/* Reisblik 9.7.5 – Agenda: verbeterde duplicate-herkenning */
(function(){
  const SAVED_BASE_KEY='reisblik_agenda_evenementen_v1';
  function storageKey(){
    const ctx=window.reisblikVakantie;
    if(ctx?.getVakantieStorageKey){
      // Zolang de centrale vakantiecontext nog niet actief is, mag Agenda
      // nooit terugvallen op de oude ongescopeerde opslag. Die oude sleutel
      // kan anders bij het opstarten of tijdens een vroege import als bron
      // voor dubbele evenementen worden gebruikt.
      if(typeof ctx.isVakantieActief==='function' && !ctx.isVakantieActief()) return null;
      return ctx.getVakantieStorageKey(SAVED_BASE_KEY);
    }
    // agenda.js kan vóór vakantie.js geladen zijn. In die korte fase is er
    // nog geen geldige context; behandel de agenda daarom als leeg.
    return null;
  }
  function importUrl(){
    const base=window.reisblikVakantie?.getActieveVakantieBasePath ? window.reisblikVakantie.getActieveVakantieBasePath() : '';
    return (base?base+'/':'')+'agenda/agenda.json';
  }

  const DEFAULT_CATEGORY_LABELS={
    eenmalig:'🎟️ Eenmalige evenementen',
    looptijd:'📅 Evenementen met een looptijd',
    bezoekwaardig:'📍 Bezoekwaardige locaties'
  };
  const CATEGORY_ORDER=['eenmalig','looptijd','bezoekwaardig'];

  // Oude Ticketmaster-sleutel uit eerdere versies opruimen.
  try{localStorage.removeItem('reisblik_ticketmaster_api_key_v1');}catch(e){}

  let importedEvents=[];

  function el(id){return document.getElementById(id);}
  function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
  function formatCoord(v){return Number.isFinite(Number(v)) ? Number(v).toFixed(6) : '';}

  function readArray(key){
    if(!key) return [];
    try{const raw=localStorage.getItem(key); const data=raw?JSON.parse(raw):[]; return Array.isArray(data)?data:[];}
    catch(e){console.warn('Agenda-opslag kon niet worden gelezen',key,e); return [];}
  }
  function writeArray(key,data){if(!key) return; localStorage.setItem(key,JSON.stringify(Array.isArray(data)?data:[]));}
  function loadSaved(){return readArray(storageKey());}
  function saveSaved(events){writeArray(storageKey(),events);}

  function normalizeText(value){
    return String(value??'').trim().toLowerCase().replace(/\s+/g,' ');
  }

  function normalizeUrl(value){
    const raw=String(value??'').trim();
    if(!raw) return '';
    try{
      const u=new URL(raw,window.location.href);
      u.hash='';
      return u.href.replace(/\/$/,'').toLowerCase();
    }catch(e){return raw.toLowerCase().replace(/\/$/,'');}
  }

  // Herkenning van hetzelfde evenement. Een event-URL mag NIET op zichzelf
  // bepalen dat twee evenementen hetzelfde zijn: organisatoren gebruiken vaak
  // één algemene agenda-/evenementenpagina voor meerdere activiteiten.
  function identityKeys(event){
    const keys=[];
    const id=normalizeText(event?.id);
    const name=normalizeText(event?.name);
    const date=normalizeText(event?.date);
    const location=normalizeText(event?.location);
    if(id) keys.push('id:'+id);
    if(name && date && location) keys.push('ndl:'+name+'|'+date+'|'+location);
    else if(name && date) keys.push('nd:'+name+'|'+date);
    return keys;
  }

  function eventKey(event){
    const keys=identityKeys(event);
    return keys[0] || [event?.name,event?.date,event?.location].map(x=>normalizeText(x)).join('|');
  }

  function stableEventId(event){
    const seed=[normalizeText(event?.name),normalizeText(event?.date),normalizeText(event?.location),normalizeUrl(event?.url||event?.eventUrl)].join('|');
    let hash=2166136261;
    for(let i=0;i<seed.length;i++){
      hash^=seed.charCodeAt(i);
      hash=Math.imul(hash,16777619);
    }
    return 'agenda-'+(hash>>>0).toString(16);
  }

  function eventsMatch(a,b){
    const aId=normalizeText(a?.id), bId=normalizeText(b?.id);
    if(aId && bId && aId===bId) return true;

    const aName=normalizeText(a?.name), bName=normalizeText(b?.name);
    const aDate=normalizeText(a?.date), bDate=normalizeText(b?.date);
    const aLocation=normalizeText(a?.location), bLocation=normalizeText(b?.location);

    // De veiligste inhoudelijke sleutel: naam + datum + locatie.
    if(aName && aDate && aLocation &&
       aName===bName && aDate===bDate && aLocation===bLocation) return true;

    // Een URL is alleen aanvullend bewijs. Dezelfde algemene agenda-/bronpagina
    // voor verschillende activiteiten mag dus niet meer als duplicaat gelden.
    const aUrl=normalizeUrl(a?.url || a?.eventUrl);
    const bUrl=normalizeUrl(b?.url || b?.eventUrl);
    if(aUrl && bUrl && aUrl===bUrl){
      if(aName && bName && aName===bName) return true;
      if(aDate && bDate && aDate===bDate && aLocation && bLocation && aLocation===bLocation) return true;
    }

    return false;
  }

  function normalizeEvent(event, meta){
    return {
      id:String(event.id||'').trim() || stableEventId(event),
      name:String(event.name||'').trim(),
      date:String(event.date||'').trim(),
      location:String(event.location||'').trim(),
      lat:Number(event.lat ?? event.latitude),
      lon:Number(event.lon ?? event.longitude),
      type:String(event.type||'').trim(),
      organizer:String(event.organizer||'').trim(),
      price:String(event.price||'').trim(),
      description:String(event.description||'').trim(),
      source:String(event.source||'').trim(),
      url:String(event.eventUrl || event.url || '').trim(),
      sourceUrl:String(event.sourceUrl || event.bronUrl || '').trim(),
      image:String(event.image||'').trim(),
      reisblikMatch:Number.isFinite(Number(event.reisblikMatch))?Number(event.reisblikMatch):null,
      matchReasons:Array.isArray(event.matchReasons)?event.matchReasons:[],
      agendaCategory:String(event.eventType || event.agendaCategory || meta?.category || 'eenmalig').trim().toLowerCase(),
      importedFrom:meta?.file||'agenda.json',
      importedAt:new Date().toISOString()
    };
  }

  async function importAgendaJson(){
    const status=el('agendaImportStatus');
    if(status) status.textContent='Agenda.json wordt geladen…';
    try{
      if(window.reisblikVakantie?.whenReady) await window.reisblikVakantie.whenReady();
      if(window.reisblikVakantie?.isVakantieActief && !window.reisblikVakantie.isVakantieActief()) throw new Error('Geen actieve vakantiecontext beschikbaar');
      const response=await fetch(importUrl()+'?v=9.7.5&t='+Date.now(),{cache:'no-store'});
      if(!response.ok) throw new Error('HTTP '+response.status);
      const payload=await response.json();
      const incoming=Array.isArray(payload?.events)?payload.events:[];
      const saved=loadSaved();
      const imported=[];
      let duplicateCount=0;
      incoming.forEach(event=>{
        const normalized=normalizeEvent(event,{
          file:payload.sourceFile||importUrl(),
          category:event.eventType||'eenmalig'
        });
        if(!normalized.name){ duplicateCount++; return; }
        if(saved.some(savedEvent=>eventsMatch(normalized,savedEvent)) || imported.some(importedEvent=>eventsMatch(normalized,importedEvent))){
          duplicateCount++;
          return;
        }
        imported.push(normalized);
      });
      importedEvents=imported;
      window.__reisblikAgendaImportMeta={
        agendaVersion:String(payload?.agendaVersion||'onbekend'),
        sourceFile:String(payload?.sourceFile||'agenda.json'),
        categoryLabels:{...DEFAULT_CATEGORY_LABELS,...(payload?.eventTypes||{})}
      };
      renderAgenda();
      if(status){
        status.textContent='📄 '+window.__reisblikAgendaImportMeta.sourceFile+' · agenda versie '+window.__reisblikAgendaImportMeta.agendaVersion+' · ✅ '+imported.length+' nieuwe evenement(en) geladen'+(duplicateCount?' · '+duplicateCount+' dubbele/bestaande overgeslagen.':'');
      }
      return imported.length;
    }catch(error){
      console.warn('Agenda JSON-import niet uitgevoerd:',error);
      importedEvents=[];
      renderAgenda();
      if(status) status.textContent='⚠️ agenda.json kon niet worden geladen: '+error.message;
      return 0;
    }
  }

  function isSaved(event){
    const key=eventKey(event); return !!key && loadSaved().some(ev=>eventKey(ev)===key);
  }

  function eventCard(ev, permanent){
    const card=document.createElement('div'); card.className='agenda-event-card';
    let html='<div class="agenda-event-title">📅 '+esc(ev.name||'Onbenoemd evenement')+'</div>'+ 
      (ev.date?'<div><strong>Datum:</strong> '+esc(ev.date)+'</div>':'')+
      (ev.location?'<div><strong>Locatie:</strong> '+esc(ev.location)+'</div>':'')+
      (ev.type?'<div><strong>Type:</strong> '+esc(ev.type)+'</div>':'')+
      (ev.organizer?'<div><strong>Organisator:</strong> '+esc(ev.organizer)+'</div>':'')+
      (ev.price?'<div><strong>Prijs:</strong> '+esc(ev.price)+'</div>':'')+
      (ev.description?'<div class="agenda-event-description">'+esc(ev.description)+'</div>':'');
    if(ev.url){html+='<div class="agenda-event-source"><a href="'+esc(ev.url)+'" target="_blank" rel="noopener noreferrer">🌐 Bekijk evenementwebsite</a></div>';}
    if(ev.sourceUrl && ev.sourceUrl!==ev.url){html+='<div class="agenda-event-source"><a href="'+esc(ev.sourceUrl)+'" target="_blank" rel="noopener noreferrer">🔎 Bekijk bronpagina</a></div>';}
    if(ev.reisblikMatch!==null && ev.reisblikMatch!==undefined){html+='<div><strong>Reisblik-match:</strong> '+esc(ev.reisblikMatch)+'/100</div>';}
    if(Array.isArray(ev.matchReasons)&&ev.matchReasons.length){html+='<div class="agenda-match-reasons">'+ev.matchReasons.map(x=>'• '+esc(x)).join('<br>')+'</div>';}

    // Evenementen gebruiken dezelfde centrale Bezocht-opslag als locaties.
    // Daardoor verschijnen ze automatisch in Mijn reisdag zodra ze zijn aangevinkt.
    if(typeof reisblikVisitedHtml==='function'){
      html+=reisblikVisitedHtml(ev.id||eventKey(ev),ev.name,'evenementen');
    }

    if(permanent){
      if(visitedInfo(ev)){
        html+='<div class="agenda-protected-note">🔒 Bezocht — eerst Bezocht uitvinken om dit evenement te kunnen verwijderen.</div>';
      }else{
        html+='<button type="button" class="agenda-remove-btn" data-agenda-key="'+esc(eventKey(ev))+'">🗑 Verwijder uit mijn agenda</button>';
      }
    }else if(isSaved(ev)){
      html+='<div class="agenda-saved-note">✓ Staat al in Mijn agenda</div>';
    }else{
      html+='<button type="button" class="agenda-save-btn" data-agenda-key="'+esc(eventKey(ev))+'">⭐ Bewaar in Mijn agenda</button>';
    }
    card.innerHTML=html; return card;
  }

  function localDateKey(){
    const d=new Date();
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }

  function eventDateKey(event){
    const raw=String(event?.date||'').trim();
    const m=raw.match(/^(\d{4}-\d{2}-\d{2})/);
    return m?m[1]:'';
  }

  function visitedInfo(event){
    try{
      if(typeof reisblikVisitedLoad!=='function') return null;
      const data=reisblikVisitedLoad();
      const item=data[String(event?.id||'')];
      return item&&item.visitedAt?item:null;
    }catch(e){return null;}
  }

  function isArchivedEvent(event){
    // Een handmatig als bezocht gemarkeerd evenement hoort altijd in het archief.
    if(visitedInfo(event)) return true;
    // Een evenement waarvan de datum verstreken is, is automatisch afgelopen.
    const date=eventDateKey(event);
    return !!date && date<localDateKey();
  }

  function visitedTimestamp(event){
    const v=visitedInfo(event);
    return v?new Date(v.visitedAt).getTime():0;
  }

  function renderImportedGroups(container, imported){
    if(!container) return;
    const meta=window.__reisblikAgendaImportMeta||{};
    const labels={...DEFAULT_CATEGORY_LABELS,...(meta.categoryLabels||{})};
    const grouped={};
    CATEGORY_ORDER.forEach(key=>grouped[key]=[]);
    imported.forEach(ev=>{
      const key=CATEGORY_ORDER.includes(ev.agendaCategory)?ev.agendaCategory:'eenmalig';
      if(!grouped[key]) grouped[key]=[];
      grouped[key].push(ev);
    });
    Object.keys(grouped).forEach(key=>{
      const events=grouped[key];
      if(!events.length) return;
      events.sort((a,b)=>String(a.date||'9999-12-31').localeCompare(String(b.date||'9999-12-31')));
      const heading=document.createElement('div');
      heading.className='agenda-category-heading';
      heading.textContent=labels[key]||DEFAULT_CATEGORY_LABELS[key]||key;
      container.appendChild(heading);
      events.forEach(ev=>container.appendChild(eventCard(ev,false)));
    });
  }

  function renderAgenda(){
    const savedBox=el('agendaSavedEvents'); const importedBox=el('agendaImportedEvents');
    const savedEmpty=el('agendaEmpty'); const importedEmpty=el('agendaImportedEmpty');
    if(!savedBox||!importedBox||!savedEmpty||!importedEmpty) return;

    const saved=loadSaved();
    const upcoming=saved.filter(ev=>!isArchivedEvent(ev)).sort((a,b)=>{
      const ad=eventDateKey(a), bd=eventDateKey(b);
      return (ad||'9999-12-31').localeCompare(bd||'9999-12-31');
    });
    const archived=saved.filter(ev=>isArchivedEvent(ev)).sort((a,b)=>{
      const av=visitedTimestamp(a), bv=visitedTimestamp(b);
      // Bezochte evenementen eerst: laatst bezocht bovenaan.
      if(av||bv){
        if(av!==bv) return bv-av;
        if(av&&bv) return String(b.date||'').localeCompare(String(a.date||''));
      }
      // Daarna niet-bezochte evenementen waarvan de datum verstreken is.
      return String(b.date||'').localeCompare(String(a.date||''));
    });
    const imported=importedEvents.slice().sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')));

    savedBox.innerHTML=''; importedBox.innerHTML='';
    savedEmpty.style.display=saved.length?'none':'block';
    importedEmpty.style.display=imported.length?'none':'block';

    if(saved.length){
      const upcomingTitle=document.createElement('div');
      upcomingTitle.className='agenda-subsection-title';
      upcomingTitle.textContent='🟢 Komende evenementen ('+upcoming.length+')';
      savedBox.appendChild(upcomingTitle);
      if(upcoming.length){
        upcoming.forEach(ev=>savedBox.appendChild(eventCard(ev,true)));
      }else{
        const none=document.createElement('div');
        none.className='agenda-empty agenda-subempty';
        none.textContent='Geen komende evenementen.';
        savedBox.appendChild(none);
      }

      const details=document.createElement('details');
      details.className='agenda-archive';
      const summary=document.createElement('summary');
      summary.textContent='☑️ Bezocht / afgelopen ('+archived.length+')';
      details.appendChild(summary);
      const archiveBox=document.createElement('div');
      archiveBox.className='agenda-archive-list';
      if(archived.length){
        archived.forEach(ev=>archiveBox.appendChild(eventCard(ev,true)));
      }else{
        const none=document.createElement('div');
        none.className='agenda-empty agenda-subempty';
        none.textContent='Nog geen bezochte of afgelopen evenementen.';
        archiveBox.appendChild(none);
      }
      details.appendChild(archiveBox);
      savedBox.appendChild(details);
    }

    renderImportedGroups(importedBox, imported);

    savedBox.querySelectorAll('.agenda-remove-btn').forEach(btn=>btn.addEventListener('click',function(){
      const key=this.getAttribute('data-agenda-key');
      saveSaved(loadSaved().filter(ev=>eventKey(ev)!==key));
      renderAgenda();
      if(typeof window.drawMarkers==='function') window.drawMarkers();
    }));
    importedBox.querySelectorAll('.agenda-save-btn').forEach(btn=>btn.addEventListener('click',function(){
      const key=this.getAttribute('data-agenda-key'); const ev=importedEvents.find(x=>eventKey(x)===key);
      if(ev) window.reisblikAgendaBewaarEvenement(ev);
    }));

    // Als Bezocht wordt aangevinkt/uitgevinkt, verhuist het item direct naar de
    // juiste sectie zonder dat de Agenda eerst opnieuw geopend hoeft te worden.
    savedBox.querySelectorAll('input.reisblik-visited-checkbox').forEach(cb=>cb.addEventListener('change',()=>setTimeout(renderAgenda,0)));
  }

  function openAgenda(){
    const overlay=el('agendaOverlay'); if(!overlay)return;
    // Bij openen tonen we uitsluitend de permanente agenda. Een JSON-import gebeurt alleen via de knop.
    importedEvents=[];
    window.__reisblikAgendaImportMeta=null;
    const status=el('agendaImportStatus'); if(status) status.textContent='';
    overlay.style.display='flex';
    if(window.reisblikVakantie?.whenReady){
      window.reisblikVakantie.whenReady().then(()=>renderAgenda());
    }else{
      renderAgenda();
    }
  }
  function closeAgenda(){const overlay=el('agendaOverlay'); if(overlay)overlay.style.display='none';}

  window.reisblikAgendaBewaarEvenement=function(event){
    if(!event||!String(event.name||'').trim())return false;
    const events=loadSaved(); const key=eventKey(event);
    if(!events.some(ev=>eventsMatch(event,ev))){
      const copy=normalizeEvent(event); copy.savedAt=new Date().toISOString(); delete copy.importedFrom; delete copy.importedAt;
      events.push(copy); saveSaved(events);
    }
    // Een opgeslagen kandidaat hoort niet meer in de lijst 'nieuwe import'.
    importedEvents=importedEvents.filter(ev=>!eventsMatch(ev,event));
    renderAgenda();
    if(typeof window.drawMarkers==='function') window.drawMarkers();
    return true;
  };
  window.reisblikAgendaGetEvenementen=function(){return loadSaved().slice();};
  window.reisblikAgendaIsOpgeslagen=function(event){return isSaved(event);};
  window.reisblikOpenAgenda=openAgenda;
  window.reisblikCloseAgenda=closeAgenda;

  function handleVacationChange(){importedEvents=[];window.__reisblikAgendaImportMeta=null;const status=el('agendaImportStatus');if(status)status.textContent='';renderAgenda();}

  function init(){
    const open=el('agendaOpenBtn'), close=el('agendaCloseBtn'), overlay=el('agendaOverlay'), importBtn=el('agendaImportBtn');
    if(open)open.addEventListener('click',openAgenda);
    if(close)close.addEventListener('click',closeAgenda);
    if(importBtn)importBtn.addEventListener('click',importAgendaJson);
    if(overlay)overlay.addEventListener('click',e=>{if(e.target===overlay)closeAgenda();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')closeAgenda();});
    if(window.reisblikVakantie?.whenReady){
      window.reisblikVakantie.whenReady().then(()=>renderAgenda());
    }else{
      renderAgenda();
    }
    if(window.reisblikVakantie?.onVakantieGewijzigd) window.reisblikVakantie.onVakantieGewijzigd(handleVacationChange);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
