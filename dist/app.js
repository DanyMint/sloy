import {initTaskContextMenu,chooseTaskDestination} from './task-context-menu.js';
import {taskMenuTargets,completionTargets,completeTasks,taskPlanOptions,planTasks,taskBranchSelection,movableRoots,movingToScope,moveTaskRoots} from './task-commands.js';
import {createUndoHistory} from './undo-history.js';
import {initTaskEditor} from './task-editor.js';
import {openSleepEditor,readTimeFormat,saveTimeFormat,sleepFieldsHTML} from './sleep-picker.js';
import {WEEKLY_VIEW_KEY,normalizeWeeklyView,readWeeklyView,saveWeeklyView} from './planning-preferences.js';
import {weeklyPlanningContext,weeklySourcesHTML,weeklyTaskRowHTML} from './weekly-planning.js';
import {initVaultPicker} from './vault-picker.js';
import {initSelectMenus} from './select-menu.js';
import {initMobileShell} from './mobile-shell.js';
import {enableTaskSwipe,canSwipeTask,taskSwipeAttrs} from './task-swipe.js';
import {sidebarTreeHTML,scopeHTML,todayHTML,todayPickerHTML,habitWeekHTML,overdueHTML} from './workspace-v2.js';
import {dayStartPage,addOverplan} from './day-flow.js';
import {enableHabitHold} from './habit-input.js';
import {repeatForm} from './recurrence.js';
import {boardConfig,boardSettingsHTML,applyBoard,moveKanbanTask} from './kanban.js';
import {enableTaskDragging} from './drag-drop.js';
import {recurrenceLabel} from './recurrence.js';
import {journalPlan as getPlan,freezeJournal as freezePlan,weeklyTasks,selectJournalTask,selectFocus,addDayTask,addJournalTask,unifyDayReflection,unfreezeJournal} from './journal.js';
import {focusPlannerHTML,focusCount,yearStatsHTML,quarterStatsHTML,taskChartHTML} from './journal-pages.js';
import {saveHabit,deleteHabit,setHabitValue,incrementHabit,saveDayLog,sleepMinutes,durationLabel,validDay} from './wellness.js';
import {diaryWeekHTML,adjacentPeriodsHTML,plannerDiaryHTML,habitForm,habitDeleteConfirmation,habitEntryForm,analyticsHTML} from './wellness-pages.js';
import {normalizeState,newId,saveArea,saveProject,setTaskParent,setTaskStatus,projectArea,materializeRepeats,isTaskActive,setProjectArchived,deleteProject,setProjectCompleted,isProjectAvailable,rememberTaskListOrder,reorderTaskList} from './domain.js';
import {entityForm,taskForm,statusBadge,subtasksHTML} from './pages.js';
import {STORAGE_KEY,clone,today,dateOf,addDays,period,shiftPeriod,comparison,tasksMarkdown,planMarkdown,validateBackup,seedState} from './model.js';
const $=s=>document.querySelector(s);
initSelectMenus();
const mobileShell=initMobileShell();
initVaultPicker({button:$('#obsidian-vault-browse'),input:$('#obsidian-vault-path'),fallback:$('#obsidian-vault-folder'),status:$('#obsidian-vault-selection')});
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let loadError=false,state;
try {const raw=localStorage.getItem(STORAGE_KEY);state=raw?validateBackup(JSON.parse(raw)):seedState();} catch {state=seedState();loadError=true;}
const query=new URLSearchParams(location.search);
let type=['day','week','quarter','year'].includes(query.get('view'))?query.get('view'):query.get('view')==='month'?'quarter':'day';
if(query.get('page')==='diary')type='day';
let anchor=/^\d{4}-\d{2}-\d{2}$/.test(query.get('date')||'')&&!Number.isNaN(dateOf(query.get('date')).getTime())?query.get('date'):today();
let timeFormat=readTimeFormat();
let weeklyView=readWeeklyView(),weeklyScope='all';
let search='',filter='all',toastTimer,editingId=null;
let page=['today','planner','zones','projects','areas','habits','analytics','settings'].includes(query.get('page'))?query.get('page'):'planner',entityId=query.get('entity')||'';
let appDay=today(),habitEntryDate=today(),editingDestination='',editingRepeatId='',treeClickTimer,treeExpanded={},scopeLayouts={},collapsedSections={};
try{treeExpanded=JSON.parse(localStorage.getItem('kontur-tree')||'{}');scopeLayouts=JSON.parse(localStorage.getItem('kontur-project-layouts')||'{}');const previous=localStorage.getItem('kontur-open-day');if(previous&&previous!==appDay||query.get('page')==='tasks'||!query.has('page')&&!query.has('view')){page=dayStartPage(state,appDay);type='day';anchor=appDay;}localStorage.setItem('kontur-open-day',appDay);}catch{}
let logDate=anchor,habitArchiveOpen=false,habitView='cards',analyticsContext={anchor,span:4,grain:'week',x:'sleep',y:'productivity',chart:'overlay'};
try{if(localStorage.getItem('kontur-habit-view')==='list')habitView='list';}catch{}
if(query.get('page')==='diary')history.replaceState(null,'','?page=planner&view='+type+'&date='+anchor);
const wellnessPage=()=>['habits','analytics'].includes(page);
const collectionViews={projects:'cards',areas:'cards',tasks:'table'};
let kanbanDraft=null;
try{if(localStorage.getItem('kontur-tasks-view')==='kanban')collectionViews.tasks='kanban';}catch{}
try{for(const key of Object.keys(collectionViews))if(localStorage.getItem('kontur-'+key+'-view')==='list')collectionViews[key]='list';}catch{}
const desktopTasks={selection:new Set(),modes:new Map()};
const desktopPointer=matchMedia('(any-pointer: fine)');
const undoHistory=createUndoHistory();
const collectionContext=()=>({page,entityId,layout:scopeLayouts[entityId]||'table',desktopTasks:desktopPointer.matches?desktopTasks:null,selection:desktopTasks.selection});
function navigatePage(next,id=''){desktopTasks.selection.clear();mobileShell.close();page=next;entityId=id;history.replaceState(null,'','?page='+page+(id?'&entity='+encodeURIComponent(id):'')+'&view='+type+'&date='+(page==='habits'?logDate:page==='analytics'?analyticsContext.anchor:anchor));render();window.scrollTo({top:0,behavior:'instant'});}
function renderSidebar(){
 const tree=sidebarTreeHTML(state,{page,entityId,expanded:treeExpanded});$('#sidebar-tree').innerHTML=tree;$('#zones-tree').innerHTML=tree;
 document.querySelectorAll('#page-nav [data-page],.sidebar-system [data-page],#mobile-nav [data-page],#mobile-menu [data-page]').forEach(b=>{const active=b.dataset.page===page||!!b.closest('#mobile-nav')&&b.dataset.page==='zones'&&['areas','projects'].includes(page);b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
 mobileShell.sync(page);
}
function restoreSections(){document.querySelectorAll('[data-collapse-key]').forEach(e=>{if(Object.hasOwn(collapsedSections,e.dataset.collapseKey))e.open=collapsedSections[e.dataset.collapseKey];});}
function render(){
 const restoreMenu=closeTaskMenu(false);
 normalizeState(state);if(materializeRepeats(state,today()))persist({track:false});renderSidebar();
 $('#settings-view').hidden=page!=='settings';$('#zones-view').hidden=page!=='zones';$('#today-view').hidden=page!=='today';$('#planner-view').hidden=page!=='planner';$('#collection-view').hidden=!['projects','areas'].includes(page);$('#wellness-view').hidden=!wellnessPage();
 document.title=({today:'Сегодня',planner:'Journal',zones:'Зоны и проекты',projects:'Проект',areas:'Зона',habits:'Привычки',analytics:'Аналитика',settings:'Настройки'}[page])+' — Sloy';
 if(page==='today')$('#today-view').innerHTML=todayHTML(state);
 else if(page==='planner')renderPlanner();
 else if(page==='settings'){$('#obsidian-vault-path').value=state.vaultPath||'';renderWeeklyViewSetting();renderTimeFormat();}
 else if(wellnessPage())renderWellness();
 else if(['projects','areas'].includes(page)){
  $('#collection-view').innerHTML=scopeHTML(state,collectionContext());
  if(desktopTasks.selection.size){
   const rowIds=new Set(scopeTaskRows().map(row=>row.dataset.taskId));
   for(const id of desktopTasks.selection)if(!rowIds.has(id))desktopTasks.selection.delete(id);
  }
 }
 restoreSections();
 restoreMenu?.();
}
function renderTimeFormat(){document.querySelectorAll('input[name="time-format"]').forEach(input=>input.checked=input.value===timeFormat);}
function renderWeeklyViewSetting(){document.querySelectorAll('input[name="weekly-source-view"]').forEach(input=>input.checked=input.value===weeklyView);}
function renderWellness(){const scroll=window.scrollY,scroller=$('.habit-week-scroller'),left=scroller?.scrollLeft||0;$('#wellness-view').innerHTML=page==='habits'?habitWeekHTML(state,logDate,{archiveOpen:habitArchiveOpen}):analyticsHTML(state,analyticsContext);const next=$('.habit-week-scroller');if(next)next.scrollLeft=left;restoreSections();window.scrollTo(0,scroll);}
function navigateDay(day){if(!validDay(day))return;if(page==='planner'){navigate(type,day);return;}logDate=day;history.replaceState(null,'','?page='+page+'&date='+day);renderWellness();}
function habitDay(){if($('#habit-entry-form'))return habitEntryDate;if(page==='today'||page==='habits')return today();if(page==='planner'&&type==='day')return anchor;throw new Error('Откройте страницу дня.');}
function renderPlannerHabits(){$('#planner-habits').hidden=true;$('#planner-habits').innerHTML='';}
function refreshHabits(){if(page==='today'){$('#today-view').innerHTML=todayHTML(state);restoreSections();}else if(page==='habits')renderWellness();}
function showHabit(id='',preset=''){if(page!=='habits')return;openModal(habitForm(state.habits.find(h=>h.id===id)||{},preset));}
function saveHabitForm(event){event.preventDefault();if(page!=='habits')return;try{saveHabit(state,{id:event.target.dataset.id,name:$('#habit-name').value,unit:$('#habit-unit').value,step:$('#habit-step').value,target:$('#habit-target').value,icon:$('#habit-form input[name="habit-icon"]:checked')?.value||''},today());persist();closeModal();refreshHabits();toast('Привычка сохранена');}catch(e){$('#habit-error').textContent=e.message;}}
function saveHabitEntry(event){event.preventDefault();try{setHabitValue(state,event.target.dataset.id,habitDay(),$('#habit-amount').value);persist();closeModal();refreshHabits();toast('Результат дня сохранён');}catch(e){$('#habit-error').textContent=e.message;}}
function editDayField(key,update){
 if(window.nativeSloy){window.nativeSloy.editDayField(key,update);return;}
 update(state);persist();
}
function saveDiary(event){
 if(event)event.preventDefault();
 if(!$('#diary-form'))return;
 const day=anchor,wellbeing=$('#diary-form input[name="wellbeing"]:checked')?.value??null;
 try{
  editDayField(day+':wellbeing',next=>saveDayLog(next,day,{...next.dayLogs[day],wellbeing}));
  renderPeriodSelector();$('#diary-error').textContent='';
 }catch(e){$('#diary-error').textContent=e.message;}
}
document.addEventListener('click',event=>{
 const button=event.target.closest('[data-sleep-time]');
 if(!button)return;
 const day=anchor;
 openSleepEditor(button,{day,log:state.dayLogs[day]||{},format:timeFormat,save:fields=>{
  editDayField(day+':sleep',next=>saveDayLog(next,day,{...next.dayLogs[day],...fields}));
  const log=state.dayLogs[day];
  $('#sleep-fields').innerHTML=sleepFieldsHTML(log,day,timeFormat);
  $('#sleep-duration').textContent=durationLabel(sleepMinutes(day,log));
  $('#diary-error').textContent='';
  renderPeriodSelector();$(`[data-sleep-time="${button.dataset.sleepTime}"]`).focus();
 }});
});
function showEntity(kind,id='',defaults={}){const entity=state[kind==='project'?'projects':'areas'].find(x=>x.id===id)||{};openModal(entityForm(state,kind,entity,defaults));}
function saveEntity(event){event.preventDefault();const form=event.target,fields={id:form.dataset.id,name:$('#entity-name').value,icon:$('#entity-form input[name="entity-icon"]:checked')?.value||'',description:$('#entity-description').value,parentId:$('#entity-parent')?.value||null,areaId:$('#entity-area')?.value||null};try{const entity=form.dataset.kind==='project'?saveProject(state,fields):saveArea(state,fields);persist();closeModal();render();toast('Сохранено: '+entity.name);}catch(e){$('#entity-error').textContent=e.message;}}
function confirmProjectAction(id,remove=false){
 const project=state.projects.find(p=>p.id===id);if(!project)return;
 const children=state.projects.filter(p=>p.parentId===id),ids=new Set([id,...children.map(p=>p.id)]),tasks=state.tasks.filter(t=>ids.has(t.projectId)),area=state.areas.find(a=>a.id===projectArea(state,project));
 const description=remove?`Проект${children.length?' и подпроекты ('+children.length+')':''} ${children.length?'будут удалены':'будет удалён'}. Задачи (${tasks.length}) останутся самостоятельными в ${area?'зоне «'+esc(area.name)+'»':'разделе «Без зоны»'}. Снимки планов сохранят исходные названия и состав. Восстановить структуру проекта после удаления нельзя.`:`Проект${children.length?' и подпроекты ('+children.length+')':''} ${children.length?'исчезнут':'исчезнет'} из рабочего дерева и новых планов. Задачи (${tasks.length}) и история сохранятся, новые повторения будут приостановлены. Проект можно восстановить из архива.`;
 openModal(`<h2>${remove?'Удалить':'Архивировать'} проект?</h2><p class="modal-description">${esc(project.name)}</p><div class="hint-box">${description}</div><div class="modal-actions"><button class="secondary-button" data-action="close-modal">Отмена</button><button class="${remove?'danger-button':'primary-button'}" data-action="confirm-${remove?'delete':'archive'}-project" data-id="${esc(id)}">${remove?'Удалить проект':'Архивировать'}</button></div>`);
}
const modal=$('#modal');
const dateFormat=(date,options={day:'numeric',month:'short'})=>dateOf(date).toLocaleDateString('ru-RU',{...options,timeZone:'UTC'}).replace(/ г\.$/,'');
const number=n=>Number(n||0).toLocaleString('ru-RU');
function persist(options) {
 if(!saveState())return false;
 undoHistory.record(state,options);
 return true;
}
function saveState() {try {localStorage.setItem(STORAGE_KEY,JSON.stringify(state));return true;} catch {toast('Не удалось сохранить. Скачайте резервную копию.');return false;}}
function toast(message,undo=false) {
 clearTimeout(toastTimer);
 const notice=$('#toast');
 notice.textContent=message;
 if(undo){
  const button=document.createElement('button');
  button.type='button';
  button.dataset.action='undo-task-move';
  button.textContent='Отменить';
  button.title='Ctrl+Z';
  notice.append(button);
 }
 notice.classList.add('show');
 toastTimer=setTimeout(()=>{notice.classList.remove('show');notice.querySelector('button')?.remove();},undo?8000:4200);
}
function current() {return period(type,anchor);}
function navigate(nextType,nextAnchor=anchor) {mobileShell.close();page='planner';entityId='';type=nextType;anchor=nextAnchor;logDate=nextAnchor;search='';filter='all';weeklyScope='all';$('#task-search').value='';$('#task-filter').value='all';history.replaceState(null,'','?view='+type+'&date='+anchor);render();}
function showPeriodJump(){openModal('<h2>Выбрать период</h2><form id="period-jump-form"><label class="form-label" for="jump-date">Дата</label><input class="field" id="jump-date" type="date" required value="'+anchor+'"><div class="modal-actions"><button type="button" class="secondary-button" data-action="close-modal">Отмена</button><button class="primary-button" type="submit">Перейти</button></div></form>');}
function projectPill(project) {const colors={Athena:'purple','Система':'green','Обучение':'blue','Личное':'orange','Карьера':'blue'};return '<span class="project-pill" data-color="'+(colors[project]||'purple')+'">'+esc(project)+'</span>';}
function meta(t,includeSource=false) {return projectPill(t.project)+(t.estimate?'<span>·</span><span>'+number(t.estimate)+' ч</span>':'')+(t.due?'<span>·</span><span class="due '+(!t.done&&!t.cancelled&&t.due<today()?'overdue':'')+'">'+dateFormat(t.due)+'</span>':'')+(includeSource?'<span>·</span><span>'+esc(t.source)+'</span>':'');}
function liveStatus(live,p) {
  if(!live)return ['Нет исходной задачи','orange'];
  if(live.cancelled)return ['Отменена','orange'];
  if(live.someday)return ['Когда-нибудь','orange'];
  if(live.skipped)return ['Пропущена','orange'];
  if(!live.done)return !isTaskActive(state,live)?['В архиве','orange']:['Не выполнена',''];
  if(!live.completedAt)return ['Без даты','orange'];
  if(live.completedAt<p.start)return ['Сделано ранее','orange'];
  if(live.completedAt>p.end)return ['После периода','orange'];
  return [live.archived?'Выполнена · архив':'Выполнена','green'];
}
function renderPeriodSelector(){
  $('.planner-calendar').dataset.view=type;
  $('.planner-calendar').setAttribute('aria-label',type==='day'?'Дни недели':'Выбор периода');
  $('#period-selector').innerHTML=type==='day'?diaryWeekHTML(state,anchor):adjacentPeriodsHTML(type,anchor);
}
function renderPlanner() {
  const liveScroll=$('#task-list').scrollTop,planScroll=$('#plan-task-list')?.scrollTop||0,quarterScroll=$('.quarter-catalog-scroll')?.scrollTop||0;
  const p=current(),plan=getPlan(state,p),c=comparison(state,p),frozen=!!plan.snapshot;
  const names={year:anchor.slice(0,4),quarter:period('quarter',anchor).label,week:period('week',anchor).label.split(' · ')[0],day:dateFormat(anchor)};
  const labels={year:'Год',quarter:'Квартал',week:'Неделя',day:'День'};
  $('#period-path').innerHTML=Object.entries(names).map(([key,name])=>'<button data-action="period-type" data-type="'+key+'" aria-label="'+labels[key]+': '+name+'" title="'+labels[key]+'. Нажмите ещё раз для выбора даты" class="'+(type===key?'current':'')+'" '+(type===key?'aria-current="page"':'')+'>'+(key==='quarter'?'<span class="period-label-full">'+name+'</span><span class="period-label-short" aria-hidden="true">'+name.replace('квартал','кв.')+'</span>':name)+'</button>').join('<span aria-hidden="true">›</span>');
  $('#planner-view').dataset.view=type;
  renderPeriodSelector();
  $('#planner-diary').innerHTML='';
  if(type==='day')unifyDayReflection(state,anchor);
  renderPlannerHabits();
  $('#planner-overdue').innerHTML=type==='day'?overdueHTML(state,anchor):'';
  $('#journal-focus').innerHTML=['year','quarter'].includes(type)?focusPlannerHTML(state,p):'';
  const projectHorizon=['year','quarter'].includes(type);
  $('.board').hidden=projectHorizon;
  $('.board').dataset.view=type;
  $('.board').classList.toggle('is-fixed-day',type==='day'&&frozen);
  $('#journal-statistics').hidden=projectHorizon;
  $('#year-statistics').hidden=!projectHorizon;
  $('#year-statistics').setAttribute('aria-label',type==='quarter'?'Статистика фокуса квартала':'Статистика фокуса года');
  $('#year-statistics').innerHTML=projectHorizon?(type==='year'?yearStatsHTML(state,p):quarterStatsHTML(state,p)):'';
  if(projectHorizon){$('#plan-content').innerHTML='';$('#task-list').innerHTML='';$('#reflection-section').innerHTML='';if($('.quarter-catalog-scroll'))$('.quarter-catalog-scroll').scrollTop=quarterScroll;return;}
  const capacity=plan.snapshot?.capacity??plan.capacity;
  const metrics=[
    {label:'В '+(frozen?'исходном плане':'черновике'),icon:'▤',value:c.total,unit:plural(c.total,['задача','задачи','задач']),desc:frozen?'состав сохранён':'выберите задачи для плана'},
    {label:'Выполнено по плану',icon:'✓',value:c.done,unit:'/ '+c.total,desc:Math.round(c.done/Math.max(c.total,1)*100)+'% в этом периоде',progress:c.done/Math.max(c.total,1)*100},
    {label:'Объём плана',icon:'◷',value:number(c.hours),unit:'ч / '+number(capacity)+' ч',desc:c.hours>capacity?'выше доступного времени на '+number(c.hours-capacity)+' ч':'есть '+number(Math.max(capacity-c.hours,0))+' ч свободного времени'},
    {label:'Сделано вне плана',icon:'↗',value:c.extras.length,unit:plural(c.extras.length,['задача','задачи','задач']),desc:'видно в факте, не меняет план'}
  ];
  $('#metrics').innerHTML=metrics.map(m=>'<div class="metric"><div class="metric-label"><span class="metric-icon">'+m.icon+'</span>'+m.label+'</div><div class="metric-number">'+m.value+'<span>'+m.unit+'</span></div><div class="metric-desc">'+m.desc+(m.progress!==undefined?'<span class="tiny-progress"><i style="width:'+m.progress+'%"></i></span>':'')+'</div></div>').join('');
  $('#plan-content').innerHTML='<div class="panel-header"><div class="panel-heading"><div><h2>'+(frozen?'Зафиксированный план':type==='day'?'План дня':'Собираем план')+'</h2><p>'+(type==='day'?'Первоначальный план дня':frozen?'То, что вы решили в начале периода':'Что действительно важно в этом периоде')+'</p></div></div><span class="badge '+(frozen?'frozen':'')+'">'+(frozen?'◈ Зафиксирован':'Черновик')+'</span></div><div class="focus-block"><div class="focus-label"><span>◎</span> ФОКУС ПЕРИОДА</div>'+(frozen?'<div class="focus-text">'+esc(plan.snapshot.goal||'Фокус не задан')+'</div>':'<textarea id="plan-goal" aria-label="Фокус периода" placeholder="Какой результат сделает этот период удачным?" maxlength="2000">'+esc(plan.goal)+'</textarea>')+'</div><div class="plan-list-label"><span>'+(frozen?'ПЛАН НА СТАРТЕ':'ЗАДАЧИ В ПЛАНЕ')+'</span><span>'+(frozen?'ФАКТ':'ОЦЕНКА')+'</span></div><div id="plan-task-list" class="plan-task-list" tabindex="0" aria-label="Задачи в плане">'+ (c.total?c.rows.map((row,index)=>planRow(row,index,p,frozen)).join(''):'<div class="empty-state"><span class="empty-symbol">⊹</span>Оставьте в плане главное<p>Выберите задачи из списка.<br>Статусы выполнения останутся общими для всех периодов.</p></div>')+'</div><div class="plan-footer"><div class="capacity-row"><span>'+number(c.hours)+' ч из '+number(capacity)+' ч доступны</span>'+(frozen?'<span>'+Math.round(c.hours/Math.max(capacity,1)*100)+'% загрузки</span>':'<label>Ёмкость <input id="plan-capacity" type="number" min="0" max="8760" step="0.5" aria-label="Доступно часов" value="'+capacity+'"> ч</label>')+'</div><div class="capacity-bar '+(c.hours>capacity?'over':'')+'"><i style="width:'+Math.min(c.hours/Math.max(capacity,1)*100,100)+'%"></i></div>'+(frozen?'<div class="frozen-footer"><span>◈ '+dateFormat(plan.snapshot.at.slice(0,10),{day:'numeric',month:'short',year:'numeric'})+' · '+c.total+' '+plural(c.total,['задача','задачи','задач'])+'</span><button class="text-button" data-action="unfreeze">Снять фиксацию</button></div>':'<button class="primary-button wide" data-action="freeze" '+(!c.total&&!focusCount(state,p)&&type!=='day'?'disabled':'')+'><span>◇</span> Зафиксировать план</button><p class="button-caption">Состав и оценки сохранятся. Статусы останутся живыми.</p>')+'</div>';
  const dropPanel=$('.plan-panel');if(!frozen)dropPanel.setAttribute('data-drop-plan','');else dropPanel.removeAttribute('data-drop-plan');
  $('#live-count').textContent=state.tasks.filter(t=>isTaskActive(state,t)).length;
  $('#live-footnote').textContent=frozen?'Состав плана зафиксирован':'Нажмите +, чтобы включить в план';
  renderTasks();$('#task-list').scrollTop=liveScroll;$('#plan-task-list').scrollTop=planScroll;
  const dayExtras=[...c.extras,...(plan.overplan||[]).map(id=>state.tasks.find(t=>t.id===id)).filter(t=>t&&!c.extras.some(e=>e.id===t.id))];
  $('#reflection-section').innerHTML=type==='day'?'<section class="reflection-section" aria-label="Итоги и рефлексия"><div><div class="reflection-title"><span>↳</span> Вне плана <span class="count">'+dayExtras.length+'</span></div>'+(dayExtras.length?'<div class="extra-items">'+dayExtras.map(t=>'<div class="extra-item"><span>'+(t.done?'✓':'○')+'</span>'+esc(t.title)+'<span class="muted-tag">'+(t.done?(t.completedAt?dateFormat(t.completedAt):'Выполнена без даты'):t.skipped?'Пропущена':t.cancelled?'Отменена':'Не выполнена')+'</span></div>').join('')+'</div>':'<div class="no-extras">Здесь появятся задачи, выполненные в этом периоде<br>и не включённые в исходный план.</div>')+'</div><div class="day-reflection"><div class="reflection-title"><span>✎</span> Что беру с собой дальше</div><textarea id="reflection" aria-label="Что беру с собой дальше" maxlength="20000" placeholder="Что получилось? Что перенести? Что изменить?">'+esc(plan.reflection)+'</textarea>'+plannerDiaryHTML(state,anchor,timeFormat)+'</div></section>':'';
  $('#period-chart').innerHTML=taskChartHTML(c,frozen);
  $('.journal-stats-heading h2').textContent=type==='day'?'Итоги дня':type==='week'?'Итоги недели':'Итоги квартала';
  $('.journal-stats-heading>span').textContent=frozen?'По зафиксированному плану':'По текущему черновику';
  const focus=$('#plan-content .focus-block');if(focus)focus.hidden=type==='day';
  if(type==='day'){const empty=$('#plan-content .empty-state');if(empty)empty.innerHTML='Выберите задачи на день<p>Перетащите задачи из недельного плана или нажмите +.</p>';}
}
function plural(n,forms){return forms[n%10===1&&n%100!==11?0:[2,3,4].includes(n%10)&&![12,13,14].includes(n%100)?1:2];}
function planRow({item,live,changed,done},index,p,frozen) {
  const [status,color]=liveStatus(live,p);
  return '<div class="plan-row" '+taskSwipeAttrs(state,live)+'>'+'<span class="plan-index '+(done?'done':'')+'">'+(done?'✓':String(index+1).padStart(2,'0'))+'</span>'+ '<div class="plan-row-body">'+(type==='day'&&live?'<button class="plan-task-title '+(done?'is-done':'')+'" data-action="edit-task" data-id="'+esc(item.id)+'">'+esc(item.title)+'</button>':'<div class="plan-task-title '+(done?'is-done':'')+'">'+esc(item.title)+'</div>')+'<div class="task-meta">'+meta(item)+(frozen&&live?.completedAt?'<span>·</span><span>'+dateFormat(live.completedAt)+'</span>':'')+'</div>'+(frozen&&changed?'<div class="change-note">Изменено в живой задаче: '+esc(live.title!==item.title?live.title:'оценка или срок')+(live.estimate!==item.estimate?' · '+number(live.estimate)+' ч':'')+(live.due!==item.due?' · срок '+(live.due?dateFormat(live.due):'убран'):'')+(live.project!==item.project?' · '+esc(live.project):'')+'</div>':'')+'</div><div class="plan-right">'+(frozen?'<span class="status-inline '+color+'">'+status+'</span>':'<span>'+number(item.estimate)+' ч</span><button class="remove-selection" data-action="select-task" data-id="'+esc(item.id)+'" aria-label="Убрать из плана: '+esc(item.title)+'">×</button>')+'</div></div>';
}
function journalTaskRow(t,ids,frozen){return '<div class="task-row" '+taskSwipeAttrs(state,t)+' '+(!frozen&&!t.cancelled?'draggable="true" data-drag-task="'+esc(t.id)+'" data-drag-source="journal"':'')+'>'+(!frozen&&!t.cancelled?'<span class="drag-grip" aria-label="Перетащить задачу">⠿</span>':'')+'<button class="task-check '+(t.done?'checked':'')+'" data-action="toggle-done" data-id="'+esc(t.id)+'" aria-label="'+(t.done?'Вернуть в работу: ':'Завершить: ')+esc(t.title)+'" aria-pressed="'+t.done+'" '+(t.cancelled||type==='day'?'disabled':'')+'>'+ (t.cancelled?'−':t.done?'✓':'')+'</button><div class="task-body"><button class="task-title '+(t.done?'completed':'')+'" data-action="edit-task" data-id="'+esc(t.id)+'">'+esc(t.title)+'</button><div class="task-meta">'+meta(t)+(t.recurrence!=='none'?'<span class="repeat-pill">↻ '+recurrenceLabel(t)+'</span>':'')+(t.cancelled?statusBadge(t):'')+'</div></div>'+(frozen?(ids.has(t.id)?'<span class="selected-indicator">в плане</span>':''):t.cancelled?statusBadge(t):'<button class="select-task '+(ids.has(t.id)?'selected':'')+'" data-action="select-task" data-id="'+esc(t.id)+'" aria-label="'+(ids.has(t.id)?'Убрать из плана: ':'Включить в план: ')+esc(t.title)+'" aria-pressed="'+ids.has(t.id)+'">'+(ids.has(t.id)?'✓':'+')+'</button>')+'</div>';}
function renderTasks(){
 const p=current(),plan=getPlan(state,p),frozen=!!plan.snapshot,ids=new Set(frozen?plan.snapshot.items.map(t=>t.id):plan.selected),day=type==='day';
 const pool=day?weeklyTasks(state,anchor):state.tasks.filter(t=>isTaskActive(state,t)&&!t.someday);
 $('.live-panel').hidden=day&&frozen;
 $('.live-panel .panel-heading h2').innerHTML=(day?'Из недельного плана':'Задачи недели')+' <span class="count" id="live-count">'+pool.length+'</span>';
 $('.live-panel').setAttribute('aria-label',day?'Из недельного плана':'Задачи недели');
 $('.live-panel .panel-heading p').textContent=day?'Выберите, что сделаете в этот день':'';
 $('.live-panel .panel-heading p').hidden=!day;
 $('.live-panel').dataset.sourceView=day?'day':weeklyView;
 const tools=$('.live-panel .task-tools'),filterMenu=$('#task-filter-menu');
 if(tools.dataset.horizon!==type){filterMenu.open=day;tools.dataset.horizon=type;}
 const filterLabel=$('#task-filter option:checked').textContent;
 $('#task-filter-menu>summary').setAttribute('aria-label','Фильтр задач: '+filterLabel);
 filterMenu.classList.toggle('has-filter',filter!=='all');
 $('#task-search').placeholder=day?'Найти задачу или проект':'Найти задачу';
 $('.live-panel .add-task').hidden=!day;$('.live-footer [data-action="new-task"]').hidden=false;
 $('#live-footnote').hidden=!day;
 $('#live-footnote').textContent=frozen?'Состав плана зафиксирован':'Перетащите в план или нажмите +';
 const renderRow=t=>journalTaskRow(t,ids,frozen);
 if(!day){
  $('#task-list').setAttribute('aria-label','Фокусные проекты квартала и живые задачи');
  $('#task-list').innerHTML=weeklySourcesHTML(weeklyPlanningContext(state,anchor,{search,filter,selected:[...ids]}),(t,options)=>weeklyTaskRowHTML(state,t,{...options,selected:ids.has(t.id),frozen}),{view:weeklyView,scope:weeklyScope});
 }else{
  const tasks=pool.filter(t=>!ids.has(t.id)&&(!search||(t.title+' '+t.project).toLowerCase().includes(search.toLowerCase()))&&(filter==='all'||filter==='open'&&!t.done&&!t.cancelled||filter==='done'&&t.done||filter==='cancelled'&&t.cancelled||filter==='selected'&&ids.has(t.id)));
  $('#task-list').setAttribute('aria-label','Задачи из недельного плана');
  $('#task-list').innerHTML=tasks.length?tasks.map(renderRow).join(''):'<div class="empty-state">'+(search||filter!=='all'?'Ничего не найдено':'Все задачи недели уже выбраны или неделя ещё пуста')+'<p>'+(search||filter!=='all'?'Измените запрос или фильтр.':'Сначала добавьте задачи в план недели.')+'</p><button class="secondary-button" data-action="period-type" data-type="week">Открыть неделю</button></div>';
 }
 restoreSections();
}
function closeWeeklyMenus(except=null){document.querySelectorAll('[data-weekly-menu],#task-filter-menu').forEach(menu=>{if(menu!==except&&(menu.id!=='task-filter-menu'||type==='week'))menu.open=false;});}
function openModal(html){closeWeeklyMenus();$('#modal-content').innerHTML=html; if(!modal.open) modal.showModal();}
function closeModal(){modal.close();kanbanDraft=null;}
let editingTaskContext=null,archiveTaskContext=null;
function showTask(id=null,defaults={}) {
  editingTaskContext=defaults.context||null;
  if(!isProjectAvailable(state,id?state.tasks.find(t=>t.id===id)?.projectId:defaults.projectId)){toast('Сначала откройте или восстановите проект.');return;}
  editingDestination=defaults.destination||'';editingId=id;const t=id?state.tasks.find(t=>t.id===id):{title:'',project:'Входящие',projectId:defaults.projectId||null,areaId:defaults.areaId||null,parentTaskId:defaults.parentTaskId||null,estimate:1,due:'',done:false,cancelled:false,completedAt:'',source:'Задачи.md',recurrence:defaults.recurrence||'none',repeatFrom:'due'};
  if(!id&&defaults.recurrence)t.due=today();
  openModal(taskForm(state,t,!id,page==='planner'&&type==='day'?anchor:today()));
  initTaskEditor($('#task-form'));
  if(defaults.context)$('#edit-title').focus();
}

function saveTask(event){
  event.preventDefault();
  if(editingTaskContext&&!currentTaskTargets(editingTaskContext)){$('#form-error').textContent='Задача или область больше недоступна для записи.';return;}
  if(window.nativeSloy?.canWrite===false)return;
  const title=$('#edit-title').value.trim(),status=$('#edit-status').value,date=status==='done'?$('#edit-completed').value:today();
  if(!title){$('#form-error').textContent='Введите название.';return;}
  try{
    const candidate=clone(state),id=editingId||newId('task');let task=candidate.tasks.find(t=>t.id===id);
    if(!task){task={id,blockId:'kt-'+id,source:$('#edit-source').value.trim().replace(/\.md$/i,'')+'.md',done:false,cancelled:false,completedAt:'',archived:false};candidate.tasks.push(task);}
    const previousRepeat=[task.recurrence,task.repeatEvery||1,task.repeatUnit||'days',task.repeatFrom||'completion',task.due].join('|');
    Object.assign(task,{title,estimate:Number($('#edit-estimate').value),due:$('#edit-due').value,recurrence:$('#edit-recurrence').value,repeatEvery:$('#edit-recurrence').value==='custom'?Number($('#edit-repeat-every').value):1,repeatUnit:$('#edit-recurrence').value==='custom'?$('#edit-repeat-unit').value:'days',repeatFrom:$('#edit-repeat-from').value,repeatMissed:$('#edit-repeat-missed').value});
    if(previousRepeat!==[task.recurrence,task.repeatEvery,task.repeatUnit,task.repeatFrom,task.due].join('|'))task.repeatAnchor=null;
    if(task.recurrence!=='none'&&task.repeatFrom==='due'&&!task.due)task.due=today();
    const [parentKind,...parentId]=$('#edit-task-parent').value.split(':');
    setTaskParent(candidate,task,parentKind,parentId.join(':'));
    normalizeState(candidate);
    let next;
    if(task.done&&status==='done')task.completedAt=date;
    else next=setTaskStatus(candidate,id,status,date);
    if(!editingId&&editingDestination==='overplan')addOverplan(candidate,today(),id);
    if(!editingId&&editingDestination==='day'){const plan=getPlan(candidate,current());plan.direct??=[];plan.direct.push(id);addDayTask(candidate,anchor,id);}
    if(!commitTaskChange(candidate))return;
    closeModal();render();toast(next?'Задача сохранена. Следующий экземпляр — '+dateFormat(next.due):'Задача сохранена');
  }catch(e){$('#form-error').textContent=e.message||'Проверьте данные задачи.';}
}

function changeTaskDone(id,completeOnly=false,context=taskScreen()){
 if(!taskAccess(context)||context.ids&&!currentTaskTargets(context))return;
 const task=state.tasks.find(t=>t.id===id);
 if(!task||!completionTargets(state,[task],{completeOnly}).length)return;
 const date=page==='planner'&&type==='day'?anchor:today();
 let next;
 try{
  const {candidate,next:occurrence}=completeTasks(state,[task],date);
  if(!commitTaskChange(candidate))return;
  if(editingTaskContext&&modal.open)editingTaskContext.screenState=state;
  next=occurrence;
 }catch(error){toast(error.message);return;}
 render();
 const subtasks=$('#task-form .task-subtasks'),parent=state.tasks.find(item=>item.id===editingId);
 if(modal.open&&subtasks&&parent&&task.parentTaskId===parent.id){
  const restoreFocus=subtasks.contains(document.activeElement);
  subtasks.outerHTML=subtasksHTML(state,parent);
  if(restoreFocus)[...document.querySelectorAll('#task-form .task-subtasks [data-action="toggle-done"]')].find(button=>button.dataset.id===id)?.focus();
 }
 toast(next?'Выполнено. Следующий экземпляр — '+dateFormat(next.due):!task.done?'Выполнено · '+dateFormat(date):'Задача возвращена в работу');
}

function showFreeze(){
  const p=current(),plan=getPlan(state,p),c=comparison(state,p),focus=focusCount(state,p);
  if(plan.snapshot||!c.total&&!focus&&type!=='day')return;
  openModal('<h2>'+(type==='year'?'Зафиксировать фокус года':type==='quarter'?'Зафиксировать фокус квартала':'Зафиксировать план')+'</h2><p class="modal-description">'+dateFormat(p.start)+' — '+dateFormat(p.end)+'</p><div class="hint-box">'+(!['year','quarter'].includes(type)?c.total+' задач · '+number(c.hours)+' ч<br>':'')+(focus?focus+(type==='quarter'?' проектов в фокусе<br>':' проектов в фокусе<br>'):'')+esc(plan.goal||'')+'</div><p class="snapshot-info">Состав и формулировки сохранятся. Чтобы изменить состав, сначала снимите фиксацию плана.'+(type==='year'?' К фокусу можно вернуться, выбрав этот год.':type==='quarter'?' К фокусу можно вернуться, выбрав этот квартал.':' Статусы задач продолжат обновляться.')+'</p><div class="modal-actions"><button class="secondary-button" data-action="close-modal">Вернуться</button><button class="primary-button" data-action="confirm-freeze">◇ Зафиксировать</button></div>');
}
function download(name,content,mime='text/markdown;charset=utf-8'){const url=URL.createObjectURL(new Blob([content],{type:mime}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function backup(){download('sloy-backup-'+today()+'.json',JSON.stringify(state,null,2),'application/json');toast('Резервная копия скачана');}
function showExport(){const sources=[...new Set(state.tasks.filter(t=>!t.archived).map(t=>t.source))];openModal('<h2>Сохранить в Obsidian</h2><p class="modal-description">План хранит исходные формулировки и ссылки на живые задачи. Задачи остаются в своих файлах — без дублирования чекбоксов в плане.</p><div class="download-grid"><button class="download-card" data-action="download-plan"><strong>↗ План и факт периода · .md</strong><span>Фокус, фиксированный список, таблица факта и рефлексия</span></button></div><label class="form-label">Живые задачи по файлам</label>'+sources.map(source=>'<div class="export-source"><span>'+esc(source)+'</span><button class="text-button" data-action="download-tasks" data-source="'+esc(source)+'">Скачать .md ↗</button></div>').join('')+Object.entries(state.plans).filter(([k,p])=>k.startsWith('month:')||p.legacyPlan).map(([k])=>'<div class="export-source"><span>Прежний план '+esc(k)+'</span><button class="text-button" data-action="download-legacy" data-key="'+esc(k)+'">Скачать .md ↗</button></div>').join('')+'<div class="form-note">Сохраните каждый файл по указанному пути в хранилище. В строках появятся <b>^ID</b> — они нужны для ссылок. Перед заменой существующего файла сохраните другие заметки в нём: экспорт содержит только задачи.</div><div class="modal-actions"><button class="secondary-button" data-action="backup">Резервная копия JSON</button><button class="primary-button" data-action="close-modal">Готово</button></div>');}
function showHelp(){openModal('<h2>Намерение + живая реальность</h2><p class="modal-description">Journal: год, квартал, неделя и день.</p><div class="help-step"><b>1</b><div><strong>Один список задач</strong><p>Год — крупные проекты в зонах. Квартал — годовые проекты или их подпроекты. Неделя — конкретные действия для квартальных целей. День — задачи из плана этой недели. Статусы задач общие.</p></div></div><div class="help-step"><b>2</b><div><strong>Зафиксируйте план</strong><p>Выберите фокус или задачи кнопкой +. Фиксация сохраняет первоначальный выбор и формулировки. На странице дня отмечайте выполнение, привычки, самочувствие и сон.</p></div></div><div class="help-step"><b>3</b><div><strong>Работайте с живыми задачами</strong><p>Меняйте названия и отмечайте выполнение. План покажет изменения. В итог попадают выполнения с датой внутри периода; работа вне плана видна отдельно.</p></div></div><div class="help-step"><b>4</b><div><strong>Завершите период</strong><p>Планирование находится в начале страницы, статистика — в конце. На дне можно записать выводы. Экспорт Markdown сохраняет фокус и исходный план со ссылками на задачи.</p></div></div><div class="hint-box">Это ручной обмен файлами, без доступа к вашему хранилищу. Данные сохраняются в браузере на этом устройстве. Резервную копию можно скачать в формате JSON.</div><label class="form-label" for="vault-name">Имя хранилища Obsidian (для открытия задач)</label><input class="field" id="vault-name" value="'+esc(state.vault||'')+'" placeholder="Например: Мой мозг"><div class="form-note">После экспорта откройте задачу в редакторе: там появится ссылка «Открыть в Obsidian».</div><div class="modal-actions"><button class="primary-button" data-action="save-settings">Понятно</button></div>');}
document.addEventListener('click',event=>{
  closeWeeklyMenus(event.target.closest('[data-weekly-menu],#task-filter-menu'));
  const tree=event.target.closest('[data-tree-open]');if(tree){clearTimeout(treeClickTimer);if(event.detail===0||matchMedia('(max-width:680px)').matches)navigatePage(tree.dataset.treeOpen==='area'?'areas':'projects',tree.dataset.id);else if(event.detail===1)treeClickTimer=setTimeout(()=>navigatePage(tree.dataset.treeOpen==='area'?'areas':'projects',tree.dataset.id),320);return;}
  const button=event.target.closest('[data-action]');if(!button||button.disabled)return;const action=button.dataset.action,id=button.dataset.id;
  if(action==='page'){if(button.dataset.page==='today')navigatePage('today');else navigatePage(button.dataset.page);}
  else if(action==='undo-task-move')undoChange();
  else if(action==='cycle-scope-subtasks'){
   desktopTasks.selection.clear();
   desktopTasks.modes.set(id,((desktopTasks.modes.get(id)||0)+1)%3);
   render();
   [...document.querySelectorAll('[data-action="cycle-scope-subtasks"]')].find(item=>item.dataset.id===id)?.focus({preventScroll:true});
  }
  else if(action==='mobile-menu-open')mobileShell.open();
  else if(action==='mobile-menu-close')mobileShell.close();
  else if(action==='correlation-view'){analyticsContext.chart=button.dataset.chart==='scatter'?'scatter':'overlay';renderWellness();}
  else if(action==='open-day-journal')navigate('day',today());
  else if(action==='today-add')openModal(todayPickerHTML(state,weeklyTasks(state,today())));
  else if(action==='today-new-task'){closeModal();showTask(null,{destination:'overplan'});}
  else if(action==='today-pick'){try{addOverplan(state,today(),id);persist();closeModal();render();}catch(e){toast(e.message);}}
  else if(action==='add-day-task'){try{if(addDayTask(state,anchor,id)){persist();render();}}catch(e){toast(e.message);}}
  else if(action==='tree-toggle')toggleTree(button.dataset.key);
  else if(action==='edit-repeat')showRepeat(id);
  else if(action==='new-recurring')showTask(null,{projectId:button.dataset.project,areaId:button.dataset.area,recurrence:'weekly'});
  else if(action==='habit-week-prev'||action==='habit-week-next'){logDate=addDays(logDate,action==='habit-week-prev'?-7:7);renderWellness();}
  else if(action==='habit-week-today'){logDate=today();renderWellness();}
  else if(action==='habit-increment'){try{incrementHabit(state,id,button.dataset.date);persist();refreshHabits();}catch(e){toast(e.message);}}
  else if(action==='open-diary'){navigate('day',logDate);$('#day-review').scrollIntoView({block:'start'});}
  else if(action==='day-review')$('#day-review').scrollIntoView({block:'start'});
  else if(action==='diary-calendar')$('.planner-calendar').scrollIntoView({block:'start'});
  else if(action==='well-prev'||action==='well-next')navigateDay(addDays(logDate,action==='well-next'?1:-1));
  else if(action==='well-today')navigateDay(today());
  else if(action==='well-day')navigateDay(button.dataset.date);
  else if(action==='new-habit'||action==='habit-preset')showHabit('',button.dataset.preset);
  else if(action==='edit-habit')showHabit(id);
  else if(action==='delete-habit'){if(page!=='habits')return;const h=state.habits.find(h=>h.id===id);if(h)openModal(habitDeleteConfirmation(h,Object.values(state.habitEntries).filter(entries=>Object.hasOwn(entries,id)).length));}
  else if(action==='confirm-delete-habit'){if(page!=='habits')return;try{deleteHabit(state,id);if(analyticsContext.x==='habit:'+id)analyticsContext.x='sleep';if(analyticsContext.y==='habit:'+id)analyticsContext.y='productivity';persist();closeModal();render();toast('Привычка и её записи удалены');}catch(e){toast(e.message);}}
  else if(action==='habit-view'){habitView=button.dataset.view==='list'?'list':'cards';try{localStorage.setItem('kontur-habit-view',habitView);}catch{}refreshHabits();}
  else if(action==='habit-plus'||action==='habit-minus'){try{const day=habitDay();incrementHabit(state,id,day,action==='habit-plus'?1:-1);persist();refreshHabits();const h=state.habits.find(h=>h.id===id),entry=state.habitEntries[day][id];toast(h.name+': '+number(entry.value)+' '+entry.unit);}catch(e){toast(e.message);}}
  else if(action==='habit-entry')openHabitEntry(id,button.dataset.date||habitDay());
  else if(action==='clear-habit-entry'){delete state.habitEntries[habitDay()][id];persist();closeModal();refreshHabits();toast('Запись дня убрана');}
  else if(action==='archive-habit'||action==='restore-habit'){if(page!=='habits')return;const h=state.habits.find(h=>h.id===id);h.archivedOn=action==='archive-habit'?(h.createdOn>today()?h.createdOn:today()):null;persist();closeModal();refreshHabits();toast(action==='archive-habit'?'Привычка в архиве. История сохранена.':'Привычка снова активна');}
  else if(action==='clear-wellbeing'){document.querySelectorAll('#diary-form input[name="wellbeing"]').forEach(i=>i.checked=false);saveDiary();}

  else if(action==='collection-view'){if(page!=='projects'&&page!=='areas')return;collectionViews[page]=button.dataset.view==='list'?'list':'cards';try{localStorage.setItem('kontur-'+page+'-view',collectionViews[page]);}catch{}const scroll=window.scrollY;render();window.scrollTo(0,scroll);}
  else if(action==='task-view'){if(page!=='projects')return;scopeLayouts[entityId]=button.dataset.view==='kanban'?'kanban':'table';try{localStorage.setItem('kontur-project-layouts',JSON.stringify(scopeLayouts));}catch{}render();}
  else if(action==='configure-kanban'){kanbanDraft=clone(boardConfig(state,entityId));openModal(boardSettingsHTML(kanbanDraft));}
  else if(action.startsWith('kanban-column-')){if(!kanbanDraft)return;const i=Number(button.dataset.index),cols=kanbanDraft.columns;if(action==='kanban-column-add'&&cols.length<12)cols.push({id:newId('column'),title:'Новая колонка',status:'todo',color:'purple'});else if(action==='kanban-column-remove')cols.splice(i,1);else if(action==='kanban-column-up'&&i>0)[cols[i-1],cols[i]]=[cols[i],cols[i-1]];else if(action==='kanban-column-down'&&i<cols.length-1)[cols[i+1],cols[i]]=[cols[i],cols[i+1]];openModal(boardSettingsHTML(kanbanDraft));}
  else if(action==='open-project')navigatePage('projects',id);
  else if(action==='open-area')navigatePage('areas',id);
  else if(action==='new-project')showEntity('project','',{parentId:button.dataset.parent,areaId:button.dataset.area});
  else if(action==='edit-project')showEntity('project',id);
  else if(action==='complete-project'){const p=state.projects.find(p=>p.id===id);if(!p)return;openModal('<h2>Завершить проект?</h2><p class="modal-description">'+esc(p.name)+'</p><div class="hint-box">Вы подтверждаете, что цель достигнута. Задачи не будут автоматически отмечены выполненными. Проект и его подпроекты перестанут предлагаться в новых планах; повторения приостановятся. Проект можно открыть снова.</div><div class="modal-actions"><button class="secondary-button" data-action="close-modal">Отмена</button><button class="primary-button" data-action="confirm-complete-project" data-id="'+esc(id)+'">Завершить проект</button></div>');}
  else if(action==='confirm-complete-project'||action==='reopen-project'){try{setProjectCompleted(state,id,action==='confirm-complete-project',today());persist();closeModal();render();toast(action==='confirm-complete-project'?'Проект завершён':'Проект снова открыт');}catch(e){toast(e.message);}}
  else if(action==='activate-task'){try{setTaskStatus(state,id,'todo',today());persist();render();toast('Задача возвращена в работу');}catch(e){toast(e.message);}}
  else if(action==='project-archive')navigatePage('projects','__archive');
  else if(action==='archive-project'||action==='delete-project')confirmProjectAction(id,action==='delete-project');
  else if(action==='confirm-archive-project'){try{setProjectArchived(state,id,true);persist();closeModal();navigatePage('projects','__archive');toast('Проект в архиве. Задачи и история сохранены.');}catch(e){toast(e.message);}}
  else if(action==='restore-project'){try{setProjectArchived(state,id,false);persist();closeModal();navigatePage('projects',id);toast('Проект восстановлен');}catch(e){toast(e.message);}}
  else if(action==='confirm-delete-project'){try{const project=state.projects.find(p=>p.id===id),area=projectArea(state,project);deleteProject(state,id);persist();closeModal();navigatePage('areas',area||'__inbox');toast('Проект удалён. Задачи сохранены в зоне.');}catch(e){toast(e.message);}}
  else if(action==='new-area')showEntity('area');
  else if(action==='edit-area')showEntity('area',id);
  else if(action==='cancel-task'){setTaskStatus(state,id,'cancelled',today());persist();render();toast('Задача отменена. Вернуть в работу можно в её карточке.');}
  else if(action==='close-modal')closeModal();
  else if(action==='select-period'){if(button.getAttribute('aria-pressed')!=='true')navigate(type,button.dataset.date);}
  else if(action==='weekly-source-scope'){weeklyScope=['focus','outside','all'].includes(button.dataset.scope)?button.dataset.scope:'all';$('#task-list').scrollTop=0;renderTasks();}
  else if(action==='week-quarter')navigate('quarter');
  else if(action==='quarter-year')navigate('year');
  else if(action==='period-type'){if(type===button.dataset.type)showPeriodJump();else navigate(button.dataset.type);}
  else if(action==='prev'||action==='next')navigate(type,type==='week'?addDays(anchor,action==='next'?7:-7):shiftPeriod(type,anchor,action==='next'?1:-1));
  else if(action==='today')navigate(type,today());
  else if(action==='select-focus'){if(selectFocus(state,current(),button.dataset.kind,id)){persist();render();}}
  else if(action==='select-task'){try{if(selectJournalTask(state,current(),id)){persist();render();}}catch(e){toast(e.message);}}
  else if(action==='toggle-done')changeTaskDone(id,false,taskScreen(button));
  else if(action==='new-task')showTask(null,{projectId:button.dataset.project|| (page==='projects'?entityId:null),areaId:button.dataset.area||(page==='areas'&&entityId!=='__inbox'?entityId:null),destination:page==='today'?'overplan':page==='planner'&&type==='day'?'day':''});
  else if(action==='edit-task')openExistingTask(id,taskScreen(button));
  else if(action==='new-subtask')openSubtask(id,taskScreen(button));
  else if(action==='archive-task')confirmTaskArchive(id,editingTaskContext||taskScreen(button));
  else if(action==='confirm-archive')archiveTask(id,archiveTaskContext);
  else if(action==='undo-archive')restoreArchivedTask(id,archiveTaskContext);
  else if(action==='unfreeze'){if(!getPlan(state,current()).snapshot)return;openModal('<h2>Снять фиксацию плана?</h2><p class="modal-description">План вернётся в черновик. Вы сможете изменить состав и зафиксировать его заново.</p><div class="hint-box">Статусы задач, сон и записи дня сохранятся. При следующей фиксации снимок этого периода будет заменён. Другие периоды не изменятся.</div><div class="modal-actions"><button class="secondary-button" data-action="close-modal">Отмена</button><button class="primary-button" data-action="confirm-unfreeze">Снять фиксацию</button></div>');}
  else if(action==='confirm-unfreeze'){if(unfreezeJournal(state,current())){persist();closeModal();render();toast('План снова в черновике');}}
  else if(action==='freeze')showFreeze();
  else if(action==='confirm-freeze'){try{freezePlan(state,current());persist();closeModal();if(type==='day'&&anchor===today())navigatePage('today');else render();toast(type==='year'?'Фокус года зафиксирован':type==='quarter'?'Фокус квартала зафиксирован':'План зафиксирован');}catch(e){toast(e.message);}}
  else if(action==='export')showExport();
  else if(action==='download-plan'){const p=current();download(p.key.replace(':','-')+'.md',planMarkdown(state,p));toast('План и факт скачаны');}
  else if(action==='download-legacy'){const key=button.dataset.key,plan=state.plans[key],legacy=plan.legacyPlan||plan,parts=key.split(':'),day=parts[0]==='month'?parts[1]+'-01':parts[1]+'-01-01',p=period(parts[0],day),copy={...state,plans:{...state.plans,[key]:legacy}};download('legacy-'+key.replace(':','-')+'.md',planMarkdown(copy,p));}
  else if(action==='download-tasks'){download(button.dataset.source.split('/').pop(),tasksMarkdown(state,button.dataset.source));toast('Задачи скачаны со стабильными ID');}
  else if(action==='backup')backup();
  else if(action==='help')showHelp();
  else if(action==='save-settings'){state.vault=$('#vault-name').value.trim();persist({track:false});closeModal();}
  else if(action==='clear-demo')openModal('<h2>Начать со своих задач</h2><p class="modal-description">Пространство будет очищено: задачи, планы, привычки и дневник. Перед этим можно скачать резервную копию. Вы сможете собрать план с нуля.</p><div class="modal-actions"><button class="secondary-button" data-action="close-modal">Отмена</button><button class="primary-button" data-action="confirm-clear">Начать с чистого листа</button></div>');
  else if(action==='confirm-clear'){state=normalizeState({version:1,demo:false,tasks:[],plans:{},vault:state.vault||'',vaultPath:state.vaultPath||''});persist();closeModal();render();toast('Чистое пространство готово');}
});
document.addEventListener('toggle',event=>{if(event.target.id==='habit-archive')habitArchiveOpen=event.target.open;if(event.target.dataset.collapseKey)collapsedSections[event.target.dataset.collapseKey]=event.target.open;},true);
document.addEventListener('submit',event=>{if(event.target.id==='obsidian-settings-form'){event.preventDefault();state.vaultPath=$('#obsidian-vault-path').value.trim();if(persist({track:false})){$('#obsidian-vault-selection').textContent='';toast('Путь к хранилищу сохранён');}}else if(event.target.id==='repeat-settings-form')saveRepeat(event);else if(event.target.id==='kanban-settings-form'){event.preventDefault();try{applyBoard(state,kanbanDraft,entityId);persist({track:false});closeModal();render();toast('Доска сохранена');}catch(e){$('#kanban-error').textContent=e.message;}}else if(event.target.id==='period-jump-form'){event.preventDefault();const day=$('#jump-date').value;if(validDay(day)){closeModal();navigate(type,day);}}else if(event.target.id==='habit-form')saveHabitForm(event);else if(event.target.id==='habit-entry-form')saveHabitEntry(event);else if(event.target.id==='diary-form')saveDiary(event);else if(event.target.id==='task-form')saveTask(event);else if(event.target.id==='entity-form')saveEntity(event);});
document.addEventListener('input',event=>{const {id,value}=event.target;
  if(event.target.dataset.columnField&&kanbanDraft){kanbanDraft.columns[Number(event.target.closest('[data-column-index]').dataset.columnIndex)][event.target.dataset.columnField]=value;}
  else if(event.target.dataset.boardField&&kanbanDraft)kanbanDraft.fields[event.target.dataset.boardField]=event.target.checked;
  else if(id==='task-search'){search=value;renderTasks();}
  else if(id==='plan-goal'){getPlan(state,current()).goal=value;persist();}
  else if(id==='reflection'){const p=current();editDayField(p.key+':reflection',next=>{getPlan(next,p).reflection=value;});}
});
document.addEventListener('change',event=>{const {id,value}=event.target;
  if(event.target.name==='time-format'){if(saveTimeFormat(value))timeFormat=value;else toast('Не удалось сохранить формат времени.');renderTimeFormat();}
  else if(event.target.name==='weekly-source-view'){const next=normalizeWeeklyView(value);if(saveWeeklyView(next)){weeklyView=next;toast('Вид недельного списка сохранён');}else toast('Не удалось сохранить вид списка в этом браузере.');renderWeeklyViewSetting();}
  else if(event.target.dataset.kanbanMove){try{const next=moveKanbanTask(state,event.target.dataset.kanbanMove,value,today(),null,undefined,entityId);persist();render();toast(next?'Выполнено. Следующий экземпляр — '+dateFormat(next.due):'Карточка перемещена');}catch(e){toast(e.message);}}
  else if(event.target.dataset.columnField&&kanbanDraft){kanbanDraft.columns[Number(event.target.closest('[data-column-index]').dataset.columnIndex)][event.target.dataset.columnField]=value;}
  else if(event.target.dataset.boardField&&kanbanDraft)kanbanDraft.fields[event.target.dataset.boardField]=event.target.checked;
  else if(id==='edit-recurrence'){$('#repeat-custom-wrap').hidden=value!=='custom';$('#edit-repeat-every').disabled=value!=='custom';$('#edit-repeat-unit').disabled=value!=='custom';$('#repeat-from-wrap').hidden=value==='none';$('#repeat-missed-wrap').hidden=value==='none';$('#repeat-help').hidden=value==='none';}
  else if(id==='well-date'&&value)navigateDay(value);
  else if(event.target.name==='wellbeing'&&event.target.closest('#diary-form'))saveDiary(event);
  else if(id.startsWith('analytics-')){const key=id.replace('analytics-','');if(key==='date'&&!validDay(value))return;analyticsContext[key==='date'?'anchor':key]=key==='span'?Number(value):value;renderWellness();}
  else if(id==='entity-parent'){const p=state.projects.find(p=>p.id===value);$('#entity-area').disabled=!!p;if(p)$('#entity-area').value=p.areaId||'';}
  else if(id==='diary-date'&&validDay(value))navigateDay(value);
  else if(id==='task-filter'){filter=value;renderTasks();closeWeeklyMenus();}
  else if(id==='plan-capacity'){getPlan(state,current()).capacity=Math.min(8760,Math.max(0,Number(value)||0));persist();render();}
});
modal.addEventListener('click',event=>{if(event.target===modal){const r=modal.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeModal();}});
window.addEventListener('storage',event=>{if(event.key===STORAGE_KEY&&event.newValue){try{state=validateBackup(JSON.parse(event.newValue));undoHistory.rebase(state,{reset:true});closeModal();render();toast('Данные обновлены в другой вкладке');}catch{toast('Не удалось обновить данные из другой вкладки');}}});
window.addEventListener('storage',event=>{if(event.key===WEEKLY_VIEW_KEY||event.key===null){weeklyView=event.key===null?readWeeklyView():normalizeWeeklyView(event.newValue);renderWeeklyViewSetting();if(page==='planner'&&type==='week')renderPlanner();}});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){const active=document.activeElement,menu=active?.closest('[data-weekly-menu],#task-filter-menu');if(menu?.open){menu.open=false;menu.querySelector('summary')?.focus();}else closeWeeklyMenus();}});
function scopeDestination(kind,id){
 if(kind==='background'){kind=page==='projects'?'project':'area';id=entityId;}
 if(kind==='project'){
  const project=state.projects.find(item=>item.id===id);
  return project&&isProjectAvailable(state,project)?{kind,id,projectId:id}:null;
 }
 if(kind==='area'&&(id==='__inbox'||state.areas.some(item=>item.id===id)))return {kind,id:id==='__inbox'?null:id,areaId:id==='__inbox'?null:id};
 return null;
}
function dropTaskScope(kind,id,ids){
 const destination=scopeDestination(kind,id),candidate=clone(state);
 const roots=movingToScope(candidate,destination,ids);
 if(!roots.length)return;
 rememberTaskListOrder(candidate,roots[0]);
 const previous=clone(candidate);
 const nextOrder=rememberTaskListOrder(candidate,destination);
 moveTaskRoots(candidate,roots,destination,nextOrder);
 if(!finishTaskMove(candidate,roots.length===1?'Задача перемещена':'Перенесено '+taskCount(roots.length),{previous}))return;
 render();
}
function dropTaskBranch(parentId,ids){
 const candidate=clone(state),roots=movableRoots(candidate,parentId,ids);
 if(!roots.length)return;
 rememberTaskListOrder(candidate,roots[0]);
 const previous=clone(candidate);
 const nextOrder=rememberTaskListOrder(candidate,candidate.tasks.find(task=>task.id===parentId));
 moveTaskRoots(candidate,roots,{kind:'task',id:parentId},nextOrder);
 const mode=desktopTasks.modes.get(parentId);
 const onUndo=()=>{
  if(mode===undefined)desktopTasks.modes.delete(parentId);
  else desktopTasks.modes.set(parentId,mode);
 };
 if(!finishTaskMove(candidate,roots.length===1?'Перенесена 1 задача':'Перенесено '+taskCount(roots.length),{
  previous,onUndo,message:'Перенос подзадач отменён'
 }))return;
 desktopTasks.modes.set(parentId,0);
 render();
}
function dropTaskOrder(targetId,ids,siblingIds,after){
 const candidate=clone(state);
 if(!reorderTaskList(candidate,siblingIds,ids,targetId,after))return;
 if(finishTaskMove(candidate,'Порядок задач изменён',{message:'Изменение порядка отменено'}))render();
}
function finishTaskMove(candidate,message,options){
 if(!commitTaskChange(candidate,options))return false;
 desktopTasks.selection.clear();
 toast(message,true);
 return true;
}
function undoChange(){
 if(window.nativeSloy?.canWrite===false)return;
 const entry=undoHistory.peek(state);
 if(!entry)return;
 const current=state;
 try{
  state=validateBackup(entry.state);
  if(window.nativeSloy){
   const currentOrder=new Map(current.tasks.map((task,index)=>[task.id,index]));
   const scopes=new Map();
   for(const task of state.tasks){
    const key=JSON.stringify([task.projectId||null,task.projectId?null:task.areaId||null]);
    const index=currentOrder.get(task.id);
    const scope=scopes.get(key)||{last:-1,changed:false,task};
    scope.changed||=index===undefined||index<scope.last;
    scope.last=index??scope.last;
    scopes.set(key,scope);
   }
   for(const {changed,task} of scopes.values())if(changed)rememberTaskListOrder(state,task);
  }
  if(!persist({track:false})){state=current;return;}
 }catch(error){state=current;toast(error.message);return;}
 undoHistory.pop();
 entry.onUndo?.();
 if(modal.open)closeModal();
 desktopTasks.selection.clear();
 render();
 toast(entry.message||'Последнее изменение отменено');
}
window.addEventListener('keydown',event=>{
 if(!undoHistory.available||window.nativeSloy?.canWrite===false||event.defaultPrevented||event.repeat||(!event.ctrlKey&&!event.metaKey)||event.shiftKey||event.altKey||(event.code!=='KeyZ'&&event.key.toLowerCase()!=='z')||event.target.closest?.('textarea,[contenteditable],input:not([type=checkbox],[type=radio],[type=range],[type=button],[type=submit])'))return;
 event.preventDefault();
 event.stopImmediatePropagation();
 undoChange();
},true);
const taskCount=count=>count+' '+plural(count,['задача','задачи','задач']);
enableTaskDragging({
 canDrop:(drag,target)=>{
  if(target.hasAttribute('data-drop-parent'))return drag.source==='scope'&&desktopPointer.matches&&window.nativeSloy?.canWrite!==false&&movableRoots(state,target.dataset.dropParent,drag.ids).length>0;
  if(target.hasAttribute('data-drop-plan'))return page==='planner'&&['day','week'].includes(type)&&drag.source==='journal'&&!target.closest('[data-vault-readonly]')&&!getPlan(state,current()).snapshot;
  return page==='projects'&&scopeLayouts[entityId]==='kanban'&&drag.source==='kanban';
 },
 scopeSelection:()=>desktopTasks.selection,
 onScopeSelect:ids=>{desktopTasks.selection=ids;},
 describeParentDrop:taskCount,
 onParentDrop:dropTaskBranch,
 canDropScope:(kind,id,ids)=>window.nativeSloy?.canWrite!==false&&movingToScope(state,scopeDestination(kind,id),ids).length>0,
 onScopeDrop:dropTaskScope,
 onOrderDrop:dropTaskOrder,
 canReorder:()=>window.nativeSloy?.canWrite!==false,
 onPlanDrop:id=>{if(addJournalTask(state,current(),id)){persist();render();toast('Задача в плане');}},
 onColumnDrop:(id,column,before)=>{const next=moveKanbanTask(state,id,column,today(),before,undefined,entityId);persist();render();if(next)toast('Следующий экземпляр — '+dateFormat(next.due));},
 onError:toast
});
const scopeTaskRows=()=>[...document.querySelectorAll('#collection-view [data-task-menu-row]')];
const findScopeTaskRow=id=>scopeTaskRows().find(row=>row.dataset.taskId===id);
const taskScreen=(origin=null)=>({page,entityId,origin,screenState:state});

function taskAccess(context){
 return !!context&&context.page===page&&context.entityId===entityId&&window.nativeSloy?.canWrite!==false&&
  !context.origin?.closest('[data-vault-readonly]');
}

function currentTaskTargets(context){
 if(!taskAccess(context)||context.screenState!==state)return null;
 const tasks=context.ids.map(id=>state.tasks.find(task=>task.id===id));
 if(tasks.some(task=>!task||!isTaskActive(state,task)))return null;
 if(context.rowId){
  const writableIds=new Set(scopeTaskRows().filter(row=>!row.closest('[data-vault-readonly]')).map(row=>row.dataset.taskId));
  if(context.ids.some(id=>!writableIds.has(id)))return null;
 }
 return tasks;
}

function commitTaskChange(candidate,options){
 const previous=state;
 state=candidate;
 try{if(persist(options))return true;}
 catch(error){toast(error.message);}
 state=previous;
 return false;
}

function openExistingTask(id,context){
 if(taskAccess(context)&&state.tasks.some(task=>task.id===id))showTask(id,{context:context.ids?context:null});
}

function openSubtask(id,context){
 const parent=state.tasks.find(task=>task.id===id);
 if(taskAccess(context)&&parent&&isTaskActive(state,parent)){
  showTask(null,{parentTaskId:id,projectId:parent.projectId,areaId:parent.areaId,context:context.ids?context:null});
 }
}

function confirmTaskArchive(id,context){
 const task=state.tasks.find(task=>task.id===id);
 if(!taskAccess(context)||!task||!isTaskActive(state,task))return;
 archiveTaskContext={...context,ids:[id]};
 openModal('<h2>Убрать из активных задач?</h2><p class="modal-description">'+esc(task.title)+'</p><div class="hint-box">Исходные планы сохранят задачу и историю её выполнения. Подзадачи останутся доступны в проекте или зоне.</div><div class="modal-actions"><button class="secondary-button" data-action="close-modal">Отмена</button><button class="primary-button" data-action="confirm-archive" data-id="'+esc(id)+'">Убрать задачу</button></div>');
}

function archiveTask(id,context){
 if(!context||context.ids[0]!==id||!currentTaskTargets(context)){toast('Задача больше недоступна для записи');return;}
 const candidate=clone(state);
 candidate.tasks.find(task=>task.id===id).archived=true;
 for(const plan of Object.values(candidate.plans))if(!plan.snapshot)plan.selected=plan.selected.filter(taskId=>taskId!==id);
 if(!commitTaskChange(candidate))return;
 archiveTaskContext={...context,screenState:state};
 render();
 openModal('<h2>Задача убрана</h2><p class="modal-description">Зафиксированные планы сохраняют её исходную версию.</p><div class="modal-actions"><button class="secondary-button" data-action="undo-archive" data-id="'+esc(id)+'">Вернуть задачу</button><button class="primary-button" data-action="close-modal">Готово</button></div>');
}

function restoreArchivedTask(id,context){
 if(!taskAccess(context)||context.ids[0]!==id||context.screenState!==state)return;
 const candidate=clone(state),task=candidate.tasks.find(item=>item.id===id);
 if(!task?.archived)return;
 Object.assign(task,{archived:false,skipped:false,skippedAt:''});
 if(!commitTaskChange(candidate))return;
 closeModal();render();toast('Задача восстановлена');
}

function restoreTaskMenuFocus(context){
 if(modal.open||page!==context.page||entityId!==context.entityId)return;
 const row=findScopeTaskRow(context.rowId);
 const fallback=$('#collection-view .scope-actions [data-action="new-task"]')||$('#collection-view .scope-heading h1');
 if(fallback&&!fallback.matches('button'))fallback.tabIndex=-1;
 const origin=context.origin;
 const replacement=context.fromTrigger?row?.querySelector('[data-task-menu-trigger]'):row;
 const target=[origin,replacement,fallback].find(element=>element?.isConnected&&element.getClientRects().length);
 target?.focus({preventScroll:true});
}

function taskMoveOptions(ids){
 const projectPath=project=>{
  const parent=state.projects.find(item=>item.id===project.parentId);
  const area=state.areas.find(item=>item.id===projectArea(state,project));
  return [area?.name||'Без зоны',parent?.name,project.name].filter(Boolean);
 };
 const branches=taskBranchSelection(state,ids);
 const projects=state.projects.filter(project=>branches.into(scopeDestination('project',project.id)).length)
  .map(project=>({kind:'project',id:project.id,label:project.name,path:projectPath(project).join(' / '),type:'Проект'}));
 const areas=[...state.areas,{id:'__inbox',name:'Без зоны'}]
  .filter(area=>branches.into(scopeDestination('area',area.id)).length)
  .map(area=>({kind:'area',id:area.id,label:area.name,path:area.name,type:'Зона'}));
 const parents=state.tasks.filter(task=>branches.under(task.id).length).map(task=>{
  const project=state.projects.find(item=>item.id===task.projectId),area=state.areas.find(item=>item.id===task.areaId);
  const path=[...(project?projectPath(project):[area?.name||'Без зоны']),...branches.ancestors(task).reverse().map(parent=>parent.title),task.title];
  return {kind:'task',id:task.id,label:task.title,path:path.join(' / '),type:'Задача'};
 });
 return [...projects,...areas,...parents];
}

function describeTaskMenu(row,origin){
 const rowId=row.dataset.taskId,ids=taskMenuTargets(rowId,desktopTasks.selection);
 const context={...taskScreen(origin),rowId,ids,fromTrigger:origin.hasAttribute('data-task-menu-trigger'),day:today()};
 const tasks=currentTaskTargets(context);
 if(!tasks)return null;
 const group=ids.length>1,task=tasks[0],commands=[];
 const add=(id,label,extra={})=>commands.push({id,label,...extra});
 const completionCount=completionTargets(state,tasks,{completeOnly:group,native:!!window.nativeSloy}).length;
 const planCount=new Set(taskPlanOptions(state,tasks,context.day).flatMap(option=>option.ids)).size;
 if(!group)add('open','Открыть');
 if(!group&&completionCount)add('toggle-done',task.done?'Вернуть в работу':'Завершить',{done:task.done});
 if(!group)add('subtask','Добавить подзадачу');
 if(planCount)add('plan',group?'Добавить в план… ('+planCount+')':'Запланировать…');
 const branches=taskBranchSelection(state,ids);
 const canMove=state.projects.some(project=>branches.into(scopeDestination('project',project.id)).length)||
  state.areas.some(area=>branches.into(scopeDestination('area',area.id)).length)||
  branches.into(scopeDestination('area','__inbox')).length||state.tasks.some(task=>branches.under(task.id).length);
 if(canMove)add('move',group?'Переместить '+taskCount(ids.length)+'…':'Переместить…');
 if(group&&completionCount)add('complete','Завершить доступные ('+completionCount+')');
 if(!group)add('archive','Убрать из активных…');
 if(group||desktopTasks.selection.has(rowId))add('clear-selection','Снять выделение',{pinnable:false});
 else add('select','Выбрать задачу',{pinnable:false});
 return {context,commands,title:group?'Выбрано задач: '+ids.length:task.title};
}

let taskModalOrigin=null;
modal.addEventListener('close',()=>{
 const context=taskModalOrigin;
 taskModalOrigin=null;
 if(context)restoreTaskMenuFocus(context);
});

function executeTaskMenu(command,context){
 const tasks=currentTaskTargets(context),{ids}=context,id=ids[0];
 const unavailable=()=>toast('Задачи или назначение больше недоступны');
 if(!tasks){unavailable();restoreTaskMenuFocus(context);return;}
 try{
  if(command.id==='open')openExistingTask(id,context);
  else if(command.id==='subtask')openSubtask(id,context);
  else if(command.id==='archive')confirmTaskArchive(id,context);
  else if(command.id==='toggle-done'){
   if(tasks[0].done===command.done)changeTaskDone(id,false,context);else unavailable();
  }else if(command.id==='select'||command.id==='clear-selection'){
   if(command.id==='select')desktopTasks.selection.add(context.rowId);else desktopTasks.selection.clear();
   for(const row of scopeTaskRows())row.classList.toggle('is-task-selected',desktopTasks.selection.has(row.dataset.taskId));
  }else if(command.id==='complete'){
   const eligible=completionTargets(state,tasks,{completeOnly:true,native:!!window.nativeSloy});
   if(eligible.length&&commitTaskChange(completeTasks(state,eligible,today()).candidate)){
    render();toast('Завершено: '+taskCount(eligible.length),true);
   }
  }else if(command.id==='move'){
   chooseTaskDestination(openModal,{title:'Переместить задачи',search:true,options:taskMoveOptions(ids),
    preview:option=>option.kind==='task'?'Сделать '+taskCount(movableRoots(state,option.id,ids).length)+' подзадачами «'+option.label+'»':
     'Переместить '+taskCount(movingToScope(state,scopeDestination(option.kind,option.id),ids).length)+' → '+option.path,
    confirm:option=>{
     if(!currentTaskTargets(context)||!taskMoveOptions(ids).some(item=>item.kind===option.kind&&item.id===option.id)){unavailable();return;}
     try{
      if(option.kind==='task')dropTaskBranch(option.id,ids);else dropTaskScope(option.kind,option.id,ids);
      if(state!==context.screenState)closeModal();
     }catch(error){toast(error.message);}
    }});
  }else if(command.id==='plan'){
   const labels={week:'В недельный план',day:'В план дня',overplan:'На сегодня сверх плана'};
   const options=taskPlanOptions(state,tasks,context.day).map(option=>({...option,label:labels[option.id],path:dateFormat(option.period.start)+(option.id==='week'?' — '+dateFormat(option.period.end):'')}));
   chooseTaskDestination(openModal,{title:'Запланировать задачи',options,preview:option=>labels[option.id]+' · '+option.path+' · '+taskCount(option.ids.length),
    confirm:option=>{
     const currentTasks=currentTaskTargets(context);
     if(!currentTasks||today()!==context.day){unavailable();return;}
     const current=taskPlanOptions(state,currentTasks,context.day).find(item=>item.id===option.id);
     if(!current||JSON.stringify(current.ids)!==JSON.stringify(option.ids)){unavailable();return;}
     try{if(commitTaskChange(planTasks(state,current))){closeModal();render();toast('Добавлено: '+taskCount(current.ids.length),true);}}
     catch(error){toast(error.message);}
    }});
  }
 }catch(error){toast(error.message);}
 if(modal.open)taskModalOrigin=context;else restoreTaskMenuFocus(context);
}

const closeTaskMenu=initTaskContextMenu({describe:describeTaskMenu,execute:executeTaskMenu,restore:restoreTaskMenuFocus});

enableHabitHold(openHabitEntry);
enableTaskSwipe({canComplete:(id,row)=>window.nativeSloy?.canWrite!==false&&!row.closest('[data-vault-readonly]')&&canSwipeTask(state,state.tasks.find(t=>t.id===id)),onComplete:id=>changeTaskDone(id,true)});
render();
if(!loadError)persist({track:false});
if(loadError)toast('Сохранённые данные не удалось прочитать. Резервная копия поможет их восстановить.');

function toggleTree(key){treeExpanded[key]=!(treeExpanded[key]??key.startsWith('area:'));try{localStorage.setItem('kontur-tree',JSON.stringify(treeExpanded));}catch{}renderSidebar();}
document.addEventListener('dblclick',event=>{const tree=event.target.closest('[data-tree-open]');if(tree&&!matchMedia('(max-width:680px)').matches){clearTimeout(treeClickTimer);event.preventDefault();if(tree.dataset.hasChildren==='true')toggleTree(tree.dataset.key);}});
function openHabitEntry(id,day){if(!validDay(day)||day>today())return;habitEntryDate=day;openModal(habitEntryForm(state,id,day));}
function showRepeat(id){
 const clicked=state.tasks.find(t=>t.id===id);if(!clicked)return;const series=clicked.seriesId||clicked.id;
 const leaf=state.tasks.find(t=>(t.seriesId||t.id)===series&&!t.nextOccurrenceId&&!t.archived&&!t.cancelled)||clicked;editingRepeatId=leaf.id;
 openModal('<h2>Настройка повторения</h2><p class="modal-description">'+esc(clicked.title)+'</p><form id="repeat-settings-form"><label class="form-label" for="repeat-due">Ближайший срок</label><input class="field" type="date" id="repeat-due" value="'+esc(leaf.due||today())+'" required>'+repeatForm(leaf)+'<div class="error-text" id="repeat-error" role="alert"></div><div class="modal-actions"><button type="button" class="secondary-button" data-action="close-modal">Отмена</button><button class="primary-button" type="submit">Сохранить повторение</button></div></form>');
}
function saveRepeat(event){event.preventDefault();try{const copy=clone(state),t=copy.tasks.find(t=>t.id===editingRepeatId);Object.assign(t,{due:$('#repeat-due').value,recurrence:$('#edit-recurrence').value,repeatEvery:$('#edit-recurrence').value==='custom'?Number($('#edit-repeat-every').value):1,repeatUnit:$('#edit-recurrence').value==='custom'?$('#edit-repeat-unit').value:'days',repeatFrom:$('#edit-repeat-from').value,repeatMissed:$('#edit-repeat-missed').value,repeatAnchor:null});state=validateBackup(copy);materializeRepeats(state,today());persist();closeModal();render();toast('Повторение сохранено');}catch(e){$('#repeat-error').textContent=e.message;}}
function checkNewDay(){if(document.hidden||today()===appDay)return;appDay=today();mobileShell.close();analyticsDemoState=null;try{localStorage.setItem('kontur-open-day',appDay);}catch{}if(modal.open)closeModal();anchor=appDay;type='day';logDate=appDay;page=dayStartPage(state,appDay);history.replaceState(null,'','?page='+page+'&view=day&date='+appDay);render();}
document.addEventListener('visibilitychange',checkNewDay);window.addEventListener('focus',checkNewDay);setInterval(checkNewDay,30000);
