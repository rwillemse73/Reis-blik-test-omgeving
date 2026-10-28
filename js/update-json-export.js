/* Reisblik 10.0.28 — genereer alle categorie-JSON-bestanden van de actieve vakantie opnieuw.
 * Ondersteunt bestaande categorie-JSON-bestanden én nieuwe bestanden bij HTTP 404. Lokale opslag wordt nooit verwijderd.
 */
(function(){
  'use strict';
  const BUTTON_ID='updateJsonExportBtn';
  const STATUS_ID='updateJsonExportStatus';
  const DATASET_PATH='praag/horeca/horeca.json';
  const TARGET_VACATION='praag';
  const VISITED_BASE='reisblik_visited_v1';
  const EXTRA_BASE='ruinekerk_extra_simple_v1';
  const encoder=new TextEncoder();

  function scopedKey(base){
    return window.reisblikVakantie?.getVakantieStorageKey
      ? window.reisblikVakantie.getVakantieStorageKey(base) : base;
  }
  function readObject(key){
    try{const value=JSON.parse(localStorage.getItem(key)||'{}');return value&&typeof value==='object'?value:{};}
    catch(e){throw new Error('Lokale gegevens konden niet worden gelezen ('+key+').');}
  }
  function setStatus(message,isError=false){
    const el=document.getElementById(STATUS_ID);if(!el)return;
    el.textContent=message;el.style.color=isError?'#a12622':'inherit';
  }
  function canonical(value){return JSON.stringify(value,Object.keys(value||{}).sort());}
  function stable(value){
    if(Array.isArray(value))return value.map(stable);
    if(value&&typeof value==='object')return Object.keys(value).sort().reduce((out,key)=>{out[key]=stable(value[key]);return out;},{});
    return value;
  }
  function same(a,b){return JSON.stringify(stable(a))===JSON.stringify(stable(b));}
  function makePersonalData(location,visited,extra){
    const visit=visited[String(location.id)];
    const items=Array.isArray(extra[String(location.id)])?extra[String(location.id)]:[];
    const personal={};
    if(visit&&visit.visitedAt)personal.visitedAt=String(visit.visitedAt);
    const cleaned=items.map(item=>({date:String(item?.date||''),text:String(item?.text||'')}))
      .filter(item=>item.date||item.text);
    if(cleaned.length)personal.extraInfo=cleaned;
    return Object.keys(personal).length?personal:null;
  }
  function buildDayReportsJson(){
    const raw=localStorage.getItem(scopedKey('reisblik_dagverslag_v1'));
    let saved={};
    if(raw){try{saved=JSON.parse(raw);}catch(e){throw new Error('Dagverslagen konden niet worden gelezen uit de lokale opslag.');}}
    if(!saved || typeof saved!=='object' || Array.isArray(saved)) saved={};
    const reports=Object.keys(saved).sort().filter(date=>String(saved[date]??'').trim()).map(date=>({id:'dagverslag-'+String(date),date:String(date),text:String(saved[date])}));
    return {formatVersion:'1.0',sourceFile:'dagverslagen.json',createdAt:new Date().toISOString(),reports};
  }
  function mergeLocalData(source,visited,extra,userLocations){
    const result=JSON.parse(JSON.stringify(source));
    if(!Array.isArray(result.locations))throw new Error('horeca.json bevat geen geldige locations-lijst.');
    let changed=false;
    const existingIds=new Set(result.locations.map(location=>String(location.id)));
    // Neem nieuwe zelf aangemaakte horecalocaties van de actieve vakantie op.
    // Alleen Praag → Horeca wordt in deze pilot naar de horeca-JSON geschreven.
    (Array.isArray(userLocations)?userLocations:[]).forEach(item=>{
      if(!item || String(item.vacationId||'')!==TARGET_VACATION) return;
      if(String(item.category||item.type||'').toLowerCase()!=='horeca') return;
      const id=String(item.id||'');
      if(!id) return;
      if(item.jsonOverride && existingIds.has(id)){
        const idx=result.locations.findIndex(loc=>String(loc.id)===id);
        if(idx>=0){const old=result.locations[idx];const updated={...old,name:String(item.name||old.name||''),address:String(item.address||old.address||''),lat:Number(item.lat??old.lat),lon:Number(item.lon??old.lon),description:String(item.description??old.description??''),contentParagraphs:String(item.story??'').trim()?[String(item.story).trim()]:Array.isArray(old.contentParagraphs)?old.contentParagraphs:[]};if(item.photo)updated.photo=item.photo;else if(item.photo===null)delete updated.photo;if(item.photoName)updated.photoName=String(item.photoName);if(!same(old,updated)){result.locations[idx]=updated;changed=true;}}
        return;
      }
      if(existingIds.has(id)) return;
      const newLocation={
        id:id, name:String(item.name||''), type:String(item.type||'Horeca'),
        category:'horeca', address:String(item.address||''),
        lat:Number(item.lat), lon:Number(item.lon),
        description:String(item.description||''),
        contentParagraphs: String(item.story||'').trim() ? [String(item.story).trim()] : [],
        userCreated:true, added_at:String(item.added_at||new Date().toISOString())
      };
      if(item.photo) newLocation.photo=item.photo;
      if(item.photoName) newLocation.photoName=String(item.photoName);
      if(item.coordinate_status) newLocation.coordinate_status=String(item.coordinate_status);
      result.locations.push(newLocation); existingIds.add(id); changed=true;
    });
    result.locations=result.locations.map(location=>{
      const copy={...location};
      const id=String(copy.id);
      const hasVisit=Object.prototype.hasOwnProperty.call(visited,id) && !!visited[id] && !!visited[id].visitedAt;
      const localItems=Array.isArray(extra[id]) ? extra[id].filter(item=>String(item?.date||'').trim() || String(item?.text||'').trim()) : [];

      // Geen lokale gegevens voor deze locatie? Laat de bronrecord exact intact.
      // Zonder een expliciete wijzigingshistorie kunnen we niet veilig concluderen
      // dat bestaande personalData verwijderd moet worden.
      if(!hasVisit && localItems.length===0) return copy;

      const personal=makePersonalData(copy,visited,extra);
      const current=copy.personalData && typeof copy.personalData==='object' ? copy.personalData : {};
      const mergedPersonal={...current,...(personal||{})};
      if(!same(current,mergedPersonal)){copy.personalData=mergedPersonal;changed=true;}
      return copy;
    });
    return {data:result,changed};
  }
  function crc32(bytes){
    let crc=-1;
    for(let i=0;i<bytes.length;i++){
      crc^=bytes[i];
      for(let j=0;j<8;j++)crc=(crc>>>1)^((crc&1)?0xEDB88320:0);
    }
    return (crc^-1)>>>0;
  }
  function u16(n){return [n&255,(n>>>8)&255];}
  function u32(n){return [n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255];}
  function joinBytes(parts){const size=parts.reduce((n,p)=>n+p.length,0);const out=new Uint8Array(size);let at=0;for(const part of parts){out.set(part,at);at+=part.length;}return out;}
  function makeZip(files){
    const locals=[],centrals=[];let offset=0;
    for(const file of files){
      const name=encoder.encode(file.name),data=encoder.encode(file.text),crc=crc32(data);
      const local=joinBytes([new Uint8Array([0x50,0x4b,0x03,0x04]),new Uint8Array(u16(20)),new Uint8Array(u16(0x0800)),new Uint8Array(u16(0)),new Uint8Array(u16(0)),new Uint8Array(u16(0)),new Uint8Array(u32(crc)),new Uint8Array(u32(data.length)),new Uint8Array(u32(data.length)),new Uint8Array(u16(name.length)),new Uint8Array(u16(0)),name,data]);
      locals.push(local);
      const central=joinBytes([new Uint8Array([0x50,0x4b,0x01,0x02]),new Uint8Array(u16(20)),new Uint8Array(u16(20)),new Uint8Array(u16(0x0800)),new Uint8Array(u16(0)),new Uint8Array(u16(0)),new Uint8Array(u16(0)),new Uint8Array(u32(crc)),new Uint8Array(u32(data.length)),new Uint8Array(u32(data.length)),new Uint8Array(u16(name.length)),new Uint8Array(u16(0)),new Uint8Array(u16(0)),new Uint8Array(u16(0)),new Uint8Array(u16(0)),new Uint8Array(u32(0)),new Uint8Array(u32(offset)),name]);
      centrals.push(central);offset+=local.length;
    }
    const centralBytes=joinBytes(centrals),localBytes=joinBytes(locals);
    const end=joinBytes([new Uint8Array([0x50,0x4b,0x05,0x06]),new Uint8Array(u16(0)),new Uint8Array(u16(0)),new Uint8Array(u16(files.length)),new Uint8Array(u16(files.length)),new Uint8Array(u32(centralBytes.length)),new Uint8Array(u32(localBytes.length)),new Uint8Array(u16(0))]);
    return new Blob([localBytes,centralBytes,end],{type:'application/zip'});
  }
  function download(blob,filename){
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;a.style.display='none';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  async function exportChangedJson(){
    const button=document.getElementById(BUTTON_ID);if(button)button.disabled=true;
    setStatus('Alle JSON-bestanden van de actieve vakantie verzamelen…');
    try{
      const active=String(window.reisblikVakantie?.getActieveVakantieId?.()||'');
      if(!active)throw new Error('Er is geen actieve vakantie geselecteerd.');
      const basePath=String(window.reisblikVakantie?.getActieveVakantieBasePath?.()||'').replace(/^\/+|\/+$/g,'');
      const parts=window.reisblikVakantie?.getActieveVakantieOnderdelen?.()||[];
      const selected=window.reisblikVakantie?.getGeselecteerdeOnderdeelIds?.()||[];
      const roots=parts.length?parts.filter(p=>selected.map(String).includes(String(p.id))).map(p=>[basePath,String(p.path||p.id||'').replace(/^\/+|\/+$/g,'')].filter(Boolean).join('/')):[basePath];
      if(!roots.length)throw new Error('Er zijn geen gegevensmappen voor de actieve vakantie gevonden.');
      const categories=['locaties','kunst','winkels','horeca','informatie','evenementen'];
      const paths=[];roots.forEach(root=>categories.forEach(cat=>paths.push([root,cat,cat+'.json'].filter(Boolean).join('/'))));
      const userRaw=JSON.parse(localStorage.getItem(scopedKey('ruinekerk_user_locations_v1'))||'[]');
      const userLocations=Array.isArray(userRaw)?userRaw.filter(x=>x&&(!x.vacationId||String(x.vacationId)===active)):[];
      const visited=readObject(scopedKey(VISITED_BASE));
      const extra=readObject(scopedKey(EXTRA_BASE));
      const files=[];let totalLocations=0;const warnings=[];
      for(const path of paths){
        let source;const response=await fetch(path+'?fullExport='+Date.now(),{cache:'no-store'});
        if(response.status===404){source={formatVersion:'2.0',locations:[]};}
        else {if(!response.ok)throw new Error('Kon '+path+' niet ophalen (HTTP '+response.status+').');source=await response.json();if(!Array.isArray(source.locations))throw new Error(path+' bevat geen geldige locations-lijst.');}
        const cat=path.split('/').slice(-2,-1)[0];const result=JSON.parse(JSON.stringify(source));
        const map=new Map(result.locations.map((loc,i)=>[String(loc.id),i]));
        for(const item of userLocations){
          const itemCat=String(item.category||item.type||'').toLowerCase();
          const sourcePath=String(item.jsonSourcePath||item._jsonSourcePath||'').replace(/^\.\//,'').replace(/^\//,'');
          const belongs=sourcePath===path || (itemCat===cat && (!sourcePath || sourcePath===path));
          if(!belongs)continue;
          const id=String(item.id||'');if(!id)continue;
          const idx=map.has(id)?map.get(id):-1;
          if(item.jsonDeleted){if(idx>=0){result.locations.splice(idx,1);map.clear();result.locations.forEach((loc,i)=>map.set(String(loc.id),i));}continue;}
          const old=idx>=0?result.locations[idx]:{};
          const updated={...old,...item,id};
          delete updated._jsonSourcePath;delete updated._jsonCategory;delete updated._jsonVacationId;delete updated.jsonSourcePath;delete updated.jsonOverride;delete updated.jsonDeleted;delete updated.vacationId;
          if(item.name!==undefined)updated.name=String(item.name);
          if(item.address!==undefined)updated.address=String(item.address);
          if(item.lat!==undefined)updated.lat=Number(item.lat);
          if(item.lon!==undefined)updated.lon=Number(item.lon);
          if(item.description!==undefined)updated.description=String(item.description);
          const story=String(item.story||'').trim();
          if(story)updated.contentParagraphs=story.split(/\n\s*\n/).map(x=>x.trim()).filter(Boolean);
          if(item.photo===null)delete updated.photo;else if(item.photo)updated.photo=item.photo;
          if(item.photoName)updated.photoName=String(item.photoName);
          if(idx>=0)result.locations[idx]=updated;else {updated.userCreated=true;updated.added_at=String(item.added_at||new Date().toISOString());result.locations.push(updated);map.set(id,result.locations.length-1);}
        }
        result.locations=result.locations.map(loc=>{
          const copy={...loc};const id=String(copy.id||'');
          const visit=visited[id];const personal={...(copy.personalData&&typeof copy.personalData==='object'?copy.personalData:{})};
          if(visit&&visit.visitedAt)personal.visitedAt=String(visit.visitedAt);
          const notes=Array.isArray(extra[id])?extra[id].map(x=>({date:String(x?.date||''),text:String(x?.text||'')})).filter(x=>x.date||x.text):[];
          if(notes.length)personal.extraInfo=notes;
          if(Object.keys(personal).length)copy.personalData=personal;
          return copy;
        });
        totalLocations+=result.locations.length;
        result.metadata={...(result.metadata||{}),generatedAt:new Date().toISOString(),generatedBy:'Reisblik volledige vakantie-export'};
        files.push({name:path,text:JSON.stringify(result,null,2)+'\n'});
      }
      // Dagverslagen worden vakantiebreed uit de lokale opslag geëxporteerd.
      const dayReports=buildDayReportsJson();
      const dayReportPath=[basePath,'dagverslagen','dagverslagen.json'].filter(Boolean).join('/');
      files.push({name:dayReportPath,text:JSON.stringify(dayReports,null,2)+'\n'});
      const dayReportCount=dayReports.reports.length;
      if(!files.length)throw new Error('Er zijn geen JSON-bestanden gevonden om te exporteren.');
      files.push({name:'JSON_UPDATE_LEESMIJ.txt',text:'Reisblik — volledige JSON-export\n\nAlle categorie-JSON-bestanden voor de actieve vakantie zijn opnieuw gegenereerd. Controleer de aantallen en vervang daarna de bestanden op exact dezelfde paden in de ontwikkelrepository. De export bevat bestaande bronlocaties, lokale nieuwe/gewijzigde locaties, bezochte gegevens en extra notities.\n\nBestanden: '+files.length+' (inclusief dit leesmij-bestand)\nLocatierecords: '+totalLocations+'\n'});
      download(makeZip(files),'Reisblik_JSON_VOLLEDIG_'+active+'_'+new Date().toISOString().slice(0,10)+'.zip');
      setStatus('Volledige ZIP aangemaakt: '+(files.length-1)+' JSON-bestanden, '+totalLocations+' locatierecords en '+dayReportCount+' dagverslagen. Controleer de bestanden vóór vervanging in GitHub.');
    }catch(error){console.error('Volledige JSON-export mislukt:',error);setStatus('Export mislukt: '+(error?.message||error),true);}
    finally{if(button)button.disabled=false;}
  }
  function bindExportButton(){
    const button=document.getElementById(BUTTON_ID);
    if(!button){
      console.warn('[Reisblik JSON] Knop niet gevonden:',BUTTON_ID);
      return;
    }
    // Voorkom dubbele koppeling wanneer de module opnieuw wordt geladen.
    if(button.dataset.jsonExportBound==='1') return;
    button.dataset.jsonExportBound='1';
    button.addEventListener('click',function(event){
      event.preventDefault();
      exportChangedJson().catch(error=>{
        console.error('[Reisblik JSON] Onverwachte fout:',error);
        setStatus('Exportfout: '+(error?.message||String(error)),true);
        alert('Bijwerken JSON is niet gelukt.\n\n'+(error?.message||String(error))+'\n\nBekijk eventueel de console voor details.');
      });
    });
    console.info('[Reisblik JSON] Knop gekoppeld.');
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',bindExportButton,{once:true});
  else bindExportButton();
})();
