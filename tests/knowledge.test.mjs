import {test} from 'node:test';
import assert from 'node:assert/strict';
import {knowledgeSummary} from '../dist/knowledge.js';
import {analyticsRows,metricOptions} from '../dist/analytics.js';
const state=()=>({tasks:[],plans:{},habits:[],habitEntries:{},dayLogs:{},knowledgeFacts:{
 '2026-10-26':{count:4,closed:true,byType:{quotes:2,reflections:1,thoughts:1}},
 '2026-10-27':{count:3,closed:true},
 '2026-10-28':{count:2,closed:true,byType:{thoughts:1,other:1}},
 '2026-11-02':{count:100,closed:false,byType:{quotes:100}}
}});
test('Knowledge totals preserve legacy facts and filter the selected period',()=>{
 assert.deepEqual(knowledgeSummary(state().knowledgeFacts,'2026-10-26','2026-11-01'),{count:9,byType:{quotes:2,reflections:1,thoughts:2,other:4},daysRecorded:3});
});
test('Knowledge analytics exposes each type and sums rather than averages weekly counts',()=>{
 const s=state(),options=metricOptions(s,'week');
 for(const id of ['knowledge','knowledge:quotes','knowledge:reflections','knowledge:thoughts','knowledge:other'])assert.ok(options.some(m=>m.id===id));
 const opts={anchor:'2026-10-30',now:'2026-10-30',span:1},daily=analyticsRows(s,{...opts,grain:'day'}).rows;
 assert.equal(daily[0]['knowledge:quotes'],2);
 assert.equal(daily[1]['knowledge:other'],3);
 assert.equal(daily[1]['knowledge:quotes'],0);
 assert.equal(daily[3]['knowledge:thoughts'],null);
 const weekly=analyticsRows(s,{...opts,grain:'week'}).rows[0];
 assert.equal(weekly.knowledge,9);assert.equal(weekly['knowledge:thoughts'],2);assert.equal(weekly['knowledge:other'],4);
 delete s.knowledgeFacts;assert.equal(metricOptions(s,'week').some(m=>m.id==='knowledge'),false);
 assert.equal(analyticsRows(s,{...opts,grain:'week'}).rows[0].knowledge,null);
});
