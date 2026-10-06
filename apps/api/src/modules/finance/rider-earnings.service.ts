import { randomUUID as durableEntityId } from 'node:crypto';
import { transactionalService } from '../../db/transaction';
import { getDbPool } from '../../db/client';
import { config } from '@deetoo/config';
/**
 * DEETOO - Rider Earnings Service
 * Effective-dated rider compensation calculation and immutable earning snapshots.
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
  zonePeakEligible?: boolean;
  stackedOrderCount?: number;
  currency?: string;
}

interface RiderEarningRule {
  id: string;
  baseAmountMinor: number;
  perKilometreAmountMinor: number;
  includedDistanceMeters: number;
  waitingAmountMinorPerMinute: number;
  includedWaitingMinutes: number;
  zonePeakBonusMinor: number;
  stackedOrderComponentMinor: number;
  effectiveFrom: string;
}

export class RiderEarningsService {
  private readonly FALLBACK_RULE: RiderEarningRule = {
    id: 'default',
    baseAmountMinor: 15000,
    perKilometreAmountMinor: 3000,
    includedDistanceMeters: 2000,
    waitingAmountMinorPerMinute: 500,
    includedWaitingMinutes: 10,
    zonePeakBonusMinor: 0,
    stackedOrderComponentMinor: 0,
    effectiveFrom: '2020-01-01T00:00:00.000Z',
  };

  constructor(private repo: LedgerRepository = ledgerRepository) {}

  private async resolveRule(): Promise<RiderEarningRule> {
    if (config.storage.mode !== 'postgres') return this.FALLBACK_RULE;

    const result = await getDbPool().query(
      `SELECT *
       FROM rider_earning_rules
       WHERE status='ACTIVE'
         AND effective_from <= NOW()
         AND (effective_until IS NULL OR effective_until > NOW())
       ORDER BY effective_from DESC
       LIMIT 1`,
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error('No active rider earning rule is configured');
    }
    return {
      id: row.id,
      baseAmountMinor: Number(row.base_amount_minor),
      perKilometreAmountMinor: Number(row.per_kilometre_amount_minor),
      includedDistanceMeters: Number(row.included_distance_meters),
      waitingAmountMinorPerMinute: Number(row.waiting_amount_minor_per_minute),
      includedWaitingMinutes: Number(row.included_waiting_minutes),
      zonePeakBonusMinor: Number(row.zone_peak_bonus_minor),
      stackedOrderComponentMinor: Number(row.stacked_order_component_minor),
      effectiveFrom: row.effective_from?.toISOString?.() || String(row.effective_from),
    };
  }

  private estimateWithRule(
    input: {
      distanceMeters?: number;
      waitingMinutes?: number;
      bonusMinor?: number;
      zonePeakEligible?: boolean;
      stackedOrderCount?: number;
    },
    rule: RiderEarningRule,
  ): {
    baseMinor: number;
    distanceMinor: number;
    waitingMinor: number;
    bonusMinor: number;
    zonePeakBonusMinor: number;
    stackedOrderMinor: number;
    totalMinor: number;
  } {
    const distanceMeters = Math.max(0, input.distanceMeters || 0);
    const waitingMinutes = Math.max(0, input.waitingMinutes || 0);
    const discretionaryBonusMinor = Math.max(0, input.bonusMinor || 0);
    const zonePeakBonusMinor = input.zonePeakEligible ? rule.zonePeakBonusMinor : 0;
    const stackedOrderCount = Math.max(1, input.stackedOrderCount || 1);
    const stackedOrderMinor =
      Math.max(0, stackedOrderCount - 1) * rule.stackedOrderComponentMinor;

    const distanceMinor =
      distanceMeters > rule.includedDistanceMeters
        ? Math.round(
            ((distanceMeters - rule.includedDistanceMeters) / 1000) *
              rule.perKilometreAmountMinor,
          )
        : 0;
    const waitingMinor =
      waitingMinutes > rule.includedWaitingMinutes
        ? Math.round(
            (waitingMinutes - rule.includedWaitingMinutes) *
              rule.waitingAmountMinorPerMinute,
          )
        : 0;
    const bonusMinor =
      discretionaryBonusMinor + zonePeakBonusMinor + stackedOrderMinor;
    const baseMinor = rule.baseAmountMinor;

    return {
      baseMinor,
      distanceMinor,
      waitingMinor,
      bonusMinor,
      zonePeakBonusMinor,
      stackedOrderMinor,
      totalMinor: baseMinor + distanceMinor + waitingMinor + bonusMinor,
    };
  }

  /**
   * Backwards-compatible estimate used by current offer and test flows.
   * Production settlement uses the effective-dated rule resolved at completion.
   */
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
    return this.estimateWithRule(input, this.FALLBACK_RULE);
  }

  /**
   * Calculates rider compensation for a completed delivery.
   * The exact commercial rule and applied components are frozen into rules_snapshot.
   */
  public async calculateAndRecordEarning(input: RiderEarningInput): Promise<RiderEarning> {
    const existing = await this.repo.findRiderEarningByDeliveryId(input.deliveryId);
    if (existing) return existing;

    const rule = await this.resolveRule();
    const distanceMeters = input.distanceMeters || 0;
    const waitingMinutes = input.waitingMinutes || 0;
    const currency = input.currency || 'KES';
    const estimate = this.estimateWithRule(input, rule);

    const rulesSnapshot = {
      ruleId: rule.id,
      effectiveFrom: rule.effectiveFrom,
      baseAmountMinor: rule.baseAmountMinor,
      perKilometreAmountMinor: rule.perKilometreAmountMinor,
      includedDistanceMeters: rule.includedDistanceMeters,
      waitingAmountMinorPerMinute: rule.waitingAmountMinorPerMinute,
      includedWaitingMinutes: rule.includedWaitingMinutes,
      configuredZonePeakBonusMinor: rule.zonePeakBonusMinor,
      configuredStackedOrderComponentMinor: rule.stackedOrderComponentMinor,
      distanceMeters,
      waitingMinutes,
      discretionaryBonusMinor: Math.max(0, input.bonusMinor || 0),
      zonePeakEligible: Boolean(input.zonePeakEligible),
      appliedZonePeakBonusMinor: estimate.zonePeakBonusMinor,
      stackedOrderCount: Math.max(1, input.stackedOrderCount || 1),
      appliedStackedOrderMinor: estimate.stackedOrderMinor,
    };

    const earning: RiderEarning = {
      id: durableEntityId(),
      rider_id: input.riderId,
      delivery_id: input.deliveryId,
      order_id: input.orderId,
      base_amount_minor: estimate.baseMinor,
      distance_amount_minor: estimate.distanceMinor,
      waiting_amount_minor: estimate.waitingMinor,
      bonus_amount_minor: estimate.bonusMinor,
      adjustment_amount_minor: 0,
      total_amount_minor: estimate.totalMinor,
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
        ruleId: rule.id,
        totalMinor: estimate.totalMinor,
      },
    });
    return saved;
  }
}

export const riderEarningsService = transactionalService(new RiderEarningsService());
