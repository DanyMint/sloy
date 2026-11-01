export const WEEKLY_VIEW_KEY='kontur-weekly-source-view';
export const weeklyViews=['groups','list'];
export const normalizeWeeklyView=value=>weeklyViews.includes(value)?value:'groups';
export function readWeeklyView(storage){
 try{return normalizeWeeklyView((storage||window.localStorage).getItem(WEEKLY_VIEW_KEY));}catch{return 'groups';}
}
export function saveWeeklyView(value,storage){
 if(!weeklyViews.includes(value))return false;
 try{(storage||window.localStorage).setItem(WEEKLY_VIEW_KEY,value);return true;}catch{return false;}
}
