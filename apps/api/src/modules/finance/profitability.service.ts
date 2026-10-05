import { transactionalService } from '../../db/transaction';
/**
 * DEETOO - Platform Profitability & Unit Economics Engine
 * Sprint 12: Materialized economics, contribution margin calculation, and cohort profitability
 */

import { ledgerRepository, LedgerRepository } from './ledger.repository';
import { ProfitabilityMetrics, OrderFinancialSummary } from '@deetoo/types';

export class ProfitabilityService {
  constructor(private repo: LedgerRepository = ledgerRepository) {}

  /**
   * Computes platform profitability metrics across all orders or filtered by merchant / date
   */
  public async getProfitabilityMetrics(options: {
    merchantId?: string;
    startDate?: string;
    endDate?: string;
  } = {}): Promise<ProfitabilityMetrics> {
    const allSummaries = await this.repo.getAllOrderSummaries();

    const filtered = allSummaries.filter((s) => {
      if (options.startDate && new Date(s.calculated_at) < new Date(options.startDate)) return false;
      if (options.endDate && new Date(s.calculated_at) > new Date(options.endDate)) return false;
      return true;
    });

    let gmvMinor = 0;
    let grossPlatformRevenueMinor = 0;
    let commissionRevenueMinor = 0;
    let deliveryRevenueMinor = 0;
    let serviceFeeRevenueMinor = 0;
    let riderCostsMinor = 0;
    let paymentProcessingCostsMinor = 0;
    let platformDiscountsMinor = 0;
    let refundCostsMinor = 0;
    let contributionProfitMinor = 0;
    let negativeMarginOrderCount = 0;

    for (const s of filtered) {
      gmvMinor += s.gmv_minor;
      grossPlatformRevenueMinor += s.gross_platform_revenue_minor;
      commissionRevenueMinor += s.commission_revenue_minor;
      deliveryRevenueMinor += s.delivery_revenue_minor;
      serviceFeeRevenueMinor += s.service_fee_revenue_minor;
      riderCostsMinor += s.rider_cost_minor;
      paymentProcessingCostsMinor += s.payment_processing_cost_minor;
      platformDiscountsMinor += s.platform_funded_discount_minor;
      refundCostsMinor += s.refund_cost_minor;
      contributionProfitMinor += s.contribution_profit_minor;

      if (s.is_negative_margin) {
        negativeMarginOrderCount++;
      }
    }

    const orderCount = filtered.length;
    const averageOrderValueMinor = orderCount > 0 ? Math.round(gmvMinor / orderCount) : 0;
    const averageContributionPerOrderMinor = orderCount > 0 ? Math.round(contributionProfitMinor / orderCount) : 0;
    const contributionMarginPct =
      grossPlatformRevenueMinor > 0
        ? parseFloat(((contributionProfitMinor / grossPlatformRevenueMinor) * 100).toFixed(2))
        : 0;

    return {
      gmv_minor: gmvMinor,
      gross_platform_revenue_minor: grossPlatformRevenueMinor,
      commission_revenue_minor: commissionRevenueMinor,
      delivery_revenue_minor: deliveryRevenueMinor,
      service_fee_revenue_minor: serviceFeeRevenueMinor,
      rider_costs_minor: riderCostsMinor,
      payment_processing_costs_minor: paymentProcessingCostsMinor,
      platform_discounts_minor: platformDiscountsMinor,
      refund_costs_minor: refundCostsMinor,
      contribution_profit_minor: contributionProfitMinor,
      contribution_margin_pct: contributionMarginPct,
      order_count: orderCount,
      average_order_value_minor: averageOrderValueMinor,
      average_contribution_per_order_minor: averageContributionPerOrderMinor,
      negative_margin_order_count: negativeMarginOrderCount,
    };
  }

  /**
   * Retrieves order financial summary by order ID
   */
  public async getOrderSummary(orderId: string): Promise<OrderFinancialSummary | null> {
    return await this.repo.findOrderSummary(orderId);
  }

  /**
   * Retrieves all order financial summaries
   */
  public async getAllOrderSummaries(): Promise<OrderFinancialSummary[]> {
    return await this.repo.getAllOrderSummaries();
  }
}

export const profitabilityService = transactionalService(new ProfitabilityService());
