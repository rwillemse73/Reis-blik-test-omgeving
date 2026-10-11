/* Reisblik 10.0.16 — exporteer gewijzigde JSON-locaties en verwijderingen.
 * Pilot: Praag → Horeca. Lokale opslag wordt nooit verwijderd.
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
    setStatus('JSON-bronnen en lokale wijzigingen controleren…');
    try{
      let userLocations=[];
      try{const raw=JSON.parse(localStorage.getItem(scopedKey('ruinekerk_user_locations_v1'))||'[]');if(Array.isArray(raw))userLocations=raw;}
      catch(e){throw new Error('Lokale locaties konden niet worden gelezen.');}
      const active=String(window.reisblikVakantie?.getActieveVakantieId?.()||'');
      const pending=userLocations.filter(item=>item && String(item.vacationId||active)===active && (item.jsonOverride||item.jsonSourcePath||item._jsonSourcePath));
      if(!pending.length){setStatus('Geen gewijzigde JSON-locaties gevonden. Lokale locaties blijven behouden.');return;}
      const groups=new Map();
      for(const item of pending){
        const path=String(item.jsonSourcePath||item._jsonSourcePath||'').replace(/^\.\//,'').replace(/^\//,'');
        if(!path || !path.endsWith('.json')){console.warn('JSON-bron ontbreekt voor',item.id);continue;}
        if(!groups.has(path))groups.set(path,[]);groups.get(path).push(item);
      }
      if(!groups.size){setStatus('Geen JSON-bron gevonden bij de lokale wijzigingen. Open de locatie opnieuw vanuit JSON en sla opnieuw op.',true);return;}
      const files=[];let totalChanged=0;
      for(const [path,items] of groups){
        const response=await fetch(path+'?exportCheck='+Date.now(),{cache:'no-store'});
        if(!response.ok)throw new Error('Kon '+path+' niet ophalen (HTTP '+response.status+').');
        const source=await response.json();if(!Array.isArray(source.locations))throw new Error(path+' bevat geen locations-lijst.');
        const result=JSON.parse(JSON.stringify(source));let changed=false;
        for(const item of items){
          const id=String(item.id||'');if(!id)continue;
          const idx=result.locations.findIndex(loc=>String(loc.id)===id);
          if(item.jsonDeleted){
            if(idx>=0){result.locations.splice(idx,1);changed=true;}
            continue;
          }
          const old=idx>=0?result.locations[idx]:null;
          const updated={...(old||{}),id,name:String(item.name||old?.name||''),address:String(item.address||old?.address||''),lat:Number(item.lat??old?.lat),lon:Number(item.lon??old?.lon),description:String(item.description??old?.description??''),type:item.type||old?.type||item.category||'locaties',category:item.category||old?.category||item.type||'locaties'};
          const story=String(item.story||'').trim();
          const description=String(item.description||'').trim();
          if(description)updated.contentParagraphs=description.split(/\n\s*\n/).map(part=>part.trim()).filter(Boolean);
          else if(story)updated.contentParagraphs=[story];
          else if(Array.isArray(old?.contentParagraphs))updated.contentParagraphs=old.contentParagraphs;
          if(item.photo)updated.photo=item.photo;else if(item.photo===null)delete updated.photo;
          if(item.photoName)updated.photoName=String(item.photoName);
          if(idx>=0){if(!same(old,updated)){result.locations[idx]=updated;changed=true;}}
          else {updated.userCreated=true;updated.added_at=String(item.added_at||new Date().toISOString());result.locations.push(updated);changed=true;}
        }
        if(changed){result.metadata={...(result.metadata||{}),generatedAt:new Date().toISOString()};files.push({name:path,text:JSON.stringify(result,null,2)+'\n'});totalChanged++;}
      }
      if(!files.length){setStatus('Geen inhoudelijke wijzigingen gevonden in de gekoppelde JSON-bestanden.');return;}
      files.push({name:'JSON_UPDATE_LEESMIJ.txt',text:'# Reisblik — JSON-update\n\nVervang alleen de JSON-bestanden in deze ZIP op exact hetzelfde pad in je ontwikkelrepository.\n\nDe export bevat alleen bestanden waarin een inhoudelijke wijziging is gevonden. Lokale gegevens zijn niet verwijderd.\n'});
      download(makeZip(files),'Reisblik_JSON_update_'+active+'_'+new Date().toISOString().slice(0,10)+'.zip');
      setStatus('ZIP aangemaakt: '+totalChanged+' gewijzigd JSON-bestand(en). Vervang alleen de bestanden uit de ZIP; lokale gegevens zijn behouden.');
    }catch(error){console.error('Bijwerken JSON mislukt:',error);setStatus('Export mislukt: '+(error?.message||error),true);}
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
