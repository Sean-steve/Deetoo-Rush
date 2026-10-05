import assert from 'node:assert/strict';
import { config } from '../packages/config/src/index';
import { closeDbPool } from '../apps/api/src/db/client';
import { withTransaction } from '../apps/api/src/db/transaction';
import { cartService } from '../apps/api/src/modules/cart/cart.service';
import { checkoutService } from '../apps/api/src/modules/cart/checkout.service';
import { catalogueService } from '../apps/api/src/modules/merchant/catalogue.service';
import { postgresCart } from '../apps/api/src/modules/cart/cart.postgres';
import { pricingService } from '../apps/api/src/modules/cart/pricing.service';
const rollback = new Error('Intentional validation rollback');
try {
  assert.equal(config.storage.mode, 'postgres');
  assert.equal(config.storage.fixtures, false);
  assert(process.env.NODE_ENV !== 'production' && process.env.APP_ENV !== 'production', 'Local verification only');
  await withTransaction(async client => {
    const menus = (await client.query("SELECT m.* FROM menus m WHERE merchant_id=$1 AND is_active",['cdbf8265-553a-455a-bdcd-2c500aa922f1'])).rows;
    const customer = (await client.query("SELECT c.user_id AS id FROM customer_profiles c JOIN users u ON u.id=c.user_id WHERE u.email=$1",['testuser@deetoo.test'])).rows[0];
    assert(customer);
    const address = (await client.query('SELECT id FROM addresses WHERE customer_id=$1 AND is_active ORDER BY created_at LIMIT 1',[customer.id])).rows[0];
    assert(address,'Customer needs an existing delivery address');
    for (const menu of menus) {
      const publicMenu = await catalogueService.getPublicRestaurantMenu(menu.branch_id);
      assert(publicMenu);
      const items = (await client.query("SELECT * FROM menu_items WHERE menu_id=$1 AND sku LIKE 'LOCAL-TEST-%'",[menu.id])).rows;
      assert.equal(items.length,24);
      const sold = items.find(i=>!i.is_available);
      await assert.rejects(()=>cartService.addItem(customer.id,{branch_id:menu.branch_id,menu_item_id:sold.id,quantity:1}), (e:any)=>e.code==='ITEM_UNAVAILABLE');
      const main=items.find(i=>i.name==='Beef Pilau');
      await assert.rejects(()=>cartService.addItem(customer.id,{branch_id:menu.branch_id,menu_item_id:main.id,quantity:1}), (e:any)=>e.code==='MISSING_REQUIRED_MODIFIER');
    }
    const delivery=await postgresCart.getDeliveryPricingRuleForZone();
    const fee=await postgresCart.getServiceFeeRule();
    for(const [distance,expected] of [[0,10000],[3000,10000],[3001,13000],[4001,16000],[1000000,100000]]) assert.equal(pricingService.calculateDeliveryFee(distance,delivery).fee_minor,expected);
    for(const [basket,expected] of [[10000,2000],[100000,2500],[1000000,10000]]) assert.equal(pricingService.calculateServiceFee(basket,fee),expected);
    const options=(await client.query("SELECT o.id,o.name,g.name AS group_name FROM modifier_options o JOIN modifier_groups g ON g.id=o.modifier_group_id WHERE g.merchant_id=$1 AND g.name LIKE 'Test %'",[menus[0].merchant_id])).rows;
    const regular=options.find(o=>o.group_name==='Test Portion Choice' && o.name==='Regular');
    const extra=options.find(o=>o.name==='Extra Chapati');
    const main=(await client.query("SELECT id FROM menu_items WHERE menu_id=$1 AND name='Beef Pilau'",[menus[0].id])).rows[0];
    // All customer-cart changes and generated quotes below are rolled back.
    await cartService.clearCart(customer.id);
    await cartService.addItem(customer.id,{branch_id:menus[0].branch_id,menu_item_id:main.id,quantity:2,modifier_option_ids:[regular.id,extra.id]});
    const quote=await checkoutService.generateQuote(customer.id,{address_id:address.id});
    assert.equal(quote.gross_subtotal_minor,120000);
    assert.equal(quote.service_fee_minor,3000);
    assert.equal(quote.total_minor,quote.net_subtotal_minor+quote.delivery_fee_minor+quote.service_fee_minor+quote.tax_minor);
    await checkoutService.validateBinding(quote);
    console.log(JSON.stringify({result:'PASS',checks:['two public menus','sold-out rejected','required option enforced','fee boundaries','real customer quote','quote binding'],quote:{gross:quote.gross_subtotal_minor,delivery:quote.delivery_fee_minor,service:quote.service_fee_minor,total:quote.total_minor}}));
    throw rollback;
  });
} catch(error) {if(error!==rollback)throw error;} finally {await closeDbPool();}
