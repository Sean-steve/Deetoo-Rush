import { randomInt, randomUUID } from 'node:crypto';
import { generateSecureToken, hashToken } from '@deetoo/auth';
import { UserStatus } from '@deetoo/types';
import { AppError } from '../../middleware/error-handler';
import { outsideTransaction, withTransaction } from '../../db/transaction';
import { authRepository } from './auth.repository';

function setting(name: string): string {
  const value = process.env[name]?.trim();
  if (!value || /placeholder|change.?me/i.test(value)) throw new AppError(503, 'BLOCKED_BY_CONFIGURATION', `${name} is required for account recovery`);
  return value;
}
export function identityDeliveryConfig(channel: 'EMAIL' | 'SMS') {
  return channel === 'EMAIL'
    ? { key: setting('RESEND_API_KEY'), sender: setting('AUTH_EMAIL_FROM') }
    : { key: setting('AFRICASTALKING_API_KEY'), username: setting('AFRICASTALKING_USERNAME'), sender: setting('AUTH_SMS_FROM') };
}
export async function sendIdentityMessage(channel: 'EMAIL' | 'SMS', recipient: string, text: string, requestId: string): Promise<void> {
  const options = identityDeliveryConfig(channel);
  let response: Response;
  try {
    response = channel === 'EMAIL'
      ? await fetch('https://api.resend.com/emails', {method:'POST', headers:{Authorization:`Bearer ${options.key}`,'Content-Type':'application/json','Idempotency-Key':requestId},body:JSON.stringify({from:options.sender,to:[recipient],subject:'Deetoo account recovery',text}),signal:AbortSignal.timeout(15000)})
      : await fetch('https://api.africastalking.com/version1/messaging', {method:'POST',headers:{apiKey:options.key,Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:options.username!,from:options.sender,to:recipient,message:text}),signal:AbortSignal.timeout(15000)});
    if (!response.ok) throw new Error('Provider rejected delivery');
    const result = await response.json();
    const recipients = result.SMSMessageData?.Recipients;
    if (channel === 'EMAIL' ? typeof result.id !== 'string' || !result.id : !Array.isArray(recipients) || recipients.length !== 1 || recipients[0].statusCode !== 101 || !recipients[0].messageId) throw new Error('Provider acceptance missing');
  } catch {
    // Never include provider payloads, recipients or recovery secrets in errors/logs.
    // No blind retry: an SMS timeout may have delivered the original message.
    throw new AppError(502,'IDENTITY_DELIVERY_UNCONFIRMED','Message delivery could not be confirmed. Please try again later.');
  }
}
const genericReset = {message:'If an eligible account exists, recovery instructions have been requested. Open Reset Password and enter the token from your message.'};
const genericOtp = {message:'If an eligible account exists, a verification code has been requested.'};

export async function requestDurableIdentity(kind: 'RESET' | 'OTP', identifier: string, requestId?: string) {
  const channel = kind === 'OTP' || !identifier.includes('@') ? 'SMS' : 'EMAIL';
  identityDeliveryConfig(channel); // Same unavailable response even for unknown users.
  const delivery = await outsideTransaction(() => withTransaction(async () => {
    const user = await authRepository.findUserByIdentifier(identifier);
    if (!user || user.status !== UserStatus.ACTIVE) return null;
    const id = randomUUID(), token = kind === 'RESET' ? generateSecureToken(32) : String(randomInt(0,1000000)).padStart(6,'0');
    const data = {id,user_id:user.id,token_hash:hashToken(token),expires_at:new Date(Date.now()+(kind==='RESET'?3600000:600000))};
    if (kind === 'RESET') await authRepository.createPasswordResetToken(data);
    else await authRepository.createVerificationToken({...data,type:'PHONE_VERIFICATION'});
    await authRepository.createAuditLog({actor_user_id:user.id,action:kind==='RESET'?'PASSWORD_RESET_REQUESTED':'OTP_REQUESTED',resource_type:'USER',resource_id:user.id,request_id:requestId,metadata:{channel}});
    return {id,token,recipient:channel==='EMAIL'?user.email:user.phone_e164};
  }));
  // Token hash commits before the provider call. A crash cannot deliver an uncommitted token.
  if (delivery?.recipient) await sendIdentityMessage(channel,delivery.recipient,kind==='RESET'
    ? `Your Deetoo password reset token is ${delivery.token}. It expires in 1 hour. Enter it in Reset Password. If you did not request this, ignore this message.`
    : `Your Deetoo verification code is ${delivery.token}. It expires in 10 minutes. Never share this code.`,delivery.id);
  return kind==='RESET'?genericReset:genericOtp;
}

export async function confirmDurableOtp(phone: string, code: string, requestId?: string) {
  const outcome = await outsideTransaction(() => withTransaction(async client => {
    const row = (await client.query(`SELECT v.*,u.id AS owner_id FROM users u JOIN verification_tokens v ON v.user_id=u.id
      WHERE u.phone_e164=$1 AND u.status='ACTIVE' AND v.type='PHONE_VERIFICATION'
      ORDER BY v.created_at DESC,v.id DESC LIMIT 1 FOR UPDATE OF v`,[phone])).rows[0];
    if (!row || row.verified_at || new Date(row.expires_at).getTime() <= Date.now()) return 'INVALID_OTP';
    if (row.attempts >= 5) return 'TOO_MANY_ATTEMPTS';
    await client.query('UPDATE verification_tokens SET attempts=attempts+1 WHERE id=$1',[row.id]);
    if (!/^\d{6}$/.test(code) || hashToken(code)!==row.token_hash) return 'INVALID_OTP';
    await client.query('UPDATE verification_tokens SET verified_at=now() WHERE id=$1',[row.id]);
    await client.query('UPDATE users SET phone_verified_at=now() WHERE id=$1',[row.owner_id]);
    await authRepository.createAuditLog({actor_user_id:row.owner_id,action:'OTP_VERIFIED',resource_type:'USER',resource_id:row.owner_id,request_id:requestId});
    return null;
  }));
  if (outcome) throw new AppError(outcome==='TOO_MANY_ATTEMPTS'?429:400,outcome,outcome==='TOO_MANY_ATTEMPTS'?'Too many attempts. Request a new code.':'Verification code is invalid or expired');
  return {verified:true,message:'Phone number verified successfully'};
}
