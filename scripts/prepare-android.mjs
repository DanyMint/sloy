import {readFile,writeFile,mkdir} from 'node:fs/promises';import {resolve} from 'node:path';
const root=resolve('src-tauri/gen/android');
const build=root+'/app/build.gradle.kts';let gradle=await readFile(build,'utf8');gradle=gradle.replace(/compileSdk\s*=\s*\d+/,'compileSdk = 36').replace(/targetSdk\s*=\s*\d+/,'targetSdk = 36');await writeFile(build,gradle);
const manifest=root+'/app/src/main/AndroidManifest.xml';let xml=await readFile(manifest,'utf8');if(!xml.includes('android:networkSecurityConfig'))xml=xml.replace('<application','<application android:networkSecurityConfig="@xml/network_security_config"');await writeFile(manifest,xml);
await mkdir(root+'/app/src/main/res/xml',{recursive:true});await writeFile(root+'/app/src/main/res/xml/network_security_config.xml','<?xml version="1.0" encoding="utf-8"?><network-security-config><base-config cleartextTrafficPermitted="false"/><domain-config cleartextTrafficPermitted="true"><domain includeSubdomains="false">127.0.0.1</domain><domain includeSubdomains="false">localhost</domain><domain includeSubdomains="false">::1</domain></domain-config></network-security-config>');
const tasks=root+'/buildSrc/src/main/java/app/sloy/journal/kotlin/BuildTask.kt';
// CLI-generated callback must invoke the installed CLI, not `node tauri`.
let task;try{task=await readFile(tasks,'utf8');}catch{const {readdir}=await import('node:fs/promises');async function find(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=dir+'/'+e.name;if(e.isDirectory()){const f=await find(p);if(f)return f;}else if(e.name==='BuildTask.kt')return p;}}const path=await find(root+'/buildSrc');if(path){task=await readFile(path,'utf8');await fix(path,task);}task=null;}
async function fix(path,text){const cli=resolve('node_modules/@tauri-apps/cli/tauri.js').replace(/\\/g,'/');text=text.replace(/listOf\(\s*"tauri"\s*,/g,'listOf("'+cli+'",').replace(/executable\s*=\s*"[^"]+"/g,'executable = "node"').replace(/args\(\s*"tauri"\s*\)/g,'args("'+cli+'")').replace(/args\(\s*"android"/g,'args("'+cli+'", "android"');await writeFile(path,text);}
if(task)await fix(tasks,task);
console.log('Android: SDK 36, loopback-only HTTP, native CLI callback prepared.');
