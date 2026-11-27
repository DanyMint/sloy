// Native drag and drop. The + buttons and column selects remain keyboard/touch alternatives.
export function enableTaskDragging({canDrop,onPlanDrop,onColumnDrop,onParentDrop,describeParentDrop,onError}){
 let drag=null,highlight=null;
 const findTarget=element=>{
  const zone=element.closest('[data-task-drop-zone]');
  return zone?zone.previousElementSibling:element.closest('[data-drop-plan],[data-drop-column],[data-drop-parent]');
 };
 const setHighlight=target=>{
  if(highlight===target)return;
  highlight?.classList.remove('is-drop-target','is-parent-drop-target');
  highlight=target;
  if(!target)return;
  if(target.hasAttribute('data-drop-parent')){
   target.classList.add('is-parent-drop-target');
   target.nextElementSibling.textContent=describeParentDrop();
  }else target.classList.add('is-drop-target');
 };
 const clear=()=>{setHighlight(null);document.querySelectorAll('.is-dragging').forEach(e=>e.classList.remove('is-dragging'));};
 document.addEventListener('dragstart',event=>{
  const row=event.target.closest('[data-drag-task][draggable="true"]');if(!row)return;
  drag={id:row.dataset.dragTask,source:row.dataset.dragSource};row.classList.add('is-dragging');event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',drag.id);
 });
 document.addEventListener('dragover',event=>{
  if(!drag)return;const target=findTarget(event.target);if(!target||!canDrop(drag,target)){setHighlight(null);return;}
  event.preventDefault();event.dataTransfer.dropEffect='move';setHighlight(target);
 });
 document.addEventListener('dragleave',event=>{if(highlight&&!event.relatedTarget)setHighlight(null);});
 document.addEventListener('drop',event=>{
  if(!drag)return;const target=findTarget(event.target);if(!target||!canDrop(drag,target)){setHighlight(null);return;}
  event.preventDefault();const current=drag;drag=null;clear();
  try{if(target.hasAttribute('data-drop-plan'))onPlanDrop(current.id);else if(target.hasAttribute('data-drop-parent'))onParentDrop(target.dataset.dropParent);else onColumnDrop(current.id,target.dataset.dropColumn,event.target.closest('[data-card-id]')?.dataset.cardId);}catch(e){onError(e.message);}
 });
 document.addEventListener('dragend',()=>{drag=null;clear();});
}
