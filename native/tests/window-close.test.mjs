import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {registerWindowClose} from '../window-close.js';

const capability=JSON.parse(await readFile(new URL('../../src-tauri/capabilities/main.json',import.meta.url),'utf8'));
function setup({dirtyModal=()=>false,flush=async()=>{},destroy=async()=>{}}={}){
 let handler;
 const messages=[],events=[];
 const win={
  onCloseRequested:callback=>{handler=callback;},
  destroy:async()=>{
   events.push('destroy');
   if(!capability.permissions.includes('core:window:allow-destroy'))throw new Error('window.destroy not allowed');
   await destroy();
  },
  close:()=>{throw new Error('Closing must not emit another close request');}
 };
 registerWindowClose(win,{dirtyModal,flush:async()=>{events.push('flush');await flush();},toast:message=>messages.push(message)});
 return {messages,events,request:async()=>{
  let prevented=false;
  await handler({preventDefault(){prevented=true;}});
  // Tauri's onCloseRequested wrapper destroys the window unless prevented.
  if(!prevented)await win.destroy();
  return prevented;
 }};
}

test('main window closes after saving with its configured Tauri permissions',async()=>{
 assert.ok(capability.windows.includes('main'));
 const app=setup();
 assert.equal(await app.request(),true);
 assert.deepEqual(app.events,['flush','destroy']);
 assert.deepEqual(app.messages,[]);
});

test('window stays open while writes finish and repeated requests cannot bypass saving',async()=>{
 let saved;
 const app=setup({flush:()=>new Promise(resolve=>{saved=resolve;})});
 const request=app.request();
 assert.deepEqual(app.events,['flush']);
 assert.equal(await app.request(),true);
 assert.deepEqual(app.events,['flush']);
 saved();await request;
 assert.deepEqual(app.events,['flush','destroy']);
 assert.deepEqual(app.messages,[]);
});

test('an unfinished modal blocks closing and allows a later attempt',async()=>{
 let dirty=true;
 const app=setup({dirtyModal:()=>dirty});
 assert.equal(await app.request(),true);
 assert.deepEqual(app.events,[]);
 dirty=false;
 assert.equal(await app.request(),true);
 assert.deepEqual(app.events,['flush','destroy']);
 assert.deepEqual(app.messages,[]);
});

test('save errors block closing and allow another attempt',async()=>{
 let failed=true;
 const app=setup({flush:async()=>{if(failed)throw new Error('disk full');}});
 assert.equal(await app.request(),true);
 assert.deepEqual(app.events,['flush']);
 assert.deepEqual(app.messages,['Запись не завершена: Error: disk full']);
 failed=false;
 assert.equal(await app.request(),true);
 assert.deepEqual(app.events,['flush','flush','destroy']);
});

test('destroy errors have a separate message and retries still save first',async()=>{
 let failed=true;
 const app=setup({destroy:async()=>{if(failed)throw new Error('window.destroy not allowed');}});
 assert.equal(await app.request(),true);
 assert.deepEqual(app.events,['flush','destroy']);
 assert.deepEqual(app.messages,['Не удалось закрыть окно: Error: window.destroy not allowed']);
 failed=false;
 assert.equal(await app.request(),true);
 assert.deepEqual(app.events,['flush','destroy','flush','destroy']);
});

test('repeated requests while destruction is pending do not trigger another destroy',async()=>{
 let destroyed;
 const app=setup({destroy:()=>new Promise(resolve=>{destroyed=resolve;})});
 const request=app.request();
 await Promise.resolve();await Promise.resolve();
 assert.deepEqual(app.events,['flush','destroy']);
 assert.equal(await app.request(),true);
 assert.deepEqual(app.events,['flush','destroy']);
 destroyed();await request;
 assert.deepEqual(app.messages,[]);
});
