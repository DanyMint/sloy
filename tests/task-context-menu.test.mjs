import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeState} from '../dist/domain.js';
import {clone,period} from '../dist/model.js';
import {freezeJournal} from '../dist/journal.js';
import {createUndoHistory} from '../dist/undo-history.js';
import {scopeHTML} from '../dist/workspace-v2.js';
import {orderTaskCommands} from '../dist/task-context-menu.js';
import {taskMenuTargets,completionTargets,completeTasks,taskPlanOptions,planTasks,movableRoots,moveTaskRoots} from '../dist/task-commands.js';

const day='2026-11-27';
const fixture=()=>normalizeState({version:1,areas:[{id:'zone',name:'Зона',description:''}],
 projects:[{id:'project',name:'Проект',description:'',areaId:'zone'}],
 tasks:['parent','child','other','destination'].map(id=>({id,title:id==='other'?'<b>Task</b>':id,
  project:'Проект',projectId:'project',source:'Tasks.md',blockId:'kt-'+id,estimate:1,due:day,
  done:false,completedAt:'',recurrence:'none',...(id==='child'?{parentTaskId:'parent'}:{})})),plans:{}});

test('outside task targets itself and preserves the existing selection',()=>{
 const selection=new Set(['parent','child','other']);
 assert.deepEqual(taskMenuTargets('child',selection),['parent','child','other']);
 assert.deepEqual(taskMenuTargets('destination',selection),['destination']);
 assert.deepEqual([...selection],['parent','child','other']);
});

test('list rows expose a touch trigger and escape task titles',()=>{
 const html=scopeHTML(fixture(),{page:'projects',entityId:'project',selection:new Set(['other'])});
 assert.match(html,/data-task-menu-trigger aria-label="Ещё"/);
 assert.match(html,/is-task-selected[^>]*data-task-id="other"/);
 assert.match(html,/&lt;b&gt;Task&lt;\/b&gt;/);
 assert.doesNotMatch(html,/data-drop-parent/);
});

test('pins reorder only available commands using stable IDs',()=>{
 const commands=[{id:'open'},{id:'move'},{id:'plan'}];
 assert.deepEqual(orderTaskCommands(commands,['absent','plan','move']).map(item=>item.id),['plan','move','open']);
});

test('branch transfer rejects cycles and missing IDs and preserves hierarchy in one undo step',()=>{
 const state=fixture(),ids=['other','child','parent'];
 assert.deepEqual(movableRoots(state,'child',ids),[]);
 assert.deepEqual(movableRoots(state,'destination',['missing','parent']),[]);
 const candidate=clone(state),roots=movableRoots(candidate,'destination',ids);
 assert.deepEqual(roots.map(task=>task.id),['parent','other']);
 moveTaskRoots(candidate,roots,{kind:'task',id:'destination'},4);
 assert.deepEqual(candidate.tasks.map(task=>task.parentTaskId),['destination','parent','destination',null].map(value=>value??undefined));
 assert.deepEqual(roots.map(task=>task.listOrder),[4,5]);
 const history=createUndoHistory();
 history.rebase(state);
 history.record(candidate);
 assert.deepEqual(history.peek(candidate).state.tasks,state.tasks);
 history.pop();
 assert.equal(history.available,false);
});

test('mixed completion creates one recurrence, preserves completed tasks and rolls back on error',()=>{
 const state=fixture(),[parent,child,other,destination]=state.tasks;
 Object.assign(parent,{recurrence:'weekly',repeatFrom:'completion'});
 Object.assign(child,{done:true,completedAt:day});
 destination.nativeRecurrenceRule='every workday';
 const targets=completionTargets(state,state.tasks,{completeOnly:true,native:true});
 assert.deepEqual(targets.map(task=>task.id),['parent','other']);
 const {candidate}=completeTasks(state,targets,day);
 assert.equal(candidate.tasks.length,5);
 assert.equal(candidate.tasks.at(-1).previousOccurrenceId,'parent');
 assert.deepEqual(candidate.tasks[1],child);
 assert.equal(parent.done,false);
 other.recurrence='unsupported';
 const before=clone(state);
 assert.throws(()=>completeTasks(state,targets,day));
 assert.deepEqual(state,before);
});

test('week, day draft and today extras preserve dates, deduplicate and respect snapshots',()=>{
 const original=fixture(),[task]=original.tasks,week=period('week',day),daily=period('day',day);
 const [option]=taskPlanOptions(original,[task],day);
 assert.equal(option.id,'week');
 assert.equal(option.period.key,week.key);
 const planned=planTasks(original,option);
 assert.deepEqual(planned.plans[week.key].selected,[task.id]);
 assert.deepEqual(taskPlanOptions(planned,[task],day).map(item=>item.id),['day']);
 freezeJournal(planned,week);
 freezeJournal(planned,daily);
 const snapshot=clone(planned.plans[daily.key].snapshot);
 const [overplan]=taskPlanOptions(planned,[task],day);
 assert.equal(overplan.id,'overplan');
 const updated=planTasks(planned,overplan);
 assert.deepEqual(updated.plans[daily.key].snapshot,snapshot);
 assert.deepEqual(updated.plans[daily.key].overplan,[task.id]);
 assert.deepEqual(taskPlanOptions(updated,[task],day),[]);
 assert.equal(updated.tasks[0].due,task.due);
 assert.deepEqual(original.plans,{});
});
