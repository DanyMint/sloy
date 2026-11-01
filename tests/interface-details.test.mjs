import {test} from 'node:test';
import assert from 'node:assert/strict';
import {habitStreaks,habitGoalMet} from '../dist/habit-streaks.js';
import {analyticsDemo} from '../dist/analytics-demo.js';
import {analyticsRows,analyticsSummary,correlation} from '../dist/analytics.js';
import {seedState,validateBackup,clone,addDays,today} from '../dist/model.js';
import {saveArea,saveProject} from '../dist/domain.js';
const h={id:'water',name:'Вода',unit:'мл',step:250,target:3000,createdOn:'2026-10-01',archivedOn:null};
function entries(days){return {habits:[h],habitEntries:Object.fromEntries(days.map(d=>[d,{water:{value:2000,target:2000,unit:'мл'}}]))};}

test('streaks use historical goals, bridge midnight and keep yesterday while today is unfinished',()=>{
 const s=entries(['2026-10-26','2026-10-27','2026-10-28','2026-10-29']);
 assert.equal(habitGoalMet(s,h,'2026-10-29','2026-10-30'),true);
 assert.deepEqual(habitStreaks(s,h,'2026-10-30'),{current:4,best:4});
 s.habitEntries['2026-10-30']={water:{value:1000,target:3000,unit:'мл'}};
 assert.deepEqual(habitStreaks(s,h,'2026-10-30'),{current:4,best:4});
 s.habitEntries['2026-10-30'].water.value=3000;
 assert.deepEqual(habitStreaks(s,h,'2026-10-30'),{current:5,best:5});
});
test('missing days and corrections break a streak; record remains independent of calendar week',()=>{
 const s=entries(['2026-10-21','2026-10-22','2026-10-23','2026-10-24','2026-10-25','2026-10-27','2026-10-28']);
 assert.deepEqual(habitStreaks(s,h,'2026-10-30'),{current:0,best:5});
 s.habitEntries['2026-10-23'].water.value=0;
 assert.deepEqual(habitStreaks(s,h,'2026-10-29'),{current:2,best:2});
});
test('future entries never extend a streak; archival stops the current series without losing its record',()=>{
 const s=entries(['2026-10-28','2026-10-29','2026-10-30','2026-10-31']);
 assert.deepEqual(habitStreaks(s,h,'2026-10-30'),{current:3,best:3});
 const archived={...h,archivedOn:'2026-10-30'};
 assert.deepEqual(habitStreaks(s,archived,'2026-10-30'),{current:0,best:2});
 assert.equal(habitGoalMet(s,h,'2026-10-31','2026-10-30'),false);
});
test('demo is a valid isolated 12-week workspace with varying correlated metrics and no future logs',()=>{
 const own=seedState(),saved=clone(own),now=today(),demo=analyticsDemo(now);
 assert.deepEqual(validateBackup(demo),demo);assert.deepEqual(own,saved);
 assert.equal(Object.keys(demo.plans).filter(k=>k.startsWith('week:')).length,12);
 assert.ok(Object.keys(demo.dayLogs).every(d=>d<=now));
 const weeks=analyticsRows(demo,{anchor:now,span:12,grain:'week',now}).rows;
 assert.equal(weeks.length,12);assert.ok(new Set(weeks.map(r=>r.sleep)).size>6);
 assert.ok(new Set(weeks.map(r=>r.productivity)).size>3);
 const c=correlation(weeks.map(r=>({x:r.sleep,y:r.productivity})));
 assert.equal(c.n,12);assert.ok(c.r>.5&&c.r<=1);
 const summary=analyticsSummary(demo,{anchor:now,span:4,now});
 assert.ok(summary.sleepCount>=24);assert.ok(summary.completed>0&&summary.completed<summary.planned);
 demo.habitEntries[addDays(now,-1)]['sample-water'].value=0;
 assert.deepEqual(own,saved);assert.ok(analyticsDemo(now).habitEntries[addDays(now,-1)]['sample-water'].value>0);
});
test('entity icons survive edits, backup round-trip and clearing; unsupported icon markup is rejected',()=>{
 const s=seedState(),area=saveArea(s,{name:'Быт',icon:'home'}),p=saveProject(s,{name:'Ремонт кухни',areaId:area.id,icon:'tools'});
 saveArea(s,{id:area.id,name:'Дом'});saveProject(s,{id:p.id,name:p.name,areaId:area.id});
 assert.equal(area.icon,'home');assert.equal(p.icon,'tools');
 const restored=validateBackup(clone(s));assert.equal(restored.projects.find(x=>x.id===p.id).icon,'tools');
 saveArea(s,{id:area.id,name:area.name,icon:''});assert.equal(area.icon,'');
 assert.throws(()=>saveArea(s,{name:'Ошибка',icon:'<img onerror=alert(1)>'}));
 const bad=clone(s);bad.projects[0].icon='unknown';assert.throws(()=>validateBackup(bad));
});
