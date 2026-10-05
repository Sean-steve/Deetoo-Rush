import { randomUUID } from 'node:crypto';
import { rows,one,insert,identifier } from '../../db/adapter';
import { withTransaction } from '../../db/transaction';
import { AppError } from '../../middleware/error-handler';
const cartFields=['id','customer_id','branch_id','currency','status','applied_promo_code','expires_at'];
const deliveryFields=['id','zone_id','base_fee_minor','included_distance_meters','per_km_fee_minor','minimum_fee_minor','maximum_fee_minor','max_delivery_distance_meters','status','effective_from','effective_until'];
const feeFields=['id','fee_type','percentage_basis_points','fixed_fee_minor','minimum_fee_minor','maximum_fee_minor','status','effective_from','effective_until'];
const promoFields=['id','code','type','value_minor_or_bps','status','start_at','end_at','minimum_basket_minor','usage_limit','times_used','per_customer_limit','merchant_id','branch_id','zone_id','funding_source','merchant_funding_bps','description'];
const quoteFields=['binding_hash','cart_items_snapshot','pricing_rule_snapshot','id','quote_id','customer_id','cart_id','branch_id','branch_name','delivery_address_id','delivery_address_snapshot','currency','items_subtotal_minor','modifiers_subtotal_minor','gross_subtotal_minor','discount_minor','discount_funding_source','net_subtotal_minor','delivery_fee_minor','service_fee_minor','tax_minor','total_minor','distance_meters','estimated_duration_min','delivery_pricing_rule_id','service_fee_rule_id','promotion_id','promotion_code','expires_at','created_at'];
const itemQuery=`SELECT ci.*,COALESCE((SELECT jsonb_agg(modifier_option_id) FROM cart_item_modifiers WHERE cart_item_id=ci.id),'[]'::jsonb) AS modifier_option_ids FROM cart_items ci`;
async function update(table:string,id:string,data:any,fields:string[]) {
  const keys=fields.filter(k=>k!=='id' && data[k]!==undefined);
  if(!keys.length)return one(`SELECT * FROM ${identifier(table)} WHERE id=$1`,[id]);
  return one(`UPDATE ${identifier(table)} SET ${keys.map((k,i)=>identifier(k)+'=$'+(i+2)).join(',')},updated_at=now() WHERE id=$1 RETURNING *`,[id,...keys.map(k=>data[k])]);
}
async function save(table:string,data:any,fields:string[]) {
  return withTransaction(async()=>{
    const existing=await one(`SELECT id FROM ${identifier(table)} WHERE id=$1 FOR UPDATE`,[data.id]);
    return existing?update(table,data.id,data,fields):insert(table,data,fields);
  });
}
export const postgresCart = {
  findActiveCartByCustomer:(id:string)=>one("SELECT * FROM carts WHERE customer_id=$1 AND status='ACTIVE' ORDER BY created_at DESC LIMIT 1",[id]),
  findCartById:(id:string)=>one('SELECT * FROM carts WHERE id=$1',[id]),
  createCart:(cart:any)=>insert('carts',cart,cartFields),
  updateCartStatus:async(id:string,status:string)=>{await update('carts',id,{status},cartFields);},
  updateCartPromo:async(id:string,code:string|null)=>{await update('carts',id,{applied_promo_code:code},cartFields);},
  deleteCart:async(id:string)=>{await rows('DELETE FROM carts WHERE id=$1',[id]);},
  listCartItems:(id:string)=>rows(itemQuery+' WHERE ci.cart_id=$1 ORDER BY ci.created_at,ci.id',[id]),
  findCartItemById:(id:string)=>one(itemQuery+' WHERE ci.id=$1',[id]),
  createCartItem:(item:any)=>withTransaction(async()=>{
    await insert('cart_items',item,['id','cart_id','menu_item_id','quantity']);
    for(const option of item.modifier_option_ids)await insert('cart_item_modifiers',{id:randomUUID(),cart_item_id:item.id,modifier_option_id:option},['id','cart_item_id','modifier_option_id']);
    return postgresCart.findCartItemById(item.id);
  }),
  updateCartItemQuantity:(id:string,quantity:number)=>withTransaction(async()=>{await update('cart_items',id,{quantity},['quantity']);return postgresCart.findCartItemById(id);}),
  deleteCartItem:async(id:string)=>{await rows('DELETE FROM cart_items WHERE id=$1',[id]);},
  deleteCartItemsByCart:async(id:string)=>{await rows('DELETE FROM cart_items WHERE cart_id=$1',[id]);},
  getDeliveryPricingRuleForZone:async(id?:string|null)=>{
    const rule=await one("SELECT * FROM delivery_pricing_rules WHERE (zone_id=$1 OR zone_id IS NULL) AND status='ACTIVE' AND effective_from<=now() AND (effective_until IS NULL OR effective_until>now()) ORDER BY (zone_id IS NOT NULL) DESC,effective_from DESC LIMIT 1",[id||null]);
    if(!rule)throw new AppError(503,'PRICING_NOT_CONFIGURED','No active delivery pricing rule');return rule;
  },
  getServiceFeeRule:async()=>{
    const rule=await one("SELECT * FROM service_fee_rules WHERE status='ACTIVE' AND effective_from<=now() AND (effective_until IS NULL OR effective_until>now()) ORDER BY effective_from DESC LIMIT 1");
    if(!rule)throw new AppError(503,'PRICING_NOT_CONFIGURED','No active service fee rule');return rule;
  },
  listDeliveryPricingRules:()=>rows('SELECT * FROM delivery_pricing_rules ORDER BY effective_from DESC'),
  listServiceFeeRules:()=>rows('SELECT * FROM service_fee_rules ORDER BY effective_from DESC'),
  saveDeliveryPricingRule:(r:any)=>save('delivery_pricing_rules',r,deliveryFields),
  saveServiceFeeRule:(r:any)=>save('service_fee_rules',r,feeFields),
  findPromotionByCode:(code:string)=>one('SELECT * FROM promotions WHERE upper(code)=upper($1)',[code]),
  listPromotions:(o:any={})=>rows("SELECT * FROM promotions WHERE ($1::boolean=false OR status='ACTIVE') ORDER BY created_at DESC",[!!o.activeOnly]),
  createPromotion:(p:any)=>insert('promotions',p,promoFields),
  updatePromotion:(id:string,p:any)=>update('promotions',id,p,promoFields),
  createCheckoutQuote:(q:any)=>insert('checkout_quotes',{...q,cart_items_snapshot:JSON.stringify(q.cart_items_snapshot||[])},quoteFields),
  findCheckoutQuoteById:(id:string)=>one('SELECT * FROM checkout_quotes WHERE quote_id=$1 OR id=$1',[id]),
};
