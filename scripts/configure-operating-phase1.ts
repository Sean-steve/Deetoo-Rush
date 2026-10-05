import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {config} from '../packages/config/src/index';
import {UserRole} from '../packages/types/src/index';
import {withTransaction} from '../apps/api/src/db/transaction';
import {closeDbPool} from '../apps/api/src/db/client';
import {authRepository} from '../apps/api/src/modules/auth/auth.repository';
import {merchantRepository} from '../apps/api/src/modules/merchant/merchant.repository';
import {postgresCart} from '../apps/api/src/modules/cart/cart.postgres';
const targets = [
 {id:'7ea8da58-ca8d-4969-b7c3-f10569fbce23',name:'Thika Deli',latitude:-1.036648,longitude:37.077523},
 {id:'9eed47d4-4297-43e6-9274-8c74c8c006f9',name:'Mombasa',latitude:-4.05052,longitude:39.667169},
];
try {
 assert.equal(config.storage.mode,'postgres');assert.equal(config.storage.fixtures,false);
 assert(process.env.NODE_ENV!=='production' && process.env.APP_ENV!=='production','Explicit local configuration only');
 const actor=process.env.DEETOO_CONFIG_ACTOR_ID;
 assert(actor && (await authRepository.getUserRoles(actor)).includes(UserRole.ADMIN),'Existing administrator required');
 await withTransaction(async client=>{
  await client.query("SELECT pg_advisory_xact_lock(hashtext('deetoo.operating-phase1'))");
  const changed=[];
  for(const target of targets){
   const branch=await merchantRepository.findBranchById(target.id);assert.equal(branch?.name,target.name);
   const covered=await client.query("SELECT id FROM service_zones WHERE status='ACTIVE' AND name='Kenya Nationwide' AND ST_Covers(boundary,ST_SetSRID(ST_MakePoint($1,$2),4326))",[target.longitude,target.latitude]);
   assert(covered.rowCount,'Approved coordinate must be inside Kenya');
   if(Number(branch.latitude)!==target.latitude||Number(branch.longitude)!==target.longitude){
    await merchantRepository.updateBranch(target.id,{latitude:target.latitude,longitude:target.longitude});
    changed.push({id:target.id,before:{latitude:branch.latitude,longitude:branch.longitude},after:{latitude:target.latitude,longitude:target.longitude}});
   }
   const spatial=(await client.query('SELECT ST_Y(location::geometry) AS latitude,ST_X(location::geometry) AS longitude FROM merchant_branches WHERE id=$1',[target.id])).rows[0];
   assert.equal(spatial.latitude,target.latitude);assert.equal(spatial.longitude,target.longitude);
  }
  const rules=(await client.query("SELECT * FROM delivery_pricing_rules WHERE status='ACTIVE' AND effective_from<=now() AND (effective_until IS NULL OR effective_until>now()) FOR UPDATE")).rows;
  assert.equal(rules.length,1,'Review conflicting pricing rules before applying');assert.equal(rules[0].zone_id,null);
  let ruleId=rules[0].id;
  if(rules[0].max_delivery_distance_meters!==5000){
   const effective=(await client.query('SELECT now() AS value')).rows[0].value.toISOString();
   await client.query("UPDATE delivery_pricing_rules SET effective_until=now() WHERE id=$1",[ruleId]);
   const rule=await postgresCart.saveDeliveryPricingRule({...rules[0],id:randomUUID(),max_delivery_distance_meters:5000,effective_from:effective,effective_until:null});
   ruleId=rule.id;
  }
  const applied=await postgresCart.getDeliveryPricingRuleForZone();assert.equal(applied.max_delivery_distance_meters,5000);
  for(const key of ['base_fee_minor','included_distance_meters','per_km_fee_minor','minimum_fee_minor','maximum_fee_minor']) assert.equal(String(applied[key]),String(rules[0][key]),'Fee amounts must remain unchanged');
  if(changed.length||ruleId!==rules[0].id) await authRepository.createAuditLog({actor_user_id:actor,actor_role:UserRole.ADMIN,action:'OPERATING_PHASE1_CONFIGURED',resource_type:'PLATFORM_CONFIGURATION',resource_id:ruleId,metadata:{branches:changed,prior_rule:rules[0].id,active_rule:ruleId,max_delivery_distance_meters:5000,prices:'TEST_ONLY_LAUNCH_APPROVAL_PENDING'}});
  console.log(JSON.stringify({changedBranches:changed.length,replacedRule:ruleId!==rules[0].id,maxDeliveryMeters:5000,feeAmounts:'unchanged'}));
 });
} finally {await closeDbPool();}
