const rowSelector='#collection-view [data-task-menu-row]';
const editable='input,textarea,select,[contenteditable]:not([contenteditable="false"])';
const pinKey='sloy-task-menu-pins';

export function orderTaskCommands(commands,pins){
 return [...commands.filter(command=>pins.includes(command.id)).sort((a,b)=>pins.indexOf(a.id)-pins.indexOf(b.id)),
  ...commands.filter(command=>!pins.includes(command.id))];
}

export function initTaskContextMenu({describe,execute,restore,shortcut,onOpen}){
 let active=null,pins={};
 try{const saved=JSON.parse(localStorage.getItem(pinKey));for(const kind of ['single','group'])if(Array.isArray(saved?.[kind]))pins[kind]=saved[kind];}catch{}
 const close=(focus=true)=>{
  if(!active)return;
  const {popup,context,trigger}=active;
  active=null;
  popup.remove();
  trigger?.setAttribute('aria-expanded','false');
  if(focus)restore(context);
  return ()=>restore(context);
 };
 function open(event,row,origin,point){
  close(false);
  const details=describe(row,origin);
  if(!details?.commands.length)return;
  const {context,commands,title}=details,kind=context.ids.length>1?'group':'single';
  const popup=document.createElement('div'),trigger=row.querySelector('[data-task-menu-trigger]');
  popup.className='task-context-menu';
  popup.id='task-context-menu';
  popup.setAttribute('role','menu');
  popup.setAttribute('aria-label',title);
  trigger?.setAttribute('aria-expanded','true');
  active={popup,context,trigger};
  onOpen?.();
  let configuring=false;
  function draw(focusId){
   popup.replaceChildren();
   const heading=document.createElement('div');
   heading.className='task-menu-heading';
   heading.textContent=configuring?'Закрепить команды':title;
   popup.append(heading);
   const pinned=pins[kind]||[];
   const append=(id,label,run,checked,key)=>{
    const button=document.createElement('button');
    button.type='button';
    button.tabIndex=-1;
    button.dataset.command=id;
    button.setAttribute('role',checked===undefined?'menuitem':'menuitemcheckbox');
    if(checked!==undefined)button.setAttribute('aria-checked',String(checked));
    button.textContent=label;
    if(key){
     const kbd=document.createElement('kbd');
     kbd.textContent=key;button.append(kbd);
    }
    button.addEventListener('click',run);
    popup.append(button);
   };
   for(const command of orderTaskCommands(commands,pinned)){
    if(configuring&&command.pinnable===false)continue;
    const checked=pinned.includes(command.id);
    append(command.id,configuring?(checked?'✓  ':'＋  ')+command.label:command.label,()=>{
     if(!configuring){close(false);execute(command,context);return;}
     pins[kind]=checked?pinned.filter(id=>id!==command.id):[...pinned,command.id];
     try{localStorage.setItem(pinKey,JSON.stringify(pins));}catch{}
     draw(command.id);
    },configuring?checked:undefined,!configuring&&shortcut?.(command,context));
   }
   append('configure',configuring?'Готово':'Настроить меню',()=>{configuring=!configuring;draw(configuring?undefined:'configure');});
   const viewport=window.visualViewport,left=viewport?.offsetLeft||0,top=viewport?.offsetTop||0;
   const width=viewport?.width||innerWidth,height=viewport?.height||innerHeight;
   popup.style.maxWidth=Math.max(0,width-16)+'px';
   popup.style.maxHeight=Math.max(0,height-16)+'px';
   const bounds=origin.getBoundingClientRect(),x=point?.x??bounds.left,y=point?.y??bounds.bottom;
   popup.style.left=Math.max(left+8,Math.min(x,left+width-popup.offsetWidth-8))+'px';
   popup.style.top=Math.max(top+8,Math.min(y,top+height-popup.offsetHeight-8))+'px';
   const buttons=[...popup.querySelectorAll('button')];
   (buttons.find(button=>button.dataset.command===focusId)||buttons[0])?.focus();
  }
  event.preventDefault();
  document.body.append(popup);
  draw();
 }
 document.addEventListener('contextmenu',event=>{
  const row=event.target.closest(rowSelector);
  if(row&&!event.target.closest(editable)&&!event.target.isContentEditable){
   open(event,row,row,{x:event.clientX,y:event.clientY});
  }
 });
 document.addEventListener('click',event=>{
  const trigger=event.target.closest('[data-task-menu-trigger]'),row=trigger?.closest(rowSelector);
  if(!row)return;
  if(active?.trigger===trigger)close();else open(event,row,trigger);
 },true);
 document.addEventListener('pointerdown',event=>{
  if(active&&!active.popup.contains(event.target)&&!active.trigger?.contains(event.target))close(false);
 },true);
 document.addEventListener('keydown',event=>{
  if(active){
   const buttons=[...active.popup.querySelectorAll('button')],index=buttons.indexOf(document.activeElement);
   if(event.key==='Escape'||event.key==='Tab'){
    if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();}
    close();
   }else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
    event.preventDefault();
    const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;
    buttons[next]?.focus();
   }
   return;
  }
  if(event.key!=='ContextMenu'&&!(event.shiftKey&&event.key==='F10'))return;
  const row=event.target.closest(rowSelector);
  if(row&&!event.target.closest(editable)&&!event.target.isContentEditable)open(event,row,event.target);
 },true);
 window.addEventListener('resize',()=>close());
 return close;
}

export function chooseTaskDestination(openModal,{title,options,search=false,preview,confirm}){
 openModal(`<div class="task-destination-picker"><h2>${title}</h2>${search?'<input type="search" class="field" aria-label="Поиск назначения" placeholder="Найти проект, зону или задачу">':''}<div class="task-destination-list"></div><p class="hint-box" aria-live="polite"></p><div class="modal-actions"><button type="button" class="secondary-button" data-action="close-modal">Отмена</button><button type="button" class="primary-button task-destination-confirm" disabled>Подтвердить</button></div></div>`);
 const layer=document.querySelector('.task-destination-picker'),input=layer.querySelector('input'),list=layer.querySelector('.task-destination-list');
 const accept=layer.querySelector('.task-destination-confirm'),description=layer.querySelector('.hint-box');
 let selected=null;
 function choose(option){
  selected=option;
  accept.disabled=!selected;
  description.textContent=selected?preview(selected):'Выберите назначение.';
  [...list.querySelectorAll('button')].forEach(button=>button.setAttribute('aria-pressed',String(button.option===option)));
 }
 function draw(){
  const terms=(input?.value||'').trim().toLocaleLowerCase().split(/\s+/);
  const matching=options.filter(option=>terms.every(term=>[option.label,option.type,option.path].join(' ').toLocaleLowerCase().includes(term)));
  const buttons=matching.map(option=>{
   const button=document.createElement('button'),detail=document.createElement('small');
   button.type='button';button.option=option;button.textContent=option.label;
   detail.textContent=[option.type,option.path].filter(Boolean).join(' · ');
   button.append(detail);
   button.addEventListener('click',()=>choose(option));
   return button;
  });
  list.replaceChildren(...(buttons.length?buttons:['Нет доступных назначений.']));
  choose(null);
 }
 input?.addEventListener('input',draw);
 list.parentElement.addEventListener('keydown',event=>{
  if(!list.isConnected)return;
  const buttons=[...list.querySelectorAll('button')],index=buttons.indexOf(document.activeElement);
  if((event.key==='ArrowDown'||event.key==='ArrowUp')&&(index>=0||event.target===input)){
   event.preventDefault();
   buttons[index<0?(event.key==='ArrowDown'?0:buttons.length-1):(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();
  }else if(event.key==='Enter'&&event.target===input){
   event.preventDefault();
   if(selected)confirm(selected);else if(buttons.length)choose(buttons[0].option);
  }
 });
 accept.addEventListener('click',()=>{if(selected)confirm(selected);});
 draw();
 (input||list.querySelector('button')||layer.querySelector('[data-action="close-modal"]')).focus();
}
