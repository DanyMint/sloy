import {isTaskActive} from './domain.js';

export const canSwipeTask=(state,task)=>!!task&&!task.done&&!task.cancelled&&!task.skipped&&!task.someday&&isTaskActive(state,task);
export function taskSwipeAttrs(state,task){
 if(!canSwipeTask(state,task))return '';
 const id=String(task.id).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 return `data-swipe-task="${id}"`;
}
export const swipeThreshold=width=>Math.max(64,Math.min(112,width*.24));

// Touch gestures only: mouse dragging remains available to the planner and Kanban.
export function enableTaskSwipe({canComplete,onComplete,root=document}){
 let gesture=null,blockedUntil=0;
 const reset=()=>{
  if(gesture){const {row,pointerId}=gesture;row.classList.remove('is-swiping','swipe-ready');row.style.removeProperty('--task-swipe-x');
   try{if(row.hasPointerCapture(pointerId))row.releasePointerCapture(pointerId);}catch{}
  }
  gesture=null;
 };
 root.addEventListener('pointerdown',event=>{
  blockedUntil=0;
  if(gesture){reset();return;}
  if(event.pointerType!=='touch'||event.isPrimary===false||event.button!==0||event.clientX<24)return;
  const row=event.target.closest('[data-swipe-task]');
  if(!row||event.target.closest('input,select,textarea,a,[contenteditable="true"],button:not(.task-title):not(.plan-task-title)')||!canComplete(row.dataset.swipeTask))return;
  gesture={row,id:row.dataset.swipeTask,pointerId:event.pointerId,x:event.clientX,y:event.clientY,dx:0,locked:false,threshold:swipeThreshold(row.getBoundingClientRect().width)};
 });
 root.addEventListener('pointermove',event=>{
  const g=gesture;if(!g||event.pointerId!==g.pointerId)return;
  if(!g.row.isConnected){reset();return;}
  const dx=event.clientX-g.x,dy=event.clientY-g.y;
  if(!g.locked){
   if(Math.hypot(dx,dy)<10)return;
   if(dx<=0||Math.abs(dx)<Math.abs(dy)*1.6){reset();return;}
   g.locked=true;g.row.classList.add('is-swiping');
   try{g.row.setPointerCapture(g.pointerId);}catch{}
  }
  if(event.cancelable)event.preventDefault();
  g.dx=Math.abs(dy)>Math.max(40,Math.abs(dx)*.7)?0:Math.max(0,dx);
  g.row.style.setProperty('--task-swipe-x',Math.min(g.dx,136)+'px');
  g.row.classList.toggle('swipe-ready',g.dx>=g.threshold);
 },{passive:false});
 root.addEventListener('pointerup',event=>{
  const g=gesture;if(!g||event.pointerId!==g.pointerId)return;
  const dx=event.clientX-g.x,dy=Math.abs(event.clientY-g.y);
  const complete=g.locked&&g.dx>=g.threshold&&dx>=g.threshold&&dy<=Math.max(40,dx*.7)&&g.row.isConnected&&canComplete(g.id);
  if(g.locked){if(event.cancelable)event.preventDefault();blockedUntil=Date.now()+500;}
  reset();if(complete)onComplete(g.id);
 });
 root.addEventListener('pointercancel',reset);
 root.addEventListener('scroll',reset,true);
 root.addEventListener('visibilitychange',reset);
 root.addEventListener('click',event=>{
  if(Date.now()<blockedUntil&&event.detail!==0){event.preventDefault();event.stopImmediatePropagation();blockedUntil=0;}
 },true);
}
