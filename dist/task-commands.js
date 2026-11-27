import {taskAncestors} from './task-hierarchy.js';
import {compareTaskListOrder,isTaskActive,isTaskPlannable,setTaskParent,setTaskStatus} from './domain.js';
import {addOverplan,isDayEligible} from './day-flow.js';
import {addJournalTask} from './journal.js';
import {clone,period} from './model.js';

export function taskMenuTargets(id,selection){
 return selection.has(id)?[...selection]:[id];
}

export function completionTargets(state,tasks,{completeOnly=false,native=false}={}){
 return tasks.filter(task=>isTaskActive(state,task)&&!task.cancelled&&!task.skipped&&!task.someday&&
  (!completeOnly||!task.done)&&(!native||task.done||!task.nativeRecurrenceRule));
}

export function completeTasks(state,tasks,date){
 const candidate=clone(state);
 let next;
 for(const task of tasks)next=setTaskStatus(candidate,task.id,task.done?'todo':'done',date)||next;
 return {candidate,next};
}

export function taskPlanOptions(state,tasks,day){
 const week=period('week',day),daily=period('day',day),weekPlan=state.plans[week.key],dayPlan=state.plans[daily.key];
 const eligible=tasks.filter(task=>isTaskPlannable(state,task));
 return [
  {id:'week',period:week,ids:weekPlan?.snapshot?[]:eligible.filter(task=>!weekPlan?.selected.includes(task.id)).map(task=>task.id)},
  {id:dayPlan?.snapshot?'overplan':'day',period:daily,ids:eligible.filter(task=>dayPlan?.snapshot?
   !dayPlan.snapshot.items.some(item=>item.id===task.id)&&!dayPlan.overplan?.includes(task.id):
   !dayPlan?.selected.includes(task.id)&&isDayEligible(state,day,task.id)).map(task=>task.id)}
 ].filter(option=>option.ids.length);
}

export function planTasks(state,option){
 const candidate=clone(state);
 for(const id of option.ids){
  const added=option.id==='overplan'?addOverplan(candidate,option.period.start,id):addJournalTask(candidate,option.period,id);
  if(!added)throw new Error('Состав плана изменился.');
 }
 return candidate;
}

function selectedBranches(space,ids,index){
 const selected=new Set(ids);
 if(ids.some(id=>!index.has(id)||!isTaskActive(space,index.get(id))))return [];
 return space.tasks.filter(task=>selected.has(task.id)&&!taskAncestors(task,index).some(ancestor=>selected.has(ancestor.id)))
  .sort(compareTaskListOrder);
}

export function taskBranchSelection(space,ids){
 const index=new Map(space.tasks.map(task=>[task.id,task])),selected=new Set(ids);
 const roots=selectedBranches(space,ids,index);
 return {
  under(parentId){
   const parent=index.get(parentId);
   if(!roots.length||!parent||!isTaskActive(space,parent)||selected.has(parentId)||taskAncestors(parent,index).some(task=>selected.has(task.id)))return [];
   return roots.filter(task=>task.parentTaskId!==parentId);
  },
  into(destination){
   if(!destination)return [];
   return roots.filter(task=>task.parentTaskId||(task.projectId||null)!==(destination.projectId||null)||
    (!destination.projectId&&(task.areaId||null)!==(destination.areaId||null)));
  },
  ancestors:task=>taskAncestors(task,index)
 };
}

export function movableRoots(space,parentId,ids){
 return taskBranchSelection(space,ids).under(parentId);
}

export function movingToScope(space,destination,ids){
 return destination?taskBranchSelection(space,ids).into(destination):[];
}

export function moveTaskRoots(state,roots,{kind,id},startOrder){
 roots.forEach((task,index)=>{
  const projectId=task.projectId;
  setTaskParent(state,task,kind,id);
  if(task.projectId!==projectId){task.kanbanColumnId=null;delete task.kanbanOrder;}
  task.listOrder=startOrder+index;
 });
}
