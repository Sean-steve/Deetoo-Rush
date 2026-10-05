import { randomUUID } from 'node:crypto';
import { rows,one,insert } from '../../db/adapter';
import { updateRow } from '../../db/relational';
import { withTransaction } from '../../db/transaction';
const fields:Record<string,string>={userId:'user_id',firstName:'first_name',lastName:'last_name',phone:'phone',vehicleType:'vehicle_type',vehicleRegistration:'vehicle_registration',onboardingStatus:'onboarding_status',operationalStatus:'operational_status',workStatus:'work_status',approvedAt:'approved_at',approvedBy:'approved_by',rejectedAt:'rejected_at',rejectionReason:'rejection_reason',suspendedAt:'suspended_at',suspensionReason:'suspension_reason',lastKnownLatitude:'last_known_latitude',lastKnownLongitude:'last_known_longitude',lastLocationAt:'last_location_at',createdAt:'created_at',updatedAt:'updated_at'};
const select="SELECT r.*,COALESCE((SELECT jsonb_agg(zone_id) FROM rider_service_zones WHERE rider_id=r.id),'[]'::jsonb) AS zones FROM rider_profiles r";
function mapped(r:any){if(!r)return null;return {id:r.id,...Object.fromEntries(Object.entries(fields).map(([key,col])=>[key,r[col]])),serviceZoneIds:r.zones||[]};}
function vehicle(r:any){return r?{id:r.id,riderId:r.rider_id,type:r.type,registrationNumber:r.registration_number,status:r.status,createdAt:r.created_at,updatedAt:r.updated_at}:null;}
function session(r:any){return r?{id:r.id,riderId:r.rider_id,startedAt:r.started_at,endedAt:r.ended_at,startZoneId:r.start_zone_id,endReason:r.end_reason}:null;}
const toRow=(o:any)=>Object.fromEntries(Object.entries(fields).filter(([key])=>o[key]!==undefined).map(([key,col])=>[col,o[key]]));
async function lock(id:string){await rows('SELECT id FROM rider_profiles WHERE id=$1 FOR UPDATE',[id]);}
export const postgresRider = {
  findProfileById:async(id:string)=>mapped(await one(select+' WHERE r.id=$1',[id])),
  findProfileByUserId:async(id:string)=>mapped(await one(select+' WHERE r.user_id=$1',[id])),
  createProfile:(p:any)=>withTransaction(async()=>{
    const id=p.id||randomUUID();
    await insert('rider_profiles',{id,public_code:id,vehicle_type:'MOTORBIKE',onboarding_status:'DRAFT',operational_status:'ACTIVE',work_status:'OFFLINE',...toRow(p)},['id','public_code',...Object.values(fields)]);
    // Durable profiles require explicit operational zone assignment.
    await postgresRider.assignZones(id,p.serviceZoneIds||[]);
    if(p.vehicleType)await postgresRider.upsertVehicle(id,{type:p.vehicleType,registrationNumber:p.vehicleRegistration});
    return postgresRider.findProfileById(id);
  }),
  updateProfile:(id:string,p:any)=>withTransaction(async()=>{await lock(id);if(!await updateRow('rider_profiles',id,toRow(p),Object.values(fields).filter(k=>!['user_id','created_at'].includes(k))))throw new Error('Rider profile not found');if(p.serviceZoneIds)await postgresRider.assignZones(id,p.serviceZoneIds);return postgresRider.findProfileById(id);}),
  updateWorkStatus:(id:string,workStatus:string)=>postgresRider.updateProfile(id,{workStatus}),
  findVehicleByRiderId:async(id:string)=>vehicle(await one('SELECT * FROM rider_vehicles WHERE rider_id=$1',[id])),
  upsertVehicle:(id:string,v:any)=>withTransaction(async()=>{await lock(id);return vehicle(await one(`INSERT INTO rider_vehicles(rider_id,type,registration_number,status) VALUES($1,$2,$3,COALESCE($4,'ACTIVE'))
    ON CONFLICT(rider_id) DO UPDATE SET type=$2,registration_number=$3,status=COALESCE($4,rider_vehicles.status),updated_at=now() RETURNING *`,[id,v.type,v.registrationNumber||null,v.status||null]));}),
  getAssignedZoneIds:async(id:string)=>(await rows('SELECT zone_id FROM rider_service_zones WHERE rider_id=$1',[id])).map(r=>r.zone_id),
  assignZones:(id:string,zones:string[])=>withTransaction(async()=>{await lock(id);await rows('DELETE FROM rider_service_zones WHERE rider_id=$1',[id]);for(const zone of new Set(zones))await rows('INSERT INTO rider_service_zones(rider_id,zone_id) VALUES($1,$2)',[id,zone]);return postgresRider.getAssignedZoneIds(id);}),
  getActiveSession:async(id:string)=>session(await one('SELECT * FROM rider_availability_sessions WHERE rider_id=$1 AND ended_at IS NULL',[id])),
  startSession:(id:string,zone?:string)=>withTransaction(async()=>{await lock(id);const old=await postgresRider.getActiveSession(id);if(old)return old;return session(await one('INSERT INTO rider_availability_sessions(rider_id,start_zone_id) VALUES($1,$2) RETURNING *',[id,zone||null]));}),
  endActiveSession:async(id:string,reason?:string)=>session(await one('UPDATE rider_availability_sessions SET ended_at=now(),end_reason=$2 WHERE rider_id=$1 AND ended_at IS NULL RETURNING *',[id,reason||null])),
  listSessions:async(id:string,limit=20)=>(await rows('SELECT * FROM rider_availability_sessions WHERE rider_id=$1 ORDER BY started_at DESC LIMIT $2',[id,Math.min(limit,500)])).map(session),
  updateLastLocation:async(id:string,lat:number,lng:number)=>{await rows('UPDATE rider_profiles SET last_known_latitude=$2,last_known_longitude=$3,last_location_at=now(),updated_at=now() WHERE id=$1',[id,lat,lng]);},
  listRiders:async(o:any={})=>{
    const args=[o.onboardingStatus||null,o.operationalStatus||null,o.workStatus||null,o.vehicleType||null,o.zoneId||null,o.search||null];
    const where=" WHERE ($1::text IS NULL OR r.onboarding_status=$1) AND ($2::text IS NULL OR r.operational_status=$2) AND ($3::text IS NULL OR r.work_status=$3) AND ($4::text IS NULL OR r.vehicle_type=$4) AND ($5::uuid IS NULL OR EXISTS(SELECT 1 FROM rider_service_zones WHERE rider_id=r.id AND zone_id=$5)) AND ($6::text IS NULL OR concat_ws(' ',r.first_name,r.last_name,r.phone) ILIKE '%'||$6||'%')";
    return {riders:(await rows(select+where+' ORDER BY r.created_at DESC LIMIT $7 OFFSET $8',[...args,Math.min(o.limit||50,500),o.offset||0])).map(mapped),total:Number((await one('SELECT count(*) AS n FROM rider_profiles r'+where,args)).n)};
  },
  getMetrics:async()=>{
    const r=await one(`SELECT count(*) AS total,count(*) FILTER(WHERE onboarding_status='PENDING_REVIEW') AS pending,
      count(*) FILTER(WHERE onboarding_status='APPROVED') AS approved,count(*) FILTER(WHERE operational_status='ACTIVE') AS active,
      count(*) FILTER(WHERE work_status<>'OFFLINE') AS online,count(*) FILTER(WHERE work_status='ONLINE_AVAILABLE') AS available,
      count(*) FILTER(WHERE operational_status='SUSPENDED') AS suspended,count(*) FILTER(WHERE work_status<>'OFFLINE' AND (last_location_at IS NULL OR last_location_at<now()-interval '120 seconds')) AS stale FROM rider_profiles`);
    return {totalRiders:r.total,pendingApproval:r.pending,approved:r.approved,active:r.active,online:r.online,available:r.available,suspended:r.suspended,staleLocation:r.stale};
  },
};
