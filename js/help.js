// Reisblik 9.7.5 — Help
(function(){
  function closeHelp(){
    const el=document.getElementById('helpModal');
    if(el) el.style.display='none';
  }
  function openHelp(){
    const el=document.getElementById('helpModal');
    if(el) el.style.display='block';
  }
  window.openHelp=openHelp;
  window.closeHelp=closeHelp;
  document.addEventListener('DOMContentLoaded', function(){
    const b=document.getElementById('helpOpenBtn');
    const c=document.getElementById('helpCloseBtn');
    if(b) b.addEventListener('click',openHelp);
    if(c) c.addEventListener('click',closeHelp);
    const modal=document.getElementById('helpModal');
    if(modal) modal.addEventListener('click', function(e){ if(e.target===modal) closeHelp(); });
    document.addEventListener('keydown', function(e){ if(e.key==='Escape') closeHelp(); });
  });
})();
