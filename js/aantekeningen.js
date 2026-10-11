/* Reisblik 9.8.6 — losse aantekeningen per actieve vakantie */
(function(){
  "use strict";
  const BASE_KEY='reisblik_aantekeningen_v1';
  function storageKey(){
    return window.reisblikVakantie?.getVakantieStorageKey
      ? window.reisblikVakantie.getVakantieStorageKey(BASE_KEY)
      : BASE_KEY;
  }
  function read(){
    try{
      const raw=localStorage.getItem(storageKey());
      const data=raw?JSON.parse(raw):[];
      return Array.isArray(data)?data:[];
    }catch(e){return []}
  }
  function write(data){localStorage.setItem(storageKey(),JSON.stringify(data));}
  function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
  function formatDate(iso){
    const d=new Date(iso);
    return isNaN(d)?'':d.toLocaleString('nl-NL',{dateStyle:'short',timeStyle:'short'});
  }
  function render(){
    const list=document.getElementById('notesList'), empty=document.getElementById('notesEmpty');
    if(!list)return;
    const notes=read().sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
    list.innerHTML=notes.map(n=>`<div class="note-item" data-note-id="${esc(n.id)}"><div class="note-date">${esc(formatDate(n.createdAt))}</div><div class="note-text">${esc(n.text)}</div><button type="button" class="note-delete" data-delete-note="${esc(n.id)}">🗑️ Verwijderen</button></div>`).join('');
    if(empty)empty.style.display=notes.length?'none':'block';
    list.querySelectorAll('[data-delete-note]').forEach(btn=>btn.addEventListener('click',()=>{
      const id=btn.dataset.deleteNote;
      if(!window.confirm('Deze aantekening verwijderen?'))return;
      write(read().filter(n=>n.id!==id)); render();
    }));
  }
  function open(){
    const modal=document.getElementById('notesModal');
    if(!modal)return;
    if(!window.reisblikVakantie?.isVakantieActief?.()){alert('Kies eerst een actieve vakantie.');return;}
    modal.style.display='block';
    const name=document.getElementById('notesVacationName');
    if(name)name.textContent=window.reisblikVakantie.getActieveVakantieNaam?.()||'';
    const input=document.getElementById('notesInput');
    if(input){input.value='';setTimeout(()=>input.focus(),50);}
    render();
  }
  function close(){const modal=document.getElementById('notesModal');if(modal)modal.style.display='none';}
  function save(){
    const input=document.getElementById('notesInput'),status=document.getElementById('notesStatus');
    const text=String(input?.value||'').trim();
    if(!text){if(status)status.textContent='Schrijf eerst een aantekening.';return;}
    const notes=read();
    notes.push({id:'note_'+Date.now()+'_'+Math.random().toString(36).slice(2,8),createdAt:new Date().toISOString(),text});
    write(notes); if(input)input.value=''; if(status)status.textContent='✅ Aantekening opgeslagen.'; render(); if(input)input.focus();
  }
  function init(){
    const openBtn=document.getElementById('notesOpenBtn'),closeBtn=document.getElementById('notesCloseBtn'),saveBtn=document.getElementById('notesSaveBtn'),modal=document.getElementById('notesModal');
    if(!openBtn||!closeBtn||!saveBtn||!modal)return;
    if(openBtn.dataset.notesBound==='true')return;
    openBtn.dataset.notesBound='true';
    openBtn.onclick=open; closeBtn.onclick=close; saveBtn.onclick=save;
    modal.onclick=e=>{if(e.target===modal)close();};
    document.getElementById('notesInput')?.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter')save();});
    window.reisblikVakantie?.onVakantieGewijzigd?.(()=>{if(modal.style.display!=='none')open();});
  }
  window.reisblikAantekeningen={BASE_KEY,read,render};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
