/* Reisblik 9.7.5 — Extra informatie
 * Oude extra-info- en notitiefuncties zijn uit de actieve UI verwijderd.
 * Bestaande legacy-opslag blijft behouden voor backup/restore/search en wordt
 * waar mogelijk eenmalig meegenomen naar het huidige extra-informatiesysteem.
 */
function migrateLegacyExtraInfo(){
 try{
  const raw=localStorage.getItem(reisblikVakantieStorageKey('ruinekerk_extra_info_v1'));
  if(!raw)return;
  const legacy=JSON.parse(raw);
  if(!legacy || typeof legacy!=='object')return;
  let current={};
  try{ current=JSON.parse(localStorage.getItem(reisblikVakantieStorageKey('ruinekerk_extra_simple_v1'))||'{}'); }catch(e){ current={}; }
  if(!current || typeof current!=='object')current={};
  let changed=false;
  Object.keys(legacy).forEach(id=>{
   const legacyItems=Array.isArray(legacy[id])?legacy[id]:[];
   if(!legacyItems.length)return;
   const existing=Array.isArray(current[id])?current[id]:[];
   legacyItems.forEach(item=>{
    const migrated={date:String(item?.date||''),text:String(item?.text||'')};
    if(!migrated.date && !migrated.text)return;
    const duplicate=existing.some(x=>String(x?.date||'')===migrated.date && String(x?.text||'')===migrated.text);
    if(!duplicate){existing.push(migrated);changed=true;}
   });
   if(existing.length)current[id]=existing;
  });
  if(changed)localStorage.setItem(reisblikVakantieStorageKey('ruinekerk_extra_simple_v1'),JSON.stringify(current));
 }catch(e){ console.warn('Reisblik: oude extra informatie kon niet worden gemigreerd',e); }
}

let simpleExtraId=null;
let simpleExtraEditingIndex=null;

function simpleExtraData(){
 migrateLegacyExtraInfo();
 try{
  const raw=localStorage.getItem(reisblikVakantieStorageKey('ruinekerk_extra_simple_v1'));
  const parsed=raw?JSON.parse(raw):{};
  const data=parsed&&typeof parsed==='object'?parsed:{};
  // 8.4.1: migrate the old one-item-per-location format to an array.
  let changed=false;
  Object.keys(data).forEach(id=>{
   if(data[id] && !Array.isArray(data[id]) && typeof data[id]==='object'){
    data[id]=[{date:data[id].date||'',text:data[id].text||''}];
    changed=true;
   }
  });
  if(changed)localStorage.setItem(reisblikVakantieStorageKey('ruinekerk_extra_simple_v1'),JSON.stringify(data));
  // Portable notes saved in horeca.json are shown even on a different device
  // or after localStorage has been cleared. Displaying them does not persist them.
  const currentLocations=window.reisblikGetCurrentLocations?.()||[];
  currentLocations.forEach(location=>{
   const saved=location?.personalData?.extraInfo;
   if(!Array.isArray(saved)||!saved.length)return;
   const id=String(location.id), merged=Array.isArray(data[id])?data[id].slice():[];
   saved.forEach(item=>{
    const normalized={date:String(item?.date||''),text:String(item?.text||'')};
    if(!normalized.date&&!normalized.text)return;
    if(!merged.some(x=>String(x?.date||'')===normalized.date&&String(x?.text||'')===normalized.text))merged.push(normalized);
   });
   if(merged.length)data[id]=merged;
  });
  return data;
 }catch(e){return {}}
}
function openSimpleExtra(id){
 simpleExtraId=id;
 simpleExtraEditingIndex=null;
 const x=locations.find(a=>a.id===id);
 document.getElementById('simpleExtraTitle').textContent='➕ Extra informatie – '+(x?x.name:'Locatie');
 document.getElementById('simpleExtraDate').value=new Date().toISOString().slice(0,10);
 document.getElementById('simpleExtraText').value='';
 document.getElementById('simpleExtraSaveBtn').textContent='Opslaan';
 document.getElementById('simpleExtraModal').style.display='block';
}
function editSimpleExtra(id,index){
 simpleExtraId=id;
 simpleExtraEditingIndex=Number(index);
 const data=simpleExtraData();
 const items=Array.isArray(data[id])?data[id]:[];
 const item=items[simpleExtraEditingIndex];
 if(!item)return;
 const x=locations.find(a=>a.id===id);
 document.getElementById('simpleExtraTitle').textContent='✏️ Extra informatie bewerken – '+(x?x.name:'Locatie');
 document.getElementById('simpleExtraDate').value=item.date||'';
 document.getElementById('simpleExtraText').value=item.text||'';
 document.getElementById('simpleExtraSaveBtn').textContent='💾 Wijzigingen opslaan';
 document.getElementById('simpleExtraModal').style.display='block';
}
function closeSimpleExtra(){
 stopSimpleExtraMicrophone();
 document.getElementById('simpleExtraModal').style.display='none';
 simpleExtraEditingIndex=null;
}
function saveSimpleExtra(){
 const value=document.getElementById('simpleExtraText').value.trim();
 if(!value){alert('Vul eerst de extra informatie in.');return}
 const all=simpleExtraData();
 all[simpleExtraId]=Array.isArray(all[simpleExtraId])?all[simpleExtraId]:[];
 const item={date:document.getElementById('simpleExtraDate').value,text:value};
 if(simpleExtraEditingIndex===null){
  all[simpleExtraId].push(item);
 }else{
  if(!all[simpleExtraId][simpleExtraEditingIndex]){alert('Deze extra informatie bestaat niet meer.');return}
  all[simpleExtraId][simpleExtraEditingIndex]=item;
 }
 localStorage.setItem(reisblikVakantieStorageKey('ruinekerk_extra_simple_v1'),JSON.stringify(all));
 closeSimpleExtra();
 renderSimpleExtra(simpleExtraId);
}
function renderSimpleExtra(id){
 const el=document.getElementById('simple-extra-'+id);if(!el)return;
 const data=simpleExtraData();
 const items=Array.isArray(data[id])?data[id]:[];
 el.innerHTML=items.map((item,index)=>
  `<div class="extra-item"><div class="extra-date"><b>${esc(item.date||'')}</b></div><div style="margin-top:3px">${esc(item.text||'')}</div><button type="button" style="margin-top:8px" onclick="editSimpleExtra('${esc(id)}',${index})">✏️ Bewerken</button></div>`
 ).join('');
}
function renderAllSimpleExtra(){locations.forEach(x=>renderSimpleExtra(x.id));}

// Reisblik 8.5 — Spraakfunctie stap 3, 4, 5, 6 en 8
// Stap 3: microfoon activeren en toestemming vragen.
// Stap 4: expliciete STOP-knop.
// Stap 5: spraak -> tekst.
// Stap 6: opnieuw inspreken voegt tekst toe.
// Stap 8: tekst wordt via de bestaande Opslaan-functie lokaal opgeslagen.
let simpleExtraMicStream = null;
let simpleExtraRecognition = null;
let simpleExtraSpeechBaseText = '';
let simpleExtraSpeechRunning = false;
let simpleExtraLastRecognizedText = '';
let simpleExtraLastRecognizedAt = 0;

function getSpeechRecognitionConstructor(){
 return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function setSimpleExtraSpeechStatus(text){
 const status=document.getElementById('simpleExtraSpeechStatus');
 if(status)status.textContent=text;
}

function stopSimpleExtraMicStream(){
 if(simpleExtraMicStream){
  simpleExtraMicStream.getTracks().forEach(track=>track.stop());
  simpleExtraMicStream=null;
 }
}

function appendRecognizedText(text){
 const textarea=document.getElementById('simpleExtraText');
 if(!textarea)return;
 const spoken=(text||'').trim();
 if(!spoken)return;
 const now=Date.now();
 // Sommige browsers leveren dezelfde definitieve transcriptie twee keer.
 // Negeer een identieke herhaling binnen 3 seconden.
 if(spoken===simpleExtraLastRecognizedText && now-simpleExtraLastRecognizedAt<3000)return;
 simpleExtraLastRecognizedText=spoken;
 simpleExtraLastRecognizedAt=now;
 const current=textarea.value.trimEnd();
 textarea.value=current ? current+' '+spoken : spoken;
 textarea.dispatchEvent(new Event('input',{bubbles:true}));
 textarea.focus();
}

function createSimpleExtraRecognition(){
 const Recognition=getSpeechRecognitionConstructor();
 if(!Recognition)return null;
 const recognition=new Recognition();
 recognition.lang='nl-NL';
 recognition.continuous=false;
 recognition.interimResults=true;
 recognition.maxAlternatives=1;

 recognition.onstart=()=>{
  simpleExtraSpeechRunning=true;
  const startBtn=document.getElementById('simpleExtraSpeechBtn');
  const stopBtn=document.getElementById('simpleExtraSpeechStopBtn');
  if(startBtn)startBtn.style.display='none';
  if(stopBtn)stopBtn.style.display='inline-block';
  setSimpleExtraSpeechStatus('🎤 Luisteren… Spreek rustig. Druk op ⏹ Stop microfoon als je klaar bent.');
 };

 recognition.onresult=(event)=>{
  let finalText='';
  for(let i=event.resultIndex;i<event.results.length;i++){
   const result=event.results[i];
   if(result.isFinal)finalText += result[0].transcript+' ';
  }
  if(finalText){
   appendRecognizedText(finalText);
   // Eén inspreekactie = één herkenningsronde. Dit voorkomt dat achtergrondgeluid
   // of een tweede automatische herkenningsronde tekst blijft toevoegen.
   try{ recognition.stop(); }catch(e){}
  }
 };

 recognition.onerror=(event)=>{
  simpleExtraSpeechRunning=false;
  if(event.error==='not-allowed' || event.error==='service-not-allowed'){
   setSimpleExtraSpeechStatus('Microfoontoestemming is geweigerd. Geef Reisblik toestemming voor de microfoon en probeer opnieuw.');
  }else if(event.error==='no-speech'){
   setSimpleExtraSpeechStatus('Geen spraak gehoord. Druk opnieuw op 🎤 Microfoon starten.');
  }else{
   setSimpleExtraSpeechStatus('Spraakherkenning kon niet worden gestart ('+event.error+').');
  }
  stopSimpleExtraMicStream();
  const startBtn=document.getElementById('simpleExtraSpeechBtn');
  const stopBtn=document.getElementById('simpleExtraSpeechStopBtn');
  if(startBtn)startBtn.style.display='inline-block';
  if(stopBtn)stopBtn.style.display='none';
 };

 recognition.onend=()=>{
  simpleExtraSpeechRunning=false;
  stopSimpleExtraMicStream();
  const startBtn=document.getElementById('simpleExtraSpeechBtn');
  const stopBtn=document.getElementById('simpleExtraSpeechStopBtn');
  if(startBtn)startBtn.style.display='inline-block';
  if(stopBtn)stopBtn.style.display='none';
  if(!document.getElementById('simpleExtraModal') || document.getElementById('simpleExtraModal').style.display!=='none'){
   setSimpleExtraSpeechStatus('Spraak gestopt. Je kunt opnieuw inspreken of de tekst bewerken en opslaan.');
  }
 };
 return recognition;
}

async function startSimpleExtraMicrophone(){
 const startBtn=document.getElementById('simpleExtraSpeechBtn');
 const stopBtn=document.getElementById('simpleExtraSpeechStopBtn');
 const status=document.getElementById('simpleExtraSpeechStatus');
 const textarea=document.getElementById('simpleExtraText');
 if(!startBtn || !stopBtn || !status || !textarea)return;

 const Recognition=getSpeechRecognitionConstructor();
 if(!Recognition){
  status.textContent='Spraakherkenning wordt niet ondersteund door deze browser. Je kunt de tekst hieronder gewoon typen.';
  return;
 }
 if(simpleExtraSpeechRunning)return;

 try{
  // Eerst expliciet microfoontoestemming vragen. Daarna sluiten we deze tijdelijke
  // audiostream weer, zodat SpeechRecognition de microfoon kan gebruiken.
  if(navigator.mediaDevices && navigator.mediaDevices.getUserMedia){
   simpleExtraMicStream=await navigator.mediaDevices.getUserMedia({audio:true});
   stopSimpleExtraMicStream();
  }

  simpleExtraSpeechBaseText=textarea.value;
  simpleExtraRecognition=createSimpleExtraRecognition();
  if(!simpleExtraRecognition)return;
  simpleExtraRecognition.start();
 }catch(err){
  stopSimpleExtraMicStream();
  simpleExtraRecognition=null;
  if(err && (err.name==='NotAllowedError' || err.name==='PermissionDeniedError')){
   status.textContent='Microfoontoestemming is geweigerd. Geef Reisblik toestemming voor de microfoon en probeer opnieuw.';
  }else if(err && err.name==='InvalidStateError'){
   status.textContent='De spraakherkenning is al actief.';
  }else{
   status.textContent='De microfoon of spraakherkenning kon niet worden geactiveerd.';
  }
 }
}

function stopSimpleExtraMicrophone(){
 const recognition=simpleExtraRecognition;
 simpleExtraRecognition=null;
 simpleExtraSpeechRunning=false;
 if(recognition){
  try{recognition.stop();}catch(e){}
 }
 stopSimpleExtraMicStream();
 const startBtn=document.getElementById('simpleExtraSpeechBtn');
 const stopBtn=document.getElementById('simpleExtraSpeechStopBtn');
 if(startBtn)startBtn.style.display='inline-block';
 if(stopBtn)stopBtn.style.display='none';
 if(document.getElementById('simpleExtraSpeechStatus')){
  setSimpleExtraSpeechStatus('Spraak gestopt. Je kunt de tekst nog bewerken en daarna lokaal opslaan.');
 }
}

function initSimpleExtraSpeechControls(){
 const startBtn=document.getElementById('simpleExtraSpeechBtn');
 const stopBtn=document.getElementById('simpleExtraSpeechStopBtn');
 if(!startBtn || !stopBtn)return;
 startBtn.removeEventListener('click',startSimpleExtraMicrophone);
 stopBtn.removeEventListener('click',stopSimpleExtraMicrophone);
 startBtn.addEventListener('click',startSimpleExtraMicrophone);
 stopBtn.addEventListener('click',stopSimpleExtraMicrophone);
}

if(document.readyState==='loading'){
 document.addEventListener('DOMContentLoaded',initSimpleExtraSpeechControls,{once:true});
}else{
 initSimpleExtraSpeechControls();
}
