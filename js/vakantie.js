// Reisblik 9.7.5 — Centrale vakantiecontext
(function(){
  const STORAGE_KEY='reisblik_actieve_vakantie_v1';
  let vakanties=[];
  let actieveVakantie=null;
  const listeners=[];
  let readyResolve;
  const readyPromise=new Promise(resolve=>{readyResolve=resolve;});

  function getVakanties(){return vakanties.slice();}
  function getActieveVakantie(){return actieveVakantie ? {...actieveVakantie} : null;}
  function getActieveVakantieId(){return actieveVakantie ? actieveVakantie.id : '';}
  function getActieveVakantieNaam(){return actieveVakantie ? actieveVakantie.naam : '';}
  function getActieveVakantieType(){return actieveVakantie ? (actieveVakantie.type||'vast') : '';}
  function getActieveVakantieBasePath(){return actieveVakantie ? String(actieveVakantie.basePath||actieveVakantie.id||'').replace(/^\/+|\/+$/g,'') : '';}
  function getActieveVakantieHtmlLocations(){return actieveVakantie && Array.isArray(actieveVakantie.htmlLocations) ? actieveVakantie.htmlLocations.slice() : [];}
  function getActieveVakantieOnderdelen(){return actieveVakantie && Array.isArray(actieveVakantie.onderdelen) ? actieveVakantie.onderdelen.map(x=>({...x})) : [];}
  function getGeselecteerdeOnderdeelIds(){
    const onderdelen=getActieveVakantieOnderdelen();
    if(!onderdelen.length)return [];
    const key='reisblik_geselecteerde_onderdelen_v1__'+sanitizeStoragePart(getActieveVakantieId());
    try{
      const raw=localStorage.getItem(key);
      const parsed=raw?JSON.parse(raw):null;
      if(Array.isArray(parsed)){
        const valid=onderdelen.map(x=>String(x.id));
        const filtered=parsed.map(String).filter(id=>valid.includes(id));
        // An explicitly stored empty array means: no onderdelen selected.
        // Do not fall back to selecting everything in that case.
        return filtered;
      }
    }catch(e){}
    return onderdelen.map(x=>String(x.id));
  }
  function setGeselecteerdeOnderdeelIds(ids){
    const onderdelen=getActieveVakantieOnderdelen();
    if(!onderdelen.length)return true;
    const valid=new Set(onderdelen.map(x=>String(x.id)));
    const selected=Array.from(new Set((Array.isArray(ids)?ids:[]).map(String).filter(id=>valid.has(id))));
    const key='reisblik_geselecteerde_onderdelen_v1__'+sanitizeStoragePart(getActieveVakantieId());
    localStorage.setItem(key,JSON.stringify(selected));
    return true;
  }
  function kiesVakantieMetOnderdelen(id,ids){
    const gevonden=vakanties.find(v=>v.id===id);
    if(!gevonden)return false;
    actieveVakantie=gevonden;
    localStorage.setItem(STORAGE_KEY,gevonden.id);
    ensureLegacyMigrated();
    if(Array.isArray(gevonden.onderdelen) && gevonden.onderdelen.length)setGeselecteerdeOnderdeelIds(ids);
    notify();
    return true;
  }
  function isVakantieActief(){return !!actieveVakantie;}
  function whenReady(){return readyPromise;}
  function sanitizeStoragePart(value){
    return String(value||'').trim().toLowerCase().replace(/[^a-z0-9_-]+/g,'_').replace(/^_+|_+$/g,'');
  }
  function getVakantieStorageKey(baseKey){
    const id=sanitizeStoragePart(getActieveVakantieId());
    if(!id) return String(baseKey||'');
    return String(baseKey||'')+'__'+id;
  }
  function getLegacyStorageKey(baseKey){return String(baseKey||'');}
  function getAllVakantieStorageKeys(baseKey){
    const keys=[];
    const base=String(baseKey||'');
    vakanties.forEach(v=>{
      const id=sanitizeStoragePart(v?.id);
      if(id) keys.push(base+'__'+id);
    });
    return keys;
  }

  const LEGACY_KEYS=[
    'reisblik_visited_v1','ruinekerk_extra_info_v1','ruinekerk_extra_simple_v1',
    'ruinekerk_notes_v1','ruinekerk_user_locations_v1','reisblik_agenda_evenementen_v1',
    'reisblik_mijn_reisdag_datum','reisblik_mijn_reisdag_datum_van','reisblik_mijn_reisdag_datum_tm'
  ];
  function ensureLegacyMigrated(){
    const id=sanitizeStoragePart(getActieveVakantieId());
    if(!id)return;
    const marker='reisblik_legacy_migrated_v1__'+id;
    if(localStorage.getItem(marker)==='1')return;
    // Existing unscoped data predates multi-vacation support. Assign it once
    // to the first active vacation so it is not lost. Never overwrite scoped data.
    LEGACY_KEYS.forEach(base=>{
      const legacy=localStorage.getItem(base);
      const target=getVakantieStorageKey(base);
      if(legacy!==null && localStorage.getItem(target)===null){
        try{localStorage.setItem(target,legacy);}catch(e){console.warn('Migratie lokale gegevens mislukt',base,e);}
      }
    });
    try{localStorage.setItem(marker,'1');}catch(e){}
  }

  function notify(){
    const context=getActieveVakantie();
    listeners.forEach(fn=>{try{fn(context);}catch(e){console.error('Vakantiecontext listener:',e);}});
    window.dispatchEvent(new CustomEvent('reisblikVakantieGewijzigd',{detail:context}));
  }

  function setVakanties(nieuweVakanties){
    vakanties=Array.isArray(nieuweVakanties) ? nieuweVakanties.filter(v=>v && v.id && v.naam) : [];
    const opgeslagen=localStorage.getItem(STORAGE_KEY)||'';
    const gevonden=vakanties.find(v=>v.id===opgeslagen);
    actieveVakantie=gevonden || (vakanties.length ? vakanties[0] : null);
    if(actieveVakantie){localStorage.setItem(STORAGE_KEY,actieveVakantie.id);ensureLegacyMigrated();}
    else localStorage.removeItem(STORAGE_KEY);
    readyResolve(getActieveVakantie());
    notify();
  }

  function kiesVakantie(id){
    const gevonden=vakanties.find(v=>v.id===id);
    if(!gevonden)return false;
    actieveVakantie=gevonden;
    localStorage.setItem(STORAGE_KEY,gevonden.id);
    ensureLegacyMigrated();
    notify();
    return true;
  }

  function onVakantieGewijzigd(fn){
    if(typeof fn!=='function')return ()=>{};
    listeners.push(fn);
    return ()=>{const i=listeners.indexOf(fn);if(i>=0)listeners.splice(i,1);};
  }

  window.reisblikVakantie={
    getVakanties,getActieveVakantie,getActieveVakantieId,getActieveVakantieNaam,
    getActieveVakantieType,getActieveVakantieBasePath,getActieveVakantieHtmlLocations,
    getActieveVakantieOnderdelen,getGeselecteerdeOnderdeelIds,setGeselecteerdeOnderdeelIds,kiesVakantieMetOnderdelen,
    getVakantieStorageKey,getLegacyStorageKey,getAllVakantieStorageKeys,
    isVakantieActief,setVakanties,kiesVakantie,onVakantieGewijzigd,whenReady
  };
})();
