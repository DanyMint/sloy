import {test} from 'node:test';
import assert from 'node:assert/strict';
import {vaultPathForFolder,folderNameFromFiles,initVaultPicker} from '../dist/vault-picker.js';
import {saveHabit,setHabitValue} from '../dist/wellness.js';
import {seedState,clone,validateBackup,today} from '../dist/model.js';
import {habitForm,habitsHTML} from '../dist/wellness-pages.js';
import {habitWeekHTML,todayHabitStripHTML} from '../dist/workspace-v2.js';

function picker(scope){
 const element=extra=>({listeners:{},addEventListener(name,fn){this.listeners[name]=fn;},...extra});
 const button=element({disabled:false}),input={value:'/home/danil/OldVault',focus(){}},fallback=element({webkitdirectory:true,value:'',files:[],click(){this.opened=(this.opened||0)+1;}}),status={textContent:''};
 initVaultPicker({button,input,fallback,status,scope});return {button,input,fallback,status,open:()=>button.listeners.click()};
}
test('native directory picker uses read access, updates selection without reading files and keeps a matching manual path',async()=>{
 let requested;const p=picker({isSecureContext:true,showDirectoryPicker:async options=>{requested=options;return {name:'Мой мозг',entries(){throw new Error('Must not read files');}};}});
 await p.open();assert.equal(requested.mode,'read');assert.equal(p.input.value,'Мой мозг');assert.match(p.status.textContent,/Выбрана папка «Мой мозг»/);assert.equal(p.button.disabled,false);
 p.input.value='C:\\Users\\Danil\\Мой мозг';await p.open();assert.equal(p.input.value,'C:\\Users\\Danil\\Мой мозг');
 assert.equal(vaultPathForFolder('/home/d/Мой мозг/','Мой мозг'),'/home/d/Мой мозг/');
});
test('cancelling or rejecting a directory picker keeps the path and does not leave Browse disabled',async()=>{
 for(const name of ['AbortError','NotAllowedError']){const p=picker({isSecureContext:true,showDirectoryPicker:async()=>{throw {name};}});await p.open();assert.equal(p.input.value,'/home/danil/OldVault');assert.equal(p.button.disabled,false);assert.equal(p.fallback.opened,undefined);if(name==='AbortError')assert.equal(p.status.textContent,'');}
});
test('unsupported and blocked native APIs fall back to a folder chooser, using only relative selection metadata',async()=>{
 for(const scope of [{isSecureContext:false},{isSecureContext:true},{isSecureContext:true,showDirectoryPicker:async()=>{throw {name:'SecurityError'};}}]){
  const p=picker(scope);await p.open();assert.equal(p.fallback.opened,1);assert.equal(p.input.value,'/home/danil/OldVault');
  p.fallback.files=[{webkitRelativePath:'MyVault/Notes/Inbox.md',text(){throw new Error('Must not read');}}];p.fallback.listeners.change();assert.equal(p.input.value,'MyVault');assert.equal(p.fallback.value,'');
 }
 assert.equal(folderNameFromFiles([]),'');assert.equal(folderNameFromFiles([{name:'Inbox.md'}]),'');
});
test('rapid double clicks open only one native picker and unavailable folder selection keeps manual input usable',async()=>{
 let finish,calls=0;const p=picker({isSecureContext:true,showDirectoryPicker:()=>{calls++;return new Promise(resolve=>finish=resolve);}}),pending=p.open();await p.open();assert.equal(calls,1);finish({name:'Vault'});await pending;
 const unsupported=picker({});delete unsupported.fallback.webkitdirectory;await unsupported.open();assert.match(unsupported.status.textContent,/вручную/);assert.equal(unsupported.input.value,'/home/danil/OldVault');
});
test('habit icons persist through edits, archival and backup without changing recorded values',()=>{
 const s=seedState(),day=today(),h=saveHabit(s,{name:'Вода',unit:'мл',step:250,target:2000,icon:'water'},day);setHabitValue(s,h.id,day,500);const entries=clone(s.habitEntries);
 saveHabit(s,{...h,icon:'book'},day);saveHabit(s,{id:h.id,name:h.name,unit:h.unit,step:h.step,target:h.target},day);assert.equal(h.icon,'book');assert.deepEqual(s.habitEntries,entries);
 h.archivedOn=day;assert.equal(validateBackup(clone(s)).habits.find(x=>x.id===h.id).icon,'book');saveHabit(s,{...h,icon:''},day);assert.equal(h.icon,'');assert.deepEqual(s.habitEntries,entries);
 const old=clone(s);delete old.habits[0].icon;assert.doesNotThrow(()=>validateBackup(old));
});
test('unsupported icon IDs and markup cannot be stored or restored',()=>{
 const s=seedState(),day=today(),h=saveHabit(s,{name:'Читать',unit:'мин',step:10,target:30},day),before=clone(s);
 for(const icon of ['<svg onload=alert(1)>','unknown',null,42]){assert.throws(()=>saveHabit(s,{...h,icon},day));assert.deepEqual(s,before);const bad=clone(s);bad.habits[0].icon=icon;assert.throws(()=>validateBackup(bad));}
});
test('the same selected icon is visible in the habit editor, active/archive week table, cards and Today',()=>{
 const s=seedState(),day=today(),h=saveHabit(s,{name:'Вода',unit:'мл',step:250,target:2000,icon:'water'},day);
 assert.match(habitForm(h),/name="habit-icon" value="water"[^>]*checked/);
 const waterPath='M12 2C10 6 4 11 4 15';
 for(const html of [habitWeekHTML(s,day),todayHabitStripHTML(s,day),habitsHTML(s,day)])assert.ok(html.includes(waterPath));
 h.archivedOn=day;assert.ok(habitWeekHTML(s,day,{archiveOpen:true}).includes(waterPath));assert.ok(!todayHabitStripHTML(s,day).includes(waterPath));
});
