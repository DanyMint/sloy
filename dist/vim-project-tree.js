const treeSelector='#sidebar-tree,#zones-tree';
const rowSelector='[data-tree-open]';
const shown=node=>!!node?.getClientRects().length&&!node.closest('[inert]');

export function initVimProjectTree({enabled,reveal,toggle,create}){
 const cursors=new Map();
 const treeOf=target=>target?.closest(treeSelector);
 const rows=tree=>[...tree.querySelectorAll(rowSelector)].filter(shown);
 function focus(tree,key){
  if(!shown(tree))return false;
  const items=rows(tree),row=items.find(item=>item.dataset.key===key)||items[0];
  (row||tree).focus({preventScroll:true});
  row?.scrollIntoView({block:'nearest'});
  return true;
 }
 function snapshot(){
  const target=document.activeElement,tree=treeOf(target);
  if(!enabled()||!tree)return null;
  return {id:tree.id,key:target.closest(rowSelector)?.dataset.key||cursors.get(tree.id)};
 }
 function restore(saved){
  if(!saved)return;
  const tree=document.getElementById(saved.id);
  focus(tree,saved.key);
 }
 function enter(){
  const tree=reveal();
  return focus(tree,[...tree.querySelectorAll('[aria-current="page"]')].find(shown)?.dataset.key||cursors.get(tree.id));
 }
 function run(command,target){
  const tree=treeOf(target),items=rows(tree);
  const row=target.closest(rowSelector)||items.find(item=>item.dataset.key===cursors.get(tree.id));
  if(command==='add')return create(row);
  if(!row)return false;
  if(command==='right'||command==='open'&&target===row){row.click();return true;}
  if(command==='left'){
   const item=row.closest('li'),button=row.parentElement.querySelector('[data-action="tree-toggle"]');
   if(button?.getAttribute('aria-expanded')==='true'){
    toggle(row.dataset.key);focus(tree,row.dataset.key);return true;
   }
   const parent=item.parentElement.closest('li')?.querySelector(rowSelector);
   return parent?focus(tree,parent.dataset.key):false;
  }
  const index=items.indexOf(row);
  const position={first:0,last:items.length-1,up:Math.max(0,index-1),down:Math.min(items.length-1,index+1)}[command];
  return position===undefined?false:focus(tree,items[position]?.dataset.key);
 }
 document.addEventListener('focusin',event=>{
  const row=event.target.closest(rowSelector),tree=treeOf(row);
  if(enabled()&&tree)cursors.set(tree.id,row.dataset.key);
 });
 return {active:target=>!!treeOf(target),enter,run,snapshot,restore,focus};
}
