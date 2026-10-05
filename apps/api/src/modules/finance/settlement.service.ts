import { randomUUID as durableEntityId } from 'node:crypto';
import { requireSimulationMode } from '../../db/storage-policy';
import { transactionalService } from '../../db/transaction';
import { AppError } from '../../middleware/error-handler';
/**
 * DEETOO - Merchant Settlement Service
 * Sprint 12: Merchant batch calculation, approval lifecycle, and settlement execution
 */

import { ledgerRepository, LedgerRepository } from './ledger.repository';
import { financialPostingService, FinancialPostingService } from './financial-posting.service';
import {
  MerchantSettlement,
  MerchantSettlementStatus,
  MerchantSettlementLine,
  LedgerAccountType,
  LedgerAccountOwnerType,
} from '@deetoo/types';
import { logger } from '@deetoo/utils';

export class SettlementService {
  constructor(
    private repo: LedgerRepository = ledgerRepository,
    private postingSvc: FinancialPostingService = financialPostingService
  ) {}

  /**
   * Calculates a merchant settlement batch for a given period
   */
  public async calculateSettlement(
    merchantId: string,
    calculatedByUserId?: string,
    periodStart?: string,
    periodEnd?: string
  ): Promise<MerchantSettlement> {
    const end = periodEnd ? new Date(periodEnd) : new Date();
    const start = periodStart ? new Date(periodStart) : new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000); // default last 7 days

    // Get merchant payable account
    const merchantAcc = await this.repo.getOrCreateAccount(
      LedgerAccountType.MERCHANT_PAYABLE,
      LedgerAccountOwnerType.MERCHANT,
      merchantId,
      'KES'
    );

    // Get current ledger balance
    const currentBalanceMinor = await this.repo.recalculateAccountBalance(merchantAcc.id);

    // Order summaries for this merchant only, within the period. getAllOrderSummaries() returns
    // every merchant's summaries with no merchant scoping at all -- using it here (filtering only
    // by date afterward, as this method previously did) is what let one merchant's settlement
    // draw in another merchant's revenue.
    const relevantSummaries = await this.repo.getOrderSummariesByMerchant(merchantId, start, end);

    let grossOrderValueMinor = 0;
    let commissionAmountMinor = 0;
    let refundAmountMinor = 0;
    let netSettlementAmountMinor = 0;

    const lines: MerchantSettlementLine[] = [];
    const settlementId = durableEntityId();
    const settlementNumber = `STL-${end.toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

    for (const summary of relevantSummaries) {
      grossOrderValueMinor += summary.food_subtotal_minor;
      commissionAmountMinor += summary.commission_revenue_minor;
      refundAmountMinor += summary.refund_cost_minor;
      const orderNet = summary.food_subtotal_minor - summary.commission_revenue_minor - summary.refund_cost_minor;
      netSettlementAmountMinor += orderNet;

      lines.push({
        id: durableEntityId(),
        settlement_id: settlementId,
        entry_type: 'ORDER',
        reference_id: summary.order_id,
        gross_amount_minor: summary.food_subtotal_minor,
        commission_amount_minor: summary.commission_revenue_minor,
        net_amount_minor: orderNet,
        description: `Order ${summary.order_number}`,
        created_at: new Date().toISOString(),
      });
    }

    // If no order summaries exist yet in the window, but merchant has an outstanding balance,
    // construct a direct settlement line matching the ledger balance only when no other
    // non-terminal settlement already reserves that balance. The ledger balance is not reduced
    // until provider-confirmed payment, so without this guard two calculations could otherwise
    // create two batches for the same payable amount.
    if (lines.length === 0 && currentBalanceMinor > 0) {
      const outstanding = (await this.repo.findSettlements({ merchantId })).filter((existing) =>
        existing.status === MerchantSettlementStatus.DRAFT ||
        existing.status === MerchantSettlementStatus.CALCULATED ||
        existing.status === MerchantSettlementStatus.APPROVED ||
        existing.status === MerchantSettlementStatus.PROCESSING
      );
      if (outstanding.length === 0) {
        grossOrderValueMinor = currentBalanceMinor;
        netSettlementAmountMinor = currentBalanceMinor;
        lines.push({
          id: durableEntityId(),
          settlement_id: settlementId,
          entry_type: 'ADJUSTMENT',
          reference_id: merchantAcc.id,
          gross_amount_minor: currentBalanceMinor,
          commission_amount_minor: 0,
          net_amount_minor: currentBalanceMinor,
          description: `Outstanding payable balance settlement`,
          created_at: new Date().toISOString(),
        });
      }
    }

    const settlement: MerchantSettlement = {
      id: settlementId,
      settlement_number: settlementNumber,
      merchant_id: merchantId,
      currency: 'KES',
      period_start: start.toISOString(),
      period_end: end.toISOString(),
      gross_order_value_minor: grossOrderValueMinor,
      commission_amount_minor: commissionAmountMinor,
      promotion_amount_minor: 0,
      refund_amount_minor: refundAmountMinor,
      adjustment_amount_minor: 0,
      net_settlement_amount_minor: Math.max(0, netSettlementAmountMinor),
      status: MerchantSettlementStatus.CALCULATED,
      calculated_by: calculatedByUserId || null,
      approved_by: null,
      approved_at: null,
      paid_at: null,
      payment_reference: null,
      failure_reason: null,
      created_at: new Date().toISOString(),
      lines,
    };

    return await this.repo.saveSettlement(settlement, lines);
  }

  /**
   * Approves a settlement for disbursement
   */
  public async approveSettlement(settlementId: string, approvedByUserId: string): Promise<MerchantSettlement> {
    const settlement = await this.repo.findSettlementById(settlementId);
    if (!settlement) {
      throw new Error(`Settlement not found: ${settlementId}`);
    }

    if (settlement.status !== MerchantSettlementStatus.CALCULATED && settlement.status !== MerchantSettlementStatus.DRAFT) {
      throw new Error(`Cannot approve settlement in status ${settlement.status}`);
    }

    // Maker-checker: the person who generated the settlement cannot also be the one who approves
    // it for disbursement. calculated_by is only ever populated when the calculating caller
    // supplied an actor id (older/system-generated settlements may have none on file); in that
    // case there is nothing to compare against, so this cannot retroactively block them.
    if (settlement.calculated_by && settlement.calculated_by === approvedByUserId) {
      throw new AppError(403, 'SELF_APPROVAL_NOT_ALLOWED', 'The user who calculated this settlement cannot also approve it');
    }

    settlement.status = MerchantSettlementStatus.APPROVED;
    settlement.approved_by = approvedByUserId;
    settlement.approved_at = new Date().toISOString();

    return await this.repo.saveSettlement(settlement, settlement.lines || []);
  }

  public async markProcessing(settlementId: string, initiatedByUserId: string): Promise<MerchantSettlement> {
    const settlement = await this.repo.findSettlementById(settlementId);
    if (!settlement) throw new Error(`Settlement not found: ${settlementId}`);
    if (settlement.status === MerchantSettlementStatus.PROCESSING) return settlement;
    if (settlement.status !== MerchantSettlementStatus.APPROVED) {
      throw new Error(`Cannot initiate settlement in status ${settlement.status}`);
    }
    settlement.status = MerchantSettlementStatus.PROCESSING;
    settlement.initiated_by = initiatedByUserId;
    settlement.processing_at = new Date().toISOString();
    settlement.failure_reason = null;
    settlement.failed_at = null;
    return this.repo.saveSettlement(settlement, settlement.lines || []);
  }

  public async confirmPaid(settlementId: string, paymentReference: string): Promise<MerchantSettlement> {
    const settlement = await this.repo.findSettlementById(settlementId);
    if (!settlement) throw new Error(`Settlement not found: ${settlementId}`);
    if (settlement.status === MerchantSettlementStatus.PAID) {
      if (settlement.payment_reference && settlement.payment_reference !== paymentReference) {
        throw new AppError(409, 'SETTLEMENT_REFERENCE_CONFLICT', 'Settlement is already paid with another provider reference');
      }
      return settlement;
    }
    if (settlement.status !== MerchantSettlementStatus.PROCESSING) {
      throw new Error(`Cannot confirm settlement paid from status ${settlement.status}`);
    }
    settlement.status = MerchantSettlementStatus.PAID;
    settlement.paid_at = new Date().toISOString();
    settlement.payment_reference = paymentReference;
    settlement.failure_reason = null;
    settlement.failed_at = null;
    await this.postingSvc.postMerchantSettlement(settlement);
    return this.repo.saveSettlement(settlement, settlement.lines || []);
  }

  /**
   * Executes payment of an approved settlement and posts to ledger
   */
  public async paySettlement(settlementId: string, paymentReference: string): Promise<MerchantSettlement> {
    requireSimulationMode();
    const settlement = await this.repo.findSettlementById(settlementId);
    if (!settlement) {
      throw new Error(`Settlement not found: ${settlementId}`);
    }

    if (settlement.status !== MerchantSettlementStatus.APPROVED) {
      throw new Error(`Cannot pay settlement in status ${settlement.status}. Must be APPROVED first.`);
    }

    settlement.status = MerchantSettlementStatus.PAID;
    settlement.paid_at = new Date().toISOString();
    settlement.payment_reference = paymentReference;

    // Post to double-entry ledger
    await this.postingSvc.postMerchantSettlement(settlement);

    const saved = await this.repo.saveSettlement(settlement, settlement.lines || []);

    logger.info('Merchant settlement paid and posted to ledger', {
      metadata: {
        settlementId,
        merchantId: settlement.merchant_id,
        netAmountMinor: settlement.net_settlement_amount_minor,
        reference: paymentReference,
      },
    });

    return saved;
  }

  /**
   * Marks a settlement as failed without losing merchant funds
   */
  public async failSettlement(settlementId: string, reason: string): Promise<MerchantSettlement> {
    const settlement = await this.repo.findSettlementById(settlementId);
    if (!settlement) {
      throw new Error(`Settlement not found: ${settlementId}`);
    }

    settlement.status = MerchantSettlementStatus.FAILED;
    settlement.failed_at = new Date().toISOString();
    settlement.failure_reason = reason;

    return await this.repo.saveSettlement(settlement, settlement.lines || []);
  }
}

export const settlementService = transactionalService(new SettlementService());
