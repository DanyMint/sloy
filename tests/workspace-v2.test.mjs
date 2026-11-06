import {test} from 'node:test';
import assert from 'node:assert/strict';
import {seedState,period,getPlan,freezePlan,clone,comparison,validateBackup,tasksMarkdown,parseMarkdown,mergeTasks,addDays,today} from '../dist/model.js';
import {journalPlan,freezeJournal,addDayTask} from '../dist/journal.js';
import {plannedDates,overdueTasks,addOverplan,dayStartPage} from '../dist/day-flow.js';
import {materializeRepeats,setTaskStatus,normalizeState} from '../dist/domain.js';
import {saveHabit,setHabitValue} from '../dist/wellness.js';
import {defaultBoard,applyBoard,moveKanbanTask,boardConfig} from '../dist/kanban.js';
const empty=()=>{const s=seedState();s.plans={};for(const t of s.tasks){t.done=false;t.completedAt='';t.due='';}return s;};
const counter=()=>{let i=0;return ()=> 'occurrence-'+(++i);};

test('home opens planning until the current day has a fixed plan, including an empty day',()=>{
 const s=empty(),day='2026-10-30';assert.equal(dayStartPage(s,day),'planner');freezeJournal(s,period('day',day));assert.equal(dayStartPage(s,day),'today');assert.equal(dayStartPage(s,'2026-10-31'),'planner');assert.equal(s.plans['day:'+day].snapshot.items.length,0);
});
test('overplan membership is separate from the immutable baseline and does not inflate plan totals',()=>{
 const s=empty(),p=period('day','2026-10-30'),t=s.tasks[0],extra=s.tasks[1];journalPlan(s,p).direct=[t.id];addDayTask(s,p.start,t.id);freezeJournal(s,p);const saved=clone(getPlan(s,p).snapshot);
 assert.equal(addOverplan(s,p.start,t.id),false);assert.equal(addOverplan(s,p.start,extra.id),true);assert.equal(addOverplan(s,p.start,extra.id),false);setTaskStatus(s,extra.id,'done',p.start);
 assert.deepEqual(getPlan(s,p).snapshot,saved);assert.equal(comparison(s,p).total,1);assert.equal(comparison(s,p).extras.length,1);assert.deepEqual(validateBackup(clone(s)),s);
});
test('daily planning history survives re-planning and a later completion does not rewrite an old day',()=>{
 const s=empty(),t=s.tasks[0],old=period('day','2026-10-28'),next=period('day','2026-10-30');getPlan(s,old).selected=[t.id];freezePlan(s,old);const baseline=clone(getPlan(s,old).snapshot);
 assert.equal(overdueTasks(s,next.start).some(r=>r.task.id===t.id),true);addDayTask(s,next.start,t.id);freezeJournal(s,next);assert.deepEqual(plannedDates(s,t.id),['2026-10-28','2026-10-30']);setTaskStatus(s,t.id,'done',next.start);
 assert.equal(comparison(s,old).done,0);assert.equal(comparison(s,next).done,1);assert.deepEqual(getPlan(s,old).snapshot,baseline);assert.equal(overdueTasks(s,'2026-10-31').length,0);
});
test('overdue block includes missed plan dates and actual deadlines, and excludes cancelled/completed/archived tasks',()=>{
 const s=empty();s.tasks[0].due='2026-10-28';s.tasks[1].due='2026-10-28';s.tasks[1].cancelled=true;s.tasks[2].due='2026-10-28';s.tasks[2].done=true;s.tasks[2].completedAt='2026-10-28';s.tasks[3].due='2026-10-28';s.tasks[3].archived=true;
 assert.deepEqual(overdueTasks(s,'2026-10-30').map(r=>r.task.id),[s.tasks[0].id]);
});
test('new direct day tasks are allowed without silently changing the week',()=>{
 const s=empty(),day='2026-10-30',p=period('day',day);journalPlan(s,p).direct=[s.tasks[0].id];assert.equal(addDayTask(s,day,s.tasks[0].id),true);freezeJournal(s,p);assert.equal(s.plans[period('week',day).key],undefined);assert.deepEqual(validateBackup(clone(s)),s);
});
test('calendar keep mode materializes every missed occurrence and is idempotent',()=>{
 const s=empty();s.tasks=[s.tasks[0]];Object.assign(s.tasks[0],{due:'2026-10-27',recurrence:'daily',repeatFrom:'due',repeatMissed:'keep'});
 assert.equal(materializeRepeats(s,'2026-10-30',counter()),3);assert.deepEqual(s.tasks.map(t=>t.due),['2026-10-27','2026-10-28','2026-10-29','2026-10-30']);assert.equal(s.tasks.filter(t=>!t.archived).length,4);assert.equal(materializeRepeats(s,'2026-10-30',counter()),0);assert.equal(overdueTasks(s,'2026-10-30').length,3);assert.deepEqual(validateBackup(clone(s)),s);
});
test('calendar replace mode archives skipped instances while preserving fixed plan IDs and denominator',()=>{
 const s=empty();s.tasks=[s.tasks[0]];const t=s.tasks[0];Object.assign(t,{due:'2026-10-27',recurrence:'daily',repeatFrom:'due',repeatMissed:'replace'});const p=period('day',t.due);getPlan(s,p).selected=[t.id];freezePlan(s,p);const baseline=clone(getPlan(s,p).snapshot);
 assert.equal(materializeRepeats(s,'2026-10-30',counter()),3);assert.equal(s.tasks.filter(t=>!t.archived).length,1);assert.equal(s.tasks.filter(t=>t.skipped).length,3);assert.equal(t.skippedAt,'2026-10-28');assert.deepEqual(getPlan(s,p).snapshot,baseline);assert.equal(comparison(s,p).total,1);assert.equal(comparison(s,p).done,0);assert.equal(overdueTasks(s,'2026-10-30').length,0);assert.deepEqual(validateBackup(clone(s)),s);
});
test('calendar monthly rhythm stays anchored across short months and cancelled leaf stops generation',()=>{
 const s=empty();s.tasks=[s.tasks[0]];Object.assign(s.tasks[0],{due:'2026-01-31',recurrence:'monthly',repeatFrom:'due',repeatMissed:'keep'});materializeRepeats(s,'2026-03-31',counter());assert.deepEqual(s.tasks.map(t=>t.due),['2026-01-31','2026-02-28','2026-03-31']);setTaskStatus(s,s.tasks.at(-1).id,'cancelled','2026-03-31');assert.equal(materializeRepeats(s,'2026-05-31',counter()),0);
});
test('completion-generated future instances are not duplicated by calendar processing',()=>{
 const s=empty();s.tasks=[s.tasks[0]];const t=s.tasks[0];Object.assign(t,{due:'2026-10-30',recurrence:'weekly',repeatFrom:'due',repeatMissed:'replace'});const next=setTaskStatus(s,t.id,'done','2026-10-30',counter());assert.equal(next.due,'2026-11-06');assert.equal(materializeRepeats(s,'2026-11-06',counter()),0);assert.equal(s.tasks.length,2);const ids=()=> 'later';materializeRepeats(s,'2026-11-13',ids);assert.equal(s.tasks.length,3);
});
test('repeat policy survives Markdown and backup, invalid values do not load',()=>{
 const s=empty();s.tasks[0].recurrence='daily';s.tasks[0].repeatFrom='due';s.tasks[0].repeatMissed='replace';s.tasks[0].due='2026-10-30';const restored=normalizeState({version:1,tasks:[],plans:{}});mergeTasks(restored,parseMarkdown(tasksMarkdown(s),'Задачи.md'));assert.equal(restored.tasks[0].repeatMissed,'replace');const bad=clone(s);bad.tasks[0].repeatMissed='delete';assert.throws(()=>validateBackup(bad));
});
test('project Kanban configuration and card movement stay within that project',()=>{
 const s=empty(),a=s.projects[0],b=s.projects[1],one=s.tasks.find(t=>t.projectId===a.id),two=s.tasks.find(t=>t.projectId===b.id),board=defaultBoard();board.columns[1].title='Ревью';applyBoard(s,board,a.id);assert.equal(boardConfig(s,a.id).columns[1].title,'Ревью');assert.equal(boardConfig(s,b.id).columns[1].title,'В работе');moveKanbanTask(s,one.id,'doing','2026-10-30',null,undefined,a.id);assert.throws(()=>moveKanbanTask(s,two.id,'done','2026-10-30',null,undefined,a.id));assert.equal(two.done,false);assert.deepEqual(validateBackup(clone(s)),s);
});
test('habit counters permit historical backfill and reject future days without mutation',()=>{
 const s=empty(),now=today(),h=saveHabit(s,{name:'Вода',unit:'мл',step:250,target:2000},now),past=addDays(now,-5);setHabitValue(s,h.id,past,750);assert.equal(h.createdOn,past);const saved=clone(s);assert.throws(()=>setHabitValue(s,h.id,addDays(now,1),250),/Будущие/);assert.deepEqual(s,saved);assert.deepEqual(validateBackup(clone(s)),s);
});


test('unfinished overplan tasks appear in the next day overdue block without altering the baseline',()=>{
 const s=empty(),day='2026-10-29',t=s.tasks[0];freezeJournal(s,period('day',day));const original=clone(s.plans['day:'+day].snapshot);addOverplan(s,day,t.id);assert.deepEqual(plannedDates(s,t.id),[day]);assert.equal(overdueTasks(s,'2026-10-30')[0].task.id,t.id);assert.deepEqual(s.plans['day:'+day].snapshot,original);
});


test('saving a skipped historical instance does not silently restore it',()=>{
 const s=empty();s.tasks=[s.tasks[0]];const t=s.tasks[0];Object.assign(t,{due:'2026-10-29',recurrence:'daily',repeatFrom:'due',repeatMissed:'replace'});materializeRepeats(s,'2026-10-30',counter());setTaskStatus(s,t.id,'todo','2026-10-30');assert.equal(t.skipped,true);assert.equal(t.archived,true);assert.deepEqual(validateBackup(clone(s)),s);
});
