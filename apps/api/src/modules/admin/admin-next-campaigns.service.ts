import {AppError} from '../../middleware/error-handler';
import {config} from '@deetoo/config';
import {notificationService} from '../operations/notification.service';

type Campaign={
 id:string;audience:'ALL'|'CUSTOMERS'|'MERCHANTS'|'RIDERS';channel:'IN_APP'|'EMAIL'|'SMS'|'PUSH';
 status:string;title:string;body:string;classification:string;approved_by:string|null;
};
const MAX_AUDIENCE=250;
/** Broadcasts always require recipient opt-in. Transactional order alerts do not use this API. */
export async function eligibleCampaignAudience(client:any,campaign:Pick<Campaign,'audience'|'channel'>){
 const result=await client.query(
  `WITH permitted AS (
     SELECT cp.user_id,'CUSTOMER'::text AS recipient_type FROM customer_profiles cp WHERE $1 IN ('ALL','CUSTOMERS')
     UNION ALL
     SELECT mm.user_id,'MERCHANT'::text FROM merchant_memberships mm WHERE mm.status='ACTIVE' AND $1 IN ('ALL','MERCHANTS')
     UNION ALL
     SELECT rp.user_id,'RIDER'::text FROM rider_profiles rp WHERE $1 IN ('ALL','RIDERS')
   )
   SELECT DISTINCT ON (p.user_id) p.user_id,p.recipient_type
   FROM permitted p JOIN users u ON u.id=p.user_id AND u.status='ACTIVE'
   JOIN admin_broadcast_consents bc ON bc.user_id=p.user_id AND bc.channel=$2 AND bc.consented=true
   WHERE ($2<>'EMAIL' OR u.email IS NOT NULL) AND ($2<>'SMS' OR u.phone_e164 IS NOT NULL)
   ORDER BY p.user_id,p.recipient_type LIMIT $3`,
  [campaign.audience,campaign.channel,MAX_AUDIENCE+1]);
 return result.rows as Array<{user_id:string;recipient_type:'CUSTOMER'|'MERCHANT'|'RIDER'}>;
}
export function assertCampaignProvider(channel:Campaign['channel']):void{
 if(channel==='IN_APP')return;
 if(channel==='EMAIL'&&process.env.RESEND_API_KEY&&process.env.AUTH_EMAIL_FROM)return;
 if(channel==='SMS'&&process.env.AFRICASTALKING_API_KEY&&process.env.AFRICASTALKING_USERNAME)return;
 if(channel==='PUSH'&&process.env.FCM_PROJECT_ID&&process.env.FCM_CLIENT_EMAIL&&process.env.FCM_PRIVATE_KEY)return;
 throw new AppError(503,'CAMPAIGN_PROVIDER_NOT_CONFIGURED','Broadcast provider is not configured for channel '+channel);
}
export async function assertCampaignNotPaused(client:any):Promise<void>{
 const row=await client.query("SELECT value FROM admin_configuration WHERE key='notification_campaign_paused'");
 if(row.rows[0]?.value===true)throw new AppError(409,'CAMPAIGNS_PAUSED','Campaign publishing is paused');
}
export async function freezeCampaignRecipients(client:any,campaign:Campaign){
 const audience=await eligibleCampaignAudience(client,campaign);
 if(!audience.length)throw new AppError(409,'NO_CONSENTED_RECIPIENTS','No active recipients have opted in to this channel');
 if(audience.length>MAX_AUDIENCE)throw new AppError(409,'AUDIENCE_TOO_LARGE','Limit campaigns to 250 consented recipients');
 for(const r of audience){
  await client.query('INSERT INTO admin_campaign_recipients(campaign_id,recipient_type,recipient_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[campaign.id,r.recipient_type,r.user_id]);
 }
 const update=await client.query('UPDATE admin_campaigns SET recipient_count=$2,audience_frozen_at=now() WHERE id=$1 RETURNING recipient_count,audience_frozen_at',[campaign.id,audience.length]);
 return update.rows[0];
}
export async function enqueueApprovedCampaign(client:any,campaign:Campaign,actorId:string,requestKey:string){
 if(config.storage.mode!=='postgres')throw new AppError(409,'POSTGRES_REQUIRED','Durable outbox required');
 await assertCampaignNotPaused(client);
 assertCampaignProvider(campaign.channel);
 if(campaign.status==='QUEUED')return {campaign_id:campaign.id,status:'QUEUED',queued_recipients:0,idempotent:true};
 if(campaign.status!=='APPROVED')throw new AppError(409,'CAMPAIGN_NOT_APPROVED','Independent Super Admin approval required');
 if(campaign.approved_by===actorId)throw new AppError(403,'SELF_SEND_NOT_ALLOWED','Approving Super Admin cannot also initiate this broadcast');
 const targets=await client.query('SELECT recipient_id,recipient_type,notification_id FROM admin_campaign_recipients WHERE campaign_id=$1 ORDER BY recipient_id FOR UPDATE',[campaign.id]);
 if(!targets.rows.length)throw new AppError(409,'EMPTY_AUDIENCE','Approved campaign lacks a frozen recipient snapshot');
 let queued=0,skipped=0;
 for(const r of targets.rows){
  if(r.notification_id){queued++;continue;}
  const consent=await client.query(
   "SELECT 1 FROM users u JOIN admin_broadcast_consents bc ON bc.user_id=u.id WHERE u.id=$1 AND u.status='ACTIVE' AND bc.channel=$2 AND bc.consented=true",
   [r.recipient_id,campaign.channel]);
  if(!consent.rowCount){
   await client.query("UPDATE admin_campaign_recipients SET status='SKIPPED' WHERE campaign_id=$1 AND recipient_type=$2 AND recipient_id=$3",[campaign.id,r.recipient_type,r.recipient_id]);
   skipped++;continue;
  }
  const notification=await notificationService.sendNotification({
   recipientType:r.recipient_type,recipientId:r.recipient_id,channel:campaign.channel,
   templateCode:'ADMIN_CAMPAIGN',subject:campaign.title,
   payload:{campaignId:campaign.id,message:campaign.body,classification:campaign.classification},
   referenceId:campaign.id
  });
  await client.query("UPDATE admin_campaign_recipients SET notification_id=$4,status='QUEUED',queued_at=now() WHERE campaign_id=$1 AND recipient_type=$2 AND recipient_id=$3",[campaign.id,r.recipient_type,r.recipient_id,notification.id]);
  queued++;
 }
 if(!queued)throw new AppError(409,'NO_ELIGIBLE_RECIPIENTS','All approved recipients withdrew consent');
 await client.query("UPDATE admin_campaigns SET status='QUEUED',queued_at=now(),dispatch_idempotency_key=$2,recipient_count=$3,updated_at=now() WHERE id=$1",[campaign.id,requestKey,queued]);
 await client.query("INSERT INTO admin_change_audit(actor_id,action,resource_type,resource_id,reason,after_values) VALUES($1,'CAMPAIGN_QUEUED','CAMPAIGN',$2,'Independently approved consented broadcast',$3::jsonb)",[actorId,campaign.id,JSON.stringify({queued,skipped,requestKey})]);
 return {campaign_id:campaign.id,status:'QUEUED',queued_recipients:queued,skipped};
}
export async function campaignDeliverySummary(client:any,id:string){
 const r=await client.query(
  `SELECT cr.status AS recipient_status,COALESCE(n.status,'NOT_QUEUED') AS delivery_status,count(*)::int AS count
   FROM admin_campaign_recipients cr LEFT JOIN notifications n ON n.id=cr.notification_id
   WHERE cr.campaign_id=$1 GROUP BY cr.status,n.status ORDER BY cr.status,n.status`,[id]);
 return r.rows;
}
