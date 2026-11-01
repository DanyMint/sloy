import {today,period,addDays,emptyPlan,freezePlan} from './model.js';
import {normalizeState} from './domain.js';
// A separate, deterministic workspace for exploring charts. Never merged or saved.
export function analyticsDemo(now=today()){
 const start=addDays(period('week',now).start,-77),state=normalizeState({version:1,structureVersion:1,demo:true,vault:'',tasks:[],plans:{},areas:[{id:'sample-health',name:'Здоровье',description:'',icon:'heart'},{id:'sample-work',name:'Работа',description:'',icon:'work'}],projects:[{id:'sample-project',name:'Запуск приложения',description:'',parentId:null,areaId:'sample-work',icon:'rocket'}],habits:[
  {id:'sample-water',name:'Вода',unit:'мл',step:250,target:2000,createdOn:start,archivedOn:null},
  {id:'sample-walk',name:'Прогулка',unit:'мин',step:10,target:30,createdOn:start,archivedOn:null},
  {id:'sample-read',name:'Чтение',unit:'мин',step:5,target:20,createdOn:start,archivedOn:null}
 ],habitEntries:{},dayLogs:{}});
 const titles=['Подготовить макет','Проверить сценарий','Написать документацию','Закрыть замечания'];
 for(let w=0;w<12;w++){
  const monday=addDays(start,w*7),weekPlan=state.plans['week:'+monday]=emptyPlan();
  weekPlan.capacity=40;weekPlan.goal='Фокус недели: довести до результата небольшой этап.';
  for(let d=0;d<7;d++){
   const day=addDays(monday,d);if(day>now)continue;
   const i=w*7+d,energy=Math.max(0,Math.min(1,.50+.28*Math.sin(w*1.35)+.16*Math.sin(i*2.17))),minutes=Math.round((355+energy*140+Math.cos(i*1.7)*18)/5)*5,wake=450+(i%3)*15,bed=wake-minutes;
   if(![19,45,61].includes(i))state.dayLogs[day]={bedDate:bed<0?addDays(day,-1):day,bedTime:time((bed+1440)%1440),wakeTime:time(wake),wellbeing:Math.max(1,Math.min(10,Math.round(3+energy*6+Math.sin(i*.8)))),note:''};
   const values=[Math.round((1250+energy*1500)/250)*250,Math.round((10+energy*45)/10)*10,Math.round((5+energy*30)/5)*5];
   state.habitEntries[day]=Object.fromEntries(state.habits.map((h,n)=>[h.id,{value:i%17===n?0:values[n],target:h.target,unit:h.unit}]));
   const dayPlan=state.plans['day:'+day]=emptyPlan();dayPlan.capacity=8;
   for(let n=0;n<(d<5?4:2);n++){
    const id=`sample-${day}-${n}`,done=n<Math.round((d<5?4:2)*(.2+energy*.8)),task={id,title:titles[n],project:'Запуск приложения',projectId:'sample-project',areaId:'sample-work',estimate:1+n*.5,due:day,done,completedAt:done?day:'',cancelled:false,cancelledAt:'',archived:false,recurrence:'none',seriesId:null,nextOccurrenceId:null,previousOccurrenceId:null,source:'Демонстрация.md',blockId:id};
    state.tasks.push(task);dayPlan.selected.push(id);weekPlan.selected.push(id);
   }
   freezePlan(state,period('day',day),day+'T05:00:00Z');
  }
  freezePlan(state,period('week',monday),monday+'T04:00:00Z');
 }
 return state;
}
function time(minutes){return String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');}
