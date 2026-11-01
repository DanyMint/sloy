// Curated outline icons. Only their IDs are stored in workspace backups.
export const entityIcons = {
  water:['Вода','<path d="M12 2C10 6 4 11 4 15a8 8 0 0 0 16 0c0-4-6-9-8-13Z"/><path d="M8 15a4 4 0 0 0 4 4"/>'],
  home:['Дом','<path d="m3 10 9-7 9 7v11H3Z"/><path d="M9 21v-8h6v8"/>'],
  work:['Работа','<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V3h8v4M3 12a20 20 0 0 0 18 0M12 11v4"/>'],
  code:['Код','<path d="m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18"/>'],
  chart:['График','<path d="M4 3v17h17M8 15l4-5 4 2 5-7"/>'],
  target:['Цель','<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>'],
  flag:['Флаг','<path d="M5 21V3m0 1c5-4 9 4 14 0v10c-5 4-9-4-14 0"/>'],
  rocket:['Ракета','<path d="M8 16c0-7 6-13 13-13 0 7-6 13-13 13Zm0 0-4 4m6-13H4l-2 7 6-1m9 1v6l-7 2 1-6"/><circle cx="16" cy="8" r="2"/>'],
  book:['Книга','<path d="M12 5c-3-3-6-3-10-2v16c4-1 7-1 10 2 3-3 6-3 10-2V3c-4-1-7-1-10 2Zm0 0v16"/>'],
  study:['Учёба','<path d="m2 8 10-5 10 5-10 5Zm4 2v7c4 3 8 3 12 0v-7m4-2v9"/>'],
  bulb:['Идея','<path d="M9 18v-2c-7-5-4-14 3-14s10 9 3 14v2Zm0 3h6M12 18v-6m-3-2 3 2 3-2"/>'],
  heart:['Здоровье','<path d="M20 4c-3-3-7-1-8 2-1-3-5-5-8-2-6 6 8 16 8 16S26 10 20 4Z"/>'],
  activity:['Активность','<path d="M2 12h5l3-9 4 18 3-9h5"/>'],
  leaf:['Рост','<path d="M20 3C6 1-1 10 6 18s17-1 14-15ZM4 21 16 9"/>'],
  sun:['Солнце','<circle cx="12" cy="12" r="4"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>'],
  moon:['Луна','<path d="M21 14A9 9 0 0 1 10 3a9 9 0 1 0 11 11Z"/>'],
  coffee:['Кофе','<path d="M3 8h14v9a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3Zm14 1h2a3 3 0 0 1 0 6h-2M7 2v3m6-3v3M2 23h17"/>'],
  food:['Еда','<path d="M5 2v20m-3-20v5a3 3 0 0 0 6 0V2m13 20V2c-6 4-7 12 0 12"/>'],
  tools:['Ремонт','<path d="m14 6 4 4 4-4c2 6-3 10-8 7L5 22l-3-3 9-9c-3-5 1-10 7-8Z"/>'],
  wallet:['Финансы','<path d="M20 6V3H5a3 3 0 0 0 0 6h16v12H5a3 3 0 0 1-3-3V6m19 7h-6v4h6"/>'],
  users:['Люди','<circle cx="9" cy="7" r="4"/><path d="M2 21v-3a7 7 0 0 1 14 0v3m1-18a4 4 0 0 1 0 8m3 10v-3a7 7 0 0 0-3-6"/>'],
  globe:['Мир','<circle cx="12" cy="12" r="10"/><ellipse cx="12" cy="12" rx="4" ry="10"/><path d="M2 12h20M4 6h16M4 18h16"/>'],
  music:['Музыка','<path d="M9 18V5l12-3v13M9 9l12-3"/><ellipse cx="5" cy="19" rx="4" ry="3"/><ellipse cx="17" cy="16" rx="4" ry="3"/>'],
  palette:['Творчество','<path d="M12 2a10 10 0 1 0 0 20c4 0 2-5 4-5h2c6 0 5-15-6-15Z"/><circle cx="7" cy="8" r="1"/><circle cx="13" cy="6" r="1"/><circle cx="18" cy="10" r="1"/><circle cx="6" cy="14" r="1"/>'],
  folder:['Папка','<path d="M2 5h8l2 3h10v12H2Z"/>'],
  star:['Звезда','<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z"/>'],
  calendar:['Календарь','<rect x="3" y="5" width="18" height="17" rx="2"/><path d="M7 2v6m10-6v6M3 11h18m-13 5h3m3 0h3"/>'],
  shield:['Защита','<path d="M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6Zm-4 10 3 3 5-6"/>'],
  puzzle:['Система','<path d="M3 3h6a3 3 0 1 1 6 0h6v6a3 3 0 1 0 0 6v6h-6a3 3 0 1 0-6 0H3v-6a3 3 0 1 1 0-6Z"/>']
};
export const validEntityIcon=value=>value===undefined||value===''||typeof value==='string'&&Object.hasOwn(entityIcons,value);
export function entityIcon(entity,kind='project'){
 const body=entityIcons[entity?.icon]?.[1]||(['area','habit'].includes(kind)?'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/>':'<path d="m12 2 10 10-10 10L2 12Z"/>');
 return `<svg class="entity-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}
export function entityIconPicker(entity,kind){return `<fieldset class="entity-icon-picker"><legend>Иконка</legend><div>${[['','По умолчанию'],...Object.entries(entityIcons).map(([id,[name]])=>[id,name])].map(([id,name])=>`<label title="${name}"><input type="radio" name="${kind==='habit'?'habit-icon':'entity-icon'}" value="${id}" aria-label="${name}" ${(entity.icon||'')===id?'checked':''}>${entityIcon({icon:id},kind)}<span class="visually-hidden">${name}</span></label>`).join('')}</div></fieldset>`;}
