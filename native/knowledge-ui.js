import {knowledgeTypes,knowledgeCategories,knowledgeSummary} from '../dist/knowledge.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function knowledgeSettingsHTML(folders){
 const mode=folders.knowledgeMode||'folders';
 const rules=knowledgeTypes.map(({id,label,folder,value})=>({id,label,folder,value,...folders.knowledgeTypes?.[id]}));
 return `<fieldset class="native-knowledge-settings"><legend>Типы заметок Knowledge</legend><div class="native-grid"><label>Корневая папка заметок<input class="field" name="knowledge" value="${esc(folders.knowledge)}" required></label></div><fieldset class="native-knowledge-mode"><legend>Определять тип заметки</legend><label><input type="radio" name="knowledgeMode" value="folders" ${mode==='folders'?'checked':''}>По папкам</label><label><input type="radio" name="knowledgeMode" value="properties" ${mode==='properties'?'checked':''}>По свойствам</label></fieldset><div data-knowledge-mode-panel="folders" ${mode==='folders'?'':'hidden'}><p class="form-note">Укажите подпапки относительно папки заметок.</p><div class="native-grid">${rules.map(({id,label,folder})=>`<label>${label}<input class="field" name="knowledge-${id}-folder" value="${esc(folder)}"></label>`).join('')}</div></div><div data-knowledge-mode-panel="properties" ${mode==='properties'?'':'hidden'}><p class="form-note">Укажите свойство Obsidian и его значения для каждого типа. Регистр букв не важен.</p><div class="native-grid"><label>Свойство типа в Obsidian<input class="field" name="knowledgeTypeProperty" value="${esc(folders.knowledgeTypeProperty)}" placeholder="type" ${mode==='properties'?'required':''}></label>${rules.map(({id,label,value})=>`<label>${label}<input class="field" name="knowledge-${id}-value" value="${esc(value)}"></label>`).join('')}</div></div><p class="form-note">Заметки без подходящего типа — «Без типа». Сохранённые итоги прошлых дней не меняются.</p></fieldset>`;
}
export function updateKnowledgeMode(form){
 const mode=form.querySelector('[name="knowledgeMode"]:checked')?.value||'folders';
 for(const panel of form.querySelectorAll('[data-knowledge-mode-panel]'))panel.hidden=panel.dataset.knowledgeModePanel!==mode;
 form.querySelector('[name="knowledgeTypeProperty"]').required=mode==='properties';
}
export function knowledgeRulesFromForm(values){
 return Object.fromEntries(knowledgeTypes.map(({id})=>[id,{folder:String(values.get('knowledge-'+id+'-folder')||'').trim(),value:String(values.get('knowledge-'+id+'-value')||'').trim()}]));
}
export function knowledgeStatisticsHTML(facts,start,end){
 const stats=knowledgeSummary(facts,start,end);
 return `<section id="native-period-statistics" class="settings-section"><h2>Knowledge</h2><strong>${stats.count}</strong><span> создано заметок · дней с записью: ${stats.daysRecorded}</span><div class="native-knowledge-stats">${knowledgeCategories.map(({id,label})=>`<div><strong>${stats.byType[id]}</strong><span>${label}</span></div>`).join('')}</div></section>`;
}
