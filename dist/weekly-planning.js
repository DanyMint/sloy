import {period,dateOf} from './model.js';
import {taskSwipeAttrs} from './task-swipe.js';
import {recurrenceLabel} from './recurrence.js';
import {journalPlan} from './journal.js';
import {isTaskActive,isProjectAvailable,isProjectCompleted,projectArea,projectLabel} from './domain.js';
import {entityIcon} from './entity-icons.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Use the quarter of the viewed date, including weeks which cross a quarter boundary.
// Project groups contain their own tasks; a subproject needs its own quarterly focus.
export function weeklyPlanningContext(state,day,{search='',filter='all',selected=[]}={}){
 const quarter=period('quarter',day),week=period('week',day),plan=state.plans[quarter.key]?journalPlan(state,quarter):null;
 const fixed=!!plan?.snapshot&&Array.isArray(plan.snapshot.focusProjects),projects=fixed?plan.snapshot.focusProjects:[],focusIds=new Set(projects.map(p=>p.id)),ids=new Set(selected),q=search.trim().toLocaleLowerCase();
 const matches=(t,context='')=>(!q||(t.title+' '+t.project+' '+context).toLocaleLowerCase().includes(q))&&(filter==='all'||filter==='open'&&!t.done&&!t.cancelled||filter==='done'&&t.done||filter==='cancelled'&&t.cancelled||filter==='selected'&&ids.has(t.id));
 const pool=state.tasks.filter(t=>isTaskActive(state,t)&&!t.someday);
 const groups=projects.map(saved=>{
  const live=state.projects.find(p=>p.id===saved.id),available=!!live&&isProjectAvailable(state,live),area=saved.areaName||state.areas.find(a=>a.id===projectArea(state,live))?.name||'Без зоны',parent=saved.parentName||state.projects.find(p=>p.id===saved.parentId)?.name||'';
  const context=[area,parent,saved.name,live?.name].filter(Boolean).join(' › '),own=pool.filter(t=>t.projectId===saved.id);
  return {project:saved,live,available,closed:!!live&&isProjectCompleted(state,live),path:[area,parent].filter(Boolean).join(' › '),tasks:own.filter(t=>matches(t,context)),total:own.length,match:!q||context.toLocaleLowerCase().includes(q)||own.some(t=>matches(t,context))};
 }).filter(g=>g.match);
 const outside=pool.filter(t=>!focusIds.has(t.projectId)&&matches(t));
 const matchedFocusIds=new Set(groups.flatMap(g=>g.tasks.map(t=>t.id))),outsideIds=new Set(outside.map(t=>t.id));
 const flatTasks=pool.filter(t=>matchedFocusIds.has(t.id)||outsideIds.has(t.id));
 return {quarter,week,fixed,groups,outside,flatTasks,focusTaskIds:matchedFocusIds,filtered:!!q||filter!=='all',total:pool.length};
}
const taskDate=day=>dateOf(day).toLocaleDateString('ru-RU',{day:'numeric',month:'short',timeZone:'UTC'});
const num=value=>Number(value||0).toLocaleString('ru-RU');
export function weeklyTaskRowHTML(state,t,{selected=false,frozen=false,flat=false,outside=false}={}){
 const meta=[];
 if(flat){const label=projectLabel(state,t.projectId)||state.areas.find(a=>a.id===t.areaId)?.name||'Без проекта';meta.push(t.projectId?`<button class="weekly-task-project" data-action="open-project" data-id="${esc(t.projectId)}" title="${esc(label)}">${esc(label)}</button>`:`<span>${esc(label)}</span>`);if(outside)meta.push('<span class="weekly-outside-tag">Вне фокуса</span>');}
 if(t.due)meta.push(`<span>${esc(taskDate(t.due))}</span>`);
 if(t.recurrence!=='none')meta.push(`<span title="${esc(recurrenceLabel(t))}">↻ ${esc(recurrenceLabel(t))}</span>`);
 if(t.done)meta.push('<span>Выполнена</span>');if(t.cancelled)meta.push('<span>Отменена</span>');
 const action=frozen?(selected?'<span class="selected-indicator">в плане</span>':''):t.cancelled?'':`<button class="select-task ${selected?'selected':''}" data-action="select-task" data-id="${esc(t.id)}" aria-label="${selected?'Убрать из плана: ':'Включить в план: '}${esc(t.title)}" aria-pressed="${selected}" title="${selected?'Уже в плане':'Включить в план'}">${selected?'✓':'+'}</button>`;
 return `<div class="task-row weekly-task-row" ${taskSwipeAttrs(state,t)} ${!frozen&&!t.cancelled?`draggable="true" data-drag-task="${esc(t.id)}" data-drag-source="journal"`:''}><div class="task-body"><button class="task-title ${t.done?'completed':''}" data-action="edit-task" data-id="${esc(t.id)}">${esc(t.title)}</button>${meta.length?`<div class="task-meta">${meta.join('<span class="meta-separator" aria-hidden="true">·</span>')}</div>`:''}</div><span class="weekly-task-estimate">${t.estimate?num(t.estimate)+' ч':''}</span>${action}</div>`;
}
function quarterLink(context,compact=false){const {quarter,fixed}=context;return `<button class="text-button weekly-quarter-link" data-action="week-quarter" title="${quarter.start.slice(0,4)} · ${esc(quarter.label)}">${fixed?(compact?esc(quarter.label):'Цели '+quarter.label.replace('квартал','квартала'))+' ↗':'Составить план квартала ↗'}</button>`;}
const missingQuarter='<p class="weekly-focus-notice">Сначала составьте и зафиксируйте план квартала. После этого здесь появятся его фокусные проекты.</p>';
function projectMenu(g){return `<details class="weekly-project-menu" data-weekly-menu><summary class="icon-button" aria-label="Действия проекта: ${esc(g.project.name)}" title="Действия проекта">⋯</summary><div class="weekly-menu-popover"><p>${esc(g.path)} › ${esc(g.project.name)}</p>${g.live?`<button class="text-button" data-action="open-project" data-id="${esc(g.project.id)}">Открыть проект ↗</button>`:'<span>Проект удалён</span>'}${g.available?`<button class="text-button" data-action="edit-project" data-id="${esc(g.project.id)}">Настроить проект</button>`:''}${g.closed?'<span>Завершён</span>':!g.available&&g.live?'<span>В архиве</span>':''}</div></details>`;}
function groupedSourcesHTML(context,renderTask){
 const {week,fixed,groups,outside,filtered}=context;
 const focus=groups.map(g=>`<div class="weekly-group-shell"><details class="flow-section weekly-project" data-collapse-key="week-focus:${esc(week.key)}:${esc(g.project.id)}" open><summary><span class="weekly-project-title">${entityIcon(g.project,'project')}${esc(g.project.name)}</span><span class="count">${g.tasks.length}</span></summary><div class="flow-section-body">${g.tasks.length?g.tasks.map(t=>renderTask(t,{flat:false,outside:false})).join(''):`<p class="weekly-empty">${!g.available?'Проект недоступен для нового плана.':filtered?'Нет задач по фильтру.':`Нет задач · <button class="text-button" data-action="new-task" data-project="${esc(g.project.id)}">Добавить</button>`}</p>`}</div></details><div class="weekly-group-actions">${g.available?`<button class="icon-button" data-action="new-task" data-project="${esc(g.project.id)}" aria-label="Новая задача в проекте: ${esc(g.project.name)}" title="Добавить задачу">+</button>`:''}${projectMenu(g)}</div></div>`).join('');
 return `<div class="weekly-focus-heading">${quarterLink(context)}</div>${!fixed?missingQuarter:focus||`<p class="weekly-empty">${filtered?'Проекты или задачи не найдены.':'В квартальном плане нет фокусных проектов.'}</p>`}<div class="weekly-group-shell weekly-outside-shell"><details class="flow-section weekly-outside" data-collapse-key="week-outside:${esc(week.key)}" open><summary>Вне фокуса <span class="count">${outside.length}</span></summary><div class="flow-section-body">${outside.length?outside.map(t=>renderTask(t,{flat:false,outside:true})).join(''):`<p class="weekly-empty">${filtered?'Нет задач по фильтру.':'Нет задач вне фокуса квартала.'}</p>`}</div></details><div class="weekly-group-actions"><button class="icon-button" data-action="new-task" aria-label="Новая задача вне фокуса" title="Добавить задачу">+</button></div></div>`;
}
function flatSourcesHTML(context,renderTask,scope){
 const {flatTasks,focusTaskIds,fixed,filtered}=context,active=['focus','outside','all'].includes(scope)?scope:'all';
 const tasks=flatTasks.filter(t=>active==='all'||active==='focus'&&focusTaskIds.has(t.id)||active==='outside'&&!focusTaskIds.has(t.id));
 return `<div class="weekly-source-tabs" role="group" aria-label="Источник задач">${[['focus','Фокус квартала'],['outside','Вне фокуса'],['all','Все']].map(([key,label])=>`<button data-action="weekly-source-scope" data-scope="${key}" aria-pressed="${active===key}">${label}</button>`).join('')}</div><div class="weekly-focus-heading">${quarterLink(context,true)}</div>${!fixed?missingQuarter:''}<div class="weekly-flat-list">${tasks.length?tasks.map(t=>renderTask(t,{flat:true,outside:!focusTaskIds.has(t.id)})).join(''):`<p class="weekly-empty">${filtered?'Нет задач по выбранному фильтру.':active==='focus'?'Нет задач из квартального фокуса.':'Пока нет задач.'}</p>`}</div>`;
}
export function weeklySourcesHTML(context,renderTask,{view='groups',scope='all'}={}){
 return view==='list'?flatSourcesHTML(context,renderTask,scope):groupedSourcesHTML(context,renderTask);
}
