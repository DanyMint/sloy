import {test} from 'node:test';
import assert from 'node:assert/strict';
import {enableTaskSwipe,canSwipeTask,taskSwipeAttrs} from '../dist/task-swipe.js';
import {seedState,validateBackup,clone} from '../dist/model.js';

function fixture(){
 const handlers={},classes=new Set(),style=new Map(),completed=[];
 const row={dataset:{swipeTask:'task'},isConnected:true,classList:{add:(...xs)=>xs.forEach(x=>classes.add(x)),remove:(...xs)=>xs.forEach(x=>classes.delete(x)),toggle:(x,on)=>on?classes.add(x):classes.delete(x)},style:{setProperty:(k,v)=>style.set(k,v),removeProperty:k=>style.delete(k)},getBoundingClientRect:()=>({width:320}),setPointerCapture(){},hasPointerCapture:()=>false};
 const target={closest:s=>s==='[data-swipe-task]'?row:null};
 const root={addEventListener:(name,fn)=>handlers[name]=fn};
 enableTaskSwipe({root,canComplete:()=>true,onComplete:id=>completed.push(id)});
 const send=(name,values={})=>{const e={target,pointerId:1,pointerType:'touch',isPrimary:true,button:0,clientX:80,clientY:100,cancelable:true,detail:1,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...values};handlers[name](e);return e;};
 return {send,completed,classes,style,row,target};
}

test('right touch swipe completes once on release and suppresses the synthetic title click',()=>{
 const f=fixture();f.send('pointerdown');f.send('pointermove',{clientX:180});assert.equal(f.classes.has('swipe-ready'),true);assert.deepEqual(f.completed,[]);
 f.send('pointerup',{clientX:180});assert.deepEqual(f.completed,['task']);assert.equal(f.classes.size,0);assert.equal(f.style.size,0);
 assert.equal(f.send('click').stopped,true);f.send('pointerup');assert.deepEqual(f.completed,['task']);
});
test('vertical scroll, left swipes, short swipes and mouse dragging never complete tasks',()=>{
 for(const move of [{clientX:86,clientY:145},{clientX:30},{clientX:110}]){
  const f=fixture();f.send('pointerdown');f.send('pointermove',move);f.send('pointerup',move);assert.deepEqual(f.completed,[]);
 }
 const f=fixture();f.send('pointerdown',{pointerType:'mouse'});f.send('pointermove',{clientX:200});f.send('pointerup',{clientX:200});assert.deepEqual(f.completed,[]);
});
test('cancellation, another finger, scrolling, removed rows and drifting vertically cancel completion',()=>{
 for(const cancel of ['pointercancel','scroll','visibilitychange','second-finger','removed','drift','release-back']){
  const f=fixture();f.send('pointerdown');f.send('pointermove',{clientX:180});
  if(cancel==='second-finger')f.send('pointerdown',{pointerId:2,isPrimary:false});
  else if(cancel==='removed')f.row.isConnected=false;
  else if(cancel==='drift')f.send('pointermove',{clientX:181,clientY:260});
  else if(cancel!=='release-back')f.send(cancel);
  f.send('pointerup',{clientX:cancel==='release-back'?90:180});assert.deepEqual(f.completed,[],cancel);
 }
});
test('controls, system back edge and unrelated pointers cannot trigger completion; next tap works',()=>{
 for(const start of [{clientX:10},{target:{closest:s=>s==='[data-swipe-task]'?fixture().row:{}}}]){
  const f=fixture();f.send('pointerdown',start);f.send('pointermove',{clientX:180});f.send('pointerup');assert.deepEqual(f.completed,[]);
 }
 const f=fixture();f.send('pointerdown');f.send('pointermove',{pointerId:2,clientX:200});f.send('pointerup');assert.deepEqual(f.completed,[]);
 f.send('pointerdown');f.send('pointermove',{clientX:180});f.send('pointerup');f.send('pointerdown');assert.equal(f.send('click').stopped,undefined);
});
test('swipes exclude completed, cancelled, skipped and archived tasks or projects',()=>{
 const s=seedState(),t=s.tasks.find(t=>!t.done);assert.equal(canSwipeTask(s,t),true);
 for(const flag of ['done','cancelled','skipped','archived'])assert.equal(canSwipeTask(s,{...t,[flag]:true}),false);
 s.projects.find(p=>p.id===t.projectId).archived=true;assert.equal(taskSwipeAttrs(s,t),'');assert.equal(canSwipeTask(s,null),false);
});
test('Obsidian paths round-trip with backups, accept platform paths and migrate old backups',()=>{
 const s=seedState();
 for(const path of ['C:\\Users\\Danil\\Obsidian\\Мой мозг','/home/danil/Obsidian/Мой мозг','/storage/emulated/0/Documents/Vault','']){s.vaultPath=path;assert.equal(validateBackup(clone(s)).vaultPath,path);}
 delete s.vaultPath;assert.equal(validateBackup(s).vaultPath,'');
 for(const invalid of [{},null,12,'x'.repeat(4097)])assert.throws(()=>validateBackup({...s,vaultPath:invalid}),/путь/);
});
