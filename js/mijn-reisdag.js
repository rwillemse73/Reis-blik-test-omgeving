/* Reisblik 9.9.32 – Mijn reisdag
   Bestaande Mijn reisdag-selectie, Word-export en zelfstandige Reisdagboek-HTML.
*/
(function(){
  const DATE_BASE_KEY='reisblik_mijn_reisdag_datum';
  const DATE_FROM_BASE_KEY='reisblik_mijn_reisdag_datum_van';
  const DATE_TO_BASE_KEY='reisblik_mijn_reisdag_datum_tm';
  const VISITED_BASE_KEY='reisblik_visited_v1';
  const storageKey=(key)=>window.reisblikVakantie?.getVakantieStorageKey ? window.reisblikVakantie.getVakantieStorageKey(key) : key;
  const DATE_KEY=storageKey(DATE_BASE_KEY);
  const DATE_FROM_KEY=storageKey(DATE_FROM_BASE_KEY);
  const DATE_TO_KEY=storageKey(DATE_TO_BASE_KEY);
  const VISITED_KEY=storageKey(VISITED_BASE_KEY);

  function byId(id){return document.getElementById(id);}

  function loadVisited(){
    try{
      const data=JSON.parse(localStorage.getItem(storageKey(VISITED_BASE_KEY))||'{}');
      return data&&typeof data==='object'?data:{};
    }catch(e){return {};}
  }

  function loadStoredObject(key){
    try{
      const data=JSON.parse(localStorage.getItem(storageKey(key))||'{}');
      return data&&typeof data==='object'?data:{};
    }catch(e){return {};}
  }

  function datePart(iso){
    const d=new Date(iso);
    if(Number.isNaN(d.getTime()))return '';
    return d.getFullYear()+'-'+
      String(d.getMonth()+1).padStart(2,'0')+'-'+
      String(d.getDate()).padStart(2,'0');
  }

  function timePart(iso){
    const d=new Date(iso);
    if(Number.isNaN(d.getTime()))return '';
    return new Intl.DateTimeFormat('nl-NL',{
      hour:'2-digit',minute:'2-digit',hour12:false
    }).format(d);
  }

  function dateTimePart(iso){
    const d=new Date(iso);
    if(Number.isNaN(d.getTime()))return '';
    return new Intl.DateTimeFormat('nl-NL',{
      day:'2-digit',month:'2-digit',year:'numeric',
      hour:'2-digit',minute:'2-digit',hour12:false
    }).format(d);
  }


  function matchesForRange(dateFrom,dateTo){
    return Object.values(loadVisited())
      .filter(item=>{
        if(!item||!item.visitedAt)return false;
        const d=datePart(item.visitedAt);
        return d && d>=dateFrom && d<=dateTo;
      })
      .sort((a,b)=>new Date(a.visitedAt)-new Date(b.visitedAt));
  }

  // Alle bezochte locaties en evenementen van de actieve vakantie/context.
  // Omdat visited lokaal per actieve vakantie wordt opgeslagen, hoeft de
  // archieffunctie geen apart datumvenster te vragen.
  function matchesForActiveVacation(){
    return Object.values(loadVisited())
      .filter(item=>item&&item.visitedAt)
      .sort((a,b)=>new Date(a.visitedAt)-new Date(b.visitedAt));
  }

  async function buildActiveVacationDiaryHtml(){
    const matches=matchesForActiveVacation();
    const vacation=window.reisblikVakantie?.getActieveVakantie?.();
    const naam=vacation?.naam||'Actieve vakantie';
    if(!matches.length){
      alert('Er zijn in de actieve vakantie geen bezochte locaties of evenementen gevonden.');
      return null;
    }
    const dates=matches.map(x=>datePart(x.visitedAt)).filter(Boolean).sort();
    const from=dates[0]||'';
    const to=dates[dates.length-1]||'';
    const entries=await buildDayData(from,to);
    return {
      html:makeTravelDiaryHtml(entries,from,to,naam),
      matches,
      vacation,
      period:{from,to}
    };
  }

  function rangeLabel(dateFrom,dateTo){
    return dateFrom===dateTo ? dateFrom : dateFrom+' t/m '+dateTo;
  }

  function findLocation(item){
    if(typeof locations!=='undefined' && Array.isArray(locations)){
      const location=locations.find(x=>String(x.id)===String(item.id));
      if(location)return location;
    }
    // Een bezocht evenement is geen gewone locatie in locations[].
    // Haal het daarom rechtstreeks uit de permanente Agenda-opslag.
    if(typeof window.reisblikAgendaGetEvenementen==='function'){
      const event=window.reisblikAgendaGetEvenementen().find(x=>String(x.id)===String(item.id));
      if(event){
        return {
          id:event.id,
          name:event.name,
          category:'evenementen',
          type:event.type||'Evenement',
          address:event.location||'',
          lat:Number(event.lat),
          lon:Number(event.lon),
          agendaEvent:true,
          eventUrl:event.url||'',
          sourceUrl:event.sourceUrl||'',
          description:event.description||'',
          organizer:event.organizer||'',
          price:event.price||''
        };
      }
    }
    return null;
  }

  function getAgendaEvent(item){
    if(typeof window.reisblikAgendaGetEvenementen!=='function')return null;
    return window.reisblikAgendaGetEvenementen().find(x=>String(x.id)===String(item.id))||null;
  }

  async function getLocationText(item){
    const x=findLocation(item);

    if(x && x.agendaEvent){
      const ev=getAgendaEvent(item)||x;
      return [
        ev.description ? ev.description : '',
        ev.organizer ? 'Organisator: '+ev.organizer : '',
        ev.price ? 'Prijs: '+ev.price : '',
        ev.url ? 'Evenementwebsite: '+ev.url : ''
      ].filter(Boolean).join('\n\n').trim();
    }

    if(x && x.userCreated){
      return [
        x.description||'',
        x.story||'',
        x.experience||''
      ].filter(Boolean).join('\n\n').trim();
    }

    if(!x)return '';

    try{
      // app.js already contains the authoritative resolver for category
      // content URLs. Use it when available; otherwise resolve the content
      // path against the app URL/category directory.
      let url=null;
      if(typeof resolveContentUrl==='function'){
        url=resolveContentUrl(x);
      }
      if(!url && x.content){
        const category=String(x.category||x.type||'').toLowerCase();
        const raw=String(x.content);
        if(/^(https?:|\/)/i.test(raw)){
          url=new URL(raw,location.href).href;
        }else if(category && !raw.toLowerCase().startsWith(category+'/')){
          url=new URL(category+'/'+raw,location.href).href;
        }else{
          url=new URL(raw,location.href).href;
        }
      }
      if(!url)return '';

      const response=await fetch(url+'?reisdag='+Date.now(),{cache:'no-store'});
      if(!response.ok)return '';

      const source=await response.text();
      const doc=new DOMParser().parseFromString(source,'text/html');

      // The complete visible content of the fixed HTML is the source for
      // the Word document. Prefer article, otherwise main, otherwise body.
      const root=doc.querySelector('article')||
                 doc.querySelector('main')||
                 doc.body;

      if(!root)return '';

      // Remove controls/technical elements that should never become part
      // of the travel-day document.
      root.querySelectorAll(
        'script,style,noscript,button,input,textarea,select,nav,header,footer,'+
        '.reisblik-visited,.visited,.content-meta'
      ).forEach(el=>el.remove());

      const text=(root.innerText||root.textContent||'')
        .replace(/\r/g,'')
        .replace(/[ \t]+\n/g,'\n')
        .replace(/\n{3,}/g,'\n\n')
        .trim();

      return text;
    }catch(e){
      console.warn('Mijn reisdag: vaste HTML kon niet worden gelezen',x?.name,e);
      return '';
    }
  }

  async function getLocationHtml(item){
    const x=findLocation(item);
    if(!x)return '';
    if(x.agendaEvent)return '';

    try{
      let url=null;
      if(typeof resolveContentUrl==='function')url=resolveContentUrl(x);
      if(!url && x.content){
        const category=String(x.category||x.type||'').toLowerCase();
        const raw=String(x.content);
        if(/^(https?:|\/)/i.test(raw))url=new URL(raw,location.href).href;
        else if(category && !raw.toLowerCase().startsWith(category+'/'))
          url=new URL(category+'/'+raw,location.href).href;
        else url=new URL(raw,location.href).href;
      }
      if(!url)return '';

      const response=await fetch(url+'?reisdaghtml='+Date.now(),{cache:'no-store'});
      if(!response.ok)return '';
      const doc=new DOMParser().parseFromString(await response.text(),'text/html');
      const root=doc.querySelector('article')||doc.querySelector('main')||doc.body;
      if(!root)return '';

      root.querySelectorAll(
        'script,style,noscript,button,input,textarea,select,nav,header,footer,'+
        '.reisblik-visited,.visited,.content-meta'
      ).forEach(el=>el.remove());

      // Maak afbeeldingen en links zelfstandig bruikbaar in het latere
      // reisdagboek. De bronpagina kan relatieve paden gebruiken.
      root.querySelectorAll('img[src]').forEach(img=>{
        try{ img.setAttribute('src',new URL(img.getAttribute('src'),url).href); }catch(e){}
      });
      root.querySelectorAll('a[href]').forEach(a=>{
        try{ a.setAttribute('href',new URL(a.getAttribute('href'),url).href); }catch(e){}
      });

      return root.innerHTML.trim();
    }catch(e){
      console.warn('Mijn reisdag: HTML-opmaak kon niet worden gelezen',x?.name,e);
      return '';
    }
  }

  function getExtraForLocation(id){
    const legacy=loadStoredObject('ruinekerk_extra_info_v1');
    const current=loadStoredObject('ruinekerk_extra_simple_v1');
    const result=[];

    const addItems=(items)=>{
      (Array.isArray(items)?items:[]).forEach(x=>{
        const item={date:String(x?.date||''),text:String(x?.text||'')};
        if(!item.date && !item.text)return;
        const duplicate=result.some(y=>y.date===item.date && y.text===item.text);
        if(!duplicate)result.push(item);
      });
    };

    addItems(legacy[id]);
    const simple=current[id];
    if(Array.isArray(simple)) addItems(simple);
    else if(simple && typeof simple==='object') addItems([simple]);

    return result.sort((a,b)=>{
      const byDate=String(a.date).localeCompare(String(b.date));
      return byDate || String(a.text).localeCompare(String(b.text));
    });
  }

  function getFirstName(matches){
    if(!matches.length)return 'reisdag';
    return String(matches[0].name||'locatie')
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu,'-')
      .replace(/^-+|-+$/g,'')
      .toLowerCase() || 'locatie';
  }

  function downloadBlob(blob,filename){
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }

  function dataUrlToUint8Array(dataUrl){
    const m=String(dataUrl||'').match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
    if(!m)return null;
    try{
      if(m[2]){
        const bin=atob(m[3]);
        const bytes=new Uint8Array(bin.length);
        for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
        return {bytes,mime:m[1]||'image/jpeg'};
      }
      const decoded=decodeURIComponent(m[3]);
      const bytes=new TextEncoder().encode(decoded);
      return {bytes,mime:m[1]||'image/jpeg'};
    }catch(e){
      console.warn('Mijn reisdag: foto kon niet worden gelezen',e);
      return null;
    }
  }

  async function buildDayData(dateFrom,dateTo){
    const matches=matchesForRange(dateFrom,dateTo);
    const entries=[];

    for(const item of matches){
      entries.push({
        item:item,
        text:await getLocationText(item),
        html:await getLocationHtml(item),
        extra:getExtraForLocation(item.id)
      });
    }
    return entries;
  }

  function escapeHtml(value){
    return String(value??'')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/\"/g,'&quot;');
  }

  function dayReportHtml(dateFrom,dateTo,mode){
    const reports=window.reisblikDagverslag?.getRange ? window.reisblikDagverslag.getRange(dateFrom,dateTo) : [];
    if(!reports.length)return '';
    if(mode==='word')return '<section style="background:#f1ead8;border-left:5px solid #a9bfae;padding:12px 16px;margin:0 0 22px"><h2>Dagverslag</h2>'+reports.map(r=>'<div><p><b>'+escapeHtml(formatDiaryDate(r.date))+'</b></p>'+String(r.text).split(/\n\s*\n/).map(p=>'<p>'+escapeHtml(p).replace(/\n/g,'<br>')+'</p>').join('')+'</div>').join('')+'</section>';
    if(mode==='travel')return '<section class="dagboek-dagverslagen"><h3>DAGVERSLAG</h3>'+reports.map(r=>'<div class="dagboek-dagverslag"><strong>'+escapeHtml(formatDiaryDate(r.date))+'</strong>'+String(r.text).split(/\n\s*\n/).map(p=>'<p>'+escapeHtml(p).replace(/\n/g,'<br>')+'</p>').join('')+'</div>').join('')+'</section>';
    return '<div class="dagverslag-intro"><h2>Dagverslag</h2>'+reports.map(r=>'<div><strong>'+escapeHtml(formatDiaryDate(r.date))+'</strong>'+String(r.text).split(/\n\s*\n/).map(p=>'<p>'+escapeHtml(p).replace(/\n/g,'<br>')+'</p>').join('')+'</div>').join('')+'</div>';
  }

  function makeWordHtml(entries,selectedPeriod){
    const sections=entries.map((entry,index)=>{
      const item=entry.item;
      const title=(index+1)+'. '+(item.name||'Onbekende locatie');
      const time=timePart(item.visitedAt);
      let story='';
      if(item.category==='evenementen'){
        const ev=getAgendaEvent(item)||{};
        story='<h3>Evenement</h3>'+
          (ev.description?'<p>'+escapeHtml(ev.description)+'</p>':'')+
          (ev.location?'<p><b>Locatie:</b> '+escapeHtml(ev.location)+'</p>':'')+
          (ev.organizer?'<p><b>Organisator:</b> '+escapeHtml(ev.organizer)+'</p>':'')+
          (ev.price?'<p><b>Prijs:</b> '+escapeHtml(ev.price)+'</p>':'')+
          (ev.url?'<p><b>Evenementwebsite:</b> <a href="'+escapeHtml(ev.url)+'">'+escapeHtml(ev.url)+'</a></p>':'');
      }else{
        story=entry.html
          ? '<h3>Vaste tekst uit HTML</h3><div class="fixed-html">'+entry.html+'</div>'
          : (entry.text
            ? '<h3>Vaste tekst uit HTML</h3>'+
              entry.text.split(/\n\s*\n/).map(p=>
                '<p>'+escapeHtml(p).replace(/\n/g,'<br>')+'</p>'
              ).join('')
            : '<p><i>Geen tekst beschikbaar in het vaste HTML-bestand.</i></p>');
      }

      const extra=entry.extra.length
        ? '<h3>Extra informatie</h3><ul>'+
          entry.extra.map(x=>'<li><b>'+escapeHtml(x.date||'')+
          '</b> — '+escapeHtml(x.text||'')+'</li>').join('')+
          '</ul>'
        : '';

      // Eigen foto's staan op de locatie zelf (locations[] / eigen locaties),
      // niet op het compacte Bezocht-record. Gebruik daarom de gevonden locatie
      // als bron voor de foto.
      const sourceLocation=findLocation(item);
      const ownPhoto=(sourceLocation && sourceLocation.userCreated && sourceLocation.photo)
        ? '<div class="reisdag-photo"><p><b>Foto</b></p><img src="'+escapeHtml(sourceLocation.photo)+'" alt="Foto '+escapeHtml(sourceLocation.name||item.name||'locatie')+'" style="width:300px;max-width:300px;height:auto;display:block;margin:8px 0 16px" width="300"></div>'
        : '';

      return '<section style="page-break-inside:avoid;margin-bottom:28px">'+
        '<h2>'+escapeHtml(title)+'</h2>'+
        (dateTimePart(item.visitedAt)?'<p><b>Bezocht:</b> '+escapeHtml(dateTimePart(item.visitedAt))+'</p>':'')+
        (item.category?'<p><b>Type:</b> '+escapeHtml(item.category)+'</p>':'')+
        ownPhoto+story+extra+
        '</section>';
    }).join('\n');

    return '<!DOCTYPE html><html><head><meta charset="utf-8">'+
      '<title>Mijn reisdag '+escapeHtml(selectedPeriod)+'</title>'+
      '<style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#222}'+
      'h1{font-size:20pt}h2{font-size:16pt;border-bottom:1px solid #ccc;padding-bottom:4px}'+
      'h3{font-size:12pt;margin-bottom:6px}.fixed-html h1{font-size:20pt}.fixed-html h2{font-size:16pt}.fixed-html h3{font-size:12pt}.fixed-html p{line-height:1.45}.fixed-html a{color:#1155cc;text-decoration:underline}.fixed-html ul,.fixed-html ol{margin-top:4px;margin-bottom:10px}.fixed-html img{max-width:100%;height:auto}'+
      '</style></head><body>'+
      '<h1>Mijn reisdag — '+escapeHtml(selectedPeriod)+'</h1>'+
      '<p>Samengesteld uit de op deze datum als bezocht geregistreerde locaties.</p>'+
      dayReportHtml(selectedPeriod.split(' t/m ')[0], selectedPeriod.includes(' t/m ')?selectedPeriod.split(' t/m ')[1]:selectedPeriod, 'word')+
      sections+
      '</body></html>';
  }

  function rtfEscape(value){
    let out='';
    for(const ch of String(value??'')){
      const code=ch.codePointAt(0);
      if(ch==='\\') out+='\\\\';
      else if(ch==='{') out+='\\{';
      else if(ch==='}') out+='\\}';
      else if(ch==='\n') out+='\\par ';
      else if(code>127){
        const n=code>32767?code-65536:code;
        out+='\\u'+n+'?';
      }else out+=ch;
    }
    return out;
  }

  function htmlToPlainText(html){
    if(!html)return '';
    try{
      const doc=new DOMParser().parseFromString(String(html),'text/html');
      return (doc.body?.innerText||doc.body?.textContent||'').replace(/\u00a0/g,' ').replace(/\n{3,}/g,'\n\n').trim();
    }catch(e){return String(html).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();}
  }

  function makeRtf(entries,selectedPeriod,dateFrom,dateTo){
    const parts=[];
    parts.push('{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Calibri;}}\\viewkind4\\uc1\\f0\\fs22 ');
    parts.push('\\b Reisblik — Mijn reisdag\\b0\\par ');
    parts.push(rtfEscape(selectedPeriod)+'\\par\\par ');
    const reports=window.reisblikDagverslag?.getRange ? window.reisblikDagverslag.getRange(dateFrom,dateTo) : [];
    if(reports.length){
      parts.push('\\b Dagverslag\\b0\\par ');
      for(const r of reports){
        parts.push('\\b '+rtfEscape(formatDiaryDate(r.date))+'\\b0\\par ');
        parts.push(rtfEscape(r.text)+'\\par\\par ');
      }
    }
    entries.forEach((entry,index)=>{
      const title=(index+1)+'. '+(entry.item?.name||'Onbekende locatie');
      parts.push('\\b '+rtfEscape(title)+'\\b0\\par ');
      const text=entry.html?htmlToPlainText(entry.html):String(entry.text||'');
      if(text.trim()) parts.push(rtfEscape(text)+'\\par ');
      const extra=entry.extra;
      if(extra && typeof extra==='object'){
        const extraText=Object.entries(extra).filter(([k,v])=>v!=null && String(v).trim()).map(([k,v])=>k+': '+v).join('\n');
        if(extraText) parts.push(rtfEscape(extraText)+'\\par ');
      }
      parts.push('\\par ');
    });
    parts.push('}');
    return parts.join('');
  }

  async function downloadWord(dateFrom,dateTo){
    const matches=matchesForRange(dateFrom,dateTo);
    const selectedPeriod=rangeLabel(dateFrom,dateTo);
    if(!matches.length){
      alert('Geen bezochte locaties gevonden voor '+selectedPeriod+'.');
      return;
    }
    const btn=byId('reisdagWordBtn');
    if(btn)btn.disabled=true;
    try{
      const entries=await buildDayData(dateFrom,dateTo);
      // Gebruik RTF: dit is een echt Word-compatibel documentformaat en voorkomt
      // de extensie/HTML-mismatch waarmee moderne Word-versies .doc-bestanden soms weigeren.
      const filename=(dateFrom===dateTo?dateFrom:dateFrom+'-tm-'+dateTo)+'-'+getFirstName(matches)+'.rtf';
      downloadBlob(new Blob([makeRtf(entries,selectedPeriod,dateFrom,dateTo)],{
        type:'application/rtf;charset=utf-8'
      }),filename);
    }finally{
      if(btn)btn.disabled=false;
    }
  }

  function formatDiaryDate(value){
    if(!value)return '';
    const parts=String(value).split('-');
    if(parts.length!==3)return value;
    const d=new Date(Number(parts[0]),Number(parts[1])-1,Number(parts[2]));
    if(Number.isNaN(d.getTime()))return value;
    return new Intl.DateTimeFormat('nl-NL',{
      weekday:'long',day:'numeric',month:'long',year:'numeric'
    }).format(d);
  }

  function diaryPhotoSrc(item,html){
    const sourceLocation=findLocation(item);
    if(sourceLocation && sourceLocation.userCreated && sourceLocation.photo)return sourceLocation.photo;
    if(html){
      try{
        const doc=new DOMParser().parseFromString(html,'text/html');
        const img=doc.querySelector('img[src]');
        if(img){
          const raw=img.getAttribute('src');
          if(raw)return new URL(raw,document.baseURI).href;
        }
      }catch(e){}
    }
    return '';
  }

  function diaryPhotoHtml(item,html,caption){
    const src=diaryPhotoSrc(item,html);
    if(!src)return '';
    return '<figure class="dagboek-foto">'+
      '<img src="'+escapeHtml(src)+'" alt="Foto '+escapeHtml(item.name||'locatie')+'">'+
      (caption?'<figcaption>'+escapeHtml(caption)+'</figcaption>':'')+
      '</figure>';
  }

  function diaryTextBlock(title,text,extraClass){
    if(!text)return '';
    const paragraphs=String(text).split(/\n\s*\n/).map(p=>p.trim()).filter(Boolean);
    if(!paragraphs.length)return '';
    return '<div class="dagboek-blok '+(extraClass||'')+'"><h3>'+escapeHtml(title)+'</h3>'+ 
      paragraphs.map(p=>'<p>'+escapeHtml(p).replace(/\n/g,'<br>')+'</p>').join('')+
      '</div>';
  }

  // Zet de bestaande <dialog>-slideshow uit de locatie-HTML om naar een
  // zelfstandige slideshow die ook in de gegenereerde reisdagboekpagina werkt.
  // De trigger blijft op dezelfde plek in de broninhoud staan.
  function diaryPrepareFixedHtml(rawHtml,cardIndex){
    if(!rawHtml)return {html:'',extras:[]};
    try{
      const doc=new DOMParser().parseFromString('<div id="diaryFixedRoot">'+rawHtml+'</div>','text/html');
      const root=doc.getElementById('diaryFixedRoot');
      if(!root)return {html:rawHtml,extras:[]};
      const dialogs=new Map();
      root.querySelectorAll('dialog[id]').forEach(dialog=>dialogs.set(dialog.id,dialog));
      const extras=[];
      let extraCounter=0;

      root.querySelectorAll('button[onclick*="showModal"]').forEach(button=>{
        const onclick=button.getAttribute('onclick')||'';
        const m=onclick.match(/getElementById\(['"]([^'"]+)['"]\)/);
        if(!m)return;
        const dialog=dialogs.get(m[1]);
        if(!dialog)return;
        const id='reisdag-slideshow-'+cardIndex+'-'+extraCounter++;
        const caption=(button.parentElement?.querySelector('figcaption')?.textContent||'Extra foto\'s').trim();
        const trigger=document.createElement('div');
        trigger.className='dagboek-extra-trigger';
        trigger.innerHTML='<button type="button" data-open-diary-slideshow="'+id+'">📷 Extra foto\'s</button>'+
          (caption?'<span>'+escapeHtml(caption)+'</span>':'');
        const holder=button.closest('.omkaderde-tekst')||button.parentElement||button;
        holder.replaceWith(trigger);
        extras.push({id,dialog});
      });

      // Slideshow-dialogen zonder expliciete trigger worden niet weggegooid;
      // ze krijgen alsnog een blok onderaan de betreffende locatie.
      dialogs.forEach((dialog,id)=>{
        if(extras.some(x=>x.dialog===dialog))return;
        const newId='reisdag-slideshow-'+cardIndex+'-'+extraCounter++;
        extras.push({id:newId,dialog});
      });

      const modalHtml=extras.map((extra)=>{
        const dialog=extra.dialog;
        const slides=Array.from(dialog.querySelectorAll('.slide'));
        const slideNodes=slides.length?slides:[dialog];
        const slideHtml=slideNodes.map((slide,i)=>{
          const clone=slide.cloneNode(true);
          clone.querySelectorAll('[onclick]').forEach(el=>el.removeAttribute('onclick'));
          clone.querySelectorAll('script,style').forEach(el=>el.remove());
          clone.querySelectorAll('img[src]').forEach(img=>{
            const src=img.getAttribute('src');
            if(src)img.setAttribute('src',src);
          });
          return '<div class="dagboek-slide" data-slide="'+i+'">'+clone.innerHTML+'</div>';
        }).join('\n');
        return '<dialog class="dagboek-slideshow-dialog" id="'+extra.id+'">'+
          '<div class="dagboek-slideshow-head"><strong>Extra foto\'s</strong><button type="button" data-close-diary-slideshow="'+extra.id+'">✕</button></div>'+
          '<div class="dagboek-slideshow-body">'+slideHtml+'</div>'+
          '<div class="dagboek-slideshow-controls"><button type="button" data-slide-prev="'+extra.id+'">‹</button><span data-slide-status="'+extra.id+'"></span><button type="button" data-slide-next="'+extra.id+'">›</button></div>'+
          '</dialog>';
      }).join('\n');

      root.querySelectorAll('dialog').forEach(d=>d.remove());
      return {html:root.innerHTML.trim(),extrasHtml:modalHtml,extras};
    }catch(e){
      console.warn('Mijn reisdag: slideshow kon niet worden voorbereid',e);
      return {html:rawHtml,extrasHtml:'',extras:[]};
    }
  }

  function diaryHeroData(entries){
    const result=[];
    for(const entry of entries){
      const src=diaryPhotoSrc(entry.item,entry.html);
      if(src && !result.some(x=>x.src===src)){
        result.push({src,caption:entry.item?.name||'Bezocht'});
      }
      if(result.length>=2)break;
    }
    return result;
  }

  function diaryClientScript(){
    return `<script>
(function(){
  function showSlide(dialog,index){
    if(!dialog)return;
    const slides=[...dialog.querySelectorAll('.dagboek-slide')];
    if(!slides.length)return;
    let n=((index%slides.length)+slides.length)%slides.length;
    slides.forEach((slide,i)=>slide.hidden=i!==n);
    const status=dialog.querySelector('[data-slide-status]');
    if(status)status.textContent=(n+1)+' / '+slides.length;
    dialog.dataset.slideIndex=n;
  }
  function stepSlide(dialog,delta){
    const current=Number(dialog?.dataset.slideIndex||0);
    showSlide(dialog,current+delta);
  }
  function setupSlides(){
    document.querySelectorAll('[data-open-diary-slideshow]').forEach(button=>{
      button.addEventListener('click',()=>{
        const dialog=document.getElementById(button.dataset.openDiarySlideshow);
        if(!dialog)return;
        dialog.showModal();
        showSlide(dialog,0);
      });
    });
    document.querySelectorAll('[data-close-diary-slideshow]').forEach(button=>{
      button.addEventListener('click',()=>{
        document.getElementById(button.dataset.closeDiarySlideshow)?.close();
      });
    });
    document.querySelectorAll('[data-slide-prev]').forEach(button=>{
      button.addEventListener('click',()=>{
        stepSlide(document.getElementById(button.dataset.slidePrev),-1);
      });
    });
    document.querySelectorAll('[data-slide-next]').forEach(button=>{
      button.addEventListener('click',()=>{
        stepSlide(document.getElementById(button.dataset.slideNext),1);
      });
    });
    document.querySelectorAll('.dagboek-slideshow-dialog').forEach(dialog=>showSlide(dialog,0));
  }
  document.addEventListener('DOMContentLoaded',setupSlides);
})();
</script>`;
  }


  function reisImagePlaceholder(img, index) {
    const attrW=img.getAttribute('width')||'';
    const attrH=img.getAttribute('height')||'';
    const originalStyle=img.getAttribute('style')||'';
    const div=img.ownerDocument.createElement('div');
    div.className='reis-foto-plaats';
    if(originalStyle) div.setAttribute('style',originalStyle);
    if(attrW) div.setAttribute('data-original-width',attrW);
    if(attrH) div.setAttribute('data-original-height',attrH);
    div.setAttribute('data-foto-nummer',String(index));

    // Maak van de oorspronkelijke afbeeldingsmaten ook een zichtbare plaatshouder.
    // Percentages blijven in de inline style staan; voor procentuele hoogtes gebruiken
    // we een bruikbare minimale hoogte zodat de plek ook zonder echte foto zichtbaar is.
    const widthCss = attrW ? (/^\d+(?:\.\d+)?$/.test(attrW) ? `width:${attrW}px;` : `width:${attrW};`) : '';
    const heightCss = attrH ? (/^\d+(?:\.\d+)?$/.test(attrH) ? `height:${attrH}px;` : `min-height:180px;`) : 'min-height:180px;';
    const existing = originalStyle ? originalStyle.trim().replace(/;?$/, ';') : '';
    const combined = `${existing}${widthCss}${heightCss}`;
    if(combined) div.setAttribute('style',combined);

    const format=[attrW?('breedte '+attrW):'',attrH?('hoogte '+attrH):''].filter(Boolean).join(' × ');
    div.textContent='FOTO-PLAATS'+(format?' — '+format:'');
    return div;
  }

  function reisReplaceImages(root) {
    let n=1;

    // Vervang ALLE afbeeldingen, ook wanneer ze midden in een <p> staan.
    // Dit is belangrijk voor de reisboek-opmaak: de fotoplaats moet exact op
    // dezelfde positie blijven staan als de oorspronkelijke foto.
    const images=[...root.querySelectorAll('img')];
    images.forEach(img=>{
      const placeholder=reisImagePlaceholder(img,n++);
      img.replaceWith(placeholder);
    });

    return n-1;
  }

  function reisSetLocationHeading(root,locationName) {
    const first=root.querySelector('h2');
    if(first) first.textContent=locationName||'Onbekende locatie';
    else {
      const h2=root.ownerDocument.createElement('h2');
      h2.textContent=locationName||'Onbekende locatie';
      root.insertBefore(h2,root.firstChild);
    }
  }

  function reisPrettyNode(node,depth=0) {
    const pad='    '.repeat(depth);
    if(node.nodeType===8) return pad+'<!--'+node.nodeValue+'-->';
    if(node.nodeType===3) {
      const text=node.nodeValue.replace(/\r/g,'').replace(/\n+/g,' ').replace(/[ \t]+/g,' ').trim();
      return text ? pad+text : '';
    }
    if(node.nodeType!==1) return '';
    const attrs=[...node.attributes].map(a=>` ${a.name}="${escapeHtml(a.value)}"`).join('\n');
    const children=[...node.childNodes].map(ch=>reisPrettyNode(ch,depth+1)).filter(Boolean);
    const tag=node.tagName.toLowerCase();
    const voidTags=new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
    if(voidTags.has(tag)) return `${pad}<${tag}${attrs}>`;
    if(!children.length) return `${pad}<${tag}${attrs}></${tag}>`;
    if(children.length===1 && node.firstChild?.nodeType===3) return `${pad}<${tag}${attrs}>${children[0].trim()}</${tag}>`;
    return `${pad}<${tag}${attrs}>\n${children.join('\n')}\n${pad}</${tag}>`;
  }

  function reisAddStandardPhotoPlaces(block) {
    if(!block || block.nodeType!==1) return;

    // De-duplicatie: een standaardplaats wordt per tekstblok maar één keer toegevoegd.
    if(!block.querySelector(':scope > img[data-foto-plaats="volledige-kolom"]')) {
      const h2=block.querySelector(':scope > h2');
      const full=block.ownerDocument.createElement('img');
      full.setAttribute('src','FOTO-PLAATS');
      full.setAttribute('height','300');
      full.setAttribute('width','100%');
      full.setAttribute('style','object-fit: cover;');
      full.setAttribute('alt','FOTO-PLAATS — volledige kolom');
      full.setAttribute('data-foto-plaats','volledige-kolom');
      if(h2) h2.insertAdjacentElement('afterend',full);
      else block.insertBefore(full,block.firstChild);
    }

    if(!block.querySelector(':scope > img[data-foto-plaats="binnen-tekst"]')) {
      const h2=block.querySelector(':scope > h2');
      const full=block.querySelector(':scope > img[data-foto-plaats="volledige-kolom"]');
      const inline=block.ownerDocument.createElement('img');
      inline.setAttribute('src','FOTO-PLAATS');
      inline.setAttribute('height','30%');
      inline.setAttribute('width','40%');
      inline.setAttribute('style','float: right; margin-left: 20px;');
      inline.setAttribute('alt','FOTO-PLAATS — binnen de tekst');
      inline.setAttribute('data-foto-plaats','binnen-tekst');

      const paragraphs=[...block.querySelectorAll(':scope > p')];
      if(paragraphs.length) paragraphs[0].insertAdjacentElement('afterend',inline);
      else {
        const firstBlock=[...block.children].find(el=>el!==h2 && el!==full);
        if(firstBlock) firstBlock.insertAdjacentElement('afterend',inline);
        else block.appendChild(inline);
      }
    }
  }

  function reisFormatFragment(root) {
    return [...root.childNodes].map(node=>reisPrettyNode(node,1)).filter(Boolean).join('\n');
  }

  function reisNormalizeSlideshowDialog(dialog) {
    if(!dialog) return;

    const slides=[...dialog.querySelectorAll('.slide')];

    slides.forEach(slide=>{
      const photoPlaces=[...slide.querySelectorAll('.reis-foto-plaats')];
      if(!photoPlaces.length) return;

      const photoContainer=slide.ownerDocument.createElement('div');
      photoContainer.className='slide-fotos';

      photoPlaces.forEach(photo=>{
        const photoBox=slide.ownerDocument.createElement('div');
        photoBox.className='slide-foto';
        photoBox.appendChild(photo.cloneNode(true));
        photoContainer.appendChild(photoBox);
      });

      slide.querySelectorAll('.foto-naast, .rechter-kolom, .foto-onder, .reis-slide-foto-rij').forEach(wrapper=>wrapper.remove());
      slide.querySelectorAll('.reis-foto-plaats').forEach(photo=>photo.remove());

      slide.appendChild(photoContainer);
    });
  }

  function reisPrepareLocationHtml(rawHtml,locationName,locationIndex) {
    if(!rawHtml)return {html:'',dialogsHtml:''};
    try {
      const doc=new DOMParser().parseFromString('<div id="reisRoot">'+rawHtml+'</div>','text/html');
      const root=doc.getElementById('reisRoot');
      if(!root)return {html:'',dialogsHtml:''};
      root.querySelectorAll('script,style,noscript,input,textarea,select,nav,header,footer').forEach(el=>el.remove());
      reisSetLocationHeading(root,locationName);

      // Tel de oorspronkelijke foto's vóórdat we ze vervangen. Zo kunnen we
      // controleren dat ook foto's die midden in tekst/paragrafen staan
      // worden meegenomen.
      const sourceImageCount=root.querySelectorAll('img').length;

      const dialogs=[...root.querySelectorAll('dialog')];
      const dialogHtml=[];
      dialogs.forEach((dialog,dialogIndex)=>{
        const oldId=dialog.id||('slideshow-'+dialogIndex);
        const newId='reis-slideshow-'+locationIndex+'-'+dialogIndex;
        dialog.id=newId;

        root.querySelectorAll('button[onclick*="'+oldId+'"]').forEach(button=>{
          button.setAttribute('data-reis-open',newId);
          button.removeAttribute('onclick');
        });
        dialog.querySelectorAll('.prev,.prev2').forEach(button=>{
          button.setAttribute('data-reis-prev',newId);
          button.removeAttribute('onclick');
        });
        dialog.querySelectorAll('.next,.next2').forEach(button=>{
          button.setAttribute('data-reis-next',newId);
          button.removeAttribute('onclick');
        });
        dialog.querySelectorAll('.close-btn').forEach(button=>{
          button.setAttribute('data-reis-close',newId);
          button.removeAttribute('onclick');
        });
        dialog.querySelectorAll('script,style').forEach(el=>el.remove());
        reisReplaceImages(dialog);
        reisNormalizeSlideshowDialog(dialog);
        dialogHtml.push(reisPrettyNode(dialog,1));
        dialog.remove();
      });

      root.querySelectorAll('[data-reis-open]').forEach(trigger=>trigger.classList.add('reis-slideshow-trigger-source'));
      const replacedImageCount=reisReplaceImages(root);

      // Bewaar een kleine, leesbare HTML-commentaarregel. Die is niet zichtbaar
      // in de reisdag, maar maakt in de broncode duidelijk hoeveel fotoplaatsen
      // uit deze locatie afkomstig zijn.
      const photoComment=root.ownerDocument.createComment(
        ' FOTO-PLAATSEN: '+replacedImageCount+' oorspronkelijke foto(\'s) in dit tekstblok ');
      root.insertBefore(photoComment,root.firstChild);

      return {html:reisFormatFragment(root),dialogsHtml:dialogHtml.join('\n')};
    } catch(e) {
      console.warn('Mijn reisdag: reisboekstijl HTML kon niet worden voorbereid',e);
      return {html:'<h2>'+escapeHtml(locationName||'Onbekende locatie')+'</h2><p>'+escapeHtml(rawHtml)+'</p>',dialogsHtml:''};
    }
  }

  function reisTopMapHtml(points) {
    const valid=points.filter(p=>p && p.location && Number.isFinite(Number(p.location.lat)) && Number.isFinite(Number(p.location.lon)));
    const mapData=valid.map((p,i)=>({n:i+1,name:p.item?.name||p.location?.name||'Locatie',lat:Number(p.location.lat),lon:Number(p.location.lon)}));
    const safeMapData=JSON.stringify(mapData).replace(/</g,'\\u003c');
    return `<div class="reis-map-slot">
    <div id="reis-reisdag-map" class="reis-reisdag-map"></div>
    <div class="reis-map-caption">Kaart — bezochte locaties in chronologische volgorde</div>
</div>
<script>
    window.__REISBLIK_REIS_MAP__=${safeMapData};
    (function(){
        function init(){
            var data=window.__REISBLIK_REIS_MAP__||[];
            var el=document.getElementById('reis-reisdag-map');
            if(!el||!window.L||!data.length)return;
            var map=L.map(el,{scrollWheelZoom:false});
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(map);
            var bounds=[];
            data.forEach(function(p){
                bounds.push([p.lat,p.lon]);
                L.marker([p.lat,p.lon]).addTo(map).bindPopup('<b>'+String(p.n)+'. '+String(p.name).replace(/[&<>]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c];})+'</b>');
            });
            if(bounds.length===1)map.setView(bounds[0],14);
            else map.fitBounds(bounds,{padding:[20,20],maxZoom:14});
        }
        if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
    })();
</script>`;
  }

  function reisTravelCss() {
    return `        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #f0f2f5;
            padding: 20px;
            margin-top: 0;
        }
		
        .indeling-kolommen {
            margin-top: 8px;
			columns: 3; /* Aantal kolommen */
            column-gap: 30px; /* Ruimte tussen kolommen */
            column-rule: 1px solid #ccc; /* Lijn tussen kolommen */
            text-align: justify;
            font-size: 1rem;
        }
        
        /* Container: 2 kolommen op grotere schermen, 1 op mobiel */
        .grid-container-1 {
           display: grid;
             margin-top: 8px;
			grid-template-columns: repeat(3, 2fr);
            gap: 20px;
			margin-bottom: 10px;
            max-width: 1500px;
          }
 		
        /* Individuele tegel */ /*https://htmlcolorcodes.com/*/
        .tile {
			text-align: left;           
		   background-color :#AB9F9F;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            /* Flexbox om de inhoud netjes te centreren en de tegelhoogte te laten groeien */
			display : flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			box-sizing: border-box;
        
        }

.omkaderde-tekst {
grid-template-columns: 1fr;   
   border: 2px solid #333333;   /* 2 pixels dikke, doorgetrokken lijn in donkergrijs */
    padding: 15px;              /* Ruimte tussen de tekst en de rand */
    border-radius: 8px;         /* Optioneel: maakt de hoeken mooi afgerond */
    background-color:#AB9F9F;  /* Optioneel: geeft de achtergrond een lichte kleur */
	break-inside: avoid-column;
	margin-bottom: 8px;
	 
	 /*https://htmlcolorcodes.com/*/
}
        .hoofdtekst {
            position: relative;
            display: flow-root;
            box-sizing: border-box;
            min-height: 230px;
            text-align: center;
            background-color: #C4BF37;
            border-bottom: 3px solid #000;
            border-top: 3px solid #000;
            padding: 55px 230px 20px;
            margin-bottom: 20px;
        }

        .hoofdtekst > img {
            position: absolute;
            top: 15px;
            width: 200px;
            height: 200px;
            object-fit: cover;
            margin: 0 !important;
        }

        .hoofdtekst > img:first-child { left: 15px; }
        .hoofdtekst > img:nth-child(2) { right: 15px; }

        .top-fotobalk {
            display: flex;
            gap: 15px;
            justify-content: center;
            align-items: center;
        }

        .top-fotobalk img {
            display: block;
        }

        .fotobalk-caption {
            color: white;
            background-color: gray;
        }

        .voettekst  {
            text-align: left ;
			 background-color :#6DD1BE;
            border-bottom: 3px solid #000;
            border-top: 3px solid #000;
            padding: 15px 0;
            margin-top: 10px;
			margin-bottom: 10px;
        }
	
       .hoofdtekst h1 {
            font-size: 3.5rem;
            text-transform: uppercase;
            margin: 0;
            font-weight: bold;
            letter-spacing: 2px;
        }

       .hoofdtekst h2 {
           font-style: italic;
            margin-top: 5px;
            font-size: 1rem;
        }
		 .tekst-normaal {
			break-inside: avoid-column;           
		   margin-top: 8px;
			font-family: 'Times New Roman', Times, serif;
            background-color: #fdfcf7; /* Klassieke krantenkleur */
            color: #111;
            line-height: 1.4;
            margin: 0;
            padding: 20px;
			margin-bottom: 10px; 
			
        }
  

		 .tekst-bij-elkaar {
			break-inside: avoid-column; 
			
			}
       .slideshow-container {
            max-width: 600px;
            position: relative;
            margin: auto;
            margin-bottom: 50px; /* Ruimte tussen de slideshows */
            background-color: #EDD9C7; /* Zorgt dat witte knoppen zichtbaar zijn */
			border-radius: 8px; 
			
        }
        
        /* Zorg dat slides standaard verborgen zijn */
        .slide {
            display: none;
 }
 
 .prev, .next {
  position: absolute; /* Haalt de pijlen uit de normale stroom van de content */
  top: 50%;
  transform: translateY(-50%); /* Zet de pijl exact verticaal gecentreerd */
  color: green;
  font-weight: bold;
  font-size: 18px;
 
}
 .prev { 
    left: 15px; 
}

.next { 
    right: 15px; 
}
dialog#ochtend-middag {
  width: 700px;
  height: auto;
  background-color:#EDD9C7;
}

dialog#middag-avond {
  width: 700px;
  height: auto;
  background-color:#EDD9C7;
}
 .prev2, .next2 {
  position: absolute; /* Haalt de pijlen uit de normale stroom van de content */
  top: 50%;
  transform: translateY(-50%); /* Zet de pijl exact verticaal gecentreerd */
  color: green;
  font-weight: bold;
  font-size: 18px;
 
}
 .prev2 { 
    left: 15px; 
}

.next2 { 
    right: 15px; 
}

.foto-uitsnede {
    width: 400px;
    height: 200px;
    /* Snijdt een rechthoek uit: boven, rechts, onder, links */
    clip-path: inset(10px 10px 10px 10px);
	
  }
.foto-uitsnede-1 {
    width: 400px;
    height: 300px;
    /* Snijdt een rechthoek uit: boven, rechts, onder, links */
    clip-path: inset(10px 10px 10px 10px);
	
  }
  /* Slideshow images */
.Slide-in {
 width: 400px;
    height: 200px;
}
.slide {
 position: relative;
  text-align: center;
  display: flex;
  flex-wrap: wrap; /* Zorgt dat de tekst eventueel naar de volgende regel zakt */
  gap: 10px;       /* Ruimte tussen de grote afbeelding en de rechter kolom */
  align-items: flex-start;
}

.slide img {
    border-radius: 15px; /* Verhoog of verlaag dit getal voor meer of minder ronding */
  margin: 8px
}

/* Stijling voor de tekstvlakken */
.text-slide {
  color: #333333; /* Donkergrijze tekstkleur */
  font-size: 16px;
  padding: 8px 12px;
  background-color: #EDD9C7; /* Licht transparante achtergrond */
  border-radius: 4px;
  margin-top: 10px; /* Ruimte tussen foto en tekst */
  display: block;
}
/* Positionering voor de sluitknop */
.close-btn {
  position: absolute;
  bottom: 16px;   /* Afstand tot de onderkant */
  right: 16px;    /* Afstand tot de rechterkant */
  
  /* Optionele styling voor een nette knop */
  padding: 8px 16px;
  background-color:#333333;
  border: 1px solid #ccc;
  cursor: pointer;
}
/* Zorgt dat de twee kleine afbeeldingen onder elkaar komen te staan */
.rechter-kolom {
  display: flex;
  flex-direction: column;
  gap: 10px;       /* Ruimte tussen de twee kleine afbeeldingen */
}
.foto-naast {
  display: flex;
  flex-wrap: nowrap; /* Dwingt ze om naast elkaar te blijven staan */
  gap: 10px;
}
.foto-onder {
  display: flex; justify-content: center;
  flex-wrap: nowrap; /* Dwingt ze om naast elkaar te blijven staan */
  gap: 10px;
}



/* =========================================================
   RESPONSIEVE DIAVOORSTELLING
   - dialoog blijft volledig op het scherm
   - pijlen blijven op vaste plaatsen
   - foto's schalen mee met scherm/venster
   - geen horizontale of verticale overflow binnen de dia
   ========================================================= */

dialog#ochtend-middag,
dialog#middag-avond {
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(92vw, 900px);
    height: min(88vh, 760px);
    max-width: 92vw;
    max-height: 88vh;
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    overflow: hidden;
    background-color: #EDD9C7;
    border: 2px solid #333;
    border-radius: 8px;
}

/* De slideshow vult de beschikbare ruimte van de dialog. */
.slideshow-container {
    position: relative;
    width: 100%;
    height: 100%;
    max-width: none;
    margin: 0;
    padding: 42px 55px 60px;
    box-sizing: border-box;
    background-color: #EDD9C7;
    border-radius: 8px;
    overflow: hidden;
}

/* Eén dia krijgt altijd precies de beschikbare ruimte. */
.slideshow-container .slide {
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    display: none;
    align-items: center;
    justify-content: center;
    align-content: center;
    flex-wrap: wrap;
    gap: 10px;
    overflow: hidden;
}

/* Foto's mogen nooit groter worden dan de dia. */
.slideshow-container .slide img {
    max-width: 100%;
    max-height: 100%;
    width: auto;
    height: auto;
    object-fit: contain;
    box-sizing: border-box;
}

/* Combinaties van foto's blijven binnen de beschikbare breedte/hoogte. */
.slideshow-container .foto-naast {
    display: flex;
    width: 100%;
    max-width: 100%;
    max-height: 100%;
    align-items: center;
    justify-content: center;
    gap: 10px;
    overflow: hidden;
    box-sizing: border-box;
}

.slideshow-container .foto-naast > img {
    max-width: calc(100% - 185px);
    max-height: 100%;
    width: auto !important;
    height: auto !important;
}

.slideshow-container .rechter-kolom {
    display: flex;
    flex-direction: column;
    width: 30%;
    max-width: 30%;
    max-height: 100%;
    gap: 10px;
    overflow: hidden;
}

.slideshow-container .rechter-kolom img {
    width: auto !important;
    max-width: 100%;
    max-height: calc((100% - 10px) / 2);
    height: auto !important;
}

.slideshow-container .foto-onder {
    display: flex;
    width: 100%;
    max-width: 100%;
    max-height: 45%;
    align-items: center;
    justify-content: center;
    gap: 10px;
    overflow: hidden;
    box-sizing: border-box;
}

.slideshow-container .foto-onder img {
    max-width: 100%;
    max-height: 100%;
    width: auto !important;
    height: auto !important;
}

/* Tekst boven een diafoto schaalt mee. */
.slideshow-container .text-slide {
    flex: 0 0 100%;
    max-width: 100%;
    box-sizing: border-box;
    text-align: center;
    margin: 0;
}

/* Pijlen staan altijd op exact dezelfde plaats binnen het venster. */
dialog .prev,
dialog .next {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    z-index: 20;
    width: 34px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: green;
    font-weight: bold;
    font-size: 30px;
    line-height: 1;
    cursor: pointer;
    text-decoration: none;
}

dialog .prev {
    left: 12px;
}

dialog .next {
    right: 12px;
}

/* Sluitknop blijft onderaan rechts in de vaste dia. */
dialog .close-btn {
    position: absolute;
    right: 16px;
    bottom: 16px;
    z-index: 30;
}

/* Op een smal telefoonscherm wordt de ruimte optimaal benut. */
@media (max-width: 700px) {
    dialog#ochtend-middag,
    dialog#middag-avond {
        width: 94vw;
        height: 88vh;
        max-width: 94vw;
        max-height: 88vh;
    }

    .slideshow-container {
        padding: 38px 42px 58px;
    }

    dialog .prev,
    dialog .next {
        width: 30px;
        font-size: 26px;
    }

    dialog .prev {
        left: 6px;
    }

    dialog .next {
        right: 6px;
    }

    .slideshow-container .foto-naast {
        gap: 5px;
    }

    .slideshow-container .foto-naast > img {
        max-width: calc(100% - 125px);
    }

    .slideshow-container .rechter-kolom {
        width: 28%;
        max-width: 28%;
        gap: 5px;
    }
}

/* Reisblik 9.7.19 — vaste kolommen en slideshow-fotoplaatsen */
.indeling-kolommen {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    column-gap: 30px;
    align-items: start;
}
.reis-kolom {
    min-width: 0;
}
.reis-slideshow-card {
    margin-top: 10px;
    text-align: center;
}
.reis-slideshow-card button {
    width: 100%;
    border: 0;
    padding: 0;
    background: transparent;
    cursor: pointer;
}
.reis-trigger-foto {
    width: 100%;
    min-height: 180px;
}

.reis-trigger-foto img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
    display: block;
}

.reis-slide-foto-rij {
    display: flex;
    width: 100%;
    justify-content: center;
    gap: 10px;
    flex-wrap: nowrap;
}
.reis-slide-foto-rij .reis-foto-plaats {
    flex: 1 1 0;
}
.reis-slide-groot {
    flex: 0 0 65%;
    min-height: 260px;
}
.reis-slide-midden {
    flex: 0 0 50%;
    min-height: 240px;
}
.reis-slide-breed {
    width: 80%;
    min-height: 240px;
    margin-left: auto;
    margin-right: auto;
}
.slideshow-container .reis-foto-plaats {
    min-height: 110px;
    margin: 8px;
    border-radius: 15px;
}
.slideshow-container .rechter-kolom .reis-foto-plaats {
    margin: 0;
    min-height: 90px;
}
@media (max-width: 900px) {
    .indeling-kolommen {
        grid-template-columns: 1fr;
    }
    .reis-kolom {
        width: 100%;
    }
}

/* Reisblik 9.7.19 — foto-plaatsen en paginanavigatie */
.reis-foto-plaats {
    background-color: #d8d8d8;
    border: 1px dashed #777;
    color: #555;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    font-style: italic;
    box-sizing: border-box;
    padding: 8px;
}
.hoofdtekst > .reis-hoofd-foto {
    position: absolute;
    top: 15px;
    width: 200px;
    height: 200px;
    min-height: 0;
    margin: 0 !important;
}
.hoofdtekst > .reis-hoofd-foto:first-child { left: 15px; }
.hoofdtekst > .reis-hoofd-foto:nth-child(2) { right: 15px; }

.hoofdtekst > .reis-hoofd-foto img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top;
    display: block;
}

.foto-onderschrift {
    text-align: center;
    font-size: 0.85em;
    margin-top: 5px;
    line-height: 1.3;
    font-style: italic;
}

.reis-map-slot {
    position: relative;
    width: 23%;
    height: 180px;
    min-width: 0;
    background-color: #ddd;
    border: 1px dashed #777;
    box-sizing: border-box;
}
.reis-reisdag-map { width: 100%; height: 100%; }
.reis-map-caption {
    position: absolute;
    left: 5px;
    bottom: 5px;
    z-index: 500;
    background: rgba(80,80,80,.8);
    color: #fff;
    padding: 3px 6px;
    font: 11px Arial, sans-serif;
}
.reis-foto-top {
    aspect-ratio: 4 / 3;
    min-width: 0;
    padding: 0;
    overflow: hidden;
}

.reis-foto-top:nth-child(1) {
    width: 33%;
}

.reis-foto-top:nth-child(2) {
    width: 33%;
}

.reis-foto-top:nth-child(3) {
    width: 33%;
}

.reis-foto-top img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: bottom;
    display: block;
}
@media (max-width: 700px) {
    .hoofdtekst > .reis-hoofd-foto { width: 90px; height: 90px; top: 10px; }
    .hoofdtekst > .reis-hoofd-foto:first-child { left: 10px; }
    .hoofdtekst > .reis-hoofd-foto:nth-child(2) { right: 10px; }
    .reis-map-slot, .reis-foto-top { width: 100%; height: 180px; }
    .top-fotobalk { flex-wrap: wrap; }
}

/* =========================================================
   Automatische slideshow-foto-indeling
   ========================================================= */

.slide-fotos {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
    gap: 10px;
    width: 100%;
    height: 650px;
    box-sizing: border-box;
}

.slide-foto {
    min-width: 0;
    min-height: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    box-sizing: border-box;
}

.slide-foto > img {
    width: 100%;
    height: 100%;
    max-width: none;
    max-height: none;
    object-fit: cover;
    display: block;
    margin: 0;
}

.slide-foto > .reis-foto-plaats {
    width: 100%;
    height: 100%;
    min-height: 0;
    margin: 0;
}
`;
  }

  function reisSlideshowScript() {
    return `<script>
    (function(){

        /* =====================================================
           Automatische foto-indeling

           De oriëntatie wordt van iedere foto afzonderlijk bepaald.
           Waar mogelijk wordt de EXIF-oriëntatie meegenomen via
           createImageBitmap(). Als dat niet kan, wordt teruggevallen
           op naturalWidth / naturalHeight.

           1 foto:
               één grote foto

           2 foto's:
               naast elkaar

           3 portretfoto's:
               drie naast elkaar

           3 landschapsfoto's:
               twee boven + één grote onder

           1 portret + 2 landschappen:
               portret links + twee rechts

           4 foto's:
               twee boven + twee onder
           ===================================================== */

        async function bepaalOrientatie(img) {

            if (!img.naturalWidth || !img.naturalHeight) {
                return null;
            }

            /*
               Probeer eerst de feitelijke afbeeldingsoriëntatie te lezen.
               Dit voorkomt problemen bij foto's die door een telefoon
               met EXIF-rotatie zijn opgeslagen.
            */
            try {
                if (window.createImageBitmap) {

                    const response = await fetch(
                        img.currentSrc || img.src,
                        { cache: "no-store" }
                    );

                    if (response.ok) {

                        const blob = await response.blob();

                        const bitmap = await createImageBitmap(
                            blob,
                            { imageOrientation: "from-image" }
                        );

                        const breedte = bitmap.width;
                        const hoogte = bitmap.height;

                        bitmap.close();

                        if (hoogte > breedte) {
                            return "portret";
                        }

                        if (breedte > hoogte) {
                            return "landschap";
                        }

                        return "vierkant";
                    }
                }
            } catch (fout) {
                /* Terugvallen op de normale browserafmetingen. */
            }

            if (img.naturalHeight > img.naturalWidth) {
                return "portret";
            }

            if (img.naturalWidth > img.naturalHeight) {
                return "landschap";
            }

            return "vierkant";
        }


        async function bepaalFotoIndeling() {

            const containers = document.querySelectorAll(".slide-fotos");

            for (const container of containers) {

                const fotos = Array.from(
                    container.querySelectorAll(".slide-foto img")
                );

                if (fotos.length < 1) {
                    continue;
                }

                /* Wacht tot alle foto's hun echte afmetingen hebben. */
                const nietGeladen = fotos.some(function(img) {
                    return !img.naturalWidth || !img.naturalHeight;
                });

                if (nietGeladen) {
                    fotos.forEach(function(img) {
                        img.addEventListener(
                            "load",
                            bepaalFotoIndeling,
                            { once: true }
                        );
                    });
                    continue;
                }

                const orientaties = [];

                for (const img of fotos) {
                    orientaties.push(await bepaalOrientatie(img));
                }

                const aantalPortret = orientaties.filter(function(ori) {
                    return ori === "portret";
                }).length;

                const aantalLandschap = orientaties.filter(function(ori) {
                    return ori === "landschap";
                }).length;

                console.log(
                    "Slideshow:",
                    fotos.length,
                    "foto's —",
                    aantalPortret,
                    "portret,",
                    aantalLandschap,
                    "landschap"
                );

                container.style.display = "grid";
                container.style.gap = "10px";
                container.style.width = "100%";
                container.style.height = "650px";
                container.style.boxSizing = "border-box";

                fotos.forEach(function(img) {

                    const vak = img.parentElement;

                    vak.style.gridColumn = "";
                    vak.style.gridRow = "";
                    vak.style.width = "100%";
                    vak.style.height = "100%";
                    vak.style.margin = "0";
                    vak.style.padding = "0";

                    img.style.width = "100%";
                    img.style.height = "100%";
                    img.style.maxWidth = "none";
                    img.style.maxHeight = "none";
                    img.style.objectFit = "cover";
                    img.style.margin = "0";
                    img.style.display = "block";
                });

                /* -------------------------------------------------
                   1 FOTO
                   ------------------------------------------------- */

                if (fotos.length === 1) {

                    console.log("Automatische indeling: 1 FOTO");

                    container.style.gridTemplateColumns = "1fr";
                    container.style.gridTemplateRows = "1fr";

                    fotos[0].parentElement.style.gridColumn = "1";
                    fotos[0].parentElement.style.gridRow = "1";

                    continue;
                }

                /* -------------------------------------------------
                   2 FOTO'S
                   ------------------------------------------------- */

                if (fotos.length === 2) {

                    console.log(
                        "Automatische indeling: 2 FOTO'S NAAST ELKAAR"
                    );

                    container.style.gridTemplateColumns = "1fr 1fr";
                    container.style.gridTemplateRows = "1fr";

                    fotos[0].parentElement.style.gridColumn = "1";
                    fotos[0].parentElement.style.gridRow = "1";

                    fotos[1].parentElement.style.gridColumn = "2";
                    fotos[1].parentElement.style.gridRow = "1";

                    continue;
                }

                /* -------------------------------------------------
                   3 PORTRETFOTO'S
                   ------------------------------------------------- */

                if (fotos.length === 3 && aantalPortret === 3) {

                    console.log(
                        "Automatische indeling: 3 PORTRETTEN NAAST ELKAAR"
                    );

                    container.style.gridTemplateColumns = "1fr 1fr 1fr";
                    container.style.gridTemplateRows = "1fr";

                    fotos.forEach(function(img, index) {
                        img.parentElement.style.gridColumn = String(index + 1);
                        img.parentElement.style.gridRow = "1";
                    });

                    continue;
                }

                /* -------------------------------------------------
                   3 FOTO'S: 1 PORTRET + 2 LANDSCHAPPEN
                   ------------------------------------------------- */

                if (
                    fotos.length === 3 &&
                    aantalPortret === 1 &&
                    aantalLandschap === 2
                ) {

                    console.log(
                        "Automatische indeling: PORTRET LINKS + 2 LANDSCHAPPEN RECHTS"
                    );

                    container.style.gridTemplateColumns = "1fr 1fr";
                    container.style.gridTemplateRows = "1fr 1fr";

                    const portretIndex = orientaties.findIndex(function(ori) {
                        return ori === "portret";
                    });

                    const landschapIndexes = orientaties
                        .map(function(ori, index) {
                            return ori === "landschap" ? index : -1;
                        })
                        .filter(function(index) {
                            return index !== -1;
                        });

                    fotos[portretIndex].parentElement.style.gridColumn = "1";
                    fotos[portretIndex].parentElement.style.gridRow = "1 / 3";

                    fotos[landschapIndexes[0]].parentElement.style.gridColumn = "2";
                    fotos[landschapIndexes[0]].parentElement.style.gridRow = "1";

                    fotos[landschapIndexes[1]].parentElement.style.gridColumn = "2";
                    fotos[landschapIndexes[1]].parentElement.style.gridRow = "2";

                    continue;
                }

                /* -------------------------------------------------
                   3 LANDSCHAPSFOTO'S
                   Twee boven + één grote onder
                   ------------------------------------------------- */

                if (fotos.length === 3 && aantalLandschap === 3) {

                    console.log(
                        "Automatische indeling: 2 BOVEN + 1 GROOT ONDER"
                    );

                    container.style.gridTemplateColumns = "1fr 1fr";
                    container.style.gridTemplateRows = "1fr 1fr";

                    fotos[0].parentElement.style.gridColumn = "1";
                    fotos[0].parentElement.style.gridRow = "1";

                    fotos[1].parentElement.style.gridColumn = "2";
                    fotos[1].parentElement.style.gridRow = "1";

                    fotos[2].parentElement.style.gridColumn = "1 / 3";
                    fotos[2].parentElement.style.gridRow = "2";

                    continue;
                }

                /* -------------------------------------------------
                   4 FOTO'S
                   Twee boven + twee onder
                   ------------------------------------------------- */

                if (fotos.length === 4) {

                    console.log(
                        "Automatische indeling: 2 X 2"
                    );

                    container.style.gridTemplateColumns = "1fr 1fr";
                    container.style.gridTemplateRows = "1fr 1fr";

                    fotos[0].parentElement.style.gridColumn = "1";
                    fotos[0].parentElement.style.gridRow = "1";

                    fotos[1].parentElement.style.gridColumn = "2";
                    fotos[1].parentElement.style.gridRow = "1";

                    fotos[2].parentElement.style.gridColumn = "1";
                    fotos[2].parentElement.style.gridRow = "2";

                    fotos[3].parentElement.style.gridColumn = "2";
                    fotos[3].parentElement.style.gridRow = "2";

                    continue;
                }

                /* -------------------------------------------------
                   Overige combinaties
                   ------------------------------------------------- */

                const kolommen = fotos.length <= 3 ? fotos.length : 2;
                const rijen = Math.ceil(fotos.length / kolommen);

                console.log(
                    "Automatische indeling: standaard raster",
                    kolommen,
                    "x",
                    rijen
                );

                container.style.gridTemplateColumns =
                    "repeat(" + kolommen + ", 1fr)";

                container.style.gridTemplateRows =
                    "repeat(" + rijen + ", 1fr)";

                fotos.forEach(function(img, index) {

                    const kolom = (index % kolommen) + 1;
                    const rij = Math.floor(index / kolommen) + 1;

                    img.parentElement.style.gridColumn = String(kolom);
                    img.parentElement.style.gridRow = String(rij);
                });
            }
        }


        /* =====================================================
           Bestaande slideshow-navigatie
           ===================================================== */

        function show(dialog,index){
            var slides=[...dialog.querySelectorAll('.slide')];
            if(!slides.length)return;
            var n=((index%slides.length)+slides.length)%slides.length;
            slides.forEach(function(s,i){s.style.display=i===n?'flex':'none';});
        }

        document.addEventListener('click',function(e){

            var open=e.target.closest('[data-reis-open]');
            if(open){
                var d=document.getElementById(open.getAttribute('data-reis-open'));
                if(d){
                    d.showModal();
                    show(d,0);
                    bepaalFotoIndeling();
                }
                return;
            }

            var close=e.target.closest('[data-reis-close]');
            if(close){
                document.getElementById(close.getAttribute('data-reis-close'))?.close();
                return;
            }

            var prev=e.target.closest('[data-reis-prev]');
            if(prev){
                var d=document.getElementById(prev.getAttribute('data-reis-prev'));
                if(d){
                    var s=[...d.querySelectorAll('.slide')];
                    var i=s.findIndex(x=>x.style.display!=='none');
                    show(d,(i<0?0:i)-1);
                    bepaalFotoIndeling();
                }
                return;
            }

            var next=e.target.closest('[data-reis-next]');
            if(next){
                var d=document.getElementById(next.getAttribute('data-reis-next'));
                if(d){
                    var s=[...d.querySelectorAll('.slide')];
                    var i=s.findIndex(x=>x.style.display!=='none');
                    show(d,(i<0?0:i)+1);
                    bepaalFotoIndeling();
                }
                return;
            }
        });

  document.addEventListener('DOMContentLoaded',function(){
            document.querySelectorAll('dialog').forEach(function(d){
                if(d.querySelectorAll('.slide').length)show(d,0);
            });
            bepaalFotoIndeling();
        });

        window.addEventListener('load',bepaalFotoIndeling);

    })();
</script>`;
  }

  function reisNavigationHtml() {
    return `    <div style="display: flex; justify-content: center; gap: 10px; flex-wrap: wrap; margin-top: 15px;">
        <!-- Vervang de twee href's hieronder door de echte vorige/volgende reisdag-pagina. -->
        <a href="#" data-reis-page-link="previous"><button type="button">vorige Pagina</button></a>
        <a href="#" data-reis-page-link="next"><button type="button">Volgende Pagina</button></a>
    </div>`;
  }

  function reisDemoSlideshowHtml() {
    // Twee voorbeeld-diavoorstellingen in de nieuwe automatische foto-indeling.
    // De gebruiker vervangt de FOTO-PLAATSEN later door echte <img>-elementen.
    return `
<dialog id="ochtend-middag">
    <div id="slideshow1" class="slideshow-container">

        <div class="slide">

            <div class="text-slide">
                overige foto's de reisdag
            </div>

            <div class="slide-fotos">

                <div class="slide-foto">
                    <div class="reis-foto-plaats">PLAATS FOTO 1</div>
                </div>

                <div class="slide-foto">
                    <div class="reis-foto-plaats">PLAATS FOTO 2</div>
                </div>

                <div class="slide-foto">
                    <div class="reis-foto-plaats">PLAATS FOTO 3</div>
                </div>

            </div>

        </div>

        <div class="slide">

            <div class="text-slide">
                overige foto's de reisdag
            </div>

            <div class="slide-fotos">

                <div class="slide-foto">
                    <div class="reis-foto-plaats">PLAATS FOTO 4</div>
                </div>

            </div>

        </div>

    </div>

    <!-- Knoppen -->
    <a class="prev" data-reis-prev="ochtend-middag">&#10094;</a>
    <a class="next" data-reis-next="ochtend-middag">&#10095;</a>
    <button class="close-btn" data-reis-close="ochtend-middag">Sluiten</button>
</dialog>

<dialog id="middag-avond">
    <div id="slideshow2" class="slideshow-container">

        <div class="slide">

            <div class="text-slide">
                overige foto's de reisdag
            </div>

            <div class="slide-fotos">

                <div class="slide-foto">
                    <div class="reis-foto-plaats">PLAATS FOTO 5</div>
                </div>

                <div class="slide-foto">
                    <div class="reis-foto-plaats">PLAATS FOTO 6</div>
                </div>

                <div class="slide-foto">
                    <div class="reis-foto-plaats">PLAATS FOTO 7</div>
                </div>

                <div class="slide-foto">
                    <div class="reis-foto-plaats">PLAATS FOTO 8</div>
                </div>

            </div>

        </div>

        <div class="slide">

            <div class="text-slide">
                overige foto's de reisdag
            </div>

            <div class="slide-fotos">

                <div class="slide-foto">
                    <div class="reis-foto-plaats">PLAATS FOTO 9</div>
                </div>

                <div class="slide-foto">
                    <div class="reis-foto-plaats">PLAATS FOTO 10</div>
                </div>

            </div>

        </div>

    </div>

    <!-- Knoppen -->
    <a class="prev" data-reis-prev="middag-avond">&#10094;</a>
    <a class="next" data-reis-next="middag-avond">&#10095;</a>
    <button class="close-btn" data-reis-close="middag-avond">Sluiten</button>
</dialog>`;
  }

  function reisSlideshowTriggerHtml(dialogId, title, fotoLabel) {
    return `
        <div class="omkaderde-tekst reis-slideshow-card">
            <button type="button" data-reis-open="${dialogId}">
                <span class="reis-foto-plaats reis-trigger-foto">${fotoLabel}</span>
            </button>
            <figcaption>
                <span style="color: white; background-color: gray"> ${title} </span>
            </figcaption>
        </div>`;
  }

  function reisLocationTextForHtml(entry) {
    const text = String(entry?.text || '').replace(/\r/g,'').trim();
    if (text) return text;

    const doc = new DOMParser().parseFromString(String(entry?.html || ''), 'text/html');
    doc.querySelectorAll('script,style,noscript,button,input,textarea,select,nav,header,footer').forEach(el=>el.remove());
    return String(doc.body?.innerText || doc.body?.textContent || '')
      .replace(/\r/g,'')
      .replace(/[ \t]+\n/g,'\n')
      .replace(/\n{3,}/g,'\n\n')
      .trim();
  }

  function reisLocationBlockHtml(entry) {
    const item = entry?.item || {};
    const location = findLocation(item) || {};
    const name = item.name || location.name || 'Onbekende locatie';
    const text = reisLocationTextForHtml(entry);
    const paragraphs = text
      ? '<p>'+escapeHtml(text).replace(/\n/g,'<br>')+'</p>'
      : '<p><i>Geen tekst beschikbaar voor deze locatie.</i></p>';

    return `    <div class="tekst-normaal">
        <h2>${escapeHtml(name)}</h2>

        <img src="./foto-plaats.jpg"
             height="300"
             width="100%"
             style="object-fit: cover;"
             alt="FOTO-PLAATS — volledige kolom"
             data-foto-plaats="volledige-kolom">

        <div style="float: right; width: 40%; margin-left: 20px;">

            <img src="./Ifoto-plaats.jpg"
                 width="100%"
                 alt="FOTO-PLAATS — binnen de tekst"
                 data-foto-plaats="binnen-tekst">

            <div class="foto-onderschrift">
                onderschrift van de foto
            </div>

        </div>

${paragraphs}

    </div>`;
  }

  async function makeTravelHtml(entries,dateFrom,dateTo) {
    const period=rangeLabel(dateFrom,dateTo);

    // De aangeleverde HTML-skelet is vanaf 9.8.19 de vaste basis voor
    // Maak-reis-HTML en HTML per dag. De kaart is bewust niet opgenomen.
    const total=entries.length;
    const cut1=Math.ceil(total/3);
    const cut2=Math.ceil((total-cut1)/2)+cut1;
    const columns=[
      entries.slice(0,cut1),
      entries.slice(cut1,cut2),
      entries.slice(cut2)
    ];

    const columnHtml=(items,columnNumber)=>items.map(reisLocationBlockHtml).join('\n')+
      (columnNumber===1 ? reisSlideshowTriggerHtml('ochtend-middag','Overige foto\'s','FOTO-PLAATS — slideshow ochtend/middag') : '')+
      (columnNumber===3 ? reisSlideshowTriggerHtml('middag-avond','Overige foto\'s','FOTO-PLAATS — slideshow middag/avond') : '');

    const dialogs = entries.map(x=>x.html ? reisNormalizeSlideshowDialog(
      new DOMParser().parseFromString(x.html,'text/html').querySelector('dialog')
    ) : null).filter(Boolean);

    return `<!DOCTYPE html>
<html lang="nl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>titel-webpage</title>
    <style>
${reisTravelCss()}
    </style>
</head>
<body>

<div class="hoofdtekst">
    <div class="reis-foto-plaats reis-hoofd-foto"> <img src="./foto-plaats.jpg"> </div>
    <div class="reis-foto-plaats reis-hoofd-foto"> <img src="./foto-plaats.jpg"> </div>
    <h1>Mijn reisdag</h1>
    <h2><i>${escapeHtml(period)}</i></h2>
</div>
${dayReportHtml(dateFrom,dateTo,'travel')}

<div class="top-fotobalk">
    <div class="reis-foto-plaats reis-foto-top"> <img src="./foto-plaats.jpg"> </div>
    <div class="reis-foto-plaats reis-foto-top"><img src="./foto-plaats.jpg"> </div>
    <div class="reis-foto-plaats reis-foto-top"><img src="./foto-plaats.jpg" style="object-position: top"> </div>
</div>
<figcaption><span class="fotobalk-caption">
    foto's voor de reisdag
</span></figcaption>

<div class="indeling-kolommen">
    <div class="reis-kolom">
${columnHtml(columns[0],1)}
    </div>

    <div class="reis-kolom">
${columnHtml(columns[1],2)}
    </div>

    <div class="reis-kolom">
${columnHtml(columns[2],3)}
    </div>
</div>

<div class="voettekst">
    <ul>
        <li>Reisdagboek — bezochte locaties in chronologische volgorde</li>
        <li>Foto-plaatsen kunnen later met eigen foto's worden gevuld</li>
    </ul>
${reisNavigationHtml()}
    <div style="display: flex; justify-content: center; margin-top: 10px;">
        <button type="button" onclick="window.scrollTo({top:0,behavior:'smooth'})">Naar boven</button>
    </div>
</div>

${reisDemoSlideshowHtml()}

${reisSlideshowScript()}
</body>
</html>`;
  }

  function dateListInclusive(dateFrom,dateTo){
    const result=[];
    const current=new Date(dateFrom+'T12:00:00');
    const end=new Date(dateTo+'T12:00:00');
    if(Number.isNaN(current.getTime())||Number.isNaN(end.getTime()))return result;

    while(current<=end){
      result.push(
        current.getFullYear()+'-'+
        String(current.getMonth()+1).padStart(2,'0')+'-'+
        String(current.getDate()).padStart(2,'0')
      );
      current.setDate(current.getDate()+1);
    }
    return result;
  }

  async function generateTravelHtmlPerDay(dateFrom,dateTo){
    const btn=byId('maak-html-per-dag');
    if(btn){
      btn.disabled=true;
      btn.textContent='⏳ HTML per dag…';
    }

    try{
      const dates=dateListInclusive(dateFrom,dateTo);
      if(!dates.length){
        alert('De gekozen periode bevat geen geldige dagen.');
        return;
      }

      const dayData=[];

      for(const date of dates){
        /* Alleen dagen met minimaal één bezochte locatie of evenement
           krijgen een afzonderlijk HTML-bestand. Dagen zonder bezoek
           worden bewust overgeslagen. */
        const matches=matchesForRange(date,date);

        if(!matches.length){
          continue;
        }

        const entries=await buildDayData(date,date);
        const html=await makeTravelHtml(entries,date,date);
        const firstName=getFirstName(matches);
        const filename=date+'-'+firstName+'-maak-html-reis.html';
        dayData.push({html,filename});
      }

      if(!dayData.length){
        alert('In de gekozen periode zijn geen bezochte locaties of evenementen gevonden.');
        return;
      }

      /*
         Eén bestand per dag. Een kleine vertraging voorkomt dat een browser
         meerdere downloads te snel als ongewenst blokkeert.
      */
      dayData.forEach(function(file,index){
        setTimeout(function(){
          downloadBlob(
            new Blob([file.html],{type:'text/html;charset=utf-8'}),
            file.filename
          );
        },index*800);
      });

      if(dayData.length===1){
        alert('1 HTML-bestand is gemaakt.');
      }else{
        alert(dayData.length+' afzonderlijke HTML-bestanden zijn gemaakt.');
      }

    }catch(e){
      console.error('Mijn reisdag: HTML per dag kon niet worden gemaakt',e);
      alert('De afzonderlijke HTML-bestanden konden niet worden gemaakt.');
    }finally{
      if(btn){
        btn.disabled=false;
        btn.textContent='📚 HTML per dag';
      }
    }
  }

  async function generateTravelHtml(dateFrom,dateTo){
    const btn=byId('maak-html-reis');
    if(btn){btn.disabled=true;btn.textContent='⏳ maak-html-reis…';}
    try{
      const matches=matchesForRange(dateFrom,dateTo);
      const period=rangeLabel(dateFrom,dateTo);
      if(!matches.length){alert('Geen bezochte locaties gevonden voor '+period+'.');return;}
      const entries=await buildDayData(dateFrom,dateTo);
      const html=await makeTravelHtml(entries,dateFrom,dateTo);
      const filename=(dateFrom===dateTo?dateFrom:dateFrom+'-tm-'+dateTo)+'-maak-html-reis.html';
      downloadBlob(new Blob([html],{type:'text/html;charset=utf-8'}),filename);
    }catch(e){console.error('Mijn reisdag: reisboekstijl HTML kon niet worden gemaakt',e);alert('De reisboekstijl HTML kon niet worden gemaakt.');}
    finally{if(btn){btn.disabled=false;btn.textContent='📖 Maak-reis-HTML';}}
  }

  function makeTravelDiaryHtml(entries,dateFrom,dateTo,customTitle){
    const period=rangeLabel(dateFrom,dateTo);
    const title=customTitle || (dateFrom===dateTo ? 'Mijn reisdag' : 'Mijn reisdagen');
    const heroes=diaryHeroData(entries);

    const heroHtml=heroes.length ? '<section class="dagboek-hero">'+heroes.map(h=>
      '<figure><img src="'+escapeHtml(h.src)+'" alt="'+escapeHtml(h.caption)+'"><figcaption>'+escapeHtml(h.caption)+'</figcaption></figure>'
    ).join('')+'</section>' : '';

    const prepared=entries.map((entry,index)=>diaryPrepareFixedHtml(entry.html,index));

    const cards=entries.map((entry,index)=>{
      const item=entry.item||{};
      const location=findLocation(item)||{};
      const when=timePart(item.visitedAt);

      const category=String(item.category||location.category||'locaties').toLowerCase();
      const isLocatie=category==='locaties';
      let factual='';
      const fixed=prepared[index];
      // Voor gewone locaties tonen we bewust niet langer de volledige vaste HTML-tekst.
      // Foto's/slideshows blijven wel behouden; alleen de lokaal opgeslagen extra info wordt getoond.
      if(!isLocatie){
        if(fixed?.html){
          factual='<div class="dagboek-vaste-tekst">'+fixed.html+'</div>';
        }else if(entry.text){
          factual=diaryTextBlock('Het verhaal',entry.text);
        }
      }

      const image=diaryPhotoHtml(item,entry.html,item.name||location.name||'');
      const meta=[when,location.address||location.category||location.type].filter(Boolean).join(' · ');

      const personal=!isLocatie && location.userCreated
        ? (location.story||location.experience||'')
        : '';

      const experience=personal
        ? '<div class="dagboek-ervaring"><h3>MIJN ERVARING</h3>'+
          String(personal).split(/\n\s*\n/).filter(Boolean)
            .map(p=>'<p>'+escapeHtml(p).replace(/\n/g,'<br>')+'</p>').join('')+
          '</div>'
        : '';

      return '<article class="dagboek-kaart">'+
        '<div class="dagboek-kaart-kop"><span class="dagboek-nummer">'+String(index+1)+'</span>'+
        '<div class="dagboek-kaart-titel"><h2>'+escapeHtml(item.name||location.name||'Onbekende locatie')+'</h2>'+
        (meta?'<div class="dagboek-meta">'+escapeHtml(meta)+'</div>':'')+'</div></div>'+
        '<div class="dagboek-kaart-inhoud">'+image+
        '<div class="dagboek-feit">'+(factual?'<h3>HET VERHAAL</h3>'+factual:'')+'</div>'+
        '</div>'+experience+
        (isLocatie && entry.extra.length ? '<div class="dagboek-extra-info"><h3>EXTRA INFORMATIE</h3>'+entry.extra.map(x=>'<p>'+ (x.date?'<b>'+escapeHtml(x.date)+'</b> — ':'') + escapeHtml(x.text||'')+'</p>').join('')+'</div>' : '')+
        (fixed?.extrasHtml||'')+
        '</article>';
    }).join('\n');

    const closing=entries.length
      ? '<section class="dagboek-afsluiting"><span>✦</span><div><strong>MIJN DAG</strong><p>'+
        'Een dag vol plaatsen, verhalen en eigen herinneringen.'+
        '</p></div></section>'
      : '';

    return '<!DOCTYPE html><html lang="nl"><head><meta charset="utf-8">'+
      '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes, viewport-fit=cover">'+
      '<title>'+escapeHtml(title+' — '+period)+'</title>'+
      '<style>'+travelDiaryCss()+'</style></head><body>'+
      '<main class="dagboek-pagina">'+
      '<header class="dagboek-header"><div class="dagboek-header-top"><div class="dagboek-label">REISBLIK · MIJN REISDAGBOEK</div></div>'+
      '<h1>MIJN REISDAG</h1>'+
      '<h2>'+escapeHtml(title)+'</h2>'+
      '<div class="dagboek-datum">'+escapeHtml(formatDiaryDate(dateFrom))+
      (dateFrom!==dateTo?' <span>t/m '+escapeHtml(formatDiaryDate(dateTo))+'</span>':'')+'</div></header>'+
      heroHtml+
      dayReportHtml(dateFrom,dateTo,'travel')+
      '<section class="dagboek-bezocht"><span class="dagboek-pin">●</span><strong>BEZOCHT</strong><em>De plekken van vandaag</em></section>'+
      (entries.length?'<section class="dagboek-grid">'+cards+'</section>':'<p class="dagboek-leeg">Er zijn voor deze periode nog geen bezochte locaties geselecteerd.</p>')+
      closing+
      '<footer class="dagboek-footer">Reizen verrijkt niet alleen je blik, maar ook je verhaal.</footer>'+
      '</main>'+diaryClientScript()+'</body></html>';
  }

  async function buildSelectedDiaryHtml(dateFrom,dateTo){
    const matches=matchesForRange(dateFrom,dateTo);
    const period=rangeLabel(dateFrom,dateTo);
    if(!matches.length){
      alert('Geen bezochte locaties gevonden voor '+period+'.');
      return null;
    }
    const entries=await buildDayData(dateFrom,dateTo);
    return makeTravelDiaryHtml(entries,dateFrom,dateTo);
  }

  async function generateSelectedDiaryHtml(dateFrom,dateTo){
    const btn=byId('reisdagDiaryBtn');
    if(btn){btn.disabled=true;btn.textContent='⏳ HTML maken…';}
    try{
      const html=await buildSelectedDiaryHtml(dateFrom,dateTo);
      if(!html)return;
      const filename=(dateFrom===dateTo?dateFrom:dateFrom+'-tm-'+dateTo)+'-reisdagboek.html';
      downloadBlob(new Blob([html],{type:'text/html;charset=utf-8'}),filename);
    }catch(e){
      console.error('Mijn reisdag: HTML kon niet worden gemaakt',e);
      alert('De reisdagboek-HTML kon niet worden gemaakt.');
    }finally{
      if(btn){btn.disabled=false;btn.textContent='📖 HTML maken';}
    }
  }

  async function showSelectedDiaryHtml(dateFrom,dateTo){
    /*
       Mobiele browsers kunnen window.open() als een klein popup-venster openen.
       Daardoor kreeg "Toon reisdag" op Android een smalle kolom links op het scherm.
       Op mobiel openen we de gegenereerde reisdag daarom in het huidige volledige tabblad.
       Op desktop blijft een nieuw tabblad beschikbaar.
    */
    try{
      const html=await buildSelectedDiaryHtml(dateFrom,dateTo);
      if(!html)return;

      const base=new URL('./',location.href).href.replace(/&/g,'&amp;').replace(/"/g,'&quot;');
      const previewHtml=html.replace('<head>','<head><base href="'+base+'">');
      const blobUrl=URL.createObjectURL(new Blob([previewHtml],{type:'text/html;charset=utf-8'}));
      const isMobile=/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

      if(isMobile){
        location.href=blobUrl;
        return;
      }

      const win=window.open(blobUrl,'_blank');
      if(!win){
        URL.revokeObjectURL(blobUrl);
        alert('De reisdag kan niet worden geopend. Sta pop-ups voor Reisblik toe.');
        return;
      }

      setTimeout(()=>URL.revokeObjectURL(blobUrl),60000);
    }catch(e){
      console.error('Mijn reisdag: HTML kon niet worden getoond',e);
      alert('De reisdag kon niet worden getoond.');
    }
  }

  function travelDiaryCss(){
    return `
      *{box-sizing:border-box}
      html{width:100% !important;min-width:0 !important;margin:0;padding:0;overflow-x:hidden}
      body{margin:0 !important;padding:0 !important;width:100% !important;min-width:0 !important;max-width:none !important;background:#e8e5df;color:#202b2f;font-family:Georgia,'Times New Roman',serif;line-height:1.48;overflow-x:hidden}
      .dagboek-pagina{display:block;width:100% !important;max-width:1180px;margin:0 auto;background:#fbfaf6;min-height:100vh;padding:30px 34px 46px}
      @media(max-width:760px){html{width:100vw !important;min-width:100vw !important;max-width:100vw !important}body{width:100vw !important;min-width:100vw !important;max-width:100vw !important;margin:0 !important;padding:0 !important}.dagboek-pagina{width:100vw !important;max-width:100vw !important;min-width:0 !important;margin:0 !important;padding:14px 12px 30px !important;overflow:hidden}}
      .dagboek-header{background:#e8df73;border-top:4px solid #1e292d;border-bottom:4px solid #1e292d;text-align:center;padding:18px 28px 22px;margin-bottom:18px}
      .dagboek-header-top{display:flex;align-items:center;justify-content:space-between;gap:15px;margin-bottom:6px}
      .dagboek-label{font:700 11px/1.2 Arial,sans-serif;letter-spacing:3px;color:#354247}
      .dagboek-header h1{margin:0;font-size:clamp(40px,6vw,72px);line-height:.95;letter-spacing:1px}
      .dagboek-header h2{margin:10px 0 8px;font-size:clamp(22px,3vw,38px);font-style:italic;line-height:1.1}
      .dagboek-datum{font:600 13px/1.3 Arial,sans-serif;letter-spacing:2px;text-transform:uppercase}
      .dagboek-hero{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:0 0 18px}
      .dagboek-hero figure{position:relative;margin:0;min-width:0}.dagboek-hero img{display:block;width:100%;height:300px;object-fit:cover}
      .dagboek-hero figcaption,.dagboek-foto figcaption{position:absolute;left:8px;bottom:8px;background:rgba(25,34,38,.82);color:#fff;padding:4px 8px;font:italic 14px/1.2 Georgia,serif}
      .dagboek-intro{background:#f1ead8;border-left:5px solid #a9bfae;padding:13px 16px;margin:0 0 18px}.dagboek-intro p{margin:0 0 7px}.dagboek-intro p:last-child{margin-bottom:0}.dagboek-dagverslagen{background:#f1ead8;border-left:5px solid #a9bfae;padding:14px 16px;margin:0 0 20px}.dagboek-dagverslagen>h3{margin:0 0 10px;font:bold 12px/1.2 Arial,sans-serif;letter-spacing:1.5px}.dagboek-dagverslag{margin:0 0 12px}.dagboek-dagverslag:last-child{margin-bottom:0}.dagboek-dagverslag strong{display:block;margin-bottom:4px}.dagboek-dagverslag p{margin:0 0 7px;line-height:1.45}.dagboek-dagverslag p:last-child{margin-bottom:0}
      .dagboek-bezocht{display:flex;align-items:center;gap:12px;background:#c7e1df;padding:11px 16px;margin:0 0 22px;border-top:1px solid #a9c9c7;border-bottom:1px solid #a9c9c7}.dagboek-pin{font:22px Arial,sans-serif}.dagboek-bezocht strong{font-size:28px;letter-spacing:1px}.dagboek-bezocht em{margin-left:auto;font-size:20px}
      .dagboek-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;align-items:start}.dagboek-kaart{break-inside:avoid;border:1px solid #ddd4ca;background:#fcfaf5;overflow:hidden}
      .dagboek-kaart-kop{display:flex;background:#e8d2cb;min-height:54px;align-items:stretch}.dagboek-nummer{display:flex;align-items:center;justify-content:center;background:#1e292d;color:#fff;font:bold 22px Arial,sans-serif;width:52px;flex:0 0 52px}.dagboek-kaart-titel{padding:8px 10px 7px;min-width:0}.dagboek-kaart-kop h2{font-size:22px;line-height:1.08;margin:0 0 4px}.dagboek-meta{font:12px/1.3 Arial,sans-serif;color:#5e686b}
      .dagboek-kaart-inhoud{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:12px 12px 0}.dagboek-foto{margin:0;position:relative;min-width:0}.dagboek-foto img{display:block;width:100%;height:190px;object-fit:cover}.dagboek-feit{min-width:0}.dagboek-feit h3,.dagboek-blok h3,.dagboek-vaste-tekst h3{font:bold 11px/1.2 Arial,sans-serif;letter-spacing:1.5px;margin:0 0 7px;color:#3d4b50}.dagboek-vaste-tekst{font-size:15px;line-height:1.45}.dagboek-vaste-tekst p{margin:0 0 9px}.dagboek-vaste-tekst h1,.dagboek-vaste-tekst h2,.dagboek-vaste-tekst h3{font-family:Georgia,'Times New Roman',serif}.dagboek-vaste-tekst img{max-width:100%;height:auto}.dagboek-vaste-tekst .omkaderde-tekst{display:block}
      .dagboek-ervaring,.dagboek-notitie,.dagboek-extra-info{margin:12px;background:#dce8df;padding:10px 12px}.dagboek-ervaring p,.dagboek-notitie p,.dagboek-extra-info p{font-size:15px;margin:0 0 6px}.dagboek-ervaring p:last-child,.dagboek-notitie p:last-child,.dagboek-extra-info p:last-child{margin-bottom:0}.dagboek-notitie{background:#eee8d7}
      .dagboek-extra-trigger{display:flex;align-items:center;gap:10px;background:#dce8df;margin:12px;padding:9px 10px}.dagboek-extra-trigger button{border:1px solid #8ca79a;background:#fff;border-radius:8px;padding:8px 11px;font:700 13px Arial,sans-serif;cursor:pointer}.dagboek-extra-trigger span{font-size:13px;font-style:italic}
      .dagboek-slideshow-dialog{border:0;border-radius:12px;padding:0;width:min(900px,94vw);max-width:900px;background:#fbfaf6;box-shadow:0 20px 60px rgba(0,0,0,.3)}.dagboek-slideshow-dialog::backdrop{background:rgba(0,0,0,.65)}.dagboek-slideshow-head{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid #ddd4ca;font:700 16px Arial,sans-serif}.dagboek-slideshow-head button{border:0;background:transparent;font-size:22px;cursor:pointer}.dagboek-slideshow-body{padding:14px;min-height:180px;display:flex;align-items:center;justify-content:center}.dagboek-slide{width:100%;text-align:center}.dagboek-slide img{max-width:100%;max-height:68vh;width:auto;height:auto;object-fit:contain;margin:4px;vertical-align:middle}.dagboek-slide[hidden]{display:none}.dagboek-slideshow-controls{display:flex;justify-content:center;align-items:center;gap:22px;padding:10px 16px 16px}.dagboek-slideshow-controls button{width:42px;height:42px;border-radius:50%;border:1px solid #9ba9a9;background:#fff;font-size:30px;line-height:1;cursor:pointer}.dagboek-slideshow-controls span{font:600 13px Arial,sans-serif;color:#596467}
      .dagboek-afsluiting{display:flex;gap:12px;align-items:center;border-top:2px solid #26353a;border-bottom:1px solid #c9c2b8;margin:28px 0 18px;padding:13px 4px}.dagboek-afsluiting>span{font-size:28px}.dagboek-afsluiting strong{font:bold 18px Arial,sans-serif;letter-spacing:1.5px}.dagboek-afsluiting p{margin:2px 0 0;font-style:italic;font-size:16px}.dagboek-leeg{text-align:center;padding:30px}.dagboek-footer{text-align:center;padding:15px;font-style:italic;font-size:17px;border-top:1px solid #26353a}
      @media(max-width:760px){html,body{width:100vw !important;min-width:100vw !important;max-width:100vw !important}.dagboek-pagina{width:100vw !important;max-width:100vw !important;min-width:0 !important;margin:0 !important;padding:14px 12px 30px !important}.dagboek-header{padding:16px 12px 17px}.dagboek-header-top{align-items:flex-start}.dagboek-label{letter-spacing:2px;font-size:9px}.dagboek-header h1{font-size:39px}.dagboek-header h2{font-size:22px}.dagboek-hero{grid-template-columns:1fr;gap:10px}.dagboek-hero img{height:230px}.dagboek-bezocht{margin-bottom:14px}.dagboek-bezocht strong{font-size:24px}.dagboek-bezocht em{font-size:15px}.dagboek-grid{grid-template-columns:1fr;gap:14px}.dagboek-kaart-kop h2{font-size:20px}.dagboek-kaart-inhoud{grid-template-columns:1fr;padding:10px 10px 0}.dagboek-foto img{height:auto;max-height:none}.dagboek-feit{padding-top:2px}.dagboek-vaste-tekst{font-size:16px}.dagboek-extra-trigger{margin:10px}.dagboek-slideshow-dialog{width:96vw}.dagboek-slide img{max-height:62vh}}
      @media print{body{background:#fff}.dagboek-pagina{width:auto;padding:10mm}.dagboek-header,.dagboek-bezocht,.dagboek-kaart-kop,.dagboek-ervaring,.dagboek-notitie{-webkit-print-color-adjust:exact;print-color-adjust:exact}.dagboek-grid{gap:12px}.dagboek-kaart{break-inside:avoid}.dagboek-extra-trigger{break-inside:avoid}}
    `;
  }

  function ensureResultsPanel(){
    let panel=byId('reisdagResults');
    if(panel)return panel;

    panel=document.createElement('div');
    panel.id='reisdagResults';
    panel.className='reisdag-results';

    const host=byId('reisdagResultsHost');
    if(host)host.appendChild(panel);
    else{
      const button=byId('reisdagOpenBtn');
      if(button&&button.parentNode)button.parentNode.insertBefore(panel,button.nextSibling);
      else document.body.appendChild(panel);
    }
    return panel;
  }

  let reisdagMapInstance=null;
  let reisdagMapMarkers=[];

  function closeSelectedLocationsMap(){
    const overlay=byId('reisdagMapOverlay');
    if(overlay)overlay.style.display='none';
    reisdagMapMarkers.forEach(m=>{
      try{reisdagMapInstance?.removeLayer(m);}catch(e){}
    });
    reisdagMapMarkers=[];
  }

  function showSelectedLocationsOnMap(dateFrom,dateTo){
    const overlay=byId('reisdagMapOverlay');
    const mapEl=byId('reisdagMap');
    const status=byId('reisdagMapStatus');
    if(!overlay||!mapEl||typeof L==='undefined'){
      alert('De kaart kan niet worden geopend.');
      return;
    }

    const matches=matchesForRange(dateFrom,dateTo);
    const points=matches.map(item=>({item,location:findLocation(item)}))
      .filter(x=>x.location && Number.isFinite(Number(x.location.lat)) && Number.isFinite(Number(x.location.lon)));

    if(!points.length){
      alert('Voor '+rangeLabel(dateFrom,dateTo)+' zijn geen geselecteerde locaties met GPS-coördinaten gevonden.');
      return;
    }

    overlay.style.display='flex';
    const title=byId('reisdagMapTitle');
    if(title)title.textContent='🗺️ Mijn reisdag — '+rangeLabel(dateFrom,dateTo);
    if(status)status.textContent=points.length+' geselecteerde locatie'+(points.length===1?'':'s');

    if(!reisdagMapInstance){
      reisdagMapInstance=L.map(mapEl).setView([points[0].location.lat,points[0].location.lon],13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
        maxZoom:19,
        attribution:'© OpenStreetMap contributors'
      }).addTo(reisdagMapInstance);
    }

    reisdagMapMarkers.forEach(m=>{
      try{reisdagMapInstance.removeLayer(m);}catch(e){}
    });
    reisdagMapMarkers=[];

    const bounds=[];
    points.forEach(({item,location})=>{
      const lat=Number(location.lat),lon=Number(location.lon);
      bounds.push([lat,lon]);
      const marker=L.marker([lat,lon],{
        icon:typeof categoryIcon==='function'
          ? categoryIcon(userLocationCategory(location))
          : undefined
      }).addTo(reisdagMapInstance);
      marker.bindPopup(
        '<div class="marker-popup">'+
        '<div style="font-weight:700;font-size:16px">'+escapeHtml(item.name||location.name||'Onbekende locatie')+'</div>'+
        (location.address?'<div style="margin:3px 0 8px;color:#555">'+escapeHtml(location.address)+'</div>':'')+
        '<div style="margin-top:6px">Bezocht: '+escapeHtml(dateTimePart(item.visitedAt))+'</div>'+
        '</div>'
      );
      reisdagMapMarkers.push(marker);
    });

    if(bounds.length===1){
      reisdagMapInstance.setView(bounds[0],14);
    }else{
      reisdagMapInstance.fitBounds(bounds,{padding:[60,60],maxZoom:14});
    }
    setTimeout(()=>reisdagMapInstance.invalidateSize(),100);
  }

  function showResults(dateFrom,dateTo){
    const panel=ensureResultsPanel();
    panel.style.display='block';
    panel.innerHTML='';

    const title=document.createElement('h4');
    title.textContent='Mijn reisdag — '+rangeLabel(dateFrom,dateTo);
    panel.appendChild(title);

    const matches=matchesForRange(dateFrom,dateTo);

    if(!matches.length){
      const empty=document.createElement('div');
      empty.className='reisdag-empty';
      empty.textContent='Geen bezochte locaties gevonden voor deze datum.';
      panel.appendChild(empty);
      return;
    }

    const reportText=window.reisblikDagverslag?.getRange ? window.reisblikDagverslag.getRange(dateFrom,dateTo) : [];
    if(reportText.length){
      const report=document.createElement('div');
      report.className='reisdag-summary';
      report.style.cssText='background:#f1ead8;border-left:5px solid #a9bfae;padding:12px 14px;margin:10px 0';
      report.innerHTML='<strong>📝 Dagverslag</strong>'+reportText.map(r=>'<div style="margin-top:8px"><b>'+escapeHtml(formatDiaryDate(r.date))+'</b><div style="margin-top:4px">'+escapeHtml(r.text).replace(/\n/g,'<br>')+'</div></div>').join('');
      panel.appendChild(report);
    }

    const intro=document.createElement('div');
    intro.className='reisdag-summary';
    intro.textContent=matches.length+' bezochte locatie'+(matches.length===1?'':'s');
    panel.appendChild(intro);

    const ul=document.createElement('ul');
    matches.forEach(item=>{
      const li=document.createElement('li');
      const when=dateTimePart(item.visitedAt);
      li.textContent=(when?when+' — ':'')+(item.name||'Onbekende locatie')+
        (item.category?' ('+item.category+')':'');
      ul.appendChild(li);
    });
    panel.appendChild(ul);

    const actions=document.createElement('div');
    actions.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin-top:12px';

    const word=document.createElement('button');
    word.id='reisdagWordBtn';
    word.type='button';
    word.textContent='📄 Download Word';
    word.onclick=()=>downloadWord(dateFrom,dateTo);

    const map=document.createElement('button');
    map.id='reisdagMapBtn';
    map.type='button';
    map.textContent='🗺️ Toon op kaart';
    map.onclick=()=>showSelectedLocationsOnMap(dateFrom,dateTo);

    const reis=document.createElement('button');
    reis.id='maak-html-reis';
    reis.type='button';
    reis.textContent='📖 Maak-reis-HTML';
    reis.onclick=()=>generateTravelHtml(dateFrom,dateTo);

    const perDay=document.createElement('button');
    perDay.id='maak-html-per-dag';
    perDay.type='button';
    perDay.textContent='📚 HTML per dag';
    perDay.onclick=()=>generateTravelHtmlPerDay(dateFrom,dateTo);

    const preview=document.createElement('button');
    preview.id='reisdagPreviewBtn';
    preview.type='button';
    preview.textContent='👁️ Toon reisdag';
    preview.onclick=()=>showSelectedDiaryHtml(dateFrom,dateTo);

    actions.appendChild(word);
    actions.appendChild(reis);
    actions.appendChild(perDay);
    actions.appendChild(preview);
    actions.appendChild(map);
    panel.appendChild(actions);
  }

  function openMijnReisdag(){
    const overlay=byId('reisdagOverlay');
    const from=byId('reisdagDateFrom');
    const to=byId('reisdagDateTo');
    if(!overlay||!from||!to)return;
    const savedFrom=localStorage.getItem(storageKey(DATE_FROM_BASE_KEY))||localStorage.getItem(storageKey(DATE_BASE_KEY))||'';
    const savedTo=localStorage.getItem(storageKey(DATE_TO_BASE_KEY))||savedFrom;
    if(savedFrom)from.value=savedFrom;
    if(savedTo)to.value=savedTo;
    overlay.style.display='flex';
    setTimeout(()=>from.focus(),0);
  }

  function closeMijnReisdag(){
    const overlay=byId('reisdagOverlay');
    if(overlay)overlay.style.display='none';
  }

  function chooseMijnReisdag(){
    const from=byId('reisdagDateFrom');
    const to=byId('reisdagDateTo');
    const status=byId('reisdagStatus');
    if(!from||!from.value||!to||!to.value){
      if(status)status.textContent='Kies zowel een datum van als een datum t/m.';
      return;
    }
    if(to.value<from.value){
      if(status)status.textContent='Datum t/m kan niet vóór Datum van liggen.';
      return;
    }
    localStorage.setItem(storageKey(DATE_FROM_BASE_KEY),from.value);
    localStorage.setItem(storageKey(DATE_TO_BASE_KEY),to.value);
    // Keep the old single-date key compatible with existing app state.
    localStorage.setItem(storageKey(DATE_BASE_KEY),from.value);
    if(status)status.textContent='Gekozen periode: '+rangeLabel(from.value,to.value);
    showResults(from.value,to.value);
    closeMijnReisdag();
  }

  function refreshForVacation(){
    const from=localStorage.getItem(storageKey(DATE_FROM_BASE_KEY))||localStorage.getItem(storageKey(DATE_BASE_KEY))||'';
    const to=localStorage.getItem(storageKey(DATE_TO_BASE_KEY))||from;
    if(from&&to)showResults(from,to);
    else { const box=byId('reisdagResults'); if(box) box.innerHTML=''; }
  }

  function buildDocxHtml(title, sections){
    const safeTitle=escapeHtml(title||'Reisdag');
    const cleanSections=(sections||[]).map(x=>({
      heading:String(x?.heading||'').trim(),
      body:Array.isArray(x?.body)?x.body.filter(Boolean):[]
    })).filter(x=>x.heading||x.body.length);

    const total=cleanSections.length;
    const cut1=Math.ceil(total/3);
    const cut2=Math.ceil((total-cut1)/2)+cut1;
    const columns=[cleanSections.slice(0,cut1),cleanSections.slice(cut1,cut2),cleanSections.slice(cut2)];

    const renderSection=(section)=>{
      const heading=section.heading ? '<h2>'+section.heading+'</h2>\n' : '';
      const body=section.body.join('\n');
      return '    '+heading+'    <div class="tekst-normaal">\n'+body+'\n    </div>';
    };

    const columnHtml=(items,columnNumber)=>items.map(renderSection).join('\n')+
      (columnNumber===1 ? reisSlideshowTriggerHtml('ochtend-middag','Overige foto\'s','FOTO-PLAATS — slideshow ochtend/middag') : '')+
      (columnNumber===3 ? reisSlideshowTriggerHtml('middag-avond','Overige foto\'s','FOTO-PLAATS — slideshow middag/avond') : '');

    const html=`<!DOCTYPE html>\n<html lang="nl">\n<head>\n    <meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n    <title>${safeTitle}</title>\n    <style>\n${reisTravelCss()}\n    </style>\n</head>\n<body>\n\n<div class="hoofdtekst">\n    <div class="reis-foto-plaats reis-hoofd-foto"> <img src="./foto-plaats.jpg"> </div>\n    <div class="reis-foto-plaats reis-hoofd-foto"> <img src="./foto-plaats.jpg"> </div>\n    <h1>${safeTitle}</h1>\n</div>\n\n<div class="top-fotobalk">\n    <div class="reis-foto-plaats reis-foto-top"> <img src="./foto-plaats.jpg"> </div>\n    <div class="reis-foto-plaats reis-foto-top"><img src="./foto-plaats.jpg"> </div>\n    <div class="reis-foto-plaats reis-foto-top"><img src="./foto-plaats.jpg" style="object-position: top"> </div>\n</div>\n<figcaption><span class="fotobalk-caption">\n    foto's voor de reisdag\n</span></figcaption>\n\n<div class="indeling-kolommen">\n    <div class="reis-kolom">\n${columnHtml(columns[0],1)}\n    </div>\n\n    <div class="reis-kolom">\n${columnHtml(columns[1],2)}\n    </div>\n\n    <div class="reis-kolom">\n${columnHtml(columns[2],3)}\n    </div>\n</div>\n\n<div class="voettekst">\n    <ul>\n        <li>Reisdagboek — reisverhaal uit DOCX</li>\n        <li>Foto-plaatsen kunnen later met eigen foto's worden gevuld</li>\n    </ul>\n${reisNavigationHtml()}\n    <div style="display: flex; justify-content: center; margin-top: 10px;">\n        <button type="button" onclick="window.scrollTo({top:0,behavior:'smooth'})">Naar boven</button>\n    </div>\n</div>\n\n${reisDemoSlideshowHtml()}\n\n${reisSlideshowScript()}\n</body>\n</html>`;

    const filename=safeTitle.replace(/<[^>]+>/g,'').replace(/[^a-z0-9À-ÿ]+/gi,'_').replace(/^_|_$/g,'')+'_HTML-per-dag.html';
    return {html,filename};
  }

  // Publieke bouwfunctie voor de aparte vakantie-archiefmodule.
  // Dit hoort in de app zelf te staan, niet in de HTML die door
  // reisSlideshowScript() wordt gegenereerd.
  window.reisblikMijnReisdag = {
    buildActiveVacationDiaryHtml,
    buildDocxHtml
  };

  document.addEventListener('DOMContentLoaded',function(){
    const open=byId('reisdagOpenBtn');
    const cancel=byId('reisdagCancelBtn');
    const choose=byId('reisdagChooseBtn');
    if(open)open.addEventListener('click',openMijnReisdag);
    if(cancel)cancel.addEventListener('click',closeMijnReisdag);
    if(choose)choose.addEventListener('click',chooseMijnReisdag);

    const mapClose=byId('reisdagMapCloseBtn');
    if(mapClose)mapClose.addEventListener('click',closeSelectedLocationsMap);
    const mapOverlay=byId('reisdagMapOverlay');
    if(mapOverlay)mapOverlay.addEventListener('click',function(e){
      if(e.target===mapOverlay)closeSelectedLocationsMap();
    });
    document.addEventListener('keydown',function(e){
      if(e.key==='Escape' && byId('reisdagMapOverlay')?.style.display==='flex')closeSelectedLocationsMap();
    });

    const savedFrom=localStorage.getItem(storageKey(DATE_FROM_BASE_KEY))||localStorage.getItem(storageKey(DATE_BASE_KEY));
    const savedTo=localStorage.getItem(storageKey(DATE_TO_BASE_KEY))||savedFrom;
    if(savedFrom&&savedTo)showResults(savedFrom,savedTo);
    if(window.reisblikVakantie?.onVakantieGewijzigd) window.reisblikVakantie.onVakantieGewijzigd(refreshForVacation);
  });
})();
