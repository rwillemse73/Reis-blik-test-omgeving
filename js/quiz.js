/* Reisblik 9.9.31 — Reisquiz v7
   Bron: de inhoud van de locatie-HTML's die in de geladen locaties.json staan.
   De locaties.json wordt alleen gebruikt om de juiste HTML-bestanden te vinden. */
(function(){
  'use strict';

  const CONFIG = {
    questionCount: 10,
    answersPerQuestion: 4,
    maxQuestionsPerLocation: 2,
    maxFactsPerLocation: 10,
    maxAnswerLength: 150,
    minFactLength: 45,
    minDistractorLength: 35
  };

  // Technische velden/onderdelen die geen bron voor quizvragen mogen zijn.
  const BLOCKED_TEXT = [
    'gps','latitude','longitude','lat','lon','kaart','route','bron','bronnen',
    'copyright','privacy','cookie','menu','navigatie','zoek','afstand','versie',
    'type','categorie','id','html','bestand','url','link','adres','postcode'
  ];

  const TOPIC_WORDS = {
    landschap:['landschap','omgeving','terrein','hoogteverschil','stuwdam','gebied','dal','helling','vallei','duin','polder'],
    natuur:['natuur','bos','heide','park','tuin','rivier','berg','meer','water','flora','fauna','plant','dier','leefgebied'],
    archeologie:['archeologie','archeologisch','grafheuvel','grafheuvels','raatakker','raatakkers','opgraving','prehistorie','romeinen','bataven'],
    gebouw:['gebouw','kasteel','kerk','huis','buitenplaats','landgoed','toren','monument','ruïne','fort','boerderij','molen'],
    persoon:['persoon','personen','bewoner','bewoners','eigenaar','eigenaren','stichter','stichters','zoon','dochter','familie','graaf','baron','hertog','koning'],
    geschiedenis:['geschiedenis','historie','historisch','verleden','oorlog','bombardement','strijd','beleg','verwoesting','middeleeuwen','eeuw'],
    cultuur:['cultuur','kunst','traditie','legende','verhaal','religie'],
    bijzonder:['bijzonder','bijzonderheid','wetenswaardigheid','kenmerk','opvallend']
  };

  let locations=[];
  let questions=[];
  let current=0;
  let score=0;
  let answered=false;

  function esc(value){
    return String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  }

  function clean(value){
    return String(value ?? '')
      .replace(/<script[\s\S]*?<\/script>/gi,' ')
      .replace(/<style[\s\S]*?<\/style>/gi,' ')
      .replace(/\s+/g,' ')
      .trim();
  }

  function normalize(value){
    return clean(value).toLowerCase().replace(/[^a-z0-9à-ÿ]+/gi,' ').trim();
  }

  function isBlockedHeading(heading){
    const h=normalize(heading);
    return BLOCKED_TEXT.some(x=>h===x || h.includes(x));
  }

  function roots(){
    const ctx=window.reisblikVakantie;
    if(!ctx)return [];
    const base=ctx.getActieveVakantieBasePath ? String(ctx.getActieveVakantieBasePath()||'').replace(/^\/+|\/+$/g,'') : '';
    const parts=ctx.getActieveVakantieOnderdelen ? (ctx.getActieveVakantieOnderdelen()||[]) : [];
    const selected=ctx.getGeselecteerdeOnderdeelIds ? (ctx.getGeselecteerdeOnderdeelIds()||[]) : [];
    if(!parts.length)return [base].filter(Boolean);
    const wanted=new Set(selected.map(String));
    return parts.filter(p=>wanted.has(String(p.id))).map(p=>{
      const pp=String(p.path||p.id||'').replace(/^\/+|\/+$/g,'');
      return [base,pp].filter(Boolean).join('/');
    });
  }

  function activeName(){
    const v=window.reisblikVakantie?.getActieveVakantie?.();
    return v?.naam || document.getElementById('vakantieSelect')?.selectedOptions?.[0]?.textContent || 'actieve vakantie';
  }

  function locationName(loc){
    return clean(loc.naam||loc.name||loc.titel||loc.title||'Deze locatie') || 'Deze locatie';
  }

  // Bepaal eerst wat voor soort onderwerp de locatie zelf is. Dit voorkomt
  // bijvoorbeeld dat een feit over de ballingschap van een persoon als
  // antwoord wordt gebruikt bij een vraag over een huis of kasteel.
  const LOCATION_ENTITY_WORDS = {
    gebouw:['huis','kasteel','kerk','buitenplaats','landgoed','toren','monument','ruïne','fort','boerderij','molen','paleis','slot','villa','station','brug','poort'],
    natuur:['park','bos','heide','meer','rivier','berg','duin','polder','natuurgebied','reservaat'],
    landschap:['gebied','vallei','dorp','landschap','landstreek'],
    persoon:['koning','koningin','hertog','graaf','baron','jhr','jhr.','mevrouw','meneer']
  };

  const PERSON_CONTENT_RE = /\b(ballingschap|ballingschappen|adjudant|huwelijk|getrouwd|trouwde|geboren|overleden|overleed|stierf|verhuisde|verhuizing|zijn carrière|haar carrière|zijn leven|haar leven|zijn jeugd|haar jeugd|zijn vrouw|haar man|zijn echtgenote|haar echtgenoot|zijn zoon|haar zoon|zijn dochter|haar dochter|zijn vader|haar vader|zijn moeder|haar moeder)\b/i;

  function locationEntityType(loc){
    const n=normalize(locationName(loc));
    for(const [type,words] of Object.entries(LOCATION_ENTITY_WORDS)){
      if(words.some(w=>n===w || n.includes(' '+w+' ') || n.startsWith(w+' ') || n.endsWith(' '+w))) return type;
    }
    return '';
  }

  function factFitsLocation(f){
    const entity=locationEntityType(f.location);
    const text=clean(f.fullText||f.text);

    // Een persoonsspecifiek feit hoort niet bij een gebouwvraag wanneer de
    // tekst alleen over het leven/vertrek/ballingschap van iemand gaat.
    if(entity==='gebouw' && (f.topic==='persoon' || PERSON_CONTENT_RE.test(text))) return false;

    // Voor natuur- en landschapslocaties geldt dezelfde bescherming tegen
    // losse biografische feiten.
    if((entity==='natuur' || entity==='landschap') && f.topic==='persoon') return false;

    return true;
  }

  function htmlPath(root,loc){
    const file=clean(loc.html||loc.content||loc.htmlFile||loc.bestand||loc.file||'').replace(/^\/+/, '');
    const cleanRoot=clean(root).replace(/^\/+|\/+$/g,'');
    if(!file)return '';
    if(/^https?:\/\//i.test(file))return file;

    // locaties.json kan zowel alleen de bestandsnaam bevatten als een volledig
    // projectpad. Voorkom dat een volledig pad twee keer aan de root wordt
    // vastgeplakt.
    if(cleanRoot && (file===cleanRoot || file.startsWith(cleanRoot+'/'))) return file;
    if(file.startsWith('locaties/')) return [cleanRoot,file].filter(Boolean).join('/');
    if(file.includes('/')) return file;
    return [cleanRoot,'locaties',file].filter(Boolean).join('/');
  }

  async function loadLocations(){
    const rs=roots();
    const all=[];
    for(const root of rs){
      const url=[root,'locaties','locaties.json'].filter(Boolean).join('/')+'?quiz='+Date.now();
      try{
        const r=await fetch(url,{cache:'no-store'});
        if(!r.ok)continue;
        const data=await r.json();
        const arr=Array.isArray(data)?data:(Array.isArray(data.locaties)?data.locaties:(Array.isArray(data.locations)?data.locations:[]));
        arr.forEach((x,i)=>all.push({...x,__quizRoot:root,__quizIndex:i}));
      }catch(e){
        console.warn('[Reisblik Quiz] locaties.json niet geladen:',url,e);
      }
    }
    return all;
  }

  const UI_MARKERS = [
    'in één oogopslag','tappe','type','recreatie','persoon','wist je dat',
    'geen afzonderlijke persoon gekoppeld','terug','volgende','menu','zoek',
    'toon op kaart','lees meer','download','deel deze locatie'
  ];

  // Verwijzingen, route-/bronvermeldingen en paginatitels zijn geen inhoudelijke
  // quizantwoorden. Vooral regels als "Nivon Trekvogelpad etappe 12; ..."
  // kwamen anders als antwoordoptie terecht. We filteren ze alleen wanneer ze
  // duidelijk als label/verwijzing zijn opgebouwd; een normale zin waarin een
  // organisatie wordt genoemd blijft dus toegestaan.
  const SOURCE_LABEL_RE = /^(?:nivon|staatsbosbeheer|landal|natuurmonumenten|wandelnet|routenetwerk|wandelzoekpagina|visit(?:\s+|-)\w+|openstreetmap|wikipedia|rijksmuseum|monumentenregister)\b/i;

  function looksLikeSourceLabel(s){
    const text=clean(s);
    if(SOURCE_LABEL_RE.test(text) && /[;|]/.test(text))return true;
    if(/^(?:bron|bronvermelding|bronverwijzing|lees meer|meer informatie|route|wandeling|etappe)\s*[:\-]/i.test(text))return true;
    // Korte titelachtige regels met meerdere labels, maar zonder echte zin.
    if(text.length<120 && !/[.!?]$/.test(text) && /\s[–—-]\s/.test(text) && /[;|]/.test(text))return true;
    return false;
  }

  function looksLikeUiText(s){
    const lower=s.toLowerCase();
    const markerHits=UI_MARKERS.filter(x=>lower.includes(x)).length;
    const camelHits=(s.match(/[a-zà-ÿ][A-ZÀ-Ý]/g)||[]).length;
    const separators=(s.match(/[|•→←]/g)||[]).length;
    return markerHits>=2 || camelHits>=2 || separators>=2;
  }

  function allowedText(text){
    const s=clean(text);
    if(s.length<CONFIG.minFactLength || s.length>360)return false;
    if(/^https?:\/\//i.test(s))return false;
    if(looksLikeUiText(s))return false;
    if(looksLikeSourceLabel(s))return false;
    if(/^(gps|latitude|longitude|adres|bron|bronnen|type|categorie|route|afstand)\s*[:]/i.test(s))return false;
    if(/^(in één oogopslag|wist je dat|type|recreatie|persoon)\b/i.test(s))return false;
    return true;
  }

  function splitSentences(text){
    return clean(text)
      .split(/(?<=[.!?])\s+(?=[A-ZÀ-ÖØ-Ý0-9])/u)
      .map(clean)
      .filter(allowedText);
  }

  // Een losse zin kan inhoudelijk correct zijn maar toch onduidelijk worden
  // wanneer een verwijzing als 'hij', 'ze', 'zijn' of 'die brieven' uit de
  // voorafgaande zin wordt gehaald. In dat geval nemen we de voorafgaande
  // context mee in het quizfeit. Zo blijft het antwoord zelfstandig leesbaar.
  const CONTEXT_RE = /\b(hij|hem|zijn|zij|ze|haar|daarna|daarvan|daarmee|toen|hier)\b|\b(die|deze)\s+(brieven|brief|man|vrouw|persoon|familie|echtpaar|gebouwen|werken|jaren|periode|gebeurtenissen|briefwisseling|dagboeken|dagboek|gebeurtenis)\b/i;

  // Antwoorden moeten zelfstandig leesbaar zijn. In de praktijk bleek dat
  // ook antwoorden die niet met een persoonsverwijzing beginnen nog steeds
  // onduidelijk kunnen zijn, bijvoorbeeld: 'Tijdens zijn verblijf bleef hij...'.
  // Daarom worden persoonsverwijzingen in 9.9.31 op antwoordniveau streng
  // uitgesloten. Dit geldt voor correcte antwoorden én afleiders.
  //
  // We kiezen hier bewust voor kwaliteit boven kwantiteit: een goed feit dat
  // alleen met een voornaamwoord begrijpelijk is, wordt liever overgeslagen
  // dan als onduidelijk quizantwoord getoond.
  const PERSON_PRONOUN_RE = /\b(hij|hem|zij|ze|haar|zijn)\b/i;

  function hasUnresolvedPronoun(text){
    return PERSON_PRONOUN_RE.test(clean(text));
  }

  function needsContext(sentence){
    return CONTEXT_RE.test(clean(sentence));
  }

  function contextualSentence(sentences,index,history=[]){
    const sentence=clean(sentences[index]);
    if(!needsContext(sentence))return sentence;

    // Meestal staat de antecedent direct in de vorige zin. Gebruik ook de
    // vorige zin uit het voorgaande tekstblok wanneer een verwijzing over een
    // <p>-grens heen loopt.
    const combined=[...history,...sentences].map(clean).filter(Boolean);
    const currentIndex=history.length+index;
    if(currentIndex===0)return null;

    let start=currentIndex-1;
    if(needsContext(combined[start]) && start>0)start=currentIndex-2;
    const context=combined.slice(start,currentIndex).filter(Boolean);
    if(!context.length)return null;
    // Als ook de gekozen voorgeschiedenis nog met een verwijzing begint,
    // is de antecedent waarschijnlijk niet beschikbaar in dit tekstblok.
    // Laat zo'n zin vallen in plaats van een onduidelijk quizantwoord te maken.
    if(needsContext(sentence) && context.length===0)return null;
    return `${context.join(' ')} ${sentence}`;
  }

  function topicFor(heading,text){
    const h=normalize(heading);
    const t=normalize(text);
    // Een kopje is sterker bewijs voor het onderwerp dan een toevallig woord in de zin.
    const headingScores=Object.entries(TOPIC_WORDS).map(([topic,words])=>[
      topic, words.reduce((n,w)=>n+(h.includes(w)?1:0),0)
    ]).sort((a,b)=>b[1]-a[1]);
    if(headingScores[0]?.[1]>0)return headingScores[0][0];
    const textScores=Object.entries(TOPIC_WORDS).map(([topic,words])=>[
      topic, words.reduce((n,w)=>n+(t.includes(w)?1:0),0)
    ]).sort((a,b)=>b[1]-a[1]);
    return textScores[0]?.[1]>0 ? textScores[0][0] : 'bijzonder';
  }

  function answerText(f){
    let s=clean(f.fullText);
    const h=clean(f.heading);
    if(h && h.length<100){
      const re=new RegExp('^'+h.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\s*:\s*','i');
      s=s.replace(re,'');
    }
    s=s.replace(/^(flora en fauna|landschap en geologie|archeologie|geschiedenis|cultuur|kunst|architectuur|bijzonderheden|bijzonderheid)\s*:\s*/i,'');
    return shorten(s);
  }

  function shorten(text){
    let s=clean(text);
    if(s.length<=CONFIG.maxAnswerLength)return s;
    const cut=s.slice(0,CONFIG.maxAnswerLength+1);
    const pos=Math.max(cut.lastIndexOf('. '),cut.lastIndexOf(', '),cut.lastIndexOf('; '),cut.lastIndexOf(' '));
    return (pos>70?cut.slice(0,pos):cut.slice(0,CONFIG.maxAnswerLength)).trim()+ '…';
  }

  function parseHtml(html,loc){
    const parser=new DOMParser();
    const doc=parser.parseFromString(html,'text/html');
    doc.querySelectorAll('script,style,noscript,nav,header,footer,form,button,input,select,textarea,[aria-hidden="true"]').forEach(el=>el.remove());

    const facts=[];
    let heading=locationName(loc);
    let recentSentences=[];
    const root=doc.querySelector('main, article, .locatie-inhoud, .content, .container') || doc.body;

    root.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,blockquote').forEach(el=>{
      const tag=el.tagName.toLowerCase();
      const txt=clean(el.textContent);
      if(!txt || isBlockedHeading(txt))return;
      if(/^h[1-6]$/.test(tag)){
        if(txt.length<=120)heading=txt;
        recentSentences=[];
        return;
      }
      if(!allowedText(txt))return;
      const sentences=splitSentences(txt);
      sentences.forEach((sentence,index)=>{
        const fullText=contextualSentence(sentences,index,recentSentences);
        if(!fullText)return;
        const fact=shorten(fullText);
        if(!fact || fact.length<CONFIG.minFactLength)return;
        const signature=normalize(fullText);
        if(facts.some(f=>f.signature===signature))return;
        const topic=topicFor(heading,sentence);
        const candidate={text:fact,fullText,heading,topic,location:loc,signature};
        // Geen antwoorden met onopgeloste persoonsverwijzingen. Als de naam
        // niet in het antwoord zelf staat, slaan we het feit over in plaats
        // van de speler te laten raden wie 'hij' of 'zij' is.
        if(hasUnresolvedPronoun(fact))return;
        if(!factFitsLocation(candidate))return;
        facts.push(candidate);
      });
      recentSentences=[...recentSentences,...sentences].slice(-2);
    });

    // Als een pagina nauwelijks paragrafen gebruikt, probeer dan de tekst van de hoofdcontainer.
    if(facts.length===0){
      const fallback=clean(root.textContent);
      splitSentences(fallback).slice(0,CONFIG.maxFactsPerLocation).forEach(sentence=>{
        const candidate={text:shorten(sentence),fullText:sentence,heading,topic:topicFor(heading,sentence),location:loc,signature:normalize(sentence)};
        if(hasUnresolvedPronoun(candidate.text))return;
        if(factFitsLocation(candidate))facts.push(candidate);
      });
    }

    return facts.slice(0,CONFIG.maxFactsPerLocation);
  }

  async function loadHtmlFacts(locs){
    const all=[];
    for(const loc of locs){
      const url=htmlPath(loc.__quizRoot,loc);
      if(!url)continue;
      try{
        const r=await fetch(url+'?quiz='+Date.now(),{cache:'no-store'});
        if(!r.ok)continue;
        const html=await r.text();
        const facts=parseHtml(html,loc);
        all.push(...facts);
      }catch(e){
        console.warn('[Reisblik Quiz] locatie-HTML niet geladen:',url,e);
      }
    }
    return all;
  }

  function extractYears(text){
    return [...String(text).matchAll(/\b(1[0-9]{3}|20[0-2][0-9])\b/g)].map(m=>m[1]);
  }

  function uniqueDistractors(f, facts, count=3){
    const topic=f.topic;
    const candidates=facts
      .filter(x=>x!==f && x.location!==f.location)
      .filter(x=>x.topic===topic)
      .filter(x=>x.text.length>=CONFIG.minDistractorLength)
      .map(x=>({text:answerText(x), fact:x}))
      .filter(x=>!hasUnresolvedPronoun(x.text))
      .filter(x=>x.text && normalize(x.text)!==normalize(answerText(f)));

    const seen=new Set();
    const result=[];
    for(const item of candidates.sort(()=>Math.random()-0.5)){
      const sig=normalize(item.text);
      if(seen.has(sig))continue;
      seen.add(sig);
      result.push(item);
      if(result.length>=count)break;
    }
    return result;
  }

  function questionFromFact(f){
    const name=locationName(f.location);
    switch(f.topic){
      case 'landschap': return `Wat kenmerkt het landschap van de omgeving van ${name}?`;
      case 'natuur': return `Wat wordt beschreven over de natuur rond ${name}?`;
      case 'archeologie': return `Wat is er archeologisch bijzonder aan de omgeving van ${name}?`;
      case 'gebouw': return `Welke bijzonderheid wordt genoemd over ${name}?`;
      case 'persoon': return `Welke persoon of familie wordt in verband gebracht met ${name}?`;
      case 'geschiedenis': return `Wat gebeurde er in de geschiedenis van ${name}?`;
      case 'cultuur': return `Welke culturele of historische bijzonderheid hoort bij ${name}?`;
      default: return `Welke bijzonderheid wordt genoemd over ${name}?`;
    }
  }

  function statementQuestion(f,allFacts){
    const distractors=uniqueDistractors(f,allFacts,3);
    if(distractors.length<3)return null;
    const correct=answerText(f);
    const answers=[correct,...distractors.map(x=>x.text)];
    if(new Set(answers.map(normalize)).size<4)return null;
    answers.sort(()=>Math.random()-0.5);
    return {
      question:questionFromFact(f),
      answers,
      correct:answers.indexOf(correct),
      explanation:answerText(f),
      location:locationName(f.location),
      sourceTopic:f.topic,
      signature:'content|'+f.signature
    };
  }

  function makeQuestions(facts){
    const candidates=facts.slice().sort(()=>Math.random()-0.5);
    const topicUsed=new Map();
    const result=[];
    const perLoc=new Map();
    const used=new Set();

    // Eerst echte jaartallen proberen; daarna inhoudelijke beweringen.
    for(const f of candidates){
      if(result.length>=CONFIG.questionCount)break;
      const key=String(f.location.id||f.location.__quizIndex||locationName(f.location));
      const count=perLoc.get(key)||0;
      if(count>=CONFIG.maxQuestionsPerLocation)continue;
      const topicCount=topicUsed.get(f.topic)||0;
      if(topicCount>=3)continue;

      let q=statementQuestion(f,facts);
      if(!q || used.has(q.signature))continue;

      used.add(q.signature);
      result.push(q);
      perLoc.set(key,count+1);
      topicUsed.set(f.topic,topicCount+1);
    }
    return result;
  }

  function render(){
    const q=questions[current];
    const box=document.getElementById('quizContent');
    if(!box)return;
    if(!q){renderResult();return;}
    answered=false;
    box.innerHTML=`
      <div class="quiz-progress">Vraag ${current+1} van ${questions.length}</div>
      <h3 class="quiz-question">${esc(q.question)}</h3>
      <div class="quiz-location">📍 ${esc(q.location)}</div>
      <div class="quiz-answers">${q.answers.map((a,i)=>`<button type="button" class="quiz-answer" data-answer="${i}">${esc(a)}</button>`).join('')}</div>
      <div id="quizFeedback" class="quiz-feedback" aria-live="polite"></div>
      <button id="quizNextBtn" type="button" class="quiz-next" style="display:none">Volgende vraag →</button>`;
    box.querySelectorAll('.quiz-answer').forEach(btn=>btn.addEventListener('click',()=>answer(Number(btn.dataset.answer))));
  }

  function answer(index){
    if(answered)return;
    answered=true;
    const q=questions[current];
    const buttons=[...document.querySelectorAll('.quiz-answer')];
    buttons.forEach((b,i)=>{
      b.disabled=true;
      if(i===q.correct)b.classList.add('quiz-correct');
      if(i===index && i!==q.correct)b.classList.add('quiz-wrong');
    });
    if(index===q.correct)score++;
    const feedback=document.getElementById('quizFeedback');
    feedback.innerHTML=index===q.correct
      ? `<strong>✅ Goed!</strong><p>${esc(q.explanation)}</p>`
      : `<strong>❌ Helaas.</strong><p>Het juiste antwoord is: <strong>${esc(q.answers[q.correct])}</strong></p><p>${esc(q.explanation)}</p>`;
    const next=document.getElementById('quizNextBtn');
    if(next){
      next.style.display='inline-block';
      next.textContent=current+1<questions.length?'Volgende vraag →':'Bekijk resultaat →';
      next.onclick=()=>{current++;render();};
    }
  }

  function renderResult(){
    const pct=questions.length?Math.round(score/questions.length*100):0;
    const v=activeName();
    try{localStorage.setItem('reisblik_quiz_laatste_v1__'+v,JSON.stringify({datum:new Date().toISOString(),score,totaal:questions.length,pct}));}catch(e){}
    document.getElementById('quizContent').innerHTML=`
      <div class="quiz-result"><div class="quiz-result-icon">🎉</div><h3>Quiz klaar!</h3><div class="quiz-score">${score} / ${questions.length}</div><div class="quiz-percent">${pct}% goed</div>
      <p>Je hebt de locatiekennis van <strong>${esc(v)}</strong> getest.</p>
      <div class="quiz-actions"><button id="quizAgainBtn" type="button">🔄 Nieuwe quiz</button><button id="quizCloseResultBtn" type="button" class="quiz-secondary">Sluiten</button></div></div>`;
    document.getElementById('quizAgainBtn')?.addEventListener('click',startQuiz);
    document.getElementById('quizCloseResultBtn')?.addEventListener('click',closeQuiz);
  }

  async function startQuiz(){
    const box=document.getElementById('quizContent');
    if(!box)return;
    box.innerHTML='<div class="quiz-loading">🧠 De locatiepagina’s worden gelezen en de quiz wordt samengesteld…</div>';
    score=0;current=0;questions=[];
    locations=await loadLocations();
    const facts=await loadHtmlFacts(locations);
    questions=makeQuestions(facts);
    if(!questions.length){
      box.innerHTML='<div class="quiz-empty"><h3>Geen quiz beschikbaar</h3><p>Voor de actieve vakantie/deelreis zijn nog niet genoeg inhoudelijke locatiepagina’s beschikbaar om een multiple-choicequiz te maken.</p><p>De Reisquiz gebruikt alleen de <strong>inhoud van de locatie-HTML’s</strong>. Technische velden uit <code>locaties.json</code> worden niet als quizkennis gebruikt.</p><button id="quizEmptyClose" type="button">Sluiten</button></div>';
      document.getElementById('quizEmptyClose')?.addEventListener('click',closeQuiz);
      return;
    }
    render();
  }

  function openQuiz(){
    const o=document.getElementById('quizOverlay');
    if(!o)return;
    o.style.display='flex';
    document.getElementById('quizTitleContext').textContent=activeName();
    startQuiz();
  }
  function closeQuiz(){const o=document.getElementById('quizOverlay');if(o)o.style.display='none';}
  function init(){
    document.getElementById('quizOpenBtn')?.addEventListener('click',openQuiz);
    document.getElementById('quizCloseBtn')?.addEventListener('click',closeQuiz);
  }

  window.reisblikQuiz={open:openQuiz,start:startQuiz};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
