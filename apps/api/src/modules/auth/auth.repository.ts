import { storageAdapter } from '../../db/adapter';
import { postgresAuth } from './auth.postgres';
import { allowMemoryAdapter } from '../../db/storage-policy';
import { config } from '@deetoo/config';
/**
 * DEETOO - Authentication & Identity Repository
 * Implements persistent identity storage with seamless database/ephemeral resilience (ADR-005)
 */

import bcrypt from 'bcryptjs';
import { UserRole, UserStatus, AuditLogEntry, AuthUser } from '@deetoo/types';
import { logger } from '@deetoo/utils';
import { getDbPool } from '../../db/client';

export interface UserRecord {
  id: string;
  email: string | null;
  phone_e164: string | null;
  password_hash: string;
  status: UserStatus;
  email_verified_at: string | null;
  phone_verified_at: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SessionRecord {
  id: string;
  user_id: string;
  refresh_token_hash: string;
  expires_at: string;
  revoked_at: string | null;
  ip_address: string | null;
  device_info: string | null;
  last_used_at: string | null;
  created_at: string;
}

export interface PasswordResetRecord {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export interface VerificationTokenRecord {
  id: string;
  user_id: string;
  type: string;
  token_hash: string;
  expires_at: string;
  attempts: number;
  verified_at: string | null;
  created_at: string;
}

export interface CustomerProfileRecord {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

export interface MerchantMembershipRecord {
  id: string;
  user_id: string;
  merchant_id: string;
  branch_ids: string[];
  role_code: string;
  created_at: string;
}

export interface RiderProfileRecord {
  id: string;
  user_id: string;
  vehicle_type: string;
  operational_status: string;
  created_at: string;
}

// In-Memory Storage for Standalone Dev & Resilient Testing
class EphemeralAuthStore {
  public users = new Map<string, UserRecord>();
  public sessions = new Map<string, SessionRecord>();
  public userRoles = new Map<string, Set<UserRole>>();
  public passwordResets = new Map<string, PasswordResetRecord>();
  public verificationTokens = new Map<string, VerificationTokenRecord>();
  public customerProfiles = new Map<string, CustomerProfileRecord>();
  public merchantMemberships = new Map<string, MerchantMembershipRecord[]>();
  public riderProfiles = new Map<string, RiderProfileRecord>();
  public auditLogs: AuditLogEntry[] = [];

  constructor() {
    this.seedBaseline();
  }

  private seedBaseline() {
    if (!config.storage.fixtures) return;
    const now = new Date().toISOString();
    // Pre-computed bcrypt hashes with cost factor 10
    // AdminPass123!
    const adminHash = bcrypt.hashSync('AdminPass123!', 10);
    // MerchantPass123!
    const merchantHash = bcrypt.hashSync('MerchantPass123!', 10);
    // RiderPass123!
    const riderHash = bcrypt.hashSync('RiderPass123!', 10);
    // CustomerPass123!
    const customerHash = bcrypt.hashSync('CustomerPass123!', 10);
    // OpsPass123!
    const opsHash = bcrypt.hashSync('OpsPass123!', 10);
    // SuspendedPass123!
    const suspendedHash = bcrypt.hashSync('SuspendedPass123!', 10);

    // 1. Admin User
    const adminId = '10000000-0000-0000-0000-000000000001';
    this.users.set(adminId, {
      id: adminId,
      email: 'admin@deetoo.ke',
      phone_e164: '+254700000001',
      password_hash: adminHash,
      status: UserStatus.ACTIVE,
      email_verified_at: now,
      phone_verified_at: now,
      last_login_at: now,
      created_at: now,
      updated_at: now,
    });
    this.userRoles.set(adminId, new Set([UserRole.ADMIN]));

    // 2. Merchant Owner User
    const merchantUserId = '10000000-0000-0000-0000-000000000002';
    this.users.set(merchantUserId, {
      id: merchantUserId,
      email: 'merchant@deetoo.ke',
      phone_e164: '+254700000002',
      password_hash: merchantHash,
      status: UserStatus.ACTIVE,
      email_verified_at: now,
      phone_verified_at: now,
      last_login_at: now,
      created_at: now,
      updated_at: now,
    });
    this.userRoles.set(merchantUserId, new Set([UserRole.MERCHANT_OWNER, UserRole.MERCHANT]));
    this.merchantMemberships.set(merchantUserId, [
      {
        id: 'mem_01',
        user_id: merchantUserId,
        merchant_id: 'merchant_burger_01',
        branch_ids: ['branch_westlands_01', 'branch_kilimani_02'],
        role_code: 'merchant_owner',
        created_at: now,
      },
    ]);

    // 3. Rider User
    const riderUserId = '10000000-0000-0000-0000-000000000003';
    this.users.set(riderUserId, {
      id: riderUserId,
      email: 'rider@deetoo.ke',
      phone_e164: '+254712345678',
      password_hash: riderHash,
      status: UserStatus.ACTIVE,
      email_verified_at: now,
      phone_verified_at: now,
      last_login_at: now,
      created_at: now,
      updated_at: now,
    });
    this.userRoles.set(riderUserId, new Set([UserRole.RIDER]));
    this.riderProfiles.set(riderUserId, {
      id: 'rider_john_01',
      user_id: riderUserId,
      vehicle_type: 'MOTORBIKE',
      operational_status: 'ONLINE',
      created_at: now,
    });

    // 4. Customer User
    const customerUserId = '10000000-0000-0000-0000-000000000004';
    this.users.set(customerUserId, {
      id: customerUserId,
      email: 'customer@deetoo.ke',
      phone_e164: '+254799887766',
      password_hash: customerHash,
      status: UserStatus.ACTIVE,
      email_verified_at: now,
      phone_verified_at: now,
      last_login_at: now,
      created_at: now,
      updated_at: now,
    });
    this.userRoles.set(customerUserId, new Set([UserRole.CUSTOMER]));
    this.customerProfiles.set(customerUserId, {
      id: 'cust_jane_01',
      user_id: customerUserId,
      name: 'Jane Doe',
      created_at: now,
    });

    // 5. Operations User
    const opsUserId = '10000000-0000-0000-0000-000000000005';
    this.users.set(opsUserId, {
      id: opsUserId,
      email: 'ops@deetoo.ke',
      phone_e164: '+254700000005',
      password_hash: opsHash,
      status: UserStatus.ACTIVE,
      email_verified_at: now,
      phone_verified_at: now,
      last_login_at: now,
      created_at: now,
      updated_at: now,
    });
    this.userRoles.set(opsUserId, new Set([UserRole.OPS]));

    // 6. Suspended User (for testing authorization and suspension guard)
    const suspendedUserId = '10000000-0000-0000-0000-000000000006';
    this.users.set(suspendedUserId, {
      id: suspendedUserId,
      email: 'suspended@deetoo.ke',
      phone_e164: '+254700000006',
      password_hash: suspendedHash,
      status: UserStatus.SUSPENDED,
      email_verified_at: now,
      phone_verified_at: now,
      last_login_at: null,
      created_at: now,
      updated_at: now,
    });
    this.userRoles.set(suspendedUserId, new Set([UserRole.CUSTOMER]));

    // Initial audit log
    this.auditLogs.push({
      id: 1,
      actor_user_id: adminId,
      actor_role: 'admin',
      action: 'SYSTEM_BOOTSTRAP',
      resource_type: 'IDENTITY',
      created_at: now,
      metadata: { seededAccounts: 6 },
    });
  }
}

const ephemeralStore = new EphemeralAuthStore();

export class AuthRepository {
  private async getClient() {
    try {
      const pool = getDbPool();
      if (!pool) return null;
      const client = await pool.connect();
      return client;
    } catch {
      allowMemoryAdapter();
      return null;
    }
  }

  // ==========================================
  // User Operations
  // ==========================================

  public async findUserById(id: string): Promise<UserRecord | null> {
    const client = await this.getClient();
    if (client) {
      try {
        const res = await client.query('SELECT * FROM users WHERE id = $1', [id]);
        if (res.rows[0]) return res.rows[0];
      } catch (err: any) {
      allowMemoryAdapter();
        logger.warn('Database query failed, falling back to ephemeral store', { metadata: { error: err.message } });
      } finally {
        client.release();
      }
    }
    return ephemeralStore.users.get(id) || null;
  }

  public async findUserByEmail(email: string): Promise<UserRecord | null> {
    const normalized = email.trim().toLowerCase();
    const client = await this.getClient();
    if (client) {
      try {
        const res = await client.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [normalized]);
        if (res.rows[0]) return res.rows[0];
      } catch (err: any) {
      allowMemoryAdapter();
        logger.warn('Database query failed, falling back to ephemeral store', { metadata: { error: err.message } });
      } finally {
        client.release();
      }
    }
    for (const u of ephemeralStore.users.values()) {
      if (u.email && u.email.toLowerCase() === normalized) {
        return u;
      }
    }
    return null;
  }

  public async findUserByPhone(phone: string): Promise<UserRecord | null> {
    const client = await this.getClient();
    if (client) {
      try {
        const res = await client.query('SELECT * FROM users WHERE phone_e164 = $1', [phone]);
        if (res.rows[0]) return res.rows[0];
      } catch (err: any) {
      allowMemoryAdapter();
        logger.warn('Database query failed, falling back to ephemeral store', { metadata: { error: err.message } });
      } finally {
        client.release();
      }
    }
    for (const u of ephemeralStore.users.values()) {
      if (u.phone_e164 === phone) {
        return u;
      }
    }
    return null;
  }

  public async findUserByIdentifier(identifier: string): Promise<UserRecord | null> {
    const trimmed = identifier.trim();
    if (trimmed.includes('@')) {
      return this.findUserByEmail(trimmed);
    }
    return (await this.findUserByPhone(trimmed)) || (await this.findUserByEmail(trimmed));
  }

  public async createUser(user: {
    id: string;
    email?: string | null;
    phone_e164?: string | null;
    password_hash: string;
    status: UserStatus;
  }): Promise<UserRecord> {
    const now = new Date().toISOString();
    const record: UserRecord = {
      id: user.id,
      email: user.email ? user.email.toLowerCase().trim() : null,
      phone_e164: user.phone_e164 || null,
      password_hash: user.password_hash,
      status: user.status,
      email_verified_at: null,
      phone_verified_at: null,
      last_login_at: null,
      created_at: now,
      updated_at: now,
    };

    const client = await this.getClient();
    if (client) {
      try {
        await client.query(
          `INSERT INTO users (id, email, phone_e164, password_hash, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [record.id, record.email, record.phone_e164, record.password_hash, record.status, record.created_at, record.updated_at]
        );
      } catch (err: any) {
      allowMemoryAdapter();
        logger.warn('Database insert failed, writing to ephemeral store', { metadata: { error: err.message } });
      } finally {
        client.release();
      }
    }

    ephemeralStore.users.set(record.id, record);
    return record;
  }

  public async updateUserIdentity(
    userId: string,
    updates: { email?: string | null; phone_e164?: string | null },
  ): Promise<UserRecord | null> {
    const existing = await this.findUserById(userId);
    if (!existing) return null;
    const now = new Date().toISOString();
    const email =
      updates.email !== undefined
        ? updates.email
          ? updates.email.toLowerCase().trim()
          : null
        : existing.email;
    const phone =
      updates.phone_e164 !== undefined ? updates.phone_e164 : existing.phone_e164;

    const client = await this.getClient();
    if (client) {
      try {
        await client.query(
          `UPDATE users
           SET email=$1, phone_e164=$2, updated_at=$3
           WHERE id=$4`,
          [email, phone, now, userId],
        );
      } finally {
        client.release();
      }
    }

    const updated: UserRecord = {
      ...existing,
      email,
      phone_e164: phone,
      updated_at: now,
    };
    ephemeralStore.users.set(userId, updated);
    return updated;
  }

  public async deactivateUser(
    userId: string,
    reason: string,
    anonymize = false,
  ): Promise<UserRecord | null> {
    const existing = await this.findUserById(userId);
    if (!existing) return null;
    const now = new Date().toISOString();
    const anonymousEmail = anonymize ? `deleted+${userId}@deetoo.invalid` : existing.email;
    const anonymousPhone = anonymize ? null : existing.phone_e164;

    const client = await this.getClient();
    if (client) {
      try {
        await client.query(
          `UPDATE users
           SET status=$1,
               email=$2,
               phone_e164=$3,
               deactivated_at=$4,
               deactivation_reason=$5,
               anonymized_at=$6,
               updated_at=$4
           WHERE id=$7`,
          [
            UserStatus.DISABLED,
            anonymousEmail,
            anonymousPhone,
            now,
            reason,
            anonymize ? now : null,
            userId,
          ],
        );
      } finally {
        client.release();
      }
    }

    const updated: UserRecord = {
      ...existing,
      status: UserStatus.DISABLED,
      email: anonymousEmail,
      phone_e164: anonymousPhone,
      updated_at: now,
    };
    ephemeralStore.users.set(userId, updated);
    await this.revokeAllUserSessions(userId);
    return updated;
  }

  public async updateUserStatus(userId: string, status: UserStatus): Promise<void> {
    const now = new Date().toISOString();
    const client = await this.getClient();
    if (client) {
      try {
        await client.query('UPDATE users SET status = $1, updated_at = $2 WHERE id = $3', [status, now, userId]);
      } catch (err: any) {
      allowMemoryAdapter();
        logger.warn('Database update status failed', { metadata: { error: err.message } });
      } finally {
        client.release();
      }
    }
    const user = ephemeralStore.users.get(userId);
    if (user) {
      user.status = status;
      user.updated_at = now;
    }
  }

  public async updateUserPassword(userId: string, passwordHash: string): Promise<void> {
    const now = new Date().toISOString();
    const client = await this.getClient();
    if (client) {
      try {
        await client.query('UPDATE users SET password_hash = $1, updated_at = $2 WHERE id = $3', [passwordHash, now, userId]);
      } catch (err: any) {
      allowMemoryAdapter();
        logger.warn('Database update password failed', { metadata: { error: err.message } });
      } finally {
        client.release();
      }
    }
    const user = ephemeralStore.users.get(userId);
    if (user) {
      user.password_hash = passwordHash;
      user.updated_at = now;
    }
  }

  public async updateLastLogin(userId: string): Promise<void> {
    const now = new Date().toISOString();
    const client = await this.getClient();
    if (client) {
      try {
        await client.query('UPDATE users SET last_login_at = $1 WHERE id = $2', [now, userId]);
      } catch (err: any) {
      allowMemoryAdapter();
        logger.warn('Database update last login failed', { metadata: { error: err.message } });
      } finally {
        client.release();
      }
    }
    const user = ephemeralStore.users.get(userId);
    if (user) {
      user.last_login_at = now;
    }
  }

  public async listUsers(options: {
    role?: string;
    status?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ users: UserRecord[]; total: number }> {
    allowMemoryAdapter();
    const limit = options.limit || 20;
    const offset = options.offset || 0;

    let allUsers = Array.from(ephemeralStore.users.values());

    if (options.status) {
      allUsers = allUsers.filter((u) => u.status === options.status);
    }
    if (options.search) {
      const q = options.search.toLowerCase();
      allUsers = allUsers.filter(
        (u) =>
          (u.email && u.email.toLowerCase().includes(q)) ||
          (u.phone_e164 && u.phone_e164.includes(q)) ||
          u.id.includes(q)
      );
    }
    if (options.role) {
      allUsers = allUsers.filter((u) => {
        const roles = ephemeralStore.userRoles.get(u.id);
        return roles ? roles.has(options.role as UserRole) : false;
      });
    }

    const total = allUsers.length;
    const paginated = allUsers.slice(offset, offset + limit);
    return { users: paginated, total };
  }

  // ==========================================
  // Roles Operations
  // ==========================================

  public async getUserRoles(userId: string): Promise<UserRole[]> {
    const client = await this.getClient();
    if (client) {
      try {
        const res = await client.query(
          `SELECT r.code FROM roles r 
           JOIN user_roles ur ON ur.role_id = r.id 
           WHERE ur.user_id = $1`,
          [userId]
        );
        if (res.rows.length > 0) {
          return res.rows.map((row: any) => row.code as UserRole);
        }
      } catch (err: any) {
      allowMemoryAdapter();
        logger.warn('Database query roles failed', { metadata: { error: err.message } });
      } finally {
        client.release();
      }
    }
    const rolesSet = ephemeralStore.userRoles.get(userId);
    return rolesSet ? Array.from(rolesSet) : [UserRole.CUSTOMER];
  }

  public async setUserRoles(userId: string, roles: UserRole[]): Promise<void> {
    const client = await this.getClient();
    if (client) {
      try {
        await client.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);
        for (const roleCode of roles) {
          const result = await client.query(
            `INSERT INTO user_roles (user_id, role_id)
             SELECT $1, id FROM roles WHERE code = $2`,
            [userId, roleCode]
          );
          if (result.rowCount === 0) {
            // The SELECT matched no row in `roles`, so the INSERT...SELECT silently inserted
            // nothing -- not a constraint violation, just an empty result set, so nothing would
            // otherwise indicate this call failed. Previously this meant granting a role whose
            // code wasn't seeded into `roles` (e.g. merchant_owner/merchant_manager/merchant_staff
            // were missing from the seed script) would return 200 OK while granting nothing at
            // all, leaving the user permanently unable to pass any authorization check that role
            // was meant to satisfy, with no error anywhere to explain why.
            throw new Error(`No role exists in the roles table with code '${roleCode}'`);
          }
        }
      } catch (err: any) {
        logger.warn('Database setUserRoles failed', { metadata: { error: err.message } });
        throw err;
      } finally {
        client.release();
      }
    }
    ephemeralStore.userRoles.set(userId, new Set(roles));
  }

  // ==========================================
  // Profiles & Memberships
  // ==========================================

  public async getCustomerProfile(userId: string): Promise<CustomerProfileRecord | null> {
    allowMemoryAdapter();
    return ephemeralStore.customerProfiles.get(userId) || null;
  }

  public async createCustomerProfile(profile: { id: string; user_id: string; name: string }): Promise<void> {
    allowMemoryAdapter();
    const record: CustomerProfileRecord = {
      ...profile,
      created_at: new Date().toISOString(),
    };
    ephemeralStore.customerProfiles.set(profile.user_id, record);
  }

  public async getMerchantMemberships(userId: string): Promise<MerchantMembershipRecord[]> {
    allowMemoryAdapter();
    return ephemeralStore.merchantMemberships.get(userId) || [];
  }

  public async getRiderProfile(userId: string): Promise<RiderProfileRecord | null> {
    allowMemoryAdapter();
    return ephemeralStore.riderProfiles.get(userId) || null;
  }

  // ==========================================
  // Session Management
  // ==========================================

  public async createSession(data: {
    id: string;
    user_id: string;
    refresh_token_hash: string;
    expires_at: Date;
    ip_address?: string | null;
    device_info?: string | null;
  }): Promise<SessionRecord> {
    const now = new Date().toISOString();
    const record: SessionRecord = {
      id: data.id,
      user_id: data.user_id,
      refresh_token_hash: data.refresh_token_hash,
      expires_at: data.expires_at.toISOString(),
      revoked_at: null,
      ip_address: data.ip_address || null,
      device_info: data.device_info || null,
      last_used_at: now,
      created_at: now,
    };

    const client = await this.getClient();
    if (client) {
      try {
        await client.query(
          `INSERT INTO sessions (id, user_id, refresh_token_hash, expires_at, created_at, ip_address, device_info, last_used_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            record.id,
            record.user_id,
            record.refresh_token_hash,
            record.expires_at,
            record.created_at,
            record.ip_address,
            record.device_info,
            record.last_used_at,
          ]
        );
      } catch (err: any) {
      allowMemoryAdapter();
        logger.warn('Database insert session failed', { metadata: { error: err.message } });
      } finally {
        client.release();
      }
    }

    ephemeralStore.sessions.set(record.id, record);
    return record;
  }

  public async findSessionById(id: string): Promise<SessionRecord | null> {
    const client = await this.getClient();
    if (client) {
      try {
        const res = await client.query('SELECT * FROM sessions WHERE id = $1', [id]);
        if (res.rows[0]) return res.rows[0];
      } catch (err: any) {
      allowMemoryAdapter();
        logger.warn('Database find session failed', { metadata: { error: err.message } });
      } finally {
        client.release();
      }
    }
    return ephemeralStore.sessions.get(id) || null;
  }

  public async findSessionByRefreshTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    const client = await this.getClient();
    if (client) {
      try {
        const res = await client.query('SELECT * FROM sessions WHERE refresh_token_hash = $1', [tokenHash]);
        if (res.rows[0]) return res.rows[0];
      } catch (err: any) {
      allowMemoryAdapter();
        logger.warn('Database find session by token failed', { metadata: { error: err.message } });
      } finally {
        client.release();
      }
    }
    for (const s of ephemeralStore.sessions.values()) {
      if (s.refresh_token_hash === tokenHash) {
        return s;
      }
    }
    return null;
  }

  public async updateSessionLastUsed(id: string, ipAddress?: string): Promise<void> {
    const now = new Date().toISOString();
    const client = await this.getClient();
    if (client) {
      try {
        await client.query(
          'UPDATE sessions SET last_used_at = $1, ip_address = COALESCE($2, ip_address) WHERE id = $3',
          [now, ipAddress || null, id]
        );
      } catch (err: any) {
      allowMemoryAdapter();
        logger.warn('Database update session failed', { metadata: { error: err.message } });
      } finally {
        client.release();
      }
    }
    const session = ephemeralStore.sessions.get(id);
    if (session) {
      session.last_used_at = now;
      if (ipAddress) session.ip_address = ipAddress;
    }
  }

  public async rotateSessionToken(
    sessionId: string,
    newRefreshTokenHash: string,
    newExpiresAt: Date
  ): Promise<void> {
    const now = new Date().toISOString();
    const expiresStr = newExpiresAt.toISOString();
    const client = await this.getClient();
    if (client) {
      try {
        await client.query(
          'UPDATE sessions SET refresh_token_hash = $1, expires_at = $2, last_used_at = $3 WHERE id = $4',
          [newRefreshTokenHash, expiresStr, now, sessionId]
        );
      } catch (err: any) {
      allowMemoryAdapter();
        logger.warn('Database rotate session token failed', { metadata: { error: err.message } });
      } finally {
        client.release();
      }
    }
    const session = ephemeralStore.sessions.get(sessionId);
    if (session) {
      session.refresh_token_hash = newRefreshTokenHash;
      session.expires_at = expiresStr;
      session.last_used_at = now;
    }
  }

  public async revokeSession(id: string): Promise<void> {
    const now = new Date().toISOString();
    const client = await this.getClient();
    if (client) {
      try {
        await client.query('UPDATE sessions SET revoked_at = $1 WHERE id = $2', [now, id]);
      } catch (err: any) {
      allowMemoryAdapter();
        logger.warn('Database revoke session failed', { metadata: { error: err.message } });
      } finally {
        client.release();
      }
    }
    const session = ephemeralStore.sessions.get(id);
    if (session) {
      session.revoked_at = now;
    }
  }

  public async revokeAllUserSessions(userId: string): Promise<void> {
    const now = new Date().toISOString();
    const client = await this.getClient();
    if (client) {
      try {
        await client.query('UPDATE sessions SET revoked_at = $1 WHERE user_id = $2', [now, userId]);
      } catch (err: any) {
      allowMemoryAdapter();
        logger.warn('Database revokeAllUserSessions failed', { metadata: { error: err.message } });
      } finally {
        client.release();
      }
    }
    for (const session of ephemeralStore.sessions.values()) {
      if (session.user_id === userId) {
        session.revoked_at = now;
      }
    }
  }

  public async listUserSessions(userId: string): Promise<SessionRecord[]> {
    allowMemoryAdapter();
    const results: SessionRecord[] = [];
    for (const session of ephemeralStore.sessions.values()) {
      if (session.user_id === userId) {
        results.push(session);
      }
    }
    return results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  // ==========================================
  // Password Reset Tokens
  // ==========================================

  public async createPasswordResetToken(data: {
    id: string;
    user_id: string;
    token_hash: string;
    expires_at: Date;
  }): Promise<PasswordResetRecord> {
    allowMemoryAdapter();
    const record: PasswordResetRecord = {
      id: data.id,
      user_id: data.user_id,
      token_hash: data.token_hash,
      expires_at: data.expires_at.toISOString(),
      used_at: null,
      created_at: new Date().toISOString(),
    };
    ephemeralStore.passwordResets.set(data.token_hash, record);
    return record;
  }

  public async findPasswordResetToken(tokenHash: string): Promise<PasswordResetRecord | null> {
    allowMemoryAdapter();
    return ephemeralStore.passwordResets.get(tokenHash) || null;
  }

  public async markPasswordResetTokenUsed(id: string): Promise<void> {
    allowMemoryAdapter();
    const now = new Date().toISOString();
    for (const rec of ephemeralStore.passwordResets.values()) {
      if (rec.id === id) {
        rec.used_at = now;
      }
    }
  }

  // ==========================================
  // Verification Tokens / OTPs
  // ==========================================

  public async createVerificationToken(data: {
    id: string;
    user_id: string;
    type: string;
    token_hash: string;
    expires_at: Date;
  }): Promise<VerificationTokenRecord> {
    allowMemoryAdapter();
    const record: VerificationTokenRecord = {
      id: data.id,
      user_id: data.user_id,
      type: data.type,
      token_hash: data.token_hash,
      expires_at: data.expires_at.toISOString(),
      attempts: 0,
      verified_at: null,
      created_at: new Date().toISOString(),
    };
    ephemeralStore.verificationTokens.set(`${data.user_id}:${data.type}`, record);
    return record;
  }

  public async getLatestVerificationToken(userId: string, type: string): Promise<VerificationTokenRecord | null> {
    allowMemoryAdapter();
    return ephemeralStore.verificationTokens.get(`${userId}:${type}`) || null;
  }

  public async incrementVerificationAttempt(id: string): Promise<void> {
    allowMemoryAdapter();
    for (const rec of ephemeralStore.verificationTokens.values()) {
      if (rec.id === id) {
        rec.attempts += 1;
      }
    }
  }

  public async markVerificationTokenVerified(id: string): Promise<void> {
    allowMemoryAdapter();
    const now = new Date().toISOString();
    for (const rec of ephemeralStore.verificationTokens.values()) {
      if (rec.id === id) {
        rec.verified_at = now;
      }
    }
  }

  // ==========================================
  // Audit Logs (Section 35, 36 & 37)
  // ==========================================

  public async createAuditLog(entry: {
    actor_user_id?: string | null;
    actor_role?: string | null;
    action: string;
    resource_type: string;
    resource_id?: string | null;
    request_id?: string;
    reason?: string;
    metadata?: Record<string, unknown>;
  }): Promise<AuditLogEntry> {
    const record: AuditLogEntry = {
      id: ephemeralStore.auditLogs.length + 1,
      actor_user_id: entry.actor_user_id || null,
      actor_role: entry.actor_role || null,
      action: entry.action,
      resource_type: entry.resource_type,
      resource_id: entry.resource_id || null,
      request_id: entry.request_id,
      reason: entry.reason,
      metadata: entry.metadata,
      created_at: new Date().toISOString(),
    };

    const client = await this.getClient();
    if (client) {
      try {
        await client.query(
          `INSERT INTO audit_logs (actor_user_id, actor_role, action, resource_type, resource_id, metadata, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            record.actor_user_id,
            record.actor_role,
            record.action,
            record.resource_type,
            record.resource_id,
            record.metadata ? JSON.stringify(record.metadata) : null,
            record.created_at,
          ]
        );
      } catch (err: any) {
      allowMemoryAdapter();
        logger.warn('Database insert audit log failed', { metadata: { error: err.message } });
      } finally {
        client.release();
      }
    }

    ephemeralStore.auditLogs.unshift(record);
    // Keep bounded in memory
    if (ephemeralStore.auditLogs.length > 500) {
      ephemeralStore.auditLogs.pop();
    }
    return record;
  }

  public async listAuditLogs(options?: {
    limit?: number;
    offset?: number;
    action?: string;
    actorUserId?: string;
  }): Promise<{ logs: AuditLogEntry[]; total: number }> {
    allowMemoryAdapter();
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;

    let logs = [...ephemeralStore.auditLogs];
    if (options?.action) {
      logs = logs.filter((l) => l.action === options.action);
    }
    if (options?.actorUserId) {
      logs = logs.filter((l) => l.actor_user_id === options.actorUserId);
    }

    const total = logs.length;
    const paginated = logs.slice(offset, offset + limit);
    return { logs: paginated, total };
  }
}

export const authRepository = storageAdapter(new AuthRepository(), postgresAuth);
