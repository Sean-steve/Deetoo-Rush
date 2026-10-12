import {test,after} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {getDbPool,closeDbPool} from "../../apps/api/src/db/client";
import {runMigrations} from "../../scripts/db-migrate";
import {withTransaction} from "../../apps/api/src/db/transaction";
import {branchCoverImageUrl,publishedBranchCoverIds} from "../../apps/api/src/modules/media/branch-cover";

if(!process.env.DATABASE_URL?.includes("foundation"))throw new Error("Use isolated foundation database");
after(closeDbPool);
test("customer branch cover is published only after verification and merchant approval",async()=>{
 await runMigrations();
 const id=randomUUID(),merchant=randomUUID(),branch=randomUUID(),media=randomUUID();
 await assert.rejects(withTransaction(async db=>{
  await db.query("INSERT INTO users(id,email,status) VALUES($1,$2,'ACTIVE')",[id,id+"@example.test"]);
  await db.query("INSERT INTO merchants(id,legal_name,display_name,status,approval_status) VALUES($1,'Photo merchant','Photo merchant','ACTIVE','APPROVED')",[merchant]);
  await db.query("INSERT INTO merchant_branches(id,merchant_id,name,address_text,latitude,longitude,status) VALUES($1,$2,'Photo branch','Nairobi',0,0,'ACTIVE')",[branch,merchant]);
  await db.query(`INSERT INTO media_objects(id,owner_user_id,purpose,reference_type,reference_id,bucket,object_key,content_type,status)
    VALUES($1,$2,'MERCHANT_IMAGE','BRANCH',$3,'test-media',$4,'image/webp','REQUESTED')`,[media,id,branch,randomUUID()]);
  await db.query("INSERT INTO merchant_branch_policies(branch_id,cover_media_id,updated_by) VALUES($1,$2,$3)",[branch,media,id]);
  assert.equal((await publishedBranchCoverIds([branch])).has(branch),false);
  await db.query("UPDATE media_objects SET status='VERIFIED' WHERE id=$1",[media]);
  assert.equal((await publishedBranchCoverIds([branch])).has(branch),true);
  assert.equal(branchCoverImageUrl(branch),"/api/v1/media/branches/"+branch+"/cover");
  await db.query("UPDATE merchants SET approval_status='PENDING' WHERE id=$1",[merchant]);
  assert.equal((await publishedBranchCoverIds([branch])).has(branch),false);
  await db.query("UPDATE merchants SET approval_status='APPROVED' WHERE id=$1",[merchant]);
  await db.query("UPDATE media_objects SET reference_id=$2 WHERE id=$1",[media,merchant]);
  assert.equal((await publishedBranchCoverIds([branch])).has(branch),false);
  throw new Error("rollback published branch cover fixtures");
 }),/rollback published branch cover fixtures/);
});
