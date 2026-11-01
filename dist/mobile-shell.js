// Native dialog supplies focus trapping, Escape dismissal and an inert backdrop.
export function initMobileShell(){
 const media=matchMedia('(max-width:680px)'),drawer=document.getElementById('mobile-menu'),trigger=document.getElementById('mobile-menu-toggle');
 let page='';
 function sync(next=page){
  page=next;
  const active=['habits','analytics','settings'].includes(page);
  trigger.classList.toggle('active',active||drawer.open);
  trigger.setAttribute('aria-expanded',String(drawer.open));
  if(active)trigger.setAttribute('aria-current','page');else trigger.removeAttribute('aria-current');
  document.documentElement.toggleAttribute('data-mobile-menu-open',drawer.open);
 }
 function close(){if(drawer.open)drawer.close();sync();}
 function open(){if(!media.matches||drawer.open)return;drawer.showModal();sync();}
 function align(){if(!media.matches)close();}
 drawer.addEventListener('close',()=>sync());
 drawer.addEventListener('cancel',event=>{event.preventDefault();close();});
 drawer.addEventListener('click',event=>{
  if(event.target!==drawer)return;
  const r=drawer.getBoundingClientRect();
  if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();
 });
 media.addEventListener('change',align);
 align();
 return {open,close,sync};
}
