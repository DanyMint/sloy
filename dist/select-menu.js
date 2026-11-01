// Keep native selects as the form controls and accessible, focusable triggers.
// Only their popup is replaced, including selects rendered after startup.
export function initSelectMenus() {
 let active=null,search='',searchTimer;
 const selector='select:not([multiple])';
 const eligible=select=>select?.matches(selector)&&select.size<=1&&!select.matches(':disabled');
 const enabled=select=>Array.from(select.options).filter(option=>!option.disabled&&!option.hidden&&!option.closest('optgroup')?.disabled&&!option.closest('optgroup')?.hidden);
 const observer=new MutationObserver(records=>{
  if(!active)return;
  const select=active.select;
  if(!select.isConnected||!eligible(select)||select.closest('[hidden],dialog:not([open]),details:not([open])')||records.some(record=>select.contains(record.target)))close();
 });
 function close() {
  if(!active)return;
  const {select,popup}=active;
  active=null;observer.disconnect();clearTimeout(searchTimer);search='';
  select.setAttribute('aria-expanded','false');
  select.removeAttribute('aria-controls');select.removeAttribute('aria-activedescendant');
  popup.remove();
 }
 function position() {
  if(!active)return;
  const {select,popup}=active,rect=select.getBoundingClientRect();
  if(!rect.width||!rect.height){close();return;}
  const viewport=window.visualViewport,left=viewport?.offsetLeft||0,top=viewport?.offsetTop||0;
  const width=viewport?.width||document.documentElement.clientWidth,height=viewport?.height||window.innerHeight;
  if(rect.bottom<=top||rect.top>=top+height||rect.right<=left||rect.left>=left+width){close();return;}
  const gap=6,margin=12,below=top+height-rect.bottom-gap-margin,above=rect.top-top-gap-margin;
  const up=below<Math.min(280,popup.scrollHeight)&&above>below;
  popup.style.width=Math.min(Math.max(rect.width,240),width-margin*2)+'px';
  popup.style.maxHeight=Math.max(0,Math.min(320,up?above:below))+'px';
  popup.style.left=Math.max(left+margin,Math.min(rect.left,left+width-popup.offsetWidth-margin))+'px';
  popup.style.top=(up?rect.top-gap-popup.offsetHeight:rect.bottom+gap)+'px';
 }
 function highlight(option) {
  if(!active||!option)return;
  active.option=option;
  for(const row of active.popup.querySelectorAll('[role="option"]'))row.classList.toggle('is-active',row.id===active.rows.get(option)?.id);
  const row=active.rows.get(option);
  active.select.setAttribute('aria-activedescendant',row.id);
  row.scrollIntoView({block:'nearest'});
 }
 function open(select) {
  close();
  if(!eligible(select))return;
  const popup=document.createElement('div'),rows=new Map();
  popup.id='select-menu-popup';popup.className='select-menu';popup.setAttribute('role','listbox');
  popup.setAttribute('aria-label',select.getAttribute('aria-label')||Array.from(select.labels||[]).map(label=>label.textContent.trim()).join(' ')||'Выберите значение');
  const selected=select.selectedOptions[0];
  let group=null;
  for(const [index,option] of Array.from(select.options).entries()){
   const parent=option.closest('optgroup');
   if(option.hidden||parent?.hidden)continue;
   if(parent&&parent!==group){const heading=document.createElement('div');heading.className='select-menu-group';heading.textContent=parent.label;popup.append(heading);}
   group=parent;
   const row=document.createElement('div');
   row.id='select-menu-option-'+index;row.className='select-menu-option';row.setAttribute('role','option');
   row.setAttribute('aria-selected',String(option===selected));
   row.setAttribute('aria-disabled',String(option.disabled||!!parent?.disabled));
   row.textContent=option.label;rows.set(option,row);popup.append(row);
  }
  active={select,popup,rows,option:null};
  select.setAttribute('aria-expanded','true');select.setAttribute('aria-controls',popup.id);
  (select.closest('dialog')||document.body).append(popup);
  if(typeof popup.showPopover==='function'){popup.setAttribute('popover','manual');popup.showPopover();}
  position();
  if(!active)return;
  highlight(enabled(select).includes(selected)?selected:enabled(select)[0]);
  observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled','hidden','open']});
 }
 function choose(option) {
  if(!active||!enabled(active.select).includes(option))return;
  const select=active.select,changed=select.selectedIndex!==option.index;
  select.selectedIndex=option.index;close();
  if(changed){select.dispatchEvent(new Event('input',{bubbles:true}));select.dispatchEvent(new Event('change',{bubbles:true}));}
 }
 document.addEventListener('pointerdown',event=>{
  const select=event.target.closest(selector);
  if(eligible(select)){
   // Suppress the platform picker on both mouse and touch without replacing the field.
   event.preventDefault();select.focus({preventScroll:true});
  }else if(active&&!active.popup.contains(event.target))close();
 },true);
 document.addEventListener('mousedown',event=>{
  if(eligible(event.target.closest(selector))||active?.popup.contains(event.target))event.preventDefault();
 },true);
 document.addEventListener('click',event=>{
  const select=event.target.closest(selector);
  if(eligible(select)){
   event.preventDefault();event.stopPropagation();
   if(active?.select===select)close();else open(select);
  }else if(active?.popup.contains(event.target)){
   event.preventDefault();event.stopPropagation();
   const row=event.target.closest('[role="option"]');
   if(row)choose(Array.from(active.rows).find(([,item])=>item===row)?.[0]);
  }
 },true);
 document.addEventListener('pointermove',event=>{
  if(event.pointerType==='touch'||!active)return;
  const row=event.target.closest('.select-menu-option');
  if(row&&active.popup.contains(row)){
   const option=Array.from(active.rows).find(([,item])=>item===row)?.[0];
   if(enabled(active.select).includes(option))highlight(option);
  }
 });
 document.addEventListener('keydown',event=>{
  const select=event.target.closest(selector);
  if(!eligible(select))return;
  if(event.key==='Tab'){close();return;}
  if(event.key==='Escape'&&active){event.preventDefault();event.stopImmediatePropagation();close();return;}
  if(event.ctrlKey||event.metaKey||event.altKey&&event.key!=='ArrowDown'&&event.key!=='ArrowUp')return;
  const keys=['ArrowDown','ArrowUp','Home','End','PageDown','PageUp','Enter',' '];
  const typing=event.key.length===1&&event.key!==' ';
  if(!keys.includes(event.key)&&!typing)return;
  event.preventDefault();event.stopPropagation();
  if(!active||active.select!==select){open(select);if(!active||!typing&&!['Home','End','PageDown','PageUp'].includes(event.key))return;}
  const options=enabled(select),index=options.indexOf(active.option);
  if(event.key==='Enter'||event.key===' '&&!search){choose(active.option);return;}
  if(event.key==='Home')highlight(options[0]);
  else if(event.key==='End')highlight(options.at(-1));
  else if(['ArrowDown','ArrowUp','PageDown','PageUp'].includes(event.key)){
   const step=event.key==='PageDown'?5:event.key==='PageUp'?-5:event.key==='ArrowDown'?1:-1;
   highlight(options[Math.max(0,Math.min(options.length-1,index+step))]);
  }else{
   search+=event.key.toLocaleLowerCase();clearTimeout(searchTimer);searchTimer=setTimeout(()=>search='',650);
   const repeated=Array.from(search).every(char=>char===search[0]),prefix=repeated?search[0]:search;
   const ordered=[...options.slice(index+(repeated?1:0)),...options.slice(0,index+(repeated?1:0))];
   highlight(ordered.find(option=>option.label.trim().toLocaleLowerCase().startsWith(prefix)));
  }
 },true);
 document.addEventListener('focusin',event=>{if(active&&event.target!==active.select)close();});
 document.addEventListener('change',event=>{if(active?.select===event.target)close();},true);
 document.addEventListener('reset',close,true);
 document.addEventListener('close',close,true);
 document.addEventListener('scroll',event=>{if(active&&!active.popup.contains(event.target))position();},true);
 window.addEventListener('resize',position);
 window.addEventListener('blur',close);
 window.visualViewport?.addEventListener('resize',position);
 window.visualViewport?.addEventListener('scroll',position);
}
