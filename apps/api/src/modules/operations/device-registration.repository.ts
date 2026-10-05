import { randomUUID } from 'node:crypto';
import { config } from '@deetoo/config';
import { getDbPool } from '../../db/client';
import { allowMemoryAdapter } from '../../db/storage-policy';

export type DeviceRecipientType = 'CUSTOMER' | 'MERCHANT' | 'RIDER' | 'ADMIN';
export type DevicePlatform = 'ANDROID' | 'IOS' | 'WEB';

export interface DeviceRegistration {
  id: string;
  user_id: string;
  recipient_type: DeviceRecipientType;
  platform: DevicePlatform;
  push_token: string;
  device_id?: string | null;
  app_version?: string | null;
  active: boolean;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

class DeviceRegistrationRepository {
  private memory = new Map<string, DeviceRegistration>();

  async upsert(input: {
    userId: string;
    recipientType: DeviceRecipientType;
    platform: DevicePlatform;
    pushToken: string;
    deviceId?: string;
    appVersion?: string;
  }): Promise<DeviceRegistration> {
    const now = new Date().toISOString();
    if (config.storage.mode === 'postgres') {
      const pool = getDbPool();
      const res = await pool.query(
        `INSERT INTO device_registrations (
          id, user_id, recipient_type, platform, push_token, device_id, app_version,
          active, last_seen_at, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,true,NOW(),NOW(),NOW())
        ON CONFLICT (push_token) DO UPDATE SET
          user_id = EXCLUDED.user_id,
          recipient_type = EXCLUDED.recipient_type,
          platform = EXCLUDED.platform,
          device_id = EXCLUDED.device_id,
          app_version = EXCLUDED.app_version,
          active = true,
          last_seen_at = NOW(),
          updated_at = NOW()
        RETURNING *`,
        [
          randomUUID(),
          input.userId,
          input.recipientType,
          input.platform,
          input.pushToken,
          input.deviceId || null,
          input.appVersion || null,
        ],
      );
      return this.mapRow(res.rows[0]);
    }

    allowMemoryAdapter();
    const existing = Array.from(this.memory.values()).find((x) => x.push_token === input.pushToken);
    const record: DeviceRegistration = {
      id: existing?.id || randomUUID(),
      user_id: input.userId,
      recipient_type: input.recipientType,
      platform: input.platform,
      push_token: input.pushToken,
      device_id: input.deviceId || null,
      app_version: input.appVersion || null,
      active: true,
      last_seen_at: now,
      created_at: existing?.created_at || now,
      updated_at: now,
    };
    this.memory.set(record.id, record);
    return record;
  }

  async listActiveTokens(userId: string): Promise<DeviceRegistration[]> {
    if (config.storage.mode === 'postgres') {
      const res = await getDbPool().query(
        `SELECT * FROM device_registrations
         WHERE user_id = $1 AND active = true
         ORDER BY last_seen_at DESC`,
        [userId],
      );
      return res.rows.map((row: any) => this.mapRow(row));
    }
    allowMemoryAdapter();
    return Array.from(this.memory.values()).filter((x) => x.user_id === userId && x.active);
  }

  async deactivate(userId: string, pushToken: string): Promise<void> {
    if (config.storage.mode === 'postgres') {
      await getDbPool().query(
        `UPDATE device_registrations
         SET active = false, updated_at = NOW()
         WHERE user_id = $1 AND push_token = $2`,
        [userId, pushToken],
      );
      return;
    }
    allowMemoryAdapter();
    for (const [id, record] of this.memory) {
      if (record.user_id === userId && record.push_token === pushToken) {
        this.memory.set(id, { ...record, active: false, updated_at: new Date().toISOString() });
      }
    }
  }

  async deactivateToken(pushToken: string): Promise<void> {
    if (config.storage.mode === 'postgres') {
      await getDbPool().query(
        `UPDATE device_registrations
         SET active = false, updated_at = NOW()
         WHERE push_token = $1`,
        [pushToken],
      );
      return;
    }
    allowMemoryAdapter();
    for (const [id, record] of this.memory) {
      if (record.push_token === pushToken) {
        this.memory.set(id, { ...record, active: false, updated_at: new Date().toISOString() });
      }
    }
  }

  private mapRow(row: any): DeviceRegistration {
    return {
      id: row.id,
      user_id: row.user_id,
      recipient_type: row.recipient_type,
      platform: row.platform,
      push_token: row.push_token,
      device_id: row.device_id,
      app_version: row.app_version,
      active: Boolean(row.active),
      last_seen_at: new Date(row.last_seen_at).toISOString(),
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
    };
  }
}

export const deviceRegistrationRepository = new DeviceRegistrationRepository();
