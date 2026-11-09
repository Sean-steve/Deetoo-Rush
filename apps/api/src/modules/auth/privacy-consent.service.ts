import {z} from 'zod';
import {config} from '@deetoo/config';
import {getDbPool} from '../../db/client';
import {withTransaction} from '../../db/transaction';
import {AppError} from '../../middleware/error-handler';

export const COOKIE_PRIVACY_POLICY_VERSION = '2026-11-09';
export const privacyReceiptSchema = z.strictObject({
  receiptId: z.string().uuid(),
  version: z.literal(COOKIE_PRIVACY_POLICY_VERSION),
  recordedAt: z.string().datetime({offset:true}),
  expiresAt: z.string().datetime({offset:true}),
  source: z.enum(['banner','customize','settings']),
  preferences: z.strictObject({
    functional: z.boolean(),
    analytics: z.boolean(),
    marketing: z.boolean(),
  }),
});
export type PrivacyReceiptInput = z.infer<typeof privacyReceiptSchema>;

function requireDurable() {
  if (config.storage.mode !== 'postgres')
    throw new AppError(503,'PRIVACY_STORAGE_UNAVAILABLE','Account-linked privacy history requires durable storage');
}

export async function recordUserCookieConsent(userId: string, input: unknown) {
  requireDurable();
  const receipt = privacyReceiptSchema.safeParse(input);
  if (!receipt.success)
    throw new AppError(400,'PRIVACY_CONSENT_INVALID','Invalid or outdated cookie preference receipt');
  const data = receipt.data;
  const now=Date.now();
  if (Date.parse(data.recordedAt) > now + 60000 ||
      Date.parse(data.expiresAt) <= Date.parse(data.recordedAt))
    throw new AppError(400,'PRIVACY_CONSENT_INVALID','Invalid consent record timestamps');
  return withTransaction(async client => {
    const inserted = await client.query(
      'INSERT INTO user_cookie_consent_receipts ' +
      '(receipt_id,user_id,policy_version,functional_allowed,analytics_allowed,marketing_allowed,source) ' +
      'VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (receipt_id) DO NOTHING RETURNING receipt_id',
      [data.receiptId,userId,data.version,data.preferences.functional,data.preferences.analytics,
        data.preferences.marketing,data.source],
    );
    const row = await client.query(
      'SELECT receipt_id,user_id,policy_version,functional_allowed,analytics_allowed,' +
      'marketing_allowed,source,recorded_at FROM user_cookie_consent_receipts WHERE receipt_id=$1',
      [data.receiptId],
    );
    const saved=row.rows[0];
    if (!saved || saved.user_id !== userId)
      throw new AppError(409,'PRIVACY_RECEIPT_CONFLICT','Consent receipt is already associated with another account');
    // Repeating the same receipt identifier can never mutate consent after first record.
    if (!inserted.rowCount && (
      saved.policy_version !== data.version ||
      saved.functional_allowed !== data.preferences.functional ||
      saved.analytics_allowed !== data.preferences.analytics ||
      saved.marketing_allowed !== data.preferences.marketing ||
      saved.source !== data.source))
      throw new AppError(409,'PRIVACY_RECEIPT_CONFLICT','Consent receipt cannot be modified');
    return {receiptId:saved.receipt_id,recordedAt:saved.recorded_at,recorded:true};
  });
}

export async function listUserCookieConsentHistory(userId:string) {
  requireDurable();
  const rows=await getDbPool().query(
    'SELECT receipt_id,policy_version,functional_allowed,analytics_allowed,marketing_allowed,' +
    'source,recorded_at FROM user_cookie_consent_receipts WHERE user_id=$1 ' +
    'ORDER BY recorded_at DESC,receipt_id DESC LIMIT 20',
    [userId],
  );
  return {policyVersion:COOKIE_PRIVACY_POLICY_VERSION,records:rows.rows.map(row=>({
    receiptId:row.receipt_id,version:row.policy_version,
    preferences:{functional:row.functional_allowed,analytics:row.analytics_allowed,marketing:row.marketing_allowed},
    source:row.source,recordedAt:row.recorded_at,
  }))};
}
