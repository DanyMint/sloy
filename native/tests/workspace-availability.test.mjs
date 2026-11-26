import {test} from 'node:test';
import assert from 'node:assert/strict';
import {updateWorkspaceAvailability} from '../workspace-availability.js';

test('vault availability pauses editable fields without blocking plan dialogs or Today sections',()=>{
 const main={},habitStrip={},board={},todayTasks={},reflection={},fields=[{},{}];
 for(const section of [board,todayTasks,reflection]){
  section.toggleAttribute=(name,value)=>{
   assert.equal(name,'data-vault-readonly');
   section.readOnly=value;
  };
 }
 const document={
  querySelector(selector){assert.equal(selector,'main');return main;},
  querySelectorAll(selector){
   if(selector.includes('#plan-capacity')){
    assert.ok(!selector.includes('#reflection'));
    assert.ok(!selector.includes('#sleep-'));
    assert.ok(selector.includes('input[name=wellbeing]'));
    return fields;
   }
   if(selector.includes('#planner-view .board'))return [board,todayTasks,reflection];
   assert.ok(!selector.includes('.plan-panel'));
   assert.ok(!selector.includes('#reflection-section'));
   assert.ok(!selector.includes('.today-section'));
   return [habitStrip];
  }
 };
 for(const status of [{busy:false,connected:false},{busy:true,connected:true},{busy:false,connected:true}]){
  for(const page of ['today','planner']){
   const unavailable=status.busy||!status.connected;
   updateWorkspaceAvailability(document,page,status);
   assert.equal(main.inert,false);
   assert.equal(habitStrip.inert,unavailable);
   for(const section of [board,todayTasks,reflection]){
    assert.equal(section.inert,undefined);
    assert.equal(section.readOnly,unavailable);
   }
   assert.ok(fields.every(field=>field.disabled===unavailable));
  }
 }
});
