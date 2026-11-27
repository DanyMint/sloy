import {execFileSync} from 'node:child_process';
import {copyFile,cp,mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';

const root=resolve('src-tauri/gen/android');
const cli=resolve('node_modules/@tauri-apps/cli/tauri.js').replace(/\\/g,'/');
const main=join(root,'app/src/main');
const manifest=join(main,'AndroidManifest.xml');
const res=join(main,'res');
let xml=await readFile(manifest,'utf8');
for(const [name,maxSdk] of [['MANAGE_EXTERNAL_STORAGE',null],['READ_EXTERNAL_STORAGE',29],['WRITE_EXTERNAL_STORAGE',29]]){
  if(xml.includes(`android:name="android.permission.${name}"`))continue;
  const max=maxSdk===null?'':` android:maxSdkVersion="${maxSdk}"`;
  xml=xml.replace('<application',`<uses-permission android:name="android.permission.${name}"${max} />\n    <application`);
}
await copyFile('src-tauri/android/DefaultVaultPlugin.kt',join(main,'java/app/sloy/journal/DefaultVaultPlugin.kt'));

// `tauri android init` installs template mipmaps. Generate the branded set in
// a temporary directory because `tauri icon` also writes desktop assets.
const icons=await mkdtemp(join(tmpdir(),'sloy-icons-'));
try {
  execFileSync(process.execPath,[cli,'icon','src-tauri/icons/icon.png','--output',icons],{stdio:'inherit'});
  await cp(join(icons,'android'),res,{recursive:true});
  await copyFile(join(res,'mipmap-anydpi-v26/ic_launcher.xml'),join(res,'mipmap-anydpi-v26/ic_launcher_round.xml'));
  await rm(join(res,'drawable-v24/ic_launcher_foreground.xml'),{force:true});
  await rm(join(res,'drawable/ic_launcher_background.xml'),{force:true});
} finally {
  await rm(icons,{recursive:true,force:true});
}

xml=xml.replace(/<application\b[^>]*>/,application=>{
  const attributes=application.replace(/\s+android:(?:icon|roundIcon)\s*=\s*(?:"[^"]*"|'[^']*')/g,'');
  const network=attributes.includes('android:networkSecurityConfig')?'':'\n        android:networkSecurityConfig="@xml/network_security_config"';
  const legacy=attributes.includes('android:requestLegacyExternalStorage')?'':'\n        android:requestLegacyExternalStorage="true"';
  return attributes.replace('<application','<application\n        android:icon="@mipmap/ic_launcher"\n        android:roundIcon="@mipmap/ic_launcher_round"'+network+legacy);
});
await writeFile(manifest,xml);

const build=root+'/app/build.gradle.kts';let gradle=await readFile(build,'utf8');gradle=gradle.replace(/compileSdk\s*=\s*\d+/,'compileSdk = 36').replace(/targetSdk\s*=\s*\d+/,'targetSdk = 36');await writeFile(build,gradle);
await mkdir(root+'/app/src/main/res/xml',{recursive:true});await writeFile(root+'/app/src/main/res/xml/network_security_config.xml','<?xml version="1.0" encoding="utf-8"?><network-security-config><base-config cleartextTrafficPermitted="false"/><domain-config cleartextTrafficPermitted="true"><domain includeSubdomains="false">127.0.0.1</domain><domain includeSubdomains="false">localhost</domain><domain includeSubdomains="false">::1</domain></domain-config></network-security-config>');
const tasks=root+'/buildSrc/src/main/java/app/sloy/journal/kotlin/BuildTask.kt';
// CLI-generated callback must invoke the installed CLI, not `node tauri`.
let task;try{task=await readFile(tasks,'utf8');}catch{const {readdir}=await import('node:fs/promises');async function find(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=dir+'/'+e.name;if(e.isDirectory()){const f=await find(p);if(f)return f;}else if(e.name==='BuildTask.kt')return p;}}const path=await find(root+'/buildSrc');if(path){task=await readFile(path,'utf8');await fix(path,task);}task=null;}
async function fix(path,text){text=text.replace(/listOf\(\s*"tauri"\s*,/g,'listOf("'+cli+'",').replace(/executable\s*=\s*"[^"]+"/g,'executable = "node"').replace(/args\(\s*"tauri"\s*\)/g,'args("'+cli+'")').replace(/args\(\s*"android"/g,'args("'+cli+'", "android"');await writeFile(path,text);}
if(task)await fix(tasks,task);
console.log('Android: launcher icons, SDK 36, loopback-only HTTP, native CLI callback prepared.');
