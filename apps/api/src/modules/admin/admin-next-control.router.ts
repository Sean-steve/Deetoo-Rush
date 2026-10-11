import {Router,Response,NextFunction} from 'express';
import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {config} from '@deetoo/config';
import {UserRole} from '@deetoo/types';
import {requireAuth,requireRole,AuthenticatedRequest} from '../auth/auth.middleware';
import {getDbPool,checkDatabaseHealth,checkPostGisHealth} from '../../db/client';
import {checkRedisHealth} from '../../db/redis';
import {withTransaction} from '../../db/transaction';
import {AppError} from '../../middleware/error-handler';
import {operationsRepository} from '../operations/operations.repository';

export const adminNextControlRouter=Router();
adminNextControlRouter.use(requireAuth,requireRole(UserRole.SUPER_ADMIN,UserRole.ADMIN,UserRole.OPS,UserRole.SUPPORT,UserRole.FINANCE));
const run=(handler:(req:AuthenticatedRequest,res:Response)=>Promise<void>)=>(req:AuthenticatedRequest,res:Response,next:NextFunction)=>{void handler(req,res).catch(next);};
const postgres=()=>{if(config.storage.mode!=='postgres')throw new AppError(409,'POSTGRES_REQUIRED','Configuration and geographic impact require durable PostgreSQL');};
const KILL_SWITCHES=['auto_dispatch_paused','zone_paused_all','payment_mpesa_paused','live_tracking_paused'] as const;
adminNextControlRouter.get('/observability/dependencies',run(async(_req,res)=>{
 const [db,postgis,redis]=await Promise.all([checkDatabaseHealth(),checkPostGisHealth(),checkRedisHealth()]);
 res.json({data:{checked_at:new Date().toISOString(),dependencies:{postgres:db,postgis,redis},mode:config.storage.mode,kind:'LIVE_READINESS',historical_uptime_available:config.storage.mode==='postgres',provider_specific_latency_available:false,note:'Measured dependency history requires the supervised automation worker.'}});
}));
adminNextControlRouter.get('/observability/series',run(async(req,res)=>{
 postgres();const query=z.object({
  service:z.enum(['postgres','postgis','redis']).optional(),
  hours:z.coerce.number().int().min(1).max(168).default(24),
  limit:z.coerce.number().int().min(1).max(500).default(200)
 }).parse(req.query);
 const values=[query.hours];
 let sql="SELECT service,status,latency_ms,observed_at FROM admin_dependency_samples WHERE observed_at >= now()-$1::integer*interval '1 hour'";
 if(query.service){values.push(query.service as any);sql+=' AND service=$2';}
 values.push(query.limit as any);
 sql+=' ORDER BY observed_at DESC LIMIT $'+values.length;
 const result=await getDbPool().query(sql,values);
 res.json({data:result.rows,meta:{live_measured:true,samples:result.rows.length,retention_window_hours:query.hours,timezone:'UTC',note:result.rows.length?'Recorded dependency checks only; not a guaranteed provider uptime SLA':'Sampling has not run yet; no synthetic historical uptime is reported.'}});
}));
adminNextControlRouter.get('/configuration',run(async(_req,res)=>{
 postgres();const switches=await operationsRepository.getKillSwitches();
 const supported=Object.fromEntries(KILL_SWITCHES.map(key=>[key,switches[key]||{enabled:false,configured:false}]));
 const flags=await getDbPool().query("SELECT key,value,updated_at FROM admin_configuration WHERE key IN ('notification_campaign_paused','support_intake_paused','maintenance_banner')");
 res.json({data:{kill_switches:supported,settings:flags.rows,unsupported_keys:['support_sla_minutes','notification_delivery_global_pause'],source:'operational_kill_switches + admin_configuration',write_requires:'super_admin',note:'Campaign and customer support pauses are enforced; maintenance is a read-only banner indicator, not an outage switch.'}});
}));
adminNextControlRouter.patch('/configuration/kill-switches/:key',requireRole(UserRole.SUPER_ADMIN),run(async(req,res)=>{
 postgres();const key=z.enum(KILL_SWITCHES).parse(req.params.key);
 const body=z.object({enabled:z.boolean(),reason:z.string().trim().min(5).max(2000)}).parse(req.body);
 const row=await withTransaction(async client=>{
  const old=await client.query('SELECT key_name,enabled FROM operational_kill_switches WHERE key_name=$1 FOR UPDATE',[key]);
  await operationsRepository.setKillSwitch(key,body.enabled,req.user!.email||req.user!.id,body.reason);
  await client.query('INSERT INTO admin_change_audit(actor_id,action,resource_type,reason,before_values,after_values) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb)',[req.user!.id,'OPERATIONAL_KILL_SWITCH_CHANGED','CONFIGURATION',body.reason,JSON.stringify({key,enabled:old.rows[0]?.enabled??null}),JSON.stringify({key,enabled:body.enabled})]);
  return {key,enabled:body.enabled};
 });
 res.json({data:row});
}));
const CONTROLLED_SETTINGS=['notification_campaign_paused','support_intake_paused','maintenance_banner'] as const;
adminNextControlRouter.patch('/configuration/settings/:key',requireRole(UserRole.SUPER_ADMIN),run(async(req,res)=>{
 postgres();const key=z.enum(CONTROLLED_SETTINGS).parse(req.params.key);
 const body=z.object({enabled:z.boolean(),reason:z.string().trim().min(10).max(2000)}).parse(req.body);
 const row=await withTransaction(async client=>{
  const previous=await client.query('SELECT value FROM admin_configuration WHERE key=$1 FOR UPDATE',[key]);
  if(!previous.rows[0])throw new AppError(503,'SETTING_NOT_INSTALLED','Configuration migration 040 is not applied');
  const result=await client.query('UPDATE admin_configuration SET value=$2::jsonb,updated_by=$3,updated_at=now() WHERE key=$1 RETURNING key,value,updated_at',[key,JSON.stringify(body.enabled),req.user!.id]);
  await client.query('INSERT INTO admin_change_audit(actor_id,action,resource_type,reason,before_values,after_values) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb)',[req.user!.id,'ADMIN_SETTING_CHANGED','CONFIGURATION',body.reason,JSON.stringify({key,enabled:previous.rows[0].value}),JSON.stringify({key,enabled:body.enabled})]);
  return result.rows[0];
 });
 res.json({data:row});
}));
/** Actual customer support intake enforcement. In-progress cases and replies remain available. */
export async function enforceCustomerSupportIntake(_req:any,_res:Response,next:NextFunction){
 try{
  if(config.storage.mode==='postgres'){
   const setting=await getDbPool().query("SELECT value FROM admin_configuration WHERE key='support_intake_paused'");
   if(setting.rows[0]?.value===true)throw new AppError(503,'SUPPORT_INTAKE_PAUSED','New customer support requests are temporarily paused; existing cases remain accessible');
  }
  next();
 }catch(error){next(error);}
}

// County commercial preferences expand into authoritative per-zone price rules that checkout already reads.
const countyFees=z.object({
 base_fee_minor:z.number().int().min(0).max(10000000),
 included_distance_meters:z.number().int().min(0).max(100000),
 per_km_fee_minor:z.number().int().min(0).max(10000000),
 minimum_fee_minor:z.number().int().min(0).max(10000000),
 maximum_fee_minor:z.number().int().min(0).max(10000000),
 max_delivery_distance_meters:z.number().int().min(100).max(100000),
 eta_buffer_min:z.number().int().min(0).max(120),
 reason:z.string().trim().min(10).max(2000)
}).refine(v=>v.maximum_fee_minor>=v.minimum_fee_minor,{message:'Maximum fee cannot be below minimum fee'});
adminNextControlRouter.get('/geography/counties/:code/commercial',run(async(req,res)=>{
 postgres();const code=z.string().regex(/^\d{3}$/).parse(req.params.code);
 const result=await getDbPool().query(
  `SELECT z.id,z.name,(z.config->>'eta_buffer_min')::integer AS eta_buffer_min,
     d.id AS pricing_rule_id,d.base_fee_minor,d.included_distance_meters,d.per_km_fee_minor,
     d.minimum_fee_minor,d.maximum_fee_minor,d.max_delivery_distance_meters
     FROM service_zones z LEFT JOIN LATERAL (
       SELECT * FROM delivery_pricing_rules WHERE zone_id=z.id AND status='ACTIVE'
       AND effective_from<=now() AND (effective_until IS NULL OR effective_until>now())
       ORDER BY created_at DESC LIMIT 1
     ) d ON true
     WHERE z.county_code=$1 AND z.status='ACTIVE' AND z.boundary IS NOT NULL ORDER BY z.name`,[code]);
 res.json({data:{county_code:code,zones:result.rows,source:'checkout_delivery_pricing_rules',note:'Only polygon-backed active zones; existing signed quotes remain unchanged'}});
}));
adminNextControlRouter.patch('/geography/counties/:code/commercial',requireRole(UserRole.SUPER_ADMIN),run(async(req,res)=>{
 postgres();const code=z.string().regex(/^\d{3}$/).parse(req.params.code),body=countyFees.parse(req.body);
 const result=await withTransaction(async client=>{
  const county=await client.query('SELECT code FROM operating_counties WHERE code=$1 FOR UPDATE',[code]);
  if(!county.rowCount)throw new AppError(404,'COUNTY_NOT_FOUND','Unknown Kenyan county code');
  const zones=await client.query("SELECT id,name FROM service_zones WHERE county_code=$1 AND status='ACTIVE' AND boundary IS NOT NULL FOR UPDATE",[code]);
  if(!zones.rowCount)throw new AppError(409,'NO_ACTIVE_POLYGONS','County has no active PostGIS delivery zones');
  if((zones.rowCount||0)>150)throw new AppError(409,'TOO_MANY_ZONES','Split this county pricing update into zonal operations');
  for(const zone of zones.rows){
   await client.query("UPDATE delivery_pricing_rules SET status='INACTIVE',effective_until=now(),updated_at=now() WHERE zone_id=$1 AND status='ACTIVE'",[zone.id]);
   await client.query(
    `INSERT INTO delivery_pricing_rules(id,zone_id,base_fee_minor,included_distance_meters,per_km_fee_minor,
        minimum_fee_minor,maximum_fee_minor,max_delivery_distance_meters,status,effective_from)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,'ACTIVE',now())`,
    ['area-'+randomUUID(),zone.id,body.base_fee_minor,body.included_distance_meters,body.per_km_fee_minor,body.minimum_fee_minor,body.maximum_fee_minor,body.max_delivery_distance_meters]);
   await client.query("UPDATE service_zones SET config=jsonb_set(COALESCE(config,'{}'::jsonb),'{eta_buffer_min}',to_jsonb($2::integer),true) WHERE id=$1",[zone.id,body.eta_buffer_min]);
  }
  await client.query('INSERT INTO admin_change_audit(actor_id,action,resource_type,reason,after_values) VALUES($1,$2,$3,$4,$5::jsonb)',[req.user!.id,'COUNTY_COMMERCIAL_RULES_CHANGED','GEOGRAPHY',body.reason,JSON.stringify({county_code:code,zone_count:zones.rowCount,pricing_minor:{base:body.base_fee_minor,min:body.minimum_fee_minor,max:body.maximum_fee_minor},eta_buffer_min:body.eta_buffer_min})]);
  return {county_code:code,updated_zones:zones.rowCount,effective:'FUTURE_CHECKOUT_QUOTES_ONLY',currency:'KES',unit:'minor'};
 });
 res.json({data:result});
}));
adminNextControlRouter.get('/geography/counties/:code/impact',run(async(req,res)=>{
 postgres();const code=z.string().regex(/^\d{3}$/).parse(req.params.code);
 const result=await getDbPool().query("SELECT c.code,c.name,c.enabled,(SELECT count(*)::int FROM orders o JOIN service_zones z ON z.id=o.service_zone_id WHERE z.county_code=c.code AND o.status NOT IN ('COMPLETED','REJECTED','CANCELLED')) AS active_orders,(SELECT count(*)::int FROM deliveries d JOIN orders o ON o.id=d.order_id JOIN service_zones z ON z.id=o.service_zone_id WHERE z.county_code=c.code AND d.status NOT IN ('DELIVERED','CANCELLED','FAILED')) AS active_deliveries,(SELECT count(*)::int FROM service_zones z WHERE z.county_code=c.code AND z.status='ACTIVE' AND z.boundary IS NOT NULL) AS active_polygon_zones FROM operating_counties c WHERE c.code=$1",[code]);
 if(!result.rows[0])throw new AppError(404,'COUNTY_NOT_FOUND','County not found');
 res.json({data:{...result.rows[0],existing_orders_remain_live:true,note:'Preflight snapshot only. Switching county operating scope does not cancel preexisting deliveries or guarantee PostGIS serviceability.'}});
}));
