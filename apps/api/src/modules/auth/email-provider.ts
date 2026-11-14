/** Shared M9 transport: Mailu SMTP or the existing Resend provider.
 * Acceptance is not proof of inbox delivery. Never log credentials or message bodies.
 */
import nodemailer from 'nodemailer';

export type EmailProvider = 'RESEND' | 'MAILU_SMTP';
export type EmailKind = 'identity' | 'notification';
export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  kind: EmailKind;
  requestId?: string;
}
export interface TestSmtpTransport {
  sendMail(message: {from: string;to: string;subject: string;text: string}):
    Promise<{accepted?: string[];messageId?: string}>;
  close(): void;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value || /placeholder|change.?me/i.test(value)) {
    throw new Error('Outbound email configuration missing: ' + name);
  }
  return value;
}

export function selectedEmailProvider(): EmailProvider {
  const mode = (process.env.DEETOO_EMAIL_PROVIDER || 'resend').trim().toLowerCase();
  if (mode === 'resend') return 'RESEND';
  if (mode === 'mailu') return 'MAILU_SMTP';
  throw new Error('DEETOO_EMAIL_PROVIDER must be resend or mailu');
}

export function mailuSmtpOptions() {
  const host = required('MAIL_SMTP_HOST');
  const port = Number(process.env.MAIL_SMTP_PORT || '465');
  if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(host)) {
    throw new Error('MAIL_SMTP_HOST must be a valid TLS hostname');
  }
  if (port !== 465 && port !== 587) {
    throw new Error('MAIL_SMTP_PORT must be 465 or 587');
  }
  return {
    host, port, secure: port === 465, requireTLS: port === 587,
    auth: { user: required('MAIL_SMTP_USER'), pass: required('MAIL_SMTP_PASS') },
    tls: { servername: host, rejectUnauthorized: true, minVersion: 'TLSv1.2' as const },
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000,
    logger: false, debug: false,
  };
}

export function assertEmailConfigured(kind: EmailKind): {provider:EmailProvider;from:string} {
  const provider = selectedEmailProvider();
  const from = kind === 'identity'
    ? required('AUTH_EMAIL_FROM')
    : process.env.NOTIFICATION_EMAIL_FROM?.trim() || required('AUTH_EMAIL_FROM');
  if (provider === 'MAILU_SMTP') mailuSmtpOptions();
  else required('RESEND_API_KEY');
  return {provider,from};
}

export async function sendPlatformEmail(
  message: OutgoingEmail,
  testTransport?: TestSmtpTransport,
): Promise<{provider: EmailProvider; reference:string}> {
  const {provider,from} = assertEmailConfigured(message.kind);
  if (provider === 'RESEND') {
    const response = await fetch('https://api.resend.com/emails', {
      method:'POST', redirect:'error',
      headers: {
        Authorization:'Bearer ' + required('RESEND_API_KEY'),
        'Content-Type':'application/json',
        ...(message.requestId ? {'Idempotency-Key':message.requestId} : {}),
      },
      body:JSON.stringify({from,to:[message.to],subject:message.subject,text:message.text}),
      signal:AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error('Email provider rejected request: HTTP ' + response.status);
    const payload = await response.json() as {id?:unknown};
    if (typeof payload.id !== 'string' || !payload.id) throw new Error('Email provider acceptance missing');
    return {provider,reference:payload.id};
  }

  // Authenticated SMTP only. An uncertain response after DATA can be an accepted message:
  // SMTP does not implement idempotency; callers must account for possible duplicate retries.
  const transport = testTransport || nodemailer.createTransport(mailuSmtpOptions());
  try {
    const info = await transport.sendMail({
      from,to:message.to,subject:message.subject,text:message.text,
    });
    if (!info.messageId || !(info.accepted || []).some(
      address => address.toLowerCase() === message.to.toLowerCase()
    )) throw new Error('SMTP recipient acceptance not confirmed');
    return {provider,reference:info.messageId};
  } finally {
    if (!testTransport) transport.close();
  }
}
