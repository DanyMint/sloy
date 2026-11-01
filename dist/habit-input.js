export function enableHabitHold(openEntry){
 let timer=null,start=null,held=null,until=0;
 const stop=()=>{clearTimeout(timer);timer=null;start=null;};
 document.addEventListener('pointerdown',event=>{const b=event.target.closest('[data-hold-habit]');if(!b||b.disabled||event.button!==0)return;stop();start={x:event.clientX,y:event.clientY};timer=setTimeout(()=>{held=b;until=Date.now()+1200;stop();openEntry(b.dataset.id,b.dataset.date);},550);});
 document.addEventListener('pointermove',event=>{if(start&&Math.hypot(event.clientX-start.x,event.clientY-start.y)>9)stop();});
 for(const name of ['pointerup','pointercancel','scroll'])document.addEventListener(name,stop,true);
 document.addEventListener('click',event=>{if(held&&Date.now()<until&&event.target.closest('[data-hold-habit]')===held){event.preventDefault();event.stopImmediatePropagation();held=null;}},true);
 document.addEventListener('contextmenu',event=>{const b=event.target.closest('[data-hold-habit]');if(b&&!b.disabled){event.preventDefault();stop();if(Date.now()>=until)openEntry(b.dataset.id,b.dataset.date);}});
 document.addEventListener('keydown',event=>{const b=event.target.closest('[data-hold-habit]');if(b&&!b.disabled&&event.key==='Enter'&&event.shiftKey){event.preventDefault();openEntry(b.dataset.id,b.dataset.date);}});
}
