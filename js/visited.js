/* Reisblik 9.7.5 – Bezocht
   Definitieve ontwikkelimplementatie.
   Event delegation wordt gebruikt zodat dynamisch opgebouwde locatiekaarten
   altijd dezelfde click/change-koppeling behouden.
*/
const REISBLIK_VISITED_BASE_KEY='reisblik_visited_v1';
function reisblikVisitedStorageKey(){return window.reisblikVakantie?.getVakantieStorageKey ? window.reisblikVakantie.getVakantieStorageKey(REISBLIK_VISITED_BASE_KEY) : REISBLIK_VISITED_BASE_KEY;}

function reisblikVisitedLoad(){
  try{
    const raw=localStorage.getItem(reisblikVisitedStorageKey());
    const parsed=raw?JSON.parse(raw):{};
    const result=parsed&&typeof parsed==='object'?{...parsed}:{};
    // JSON personalData is the portable fallback when this browser has no local override.
    const getLocations=window.reisblikGetCurrentLocations;
    const currentLocations=typeof getLocations==='function'?getLocations():[];
    currentLocations.forEach(loc=>{
      const id=String(loc?.id??'');
      if(!id)return;
      const saved=loc?.personalData;
      const local=result[id];
      // JSON is the portable source. Local timestamp or explicit cleared=true wins;
      // an empty/stale local record must not hide the status stored in JSON.
      if(local && (local.visitedAt || local.cleared===true))return;
      if(saved?.visitedAt)result[id]={id,name:loc.name||'',category:loc.category||loc.type||'',visitedAt:String(saved.visitedAt),fromJson:true};
    });
    return result;
  }catch(e){
    console.warn('Reisblik Bezocht: opslag lezen mislukt',e);
    return {};
  }
}
function reisblikVisitedSave(data){
  try{
    localStorage.setItem(reisblikVisitedStorageKey(),JSON.stringify(data));
    return localStorage.getItem(reisblikVisitedStorageKey())===JSON.stringify(data);
  }catch(e){
    console.error('Reisblik Bezocht: opslag schrijven mislukt',e);
    return false;
  }
}

function reisblikVisitedFormat(iso){
  const d=new Date(iso);
  if(Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('nl-NL',{
    day:'2-digit',month:'2-digit',year:'numeric',
    hour:'2-digit',minute:'2-digit',hour12:false
  }).format(d);
}

function reisblikVisitedSetDisplay(container,iso){
  if(!container) return;
  const dateEl=container.querySelector('.reisblik-visited-date');
  if(dateEl){
    dateEl.textContent=iso ? '— '+reisblikVisitedFormat(iso) : '';
  }
}

function reisblikVisitedToggle(checkbox){
  const id=checkbox.getAttribute('data-visited-id');
  if(!id) return;

  const name=checkbox.getAttribute('data-visited-name')||'';
  const category=checkbox.getAttribute('data-visited-category')||'';
  const key=String(id);
  const data=reisblikVisitedLoad();

  if(checkbox.checked){
    const visitedAt=new Date().toISOString();
    data[key]={
      id:key,
      name:name,
      category:category,
      visitedAt:visitedAt
    };
    if(!reisblikVisitedSave(data)){
      checkbox.checked=false;
      reisblikVisitedSetDisplay(checkbox.closest('.reisblik-visited'),'');
      return;
    }
    reisblikVisitedSetDisplay(checkbox.closest('.reisblik-visited'),visitedAt);
  }else{
    // Keep an explicit local 'not visited' override when JSON contains a visit.
    const location=window.reisblikGetLocationById?.(key);
    if(location?.personalData?.visitedAt) data[key]={id:key,name,category,visitedAt:null,cleared:true};
    else delete data[key];
    reisblikVisitedSave(data);
    reisblikVisitedSetDisplay(checkbox.closest('.reisblik-visited'),'');
  }
}

/* Event delegation: works even when app.js replaces/rebuilds the location DOM. */
document.addEventListener('change',function(e){
  const cb=e.target && e.target.closest
    ? e.target.closest('input.reisblik-visited-checkbox')
    : null;
  if(cb) reisblikVisitedToggle(cb);
},true);

function reisblikVisitedHtml(id,name,category){
  const key=String(id);
  const data=reisblikVisitedLoad();
  const visit=data[key];
  const checked=visit && visit.visitedAt ? ' checked' : '';
  const date=visit && visit.visitedAt ? '— '+reisblikVisitedFormat(visit.visitedAt) : '';

  return '<div class="reisblik-visited">'+
    '<input class="reisblik-visited-checkbox" type="checkbox" '+
    'data-visited-id="'+esc(key)+'" '+
    'data-visited-name="'+esc(String(name||''))+'" '+
    'data-visited-category="'+esc(String(category||''))+'"'+
    checked+' aria-label="Bezocht">'+
    '<label>Bezocht</label>'+
    '<span class="reisblik-visited-date">'+esc(date)+'</span>'+
    '</div>';
}
