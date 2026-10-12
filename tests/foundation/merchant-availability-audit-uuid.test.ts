import {test,after} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {getDbPool,closeDbPool} from "../../apps/api/src/db/client";
import {runMigrations} from "../../scripts/db-migrate";
import {withTransaction} from "../../apps/api/src/db/transaction";
import {catalogueService} from "../../apps/api/src/modules/merchant/catalogue.service";

if(!process.env.DATABASE_URL?.includes("foundation"))throw new Error("Use an isolated foundation database for this test");
after(closeDbPool);
test("branch availability toggle records a real UUID resource ID and keeps both IDs in audit metadata",async()=>{
 await runMigrations();
 const actor=randomUUID(),merchant=randomUUID(),branch=randomUUID(),menu=randomUUID(),category=randomUUID(),item=randomUUID();
 await assert.rejects(withTransaction(async db=>{
  await db.query("INSERT INTO users(id,email,status) VALUES($1,$2,'ACTIVE')",[actor,actor+"@example.test"]);
  await db.query("INSERT INTO merchants(id,legal_name,display_name) VALUES($1,'Audit Merchant','Audit Merchant')",[merchant]);
  await db.query("INSERT INTO merchant_branches(id,merchant_id,name,address_text,latitude,longitude) VALUES($1,$2,'Audit Branch','Nairobi',0,0)",[branch,merchant]);
  await db.query("INSERT INTO menus(id,merchant_id,branch_id,name,currency,is_active) VALUES($1,$2,$3,'Audit Menu','KES',true)",[menu,merchant,branch]);
  await db.query("INSERT INTO menu_categories(id,menu_id,name) VALUES($1,$2,'Main')",[category,menu]);
  await db.query("INSERT INTO menu_items(id,menu_id,category_id,name,price_minor,is_available) VALUES($1,$2,$3,'Audit test food',10000,true)",[item,menu,category]);
  const changed=await catalogueService.setItemAvailability(item,merchant,false,branch,actor);
  assert.deepEqual(changed,{item_id:item,is_available:false,branch_id:branch});
  const override=await db.query("SELECT is_available FROM menu_item_branch_overrides WHERE branch_id=$1 AND item_id=$2",[branch,item]);
  assert.equal(override.rows[0]?.is_available,false);
  const audit=await db.query("SELECT resource_id,metadata FROM audit_logs WHERE resource_type='MENU_ITEM_OVERRIDE' AND resource_id=$1 ORDER BY created_at DESC LIMIT 1",[item]);
  assert.equal(audit.rows[0]?.resource_id,item);
  assert.equal(audit.rows[0]?.metadata?.branch_id,branch);
  assert.equal(audit.rows[0]?.metadata?.item_id,item);
  const other=await catalogueService.updateBranchItemOverride(branch,item,merchant,{is_available:true},actor);
  assert.equal(other?.is_available,true);
  const rows=await db.query("SELECT resource_id,metadata FROM audit_logs WHERE resource_type='MENU_ITEM_OVERRIDE' AND resource_id=$1",[item]);
  assert.equal(rows.rowCount,2);
  assert.ok(rows.rows.every((x:any)=>x.resource_id===item&&x.metadata.branch_id===branch));
  throw new Error("rollback availability audit test fixtures");
 }),/rollback availability audit test fixtures/);
});
