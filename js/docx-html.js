/* Reisblik 9.9.51 — DOCX naar HTML-per-dag converter.
   DOCX bevat bewust letterlijke HTML-tags; die mogen NIET worden ge-escaped. */
(function(){
  function u16(v,o){return v[o] | (v[o+1]<<8);}
  function u32(v,o){return (v[o] | (v[o+1]<<8) | (v[o+2]<<16) | (v[o+3]<<24)) >>> 0;}
  async function inflateRaw(data){
    if(typeof DecompressionStream==='undefined') throw new Error('Deze browser ondersteunt geen ingebouwde DOCX-uitpakfunctie.');
    const ds=new DecompressionStream('deflate-raw');
    return new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(ds)).arrayBuffer());
  }
  async function unzipEntry(buf,name){
    const v=new Uint8Array(buf); let eocd=-1;
    for(let i=v.length-22;i>=Math.max(0,v.length-65558);i--){if(u32(v,i)===0x06054b50){eocd=i;break;}}
    if(eocd<0) throw new Error('Geen geldig DOCX/ZIP-bestand gevonden.');
    const total=u16(v,eocd+10), cdOff=u32(v,eocd+16); let pos=cdOff;
    for(let n=0;n<total;n++){
      if(u32(v,pos)!==0x02014b50) throw new Error('Ongeldige ZIP-directory.');
      const method=u16(v,pos+10), csize=u32(v,pos+20), nlen=u16(v,pos+28), xlen=u16(v,pos+30), clen=u16(v,pos+32);
      const fname=new TextDecoder().decode(v.slice(pos+46,pos+46+nlen)); const localOff=u32(v,pos+42);
      if(fname===name){
        const ln=u16(v,localOff+26), lx=u16(v,localOff+28), start=localOff+30+ln+lx, comp=v.slice(start,start+csize);
        if(method===0)return comp; if(method===8)return await inflateRaw(comp);
        throw new Error('Onbekende compressiemethode in DOCX.');
      }
      pos+=46+nlen+xlen+clen;
    }
    throw new Error('document.xml ontbreekt in het DOCX-bestand.');
  }
  function escapeText(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  function rawParagraph(p){
    return [...p.getElementsByTagNameNS('*','t')].map(t=>t.textContent||'').join('').trim();
  }
  function stripHtml(s){const d=document.createElement('div');d.innerHTML=s||'';return (d.textContent||'').trim();}
  function tagContent(line,tag){
    const m=String(line||'').match(new RegExp('^<'+tag+'\\b[^>]*>([\\s\\S]*?)</'+tag+'>$','i'));
    return m?m[1].trim():null;
  }
  function isTag(line,tag){return new RegExp('^<'+tag+'\\b[^>]*>','i').test(String(line||''));}

  function parseSections(lines){
    const first = lines.findIndex(Boolean);
    const titleLine = first>=0 ? lines[first] : '';
    const title = tagContent(titleLine,'h2') || titleLine;
    const sections=[]; let current=null; let pendingMeta='';
    for(let i=first+1;i<lines.length;i++){
      const line=lines[i].trim(); if(!line) continue;
      const h2=tagContent(line,'h2');
      if(h2!==null){ current={heading:stripHtml(h2),items:[]}; sections.push(current); continue; }
      const h3=tagContent(line,'h3');
      if(h3!==null && /^Lees meer:/i.test(stripHtml(h3))){
        const body=[]; let j=i+1;
        if(lines[j] && /^<div\s+class=["']lees-meer["']\s*>$/i.test(lines[j].trim())){
          j++;
          while(j<lines.length && !/^<\/div>$/i.test(lines[j].trim())){ if(lines[j].trim()) body.push(lines[j].trim()); j++; }
          i=j;
          if(current) current.items.push('<details class="lees-meer"><summary>'+escapeText(stripHtml(h3))+'</summary><div class="lees-meer-inhoud">'+body.join('\n')+'</div></details>');
          continue;
        }
      }
      if(/^<div\s+class=["']tekst-normaal["']\s*>$/i.test(line) || /^<\/div>$/i.test(line)) continue;
      if(!current){ current={heading:'',items:[]}; sections.push(current); }
      if(!pendingMeta && /^<p[ >]/i.test(line) && /kilometer|\d{1,2}[-/]\d{1,2}[-/]\d{4}/i.test(stripHtml(line))) pendingMeta=line;
      else current.items.push(line);
    }
    if(!sections.length) sections.push({heading:'',items:[]});
    return {title:stripHtml(title),meta:pendingMeta,sections};
  }

  function sectionHtml(section){
    // Exacte fotoplaats-structuur uit REISBLIK_HTML_SKELET_9.8.19.html.
    // De tekst uit het DOCX blijft verder ongewijzigd.
    let out='<section class="tekst-normaal">';
    if(section.heading) out+='<h2>'+escapeText(section.heading)+'</h2>\n';
    out+='<img src="./foto-plaats.jpg"\n'
      +'     height="300"\n'
      +'     width="100%"\n'
      +'     style="object-fit: cover;"\n'
      +'     alt="FOTO-PLAATS — volledige kolom"\n'
      +'     data-foto-plaats="volledige-kolom">\n';
    out+='<div style="float: right; width: 40%; margin-left: 20px;">\n'
      +'  <img src="./Ifoto-plaats.jpg"\n'
      +'       width="100%"\n'
      +'       alt="FOTO-PLAATS — binnen de tekst"\n'
      +'       data-foto-plaats="binnen-tekst">\n'
      +'  <div class="foto-onderschrift">\n'
      +'      onderschrift van de foto\n'
      +'  </div>\n'
      +'</div>\n';
    out+=section.items.join('\n')+'\n</section>';
    return out;
  }

  async function convertDocx(file){
    const xmlBytes=await unzipEntry(await file.arrayBuffer(),'word/document.xml');
    const doc=new DOMParser().parseFromString(new TextDecoder('utf-8').decode(xmlBytes),'application/xml');
    if(doc.querySelector('parsererror')) throw new Error('Word-document kon niet worden gelezen.');
    const lines=[...doc.getElementsByTagNameNS('*','p')].map(rawParagraph);
    if(!lines.some(Boolean)) throw new Error('Er is geen tekst in het DOCX gevonden.');
    const parsed=parseSections(lines);

    const skeletonUrl='./REISBLIK_HTML_SKELET_9.8.19.html';
    const response=await fetch(skeletonUrl,{cache:'no-store'});
    if(!response.ok) throw new Error('Het Reisblik HTML-skelet kon niet worden geladen.');
    const skeleton=await response.text();
    const parser=new DOMParser();
    const outDoc=parser.parseFromString(skeleton,'text/html');

    outDoc.title=parsed.title||'Reisblik';
    const h1=outDoc.querySelector('.hoofdtekst h1'); if(h1) h1.textContent=parsed.title||'Reisblik';
    const h2date=outDoc.querySelector('.hoofdtekst h2'); if(h2date) h2date.innerHTML=parsed.meta||'<i></i>';

    const columns=[...outDoc.querySelectorAll('.indeling-kolommen > .reis-kolom')];
    if(!columns.length) throw new Error('Het Reisblik HTML-skelet bevat geen kolommen.');

    // Alleen de inhoud van de tekstkolommen vervangen; fotobalk, slideshows,
    // navigatie en overige Reisblik-opmaak uit het skelet blijven intact.
    columns.forEach(col=>{
      const blocks=[...col.children];
      blocks.forEach(node=>{
        if(node.id==='reisLocationBlock' || node.classList.contains('tekst-normaal')) node.remove();
      });
    });

    const count=parsed.sections.length;
    const perCol=Math.ceil(count/columns.length);
    parsed.sections.forEach((section,index)=>{
      const colIndex=Math.min(columns.length-1,Math.floor(index/perCol));
      const holder=outDoc.createElement('div');
      holder.innerHTML=sectionHtml(section);
      const sectionNode=holder.firstElementChild;

      // De slideshow blijft uit het skelet komen, maar staat onder de tekstblokken.
      // Daarom plaatsen we ieder nieuw tekstblok vóór de bestaande slideshow.
      const slideshow=columns[colIndex].querySelector('.reis-slideshow-card');
      if(slideshow) columns[colIndex].insertBefore(sectionNode,slideshow);
      else columns[colIndex].appendChild(sectionNode);
    });

    const distance=parsed.meta ? stripHtml(parsed.meta) : 'Reisdag';
    const footerLi=outDoc.querySelector('.voettekst ul li:first-child'); if(footerLi) footerLi.textContent=distance;
    const links=[...outDoc.querySelectorAll('.voettekst a')];
    if(links[0]) links[0].href='VORIGE-PAGINA.html';
    if(links[1]) links[1].href='VOLGENDE-PAGINA.html';

    return {
      html:'<!DOCTYPE html>\n'+outDoc.documentElement.outerHTML,
      filename:(parsed.title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'reisdag')+'.html'
    };
  }

  let selectedFile=null;
  window.reisblikDocxSelect=function(input){
    selectedFile=input.files&&input.files[0]?input.files[0]:null;
    const btn=document.getElementById('docxHtmlDagBtn'),status=document.getElementById('docxFileStatus');
    if(btn)btn.disabled=!selectedFile;
    if(status)status.textContent=selectedFile?('Gekozen: '+selectedFile.name):'';
  };
  window.reisblikDocxMakeHtml=async function(){
    if(!selectedFile)return;
    const btn=document.getElementById('docxHtmlDagBtn'); if(btn)btn.disabled=true;
    try{
      const result=await convertDocx(selectedFile);
      const url=URL.createObjectURL(new Blob([result.html],{type:'text/html;charset=utf-8'}));
      const a=document.createElement('a');a.href=url;a.download=result.filename;document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
      alert('HTML is aangemaakt.');
    }catch(e){console.error(e);alert('DOCX omzetten is niet gelukt:\n\n'+e.message);}
    finally{if(btn)btn.disabled=!selectedFile;}
  };
  document.addEventListener('DOMContentLoaded',function(){
    const input=document.getElementById('docxFileInput'),btn=document.getElementById('docxHtmlDagBtn');
    if(input)input.addEventListener('change',()=>window.reisblikDocxSelect(input));
    if(btn)btn.addEventListener('click',()=>window.reisblikDocxMakeHtml());
  });
})();
