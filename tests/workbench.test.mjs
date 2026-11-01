import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nextRepeat} from '../dist/recurrence.js';
import {setTaskStatus,normalizeState} from '../dist/domain.js';
import {seedState,clone,period,getPlan,freezePlan,validateBackup,tasksMarkdown,parseMarkdown,mergeTasks} from '../dist/model.js';
import {defaultBoard,applyBoard,moveKanbanTask,taskColumn} from '../dist/kanban.js';
import {addDayTask,unifyDayReflection} from '../dist/journal.js';
const space=()=>{const s=seedState();s.plans={};s.tasks.forEach(t=>{t.done=false;t.completedAt='';});return s;};

test('weekdays, yearly and custom recurrences handle weekends, leap years and intervals',()=>{
 assert.equal(nextRepeat('2026-10-30',{recurrence:'weekdays'}),'2026-11-02');
 assert.equal(nextRepeat('2026-10-31',{recurrence:'weekdays'}),'2026-11-02');
 assert.equal(nextRepeat('2028-02-29',{recurrence:'yearly'}),'2029-02-28');
 assert.equal(nextRepeat('2026-12-30',{recurrence:'custom',repeatEvery:3,repeatUnit:'days'}),'2027-01-02');
 assert.equal(nextRepeat('2026-10-30',{recurrence:'custom',repeatEvery:2,repeatUnit:'weeks'}),'2026-11-13');
});
test('planned-date recurrence preserves original month-day and skips missed occurrences',()=>{
 const t={recurrence:'monthly',repeatFrom:'due',due:'2026-01-31'};
 assert.equal(nextRepeat('2026-02-01',t),'2026-02-28');
 assert.equal(nextRepeat('2026-02-28',{...t,due:'2026-02-28',repeatAnchor:'2026-01-31'}),'2026-03-31');
 assert.equal(nextRepeat('2026-04-05',t),'2026-04-30');
 assert.equal(nextRepeat('2026-10-30',{recurrence:'weekly',repeatFrom:'due',due:''}),'2026-11-06');
});
test('invalid repeat settings reject completion before changing task or plan',()=>{
 const s=space(),t=s.tasks[0];t.recurrence='custom';t.repeatEvery=0;const before=clone(s);
 assert.throws(()=>setTaskStatus(s,t.id,'done','2026-10-30'));assert.deepEqual(s,before);
 for(const options of [{repeatEvery:1.5},{repeatEvery:366},{repeatUnit:'fortnights'},{repeatFrom:'guess'}])assert.throws(()=>nextRepeat('2026-10-30',{recurrence:'custom',...options}));
});
test('recurring Kanban completion creates exactly one next instance and preserves a fixed baseline',()=>{
 const s=space(),t=s.tasks[0];Object.assign(t,{recurrence:'custom',repeatEvery:2,repeatUnit:'weeks',repeatFrom:'due',due:'2026-10-30'});const p=period('week','2026-10-30');getPlan(s,p).selected=[t.id];freezePlan(s,p);const snapshot=clone(getPlan(s,p).snapshot);
 applyBoard(s,defaultBoard());moveKanbanTask(s,t.id,'doing','2026-10-30');assert.equal(t.done,false);
 const next=moveKanbanTask(s,t.id,'done','2026-10-30',null,()=> 'repeated');assert.equal(next.due,'2026-11-13');assert.equal(taskColumn(s,next).id,'todo');
 moveKanbanTask(s,t.id,'done','2026-10-31');assert.equal(t.completedAt,'2026-10-30');assert.equal(s.tasks.length,8);
 moveKanbanTask(s,t.id,'doing','2026-10-31');moveKanbanTask(s,t.id,'done','2026-10-31');assert.equal(s.tasks.length,8);assert.deepEqual(getPlan(s,p).snapshot,snapshot);
});
test('cancelled recurring tasks do not generate a new instance and archived cards cannot move',()=>{
 const s=space(),t=s.tasks[0];t.recurrence='daily';moveKanbanTask(s,t.id,'cancelled','2026-10-30');assert.equal(s.tasks.length,7);assert.equal(t.cancelled,true);assert.equal(t.done,false);
 t.archived=true;const before=clone(s);assert.throws(()=>moveKanbanTask(s,t.id,'todo','2026-10-30'));assert.deepEqual(s,before);
});
test('board settings keep every status reachable and deleting a custom column preserves its tasks',()=>{
 const s=space(),board=defaultBoard();applyBoard(s,board);const saved=clone(s.kanban),bad=clone(board);bad.columns=bad.columns.filter(c=>c.status!=='done');assert.throws(()=>applyBoard(s,bad));assert.deepEqual(s.kanban,saved);
 moveKanbanTask(s,s.tasks[0].id,'doing','2026-10-30');board.columns=board.columns.filter(c=>c.id!=='doing');applyBoard(s,board);assert.equal(taskColumn(s,s.tasks[0]).id,'todo');assert.equal(s.tasks[0].done,false);assert.equal(s.tasks[0].cancelled,false);
});
test('card reordering and custom board configuration survive backup',()=>{
 const s=space(),board=defaultBoard();board.columns[1].title='Ожидание';board.fields.estimate=true;applyBoard(s,board);
 moveKanbanTask(s,s.tasks[2].id,'todo','2026-10-30',s.tasks[0].id);const ordered=s.tasks.filter(t=>taskColumn(s,t).id==='todo').sort((a,b)=>a.kanbanOrder-b.kanbanOrder);assert.equal(ordered[0].id,s.tasks[2].id);
 assert.deepEqual(validateBackup(clone(s)),s);const bad=clone(s);bad.kanban.columns[0].id=bad.kanban.columns[1].id;assert.throws(()=>validateBackup(bad));
});
test('custom recurrence options and calendar anchor round-trip through Markdown',()=>{
 const s=space(),t=s.tasks[0];Object.assign(t,{recurrence:'custom',repeatEvery:2,repeatUnit:'months',repeatFrom:'due',repeatAnchor:'2026-01-31',due:'2026-03-31'});
 const md=tasksMarkdown(s),fresh=normalizeState({version:1,tasks:[],plans:{}});mergeTasks(fresh,parseMarkdown(md,'Задачи.md'));const got=fresh.tasks.find(x=>x.blockId===t.blockId);
 for(const key of ['recurrence','repeatEvery','repeatUnit','repeatFrom','repeatAnchor'])assert.equal(got[key],t[key]);assert.equal(got.title,t.title);assert.deepEqual(validateBackup(clone(s)),s);
});
test('day drop is idempotent, restricted to the same week and respects fixation',()=>{
 const s=space(),day='2026-10-30',week=period('week',day),p=period('day',day);getPlan(s,week).selected=[s.tasks[0].id];assert.equal(addDayTask(s,day,s.tasks[0].id),true);assert.equal(addDayTask(s,day,s.tasks[0].id),false);assert.throws(()=>addDayTask(s,day,s.tasks[1].id));freezePlan(s,p);assert.equal(addDayTask(s,day,s.tasks[1].id),false);assert.equal(getPlan(s,p).snapshot.items.length,1);
});
test('old day note merges with reflection once and does not return after editing the unified text',()=>{
 const s=space(),day='2026-10-30',p=period('day',day);getPlan(s,p).reflection='Выводы';s.dayLogs[day]={bedDate:'',bedTime:'',wakeTime:'',wellbeing:null,note:'Старая заметка'};
 assert.equal(unifyDayReflection(s,day),'Выводы\n\nСтарая заметка');assert.equal(unifyDayReflection(s,day),'Выводы\n\nСтарая заметка');getPlan(s,p).reflection='Новая запись';assert.equal(unifyDayReflection(s,day),'Новая запись');assert.equal(s.dayLogs[day].note,'Старая заметка');assert.deepEqual(validateBackup(clone(s)),s);
});
