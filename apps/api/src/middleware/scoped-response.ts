import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../modules/auth/auth.middleware';

/** Minimize historical fulfilment data and operational financial projections. */
export function scopedResponse(value: any, roles: string[], privateHistory = false): any {
  if (Array.isArray(value)) return value.map(item => scopedResponse(item, roles, privateHistory));
  if (!value || typeof value !== 'object' || value instanceof Date) return value;
  const privileged = roles.some(role => ['admin', 'ops', 'support', 'finance'].includes(role));
  const merchant = !privileged && roles.some(role => role === 'merchant' || role.startsWith('merchant_'));
  const historical = privateHistory || (merchant && Boolean(value.branch_id) && ['COMPLETED','CANCELLED','REJECTED','DELIVERED'].includes(value.status));
  const financeOnly = roles.includes('finance') && !roles.some(role => ['admin','ops'].includes(role));
  const supportSummary = roles.includes('support') && !roles.some(role => ['admin','finance'].includes(role));
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (merchant && ['delivery_otp','deliveryOtp','expectedOtp'].includes(key)) continue;
    if (historical && ['customer_name','customer_phone','delivery_address_snapshot','dropoff_location','dropoff_address_text','special_instructions','delivery_instructions'].includes(key)) continue;
    if (financeOnly && ['latitude','longitude','location','last_location','pickup_location','dropoff_location','riderLiveLocation'].includes(key)) continue;
    if (supportSummary && ['provider_payload','raw_payload','callback_payload','ledger_entries','ledgerEntries','customer_phone','delivery_address_snapshot','dropoff_location','dropoff_address_text','provider_reference','mpesa_receipt_number','phone'].includes(key)) continue;
    result[key] = scopedResponse(item, roles, historical);
  }
  return result;
}

export function scopedResponseMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const json = res.json.bind(res);
  res.json = ((body: unknown) => json(scopedResponse(body, req.user?.roles || []))) as typeof res.json;
  next();
}
