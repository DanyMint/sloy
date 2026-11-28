import {isProjectArchived,isTaskActive} from './domain.js';

export function workspaceSearchResults(state,query){
 const terms=query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
 const areas=new Map(state.areas.map(area=>[area.id,area.name]));
 const projects=new Map(state.projects.map(project=>[project.id,project]));
 const projectPath=id=>{
  const project=projects.get(id);
  if(!project)return '';
  return [areas.get(project.areaId),projects.get(project.parentId)?.name,project.name].filter(Boolean).join(' / ');
 };
 const entries=[
  ...state.projects.filter(project=>!isProjectArchived(state,project)).map(project=>({kind:'project',id:project.id,label:project.name,path:projectPath(project.id),type:'Проект'})),
  ...state.areas.map(area=>({kind:'area',id:area.id,label:area.name,path:'',type:'Зона'})),
  ...state.tasks.filter(task=>isTaskActive(state,task)).map(task=>({kind:'task',id:task.id,label:task.title,path:projectPath(task.projectId)||areas.get(task.areaId)||'Без зоны',type:'Задача'}))
 ];
 const normalized=query.trim().toLocaleLowerCase();
 return entries.filter(entry=>terms.every(term=>[entry.label,entry.path,entry.type].join(' ').toLocaleLowerCase().includes(term)))
  .sort((a,b)=>Number(b.label.toLocaleLowerCase().startsWith(normalized))-Number(a.label.toLocaleLowerCase().startsWith(normalized))).slice(0,40);
}

export function showWorkspaceSearch(openModal,closeModal,find,open){
 openModal('<div class="workspace-search"><h2 id="workspace-search-title">Поиск</h2><input type="search" class="field" role="combobox" aria-label="Поиск проектов, зон и задач" aria-controls="workspace-search-results" aria-expanded="true" aria-autocomplete="list" placeholder="Проект, зона или задача" autocomplete="off"><div id="workspace-search-results" role="listbox" aria-label="Результаты поиска"></div><p class="form-note workspace-search-empty" role="status" hidden>Ничего не найдено</p><div class="workspace-search-keys"><span><kbd>↑</kbd> <kbd>↓</kbd> Выбор</span><span><kbd>Enter</kbd> Открыть</span><span><kbd>Esc</kbd> Закрыть</span></div></div>');
 const panel=document.querySelector('.workspace-search'),input=panel.querySelector('input'),list=panel.querySelector('[role=listbox]');
 let results=[],index=0;
 function highlight(next){
  index=next;
  const option=list.children[index];
  for(const [i,row] of [...list.children].entries())row.setAttribute('aria-selected',String(i===index));
  if(option){
   input.setAttribute('aria-activedescendant',option.id);
   option.scrollIntoView({block:'nearest'});
  }else input.removeAttribute('aria-activedescendant');
 }
 function render(){
  results=find(input.value);
  list.replaceChildren(...results.map((result,i)=>{
   const row=document.createElement('div'),name=document.createElement('strong'),type=document.createElement('span'),path=document.createElement('small');
   row.id='workspace-search-result-'+i;row.setAttribute('role','option');
   name.textContent=result.label;type.textContent=result.type;path.textContent=result.path;
   row.append(name,type,path);
   row.addEventListener('click',()=>open(result));
   return row;
  }));
  panel.querySelector('.workspace-search-empty').hidden=results.length>0;
  highlight(0);
 }
 input.addEventListener('input',render);
 input.addEventListener('keydown',event=>{
  if(event.isComposing||event.keyCode===229)return;
  if(event.key==='Escape'){
   event.preventDefault();closeModal();return;
  }
  if(!results.length)return;
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){
   event.preventDefault();
   highlight(Math.min(results.length-1,Math.max(0,index+(event.key==='ArrowDown'?1:-1))));
  }else if(event.key==='Enter'){
   event.preventDefault();open(results[index]);
  }
 });
 render();input.focus();
}
