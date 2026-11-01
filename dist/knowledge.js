export const knowledgeTypes=[
 {id:'quotes',label:'Цитаты',folder:'Cites',value:'quote'},
 {id:'reflections',label:'Переосмысления',folder:'Reflections',value:'reflection'},
 {id:'thoughts',label:'Мои мысли и идеи',folder:'Thoughts',value:'thought'}
];
export const knowledgeCategories=[...knowledgeTypes,{id:'other',label:'Без типа'}];
export const defaultKnowledgeRules=()=>Object.fromEntries(knowledgeTypes.map(({id,folder,value})=>[id,{folder,value}]));
// Legacy facts retain their total in the untyped category; never infer a past type from today's files.
export function knowledgeCounts(fact){
 if(!fact)return null;
 const counts=Object.fromEntries(knowledgeCategories.map(({id})=>[id,fact.byType?.[id]||0]));
 counts.other+=Math.max(0,fact.count-Object.values(counts).reduce((sum,n)=>sum+n,0));
 return counts;
}
export function knowledgeSummary(facts,start,end){
 const days=Object.entries(facts||{}).filter(([day])=>(!start||day>=start)&&(!end||day<=end));
 const byType=Object.fromEntries(knowledgeCategories.map(({id})=>[id,0]));
 let count=0;for(const [,fact] of days){count+=fact.count;const counts=knowledgeCounts(fact);for(const {id} of knowledgeCategories)byType[id]+=counts[id];}
 return {count,byType,daysRecorded:days.length};
}
