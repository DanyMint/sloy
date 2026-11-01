import {test} from 'node:test';
import assert from 'node:assert/strict';
import {seedState,period,clone,validateBackup} from '../dist/model.js';
import {selectFocus,freezeJournal,journalPlan,addJournalTask} from '../dist/journal.js';
import {weeklyPlanningContext,weeklySourcesHTML,weeklyTaskRowHTML} from '../dist/weekly-planning.js';
import {WEEKLY_VIEW_KEY,readWeeklyView,saveWeeklyView} from '../dist/planning-preferences.js';
import {saveProject,setProjectCompleted} from '../dist/domain.js';
import {taskForm} from '../dist/pages.js';
const day='2026-10-31';
function fixture(){const s=seedState();s.plans={};const year=period('year',day),quarter=period('quarter',day);selectFocus(s,year,'project',s.projects[0].id);freezeJournal(s,year);selectFocus(s,quarter,'project',s.projects[0].id);freezeJournal(s,quarter);return s;}
const taskMarkup=(s,ids=[],frozen=false)=>(t,options)=>weeklyTaskRowHTML(s,t,{...options,selected:ids.includes(t.id),frozen});

test('weekly view preference persists separately, recovers from invalid values and reports unavailable storage',()=>{
 const values=new Map([['kontur-planner-v1','unchanged-task-data']]),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
 assert.equal(readWeeklyView(storage),'groups');assert.equal(saveWeeklyView('list',storage),true);assert.equal(readWeeklyView(storage),'list');assert.equal(values.get('kontur-planner-v1'),'unchanged-task-data');
 assert.equal(saveWeeklyView('unsafe',storage),false);assert.equal(readWeeklyView(storage),'list');values.set(WEEKLY_VIEW_KEY,'bad');assert.equal(readWeeklyView(storage),'groups');
 const blocked={getItem(){throw Error('blocked');},setItem(){throw Error('full');}};assert.equal(readWeeklyView(blocked),'groups');assert.equal(saveWeeklyView('list',blocked),false);
});
test('both views render the same task membership and never modify a fixed plan',()=>{
 const s=fixture(),week=period('week',day),task=s.tasks[6];addJournalTask(s,week,task.id);freezeJournal(s,week);const before=clone(s),context=weeklyPlanningContext(s,day,{selected:[task.id]});
 const grouped=weeklySourcesHTML(context,taskMarkup(s,[task.id],true)),flat=weeklySourcesHTML(context,taskMarkup(s,[task.id],true),{view:'list'});
 for(const t of s.tasks){assert.ok(grouped.includes(t.title));assert.ok(flat.includes(t.title));}
 assert.ok(grouped.includes('weekly-project'));assert.ok(!flat.includes('data-collapse-key'));assert.ok(flat.includes('Источник задач'));assert.ok(!flat.includes('data-action="select-task"'));assert.ok(!flat.includes('draggable="true"'));
 assert.deepEqual(s,before);assert.deepEqual(validateBackup(clone(s)),s);
});
test('flat scopes form a disjoint focus/outside partition; search and status filters apply to each',()=>{
 const s=fixture(),c=weeklyPlanningContext(s,day),focus=weeklySourcesHTML(c,taskMarkup(s),{view:'list',scope:'focus'}),outside=weeklySourcesHTML(c,taskMarkup(s),{view:'list',scope:'outside'});
 for(const t of s.tasks){assert.equal(focus.includes(t.title),t.projectId===s.projects[0].id);assert.equal(outside.includes(t.title),t.projectId!==s.projects[0].id);}
 const filtered=weeklyPlanningContext(s,day,{search:'импорт',filter:'open'}),html=weeklySourcesHTML(filtered,taskMarkup(s),{view:'list'});
 assert.ok(html.includes(s.tasks[6].title));assert.ok(!html.includes(s.tasks[0].title));assert.ok(!html.includes(s.tasks[2].title));
});
test('a draft quarter offers no focused tasks in either view but allows outside work',()=>{
 const s=fixture();journalPlan(s,period('quarter',day)).snapshot=null;const context=weeklyPlanningContext(s,day);
 for(const view of ['groups','list']){const html=weeklySourcesHTML(context,taskMarkup(s),{view,scope:'focus'});assert.match(html,/Сначала составьте и зафиксируйте/);if(view==='list')for(const t of s.tasks)assert.ok(!html.includes(t.title));}
 const outside=weeklySourcesHTML(context,taskMarkup(s),{view:'list',scope:'outside'});for(const t of s.tasks)assert.ok(outside.includes(t.title));
});
test('compact projects have one creation entry point, accessible context menu and safe empty state',()=>{
 const s=fixture(),empty=saveProject(s,{name:'<b>Пустой</b>',parentId:s.projects[0].id});journalPlan(s,period('quarter',day)).snapshot.focusProjects.push({...empty,areaName:'Работа'});
 let html=weeklySourcesHTML(weeklyPlanningContext(s,day),taskMarkup(s));assert.ok(html.includes('Нет задач ·'));assert.ok(html.includes('&lt;b&gt;Пустой&lt;/b&gt;'));assert.ok(!html.includes('<b>Пустой</b>'));assert.ok(html.includes('data-weekly-menu'));assert.ok(html.includes('Открыть проект ↗'));assert.ok(!html.includes('+ Повторяющаяся'));
 assert.ok(taskForm(s,{...s.tasks[0],done:false},true).includes('id="edit-recurrence"'));
 setProjectCompleted(s,empty.id,true,day);html=weeklySourcesHTML(weeklyPlanningContext(s,day),taskMarkup(s));assert.ok(!html.includes('data-project="'+empty.id+'"'));assert.ok(html.includes('Завершён'));
});
test('weekly rows preserve task editing, repeat metadata, selection and drag without completion checkboxes',()=>{
 const s=fixture(),task={...s.tasks[6],title:'<img src=x>',recurrence:'weekly'},html=weeklyTaskRowHTML(s,task,{selected:true,flat:true});
 assert.ok(html.includes('draggable="true"'));assert.ok(html.includes('data-drag-source="journal"'));assert.ok(html.includes('data-action="select-task"'));assert.ok(html.includes('aria-pressed="true"'));assert.ok(html.includes('data-action="edit-task"'));assert.ok(html.includes('data-action="open-project"'));assert.ok(html.includes('Еженедельно'));assert.ok(!html.includes('toggle-done'));assert.ok(!html.includes('<img'));assert.ok(html.includes('&lt;img'));
 const cancelled=weeklyTaskRowHTML(s,{...task,cancelled:true});assert.ok(!cancelled.includes('data-action="select-task"'));assert.ok(!cancelled.includes('draggable="true"'));
});
