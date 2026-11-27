// Native drag and drop. The + buttons and column selects remain keyboard/touch alternatives.
export function enableTaskDragging({canDrop,onPlanDrop,onColumnDrop,onParentDrop,canDropScope,onScopeDrop,onOrderDrop,canReorder,describeParentDrop,scopeSelection,onScopeSelect,onError}){
 let drag=null,highlight=null,highlightPosition=null;
 const findTarget=element=>{
  const zone=element.closest('[data-task-drop-zone]');
  return zone?zone.previousElementSibling:element.closest('[data-drop-plan],[data-drop-column],[data-drop-parent]');
 };
 const setHighlight=(target,position=null)=>{
  if(highlight===target&&highlightPosition===position)return;
  const keepZone=highlight===target&&position==='after'&&target.classList.contains('is-parent-drop-target');
  highlight?.classList.remove('is-drop-target','is-parent-drop-target','is-drop-before','is-drop-after','keep-drop-zone');
  highlight=target;
  highlightPosition=position;
  if(!target)return;
  if(position){
   target.classList.add(position==='before'?'is-drop-before':'is-drop-after');
   if(keepZone)target.classList.add('keep-drop-zone');
  }
  else if(target.hasAttribute('data-drop-parent')){
   target.classList.add('is-parent-drop-target');
   target.nextElementSibling.textContent='Отпустите, чтобы добавить подзадачи';
  }else target.classList.add('is-drop-target');
 };
 const clear=()=>{setHighlight(null);document.querySelectorAll('.is-dragging').forEach(e=>e.classList.remove('is-dragging'));};
 // Pointer gestures keep task transfers inside the WebView.
 let gesture=null,skipClick=false,anchor=null;
 const visibleRows=scope=>[...scope.querySelectorAll('[data-drop-parent]')].filter(row=>row.getClientRects().length);
 const rowId=row=>row.dataset.dropParent;
 const select=(scope,ids)=>{
  onScopeSelect(ids);
  for(const row of visibleRows(scope))row.classList.toggle('is-task-selected',ids.has(rowId(row)));
 };
 const scopeTarget=event=>{
  const element=document.elementFromPoint(event.clientX,event.clientY);
  if(!element)return null;
  const sidebar=element.closest('#sidebar-tree .space-tree-row');
  if(sidebar){
   const {treeOpen:kind,id}=sidebar.querySelector('[data-tree-open]').dataset;
   return canDropScope(kind,id,gesture.ids)?{target:sidebar,destination:{kind,id}}:null;
  }
  const target=findTarget(element);
  if(!target){
   const collection=gesture.scope.closest('#collection-view');
   const background=element===collection?.parentElement||element.closest('#collection-view')===collection&&!element.closest('.flow-task,button,summary,a,input,textarea,select');
   return background&&canDropScope('background',null,gesture.ids)?{target:gesture.scope,destination:{kind:'background'}}:null;
  }
  if(!target.hasAttribute('data-drop-parent')||target.closest('[data-task-selection]')!==gesture.scope)return null;
  if(!element.closest('[data-task-drop-zone]')){
   const bounds=target.getBoundingClientRect();
   const fraction=(event.clientY-bounds.top)/bounds.height;
   if(fraction<.25||fraction>.75){
    const siblings=[...target.parentElement.parentElement.children]
     .map(branch=>branch.querySelector(':scope > [data-task-id]'))
     .filter(row=>row&&row.dataset.taskParent===target.dataset.taskParent).map(row=>row.dataset.taskId);
    if(canReorder()&&!gesture.ids.includes(rowId(target))&&gesture.ids.every(id=>siblings.includes(id))){
     return {target,position:fraction<.25?'before':'after',siblings};
    }
   }
  }
  return canDrop(gesture,target)?{target}:null;
 };
 function finishScope(event,drop=false){
  if(!gesture||event&&gesture.pointerId!==event.pointerId)return;
  const completed=gesture;
  const target=drop&&completed.row&&completed.started&&scopeTarget(event);
  gesture=null;
  completed.scope.classList.remove('is-moving-tasks');
  completed.preview?.remove();
  setHighlight(null);
  if(completed.scope.hasPointerCapture(completed.pointerId))completed.scope.releasePointerCapture(completed.pointerId);
  if(!completed.row&&!drop&&completed.scope.isConnected)select(completed.scope,completed.previous);
  if(target)try{
   const id=rowId(target.target);
   if(target.destination)onScopeDrop(target.destination.kind,target.destination.id,completed.ids);
   else if(target.position)onOrderDrop(id,completed.ids,target.siblings,target.position==='after');
   else onParentDrop(id,completed.ids);
  }catch(error){onError(error.message);}
 }
 document.addEventListener('pointerdown',event=>{
  if(event.button!==0||!event.isPrimary)return;
  skipClick=false;
  if(event.pointerType!=='mouse')return;
  const scope=event.target.closest('[data-task-selection]');
  if(!scope||event.target.closest('input,select,textarea,a,summary,button:not(.task-title),[contenteditable]'))return;
  const row=event.target.closest('[data-drop-parent]');
  if(!row&&event.target.closest('.flow-task'))return;
  const previous=new Set(scopeSelection());
  const toggle=event.ctrlKey||event.metaKey;
  const id=row&&rowId(row);
  const rows=visibleRows(scope).map(rowId);
  if(row&&(toggle||event.shiftKey)){
   event.preventDefault();
   skipClick=true;
   let ids=new Set(previous);
   if(event.shiftKey){
    const start=anchor?.scope===scope?rows.indexOf(anchor.id):-1;
    const end=rows.indexOf(id);
    const range=start<0?[id]:rows.slice(Math.min(start,end),Math.max(start,end)+1);
    ids=new Set(toggle?[...previous,...range]:range);
    if(start<0)anchor={scope,id};
   }else{
    if(ids.has(id))ids.delete(id);else ids.add(id);
    anchor={scope,id};
   }
   select(scope,ids);
   return;
  }
  const ids=row?(previous.has(id)?rows.filter(item=>previous.has(item)):[id]):[];
  gesture={scope,row,ids,source:'scope',previous,toggle,pointerId:event.pointerId,x:event.clientX,y:event.clientY,started:false};
  if(row)anchor={scope,id};
  else event.preventDefault();
 },true);
 document.addEventListener('pointermove',event=>{
  if(!gesture||gesture.pointerId!==event.pointerId)return;
  const {scope,row,ids,x,y}=gesture;
  if(!scope.isConnected||!(event.buttons&1)){finishScope(event);return;}
  if(!gesture.started){
   if(Math.hypot(event.clientX-x,event.clientY-y)<5)return;
   gesture.started=true;
   skipClick=true;
   scope.setPointerCapture(event.pointerId);
   const preview=document.createElement('div');
   preview.className=row?'scope-drag-preview':'scope-marquee';
   preview.setAttribute('aria-hidden','true');
   if(row){
    scope.classList.add('is-moving-tasks');
    preview.append(document.createElement('i'),describeParentDrop(ids.length));
   }
   document.body.append(preview);
   gesture.preview=preview;
  }
  const {clientX,clientY}=event;
  if(row){
   gesture.preview.style.left=Math.min(clientX+14,window.innerWidth-gesture.preview.offsetWidth-6)+'px';
   gesture.preview.style.top=Math.min(clientY+18,window.innerHeight-gesture.preview.offsetHeight-6)+'px';
   const drop=scopeTarget(event);
   setHighlight(drop?.target??null,drop?.position);
   return;
  }
  const left=Math.min(x,clientX),right=Math.max(x,clientX),top=Math.min(y,clientY),bottom=Math.max(y,clientY);
  Object.assign(gesture.preview.style,{left:left+'px',top:top+'px',width:right-left+'px',height:bottom-top+'px'});
  const selected=new Set(gesture.toggle?gesture.previous:[]);
  for(const item of visibleRows(scope)){
   const bounds=item.getBoundingClientRect();
   if(bounds.left<=right&&bounds.right>=left&&bounds.top<=bottom&&bounds.bottom>=top)selected.add(rowId(item));
  }
  select(scope,selected);
  const first=visibleRows(scope).find(item=>selected.has(rowId(item)));
  if(first)anchor={scope,id:rowId(first)};
 });
 document.addEventListener('pointerup',event=>{
  if(!gesture||gesture.pointerId!==event.pointerId)return;
  if(!gesture.started&&!gesture.toggle)select(gesture.scope,new Set());
  finishScope(event,true);
 });
 document.addEventListener('pointercancel',event=>finishScope(event));
 document.addEventListener('lostpointercapture',event=>finishScope(event));
 document.addEventListener('keydown',event=>{if(event.key==='Escape')finishScope();});
 window.addEventListener('blur',()=>finishScope());
 document.addEventListener('click',event=>{
  if(skipClick&&event.detail!==0){
   skipClick=false;
   event.preventDefault();
   event.stopImmediatePropagation();
  }else if(event.detail!==0){
   const row=event.target.closest('[data-drop-parent]');
   if(row&&!event.target.closest('button,a,input,select,textarea'))row.querySelector('.task-title')?.click();
  }
 },true);
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
  try{if(target.hasAttribute('data-drop-plan'))onPlanDrop(current.id);else onColumnDrop(current.id,target.dataset.dropColumn,event.target.closest('[data-card-id]')?.dataset.cardId);}catch(e){onError(e.message);}
 });
 document.addEventListener('dragend',()=>{drag=null;clear();});
}
