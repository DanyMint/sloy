import {test} from 'node:test';
import assert from 'node:assert/strict';
import {updateWorkspaceAvailability} from '../workspace-availability.js';

test('Today can open the day journal while the vault is unavailable',()=>{
 const main={},sections=[{},{}];
 const document={
  querySelector(selector){assert.equal(selector,'main');return main;},
  querySelectorAll(selector){
   assert.equal(selector,'#today-view > .today-habit-strip,#today-view > .today-section');
   return sections;
  }
 };
 for(const status of [{busy:false,connected:false},{busy:true,connected:true}]){
  updateWorkspaceAvailability(document,'today',status);
  assert.equal(main.inert,false);
  assert.ok(sections.every(section=>section.inert));
  updateWorkspaceAvailability(document,'planner',status);
  assert.equal(main.inert,true);
 }
 const ready={busy:false,connected:true};
 updateWorkspaceAvailability(document,'planner',ready);
 assert.equal(main.inert,false);
 updateWorkspaceAvailability(document,'today',ready);
 assert.equal(main.inert,false);
 assert.ok(sections.every(section=>!section.inert));
});
