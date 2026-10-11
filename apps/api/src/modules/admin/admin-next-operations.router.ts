import {Router,Response,NextFunction} from 'express';
import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {UserRole} from '@deetoo/types';
import {config} from '@deetoo/config';
import {getDbPool} from '../../db/client';
import {withTransaction} from '../../db/transaction';
import {AppError} from '../../middleware/error-handler';
import {requireAuth,requireRole,AuthenticatedRequest} from '../auth/auth.middleware';
import {operationalIncidentService} from '../operations/incident.service';
import {governanceService} from './governance.service';
import {authRepository} from '../auth/auth.repository';

export const adminNextOperationsRouter=Router();
adminNextOperationsRouter.use(requireAuth);
const run=(handler:(req:AuthenticatedRequest,res:Response)=>Promise<void>)=>(req:AuthenticatedRequest,res:Response,next:NextFunction)=>{void handler(req,res).catch(next);};
const uuid=z.string().uuid();
const reason=z.string().trim().min(5).max(2000);
const asPostgres=()=>{if(config.storage.mode!=='postgres')throw new AppError(409,'POSTGRES_REQUIRED','This administrative operation requires durable PostgreSQL');};
async function audit(client:any,req:AuthenticatedRequest,action:string,type:string,id:string|null,explanation:string,before:unknown,after:unknown){
 await client.query('INSERT INTO admin_change_audit(actor_id,action,resource_type,resource_id,reason,before_values,after_values) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)',[req.user!.id,action,type,id,explanation,JSON.stringify(before),JSON.stringify(after)]);
}
const paginator=z.object({limit:z.coerce.number().int().min(1).max(100).default(25),offset:z.coerce.number().int().min(0).default(0)});

adminNextOperationsRouter.post('/operations/incidents',requireRole(UserRole.ADMIN,UserRole.OPS),run(async(req,res)=>{
 asPostgres();
 const body=z.object({type:z.string().trim().min(3).max(80),severity:z.enum(['LOW','MEDIUM','HIGH','CRITICAL']),summary:z.string().trim().min(8).max(300),details:z.string().max(4000).optional(),reason_code:z.string().max(80).default('MANUAL_REVIEW'),order_id:uuid.optional(),delivery_id:uuid.optional(),payment_id:uuid.optional(),rider_id:uuid.optional(),merchant_id:uuid.optional()}).parse(req.body);
 const incident=await operationalIncidentService.raiseIncident({...body,actor_id:req.user!.id,actor_name:req.user!.email||'Admin Operator',metadata:{source:'ADMIN_MANUAL',actor_id:req.user!.id}});
 await withTransaction(async client=>audit(client,req,'INCIDENT_REPORTED','INCIDENT',incident.id,body.summary,{},body));
 res.status(201).json({data:incident});
}));

adminNextOperationsRouter.get('/orders/:id/notes',requireRole(UserRole.ADMIN,UserRole.OPS,UserRole.SUPPORT),run(async(req,res)=>{
 asPostgres();const id=uuid.parse(req.params.id);const {limit,offset}=paginator.parse(req.query);
 const db=await getDbPool().query('SELECT n.id,n.order_id,n.author_id,n.note,n.created_at,u.email AS author_email FROM admin_order_notes n JOIN users u ON u.id=n.author_id WHERE n.order_id=$1 ORDER BY n.created_at DESC LIMIT $2 OFFSET $3',[id,limit,offset]);
 res.json({data:db.rows,meta:{limit,offset}});
}));
adminNextOperationsRouter.post('/orders/:id/notes',requireRole(UserRole.ADMIN,UserRole.OPS,UserRole.SUPPORT),run(async(req,res)=>{
 asPostgres();const id=uuid.parse(req.params.id);const body=z.object({note:z.string().trim().min(2).max(4000)}).parse(req.body);
 const row=await withTransaction(async client=>{
  const exists=await client.query('SELECT id FROM orders WHERE id=$1',[id]);if(!exists.rows[0])throw new AppError(404,'ORDER_NOT_FOUND','Order not found');
  const inserted=await client.query('INSERT INTO admin_order_notes(order_id,author_id,note) VALUES($1,$2,$3) RETURNING *',[id,req.user!.id,body.note]);
  await audit(client,req,'ORDER_INTERNAL_NOTE','ORDER',id,'Internal note recorded',{},{note_id:inserted.rows[0].id});
  return inserted.rows[0];
 });
 res.status(201).json({data:row});
}));

adminNextOperationsRouter.get('/customers/:id/notes',requireRole(UserRole.SUPER_ADMIN,UserRole.ADMIN,UserRole.SUPPORT),run(async(req,res)=>{
 asPostgres();const id=uuid.parse(req.params.id);const {limit,offset}=paginator.parse(req.query);
 const result=await getDbPool().query('SELECT n.id,n.customer_id,n.author_id,n.note,n.created_at,u.email AS author_email FROM admin_customer_notes n JOIN users u ON u.id=n.author_id WHERE n.customer_id=$1 ORDER BY n.created_at DESC LIMIT $2 OFFSET $3',[id,limit,offset]);
 res.json({data:result.rows,meta:{limit,offset}});
}));
adminNextOperationsRouter.post('/customers/:id/notes',requireRole(UserRole.SUPER_ADMIN),run(async(req,res)=>{
 asPostgres();const id=uuid.parse(req.params.id),{note}=z.object({note:z.string().trim().min(2).max(4000)}).parse(req.body);
 const row=await withTransaction(async client=>{
  const exists=await client.query('SELECT user_id FROM customer_profiles WHERE user_id=$1',[id]);if(!exists.rows[0])throw new AppError(404,'CUSTOMER_NOT_FOUND','Customer not found');
  const result=await client.query('INSERT INTO admin_customer_notes(customer_id,author_id,note) VALUES($1,$2,$3) RETURNING *',[id,req.user!.id,note]);
  await audit(client,req,'CUSTOMER_INTERNAL_NOTE','CUSTOMER',id,'Internal case note entered',{},{note_id:result.rows[0].id});
  return result.rows[0];
 });
 res.status(201).json({data:row});
}));
const address=z.object({label:z.string().trim().min(2).max(50),recipient_name:z.string().trim().min(2).max(100),phone_e164:z.string().regex(/^\+?[1-9]\d{7,14}$/),address_text:z.string().trim().min(4).max(255),latitude:z.number().min(-4.8).max(5.5),longitude:z.number().min(33).max(42),instructions:z.string().max(2000).optional(),is_default:z.boolean().default(false),reason});
adminNextOperationsRouter.post('/customers/:id/addresses',requireRole(UserRole.SUPER_ADMIN),run(async(req,res)=>{
 asPostgres();const id=uuid.parse(req.params.id),body=address.parse(req.body);
 const row=await withTransaction(async client=>{
  const exists=await client.query('SELECT user_id FROM customer_profiles WHERE user_id=$1',[id]);if(!exists.rows[0])throw new AppError(404,'CUSTOMER_NOT_FOUND','Customer not found');
  if(body.is_default)await client.query('UPDATE addresses SET is_default=false WHERE customer_id=$1',[id]);
  const added=await client.query('INSERT INTO addresses(id,customer_id,label,recipient_name,phone_e164,address_text,latitude,longitude,instructions,is_default,location,address_line1) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,ST_SetSRID(ST_MakePoint($8,$7),4326)::geography,$6) RETURNING *',[randomUUID(),id,body.label,body.recipient_name,body.phone_e164,body.address_text,body.latitude,body.longitude,body.instructions||null,body.is_default]);
  await audit(client,req,'CUSTOMER_ADDRESS_ADDED','CUSTOMER',id,body.reason,{}, {address_id:added.rows[0].id,label:body.label});
  return added.rows[0];
 });
 res.status(201).json({data:row});
}));
adminNextOperationsRouter.patch('/customers/:id/addresses/:addressId',requireRole(UserRole.SUPER_ADMIN),run(async(req,res)=>{
 asPostgres();const id=uuid.parse(req.params.id),addressId=uuid.parse(req.params.addressId);
 const body=address.partial().required({reason:true}).parse(req.body);
 const row=await withTransaction(async client=>{
  const locked=await client.query('SELECT * FROM addresses WHERE id=$1 AND customer_id=$2 AND is_active=true FOR UPDATE',[addressId,id]);
  if(!locked.rows[0])throw new AppError(404,'ADDRESS_NOT_FOUND','Customer address not found');
  const prev=locked.rows[0],merged={...prev,...body};
  if(body.is_default)await client.query('UPDATE addresses SET is_default=false WHERE customer_id=$1',[id]);
  const result=await client.query('UPDATE addresses SET label=$3,recipient_name=$4,phone_e164=$5,address_text=$6,latitude=$7,longitude=$8,instructions=$9,is_default=$10,location=ST_SetSRID(ST_MakePoint($8,$7),4326)::geography,address_line1=$6,updated_at=now() WHERE id=$1 AND customer_id=$2 RETURNING *',[addressId,id,merged.label,merged.recipient_name,merged.phone_e164,merged.address_text,merged.latitude,merged.longitude,merged.instructions,merged.is_default]);
  await audit(client,req,'CUSTOMER_ADDRESS_CHANGED','CUSTOMER',id,body.reason,{address_id:addressId},{address_id:addressId});
  return result.rows[0];
 });
 res.json({data:row});
}));
adminNextOperationsRouter.delete('/customers/:id/addresses/:addressId',requireRole(UserRole.SUPER_ADMIN),run(async(req,res)=>{
 asPostgres();const id=uuid.parse(req.params.id),addressId=uuid.parse(req.params.addressId),{reason:why}=z.object({reason}).parse(req.body);
 const row=await withTransaction(async client=>{
  const result=await client.query('UPDATE addresses SET is_active=false,deleted_at=now(),is_default=false,updated_at=now() WHERE id=$1 AND customer_id=$2 AND is_active=true RETURNING id',[addressId,id]);
  if(!result.rows[0])throw new AppError(404,'ADDRESS_NOT_FOUND','Customer address not found');
  await audit(client,req,'CUSTOMER_ADDRESS_REMOVED','CUSTOMER',id,why,{address_id:addressId},{is_active:false});
  return result.rows[0];
 });
 res.json({data:row});
}));

const importSchema=z.object({rows:z.array(z.object({name:z.string().trim().min(2).max(120),email:z.string().email(),phone_e164:z.string().regex(/^\+?[1-9]\d{7,14}$/).optional()})).min(1).max(100)});
adminNextOperationsRouter.post('/customers/import/validate',requireRole(UserRole.SUPER_ADMIN),run(async(req,res)=>{
 asPostgres();const {rows:items}=importSchema.parse(req.body);
 const emails=items.map(x=>x.email.toLowerCase());
 if(new Set(emails).size!==emails.length)throw new AppError(409,'IMPORT_DUPLICATE_ROWS','Duplicate email in import file');
 const result=await getDbPool().query('SELECT lower(email) AS email FROM users WHERE lower(email)=ANY($1::text[])',[emails]);
 res.json({data:{total:items.length,valid:items.length-(result.rowCount||0),existing:result.rows.map(x=>x.email),requires_activation:true}});
}));
adminNextOperationsRouter.post('/customers/import',requireRole(UserRole.SUPER_ADMIN),run(async(req,res)=>{
 asPostgres();const {rows:items}=importSchema.parse(req.body);
 const emails=items.map(x=>x.email.toLowerCase());
 if(new Set(emails).size!==emails.length)throw new AppError(409,'IMPORT_DUPLICATE_ROWS','Duplicate email in import file');
 const out=[] as any[];
 for(const item of items){
  try{
   const created=await withTransaction(()=>governanceService.provision({subject_type:'CUSTOMER',name:item.name,email:item.email,phone_e164:item.phone_e164,reason:'Approved administrator customer import'}, {id:req.user!.id,role:UserRole.SUPER_ADMIN,requestId:(req as any).requestId}));
   out.push({email:item.email,status:'CREATED',user_id:created.user.id,requires_activation:true});
  }catch(error){out.push({email:item.email,status:'FAILED',code:error instanceof AppError?error.code:'PROVISION_FAILED'});}
 }
 res.status(207).json({data:out,summary:{created:out.filter(r=>r.status==='CREATED').length,failed:out.filter(r=>r.status==='FAILED').length}});
}));

adminNextOperationsRouter.get('/security/users/:id/sessions',requireRole(UserRole.SUPER_ADMIN),run(async(req,res)=>{
 asPostgres();const userId=uuid.parse(req.params.id);
 const exists=await authRepository.findUserById(userId);if(!exists)throw new AppError(404,'USER_NOT_FOUND','User not found');
 const result=await getDbPool().query('SELECT id,user_id,device_info,ip_address,created_at,last_used_at,expires_at,revoked_at FROM sessions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',[userId]);
 res.json({data:result.rows.map(x=>({...x,is_active:!x.revoked_at&&new Date(x.expires_at)>new Date()}))});
}));
adminNextOperationsRouter.post('/security/sessions/:id/revoke',requireRole(UserRole.SUPER_ADMIN),run(async(req,res)=>{
 asPostgres();const id=uuid.parse(req.params.id),{reason:why}=z.object({reason}).parse(req.body);
 const result=await withTransaction(async client=>{
  const session=await client.query('SELECT id,user_id,revoked_at FROM sessions WHERE id=$1 FOR UPDATE',[id]);
  if(!session.rows[0])throw new AppError(404,'SESSION_NOT_FOUND','Session not found');
  const revoked=await client.query('UPDATE sessions SET revoked_at=now() WHERE id=$1 AND revoked_at IS NULL RETURNING id,user_id,revoked_at',[id]);
  if(revoked.rows[0])await audit(client,req,'ADMIN_SESSION_REVOKED','SESSION',id,why,{revoked_at:null},{revoked_at:revoked.rows[0].revoked_at});
  return revoked.rows[0]||session.rows[0];
 });
 res.json({data:result});
}));
adminNextOperationsRouter.get('/governance/changes',requireRole(UserRole.SUPER_ADMIN,UserRole.ADMIN,UserRole.FINANCE),run(async(req,res)=>{
 asPostgres();const {limit,offset}=paginator.parse(req.query);
 const {rows}=await getDbPool().query('SELECT id,actor_id,action,resource_type,resource_id,reason,before_values,after_values,created_at FROM admin_change_audit ORDER BY created_at DESC LIMIT $1 OFFSET $2',[limit,offset]);
 res.json({data:rows,meta:{limit,offset}});
}));
