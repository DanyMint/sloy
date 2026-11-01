import {period,addDays,today} from './model.js';
import {sleepMinutes} from './wellness.js';
import {knowledgeCategories,knowledgeCounts} from './knowledge.js';
export const mean=values=>{const v=values.filter(Number.isFinite);return v.length?v.reduce((a,b)=>a+b,0)/v.length:null;};
// Each metric uses its own observed range in the currently selected period.
// Missing observations stay missing; a constant series is drawn at the midpoint.
export function normalizeMetric(values){
  const observed=values.filter(Number.isFinite),min=observed.length?Math.min(...observed):null,max=observed.length?Math.max(...observed):null,constant=observed.length>0&&min===max;
  return {min,max,constant,count:observed.length,values:values.map(value=>Number.isFinite(value)?constant?50:(value-min)/(max-min)*100:null)};
}
export function correlation(points){
  const pairs=points.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)),n=pairs.length;
  if(n<3)return {n,r:null,reason:'Нужно хотя бы 3 пары записей.'};
  const mx=mean(pairs.map(p=>p.x)),my=mean(pairs.map(p=>p.y));let xx=0,yy=0,xy=0;
  for(const p of pairs){const x=p.x-mx,y=p.y-my;xx+=x*x;yy+=y*y;xy+=x*y;}
  return {n,r:xx&&yy?Math.max(-1,Math.min(1,xy/Math.sqrt(xx*yy))):null,reason:xx&&yy?'':'Значения одной из метрик не меняются.'};
}
export function metricOptions(state,grain){return [
  {id:'sleep',label:'Сон',unit:'ч',max:null},
  {id:'wellbeing',label:'Самочувствие',unit:'/ 10',max:10},
  {id:'productivity',label:grain==='week'?'Выполнение недельного плана':'Выполнение плана дня',unit:'%',max:100},
  {id:'done',label:'Выполнено из недельного плана',unit:'задач',max:null},
  ...(state.knowledgeFacts?[
    {id:'knowledge',label:'Создано заметок Knowledge',unit:'заметок',max:null},
    ...knowledgeCategories.map(({id,label})=>({id:'knowledge:'+id,label:'Knowledge · '+label,unit:'заметок',max:null}))
  ]:[]),
  ...state.habits.map(h=>({id:'habit:'+h.id,label:h.name,unit:h.unit||'ед.',max:null}))
];}
export function analyticsRows(state,{anchor,span=4,grain='week',now=today()}){
  const endWeek=period('week',anchor),start=addDays(endWeek.start,-7*(span-1)),end=endWeek.end,rows=[];
  const fixed=new Map(),byId=new Map(state.tasks.map(t=>[t.id,t]));
  for(let day=start;day<=end;day=addDays(day,7)){const plan=state.plans['week:'+day];if(plan?.snapshot)fixed.set(day,plan.snapshot.items);}
  const days=[];
  for(let date=start;date<=end;date=addDays(date,1)){
    if(date>now)continue;
    const week=period('week',date),items=fixed.get(week.start),log=state.dayLogs[date],minutes=sleepMinutes(date,log);
    const daily=state.plans['day:'+date]?.snapshot,dayItems=daily?.items||items?.filter(t=>t.due===date),doneOnDay=items?.filter(t=>{const live=byId.get(t.id);return live?.done&&!live.cancelled&&live.completedAt===date;}).length??null;
    const dayDone=dayItems?.filter(t=>{const live=byId.get(t.id);return live?.done&&!live.cancelled&&(daily?live.completedAt===date:live.completedAt>=week.start&&live.completedAt<=date);}).length??null;
    const row={date,end:date,sleep:minutes===null?null:minutes/60,wellbeing:log?.wellbeing??null,productivity:dayItems?.length?dayDone/dayItems.length*100:null,done:doneOnDay,planned:dayItems?.length||0,completed:dayDone,sleepCount:minutes===null?0:1,wellbeingCount:log?.wellbeing==null?0:1,habits:{},partial:date===now};
    const fact=state.knowledgeFacts?.[date],counts=knowledgeCounts(fact);row.knowledge=fact?.count??null;
    for(const {id} of knowledgeCategories)row['knowledge:'+id]=counts?.[id]??null;
    for(const h of state.habits){const e=state.habitEntries[date]?.[h.id];row['habit:'+h.id]=e?.value??null;row.habits[h.id]=e?{count:1,met:e.value>=e.target?1:0}:null;}
    days.push(row);
  }
  if(grain==='day')return {rows:days,days,start,end,fixedWeeks:fixed.size};
  for(let date=start;date<=end&&date<=now;date=addDays(date,7)){
    const weekEnd=addDays(date,6),bucket=days.filter(d=>d.date>=date&&d.date<=weekEnd),items=fixed.get(date),completed=items?.filter(t=>{const live=byId.get(t.id);return live?.done&&!live.cancelled&&live.completedAt>=date&&live.completedAt<=weekEnd&&live.completedAt<=now;}).length??null;
    const row={date,end:weekEnd,sleep:mean(bucket.map(d=>d.sleep)),wellbeing:mean(bucket.map(d=>d.wellbeing)),productivity:items?.length?completed/items.length*100:null,done:items?completed:null,planned:items?.length||0,completed,sleepCount:bucket.reduce((n,d)=>n+d.sleepCount,0),wellbeingCount:bucket.reduce((n,d)=>n+d.wellbeingCount,0),habits:{},partial:weekEnd>now};
    for(const key of ['knowledge',...knowledgeCategories.map(({id})=>'knowledge:'+id)])row[key]=bucket.some(d=>Number.isFinite(d[key]))?bucket.reduce((sum,d)=>sum+(d[key]||0),0):null;
    for(const h of state.habits){row['habit:'+h.id]=mean(bucket.map(d=>d['habit:'+h.id]));const entries=bucket.map(d=>d.habits[h.id]).filter(Boolean);row.habits[h.id]=entries.length?{count:entries.length,met:entries.reduce((n,e)=>n+e.met,0)}:null;}
    rows.push(row);
  }
  return {rows,days,start,end,fixedWeeks:fixed.size};
}
export function analyticsSummary(state,options){
  const data=analyticsRows(state,{...options,grain:'week'}),planned=data.rows.reduce((n,r)=>n+r.planned,0),completed=data.rows.reduce((n,r)=>n+(r.completed||0),0);
  return {...data,sleep:mean(data.days.map(d=>d.sleep)),sleepCount:data.days.filter(d=>d.sleep!==null).length,wellbeing:mean(data.days.map(d=>d.wellbeing)),wellbeingCount:data.days.filter(d=>d.wellbeing!==null).length,planned,completed,productivity:planned?completed/planned*100:null};
}
