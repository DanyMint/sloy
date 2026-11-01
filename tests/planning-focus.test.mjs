import {test} from 'node:test';
import assert from 'node:assert/strict';
import {seedState,period,clone,validateBackup,tasksMarkdown,parseMarkdown,mergeTasks} from '../dist/model.js';
import {saveProject,attachTask,setTaskStatus,setProjectCompleted,isProjectCompleted,isTaskActive,materializeRepeats} from '../dist/domain.js';
import {journalPlan,selectFocus,freezeJournal,unfreezeJournal,addJournalTask,weeklyTasks} from '../dist/journal.js';
import {weeklyPlanningContext,weeklySourcesHTML} from '../dist/weekly-planning.js';
import {focusPlannerHTML,focusCount} from '../dist/journal-pages.js';
import {scopeHTML} from '../dist/workspace-v2.js';
import {kanbanHTML,defaultBoard,applyBoard,moveKanbanTask} from '../dist/kanban.js';
import {overdueTasks,addOverplan} from '../dist/day-flow.js';
import {canSwipeTask} from '../dist/task-swipe.js';
const day='2026-10-31';
function fixture(){const s=seedState();s.plans={};s.tasks.forEach(t=>{t.done=false;t.completedAt='';});return s;}
function annual(s){const year=period('year',day);selectFocus(s,year,'project',s.projects[0].id);freezeJournal(s,year);return year;}
function quarterly(s){annual(s);const q=period('quarter',day);selectFocus(s,q,'project',s.projects[0].id);freezeJournal(s,q);return q;}

test('year focuses only root projects, derives area context and keeps an old area snapshot intact',()=>{
 const s=fixture(),year=period('year',day),root=s.projects[0],child=saveProject(s,{name:'Квартальный результат',parentId:root.id});
 assert.equal(selectFocus(s,year,'area',s.areas[0].id),false);assert.equal(selectFocus(s,year,'project',child.id),false);assert.equal(selectFocus(s,year,'project',root.id),true);
 let html=focusPlannerHTML(s,year);assert.ok(!html.includes('data-kind="area"'));assert.ok(!html.includes(child.name));assert.ok(html.includes('Работа › Athena'));assert.equal(focusCount(s,year),1);
 freezeJournal(s,year);assert.deepEqual(journalPlan(s,year).snapshot.focusAreas,[]);
 journalPlan(s,year).snapshot.focusAreas=[clone(s.areas[1])];const old=clone(journalPlan(s,year).snapshot);html=focusPlannerHTML(s,year);assert.ok(!html.includes('data-kind="area"'));assert.deepEqual(journalPlan(s,year).snapshot,old);
});
test('quarter accepts either an annual project or a child milestone',()=>{
 const s=fixture();annual(s);const q=period('quarter',day),root=s.projects[0],child=saveProject(s,{name:'Этап',parentId:root.id});
 assert.equal(selectFocus(s,q,'project',root.id),true);assert.equal(selectFocus(s,q,'project',child.id),true);freezeJournal(s,q);
 assert.deepEqual(journalPlan(s,q).snapshot.focusProjects.map(p=>p.id),[root.id,child.id]);
});
test('weekly focus stays empty until the quarter is fixed and all other work remains available',()=>{
 const s=fixture(),q=period('quarter',day);annual(s);selectFocus(s,q,'project',s.projects[0].id);
 let c=weeklyPlanningContext(s,day);assert.equal(c.fixed,false);assert.deepEqual(c.groups,[]);assert.equal(c.outside.length,s.tasks.length);assert.match(weeklySourcesHTML(c,t=>t.title),/Сначала составьте и зафиксируйте/);
 freezeJournal(s,q);c=weeklyPlanningContext(s,day);assert.equal(c.fixed,true);assert.deepEqual(c.groups[0].tasks.map(t=>t.id),s.tasks.filter(t=>t.projectId===s.projects[0].id).map(t=>t.id));
 assert.ok(c.outside.every(t=>t.projectId!==s.projects[0].id));
});
test('weekly sources use direct ownership, have shared filters and select tasks without project checkboxes',()=>{
 const s=fixture();quarterly(s);const child=saveProject(s,{name:'Не в фокусе',parentId:s.projects[0].id});attachTask(s,s.tasks[1],child.id);
 const c=weeklyPlanningContext(s,day),html=weeklySourcesHTML(c,t=>`<div>${t.title}</div>`);
 assert.ok(c.outside.some(t=>t.id===s.tasks[1].id));assert.ok(!c.groups[0].tasks.some(t=>t.id===s.tasks[1].id));assert.ok(!html.includes('select-focus'));assert.ok(html.includes('data-project="'+s.projects[0].id+'"'));assert.ok(html.includes('open-project'));assert.ok(html.includes('data-action="new-task"'));assert.ok(html.includes('Действия проекта'));
 const selected=weeklyPlanningContext(s,day,{filter:'selected',selected:[s.tasks[0].id]});assert.equal(selected.groups[0].tasks.length,1);assert.equal(selected.outside.length,0);
 const search=weeklyPlanningContext(s,day,{search:'НЕ В ФОКУСЕ'});assert.equal(search.groups.length,0);assert.equal(search.outside.length,1);
});
test('weekly focus follows the viewed quarter at year and quarter boundaries and escapes user labels',()=>{
 const s=fixture();quarterly(s);assert.equal(weeklyPlanningContext(s,'2027-01-01').fixed,false);
 const q=period('quarter','2027-01-01'),plan=journalPlan(s,q);plan.snapshot={at:'2027-01-01T00:00:00Z',goal:'',capacity:20,items:[],focusProjects:[{...s.projects[0],name:'<img onerror=x>',areaName:'<script>'}],focusAreas:[]};
 const c=weeklyPlanningContext(s,'2027-01-01');assert.equal(c.quarter.key,'quarter:2027-Q1');assert.equal(c.week.start,'2026-12-28');const html=weeklySourcesHTML(c,t=>t.title);assert.ok(!html.includes('<img'));assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<script>'));
});
test('unfreezing every horizon restores editable choices without rewriting task statuses or other plans',()=>{
 const s=fixture(),q=quarterly(s),year=period('year',day),week=period('week',day),daily=period('day',day),t=s.tasks[0];
 addJournalTask(s,week,t.id);freezeJournal(s,week);addJournalTask(s,daily,t.id);journalPlan(s,daily).reflection='Вывод';freezeJournal(s,daily);
 addOverplan(s,day,s.tasks[1].id);setTaskStatus(s,t.id,'done',day);const tasks=clone(s.tasks),savedWeek=clone(journalPlan(s,week).snapshot);
 unfreezeJournal(s,daily);assert.equal(journalPlan(s,daily).snapshot,null);assert.deepEqual(journalPlan(s,daily).selected,[t.id,s.tasks[1].id]);assert.deepEqual(journalPlan(s,daily).overplan,[]);assert.equal(journalPlan(s,daily).reflection,'Вывод');assert.deepEqual(journalPlan(s,week).snapshot,savedWeek);freezeJournal(s,daily);
 unfreezeJournal(s,q);assert.deepEqual(journalPlan(s,q).focusProjects,[s.projects[0].id]);assert.equal(weeklyPlanningContext(s,day).fixed,false);assert.deepEqual(journalPlan(s,week).snapshot,savedWeek);
 freezeJournal(s,q);unfreezeJournal(s,week);assert.deepEqual(journalPlan(s,week).selected,[t.id]);freezeJournal(s,week);unfreezeJournal(s,year);assert.equal(journalPlan(s,year).snapshot,null);assert.equal(unfreezeJournal(s,year),false);assert.deepEqual(s.tasks,tasks);assert.deepEqual(validateBackup(clone(s)),s);
});
test('manual project completion pauses work and repeats, never completes its tasks or mutates snapshots',()=>{
 const s=fixture(),q=quarterly(s),root=s.projects[0],child=saveProject(s,{name:'Этап',parentId:root.id}),week=period('week',day),t=s.tasks[0];
 Object.assign(t,{recurrence:'daily',repeatFrom:'due',due:'2026-10-01'});addJournalTask(s,week,t.id);freezeJournal(s,week);const snapshot=clone(journalPlan(s,week).snapshot),tasks=clone(s.tasks),focus=clone(journalPlan(s,q).snapshot);
 setProjectCompleted(s,root.id,true,day);assert.equal(isProjectCompleted(s,child),true);assert.equal(isTaskActive(s,t),false);assert.equal(materializeRepeats(s,day),0);assert.equal(addJournalTask(s,period('week','2026-11-02'),t.id),false);assert.deepEqual(s.tasks,tasks);assert.deepEqual(journalPlan(s,week).snapshot,snapshot);assert.deepEqual(journalPlan(s,q).snapshot,focus);
 assert.match(scopeHTML(s,{page:'projects',entityId:root.id}),/Открыть снова/);assert.throws(()=>setProjectCompleted(s,child.id,false,day));setProjectCompleted(s,root.id,false,day);assert.equal(isTaskActive(s,t),true);assert.deepEqual(validateBackup(clone(s)),s);const bad=clone(s);bad.projects[0].completedAt='not-a-date';assert.throws(()=>validateBackup(bad));
});
test('someday actions are reachable in scopes and custom Kanban but excluded from planning and repeat generation',()=>{
 const s=fixture(),t=s.tasks[0],week=period('week',day);quarterly(s);Object.assign(t,{recurrence:'daily',repeatFrom:'due',due:'2026-10-01'});addJournalTask(s,week,t.id);freezeJournal(s,week);const saved=clone(journalPlan(s,week).snapshot);
 setTaskStatus(s,t.id,'someday',day);assert.equal(materializeRepeats(s,day),0);assert.equal(canSwipeTask(s,t),false);assert.ok(!weeklyTasks(s,day).some(x=>x.id===t.id));assert.ok(!overdueTasks(s,day).some(x=>x.task.id===t.id));assert.ok(!weeklyPlanningContext(s,day).groups[0].tasks.some(x=>x.id===t.id));assert.deepEqual(journalPlan(s,week).snapshot,saved);
 assert.ok(scopeHTML(s,{page:'projects',entityId:t.projectId}).includes('Когда-нибудь'));applyBoard(s,defaultBoard(),t.projectId);const html=kanbanHTML(s,[t],t.projectId);assert.ok(html.includes(t.title));assert.ok(html.includes('activate-task'));
 moveKanbanTask(s,t.id,'todo',day,null,undefined,t.projectId);assert.equal(t.someday,false);assert.equal(t.done,false);assert.deepEqual(validateBackup(clone(s)),s);
});
test('someday flag round-trips through Markdown and backup; invalid flags cannot load',()=>{
 const s=fixture(),t=s.tasks[0];setTaskStatus(s,t.id,'someday',day);const md=tasksMarkdown(s),fresh=fixture();mergeTasks(fresh,parseMarkdown(md,'Задачи.md'));assert.equal(fresh.tasks.find(x=>x.blockId===t.blockId).someday,true);assert.deepEqual(validateBackup(clone(s)),s);
 const bad=clone(s);bad.tasks[0].someday='yes';assert.throws(()=>validateBackup(bad));setTaskStatus(s,t.id,'todo',day);mergeTasks(fresh,parseMarkdown(tasksMarkdown(s),'Задачи.md'));assert.equal(fresh.tasks.find(x=>x.blockId===t.blockId).someday,false);
});
