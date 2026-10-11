/* Reisblik 10.0.1 — exporteer uitsluitend gewijzigde JSON-data.
 * Eerste pilot: Praag → Horeca. De export voegt persoonlijke gegevens toe aan
 * het bijbehorende record; lokale opslag wordt nooit verwijderd of overschreven.
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
  function mergeLocalData(source,visited,extra){
    const result=JSON.parse(JSON.stringify(source));
    if(!Array.isArray(result.locations))throw new Error('horeca.json bevat geen geldige locations-lijst.');
    let changed=false;
    result.locations=result.locations.map(location=>{
      const copy={...location};
      const personal=makePersonalData(copy,visited,extra);
      if(personal){
        if(!same(copy.personalData,personal)){copy.personalData=personal;changed=true;}
      }else if(Object.prototype.hasOwnProperty.call(copy,'personalData')){
        delete copy.personalData;changed=true;
      }
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
    const active=window.reisblikVakantie?.getActieveVakantieId?.()||'';
    if(active!==TARGET_VACATION){setStatus('Kies eerst de vakantie Praag. Deze eerste versie werkt alleen voor Praag → Horeca.',true);return;}
    const button=document.getElementById(BUTTON_ID);if(button)button.disabled=true;
    setStatus('JSON en lokale wijzigingen controleren…');
    try{
      const response=await fetch(DATASET_PATH+'?exportCheck='+Date.now(),{cache:'no-store'});
      if(!response.ok)throw new Error('Kon '+DATASET_PATH+' niet ophalen (HTTP '+response.status+').');
      const source=await response.json();
      const visited=readObject(scopedKey(VISITED_BASE));
      const extra=readObject(scopedKey(EXTRA_BASE));
      const merged=mergeLocalData(source,visited,extra);
      if(!merged.changed){setStatus('Geen nieuwe wijzigingen gevonden. Er is geen ZIP-bestand gemaakt.');return;}
      const jsonText=JSON.stringify(merged.data,null,2)+'\n';
      const readme='# Reisblik — JSON-update\n\nVervang in de ontwikkelrepository het bestand `'+DATASET_PATH+'` door het bestand met hetzelfde pad in deze ZIP.\n\nDeze export bevat persoonlijke gegevens uit localStorage (Bezocht en Extra informatie) die aan de overeenkomstige locatie-records zijn toegevoegd. De lokale gegevens in de browser zijn niet verwijderd.\n';
      const zip=makeZip([{name:DATASET_PATH,text:jsonText},{name:'JSON_UPDATE_LEESMIJ.txt',text:readme}]);
      download(zip,'Reisblik_JSON_update_Praag_'+new Date().toISOString().slice(0,10)+'.zip');
      setStatus('ZIP aangemaakt: 1 gewijzigd JSON-bestand (Praag → Horeca). Vervang horeca/horeca.json in je ontwikkelrepository. Lokale gegevens zijn behouden.');
    }catch(error){console.error('Bijwerken JSON mislukt:',error);setStatus('Export mislukt: '+(error?.message||error),true);}
    finally{if(button)button.disabled=false;}
  }
  window.addEventListener('DOMContentLoaded',()=>{
    const button=document.getElementById(BUTTON_ID);
    if(button)button.addEventListener('click',exportChangedJson);
  });
})();
