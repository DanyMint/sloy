import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeState,saveArea,saveProject,attachTask,setProjectArchived,isProjectArchived,isTaskActive,deleteProject,materializeRepeats,setTaskStatus} from '../dist/domain.js';
import {clone,period,comparison,validateBackup,parseMarkdown,mergeTasks,tasksMarkdown} from '../dist/model.js';
import {journalPlan,freezeJournal,weeklyTasks,selectJournalTask,selectFocus} from '../dist/journal.js';
import {overdueTasks,addOverplan} from '../dist/day-flow.js';
import {sidebarTreeHTML,scopeHTML} from '../dist/workspace-v2.js';
import {projectOptions} from '../dist/pages.js';
import {focusPlannerHTML} from '../dist/journal-pages.js';
import {applyBoard,defaultBoard} from '../dist/kanban.js';
function workspace(){
 const s=normalizeState({version:1,demo:false,tasks:[],plans:{},vault:''}),area=saveArea(s,{name:'Дом'}),root=saveProject(s,{name:'Кухня',areaId:area.id}),child=saveProject(s,{name:'Гарнитур',parentId:root.id});
 const add=(id,p)=>{const t={id,title:'Задача '+id,project:'Входящие',estimate:1,due:'2026-10-27',done:false,completedAt:'',source:'Tasks.md',blockId:id,archived:false,recurrence:'none',cancelled:false};s.tasks.push(t);return attachTask(s,t,p.id);};
 const one=add('one',root),two=add('two',child);normalizeState(s);return {s,area,root,child,one,two};
}
test('archiving a hierarchy removes draft work but preserves tasks, statuses and frozen history',()=>{
 const {s,root,child,one,two}=workspace(),week=period('week','2026-10-30'),year=period('year','2026-10-30'),day=period('day','2026-10-30');
 journalPlan(s,week).selected=[one.id,two.id];freezeJournal(s,week);selectFocus(s,year,'project',root.id);freezeJournal(s,year);const snapshots=clone([s.plans[week.key].snapshot,s.plans[year.key].snapshot]);journalPlan(s,day).selected=[one.id];
 setProjectArchived(s,root.id,true);assert.equal(isProjectArchived(s,child),true);assert.equal(isTaskActive(s,one),false);assert.equal(one.archived,false);assert.equal(one.cancelled,false);assert.deepEqual(s.plans[day.key].selected,[]);assert.deepEqual(weeklyTasks(s,day.start),[]);assert.equal(overdueTasks(s,day.start).length,0);assert.equal(comparison(s,week).total,2);assert.deepEqual([s.plans[week.key].snapshot,s.plans[year.key].snapshot],snapshots);assert.deepEqual(validateBackup(clone(s)),s);
});
test('restoring a parent keeps separately archived children and individually archived tasks archived',()=>{
 const {s,root,child,one,two}=workspace();one.archived=true;setProjectArchived(s,child.id,true);setProjectArchived(s,root.id,true);assert.throws(()=>setProjectArchived(s,child.id,false),/родительский/);setProjectArchived(s,root.id,false);assert.equal(isProjectArchived(s,child),true);assert.equal(isTaskActive(s,one),false);assert.equal(isTaskActive(s,two),false);setProjectArchived(s,child.id,false);assert.equal(isTaskActive(s,two),true);assert.equal(one.archived,true);
});
test('archive is accessible but archived projects leave the tree, focus catalog and task picker',()=>{
 const {s,root}=workspace();setProjectArchived(s,root.id,true);const tree=sidebarTreeHTML(s,{page:'zones',entityId:'',expanded:{}});assert.doesNotMatch(tree,/data-tree-open="project"/);assert.match(tree,/data-action="project-archive"/);assert.doesNotMatch(projectOptions(s,''),/Кухня|Гарнитур/);assert.doesNotMatch(focusPlannerHTML(s,period('year','2026-10-30')),/Кухня|Гарнитур/);assert.match(scopeHTML(s,{page:'projects',entityId:'__archive'}),/Кухня/);const archived=scopeHTML(s,{page:'projects',entityId:root.id,layout:'kanban'});assert.match(archived,/data-action="restore-project"/);assert.doesNotMatch(archived,/data-action="new-task"|class="kanban-board"/);
});
test('archived project tasks cannot be added to new plans or generate repeat instances',()=>{
 const {s,root,one}=workspace(),week=period('week','2026-10-30'),day=period('day','2026-10-30');Object.assign(one,{recurrence:'daily',repeatFrom:'due'});journalPlan(s,week).selected=[one.id];freezeJournal(s,week);freezeJournal(s,day);setProjectArchived(s,root.id,true);assert.equal(selectJournalTask(s,period('week','2026-11-04'),one.id),false);assert.equal(selectFocus(s,period('year','2026-10-30'),'project',root.id),false);assert.throws(()=>addOverplan(s,day.start,one.id));assert.throws(()=>setTaskStatus(s,one.id,'done',day.start),/восстановите/);assert.equal(materializeRepeats(s,day.start),0);assert.throws(()=>saveProject(s,{name:'Новый',parentId:root.id}),/восстановите/);assert.throws(()=>attachTask(s,{...one,id:'new'},root.id),/восстановите/);
});
test('deleting a root detaches all tasks into its area and preserves frozen focus, recurrence and task IDs',()=>{
 const {s,area,root,child,one,two}=workspace(),week=period('week','2026-10-30'),year=period('year','2026-10-30');Object.assign(two,{recurrence:'weekly',repeatFrom:'due',archived:true});journalPlan(s,week).selected=[one.id];freezeJournal(s,week);selectFocus(s,year,'project',root.id);freezeJournal(s,year);applyBoard(s,defaultBoard(),root.id);applyBoard(s,defaultBoard(),child.id);const snapshots=clone([s.plans[week.key].snapshot,s.plans[year.key].snapshot]);setProjectArchived(s,root.id,true);deleteProject(s,root.id);assert.equal(s.projects.length,0);assert.deepEqual(s.tasks.map(t=>t.id),['one','two']);assert.ok(s.tasks.every(t=>t.projectId===null&&t.areaId===area.id));assert.equal(two.recurrence,'weekly');assert.equal(two.archived,true);assert.deepEqual(s.projectBoards,{});assert.deepEqual([s.plans[week.key].snapshot,s.plans[year.key].snapshot],snapshots);assert.deepEqual(validateBackup(clone(s)),s);
});
test('deleting one child leaves its parent, sibling and their tasks intact',()=>{
 const {s,root,child,one,two}=workspace(),sibling=saveProject(s,{name:'Стены',parentId:root.id});deleteProject(s,child.id);assert.deepEqual(s.projects.map(p=>p.id),[root.id,sibling.id]);assert.equal(one.projectId,root.id);assert.equal(two.projectId,null);assert.equal(two.areaId,root.areaId);assert.throws(()=>deleteProject(s,'missing'));assert.deepEqual(validateBackup(clone(s)),s);
});
test('deleting an unassigned project retains tasks in the inbox and removes only draft focus references',()=>{
 const {s,root,one}=workspace();saveProject(s,{...root,areaId:null});const quarter=journalPlan(s,period('quarter','2026-10-30'));quarter.focusProjects=[root.id];quarter.selected=[one.id];deleteProject(s,root.id);assert.equal(one.areaId,null);assert.equal(one.projectId,null);assert.deepEqual(quarter.focusProjects,[]);assert.deepEqual(quarter.selected,[one.id]);assert.deepEqual(validateBackup(clone(s)),s);
});
test('archived projects round-trip through backup and Markdown without becoming active',()=>{
 const {s,root}=workspace();setProjectArchived(s,root.id,true);const md=tasksMarkdown(s);mergeTasks(s,parseMarkdown(md,'Tasks.md'));assert.equal(isProjectArchived(s,root.id),true);assert.equal(s.tasks.length,2);assert.deepEqual(validateBackup(clone(s)),s);const bad=clone(s);bad.projects[0].archived='yes';assert.throws(()=>validateBackup(bad));
});
