export function updateWorkspaceAvailability(document,page,{busy,connected}){
 const vaultUnavailable=busy||!connected;
 const canBrowse=page==='today'||page==='planner';
 document.querySelector('main').inert=!canBrowse&&(busy||!connected&&page!=='settings');
 // Keep period navigation reachable while edits are paused.
 const editableSections='#today-view > .today-habit-strip,#today-view > .today-section,'
  +'#journal-focus,#planner-overdue,#planner-view .plan-panel,#reflection-section,#planner-diary';
 document.querySelectorAll(editableSections).forEach(section=>{
  section.inert=vaultUnavailable;
 });
 const source=document.querySelector('#planner-view .live-panel');
 source.toggleAttribute('data-vault-readonly',vaultUnavailable);
}
