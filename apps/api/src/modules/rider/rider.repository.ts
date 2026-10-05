import { randomUUID as durableEntityId } from 'node:crypto';
import { storageAdapter } from '../../db/adapter';
import { postgresRider } from './rider.postgres';
import { allowMemoryAdapter } from '../../db/storage-policy';
import { config } from '@deetoo/config';
/**
 * DEETOO - Authoritative Rider Repository
 * Implements persistence for Rider profiles, vehicles, zones, availability sessions,
 * and ephemeral memory fallback store (Sprint 8)
 */

import {
  RiderProfile,
  RiderVehicle,
  RiderAvailabilitySession,
  RiderOnboardingStatus,
  RiderOperationalStatus,
  RiderWorkStatus,
  VehicleType,
  VehicleStatus,
  RiderAdminMetrics,
} from '@deetoo/types';
import { getDbPool } from '../../db/client';
import { logger } from '@deetoo/utils';

export class EphemeralRiderStore {
  public profiles = new Map<string, RiderProfile>(); // id -> RiderProfile
  public profilesByUserId = new Map<string, string>(); // userId -> profileId
  public vehicles = new Map<string, RiderVehicle>(); // riderId -> RiderVehicle
  public riderZones = new Map<string, Set<string>>(); // riderId -> Set<zoneId>
  public sessions = new Map<string, RiderAvailabilitySession[]>(); // riderId -> sessions

  constructor() {
    this.seedBaseline();
  }

  private seedBaseline() {
    if (!config.storage.fixtures) return;
    const now = new Date().toISOString();
    const approvedAt = new Date(Date.now() - 86400000 * 7).toISOString();

    // 1. Approved Active Rider (John / Juma Mwangi)
    const rider1: RiderProfile = {
      id: 'rider_john_01',
      userId: '10000000-0000-0000-0000-000000000003',
      firstName: 'Juma',
      lastName: 'Mwangi',
      phone: '+254733000001',
      onboardingStatus: RiderOnboardingStatus.APPROVED,
      operationalStatus: RiderOperationalStatus.ACTIVE,
      workStatus: RiderWorkStatus.OFFLINE,
      vehicleType: VehicleType.MOTORBIKE,
      vehicleRegistration: 'KMD 123X',
      approvedAt,
      approvedBy: '10000000-0000-0000-0000-000000000001',
      lastKnownLatitude: -1.2683,
      lastKnownLongitude: 36.8111,
      lastLocationAt: now,
      serviceZoneIds: ['33333333-3333-3333-3333-333333333301'],
      createdAt: approvedAt,
      updatedAt: now,
    };
    this.profiles.set(rider1.id, rider1);
    this.profilesByUserId.set(rider1.userId, rider1.id);
    this.vehicles.set(rider1.id, {
      id: 'veh_01',
      riderId: rider1.id,
      type: VehicleType.MOTORBIKE,
      registrationNumber: 'KMD 123X',
      status: VehicleStatus.ACTIVE,
      createdAt: approvedAt,
      updatedAt: now,
    });
    this.riderZones.set(rider1.id, new Set(['33333333-3333-3333-3333-333333333301']));

    // 2. Pending Review Rider (Brian Otieno)
    const rider2: RiderProfile = {
      id: 'rider_pending_02',
      userId: '10000000-0000-0000-0000-000000000007',
      firstName: 'Brian',
      lastName: 'Otieno',
      phone: '+254711223344',
      onboardingStatus: RiderOnboardingStatus.PENDING_REVIEW,
      operationalStatus: RiderOperationalStatus.ACTIVE,
      workStatus: RiderWorkStatus.OFFLINE,
      vehicleType: VehicleType.BICYCLE,
      serviceZoneIds: ['33333333-3333-3333-3333-333333333301'],
      createdAt: now,
      updatedAt: now,
    };
    this.profiles.set(rider2.id, rider2);
    this.profilesByUserId.set(rider2.userId, rider2.id);
    this.vehicles.set(rider2.id, {
      id: 'veh_02',
      riderId: rider2.id,
      type: VehicleType.BICYCLE,
      registrationNumber: 'BIKE-002',
      status: VehicleStatus.ACTIVE,
      createdAt: now,
      updatedAt: now,
    });
    this.riderZones.set(rider2.id, new Set(['33333333-3333-3333-3333-333333333301']));

    // 3. Suspended Rider (Kelvin Kipchoge)
    const rider3: RiderProfile = {
      id: 'rider_suspended_03',
      userId: '10000000-0000-0000-0000-000000000008',
      firstName: 'Kelvin',
      lastName: 'Kipchoge',
      phone: '+254722334455',
      onboardingStatus: RiderOnboardingStatus.APPROVED,
      operationalStatus: RiderOperationalStatus.SUSPENDED,
      workStatus: RiderWorkStatus.OFFLINE,
      vehicleType: VehicleType.MOTORBIKE,
      vehicleRegistration: 'KMC 456Y',
      suspendedAt: now,
      suspensionReason: 'Under review for delayed orders',
      serviceZoneIds: ['33333333-3333-3333-3333-333333333302'],
      createdAt: approvedAt,
      updatedAt: now,
    };
    this.profiles.set(rider3.id, rider3);
    this.profilesByUserId.set(rider3.userId, rider3.id);
    this.vehicles.set(rider3.id, {
      id: 'veh_03',
      riderId: rider3.id,
      type: VehicleType.MOTORBIKE,
      registrationNumber: 'KMC 456Y',
      status: VehicleStatus.ACTIVE,
      createdAt: approvedAt,
      updatedAt: now,
    });
    this.riderZones.set(rider3.id, new Set(['33333333-3333-3333-3333-333333333302']));
  }
}

export const ephemeralRiderStore = new EphemeralRiderStore();

export class RiderRepository {
  private async getClient() {
    try {
      const pool = getDbPool();
      return await pool.connect();
    } catch {
      allowMemoryAdapter();
      return null;
    }
  }

  public async findProfileById(id: string): Promise<RiderProfile | null> {
    const client = await this.getClient();
    if (client) {
      try {
        const res = await client.query(`SELECT * FROM rider_profiles WHERE id = $1`, [id]);
        if (res.rows.length > 0) {
          const profile = this.mapProfileRow(res.rows[0]);
          profile.serviceZoneIds = await this.getAssignedZoneIds(profile.id);
          return profile;
        }
      } catch (err) {
      allowMemoryAdapter();
        logger.warn('Failed to query rider profile from Postgres, using fallback', {
          service: 'rider',
          metadata: { error: String(err), id },
        });
      } finally {
        client.release();
      }
    }

    const p = ephemeralRiderStore.profiles.get(id);
    if (!p) return null;
    const zones = ephemeralRiderStore.riderZones.get(id);
    return {
      ...p,
      serviceZoneIds: zones ? Array.from(zones) : [],
    };
  }

  public async findProfileByUserId(userId: string): Promise<RiderProfile | null> {
    const client = await this.getClient();
    if (client) {
      try {
        const res = await client.query(`SELECT * FROM rider_profiles WHERE user_id = $1`, [userId]);
        if (res.rows.length > 0) {
          const profile = this.mapProfileRow(res.rows[0]);
          profile.serviceZoneIds = await this.getAssignedZoneIds(profile.id);
          return profile;
        }
      } catch (err) {
      allowMemoryAdapter();
        logger.warn('Failed to query rider profile by user ID from Postgres, using fallback', {
          service: 'rider',
          metadata: { error: String(err), userId },
        });
      } finally {
        client.release();
      }
    }

    const profileId = ephemeralRiderStore.profilesByUserId.get(userId);
    if (!profileId) return null;
    return this.findProfileById(profileId);
  }

  public async createProfile(data: {
    id?: string;
    userId: string;
    firstName: string;
    lastName: string;
    phone: string;
    vehicleType?: VehicleType;
    vehicleRegistration?: string;
    onboardingStatus?: RiderOnboardingStatus;
    operationalStatus?: RiderOperationalStatus;
    workStatus?: RiderWorkStatus;
    serviceZoneIds?: string[];
  }): Promise<RiderProfile> {
    const now = new Date().toISOString();
    const id = data.id || durableEntityId();
    const onboardingStatus = data.onboardingStatus || RiderOnboardingStatus.DRAFT;
    const operationalStatus = data.operationalStatus || RiderOperationalStatus.ACTIVE;
    const workStatus = data.workStatus || RiderWorkStatus.OFFLINE;
    const serviceZoneIds = data.serviceZoneIds || ['33333333-3333-3333-3333-333333333301'];

    const client = await this.getClient();
    if (client) {
      try {
        const res = await client.query(
          `INSERT INTO rider_profiles (
            id, user_id, first_name, last_name, phone, vehicle_type, vehicle_registration,
            onboarding_status, operational_status, work_status, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          RETURNING *`,
          [
            id,
            data.userId,
            data.firstName,
            data.lastName,
            data.phone,
            data.vehicleType || VehicleType.MOTORBIKE,
            data.vehicleRegistration || null,
            onboardingStatus,
            operationalStatus,
            workStatus,
            now,
            now,
          ]
        );
        // serviceZoneIds was computed above (including the default zone assignment) but never
        // actually persisted here -- the INSERT above has no zone columns at all, so every
        // rider created through this Postgres path got zero rows in rider_service_zones
        // regardless of the default. This is the exact reported bug: "Rider has not been
        // assigned to any operational service zones" for a rider whose default assignment
        // logic ran and computed a zone, but that zone was silently never written down.
        for (const zoneId of serviceZoneIds) {
          await client.query(
            `INSERT INTO rider_service_zones (id, rider_id, zone_id, created_at)
             VALUES (gen_random_uuid(), $1, $2, $3)
             ON CONFLICT DO NOTHING`,
            [id, zoneId, now]
          );
        }
        const profileRow = this.mapProfileRow(res.rows[0]);
        profileRow.serviceZoneIds = serviceZoneIds;
        return profileRow;
      } catch (err) {
      allowMemoryAdapter();
        logger.warn('Failed to insert rider profile in Postgres, using fallback', {
          service: 'rider',
          metadata: { error: String(err) },
        });
      } finally {
        client.release();
      }
    }

    const profile: RiderProfile = {
      id,
      userId: data.userId,
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
      vehicleType: data.vehicleType || VehicleType.MOTORBIKE,
      vehicleRegistration: data.vehicleRegistration,
      onboardingStatus,
      operationalStatus,
      workStatus,
      serviceZoneIds,
      createdAt: now,
      updatedAt: now,
    };
    ephemeralRiderStore.profiles.set(id, profile);
    ephemeralRiderStore.profilesByUserId.set(data.userId, id);
    ephemeralRiderStore.riderZones.set(id, new Set(serviceZoneIds));
    if (data.vehicleType) {
      ephemeralRiderStore.vehicles.set(id, {
        id: `veh_${id}`,
        riderId: id,
        type: data.vehicleType,
        registrationNumber: data.vehicleRegistration || null,
        status: VehicleStatus.ACTIVE,
        createdAt: now,
        updatedAt: now,
      });
    }
    return profile;
  }

  public async updateProfile(id: string, updates: Partial<RiderProfile>): Promise<RiderProfile> {
    const now = new Date().toISOString();
    const existing = await this.findProfileById(id);
    if (!existing) {
      throw new Error(`Rider profile ${id} not found`);
    }

    const updated: RiderProfile = {
      ...existing,
      ...updates,
      updatedAt: now,
    };

    const client = await this.getClient();
    if (client) {
      try {
        await client.query(
          `UPDATE rider_profiles SET
            first_name = $1,
            last_name = $2,
            phone = $3,
            onboarding_status = $4,
            operational_status = $5,
            work_status = $6,
            vehicle_type = $7,
            vehicle_registration = $8,
            approved_at = $9,
            approved_by = $10,
            rejected_at = $11,
            rejection_reason = $12,
            suspended_at = $13,
            suspension_reason = $14,
            last_known_latitude = $15,
            last_known_longitude = $16,
            last_location_at = $17,
            updated_at = $18
          WHERE id = $19`,
          [
            updated.firstName,
            updated.lastName,
            updated.phone,
            updated.onboardingStatus,
            updated.operationalStatus,
            updated.workStatus,
            updated.vehicleType,
            updated.vehicleRegistration,
            updated.approvedAt || null,
            updated.approvedBy || null,
            updated.rejectedAt || null,
            updated.rejectionReason || null,
            updated.suspendedAt || null,
            updated.suspensionReason || null,
            updated.lastKnownLatitude ?? null,
            updated.lastKnownLongitude ?? null,
            updated.lastLocationAt || null,
            now,
            id,
          ]
        );
      } catch (err) {
      allowMemoryAdapter();
        logger.warn('Failed to update rider profile in Postgres, using fallback', {
          service: 'rider',
          metadata: { error: String(err), id },
        });
      } finally {
        client.release();
      }
    }

    ephemeralRiderStore.profiles.set(id, updated);
    return updated;
  }

  public async updateWorkStatus(id: string, workStatus: RiderWorkStatus): Promise<RiderProfile> {
    return await this.updateProfile(id, { workStatus });
  }

  public async findVehicleByRiderId(riderId: string): Promise<RiderVehicle | null> {
    const client = await this.getClient();
    if (client) {
      try {
        const res = await client.query(
          `SELECT * FROM rider_vehicles WHERE rider_id = $1 ORDER BY created_at DESC LIMIT 1`,
          [riderId]
        );
        if (res.rows.length > 0) {
          const r = res.rows[0];
          return {
            id: r.id,
            riderId: r.rider_id,
            type: r.type as VehicleType,
            registrationNumber: r.registration_number,
            status: r.status as VehicleStatus,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
          };
        }
      } catch (err) {
      allowMemoryAdapter();
        logger.warn('Failed to find vehicle in Postgres, using fallback', {
          service: 'rider',
          metadata: { error: String(err), riderId },
        });
      } finally {
        client.release();
      }
    }

    return ephemeralRiderStore.vehicles.get(riderId) || null;
  }

  public async upsertVehicle(
    riderId: string,
    data: { type: VehicleType; registrationNumber?: string; status?: VehicleStatus }
  ): Promise<RiderVehicle> {
    const now = new Date().toISOString();
    const id = durableEntityId();
    const status = data.status || VehicleStatus.ACTIVE;

    const client = await this.getClient();
    if (client) {
      try {
        const res = await client.query(
          `INSERT INTO rider_vehicles (id, rider_id, type, registration_number, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [id, riderId, data.type, data.registrationNumber || null, status, now, now]
        );
        const r = res.rows[0];
        return {
          id: r.id,
          riderId: r.rider_id,
          type: r.type as VehicleType,
          registrationNumber: r.registration_number,
          status: r.status as VehicleStatus,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        };
      } catch (err) {
      allowMemoryAdapter();
        logger.warn('Failed to upsert vehicle in Postgres, using fallback', {
          service: 'rider',
          metadata: { error: String(err), riderId },
        });
      } finally {
        client.release();
      }
    }

    const vehicle: RiderVehicle = {
      id,
      riderId,
      type: data.type,
      registrationNumber: data.registrationNumber || null,
      status,
      createdAt: now,
      updatedAt: now,
    };
    ephemeralRiderStore.vehicles.set(riderId, vehicle);
    return vehicle;
  }

  public async getAssignedZoneIds(riderId: string): Promise<string[]> {
    const client = await this.getClient();
    if (client) {
      try {
        const res = await client.query(
          `SELECT zone_id FROM rider_service_zones WHERE rider_id = $1`,
          [riderId]
        );
        return res.rows.map((r) => r.zone_id);
      } catch (err) {
      allowMemoryAdapter();
        logger.warn('Failed to query rider service zones from Postgres, using fallback', {
          service: 'rider',
          metadata: { error: String(err), riderId },
        });
      } finally {
        client.release();
      }
    }

    const zones = ephemeralRiderStore.riderZones.get(riderId);
    return zones ? Array.from(zones) : [];
  }

  public async assignZones(riderId: string, zoneIds: string[]): Promise<string[]> {
    const now = new Date().toISOString();

    const client = await this.getClient();
    if (client) {
      try {
        await client.query('BEGIN');
        await client.query(`DELETE FROM rider_service_zones WHERE rider_id = $1`, [riderId]);
        for (const zoneId of zoneIds) {
          await client.query(
            `INSERT INTO rider_service_zones (id, rider_id, zone_id, created_at) VALUES (gen_random_uuid(), $1, $2, $3)`,
            [riderId, zoneId, now]
          );
        }
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        logger.warn('Failed to assign rider zones in Postgres, using fallback', {
          service: 'rider',
          metadata: { error: String(e), riderId },
        });
      } finally {
        client.release();
      }
    }

    ephemeralRiderStore.riderZones.set(riderId, new Set(zoneIds));
    const profile = ephemeralRiderStore.profiles.get(riderId);
    if (profile) {
      profile.serviceZoneIds = zoneIds;
    }
    return zoneIds;
  }

  public async getActiveSession(riderId: string): Promise<RiderAvailabilitySession | null> {
    const client = await this.getClient();
    if (client) {
      try {
        const res = await client.query(
          `SELECT * FROM rider_availability_sessions
           WHERE rider_id = $1 AND ended_at IS NULL
           ORDER BY started_at DESC LIMIT 1`,
          [riderId]
        );
        if (res.rows.length > 0) {
          const r = res.rows[0];
          return {
            id: r.id,
            riderId: r.rider_id,
            startedAt: r.started_at,
            endedAt: r.ended_at,
            startZoneId: r.start_zone_id,
            endReason: r.end_reason,
          };
        }
      } catch (err) {
      allowMemoryAdapter();
        logger.warn('Failed to query active session from Postgres, using fallback', {
          service: 'rider',
          metadata: { error: String(err), riderId },
        });
      } finally {
        client.release();
      }
    }

    const sessions = ephemeralRiderStore.sessions.get(riderId) || [];
    return sessions.find((s) => !s.endedAt) || null;
  }

  public async startSession(riderId: string, startZoneId?: string): Promise<RiderAvailabilitySession> {
    const now = new Date().toISOString();
    const id = `sess_${Date.now()}`;

    const client = await this.getClient();
    if (client) {
      try {
        const res = await client.query(
          `INSERT INTO rider_availability_sessions (id, rider_id, started_at, start_zone_id)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [id, riderId, now, startZoneId || null]
        );
        const r = res.rows[0];
        return {
          id: r.id,
          riderId: r.rider_id,
          startedAt: r.started_at,
          endedAt: r.ended_at,
          startZoneId: r.start_zone_id,
          endReason: r.end_reason,
        };
      } catch (err) {
      allowMemoryAdapter();
        logger.warn('Failed to start session in Postgres, using fallback', {
          service: 'rider',
          metadata: { error: String(err), riderId },
        });
      } finally {
        client.release();
      }
    }

    const session: RiderAvailabilitySession = {
      id,
      riderId,
      startedAt: now,
      startZoneId: startZoneId || null,
      endedAt: null,
      endReason: null,
    };
    const list = ephemeralRiderStore.sessions.get(riderId) || [];
    list.push(session);
    ephemeralRiderStore.sessions.set(riderId, list);
    return session;
  }

  public async endActiveSession(
    riderId: string,
    reason: 'OFFLINE' | 'SUSPENDED' | 'STALE' | 'ADMIN' = 'OFFLINE'
  ): Promise<RiderAvailabilitySession | null> {
    const now = new Date().toISOString();

    const client = await this.getClient();
    if (client) {
      try {
        const res = await client.query(
          `UPDATE rider_availability_sessions
           SET ended_at = $1, end_reason = $2
           WHERE rider_id = $3 AND ended_at IS NULL
           RETURNING *`,
          [now, reason, riderId]
        );
        if (res.rows.length > 0) {
          const r = res.rows[0];
          return {
            id: r.id,
            riderId: r.rider_id,
            startedAt: r.started_at,
            endedAt: r.ended_at,
            startZoneId: r.start_zone_id,
            endReason: r.end_reason,
          };
        }
      } catch (err) {
      allowMemoryAdapter();
        logger.warn('Failed to end session in Postgres, using fallback', {
          service: 'rider',
          metadata: { error: String(err), riderId },
        });
      } finally {
        client.release();
      }
    }

    const list = ephemeralRiderStore.sessions.get(riderId) || [];
    const active = list.find((s) => !s.endedAt);
    if (active) {
      active.endedAt = now;
      active.endReason = reason;
      return active;
    }
    return null;
  }

  public async listSessions(riderId: string, limit = 20): Promise<RiderAvailabilitySession[]> {
    const client = await this.getClient();
    if (client) {
      try {
        const res = await client.query(
          `SELECT * FROM rider_availability_sessions
           WHERE rider_id = $1
           ORDER BY started_at DESC LIMIT $2`,
          [riderId, limit]
        );
        return res.rows.map((r) => ({
          id: r.id,
          riderId: r.rider_id,
          startedAt: r.started_at,
          endedAt: r.ended_at,
          startZoneId: r.start_zone_id,
          endReason: r.end_reason,
        }));
      } catch (err) {
      allowMemoryAdapter();
        logger.warn('Failed to list sessions from Postgres, using fallback', {
          service: 'rider',
          metadata: { error: String(err), riderId },
        });
      } finally {
        client.release();
      }
    }

    const list = ephemeralRiderStore.sessions.get(riderId) || [];
    return list.slice(-limit).reverse();
  }

  public async updateLastLocation(riderId: string, lat: number, lng: number): Promise<void> {
    const now = new Date().toISOString();

    const client = await this.getClient();
    if (client) {
      try {
        await client.query(
          `UPDATE rider_profiles
           SET last_known_latitude = $1, last_known_longitude = $2, last_location_at = $3, updated_at = $3
           WHERE id = $4`,
          [lat, lng, now, riderId]
        );
      } catch (err) {
      allowMemoryAdapter();
        logger.warn('Failed to update last location in Postgres, using fallback', {
          service: 'rider',
          metadata: { error: String(err), riderId },
        });
      } finally {
        client.release();
      }
    }

    const profile = ephemeralRiderStore.profiles.get(riderId);
    if (profile) {
      profile.lastKnownLatitude = lat;
      profile.lastKnownLongitude = lng;
      profile.lastLocationAt = now;
      profile.updatedAt = now;
    }
  }

  public async listRiders(filters: {
    onboardingStatus?: RiderOnboardingStatus;
    operationalStatus?: RiderOperationalStatus;
    workStatus?: RiderWorkStatus;
    vehicleType?: VehicleType;
    zoneId?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ riders: RiderProfile[]; total: number }> {
    allowMemoryAdapter();
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    let items = Array.from(ephemeralRiderStore.profiles.values());

    if (filters.onboardingStatus) {
      items = items.filter((r) => r.onboardingStatus === filters.onboardingStatus);
    }
    if (filters.operationalStatus) {
      items = items.filter((r) => r.operationalStatus === filters.operationalStatus);
    }
    if (filters.workStatus) {
      items = items.filter((r) => r.workStatus === filters.workStatus);
    }
    if (filters.vehicleType) {
      items = items.filter((r) => r.vehicleType === filters.vehicleType);
    }
    if (filters.zoneId) {
      items = items.filter((r) => {
        const zones = ephemeralRiderStore.riderZones.get(r.id);
        return zones && zones.has(filters.zoneId!);
      });
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      items = items.filter(
        (r) =>
          r.firstName.toLowerCase().includes(q) ||
          r.lastName.toLowerCase().includes(q) ||
          r.phone.includes(q) ||
          (r.vehicleRegistration && r.vehicleRegistration.toLowerCase().includes(q))
      );
    }

    const total = items.length;
    const paginated = items.slice(offset, offset + limit).map((r) => {
      const zones = ephemeralRiderStore.riderZones.get(r.id);
      return {
        ...r,
        serviceZoneIds: zones ? Array.from(zones) : [],
      };
    });

    return { riders: paginated, total };
  }

  public async getMetrics(): Promise<RiderAdminMetrics> {
    allowMemoryAdapter();
    const all = Array.from(ephemeralRiderStore.profiles.values());
    const totalRiders = all.length;
    const pendingApproval = all.filter((r) => r.onboardingStatus === RiderOnboardingStatus.PENDING_REVIEW).length;
    const approved = all.filter((r) => r.onboardingStatus === RiderOnboardingStatus.APPROVED).length;
    const active = all.filter((r) => r.operationalStatus === RiderOperationalStatus.ACTIVE).length;
    const online = all.filter(
      (r) => r.workStatus === RiderWorkStatus.ONLINE_AVAILABLE || r.workStatus === RiderWorkStatus.ONLINE_UNAVAILABLE
    ).length;
    const available = all.filter((r) => r.workStatus === RiderWorkStatus.ONLINE_AVAILABLE).length;
    const suspended = all.filter((r) => r.operationalStatus === RiderOperationalStatus.SUSPENDED).length;
    const staleLocation = all.filter((r) => r.workStatus === RiderWorkStatus.ONLINE_UNAVAILABLE).length;

    return {
      totalRiders,
      pendingApproval,
      approved,
      active,
      online,
      available,
      suspended,
      staleLocation,
    };
  }

  private mapProfileRow(r: any): RiderProfile {
    return {
      id: r.id,
      userId: r.user_id,
      firstName: r.first_name,
      lastName: r.last_name,
      phone: r.phone,
      onboardingStatus: r.onboarding_status as RiderOnboardingStatus,
      operationalStatus: r.operational_status as RiderOperationalStatus,
      workStatus: r.work_status as RiderWorkStatus,
      vehicleType: r.vehicle_type as VehicleType,
      vehicleRegistration: r.vehicle_registration,
      approvedAt: r.approved_at,
      approvedBy: r.approved_by,
      rejectedAt: r.rejected_at,
      rejectionReason: r.rejection_reason,
      suspendedAt: r.suspended_at,
      suspensionReason: r.suspension_reason,
      lastKnownLatitude: r.last_known_latitude ? parseFloat(r.last_known_latitude) : null,
      lastKnownLongitude: r.last_known_longitude ? parseFloat(r.last_known_longitude) : null,
      lastLocationAt: r.last_location_at,
      serviceZoneIds: [],
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }
}

export const riderRepository = storageAdapter(new RiderRepository(), postgresRider);
