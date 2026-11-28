import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeState,projectPathDraft,saveProject} from '../dist/domain.js';
import {workspaceSearchKey,workspaceSearchResults} from '../dist/workspace-search.js';
import {scopeHTML} from '../dist/workspace-v2.js';
import {rangeSelection,recoverActiveId,vimHelpHTML,vimKey,vimMenuKey,vimTaskTargets} from '../dist/vim-navigation.js';

const key=(code,key,extra={})=>({code,key,...extra});

test('physical letter keys work in either layout and only shifted G goes to the end',()=>{
 assert.equal(vimKey(key('KeyJ','о')),'down');
 assert.equal(vimKey(key('KeyK','л')),'up');
 assert.equal(vimKey(key('KeyG','п')),'prefix');
 assert.equal(vimKey(key('KeyG','п'),true),'first');
 assert.equal(vimKey(key('KeyP','з'),true),'projects');
 assert.equal(vimKey(key('KeyP','з')),'plan');
 assert.equal(vimKey(key('KeyG','П',{shiftKey:true})),'last');
 assert.equal(vimKey(key('KeyJ','О',{shiftKey:true})),undefined);
});

test('punctuation and the Normal prefix follow physical codes in every layout',()=>{
 assert.equal(vimKey(key('Slash','?',{shiftKey:true})),'help');
 assert.equal(vimKey(key('Slash',',',{shiftKey:true})),'help');
 assert.equal(vimKey(key('Slash','.')),'search');
 assert.equal(vimKey(key('Digit7','?',{shiftKey:true})),undefined);
 assert.equal(vimKey(key('KeyE','у'),'space'),'explorer');
 assert.equal(vimKey(key('KeyE','у')),undefined);
 assert.equal(vimKey(key('Space',' ')),'select');
 for(const extra of [{isComposing:true},{keyCode:229},{defaultPrevented:true},{ctrlKey:true},{altKey:true},{metaKey:true}]){
  assert.equal(vimKey(key('KeyM','m',extra)),undefined);
 }
});

test('active ID is kept on reorder and recovered next, then previous, when removed',()=>{
 const old=['a','b','c','d'];
 assert.equal(recoverActiveId(old,['d','b','c'],'b'),'b');
 assert.equal(recoverActiveId(old,['a','d'],'b'),'d');
 assert.equal(recoverActiveId(old,['a'],'b'),'a');
 assert.equal(recoverActiveId(old,['new'],'b'),'new');
 assert.equal(recoverActiveId(old,[],'b'),undefined);
});

test('range contracts toward its anchor in visible order and preserves outside choices',()=>{
 const order=['a','b','c','e'],base=new Set(['outside','a']);
 assert.deepEqual([...rangeSelection(order,'b','e',base)],['outside','a','b','c','e']);
 assert.deepEqual([...rangeSelection(order,'b','c',base)],['outside','a','b','c']);
 assert.deepEqual([...rangeSelection(order,'b','a',base)],['outside','a','b']);
 assert.deepEqual([...base],['outside','a']);
});

test('Vim group commands retain selection outside the cursor and row commands ignore it',()=>{
 const selection=new Set(['first','third','fifth']);
 for(const command of ['move','plan','complete']){
  assert.deepEqual(vimTaskTargets(command,'sixth',selection),{ids:['first','third','fifth'],usesSelection:true});
  assert.deepEqual(vimTaskTargets(command,'sixth',new Set()),{ids:['sixth'],usesSelection:false});
 }
 for(const command of ['open','subtask']){
  assert.deepEqual(vimTaskTargets(command,'sixth',selection),{ids:['sixth'],usesSelection:false});
 }
 assert.deepEqual(vimTaskTargets('complete','sixth',new Set(['first'])),{ids:['first'],usesSelection:true});
});

test('only opt-in lists have a search and selection status and menu hints use the same bindings',()=>{
 const state=normalizeState({version:1,areas:[],projects:[{id:'test',name:'Test',description:''}],tasks:[],plans:{}});
 const context={page:'projects',entityId:'test'};
 assert.doesNotMatch(scopeHTML(state,context),/data-vim-list/);
 assert.doesNotMatch(scopeHTML(state,{...context,vim:true,layout:'kanban'}),/data-vim-list/);
 const list=scopeHTML(state,{...context,vim:true});
 assert.match(list,/data-vim-list/);
 assert.doesNotMatch(list,/type="search"/);
 assert.match(list,/data-vim-count role="status"/);
 for(const [command,key] of [['move','m'],['plan','p'],['toggle-done','x'],['subtask','o']]){
  assert.equal(vimMenuKey(command),key);
  assert.match(vimHelpHTML(true),new RegExp('<kbd>'+key+'</kbd>'));
 }
 assert.match(vimHelpHTML(),/<kbd>Space e<\/kbd>/);
 assert.match(vimHelpHTML(),/Дерево проектов/);
});

test('a project path resolves an existing root within the selected area',()=>{
 const state=normalizeState({version:1,areas:[{id:'work',name:'Work',description:''}],projects:[],tasks:[],plans:{}});
 const draft=projectPathDraft(state,' Parent / Child ','work');
 assert.deepEqual(draft,{parent:undefined,parentName:'Parent',childName:'Child'});
 const parent=saveProject(state,{name:draft.parentName,areaId:'work'});
 assert.equal(projectPathDraft(state,'parent/Child','work').parent,parent);
 assert.throws(()=>projectPathDraft(state,'parent/Child',null),/другой зоне/);
 saveProject(state,{name:draft.childName,parentId:parent.id});
 assert.throws(()=>projectPathDraft(state,'Parent/child','work'),/уже существует/);
 assert.throws(()=>projectPathDraft(state,'Parent/Child/Nested','work'),/двух названий/);
});


test('workspace search finds projects, areas and tasks by title or hierarchy',()=>{
 const state=normalizeState({version:1,areas:[{id:'zone',name:'Дизайн'}],projects:[
  {id:'root',name:'Редизайн',areaId:'zone'},{id:'child',name:'Панели',parentId:'root',areaId:'zone'}
 ],tasks:[{id:'item',title:'Окно поиска',projectId:'child'}],plans:{}});
 assert.deepEqual(workspaceSearchResults(state,'ДИЗАЙН').map(item=>item.id).sort(),['child','item','root','zone']);
 assert.deepEqual(workspaceSearchResults(state,'окно панели').map(item=>item.id),['item']);
 assert.equal(workspaceSearchResults(state,'панели')[0].kind,'project');
});


test('search result shortcuts use physical keys only after leaving the query',()=>{
 for(const [code,value,action] of [['KeyJ','о','down'],['KeyK','л','up'],['KeyL','д','open'],['Slash','.','edit']]){
  assert.equal(workspaceSearchKey(key(code,value),true),action);
  assert.equal(workspaceSearchKey(key(code,value),false),undefined);
  assert.equal(workspaceSearchKey(key(code,value,{isComposing:true}),true),undefined);
 }
 assert.equal(workspaceSearchKey(key('ArrowDown','ArrowDown'),false),'down');
 assert.equal(workspaceSearchKey(key('Enter','Enter'),false),'open');
 assert.equal(workspaceSearchKey(key('Escape','Escape'),true),'close');
});
