import {validEntityIcon} from './entity-icons.js';
import {repeatLabels,nextRepeat,validateRepeat} from './recurrence.js';
export {repeatLabels} from './recurrence.js';
export const newId=(prefix='id')=>prefix+'-'+[...crypto.getRandomValues(new Uint8Array(12))].map(n=>n.toString(16).padStart(2,'0')).join('');
export const taskStatus=t=>t.cancelled?'cancelled':t.done?'done':t.someday?'someday':'todo';
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
const isString=(s,max)=>typeof s==='string'&&s.length<=max;
const stableNameId=s=>{let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return (h>>>0).toString(36);};
export function rootProject(state,p){return p?.parentId?state.projects.find(x=>x.id===p.parentId):p;}
export function projectArea(state,p){return rootProject(state,p)?.areaId||null;}
export function projectLabel(state,id){const p=state.projects.find(x=>x.id===id);if(!p)return '';const parent=p.parentId&&state.projects.find(x=>x.id===p.parentId);return (parent?parent.name+' › ':'')+p.name;}
export function taskArea(state,t){const p=state.projects.find(x=>x.id===t.projectId);return p?projectArea(state,p):t.areaId||null;}
export function isProjectArchived(state,id){const p=typeof id==='object'?id:state.projects.find(p=>p.id===id);return !!(p?.archived||p?.parentId&&state.projects.find(parent=>parent.id===p.parentId)?.archived);}
export function isProjectCompleted(state,id){const p=typeof id==='object'?id:state.projects.find(p=>p.id===id);return !!(p?.completedAt||p?.parentId&&state.projects.find(parent=>parent.id===p.parentId)?.completedAt);}
export const isProjectAvailable=(state,p)=>!isProjectArchived(state,p)&&!isProjectCompleted(state,p);
export const isTaskActive=(state,t)=>!t.archived&&!isProjectArchived(state,t.projectId)&&!isProjectCompleted(state,t.projectId);
export const isTaskPlannable=(state,t)=>isTaskActive(state,t)&&!t.someday&&!t.cancelled&&!t.skipped;
export function setProjectCompleted(state,id,completed,date){
 const project=state.projects.find(p=>p.id===id);if(!project||!validDate(date))throw new Error('Проект или дата не найдены.');
 if(isProjectArchived(state,project))throw new Error('Сначала восстановите проект из архива.');
 if(!completed&&project.parentId&&state.projects.find(p=>p.id===project.parentId)?.completedAt)throw new Error('Сначала откройте родительский проект.');
 project.completedAt=completed?date:'';
 return project;
}
export function setProjectArchived(state,id,archived){
  const project=state.projects.find(p=>p.id===id);if(!project)throw new Error('Проект не найден.');
  if(!archived&&project.parentId&&isProjectArchived(state,project.parentId))throw new Error('Сначала восстановите родительский проект.');
  project.archived=!!archived;
  if(archived){const projectIds=new Set([id,...state.projects.filter(p=>p.parentId===id).map(p=>p.id)]),taskIds=new Set(state.tasks.filter(t=>projectIds.has(t.projectId)).map(t=>t.id));
    for(const plan of Object.values(state.plans))if(!plan.snapshot){plan.selected=plan.selected.filter(id=>!taskIds.has(id));if(plan.focusProjects)plan.focusProjects=plan.focusProjects.filter(id=>!projectIds.has(id));if(plan.direct)plan.direct=plan.direct.filter(id=>!taskIds.has(id));}
  }
  return project;
}
// Deleting a project removes its structure, while tasks and frozen history remain.
export function deleteProject(state,id){
  const project=state.projects.find(p=>p.id===id);if(!project)throw new Error('Проект не найден.');
  const ids=new Set([id,...state.projects.filter(p=>p.parentId===id).map(p=>p.id)]);
  for(const task of state.tasks)if(ids.has(task.projectId)){const area=taskArea(state,task);attachTask(state,task,null,area);task.kanbanColumnId=null;delete task.kanbanOrder;}
  state.projects=state.projects.filter(p=>!ids.has(p.id));
  for(const projectId of ids)if(state.projectBoards)delete state.projectBoards[projectId];
  for(const plan of Object.values(state.plans))if(!plan.snapshot&&plan.focusProjects)plan.focusProjects=plan.focusProjects.filter(id=>!ids.has(id));
  return project;
}
export function normalizeState(state){
  state.vaultPath??='';
  state.areas??=[];state.projects??=[];state.habits??=[];state.habitEntries??={};state.dayLogs??={};
  if(!state.structureVersion){
    if(state.demo&&!state.areas.length)state.areas.push({id:'area-work',name:'Работа',description:'Продукты, проекты и профессиональное развитие.'},{id:'area-personal',name:'Личное',description:'Учёба, система и повседневные дела.'});
    for(const t of state.tasks){
      if(!Object.hasOwn(t,'projectId')){
        const name=t.project?.trim();let p=state.projects.find(p=>!p.parentId&&p.name===name);
        if(name&&name!=='Входящие'&&!p){p={id:'legacy-'+stableNameId(name),name,description:'',parentId:null,areaId:state.demo?(name==='Athena'?'area-work':'area-personal'):null};state.projects.push(p);}
        t.projectId=p?.id||null;
      }
    }
    state.structureVersion=1;
  }
  for(const t of state.tasks){t.projectId??=null;t.areaId??=null;t.cancelled??=false;t.cancelledAt??='';t.recurrence??='none';t.seriesId??=null;t.nextOccurrenceId??=null;t.previousOccurrenceId??=null;t.archived??=false;if(t.projectId){const p=state.projects.find(p=>p.id===t.projectId);if(p){t.project=p.name;t.areaId=projectArea(state,p);}}}
  for(const p of state.projects)if(p.parentId)p.areaId=projectArea(state,p);
  return state;
}
export function validateStructure(state){
  if(state.structureVersion!==undefined&&state.structureVersion!==1)throw new Error('Неизвестная версия структуры.');
  for(const key of ['areas','projects'])if(state[key]!==undefined&&(!Array.isArray(state[key])||state[key].length>2000))throw new Error('Некорректная структура пространства.');
  const areas=state.areas||[],projects=state.projects||[],ids=new Set();
  for(const a of areas){if(!a||!isString(a.id,250)||!a.id||ids.has(a.id)||!isString(a.name,100)||!a.name.trim()||!isString(a.description,3000)||!validEntityIcon(a.icon))throw new Error('Некорректная зона ответственности.');ids.add(a.id);}
  const pids=new Set();for(const p of projects){if(!p||!isString(p.id,250)||!p.id||pids.has(p.id)||!isString(p.name,100)||!p.name.trim()||!isString(p.description,3000)||!validEntityIcon(p.icon)||p.archived!==undefined&&typeof p.archived!=='boolean'||p.completedAt!==undefined&&!(p.completedAt===''||validDate(p.completedAt))||!(p.parentId===null||typeof p.parentId==='string')||!(p.areaId===null||ids.has(p.areaId)))throw new Error('Некорректный проект.');pids.add(p.id);}
  for(const p of projects)if(p.parentId){const parent=projects.find(x=>x.id===p.parentId);if(!parent||parent.id===p.id||parent.parentId||p.areaId!==parent.areaId)throw new Error('Допустимы только проект и один уровень подпроектов с общей зоной.');}
  for(const t of state.tasks){validateRepeat(t);if(t.someday!==undefined&&typeof t.someday!=='boolean'||t.someday&&(t.done||t.cancelled))throw new Error('Некорректное состояние «Когда-нибудь».');if(t.skipped!==undefined&&typeof t.skipped!=='boolean'||t.skippedAt&&!validDate(t.skippedAt)||t.skipped&&(t.done||t.cancelled||!t.archived))throw new Error('Некорректная пропущенная задача.');if(t.projectId!=null&&!pids.has(t.projectId)||t.areaId!=null&&!ids.has(t.areaId)||t.cancelled!==undefined&&typeof t.cancelled!=='boolean'||t.recurrence!==undefined&&!Object.hasOwn(repeatLabels,t.recurrence)||t.cancelled&&t.done||t.cancelledAt&&!validDate(t.cancelledAt))throw new Error('Некорректные связи или статус задачи.');for(const k of ['seriesId','nextOccurrenceId','previousOccurrenceId'])if(t[k]!=null&&!isString(t[k],500))throw new Error('Некорректная серия повторений.');if(t.projectId){const p=projects.find(p=>p.id===t.projectId);if(t.areaId!==projectArea({projects},p))throw new Error('Задача должна наследовать зону проекта.');}}
}
export function saveArea(state,fields){
  const name=String(fields.name||'').trim();if(!name||name.length>100)throw new Error('Введите название зоны до 100 символов.');
  if(state.areas.some(a=>a.id!==fields.id&&a.name.toLocaleLowerCase()===name.toLocaleLowerCase()))throw new Error('Такая зона уже существует.');
  const existing=state.areas.find(a=>a.id===fields.id),icon=fields.icon===undefined?existing?.icon:fields.icon;
  if(!validEntityIcon(icon))throw new Error('Выберите иконку из списка.');
  const area={id:fields.id||newId('area'),name,description:String(fields.description||'').trim().slice(0,3000),...(icon!==undefined?{icon}:{})};
  if(existing)Object.assign(existing,area);else state.areas.push(area);return area;
}
export function saveProject(state,fields){
  const name=String(fields.name||'').trim(),parentId=fields.parentId||null;let areaId=fields.areaId||null;
  if(!name||name.length>100)throw new Error('Введите название проекта до 100 символов.');
  if(areaId&&!state.areas.some(a=>a.id===areaId))throw new Error('Зона не найдена.');
  if(parentId){const parent=state.projects.find(p=>p.id===parentId);if(!parent||parent.parentId||parent.id===fields.id||state.projects.some(p=>p.parentId===fields.id))throw new Error('Доступны два уровня: проект → подпроект.');if(!isProjectAvailable(state,parent))throw new Error('Сначала восстановите родительский проект.');areaId=parent.areaId;}
  if(state.projects.some(p=>p.id!==fields.id&&p.parentId===parentId&&p.name.toLocaleLowerCase()===name.toLocaleLowerCase()))throw new Error('Проект с таким названием уже есть на этом уровне.');
  const existing=state.projects.find(p=>p.id===fields.id),icon=fields.icon===undefined?existing?.icon:fields.icon;
  if(!validEntityIcon(icon))throw new Error('Выберите иконку из списка.');
  const project={id:fields.id||newId('project'),name,description:String(fields.description||'').trim().slice(0,3000),parentId,areaId,...(icon!==undefined?{icon}:{})};
  if(existing)Object.assign(existing,project);else state.projects.push(project);
  for(const child of state.projects.filter(p=>p.parentId===project.id))child.areaId=areaId;
  for(const task of state.tasks){const p=state.projects.find(p=>p.id===task.projectId);if(p){task.project=p.name;task.areaId=projectArea(state,p);}}
  return project;
}
export function attachTask(state,task,projectId=null,areaId=null){
  if(projectId){const p=state.projects.find(p=>p.id===projectId);if(!p)throw new Error('Проект не найден.');if(!isProjectAvailable(state,p))throw new Error('Сначала откройте или восстановите проект.');task.projectId=p.id;task.project=p.name;task.areaId=projectArea(state,p);}
  else{if(areaId&&!state.areas.some(a=>a.id===areaId))throw new Error('Зона не найдена.');task.projectId=null;task.project='Входящие';task.areaId=areaId||null;}
  return task;
}
export function projectTasks(state,id){const ids=new Set([id,...state.projects.filter(p=>p.parentId===id).map(p=>p.id)]);return state.tasks.filter(t=>isTaskActive(state,t)&&ids.has(t.projectId));}
export function areaTasks(state,id){return state.tasks.filter(t=>isTaskActive(state,t)&&taskArea(state,t)===id);}
export function nextDate(date,recurrence){return nextRepeat(date,{recurrence});}
export function setTaskStatus(state,id,status,date,idFactory=newId){
  const task=state.tasks.find(t=>t.id===id);if(!task||!['todo','done','cancelled','someday'].includes(status))throw new Error('Задача или статус не найдены.');
  if(!isProjectAvailable(state,task.projectId))throw new Error('Сначала откройте или восстановите проект.');
  if(!validDate(date))throw new Error('Проверьте дату.');
  validateRepeat(task);
  const nextDue=status==='done'&&task.recurrence&&task.recurrence!=='none'&&!task.nextOccurrenceId?nextRepeat(date,task):null;
  if(!task.skipped||!task.archived||status!=='todo'){task.skipped=false;task.skippedAt='';}if(status==='someday'||Object.hasOwn(task,'someday'))task.someday=status==='someday';task.done=status==='done';task.cancelled=status==='cancelled';task.completedAt=task.done?date:'';task.cancelledAt=task.cancelled?date:'';
  let next=null;
  if(task.done&&task.recurrence!=='none'&&!task.nextOccurrenceId){
    const nextId=idFactory('task');task.seriesId||=task.id;
    next={...task,id:nextId,blockId:'kt-'+nextId.replace(/[^a-zA-Z0-9-]/g,''),done:false,cancelled:false,skipped:false,skippedAt:'',completedAt:'',cancelledAt:'',due:nextDue,repeatAnchor:task.repeatFrom==='due'?(task.repeatAnchor||task.due||date):null,kanbanColumnId:null,archived:false,nextOccurrenceId:null,previousOccurrenceId:task.id};
    task.nextOccurrenceId=nextId;state.tasks.push(next);
  }
  if(task.cancelled||task.someday)for(const plan of Object.values(state.plans))if(!plan.snapshot)plan.selected=plan.selected.filter(x=>x!==id);
  return next;
}
export function importLinks(state,task,existing){
  validateRepeat(task);
  let project=task.projectId&&state.projects.find(p=>p.id===task.projectId);
  if(!project&&task.project&&task.project!=='Входящие')project=state.projects.find(p=>p.name===task.project);
  let areaId=task.areaId&&state.areas.some(a=>a.id===task.areaId)?task.areaId:null;
  if(!areaId&&task.areaName){let a=state.areas.find(a=>a.name===task.areaName);if(!a)a=saveArea(state,{name:task.areaName});areaId=a.id;}
  if(!project&&task.project&&task.project!=='Входящие')project=saveProject(state,{name:task.project,areaId});
  if(!project&&!areaId&&existing&&!task.areaName&&!Object.hasOwn(task,'areaId'))areaId=existing.areaId;
  if(project&&!isProjectAvailable(state,project)&&existing?.projectId===project.id){task.projectId=project.id;task.project=project.name;task.areaId=projectArea(state,project);}
  else attachTask(state,task,project?.id||null,areaId);
  delete task.areaName;return task;
}


// Generate calendar instances on opening/resuming the local app, preserving every old ID.
export function materializeRepeats(state,day,idFactory=newId){
 if(!validDate(day))throw new Error('Некорректный день повторения.');
 let created=0;
 for(let index=0;index<state.tasks.length;index++){
  const t=state.tasks[index];if(t.recurrence==='none'||!t.recurrence||t.repeatFrom!=='due'||!t.due||t.nextOccurrenceId||t.cancelled||t.someday||!isTaskActive(state,t)||t.skipped)continue;
  if(!t.done&&t.due>=day)continue;
  const due=nextRepeat(t.done?(t.completedAt||t.due):t.due,{...t,repeatFrom:'due'});
  if(!t.done&&due>day)continue;
  if(state.tasks.length>=10000)break;
  const id=idFactory('task');if(state.tasks.some(x=>x.id===id))throw new Error('Повторяется ID экземпляра.');
  t.seriesId||=t.id;
  const next={...t,id,blockId:'kt-'+id.replace(/[^a-zA-Z0-9-]/g,''),due,repeatAnchor:t.repeatAnchor||t.due,done:false,cancelled:false,skipped:false,skippedAt:'',completedAt:'',cancelledAt:'',archived:false,nextOccurrenceId:null,previousOccurrenceId:t.id,kanbanColumnId:null};
  delete next.kanbanOrder;
  t.nextOccurrenceId=id;state.tasks.push(next);created++;
  if(t.repeatMissed==='replace')for(const old of state.tasks){if(old.id!==id&&(old.seriesId||old.id)===t.seriesId&&!old.done&&!old.cancelled&&!old.archived&&old.due<due){old.skipped=true;old.skippedAt=due;old.archived=true;}}
 }
 return created;
}
