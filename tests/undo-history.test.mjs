import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createUndoHistory} from '../dist/undo-history.js';

test('undo goes back one saved data change at a time and preserves settings',()=>{
 const history=createUndoHistory(),state={projects:[{id:'p'}],tasks:[{id:'a',done:false}],plans:{},vault:'Old'};
 history.rebase(state);
 state.tasks[0].done=true;
 history.record(state);
 state.plans.day={goal:'A'};
 history.record(state);
 state.vault='New';
 state.projectBoards={p:{columns:[]}};
 history.record(state,{track:false});
 let previous=history.peek(state).state;
 assert.deepEqual(previous.plans,{});
 assert.equal(previous.tasks[0].done,true);
 assert.equal(previous.vault,'New');
 history.record(previous,{track:false});
 history.pop();
 previous=history.peek(previous).state;
 assert.equal(previous.tasks[0].done,false);
 assert.deepEqual(previous.projectBoards,state.projectBoards);
 history.pop();
 assert.equal(history.available,false);
});

test('native save refresh retains history while an external replacement clears it',()=>{
 const history=createUndoHistory(),state={projects:[],tasks:[{id:'a'},{id:'b'}]};
 history.rebase(state);
 state.tasks[0].done=true;
 history.record(state);
 const reread={...state,tasks:[...state.tasks].reverse()};
 history.rebase(reread);
 assert.deepEqual(history.peek(reread).state.tasks,[{id:'a'},{id:'b'}]);
 history.rebase(reread,{reset:true});
 assert.equal(history.available,false);
});
