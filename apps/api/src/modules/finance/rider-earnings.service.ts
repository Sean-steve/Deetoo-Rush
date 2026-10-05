import { randomUUID as durableEntityId } from 'node:crypto';
import { transactionalService } from '../../db/transaction';
/**
 * DEETOO - Rider Earnings Service
 * Sprint 12: Courier compensation calculation, delivery earnings generation, and breakdown tracking
 */

import { ledgerRepository, LedgerRepository } from './ledger.repository';
import { RiderEarning, RiderEarningStatus } from '@deetoo/types';
import { logger } from '@deetoo/utils';

export interface RiderEarningInput {
  riderId: string;
  deliveryId: string;
  orderId: string;
  distanceMeters?: number;
  waitingMinutes?: number;
  bonusMinor?: number;
  currency?: string;
}

export class RiderEarningsService {
  // Authoritative constants (in minor units, KES cents: 1 KES = 100 minor units)
  private readonly BASE_PAY_MINOR = 15000; // KES 150.00
  private readonly INCLUDED_DISTANCE_METERS = 2000; // 2.0 km
  private readonly RATE_PER_KM_MINOR = 3000; // KES 30.00 per km
  private readonly INCLUDED_WAIT_MINUTES = 10; // 10 minutes
  private readonly RATE_PER_WAIT_MINUTE_MINOR = 500; // KES 5.00 per minute

  constructor(private repo: LedgerRepository = ledgerRepository) {}

  public estimateEarning(input: {
    distanceMeters?: number;
    waitingMinutes?: number;
    bonusMinor?: number;
  }): {
    baseMinor: number;
    distanceMinor: number;
    waitingMinor: number;
    bonusMinor: number;
    totalMinor: number;
  } {
    const distanceMeters = Math.max(0, input.distanceMeters || 0);
    const waitingMinutes = Math.max(0, input.waitingMinutes || 0);
    const bonusMinor = Math.max(0, input.bonusMinor || 0);

    const distanceMinor =
      distanceMeters > this.INCLUDED_DISTANCE_METERS
        ? Math.round(((distanceMeters - this.INCLUDED_DISTANCE_METERS) / 1000) * this.RATE_PER_KM_MINOR)
        : 0;
    const waitingMinor =
      waitingMinutes > this.INCLUDED_WAIT_MINUTES
        ? Math.round((waitingMinutes - this.INCLUDED_WAIT_MINUTES) * this.RATE_PER_WAIT_MINUTE_MINOR)
        : 0;
    const baseMinor = this.BASE_PAY_MINOR;

    return {
      baseMinor,
      distanceMinor,
      waitingMinor,
      bonusMinor,
      totalMinor: baseMinor + distanceMinor + waitingMinor + bonusMinor,
    };
  }

  /**
   * Calculates rider compensation for a completed delivery
   */
  public async calculateAndRecordEarning(input: RiderEarningInput): Promise<RiderEarning> {
    // 1. Idempotency check: if earning already exists for delivery, return it
    const existing = await this.repo.findRiderEarningByDeliveryId(input.deliveryId);
    if (existing) {
      return existing;
    }

    const distanceMeters = input.distanceMeters || 0;
    const waitingMinutes = input.waitingMinutes || 0;
    const bonusMinor = input.bonusMinor || 0;
    const currency = input.currency || 'KES';

    const {
      baseMinor,
      distanceMinor,
      waitingMinor,
      totalMinor,
    } = this.estimateEarning({ distanceMeters, waitingMinutes, bonusMinor });

    const rulesSnapshot = {
      basePayMinor: this.BASE_PAY_MINOR,
      includedDistanceMeters: this.INCLUDED_DISTANCE_METERS,
      ratePerKmMinor: this.RATE_PER_KM_MINOR,
      includedWaitMinutes: this.INCLUDED_WAIT_MINUTES,
      ratePerWaitMinuteMinor: this.RATE_PER_WAIT_MINUTE_MINOR,
      distanceMeters,
      waitingMinutes,
      bonusMinor,
    };

    const earning: RiderEarning = {
      id: durableEntityId(),
      rider_id: input.riderId,
      delivery_id: input.deliveryId,
      order_id: input.orderId,
      base_amount_minor: baseMinor,
      distance_amount_minor: distanceMinor,
      waiting_amount_minor: waitingMinor,
      bonus_amount_minor: bonusMinor,
      adjustment_amount_minor: 0,
      total_amount_minor: totalMinor,
      currency,
      status: RiderEarningStatus.ELIGIBLE,
      rules_snapshot: rulesSnapshot,
      created_at: new Date().toISOString(),
      settled_at: null,
    };

    const saved = await this.repo.saveRiderEarning(earning);

    logger.info('Calculated rider delivery earnings', {
      metadata: {
        earningId: saved.id,
        riderId: input.riderId,
        deliveryId: input.deliveryId,
        totalMinor,
      },
    });

    return saved;
  }
}

export const riderEarningsService = transactionalService(new RiderEarningsService());
