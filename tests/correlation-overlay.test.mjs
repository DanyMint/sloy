import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeMetric,analyticsRows,correlation} from '../dist/analytics.js';
import {analyticsDemo} from '../dist/analytics-demo.js';
import {correlationOverlayHTML} from '../dist/correlation-overlay.js';
import {analyticsHTML} from '../dist/wellness-pages.js';
import {today} from '../dist/model.js';

test('normalization maps each observed range independently and never fills missing observations',()=>{
 const sleep=normalizeMetric([6,null,8,7,undefined,NaN]);
 assert.deepEqual(sleep,{min:6,max:8,constant:false,count:3,values:[0,null,100,50,null,null]});
 assert.deepEqual(normalizeMetric([20,60,40]).values,[0,100,50]);
 const constant=normalizeMetric([null,7,7]);assert.equal(constant.constant,true);assert.deepEqual(constant.values,[null,50,50]);
 assert.deepEqual(normalizeMetric([null,undefined]),{min:null,max:null,constant:false,count:0,values:[null,null]});
});
test('normalization preserves Pearson correlation while using original matching pairs',()=>{
 const x=[6,7,8,5,7.5],y=[40,65,80,30,90],a=normalizeMetric(x),b=normalizeMetric(y);
 assert.ok(Math.abs(correlation(x.map((v,i)=>({x:v,y:y[i]}))).r-correlation(a.values.map((v,i)=>({x:v,y:b.values[i]}))).r)<1e-12);
});
test('overlay breaks lines at missing dates, labels each scale and handles constant and empty series',()=>{
 const rows=[{date:'2026-10-26',end:'2026-10-26',sleep:6,wellbeing:7},{date:'2026-10-27',end:'2026-10-27',sleep:null,wellbeing:7},{date:'2026-10-28',end:'2026-10-28',sleep:8,wellbeing:7}],x={id:'sleep',label:'Сон',unit:'ч'},y={id:'wellbeing',label:'Самочувствие',unit:'/ 10'},html=correlationOverlayHTML(rows,x,y);
 assert.equal((html.match(/class="overlay-line series-a"/g)||[]).length,0);
 assert.equal((html.match(/class="overlay-line series-b"/g)||[]).length,2);
 assert.ok(html.includes('0% = 6 ч')&&html.includes('100% = 8 ч'));
 assert.ok(html.includes('Значение постоянно · линия на 50%'));
 assert.ok(html.includes('Сон: — ч; Самочувствие: 7 / 10 (50%)'));
 assert.ok(correlationOverlayHTML([],x,y).includes('Пока нет данных для динамики'));
});
test('one shared metric pair drives both chart modes without a separate single-metric chart',()=>{
 const state=analyticsDemo(),ctx={anchor:today(),span:4,grain:'week',x:'sleep',y:'habit:sample-walk',demo:true,chart:'overlay'},rows=analyticsRows(state,ctx).rows;
 const overlay=analyticsHTML(state,ctx),scatter=analyticsHTML(state,{...ctx,chart:'scatter'});
 assert.ok(overlay.includes('class="data-chart overlay-chart"'));
 assert.ok(scatter.includes('class="data-chart scatter-chart"'));
 assert.equal((overlay.match(/id="analytics-x"/g)||[]).length,1);assert.equal((overlay.match(/id="analytics-y"/g)||[]).length,1);
 assert.ok(!overlay.includes('id="analytics-trend"')&&!scatter.includes('id="analytics-trend"'));
 assert.equal((scatter.match(/class="scatter-dot"/g)||[]).length,rows.length);
 assert.ok(overlay.includes('Первая линия')&&overlay.includes('Прогулка'));
});
