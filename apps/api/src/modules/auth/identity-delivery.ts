import { randomInt, randomUUID } from 'node:crypto';
import { generateSecureToken, hashToken } from '@deetoo/auth';
import { UserStatus } from '@deetoo/types';
import { normalizeEmail, normalizePhoneE164 } from '@deetoo/validation';
import { AppError } from '../../middleware/error-handler';
import { outsideTransaction, withTransaction } from '../../db/transaction';
import { authRepository } from './auth.repository';
import { assertSmsConfigured,sendSmsMessage } from './sms-provider';

function setting(name: string): string {
  const value = process.env[name]?.trim();
  if (!value || /placeholder|change.?me/i.test(value))
    throw new AppError(503, 'BLOCKED_BY_CONFIGURATION', name + ' is required for identity verification');
  return value;
}
export function identityDeliveryConfig(channel: 'EMAIL'): {channel:'EMAIL';key:string;sender:string};
export function identityDeliveryConfig(channel: 'SMS'): {channel:'SMS'};
export function identityDeliveryConfig(channel: 'EMAIL' | 'SMS'): {channel:'SMS'} | {channel:'EMAIL';key:string;sender:string};
export function identityDeliveryConfig(channel: 'EMAIL' | 'SMS') {
  if (channel === 'SMS') {
    assertSmsConfigured();
    return {channel: 'SMS' as const};
  }
  return {channel: 'EMAIL' as const,key: setting('RESEND_API_KEY'),sender: setting('AUTH_EMAIL_FROM')};
}
export async function sendIdentityMessage(
  channel: 'EMAIL' | 'SMS', recipient: string, content: string, requestId: string, subject = 'DeeToo account recovery',
): Promise<void> {
  if (channel === 'SMS') {
    try {
      await sendSmsMessage(recipient, content);
      return;
    } catch (error) {
      if (error instanceof AppError && error.statusCode === 503) throw error;
      throw new AppError(502,'IDENTITY_DELIVERY_UNCONFIRMED','Message delivery could not be confirmed. Please try again later.');
    }
  }
  const options = identityDeliveryConfig('EMAIL');
  try {
    const response = await fetch('https://api.resend.com/emails',{
      method:'POST',
      redirect:'error',
      headers:{Authorization:'Bearer ' + options.key,'Content-Type':'application/json','Idempotency-Key':requestId},
      body:JSON.stringify({from:options.sender,to:[recipient],subject,text:content}),
      signal:AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error('Provider rejected email');
    const result = await response.json();
    if (typeof result?.id !== 'string' || !result.id) throw new Error('Provider acceptance missing');
  } catch {
    // Resend acceptance means handed to provider, not inbox delivery.
    throw new AppError(502,'IDENTITY_DELIVERY_UNCONFIRMED','Message delivery could not be confirmed. Please try again later.');
  }
}
const genericReset = { message: 'If an eligible account exists, recovery instructions have been requested. Open Reset Password and enter the token from your message.' };
const genericOtp = { message: 'If an eligible account exists, a verification code has been requested.' };
type IdentityRequest = 'RESET' | 'OTP' | 'EMAIL_OTP';

export async function requestDurableIdentity(kind: IdentityRequest, rawIdentifier: string, requestId?: string) {
  const channel: 'EMAIL' | 'SMS' = kind === 'EMAIL_OTP' || (kind === 'RESET' && rawIdentifier.includes('@')) ? 'EMAIL' : 'SMS';
  const identifier = channel === 'EMAIL' ? normalizeEmail(rawIdentifier) : normalizePhoneE164(rawIdentifier);
  identityDeliveryConfig(channel); // Same configuration response for unknown accounts.
  const delivery = await outsideTransaction(() => withTransaction(async () => {
    const user = await authRepository.findUserByIdentifier(identifier);
    if (!user || user.status !== UserStatus.ACTIVE) return null;
    if (channel === 'EMAIL' ? !user.email || user.email.toLowerCase() !== identifier : !user.phone_e164 || user.phone_e164 !== identifier)
      return null;
    const type = kind === 'EMAIL_OTP' ? 'EMAIL_VERIFICATION' : 'PHONE_VERIFICATION';
    if (kind !== 'RESET') {
      const latest = await authRepository.getLatestVerificationToken(user.id, type);
      // Server-side resend cooldown protects provider quotas across multiple API instances.
      if (latest && latest.attempts < 5 && !latest.verified_at && new Date(latest.expires_at).getTime() > Date.now()
        && Date.now() - new Date(latest.created_at).getTime() < 60000) return null;
    }
    const id = randomUUID();
    const token = kind === 'RESET' ? generateSecureToken(32) : String(randomInt(0, 1000000)).padStart(6, '0');
    const record = { id, user_id: user.id, token_hash: hashToken(token), expires_at: new Date(Date.now() + (kind === 'RESET' ? 3600000 : 600000)) };
    if (kind === 'RESET') await authRepository.createPasswordResetToken(record);
    else await authRepository.createVerificationToken({ ...record, type });
    await authRepository.createAuditLog({
      actor_user_id: user.id,
      action: kind === 'RESET' ? 'PASSWORD_RESET_REQUESTED' : 'OTP_REQUESTED',
      resource_type: 'USER', resource_id: user.id, request_id: requestId,
      metadata: { channel, purpose: kind },
    });
    return { id, token, recipient: channel === 'EMAIL' ? user.email : user.phone_e164 };
  }));
  // Commit the token hash before sending; never send an uncommitted token.
  if (delivery?.recipient) {
    const content = kind === 'RESET'
      ? 'Your DeeToo password reset token is ' + delivery.token + '. It expires in 1 hour. Enter it in Reset Password. If you did not request this, ignore this message.'
      : 'Your DeeToo verification code is ' + delivery.token + '. It expires in 10 minutes. Never share this code.';
    await sendIdentityMessage(channel, delivery.recipient, content, delivery.id,
      kind === 'EMAIL_OTP' ? 'Verify your DeeToo email address' : 'DeeToo account recovery');
  }
  return kind === 'RESET' ? genericReset : genericOtp;
}

async function confirmDurableContactOtp(type: 'PHONE_VERIFICATION' | 'EMAIL_VERIFICATION', identifier: string, code: string, requestId?: string) {
  const email = type === 'EMAIL_VERIFICATION';
  const where = email ? 'lower(u.email)=lower($1)' : 'u.phone_e164=$1';
  const verifiedColumn = email ? 'email_verified_at' : 'phone_verified_at';
  const outcome = await outsideTransaction(() => withTransaction(async client => {
    const row = (await client.query('SELECT v.*,u.id AS owner_id FROM users u JOIN verification_tokens v ON v.user_id=u.id ' +
      'WHERE ' + where + " AND u.status='ACTIVE' AND v.type=$2 " +
      'ORDER BY v.created_at DESC,v.id DESC LIMIT 1 FOR UPDATE OF v', [identifier, type])).rows[0];
    if (!row || row.verified_at || new Date(row.expires_at).getTime() <= Date.now()) return 'INVALID_OTP';
    if (row.attempts >= 5) return 'TOO_MANY_ATTEMPTS';
    await client.query('UPDATE verification_tokens SET attempts=attempts+1 WHERE id=$1', [row.id]);
    if (!/^\d{6}$/.test(code) || hashToken(code) !== row.token_hash) return 'INVALID_OTP';
    await client.query('UPDATE verification_tokens SET verified_at=now() WHERE id=$1', [row.id]);
    await client.query('UPDATE users SET ' + verifiedColumn + '=now() WHERE id=$1', [row.owner_id]);
    await authRepository.createAuditLog({
      actor_user_id: row.owner_id, action: 'OTP_VERIFIED', resource_type: 'USER',
      resource_id: row.owner_id, request_id: requestId, metadata: { channel: email ? 'EMAIL' : 'SMS' },
    });
    return null;
  }));
  if (outcome) throw new AppError(outcome === 'TOO_MANY_ATTEMPTS' ? 429 : 400, outcome,
    outcome === 'TOO_MANY_ATTEMPTS' ? 'Too many attempts. Request a new code.' : 'Verification code is invalid or expired');
  return { verified: true, message: email ? 'Email verified successfully' : 'Phone number verified successfully' };
}

export function confirmDurableOtp(phone: string, code: string, requestId?: string) {
  return confirmDurableContactOtp('PHONE_VERIFICATION', phone, code, requestId);
}
export function confirmDurableEmailOtp(email: string, code: string, requestId?: string) {
  return confirmDurableContactOtp('EMAIL_VERIFICATION', normalizeEmail(email), code, requestId);
}
