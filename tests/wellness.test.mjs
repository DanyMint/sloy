import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeState} from '../dist/domain.js';
import {validateBackup,freezePlan,getPlan,period,clone} from '../dist/model.js';
import {saveHabit,deleteHabit,incrementHabit,setHabitValue,saveDayLog,sleepMinutes} from '../dist/wellness.js';
import {habitForm,habitDeleteConfirmation} from '../dist/wellness-pages.js';
import {analyticsRows,analyticsSummary,correlation} from '../dist/analytics.js';
const empty=()=>normalizeState({version:1,tasks:[],plans:{},vault:''});
const task=(id,fields={})=>({id,title:id,project:'Входящие',source:'Tasks.md',blockId:id,due:'2026-10-27',completedAt:'',done:false,estimate:1,...fields});
test('habit increments by configured step, resets by date, permits overflow and corrections',()=>{
 const s=empty(),h=saveHabit(s,{name:'Вода',unit:'мл',step:250,target:500},'2026-10-26');
 incrementHabit(s,h.id,'2026-10-26');assert.equal(s.habitEntries['2026-10-26'][h.id].value,250);
 incrementHabit(s,h.id,'2026-10-26');incrementHabit(s,h.id,'2026-10-26');assert.equal(s.habitEntries['2026-10-26'][h.id].value,750);
 incrementHabit(s,h.id,'2026-10-27');assert.equal(s.habitEntries['2026-10-27'][h.id].value,250);
 setHabitValue(s,h.id,'2026-10-27',100);incrementHabit(s,h.id,'2026-10-27',-1);assert.equal(s.habitEntries['2026-10-27'][h.id].value,0);
 assert.throws(()=>setHabitValue(s,h.id,'2026-10-27',-1));assert.throws(()=>saveHabit(s,{name:'x',step:0,target:100},'2026-10-27'));
});
test('historical habit goal and unit survive edits, archive and backup',()=>{
 const s=empty(),h=saveHabit(s,{name:'Вода',unit:'мл',step:250,target:2000},'2026-10-26');incrementHabit(s,h.id,'2026-10-26');
 saveHabit(s,{...h,target:3000,step:500,unit:'ml'},'2026-10-27');incrementHabit(s,h.id,'2026-10-27');
 assert.equal(s.habitEntries['2026-10-26'][h.id].target,2000);assert.equal(s.habitEntries['2026-10-26'][h.id].unit,'мл');assert.equal(s.habitEntries['2026-10-27'][h.id].target,3000);
 h.archivedOn='2026-10-28';assert.throws(()=>incrementHabit(s,h.id,'2026-10-29'));assert.deepEqual(validateBackup(clone(s)),s);
});
test('deleting an active or archived habit removes its entire history and preserves unrelated records',()=>{
 for(const archived of [false,true]){
  const s=empty(),water=saveHabit(s,{name:'Вода',unit:'мл',step:250,target:2000},'2026-10-26'),reading=saveHabit(s,{name:'Чтение',unit:'мин',step:10,target:30},'2026-10-26');
  incrementHabit(s,water.id,'2026-10-26');incrementHabit(s,water.id,'2026-10-27');setHabitValue(s,reading.id,'2026-10-27',0);saveDayLog(s,'2026-10-26',{wellbeing:7});
  const p=period('day','2026-10-26');getPlan(s,p).reflection='Сохранить заметку';const keep=clone({logs:s.dayLogs,plans:s.plans,reading:s.habitEntries['2026-10-27'][reading.id]});if(archived)water.archivedOn='2026-10-28';
  deleteHabit(s,water.id);assert.deepEqual(s.habits,[reading]);assert.equal(s.habitEntries['2026-10-26'],undefined);assert.deepEqual(s.habitEntries['2026-10-27'],{[reading.id]:keep.reading});assert.deepEqual(s.dayLogs,keep.logs);assert.deepEqual(s.plans,keep.plans);assert.deepEqual(validateBackup(clone(s)),s);
  const rows=analyticsRows(s,{anchor:'2026-10-29',span:1,grain:'day',now:'2026-10-29'}).rows;assert.ok(rows.every(row=>!Object.hasOwn(row,'habit:'+water.id)));assert.throws(()=>incrementHabit(s,water.id,'2026-10-27'));
 }
});
test('deleting a missing habit leaves the workspace unchanged',()=>{
 const s=empty();saveHabit(s,{name:'Вода',unit:'мл',step:250,target:2000},'2026-10-26');const before=clone(s);assert.throws(()=>deleteHabit(s,'missing'),/не найдена/);assert.deepEqual(s,before);
});
test('habit deletion requires a separate confirmation and is offered for active and archived habits only',()=>{
 const h={id:'h',name:'<script>example</script>',unit:'мл',target:2000,step:250};
 for(const archivedOn of [null,'2026-10-28']){const form=habitForm({...h,archivedOn});assert.match(form,/data-action="delete-habit"/);assert.doesNotMatch(form,/data-action="confirm-delete-habit"/);}
 assert.doesNotMatch(habitForm(),/data-action="delete-habit"/);const confirmation=habitDeleteConfirmation(h,12);assert.match(confirmation,/data-action="confirm-delete-habit"/);assert.match(confirmation,/записи \(12\)/);assert.match(confirmation,/без возможности восстановления/);assert.doesNotMatch(confirmation,/<script>/);
});
test('sleep handles overnight, same-day, missing times and rejects inverted or excessive intervals',()=>{
 const s=empty();saveDayLog(s,'2026-10-29',{bedDate:'2026-10-28',bedTime:'23:30',wakeTime:'07:15',wellbeing:8});
 assert.equal(sleepMinutes('2026-10-29',s.dayLogs['2026-10-29']),465);
 saveDayLog(s,'2026-10-29',{bedDate:'2026-10-29',bedTime:'01:00',wakeTime:'08:30'});assert.equal(sleepMinutes('2026-10-29',s.dayLogs['2026-10-29']),450);
 assert.equal(sleepMinutes('2026-10-29',{bedDate:'2026-10-28',bedTime:'23:00',wakeTime:''}),null);
 const original=clone(s);assert.throws(()=>saveDayLog(s,'2026-10-29',{bedDate:'2026-10-29',bedTime:'22:00',wakeTime:'08:00'}));assert.deepEqual(s,original);
 assert.throws(()=>saveDayLog(s,'2026-10-29',{bedDate:'2026-10-27',bedTime:'22:00',wakeTime:'08:00'}));
 for(const wellbeing of [0,11,2.5,NaN])assert.throws(()=>saveDayLog(s,'2026-10-29',{wellbeing}));
 assert.deepEqual(validateBackup(clone(s)),s);
});
test('analytics ignores missing nights and future records, averages all logged days rather than week means',()=>{
 const s=empty();saveDayLog(s,'2026-10-26',{bedDate:'2026-10-25',bedTime:'23:00',wakeTime:'07:00',wellbeing:8});
 saveDayLog(s,'2026-10-27',{bedDate:'2026-10-27',bedTime:'01:00',wakeTime:'07:00',wellbeing:6});
 saveDayLog(s,'2026-10-30',{bedDate:'2026-10-29',bedTime:'20:00',wakeTime:'08:00',wellbeing:10});
 const a=analyticsSummary(s,{anchor:'2026-10-29',span:1,now:'2026-10-29'});assert.equal(a.sleep,7);assert.equal(a.wellbeing,7);assert.equal(a.sleepCount,2);assert.equal(a.days.length,4);assert.equal(a.productivity,null);
});
test('weekly productivity uses only frozen week snapshots, preserves cancellation denominator and archived completions',()=>{
 const s=empty(),p=period('week','2026-10-29');s.tasks=[task('a',{done:true,completedAt:'2026-10-27',archived:false}),task('b'),task('c',{done:true,completedAt:'2026-11-03'}),task('extra',{done:true,completedAt:'2026-10-27'})];normalizeState(s);
 getPlan(s,p).selected=['a','b','c'];freezePlan(s,p);s.tasks[0].archived=true;s.tasks[1].cancelled=true;
 const month=period('month','2026-10-29');getPlan(s,month).selected=['a']; // unrelated overlapping draft, not part of analytics
 const before=clone(s.plans),a=analyticsSummary(s,{anchor:'2026-10-29',span:1,now:'2026-10-29'});
 assert.equal(a.planned,3);assert.equal(a.completed,1);assert.ok(Math.abs(a.productivity-100/3)<1e-10);assert.equal(a.fixedWeeks,1);assert.deepEqual(s.plans,before);
 s.plans[p.key].snapshot=null;assert.equal(analyticsSummary(s,{anchor:'2026-10-29',span:1,now:'2026-10-29'}).productivity,null);
});
test('daily productivity uses original due dates, while weekly totals include undated tasks',()=>{
 const s=empty(),p=period('week','2026-10-29');s.tasks=[task('a',{done:true,completedAt:'2026-10-26'}),task('late',{done:true,completedAt:'2026-10-28'}),task('undated',{due:'',done:true,completedAt:'2026-10-27'})];normalizeState(s);getPlan(s,p).selected=s.tasks.map(t=>t.id);freezePlan(s,p);s.tasks[0].due='2026-10-30';
 const d=analyticsRows(s,{anchor:'2026-10-29',span:1,grain:'day',now:'2026-10-29'}).rows.find(r=>r.date==='2026-10-27');assert.equal(d.planned,2);assert.equal(d.completed,1);assert.equal(d.productivity,50);assert.equal(d.done,1);
 assert.equal(analyticsSummary(s,{anchor:'2026-10-29',span:1,now:'2026-10-29'}).productivity,100);
});
test('habit analytics distinguishes explicit zero from no entry',()=>{
 const s=empty(),h=saveHabit(s,{name:'Чтение',unit:'мин',step:10,target:30},'2026-10-26');setHabitValue(s,h.id,'2026-10-26',0);setHabitValue(s,h.id,'2026-10-27',40);
 const a=analyticsRows(s,{anchor:'2026-10-29',span:1,grain:'week',now:'2026-10-29'});assert.equal(a.rows[0]['habit:'+h.id],20);assert.deepEqual(a.rows[0].habits[h.id],{count:2,met:1});
});
test('correlation needs matching pairs, sufficient observations and variance',()=>{
 assert.equal(correlation([{x:1,y:2},{x:2,y:4},{x:3,y:6}]).r,1);assert.equal(correlation([{x:1,y:3},{x:2,y:2},{x:3,y:1}]).r,-1);
 assert.equal(correlation([{x:null,y:2},{x:1,y:1},{x:2,y:2}]).r,null);assert.equal(correlation([{x:1,y:1},{x:1,y:2},{x:1,y:3}]).r,null);
});
test('old backup migrates empty wellness and corrupt new data is rejected',()=>{
 const s={version:1,tasks:[],plans:{},vault:''};const migrated=validateBackup(s);assert.deepEqual(migrated.habits,[]);assert.deepEqual(migrated.dayLogs,{});
 const h=saveHabit(migrated,{name:'x',unit:'раз',step:1,target:5},'2026-10-26');incrementHabit(migrated,h.id,'2026-10-26');saveDayLog(migrated,'2026-10-27',{wellbeing:5});
 for(const mutate of [b=>b.habitEntries['2026-10-26'][h.id].value=-1,b=>b.habits[0].step=0,b=>b.dayLogs['2026-10-27'].wellbeing=11,b=>b.dayLogs['2026-10-27'].bedDate='2026-02-31']){const bad=clone(migrated);mutate(bad);assert.throws(()=>validateBackup(bad));}
});
