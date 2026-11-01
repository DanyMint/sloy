import {test} from 'node:test';
import assert from 'node:assert/strict';
import {period,shiftPeriod,seedState,clone,getPlan,freezePlan,comparison,validateBackup,planMarkdown} from '../dist/model.js';
import {journalPlan,freezeJournal,weeklyTasks,selectJournalTask,selectFocus,focusEntities,quarterYearProjects,quarterProjects,addJournalTask} from '../dist/journal.js';
import {saveProject} from '../dist/domain.js';
import {focusPlannerHTML,quarterStatsHTML} from '../dist/journal-pages.js';
import {analyticsRows,analyticsSummary} from '../dist/analytics.js';

test('day and quarter boundaries include leap days and cross years',()=>{
 assert.equal(period('day','2028-02-29').end,'2028-02-29');
 assert.equal(shiftPeriod('day','2028-02-29',1),'2028-03-01');
 assert.deepEqual(period('quarter','2026-12-31'),{type:'quarter',start:'2026-10-01',end:'2026-12-31',key:'quarter:2026-Q4',label:'4 квартал'});
 assert.equal(shiftPeriod('quarter','2026-12-31',1),'2027-01-01');
 assert.equal(period('quarter','2028-02-29').end,'2028-03-31');
});
test('year migrates an old task plan without losing its frozen history',()=>{
 const s=seedState(),p=period('year','2026-10-30');getPlan(s,p).selected=[s.tasks[0].id];getPlan(s,p).goal='Old focus';freezePlan(s,p,'2026-01-01T00:00:00Z');const old=clone(getPlan(s,p));
 const plan=journalPlan(s,p);assert.deepEqual(plan.legacyPlan,old);assert.deepEqual(plan.selected,[]);assert.equal(plan.snapshot,null);
assert.throws(()=>selectJournalTask(s,p,s.tasks[0].id));
 assert.deepEqual(validateBackup(clone(s)),s);assert.deepEqual(journalPlan(s,p).legacyPlan,old);
});
test('year focus freezes original project and area names and cannot be edited later',()=>{
 const s=seedState(),p=period('year','2026-10-30'),plan=journalPlan(s,p),a=s.areas[0],project=s.projects[0];
 selectFocus(s,p,'area',a.id);selectFocus(s,p,'project',project.id);plan.goal='Priorities';freezeJournal(s,p,'2026-01-01T00:00:00Z');const saved=clone(plan.snapshot),name=project.name;
 saveProject(s,{...project,name:'Renamed'});a.name='Changed area';plan.goal='New goal';
 assert.deepEqual(plan.snapshot,saved);assert.equal(focusEntities(s,p,'project')[0].name,name);assert.equal(selectFocus(s,p,'area',a.id),false);assert.throws(()=>freezeJournal(s,p));
 const md=planMarkdown(s,p);assert.match(md,/Priorities/);assert.ok(md.includes(name));assert.ok(!md.includes('Renamed'));assert.ok(!md.includes(s.tasks[0].title));assert.deepEqual(validateBackup(clone(s)),s);
});
test('quarter plans year-focused projects and their children without tasks; frozen labels survive edits',()=>{
 const s=seedState(),q=period('quarter','2026-10-30'),year=period('year',q.start),parent=s.projects[0];
 selectFocus(s,year,'project',parent.id);freezeJournal(s,year,'2026-01-01T00:00:00Z');
 const child=saveProject(s,{name:'Первый этап',parentId:parent.id});
 assert.deepEqual(quarterProjects(s,q).map(p=>p.id),[parent.id,child.id]);
 assert.equal(selectFocus(s,q,'project',child.id),true);assert.equal(selectFocus(s,q,'area',s.areas[0].id),false);
 assert.throws(()=>selectJournalTask(s,q,s.tasks[1].id),/не задачи/);
 const plan=journalPlan(s,q);plan.goal='Результат квартала';freezeJournal(s,q);const snapshot=clone(plan.snapshot);
 assert.equal(snapshot.items.length,0);assert.equal(snapshot.focusProjects[0].parentName,parent.name);
 saveProject(s,{...child,name:'Переименован'});saveProject(s,{...parent,name:'Новый родитель'});
 assert.deepEqual(plan.snapshot,snapshot);assert.ok(planMarkdown(s,q).includes('Первый этап'));assert.ok(!planMarkdown(s,q).includes(s.tasks[0].title));
 assert.equal(selectFocus(s,q,'project',parent.id),false);assert.deepEqual(validateBackup(clone(s)),s);
});
test('quarter uses its own year, excludes unrelated projects and validates changed draft focus',()=>{
 const s=seedState(),q=period('quarter','2026-10-30'),year=period('year',q.start),parent=s.projects[0],other=s.projects[1];
 assert.deepEqual(quarterProjects(s,q),[]);assert.equal(selectFocus(s,q,'project',other.id),false);
 selectFocus(s,year,'project',parent.id);selectFocus(s,q,'project',parent.id);
 assert.deepEqual(quarterProjects(s,period('quarter','2027-01-01')),[]);
 selectFocus(s,year,'project',parent.id);assert.throws(()=>freezeJournal(s,q),/Фокус года изменился/);
 assert.equal(selectFocus(s,q,'project',parent.id),true);assert.equal(journalPlan(s,q).focusProjects.length,0);
 selectFocus(s,year,'project',parent.id);selectFocus(s,q,'project',parent.id);freezeJournal(s,q);
 const fixed=clone(journalPlan(s,q).snapshot);selectFocus(s,year,'project',parent.id);assert.deepEqual(journalPlan(s,q).snapshot,fixed);
});
test('old quarterly task snapshots migrate once and retain original history in backup',()=>{
 for(const hadFocus of [false,true]){
  const s=seedState(),q=period('quarter','2026-10-30'),old=getPlan(s,q);old.selected=[s.tasks[0].id];old.goal='Старый план';old.focusProjects=hadFocus?[s.projects[0].id]:[];
  freezePlan(s,q,'2026-10-01T00:00:00Z');const original=clone(old),task=clone(s.tasks[0]);
  const plan=journalPlan(s,q);assert.deepEqual(plan.legacyPlan,original);assert.deepEqual(plan.selected,[]);
  assert.equal(!!plan.snapshot,hadFocus);if(hadFocus){assert.deepEqual(plan.snapshot.items,[]);assert.deepEqual(plan.snapshot.focusProjects,original.snapshot.focusProjects);}
  assert.deepEqual(s.tasks[0],task);assert.deepEqual(validateBackup(clone(s)),s);assert.deepEqual(journalPlan(s,q).legacyPlan,original);
 }
});
test('quarter UI shows annual context and child creation, but no task planning or statistics',()=>{
 const s=seedState(),q=period('quarter','2026-10-30'),parent=s.projects[0],original=parent.name;
 selectFocus(s,period('year',q.start),'project',parent.id);freezeJournal(s,period('year',q.start));saveProject(s,{...parent,name:'Новое имя'});
 const child=saveProject(s,{name:'Этап квартала',parentId:parent.id}),html=focusPlannerHTML(s,q),stats=quarterStatsHTML(s,q);
 assert.equal(quarterYearProjects(s,q)[0].name,original);assert.ok(html.includes(original));assert.ok(html.includes(child.name));assert.ok(html.includes('data-parent="'+parent.id+'"'));
 for(const t of s.tasks)assert.ok(!html.includes(t.title));assert.ok(!stats.includes('Выполнено по плану'));
});
test('weekly drops are idempotent, preserve snapshots and reject archived tasks',()=>{
 const s=seedState(),week=period('week','2026-10-30'),plan=journalPlan(s,week),t=s.tasks[6];
 assert.equal(addJournalTask(s,week,t.id),true);assert.equal(addJournalTask(s,week,t.id),false);
 assert.equal(plan.selected.filter(id=>id===t.id).length,1);freezeJournal(s,week);const saved=clone(plan.snapshot);
 assert.equal(addJournalTask(s,week,s.tasks[5].id),false);assert.deepEqual(plan.snapshot,saved);
 const next=period('week','2026-11-04');t.archived=true;assert.equal(addJournalTask(s,next,t.id),false);
});
test('day accepts its weekly pool and frozen daily baseline survives weekly changes',()=>{
 const s=seedState();s.plans={};const week=period('week','2026-10-30'),day=period('day','2026-10-30'),a=s.tasks[1],b=s.tasks[2];b.due='2026-11-05';
 getPlan(s,week).selected=[a.id];assert.deepEqual(weeklyTasks(s,day.start).map(t=>t.id),[a.id]);assert.throws(()=>selectJournalTask(s,day,b.id));selectJournalTask(s,day,a.id);freezeJournal(s,day);const saved=clone(getPlan(s,day).snapshot);
 getPlan(s,week).selected=[];a.title='Edited';a.done=true;a.completedAt=day.start;
 assert.deepEqual(getPlan(s,day).snapshot,saved);assert.equal(comparison(s,day).done,1);assert.equal(comparison(s,day).changed,1);assert.deepEqual(validateBackup(clone(s)),s);
});
test('day fixation detects weekly draft changes and does not silently fix unrelated tasks',()=>{
 const s=seedState();s.plans={};const week=period('week','2026-10-30'),day=period('day','2026-10-30');getPlan(s,week).selected=[s.tasks[1].id];selectJournalTask(s,day,s.tasks[1].id);getPlan(s,week).selected=[];
 assert.throws(()=>freezeJournal(s,day),/Состав недели изменился/);assert.equal(getPlan(s,day).snapshot,null);assert.equal(selectJournalTask(s,day,s.tasks[1].id),true);
});
test('daily analytics uses explicit daily snapshot without double-counting weekly productivity',()=>{
 const s=seedState();s.plans={};s.tasks.forEach(t=>{t.done=false;t.completedAt='';});const day=period('day','2026-10-30'),week=period('week',day.start),a=s.tasks[1],b=s.tasks[2];a.due='';b.due=day.start;getPlan(s,week).selected=[a.id,b.id];freezePlan(s,week);selectJournalTask(s,day,a.id);freezeJournal(s,day);a.done=true;a.completedAt=day.start;
 const row=analyticsRows(s,{anchor:day.start,span:1,grain:'day',now:day.start}).rows.find(r=>r.date===day.start);assert.equal(row.planned,1);assert.equal(row.productivity,100);
 assert.equal(analyticsSummary(s,{anchor:day.start,span:1,now:day.start}).productivity,50);
 const bad=clone(s);bad.plans[day.key].focusProjects='bad';assert.throws(()=>validateBackup(bad));
});
