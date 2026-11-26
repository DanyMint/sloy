export function updateWorkspaceAvailability(document,page,{busy,connected}){
 document.querySelector('main').inert=page!=='today'&&(busy||!connected&&page!=='settings');
 // Keep the day journal reachable while the controls that change data are unavailable.
 document.querySelectorAll('#today-view > .today-habit-strip,#today-view > .today-section').forEach(section=>{
  section.inert=busy||!connected;
 });
}
