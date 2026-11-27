import {test} from 'node:test';import assert from 'node:assert/strict';
import {decodeVault,encodeVault,finalizeKnowledge,parseRule,ruleOf,emptyState} from '../codec.js';
import {VaultEngine} from '../engine.js';
import {validateBackup,comparison,freezePlan,period,getPlan} from '../../dist/model.js';
import {setTaskParent,setTaskStatus,compareTaskListOrder,rememberTaskListOrder,reorderTaskList} from '../../dist/domain.js';
const document=(path,text)=>({path,text,hash:'hash-'+path});
const fixture=()=>[
 document('Areas/Work.md','---\nsloy_type: area\nsloy_id: work\nname: Работа\ncustom: keep-me\n---\n# Работа\n\nСвободный текст.\n'),
 document('Projects/Root.md','---\nsloy_type: project\nsloy_id: root\nname: Большая цель\nparent: "[[Areas/Work]]"\n---\n# Большая цель\n'),
 document('Projects/Child.md','---\nsloy_type: project\nsloy_id: child\nname: Квартальная цель\nparent: "[[Projects/Root]]"\n---\n# Квартальная цель\n\nСвободный текст перед.\n- [ ] Сделать шаг ⏳ 2026-10-28 📅 2026-11-01 🆔 abc123 ^step\n\nСвободный текст после.\n```md\n- [ ] Это пример, не задача\n```\n')];
const apply=(docs,changes)=>{const map=new Map(docs.map(d=>[d.path,d]));for(const p of changes.deletes)map.delete(p.path);for(const w of changes.writes)map.set(w.path,{...w,hash:'new-'+w.path});return [...map.values()];};
test('hierarchy and own Tasks checkboxes decode; fenced examples stay prose',()=>{const d=decodeVault(fixture());assert.equal(d.state.tasks.length,1);assert.equal(d.state.projects[1].parentId,'root');assert.equal(d.state.projects[1].areaId,'work');assert.equal(d.state.tasks[0].projectId,'child');});
test('editing a task preserves prose, arbitrary YAML, scheduled date and stable identity',()=>{const docs=fixture(),d=decodeVault(docs),s=structuredClone(d.state);s.tasks[0].done=true;s.tasks[0].completedAt='2026-11-01';const c=encodeVault(s,d),next=apply(docs,c),t=decodeVault(next).state.tasks[0];assert.equal(t.id,s.tasks[0].id);assert.equal(t.done,true);const body=next.find(n=>n.path==='Projects/Child.md').text;assert.match(body,/Свободный текст перед/);assert.match(body,/Свободный текст после/);assert.match(body,/⏳ 2026-10-28/);assert.match(next.find(n=>n.path==='Areas/Work.md').text,/custom: keep-me/);});
test('writing twice stabilizes and does not duplicate tasks',()=>{const d=decodeVault(fixture()),s=structuredClone(d.state),first=apply(fixture(),encodeVault(s,d)),next=decodeVault(first);assert.equal(encodeVault(next.state,next).writes.length,0);assert.equal(next.state.tasks.length,1);});
test('frozen plan is readable and never duplicates actionable checkboxes',()=>{const d=decodeVault(fixture()),s=structuredClone(d.state),t=s.tasks[0];s.plans['day:2026-11-01']={selected:[t.id],goal:'Фокус',capacity:8,reflection:'Мои выводы',snapshot:{at:'2026-11-01T08:00:00Z',goal:'Фокус',capacity:8,items:[{...t}]}};const c=encodeVault(s,d),journal=c.writes.find(w=>w.path.startsWith('Journals/'));assert.match(journal.text,/Сделать шаг/);assert.match(journal.text,/#\^step/);assert.doesNotMatch(journal.text,/^- \[[ x]\]/m);assert.deepEqual(decodeVault(apply(fixture(),c)).state.plans,s.plans);});
test('deleting a project moves tasks to its area and trashes only deleted note',()=>{const d=decodeVault(fixture()),s=structuredClone(d.state);s.projects=s.projects.filter(p=>p.id!=='child');s.tasks[0].projectId=null;s.tasks[0].areaId='work';s.tasks[0].project='Входящие';const c=encodeVault(s,d);assert.equal(c.deletes[0].path,'Projects/Child.md');assert.match(c.writes.find(w=>w.path==='Areas/Work.md').text,/Сделать шаг/);assert.equal(decodeVault(apply(fixture(),c)).state.tasks[0].areaId,'work');});
test('habit definitions and one shared counter note per date round trip',()=>{const d=decodeVault([]),s=emptyState();s.habits=[{id:'water',name:'Вода',unit:'мл',step:250,target:2000,createdOn:'2026-10-01',archivedOn:null,icon:''},{id:'walk',name:'Прогулка',unit:'мин',step:10,target:30,createdOn:'2026-10-01',archivedOn:null,icon:''}];s.habitEntries={'2026-11-01':{water:{value:750,target:2000,unit:'мл'},walk:{value:30,target:30,unit:'мин'}}};const c=encodeVault(s,d);assert.equal(c.writes.filter(w=>w.path.startsWith('Habits/Records')).length,1);assert.deepEqual(decodeVault(apply([],c)).state.habitEntries,s.habitEntries);});
test('closed Knowledge totals survive late data and midnight closes the last saved count',()=>{const s=emptyState();finalizeKnowledge(s,{'2026-10-30':2,'2026-10-31':3},'2026-10-31');finalizeKnowledge(s,{'2026-10-30':99,'2026-10-31':10,'2026-11-01':4},'2026-11-01');assert.equal(s.knowledgeFacts['2026-10-30'].count,2);assert.equal(s.knowledgeFacts['2026-10-31'].count,3);assert.equal(s.knowledgeFacts['2026-10-31'].closed,true);assert.equal(s.knowledgeFacts['2026-11-01'].count,4);});
test('ambiguous/missing parent, duplicate IDs and invalid YAML refuse loading',()=>{const docs=fixture();assert.throws(()=>decodeVault(docs.slice(1)),/Родитель/);assert.throws(()=>decodeVault([...docs,document('Areas/Again.md',docs[0].text)]),/Повторяется/);assert.throws(()=>decodeVault([document('Areas/Bad.md','---\na: [\n---\n')]),/Bad/);});
test('Tasks simple recurrence is mapped; unsupported rules remain explicit',()=>{for(const rule of ['every day','every week when done','every 3 months','every weekday'])assert.equal(ruleOf(parseRule(rule)),rule);assert.equal(parseRule('every week on Tuesday').nativeRecurrenceRule,'every week on Tuesday');});
test('failed saves retain the draft and block reconciliation until explicit recovery',async()=>{const engine=new VaultEngine({commit:async()=>{throw new Error('External edit');},scan:async()=>{throw new Error('should not scan');}});const s=emptyState();s.areas.push({id:'a',name:'A',description:'',icon:''});engine.save(s);await assert.rejects(engine.flush(),/External edit/);assert.equal(engine.pending.areas[0].id,'a');await assert.rejects(engine.reconcile(),/External edit/);});
test('reconciliation is transactional when a parent temporarily disappears during sync',async()=>{let docs=fixture(),engine=new VaultEngine({scan:async()=>({full:true,documents:docs,knowledge:{},deletedPaths:[]}),commit:async()=>{}});await engine.reconcile();const previous=engine.state;docs=docs.slice(1);await assert.rejects(engine.reconcile(),/Родитель/);assert.equal(engine.state,previous);assert.equal(engine.documents.size,3);docs=fixture();await engine.reconcile();assert.equal(engine.state.projects[1].areaId,'work');});
test('force synchronization precedes scan and save errors never enter synchronization',async()=>{const order=[],engine=new VaultEngine({sync:async()=>{order.push('sync');return {status:'complete'};},scan:async()=>{order.push('scan');return {full:true,documents:fixture(),knowledge:{},deletedPaths:[]};},commit:async()=>order.push('commit')});await engine.reconcile({force:true});assert.deepEqual(order,['sync','scan']);validateBackup(engine.state);});

test('unchanged daily Knowledge count does not produce a periodic rewrite',()=>{const s=emptyState();finalizeKnowledge(s,{'2026-11-01':2},'2026-11-01','first');finalizeKnowledge(s,{'2026-11-01':2},'2026-11-01','second');assert.equal(s.knowledgeFacts['2026-11-01'].updatedAt,'first');});

test('nested checkboxes keep identity when reparented and move with their Markdown branch',()=>{
 const docs=fixture(),note=docs.find(item=>item.path==='Projects/Child.md');
 note.text+='\n- [ ] Release [sloy_id:: release] ^release\n    - Explanation\n    - [ ] Build [sloy_id:: build] ^build\n        - [ ] Sign [sloy_id:: sign] ^sign\n        Build instructions\n    Tail of release\n- [ ] Other [sloy_id:: other] ^other\n';
 const decoded=decodeVault(docs),state=structuredClone(decoded.state),get=id=>state.tasks.find(task=>task.id===id);
 assert.equal(get('build').parentTaskId,'release');
 assert.equal(get('sign').parentTaskId,'build');
 assert.equal(get('other').parentTaskId,undefined);
 get('build').parentTaskId='other';
 const reparented=apply(docs,encodeVault(state,decoded)),next=decodeVault(reparented);
 assert.equal(next.state.tasks.find(task=>task.id==='build').parentTaskId,'other');
 assert.equal(next.state.tasks.find(task=>task.id==='sign').parentTaskId,'build');
 const moved=structuredClone(next.state),other=moved.tasks.find(task=>task.id==='other');
 other.projectId='root';
 const finalDocs=apply(reparented,encodeVault(moved,next)),final=decodeVault(finalDocs);
 for(const id of ['other','build','sign']){
  const task=final.state.tasks.find(item=>item.id===id);
  assert.equal(task.projectId,'root');
  assert.equal(task.blockId,id);
 }
 const original=finalDocs.find(item=>item.path===note.path).text;
 assert.match(original,/Explanation/);
 assert.match(original,/Tail of release/);
 assert.doesNotMatch(original,/sloy_id:: build|Build instructions/);
 const destination=finalDocs.find(item=>item.path==='Projects/Root.md').text;
 assert.match(destination,/\^sign\n        Build instructions/);

 assert.equal(encodeVault(final.state,final).writes.length,0);
});

test('subtasks inherit ownership, reject cycles and keep independent completion and estimates',()=>{
 const docs=fixture(),note=docs.find(item=>item.path==='Projects/Child.md');
 note.text+='\n- [ ] Parent [sloy_id:: parent] ^parent\n    - [ ] Child [sloy_id:: subtask] ^subtask\n';
 const {state}=decodeVault(docs);
 const parent=state.tasks.find(task=>task.id==='parent'),child=state.tasks.find(task=>task.id==='subtask');
 parent.estimate=5;child.estimate=2;
 assert.throws(()=>setTaskParent(state,parent,'task',child.id),/вне этой ветки/);
 setTaskParent(state,parent,'project','root');
 assert.equal(child.projectId,'root');
 assert.equal(child.areaId,'work');
 const planPeriod=period('week','2026-11-01');
 getPlan(state,planPeriod).selected=[parent.id,child.id];
 assert.equal(comparison(state,planPeriod).hours,2);
 freezePlan(state,planPeriod);
 setTaskStatus(state,parent.id,'done','2026-11-01');
 assert.equal(child.done,false);
 setTaskParent(state,child,'project','root');
 assert.equal(comparison(state,planPeriod).hours,2);
});

test('list order survives vault rewrites that append a restored task to its note',()=>{
 const docs=fixture(),note=docs.find(item=>item.path==='Projects/Child.md');
 note.text+='\n- [ ] First [sloy_id:: first] ^first\n- [ ] Middle [sloy_id:: middle] ^middle\n- [ ] Last [sloy_id:: last] ^last\n';
 let files=docs,decoded=decodeVault(files);
 const save=state=>{
  files=apply(files,encodeVault(state,decoded));
  decoded=decodeVault(files);
 };
 const ids=['first','middle','last'];
 const ordered=()=>decoded.state.tasks.filter(task=>ids.includes(task.id)).sort(compareTaskListOrder).map(task=>task.id);
 const draft=structuredClone(decoded.state),middle=draft.tasks.find(task=>task.id==='middle');
 const lastRank=rememberTaskListOrder(draft,middle),originalRank=middle.listOrder;
 setTaskParent(draft,middle,'task','last');
 middle.listOrder=lastRank;
 save(draft);
 const restored=structuredClone(decoded.state),restoredMiddle=restored.tasks.find(task=>task.id==='middle');
 setTaskParent(restored,restoredMiddle,'project','child');
 restoredMiddle.listOrder=originalRank;
 save(restored);
 assert.deepEqual(ordered(),ids);
 assert.equal(decoded.state.tasks.at(-1).id,'middle');
 const reordered=structuredClone(decoded.state);
 assert.equal(reorderTaskList(reordered,ids,['last'],'first',false),true);
 save(reordered);
 assert.deepEqual(ordered(),['last','first','middle']);
 assert.match(files.find(item=>item.path===note.path).text,/Свободный текст после/);
});

test('moving a nested task directly to an area carries its subtree into the area note',()=>{
 const docs=fixture(),note=docs.find(item=>item.path==='Projects/Child.md');
 note.text+='\n- [ ] Parent [sloy_id:: parent] ^parent\n    - [ ] Branch [sloy_id:: branch] ^branch\n        - [ ] Leaf [sloy_id:: leaf] ^leaf\n';
 const decoded=decodeVault(docs),draft=structuredClone(decoded.state);
 setTaskParent(draft,draft.tasks.find(task=>task.id==='branch'),'area','work');
 const next=decodeVault(apply(docs,encodeVault(draft,decoded))).state;
 const branch=next.tasks.find(task=>task.id==='branch'),leaf=next.tasks.find(task=>task.id==='leaf');
 assert.equal(branch.parentTaskId,undefined);
 assert.equal(branch.projectId,null);
 assert.equal(branch.source,'Areas/Work.md');
 assert.equal(leaf.parentTaskId,'branch');
 assert.equal(leaf.source,branch.source);
 assert.equal(next.tasks.find(task=>task.id==='parent').projectId,'child');
});
