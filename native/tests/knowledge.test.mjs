import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {emptyState,decodeVault,encodeVault,finalizeKnowledge,parseNote,defaults} from '../codec.js';
import {VaultEngine} from '../engine.js';
import {knowledgeSettingsHTML,knowledgeRulesFromForm,knowledgeStatisticsHTML} from '../knowledge-ui.js';
const types=(quotes=0,reflections=0,thoughts=0,other=0)=>({quotes,reflections,thoughts,other});
test('type changes update an open day even if its total is unchanged, then freeze with the total',()=>{
 const state=emptyState();
 finalizeKnowledge(state,{'2026-10-31':3},'2026-10-31','first',{'2026-10-31':types(1,1,1)});
 finalizeKnowledge(state,{'2026-10-31':3},'2026-10-31','second',{'2026-10-31':types(0,1,2)});
 assert.equal(state.knowledgeFacts['2026-10-31'].updatedAt,'second');
 finalizeKnowledge(state,{'2026-10-31':3},'2026-10-31','third',{'2026-10-31':{thoughts:2,reflections:1}});
 assert.equal(state.knowledgeFacts['2026-10-31'].updatedAt,'second');
 finalizeKnowledge(state,{'2026-10-31':99},'2026-11-01','fourth',{'2026-10-31':types(99)});
 assert.deepEqual(state.knowledgeFacts['2026-10-31'],{count:3,byType:types(0,1,2),closed:true,updatedAt:'fourth'});
 finalizeKnowledge(state,{'2026-10-31':100},'2026-11-02','fifth',{'2026-10-31':types(100)});
 assert.equal(state.knowledgeFacts['2026-10-31'].updatedAt,'fourth');
});
test('legacy closed facts survive, and a first scan can classify historical dates without saved facts',()=>{
 const state=emptyState();state.knowledgeFacts={'2026-10-30':{count:5,closed:true},'2026-10-31':{count:2,closed:false}};
 finalizeKnowledge(state,{'2026-10-29':1,'2026-10-30':20,'2026-10-31':30,'2026-11-01':0,'2026-11-02':10},'2026-11-01','now',{'2026-10-29':types(1),'2026-10-30':types(20),'2026-10-31':types(30)});
 assert.deepEqual(state.knowledgeFacts['2026-10-30'],{count:5,closed:true});
 assert.equal(state.knowledgeFacts['2026-10-31'].count,2);assert.equal(state.knowledgeFacts['2026-10-31'].byType,undefined);
 assert.deepEqual(state.knowledgeFacts['2026-10-29'].byType,types(1));
 assert.deepEqual(state.knowledgeFacts['2026-11-01'].byType,types());assert.equal(state.knowledgeFacts['2026-11-02'],undefined);
});
test('daily, weekly, quarterly and annual journals round trip separate Knowledge statistics',()=>{
 const decoded=decodeVault([]),s=emptyState();
 s.knowledgeFacts={'2026-10-30':{count:3,byType:types(1,1,1),closed:true},'2026-10-31':{count:2,closed:true}};
 for(const key of ['week:2026-10-26','quarter:2026-Q4','year:2026'])s.plans[key]={selected:[],goal:'',capacity:8,snapshot:null,reflection:''};
 const changes=encodeVault(s,decoded),notes=changes.writes.map(w=>({...w,hash:'new'}));
 for(const key of ['week:2026-10-26','quarter:2026-Q4','year:2026']){
  const note=notes.map(parseNote).find(n=>n.meta.period===key);
  assert.equal(note.meta.sloy_statistics.knowledgeCreated,5);
  assert.deepEqual(note.meta.sloy_statistics.knowledgeByType,types(1,1,1,2));
  assert.match(note.body,/Цитаты: 1/);assert.match(note.body,/Переосмысления: 1/);assert.match(note.body,/Мои мысли и идеи: 1/);assert.match(note.body,/Без типа: 2/);
 }
 const next=decodeVault(notes);assert.deepEqual(next.state.knowledgeFacts,s.knowledgeFacts);
 assert.equal(encodeVault(next.state,next).writes.length,0);
});
test('reconciliation passes scan breakdown through persistence and loading',async()=>{
 let docs=[];const engine=new VaultEngine({scan:async()=>({full:true,documents:docs,deletedPaths:[],knowledge:{'2026-11-01':3},knowledgeByType:{'2026-11-01':types(1,0,2)}}),commit:async changes=>{docs=changes.writes.map(w=>({...w,hash:'saved'}));}},{today:()=> '2026-11-01'});
 await engine.reconcile();assert.deepEqual(engine.state.knowledgeFacts['2026-11-01'].byType,types(1,0,2));
});
test('settings support custom folders/property values and statistics show legacy counts as untyped',()=>{
 const form=new Map([['knowledge-quotes-folder',' Custom/Quotes '],['knowledge-quotes-value','Цитата']]);
 assert.deepEqual(knowledgeRulesFromForm(form),{quotes:{folder:'Custom/Quotes',value:'Цитата'},reflections:{folder:'',value:''},thoughts:{folder:'',value:''}});
 assert.match(knowledgeSettingsHTML(defaults),/name="knowledge-quotes-folder" value="Cites"/);
 assert.match(knowledgeSettingsHTML({...defaults,knowledge:'<Knowledge>'}),/&lt;Knowledge&gt;/);
 const html=knowledgeStatisticsHTML({'2026-11-01':{count:5,byType:types(1,1,1)},'2026-11-02':{count:99}},'2026-11-01','2026-11-01');
 assert.match(html,/<strong>5<\/strong>/);assert.match(html,/<strong>2<\/strong><span>Без типа/);assert.doesNotMatch(html,/>99</);
});

test('Knowledge settings are inside folder details and offer two exclusive modes',()=>{
 const runtime=readFileSync(new URL('../runtime.js',import.meta.url),'utf8');
 assert.match(runtime,/<details class="native-folders">[\s\S]*?\$\{knowledgeSettingsHTML\(f\)\}<\/details>/);
 const folders=knowledgeSettingsHTML(defaults),properties=knowledgeSettingsHTML({...defaults,knowledgeMode:'properties'});
 assert.match(folders,/type="radio" name="knowledgeMode" value="folders" checked/);
 assert.match(folders,/data-knowledge-mode-panel="properties" hidden/);
 assert.match(properties,/type="radio" name="knowledgeMode" value="properties" checked/);
 assert.match(properties,/data-knowledge-mode-panel="folders" hidden/);
 assert.doesNotMatch(properties,/data-knowledge-mode-panel="properties" hidden/);
});
