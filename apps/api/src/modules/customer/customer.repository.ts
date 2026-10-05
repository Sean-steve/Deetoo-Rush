import { storageAdapter } from '../../db/adapter';
import { postgresCustomer } from './customer.postgres';
import { allowMemoryAdapter } from '../../db/storage-policy';
import { config } from '@deetoo/config';
/**
 * DEETOO - Customer Profiles & Addresses Repository
 * Implements persistence for customer identity, addresses, and defaults (ADR-005)
 */

import { CustomerProfile, CustomerAddress } from '@deetoo/types';
import { getDbPool } from '../../db/client';
import { logger } from '@deetoo/utils';
import crypto from 'crypto';

export class CustomerRepository {
  private ephemeralProfiles = new Map<string, CustomerProfile>();
  private ephemeralAddresses = new Map<string, CustomerAddress>();

  constructor() {
    this.seedBaseline();
  }

  private seedBaseline() {
    if (!config.storage.fixtures) return;
    const now = new Date().toISOString();
    const customerUserId = '10000000-0000-0000-0000-000000000004';
    const addressHomeId = '55555555-5555-5555-5555-555555555501';
    const addressWorkId = '55555555-5555-5555-5555-555555555502';

    const homeAddress: CustomerAddress = {
      id: addressHomeId,
      customer_id: customerUserId,
      label: 'Home',
      recipient_name: 'Jane Doe',
      phone_e164: '+254799887766',
      address_line1: 'Apt 4B, Mpaka Court, Woodvale Grove',
      address_line2: 'Mpaka Road',
      landmark: 'Opposite Sarit Centre',
      city: 'Nairobi',
      region: 'Nairobi County',
      country_code: 'KE',
      postal_code: '00100',
      address_text: 'Mpaka Court, Woodvale Grove, Westlands, Nairobi',
      latitude: -1.2618,
      longitude: 36.8027,
      delivery_instructions: 'Ring apartment 4B or leave with main gate security',
      is_default: true,
      is_active: true,
      created_at: now,
      updated_at: now,
    };

    const workAddress: CustomerAddress = {
      id: addressWorkId,
      customer_id: customerUserId,
      label: 'Work',
      recipient_name: 'Jane Doe',
      phone_e164: '+254799887766',
      address_line1: 'The Mirage Tower 2, 8th Floor, Chiromo Rd',
      address_line2: 'Suite 804',
      landmark: 'Next to Riverside Drive junction',
      city: 'Nairobi',
      region: 'Nairobi County',
      country_code: 'KE',
      postal_code: '00100',
      address_text: 'The Mirage Tower 2, Chiromo Rd, Westlands, Nairobi',
      latitude: -1.2698,
      longitude: 36.8089,
      delivery_instructions: 'Deliver to front desk reception',
      is_default: false,
      is_active: true,
      created_at: now,
      updated_at: now,
    };

    this.ephemeralAddresses.set(addressHomeId, homeAddress);
    this.ephemeralAddresses.set(addressWorkId, workAddress);

    this.ephemeralProfiles.set(customerUserId, {
      id: customerUserId,
      user_id: customerUserId,
      first_name: 'Jane',
      last_name: 'Doe',
      display_name: 'Jane Doe',
      phone: '+254799887766',
      email: 'customer@deetoo.ke',
      default_address_id: addressHomeId,
      created_at: now,
      updated_at: now,
    });
  }

  private async getClient() {
    try {
      const pool = getDbPool();
      return await pool.connect();
    } catch {
      allowMemoryAdapter();
      return null;
    }
  }

  // ==========================================
  // Customer Profiles
  // ==========================================

  public async getProfileByUserId(userId: string): Promise<CustomerProfile | null> {
    const client = await this.getClient();
    if (client) {
      try {
        const query = `
          SELECT cp.user_id, cp.display_name, cp.first_name, cp.last_name, cp.phone, cp.email,
                 cp.default_address_id, cp.created_at, cp.updated_at, u.email as u_email, u.phone_e164 as u_phone
          FROM customer_profiles cp
          LEFT JOIN users u ON u.id = cp.user_id
          WHERE cp.user_id = $1
        `;
        const res = await client.query(query, [userId]);
        if (res.rows[0]) {
          const row = res.rows[0];
          return {
            id: row.user_id,
            user_id: row.user_id,
            first_name: row.first_name || row.display_name?.split(' ')[0] || '',
            last_name: row.last_name || row.display_name?.split(' ').slice(1).join(' ') || '',
            display_name: row.display_name || 'Customer',
            phone: row.phone || row.u_phone || '',
            email: row.email || row.u_email || '',
            default_address_id: row.default_address_id || null,
            created_at: row.created_at?.toISOString?.() || row.created_at,
            updated_at: row.updated_at?.toISOString?.() || row.updated_at,
          };
        }
      } catch (err: any) {
      allowMemoryAdapter();
        logger.warn('Database query for customer profile failed, falling back to ephemeral store', {
          metadata: { error: err.message },
        });
      } finally {
        client.release();
      }
    }

    return this.ephemeralProfiles.get(userId) || null;
  }

  public async upsertProfile(data: {
    user_id: string;
    first_name?: string;
    last_name?: string;
    display_name?: string;
    phone?: string;
    email?: string;
    default_address_id?: string | null;
  }): Promise<CustomerProfile> {
    const now = new Date().toISOString();
    const existing = await this.getProfileByUserId(data.user_id);

    const firstName = data.first_name ?? existing?.first_name ?? '';
    const lastName = data.last_name ?? existing?.last_name ?? '';
    const displayName =
      data.display_name ??
      (firstName || lastName ? `${firstName} ${lastName}`.trim() : existing?.display_name ?? 'Customer');
    const phone = data.phone ?? existing?.phone ?? '';
    const email = data.email ?? existing?.email ?? '';
    const defaultAddressId =
      data.default_address_id !== undefined ? data.default_address_id : (existing?.default_address_id ?? null);

    const profile: CustomerProfile = {
      id: data.user_id,
      user_id: data.user_id,
      first_name: firstName,
      last_name: lastName,
      display_name: displayName,
      phone,
      email,
      default_address_id: defaultAddressId,
      created_at: existing?.created_at || now,
      updated_at: now,
    };

    const client = await this.getClient();
    if (client) {
      try {
        const query = `
          INSERT INTO customer_profiles (user_id, display_name, first_name, last_name, phone, email, default_address_id, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (user_id) DO UPDATE SET
            display_name = EXCLUDED.display_name,
            first_name = EXCLUDED.first_name,
            last_name = EXCLUDED.last_name,
            phone = EXCLUDED.phone,
            email = EXCLUDED.email,
            default_address_id = COALESCE(EXCLUDED.default_address_id, customer_profiles.default_address_id),
            updated_at = EXCLUDED.updated_at
        `;
        await client.query(query, [
          profile.user_id,
          profile.display_name,
          profile.first_name,
          profile.last_name,
          profile.phone,
          profile.email,
          profile.default_address_id,
          profile.updated_at,
        ]);
      } catch (err: any) {
      allowMemoryAdapter();
        logger.warn('Database upsert for customer profile failed', { metadata: { error: err.message } });
      } finally {
        client.release();
      }
    }

    this.ephemeralProfiles.set(data.user_id, profile);
    return profile;
  }

  // ==========================================
  // Customer Addresses
  // ==========================================

  public async listAddressesByCustomerId(customerId: string): Promise<CustomerAddress[]> {
    const client = await this.getClient();
    if (client) {
      try {
        const query = `
          SELECT id, customer_id, label, recipient_name, phone_e164,
                 COALESCE(address_line1, address_text) as address_line1,
                 address_line2, landmark, city, region, country_code, postal_code,
                 address_text, latitude, longitude,
                 COALESCE(delivery_instructions, instructions) as delivery_instructions,
                 is_default, is_active, created_at, updated_at
          FROM addresses
          WHERE customer_id = $1 AND is_active = true
          ORDER BY is_default DESC, created_at DESC
        `;
        const res = await client.query(query, [customerId]);
        if (res.rows.length > 0) {
          return res.rows.map((r) => ({
            id: r.id,
            customer_id: r.customer_id,
            label: r.label,
            recipient_name: r.recipient_name,
            phone_e164: r.phone_e164,
            address_line1: r.address_line1,
            address_line2: r.address_line2,
            landmark: r.landmark,
            city: r.city,
            region: r.region,
            country_code: r.country_code,
            postal_code: r.postal_code,
            address_text: r.address_text,
            latitude: Number(r.latitude),
            longitude: Number(r.longitude),
            delivery_instructions: r.delivery_instructions,
            is_default: Boolean(r.is_default),
            is_active: Boolean(r.is_active),
            created_at: r.created_at?.toISOString?.() || r.created_at,
            updated_at: r.updated_at?.toISOString?.() || r.updated_at,
          }));
        }
      } catch (err: any) {
      allowMemoryAdapter();
        logger.warn('Database listAddresses failed', { metadata: { error: err.message } });
      } finally {
        client.release();
      }
    }

    const addresses = Array.from(this.ephemeralAddresses.values()).filter(
      (a) => a.customer_id === customerId && a.is_active
    );
    return addresses.sort((a, b) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0));
  }

  public async findAddressById(addressId: string): Promise<CustomerAddress | null> {
    const client = await this.getClient();
    if (client) {
      try {
        const query = `
          SELECT id, customer_id, label, recipient_name, phone_e164,
                 COALESCE(address_line1, address_text) as address_line1,
                 address_line2, landmark, city, region, country_code, postal_code,
                 address_text, latitude, longitude,
                 COALESCE(delivery_instructions, instructions) as delivery_instructions,
                 is_default, is_active, created_at, updated_at
          FROM addresses
          WHERE id = $1 AND is_active = true
        `;
        const res = await client.query(query, [addressId]);
        if (res.rows[0]) {
          const r = res.rows[0];
          return {
            id: r.id,
            customer_id: r.customer_id,
            label: r.label,
            recipient_name: r.recipient_name,
            phone_e164: r.phone_e164,
            address_line1: r.address_line1,
            address_line2: r.address_line2,
            landmark: r.landmark,
            city: r.city,
            region: r.region,
            country_code: r.country_code,
            postal_code: r.postal_code,
            address_text: r.address_text,
            latitude: Number(r.latitude),
            longitude: Number(r.longitude),
            delivery_instructions: r.delivery_instructions,
            is_default: Boolean(r.is_default),
            is_active: Boolean(r.is_active),
            created_at: r.created_at?.toISOString?.() || r.created_at,
            updated_at: r.updated_at?.toISOString?.() || r.updated_at,
          };
        }
      } catch (err: any) {
      allowMemoryAdapter();
        logger.warn('Database findAddressById failed', { metadata: { error: err.message } });
      } finally {
        client.release();
      }
    }

    const addr = this.ephemeralAddresses.get(addressId);
    return addr && addr.is_active ? addr : null;
  }

  public async createAddress(data: {
    customer_id: string;
    label: string;
    recipient_name?: string;
    phone_e164?: string;
    address_line1: string;
    address_line2?: string;
    landmark?: string;
    city?: string;
    region?: string;
    country_code?: string;
    postal_code?: string;
    latitude: number;
    longitude: number;
    delivery_instructions?: string;
    is_default?: boolean;
  }): Promise<CustomerAddress> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const existingList = await this.listAddressesByCustomerId(data.customer_id);
    // If first address, force default = true
    const isDefault = data.is_default || existingList.length === 0;

    const addressText = [
      data.address_line1,
      data.address_line2,
      data.landmark,
      data.city || 'Nairobi',
    ]
      .filter(Boolean)
      .join(', ');

    const newAddress: CustomerAddress = {
      id,
      customer_id: data.customer_id,
      label: data.label,
      recipient_name: data.recipient_name || '',
      phone_e164: data.phone_e164 || '',
      address_line1: data.address_line1,
      address_line2: data.address_line2,
      landmark: data.landmark,
      city: data.city || 'Nairobi',
      region: data.region || 'Nairobi County',
      country_code: data.country_code || 'KE',
      postal_code: data.postal_code,
      address_text: addressText,
      latitude: data.latitude,
      longitude: data.longitude,
      delivery_instructions: data.delivery_instructions,
      is_default: isDefault,
      is_active: true,
      created_at: now,
      updated_at: now,
    };

    const client = await this.getClient();
    if (client) {
      try {
        await client.query('BEGIN');

        if (isDefault) {
          // Unset any previous default
          await client.query(
            'UPDATE addresses SET is_default = false, updated_at = $1 WHERE customer_id = $2',
            [now, data.customer_id]
          );
        }

        const insertQuery = `
          INSERT INTO addresses (
            id, customer_id, label, recipient_name, phone_e164,
            address_line1, address_line2, landmark, city, region, country_code, postal_code,
            address_text, latitude, longitude, location,
            delivery_instructions, is_default, is_active, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9, $10, $11, $12,
            $13, $14, $15, ST_SetSRID(ST_MakePoint($15, $14), 4326)::geography,
            $16, $17, true, $18, $19
          )
        `;
        await client.query(insertQuery, [
          newAddress.id,
          newAddress.customer_id,
          newAddress.label,
          newAddress.recipient_name,
          newAddress.phone_e164,
          newAddress.address_line1,
          newAddress.address_line2 || null,
          newAddress.landmark || null,
          newAddress.city,
          newAddress.region,
          newAddress.country_code,
          newAddress.postal_code || null,
          newAddress.address_text,
          newAddress.latitude,
          newAddress.longitude,
          newAddress.delivery_instructions || null,
          newAddress.is_default,
          newAddress.created_at,
          newAddress.updated_at,
        ]);

        if (isDefault) {
          await client.query(
            'UPDATE customer_profiles SET default_address_id = $1, updated_at = $2 WHERE user_id = $3',
            [newAddress.id, now, data.customer_id]
          );
        }

        await client.query('COMMIT');
      } catch (err: any) {
        await client.query('ROLLBACK');
        logger.warn('Database insert address failed', { metadata: { error: err.message } });
      } finally {
        client.release();
      }
    }

    if (isDefault) {
      for (const a of this.ephemeralAddresses.values()) {
        if (a.customer_id === data.customer_id) {
          a.is_default = false;
        }
      }
      const profile = this.ephemeralProfiles.get(data.customer_id);
      if (profile) {
        profile.default_address_id = newAddress.id;
        profile.updated_at = now;
      }
    }

    this.ephemeralAddresses.set(newAddress.id, newAddress);
    return newAddress;
  }

  public async updateAddress(
    addressId: string,
    customerId: string,
    data: Partial<CustomerAddress>
  ): Promise<CustomerAddress | null> {
    const existing = await this.findAddressById(addressId);
    if (!existing || existing.customer_id !== customerId) {
      return null;
    }

    const now = new Date().toISOString();
    const isDefault = data.is_default !== undefined ? data.is_default : existing.is_default;

    const addressLine1 = data.address_line1 ?? existing.address_line1;
    const addressLine2 = data.address_line2 !== undefined ? data.address_line2 : existing.address_line2;
    const landmark = data.landmark !== undefined ? data.landmark : existing.landmark;
    const city = data.city ?? existing.city;

    const addressText = [addressLine1, addressLine2, landmark, city].filter(Boolean).join(', ');

    const updated: CustomerAddress = {
      ...existing,
      ...data,
      address_text: addressText,
      updated_at: now,
    };

    const client = await this.getClient();
    if (client) {
      try {
        await client.query('BEGIN');

        if (isDefault && !existing.is_default) {
          await client.query(
            'UPDATE addresses SET is_default = false, updated_at = $1 WHERE customer_id = $2',
            [now, customerId]
          );
        }

        const updateQuery = `
          UPDATE addresses SET
            label = $1, recipient_name = $2, phone_e164 = $3,
            address_line1 = $4, address_line2 = $5, landmark = $6,
            city = $7, region = $8, country_code = $9, postal_code = $10,
            address_text = $11, latitude = $12, longitude = $13,
            location = ST_SetSRID(ST_MakePoint($13, $12), 4326)::geography,
            delivery_instructions = $14, is_default = $15, updated_at = $16
          WHERE id = $17 AND customer_id = $18
        `;
        await client.query(updateQuery, [
          updated.label,
          updated.recipient_name || '',
          updated.phone_e164 || '',
          updated.address_line1,
          updated.address_line2 || null,
          updated.landmark || null,
          updated.city,
          updated.region,
          updated.country_code,
          updated.postal_code || null,
          updated.address_text,
          updated.latitude,
          updated.longitude,
          updated.delivery_instructions || null,
          updated.is_default,
          updated.updated_at,
          addressId,
          customerId,
        ]);

        if (isDefault) {
          await client.query(
            'UPDATE customer_profiles SET default_address_id = $1, updated_at = $2 WHERE user_id = $3',
            [addressId, now, customerId]
          );
        }

        await client.query('COMMIT');
      } catch (err: any) {
        await client.query('ROLLBACK');
        logger.warn('Database update address failed', { metadata: { error: err.message } });
      } finally {
        client.release();
      }
    }

    if (isDefault && !existing.is_default) {
      for (const a of this.ephemeralAddresses.values()) {
        if (a.customer_id === customerId) {
          a.is_default = false;
        }
      }
      const profile = this.ephemeralProfiles.get(customerId);
      if (profile) {
        profile.default_address_id = addressId;
        profile.updated_at = now;
      }
    }

    this.ephemeralAddresses.set(addressId, updated);
    return updated;
  }

  public async deleteAddress(addressId: string, customerId: string): Promise<boolean> {
    const existing = await this.findAddressById(addressId);
    if (!existing || existing.customer_id !== customerId) {
      return false;
    }

    const now = new Date().toISOString();
    const wasDefault = existing.is_default;

    const client = await this.getClient();
    if (client) {
      try {
        await client.query('BEGIN');

        await client.query(
          'UPDATE addresses SET is_active = false, is_default = false, deleted_at = $1, updated_at = $1 WHERE id = $2 AND customer_id = $3',
          [now, addressId, customerId]
        );

        if (wasDefault) {
          // Promote next active address if one exists
          const nextRes = await client.query(
            'SELECT id FROM addresses WHERE customer_id = $1 AND is_active = true AND id != $2 ORDER BY created_at DESC LIMIT 1',
            [customerId, addressId]
          );
          if (nextRes.rows[0]) {
            const nextId = nextRes.rows[0].id;
            await client.query('UPDATE addresses SET is_default = true, updated_at = $1 WHERE id = $2', [now, nextId]);
            await client.query('UPDATE customer_profiles SET default_address_id = $1, updated_at = $2 WHERE user_id = $3', [nextId, now, customerId]);
          } else {
            await client.query('UPDATE customer_profiles SET default_address_id = NULL, updated_at = $1 WHERE user_id = $2', [now, customerId]);
          }
        }

        await client.query('COMMIT');
      } catch (err: any) {
        await client.query('ROLLBACK');
        logger.warn('Database delete address failed', { metadata: { error: err.message } });
      } finally {
        client.release();
      }
    }

    existing.is_active = false;
    existing.is_default = false;
    existing.updated_at = now;

    if (wasDefault) {
      const remaining = Array.from(this.ephemeralAddresses.values()).filter(
        (a) => a.customer_id === customerId && a.is_active && a.id !== addressId
      );
      const profile = this.ephemeralProfiles.get(customerId);
      if (remaining.length > 0) {
        remaining[0].is_default = true;
        if (profile) profile.default_address_id = remaining[0].id;
      } else {
        if (profile) profile.default_address_id = null;
      }
    }

    return true;
  }

  public async setDefaultAddress(addressId: string, customerId: string): Promise<CustomerAddress | null> {
    const existing = await this.findAddressById(addressId);
    if (!existing || existing.customer_id !== customerId) {
      return null;
    }

    const now = new Date().toISOString();
    const client = await this.getClient();
    if (client) {
      try {
        await client.query('BEGIN');
        await client.query(
          'UPDATE addresses SET is_default = false, updated_at = $1 WHERE customer_id = $2',
          [now, customerId]
        );
        await client.query(
          'UPDATE addresses SET is_default = true, updated_at = $1 WHERE id = $2 AND customer_id = $3',
          [now, addressId, customerId]
        );
        await client.query(
          'UPDATE customer_profiles SET default_address_id = $1, updated_at = $2 WHERE user_id = $3',
          [addressId, now, customerId]
        );
        await client.query('COMMIT');
      } catch (err: any) {
        await client.query('ROLLBACK');
        logger.warn('Database setDefaultAddress failed', { metadata: { error: err.message } });
      } finally {
        client.release();
      }
    }

    for (const a of this.ephemeralAddresses.values()) {
      if (a.customer_id === customerId) {
        a.is_default = a.id === addressId;
        a.updated_at = now;
      }
    }

    const profile = this.ephemeralProfiles.get(customerId);
    if (profile) {
      profile.default_address_id = addressId;
      profile.updated_at = now;
    }

    existing.is_default = true;
    existing.updated_at = now;
    return existing;
  }

  // ==========================================
  // Admin Inspection
  // ==========================================

  public async listAllCustomers(options?: {
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ customers: CustomerProfile[]; total: number }> {
    allowMemoryAdapter();
    const limit = options?.limit || 20;
    const offset = options?.offset || 0;

    let all = Array.from(this.ephemeralProfiles.values());
    if (options?.search) {
      const q = options.search.toLowerCase();
      all = all.filter(
        (c) =>
          c.display_name.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          c.phone.includes(q)
      );
    }

    return {
      customers: all.slice(offset, offset + limit),
      total: all.length,
    };
  }
}

export const customerRepository = storageAdapter(new CustomerRepository(), postgresCustomer);
