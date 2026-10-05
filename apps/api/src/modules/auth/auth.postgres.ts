import { randomUUID } from 'node:crypto';
import { rows,one,insert } from '../../db/adapter';
import { withTransaction, outsideTransaction, onTransactionRollback } from '../../db/transaction';
import { merchantRepository } from '../merchant/merchant.repository';

export const postgresAuth = {
  findUserById: (id:string)=>one('SELECT * FROM users WHERE id=$1',[id]),
  findUserByEmail: (email:string)=>one('SELECT * FROM users WHERE lower(email)=lower($1)',[email.trim()]),
  findUserByPhone: (phone:string)=>one('SELECT * FROM users WHERE phone_e164=$1',[phone]),
  findUserByIdentifier: (value:string)=>one('SELECT * FROM users WHERE lower(email)=lower($1) OR phone_e164=$1',[value.trim()]),
  createUser: (data:any)=>insert('users',{...data,email:data.email?.trim().toLowerCase()},['id','email','phone_e164','password_hash','status']),
  updateUserStatus: async(id:string,status:string)=>{await rows('UPDATE users SET status=$2,updated_at=now() WHERE id=$1',[id,status]);},
  updateUserPassword: async(id:string,hash:string)=>{await rows('UPDATE users SET password_hash=$2,updated_at=now() WHERE id=$1',[id,hash]);},
  updateLastLogin: async(id:string)=>{await rows('UPDATE users SET last_login_at=now() WHERE id=$1',[id]);},
  listUsers: async(o:any={})=>{
    const args=[o.status||null,o.search||null,o.role||null];
    const predicate=`($1::text IS NULL OR u.status=$1) AND ($2::text IS NULL OR u.email ILIKE '%'||$2||'%' OR u.phone_e164 ILIKE '%'||$2||'%') AND ($3::text IS NULL OR EXISTS(SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=u.id AND r.code=$3))`;
    return {users:await rows(`SELECT u.* FROM users u WHERE ${predicate} ORDER BY u.created_at DESC LIMIT $4 OFFSET $5`,[...args,Math.min(o.limit||20,100),o.offset||0]),total:Number((await one(`SELECT count(*) AS n FROM users u WHERE ${predicate}`,args)).n)};
  },
  getUserRoles: async(id:string)=>(await rows('SELECT r.code FROM roles r JOIN user_roles ur ON ur.role_id=r.id WHERE ur.user_id=$1',[id])).map(r=>r.code),
  setUserRoles: (id:string,roles:string[])=>withTransaction(async client=>{
    const available=await rows('SELECT id,code FROM roles WHERE code=ANY($1::text[])',[roles]);
    if(new Set(roles).size!==available.length)throw new Error('Unknown role');
    await client.query('DELETE FROM user_roles WHERE user_id=$1',[id]);
    for(const role of available)await client.query('INSERT INTO user_roles(user_id,role_id) VALUES($1,$2)',[id,role.id]);
  }),
  getCustomerProfile: (id:string)=>one('SELECT user_id AS id,user_id,display_name AS name,created_at FROM customer_profiles WHERE user_id=$1',[id]),
  createCustomerProfile: async(p:any)=>{await rows('INSERT INTO customer_profiles(user_id,display_name) VALUES($1,$2)',[p.user_id,p.name]);},
  getMerchantMemberships: (id:string)=>merchantRepository.getMembershipsForUser(id),
  getRiderProfile: (id:string)=>one('SELECT id,user_id,vehicle_type,operational_status,created_at FROM rider_profiles WHERE user_id=$1',[id]),
  createSession: (data:any)=>insert('sessions',data,['id','user_id','refresh_token_hash','expires_at','ip_address','device_info']),
  findSessionById: (id:string)=>one('SELECT * FROM sessions WHERE id=$1',[id]),
  findSessionByRefreshTokenHash: (hash:string)=>one('SELECT * FROM sessions WHERE refresh_token_hash=$1 FOR UPDATE',[hash]),
  updateSessionLastUsed: async(id:string,ip?:string)=>{await rows('UPDATE sessions SET last_used_at=now(),ip_address=COALESCE($2,ip_address) WHERE id=$1',[id,ip||null]);},
  rotateSessionToken: async(id:string,hash:string,expires:Date)=>{await rows('UPDATE sessions SET refresh_token_hash=$2,expires_at=$3,last_used_at=now() WHERE id=$1 AND revoked_at IS NULL',[id,hash,expires]);},
  revokeSession: async(id:string)=>{await rows('UPDATE sessions SET revoked_at=now() WHERE id=$1',[id]);},
  revokeAllUserSessions: async(id:string)=>{await rows('UPDATE sessions SET revoked_at=now() WHERE user_id=$1',[id]);},
  listUserSessions: (id:string)=>rows('SELECT * FROM sessions WHERE user_id=$1 ORDER BY created_at DESC',[id]),
  createPasswordResetToken: (data:any)=>insert('password_reset_tokens',data,['id','user_id','token_hash','expires_at']),
  findPasswordResetToken: (hash:string)=>one('SELECT * FROM password_reset_tokens WHERE token_hash=$1 FOR UPDATE',[hash]),
  markPasswordResetTokenUsed: async(id:string)=>{await rows('UPDATE password_reset_tokens SET used_at=now() WHERE id=$1 AND used_at IS NULL',[id]);},
  createVerificationToken: (data:any)=>insert('verification_tokens',data,['id','user_id','type','token_hash','expires_at']),
  getLatestVerificationToken: (id:string,type:string)=>one('SELECT * FROM verification_tokens WHERE user_id=$1 AND type=$2 ORDER BY created_at DESC LIMIT 1 FOR UPDATE',[id,type]),
  incrementVerificationAttempt: async(id:string)=>{
    const increment=()=>rows('UPDATE verification_tokens SET attempts=attempts+1 WHERE id=$1',[id]);
    await increment();
    onTransactionRollback(increment);
  },
  markVerificationTokenVerified: async(id:string)=>{await rows('UPDATE verification_tokens SET verified_at=now() WHERE id=$1',[id]);},
  createAuditLog: (data:any)=>{
    const write=()=>insert('audit_logs',data,['actor_user_id','actor_role','action','resource_type','resource_id','request_id','reason','metadata']);
    return data.action === 'LOGIN_FAILED' ? outsideTransaction(write) : write();
  },
  listAuditLogs: async(o:any={})=>{
    const args=[o.action||null,o.actorUserId||null];const where='($1::text IS NULL OR action=$1) AND ($2::uuid IS NULL OR actor_user_id=$2)';
    return {logs:await rows(`SELECT * FROM audit_logs WHERE ${where} ORDER BY created_at DESC LIMIT $3 OFFSET $4`,[...args,Math.min(o.limit||50,100),o.offset||0]),total:Number((await one(`SELECT count(*) AS n FROM audit_logs WHERE ${where}`,args)).n)};
  },
};
