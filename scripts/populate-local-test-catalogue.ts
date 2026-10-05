import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { config } from '../packages/config/src/index';
import { UserRole } from '../packages/types/src/index';
import { closeDbPool } from '../apps/api/src/db/client';
import { withTransaction } from '../apps/api/src/db/transaction';
import { authRepository } from '../apps/api/src/modules/auth/auth.repository';
import { postgresCatalogue as catalogue } from '../apps/api/src/modules/merchant/catalogue.postgres';
import { catalogueService } from '../apps/api/src/modules/merchant/catalogue.service';
import { postgresCart } from '../apps/api/src/modules/cart/cart.postgres';
import { pricingService } from '../apps/api/src/modules/cart/pricing.service';

// Explicit local test data command, never a migration or application startup step.
const selection: [string, [string, number][]][] = [
  ['Test Breakfast', [['Mandazi (3 pieces)',120],['Spanish Omelette',250],['Pancakes with Honey',350],['Full Kenyan Breakfast',650]]],
  ['Test Kenyan Mains', [['Beef Pilau',550],['Chicken Biryani',750],['Nyama Choma Platter',1200],['Tilapia with Ugali',950]]],
  ['Test Vegetarian', [['Githeri Bowl',250],['Ndengu and Chapati',300],['Vegetable Curry and Rice',450],['Bean Burger',500]]],
  ['Test Snacks', [['Beef Samosas (3 pieces)',180],['Chips Masala',300],['Chicken Wings (6 pieces)',650],['Family Sharing Platter',1800]]],
  ['Test Drinks', [['Bottled Water',80],['Kenyan Chai',120],['Fresh Mango Juice',250],['Passion Fruit Smoothie',350]]],
  ['Test Desserts', [['Fruit Salad',200],['Vanilla Ice Cream',250],['Chocolate Cake',400],['Sold-out Cheesecake',450]]],
];
const merchantId = process.env.DEETOO_TEST_MERCHANT_ID;
const actor = process.env.DEETOO_CONFIG_ACTOR_ID;
try {
  assert.equal(process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'production', false, 'Local test configuration only');
  assert.equal(config.storage.mode, 'postgres');
  assert.equal(config.storage.fixtures, false);
  assert(actor && (await authRepository.getUserRoles(actor)).includes(UserRole.ADMIN), 'Existing administrator required');
  assert(merchantId, 'Explicit target merchant required');
  await withTransaction(async client => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('deetoo.local-test-catalogue'))");
    const merchant = (await client.query("SELECT id FROM merchants WHERE id=$1 AND status='ACTIVE' AND approval_status='APPROVED'", [merchantId])).rows[0];
    assert(merchant, 'Target must be an approved active merchant');
    const menus = (await catalogue.listMenusByMerchant(merchantId)).filter(m => m.is_active && m.currency === 'KES');
    assert(menus.length, 'Create a branch-owned KES menu first');
    const effectiveFrom = (await client.query('SELECT now() AS value')).rows[0].value.toISOString();
    const before = (await client.query('SELECT i.* FROM menu_items i JOIN menus m ON m.id=i.menu_id WHERE m.merchant_id=$1', [merchantId])).rows;
    const counts = {menus:menus.length, categories:0, items:0, groups:0, options:0, deliveryRules:0, serviceRules:0};
    const groups = await catalogue.listModifierGroupsByMerchant(merchantId);
    const groupIds: string[] = [];
    for (const [name, required, options] of [
      ['Test Portion Choice', true, [['Regular',0],['Large',150]]],
      ['Test Meal Extras', false, [['Extra Chapati',50],['Avocado',100],['Extra Chicken',200]]],
    ] as [string,boolean,[string,number][]][]) {
      let group = groups.find(g => g.name === name);
      if (!group) {group = await catalogue.createModifierGroup({id:randomUUID(),merchant_id:merchantId,name,min_selections:required?1:0,max_selections:required?1:2,is_required:required});counts.groups++;}
      groupIds.push(group.id);
      const existingOptions = await catalogue.listModifierOptionsByGroup(group.id);
      for (const [index,[optionName,price]] of options.entries()) if (!existingOptions.some(o => o.name === optionName)) {
        await catalogue.createModifierOption({id:randomUUID(),modifier_group_id:group.id,name:optionName,price_delta_minor:price*100,is_available:true,sort_order:index});counts.options++;
      }
    }
    for (const menu of menus) {
      const branch = (await client.query('SELECT merchant_id FROM merchant_branches WHERE id=$1',[menu.branch_id])).rows[0];
      assert.equal(branch?.merchant_id, merchantId);
      const categories = await catalogue.listCategoriesByMenu(menu.id);
      const items = await catalogue.listItemsByMenu(menu.id);
      for (const [categoryIndex,[name,foods]] of selection.entries()) {
        let category = categories.find(c => c.name === name);
        if (!category) {category = await catalogue.createCategory({id:randomUUID(),menu_id:menu.id,name,description:'Local testing selection; review before launch',sort_order:categories.length+categoryIndex,is_active:true});counts.categories++;}
        for (const [itemIndex,[itemName,price]] of foods.entries()) {
          const sku = `LOCAL-TEST-${menu.id.slice(0,8)}-${categoryIndex}-${itemIndex}`;
          if (items.some(i => i.sku === sku)) continue;
          await catalogue.createItem({id:randomUUID(),menu_id:menu.id,category_id:category.id,sku,name:itemName,description:'Local test menu item — review before launch.',price_minor:price*100,currency:'KES',is_available:!itemName.startsWith('Sold-out'),sort_order:itemIndex,modifier_group_ids:categoryIndex===1?groupIds:categoryIndex===2?[groupIds[1]]:[]});counts.items++;
        }
      }
      const effective = await catalogueService.getBranchCatalogue(menu.branch_id,merchantId);
      assert(effective, 'Branch catalogue must be readable');
      const populated = await catalogue.listItemsByMenu(menu.id);
      assert.equal(populated.filter(i => i.sku?.startsWith(`LOCAL-TEST-${menu.id.slice(0,8)}-`)).length,24);
    }
    // Preserve any existing effective commercial rules. User approved these test rates on 2026-09-24.
    if (!(await client.query("SELECT id FROM delivery_pricing_rules WHERE zone_id IS NULL AND status='ACTIVE' AND effective_from<=now() AND (effective_until IS NULL OR effective_until>now())")).rowCount) {
      await postgresCart.saveDeliveryPricingRule({id:randomUUID(),zone_id:null,base_fee_minor:10000,included_distance_meters:3000,per_km_fee_minor:3000,minimum_fee_minor:10000,maximum_fee_minor:100000,max_delivery_distance_meters:2000000,status:'ACTIVE',effective_from:effectiveFrom});counts.deliveryRules++;
    }
    if (!(await client.query("SELECT id FROM service_fee_rules WHERE status='ACTIVE' AND effective_from<=now() AND (effective_until IS NULL OR effective_until>now())")).rowCount) {
      await postgresCart.saveServiceFeeRule({id:randomUUID(),fee_type:'PERCENTAGE',percentage_basis_points:250,fixed_fee_minor:0,minimum_fee_minor:2000,maximum_fee_minor:10000,status:'ACTIVE',effective_from:effectiveFrom});counts.serviceRules++;
    }
    const after = (await client.query('SELECT i.* FROM menu_items i JOIN menus m ON m.id=i.menu_id WHERE m.merchant_id=$1', [merchantId])).rows;
    for (const old of before) assert.deepEqual(after.find(i => i.id===old.id),old,'Existing item changed');
    const delivery = await postgresCart.getDeliveryPricingRuleForZone();
    const fee = await postgresCart.getServiceFeeRule();
    if(counts.deliveryRules) {
      assert.equal(pricingService.calculateDeliveryFee(3000,delivery).fee_minor,10000);
      assert.equal(pricingService.calculateDeliveryFee(4001,delivery).fee_minor,16000);
      assert.equal(pricingService.calculateDeliveryFee(1000000,delivery).fee_minor,100000);
      assert.equal(pricingService.calculateDeliveryFee(2000001,delivery).is_within_range,false);
    }
    if(counts.serviceRules) for(const [basket,expected] of [[10000,2000],[100000,2500],[1000000,10000]]) assert.equal(pricingService.calculateServiceFee(basket,fee),expected);
    if(Object.entries(counts).some(([key,value])=>key!=='menus' && value>0)) await authRepository.createAuditLog({actor_user_id:actor,actor_role:UserRole.ADMIN,action:'LOCAL_TEST_CATALOGUE_CONFIGURED',resource_type:'MERCHANT',resource_id:merchantId,metadata:{...counts,purpose:'User-authorized local testing; prices require review before launch',deliveryRuleId:delivery.id,serviceFeeRuleId:fee.id}});
    console.log(JSON.stringify(counts));
  });
} finally { await closeDbPool(); }
