import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeState} from '../dist/domain.js';
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

test('punctuation uses the typed character and guarded key events are ignored',()=>{
 assert.equal(vimKey(key('Slash','?',{shiftKey:true})),'help');
 assert.equal(vimKey(key('Digit7','?',{shiftKey:true})),'help');
 assert.equal(vimKey(key('Backslash','/',{shiftKey:true})),'search');
 assert.equal(vimKey(key('Slash','.')),undefined);
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
 assert.match(list,/data-vim-search/);
 assert.match(list,/data-vim-count role="status"/);
 for(const [command,key] of [['move','m'],['plan','p'],['toggle-done','x'],['subtask','o']]){
  assert.equal(vimMenuKey(command),key);
  assert.match(vimHelpHTML(true),new RegExp('<kbd>'+key+'</kbd>'));
 }
 assert.doesNotMatch(vimHelpHTML(false),/<kbd>g g<\/kbd>/);
});
