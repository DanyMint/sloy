const preferenceKey='sloy-vim-navigation';
const editable='input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]';
const interactive='button,a[href],summary,[role="button"],[role="link"],[role="checkbox"]';
const customControl='[role="combobox"],[role="listbox"],[role="slider"],[role="spinbutton"],[role="tab"],[role="grid"],[role="tree"],[data-vim-ignore]';
const layers='dialog[open],#task-context-menu,#select-menu-popup,[data-weekly-menu][open],#task-filter-menu[open] .weekly-filter-label';
const rowsSelector='[data-task-menu-row]';

const listCommands=[
 ['down','j','Следующая видимая задача','KeyJ'],
 ['up','k','Предыдущая видимая задача','KeyK'],
 ['left','h','Свернуть ветвь или перейти к родителю','KeyH'],
 ['right','l','Раскрыть ветвь или перейти к первому ребёнку','KeyL'],
 ['first','g g','Первая видимая задача'],
 ['last','G','Последняя видимая задача'],
 ['open','Enter','Открыть активную задачу'],
 ['search','/','Поиск в списке'],
 ['select','Space','Добавить или убрать активную задачу'],
 ['range','v','Начать или закончить выделение диапазона','KeyV'],
 ['add','a','Создать задачу','KeyA'],
 ['subtask','o','Создать подзадачу активной строки','KeyO'],
 ['complete','x','Изменить статус или завершить выбранные задачи','KeyX'],
 ['move','m','Переместить задачи','KeyM'],
 ['plan','p','Запланировать задачи','KeyP'],
 ['undo','Ctrl+Z','Отменить последнее изменение']
];
const destinations=[
 ['today','g t','Сегодня','KeyT'],
 ['week','g w','Текущая неделя в Journal','KeyW'],
 ['projects','g p','Проекты','KeyP'],
 ['habits','g h','Привычки','KeyH']
];
const byCode=new Map(listCommands.filter(command=>command[3]).map(([id,,,code])=>[code,id]));
const destinationByCode=new Map(destinations.map(([id,,,code])=>[code,id]));
const movement=new Set(['up','down','left','right','first','last']);
const groupCommands=new Set(['move','plan','complete']);
const visible=node=>!!node?.getClientRects().length&&!node.closest('[inert]');

export function readVimPreference(){
 try{return localStorage.getItem(preferenceKey)==='on';}catch{return false;}
}

export function saveVimPreference(enabled){
 try{localStorage.setItem(preferenceKey,enabled?'on':'off');return true;}catch{return false;}
}

export function vimMenuKey(id){
 return listCommands.find(([command])=>command===(id==='toggle-done'?'complete':id))?.[1];
}

export function vimHelpHTML(listAvailable){
 const section=(heading,commands)=>'<section><h3>'+heading+'</h3><dl class="vim-commands">'+commands.map(([,key,label])=>'<dt><kbd>'+key+'</kbd></dt><dd>'+label+'</dd>').join('')+'</dl></section>';
 return '<div class="vim-help"><h2>Команды Vim</h2><p>Включите «Vim-навигацию» в настройках и войдите в список задач клавишей Tab.</p>'+
  (listAvailable?'<p>Рамка отмечает активную строку. Заливка отмечает выбранные задачи. Команды m, p и x используют выделение, если оно есть.</p><p>Для переноса отмечайте задачи пробелом, переходя между ними через j и k. Нажмите m, найдите проект, выберите его и подтвердите перенос. Ctrl+Z отменяет перенос.</p>':'')+
  '<p>Буквы привязаны к физическим клавишам. На русской раскладке О и Л работают как j и k. В полях ввода используйте любую раскладку.</p>'+
  '<div class="vim-help-grid">'+(listAvailable?section('Список задач',listCommands):'')+'<div>'+
  section('Переходы',destinations)+section('Справка',[['help','?','Показать команды']])+'</div></div>'+
  '<div class="modal-actions"><button type="button" class="primary-button" data-action="close-modal">Готово</button></div></div>';
}

export function vimKey(event,prefixed=false){
 if(event.defaultPrevented||event.isComposing||event.keyCode===229||event.ctrlKey||event.altKey||event.metaKey)return;
 if(event.key==='Escape')return 'escape';
 if(event.key==='?')return 'help';
 if(event.key==='/')return 'search';
 if(event.key==='Enter'&&!event.shiftKey)return 'open';
 if(event.key===' '&&!event.shiftKey)return 'select';
 if(event.shiftKey)return event.code==='KeyG'?'last':undefined;
 if(prefixed)return event.code==='KeyG'?'first':destinationByCode.get(event.code);
 return event.code==='KeyG'?'prefix':byCode.get(event.code);
}

export function vimTaskTargets(command,active,selection){
 const usesSelection=groupCommands.has(command)&&selection.size>0;
 return {ids:usesSelection?[...selection]:active?[active]:[],usesSelection};
}

export function recoverActiveId(oldIds,ids,active){
 if(ids.includes(active))return active;
 const index=oldIds.indexOf(active),available=new Set(ids);
 if(index>=0){
  const next=oldIds.slice(index+1).find(id=>available.has(id));
  const previous=oldIds.slice(0,index).reverse().find(id=>available.has(id));
  return next??previous??ids[Math.min(index,ids.length-1)];
 }
 return ids[0];
}

export function rangeSelection(ids,anchor,end,base){
 const first=ids.indexOf(anchor),last=ids.indexOf(end);
 if(first<0||last<0)return new Set(base);
 return new Set([...base,...ids.slice(Math.min(first,last),Math.max(first,last)+1)]);
}

export function initVimNavigation({enabled,scope,selection,setSelection,run,navigate,help,hint}){
 const activeByScope=new Map(),searchByScope=new Map();
 let range=null,prefix=false,timer;
 const list=()=>enabled()?document.querySelector('#collection-view:not([hidden]) [data-vim-list]'):null;
 const searchInput=()=>list()?.parentElement.querySelector('[data-vim-search]');
 const rows=()=>[...list()?.querySelectorAll(rowsSelector)||[]].filter(visible);
 const resetPrefix=()=>{
  prefix=false;clearTimeout(timer);hint.hidden=true;
 };
 const status=()=>{
  const container=list();
  if(!container)return;
  const selected=selection(),count=container.parentElement.querySelector('[data-vim-count]');
  count.textContent='Выбрано: '+selected.size;
  for(const row of container.querySelectorAll(rowsSelector))row.classList.toggle('is-task-selected',selected.has(row.dataset.taskId));
 };
 function activate(row,{focus=false,scroll=false}={}){
  const container=list();
  if(!container)return;
  if(row)activeByScope.set(scope(),row.dataset.taskId);
  for(const item of container.querySelectorAll(rowsSelector))item.classList.toggle('is-vim-active',item===row);
  if(focus&&(row||container)!==document.activeElement)(row||container).focus({preventScroll:true});
  if(scroll)row?.scrollIntoView({block:'nearest',inline:'nearest'});
 }
 function snapshot(){
  const container=list(),target=document.activeElement;
  if(!container)return null;
  const row=target?.closest(rowsSelector),search=target===searchInput();
  return {scope:scope(),active:activeByScope.get(scope()),ids:rows().map(item=>item.dataset.taskId),owned:search||container.contains(target),
   search,rowId:row?.dataset.taskId,
   caret:search?[target.selectionStart,target.selectionEnd,target.selectionDirection]:null,
   control:row&&row!==target?[...row.querySelectorAll(interactive)].indexOf(target):-1,
   focused:target};
 }
 function filter(){
  const container=list(),input=searchInput();
  if(!input)return;
  const value=searchByScope.get(scope())||'';
  if(input.value!==value)input.value=value;
  const terms=value.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  for(const row of container.querySelectorAll(rowsSelector)){
   const title=row.querySelector('.task-title').textContent.toLocaleLowerCase();
   row.hidden=!terms.every(term=>title.includes(term));
  }
  const empty=container.querySelector('[data-vim-empty]');
  empty.hidden=!terms.length||rows().length>0;
 }
 function refresh(before,{restore=false}={}){
  const container=list();
  if(!container){range=null;return;}
  filter();
  const shown=rows(),ids=shown.map(row=>row.dataset.taskId),sameScope=before?.scope===scope();
  if(range&&(range.scope!==scope()||!ids.includes(range.anchor)))range=null;
  const id=recoverActiveId(sameScope?before.ids:[],ids,sameScope?before.active??activeByScope.get(scope()):activeByScope.get(scope()));
  const row=shown.find(item=>item.dataset.taskId===id);
  const focused=document.activeElement;
  const lostFocus=focused===document.body||focused===container||!visible(focused);
  const takeFocus=sameScope&&before.owned&&(lostFocus||restore&&focused===before.focused);
  activate(row,{focus:takeFocus&&!before.search,scroll:takeFocus&&!before.search});
  if(takeFocus&&before.search){
   const input=searchInput();
   input.focus({preventScroll:true});
   input.setSelectionRange(...before.caret);
  }
  if(takeFocus&&!restore&&id===before.rowId&&before.control>=0){
   const control=row?.querySelectorAll(interactive)[before.control];
   if(visible(control)&&!control.disabled)control.focus({preventScroll:true});
  }
  status();
 }
 function move(command){
  const shown=rows(),row=shown.find(item=>item.dataset.taskId===activeByScope.get(scope()));
  const index=shown.indexOf(row);
  if(index<0)return false;
  let target;
  if(command==='left'||command==='right'){
   const branch=row.parentElement,children=branch.querySelector(':scope > .scope-branch-children');
   const toggle=row.querySelector('[data-action="cycle-scope-subtasks"]');
   const expanded=toggle?.getAttribute('aria-expanded')==='true';
   if(toggle&&(command==='left'?expanded:!expanded)){
    return run('branch',row,{expanded:command==='right'});
   }
   if(command==='left'){
    for(let parent=branch.parentElement.closest('.scope-branch');parent;parent=parent.parentElement.closest('.scope-branch')){
     const candidate=parent.querySelector(':scope > '+rowsSelector);
     if(shown.includes(candidate)){target=candidate;break;}
    }
   }else if(children)target=shown.find(item=>children.contains(item));
  }else{
   const next=command==='first'?0:command==='last'?shown.length-1:Math.max(0,Math.min(shown.length-1,index+(command==='up'?-1:1)));
   target=shown[next];
  }
  if(!target)return false;
  activate(target,{focus:true,scroll:true});
  if(range&&['up','down'].includes(command)){
   setSelection(rangeSelection(shown.map(item=>item.dataset.taskId),range.anchor,target.dataset.taskId,range.base));
   status();
  }
  return true;
 }
 function focusList(){
  const shown=rows();
  activate(shown.find(row=>row.dataset.taskId===activeByScope.get(scope()))||shown[0],{focus:true,scroll:true});
 }
 document.addEventListener('focusin',event=>{
  resetPrefix();
  const container=list();
  if(!container?.contains(event.target))return;
  if(event.target===container&&!container.contains(event.relatedTarget))focusList();
  else{
   const row=event.target.closest(rowsSelector);
   if(visible(row))activate(row);
  }
 });
 window.addEventListener('blur',resetPrefix);
 document.addEventListener('compositionstart',resetPrefix);
 document.addEventListener('toggle',event=>{
  if(!enabled())return;
  if(event.target.open&&event.target.matches('dialog,[data-weekly-menu],#task-filter-menu'))resetPrefix();
  if(event.target.matches('details')&&list()?.contains(event.target))refresh(null);
 },true);
 document.addEventListener('input',event=>{
  if(!enabled()||!event.target.matches('[data-vim-search]'))return;
  const before=snapshot();
  searchByScope.set(scope(),event.target.value);
  refresh(before);
 });
 document.addEventListener('keydown',event=>{
  if(!enabled())return;
  const {target}=event;
  if(target.closest(editable)||target.isContentEditable||target.closest(customControl)||[...document.querySelectorAll(layers)].some(visible)){
   resetPrefix();
   return;
  }
  const wasPrefixed=prefix,command=vimKey(event,wasPrefixed);
  if(wasPrefixed&&!(event.repeat&&event.code==='KeyG')&&!event.ctrlKey&&!event.altKey&&!event.metaKey)resetPrefix();
  if(!command||event.repeat&&event.code==='KeyG')return;
  const container=list(),inList=container?.contains(target),row=rows().find(item=>item.dataset.taskId===activeByScope.get(scope()));
  const onControl=target.closest(interactive);
  if(event.repeat&&!movement.has(command)){
   if(command==='select'&&row&&inList&&!onControl)event.preventDefault();
   return;
  }
  if(command==='escape'){
   if(!wasPrefixed&&!(range&&inList))return;
   if(!wasPrefixed){setSelection(range.base);range=null;status();}
   event.preventDefault();
   return;
  }
  if(command==='prefix'){
   prefix=true;
   hint.textContent=destinations.concat(container?[listCommands.find(([id])=>id==='first')]:[]).map(([,key,label])=>key+' — '+label).join(' · ');
   hint.hidden=false;timer=setTimeout(resetPrefix,1100);
  }else if(wasPrefixed&&destinationByCode.get(event.code)===command){
   range=null;navigate(command);
  }else if(command==='help'){
   help(!!container);
  }else if(command==='first'&&container){
   if(!move(command))return;
  }else{
   if(!inList)return;
   if(movement.has(command)){
    if(!move(command))return;
   }else if(command==='search'){
    searchInput().focus();
   }else if(command==='range'&&row){
    if(range)range=null;
    else{
     const id=row.dataset.taskId;
     range={scope:scope(),anchor:id,base:new Set(selection())};
     setSelection(rangeSelection([id],id,id,range.base));
     status();
    }
   }else if(command==='select'&&row&&!onControl){
    const id=row.dataset.taskId,next=new Set(selection());
    if(next.has(id))next.delete(id);else next.add(id);
    range=null;setSelection(next);status();
   }else if(command==='add'||groupCommands.has(command)||row&&command==='open'&&!onControl||row&&command==='subtask'){
    if(!run(command,row))return;
   }else return;
  }
  event.preventDefault();
 });
 return {snapshot,refresh,focusList,status,resetPrefix,endRange:()=>{range=null;}};
}
