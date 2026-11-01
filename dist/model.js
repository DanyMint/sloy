import {validateKanban} from './kanban.js';
import {validateWellness} from './wellness.js';
import {normalizeState,validateStructure,importLinks,taskStatus,isTaskActive,isProjectArchived,isTaskPlannable} from './domain.js';
export const STORAGE_KEY = 'kontur-planner-v1';
export const clone = value => JSON.parse(JSON.stringify(value));
export const today = () => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Aqtobe',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function dateOf(s) { return new Date(s + 'T12:00:00Z'); }
export function iso(d) { return d.toISOString().slice(0,10); }
export function addDays(s,n) { const d=dateOf(s); d.setUTCDate(d.getUTCDate()+n); return iso(d); }
export function period(type,anchor) {
  const d=dateOf(anchor); let start,end,key,label;
  if(type==='day') {start=end=anchor;key='day:'+anchor;label='План дня';}
  else if(type==='week') {start=addDays(anchor,-((d.getUTCDay()+6)%7)); end=addDays(start,6); key='week:'+start; const thu=dateOf(addDays(start,3)); const year=thu.getUTCFullYear(); const first=dateOf(year+'-01-04'); const monday=addDays(iso(first),-((first.getUTCDay()+6)%7)); const week=1+Math.round((dateOf(start)-dateOf(monday))/604800000); label='W'+String(week).padStart(2,'0')+' · '+year;}
  else if(type==='quarter') {const q=Math.floor(d.getUTCMonth()/3);start=iso(new Date(Date.UTC(d.getUTCFullYear(),q*3,1,12)));end=iso(new Date(Date.UTC(d.getUTCFullYear(),q*3+3,0,12)));key='quarter:'+d.getUTCFullYear()+'-Q'+(q+1);label=(q+1)+' квартал';}
  else if(type==='month') {start=anchor.slice(0,7)+'-01'; end=iso(new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0,12))); key='month:'+start.slice(0,7); label='Месячный план';}
  else {start=anchor.slice(0,4)+'-01-01';end=anchor.slice(0,4)+'-12-31';key='year:'+anchor.slice(0,4);label='Годовой план';}
  return {type,start,end,key,label};
}
export function shiftPeriod(type,anchor,n) {
  const p=period(type,anchor),d=dateOf(p.start);
  if(type==='day') return addDays(anchor,n);
  if(type==='week') return addDays(p.start,7*n);
  if(type==='quarter') {d.setUTCMonth(d.getUTCMonth()+3*n);return iso(d);}
  if(type==='month') d.setUTCMonth(d.getUTCMonth()+n); else d.setUTCFullYear(d.getUTCFullYear()+n);
  return iso(d);
}
export function inPeriod(date,p) {return !!date && date>=p.start && date<=p.end;}
export function emptyPlan() {return {selected:[],goal:'',capacity:20,snapshot:null,reflection:''};}
export function getPlan(state,p) {return state.plans[p.key] ||= emptyPlan();}
export function freezePlan(state,p,at=new Date().toISOString()) {
  const plan=getPlan(state,p); if(plan.snapshot) throw new Error('План уже зафиксирован');
  const items=plan.selected.map(id=>state.tasks.find(t=>t.id===id&&isTaskPlannable(state,t))).filter(Boolean);
  const focusAreas=(plan.focusAreas||[]).map(id=>state.areas.find(a=>a.id===id)).filter(Boolean).map(clone),focusProjects=(plan.focusProjects||[]).map(id=>state.projects.find(a=>a.id===id&&!isProjectArchived(state,a))).filter(Boolean).map(p=>({...clone(p),areaName:state.areas.find(a=>a.id===p.areaId)?.name||'Без зоны',parentName:state.projects.find(parent=>parent.id===p.parentId)?.name||''}));
  if(!items.length&&!focusAreas.length&&!focusProjects.length) throw new Error('Выберите задачи или фокусные проекты и зоны');
  plan.snapshot={at,goal:plan.goal,capacity:plan.capacity,items:items.map(({id,title,project,projectId,areaId,estimate,due,source,blockId})=>({id,title,project,projectId,areaId,estimate,due,source,blockId}))};
  if(plan.journalVersion===2||p.type==='quarter')Object.assign(plan.snapshot,{focusAreas,focusProjects});
  return plan.snapshot;
}
export function comparison(state,p) {
  const plan=getPlan(state,p),items=plan.snapshot?.items || plan.selected.map(id=>state.tasks.find(t=>t.id===id&&isTaskPlannable(state,t))).filter(Boolean);
  const ids=new Set(items.map(t=>t.id));
  const rows=items.map(item=> {const live=state.tasks.find(t=>t.id===item.id);const changed=!!live&&['title','project','estimate','due'].some(k=>String(live[k]??'')!==String(item[k]??''));return {item,live,changed,done:!!live&&!live.cancelled&&live.done&&inPeriod(live.completedAt,p)};});
  const extras=state.tasks.filter(t=>!t.cancelled&&t.done&&inPeriod(t.completedAt,p)&&!ids.has(t.id));
  return {rows,extras,done:rows.filter(r=>r.done).length,total:rows.length,hours:items.reduce((sum,t)=>sum+(Number(t.estimate)||0),0),changed:rows.filter(r=>r.changed).length};
}
export function hash(s) {let h=2166136261;for(const c of s) {h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return (h>>>0).toString(36);}
export function parseMarkdown(text,source='Inbox.md') {
  const tasks=[],seen=new Set(); const path=source.trim().replace(/\\/g,'/').replace(/\.md$/i,'')+'.md';
  for(const line of text.split(/\r?\n/)) {
    const match=line.match(/^\s*[-*+]\s+\[([ xX-])\]\s+(.+)$/); if(!match) continue;
    const raw=match[2],blockId=raw.match(/\^([\w-]+)\s*$/)?.[1]||'';
    const due=raw.match(/📅\s*(\d{4}-\d{2}-\d{2})/)?.[1]||'';
    const completedAt=raw.match(/✅\s*(\d{4}-\d{2}-\d{2})/)?.[1]||'';
    const recurrence=raw.match(/\[repeat::\s*(none|daily|weekdays|weekly|monthly|yearly|custom)\s*\]/)?.[1];
    const someday=raw.match(/\[someday::\s*(true|false)\s*\]/)?.[1];
    const repeatMissed=raw.match(/\[repeat_missed::\s*(keep|replace)\s*\]/)?.[1];
    const repeatAnchor=raw.match(/\[repeat_anchor::\s*(\d{4}-\d{2}-\d{2})\s*\]/)?.[1];
    const repeatEvery=raw.match(/\[repeat_every::\s*(\d+)\s*\]/)?.[1],repeatUnit=raw.match(/\[repeat_unit::\s*(days|weeks|months|years)\s*\]/)?.[1],repeatFrom=raw.match(/\[repeat_from::\s*(completion|due)\s*\]/)?.[1];
    const projectId=raw.match(/\[project_id::\s*([^\]\s]+)\s*\]/)?.[1];
    const areaId=raw.match(/\[area_id::\s*([^\]\s]+)\s*\]/)?.[1];
    const areaName=raw.match(/\[area::\s*([^\]\s]+)\s*\]/)?.[1];
    const estimate=Number(raw.match(/\[estimate::\s*([\d.]+)\s*\]/)?.[1]||0);
    for(const value of [due,completedAt]) if(value&&(Number.isNaN(dateOf(value).getTime())||iso(dateOf(value))!==value)) throw new Error('Некорректная дата в задаче: '+value);
    if(!Number.isFinite(estimate)||estimate<0||estimate>8760) throw new Error('Некорректная оценка задачи. Укажите часы от 0 до 8760.');
    const project=raw.match(/(?:^|\s)#([\p{L}\p{N}_/-]+)/u)?.[1]||'Входящие';
    const title=raw.replace(/\^[\w-]+\s*$/,'').replace(/[📅✅⏳🛫➕]\s*\d{4}-\d{2}-\d{2}/gu,'').replace(/\[estimate::\s*[\d.]+\s*\]/g,'').replace(/\[(?:repeat|repeat_every|repeat_unit|repeat_from|repeat_anchor|repeat_missed|project_id|area_id|area|someday)::[^\]]*\]/g,'').replace(/(?:^|\s)#[\p{L}\p{N}_/-]+/gu,'').trim();
    if(!title) continue;
    const id=blockId?'md:'+path+'#'+blockId:'md:'+path+'#auto-'+hash(title);
    if(seen.has(id)) throw new Error('В файле повторяется ID задачи: '+(blockId||title));
    seen.add(id);tasks.push({id,title,project,estimate,due,done:match[1].toLowerCase()==='x',completedAt,source:path,blockId:blockId||'kt-'+hash(title),archived:false,cancelled:match[1]==='-',...(someday?{someday:someday==='true'&&match[1]===' '}:{}),...(recurrence?{recurrence}:{}),...(repeatEvery?{repeatEvery:Number(repeatEvery)}:{}),...(repeatUnit?{repeatUnit}:{}),...(repeatFrom?{repeatFrom}:{}),...(repeatAnchor?{repeatAnchor}:{}),...(repeatMissed?{repeatMissed}:{}),...(projectId?{projectId:projectId==='none'?null:projectId}:{}),...(areaId?{areaId:areaId==='none'?null:areaId}:{}),...(areaName?{areaName:decodeURIComponent(areaName)}:{})});
  }
  return tasks;
}
export function mergeTasks(state,incoming) {
  normalizeState(state);let added=0,updated=0;
  for(const task of incoming) {
    // Generated block IDs from a previous export must resolve to the same task.
    const existing=state.tasks.find(t=>t.id===task.id || (t.source===task.source&&t.blockId===task.blockId));
    const linked=importLinks(state,{...task},existing);
    if(existing) {Object.assign(existing,linked,{id:existing.id});updated++;} else {state.tasks.push(linked);added++;}
  }
  normalizeState(state);return {added,updated};
}
export function tasksMarkdown(state,source=null) {
  return state.tasks.filter(t=>!t.archived&&(!source||t.source===source)).map(t=>{
    const area=state.areas?.find(a=>a.id===t.areaId);
    return '- ['+(t.cancelled?'-':t.done?'x':' ')+'] '+t.title+' #'+(t.project||'Входящие').replace(/\s+/g,'_')+(t.estimate?' [estimate:: '+t.estimate+']':'')+(t.due?' 📅 '+t.due:'')+(t.done&&t.completedAt?' ✅ '+t.completedAt:'')+' [repeat:: '+(t.recurrence||'none')+']'+(t.recurrence==='custom'?' [repeat_every:: '+(t.repeatEvery||1)+'] [repeat_unit:: '+(t.repeatUnit||'days')+']':'')+(t.recurrence&&t.recurrence!=='none'?' [repeat_from:: '+(t.repeatFrom||'completion')+']':'')+(t.repeatMissed?' [repeat_missed:: '+t.repeatMissed+']':'')+(t.repeatAnchor?' [repeat_anchor:: '+t.repeatAnchor+']':'')+(Object.hasOwn(t,'someday')?' [someday:: '+t.someday+']':'')+' [project_id:: '+(t.projectId||'none')+'] [area_id:: '+(t.areaId||'none')+']'+(area?' [area:: '+encodeURIComponent(area.name)+']':'')+' ^'+t.blockId;
  }).join('\n')+'\n';
}

function mdText(s) {return String(s||'').replace(/[\r\n]+/g,' ').replace(/\|/g,'\\|');}
export function planMarkdown(state,p) {
  const record=getPlan(state,p);
  if(p.type==='year'&&record.journalVersion===2){
    const fixed=record.snapshot,areas=fixed?.focusAreas||(record.focusAreas||[]).map(id=>state.areas.find(e=>e.id===id)).filter(Boolean),projects=fixed?.focusProjects||(record.focusProjects||[]).map(id=>state.projects.find(e=>e.id===id)).filter(Boolean);
    return ['---','type: year-focus','year: '+p.start.slice(0,4),'frozen_at: '+(fixed?.at||'null'),'---','','# Фокус года · '+p.start.slice(0,4),'',fixed?'Зафиксирован: '+fixed.at:'Черновик','','## Фокус','',fixed?.goal||record.goal||'—','','## Зоны в фокусе','',...areas.map(a=>'- '+mdText(a.name)+(a.description?' — '+mdText(a.description):'')),'','## Проекты в фокусе','',...projects.map(a=>'- '+mdText(a.name)+(a.areaName?' · '+mdText(a.areaName):'')+(a.description?' — '+mdText(a.description):'')),''].join('\n');
  }
  if(p.type==='quarter'&&record.journalVersion===2){
    const fixed=record.snapshot,projects=fixed?.focusProjects||(record.focusProjects||[]).map(id=>state.projects.find(e=>e.id===id)).filter(Boolean);
    return ['---','type: quarter-focus','period_start: '+p.start,'period_end: '+p.end,'frozen_at: '+(fixed?.at||'null'),'---','','# Фокус квартала · '+p.label+' '+p.start.slice(0,4),'',fixed?'Зафиксирован: '+fixed.at:'Черновик','','## Фокус','',fixed?.goal||record.goal||'—','','## Проекты в фокусе','',...projects.map(e=>'- '+mdText(e.name)+(e.parentName?' · '+mdText(e.parentName):'')+(e.areaName?' · '+mdText(e.areaName):'')),''].join('\n');
  }
  const plan=getPlan(state,p),c=comparison(state,p);const lines=['---','type: '+p.type+'-plan','period_start: '+p.start,'period_end: '+p.end,'frozen_at: '+(plan.snapshot?.at||'null'),'---','','# План · '+p.start+' — '+p.end,'',plan.snapshot?'Зафиксирован: '+plan.snapshot.at:'Черновик — состав ещё можно менять','','## Фокус','',plan.snapshot?.goal||plan.goal||'Не задан','','## Исходный план',''];
  if(p.type==='quarter'){const projects=plan.snapshot?.focusProjects||(plan.focusProjects||[]).map(id=>state.projects.find(e=>e.id===id)).filter(Boolean);lines.splice(lines.length-3,0,'## Фокусные проекты','',...projects.map(e=>'- '+mdText(e.name)),'');}
  for(const {item} of c.rows) lines.push('- '+mdText(item.title)+' · '+(item.estimate||0)+' ч'+(item.due?' · срок '+item.due:'')+' → [['+item.source.replace(/\.md$/i,'')+'#^'+item.blockId+']]');
  lines.push('','## Факт на '+today(),'','Выполнено в периоде: '+c.done+' / '+c.total,'','| Исходная задача | Текущее состояние | Дата выполнения |','| --- | --- | --- |');
  for(const {item,live,done} of c.rows) lines.push('| '+mdText(item.title)+' | '+(!live?'Исходная задача отсутствует':live.skipped?'Пропущена':live.cancelled?'Отменена':done?'Выполнена в периоде'+(live.archived?' · архив':''):live.done?'Выполнена вне периода / дата неизвестна':live.archived?'В архиве':'Не выполнена')+' | '+(live?.completedAt||'—')+' |');
  lines.push('','## Сделано вне плана',''); for(const t of c.extras) lines.push('- '+mdText(t.title)+' · '+t.completedAt);
  lines.push('','## Рефлексия','',plan.reflection||'','');return lines.join('\n');
}
export function validateBackup(input) {
  if(!input||input.version!==1||!Array.isArray(input.tasks)||!input.plans||typeof input.plans!=='object'||Array.isArray(input.plans)||input.tasks.length>10000) throw new Error('Не подходит формат резервной копии Sloy.');
  if(input.vaultPath!==undefined&&(typeof input.vaultPath!=='string'||input.vaultPath.length>4096))throw new Error('Некорректный путь к хранилищу Obsidian.');
  const dateOk=d=>typeof d==='string'&&(!d||/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(dateOf(d).getTime())&&iso(dateOf(d))===d);
  const ids=new Set();
  for(const t of input.tasks) {if(typeof t.id!=='string'||ids.has(t.id)||typeof t.title!=='string'||!t.title.trim()||typeof t.project!=='string'||typeof t.source!=='string'||typeof t.blockId!=='string'||!dateOk(t.due)||!dateOk(t.completedAt)||typeof t.done!=='boolean'||!Number.isFinite(t.estimate)||t.estimate<0) throw new Error('Некорректная задача в резервной копии.'); ids.add(t.id);}
  for(const [key,p] of Object.entries(input.plans)) {
    if(!/^((day|week):\d{4}-\d{2}-\d{2}|month:\d{4}-\d{2}|quarter:\d{4}-Q[1-4]|year:\d{4})$/.test(key)||!p||!Array.isArray(p.selected)||p.selected.some(id=>typeof id!=='string')||typeof p.goal!=='string'||typeof p.reflection!=='string'||!Number.isFinite(p.capacity)||p.capacity<0) throw new Error('Некорректный план в резервной копии.');
    if(p.snapshot&&(!Array.isArray(p.snapshot.items)||typeof p.snapshot.at!=='string'||typeof p.snapshot.goal!=='string'||!Number.isFinite(p.snapshot.capacity)||p.snapshot.items.some(t=>!t||typeof t.id!=='string'||typeof t.title!=='string'||typeof t.source!=='string'||typeof t.blockId!=='string'||!Number.isFinite(t.estimate)))) throw new Error('Некорректный снимок плана.');
    for(const k of ['focusAreas','focusProjects']){
      if(p[k]!==undefined&&(!Array.isArray(p[k])||p[k].some(id=>typeof id!=='string')))throw new Error('Некорректный фокус плана.');
      if(p.snapshot?.[k]!==undefined&&(!Array.isArray(p.snapshot[k])||p.snapshot[k].some(e=>!e||typeof e.id!=='string'||typeof e.name!=='string'||typeof e.description!=='string')))throw new Error('Некорректный снимок фокуса.');
    }
    for(const key of ['direct','overplan'])if(p[key]!==undefined&&(!Array.isArray(p[key])||p[key].some(id=>typeof id!=='string')))throw new Error('Некорректные задачи дня.');
    if(p.journalVersion!==undefined&&p.journalVersion!==2)throw new Error('Неизвестная версия Journal.');
    if(p.legacyPlan)validateBackup({...input,plans:{[key]:p.legacyPlan}});
  }
  validateStructure(input);validateWellness(input);validateKanban(input);return normalizeState(clone(input));
}
export function seedState() {
  const now=today(),p=period('week',now);const entries=[
    ['Описать сценарий импорта абитуриентов','Athena',3,addDays(p.start,1),true],
    ['Собрать прототип аналитики грантов','Athena',5,addDays(p.start,4),false],
    ['Настроить резервное копирование','Система',2,addDays(p.start,3),false],
    ['Разобрать заметки за неделю','Личное',1,addDays(p.start,5),false],
    ['Пройти тему по PostgreSQL','Обучение',2,addDays(p.start,2),true],
    ['Подготовить вопросы для интервью','Карьера',2,'',false],
    ['Проверить импорт большого CSV','Athena',3,'',false]
  ];
  const tasks=entries.map(([title,project,estimate,due,done],i)=>({id:'demo-'+i,title,project,estimate,due,done,completedAt:done?(due>now?now:due):'',source:'Задачи.md',blockId:'kt-demo-'+i,archived:false}));
  const plan=emptyPlan();plan.goal='Довести аналитику Athena до первого рабочего прототипа и освободить время на ревью.';plan.selected=tasks.slice(0,4).map(t=>t.id);plan.capacity=16;
  return normalizeState({version:1,demo:true,tasks,plans:{[p.key]:plan},vault:''});
}
