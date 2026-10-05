import { randomUUID } from 'node:crypto';
import { requireSimulationMode } from '../../db/storage-policy';
import { transactionalService } from '../../db/transaction';
import { lockCommand } from '../cart/quote-binding';
import { AppError } from '../../middleware/error-handler';
/**
 * DEETOO - Rider Payout Service
 * Sprint 12: Courier payout batching, M-PESA B2C execution, and ledger payout tracking
 */

import { ledgerRepository, LedgerRepository } from './ledger.repository';
import { financialPostingService, FinancialPostingService } from './financial-posting.service';
import {
  RiderPayout,
  RiderPayoutStatus,
  RiderPayoutLine,
  RiderEarningStatus,
  LedgerAccountType,
  LedgerAccountOwnerType,
} from '@deetoo/types';
import { logger } from '@deetoo/utils';

export class RiderPayoutService {
  constructor(
    private repo: LedgerRepository = ledgerRepository,
    private postingSvc: FinancialPostingService = financialPostingService
  ) {}

  /**
   * Calculates a payout for a rider based on unsettled eligible delivery earnings
   */
  public async calculatePayout(
    riderId: string,
    calculatedByUserId?: string,
    periodStart?: string,
    periodEnd?: string
  ): Promise<RiderPayout> {
    const end = periodEnd ? new Date(periodEnd) : new Date();
    const start = periodStart ? new Date(periodStart) : new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Without this lock, two concurrent calculatePayout calls for the same rider could both read
    // the same ELIGIBLE earnings before either wrote back a status change, producing two DRAFT
    // payouts that both claim the same earnings -- and, if both were later approved and paid, an
    // actual double payment to the rider. Same lockCommand primitive as the Wave 3 offer-
    // acceptance fix and the existing order-level lock in paid-order-guard.ts.
    await lockCommand(`rider-payout:${riderId}`);

    // Get eligible earnings for this rider
    const earnings = await this.repo.findRiderEarningsByRiderId(riderId);
    const eligibleEarnings = earnings.filter(
      (e) => e.status === RiderEarningStatus.ELIGIBLE && new Date(e.created_at) <= end
    );

    const payoutId = randomUUID();
    const payoutNumber = `PYT-${end.toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

    let totalAmountMinor = 0;
    const lines: RiderPayoutLine[] = [];

    for (const e of eligibleEarnings) {
      totalAmountMinor += e.total_amount_minor;
      lines.push({
        id: randomUUID(),
        payout_id: payoutId,
        earning_id: e.id,
        amount_minor: e.total_amount_minor,
        created_at: new Date().toISOString(),
      });
    }

    // If no individual earnings exist, check current rider payable balance -- but only when no
    // other non-terminal payout already exists for this rider. The ledger balance for
    // RIDER_PAYABLE only decreases when a payout is actually posted at pay-time (postRiderPayout),
    // not when one is merely calculated or reserved; without this check, a second calculatePayout
    // call would find the exact same balance still sitting there and re-claim it in a duplicate
    // payout via this fallback, even with the per-earning RESERVED guard above in place.
    if (lines.length === 0) {
      const outstanding = (await this.repo.findRiderPayouts({ riderId })).filter((p) =>
        p.status === RiderPayoutStatus.DRAFT ||
        p.status === RiderPayoutStatus.APPROVED ||
        p.status === RiderPayoutStatus.PROCESSING
      );
      if (outstanding.length === 0) {
        const riderAcc = await this.repo.getOrCreateAccount(
          LedgerAccountType.RIDER_PAYABLE,
          LedgerAccountOwnerType.RIDER,
          riderId,
          'KES'
        );
        const bal = await this.repo.recalculateAccountBalance(riderAcc.id);
        if (bal > 0) {
          totalAmountMinor = bal;
        }
      }
    }

    if (totalAmountMinor <= 0) {
      throw new Error(`No eligible earnings or payable balance found for rider ${riderId}`);
    }

    const payout: RiderPayout = {
      id: payoutId,
      payout_number: payoutNumber,
      rider_id: riderId,
      currency: 'KES',
      amount_minor: totalAmountMinor,
      period_start: start.toISOString(),
      period_end: end.toISOString(),
      status: RiderPayoutStatus.DRAFT,
      provider: 'MPESA_B2C',
      provider_reference: null,
      calculated_by: calculatedByUserId || null,
      approved_by: null,
      approved_at: null,
      paid_at: null,
      failed_at: null,
      failure_reason: null,
      created_at: new Date().toISOString(),
      lines,
    };

    const saved = await this.repo.saveRiderPayout(payout, lines);

    // Reserve the earnings this payout now claims, still inside the lock held above, so no
    // concurrent or later calculatePayout call for this rider can select them again while this
    // DRAFT payout exists. Released back to ELIGIBLE by failPayout if the payout does not go on
    // to be paid.
    for (const e of eligibleEarnings) {
      e.status = RiderEarningStatus.RESERVED;
      await this.repo.saveRiderEarning(e);
    }

    return saved;
  }

  /**
   * Approves a rider payout
   */
  public async approvePayout(payoutId: string, approvedByUserId: string): Promise<RiderPayout> {
    const payout = await this.repo.findRiderPayoutById(payoutId);
    if (!payout) {
      throw new Error(`Payout not found: ${payoutId}`);
    }

    if (payout.status !== RiderPayoutStatus.DRAFT) {
      throw new Error(`Cannot approve payout in status ${payout.status}`);
    }

    // Maker-checker: the person who calculated this payout cannot also approve it for
    // disbursement. calculated_by is only populated when the calculating caller supplied an
    // actor id, so this cannot retroactively block payouts calculated before that was tracked.
    if (payout.calculated_by && payout.calculated_by === approvedByUserId) {
      throw new AppError(403, 'SELF_APPROVAL_NOT_ALLOWED', 'The user who calculated this payout cannot also approve it');
    }

    payout.status = RiderPayoutStatus.APPROVED;
    payout.approved_by = approvedByUserId;
    payout.approved_at = new Date().toISOString();

    return await this.repo.saveRiderPayout(payout, payout.lines || []);
  }

  /**
   * Executes payout disbursement and posts to ledger
   */
  public async payPayout(payoutId: string, providerReference?: string): Promise<RiderPayout> {
    requireSimulationMode();
    const payout = await this.repo.findRiderPayoutById(payoutId);
    if (!payout) {
      throw new Error(`Payout not found: ${payoutId}`);
    }

    if (payout.status !== RiderPayoutStatus.APPROVED) {
      throw new Error(`Cannot pay payout in status ${payout.status}. Must be APPROVED first.`);
    }

    if (!providerReference) {
      // No real M-PESA B2C integration exists in this codebase (a separate Daraja API from the
      // C2B path wired in Wave 2). Fabricating a reference that looks like a genuine M-PESA
      // transaction ID here would let a payout be marked PAID with no real disbursement having
      // happened -- and requireSimulationMode() above only blocks this method outside dev/test,
      // not this specific hazard within it. Fail closed instead.
      throw new Error('providerReference is required to mark a payout as paid: no automatic M-PESA B2C reference is generated');
    }
    const ref = providerReference;

    payout.status = RiderPayoutStatus.PAID;
    payout.paid_at = new Date().toISOString();
    payout.provider_reference = ref;

    // Mark constituent earnings as PAID
    if (payout.lines) {
      for (const line of payout.lines) {
        for (const e of this.repo.riderEarnings.values()) {
          if (e.id === line.earning_id) {
            e.status = RiderEarningStatus.PAID;
            e.settled_at = payout.paid_at;
            await this.repo.saveRiderEarning(e);
          }
        }
      }
    }

    // Post to double-entry ledger
    await this.postingSvc.postRiderPayout(payout);

    const saved = await this.repo.saveRiderPayout(payout, payout.lines || []);

    logger.info('Rider payout disbursed and posted to ledger', {
      metadata: {
        payoutId,
        riderId: payout.rider_id,
        amountMinor: payout.amount_minor,
        reference: ref,
      },
    });

    return saved;
  }

  /**
   * Retrieves a payout by its identifier
   */
  public async getPayoutById(payoutId: string): Promise<RiderPayout | null> {
    return await this.repo.findRiderPayoutById(payoutId);
  }

  /**
   * Marks a payout as failed without losing rider payable balance
   */
  public async failPayout(payoutId: string, reason: string): Promise<RiderPayout> {
    const payout = await this.repo.findRiderPayoutById(payoutId);
    if (!payout) {
      throw new Error(`Payout not found: ${payoutId}`);
    }

    payout.status = RiderPayoutStatus.FAILED;
    payout.failed_at = new Date().toISOString();
    payout.failure_reason = reason;

    // Release the earnings this payout had reserved back to ELIGIBLE so a future calculatePayout
    // run can include them -- without this they would stay RESERVED forever, permanently unpaid.
    if (payout.lines) {
      for (const line of payout.lines) {
        for (const e of this.repo.riderEarnings.values()) {
          if (e.id === line.earning_id && e.status === RiderEarningStatus.RESERVED) {
            e.status = RiderEarningStatus.ELIGIBLE;
            await this.repo.saveRiderEarning(e);
          }
        }
      }
    }

    return await this.repo.saveRiderPayout(payout, payout.lines || []);
  }
}

export const riderPayoutService = transactionalService(new RiderPayoutService());
