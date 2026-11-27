import {addDays,today} from './model.js';
import {durationLabel,sleepMinutes} from './wellness.js';

const key='kontur-time-format';
const pad=value=>String(value).padStart(2,'0');
const sequence=(count,start=0)=>Array.from({length:count},(_,index)=>index+start);
export function readTimeFormat(){
 try{return localStorage.getItem(key)==='12'?'12':'24';}catch{return '24';}
}
export function saveTimeFormat(value){
 try{localStorage.setItem(key,value);return true;}catch{return false;}
}
export function formatSleepTime(value,format){
 if(!value)return '—';
 if(format==='24')return value;
 const hour=Number(value.slice(0,2));
 return (hour%12||12)+value.slice(2)+(hour<12?' AM':' PM');
}
function dateLabel(value){
 if(!value)return 'Выберите дату';
 const day=today();
 const label=new Intl.DateTimeFormat('ru',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));
 return (value===day?'Сегодня, ':value===addDays(day,-1)?'Вчера, ':'')+label;
}
const labels={bed:'Отход ко сну',wake:'Подъём'};
export function sleepFieldsHTML(log,day,format){
 return `<div class="sleep-time-cards">${Object.entries(labels).map(([field,label])=>`<button class="sleep-time-card" type="button" data-sleep-time="${field}" aria-expanded="false" aria-controls="sleep-editor"><span>${label}</span><strong>${formatSleepTime(log[field+'Time'],format)}</strong><small>${dateLabel(field==='bed'?log.bedDate:day)}</small></button>`).join('')}</div><div id="sleep-editor" hidden></div>`;
}
function wheel(name,items){
 return `<div class="sleep-wheel-group"><span id="sleep-wheel-${name}">${name}</span><div class="sleep-wheel" tabindex="0" role="listbox" aria-labelledby="sleep-wheel-${name}">${items.map((item,index)=>`<div id="sleep-option-${name}-${index}" role="option" aria-selected="false">${item}</div>`).join('')}</div></div>`;
}
export function openSleepEditor(button,{day,log,format,save}){
 const form=button.closest('form'),editor=form.querySelector('#sleep-editor');
 const field=button.dataset.sleepTime,bed=field==='bed',twelve=format==='12';
 const [hour,minute]=(log[field+'Time']||(bed?'22:00':'07:00')).split(':').map(Number);
 const hours=sequence(twelve?12:24,twelve?1:0).map(pad);
 form.querySelectorAll('[data-sleep-time]').forEach(card=>card.setAttribute('aria-expanded',String(card===button)));
 editor.hidden=false;
 editor.innerHTML=`<div class="sleep-editor-heading"><strong>${labels[field]}</strong>${bed?`<input type="date" class="field" aria-label="Дата отхода ко сну" max="${day}" value="${log.bedDate||addDays(day,-1)}">`:`<small>${dateLabel(day)}</small>`}</div><div class="sleep-wheels">${wheel('Часы',hours)}${wheel('Минуты',sequence(60).map(pad))}${twelve?wheel('Период',['AM','PM']):''}</div><div class="sleep-editor-actions"><button class="secondary-button" type="button" data-sleep-cancel>Отмена</button>${log[field+'Time']?'<button class="text-button" type="button" data-sleep-clear>Очистить</button>':''}<button class="primary-button" type="button" data-sleep-save>Сохранить</button></div>`;
 const wheels=[...editor.querySelectorAll('.sleep-wheel')],date=editor.querySelector('input');
 const duration=form.querySelector('#sleep-duration');
 const original=durationLabel(sleepMinutes(day,log));
 const error=form.querySelector('#diary-error');
 const rowHeight=wheel=>wheel.firstElementChild.offsetHeight;
 const position=wheel=>Math.min(wheel.children.length-1,Math.max(0,Math.round(wheel.scrollTop/rowHeight(wheel))));
 const go=(wheel,index)=>{wheel.scrollTop=index*rowHeight(wheel);};
 function values(clear=false){
  const [h,m,period]=wheels.map(position);
  const hh=twelve?(h+1)%12+12*period:h;
  const time=clear?'':pad(hh)+':'+pad(m);
  return bed?{bedTime:time,bedDate:clear?'':date.value}:{wakeTime:time};
 }
 function preview(){
  for(const list of wheels){
   const option=list.children[position(list)];
   if(!option)continue;
   list.querySelector('[aria-selected="true"]')?.setAttribute('aria-selected','false');
   option.setAttribute('aria-selected','true');
   list.setAttribute('aria-activedescendant',option.id);
  }
  duration.textContent=durationLabel(sleepMinutes(day,{...log,...values()}));
 }
 go(wheels[0],twelve?(hour+11)%12:hour);
 go(wheels[1],minute);
 if(twelve)go(wheels[2],Number(hour>=12));
 for(const list of wheels){
  list.addEventListener('scroll',preview);
  list.addEventListener('click',event=>{
   const option=event.target.closest('[role="option"]');
   if(option)go(list,[...list.children].indexOf(option));
  });
  list.addEventListener('keydown',event=>{
   const index={ArrowUp:position(list)-1,ArrowDown:position(list)+1,Home:0,End:list.children.length-1}[event.key];
   if(index===undefined)return;
   event.preventDefault();go(list,index);
  });
 }
 date?.addEventListener('input',preview);
 function close(){
  editor.hidden=true;editor.replaceChildren();
  button.setAttribute('aria-expanded','false');
  button.focus();
 }
 function commit(clear){
  if(!clear&&date&&(!date.value||!date.reportValidity())){date.focus();return;}
  try{save(values(clear));}catch(e){error.textContent=e.message;}
 }
 error.textContent='';
 editor.querySelector('[data-sleep-cancel]').onclick=()=>{duration.textContent=original;error.textContent='';close();};
 editor.querySelector('[data-sleep-save]').onclick=()=>commit(false);
 const clear=editor.querySelector('[data-sleep-clear]');
 if(clear)clear.onclick=()=>commit(true);
 preview();
}
