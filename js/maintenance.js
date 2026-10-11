/* Reisblik 9.9.51 — ingebouwde technische reparatie/diagnose.
   Verwijdert alleen de technische app-cache (reisblik-app-*).
   Offline-vakantiecaches (reisblik-offline-vacation-*) en localStorage blijven behouden. */
(function(){
  async function technischeCacheWissen(){
    const keys=await caches.keys();
    let deleted=0;
    for(const key of keys){
      if(key.startsWith('reisblik-app-')){
        if(await caches.delete(key)) deleted++;
      }
    }
    return deleted;
  }

  async function diagnose(){
    const regs='serviceWorker' in navigator ? await navigator.serviceWorker.getRegistrations() : [];
    const cacheKeys=await caches.keys();
    const lines=[
      'REISBLIK TECHNISCHE DIAGNOSE',
      '==============================',
      'Datum/tijd: '+new Date().toLocaleString('nl-NL'),
      'Pagina: '+location.href,
      'Online: '+navigator.onLine,
      'User agent: '+navigator.userAgent,
      'Zichtbare versie: '+(document.querySelector('.version-inline')?.textContent || 'onbekend'),
      '',
      'SERVICE WORKER',
      'Aantal registraties: '+regs.length
    ];
    regs.forEach((r,i)=>{
      lines.push((i+1)+'. scope: '+r.scope);
      lines.push('   actief: '+(r.active?.scriptURL || 'geen'));
      lines.push('   wachtend: '+(r.waiting?.scriptURL || 'geen'));
      lines.push('   installing: '+(r.installing?.scriptURL || 'geen'));
    });
    lines.push('controller: '+(navigator.serviceWorker?.controller?.scriptURL || 'geen'));
    lines.push('', 'CACHE', 'Aantal caches: '+cacheKeys.length);
    cacheKeys.forEach(k=>lines.push('- '+k));
    lines.push('', 'LOCALSTORAGE', 'Aantal keys: '+localStorage.length);
    lines.push('', 'Opmerking: de reparatiefunctie verwijdert alleen caches met prefix reisblik-app-.');

    const blob=new Blob([lines.join('\n')],{type:'text/plain;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url; a.download='REISBLIK_DIAGNOSTIEK_'+new Date().toISOString().slice(0,10)+'.txt';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    alert('Diagnosebestand is aangemaakt.');
  }

  async function repair(){
    if(!confirm('Reisblik technisch repareren?\n\nDe technische app-cache wordt verwijderd. Je persoonlijke gegevens en offline-vakanties blijven behouden.')) return;
    try{
      const deleted=await technischeCacheWissen();
      if('serviceWorker' in navigator){
        const regs=await navigator.serviceWorker.getRegistrations();
        for(const reg of regs){ await reg.unregister(); }
      }
      alert('Reisblik is technisch opgeschoond ('+deleted+' app-cache(s)).\n\nDe nieuwste versie wordt nu opnieuw geladen.');
      location.href=location.pathname+'?reisblikRepair='+Date.now()+location.hash;
    }catch(e){
      console.error(e);
      alert('Repareren is niet gelukt: '+e.message);
    }
  }

  window.addEventListener('DOMContentLoaded',()=>{
    document.getElementById('repairReisblikBtn')?.addEventListener('click',repair);
    document.getElementById('diagnoseReisblikBtn')?.addEventListener('click',diagnose);
  });
})();
