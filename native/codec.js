import {parseDocument, stringify} from 'yaml';
import {normalizeState} from '../dist/domain.js';
import {validateBackup,period,addDays,hash} from '../dist/model.js';
import {sleepMinutes} from '../dist/wellness.js';
import {defaultKnowledgeRules,knowledgeCategories,knowledgeCounts,knowledgeSummary} from '../dist/knowledge.js';

export const defaults={areas:'Areas',projects:'Projects',habits:'Habits/Definitions',habitRecords:'Habits/Records',journals:'Journals',knowledge:'Knowledge',knowledgeMode:'folders',knowledgeTypeProperty:'type',knowledgeTypes:defaultKnowledgeRules(),createdProperty:'created',timezone:'Asia/Aqtobe'};
export const emptyState=()=>normalizeState({version:1,structureVersion:1,demo:false,tasks:[],areas:[],projects:[],habits:[],plans:{},habitEntries:{},dayLogs:{},knowledgeFacts:{},vault:'',vaultPath:''});
const copy=v=>JSON.parse(JSON.stringify(v));
const safe=s=>String(s).replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').trim().replace(/[. ]+$/,'').slice(0,110)||'Untitled';
const inFolder=(path,folder)=>path.startsWith(folder.replace(/\/$/,'')+'/');
const link=p=>p?'[['+p.replace(/\.md$/i,'')+']]':null;
export function parseNote(document){
 const text=document.text??'',match=text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/),yaml=parseDocument(match?.[1]||'',{uniqueKeys:true});
 if(yaml.errors.length)throw new Error(document.path+': '+yaml.errors[0].message);
 const meta=yaml.toJS()||{};if(typeof meta!=='object'||Array.isArray(meta))throw new Error(document.path+': YAML должен быть объектом');
 return {...document,meta,yaml,body:match?text.slice(match[0].length):text,hasFrontmatter:!!match};
}
function patched(note,fields,body=note.body){
 for(const [key,value] of Object.entries(fields)){if(value===undefined)note.yaml.delete(key);else note.yaml.set(key,value);}
 return '---\n'+note.yaml.toString().trimEnd()+'\n---\n'+body;
}
function region(body,name,content){
 const start='<!-- sloy:'+name+':start -->',end='<!-- sloy:'+name+':end -->';
 if(body.includes(start)!==body.includes(end))throw new Error('Повреждён блок Sloy: '+name);
 const replacement=start+'\n'+content.trimEnd()+'\n'+end;
 if(body.includes(start)){const a=body.indexOf(start),b=body.indexOf(end,a)+end.length;if(body.indexOf(start,a+start.length)!==-1||b<end.length)throw new Error('Повторяющийся блок Sloy: '+name);return body.slice(0,a)+replacement+body.slice(b);}
 return body.trimEnd()+'\n\n'+replacement+'\n';
}
const idOf=(note,kind)=>String(note.meta.sloy_id||kind+'-'+hash(note.path));
function kindOf(note,cfg){const t=note.meta.sloy_type;if(t)return t;for(const key of ['areas','projects','habits','habitRecords','journals'])if(inFolder(note.path,cfg[key]))return {areas:'area',projects:'project',habits:'habit',habitRecords:'habit-record',journals:'journal'}[key];return null;}
const nameOf=n=>String(n.meta.name||n.body.match(/^#\s+(.+)$/m)?.[1]||n.path.split('/').pop().replace(/\.md$/i,''));
function resolveParent(value,notes){
 if(!value)return null;
 const p=String(Array.isArray(value)?value[0]:value).replace(/^\[\[|\]\]$/g,'').split('|')[0].replace(/\.md$/i,'');
 const matches=notes.filter(n=>[n.path.replace(/\.md$/i,''),n.path.split('/').pop().replace(/\.md$/i,''),n.id].includes(p));
 if(matches.length!==1)throw new Error('Родитель не найден или неоднозначен: '+p+'. Дождитесь синхронизации.');return matches[0];
}
export function parseRule(rule){
 const r=String(rule||'').trim().toLowerCase(),from=/ when done$/.test(r)?'completion':'due',base=r.replace(/ when done$/,'');
 const simple={'every day':'daily','every weekday':'weekdays','every week':'weekly','every month':'monthly','every year':'yearly'};
 if(simple[base])return {recurrence:simple[base],repeatFrom:from};
 const m=base.match(/^every (\d+) (days?|weeks?|months?|years?)$/);if(m&&+m[1]>=1&&+m[1]<=365)return {recurrence:'custom',repeatEvery:+m[1],repeatUnit:m[2].replace(/s$/,'')+'s',repeatFrom:from};
 return {recurrence:'none',nativeRecurrenceRule:rule};
}
export function ruleOf(task){
 if(task.nativeRecurrenceRule)return task.nativeRecurrenceRule;
 if(!task.recurrence||task.recurrence==='none')return '';
 const r={daily:'every day',weekdays:'every weekday',weekly:'every week',monthly:'every month',yearly:'every year'}[task.recurrence]||'every '+(task.repeatEvery||1)+' '+(task.repeatUnit||'days');
 return r+(task.repeatFrom==='completion'?' when done':'');
}
const taskFields=['estimate','archived','cancelledAt','seriesId','nextOccurrenceId','previousOccurrenceId','repeatMissed','repeatAnchor','skipped','skippedAt','someday','kanbanColumnId','kanbanOrder'];
export function parseTasks(note,owner){
 const rows=[],lines=note.body.split('\n');let fence=null;
 for(let i=0;i<lines.length;i++){
  const line=lines[i],f=line.match(/^\s*(`{3,}|~{3,})/);if(f){if(!fence)fence=f[1][0];else if(f[1][0]===fence)fence=null;continue;}if(fence)continue;
  const m=line.match(/^(\s*[-*+]\s+)\[([^\]])\]\s+(.+)$/);if(!m)continue;
  const raw=m[3],metaRaw=raw.match(/\[sloy_meta::\s*([^\]]+)\]/)?.[1];let extras={};
  if(metaRaw){try{extras=JSON.parse(decodeURIComponent(metaRaw));}catch{throw new Error(note.path+': повреждены свойства задачи');}}
  const block=raw.match(/\^([\w-]+)\s*$/)?.[1]||'',tasksId=raw.match(/🆔\s*([A-Za-z0-9]+)/u)?.[1]||'',id=raw.match(/\[sloy_id::\s*([^\]]+)\]/)?.[1]?.trim()||tasksId||'task-'+hash(note.path+'#'+(block||i+':'+raw));
  const due=raw.match(/📅\s*(\d{4}-\d{2}-\d{2})/u)?.[1]||'',completedAt=raw.match(/✅\s*(\d{4}-\d{2}-\d{2})/u)?.[1]||'';
  const repeat=raw.match(/🔁\s*(.*?)(?=\s+(?:[📅✅⏳🛫➕🆔🔺⏫🔼🔽⏬]|\[sloy_|\^)|$)/u)?.[1]?.trim()||'';
  const title=raw.replace(/\[sloy_(?:id|meta)::[^\]]*\]/g,'').replace(/\^[\w-]+\s*$/,'').replace(/[📅✅]\s*\d{4}-\d{2}-\d{2}/gu,'').replace(/🆔\s*[A-Za-z0-9]+/gu,'').replace(/🔁\s*(.*?)(?=\s+(?:[📅✅⏳🛫➕🆔🔺⏫🔼🔽⏬]|\[sloy_|\^)|$)/u,'').replace(/[⏳🛫➕]\s*\d{4}-\d{2}-\d{2}/gu,'').trim();
  const preserved=(raw.match(/[⏳🛫➕]\s*\d{4}-\d{2}-\d{2}/gu)||[]).join(' ');
  if(!title)continue;
  const task={id,title,project:owner.kind==='project'?owner.name:'Входящие',projectId:owner.kind==='project'?owner.id:null,areaId:owner.kind==='area'?owner.id:owner.areaId||null,estimate:0,due,done:/x/i.test(m[2]),cancelled:m[2]==='-',completedAt,source:note.path,blockId:block||'sloy-'+id.replace(/[^a-zA-Z0-9-]/g,''),archived:false,recurrence:'none',...Object.fromEntries(taskFields.filter(k=>Object.hasOwn(extras,k)).map(k=>[k,extras[k]])),...(repeat?parseRule(repeat):{}),nativeTaskId:tasksId||id.replace(/[^a-zA-Z0-9]/g,''),nativePreserved:preserved};
  rows.push({line:i,raw:line,prefix:m[1],marker:m[2],task});
 }
 return rows;
}
export function decodeVault(documents,settings={}){
 const cfg={...defaults,...settings},notes=documents.map(parseNote),state=emptyState(),entities=[];const seen=new Set(),bindings=new Map();
 for(const note of notes){note.kind=kindOf(note,cfg);if(!['area','project','habit'].includes(note.kind))continue;note.id=idOf(note,note.kind);if(seen.has(note.id))throw new Error('Повторяется sloy_id: '+note.id);seen.add(note.id);note.name=nameOf(note);entities.push(note);}
 for(const n of entities.filter(n=>n.kind==='area')){const a={id:n.id,name:n.name,description:String(n.meta.description||''),icon:n.meta.icon||'',archived:!!n.meta.archived};state.areas.push(a);bindings.set(n.id,{note:n,kind:n.kind});}
 for(const n of entities.filter(n=>n.kind==='project')){const parent=resolveParent(n.meta.parent,entities.filter(n=>['area','project'].includes(n.kind)));n.parentId=parent?.kind==='project'?parent.id:null;n.areaId=parent?.kind==='area'?parent.id:parent?.kind==='project'?resolveParent(parent.meta.parent,entities.filter(n=>n.kind==='area'))?.id||null:null;const p={id:n.id,name:n.name,description:String(n.meta.description||''),icon:n.meta.icon||'',parentId:n.parentId,areaId:n.areaId,archived:!!n.meta.archived,completedAt:String(n.meta.completed||'')};state.projects.push(p);if(n.meta.sloy_board)(state.projectBoards??={})[n.id]=n.meta.sloy_board;bindings.set(n.id,{note:n,kind:n.kind});}
 for(const n of entities.filter(n=>n.kind==='habit')){state.habits.push({id:n.id,name:n.name,unit:String(n.meta.unit||''),step:Number(n.meta.step??1),target:Number(n.meta.target??1),createdOn:String(n.meta.created||'2000-01-01'),archivedOn:n.meta.archivedOn||null,icon:n.meta.icon||''});bindings.set(n.id,{note:n,kind:n.kind});}
 for(const n of entities.filter(n=>['area','project'].includes(n.kind))){for(const row of parseTasks(n,n)){if(seen.has(row.task.id))throw new Error('Повторяется ID задачи: '+row.task.id);seen.add(row.task.id);state.tasks.push(row.task);bindings.set(row.task.id,{note:n,kind:'task',row});}}
 const journalKeys=new Set();for(const n of notes){
  if(n.kind==='journal'){
   const key=n.meta.period;if(!key||!/^((day|week):\d{4}-\d{2}-\d{2}|quarter:\d{4}-Q[1-4]|year:\d{4})$/.test(key))continue;
   if(journalKeys.has(key))throw new Error('Две заметки для периода: '+key);journalKeys.add(key);
   if(n.meta.sloy_plan)state.plans[key]=copy(n.meta.sloy_plan);
   if(key.startsWith('day:')){const day=key.slice(4);if(n.meta.sloy_day)state.dayLogs[day]={bedDate:'',bedTime:'',wakeTime:'',wellbeing:null,note:'',...n.meta.sloy_day};if(n.meta.sloy_knowledge)(state.knowledgeFacts??={})[day]=copy(n.meta.sloy_knowledge);}
   bindings.set(key,{note:n,kind:'journal'});
  }else if(n.kind==='habit-record'&&n.meta.date){const day=String(n.meta.date);state.habitEntries[day]=copy(n.meta.counters||{});bindings.set('counters:'+day,{note:n,kind:n.kind});}
 }
 state.vaultPath=settings.vaultPath||'';state.vault=settings.vaultName||'';
 return {state:validateBackup(state),notes,bindings};
}
function taskLine(task,old){
 const meta=Object.fromEntries(taskFields.filter(k=>task[k]!==undefined&&task[k]!==null&&task[k]!==''&&task[k]!==false).map(k=>[k,task[k]]));
 const marker=task.done?'x':task.cancelled?'-':old&&!old.task.done&&!old.task.cancelled&&![' ','x','X','-'].includes(old.marker)?old.marker:' ';
 const r=ruleOf(task);return (old?.prefix||'- ')+'['+marker+'] '+task.title.replace(/[\r\n]+/g,' ')+(task.nativePreserved?' '+task.nativePreserved:'')+(r?' 🔁 '+r:'')+(task.due?' 📅 '+task.due:'')+(task.done&&task.completedAt?' ✅ '+task.completedAt:'')+' 🆔 '+(task.nativeTaskId||task.id.replace(/[^a-zA-Z0-9]/g,''))+' [sloy_id:: '+task.id+']'+(Object.keys(meta).length?' [sloy_meta:: '+encodeURIComponent(JSON.stringify(meta))+']':'')+' ^'+task.blockId;
}
function sameTask(a,b){const keys=['title','due','done','cancelled','completedAt','recurrence','repeatEvery','repeatUnit','repeatFrom','nativeRecurrenceRule',...taskFields];return keys.every(k=>JSON.stringify(a[k]??null)===JSON.stringify(b[k]??null));}
const fmt=s=>String(s||'').replace(/[\r\n]+/g,' ');
function summary(state,key){const [type,part]=key.split(':'),anchor=type==='year'?part+'-01-01':type==='quarter'?part.slice(0,4)+'-'+String((+part.slice(-1)-1)*3+1).padStart(2,'0')+'-01':part,p=period(type,anchor),days=Object.entries(state.knowledgeFacts||{}).filter(([d])=>d>=p.start&&d<=p.end),logs=Object.entries(state.dayLogs).filter(([d])=>d>=p.start&&d<=p.end);const avg=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null;return {knowledgeCreated:days.reduce((s,[,f])=>s+f.count,0),knowledgeByType:knowledgeSummary(state.knowledgeFacts,p.start,p.end).byType,sleepMinutes:avg(logs.map(([d,l])=>sleepMinutes(d,l)).filter(Number.isFinite)),wellbeing:avg(logs.map(([,l])=>l.wellbeing).filter(Number.isFinite)),daysRecorded:days.length};}
export function finalizeKnowledge(state,counts,today,at=new Date().toISOString(),byType){
 state.knowledgeFacts??={};for(const day of new Set([...Object.keys(counts),...Object.keys(state.knowledgeFacts)])){
  if(day>today)continue;const old=state.knowledgeFacts[day];if(old?.closed)continue;
  const closingSaved=day<today&&old,count=closingSaved?old.count:counts[day]||0,closed=day<today;
  const types=closingSaved?old.byType:byType?knowledgeCounts({count,byType:byType[day]}):undefined;
  if(old&&old.count===count&&old.closed===closed&&JSON.stringify(old.byType)===JSON.stringify(types))continue;
  state.knowledgeFacts[day]={count,...(types?{byType:types}:{}),closed,updatedAt:at};
 }
}
export function encodeVault(state,decoded,settings={}){
 const cfg={...defaults,...settings},writes=new Map(),deletes=[],paths=new Map(),before=decoded.state;
 const make=(id,folder,name)=>{const old=decoded.bindings.get(id)?.note,path=old?.path||folder+'/'+safe(name)+' -- '+safe(id).slice(-12)+'.md';paths.set(id,path);return old||parseNote({path,text:'# '+name+'\n',hash:null});};
 const entityNotes=new Map();
 for(const [kind,items,folder] of [['area',state.areas,cfg.areas],['project',state.projects,cfg.projects],['habit',state.habits,cfg.habits]])for(const e of items)entityNotes.set(e.id,{kind,e,note:make(e.id,folder,e.name)});
 let inbox;
 const tasksByPath=new Map();for(const t of state.tasks){let owner=entityNotes.get(t.projectId||t.areaId);if(!owner){inbox??=parseNote(decoded.notes.find(n=>n.path===cfg.areas+'/Inbox.md')||{path:cfg.areas+'/Inbox.md',text:'---\nsloy_type: area\nsloy_id: sloy-inbox\nname: Inbox\n---\n# Inbox\n',hash:null});owner={note:inbox};}t.source=owner.note.path;paths.set(t.id,t.source);if(!tasksByPath.has(t.source))tasksByPath.set(t.source,[]);tasksByPath.get(t.source).push(t);}
 for(const {kind,e,note} of entityNotes.values()){
  const parent=kind==='project'?paths.get(e.parentId||e.areaId):null;
  let fields={sloy_type:kind,sloy_id:e.id,name:e.name,icon:e.icon||'',description:e.description||''};
  if(kind==='project')Object.assign(fields,{parent:link(parent),archived:!!e.archived,completed:e.completedAt||null,sloy_board:state.projectBoards?.[e.id]});
  if(kind==='area')fields.archived=!!e.archived;
  if(kind==='habit')Object.assign(fields,{unit:e.unit,step:e.step,target:e.target,created:e.createdOn,archivedOn:e.archivedOn});
  writes.set(note.path,{path:note.path,expectedHash:note.hash??null,text:patched(note,fields)});
 }
 if(inbox&&!writes.has(inbox.path))writes.set(inbox.path,{path:inbox.path,expectedHash:inbox.hash??null,text:patched(inbox,{})});
 const oldOwners=new Set([...decoded.bindings.values()].filter(b=>b.kind==='task').map(b=>b.note.path));
 for(const path of new Set([...tasksByPath.keys(),...oldOwners])){
  const draft=writes.get(path),base=decoded.notes.find(n=>n.path===path)||parseNote({path,text:draft?.text||'',hash:null}),note=draft?parseNote({...base,text:draft.text}):base;
  const lines=note.body.split('\n'),rows=[...decoded.bindings.values()].filter(b=>b.kind==='task'&&b.note.path===path).map(b=>b.row),byId=new Map((tasksByPath.get(path)||[]).map(t=>[t.id,t])),used=new Set();
  for(const row of rows){const t=byId.get(row.task.id);if(!t)lines[row.line]='';else{used.add(t.id);lines[row.line]=sameTask(t,row.task)?row.raw:taskLine(t,row);if(!row.raw.includes('[sloy_id::'))lines[row.line]=taskLine(t,row);}}
  for(const t of byId.values())if(!used.has(t.id))lines.push(taskLine(t));
  writes.set(path,{path,expectedHash:base.hash??null,text:patched(note,{},lines.join('\n'))});
 }
 for(const [id,b] of decoded.bindings){if(['area','project','habit'].includes(b.kind)&&!entityNotes.has(id)){
   // Keep moved tasks in their new owners; the old note goes to the recoverable vault trash.
   writes.delete(b.note.path);deletes.push({path:b.note.path,expectedHash:b.note.hash});
 }}
 const journalDays=new Set([...Object.keys(state.dayLogs),...Object.keys(state.knowledgeFacts||{})]);for(const day of journalDays)if(!state.plans['day:'+day])state.plans['day:'+day]={selected:[],goal:'',capacity:8,snapshot:null,reflection:state.dayLogs[day]?.note||'',journalVersion:2};
 for(const [key,plan] of Object.entries(state.plans)){
  const note=make(key,cfg.journals+'/'+({day:'Daily',week:'Weekly',quarter:'Quarterly',year:'Yearly'}[key.split(':')[0]]||'Legacy'),key.replace(':',' ')),day=key.startsWith('day:')?key.slice(4):null,items=plan.snapshot?.items||plan.selected.map(id=>state.tasks.find(t=>t.id===id)).filter(Boolean),projects=plan.snapshot?.focusProjects||(plan.focusProjects||[]).map(id=>state.projects.find(p=>p.id===id)).filter(Boolean);
  const selected=items.map(t=>'- '+fmt(t.title)+' → '+(link(paths.get(t.id)||t.source)?.replace(/\]\]$/,'#^'+t.blockId+']]')||t.id)).concat(projects.map(p=>'- '+fmt(p.name)+' → '+link(paths.get(p.id))));
  let body=region(note.body,'plan','## План'+(plan.snapshot?' · зафиксирован '+plan.snapshot.at:' · черновик')+'\n\n'+fmt(plan.snapshot?.goal||plan.goal)+'\n\n'+selected.join('\n'));
  const [type,part]=key.split(':'),p=period(type,type==='year'?part+'-01-01':type==='quarter'?part.slice(0,4)+'-'+String((+part.slice(-1)-1)*3+1).padStart(2,'0')+'-01':part),done=state.tasks.filter(t=>t.done&&!t.cancelled&&t.completedAt>=p.start&&t.completedAt<=p.end);
  body=region(body,'fact','## Сделано\n\n'+done.map(t=>'- '+fmt(t.title)+' · '+t.completedAt).join('\n'));
  body=region(body,'reflection','## Что беру с собой дальше\n\n'+(plan.reflection||''));const stats=summary(state,key);
  body=region(body,'stats','## Статистика\n\nСоздано заметок Knowledge: '+stats.knowledgeCreated+'\n\n'+knowledgeCategories.map(({id,label})=>'- '+label+': '+stats.knowledgeByType[id]).join('\n')+'\n\nСредний сон, ч: '+(stats.sleepMinutes===null?'—':(stats.sleepMinutes/60).toFixed(1))+'\n\nСамочувствие: '+(stats.wellbeing===null?'—':stats.wellbeing.toFixed(1)));
  writes.set(note.path,{path:note.path,expectedHash:note.hash??null,text:patched(note,{sloy_type:'journal',sloy_id:note.meta.sloy_id||'journal-'+key,period:key,sloy_plan:copy(plan),...(day?{sloy_day:state.dayLogs[day],sloy_knowledge:state.knowledgeFacts?.[day]}:{}),sloy_statistics:stats},body)});
 }
 for(const day of Object.keys(state.habitEntries)){
  const note=make('counters:'+day,cfg.habitRecords,day),counters=state.habitEntries[day],body=region(note.body,'counters','## Счётчики\n\n'+Object.entries(counters).map(([id,v])=>'- '+fmt(state.habits.find(h=>h.id===id)?.name||id)+': '+v.value+' / '+v.target+' '+v.unit).join('\n'));
  writes.set(note.path,{path:note.path,expectedHash:note.hash??null,text:patched(note,{sloy_type:'habit-record',sloy_id:note.meta.sloy_id||'counters-'+day,date:day,counters},body)});
 }
 for(const [id,b] of decoded.bindings)if(b.kind==='habit-record'&&!Object.hasOwn(state.habitEntries,id.slice(9)))deletes.push({path:b.note.path,expectedHash:b.note.hash});
 return {writes:[...writes.values()].filter(w=>w.text!==decoded.notes.find(n=>n.path===w.path)?.text),deletes};
}
