import {test} from 'node:test';
import assert from 'node:assert/strict';
import {period,shiftPeriod,freezePlan,getPlan,comparison,parseMarkdown,mergeTasks,tasksMarkdown,planMarkdown,validateBackup,seedState,clone} from '../dist/model.js';
test('weeks cross calendar years and monthly navigation respects month boundaries',()=>{
  assert.deepEqual({...period('week','2027-01-01')}, {type:'week',start:'2026-12-28',end:'2027-01-03',key:'week:2026-12-28',label:'W53 · 2026'});
  assert.equal(shiftPeriod('month','2026-01-31',1),'2026-02-01');
  assert.equal(period('month','2028-02-13').end,'2028-02-29');
  assert.equal(shiftPeriod('year','2026-10-29',1),'2027-01-01');
});
test('frozen baseline remains unchanged by edits, completion and new tasks',()=>{
  const state=seedState(),p=period('week','2026-10-29'),plan=getPlan(state,p);state.tasks.forEach(t=>{t.done=false;t.completedAt='';});plan.selected=state.tasks.slice(0,2).map(t=>t.id);plan.goal='First';
  freezePlan(state,p,'2026-10-26T06:00:00Z');const original=clone(plan.snapshot);
  const t=state.tasks[0];t.title='Changed';t.estimate=42;t.done=true;t.completedAt='2026-10-30';plan.goal='Changed';
  state.tasks.push({...t,id:'extra',title:'Unplanned'});
  assert.deepEqual(plan.snapshot,original);assert.equal(comparison(state,p).changed,1);assert.equal(comparison(state,p).extras.length,1);assert.equal(comparison(state,p).rows[0].done,true);
  assert.throws(()=>freezePlan(state,p),/уже/);
});
test('completion is shared but actual counts are limited to each period',()=>{
  const state=seedState();state.plans={};const t=state.tasks[0];t.done=true;t.completedAt='2026-11-02';
  const week=period('week','2026-10-29'),month=period('month','2026-11-04'),year=period('year','2026-10-29');
  for(const p of [week,month,year]){getPlan(state,p).selected=[t.id];freezePlan(state,p);}
  assert.equal(comparison(state,week).done,0);assert.equal(comparison(state,month).done,1);assert.equal(comparison(state,year).done,1);
  t.archived=true;assert.equal(comparison(state,year).total,1);assert.equal(comparison(state,year).done,1);
});
test('archiving completed tasks preserves historical actuals and unplanned work',()=>{
  const state=seedState();state.plans={};const p=period('week','2026-10-29');
  const planned=state.tasks[0],extra=state.tasks[1];
  for(const t of state.tasks){t.done=false;t.completedAt='';}
  for(const t of [planned,extra]){t.done=true;t.completedAt='2026-10-29';}
  getPlan(state,p).selected=[planned.id];freezePlan(state,p);const snapshot=clone(getPlan(state,p).snapshot);
  planned.archived=true;extra.archived=true;
  assert.equal(comparison(state,p).done,1);assert.equal(comparison(state,p).extras.length,1);
  assert.deepEqual(getPlan(state,p).snapshot,snapshot);
  assert.match(planMarkdown(state,p),/Выполнена в периоде · архив/);
});
test('Markdown updates by block ID, preserves frozen plan and exports working block links',()=>{
  const state={version:1,tasks:[],plans:{},vault:''};const source='Проекты/Афина.md';
  mergeTasks(state,parseMarkdown('- [ ] Old #Athena 📅 2026-10-30 [estimate:: 2] ^stable',source));
  const p=period('month','2026-10-29');getPlan(state,p).selected=[state.tasks[0].id];freezePlan(state,p);
  mergeTasks(state,parseMarkdown('- [x] New #Athena ✅ 2026-10-29 [estimate:: 3] ^stable',source));
  assert.equal(state.tasks.length,1);assert.equal(state.tasks[0].title,'New');assert.equal(comparison(state,p).rows[0].item.title,'Old');assert.equal(comparison(state,p).done,1);
  assert.match(planMarkdown(state,p),/\[\[Проекты\/Афина#\^stable\]\]/);assert.match(tasksMarkdown(state),/\[x\] New.*\^stable/);
  assert.throws(()=>parseMarkdown('- [ ] One ^dup\n- [ ] Two ^dup'),/повторяется/);
  assert.throws(()=>parseMarkdown('- [ ] Invalid 📅 2026-02-31'),/дата/);
});
test('generated ID survives export and reimport without duplication',()=>{
  const state={version:1,tasks:[],plans:{}};mergeTasks(state,parseMarkdown('- [ ] Without ID','Notes.md'));
  const originalId=state.tasks[0].id;mergeTasks(state,parseMarkdown(tasksMarkdown(state).replace('Without ID','Renamed'),'Notes.md'));
  assert.equal(state.tasks.length,1);assert.equal(state.tasks[0].id,originalId);assert.equal(state.tasks[0].title,'Renamed');
});
test('backup round-trip retains plans; invalid data does not replace state',()=>{
  const state=seedState();const p=period('month','2026-10-29');getPlan(state,p).selected=[state.tasks[0].id];freezePlan(state,p);
  assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(state))),state);
  assert.throws(()=>validateBackup({version:1,tasks:[{}],plans:{}}));
  const bad=clone(state);bad.tasks[0].completedAt='2026-02-31';assert.throws(()=>validateBackup(bad));
});
