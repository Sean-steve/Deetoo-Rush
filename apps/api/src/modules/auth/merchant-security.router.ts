/** Merchant account-security additions. A remembered device is informational, never a 2FA bypass. */
import { Router, Response, NextFunction } from 'express';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { verifyPassword, hashPassword } from '@deetoo/auth';
import { requireAuth, AuthenticatedRequest } from './auth.middleware';
import { requireRecentMfa } from './mfa';
import { ownMerchant, durable } from '../merchant/merchant-experience.scope';
import { AppError } from '../../middleware/error-handler';
export const merchantSecurityRouter=Router();
merchantSecurityRouter.use(requireAuth);
const run=(f:(req:AuthenticatedRequest,res:Response)=>Promise<void>)=>(req:AuthenticatedRequest,res:Response,next:NextFunction)=>{Promise.resolve().then(()=>f(req,res)).catch(next)};
async function credential(req:AuthenticatedRequest,password:string,stepUp=false){
 const db=durable();
 const r=await db.query('SELECT password_hash FROM users WHERE id=$1',[req.user!.id]);
 if(!r.rowCount||!await verifyPassword(password,r.rows[0].password_hash))
  throw new AppError(403,'INVALID_CREDENTIALS','Password confirmation required');
 if(stepUp){
  const m=await db.query('SELECT enabled FROM user_mfa_credentials WHERE user_id=$1',[req.user!.id]);
  if(m.rows[0]?.enabled)await requireRecentMfa(req.user!.id,req.session!.session_id);
 }
}
merchantSecurityRouter.get('/mfa/status',run(async(req,res)=>{
 const db=durable(),r=await db.query('SELECT enabled FROM user_mfa_credentials WHERE user_id=$1',[req.user!.id]);
 res.json({data:{enabled:Boolean(r.rows[0]?.enabled),enrollment_available:Boolean(process.env.MFA_ENCRYPTION_KEY)}});
}));
merchantSecurityRouter.post('/mfa/disable',run(async(req,res)=>{
 const db=durable();const input=z.object({password:z.string().min(1)}).parse(req.body);
 await credential(req,input.password,true);
 await requireRecentMfa(req.user!.id,req.session!.session_id);
 const c=await db.connect();try{await c.query('BEGIN');
 const r=await c.query('UPDATE user_mfa_credentials SET enabled=FALSE WHERE user_id=$1 AND enabled=TRUE RETURNING user_id',[req.user!.id]);
 if(!r.rowCount)throw new AppError(409,'MFA_NOT_ACTIVE','MFA is not active');
 await c.query('UPDATE sessions SET mfa_verified_at=NULL WHERE user_id=$1',[req.user!.id]);
 await c.query(`INSERT INTO user_security_events(user_id,event_type,session_id) VALUES($1,'MFA_DISABLED',$2)`,[req.user!.id,req.session!.session_id]);
 await c.query('COMMIT');res.json({data:{enabled:false}});
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}));
merchantSecurityRouter.post('/password/change',run(async(req,res)=>{
 const db=durable();
 const input=z.object({current_password:z.string().min(1),new_password:z.string().min(12).max(128)}).parse(req.body);
 if(input.current_password===input.new_password)throw new AppError(400,'PASSWORD_UNCHANGED','Choose a different password');
 await credential(req,input.current_password,true);
 const hashed=await hashPassword(input.new_password);
 const c=await db.connect();try{await c.query('BEGIN');
 await c.query('UPDATE users SET password_hash=$2,updated_at=NOW() WHERE id=$1',[req.user!.id,hashed]);
 await c.query('UPDATE sessions SET revoked_at=NOW() WHERE user_id=$1 AND id<>$2 AND revoked_at IS NULL',[req.user!.id,req.session!.session_id]);
 await c.query(`INSERT INTO user_security_events(user_id,event_type,session_id) VALUES($1,'PASSWORD_CHANGED',$2)`,[req.user!.id,req.session!.session_id]);
 await c.query('COMMIT');res.json({data:{password_changed:true,other_sessions_revoked:true}});
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}));
merchantSecurityRouter.get('/login-history',run(async(req,res)=>{
 const db=durable(),q=z.object({limit:z.coerce.number().int().min(1).max(100).default(30)}).parse(req.query);
 const sessions=await db.query(`SELECT id,device_info,ip_address,created_at,last_used_at,revoked_at,
     (revoked_at IS NULL AND expires_at>NOW()) AS active
     FROM sessions WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2`,[req.user!.id,q.limit]);
 const events=await db.query(`SELECT id,event_type,device_info,ip_address,created_at FROM user_security_events
     WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2`,[req.user!.id,q.limit]);
 res.json({data:{sessions:sessions.rows,events:events.rows,
   note:'Only authenticated user-associated security events are recorded; unauthenticated failed attempts are not attributed without identity verification.'}});
}));
merchantSecurityRouter.get('/trusted-devices',run(async(req,res)=>{
 const db=durable();const r=await db.query(`SELECT id,display_name,trusted_at,revoked_at FROM user_trusted_auth_devices
    WHERE user_id=$1 ORDER BY trusted_at DESC`,[req.user!.id]);
 res.json({data:r.rows,semantics:'Informational remembered devices; login MFA is never bypassed by this record.'});
}));
merchantSecurityRouter.post('/trusted-devices/current',run(async(req,res)=>{
 const db=durable(),input=z.object({password:z.string().min(1),name:z.string().trim().min(2).max(120)}).parse(req.body);
 await credential(req,input.password,true);
 const session=await db.query('SELECT device_id FROM sessions WHERE id=$1 AND user_id=$2',[req.session!.session_id,req.user!.id]);
 if(!session.rows[0]?.device_id)throw new AppError(409,'DEVICE_NOT_IDENTIFIABLE','Current session has no device identifier');
 const fingerprint=createHash('sha256').update(session.rows[0].device_id).digest('hex');
 const r=await db.query(`INSERT INTO user_trusted_auth_devices(user_id,device_fingerprint_hash,display_name,created_by_session)
   VALUES($1,$2,$3,$4) ON CONFLICT(user_id,device_fingerprint_hash) DO UPDATE
   SET display_name=EXCLUDED.display_name,revoked_at=NULL,trusted_at=NOW()
   RETURNING id,display_name,trusted_at,revoked_at`,[req.user!.id,fingerprint,input.name,req.session!.session_id]);
 res.status(201).json({data:r.rows[0]});
}));
merchantSecurityRouter.delete('/trusted-devices/:id',run(async(req,res)=>{
 const db=durable(),id=z.string().uuid().parse(req.params.id);
 const r=await db.query(`UPDATE user_trusted_auth_devices SET revoked_at=NOW()
   WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL RETURNING id,revoked_at`,[id,req.user!.id]);
 if(!r.rowCount)throw new AppError(404,'TRUSTED_DEVICE_NOT_FOUND','Trusted device not found');
 res.json({data:r.rows[0]});
}));
merchantSecurityRouter.post('/deactivation-request',run(async(req,res)=>{
 const db=durable(),id=await ownMerchant(req,true);
 const input=z.object({password:z.string().min(1),reason:z.string().trim().min(15).max(1500)}).parse(req.body);
 await credential(req,input.password,true);
 const r=await db.query(`INSERT INTO merchant_deactivation_requests(merchant_id,user_id,reason)
    VALUES($1,$2,$3) ON CONFLICT(user_id,merchant_id) WHERE status='REQUESTED'
    DO NOTHING RETURNING id,merchant_id,user_id,status,created_at`,[id,req.user!.id,input.reason]);
 if(!r.rowCount)throw new AppError(409,'DEACTIVATION_ALREADY_REQUESTED','A deactivation review request is already pending');
 res.status(202).json({data:r.rows[0],requires_admin_review:true});
}));
