import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../dist/theme.js',import.meta.url),'utf8');
function themeUI({saved=null,dark=false,blocked=false}={}){
 const key='kontur-color-theme',storage=new Map(saved===null?[]:[[key,saved]]);
 class Element extends EventTarget{
  attributes=new Map();textContent='';innerHTML='';
  setAttribute(name,value){this.attributes.set(name,value);}
 }
 const nodes=Object.fromEntries(['theme-toggle','theme-label','theme-icon','theme-status'].map(id=>[id,new Element()]));
 const document=new EventTarget(),window=new EventTarget(),system=new EventTarget(),meta={};
 system.matches=dark;window.matchMedia=()=>system;
 document.documentElement={dataset:{},style:{}};
 document.getElementById=id=>nodes[id];document.querySelector=()=>meta;
 const localStorage={getItem:name=>{if(blocked)throw Error('Storage blocked');return storage.get(name)??null;},setItem:(name,value)=>{if(blocked)throw Error('Storage blocked');storage.set(name,value);}};
 runInNewContext(source,{document,window,localStorage});document.dispatchEvent(new Event('DOMContentLoaded'));
 return {nodes,storage,meta,root:document.documentElement,click:()=>nodes['theme-toggle'].dispatchEvent(new Event('click')),systemChange:value=>{system.matches=value;system.dispatchEvent(new Event('change'));},storageChange:value=>{const event=new Event('storage');Object.assign(event,{key,newValue:value});window.dispatchEvent(event);}};
}

test('theme button toggles actual theme, icon and accessible state and persists across reloads',()=>{
 const ui=themeUI({dark:true});
 assert.equal(ui.root.dataset.theme,'dark');assert.equal(ui.nodes['theme-toggle'].attributes.get('aria-pressed'),'true');
 const moon=ui.nodes['theme-icon'].innerHTML;
 ui.click();
 assert.equal(ui.root.dataset.theme,'light');assert.equal(ui.nodes['theme-label'].textContent,'Светлая');
 assert.equal(ui.nodes['theme-toggle'].attributes.get('aria-pressed'),'false');
 assert.equal(ui.nodes['theme-toggle'].title,'Включить тёмную тему');
 assert.notEqual(ui.nodes['theme-icon'].innerHTML,moon);assert.equal(ui.storage.get('kontur-color-theme'),'light');
 assert.equal(ui.nodes['theme-status'].textContent,'Светлая тема');assert.equal(ui.meta.content,'#fcfcfd');
 assert.equal(themeUI({saved:ui.storage.get('kontur-color-theme'),dark:true}).root.dataset.theme,'light');
 ui.click();assert.equal(ui.root.dataset.theme,'dark');assert.equal(ui.nodes['theme-icon'].innerHTML,moon);
 assert.equal(ui.nodes['theme-toggle'].title,'Включить светлую тему');
});
test('legacy system preference follows the OS until the user explicitly toggles',()=>{
 const ui=themeUI({saved:'system'});ui.systemChange(true);assert.equal(ui.root.dataset.theme,'dark');
 ui.click();ui.systemChange(false);ui.systemChange(true);
 assert.equal(ui.root.dataset.theme,'light');assert.equal(ui.root.dataset.themePreference,'light');
 ui.storageChange('dark');assert.equal(ui.root.dataset.theme,'dark');assert.equal(ui.nodes['theme-label'].textContent,'Тёмная');
 ui.storageChange(null);assert.equal(ui.root.dataset.themePreference,'system');ui.systemChange(false);assert.equal(ui.root.dataset.theme,'light');
});
test('theme remains usable when browser storage is blocked or a saved preference is invalid',()=>{
 const ui=themeUI({blocked:true});ui.click();assert.equal(ui.root.dataset.theme,'dark');ui.click();assert.equal(ui.root.dataset.theme,'light');
 assert.equal(themeUI({saved:'invalid',dark:true}).root.dataset.theme,'dark');
});
