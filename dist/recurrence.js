export const repeatLabels={none:'Не повторяется',daily:'Ежедневно',weekdays:'По будням',weekly:'Еженедельно',monthly:'Ежемесячно',yearly:'Ежегодно',custom:'Свой интервал'};
const units={days:'дн.',weeks:'нед.',months:'мес.',years:'г.'};
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
export function validateRepeat(t){
 if(t.repeatMissed!==undefined&&!['keep','replace'].includes(t.repeatMissed)||t.recurrence!==undefined&&!Object.hasOwn(repeatLabels,t.recurrence)||t.repeatEvery!==undefined&&(!Number.isInteger(t.repeatEvery)||t.repeatEvery<1||t.repeatEvery>365)||t.repeatUnit!==undefined&&!Object.hasOwn(units,t.repeatUnit)||t.repeatFrom!==undefined&&!['completion','due'].includes(t.repeatFrom)||t.repeatAnchor&& !validDate(t.repeatAnchor))throw new Error('Проверьте настройки повторения.');
}
export function recurrenceLabel(t){return t.recurrence==='custom'?`Каждые ${t.repeatEvery||1} ${units[t.repeatUnit||'days']}`:repeatLabels[t.recurrence||'none'];}
function shifted(date,n,unit){
 const d=new Date(date+'T12:00:00Z');
 if(unit==='months'||unit==='years'){const day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+n*(unit==='years'?12:1));const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0,12)).getUTCDate();d.setUTCDate(Math.min(day,last));}else d.setUTCDate(d.getUTCDate()+n*(unit==='weeks'?7:1));
 const result=d.toISOString().slice(0,10);if(!validDate(result))throw new Error('Дата повторения выходит за допустимые границы.');return result;
}
export function nextRepeat(date,t){
 validateRepeat(t);if(!validDate(date)||!t.recurrence||t.recurrence==='none')throw new Error('Не удалось определить дату повторения.');
 const scheduled=t.repeatFrom==='due'&&validDate(t.due),base=scheduled?(t.repeatAnchor||t.due):date;
 if(t.recurrence==='weekdays'){
  let next=shifted(scheduled&&t.due>date?t.due:date,1,'days');
  while([0,6].includes(new Date(next+'T12:00:00Z').getUTCDay()))next=shifted(next,1,'days');return next;
 }
 const unit={daily:'days',weekly:'weeks',monthly:'months',yearly:'years'}[t.recurrence]||t.repeatUnit||'days',every=t.recurrence==='custom'?(t.repeatEvery||1):1;
 if(!scheduled)return shifted(base,every,unit);
 let n=1,next=shifted(base,every,unit),after=t.due>date?t.due:date;
 while(next<=after){n++;next=shifted(base,every*n,unit);if(n>4000000)throw new Error('Слишком большой интервал дат.');}
 return next;
}
export function repeatForm(t){return `<fieldset class="repeat-settings"><legend>↻ Повторяющаяся задача</legend><div class="form-grid"><div><label class="form-label" for="edit-recurrence">Повторять</label><select class="field" id="edit-recurrence">${Object.entries(repeatLabels).map(([v,l])=>`<option value="${v}" ${(t.recurrence||'none')===v?'selected':''}>${l}</option>`).join('')}</select></div><div id="repeat-from-wrap" ${!t.recurrence||t.recurrence==='none'?'hidden':''}><label class="form-label" for="edit-repeat-from">Отсчитывать от</label><select class="field" id="edit-repeat-from"><option value="completion" ${t.repeatFrom!=='due'?'selected':''}>Даты выполнения</option><option value="due" ${t.repeatFrom==='due'?'selected':''}>Планового срока</option></select></div></div><div id="repeat-custom-wrap" class="form-grid" ${t.recurrence!=='custom'?'hidden':''}><div><label class="form-label" for="edit-repeat-every">Каждые</label><input class="field" id="edit-repeat-every" ${t.recurrence!=='custom'?'disabled':''} type="number" min="1" max="365" step="1" value="${t.repeatEvery||1}"></div><div><label class="form-label" for="edit-repeat-unit">Период</label><select class="field" id="edit-repeat-unit" ${t.recurrence!=='custom'?'disabled':''}>${Object.entries({days:'Дней',weeks:'Недель',months:'Месяцев',years:'Лет'}).map(([v,l])=>`<option value="${v}" ${(t.repeatUnit||'days')===v?'selected':''}>${l}</option>`).join('')}</select></div></div><div id="repeat-missed-wrap" ${t.recurrence==='none'||!t.recurrence?'hidden':''}><label class="form-label" for="edit-repeat-missed">Если прошлый экземпляр не выполнен</label><select class="field" id="edit-repeat-missed"><option value="keep" ${t.repeatMissed!=='replace'?'selected':''}>Добавить новый, старый оставить просроченным</option><option value="replace" ${t.repeatMissed==='replace'?'selected':''}>Заменить новым, старый сохранить как пропущенный</option></select></div><p class="form-note" id="repeat-help" ${!t.recurrence||t.recurrence==='none'?'hidden':''}>От срока — экземпляры появляются по расписанию при открытии приложения. От выполнения — следующий создаётся после завершения. Замена сохраняет пропущенный экземпляр и прежние планы в истории.</p></fieldset>`;}
