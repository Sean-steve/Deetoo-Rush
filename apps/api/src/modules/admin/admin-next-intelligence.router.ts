import {Router,Response,NextFunction} from 'express';
import {z} from 'zod';
import {config} from '@deetoo/config';
import {UserRole} from '@deetoo/types';
import {requireAuth,requireRole,AuthenticatedRequest} from '../auth/auth.middleware';
import {getDbPool} from '../../db/client';
import {withTransaction} from '../../db/transaction';
import {AppError} from '../../middleware/error-handler';
import {freezeCampaignRecipients,eligibleCampaignAudience,enqueueApprovedCampaign,campaignDeliverySummary} from './admin-next-campaigns.service';

export const adminNextIntelligenceRouter=Router();
adminNextIntelligenceRouter.use(requireAuth,requireRole(UserRole.SUPER_ADMIN,UserRole.ADMIN,UserRole.OPS,UserRole.SUPPORT,UserRole.FINANCE));
const uuid=z.string().uuid(),reason=z.string().trim().min(5).max(2000);
const run=(handler:(req:AuthenticatedRequest,res:Response)=>Promise<void>)=>(req:AuthenticatedRequest,res:Response,next:NextFunction)=>{void handler(req,res).catch(next);};
const postgres=()=>{if(config.storage.mode!=='postgres')throw new AppError(409,'POSTGRES_REQUIRED','Admin reporting/communications require durable storage');};
const admin=(req:AuthenticatedRequest)=>req.user!.roles.some(r=>[UserRole.ADMIN,UserRole.SUPER_ADMIN].includes(r));
const superAdmin=(req:AuthenticatedRequest)=>req.user!.roles.includes(UserRole.SUPER_ADMIN);
const requireOperator=(req:AuthenticatedRequest)=>{if(!admin(req)&&!req.user!.roles.includes(UserRole.OPS))throw new AppError(403,'FORBIDDEN_ROLE','Operations or administrator role required');};
const requireSuper=(req:AuthenticatedRequest)=>{if(!superAdmin(req))throw new AppError(403,'FORBIDDEN_ROLE','Super Admin role required');};
const paging=z.object({limit:z.coerce.number().int().min(1).max(100).default(25),offset:z.coerce.number().int().min(0).default(0)});
async function audit(client:any,req:AuthenticatedRequest,action:string,type:string,id:string,why:string,before:unknown,after:unknown){
 await client.query('INSERT INTO admin_change_audit(actor_id,action,resource_type,resource_id,reason,before_values,after_values) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)',[req.user!.id,action,type,id,why,JSON.stringify(before),JSON.stringify(after)]);
}
const reportMetric=z.enum(['ORDERS','REVENUE','DELIVERIES','MERCHANTS','CUSTOMERS','SUPPORT','INCIDENTS','PAYOUTS']);
const report=z.object({name:z.string().trim().min(3).max(120),metric:reportMetric,filters:z.object({county_code:z.string().regex(/^\d{3}$/).nullable().optional(),from:z.string().datetime().optional(),to:z.string().datetime().optional(),status:z.string().max(45).optional()}).default({}),cadence:z.enum(['MANUAL','WEEKLY','MONTHLY']).default('MANUAL')});
// Reporting is saved for an individual staff user; cadence is a preference, not a claim that background email jobs run.
adminNextIntelligenceRouter.get('/reports',run(async(req,res)=>{
 postgres();const {limit,offset}=paging.parse(req.query);
 const result=await getDbPool().query('SELECT id,owner_id,name,metric,filters,cadence,created_at,updated_at FROM admin_saved_reports WHERE owner_id=$1 ORDER BY updated_at DESC LIMIT $2 OFFSET $3',[req.user!.id,limit,offset]);
 res.json({data:result.rows,meta:{limit,offset}});
}));
adminNextIntelligenceRouter.post('/reports',run(async(req,res)=>{
 postgres();const body=report.parse(req.body);
 const row=await withTransaction(async client=>{
  const count=await client.query('SELECT count(*)::int AS n FROM admin_saved_reports WHERE owner_id=$1',[req.user!.id]);
  if(count.rows[0].n>=100)throw new AppError(409,'REPORT_LIMIT_REACHED','Maximum of 100 saved reports per administrator');
  const created=await client.query('INSERT INTO admin_saved_reports(owner_id,name,metric,filters,cadence) VALUES($1,$2,$3,$4::jsonb,$5) ON CONFLICT(owner_id,name) DO NOTHING RETURNING *',[req.user!.id,body.name,body.metric,JSON.stringify(body.filters),body.cadence]);
  if(!created.rows[0])throw new AppError(409,'DUPLICATE_REPORT','Report name already exists');
  return created.rows[0];
 });
 res.status(201).json({data:row});
}));
adminNextIntelligenceRouter.patch('/reports/:id',run(async(req,res)=>{
 postgres();const id=uuid.parse(req.params.id),body=report.partial().parse(req.body);
 const result=await getDbPool().query('UPDATE admin_saved_reports SET name=COALESCE($3,name),metric=COALESCE($4,metric),filters=COALESCE($5::jsonb,filters),cadence=COALESCE($6,cadence),updated_at=now() WHERE id=$1 AND owner_id=$2 RETURNING *',[id,req.user!.id,body.name||null,body.metric||null,body.filters?JSON.stringify(body.filters):null,body.cadence||null]);
 if(!result.rows[0])throw new AppError(404,'REPORT_NOT_FOUND','Saved report not found');
 res.json({data:result.rows[0]});
}));
adminNextIntelligenceRouter.delete('/reports/:id',run(async(req,res)=>{
 postgres();const id=uuid.parse(req.params.id);
 const result=await getDbPool().query('DELETE FROM admin_saved_reports WHERE id=$1 AND owner_id=$2 RETURNING id',[id,req.user!.id]);
 if(!result.rows[0])throw new AppError(404,'REPORT_NOT_FOUND','Saved report not found');res.json({data:result.rows[0]});
}));

const analyticalFilters=z.object({from:z.string().datetime().optional(),to:z.string().datetime().optional(),county_code:z.string().regex(/^\d{3}$/).optional(),bucket:z.enum(['day','week','month']).default('day')});
adminNextIntelligenceRouter.get('/analytics/series',run(async(req,res)=>{
 postgres();const {from,to,county_code,bucket}=analyticalFilters.parse(req.query);
 if(from&&to&&Date.parse(from)>Date.parse(to))throw new AppError(400,'DATE_RANGE_INVALID','Start date must be before end date');
 if(from&&to&&Date.parse(to)-Date.parse(from)>366*86400000)throw new AppError(400,'DATE_RANGE_TOO_LARGE','Maximum reporting range is 366 days');
 // Buckets are whitelisted; money is captured payment minor units, not mock order totals.
 const orders=await getDbPool().query('SELECT date_trunc($1::text,o.created_at AT TIME ZONE \'Africa/Nairobi\') AS bucket,count(*)::int AS orders,count(*) FILTER(WHERE o.status=\'COMPLETED\')::int AS completed,count(*) FILTER(WHERE o.status IN (\'CANCELLED\',\'REJECTED\'))::int AS cancelled FROM orders o LEFT JOIN service_zones z ON z.id=o.service_zone_id WHERE ($2::timestamptz IS NULL OR o.created_at >= $2) AND ($3::timestamptz IS NULL OR o.created_at < $3) AND ($4::text IS NULL OR z.county_code=$4) GROUP BY 1 ORDER BY 1',[bucket,from||null,to||null,county_code||null]);
 const payments=await getDbPool().query('SELECT date_trunc($1::text,p.created_at AT TIME ZONE \'Africa/Nairobi\') AS bucket,COALESCE(sum(p.captured_minor) FILTER (WHERE p.status IN (\'CAPTURED\',\'PARTIALLY_REFUNDED\',\'REFUNDED\')),0)::bigint::text AS captured_minor, COALESCE(sum(p.refunded_minor),0)::bigint::text AS refunded_minor FROM payments p JOIN orders o ON o.id=p.order_id LEFT JOIN service_zones z ON z.id=o.service_zone_id WHERE ($2::timestamptz IS NULL OR p.created_at >= $2) AND ($3::timestamptz IS NULL OR p.created_at < $3) AND ($4::text IS NULL OR z.county_code=$4) GROUP BY 1 ORDER BY 1',[bucket,from||null,to||null,county_code||null]);
 res.json({data:{orders:orders.rows,payments:payments.rows},meta:{bucket,timezone:'Africa/Nairobi',currency:'KES',money_unit:'minor'}});
}));
adminNextIntelligenceRouter.get('/analytics/top-merchants',run(async(req,res)=>{
 postgres();const {from,to,county_code}=analyticalFilters.parse(req.query);
 const result=await getDbPool().query('SELECT m.id,m.display_name AS name,count(o.id)::int AS orders,coalesce(sum(o.total_minor) FILTER(WHERE o.status=\'COMPLETED\'),0)::bigint::text AS completed_gmv_minor FROM orders o JOIN merchant_branches b ON b.id=o.branch_id JOIN merchants m ON m.id=b.merchant_id LEFT JOIN service_zones z ON z.id=o.service_zone_id WHERE ($1::timestamptz IS NULL OR o.created_at >= $1) AND ($2::timestamptz IS NULL OR o.created_at < $2) AND ($3::text IS NULL OR z.county_code=$3) GROUP BY m.id,m.display_name ORDER BY orders DESC LIMIT 20',[from||null,to||null,county_code||null]);
 res.json({data:result.rows,meta:{currency:'KES',money_unit:'minor',metric_note:'Completed order GMV is not identical to captured net revenue'}});
}));

// Operator attention inbox draws from real incidents and support cases, unlike outbound delivery receipts.
adminNextIntelligenceRouter.get('/notifications',run(async(req,res)=>{
 postgres();const {limit,offset}=paging.parse(req.query);
 const result=await getDbPool().query('SELECT n.event_type,n.event_id,n.title,n.summary,n.event_at,r.read_at FROM (SELECT \'INCIDENT\'::text AS event_type,i.id AS event_id,i.summary AS title,i.severity::text AS summary,i.created_at AS event_at FROM operational_incidents i UNION ALL SELECT \'SUPPORT\'::text,c.id,c.case_number::text,c.status::text,c.created_at FROM support_cases c) n LEFT JOIN admin_attention_reads r ON r.user_id=$1 AND r.event_type=n.event_type AND r.event_id=n.event_id ORDER BY n.event_at DESC LIMIT $2 OFFSET $3',[req.user!.id,limit,offset]);
 res.json({data:result.rows,meta:{limit,offset}});
}));
adminNextIntelligenceRouter.post('/notifications/read-all',run(async(req,res)=>{
 postgres();const type=z.enum(['INCIDENT','SUPPORT']).optional().parse(req.body?.event_type);
 const result=await getDbPool().query('INSERT INTO admin_attention_reads(user_id,event_type,event_id) SELECT $1,source.event_type,source.id FROM (SELECT \'INCIDENT\'::text AS event_type,id FROM operational_incidents UNION ALL SELECT \'SUPPORT\'::text,id FROM support_cases) source WHERE ($2::text IS NULL OR source.event_type=$2) ON CONFLICT(user_id,event_type,event_id) DO NOTHING RETURNING event_id',[req.user!.id,type||null]);
 res.json({data:{marked_read:result.rowCount}});
}));
adminNextIntelligenceRouter.post('/notifications/:type/:id/read',run(async(req,res)=>{
 postgres();const type=z.enum(['INCIDENT','SUPPORT']).parse(req.params.type),id=uuid.parse(req.params.id);
 const table=type==='INCIDENT'?'operational_incidents':'support_cases';
 const exists=await getDbPool().query('SELECT id FROM '+table+' WHERE id=$1',[id]);
 if(!exists.rows[0])throw new AppError(404,'ATTENTION_EVENT_NOT_FOUND','Alert not found');
 await getDbPool().query('INSERT INTO admin_attention_reads(user_id,event_type,event_id) VALUES($1,$2,$3) ON CONFLICT(user_id,event_type,event_id) DO UPDATE SET read_at=now()',[req.user!.id,type,id]);
 res.json({data:{event_type:type,event_id:id,read:true}});
}));

const channel=z.enum(['IN_APP','EMAIL','SMS','PUSH']),audience=z.enum(['ALL','CUSTOMERS','MERCHANTS','RIDERS']);
const template=z.object({name:z.string().trim().min(3).max(100),title:z.string().trim().min(5).max(180),body:z.string().trim().min(10).max(4000),channel});
adminNextIntelligenceRouter.get('/communications/templates',run(async(_req,res)=>{
 postgres();const result=await getDbPool().query("SELECT id,name,title,body,channel,status,created_at,updated_at FROM admin_message_templates WHERE status<>'ARCHIVED' ORDER BY name LIMIT 100");
 res.json({data:result.rows});
}));
adminNextIntelligenceRouter.post('/communications/templates',run(async(req,res)=>{
 postgres();requireOperator(req);const body=template.parse(req.body);
 const row=await withTransaction(async client=>{
  const r=await client.query('INSERT INTO admin_message_templates(name,title,body,channel,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$5) ON CONFLICT(name) DO NOTHING RETURNING *',[body.name,body.title,body.body,body.channel,req.user!.id]);
  if(!r.rows[0])throw new AppError(409,'TEMPLATE_EXISTS','Template name already exists');
  await audit(client,req,'COMMUNICATION_TEMPLATE_CREATED','TEMPLATE',r.rows[0].id,body.name,{}, {channel:body.channel});
  return r.rows[0];
 });res.status(201).json({data:row});
}));
adminNextIntelligenceRouter.patch('/communications/templates/:id',run(async(req,res)=>{
 postgres();requireOperator(req);const id=uuid.parse(req.params.id),body=template.partial().extend({reason}).parse(req.body);
 const result=await withTransaction(async client=>{
  const locked=await client.query('SELECT * FROM admin_message_templates WHERE id=$1 FOR UPDATE',[id]);if(!locked.rows[0])throw new AppError(404,'TEMPLATE_NOT_FOUND','Template not found');
  if(locked.rows[0].status!=='DRAFT')throw new AppError(409,'TEMPLATE_IMMUTABLE','Only draft templates can be edited');
  const row=await client.query('UPDATE admin_message_templates SET name=COALESCE($2,name),title=COALESCE($3,title),body=COALESCE($4,body),channel=COALESCE($5,channel),updated_by=$6,updated_at=now() WHERE id=$1 RETURNING *',[id,body.name||null,body.title||null,body.body||null,body.channel||null,req.user!.id]);
  await audit(client,req,'COMMUNICATION_TEMPLATE_EDITED','TEMPLATE',id,body.reason,{version:locked.rows[0].updated_at},{version:row.rows[0].updated_at});return row.rows[0];
 });res.json({data:result});
}));

const campaign=z.object({title:z.string().trim().min(5).max(180),body:z.string().trim().min(10).max(4000),audience,channel,classification:z.enum(['OPERATIONAL','MARKETING']).default('OPERATIONAL'),priority:z.enum(['NORMAL','IMPORTANT','URGENT']).default('NORMAL'),template_id:uuid.nullable().optional()});
adminNextIntelligenceRouter.get('/communications/campaigns',run(async(req,res)=>{
 postgres();const {limit,offset}=paging.parse(req.query);
 const r=await getDbPool().query('SELECT id,title,body,audience,channel,classification,priority,status,template_id,created_by,approved_by,approved_at,recipient_count,created_at FROM admin_campaigns ORDER BY created_at DESC LIMIT $1 OFFSET $2',[limit,offset]);res.json({data:r.rows,meta:{limit,offset}});
}));
adminNextIntelligenceRouter.post('/communications/campaigns',run(async(req,res)=>{
 postgres();requireOperator(req);const body=campaign.parse(req.body);
 const row=await withTransaction(async client=>{
  const r=await client.query('INSERT INTO admin_campaigns(title,body,audience,channel,classification,priority,template_id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[body.title,body.body,body.audience,body.channel,body.classification,body.priority,body.template_id||null,req.user!.id]);
  await audit(client,req,'CAMPAIGN_DRAFTED','CAMPAIGN',r.rows[0].id,body.title,{},body);return r.rows[0];
 });res.status(201).json({data:row});
}));
adminNextIntelligenceRouter.post('/communications/campaigns/:id/approve',run(async(req,res)=>{
 postgres();requireSuper(req);const id=uuid.parse(req.params.id),{reason:why}=z.object({reason}).parse(req.body);
 const row=await withTransaction(async client=>{
  const locked=await client.query('SELECT * FROM admin_campaigns WHERE id=$1 FOR UPDATE',[id]);const c=locked.rows[0];
  if(!c)throw new AppError(404,'CAMPAIGN_NOT_FOUND','Campaign not found');
  if(c.status!=='DRAFT')throw new AppError(409,'CAMPAIGN_NOT_DRAFT','Campaign must be draft');
  if(c.created_by===req.user!.id)throw new AppError(403,'SELF_APPROVAL_NOT_ALLOWED','A second Super Admin must review the campaign');
  await freezeCampaignRecipients(client,c);
  const r=await client.query("UPDATE admin_campaigns SET status='APPROVED',approved_by=$2,approval_reason=$3,approved_at=now(),updated_at=now() WHERE id=$1 RETURNING *",[id,req.user!.id,why]);
  await audit(client,req,'CAMPAIGN_APPROVED','CAMPAIGN',id,why,{status:'DRAFT'},{status:'APPROVED'});return r.rows[0];
 });res.json({data:row});
}));
adminNextIntelligenceRouter.post('/communications/campaigns/:id/cancel',run(async(req,res)=>{
 postgres();requireOperator(req);const id=uuid.parse(req.params.id),{reason:why}=z.object({reason}).parse(req.body);
 const row=await withTransaction(async client=>{
  const r=await client.query("UPDATE admin_campaigns SET status='CANCELLED',updated_at=now() WHERE id=$1 AND status IN ('DRAFT','APPROVED') RETURNING *",[id]);
  if(!r.rows[0])throw new AppError(409,'CAMPAIGN_NOT_CANCELLABLE','Campaign not found or already queued');
  await audit(client,req,'CAMPAIGN_CANCELLED','CAMPAIGN',id,why,{}, {status:'CANCELLED'});return r.rows[0];
 });res.json({data:row});
}));
// Queue approved, frozen, consented recipients. The existing notification worker owns provider delivery.
adminNextIntelligenceRouter.post('/communications/campaigns/:id/send',run(async(req,res)=>{
 postgres();requireSuper(req);const id=uuid.parse(req.params.id);
 const key=z.string().min(16).max(120).parse(req.headers['idempotency-key']);
 const queued=await withTransaction(async client=>{
  const existing=await client.query('SELECT * FROM admin_campaigns WHERE id=$1 FOR UPDATE',[id]);
  if(!existing.rows[0])throw new AppError(404,'CAMPAIGN_NOT_FOUND','Campaign not found');
  if(existing.rows[0].status==='QUEUED' && existing.rows[0].dispatch_idempotency_key!==key)
   throw new AppError(409,'CAMPAIGN_ALREADY_QUEUED','Campaign has already been published with another key');
  return enqueueApprovedCampaign(client,existing.rows[0],req.user!.id,key);
 });
 res.status(202).json({data:queued});
}));
adminNextIntelligenceRouter.get('/communications/campaigns/:id/delivery',run(async(req,res)=>{
 postgres();const id=uuid.parse(req.params.id);
 const c=await getDbPool().query('SELECT id,status,recipient_count FROM admin_campaigns WHERE id=$1',[id]);
 if(!c.rows[0])throw new AppError(404,'CAMPAIGN_NOT_FOUND','Campaign not found');
 res.json({data:{...c.rows[0],breakdown:await campaignDeliverySummary(getDbPool(),id)}});
}));

adminNextIntelligenceRouter.get('/communications/audience-preview',run(async(req,res)=>{
 postgres();const kind=audience.parse(req.query.audience||'ALL');
 const channel=z.enum(['IN_APP','EMAIL','SMS','PUSH']).parse(req.query.channel||'IN_APP');
 const eligible=await eligibleCampaignAudience(getDbPool(),{audience:kind,channel});
 res.json({data:{audience:kind,channel,eligible_confirmed:eligible.length,limit:250,over_limit:eligible.length>250,consent_source:'SELF_SERVICE',explanation:'Confirmed recipients are active users explicitly subscribed to this channel; freezing occurs on independent approval.'}});
}));
