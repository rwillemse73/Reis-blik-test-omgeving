/* Reisblik 9.9.14 — veilig restore lokale gegevens per vakantie */
(function(){
  "use strict";
  const BASE_KEYS=["reisblik_visited_v1","ruinekerk_extra_info_v1","ruinekerk_extra_simple_v1","ruinekerk_notes_v1","ruinekerk_user_locations_v1","reisblik_agenda_evenementen_v1","reisblik_mijn_reisdag_datum","reisblik_mijn_reisdag_datum_van","reisblik_mijn_reisdag_datum_tm","reisblik_aantekeningen_v1","reisblik_dagverslag_v1"];
  let selectedBackup=null;
  function idPart(id){return String(id||"").trim().toLowerCase().replace(/[^a-z0-9_-]+/g,"_").replace(/^_+|_+$/g,"");}
  function scoped(base,id){return base+"__"+idPart(id);}
  function targetKey(base){return window.reisblikVakantie?.getVakantieStorageKey?window.reisblikVakantie.getVakantieStorageKey(base):base;}
  function writeActive(base,value){const key=targetKey(base);if(value===null||typeof value==="undefined")return false;localStorage.setItem(key,JSON.stringify(value));return true;}
  function renderPreview(b){const el=document.getElementById("restorePreview");if(!el)return;const ver=b?.backupFormatVersion||"onbekend";const vc=b?.vacations&&typeof b.vacations==='object'?Object.keys(b.vacations).length:0;el.textContent="Backupformaat "+ver+" gecontroleerd · "+vc+" vakanties gevonden.";}
  function init(){
    const open=document.getElementById("restoreOpenBtn"),modal=document.getElementById("restoreModal"),close=document.getElementById("restoreCloseBtn"),file=document.getElementById("restoreFile"),confirm=document.getElementById("restoreConfirmBtn"),status=document.getElementById("restoreStatus");
    if(!open||!modal||!close||!file||!confirm)return;
    if(open.dataset.restoreBound==="true")return;open.dataset.restoreBound="true";
    open.onclick=()=>{modal.style.display="block";file.value="";confirm.disabled=true;selectedBackup=null;if(status)status.textContent="";};
    close.onclick=()=>modal.style.display="none";
    modal.onclick=e=>{if(e.target===modal)modal.style.display="none";};
    file.onchange=()=>{const f=file.files?.[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{const b=JSON.parse(r.result);if(!b||!b.backupType||(!b.data&&!b.vacations))throw new Error("Geen geldige Reisblik-backup");selectedBackup=b;renderPreview(b);confirm.disabled=false;}catch(e){selectedBackup=null;confirm.disabled=true;if(status)status.textContent="⚠️ Ongeldige backup: "+e.message;}};r.readAsText(f);};
    confirm.onclick=()=>{if(!selectedBackup||!window.confirm("Weet je zeker dat je deze backup wilt terugzetten? Bestaande lokale gegevens worden alleen overschreven door werkelijk opgeslagen backupgegevens."))return;try{
      let written=0;
      if(selectedBackup.vacations&&typeof selectedBackup.vacations==='object'){
        Object.entries(selectedBackup.vacations).forEach(([id,v])=>Object.entries(v?.data||{}).forEach(([base,val])=>{
          if(!BASE_KEYS.includes(base))return;
          // null/undefined in a backup means 'geen backupwaarde'; NEVER erase current data because of it.
          if(val===null||typeof val==='undefined')return;
          localStorage.setItem(scoped(base,id),JSON.stringify(val));written++;
        }));
        if(selectedBackup.legacyData){
          Object.entries(selectedBackup.legacyData).forEach(([base,val])=>{
            if(!BASE_KEYS.includes(base)||val===null||typeof val==="undefined")return;
            if(localStorage.getItem(targetKey(base))===null){writeActive(base,val);written++;}
          });
        }
      }else{
        BASE_KEYS.forEach(base=>{if(Object.prototype.hasOwnProperty.call(selectedBackup.data||{},base)&&selectedBackup.data[base]!==null&&typeof selectedBackup.data[base]!=="undefined"){writeActive(base,selectedBackup.data[base]);written++;}});
      }
      if(status)status.textContent="✅ Backup teruggezet: "+written+" gegevenswaarden. Reisblik wordt opnieuw geladen.";setTimeout(()=>window.location.reload(),700);
    }catch(e){if(status)status.textContent="⚠️ Backup terugzetten is niet gelukt: "+e.message;}};
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
