import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeState,saveArea,saveProject,attachTask,projectTasks,areaTasks,taskArea,nextDate,setTaskStatus,taskStatus} from '../dist/domain.js';
import {seedState,clone,validateBackup,period,getPlan,freezePlan,comparison,planMarkdown,tasksMarkdown,parseMarkdown,mergeTasks} from '../dist/model.js';
const empty=()=>normalizeState({version:1,demo:false,tasks:[],plans:{},vault:''});
function task(state,id='t'){const t={id,title:'Действие',project:'Входящие',estimate:1,due:'2026-10-29',done:false,completedAt:'',source:'Tasks.md',blockId:id,archived:false};state.tasks.push(t);normalizeState(state);return t;}
test('old workspace migrates without changing task IDs or frozen snapshots',()=>{
 const state=seedState(),p=period('week','2026-10-29');getPlan(state,p).selected=[state.tasks[0].id];freezePlan(state,p);const snapshot=clone(getPlan(state,p).snapshot),ids=state.tasks.map(t=>t.id);
 delete state.structureVersion;delete state.areas;delete state.projects;for(const t of state.tasks){delete t.projectId;delete t.areaId;delete t.recurrence;delete t.cancelled;}
 const upgraded=validateBackup(state);assert.deepEqual(upgraded.tasks.map(t=>t.id),ids);assert.deepEqual(getPlan(upgraded,p).snapshot,snapshot);assert.ok(upgraded.projects.length);assert.equal(upgraded.tasks[0].recurrence,'none');
 assert.deepEqual(validateBackup(upgraded),upgraded);
});
test('areas contain root projects, inherited subprojects and independent tasks',()=>{
 const s=empty(),area=saveArea(s,{name:'Работа'}),root=saveProject(s,{name:'Athena',areaId:area.id}),child=saveProject(s,{name:'Импорт',parentId:root.id});
 attachTask(s,task(s,'root-task'),root.id);attachTask(s,task(s,'child-task'),child.id);attachTask(s,task(s,'standalone'),null,area.id);
 assert.equal(projectTasks(s,root.id).length,2);assert.equal(projectTasks(s,child.id).length,1);assert.equal(areaTasks(s,area.id).length,3);assert.equal(s.tasks[2].projectId,null);
 assert.equal(taskArea(s,s.tasks[1]),area.id);assert.deepEqual(validateBackup(s),s);
});
test('third project level, self-parenting and cycles are rejected without changing the tree',()=>{
 const s=empty(),root=saveProject(s,{name:'Root'}),child=saveProject(s,{name:'Child',parentId:root.id});const before=clone(s.projects);
 assert.throws(()=>saveProject(s,{name:'Grandchild',parentId:child.id}),/два уровня/);
 assert.throws(()=>saveProject(s,{...root,parentId:child.id}),/два уровня/);
 assert.throws(()=>saveProject(s,{...root,parentId:root.id}),/два уровня/);assert.deepEqual(s.projects,before);
});
test('moving and renaming a root project propagates links but preserves snapshots',()=>{
 const s=empty(),a=saveArea(s,{name:'A'}),b=saveArea(s,{name:'B'}),root=saveProject(s,{name:'Root',areaId:a.id}),child=saveProject(s,{name:'Child',parentId:root.id}),t=attachTask(s,task(s),child.id),p=period('week','2026-10-29');
 getPlan(s,p).selected=[t.id];freezePlan(s,p);const snapshot=clone(getPlan(s,p).snapshot);
 saveProject(s,{...root,name:'Renamed',areaId:b.id});assert.equal(t.areaId,b.id);assert.equal(child.areaId,b.id);assert.equal(projectTasks(s,root.id)[0].id,t.id);assert.deepEqual(getPlan(s,p).snapshot,snapshot);
});
test('recurring completion creates one new occurrence; undo and recompletion do not duplicate it',()=>{
 const s=empty(),t=task(s);t.recurrence='weekly';const p=period('week','2026-10-29');getPlan(s,p).selected=[t.id];freezePlan(s,p);const snapshot=clone(getPlan(s,p).snapshot);
 const next=setTaskStatus(s,t.id,'done','2026-10-29',()=> 'next');assert.equal(next.due,'2026-11-05');assert.equal(next.previousOccurrenceId,t.id);assert.equal(next.done,false);assert.notEqual(next.blockId,t.blockId);assert.equal(s.tasks.length,2);assert.equal(comparison(s,p).done,1);assert.deepEqual(getPlan(s,p).snapshot,snapshot);
 setTaskStatus(s,t.id,'todo','2026-10-29');setTaskStatus(s,t.id,'done','2026-10-30');assert.equal(s.tasks.length,2);assert.equal(t.nextOccurrenceId,'next');
});
test('monthly and daily recurrences handle short months and year boundaries',()=>{
 assert.equal(nextDate('2026-01-31','monthly'),'2026-02-28');assert.equal(nextDate('2028-01-31','monthly'),'2028-02-29');assert.equal(nextDate('2026-12-31','daily'),'2027-01-01');assert.throws(()=>nextDate('2026-02-31','monthly'));
});
test('cancellation stops the instance and retains it in historical denominator',()=>{
 const s=empty(),t=task(s);t.recurrence='daily';const p=period('week','2026-10-29');getPlan(s,p).selected=[t.id];freezePlan(s,p);setTaskStatus(s,t.id,'cancelled','2026-10-29');
 assert.equal(taskStatus(t),'cancelled');assert.equal(t.completedAt,'');assert.equal(s.tasks.length,1);assert.equal(comparison(s,p).total,1);assert.equal(comparison(s,p).done,0);assert.match(planMarkdown(s,p),/Отменена/);
 setTaskStatus(s,t.id,'todo','2026-10-29');assert.equal(taskStatus(t),'todo');assert.equal(t.cancelledAt,'');
});
test('cancelled tasks leave drafts and cannot form a new frozen plan',()=>{
 const s=empty(),t=task(s),p=period('month','2026-10-29');getPlan(s,p).selected=[t.id];setTaskStatus(s,t.id,'cancelled','2026-10-29');assert.deepEqual(getPlan(s,p).selected,[]);assert.throws(()=>freezePlan(s,p));
});
test('Markdown round-trip retains cancellation, recurrence, IDs and relations',()=>{
 const s=empty(),a=saveArea(s,{name:'Здоровье'}),t=attachTask(s,task(s),null,a.id);t.recurrence='monthly';setTaskStatus(s,t.id,'cancelled','2026-10-29');
 const md=tasksMarkdown(s);assert.match(md,/- \[-\]/);assert.match(md,/repeat:: monthly/);mergeTasks(s,parseMarkdown(md,'Tasks.md'));assert.equal(s.tasks.length,1);assert.equal(s.tasks[0].areaId,a.id);assert.equal(s.tasks[0].recurrence,'monthly');assert.equal(s.tasks[0].cancelled,true);
 const fresh=empty();mergeTasks(fresh,parseMarkdown(md,'Tasks.md'));assert.equal(fresh.areas[0].name,'Здоровье');assert.equal(fresh.tasks[0].projectId,null);
 const root=saveProject(s,{name:'Режим',areaId:a.id});attachTask(s,t,root.id);const freshProject=empty();mergeTasks(freshProject,parseMarkdown(tasksMarkdown(s),'Tasks.md'));assert.equal(freshProject.projects[0].areaId,freshProject.areas[0].id);assert.equal(taskArea(freshProject,freshProject.tasks[0]),freshProject.areas[0].id);
});
test('backup rejects invalid hierarchy, missing relations and inconsistent task status',()=>{
 const s=empty(),a=saveArea(s,{name:'Area'}),p=saveProject(s,{name:'Root',areaId:a.id}),t=attachTask(s,task(s),p.id);
 const broken=clone(s);broken.projects[0].parentId=p.id;assert.throws(()=>validateBackup(broken));
 const missing=clone(s);missing.tasks[0].projectId='absent';assert.throws(()=>validateBackup(missing));
 const badStatus=clone(s);badStatus.tasks[0].cancelled=true;badStatus.tasks[0].done=true;assert.throws(()=>validateBackup(badStatus));
 const badRepeat=clone(s);badRepeat.tasks[0].recurrence='sometimes';assert.throws(()=>validateBackup(badRepeat));
});
