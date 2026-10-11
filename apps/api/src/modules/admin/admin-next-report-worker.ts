import {config} from '@deetoo/config';
import {getDbPool} from '../../db/client';
import {withTransaction} from '../../db/transaction';
import {notificationService} from '../operations/notification.service';
import {AppError} from '../../middleware/error-handler';
import {checkDatabaseHealth,checkPostGisHealth} from '../../db/client';
import {checkRedisHealth} from '../../db/redis';

/** Run by the existing supervised automation worker, NOT from web requests.
 * Lock individual definitions and queue only owner-addressed authenticated report digests. */
export async function processDueAdminReports(limit=20):Promise<{queued:number;skipped:number}>{
 if(config.storage.mode!=='postgres')return {queued:0,skipped:0};
 if(!process.env.RESEND_API_KEY||!process.env.AUTH_EMAIL_FROM)return {queued:0,skipped:0};
 let queued=0,skipped=0;
 for(let attempt=0;attempt<Math.min(Math.max(limit,1),20);attempt++){
  const result=await withTransaction(async client=>{
   const row=await client.query(
    `SELECT r.*,u.email,u.status AS user_status FROM admin_saved_reports r
      JOIN users u ON u.id=r.owner_id WHERE r.delivery_enabled=true AND r.cadence IN ('WEEKLY','MONTHLY')
      AND r.next_run_at<=now() ORDER BY r.next_run_at ASC LIMIT 1 FOR UPDATE OF r SKIP LOCKED`);
   if(!row.rows[0])return null;
   const report=row.rows[0];
   if(report.user_status!=='ACTIVE'||!report.email){
    await client.query("UPDATE admin_saved_reports SET delivery_enabled=false,next_run_at=NULL WHERE id=$1",[report.id]);
    return {status:'SKIPPED'};
   }
   // Never grant/retain finance data when a staff role changes after report creation.
   const role=await client.query("SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=$1 AND r.code IN ('super_admin','admin','ops','support','finance') LIMIT 1",[report.owner_id]);
   if(!role.rowCount){
    await client.query("UPDATE admin_saved_reports SET delivery_enabled=false,next_run_at=NULL WHERE id=$1",[report.id]);
    return {status:'SKIPPED'};
   }
   const slot=new Date(report.next_run_at).toISOString();
   const previous=await client.query('SELECT 1 FROM admin_report_delivery_runs WHERE report_id=$1 AND cadence_slot=$2',[report.id,slot]);
   if(previous.rowCount){
    await client.query("UPDATE admin_saved_reports SET next_run_at=CASE WHEN cadence='WEEKLY' THEN next_run_at+interval '7 days' ELSE next_run_at+interval '1 month' END WHERE id=$1",[report.id]);
    return {status:'SKIPPED'};
   }
   const record=await client.query('INSERT INTO admin_report_delivery_runs(report_id,cadence_slot) VALUES($1,$2) RETURNING id',[report.id,slot]);
   // Digest contains no PII or ledger details; recipient authenticates in the Admin UI for the full report.
   const note=await notificationService.sendNotification({
    recipientType:'ADMIN',recipientId:report.owner_id,channel:'EMAIL',
    templateCode:'ADMIN_SAVED_REPORT_DIGEST',subject:'DeeToo report ready: '+report.name,
    payload:{message:'Your '+report.cadence.toLowerCase()+' saved report "'+report.name+'" is ready. Sign into DeeToo Admin to view its authorized live data.',reportId:report.id},
    referenceId:report.id+':'+slot
   });
   await client.query("UPDATE admin_report_delivery_runs SET notification_id=$2 WHERE id=$1",[record.rows[0].id,note.id]);
   await client.query("UPDATE admin_saved_reports SET last_run_at=now(),next_run_at=CASE WHEN cadence='WEEKLY' THEN next_run_at+interval '7 days' ELSE next_run_at+interval '1 month' END WHERE id=$1",[report.id]);
   return {status:'QUEUED'};
  });
  if(!result)break;
  if(result.status==='QUEUED')queued++;else skipped++;
 }
 return {queued,skipped};
}
/** Collect measured samples; unavailable dependencies record unhealthy/unknown rather than invented uptime. */
export async function sampleAdminDependencies(){
 if(config.storage.mode!=='postgres')return {recorded:0};
 const checks=[
  {service:'postgres',check:checkDatabaseHealth},
  {service:'postgis',check:checkPostGisHealth},
  {service:'redis',check:checkRedisHealth}
 ];
 let recorded=0;
 for(const item of checks){
  const t=Date.now();let status='unknown';
  try{const health=await item.check();status=String(health.status).toLowerCase();}catch{status='unhealthy';}
  if(!['healthy','degraded','unhealthy'].includes(status))status='unknown';
  try{
   await getDbPool().query('INSERT INTO admin_dependency_samples(service,status,latency_ms) VALUES($1,$2,$3)',[item.service,status,Math.max(0,Date.now()-t)]);
   recorded++;
  }catch{/* During Postgres outages the next successful cycle will resume sampling. */}
 }
 return {recorded};
}
