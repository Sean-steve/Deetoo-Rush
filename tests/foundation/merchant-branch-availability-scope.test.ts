import {test,after} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {getDbPool,closeDbPool} from "../../apps/api/src/db/client";
import {runMigrations} from "../../scripts/db-migrate";
import {withTransaction} from "../../apps/api/src/db/transaction";
import {merchantRepository} from "../../apps/api/src/modules/merchant/merchant.repository";
import {branchScope} from "../../apps/api/src/modules/auth/scope";
import {UserRole,UserStatus} from "@deetoo/types";

if(!process.env.DATABASE_URL?.includes("foundation"))throw new Error("Only run on the isolated foundation database");
after(closeDbPool);
test("All-branch merchant staff can access their merchant but not other merchants; explicit assignments stay restrictive",async()=>{
 await runMigrations();
 const id=randomUUID(),own=randomUUID(),foreign=randomUUID(),b1=randomUUID(),b2=randomUUID(),foreignBranch=randomUUID(),membership=randomUUID();
 await assert.rejects(withTransaction(async db=>{
  await db.query("INSERT INTO users(id,email,status) VALUES($1,$2,'ACTIVE')",[id,id+"@example.test"]);
  await db.query("INSERT INTO merchants(id,legal_name,display_name) VALUES($1,'Owned','Owned'),($2,'Foreign','Foreign')",[own,foreign]);
  await db.query("INSERT INTO merchant_branches(id,merchant_id,name,address_text,latitude,longitude) VALUES($1,$2,'A','Test',0,0),($3,$2,'B','Test',0,0),($4,$5,'Foreign','Test',0,0)",[b1,own,b2,foreignBranch,foreign]);
  await merchantRepository.createMembership({id:membership,user_id:id,merchant_id:own,role_code:"merchant_staff",status:"ACTIVE",branch_ids:[],created_at:new Date().toISOString()} as any);
  const user={id,roles:[UserRole.MERCHANT_STAFF]} as any;
  await branchScope(user,b1);
  await branchScope(user,b2);
  await assert.rejects(branchScope(user,foreignBranch),(e:any)=>e.statusCode===403);
  await merchantRepository.updateMembership(membership,{branch_ids:[b1]} as any);
  await branchScope(user,b1);
  await assert.rejects(branchScope(user,b2),(e:any)=>e.statusCode===403);
  throw new Error("rollback merchant branch scope fixtures");
 }),/rollback merchant branch scope fixtures/);
});
