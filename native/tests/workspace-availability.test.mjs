import {test} from 'node:test';
import assert from 'node:assert/strict';
import {updateWorkspaceAvailability} from '../workspace-availability.js';

test('Today, planner navigation and task browsing remain available while vault edits are paused',()=>{
 const main={},todayTasks={},planPanel={};
 let sourceReadOnly;
 const source={toggleAttribute(name,value){assert.equal(name,'data-vault-readonly');sourceReadOnly=value;}};
 const document={
  querySelector(selector){
   if(selector==='main')return main;
   assert.equal(selector,'#planner-view .live-panel');
   return source;
  },
  querySelectorAll(selector){
   assert.ok(selector.includes('#today-view > .today-section'));
   assert.ok(selector.includes('#planner-view .plan-panel'));
   assert.ok(!selector.includes('.board'));
   assert.ok(!selector.includes('.live-panel'));
   assert.ok(!selector.includes('planner-calendar'));
   return [todayTasks,planPanel];
  }
 };
 for(const status of [{busy:false,connected:false},{busy:true,connected:true}]){
  updateWorkspaceAvailability(document,'today',status);
  assert.equal(main.inert,false);
  assert.equal(todayTasks.inert,true);
  updateWorkspaceAvailability(document,'planner',status);
  assert.equal(main.inert,false);
  assert.equal(planPanel.inert,true);
  assert.equal(sourceReadOnly,true);
 }
 const ready={busy:false,connected:true};
 updateWorkspaceAvailability(document,'planner',ready);
 assert.equal(main.inert,false);
 updateWorkspaceAvailability(document,'today',ready);
 assert.equal(main.inert,false);
 assert.equal(todayTasks.inert,false);
 assert.equal(planPanel.inert,false);
 assert.equal(sourceReadOnly,false);
});
