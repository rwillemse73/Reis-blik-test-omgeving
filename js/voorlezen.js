/* Reisblik 9.9.38 — Nederlandse voorleesfunctie voor locatieteksten */
(function(){
  'use strict';

  let queue = [];
  let queueIndex = 0;
  let current = null;
  let activeContainer = null;

  function supported(){
    return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  }

  function splitText(text, maxLength=260){
    const clean=String(text||'').replace(/\s+/g,' ').trim();
    if(!clean)return [];
    const sentences=clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g)||[clean];
    const parts=[];
    let part='';
    sentences.forEach(sentence=>{
      sentence=sentence.trim();
      if(!sentence)return;
      if(!part){part=sentence;return;}
      if((part+' '+sentence).length<=maxLength){part+=' '+sentence;}
      else{parts.push(part);part=sentence;}
    });
    if(part)parts.push(part);
    return parts;
  }

  function setButtonsState(container, state){
    if(!container)return;
    const start=container.querySelector('[data-voorlezen="start"]');
    const pause=container.querySelector('[data-voorlezen="pauze"]');
    const resume=container.querySelector('[data-voorlezen="hervat"]');
    const stop=container.querySelector('[data-voorlezen="stop"]');
    if(start)start.disabled=state==='playing';
    if(pause)pause.disabled=state!=='playing';
    if(resume)resume.disabled=state!=='paused';
    if(stop)stop.disabled=state==='idle';
    const status=container.querySelector('[data-voorlezen-status]');
    if(status){
      status.textContent=state==='playing'?'🔊 Voorlezen…':state==='paused'?'⏸ Gepauzeerd':state==='idle'?'':'⏹ Gestopt';
    }
  }

  function stop(){
    if(supported()) window.speechSynthesis.cancel();
    queue=[]; queueIndex=0; current=null;
    setButtonsState(activeContainer,'idle');
    activeContainer=null;
  }

  function speakNext(){
    if(!queue.length || queueIndex>=queue.length){
      const done=activeContainer;
      queue=[];queueIndex=0;current=null;
      setButtonsState(done,'idle');
      activeContainer=null;
      return;
    }
    current=new SpeechSynthesisUtterance(queue[queueIndex++]);
    current.lang='nl-NL';
    current.rate=0.95;
    current.pitch=1;
    current.onend=()=>{ if(activeContainer) speakNext(); };
    current.onerror=(e)=>{
      if(e && e.error==='canceled')return;
      const c=activeContainer;
      queue=[];queueIndex=0;current=null;
      setButtonsState(c,'idle');
      activeContainer=null;
    };
    window.speechSynthesis.speak(current);
    setButtonsState(activeContainer,'playing');
  }

  function start(container){
    if(!supported()){
      const status=container.querySelector('[data-voorlezen-status]');
      if(status)status.textContent='Voorlezen wordt niet ondersteund op dit apparaat.';
      return;
    }
    if(activeContainer && activeContainer!==container) stop();
    window.speechSynthesis.cancel();
    const text=container.dataset.voorlezenText||'';
    queue=splitText(text);queueIndex=0;activeContainer=container;
    if(!queue.length)return;
    speakNext();
  }

  function pause(container){
    if(activeContainer===container && supported() && window.speechSynthesis.speaking){
      window.speechSynthesis.pause();
      setButtonsState(container,'paused');
    }
  }

  function resume(container){
    if(activeContainer===container && supported() && window.speechSynthesis.paused){
      window.speechSynthesis.resume();
      setButtonsState(container,'playing');
    }
  }

  function add(el){
    if(!el || el.querySelector('.reisblik-voorlezen'))return;
    const text=el.innerText.trim();
    if(!text)return;
    const controls=document.createElement('div');
    controls.className='reisblik-voorlezen';
    controls.dataset.voorlezenText=text;
    controls.style.cssText='margin:12px 0;padding:8px 10px;border:1px solid #d7dee1;border-radius:10px;background:#f7f9fa;display:flex;align-items:center;gap:6px;flex-wrap:wrap';
    controls.innerHTML=`<strong style="margin-right:4px">🔊 Voorlezen</strong>
      <button type="button" data-voorlezen="start">▶ Start</button>
      <button type="button" data-voorlezen="pauze" disabled>⏸ Pauze</button>
      <button type="button" data-voorlezen="hervat" disabled>▶ Hervat</button>
      <button type="button" data-voorlezen="stop" disabled>⏹ Stop</button>
      <span data-voorlezen-status style="font-size:12px;color:#667"></span>`;
    controls.querySelector('[data-voorlezen="start"]').onclick=()=>start(controls);
    controls.querySelector('[data-voorlezen="pauze"]').onclick=()=>pause(controls);
    controls.querySelector('[data-voorlezen="hervat"]').onclick=()=>resume(controls);
    controls.querySelector('[data-voorlezen="stop"]').onclick=()=>{ if(activeContainer===controls)stop(); else setButtonsState(controls,'idle'); };
    el.appendChild(controls);
  }

  window.reisblikVoorlezen={add,stop};
  window.addEventListener('pagehide',stop);
})();
