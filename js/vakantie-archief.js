/* Reisblik 9.8.18 — aparte functie Vakantie archief */
(function(){
  function byId(id){return document.getElementById(id);}

  function safeFilename(value){
    return String(value||'vakantie')
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-zA-Z0-9_-]+/g,'_')
      .replace(/^_+|_+$/g,'') || 'vakantie';
  }

  function downloadHtml(html,filename){
    const blobUrl=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));
    const a=document.createElement('a');
    a.href=blobUrl;
    a.download=filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(blobUrl),60000);
  }

  async function build(){
    if(!window.reisblikMijnReisdag?.buildActiveVacationDiaryHtml){
      throw new Error('De Mijn Reisdag HTML-bouwfunctie is nog niet beschikbaar.');
    }
    return window.reisblikMijnReisdag.buildActiveVacationDiaryHtml();
  }

  async function archiveActiveVacation(){
    const btn=byId('archiveVacationBtn');
    if(btn){btn.disabled=true;btn.textContent='⏳ Vakantie archiveren…';}
    try{
      const result=await build();
      if(!result)return;
      const naam=result.vacation?.naam||'Vakantie';
      const filename=safeFilename(naam)+'-reisarchief.html';
      downloadHtml(result.html,filename);
      alert('Vakantie gearchiveerd en als HTML-bestand naar Downloads geschreven.\n\n'+naam+' — '+result.matches.length+' bezochte locaties/evenementen.');
    }catch(e){
      console.error('Reisblik: vakantie archiveren mislukt',e);
      alert('De vakantie kon niet worden gearchiveerd.');
    }finally{
      if(btn){btn.disabled=false;btn.textContent='📦 Vakantie archiveren';}
    }
  }

  async function showActiveVacation(){
    try{
      const result=await build();
      if(!result)return;
      const base=new URL('./',location.href).href.replace(/&/g,'&amp;').replace(/"/g,'&quot;');
      const previewHtml=result.html.replace('<head>','<head><base href="'+base+'">');
      const blobUrl=URL.createObjectURL(new Blob([previewHtml],{type:'text/html;charset=utf-8'}));
      const isMobile=/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
      if(isMobile){location.href=blobUrl;return;}
      const win=window.open(blobUrl,'_blank');
      if(!win){URL.revokeObjectURL(blobUrl);alert('De vakantie kan niet worden geopend. Sta pop-ups voor Reisblik toe.');return;}
      setTimeout(()=>URL.revokeObjectURL(blobUrl),60000);
    }catch(e){
      console.error('Reisblik: vakantie kon niet worden getoond',e);
      alert('De vakantie kon niet worden getoond.');
    }
  }


  function showFromStartScreen(){
    if(location.hash!=='#showVacation')return;
    history.replaceState(null,'','app.html#open');
    const started=Date.now();
    const tryShow=()=>{
      const ready=window.reisblikMijnReisdag?.buildActiveVacationDiaryHtml && window.reisblikVakantie?.isVakantieActief?.();
      const ids=typeof window.reisblikGetCurrentLocationIds==='function' ? window.reisblikGetCurrentLocationIds() : [];
      const enoughData=ids.length>0 || Date.now()-started>7000;
      if(ready && enoughData){ showActiveVacation(); return; }
      if(Date.now()-started<12000) setTimeout(tryShow,250);
    };
    setTimeout(tryShow,250);
  }

  document.addEventListener('DOMContentLoaded',function(){
    const archive=byId('archiveVacationBtn');
    if(archive)archive.addEventListener('click',archiveActiveVacation);
    const show=byId('showVacationBtn');
    if(show)show.addEventListener('click',showActiveVacation);
    showFromStartScreen();
  });
})();
