import { randomUUID } from 'node:crypto';
import { rows,one,insert,identifier } from '../../db/adapter';
import { withTransaction } from '../../db/transaction';
const fields=['label','recipient_name','phone_e164','address_line1','address_line2','landmark','city','region','country_code','postal_code','latitude','longitude','delivery_instructions'];
const profileQuery=`SELECT cp.*,cp.user_id AS id,COALESCE(cp.phone,u.phone_e164,'') AS phone,COALESCE(cp.email,u.email,'') AS email FROM customer_profiles cp JOIN users u ON cp.user_id=u.id`;
async function lockCustomer(id:string){await rows('SELECT id FROM users WHERE id=$1 FOR UPDATE',[id]);}
async function location(id:string){await rows("UPDATE addresses SET location=ST_SetSRID(ST_MakePoint(longitude,latitude),4326)::geography,address_text=concat_ws(', ',address_line1,address_line2,landmark,city),updated_at=now() WHERE id=$1",[id]);}
export const postgresCustomer = {
  getProfileByUserId:(id:string)=>one(profileQuery+' WHERE cp.user_id=$1',[id]),
  upsertProfile:(p:any)=>withTransaction(async()=>{
    await lockCustomer(p.user_id);
    const old=await postgresCustomer.getProfileByUserId(p.user_id);
    const merged={...old,...p};
    if(p.default_address_id && !await one('SELECT id FROM addresses WHERE id=$1 AND customer_id=$2 AND is_active',[p.default_address_id,p.user_id]))throw new Error('Default address is not owned by customer');
    await rows(`INSERT INTO customer_profiles(user_id,display_name,first_name,last_name,phone,email,default_address_id)
      VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(user_id) DO UPDATE SET display_name=EXCLUDED.display_name,
      first_name=EXCLUDED.first_name,last_name=EXCLUDED.last_name,phone=EXCLUDED.phone,email=EXCLUDED.email,default_address_id=EXCLUDED.default_address_id,updated_at=now()`,
      [p.user_id,merged.display_name||[merged.first_name,merged.last_name].filter(Boolean).join(' ')||'Customer',merged.first_name||'',merged.last_name||'',merged.phone||null,merged.email||null,merged.default_address_id||null]);
    return postgresCustomer.getProfileByUserId(p.user_id);
  }),
  listAddressesByCustomerId:(id:string)=>rows('SELECT * FROM addresses WHERE customer_id=$1 AND is_active ORDER BY is_default DESC,created_at',[id]),
  findAddressById:(id:string)=>one('SELECT * FROM addresses WHERE id=$1 AND is_active',[id]),
  createAddress:(a:any)=>withTransaction(async()=>{
    await lockCustomer(a.customer_id);
    const first=!(await one('SELECT id FROM addresses WHERE customer_id=$1 AND is_active LIMIT 1',[a.customer_id]));
    const id=randomUUID();
    await insert('addresses',{recipient_name:"",phone_e164:"",...a,id,is_default:false,address_text:a.address_line1},['id','customer_id','address_text','is_default',...fields]);
    await location(id);
    if(first||a.is_default)await postgresCustomer.setDefaultAddress(id,a.customer_id);
    return postgresCustomer.findAddressById(id);
  }),
  updateAddress:(id:string,customer:string,a:any)=>withTransaction(async()=>{
    await lockCustomer(customer);
    if(!await one('SELECT id FROM addresses WHERE id=$1 AND customer_id=$2 AND is_active',[id,customer]))return null;
    const keys=fields.filter(k=>a[k]!==undefined);
    if(keys.length)await rows(`UPDATE addresses SET ${keys.map((k,i)=>identifier(k)+'=$'+(i+2)).join(',')} WHERE id=$1`,[id,...keys.map(k=>a[k])]);
    await location(id);
    if(a.is_default)await postgresCustomer.setDefaultAddress(id,customer);
    return postgresCustomer.findAddressById(id);
  }),
  deleteAddress:(id:string,customer:string)=>withTransaction(async()=>{
    await lockCustomer(customer);
    const existing=await one('SELECT id,is_default FROM addresses WHERE id=$1 AND customer_id=$2 AND is_active',[id,customer]);
    if(!existing)return false;
    await rows('UPDATE addresses SET is_active=false,is_default=false,deleted_at=now() WHERE id=$1',[id]);
    if(existing.is_default){
      const next=await one('SELECT id FROM addresses WHERE customer_id=$1 AND is_active ORDER BY created_at LIMIT 1',[customer]);
      await rows('UPDATE customer_profiles SET default_address_id=$2 WHERE user_id=$1',[customer,next?.id||null]);
      if(next)await postgresCustomer.setDefaultAddress(next.id,customer);
    }
    return true;
  }),
  setDefaultAddress:(id:string,customer:string)=>withTransaction(async()=>{
    await lockCustomer(customer);
    if(!await one('SELECT id FROM addresses WHERE id=$1 AND customer_id=$2 AND is_active',[id,customer]))return null;
    await rows('UPDATE addresses SET is_default=false WHERE customer_id=$1',[customer]);
    await rows('UPDATE addresses SET is_default=true WHERE id=$1',[id]);
    await rows('UPDATE customer_profiles SET default_address_id=$2 WHERE user_id=$1',[customer,id]);
    return postgresCustomer.findAddressById(id);
  }),
  listAllCustomers:async(o:any={})=>{
    const search=o.search||null;
    const where=" WHERE ($1::text IS NULL OR cp.display_name ILIKE '%'||$1||'%' OR cp.email ILIKE '%'||$1||'%')";
    const profiles=await rows(profileQuery+where+' ORDER BY cp.created_at DESC LIMIT $2 OFFSET $3',[search,Math.min(o.limit||50,500),o.offset||0]);
    return {customers:profiles,total:Number((await one('SELECT count(*) AS n FROM customer_profiles cp'+where,[search])).n)};
  },
};
