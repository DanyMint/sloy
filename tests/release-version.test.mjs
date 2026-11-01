import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {checkReleaseVersion} from '../scripts/check-release-version.mjs';

test('release tag must match all application package versions',()=>{
 const root=mkdtempSync(join(tmpdir(),'sloy-release-'));
 const write=(path,text)=>{mkdirSync(dirname(join(root,path)),{recursive:true});writeFileSync(join(root,path),text);};
 try{
  write('src-tauri/tauri.conf.json',JSON.stringify({version:'1.2.3'}));
  write('src-tauri/Cargo.toml','[package]\nversion = "1.2.3"\n');
  write('src-tauri/core/Cargo.toml','[package]\nversion = "1.2.3"\n');
  write('packaging/arch/PKGBUILD','pkgver=1.2.3\n');
  assert.equal(checkReleaseVersion(root,'v1.2.3'),'1.2.3');
  for(const tag of ['v1.2.4','1.2.3','main',undefined])assert.throws(()=>checkReleaseVersion(root,tag),/Release tag/);
  for(const path of ['src-tauri/Cargo.toml','src-tauri/core/Cargo.toml']){
   write(path,'[package]\nversion = "1.2.2"\n');
   assert.throws(()=>checkReleaseVersion(root,'v1.2.3'),/expected version/);
   write(path,'[package]\nversion = "1.2.3"\n');
  }
  write('packaging/arch/PKGBUILD','pkgver=1.2.2\n');
  assert.throws(()=>checkReleaseVersion(root,'v1.2.3'),/PKGBUILD/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
