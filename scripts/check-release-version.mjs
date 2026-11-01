import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export function checkReleaseVersion(root,tag){
 const read=path=>readFileSync(resolve(root,path),'utf8');
 const version=JSON.parse(read('src-tauri/tauri.conf.json')).version;
 if(!/^\d+\.\d+\.\d+$/.test(version)||tag!==`v${version}`)throw new Error(`Release tag must be v${version}; got ${tag}`);
 for(const path of ['src-tauri/Cargo.toml','src-tauri/core/Cargo.toml']){
  const actual=read(path).match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  if(actual!==version)throw new Error(`${path}: expected version ${version}, got ${actual}`);
 }
 const archVersion=read('packaging/arch/PKGBUILD').match(/^pkgver=(.+)$/m)?.[1];
 if(archVersion!==version)throw new Error(`PKGBUILD: expected pkgver=${version}, got ${archVersion}`);
 return version;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 console.log(`Release version verified: ${checkReleaseVersion(process.cwd(),process.env.GITHUB_REF_NAME)}`);
}
