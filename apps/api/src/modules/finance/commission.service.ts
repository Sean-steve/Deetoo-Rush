import { randomUUID } from 'node:crypto';
import { transactionalService } from '../../db/transaction';
/**
 * DEETOO - Merchant Commission Service
 * Sprint 12: Contractual Commission calculation, fee application, and merchant split logic
 */

import { ledgerRepository, LedgerRepository } from './ledger.repository';
import { MerchantCommissionRule } from '@deetoo/types';
import { logger } from '@deetoo/utils';

export interface OrderCommissionCalculation {
  merchantId: string;
  foodSubtotalMinor: number;
  commissionRate: number;
  fixedFeeMinor: number;
  commissionAmountMinor: number;
  merchantPayableMinor: number;
  ruleId: string;
}

export class CommissionService {
  constructor(private repo: LedgerRepository = ledgerRepository) {}

  /**
   * Calculates commission for an order
   */
  public async calculateOrderCommission(
    merchantId: string,
    foodSubtotalMinor: number,
    merchantFundedDiscountMinor = 0
  ): Promise<OrderCommissionCalculation> {
    const rule = await this.repo.getCommissionRuleForMerchant(merchantId);

    // Commission = Round(FoodSubtotal * Rate) + FixedFee
    const rateBps = Math.round(rule.percentage_rate * 10000);
    const percentagePart = Number((BigInt(foodSubtotalMinor) * BigInt(rateBps) + 5000n) / 10000n);
    const commissionAmountMinor = Math.min(Math.max(0,foodSubtotalMinor-merchantFundedDiscountMinor), percentagePart + rule.fixed_fee_minor);

    // Merchant Payable = Food Subtotal - Commission - Merchant Funded Discount
    const merchantPayableMinor = Math.max(0, foodSubtotalMinor - commissionAmountMinor - merchantFundedDiscountMinor);

    logger.debug('Calculated merchant commission for order', {
      metadata: {
        merchantId,
        foodSubtotalMinor,
        commissionRate: rule.percentage_rate,
        commissionAmountMinor,
        merchantPayableMinor,
      },
    });

    return {
      merchantId,
      foodSubtotalMinor,
      commissionRate: rule.percentage_rate,
      fixedFeeMinor: rule.fixed_fee_minor,
      commissionAmountMinor,
      merchantPayableMinor,
      ruleId: rule.id,
    };
  }

  /**
   * Sets or updates custom merchant commission rule
   */
  public async setMerchantCommissionRule(
    merchantId: string,
    percentageRate: number,
    fixedFeeMinor = 0,
    effectiveFrom = new Date().toISOString()
  ): Promise<MerchantCommissionRule> {
    if (percentageRate < 0 || percentageRate > 1) {
      throw new Error(`Invalid commission rate: ${percentageRate}. Must be between 0.00 and 1.00`);
    }

    const rule: MerchantCommissionRule = {
      id: randomUUID(),
      merchant_id: merchantId,
      percentage_rate: percentageRate,
      fixed_fee_minor: fixedFeeMinor,
      effective_from: effectiveFrom,
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
    };

    return await this.repo.saveCommissionRule(rule);
  }
}

export const commissionService = transactionalService(new CommissionService());
