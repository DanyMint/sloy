import {validEntityIcon} from './entity-icons.js';
import {newId} from './domain.js';
export const validDay=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
const validTime=s=>typeof s==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const record=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const finite=(n,min=0,max=1e9)=>Number.isFinite(n)&&n>=min&&n<=max;
const round=n=>Math.round((n+Number.EPSILON)*1000)/1000;
export function sleepMinutes(day,log){
  if(!log?.bedDate||!log.bedTime||!log.wakeTime)return null;
  if(!validDay(day)||!validDay(log.bedDate)||!validTime(log.bedTime)||!validTime(log.wakeTime))return null;
  const minutes=(Date.parse(day+'T'+log.wakeTime+':00Z')-Date.parse(log.bedDate+'T'+log.bedTime+':00Z'))/60000;
  return minutes>0&&minutes<=1440?minutes:null;
}
export function durationLabel(minutes){return minutes===null?'—':Math.floor(minutes/60)+' ч '+String(Math.round(minutes%60)).padStart(2,'0')+' мин';}
export function saveDayLog(state,day,fields){
  if(!validDay(day))throw new Error('Выберите корректную дату.');
  const log={bedDate:fields.bedDate||'',bedTime:fields.bedTime||'',wakeTime:fields.wakeTime||'',wellbeing:fields.wellbeing===''||fields.wellbeing==null?null:Number(fields.wellbeing),note:String(fields.note||'').slice(0,3000)};
  if(log.bedDate&&!validDay(log.bedDate)||log.bedTime&&!validTime(log.bedTime)||log.wakeTime&&!validTime(log.wakeTime))throw new Error('Проверьте дату и время сна.');
  if(log.wellbeing!==null&&(!Number.isInteger(log.wellbeing)||!finite(log.wellbeing,1,10)))throw new Error('Самочувствие оценивается от 1 до 10.');
  if(log.bedTime&&log.wakeTime&&(!log.bedDate||sleepMinutes(day,log)===null))throw new Error('Пробуждение должно быть позже отхода ко сну. Проверьте дату: длительность — от 1 минуты до 24 часов.');
  state.dayLogs[day]=log;return log;
}
export function saveHabit(state,fields,day){
  if(!validDay(day))throw new Error('Некорректная дата.');
  const name=String(fields.name||'').trim(),unit=String(fields.unit||'').trim(),step=Number(fields.step),target=Number(fields.target);
  if(!name||name.length>100)throw new Error('Введите название до 100 символов.');
  if(unit.length>30||!finite(step,0.001,1e9)||!finite(target,0.001,1e9))throw new Error('Шаг и цель должны быть больше нуля (до 1 000 000 000).');
  const existing=state.habits.find(h=>h.id===fields.id);
  if(fields.id&&!existing)throw new Error('Привычка не найдена.');
  const icon=fields.icon===undefined?existing?.icon:fields.icon;
  if(!validEntityIcon(icon))throw new Error('Выберите иконку из списка.');
  const habit={id:existing?.id||newId('habit'),name,unit,step:round(step),target:round(target),createdOn:existing?.createdOn||day,archivedOn:existing?.archivedOn||null,...(icon!==undefined?{icon}:{})};
  if(existing)Object.assign(existing,habit);else state.habits.push(habit);return habit;
}
export function setHabitValue(state,id,day,value){
  const habit=state.habits.find(h=>h.id===id);if(!habit||!validDay(day))throw new Error('Привычка недоступна на эту дату.');
  const currentDay=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Aqtobe',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  if(day>currentDay)throw new Error('Будущие дни нельзя отмечать.');
  if(habit.archivedOn&&day>habit.archivedOn)throw new Error('Сначала верните привычку из архива.');
  const amount=Number(value);if(value===''||!finite(amount))throw new Error('Введите результат от 0 до 1 000 000 000.');
  if(day<habit.createdOn)habit.createdOn=day;
  const entries=state.habitEntries[day]??={},previous=entries[id];
  return entries[id]={value:round(amount),target:previous?.target??habit.target,unit:previous?.unit??habit.unit};
}
export function deleteHabit(state,id){
  const habit=state.habits.find(h=>h.id===id);if(!habit)throw new Error('Привычка не найдена.');
  state.habits=state.habits.filter(h=>h.id!==id);
  for(const [day,entries] of Object.entries(state.habitEntries)){delete entries[id];if(!Object.keys(entries).length)delete state.habitEntries[day];}
  return habit;
}
export function incrementHabit(state,id,day,direction=1){
  const habit=state.habits.find(h=>h.id===id);if(!habit)throw new Error('Привычка не найдена.');
  return setHabitValue(state,id,day,Math.max(0,round((state.habitEntries[day]?.[id]?.value||0)+habit.step*direction)));
}
export function validateWellness(state){
  const fail=()=>{throw new Error('Некорректные привычки или записи дневника в резервной копии.');};
  if(state.habits!==undefined&&(!Array.isArray(state.habits)||state.habits.length>2000))fail();
  const ids=new Set();for(const h of state.habits||[]){if(!record(h)||typeof h.id!=='string'||!h.id||h.id.length>250||ids.has(h.id)||typeof h.name!=='string'||!h.name.trim()||h.name.length>100||typeof h.unit!=='string'||h.unit.length>30||!validEntityIcon(h.icon)||!finite(h.step,.001)||!finite(h.target,.001)||!validDay(h.createdOn)||h.archivedOn!==null&&(!validDay(h.archivedOn)||h.archivedOn<h.createdOn))fail();ids.add(h.id);}
  for(const key of ['habitEntries','dayLogs'])if(state[key]!==undefined&&(!record(state[key])||Object.keys(state[key]).length>40000))fail();
  for(const [day,entries] of Object.entries(state.habitEntries||{})){if(!validDay(day)||!record(entries))fail();for(const [id,e] of Object.entries(entries)){const h=(state.habits||[]).find(h=>h.id===id);if(!h||day<h.createdOn||!record(e)||!finite(e.value)||!finite(e.target,.001)||typeof e.unit!=='string'||e.unit.length>30)fail();}}
  for(const [day,log] of Object.entries(state.dayLogs||{})){if(!validDay(day)||!record(log)||typeof log.note!=='string'||log.note.length>3000||log.wellbeing!==null&&(!Number.isInteger(log.wellbeing)||!finite(log.wellbeing,1,10))||typeof log.bedDate!=='string'||log.bedDate&&!validDay(log.bedDate)||typeof log.bedTime!=='string'||log.bedTime&&!validTime(log.bedTime)||typeof log.wakeTime!=='string'||log.wakeTime&&!validTime(log.wakeTime)||log.bedTime&&log.wakeTime&&sleepMinutes(day,log)===null)fail();}
}
