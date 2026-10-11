/* Reisblik 9.9.32 — algemene dagverslagen per reisdag */
(function(){
  "use strict";
  const BASE_KEY='reisblik_dagverslag_v1';
  const storageKey=()=>window.reisblikVakantie?.getVakantieStorageKey
    ? window.reisblikVakantie.getVakantieStorageKey(BASE_KEY) : BASE_KEY;
  function read(){
    try{
      const raw=localStorage.getItem(storageKey());
      const data=raw?JSON.parse(raw):{};
      return data&&typeof data==='object'&&!Array.isArray(data)?data:{};
    }catch(e){return {};}
  }
  function write(data){localStorage.setItem(storageKey(),JSON.stringify(data));}
  function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
  function today(){
    const d=new Date();
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
  function formatDate(v){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(v||'')))return String(v||'');
    const [y,m,d]=String(v).split('-');
    return d+'-'+m+'-'+y;
  }
  function get(date){return String(read()[String(date||'')]||'');}
  function getRange(from,to){
    const out=[]; const data=read();
    const a=new Date(String(from)+'T12:00:00'), b=new Date(String(to)+'T12:00:00');
    if(Number.isNaN(a.getTime())||Number.isNaN(b.getTime()))return out;
    while(a<=b){
      const key=a.getFullYear()+'-'+String(a.getMonth()+1).padStart(2,'0')+'-'+String(a.getDate()).padStart(2,'0');
      if(data[key])out.push({date:key,text:String(data[key])});
      a.setDate(a.getDate()+1);
    }
    return out;
  }
  function renderList(){
    const el=document.getElementById('dayReportList'); if(!el)return;
    const data=read();
    const keys=Object.keys(data).filter(k=>String(data[k]||'').trim()).sort().reverse();
    el.innerHTML=keys.length?keys.map(date=>'<div class="note-item"><div class="note-date">'+esc(formatDate(date))+'</div><div class="note-text">'+esc(data[date]).replace(/\n/g,'<br>')+'</div><button type="button" class="note-delete" data-day-report-edit="'+esc(date)+'">✏️ Bewerken</button></div>').join(''):'<div class="notes-empty">Nog geen dagverslagen opgeslagen.</div>';
    el.querySelectorAll('[data-day-report-edit]').forEach(btn=>btn.addEventListener('click',()=>{
      const date=btn.dataset.dayReportEdit; const input=document.getElementById('dayReportInput'); const dateInput=document.getElementById('dayReportDate');
      if(dateInput)dateInput.value=date; if(input){input.value=get(date);input.focus();}
    }));
  }
  function open(){
    const modal=document.getElementById('dayReportModal'); if(!modal)return;
    if(!window.reisblikVakantie?.isVakantieActief?.()){alert('Kies eerst een actieve vakantie.');return;}
    modal.style.display='block';
    const dateInput=document.getElementById('dayReportDate');
    const saved=localStorage.getItem(window.reisblikVakantie.getVakantieStorageKey?.('reisblik_mijn_reisdag_datum')||'')||today();
    if(dateInput)dateInput.value=/^\d{4}-\d{2}-\d{2}$/.test(saved)?saved:today();
    loadSelected(); renderList();
  }
  function loadSelected(){
    const date=document.getElementById('dayReportDate')?.value||today();
    const input=document.getElementById('dayReportInput'); if(input)input.value=get(date);
    const status=document.getElementById('dayReportStatus'); if(status)status.textContent=get(date)?'Bestaand dagverslag geladen.':'Nog geen dagverslag voor deze datum.';
  }
  function save(){
    const date=document.getElementById('dayReportDate')?.value||''; const input=document.getElementById('dayReportInput'); const status=document.getElementById('dayReportStatus');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){if(status)status.textContent='Kies eerst een geldige datum.';return;}
    const text=String(input?.value||'').trim(); const data=read();
    if(text)data[date]=text; else delete data[date];
    write(data); if(status)status.textContent=text?'✅ Dagverslag opgeslagen.':'Dagverslag verwijderd omdat het leeg was.'; renderList();
  }
  function remove(){
    const date=document.getElementById('dayReportDate')?.value||''; const data=read();
    if(!data[date])return;
    if(!window.confirm('Dagverslag van '+formatDate(date)+' verwijderen?'))return;
    delete data[date]; write(data); const input=document.getElementById('dayReportInput'); if(input)input.value='';
    const status=document.getElementById('dayReportStatus'); if(status)status.textContent='🗑️ Dagverslag verwijderd.'; renderList();
  }
  function close(){stopSpeech();const modal=document.getElementById('dayReportModal');if(modal)modal.style.display='none';}

  let recognition=null;
  let listening=false;
  let speechBase='';
  function speechSupported(){return !!(window.SpeechRecognition||window.webkitSpeechRecognition);}
  function setMicState(state){
    const btn=document.getElementById('dayReportMicBtn');
    const status=document.getElementById('dayReportMicStatus');
    if(btn){btn.textContent=state==='listening'?'🛑 Stop spreken':'🎙️ Spreek in';btn.disabled=false;}
    if(status)status.textContent=state==='listening'?'Luisteren… spreek je tekst in.':state==='unsupported'?'Spraak-naar-tekst wordt niet ondersteund op dit apparaat.':'';
  }
  function startSpeech(){
    const input=document.getElementById('dayReportInput');
    if(!input)return;
    if(!speechSupported()){setMicState('unsupported');return;}
    if(listening){stopSpeech();return;}
    const C=window.SpeechRecognition||window.webkitSpeechRecognition;
    recognition=new C(); recognition.lang='nl-NL'; recognition.continuous=true; recognition.interimResults=true;
    speechBase=input.value ? input.value.trimEnd() + (input.value.trim()?' ':'') : '';
    let finalText='';
    recognition.onresult=e=>{
      let interim='';
      for(let i=e.resultIndex;i<e.results.length;i++){
        const t=e.results[i][0]?.transcript||'';
        if(e.results[i].isFinal) finalText += (finalText?' ':'')+t.trim(); else interim += t;
      }
      input.value=speechBase+finalText+(interim? (finalText?' ':'')+interim.trim():'');
      input.dispatchEvent(new Event('input',{bubbles:true}));
    };
    recognition.onerror=e=>{
      if(e.error==='not-allowed'||e.error==='service-not-allowed') setMicState('unsupported');
      listening=false;
    };
    recognition.onend=()=>{listening=false;setMicState('idle');};
    try{recognition.start();listening=true;setMicState('listening');}catch(e){listening=false;setMicState('idle');}
  }
  function stopSpeech(){
    try{recognition?.stop();}catch(e){}
    recognition=null; listening=false; setMicState('idle');
  }

  function init(){
    const openBtn=document.getElementById('dayReportOpenBtn'), closeBtn=document.getElementById('dayReportCloseBtn'), saveBtn=document.getElementById('dayReportSaveBtn'), delBtn=document.getElementById('dayReportDeleteBtn'), micBtn=document.getElementById('dayReportMicBtn'), modal=document.getElementById('dayReportModal'), date=document.getElementById('dayReportDate');
    if(!openBtn||!closeBtn||!saveBtn||!delBtn||!modal)return;
    if(openBtn.dataset.dayReportBound==='true')return; openBtn.dataset.dayReportBound='true';
    openBtn.onclick=open; closeBtn.onclick=close; saveBtn.onclick=save; delBtn.onclick=remove; if(micBtn) micBtn.onclick=startSpeech;
    modal.onclick=e=>{if(e.target===modal)close();};
    date?.addEventListener('change',loadSelected);
    document.getElementById('dayReportInput')?.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter')save();});
    window.reisblikVakantie?.onVakantieGewijzigd?.(()=>{if(modal.style.display!=='none')open();});
  }
  window.reisblikDagverslag={BASE_KEY,read,get,getRange,renderList,startSpeech,stopSpeech};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();
