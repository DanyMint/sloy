import {isProjectArchived,isProjectAvailable,isTaskPlannable} from './domain.js';
import {isDayEligible} from './day-flow.js';
import {getPlan,emptyPlan,period,clone,freezePlan} from './model.js';

// Earlier task-based horizons remain in legacyPlan when their focus model changes.
export function journalPlan(state,p){
  const existed=!!state.plans[p.key];
  let plan=getPlan(state,p);
  if(p.type==='day'&&!existed)plan.capacity=8;
  if(p.type==='year'&&plan.journalVersion!==2){
    const old=clone(plan),hasOld=old.selected.length||old.snapshot||old.goal||old.reflection;
    plan=state.plans[p.key]={...emptyPlan(),goal:old.goal,journalVersion:2,focusAreas:[],focusProjects:[],...(hasOld?{legacyPlan:old}:{})};
  }
  if(p.type==='quarter'&&plan.journalVersion!==2){
    const old=clone(plan),hasTasks=old.selected.length||old.snapshot?.items?.length;
    plan=state.plans[p.key]={...old,selected:[],journalVersion:2,focusAreas:[],focusProjects:old.focusProjects||[],snapshot:old.snapshot?.focusProjects?.length?{...clone(old.snapshot),items:[],focusAreas:[]}:null,...(hasTasks?{legacyPlan:old}:{})};
  }
  if(p.type==='quarter'||p.type==='year'){plan.focusProjects??=[];plan.focusAreas??=[];}
  return plan;
}
export function weeklyItems(state,day){
  const plan=state.plans[period('week',day).key];
  return plan?.snapshot?.items||((plan?.selected||[]).map(id=>state.tasks.find(t=>t.id===id)).filter(Boolean));
}
export function weeklyTasks(state,day){
  const ids=new Set(weeklyItems(state,day).map(t=>t.id));
  return state.tasks.filter(t=>ids.has(t.id)&&isTaskPlannable(state,t));
}
export function selectJournalTask(state,p,id){
  if(['year','quarter'].includes(p.type))throw new Error('На год и квартал выбираются проекты, а не задачи.');
  const plan=journalPlan(state,p),t=state.tasks.find(t=>t.id===id);
  if(plan.snapshot||!t||!isTaskPlannable(state,t))return false;
  if(p.type==='day'&&!plan.selected.includes(id)&&!isDayEligible(state,p.start,id))throw new Error('Выберите задачу недели, просроченную или новую задачу дня.');
  plan.selected=plan.selected.includes(id)?plan.selected.filter(x=>x!==id):[...plan.selected,id];return true;
}
export function selectFocus(state,p,kind,id){
 if(!['year','quarter'].includes(p.type)||kind!=='project')return false;
 const plan=journalPlan(state,p),project=state.projects.find(e=>e.id===id);
 if(plan.snapshot||!project)return false;
 // A stale draft choice can always be removed, even after its project moves or closes.
 if(plan.focusProjects.includes(id)){plan.focusProjects=plan.focusProjects.filter(x=>x!==id);return true;}
 if(!isProjectAvailable(state,project)||p.type==='year'&&project.parentId)return false;
 if(p.type==='quarter'&&!quarterProjects(state,p).some(e=>e.id===id))return false;
 plan.focusProjects.push(id);return true;
}
export function unfreezeJournal(state,p){
 const plan=journalPlan(state,p),saved=plan.snapshot;if(!saved)return false;
 plan.goal=saved.goal;plan.capacity=saved.capacity;
 if(['year','quarter'].includes(p.type)){
  plan.selected=[];plan.focusAreas=[];plan.focusProjects=(saved.focusProjects||[]).map(e=>e.id).filter(id=>state.projects.some(e=>e.id===id));
 }else{
  plan.selected=[...new Set([...saved.items.map(t=>t.id),...(p.type==='day'?plan.overplan||[]:[])])].filter(id=>state.tasks.some(t=>t.id===id&&isTaskPlannable(state,t)));
  if(p.type==='day'){plan.direct=[...new Set([...(plan.direct||[]),...plan.selected])];plan.overplan=[];}
 }
 plan.snapshot=null;return true;
}
export function freezeJournal(state,p,at){
  const plan=journalPlan(state,p);
  if(p.type==='quarter'&&!plan.snapshot){
    const eligible=new Set(quarterProjects(state,p).map(e=>e.id));
    if(plan.focusProjects.some(id=>!eligible.has(id)))throw new Error('Фокус года изменился. Уберите проекты вне годового фокуса или верните их в план года.');
  }
  if(p.type==='year'&&!plan.snapshot&&plan.focusProjects.some(id=>!state.projects.some(e=>e.id===id&&!e.parentId&&isProjectAvailable(state,e))))throw new Error('В фокусе года могут быть только открытые проекты верхнего уровня. Уберите недоступные проекты.');
  if(['year','quarter'].includes(p.type)){plan.selected=[];if(!plan.snapshot)plan.focusAreas=[];}
  if(p.type==='day'&&plan.selected.some(id=>!isDayEligible(state,p.start,id)))throw new Error('Состав недели изменился. Уберите из дня задачи, которых больше нет в недельном плане.');
  if(p.type==='day'&&!plan.snapshot&&!plan.selected.length){plan.snapshot={at:at||new Date().toISOString(),goal:plan.goal,capacity:plan.capacity,items:[]};return plan.snapshot;}
  return freezePlan(state,p,at);
}
export function quarterYearProjects(state,p){return focusEntities(state,period('year',p.start),'project').filter(e=>!e.parentId);}
export function quarterProjects(state,p){
 const annual=new Set(quarterYearProjects(state,p).map(e=>e.id));
 return state.projects.filter(e=>isProjectAvailable(state,e)&&(annual.has(e.id)||annual.has(e.parentId)));
}
export function focusEntities(state,p,kind){
  const plan=journalPlan(state,p),key=kind==='area'?'focusAreas':'focusProjects',entities=kind==='area'?state.areas:state.projects;
  return plan.snapshot?.[key]||((plan[key]||[]).map(id=>entities.find(e=>e.id===id)).filter(e=>e&&(kind!=='project'||!isProjectArchived(state,e))));
}

export function addDayTask(state,day,id){
 return addJournalTask(state,period('day',day),id);
}
export function addJournalTask(state,p,id){
 const plan=journalPlan(state,p);
 if(plan.snapshot||plan.selected.includes(id))return false;
 return selectJournalTask(state,p,id);
}
export function unifyDayReflection(state,day){
 const plan=journalPlan(state,period('day',day));
 if(!plan.reflectionUnified){const note=state.dayLogs[day]?.note?.trim()||'';if(note&&note!==plan.reflection.trim())plan.reflection=[plan.reflection,note].filter(Boolean).join('\n\n');plan.reflectionUnified=true;}
 return plan.reflection;
}
