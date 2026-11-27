const settings=['vault','vaultPath','kanban','projectBoards','knowledgeFacts'];
const data=state=>Object.fromEntries(Object.entries(state).filter(([key])=>!settings.includes(key)));
export function createUndoHistory(){
 let baseline,snapshot;
 const entries=[];
 return {
  get available(){return entries.length>0;},
  rebase(state,{reset=false}={}){
   baseline=JSON.stringify(data(state));
   snapshot=JSON.stringify(state);
   if(reset)entries.length=0;
  },
  record(state,{track=true,previous,onUndo,message}={}){
   const next=JSON.stringify(data(state));
   if(track&&baseline!==undefined&&baseline!==next){
    entries.push({snapshot:previous?JSON.stringify(previous):snapshot,onUndo,message});
    if(entries.length>50)entries.shift();
   }
   baseline=next;
   snapshot=JSON.stringify(state);
  },
  peek(state){
   const entry=entries.at(-1);
   if(!entry)return null;
   const snapshot=JSON.parse(entry.snapshot);
   for(const key of settings){
    if(key==='projectBoards')continue;
    if(Object.hasOwn(state,key))snapshot[key]=structuredClone(state[key]);else delete snapshot[key];
   }
   const currentProjects=new Set(state.projects.map(project=>project.id));
   const boards={};
   for(const project of snapshot.projects){
    const config=(currentProjects.has(project.id)?state:snapshot).projectBoards?.[project.id];
    if(config)boards[project.id]=structuredClone(config);
   }
   snapshot.projectBoards=boards;
   return {...entry,state:snapshot};
  },
  pop(){entries.pop();}
 };
}
