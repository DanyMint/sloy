export function updateWorkspaceAvailability(document,page,{busy,connected}){
 const vaultUnavailable=busy||!connected;
 const canBrowse=page==='today'||page==='planner';
 document.querySelector('main').inert=!canBrowse&&(busy||!connected&&page!=='settings');
 // Leave dialogs and disclosure controls reachable while vault writes are paused.
 document.querySelectorAll('#today-view > .today-habit-strip,#journal-focus,#planner-overdue,#planner-diary').forEach(section=>{
  section.inert=vaultUnavailable;
 });
 document.querySelectorAll('#today-view > .today-section,#planner-view .board,#reflection-section').forEach(section=>{
  section.toggleAttribute('data-vault-readonly',vaultUnavailable);
 });
 document.querySelectorAll('#plan-goal,#plan-capacity,#diary-form input[name=wellbeing]').forEach(field=>{
  field.disabled=vaultUnavailable;
 });
}
