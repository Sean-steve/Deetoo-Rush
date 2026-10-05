import { createSign } from 'node:crypto';
import { getDbPool } from '../../db/client';
import { config } from '@deetoo/config';
import { deviceRegistrationRepository } from './device-registration.repository';

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

interface CachedToken {
  value: string;
  expiresAt: number;
}

class ExternalNotificationProvider {
  private fcmToken: CachedToken | null = null;

  private async resolveUserContact(userId: string): Promise<{ email?: string; phone?: string }> {
    if (config.storage.mode !== 'postgres') return {};
    const res = await getDbPool().query(
      'SELECT email, phone_e164 FROM users WHERE id = $1 LIMIT 1',
      [userId],
    );
    const row = res.rows[0];
    return row ? { email: row.email || undefined, phone: row.phone_e164 || undefined } : {};
  }

  private async getFcmAccessToken(): Promise<string> {
    if (this.fcmToken && this.fcmToken.expiresAt > Date.now() + 60_000) return this.fcmToken.value;

    const clientEmail = process.env.FCM_CLIENT_EMAIL;
    const rawPrivateKey = process.env.FCM_PRIVATE_KEY;
    if (!clientEmail || !rawPrivateKey) {
      throw new Error('FCM service account credentials are not configured');
    }

    const privateKey = rawPrivateKey.replace(/\\n/g, '\n');
    const now = Math.floor(Date.now() / 1000);
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = b64url(
      JSON.stringify({
        iss: clientEmail,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
      }),
    );
    const unsigned = `${header}.${claims}`;
    const signer = createSign('RSA-SHA256');
    signer.update(unsigned);
    signer.end();
    const assertion = `${unsigned}.${signer.sign(privateKey).toString('base64url')}`;

    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    });
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!response.ok) {
      throw new Error(`FCM OAuth failed with HTTP ${response.status}`);
    }
    const json = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) throw new Error('FCM OAuth response did not contain an access token');
    this.fcmToken = {
      value: json.access_token,
      expiresAt: Date.now() + (json.expires_in || 3600) * 1000,
    };
    return json.access_token;
  }

  async sendPush(
    userId: string,
    title: string,
    body: string,
    data: Record<string, unknown>,
  ): Promise<string> {
    const projectId = process.env.FCM_PROJECT_ID;
    if (!projectId) throw new Error('FCM_PROJECT_ID is not configured');

    const registrations = await deviceRegistrationRepository.listActiveTokens(userId);
    if (!registrations.length) throw new Error('No active push device is registered for recipient');

    const accessToken = await this.getFcmAccessToken();
    let firstReference: string | null = null;
    let successCount = 0;
    const failures: string[] = [];

    for (const registration of registrations) {
      const response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${accessToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              token: registration.push_token,
              notification: { title, body },
              data: Object.fromEntries(
                Object.entries(data).map(([key, value]) => [key, String(value ?? '')]),
              ),
              android: {
                priority: 'high',
                notification: {
                  channel_id: 'delivery_offers',
                  sound: 'default',
                },
              },
            },
          }),
        },
      );

      const payload = (await response.json().catch(() => ({}))) as any;
      if (response.ok) {
        successCount += 1;
        firstReference ||= payload.name || `fcm:${registration.id}`;
        continue;
      }

      const code = payload?.error?.details?.[0]?.errorCode || payload?.error?.status || '';
      if (code === 'UNREGISTERED' || response.status === 404) {
        await deviceRegistrationRepository.deactivateToken(registration.push_token);
      }
      failures.push(`${registration.id}:${code || response.status}`);
    }

    if (!successCount) throw new Error(`FCM delivery failed: ${failures.join(', ')}`);
    return firstReference || `fcm:${successCount}`;
  }

  async sendSms(userId: string, message: string): Promise<string> {
    const apiKey = process.env.AFRICASTALKING_API_KEY;
    const username = process.env.AFRICASTALKING_USERNAME;
    const sender = process.env.AUTH_SMS_FROM;
    if (!apiKey || !username) throw new Error("Africa's Talking is not configured");

    const contact = await this.resolveUserContact(userId);
    if (!contact.phone) throw new Error('Recipient has no verified phone number');

    const body = new URLSearchParams({
      username,
      to: contact.phone,
      message,
      ...(sender ? { from: sender } : {}),
    });
    const response = await fetch('https://api.africastalking.com/version1/messaging', {
      method: 'POST',
      headers: {
        apiKey,
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    const payload = (await response.json().catch(() => ({}))) as any;
    if (!response.ok) throw new Error(`SMS provider failed with HTTP ${response.status}`);
    return payload?.SMSMessageData?.Recipients?.[0]?.messageId || `at:${Date.now()}`;
  }

  async sendEmail(userId: string, subject: string, text: string): Promise<string> {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.AUTH_EMAIL_FROM;
    if (!apiKey || !from) throw new Error('Resend is not configured');

    const contact = await this.resolveUserContact(userId);
    if (!contact.email) throw new Error('Recipient has no verified email address');

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ from, to: [contact.email], subject, text }),
    });
    const payload = (await response.json().catch(() => ({}))) as any;
    if (!response.ok || !payload.id) {
      throw new Error(`Email provider failed with HTTP ${response.status}`);
    }
    return payload.id;
  }
}

export const externalNotificationProvider = new ExternalNotificationProvider();
