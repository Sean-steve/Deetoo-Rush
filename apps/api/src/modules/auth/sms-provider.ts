/**
 * Shared SMS transport for account recovery, OTP and operational notifications.
 * The external partner has not supplied a verifiable HTTP contract: no URL,
 * parameter names or success shape are assumed. Partner sending is disabled
 * until a reviewed provider contract is explicitly configured server-side.
 */
import { AppError } from '../../middleware/error-handler';

export type SmsProvider = 'AFRICASTALKING' | 'PARTNER';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value || /placeholder|change.?me|your.?key|example\.com/i.test(value))
    throw new AppError(503, 'SMS_PROVIDER_NOT_CONFIGURED', 'SMS delivery provider is not fully configured');
  return value;
}

export function selectedSmsProvider(): SmsProvider {
  const name = (process.env.DEETOO_SMS_PROVIDER || 'africastalking').trim().toLowerCase();
  if (name === 'africastalking') return 'AFRICASTALKING';
  if (name === 'partner') return 'PARTNER';
  throw new AppError(503, 'SMS_PROVIDER_NOT_CONFIGURED', 'Unsupported SMS provider selection');
}

/** Do not return credentials or provider URLs in application responses/logs. */
export function assertSmsConfigured(): SmsProvider {
  const selected = selectedSmsProvider();
  if (selected === 'AFRICASTALKING') {
    required('AFRICASTALKING_API_KEY');
    required('AFRICASTALKING_USERNAME');
    required('AUTH_SMS_FROM');
    return selected;
  }
  partnerConfig();
  return selected;
}

type PartnerFormat = 'json' | 'form';
type PartnerConfig = {
  url: string; partnerId: string; apiKey: string; senderId: string;
  format: PartnerFormat;
  names: {partnerId:string;apiKey:string;senderId:string;phone:string;message:string};
  acceptanceField: string; acceptanceValue: string; referenceField: string;
};

function validateField(name: string, value: string): string {
  if (!/^[a-zA-Z][\w-]{0,63}$/.test(value))
    throw new AppError(503,'SMS_PROVIDER_CONTRACT_NOT_VERIFIED','Invalid partner API field configuration');
  return value;
}
function validatePath(value: string): string {
  if (!/^[a-zA-Z][\w-]*(?:\.[a-zA-Z0-9][\w-]*){0,7}$/.test(value))
    throw new AppError(503,'SMS_PROVIDER_CONTRACT_NOT_VERIFIED','Invalid partner acceptance configuration');
  return value;
}

function partnerConfig(): PartnerConfig {
  if (process.env.SMS_PARTNER_CONTRACT_VERIFIED !== 'true')
    throw new AppError(503,'SMS_PROVIDER_CONTRACT_NOT_VERIFIED','Partner API specification has not been approved');
  const urlText = required('SMS_PARTNER_SEND_URL');
  let url: URL;
  try { url = new URL(urlText); }
  catch { throw new AppError(503,'SMS_PROVIDER_CONTRACT_NOT_VERIFIED','Invalid partner send URL'); }
  // Never send API keys to HTTP, in URL query strings, to loopback, or via redirects.
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      !url.hostname.includes('.') || /^(localhost|127\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/i.test(url.hostname))
    throw new AppError(503,'SMS_PROVIDER_CONTRACT_NOT_VERIFIED','Partner send URL must be a verified public HTTPS endpoint');
  const format = required('SMS_PARTNER_WIRE_FORMAT');
  if (format !== 'json' && format !== 'form')
    throw new AppError(503,'SMS_PROVIDER_CONTRACT_NOT_VERIFIED','Partner request format is not supported');

  const names = {
    partnerId: validateField('SMS_PARTNER_FIELD_ID', required('SMS_PARTNER_FIELD_ID')),
    apiKey: validateField('SMS_PARTNER_FIELD_API_KEY', required('SMS_PARTNER_FIELD_API_KEY')),
    senderId: validateField('SMS_PARTNER_FIELD_SENDER', required('SMS_PARTNER_FIELD_SENDER')),
    phone: validateField('SMS_PARTNER_FIELD_PHONE', required('SMS_PARTNER_FIELD_PHONE')),
    message: validateField('SMS_PARTNER_FIELD_MESSAGE', required('SMS_PARTNER_FIELD_MESSAGE')),
  };
  if (new Set(Object.values(names)).size !== Object.values(names).length)
    throw new AppError(503,'SMS_PROVIDER_CONTRACT_NOT_VERIFIED','Partner request field names must be distinct');

  return {
    url: url.toString(),
    partnerId: required('SMS_PARTNER_ID'),
    apiKey: required('SMS_PARTNER_API_KEY'),
    senderId: required('SMS_PARTNER_SENDER_ID'),
    format,
    names,
    acceptanceField: validatePath(required('SMS_PARTNER_ACCEPTANCE_FIELD')),
    acceptanceValue: required('SMS_PARTNER_ACCEPTANCE_VALUE'),
    referenceField: validatePath(required('SMS_PARTNER_REFERENCE_FIELD')),
  };
}

function atRecipientAccepted(payload: any): string | null {
  const recipients = payload?.SMSMessageData?.Recipients;
  if (!Array.isArray(recipients) || recipients.length !== 1) return null;
  const one = recipients[0];
  // Africa's Talking accepts only statusCode 101, not merely HTTP 2xx.
  return one?.statusCode === 101 && typeof one?.messageId === 'string' && one.messageId
    ? one.messageId : null;
}

function getPath(data: unknown, path: string): unknown {
  let value: any = data;
  for (const part of path.split('.')) {
    if (value === null || typeof value !== 'object') return undefined;
    value = value[part];
  }
  return value;
}

/** Provider acceptance is NOT handset delivery confirmation. */
export async function sendSmsMessage(phone: string, message: string): Promise<{provider: SmsProvider;reference: string}> {
  if (!/^\+[1-9]\d{7,14}$/.test(phone))
    throw new AppError(400,'SMS_INVALID_RECIPIENT','Recipient must be a valid international phone number');
  if (typeof message !== 'string' || !message.trim() || message.length > 1000)
    throw new AppError(400,'SMS_INVALID_MESSAGE','SMS body must contain 1–1000 characters');

  const provider = selectedSmsProvider();
  if (provider === 'AFRICASTALKING') {
    const key = required('AFRICASTALKING_API_KEY');
    const username = required('AFRICASTALKING_USERNAME');
    const from = required('AUTH_SMS_FROM');
    try {
      const response = await fetch('https://api.africastalking.com/version1/messaging',{
        method:'POST',
        redirect:'error',
        headers:{apiKey:key,Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({username,from,to:phone,message}),
        signal:AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error('SMS provider rejected request');
      const payload = await response.json();
      const reference = atRecipientAccepted(payload);
      if (!reference) throw new Error('SMS provider acceptance missing');
      return {provider,reference};
    } catch {
      // No fallback on ambiguous timeouts: original provider may have sent.
      throw new AppError(502,'SMS_PROVIDER_UNCONFIRMED','SMS provider acceptance could not be confirmed');
    }
  }

  const config = partnerConfig();
  const payload: Record<string,string> = {
    [config.names.partnerId]:config.partnerId,
    [config.names.apiKey]:config.apiKey,
    [config.names.senderId]:config.senderId,
    [config.names.phone]:phone,
    [config.names.message]:message,
  };
  try {
    const response = await fetch(config.url,{
      method:'POST',
      redirect:'error',
      headers:{Accept:'application/json','Content-Type':config.format==='json'?'application/json':'application/x-www-form-urlencoded'},
      body:config.format==='json'?JSON.stringify(payload):new URLSearchParams(payload),
      signal:AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error('Partner gateway rejected SMS');
    const result = await response.json();
    const accepted = getPath(result,config.acceptanceField);
    const reference = getPath(result,config.referenceField);
    if (String(accepted) !== config.acceptanceValue || typeof reference !== 'string' || !reference.trim())
      throw new Error('Partner gateway did not return verified acceptance evidence');
    return {provider,reference};
  } catch {
    // Never log body, API key, phone, or raw provider response.
    throw new AppError(502,'SMS_PROVIDER_UNCONFIRMED','SMS provider acceptance could not be confirmed');
  }
}
