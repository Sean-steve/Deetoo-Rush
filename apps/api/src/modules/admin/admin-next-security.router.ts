import {Router,Response,NextFunction,Request} from 'express';
import {createHash,randomBytes} from 'node:crypto';
import {z} from 'zod';
import {config} from '@deetoo/config';
import {hashPassword} from '@deetoo/auth';
import {ResetPasswordSchema} from '@deetoo/validation';
import {UserRole} from '@deetoo/types';
import {requireAuth,requireRole,AuthenticatedRequest} from '../auth/auth.middleware';
import {getDbPool} from '../../db/client';
import {withTransaction} from '../../db/transaction';
import {AppError} from '../../middleware/error-handler';
import {governanceService} from './governance.service';
import {externalNotificationProvider} from '../operations/external-notification.provider';

export const adminNextSecurityRouter=Router();
// Do not gate unrelated /admin/* routes; this router shares the parent mount.
adminNextSecurityRouter.use('/security',requireAuth,requireRole(UserRole.SUPER_ADMIN));
export const adminNextActivationRouter=Router();
const run=(fn:(req:AuthenticatedRequest,res:Response)=>Promise<void>)=>(req:AuthenticatedRequest,res:Response,next:NextFunction)=>{void fn(req,res).catch(next);};
const runPublic=(fn:(req:Request,res:Response)=>Promise<void>)=>(req:Request,res:Response,next:NextFunction)=>{void fn(req,res).catch(next);};
const uuid=z.string().uuid(),reason=z.string().trim().min(10).max(2000);
const postgres=()=>{if(config.storage.mode!=='postgres')throw new AppError(409,'POSTGRES_REQUIRED','Durable identity storage required');};
const sha=(token:string)=>createHash('sha256').update(token).digest('hex');
function invitationUrl(token:string){
 const root=process.env.ADMIN_INVITE_BASE_URL;
 if(!root||!process.env.RESEND_API_KEY||!process.env.AUTH_EMAIL_FROM)throw new AppError(503,'STAFF_INVITES_NOT_CONFIGURED','Staff invitation URL or email provider is not configured');
 const url=new URL(root);
 if(url.protocol!=='https:' && !(url.hostname==='localhost'&&url.protocol==='http:'))
  throw new AppError(503,'STAFF_INVITES_NOT_CONFIGURED','Staff invitation URL must use HTTPS');
 url.searchParams.set('token',token);
 return url.toString();
}
async function writeAudit(client:any,actorId:string,action:string,type:string,id:string,why:string,details:unknown={}){
 await client.query('INSERT INTO admin_change_audit(actor_id,action,resource_type,resource_id,reason,after_values) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[actorId,action,type,id,why,JSON.stringify(details)]);
}
async function issueInvitation(client:any,userId:string,email:string,actorId:string,why:string){
 const token=randomBytes(32).toString('base64url');
 const invitation=await client.query(
  "INSERT INTO admin_staff_invitations(user_id,token_hash,email,invited_by,expires_at) VALUES($1,$2,$3,$4,now()+interval '48 hours') RETURNING id,user_id,status,expires_at,created_at",
  [userId,sha(token),email,actorId]);
 await writeAudit(client,actorId,'STAFF_INVITATION_ISSUED','USER',userId,why,{invitation_id:invitation.rows[0].id});
 return {token,invitation:invitation.rows[0]};
}
async function submitInvitationEmail(userId:string,invitationId:string,token:string){
 const url=invitationUrl(token); // Perform configuration check before attempting provider call.
 try{
  const providerReference=await externalNotificationProvider.sendEmail(userId,'Set up your DeeToo staff account',
   'Your administrator has invited you to DeeToo. To activate your account, open this single-use link within 48 hours: '+url+
   '\n\nIf you did not expect an invitation, ignore this email.');
  await getDbPool().query("UPDATE admin_staff_invitations SET status='DELIVERY_SUBMITTED',delivered_provider_ref=$2,delivered_at=now() WHERE id=$1 AND status='PENDING'",[invitationId,providerReference]);
  return {status:'DELIVERY_SUBMITTED',provider_reference:providerReference};
 }catch{
  await getDbPool().query("UPDATE admin_staff_invitations SET status='DELIVERY_FAILED' WHERE id=$1 AND status='PENDING'",[invitationId]);
  throw new AppError(503,'STAFF_INVITE_SEND_FAILED','Invitation is saved but email provider did not accept the message; use resend');
 }
}
const invitedRole=z.enum([UserRole.SUPPORT,UserRole.OPS,UserRole.FINANCE,UserRole.ADMIN]);
adminNextSecurityRouter.post('/security/invitations',run(async(req,res)=>{
 postgres();const input=z.object({name:z.string().trim().min(2).max(120),email:z.string().email(),staff_role:invitedRole,reason}).parse(req.body);
 // Never create an unusable PENDING user when the invitation channel is unconfigured.
 invitationUrl('configuration-probe');
 const result=await withTransaction(async client=>{
  const created=await governanceService.provision({subject_type:'STAFF',name:input.name,email:input.email,staff_role:input.staff_role,reason:input.reason},{id:req.user!.id,role:UserRole.SUPER_ADMIN,requestId:(req as any).requestId});
  const issued=await issueInvitation(client,created.user.id,input.email,req.user!.id,input.reason);
  return {...issued,user_id:created.user.id};
 });
 const delivery=await submitInvitationEmail(result.user_id,result.invitation.id,result.token);
 res.status(201).json({data:{invitation_id:result.invitation.id,user_id:result.user_id,expires_at:result.invitation.expires_at,...delivery}});
}));
adminNextSecurityRouter.get('/security/invitations',run(async(_req,res)=>{
 postgres();const result=await getDbPool().query('SELECT id,user_id,email,status,invited_by,expires_at,delivered_at,consumed_at,created_at FROM admin_staff_invitations ORDER BY created_at DESC LIMIT 100');
 res.json({data:result.rows});
}));
adminNextSecurityRouter.post('/security/invitations/:id/resend',run(async(req,res)=>{
 postgres();const id=uuid.parse(req.params.id),why=z.object({reason}).parse(req.body).reason;
 invitationUrl('configuration-probe');
 const result=await withTransaction(async client=>{
  const current=await client.query('SELECT * FROM admin_staff_invitations WHERE id=$1 FOR UPDATE',[id]);
  if(!current.rows[0])throw new AppError(404,'INVITATION_NOT_FOUND','Invitation not found');
  const row=current.rows[0];
  if(!['PENDING','DELIVERY_FAILED','DELIVERY_SUBMITTED'].includes(row.status))throw new AppError(409,'INVITATION_CLOSED','Invitation already used or revoked');
  const user=await client.query("SELECT id,status FROM users WHERE id=$1 AND status='PENDING' FOR UPDATE",[row.user_id]);
  if(!user.rows[0])throw new AppError(409,'USER_NOT_PENDING','Only pending staff can be re-invited');
  await client.query("UPDATE admin_staff_invitations SET status='REVOKED' WHERE user_id=$1 AND status IN ('PENDING','DELIVERY_FAILED','DELIVERY_SUBMITTED')",[row.user_id]);
  const invitation=await issueInvitation(client,row.user_id,row.email,req.user!.id,why);
  return {...invitation,user_id:row.user_id};
 });
 const delivery=await submitInvitationEmail(result.user_id,result.invitation.id,result.token);
 res.json({data:{invitation_id:result.invitation.id,expires_at:result.invitation.expires_at,...delivery}});
}));
adminNextActivationRouter.post('/invitations/activate',runPublic(async(req,res)=>{
 postgres();const {token,new_password}=ResetPasswordSchema.parse(req.body);
 const passwordHash=await hashPassword(new_password);
 const result=await withTransaction(async client=>{
  const found=await client.query("SELECT * FROM admin_staff_invitations WHERE token_hash=$1 FOR UPDATE",[sha(token)]);
  if(!found.rows[0]||!['PENDING','DELIVERY_SUBMITTED'].includes(found.rows[0].status)||new Date(found.rows[0].expires_at)<=new Date())
   throw new AppError(400,'INVITATION_INVALID','Invitation is invalid, expired or already used');
  const i=found.rows[0];
  const user=await client.query("UPDATE users SET password_hash=$2,status='ACTIVE',updated_at=now() WHERE id=$1 AND status='PENDING' RETURNING id",[i.user_id,passwordHash]);
  if(!user.rows[0])throw new AppError(409,'ACCOUNT_NOT_PENDING','Account is no longer eligible for activation');
  await client.query("UPDATE admin_staff_invitations SET status='CONSUMED',consumed_at=now() WHERE id=$1",[i.id]);
  await client.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',[i.user_id]);
  await writeAudit(client,i.user_id,'STAFF_INVITATION_ACTIVATED','USER',i.user_id,'Invitation redeemed via verified mailbox',{invitation_id:i.id});
  return {activated:true,requires_mfa_enrollment:true};
 });
 res.setHeader('Cache-Control','no-store');res.json({data:result});
}));

// A two-Super-Admin maker/checker flow resets authenticator *credentials*, never toggles a boolean.
// Recovery expires in 30 min; target must re-enroll using /auth/mfa/enroll.
adminNextSecurityRouter.post('/security/users/:id/mfa-reset-requests',run(async(req,res)=>{
 postgres();const target=uuid.parse(req.params.id),why=z.object({reason}).parse(req.body).reason;
 if(target===req.user!.id)throw new AppError(403,'SELF_MFA_RESET_NOT_ALLOWED','Use self-service MFA enrollment/recovery');
 const result=await withTransaction(async client=>{
  const user=await client.query("SELECT u.id,u.status FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.id=$1 AND r.code IN ('super_admin','admin','ops','finance','support') FOR UPDATE",[target]);
  if(!user.rows[0])throw new AppError(404,'STAFF_NOT_FOUND','Staff user not found');
  const pending=await client.query("SELECT 1 FROM admin_mfa_recovery_requests WHERE target_user_id=$1 AND status='PENDING' AND expires_at>now()",[target]);
  if(pending.rows[0])throw new AppError(409,'MFA_RESET_PENDING','A valid MFA recovery request already exists');
  const row=await client.query('INSERT INTO admin_mfa_recovery_requests(target_user_id,requested_by,reason) VALUES($1,$2,$3) RETURNING id,status,expires_at',[target,req.user!.id,why]);
  await writeAudit(client,req.user!.id,'MFA_RECOVERY_REQUESTED','USER',target,why,{request_id:row.rows[0].id});
  return row.rows[0];
 });
 res.status(201).json({data:result});
}));
adminNextSecurityRouter.get('/security/mfa-reset-requests',run(async(_req,res)=>{
 postgres();const rows=await getDbPool().query('SELECT id,target_user_id,requested_by,approved_by,reason,status,expires_at,created_at,decided_at FROM admin_mfa_recovery_requests ORDER BY created_at DESC LIMIT 100');
 res.json({data:rows.rows});
}));
adminNextSecurityRouter.post('/security/mfa-reset-requests/:id/approve',run(async(req,res)=>{
 postgres();const id=uuid.parse(req.params.id),why=z.object({reason}).parse(req.body).reason;
 const result=await withTransaction(async client=>{
  const locked=await client.query('SELECT * FROM admin_mfa_recovery_requests WHERE id=$1 FOR UPDATE',[id]);
  const row=locked.rows[0];if(!row)throw new AppError(404,'MFA_RESET_NOT_FOUND','Recovery request not found');
  if(row.status!=='PENDING'||new Date(row.expires_at)<=new Date())throw new AppError(409,'MFA_RESET_EXPIRED','Recovery is no longer pending');
  if(row.requested_by===req.user!.id||row.target_user_id===req.user!.id)throw new AppError(403,'MFA_RESET_SECOND_APPROVER_REQUIRED','Independent Super Admin must approve');
  await client.query('DELETE FROM user_mfa_credentials WHERE user_id=$1',[row.target_user_id]);
  await client.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',[row.target_user_id]);
  await client.query("UPDATE admin_mfa_recovery_requests SET status='APPROVED',approved_by=$2,decided_at=now() WHERE id=$1",[id,req.user!.id]);
  await writeAudit(client,req.user!.id,'MFA_RECOVERY_APPROVED','USER',row.target_user_id,why,{request_id:id,requested_by:row.requested_by,sessions_revoked:true});
  return {user_id:row.target_user_id,mfa_enrollment_required:true,sessions_revoked:true};
 });
 res.json({data:result});
}));
