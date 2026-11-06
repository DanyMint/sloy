import {isTaskPlannable} from './domain.js';
import {period,today} from './model.js';
export function plannedDates(state,id){return Object.entries(state.plans).filter(([key,p])=>key.startsWith('day:')&&(p.snapshot?.items.some(t=>t.id===id)||p.overplan?.includes(id))).map(([key])=>key.slice(4)).sort();}
export function overdueTasks(state,day=today()){
 const history=new Map();for(const [key,p] of Object.entries(state.plans)){if(!key.startsWith('day:')||key.slice(4)>=day||!p.snapshot)continue;for(const id of new Set([...p.snapshot.items.map(t=>t.id),...(p.overplan||[])])){const dates=history.get(id)||[];dates.push(key.slice(4));history.set(id,dates);}}
 return state.tasks.filter(t=>isTaskPlannable(state,t)&&!t.done&&(t.due&&t.due<day||history.has(t.id))).map(t=>({task:t,dates:(history.get(t.id)||[]).sort()}));
}
export function isDayEligible(state,day,id){
 const p=state.plans[period('week',day).key],weekly=p?.snapshot?.items||p?.selected?.map(id=>({id}))||[];
 return weekly.some(t=>t.id===id)||(state.plans['day:'+day]?.direct||[]).includes(id)||overdueTasks(state,day).some(r=>r.task.id===id);
}
export function addOverplan(state,day,id){
 const plan=state.plans['day:'+day],task=state.tasks.find(t=>t.id===id&&isTaskPlannable(state,t));
 if(!plan?.snapshot||!task)throw new Error('Сначала зафиксируйте план дня.');
 if(plan.snapshot.items.some(t=>t.id===id))return false;
 plan.overplan??=[];if(plan.overplan.includes(id))return false;plan.overplan.push(id);return true;
}
export const dayStartPage=(state,day=today())=>state.plans['day:'+day]?.snapshot?'today':'planner';
