import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {config} from '@deetoo/config';
import {getDbPool,closeDbPool} from '../../apps/api/src/db/client';
import {withTransaction} from '../../apps/api/src/db/transaction';
import {runMigrations} from '../../scripts/db-migrate';
import {eligibleCampaignAudience,freezeCampaignRecipients,enqueueApprovedCampaign} from '../../apps/api/src/modules/admin/admin-next-campaigns.service';
import {enforceCustomerSupportIntake} from '../../apps/api/src/modules/admin/admin-next-control.router';

if(config.storage.mode!=='postgres'||!process.env.DATABASE_URL?.includes('foundation'))throw new Error('Phase 2 closure DB tests require isolated foundation database');
after(closeDbPool);

test('Admin Next migration 040 durable schema, approved campaign snapshot and consent withdrawal',async()=>{
 await runMigrations();
 const id=randomUUID(),other=randomUUID(),campaignId=randomUUID();
 await assert.rejects(withTransaction(async client=>{
  await client.query("INSERT INTO users(id,email,status) VALUES($1,$2,'ACTIVE'),($3,$4,'ACTIVE')",[id,id+'@example.test',other,other+'@example.test']);
  await client.query("INSERT INTO customer_profiles(user_id,display_name) VALUES($1,'Fixture recipient')",[id]);
  await client.query("INSERT INTO admin_campaigns(id,title,body,audience,channel,classification,created_by,status,approved_by) VALUES($1,'Consent check campaign','A strictly authenticated opt-in test broadcast','CUSTOMERS','IN_APP','OPERATIONAL',$2,'APPROVED',$3)",[campaignId,id,other]);
  const input={audience:'CUSTOMERS' as const,channel:'IN_APP' as const};
  assert.equal((await eligibleCampaignAudience(client,input)).length,0,'No consent by default');
  await client.query("INSERT INTO admin_broadcast_consents(user_id,channel,consented) VALUES($1,'IN_APP',true)",[id]);
  assert.equal((await eligibleCampaignAudience(client,{...input,channel:'SMS'})).length,0,'Consent is channel scoped');
  assert.equal((await eligibleCampaignAudience(client,input)).length,1);
  const snap=await freezeCampaignRecipients(client,{id:campaignId,...input,status:'APPROVED',title:'Consent check campaign',body:'A strictly authenticated opt-in test broadcast',classification:'OPERATIONAL',approved_by:other});
  assert.equal(snap.recipient_count,1);
  // Unsubscribe between approval and send: every frozen member is rechecked.
  await client.query("UPDATE admin_broadcast_consents SET consented=false WHERE user_id=$1",[id]);
  await assert.rejects(
   ()=>enqueueApprovedCampaign(client,{id:campaignId,...input,status:'APPROVED',title:'Consent check campaign',body:'A strictly authenticated opt-in test broadcast',classification:'OPERATIONAL',approved_by:other},id,'test-approval-attempt-withdrawal'),
   (e:any)=>e.code==='NO_ELIGIBLE_RECIPIENTS'
  );
  await client.query("UPDATE admin_broadcast_consents SET consented=true WHERE user_id=$1",[id]);
  const queued=await enqueueApprovedCampaign(client,{id:campaignId,...input,status:'APPROVED',title:'Consent check campaign',body:'A strictly authenticated opt-in test broadcast',classification:'OPERATIONAL',approved_by:other},id,'test-approval-success-idempotent');
  assert.equal(queued.queued_recipients,1);
  const outbox=await client.query("SELECT n.status,n.template_code FROM notifications n JOIN admin_campaign_recipients r ON r.notification_id=n.id WHERE r.campaign_id=$1",[campaignId]);
  assert.deepEqual(outbox.rows.map((r:any)=>r.status),['PENDING'],'Provider worker owns external delivery, no fake success');
  assert.equal(outbox.rows[0].template_code,'ADMIN_CAMPAIGN');
  throw new Error('rollback-fixtures');
 }),/rollback-fixtures/);
});

test('Support intake switch rejects only new case creation while leaving existing conversations intact',async()=>{
 await runMigrations();
 await assert.rejects(withTransaction(async client=>{
  await client.query("UPDATE admin_configuration SET value='true'::jsonb WHERE key='support_intake_paused'");
  const err=await new Promise<any>(resolve=>enforceCustomerSupportIntake({} as any,{} as any,resolve));
  assert.equal(err?.code,'SUPPORT_INTAKE_PAUSED');
  await client.query("UPDATE admin_configuration SET value='false'::jsonb WHERE key='support_intake_paused'");
  const ok=await new Promise<any>(resolve=>enforceCustomerSupportIntake({} as any,{} as any,resolve));
  assert.equal(ok,undefined);
  throw new Error('rollback-fixtures');
 }),/rollback-fixtures/);
});
