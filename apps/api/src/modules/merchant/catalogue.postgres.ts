import { rows,one,insert } from '../../db/adapter';
import { updateRow,deleteRow } from '../../db/relational';
import { withTransaction } from '../../db/transaction';
import { AppError } from '../../middleware/error-handler';
const menuFields=['id','merchant_id','branch_id','name','description','currency','is_active'];
const categoryFields=['id','menu_id','name','description','sort_order','is_active'];
const itemFields=['id','menu_id','category_id','sku','name','description','price_minor','currency','image_url','is_available','sort_order'];
const groupFields=['id','merchant_id','name','min_selections','max_selections','is_required'];
const optionFields=['id','modifier_group_id','name','price_delta_minor','is_available','sort_order'];
const menus='SELECT *,jsonb_build_array(branch_id) AS assigned_branch_ids FROM menus';
const items="SELECT i.*,COALESCE((SELECT jsonb_agg(modifier_group_id ORDER BY sort_order) FROM item_modifier_groups WHERE item_id=i.id),'[]'::jsonb) AS modifier_group_ids FROM menu_items i";
function branch(ids:string[]|undefined){if(ids?.length!==1)throw new AppError(400,'BRANCH_OWNED_MENU_REQUIRED','A menu must belong to exactly one branch');return ids[0];}
async function reorder(table:'menu_categories'|'menu_items'|'modifier_options',parent:'menu_id'|'category_id'|'modifier_group_id',id:string,ids:string[]){
  return withTransaction(async()=>{for(const [index,key] of ids.entries()){
    if(!await one(`UPDATE ${table} SET sort_order=$3 WHERE id=$1 AND ${parent}=$2 RETURNING id`,[key,id,index]))throw new AppError(403,'FORBIDDEN_SCOPE','Reorder contains a foreign resource');
  }});
}
async function itemOverride(b:string,id:string,o:any){
  if(!await one('SELECT i.id FROM menu_items i JOIN menus m ON m.id=i.menu_id WHERE i.id=$1 AND m.branch_id=$2',[id,b]))throw new AppError(403,'FORBIDDEN_SCOPE','Item does not belong to this branch');
  return one(`INSERT INTO menu_item_branch_overrides(branch_id,item_id,is_available,price_override_minor) VALUES($1,$2,COALESCE($3,true),$4)
    ON CONFLICT(branch_id,item_id) DO UPDATE SET is_available=COALESCE($3,menu_item_branch_overrides.is_available),price_override_minor=CASE WHEN $5 THEN $4 ELSE menu_item_branch_overrides.price_override_minor END,updated_at=now() RETURNING *`,[b,id,o.is_available??null,o.price_override_minor??null,o.price_override_minor!==undefined]);
}
async function optionOverride(b:string,id:string,o:any){
  if(!await one('SELECT o.id FROM modifier_options o JOIN modifier_groups g ON g.id=o.modifier_group_id JOIN merchant_branches b ON b.merchant_id=g.merchant_id WHERE o.id=$1 AND b.id=$2',[id,b]))throw new AppError(403,'FORBIDDEN_SCOPE','Modifier does not belong to this merchant');
  return one(`INSERT INTO modifier_option_branch_overrides(branch_id,modifier_option_id,is_available,price_delta_override_minor) VALUES($1,$2,COALESCE($3,true),$4)
    ON CONFLICT(branch_id,modifier_option_id) DO UPDATE SET is_available=COALESCE($3,modifier_option_branch_overrides.is_available),price_delta_override_minor=CASE WHEN $5 THEN $4 ELSE modifier_option_branch_overrides.price_delta_override_minor END,updated_at=now() RETURNING *`,[b,id,o.is_available??null,o.price_delta_override_minor??null,o.price_delta_override_minor!==undefined]);
}
export const postgresCatalogue = {
  createMenu:(m:any)=>withTransaction(async()=>{const bid=branch(m.assigned_branch_ids);await insert('menus',{...m,branch_id:bid},menuFields);await rows('INSERT INTO menu_branch_assignments(menu_id,branch_id,is_active) VALUES($1,$2,$3)',[m.id,bid,m.is_active]);return postgresCatalogue.findMenuById(m.id);}),
  findMenuById:(id:string)=>one(menus+' WHERE id=$1',[id]),
  listMenusByMerchant:(id:string)=>rows(menus+' WHERE merchant_id=$1 ORDER BY created_at,id',[id]),
  updateMenu:(id:string,m:any)=>withTransaction(async()=>{if(m.assigned_branch_ids)await postgresCatalogue.assignBranchesToMenu(id,m.assigned_branch_ids);await updateRow('menus',id,m,['name','description','currency','is_active']);return postgresCatalogue.findMenuById(id);}),
  deleteMenu:(id:string)=>withTransaction(async()=>{for(const c of await postgresCatalogue.listCategoriesByMenu(id))await postgresCatalogue.deleteCategory(c.id);return deleteRow('menus',id);}),
  assignBranchesToMenu:(id:string,ids:string[])=>withTransaction(async()=>{const bid=branch(ids);await rows('DELETE FROM menu_branch_assignments WHERE menu_id=$1',[id]);await rows('UPDATE menus SET branch_id=$2 WHERE id=$1',[id,bid]);await rows('INSERT INTO menu_branch_assignments(menu_id,branch_id) VALUES($1,$2)',[id,bid]);}),
  getBranchAssignedMenus:(id:string)=>rows(menus+' WHERE branch_id=$1 ORDER BY created_at,id',[id]),
  createCategory:(c:any)=>insert('menu_categories',c,categoryFields),
  findCategoryById:(id:string)=>one('SELECT * FROM menu_categories WHERE id=$1',[id]),
  listCategoriesByMenu:(id:string)=>rows('SELECT * FROM menu_categories WHERE menu_id=$1 ORDER BY sort_order,id',[id]),
  updateCategory:(id:string,c:any)=>updateRow('menu_categories',id,c,['name','description','sort_order','is_active']),
  reorderCategories:async(id:string,ids:string[])=>{await reorder('menu_categories','menu_id',id,ids);return postgresCatalogue.listCategoriesByMenu(id);},
  deleteCategory:(id:string)=>withTransaction(async()=>{for(const item of await postgresCatalogue.listItemsByCategory(id))await postgresCatalogue.deleteItem(item.id);return deleteRow('menu_categories',id);}),
  createItem:(i:any)=>withTransaction(async()=>{await insert('menu_items',i,itemFields);if(i.modifier_group_ids)await postgresCatalogue.attachModifierGroupsToItem(i.id,i.modifier_group_ids);return postgresCatalogue.findItemById(i.id);}),
  findItemById:(id:string)=>one(items+' WHERE i.id=$1',[id]),
  listItemsByMenu:(id:string,category?:string)=>rows(items+' WHERE i.menu_id=$1 AND ($2::uuid IS NULL OR i.category_id=$2) ORDER BY i.sort_order,i.id',[id,category||null]),
  listItemsByCategory:(id:string)=>rows(items+' WHERE i.category_id=$1 ORDER BY i.sort_order,i.id',[id]),
  updateItem:(id:string,i:any)=>withTransaction(async()=>{await updateRow('menu_items',id,i,itemFields.filter(k=>!['id','menu_id'].includes(k)));if(i.modifier_group_ids)await postgresCatalogue.attachModifierGroupsToItem(id,i.modifier_group_ids);return postgresCatalogue.findItemById(id);}),
  reorderItems:async(id:string,ids:string[])=>{await reorder('menu_items','category_id',id,ids);return postgresCatalogue.listItemsByCategory(id);},
  deleteItem:(id:string)=>deleteRow('menu_items',id),
  setItemAvailability:(id:string,is_available:boolean)=>postgresCatalogue.updateItem(id,{is_available}),
  createModifierGroup:(g:any)=>insert('modifier_groups',g,groupFields),
  findModifierGroupById:async(id:string)=>{const g=await one('SELECT * FROM modifier_groups WHERE id=$1',[id]);return g?{...g,options:await postgresCatalogue.listModifierOptionsByGroup(id)}:null;},
  listModifierGroupsByMerchant:async(id:string)=>{const groups=await rows('SELECT * FROM modifier_groups WHERE merchant_id=$1 ORDER BY created_at,id',[id]);for(const g of groups)g.options=await postgresCatalogue.listModifierOptionsByGroup(g.id);return groups;},
  updateModifierGroup:(id:string,g:any)=>updateRow('modifier_groups',id,g,groupFields.filter(k=>!['id','merchant_id'].includes(k))),
  deleteModifierGroup:(id:string)=>deleteRow('modifier_groups',id),
  createModifierOption:(o:any)=>insert('modifier_options',o,optionFields),
  findModifierOptionById:(id:string)=>one('SELECT * FROM modifier_options WHERE id=$1',[id]),
  listModifierOptionsByGroup:(id:string)=>rows('SELECT * FROM modifier_options WHERE modifier_group_id=$1 ORDER BY sort_order,id',[id]),
  updateModifierOption:(id:string,o:any)=>updateRow('modifier_options',id,o,optionFields.filter(k=>!['id','modifier_group_id'].includes(k))),
  reorderModifierOptions:async(id:string,ids:string[])=>{await reorder('modifier_options','modifier_group_id',id,ids);return postgresCatalogue.listModifierOptionsByGroup(id);},
  deleteModifierOption:(id:string)=>deleteRow('modifier_options',id),
  attachModifierGroupsToItem:(id:string,ids:string[])=>withTransaction(async()=>{
    await rows('DELETE FROM item_modifier_groups WHERE item_id=$1',[id]);
    for(const [index,gid] of ids.entries()){
      if(!await one('SELECT i.id FROM menu_items i JOIN menus m ON m.id=i.menu_id JOIN modifier_groups g ON g.merchant_id=m.merchant_id WHERE i.id=$1 AND g.id=$2',[id,gid]))throw new AppError(403,'FORBIDDEN_SCOPE','Modifier belongs to another merchant');
      await rows('INSERT INTO item_modifier_groups(item_id,modifier_group_id,sort_order) VALUES($1,$2,$3)',[id,gid,index]);
    }
  }),
  getItemModifierGroups:async(id:string)=>{const gs=await rows('SELECT g.* FROM modifier_groups g JOIN item_modifier_groups ig ON ig.modifier_group_id=g.id WHERE ig.item_id=$1 ORDER BY ig.sort_order',[id]);for(const g of gs)g.options=await postgresCatalogue.listModifierOptionsByGroup(g.id);return gs;},
  getModifierGroupsForItem:(id:string)=>postgresCatalogue.getItemModifierGroups(id),
  setBranchItemOverride:itemOverride,
  getBranchItemOverride:(b:string,id:string)=>one('SELECT * FROM menu_item_branch_overrides WHERE branch_id=$1 AND item_id=$2',[b,id]),
  findBranchItemOverride:(b:string,id:string)=>postgresCatalogue.getBranchItemOverride(b,id),
  setBranchModifierOptionOverride:optionOverride,
  getBranchModifierOptionOverride:(b:string,id:string)=>one('SELECT * FROM modifier_option_branch_overrides WHERE branch_id=$1 AND modifier_option_id=$2',[b,id]),
  findBranchModifierOptionOverride:(b:string,id:string)=>postgresCatalogue.getBranchModifierOptionOverride(b,id),
};
