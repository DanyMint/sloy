import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cp,mkdtemp,readFile,writeFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

test('native preparation supports CRLF sources and paths with spaces without changing originals',async()=>{
 const source=fileURLToPath(new URL('../',import.meta.url));
 const root=await mkdtemp(join(tmpdir(),'sloy native build '));
 try{
  for(const folder of ['dist','native','scripts'])await cp(join(source,folder),join(root,folder),{recursive:true});
  await cp(join(source,'package.json'),join(root,'package.json'));
  await symlink(join(source,'node_modules'),join(root,'node_modules'),process.platform==='win32'?'junction':'dir');
  const originals=new Map();
  for(const name of ['app.js','domain.js','model.js','wellness.js','index.html']){
   const path=join(root,'dist',name),text=(await readFile(path,'utf8')).replace(/\r?\n/g,'\r\n');
   originals.set(path,text);await writeFile(path,text);
  }
  const result=spawnSync(process.execPath,[join(root,'scripts/build-native.mjs')],{cwd:root,encoding:'utf8',timeout:30000});
  assert.equal(result.status,0,result.stderr||String(result.error));
  const app=await readFile(join(root,'.native-web/app.js'),'utf8');
  assert.ok(app.includes('window.nativeSloy.rendered({page,type,anchor,state})'));
  assert.ok(app.includes('window.nativeSloy.bind('));
  assert.ok(app.includes('state=window.nativeSloy.state;'));
  const domain=await readFile(join(root,'.native-web/domain.js'),'utf8');
  assert.ok(domain.includes("if(status==='done'&&!task.done&&task.nativeRecurrenceRule)"));
  assert.ok((await readFile(join(root,'.native-web/platform.js'),'utf8')).length>0);
  for(const [path,text] of originals)assert.equal(await readFile(path,'utf8'),text);
 }finally{await rm(root,{recursive:true,force:true});}
});
