(() => {
 'use strict';
 const overlay=document.getElementById('ggm-login-intro');
 if(!overlay)return;
 const duration=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?180:1900;
 let finished=false;
 const finish=()=>{
  if(finished)return;finished=true;
  overlay.classList.add('ggm-intro-leave');document.body.classList.remove('ggm-intro-pending');
  window.setTimeout(()=>overlay.remove(),460);
 };
 overlay.querySelector('.ggm-intro-skip')?.addEventListener('click',finish);
 window.setTimeout(finish,duration);
})();