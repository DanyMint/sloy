import {normalizeMetric} from './analytics.js';
import {dateOf} from './model.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=n=>n===null||n===undefined?'—':Number(n).toLocaleString('ru-RU',{maximumFractionDigits:3});
const date=s=>dateOf(s).toLocaleDateString('ru-RU',{day:'numeric',month:'short',timeZone:'UTC'});

export function correlationOverlayHTML(rows,mx,my){
 const series=[mx,my].map((metric,index)=>({metric,key:index?'b':'a',...normalizeMetric(rows.map(row=>row[metric.id]))}));
 const legend=`<div class="overlay-legend">${series.map(s=>`<div class="overlay-scale series-${s.key}"><strong><i aria-hidden="true"></i>${esc(s.metric.label)}${s.metric.unit?' · '+esc(s.metric.unit):''}</strong>${s.count?`<span>0% = ${num(s.min)} ${esc(s.metric.unit)} <span aria-hidden="true">→</span> 100% = ${num(s.max)} ${esc(s.metric.unit)}</span>${s.constant?'<small>Значение постоянно · линия на 50%</small>':''}`:'<span>Нет наблюдений за этот период</span>'}</div>`).join('')}</div>`;
 if(!series.some(s=>s.count))return legend+'<div class="chart-empty"><span>⌁</span><h3>Пока нет данных для динамики</h3><p>Выберите другой период или метрики. Пропуски остаются пропусками.</p></div>';
 const W=680,H=280,L=52,R=22,T=18,B=38,w=W-L-R,h=H-T-B,x=i=>L+w*(rows.length===1?.5:i/(rows.length-1)),y=v=>T+h*(1-v/100),tickCount=Math.min(5,rows.length),ticks=new Set(Array.from({length:tickCount},(_,i)=>Math.round(i*(rows.length-1)/Math.max(1,tickCount-1))));
 let grid='',labels='',lines='',points='';
 for(let v=0;v<=100;v+=25)grid+=`<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" class="chart-grid"/><text x="${L-9}" y="${y(v)+4}" text-anchor="end">${v}%</text>`;
 rows.forEach((row,i)=>{if(ticks.has(i))labels+=`<text x="${x(i)}" y="${H-11}" text-anchor="middle">${date(row.date)}</text>`;});
 for(const s of series){
  s.values.forEach((v,i)=>{
   if(v===null)return;
   if(i&&s.values[i-1]!==null)lines+=`<path d="M${x(i-1)} ${y(s.values[i-1])} L${x(i)} ${y(v)}" class="overlay-line series-${s.key}"/>`;
   const row=rows[i],tip=`${date(row.date)}${row.end!==row.date?' — '+date(row.end):''}. `+series.map(other=>`${other.metric.label}: ${num(row[other.metric.id])} ${other.metric.unit}${other.values[i]===null?'':` (${num(other.values[i])}%)`}`).join('; ');
   points+=`<circle cx="${x(i)}" cy="${y(v)}" r="3.5" tabindex="0" class="overlay-dot series-${s.key}" aria-label="${esc(tip)}"><title>${esc(tip)}</title></circle>`;
  });
 }
 return legend+`<svg class="data-chart overlay-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Динамика: ${esc(mx.label)} и ${esc(my.label)}, шкала от 0 до 100 процентов"><title>${esc(mx.label)} и ${esc(my.label)} во времени</title>${grid}${lines}${points}${labels}</svg><p class="overlay-caption">Шкала каждой линии: от минимума до максимума выбранного периода. Проценты показывают положение внутри этого диапазона. Исходные значения — в подсказках к точкам.</p>`;
}
