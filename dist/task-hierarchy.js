export function taskAncestors(task,byId){
 const ancestors=[],seen=new Set([task.id]);
 while(task.parentTaskId){
  const parent=byId.get(task.parentTaskId);
  if(!parent||seen.has(parent.id))throw new Error('Некорректная связь между задачами.');
  ancestors.push(parent);
  seen.add(parent.id);
  task=parent;
 }
 return ancestors;
}

export function plannedTaskHours(items,tasks){
 const index=new Map((tasks||[]).map(task=>[task.id,task]));
 const covered=new Set(items.flatMap(task=>tasks?taskAncestors(task,index).map(parent=>parent.id):task.ancestorTaskIds||[]));
 return items.reduce((sum,item)=>sum+(covered.has(item.id)?0:Number(item.estimate)||0),0);
}
