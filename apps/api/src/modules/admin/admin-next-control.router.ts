import {Router,Response,NextFunction} from 'express';
import {z} from 'zod';
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
 res.json({data:{checked_at:new Date().toISOString(),dependencies:{postgres:db,postgis,redis},mode:config.storage.mode,kind:'LIVE_READINESS',historical_uptime_available:false,provider_specific_latency_available:false}});
}));
adminNextControlRouter.get('/observability/series',run(async(_req,_res)=>{
 throw new AppError(503,'HISTORICAL_TELEMETRY_NOT_CONFIGURED','No time-series monitoring exporter is configured. Live readiness is available.');
}));
adminNextControlRouter.get('/configuration',run(async(_req,res)=>{
 postgres();const switches=await operationsRepository.getKillSwitches();
 const supported=Object.fromEntries(KILL_SWITCHES.map(key=>[key,switches[key]||{enabled:false,configured:false}]));
 res.json({data:{kill_switches:supported,unsupported_keys:['maintenance','support_intake','notification_delivery','support_sla_minutes'],source:'operational_kill_switches',write_requires:'super_admin',note:'Only supported keys shown here are backed by existing operations controls.'}});
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
adminNextControlRouter.get('/geography/counties/:code/impact',run(async(req,res)=>{
 postgres();const code=z.string().regex(/^\d{3}$/).parse(req.params.code);
 const result=await getDbPool().query("SELECT c.code,c.name,c.enabled,(SELECT count(*)::int FROM orders o JOIN service_zones z ON z.id=o.service_zone_id WHERE z.county_code=c.code AND o.status NOT IN ('COMPLETED','REJECTED','CANCELLED')) AS active_orders,(SELECT count(*)::int FROM deliveries d JOIN orders o ON o.id=d.order_id JOIN service_zones z ON z.id=o.service_zone_id WHERE z.county_code=c.code AND d.status NOT IN ('DELIVERED','CANCELLED','FAILED')) AS active_deliveries,(SELECT count(*)::int FROM service_zones z WHERE z.county_code=c.code AND z.status='ACTIVE' AND z.boundary IS NOT NULL) AS active_polygon_zones FROM operating_counties c WHERE c.code=$1",[code]);
 if(!result.rows[0])throw new AppError(404,'COUNTY_NOT_FOUND','County not found');
 res.json({data:{...result.rows[0],existing_orders_remain_live:true,note:'Preflight snapshot only. Switching county operating scope does not cancel preexisting deliveries or guarantee PostGIS serviceability.'}});
}));
