import {addDays,today} from './model.js';
// Targets belong to the historical entry, not today's habit settings.
export function habitGoalMet(state,habit,day,now=today()){
 const e=state.habitEntries[day]?.[habit.id];
 return day<=now&&day>=habit.createdOn&&(!habit.archivedOn||day<habit.archivedOn)&&!!e&&e.value>=e.target;
}
export function habitStreaks(state,habit,now=today()){
 const dates=Object.keys(state.habitEntries).filter(d=>habitGoalMet(state,habit,d,now)).sort();
 let best=0,run=0,previous='';
 for(const day of dates){run=previous&&addDays(previous,1)===day?run+1:1;best=Math.max(best,run);previous=day;}
 let current=0;
 if(!habit.archivedOn||habit.archivedOn>now){
  let day=habitGoalMet(state,habit,now,now)?now:addDays(now,-1);
  while(habitGoalMet(state,habit,day,now)){current++;day=addDays(day,-1);}
 }
 return {current,best};
}
