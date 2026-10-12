import {test,after} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {getDbPool,closeDbPool} from "../../apps/api/src/db/client";
import {runMigrations} from "../../scripts/db-migrate";
import {withTransaction} from "../../apps/api/src/db/transaction";
import {merchantInboxListSql} from "../../apps/api/src/modules/operations/merchant-inbox.router";

if(!process.env.DATABASE_URL?.includes("foundation")) throw new Error("Only run with the isolated foundation test database");
after(closeDbPool);

test("Merchant inbox correctly compares VARCHAR recipient with UUID viewer and isolates merchants",async()=>{
 await runMigrations();
 const merchantId=randomUUID(),otherMerchantId=randomUUID();
 const viewerId=randomUUID(),otherViewerId=randomUUID();
 const ownNoticeId=randomUUID(),directNoticeId=randomUUID(),foreignNoticeId=randomUUID();
 await assert.rejects(withTransaction(async client=>{
  await client.query("INSERT INTO users(id,email,status) VALUES($1,$2,'ACTIVE'),($3,$4,'ACTIVE')",
    [viewerId,viewerId+"@example.test",otherViewerId,otherViewerId+"@example.test"]);
  await client.query("INSERT INTO merchants(id,legal_name,display_name) VALUES($1,'Our restaurant','Our restaurant'),($2,'Other restaurant','Other restaurant')",
    [merchantId,otherMerchantId]);
  await client.query(`INSERT INTO notifications
    (id,recipient_type,recipient_id,channel,template_code,subject,idempotency_key,read_at)
    VALUES
      ($1,'MERCHANT',$2::text,'IN_APP','MERCHANT_ORDER','Our restaurant order',$3,NULL),
      ($4,'MERCHANT',$5::text,'IN_APP','MERCHANT_DIRECT','Viewer-only notice',$6,NOW()),
      ($7,'MERCHANT',$8::text,'IN_APP','MERCHANT_ORDER','Other restaurant order',$9,NULL)`,
    [ownNoticeId,merchantId,randomUUID(),directNoticeId,viewerId,randomUUID(),foreignNoticeId,otherMerchantId,randomUUID()]);
  const params=[[merchantId,viewerId],viewerId,null,"all",null,"newest",100,0];
  const result=await client.query(merchantInboxListSql,params);
  assert.equal(result.rows.length,2);
  assert.deepEqual(new Set(result.rows.map(row=>row.id)),new Set([ownNoticeId,directNoticeId]));
  assert.equal(result.rows.find(row=>row.id===directNoticeId)?.read_at != null,true);
  assert.equal(result.rows.find(row=>row.id===ownNoticeId)?.read_at,null);
  await client.query("INSERT INTO merchant_notification_views(notification_id,user_id,read_at) VALUES($1,$2,NOW())",[ownNoticeId,viewerId]);
  const unread=await client.query(merchantInboxListSql,[[merchantId,viewerId],viewerId,null,"unread",null,"newest",100,0]);
  assert.equal(unread.rows.length,0);
  const foreign=await client.query(merchantInboxListSql,[[otherMerchantId,otherViewerId],otherViewerId,null,"all",null,"newest",100,0]);
  assert.deepEqual(foreign.rows.map(row=>row.id),[foreignNoticeId]);
  throw new Error("rollback merchant inbox fixtures");
 }),/rollback merchant inbox fixtures/);
});
