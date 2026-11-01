"""Create a compact, aligned, debug-signed ARM64 preview APK from Tauri output."""
import os,pathlib,subprocess,tempfile,zipfile,json
root=pathlib.Path(__file__).resolve().parents[1];sdk=pathlib.Path(os.environ['ANDROID_HOME']);ndk=pathlib.Path(os.environ['NDK_HOME']);tools=sdk/'build-tools/36.0.0';java=pathlib.Path(os.environ['JAVA_HOME'])/'bin';env=os.environ.copy();env['PATH']=str(java)+os.pathsep+env['PATH']
apks=list((root/'src-tauri/gen/android/app/build/outputs/apk').rglob('*debug*.apk'))
if not apks:raise SystemExit('No debug APK found. Run npm run android:debug first.')
source=max(apks,key=lambda p:p.stat().st_mtime);version=json.loads((root/'src-tauri/tauri.conf.json').read_text())['version'];output=root/f'release/Sloy-{version}-android-arm64-preview.apk';output.parent.mkdir(exist_ok=True)
with tempfile.TemporaryDirectory() as tmp:
 tmp=pathlib.Path(tmp);rebuilt=tmp/'rebuilt.apk'
 with zipfile.ZipFile(source) as src,zipfile.ZipFile(rebuilt,'w',allowZip64=True) as dest:
  for entry in src.infolist():
   if entry.filename.startswith('META-INF/') and entry.filename.upper().endswith(('.RSA','.SF','.MF','.DSA','.EC')):continue
   data=src.read(entry)
   if entry.filename.startswith('lib/') and entry.filename.endswith('.so'):
    lib=tmp/'native.so';lib.write_bytes(data)
    subprocess.run([str(ndk/'toolchains/llvm/prebuilt/linux-x86_64/bin/llvm-strip'),'--strip-debug',str(lib)],check=True)
    data=lib.read_bytes()
   dest.writestr(entry,data)
 aligned=tmp/'aligned.apk';subprocess.run([str(tools/'zipalign'),'-P','16','-f','4',str(rebuilt),str(aligned)],check=True,env=env)
 key=pathlib.Path.home()/'.android/debug.keystore'
 if not key.exists():
  key.parent.mkdir(exist_ok=True)
  subprocess.run([str(java/'keytool'),'-genkeypair','-keystore',str(key),'-storepass','android','-alias','androiddebugkey','-keypass','android','-keyalg','RSA','-keysize','2048','-validity','10000','-dname','CN=Android Debug,O=Android,C=US'],check=True,env=env)
 subprocess.run([str(tools/'apksigner'),'sign','--ks',str(key),'--ks-key-alias','androiddebugkey','--ks-pass','pass:android','--key-pass','pass:android','--out',str(output),str(aligned)],check=True,env=env)
 subprocess.run([str(tools/'apksigner'),'verify',str(output)],check=True,env=env)
 subprocess.run([str(tools/'zipalign'),'-c','-P','16','4',str(output)],check=True,env=env)
print(f'{output} ({output.stat().st_size/1048576:.1f} MiB)')
