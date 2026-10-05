import { createHmac, randomBytes, createCipheriv, createDecipheriv, timingSafeEqual } from 'node:crypto';
import { getDbPool } from '../../db/client';
import { withTransaction } from '../../db/transaction';
import { AppError } from '../../middleware/error-handler';
import { verifyPassword } from '@deetoo/auth';

function encryptionKey(): Buffer {
  const key = Buffer.from(process.env.MFA_ENCRYPTION_KEY || '', 'base64');
  if (key.length !== 32) throw new AppError(503, 'MFA_NOT_CONFIGURED', 'Authenticator encryption is not configured');
  return key;
}
export function totp(secret: Buffer, counter: number, digits = 6): string {
  const moving = Buffer.alloc(8); moving.writeBigUInt64BE(BigInt(counter));
  const hash = createHmac('sha1', secret).update(moving).digest();
  const offset = hash[hash.length - 1] & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits).padStart(digits, '0');
}
function encode(secret: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = 0, value = 0, result = '';
  for (const byte of secret) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { result += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits) result += alphabet[(value << (5 - bits)) & 31];
  return result;
}
function encrypt(secret: Buffer): string {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const content = Buffer.concat([cipher.update(secret), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), content]).toString('base64');
}
function decrypt(value: string): Buffer {
  const data = Buffer.from(value, 'base64'), cipher = createDecipheriv('aes-256-gcm', encryptionKey(), data.subarray(0, 12));
  cipher.setAuthTag(data.subarray(12, 28)); return Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]);
}
export async function enrollMfa(userId: string, password: string) {
  encryptionKey();
  if (typeof password !== 'string' || !password) throw new AppError(400,'PASSWORD_REQUIRED','Account password is required');
  return withTransaction(async client => {
    const user = (await client.query('SELECT password_hash FROM users WHERE id=$1 FOR UPDATE', [userId])).rows[0];
    if (!user || !await verifyPassword(password, user.password_hash)) throw new AppError(403, 'INVALID_CREDENTIALS', 'Password verification required');
    const current = (await client.query('SELECT enabled,encrypted_secret FROM user_mfa_credentials WHERE user_id=$1', [userId])).rows[0];
    if (current?.enabled) throw new AppError(409, 'MFA_ALREADY_ENABLED', 'An enabled authenticator cannot be replaced here');
    // Reopening pending setup must not invalidate the key already entered on the phone.
    const secret = current ? decrypt(current.encrypted_secret) : randomBytes(20);
    await client.query(`INSERT INTO user_mfa_credentials(user_id,encrypted_secret) VALUES($1,$2)
      ON CONFLICT(user_id) DO UPDATE SET encrypted_secret=EXCLUDED.encrypted_secret,last_counter=-1,failures=0,locked_until=NULL`, [userId, encrypt(secret)]);
    await client.query('UPDATE sessions SET mfa_verified_at=NULL WHERE user_id=$1', [userId]);
    await client.query("INSERT INTO audit_logs(actor_user_id,action,resource_type,resource_id) VALUES($1,'MFA_ENROLLMENT_STARTED','USER',$1)",[userId]);
    // Pending provisioning is returned only to its password-verified owner; never logged or audited.
    return { uri: `otpauth://totp/Deetoo:${userId}?secret=${encode(secret)}&issuer=Deetoo&algorithm=SHA1&digits=6&period=30` };
  });
}
export async function verifyMfa(userId: string, sessionId: string, code: string) {
  encryptionKey();
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) throw new AppError(400, 'INVALID_MFA_CODE', 'A six-digit authenticator code is required');
  const accepted = await withTransaction(async client => {
    const row = (await client.query('SELECT * FROM user_mfa_credentials WHERE user_id=$1 FOR UPDATE', [userId])).rows[0];
    if (!row) throw new AppError(403, 'MFA_ENROLLMENT_REQUIRED', 'Enroll an authenticator first');
    if (row.locked_until && new Date(row.locked_until).getTime() > Date.now()) throw new AppError(429, 'MFA_LOCKED', 'Authenticator verification temporarily locked');
    const secret = decrypt(row.encrypted_secret), now = Math.floor(Date.now() / 30000);
    const counter = [now, now - 1, now + 1].find(n => n > Number(row.last_counter) && timingSafeEqual(Buffer.from(totp(secret, n)), Buffer.from(code)));
    if (counter === undefined) {
      await client.query(`UPDATE user_mfa_credentials SET failures=CASE WHEN locked_until<=now() THEN 1 ELSE failures+1 END,
        locked_until=CASE WHEN locked_until<=now() THEN NULL WHEN failures>=4 THEN now()+interval '5 minutes' ELSE locked_until END WHERE user_id=$1`, [userId]);
      await client.query("INSERT INTO audit_logs(actor_user_id,action,resource_type,resource_id) VALUES($1,'MFA_VERIFY_FAILED','SESSION',$2)",[userId,sessionId]);
      return false; // Commit the failed-attempt counter before rejecting the request.
    }
    const session = await client.query(`UPDATE sessions SET mfa_verified_at=now() WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL AND expires_at>now()`, [sessionId,userId]);
    if (!session.rowCount) throw new AppError(401, 'SESSION_REVOKED', 'Session is not active');
    await client.query('UPDATE user_mfa_credentials SET enabled=true,last_counter=$2,failures=0,locked_until=NULL WHERE user_id=$1', [userId,counter]);
    await client.query(`INSERT INTO audit_logs(actor_user_id,action,resource_type,resource_id) VALUES($1,'MFA_VERIFIED','SESSION',$2)`, [userId,sessionId]);
    return true;
  });
  if (!accepted) throw new AppError(403, 'INVALID_MFA_CODE', 'Invalid or previously used authenticator code');
  return { verified: true };
}
export async function requireRecentMfa(userId: string, sessionId: string): Promise<void> {
  const result = await getDbPool().query(`SELECT 1 FROM sessions s JOIN user_mfa_credentials m ON m.user_id=s.user_id
    WHERE s.id=$1 AND s.user_id=$2 AND s.revoked_at IS NULL AND s.expires_at>now() AND m.enabled
    AND s.mfa_verified_at>now()-interval '5 minutes'`, [sessionId,userId]);
  if (!result.rowCount) throw new AppError(403, 'MFA_REQUIRED', 'Recent authenticator verification is required');
}
