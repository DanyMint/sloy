export function registerWindowClose(win,{dirtyModal,flush,toast}){
 let closing=false;
 return win.onCloseRequested(async event=>{
  event.preventDefault();
  if(closing)return;
  closing=true;
  let saved=false;
  try{
   if(dirtyModal())return;
   await flush();
   saved=true;
   await win.destroy();
  }catch(error){toast((saved?'Не удалось закрыть окно: ':'Запись не завершена: ')+String(error));}
  finally{closing=false;}
 });
}
