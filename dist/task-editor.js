import {recurrenceLabel} from './recurrence.js';

const completeLabel=value=>value?new Date(value+'T12:00:00Z').toLocaleDateString('ru-RU',{day:'numeric',month:'short',timeZone:'UTC'}):'';

export function initTaskEditor(form){
 const get=selector=>form.querySelector(selector);
 const panels=[...form.querySelectorAll('[data-task-panel]')];
 const modal=form.closest('dialog'),signal=editorSignal(modal);
 const title=get('#edit-title');
 const parent=get('#edit-task-parent'),status=get('#edit-status'),completed=get('#edit-completed');
 const filterButtons=[...form.querySelectorAll('[data-parent-filter]')];
 const groups=[...form.querySelectorAll('[data-parent-group]')];
 const search=get('#task-parent-search');
 const repeatFields=[...get('[data-task-panel="repeat"]').querySelectorAll('input,select')];
 let current='main',trigger,priorDate,priorRepeat,filter='all';

 function resizeTitle(){
  if(!form.isConnected||!title.offsetWidth||CSS.supports('field-sizing','content'))return;
  title.style.height='auto';
  title.style.height=title.scrollHeight+title.offsetHeight-title.clientHeight+'px';
 }
 function show(panel){
  current=panel;
  form.dataset.editorPanel=panel;
  panels.forEach(item=>item.hidden=item.dataset.taskPanel!==panel);
  const target=get('[data-task-panel="'+panel+'"]');
  if(panel==='main'){resizeTitle();trigger?.focus();}
  else target.querySelector('h2').focus();
 }
 function updateParents(){
  const query=search.value.trim().toLocaleLowerCase();
  let visible=false;
  for(const group of groups){
   let matches=false;
   for(const option of group.querySelectorAll('.task-parent-option')){
    option.hidden=(filter!=='all'&&filter!==group.dataset.parentGroup)||!option.textContent.toLocaleLowerCase().includes(query);
    matches||=!option.hidden;
   }
   group.hidden=!matches;
   visible||=matches;
  }
  get('#task-parent-empty').hidden=visible;
  get('[data-task-panel="parent"] [data-editor-confirm]').disabled=!get('[name="task-parent-choice"]:checked:not(:disabled)')?.closest('.task-parent-option:not([hidden])');
 }
 function setChoice(name,value){
  for(const choice of form.querySelectorAll(`[name="${name}"]`))choice.checked=choice.value===value;
 }
 function completionPreview(){
  get('#completed-date-wrap').hidden=get('[name="task-status-choice"]:checked').value!=='done';
  get('#completed-date-summary').textContent=completed.value?'Выполнена '+completeLabel(completed.value):'Дата выполнения не указана';
 }
 function open(panel){
  if(panel==='parent'){
   setChoice('task-parent-choice',parent.value);
   search.value='';
   filterButtons[0].click();
  }else if(panel==='status'){
   priorDate=completed.value;
   setChoice('task-status-choice',status.value);
   get('#task-completed-details').open=false;
   completionPreview();
  }else if(panel==='repeat')priorRepeat=repeatFields.map(field=>field.value);
  show(panel);
 }
 function back(){
  if(current==='status'&&priorDate!==undefined)completed.value=priorDate;
  if(current==='repeat'&&priorRepeat){
   repeatFields.forEach((field,index)=>field.value=priorRepeat[index]);
   get('#edit-recurrence').dispatchEvent(new Event('change',{bubbles:true}));
  }
  show(current==='file'?'actions':'main');
 }
 function confirm(){
  if(current==='parent'){
   const choice=get('[name="task-parent-choice"]:checked');
   if(!choice||choice.closest('.task-parent-option').hidden)return;
   const row=choice.closest('label');
   parent.value=choice.value;
   get('#task-parent-name').textContent=row.querySelector('strong').textContent;
   get('#task-parent-path').textContent=row.querySelector('small').textContent;
  }else if(current==='status'){
   const choice=get('[name="task-status-choice"]:checked');
   status.value=choice.value;
   get('#task-status-value').textContent=choice.nextElementSibling.textContent+(status.value==='done'&&completed.value?' · '+completeLabel(completed.value):'');
  }else if(current==='repeat'){
   if(!repeatFields.every(field=>field.reportValidity()))return;
   const recurrence=get('#edit-recurrence').value,repeatEvery=get('#edit-repeat-every').value,repeatUnit=get('#edit-repeat-unit').value;
   get('#task-repeat-value').textContent=recurrence==='none'?'Нет':recurrenceLabel({recurrence,repeatEvery,repeatUnit});
  }
  show('main');
 }
 form.addEventListener('click',event=>{
  const button=event.target.closest('button');
  if(!button)return;
  if(button.dataset.editorOpen){
   if(current==='main')trigger=button;
   open(button.dataset.editorOpen);
  }else if(button.hasAttribute('data-editor-back'))back();
  else if(button.hasAttribute('data-editor-confirm'))confirm();
  else if(button.dataset.parentFilter){
   filter=button.dataset.parentFilter;
   for(const item of filterButtons)item.setAttribute('aria-pressed',String(item===button));
   updateParents();
  }
 });
 form.addEventListener('change',event=>{
  if(event.target.name==='task-parent-choice')updateParents();
  if(event.target.name==='task-status-choice'||event.target===completed)completionPreview();
 });
 form.addEventListener('input',event=>{
  if(event.target===title)resizeTitle();
  if(event.target===search)updateParents();
 });
 form.addEventListener('submit',event=>{
  if(current==='main')return;
  event.preventDefault();
  event.stopPropagation();
 });
 form.addEventListener('invalid',event=>{
  const panel=event.target.closest('[data-task-panel]');
  if(current==='main'&&panel?.hidden)open(panel.dataset.taskPanel);
 },true);
 modal.addEventListener('cancel',event=>{
  if(!form.isConnected||current==='main')return;
  event.preventDefault();
  back();
 },{signal});
 window.addEventListener('resize',resizeTitle,{signal});
 resizeTitle();
}
const editors=new WeakMap();
function editorSignal(modal){
 editors.get(modal)?.abort();
 const controller=new AbortController();
 editors.set(modal,controller);
 return controller.signal;
}
