/*
 * Reisblik 9.7.5 — Volledige localStorage wissen
 * Bewust een aparte, expliciete functie. Dit wist ALLE localStorage van
 * Reisblik op dit apparaat. Applicatiebestanden en vaste HTML worden niet geraakt.
 */
(function(){
  "use strict";
  function init(){
    const open=document.getElementById("clearStorageBtn");
    const modal=document.getElementById("clearStorageModal");
    const confirmBtn=document.getElementById("clearStorageConfirmBtn");
    const cancelBtn=document.getElementById("clearStorageCancelBtn");
    if(!open||!modal||!confirmBtn||!cancelBtn)return;
    if(open.dataset.clearStorageBound==="true")return;
    open.dataset.clearStorageBound="true";
    open.addEventListener("click",function(){
      modal.style.display="block";
      cancelBtn.focus();
    });
    cancelBtn.addEventListener("click",function(){
      modal.style.display="none";
      open.focus();
    });
    modal.addEventListener("click",function(e){
      if(e.target===modal){ modal.style.display="none"; open.focus(); }
    });
    document.addEventListener("keydown",function(e){
      if(e.key==="Escape" && modal.style.display!=="none"){
        modal.style.display="none";
        open.focus();
      }
    });
    confirmBtn.addEventListener("click",function(){
      const ok=confirm("Weet je zeker dat je ALLE lokale Reisblik-gegevens wilt wissen? Dit kan niet automatisch ongedaan worden gemaakt.");
      if(!ok)return;
      localStorage.clear();
      modal.style.display="none";
      alert("Alle lokale Reisblik-gegevens zijn gewist. De pagina wordt opnieuw geladen.");
      window.location.reload();
    });
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});
  else init();
})();
