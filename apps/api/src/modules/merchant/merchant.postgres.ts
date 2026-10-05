import { rows,one,insert,identifier } from '../../db/adapter';
import { withTransaction } from '../../db/transaction';
import { postgresMemberships } from './membership.postgres';
const merchantFields=['id','legal_name','display_name','slug','description','phone','email','logo_url','status','approval_status','rejection_reason','commission_bps','settlement_schedule'];
const branchFields=['id','merchant_id','name','slug','email','phone','address_line1','address_line2','landmark','city','region','country_code','postal_code','address_text','latitude','longitude','status','operational_status','timezone','currency','min_order_minor','prep_default_min'];
const branchQuery=`SELECT b.*,COALESCE((SELECT jsonb_agg(service_zone_id) FROM branch_service_zones WHERE branch_id=b.id AND status='ACTIVE'),'[]'::jsonb) AS service_zones FROM merchant_branches b`;
const zoneQuery='SELECT z.*,ST_AsGeoJSON(boundary)::jsonb AS boundary FROM service_zones z';
async function update(table:string,id:string,data:any,fields:string[]) {
  const keys=fields.filter(k=>k!=='id'&&k!=='merchant_id'&&data[k]!==undefined);
  if(!keys.length)return one(`SELECT * FROM ${identifier(table)} WHERE id=$1`,[id]);
  return one(`UPDATE ${identifier(table)} SET ${keys.map((k,i)=>identifier(k)+'=$'+(i+2)).join(',')} WHERE id=$1 RETURNING *`,[id,...keys.map(k=>data[k])]);
}
async function syncLocation(id:string){await rows('UPDATE merchant_branches SET location=ST_SetSRID(ST_MakePoint(longitude,latitude),4326)::geography WHERE id=$1',[id]);}
export const postgresMerchant = {
  ...postgresMemberships,
  findMerchantById:(id:string)=>one('SELECT * FROM merchants WHERE id=$1',[id]),
  listMerchants:async(o:any={})=>{
    const args=[o.status||null,o.approval_status||null,o.search||null];
    const where="($1::text IS NULL OR status=$1) AND ($2::text IS NULL OR approval_status=$2) AND ($3::text IS NULL OR display_name ILIKE '%'||$3||'%' OR legal_name ILIKE '%'||$3||'%')";
    return {merchants:await rows(`SELECT * FROM merchants WHERE ${where} ORDER BY created_at DESC LIMIT $4 OFFSET $5`,[...args,Math.min(o.limit||20,500),o.offset||0]),total:Number((await one(`SELECT count(*) AS n FROM merchants WHERE ${where}`,args)).n)};
  },
  createMerchant:(m:any)=>insert('merchants',m,merchantFields),
  updateMerchant:(id:string,m:any)=>update('merchants',id,m,merchantFields),
  findBranchById:(id:string)=>one(branchQuery+' WHERE b.id=$1',[id]),
  listBranchesByMerchant:(id:string)=>rows(branchQuery+' WHERE b.merchant_id=$1 ORDER BY b.name',[id]),
  listAllBranches:(o:any={})=>rows(branchQuery+" WHERE ($1::text IS NULL OR b.status=$1) AND ($2::text IS NULL OR b.operational_status=$2) AND ($3::text IS NULL OR b.name ILIKE '%'||$3||'%' OR b.address_text ILIKE '%'||$3||'%') ORDER BY b.name",[o.status||null,o.operational_status||null,o.search||null]),
  createBranch:(b:any)=>withTransaction(async()=>{await insert('merchant_branches',b,branchFields);await syncLocation(b.id);await postgresMerchant.assignBranchServiceZones(b.id,b.service_zones||[]);return postgresMerchant.findBranchById(b.id);}),
  updateBranch:(id:string,b:any)=>withTransaction(async()=>{if(!await update('merchant_branches',id,b,branchFields))return null;await syncLocation(id);return postgresMerchant.findBranchById(id);}),
  getOpeningHours:(id:string)=>rows('SELECT *,left(open_time::text,5) AS open_time,left(close_time::text,5) AS close_time FROM branch_opening_hours WHERE branch_id=$1 ORDER BY day_of_week,branch_opening_hours.open_time',[id]),
  setOpeningHours:(id:string,hours:any[])=>withTransaction(async()=>{
    await rows('DELETE FROM branch_opening_hours WHERE branch_id=$1',[id]);
    for(const hour of hours)await insert('branch_opening_hours',{...hour,branch_id:id},['id','branch_id','day_of_week','open_time','close_time','is_closed']);
    return postgresMerchant.getOpeningHours(id);
  }),
  listServiceZones:(o:any={})=>rows(zoneQuery+' WHERE ($1::text IS NULL OR z.status=$1) ORDER BY z.name',[o.status||null]),
  findServiceZoneById:(id:string)=>one(zoneQuery+' WHERE z.id=$1',[id]),
  createServiceZone:(z:any)=>withTransaction(async()=>{await insert('service_zones',z,['id','name','status','city_id','config']);if(z.boundary)await rows('UPDATE service_zones SET boundary=ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($2),4326))::geography WHERE id=$1',[z.id,JSON.stringify(z.boundary)]);return postgresMerchant.findServiceZoneById(z.id);}),
  updateServiceZone:(id:string,z:any)=>withTransaction(async()=>{if(!await update('service_zones',id,z,['name','status','city_id','config']))return null;if(z.boundary)await rows('UPDATE service_zones SET boundary=ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($2),4326))::geography WHERE id=$1',[id,JSON.stringify(z.boundary)]);return postgresMerchant.findServiceZoneById(id);}),
  assignBranchServiceZones:(id:string,zones:string[])=>withTransaction(async()=>{await rows('DELETE FROM branch_service_zones WHERE branch_id=$1',[id]);for(const zone of new Set(zones))await rows("INSERT INTO branch_service_zones(branch_id,service_zone_id,status) VALUES($1,$2,'ACTIVE')",[id,zone]);}),
  getBranchServiceZones:async(id:string)=>(await rows("SELECT service_zone_id FROM branch_service_zones WHERE branch_id=$1 AND status='ACTIVE'",[id])).map(r=>r.service_zone_id),
};
