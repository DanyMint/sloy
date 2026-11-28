const treeSelector='#sidebar-tree,#zones-tree';
const rowSelector='[data-tree-open]';
const shown=node=>!!node?.getClientRects().length&&!node.closest('[inert]');

export function initVimProjectTree({enabled,reveal,toggle,create}){
 const queries=new Map(),cursors=new Map();
 const treeOf=target=>target?.closest(treeSelector);
 const rows=tree=>[...tree.querySelectorAll(rowSelector)].filter(shown);
 function focus(tree,key){
  if(!shown(tree))return false;
  const items=rows(tree),row=items.find(item=>item.dataset.key===key)||items[0];
  (row||tree).focus({preventScroll:true});
  row?.scrollIntoView({block:'nearest'});
  return true;
 }
 function filter(tree){
  const input=tree.querySelector('[data-vim-tree-search]');
  if(!input)return;
  const value=queries.get(tree.id)||'';
  if(input.value!==value)input.value=value;
  const terms=value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  for(const row of [...tree.querySelectorAll(rowSelector)].reverse()){
   const item=row.closest('li'),matching=terms.every(term=>row.title.toLocaleLowerCase().includes(term));
   item.hidden=!matching&&![...item.querySelectorAll('li')].some(child=>!child.hidden);
  }
  tree.classList.toggle('vim-tree-filtered',terms.length>0);
 }
 function refresh(){
  for(const tree of document.querySelectorAll(treeSelector))filter(tree);
 }
 function snapshot(){
  const target=document.activeElement,tree=treeOf(target);
  if(!enabled()||!tree)return null;
  return {id:tree.id,key:target.closest(rowSelector)?.dataset.key||cursors.get(tree.id),search:target.hasAttribute('data-vim-tree-search')};
 }
 function restore(saved){
  if(!saved)return;
  const tree=document.getElementById(saved.id);
  if(saved.search)tree.querySelector('[data-vim-tree-search]')?.focus();
  else focus(tree,saved.key);
 }
 function enter(){
  const tree=reveal();
  return focus(tree,[...tree.querySelectorAll('[aria-current="page"]')].find(shown)?.dataset.key||cursors.get(tree.id));
 }
 function exitSearch(target){
  if(!target.matches('[data-vim-tree-search]'))return false;
  const tree=treeOf(target);
  return focus(tree,cursors.get(tree.id));
 }
 function run(command,target){
  const tree=treeOf(target),items=rows(tree);
  const row=target.closest(rowSelector)||items.find(item=>item.dataset.key===cursors.get(tree.id));
  if(command==='search'){tree.querySelector('[data-vim-tree-search]').focus();return true;}
  if(command==='add')return create(row);
  if(command==='open'&&row&&target===row){row.click();return true;}
  if(!row)return false;
  if(command==='left'||command==='right'){
   const item=row.closest('li'),button=row.parentElement.querySelector('[data-action="tree-toggle"]');
   const expanded=button?.getAttribute('aria-expanded')==='true';
   if(button&&!tree.classList.contains('vim-tree-filtered')&&(command==='left'?expanded:!expanded)){
    toggle(row.dataset.key);focus(tree,row.dataset.key);return true;
   }
   const relative=command==='left'?item.parentElement.closest('li')?.querySelector(rowSelector):
    items.find(candidate=>candidate!==row&&item.contains(candidate));
   return relative?focus(tree,relative.dataset.key):false;
  }
  const index=items.indexOf(row);
  const position={first:0,last:items.length-1,up:Math.max(0,index-1),down:Math.min(items.length-1,index+1)}[command];
  return position===undefined?false:focus(tree,items[position]?.dataset.key);
 }
 document.addEventListener('focusin',event=>{
  const row=event.target.closest(rowSelector),tree=treeOf(row);
  if(enabled()&&tree)cursors.set(tree.id,row.dataset.key);
 });
 document.addEventListener('input',event=>{
  if(!event.target.matches('[data-vim-tree-search]'))return;
  const tree=treeOf(event.target);
  queries.set(tree.id,event.target.value);filter(tree);
 });
 return {active:target=>!!treeOf(target),enter,exitSearch,run,refresh,snapshot,restore,focus};
}
