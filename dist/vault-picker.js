export function vaultPathForFolder(currentPath,name){
 const path=String(currentPath||'').trim(),folder=String(name||'');
 if(!folder)return path;
 const tail=path.replace(/[\\/]+$/,'').split(/[\\/]/).at(-1);
 return tail===folder?path:folder;
}
export function folderNameFromFiles(files){
 const relative=files?.[0]?.webkitRelativePath;
 return typeof relative==='string'&&relative.includes('/')?relative.split('/')[0]:'';
}

// A browser exposes the folder's name, never an absolute OS path.
// Only selection metadata is used; file contents and handles are not retained.
export function initVaultPicker({button,input,fallback,status,scope=window}){
 let busy=false;
 const message=text=>{status.textContent=text;};
 const apply=name=>{
  if(!name){message('Не удалось определить имя папки. Укажите путь вручную.');return;}
  input.value=vaultPathForFolder(input.value,name);
  message('Выбрана папка «'+name+'». Нажмите «Сохранить».');
  input.focus();
 };
 const openFallback=()=>{
  if(!('webkitdirectory' in fallback)){message('В этом браузере укажите путь к папке вручную.');return;}
  fallback.value='';fallback.click();
 };
 button.addEventListener('click',async()=>{
  if(busy)return;message('');
  if(typeof scope.showDirectoryPicker!=='function'||!scope.isSecureContext){openFallback();return;}
  busy=true;button.disabled=true;
  try{const directory=await scope.showDirectoryPicker({id:'sloy-obsidian-vault',mode:'read'});apply(directory.name);}
  catch(error){
   if(error?.name==='SecurityError'||error?.name==='NotSupportedError')openFallback();
   else if(error?.name!=='AbortError')message('Не удалось выбрать папку. Попробуйте ещё раз или укажите путь вручную.');
  }finally{busy=false;button.disabled=false;}
 });
 fallback.addEventListener('change',()=>{const name=folderNameFromFiles(fallback.files);fallback.value='';apply(name);});
}
