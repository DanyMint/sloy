import {VaultEngine} from './engine.js';
import {defaults} from './codec.js';
import {knowledgeSettingsHTML,updateKnowledgeMode,knowledgeRulesFromForm,knowledgeStatisticsHTML} from './knowledge-ui.js';
import {registerWindowClose} from './window-close.js';
import {updateWorkspaceAvailability} from './workspace-availability.js';
const invoke=(name,args={})=>window.__TAURI__.core.invoke(name,args),$=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let selectedVault=null,lastSyncAt=null,syncStatus='',settingsTab='general',settings,binding,engine,busy=false,connected=false,status='Настройте хранилище',lastContext,lastReport,synced=false;
const date=()=>new Intl.DateTimeFormat('en-CA',{timeZone:settings?.folders.timezone||'Asia/Aqtobe',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const dayEdits=new Map();
const editingDayField=()=>document.activeElement?.matches('#reflection')||!!$('#sleep-editor:not([hidden])');
function editDayField(key,update){
 const state=binding.get();
 update(state);
 if(connected&&!busy){engine.save(state);binding.record();return;}
 if(!connected&&!dayEdits.size)binding.toast('Черновик доступен до закрытия приложения. Подключите хранилище, чтобы сохранить.');
 dayEdits.set(key,update);
}
function applyDayEdits(state){
 for(const [key,update] of dayEdits){
  try{update(state);}catch(error){dayEdits.delete(key);binding?.toast(error.message);}
 }
}
function saveDayEdits(){
 if(!connected||!dayEdits.size)return;
 const state=binding.get();
 applyDayEdits(state);
 if(!dayEdits.size)return;
 engine.save(state);
 dayEdits.clear();
}
const native={editDayField,get canWrite(){return connected&&!busy;},get state(){return engine.state;},get settings(){return settings;},save:state=>{if(!connected){binding?.toast('Сначала подключите хранилище');return false;}engine.save(state);return true;},bind:value=>binding=value,rendered:context=>{lastContext=context;decorate();}};window.nativeSloy=native;
function paint(){
 document.querySelectorAll('#native-vault-form button,#native-sync-form button,[data-native-rebuild],[data-native-recovery]').forEach(b=>b.disabled=busy);
 document.querySelectorAll('[data-native-sync]').forEach(b=>{b.disabled=busy||!connected;b.setAttribute('aria-label',synced?'Синхронизировано':'Синхронизировать');const icon=b.querySelector('.nav-symbol');if(icon&&b.dataset.synced!==String(synced)){icon.innerHTML=synced?syncDoneIcon:syncIcon;b.dataset.synced=String(synced);}});
 const syncButton=$('[data-native-sync-now]');
 if(syncButton)syncButton.disabled=busy||!connected||!settings.syncthing.enabled;
 const syncReport=$('[data-native-sync-status]');
 if(syncReport)syncReport.textContent=syncStatus||(!settings.syncthing.enabled?'Синхронизация выключена':!connected?'Сначала подключите хранилище':lastSyncAt?'Последняя синхронизация · '+lastSyncAt.toLocaleString('ru-RU',{dateStyle:'short',timeStyle:'short'}):'Синхронизация ещё не завершалась в этом сеансе');
 const popup=$('#native-sync-popup');if(popup)popup.textContent=(synced?'Синхронизировано · ':'')+status+'\nСохранить, синхронизировать и сверить · Ctrl+S';
 const connection=$('[data-native-connection]');if(connection){connection.textContent=connected?'Подключено':'Не подключено';connection.dataset.connected=String(connected);}
 const report=$('[data-native-report]');if(report){report.hidden=!lastReport;if(lastReport)report.innerHTML=`<h3>Последняя сверка</h3><p>Проверено файлов: ${lastReport.filesChecked} · прочитано: ${lastReport.filesRead} · без даты: ${lastReport.unknownDates}</p>${(lastReport.conflicts||[]).map(path=>`<p>Конфликт Syncthing: ${esc(path)}</p>`).join('')}`;}
}
const syncIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M20 7a8 8 0 0 0-14-2L3 8m0-6v6h6M4 17a8 8 0 0 0 14 2l3-3m0 6v-6h-6"/></svg>';
const syncDoneIcon=syncIcon.replace('</svg>','<path d="m9 12 2 2 4-4"/></svg>');
let popupButton;
function hideSyncPopup(){const popup=$('#native-sync-popup');if(popup)popup.hidden=true;popupButton=null;}
function showSyncPopup(button){const popup=$('#native-sync-popup');if(!popup)return;popupButton=button;popup.hidden=false;const rect=button.getBoundingClientRect();const width=popup.offsetWidth,height=popup.offsetHeight;popup.style.left=Math.max(8,Math.min(rect.right+10,window.innerWidth-width-8))+'px';popup.style.top=Math.max(8,Math.min(rect.top,window.innerHeight-height-8))+'px';}
document.addEventListener('pointerover',e=>{const button=e.target.closest('.native-sync');if(button)showSyncPopup(button);});
document.addEventListener('pointerout',e=>{if(popupButton&&!popupButton.contains(e.relatedTarget))hideSyncPopup();});
document.addEventListener('focusin',e=>{if(e.target.matches('.native-sync'))showSyncPopup(e.target);});
document.addEventListener('focusout',hideSyncPopup);
document.addEventListener('keydown',e=>{if(e.key==='Escape')hideSyncPopup();});
window.addEventListener('resize',hideSyncPopup);document.addEventListener('scroll',hideSyncPopup,true);
function installButtons(){if(!$('#native-sync-popup'))document.body.insertAdjacentHTML('beforeend','<div id="native-sync-popup" role="tooltip" hidden></div>');for(const [selector,cls] of [['.sidebar-system','nav-button'],['.mobile-menu-settings','mobile-menu-link']]){const parent=$(selector);if(parent&&!parent.querySelector('[data-native-sync]'))parent.insertAdjacentHTML('afterbegin',`<button class="${cls} native-sync" data-native-sync aria-describedby="native-sync-popup"><span class="nav-symbol">${syncIcon}</span><span class="nav-text">Синхронизировать</span></button>`);}}
function fields(){const f=settings.folders,s=settings.syncthing;return `<form id="native-vault-form">
<section class="settings-section" aria-labelledby="native-storage-title"><header class="settings-section-heading"><h2 id="native-storage-title">Хранилище Obsidian</h2><span class="settings-connection" data-native-connection></span></header>
<label class="form-label" for="native-vault">Папка хранилища</label><div class="vault-path-row"><input id="native-vault" class="field" name="vaultPath" value="${esc(settings.vaultPath)}" placeholder="Выберите папку хранилища" spellcheck="false" autocapitalize="off" autocomplete="off" aria-describedby="native-vault-help" required><button type="button" class="secondary-button" data-native-browse>Обзор</button></div><p class="form-note" id="native-vault-help">Выберите папку с заметками. Изменения будут сохраняться в ней как Markdown-файлы.</p>
<details class="native-folders"><summary>Папки и даты</summary><p class="form-note">Пути внутри хранилища и правила чтения заметок.</p><div class="native-grid">${Object.entries({areas:'Зоны',projects:'Проекты',habits:'Определения привычек',habitRecords:'Записи привычек',journals:'Journal',createdProperty:'Свойство даты создания',timezone:'Часовой пояс'}).map(([k,l])=>`<label>${l}<input class="field" name="${k}" value="${esc(f[k])}" required></label>`).join('')}</div>${knowledgeSettingsHTML(f)}</details><div class="native-settings-actions"><button class="primary-button" type="submit">Сохранить и подключить</button><p class="form-note" data-native-vault-status role="status"></p></div></section></form>
<section class="settings-section" aria-labelledby="native-sync-title"><form id="native-sync-form"><div class="settings-row"><div class="settings-row-copy"><h2 id="native-sync-title">Syncthing</h2><p id="native-sync-help">Дождаться обмена с другими устройствами перед чтением хранилища.</p></div><label class="settings-switch"><input type="checkbox" name="syncEnabled" aria-labelledby="native-sync-title" aria-describedby="native-sync-help" aria-controls="native-sync-options" ${s.enabled?'checked':''}><span class="settings-switch-track" aria-hidden="true"></span></label></div>
<div id="native-sync-options" ${s.enabled?'':'hidden'}><p class="form-note">Syncthing должен синхронизировать ту же папку хранилища.</p><div class="native-grid"><label>Адрес Syncthing<input class="field" name="syncUrl" value="${esc(s.url||'http://127.0.0.1:8384')}" placeholder="http://127.0.0.1:8384" spellcheck="false" autocapitalize="off"></label><label>Идентификатор папки (Folder ID)<input class="field" name="folderId" value="${esc(s.folderId)}" spellcheck="false" autocapitalize="off"></label><label>Ключ API<input class="field" name="apiKey" type="password" autocomplete="off" placeholder="${settings.apiKeyConfigured?'Настроен · оставьте пустым, чтобы сохранить':'Из настроек Syncthing'}"></label><label>Ожидание, секунд<input class="field" type="number" min="5" max="300" name="timeout" value="${s.timeoutSeconds||60}"></label></div>
<details class="settings-details"><summary>Сертификат HTTPS</summary><div class="settings-details-body"><label class="form-label" for="native-trusted-pem">Сертификат Syncthing в формате PEM</label><textarea id="native-trusted-pem" class="field" name="trustedPem" rows="4" spellcheck="false" placeholder="-----BEGIN CERTIFICATE-----">${esc(s.trustedPem)}</textarea></div></details></div>
<div class="native-settings-actions"><button class="secondary-button" type="submit">Сохранить настройки Syncthing</button><p class="form-note" data-native-sync-save-status role="status"></p></div></form>
<div class="native-sync-actions"><p class="form-note" data-native-sync-status role="status"></p><button class="primary-button" type="button" data-native-sync-now>Синхронизировать сейчас</button></div></section>
<section class="settings-section settings-service"><details class="settings-details"><summary>Обслуживание хранилища</summary><div class="settings-details-body"><div class="settings-row"><div class="settings-row-copy"><h3>Индекс хранилища</h3><p>Заново прочитать файлы и обновить данные в Sloy.</p></div><button class="secondary-button" type="button" data-native-rebuild>Перестроить индекс</button></div><div class="settings-row"><div class="settings-row-copy"><h3>Несохранённые изменения</h3><p>Локальные копии для восстановления после ошибки записи.</p></div><button class="secondary-button" type="button" data-native-recovery>Посмотреть копии</button></div><div class="settings-report" data-native-report hidden></div></div></details></section>`;}
function updateSyncSettings(form){
 const options=form.querySelector('#native-sync-options'),enabled=form.elements.syncEnabled.checked;
 options.hidden=!enabled;
 options.querySelectorAll('input,textarea').forEach(field=>field.disabled=!enabled);
}
function showSettingsTab(tab){
 settingsTab=tab;
 $('#native-general-settings').hidden=tab!=='general';
 $('#native-settings').hidden=tab!=='storage';
 document.querySelectorAll('[data-native-settings-tab]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.nativeSettingsTab===tab)));
}
function installSettingsTabs(){
 if($('#native-settings'))return;
 const view=$('#settings-view'),heading=view.querySelector('.settings-heading');
 heading.insertAdjacentHTML('afterend','<nav class="native-settings-tabs" aria-label="Разделы настроек"><button type="button" data-native-settings-tab="general">Общие</button><button type="button" data-native-settings-tab="storage">Хранилище и синхронизация</button></nav>');
 const general=document.createElement('div'),storage=document.createElement('div');
 general.id='native-general-settings';
 storage.id='native-settings';
 for(const section of view.querySelectorAll(':scope > .settings-section'))general.append(section);
 storage.innerHTML=fields();
 view.append(general,storage);
 updateSyncSettings($('#native-sync-form'));
 showSettingsTab(connected?settingsTab:'storage');
}
function decorate(){updateWorkspaceAvailability(document,lastContext?.page,{busy,connected});installButtons();const original=$('#obsidian-settings-form');if(original)original.closest('section').hidden=true;if(lastContext?.page==='settings')installSettingsTabs();$('#native-period-statistics')?.remove();if(lastContext?.page==='planner'){const {type,anchor,state}=lastContext;const y=anchor.slice(0,4),m=+anchor.slice(5,7),start=type==='year'?y+'-01-01':type==='quarter'?y+'-'+String(Math.floor((m-1)/3)*3+1).padStart(2,'0')+'-01':type==='week'?new Date(Date.parse(anchor+'T12:00:00Z')-((new Date(anchor+'T12:00:00Z').getUTCDay()+6)%7)*86400000).toISOString().slice(0,10):anchor;const end=type==='year'?y+'-12-31':type==='quarter'?new Date(Date.UTC(+y,Math.floor((m-1)/3)*3+3,0,12)).toISOString().slice(0,10):type==='week'?new Date(Date.parse(start+'T12:00:00Z')+6*86400000).toISOString().slice(0,10):anchor;$('#planner-view').insertAdjacentHTML('beforeend',knowledgeStatisticsHTML(state.knowledgeFacts,start,end));}paint();}
async function recovery(){const rows=await invoke('vault_recovery');const modal=$('#modal');$('#modal-content').innerHTML='<h2>Несохранённые изменения</h2><p>Эти копии хранятся локально вне Obsidian. Перед повторной попыткой сравните их с файлами хранилища.</p>'+rows.map(r=>`<details><summary>${esc(r.name)}</summary><textarea class="field" rows="7" readonly>${esc(r.text)}</textarea></details>`).join('')+(!rows.length?'<p>Сохранённых копий нет.</p>':'')+'<div class="native-actions"><button type="button" class="secondary-button" data-native-retry>Повторить запись</button><button type="button" class="secondary-button" data-native-reload>Перечитать хранилище, сохранив копии</button></div>';if(!modal.open)modal.showModal();}
async function check({force=false,rebuild=false}={}){if(busy||!settings.vaultPath)return;busy=true;updateWorkspaceAvailability(document,lastContext?.page,{busy,connected});paint();try{if(force)syncStatus=settings.syncthing.enabled?'Синхронизация и сверка…':'';paint();await engine.reconcile({force,rebuild});connected=true;}catch(e){status=String(e.message||e);if(force&&settings.syncthing.enabled)syncStatus=status;binding?.toast(status);}finally{busy=false;saveDayEdits();decorate();}}
async function openVault(nextSettings,{force=true}={}){
 settings=await invoke('settings_save',{settings:nextSettings});
 connected=false;
 engine.settings={...settings.folders,vaultPath:settings.vaultPath,vaultName:settings.vaultPath.split(/[\\/]/).pop()};
 engine.requiresFull=true;
 engine.documents.clear();
 await engine.reconcile({force});
 connected=true;
 status='Хранилище подключено';
}
async function saveSettingsForm(form){
 if(busy)return;
 const vault=form.id==='native-vault-form';
 const message=form.querySelector(vault?'[data-native-vault-status]':'[data-native-sync-save-status]');
 busy=true;paint();message.textContent='Сохранение…';
 try{
  const v=new FormData(form);
  if(vault){
   await engine.flush();
   const folders={...defaults};
   for(const key of Object.keys(folders))if(typeof defaults[key]==='string')folders[key]=String(v.get(key)||'').trim();
   folders.knowledgeTypes=knowledgeRulesFromForm(v);
   new Intl.DateTimeFormat('en',{timeZone:folders.timezone}).format(new Date());
   const vaultPath=String(v.get('vaultPath')).trim();
   const androidTreeUri=selectedVault?.path===vaultPath?selectedVault.androidTreeUri??null:vaultPath===settings.vaultPath?settings.androidTreeUri:null;
   await openVault({...settings,vaultPath,androidTreeUri,folders},{force:false});
   synced=false;syncStatus='';lastSyncAt=null;
   selectedVault=null;
   message.textContent='Хранилище подключено';
  }else{
   const inputs=form.elements;
   const syncthing={enabled:inputs.syncEnabled.checked,url:inputs.syncUrl.value.trim(),folderId:inputs.folderId.value.trim(),apiKey:inputs.apiKey.value,timeoutSeconds:Number(inputs.timeout.value||60),trustedPem:inputs.trustedPem.value};
   settings=await invoke('settings_save',{settings:{...settings,syncthing}});
   inputs.apiKey.value='';
   inputs.apiKey.placeholder=settings.apiKeyConfigured?'Настроен · оставьте пустым, чтобы сохранить':'Из настроек Syncthing';
   synced=false;syncStatus='';lastSyncAt=null;
   message.textContent='Настройки Syncthing сохранены';
  }
 }catch(e){message.textContent=String(e.message||e);}
 finally{busy=false;saveDayEdits();decorate();}
}
async function selectStartupVault(){
 document.body.insertAdjacentHTML('beforeend',`<dialog id="native-vault-setup" aria-labelledby="native-vault-setup-title" aria-describedby="native-vault-setup-help">
  <h1 id="native-vault-setup-title">Выберите хранилище</h1>
  <p id="native-vault-setup-help">Сначала выберите, где будут храниться данные Sloy.</p>
  <div class="vault-setup-actions">
   <button type="button" class="primary-button" data-vault-choice="default" autofocus>Использовать папку по умолчанию</button>
   <button type="button" class="secondary-button" data-vault-choice="other">Выбрать другую папку</button>
  </div>
  <p class="form-note">Sloy создаст папку в корне внутреннего хранилища. При первом подключении Android запросит доступ ко всем файлам.</p>
  <p class="form-note vault-setup-status" role="status"></p>
 </dialog>`);
 const dialog=$('#native-vault-setup');
 const message=dialog.querySelector('[role="status"]');
 message.textContent=settings.vaultPath?status:'';
 dialog.addEventListener('cancel',event=>event.preventDefault());
 dialog.showModal();
 await new Promise(resolve=>{
  dialog.addEventListener('click',async event=>{
   const button=event.target.closest('[data-vault-choice]');
   if(!button||busy)return;
   busy=true;
   const buttons=dialog.querySelectorAll('button');
   buttons.forEach(control=>control.disabled=true);
   message.textContent='Подключение хранилища…';
   try{
    const selection=await invoke(button.dataset.vaultChoice==='default'?'vault_default':'vault_pick');
    if(!selection){message.textContent='';return;}
    await openVault({...settings,vaultPath:selection.path,androidTreeUri:selection.androidTreeUri??null});
    dialog.close();
    resolve();
   }catch(error){message.textContent=String(error.message||error);}
   finally{busy=false;buttons.forEach(control=>control.disabled=false);if(!connected)button.focus();}
  });
 });
 dialog.remove();
}
document.addEventListener('click',event=>{
 const tab=event.target.closest('[data-native-settings-tab]');
 if(tab)showSettingsTab(tab.dataset.nativeSettingsTab);
 if(event.target.closest('[data-native-sync-now]')&&settings.syncthing.enabled)check({force:true});
});
function dirtyModal(){const modal=$('#modal');if(!modal.open)return false;const form=modal.querySelector('form');if(!form)return true;if(!form.reportValidity())return true;form.requestSubmit();return modal.open;}
document.addEventListener('click',e=>{const b=e.target.closest('[data-native-sync],[data-native-browse],[data-native-rebuild],[data-native-recovery],[data-native-retry],[data-native-reload]');if(b){e.preventDefault();e.stopImmediatePropagation();(async()=>{if(b.hasAttribute('data-native-browse')){const path=await invoke('vault_pick');if(path){$('#native-vault').value=path.path;selectedVault=path;}}else if(b.hasAttribute('data-native-recovery'))await recovery();else if(b.hasAttribute('data-native-reload')){engine.discardPending();$('#modal').close();await check();}else if(b.hasAttribute('data-native-retry')){engine.failure=null;$('#modal').close();await check({force:true});}else if(!dirtyModal())await check({force:true,rebuild:b.hasAttribute('data-native-rebuild')});})().catch(error=>binding?.toast(String(error)));return;}const link=e.target.closest('a[href^="obsidian:"]');if(link){e.preventDefault();e.stopImmediatePropagation();engine.flush().then(()=>invoke('open_obsidian',{url:link.href})).catch(e=>binding?.toast(String(e)));return;}if(!connected&&e.target.closest('[data-action="new-task"],[data-action="new-project"],[data-action="new-area"],[data-action="new-habit"],.tree-create')){e.preventDefault();e.stopImmediatePropagation();binding?.toast('Сначала подключите хранилище в настройках');}},true);
const vaultWriteActions=new Set(['new-task','new-subtask','edit-task','select-task','toggle-done','edit-project','activate-task','edit-repeat','clear-wellbeing']);
const vaultDialogActions=new Set(['confirm-freeze','confirm-unfreeze','today-new-task','today-pick']);
document.addEventListener('click',event=>{
 if(connected&&!busy)return;
 const action=event.target.closest('button[data-action]');
 if(!action)return;
 if(!vaultDialogActions.has(action.dataset.action)&&
   !(action.closest('[data-vault-readonly]')&&vaultWriteActions.has(action.dataset.action)))return;
 event.preventDefault();
 event.stopImmediatePropagation();
 binding?.toast(connected?'Изменения доступны после синхронизации':'Сначала подключите хранилище в настройках');
},true);
document.addEventListener('change',e=>{if(e.target.name==='knowledgeMode')updateKnowledgeMode(e.target.form);else if(e.target.name==='syncEnabled')updateSyncSettings(e.target.form);});
document.addEventListener('invalid',e=>{if(!['native-vault-form','native-sync-form'].includes(e.target.form?.id))return;for(let parent=e.target.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;if(e.target.closest('#native-sync-options'))$('#native-sync-options').hidden=false;},true);
document.addEventListener('submit',e=>{if(['native-vault-form','native-sync-form'].includes(e.target.id)){e.preventDefault();e.stopImmediatePropagation();saveSettingsForm(e.target);}},true);
window.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();if(binding&&!dirtyModal())check({force:true});}});
settings=await invoke('settings_get');settings.folders={...defaults,...settings.folders};settings.syncthing??={};
engine=new VaultEngine({commit:(changes,vaultPath)=>invoke('vault_commit',{changes,vaultPath}),scan:async(rebuild,initial,vaultPath)=>{const report=await invoke('vault_scan',{rebuild,initial,vaultPath});report.knowledge[date()]??=0;return report;},sync:()=>invoke('syncthing_sync').catch(e=>({status:'error',message:String(e)}))},{settings:{...settings.folders,vaultPath:settings.vaultPath,vaultName:settings.vaultPath.split(/[\\/]/).pop()},today:date,onState:(state,{saved})=>{if(binding&&!engine.pending){applyDayEdits(state);binding.set(state,{refresh:!editingDayField(),reset:!saved});}},onStatus:(kind,data)=>{if(kind==='ready'&&data.sync){synced=data.sync.status==='complete'&&!data.report.conflicts?.length;if(data.sync.status==='complete')lastSyncAt=new Date();syncStatus=data.sync.status==='complete'?(data.report.conflicts?.length?'Обмен завершён · есть конфликтные копии':''):data.sync.status==='disabled'?'':data.sync.message||'';}else if(kind==='ready'){if(data.report.conflicts?.length)synced=false;}else if(kind!=='checking')synced=false;if(kind==='ready')lastReport=data.report;status=kind==='error'?String(data.message||data):kind==='ready'?data.sync?.message||`Сверено файлов: ${data.report.filesChecked}; перечитано: ${data.report.filesRead}`:kind==='saving'?'Сохранение…':kind==='saved'?'Изменения записаны':kind==='checking'?'Синхронизация и сверка…':kind;if(kind==='ready'&&data.report.conflicts?.length)status+=' · Конфликтных копий: '+data.report.conflicts.length;paint();}});
if(settings.vaultPath.trim()){
 try{await engine.reconcile({force:true});connected=true;}
 catch(e){status=String(e.message||e);}
}
if(!connected){
 if(settings.requiresVaultSetup)await selectStartupVault();
 else history.replaceState(null,'','?page=settings');
}
await import('./app.js');
function checkWhenIdle(){
 if(connected&&!document.hidden&&!editingDayField()&&!$('#modal').open&&!document.activeElement?.matches('input,textarea,select'))check();
}
window.addEventListener('focus',checkWhenIdle);
document.addEventListener('visibilitychange',()=>{
 if(document.hidden)engine.flush().catch(()=>{});
 else checkWhenIdle();
});
setInterval(checkWhenIdle,60000);
if(window.__TAURI__.window){try{await registerWindowClose(window.__TAURI__.window.getCurrentWindow(),{dirtyModal,flush:()=>engine.flush(),toast:message=>binding?.toast(message)});}catch{}}
