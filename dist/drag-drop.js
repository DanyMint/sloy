// Native drag and drop. The + buttons and column selects remain keyboard/touch alternatives.
export function enableTaskDragging({canDrop,onPlanDrop,onColumnDrop,onError}){
 let drag=null,highlight=null;
 const clear=()=>{highlight?.classList.remove('is-drop-target');highlight=null;document.querySelectorAll('.is-dragging').forEach(e=>e.classList.remove('is-dragging'));};
 document.addEventListener('dragstart',event=>{
  const row=event.target.closest('[data-drag-task][draggable="true"]');if(!row)return;
  drag={id:row.dataset.dragTask,source:row.dataset.dragSource};row.classList.add('is-dragging');event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',drag.id);
 });
 document.addEventListener('dragover',event=>{
  if(!drag)return;const target=event.target.closest('[data-drop-plan],[data-drop-column]');if(!target||!canDrop(drag,target))return;
  event.preventDefault();event.dataTransfer.dropEffect='move';if(highlight!==target){highlight?.classList.remove('is-drop-target');highlight=target;target.classList.add('is-drop-target');}
 });
 document.addEventListener('dragleave',event=>{if(highlight&&event.target===highlight&&!highlight.contains(event.relatedTarget)){highlight.classList.remove('is-drop-target');highlight=null;}});
 document.addEventListener('drop',event=>{
  if(!drag)return;const target=event.target.closest('[data-drop-plan],[data-drop-column]');if(!target||!canDrop(drag,target))return;
  event.preventDefault();const current=drag;drag=null;clear();
  try{if(target.hasAttribute('data-drop-plan'))onPlanDrop(current.id);else onColumnDrop(current.id,target.dataset.dropColumn,event.target.closest('[data-card-id]')?.dataset.cardId);}catch(e){onError(e.message);}
 });
 document.addEventListener('dragend',()=>{drag=null;clear();});
}
