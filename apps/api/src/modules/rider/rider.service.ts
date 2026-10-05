import { allowMemoryAdapter } from '../../db/storage-policy';
import { transactionalService } from '../../db/transaction';
/**
 * DEETOO - Authoritative Rider Domain Service
 * Handles rider profile, onboarding approval, operational suspension,
 * work state machine, GPS ingestion, and fleet management (Sprint 8)
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
  AuditAction,
  RiderAdminMetrics,
} from '@deetoo/types';
import { config } from '@deetoo/config';
import { AppError } from '../../middleware/error-handler';
import { riderRepository } from './rider.repository';
import { riderLocationStore } from '../../db/redis';
import { RiderStateMachine } from './rider-state-machine';
import { riderEligibilityService } from './rider-eligibility.service';
import { authRepository } from '../auth/auth.repository';
import { merchantRepository } from '../merchant/merchant.repository';
import { orderEventBroker } from '../realtime/event-broker';
import { logger } from '@deetoo/utils';

async function publishRiderEvent(channel: string, type: string, data: any) {
  try {
    await orderEventBroker.publish(channel, {
      type: type as any,
      channel,
      order_id: '',
      order_number: '',
      status: 'PLACED' as any,
      timestamp: new Date().toISOString(),
      data,
    });
  } catch {
    allowMemoryAdapter();
    // Non-blocking
  }
}

function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export class RiderService {
  /**
   * Retrieves or initializes a rider's profile and comprehensive status.
   */
  public async getRiderStatus(userId: string): Promise<{
    profile: RiderProfile;
    vehicle: RiderVehicle | null;
    activeSession: RiderAvailabilitySession | null;
    eligibility: { eligible: boolean; reasons: string[] };
    assignedZones: any[];
    locationFreshness: {
      hasLiveLocation: boolean;
      lastLocationAgeSeconds?: number;
      isStale: boolean;
    };
  }> {
    let profile = await riderRepository.findProfileByUserId(userId);
    if (!profile) {
      // Auto-provision initial DRAFT profile for authenticated user with RIDER role
      const user = await authRepository.findUserById(userId);
      profile = await riderRepository.createProfile({
        userId,
        firstName: user?.email?.split('@')[0] || 'New',
        lastName: 'Rider',
        phone: user?.phone_e164 || '',
        vehicleType: VehicleType.MOTORBIKE,
      });

      // Default vehicle record
      await riderRepository.upsertVehicle(profile.id, {
        type: VehicleType.MOTORBIKE,
        status: VehicleStatus.ACTIVE,
      });

      // Record audit event
      await authRepository.createAuditLog({
        action: AuditAction.RIDER_PROFILE_CREATED,
        resource_type: 'RIDER',
        resource_id: profile.id,
        actor_user_id: userId,
        actor_role: 'RIDER',
      });
    }

    const vehicle = await riderRepository.findVehicleByRiderId(profile.id);
    const activeSession = await riderRepository.getActiveSession(profile.id);
    const eligibility = await riderEligibilityService.isRiderEligibleForDispatch(profile.id);

    // Fetch assigned service zone models
    const zoneIds = profile.serviceZoneIds || [];
    const assignedZones = [];
    for (const zid of zoneIds) {
      const z = await merchantRepository.findServiceZoneById(zid);
      if (z) assignedZones.push(z);
    }

    // Location freshness inspection
    const liveLoc = await riderLocationStore.getLiveLocation(profile.id);
    const now = Date.now();
    let lastLocationAgeSeconds: number | undefined;
    let isStale = true;

    if (liveLoc) {
      const recordedMs = new Date(liveLoc.receivedAt || liveLoc.recordedAt).getTime();
      lastLocationAgeSeconds = Math.max(0, Math.floor((now - recordedMs) / 1000));
      isStale = lastLocationAgeSeconds > config.rider.locationStaleSeconds;
    } else if (profile.lastLocationAt) {
      const recordedMs = new Date(profile.lastLocationAt).getTime();
      lastLocationAgeSeconds = Math.max(0, Math.floor((now - recordedMs) / 1000));
      isStale = lastLocationAgeSeconds > config.rider.locationStaleSeconds;
    }

    return {
      profile,
      vehicle,
      activeSession,
      eligibility: {
        eligible: eligibility.eligible,
        reasons: eligibility.reasons,
      },
      assignedZones,
      locationFreshness: {
        hasLiveLocation: !!liveLoc,
        lastLocationAgeSeconds,
        isStale,
      },
    };
  }

  /**
   * Rider updates their own profile details with strict mass-assignment protection.
   */
  public async updateProfile(
    userId: string,
    updates: {
      first_name?: string;
      last_name?: string;
      phone?: string;
      vehicle_type?: VehicleType;
      vehicle_registration?: string;
    }
  ): Promise<RiderProfile> {
    const profile = await riderRepository.findProfileByUserId(userId);
    if (!profile) {
      throw new AppError(404, 'RIDER_PROFILE_NOT_FOUND', 'Rider profile not found');
    }

    // Mass-assignment defense: map only explicitly permitted fields
    const safeUpdates: Partial<RiderProfile> = {};
    if (updates.first_name !== undefined) safeUpdates.firstName = updates.first_name.trim();
    if (updates.last_name !== undefined) safeUpdates.lastName = updates.last_name.trim();
    if (updates.phone !== undefined) safeUpdates.phone = updates.phone.trim();
    if (updates.vehicle_type !== undefined) safeUpdates.vehicleType = updates.vehicle_type;
    if (updates.vehicle_registration !== undefined) {
      safeUpdates.vehicleRegistration = updates.vehicle_registration.trim();
    }

    const updated = await riderRepository.updateProfile(profile.id, safeUpdates);

    // If vehicle type or registration changed, update vehicle entity too
    if (updates.vehicle_type || updates.vehicle_registration) {
      await riderRepository.upsertVehicle(profile.id, {
        type: updates.vehicle_type || profile.vehicleType || VehicleType.MOTORBIKE,
        registrationNumber: updates.vehicle_registration || profile.vehicleRegistration,
      });
    }

    await authRepository.createAuditLog({
      action: AuditAction.RIDER_PROFILE_UPDATED,
      resource_type: 'RIDER',
      resource_id: profile.id,
      actor_user_id: userId,
      actor_role: 'RIDER',
      metadata: { fields: Object.keys(safeUpdates) },
    });

    return updated;
  }

  /**
   * Rider submits their profile for operational review & approval.
   */
  public async submitOnboarding(userId: string): Promise<RiderProfile> {
    const profile = await riderRepository.findProfileByUserId(userId);
    if (!profile) {
      throw new AppError(404, 'RIDER_PROFILE_NOT_FOUND', 'Rider profile not found');
    }

    if (profile.onboardingStatus === RiderOnboardingStatus.APPROVED) {
      throw new AppError(409, 'RIDER_ALREADY_APPROVED', 'Rider account is already approved');
    }

    // Validation requirements for onboarding submission
    if (!profile.firstName || !profile.lastName || !profile.phone) {
      throw new AppError(
        400,
        'RIDER_INCOMPLETE_PROFILE',
        'First name, last name, and phone number are required before submitting onboarding'
      );
    }

    const vehicle = await riderRepository.findVehicleByRiderId(profile.id);
    if (!vehicle) {
      throw new AppError(
        400,
        'RIDER_VEHICLE_REQUIRED',
        'A vehicle configuration is required before submitting onboarding'
      );
    }

    const updated = await riderRepository.updateProfile(profile.id, {
      onboardingStatus: RiderOnboardingStatus.PENDING_REVIEW,
    });

    await authRepository.createAuditLog({
      action: AuditAction.RIDER_ONBOARDING_SUBMITTED,
      resource_type: 'RIDER',
      resource_id: profile.id,
      actor_user_id: userId,
      actor_role: 'RIDER',
    });

    return updated;
  }

  /**
   * Rider updates vehicle entity.
   */
  public async updateVehicle(
    userId: string,
    data: { type: VehicleType; registration_number?: string; status?: VehicleStatus }
  ): Promise<RiderVehicle> {
    const profile = await riderRepository.findProfileByUserId(userId);
    if (!profile) {
      throw new AppError(404, 'RIDER_PROFILE_NOT_FOUND', 'Rider profile not found');
    }

    const vehicle = await riderRepository.upsertVehicle(profile.id, {
      type: data.type,
      registrationNumber: data.registration_number,
      status: data.status,
    });

    await riderRepository.updateProfile(profile.id, {
      vehicleType: data.type,
      vehicleRegistration: data.registration_number,
    });

    await authRepository.createAuditLog({
      action: AuditAction.RIDER_VEHICLE_UPDATED,
      resource_type: 'RIDER_VEHICLE',
      resource_id: vehicle.id,
      actor_user_id: userId,
      actor_role: 'RIDER',
      metadata: { vehicleType: data.type },
    });

    return vehicle;
  }

  /**
   * Rider attempts to Go Online (Section 23, 26, 77-80)
   * Enforces all operational, vehicle, zone, and location guards.
   */
  public async goOnline(
    userId: string,
    locationPayload?: {
      latitude?: number;
      longitude?: number;
      accuracy_meters?: number;
    }
  ): Promise<{
    workStatus: RiderWorkStatus;
    session: RiderAvailabilitySession;
    profile: RiderProfile;
  }> {
    const profile = await riderRepository.findProfileByUserId(userId);
    if (!profile) {
      throw new AppError(404, 'RIDER_PROFILE_NOT_FOUND', 'Rider profile not found');
    }

    if (profile.workStatus === RiderWorkStatus.ONLINE_AVAILABLE) {
      const activeSession = await riderRepository.getActiveSession(profile.id);
      return {
        workStatus: profile.workStatus,
        session: activeSession || (await riderRepository.startSession(profile.id)),
        profile,
      };
    }

    // 1. Enforce State Machine Transition & Operational Guards
    RiderStateMachine.assertCanTransition(
      profile.workStatus,
      RiderWorkStatus.ONLINE_AVAILABLE,
      {
        onboardingStatus: profile.onboardingStatus,
        operationalStatus: profile.operationalStatus,
      }
    );

    // 2. Validate Vehicle
    const vehicle = await riderRepository.findVehicleByRiderId(profile.id);
    if (!vehicle || vehicle.status !== VehicleStatus.ACTIVE) {
      throw new AppError(
        400,
        'RIDER_VEHICLE_REQUIRED',
        'An active registered vehicle is required before going online'
      );
    }

    // 3. Validate Service Zone Assignment
    const zoneIds = profile.serviceZoneIds || [];
    if (zoneIds.length === 0) {
      throw new AppError(
        400,
        'RIDER_ZONE_REQUIRED',
        'Rider has not been assigned to any operational service zones. Contact operations support.'
      );
    }

    // 4. Validate Location
    let lat: number | undefined = locationPayload?.latitude;
    let lng: number | undefined = locationPayload?.longitude;
    let accuracy: number = locationPayload?.accuracy_meters ?? 10;

    if (lat !== undefined && lng !== undefined) {
      // Direct location passed in Go Online request
      await this.recordLocation(userId, {
        latitude: lat,
        longitude: lng,
        accuracyMeters: accuracy,
      });
    } else {
      // Check if fresh live location exists in Redis
      const liveLoc = await riderLocationStore.getLiveLocation(profile.id);
      if (liveLoc) {
        lat = liveLoc.latitude;
        lng = liveLoc.longitude;
        accuracy = liveLoc.accuracyMeters;
      } else if (profile.lastKnownLatitude && profile.lastKnownLongitude) {
        lat = profile.lastKnownLatitude;
        lng = profile.lastKnownLongitude;
      } else {
        throw new AppError(
          400,
          'RIDER_LOCATION_REQUIRED',
          'GPS location permission and valid current coordinates are required to go online'
        );
      }
    }

    // Check accuracy threshold
    if (accuracy > config.rider.maxAccuracyMeters) {
      throw new AppError(
        400,
        'RIDER_LOCATION_INACCURATE',
        `GPS accuracy is too low (${Math.round(accuracy)}m). Accuracy must be within ${config.rider.maxAccuracyMeters}m.`
      );
    }

    // 5. Transition Work Status to ONLINE_AVAILABLE
    const updated = await riderRepository.updateProfile(profile.id, {
      workStatus: RiderWorkStatus.ONLINE_AVAILABLE,
    });

    // 6. Start Availability Session
    const session = await riderRepository.startSession(profile.id, zoneIds[0]);

    // 7. Add to available geo index in Redis
    if (lng !== undefined && lat !== undefined) {
      await riderLocationStore.addAvailableRider(profile.id, lng, lat, zoneIds);
    }

    // 8. Publish Realtime Events
    try {
      const eventPayload = {
        riderId: profile.id,
        workStatus: RiderWorkStatus.ONLINE_AVAILABLE,
        zoneIds,
        occurredAt: new Date().toISOString(),
      };
      await publishRiderEvent(`rider:${profile.id}`, 'rider.online', eventPayload);
      await publishRiderEvent('admin:riders', 'rider.online', eventPayload);
      await publishRiderEvent('admin:riders', 'rider.available', eventPayload);
    } catch {
    allowMemoryAdapter();
      // Non-blocking event publish
    }

    // 9. Audit Event
    await authRepository.createAuditLog({
      action: AuditAction.RIDER_AVAILABILITY_CHANGED,
      resource_type: 'RIDER',
      resource_id: profile.id,
      actor_user_id: userId,
      actor_role: 'RIDER',
      metadata: { workStatus: RiderWorkStatus.ONLINE_AVAILABLE },
    });

    return {
      workStatus: RiderWorkStatus.ONLINE_AVAILABLE,
      session,
      profile: updated,
    };
  }

  /**
   * Rider Goes Offline (Section 27, 68, 77-80)
   */
  public async goOffline(userId: string): Promise<{
    workStatus: RiderWorkStatus;
    profile: RiderProfile;
  }> {
    const profile = await riderRepository.findProfileByUserId(userId);
    if (!profile) {
      throw new AppError(404, 'RIDER_PROFILE_NOT_FOUND', 'Rider profile not found');
    }

    if (profile.workStatus === RiderWorkStatus.OFFLINE) {
      return { workStatus: RiderWorkStatus.OFFLINE, profile };
    }

    // 1. Close active availability session
    await riderRepository.endActiveSession(profile.id, 'OFFLINE');

    // 2. Transition work status to OFFLINE
    const updated = await riderRepository.updateProfile(profile.id, {
      workStatus: RiderWorkStatus.OFFLINE,
    });

    // 3. Remove from Redis available geo index and live location
    await riderLocationStore.removeAvailableRider(profile.id, profile.serviceZoneIds);
    await riderLocationStore.removeLiveLocation(profile.id);

    // 4. Publish Realtime Events
    try {
      const eventPayload = {
        riderId: profile.id,
        workStatus: RiderWorkStatus.OFFLINE,
        occurredAt: new Date().toISOString(),
      };
      await publishRiderEvent(`rider:${profile.id}`, 'rider.offline', eventPayload);
      await publishRiderEvent('admin:riders', 'rider.offline', eventPayload);
    } catch {
    allowMemoryAdapter();
      // Non-blocking
    }

    // 5. Audit Event
    await authRepository.createAuditLog({
      action: AuditAction.RIDER_AVAILABILITY_CHANGED,
      resource_type: 'RIDER',
      resource_id: profile.id,
      actor_user_id: userId,
      actor_role: 'RIDER',
      metadata: { workStatus: RiderWorkStatus.OFFLINE },
    });

    return {
      workStatus: RiderWorkStatus.OFFLINE,
      profile: updated,
    };
  }

  /**
   * Ingests a high-frequency location update from active rider app (Section 32-34, 65-68)
   */
  public async recordLocation(
    userId: string,
    update: {
      latitude: number;
      longitude: number;
      accuracyMeters?: number;
      recordedAt?: string;
    }
  ): Promise<{
    workStatus: RiderWorkStatus;
    locationFresh: boolean;
    accuracyMeters: number;
    receivedAt: string;
    speedMps?: number;
    isAnomalousMovement?: boolean;
  }> {
    const profile = await riderRepository.findProfileByUserId(userId);
    if (!profile) {
      throw new AppError(404, 'RIDER_PROFILE_NOT_FOUND', 'Rider profile not found');
    }

    // Coordinate validation
    if (
      typeof update.latitude !== 'number' ||
      isNaN(update.latitude) ||
      update.latitude < -90 ||
      update.latitude > 90 ||
      typeof update.longitude !== 'number' ||
      isNaN(update.longitude) ||
      update.longitude < -180 ||
      update.longitude > 180
    ) {
      throw new AppError(400, 'INVALID_COORDINATES', 'Latitude or longitude coordinates out of bounds');
    }

    const accuracy = update.accuracyMeters ?? 10;
    const recordedAt = update.recordedAt || new Date().toISOString();
    const receivedAt = new Date().toISOString();

    // 1. Impossible Movement / Teleportation check
    let speedMps: number | undefined;
    let isAnomalousMovement = false;

    const previousLoc = await riderLocationStore.getLiveLocation(profile.id);
    if (previousLoc) {
      const prevTime = new Date(previousLoc.receivedAt).getTime();
      const currTime = new Date(receivedAt).getTime();
      const deltaSeconds = Math.max(0.5, (currTime - prevTime) / 1000);

      const distanceMeters = calculateDistanceMeters(
        previousLoc.latitude,
        previousLoc.longitude,
        update.latitude,
        update.longitude
      );

      speedMps = distanceMeters / deltaSeconds;
      if (speedMps > config.rider.maxSpeedMps && distanceMeters > 500) {
        isAnomalousMovement = true;
        logger.warn('Impossible movement anomaly detected for rider', {
          service: 'rider',
          metadata: {
            riderId: profile.id,
            distanceMeters,
            deltaSeconds,
            speedMps,
            threshold: config.rider.maxSpeedMps,
          },
        });
      }
    }

    // 2. Ephemeral Storage in Redis (TTL = 180s)
    await riderLocationStore.saveLiveLocation(
      profile.id,
      {
        riderId: profile.id,
        latitude: update.latitude,
        longitude: update.longitude,
        accuracyMeters: accuracy,
        recordedAt,
        receivedAt,
      },
      config.rider.locationTtlSeconds
    );

    // Record heartbeat
    await riderLocationStore.recordHeartbeat(profile.id, config.rider.locationTtlSeconds);

    // 3. Persist lightweight last-known location in database
    await riderRepository.updateLastLocation(profile.id, update.latitude, update.longitude);

    // 4. Maintain Available Geo Index & Work Status if rider is Online
    let currentWorkStatus = profile.workStatus;

    if (
      profile.workStatus === RiderWorkStatus.ONLINE_AVAILABLE ||
      profile.workStatus === RiderWorkStatus.ONLINE_UNAVAILABLE
    ) {
      const isAccurate = accuracy <= config.rider.maxAccuracyMeters;

      if (isAccurate) {
        // Fresh accurate location: ensure rider is indexed as available
        await riderLocationStore.addAvailableRider(
          profile.id,
          update.longitude,
          update.latitude,
          profile.serviceZoneIds
        );

        if (profile.workStatus === RiderWorkStatus.ONLINE_UNAVAILABLE) {
          // Re-transition to ONLINE_AVAILABLE!
          await riderRepository.updateProfile(profile.id, {
            workStatus: RiderWorkStatus.ONLINE_AVAILABLE,
          });
          currentWorkStatus = RiderWorkStatus.ONLINE_AVAILABLE;

          try {
            await publishRiderEvent(`rider:${profile.id}`, 'rider.available', {
              riderId: profile.id,
              workStatus: RiderWorkStatus.ONLINE_AVAILABLE,
              occurredAt: receivedAt,
            });
            await publishRiderEvent('admin:riders', 'rider.available', {
              riderId: profile.id,
              workStatus: RiderWorkStatus.ONLINE_AVAILABLE,
              occurredAt: receivedAt,
            });
          } catch {
    allowMemoryAdapter();
            // Non-blocking
          }
        }
      } else {
        // Inaccurate GPS: transition to ONLINE_UNAVAILABLE and remove from dispatch geo index
        await riderLocationStore.removeAvailableRider(profile.id, profile.serviceZoneIds);
        if (profile.workStatus === RiderWorkStatus.ONLINE_AVAILABLE) {
          await riderRepository.updateProfile(profile.id, {
            workStatus: RiderWorkStatus.ONLINE_UNAVAILABLE,
          });
          currentWorkStatus = RiderWorkStatus.ONLINE_UNAVAILABLE;

          try {
            await publishRiderEvent(`rider:${profile.id}`, 'rider.unavailable', {
              riderId: profile.id,
              workStatus: RiderWorkStatus.ONLINE_UNAVAILABLE,
              reason: 'GPS_ACCURACY_DEGRADED',
              occurredAt: receivedAt,
            });
          } catch {
    allowMemoryAdapter();
            // Non-blocking
          }
        }
      }
    }

    return {
      workStatus: currentWorkStatus,
      locationFresh: true,
      accuracyMeters: accuracy,
      receivedAt,
      speedMps,
      isAnomalousMovement,
    };
  }

  // ============================================================================
  // ADMIN FLEET MANAGEMENT OPERATIONS
  // ============================================================================

  public async listAdminRiders(query: {
    onboardingStatus?: RiderOnboardingStatus;
    operationalStatus?: RiderOperationalStatus;
    workStatus?: RiderWorkStatus;
    vehicleType?: VehicleType;
    serviceZoneId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    riders: Array<
      RiderProfile & {
        vehicle: RiderVehicle | null;
        userEmail?: string;
        locationFreshness: {
          lastLocationAgeSeconds?: number;
          isStale: boolean;
        };
      }
    >;
    total: number;
    page: number;
    limit: number;
  }> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const offset = (page - 1) * limit;

    const { riders, total } = await riderRepository.listRiders({
      onboardingStatus: query.onboardingStatus,
      operationalStatus: query.operationalStatus,
      workStatus: query.workStatus,
      vehicleType: query.vehicleType,
      zoneId: query.serviceZoneId,
      search: query.search,
      limit,
      offset,
    });

    const now = Date.now();
    const enriched = await Promise.all(
      riders.map(async (r) => {
        const vehicle = await riderRepository.findVehicleByRiderId(r.id);
        const user = await authRepository.findUserById(r.userId);
        const liveLoc = await riderLocationStore.getLiveLocation(r.id);

        let lastLocationAgeSeconds: number | undefined;
        let isStale = true;

        if (liveLoc) {
          const recordedMs = new Date(liveLoc.receivedAt || liveLoc.recordedAt).getTime();
          lastLocationAgeSeconds = Math.max(0, Math.floor((now - recordedMs) / 1000));
          isStale = lastLocationAgeSeconds > config.rider.locationStaleSeconds;
        } else if (r.lastLocationAt) {
          const recordedMs = new Date(r.lastLocationAt).getTime();
          lastLocationAgeSeconds = Math.max(0, Math.floor((now - recordedMs) / 1000));
          isStale = lastLocationAgeSeconds > config.rider.locationStaleSeconds;
        }

        return {
          ...r,
          vehicle,
          userEmail: user?.email,
          locationFreshness: {
            lastLocationAgeSeconds,
            isStale,
          },
        };
      })
    );

    return {
      riders: enriched,
      total,
      page,
      limit,
    };
  }

  public async getAdminRiderDetail(riderId: string): Promise<{
    profile: RiderProfile;
    vehicle: RiderVehicle | null;
    user: any;
    assignedZones: any[];
    activeSession: RiderAvailabilitySession | null;
    recentSessions: RiderAvailabilitySession[];
    eligibility: { eligible: boolean; reasons: string[] };
    liveLocation?: any;
    locationFreshness: {
      lastLocationAgeSeconds?: number;
      isStale: boolean;
    };
  }> {
    const profile = await riderRepository.findProfileById(riderId);
    if (!profile) {
      throw new AppError(404, 'RIDER_NOT_FOUND', 'Rider profile not found');
    }

    const vehicle = await riderRepository.findVehicleByRiderId(riderId);
    const user = await authRepository.findUserById(profile.userId);
    const activeSession = await riderRepository.getActiveSession(riderId);
    const recentSessions = await riderRepository.listSessions(riderId, 10);
    const eligibility = await riderEligibilityService.isRiderEligibleForDispatch(riderId);

    const zoneIds = profile.serviceZoneIds || [];
    const assignedZones = [];
    for (const zid of zoneIds) {
      const z = await merchantRepository.findServiceZoneById(zid);
      if (z) assignedZones.push(z);
    }

    const liveLoc = await riderLocationStore.getLiveLocation(riderId);
    const now = Date.now();
    let lastLocationAgeSeconds: number | undefined;
    let isStale = true;

    if (liveLoc) {
      const recordedMs = new Date(liveLoc.receivedAt || liveLoc.recordedAt).getTime();
      lastLocationAgeSeconds = Math.max(0, Math.floor((now - recordedMs) / 1000));
      isStale = lastLocationAgeSeconds > config.rider.locationStaleSeconds;
    } else if (profile.lastLocationAt) {
      const recordedMs = new Date(profile.lastLocationAt).getTime();
      lastLocationAgeSeconds = Math.max(0, Math.floor((now - recordedMs) / 1000));
      isStale = lastLocationAgeSeconds > config.rider.locationStaleSeconds;
    }

    return {
      profile,
      vehicle,
      user: user
        ? {
            id: user.id,
            email: user.email,
            phone: user.phone_e164,
            status: user.status,
            createdAt: user.created_at,
          }
        : null,
      assignedZones,
      activeSession,
      recentSessions,
      eligibility: {
        eligible: eligibility.eligible,
        reasons: eligibility.reasons,
      },
      liveLocation: liveLoc || undefined,
      locationFreshness: {
        lastLocationAgeSeconds,
        isStale,
      },
    };
  }

  public async approveRider(
    adminUserId: string,
    riderId: string,
    note?: string
  ): Promise<RiderProfile> {
    const profile = await riderRepository.findProfileById(riderId);
    if (!profile) {
      throw new AppError(404, 'RIDER_NOT_FOUND', 'Rider profile not found');
    }

    if (profile.onboardingStatus === RiderOnboardingStatus.APPROVED) {
      throw new AppError(409, 'RIDER_ALREADY_APPROVED', 'Rider is already approved');
    }

    const now = new Date().toISOString();
    const updated = await riderRepository.updateProfile(riderId, {
      onboardingStatus: RiderOnboardingStatus.APPROVED,
      approvedAt: now,
      approvedBy: adminUserId,
      rejectedAt: null,
      rejectionReason: null,
    });

    await authRepository.createAuditLog({
      action: AuditAction.RIDER_APPROVED,
      resource_type: 'RIDER',
      resource_id: riderId,
      actor_user_id: adminUserId,
      actor_role: 'ADMIN',
      metadata: { note },
    });

    return updated;
  }

  public async rejectRider(
    adminUserId: string,
    riderId: string,
    reasonCode: string,
    note?: string
  ): Promise<RiderProfile> {
    const profile = await riderRepository.findProfileById(riderId);
    if (!profile) {
      throw new AppError(404, 'RIDER_NOT_FOUND', 'Rider profile not found');
    }

    const now = new Date().toISOString();
    const updated = await riderRepository.updateProfile(riderId, {
      onboardingStatus: RiderOnboardingStatus.REJECTED,
      rejectedAt: now,
      rejectionReason: reasonCode,
    });

    await authRepository.createAuditLog({
      action: AuditAction.RIDER_REJECTED,
      resource_type: 'RIDER',
      resource_id: riderId,
      actor_user_id: adminUserId,
      actor_role: 'ADMIN',
      metadata: { reasonCode, note },
    });

    return updated;
  }

  public async suspendRider(
    adminUserId: string,
    riderId: string,
    reason: string,
    note?: string
  ): Promise<RiderProfile> {
    const profile = await riderRepository.findProfileById(riderId);
    if (!profile) {
      throw new AppError(404, 'RIDER_NOT_FOUND', 'Rider profile not found');
    }

    const now = new Date().toISOString();

    // 1. If rider is online, force them offline immediately
    if (profile.workStatus !== RiderWorkStatus.OFFLINE) {
      await riderRepository.endActiveSession(riderId, 'SUSPENDED');
      await riderLocationStore.removeAvailableRider(riderId, profile.serviceZoneIds);
      await riderLocationStore.removeLiveLocation(riderId);

      try {
        await publishRiderEvent(`rider:${riderId}`, 'rider.offline', {
          riderId,
          workStatus: RiderWorkStatus.OFFLINE,
          reason: 'OPERATIONAL_SUSPENSION',
          occurredAt: now,
        });
      } catch {
    allowMemoryAdapter();
        // Non-blocking
      }
    }

    // 2. Set operationalStatus = SUSPENDED, workStatus = OFFLINE
    const updated = await riderRepository.updateProfile(riderId, {
      operationalStatus: RiderOperationalStatus.SUSPENDED,
      workStatus: RiderWorkStatus.OFFLINE,
      suspendedAt: now,
      suspensionReason: reason,
    });

    // 3. Audit Log
    await authRepository.createAuditLog({
      action: AuditAction.RIDER_SUSPENDED,
      resource_type: 'RIDER',
      resource_id: riderId,
      actor_user_id: adminUserId,
      actor_role: 'ADMIN',
      metadata: { reason, note },
    });

    return updated;
  }

  public async reactivateRider(adminUserId: string, riderId: string): Promise<RiderProfile> {
    const profile = await riderRepository.findProfileById(riderId);
    if (!profile) {
      throw new AppError(404, 'RIDER_NOT_FOUND', 'Rider profile not found');
    }

    // OperationalStatus becomes ACTIVE, but workStatus remains OFFLINE until explicit Go Online
    const updated = await riderRepository.updateProfile(riderId, {
      operationalStatus: RiderOperationalStatus.ACTIVE,
      suspendedAt: null,
      suspensionReason: null,
    });

    await authRepository.createAuditLog({
      action: AuditAction.RIDER_REACTIVATED,
      resource_type: 'RIDER',
      resource_id: riderId,
      actor_user_id: adminUserId,
      actor_role: 'ADMIN',
    });

    return updated;
  }

  public async assignServiceZones(
    adminUserId: string,
    riderId: string,
    zoneIds: string[]
  ): Promise<string[]> {
    const profile = await riderRepository.findProfileById(riderId);
    if (!profile) {
      throw new AppError(404, 'RIDER_NOT_FOUND', 'Rider profile not found');
    }

    // Validate that provided service zones exist and are active
    for (const zid of zoneIds) {
      const zone = await merchantRepository.findServiceZoneById(zid);
      if (!zone) {
        throw new AppError(400, 'SERVICE_ZONE_NOT_FOUND', `Service zone ${zid} does not exist`);
      }
    }

    const assigned = await riderRepository.assignZones(riderId, zoneIds);

    await authRepository.createAuditLog({
      action: AuditAction.RIDER_ZONE_ASSIGNED,
      resource_type: 'RIDER',
      resource_id: riderId,
      actor_user_id: adminUserId,
      actor_role: 'ADMIN',
      metadata: { assignedZoneIds: zoneIds },
    });

    return assigned;
  }

  public async getFleetMetrics(): Promise<RiderAdminMetrics> {
    return await riderRepository.getMetrics();
  }
}

export const riderService = transactionalService(new RiderService());
