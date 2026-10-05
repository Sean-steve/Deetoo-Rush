import { allowMemoryAdapter } from '../../db/storage-policy';
import { transactionalService } from '../../db/transaction';
/**
 * DEETOO - Centralized Rider Dispatch Eligibility & Stale Location Service
 * Implements Section 8, 35, 45, 48, 83-88, 131 of Sprint 8
 */

import {
  RiderEligibilityResult,
  RiderOnboardingStatus,
  RiderOperationalStatus,
  RiderWorkStatus,
  VehicleStatus,
  UserStatus,
} from '@deetoo/types';
import { config } from '@deetoo/config';
import { riderRepository } from './rider.repository';
import { authRepository } from '../auth/auth.repository';
import { riderLocationStore } from '../../db/redis';
import { orderEventBroker } from '../realtime/event-broker';
import { logger } from '@deetoo/utils';

export class RiderEligibilityService {
  /**
   * Pure evaluation helper for checking in-memory criteria
   */
  public evaluateEligibilityCriteria(criteria: {
    userStatus?: UserStatus;
    onboardingStatus: RiderOnboardingStatus;
    operationalStatus: RiderOperationalStatus;
    vehicleStatus?: VehicleStatus | null;
    vehicleType?: string | null;
    hasAssignedZones?: boolean;
    locationFresh?: boolean;
  }): { isEligible: boolean; canGoOnline: boolean; blockers: string[] } {
    const blockers: string[] = [];

    if (criteria.userStatus && criteria.userStatus !== UserStatus.ACTIVE) {
      blockers.push(`USER_${criteria.userStatus}`);
    }

    if (criteria.onboardingStatus !== RiderOnboardingStatus.APPROVED) {
      blockers.push('ONBOARDING_NOT_APPROVED');
    }

    if (criteria.operationalStatus !== RiderOperationalStatus.ACTIVE) {
      blockers.push('ACCOUNT_NOT_ACTIVE');
    }

    if (!criteria.vehicleType || criteria.vehicleStatus === VehicleStatus.INACTIVE) {
      blockers.push('NO_VEHICLE_CONFIGURED');
    }

    const canGoOnline =
      criteria.onboardingStatus === RiderOnboardingStatus.APPROVED &&
      criteria.operationalStatus === RiderOperationalStatus.ACTIVE &&
      !!criteria.vehicleType;

    const isEligible = blockers.length === 0;

    return {
      isEligible,
      canGoOnline,
      blockers,
    };
  }

  /**
   * Centralized backend eligibility evaluation function.
   * Authoritative source of truth for whether a rider can receive dispatch / delivery offers.
   * Reused in Sprint 8 and Sprint 9.
   */
  public async isRiderEligibleForDispatch(
    riderId: string,
    options?: {
      zoneId?: string;
      maxAgeSeconds?: number;
    }
  ): Promise<RiderEligibilityResult> {
    const reasons: string[] = [];
    const maxAgeSeconds = options?.maxAgeSeconds ?? config.rider.locationStaleSeconds;

    // 1. Fetch Rider Profile
    const profile = await riderRepository.findProfileById(riderId);
    if (!profile) {
      return {
        eligible: false,
        reasons: ['RIDER_NOT_FOUND'],
        details: {
          userActive: false,
          onboardingApproved: false,
          operationalActive: false,
          workStatusAvailable: false,
          locationFresh: false,
          vehicleValid: false,
          zoneValid: false,
        },
      };
    }

    // 2. User Account Status
    const user = await authRepository.findUserById(profile.userId);
    const userActive = !user || user.status === UserStatus.ACTIVE;
    if (user && user.status !== UserStatus.ACTIVE) {
      reasons.push(`USER_${user.status}`);
    }

    // 3. Onboarding Status Check
    const onboardingApproved = profile.onboardingStatus === RiderOnboardingStatus.APPROVED;
    if (!onboardingApproved) {
      reasons.push(`ONBOARDING_${profile.onboardingStatus}`);
    }

    // 4. Operational Status Check
    const operationalActive = profile.operationalStatus === RiderOperationalStatus.ACTIVE;
    if (!operationalActive) {
      reasons.push(`OPERATIONAL_${profile.operationalStatus}`);
    }

    // 5. Work Status Check
    const workStatusAvailable = profile.workStatus === RiderWorkStatus.ONLINE_AVAILABLE;
    if (!workStatusAvailable) {
      reasons.push(`WORK_STATUS_${profile.workStatus}`);
    }

    // 6. Vehicle Status Check
    const vehicle = await riderRepository.findVehicleByRiderId(riderId);
    const vehicleValid = (!!vehicle && vehicle.status === VehicleStatus.ACTIVE) || !!profile.vehicleType;
    if (!vehicleValid) {
      reasons.push(vehicle ? `VEHICLE_${vehicle.status}` : 'VEHICLE_NOT_CONFIGURED');
    }

    // 7. Service Zone Validation
    const zoneIds = profile.serviceZoneIds || [];
    let zoneValid = zoneIds.length > 0 || !options?.zoneId;
    if (options?.zoneId && zoneIds.length > 0) {
      zoneValid = zoneIds.includes(options.zoneId);
      if (!zoneValid) {
        reasons.push('ZONE_NOT_ASSIGNED');
      }
    }

    // 8. Location Freshness & Accuracy Check
    let locationFresh = false;
    let lastLocationAgeSeconds: number | undefined;

    const liveLoc = await riderLocationStore.getLiveLocation(riderId);
    const now = Date.now();

    if (liveLoc) {
      const locTime = new Date(liveLoc.receivedAt || liveLoc.recordedAt).getTime();
      lastLocationAgeSeconds = Math.max(0, Math.floor((now - locTime) / 1000));
      const isRecent = lastLocationAgeSeconds <= maxAgeSeconds;
      const isAccurate = liveLoc.accuracyMeters <= config.rider.maxAccuracyMeters;

      if (isRecent && isAccurate) {
        locationFresh = true;
      } else {
        if (!isRecent) reasons.push('LOCATION_STALE');
        if (!isAccurate) reasons.push('LOCATION_INACCURATE');
      }
    } else if (profile.lastLocationAt) {
      const locTime = new Date(profile.lastLocationAt).getTime();
      lastLocationAgeSeconds = Math.max(0, Math.floor((now - locTime) / 1000));
      if (lastLocationAgeSeconds <= maxAgeSeconds) {
        locationFresh = true;
      } else {
        reasons.push('LOCATION_STALE');
      }
    } else {
      reasons.push('LOCATION_MISSING');
    }

    const eligible =
      userActive &&
      onboardingApproved &&
      operationalActive &&
      workStatusAvailable &&
      vehicleValid &&
      zoneValid &&
      locationFresh;

    return {
      eligible,
      reasons,
      details: {
        userActive,
        onboardingApproved,
        operationalActive,
        workStatusAvailable,
        locationFresh,
        vehicleValid,
        zoneValid,
        lastLocationAgeSeconds,
      },
    };
  }

  /**
   * Idempotent background stale rider cleanup worker (Section 35, 45, 131)
   * Detects riders marked ONLINE_AVAILABLE whose location updates have timed out.
   */
  public async cleanupStaleRiders(
    thresholdSeconds: number = config.rider.locationStaleSeconds
  ): Promise<{ checked: number; transitionedToUnavailable: number }> {
    const { riders } = await riderRepository.listRiders({
      workStatus: RiderWorkStatus.ONLINE_AVAILABLE,
      limit: 500,
    });

    let transitioned = 0;
    const now = Date.now();

    for (const rider of riders) {
      const liveLoc = await riderLocationStore.getLiveLocation(rider.id);
      const heartbeat = await riderLocationStore.getHeartbeat(rider.id);

      let lastSeenMs = 0;
      if (liveLoc) {
        lastSeenMs = new Date(liveLoc.receivedAt || liveLoc.recordedAt).getTime();
      } else if (heartbeat) {
        lastSeenMs = heartbeat;
      } else if (rider.lastLocationAt) {
        lastSeenMs = new Date(rider.lastLocationAt).getTime();
      }

      const ageSeconds = lastSeenMs > 0 ? (now - lastSeenMs) / 1000 : Infinity;

      if (ageSeconds > thresholdSeconds) {
        logger.info('Marking rider as ONLINE_UNAVAILABLE due to stale location', {
          service: 'rider',
          metadata: {
            riderId: rider.id,
            ageSeconds,
            thresholdSeconds,
          },
        });

        // 1. Transition work status to ONLINE_UNAVAILABLE
        await riderRepository.updateProfile(rider.id, {
          workStatus: RiderWorkStatus.ONLINE_UNAVAILABLE,
        });

        // 2. Remove from available geo index
        await riderLocationStore.removeAvailableRider(rider.id, rider.serviceZoneIds);

        // 3. Publish realtime event
        try {
          await orderEventBroker.publish(`rider:${rider.id}`, {
            type: 'rider.location_stale' as any,
            channel: `rider:${rider.id}`,
            order_id: '',
            order_number: '',
            status: 'PLACED' as any,
            timestamp: new Date().toISOString(),
            data: {
              riderId: rider.id,
              workStatus: RiderWorkStatus.ONLINE_UNAVAILABLE,
              reason: 'GPS_SIGNAL_TIMEOUT',
            },
          });

          await orderEventBroker.publish('admin:riders', {
            type: 'rider.unavailable' as any,
            channel: 'admin:riders',
            order_id: '',
            order_number: '',
            status: 'PLACED' as any,
            timestamp: new Date().toISOString(),
            data: {
              riderId: rider.id,
              workStatus: RiderWorkStatus.ONLINE_UNAVAILABLE,
              reason: 'LOCATION_STALE',
            },
          });
        } catch {
    allowMemoryAdapter();
          // best-effort event publish
        }

        transitioned++;
      }
    }

    return { checked: riders.length, transitionedToUnavailable: transitioned };
  }
}

export const riderEligibilityService = transactionalService(new RiderEligibilityService());
