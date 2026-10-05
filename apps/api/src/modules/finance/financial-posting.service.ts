import { config } from '@deetoo/config';
import { one } from '../../db/adapter';
import { AppError } from '../../middleware/error-handler';
import { lockCommand } from '../cart/quote-binding';
import { transactionalService } from '../../db/transaction';
/**
 * DEETOO - Authoritative Financial Posting Service
 * Sprint 12: Core Double-Entry Ledger Posting Engine, Economics Allocation, Reversals, and Materialized Economics
 */

import { ledgerRepository, LedgerRepository } from './ledger.repository';
import { commissionService, CommissionService } from './commission.service';
import {
  LedgerAccountType,
  LedgerAccountOwnerType,
  LedgerEntryDirection,
  LedgerTransactionType,
  Payment,
  Order,
  Refund,
  RiderEarning,
  MerchantSettlement,
  RiderPayout,
  FinancialAdjustment,
  OrderFinancialSummary,
} from '@deetoo/types';
import { logger } from '@deetoo/utils';

export class FinancialPostingService {
  // Typical payment gateway processing fee: 1.5% + KES 5 or similar, let's use 1.5% as standard baseline
  private readonly PAYMENT_GATEWAY_FEE_RATE = 0.015;

  constructor(
    private repo: LedgerRepository = ledgerRepository,
    private commissionSvc: CommissionService = commissionService
  ) {}

  /**
   * Posts financial ledger entries when a payment is captured.
   * Allocates food revenue, commission, delivery fee, service fee, discounts.
   * Ensures debits === credits.
   */
  public async postPaymentCapture(
    payment: Payment,
    order: {
      id: string;
      order_number?: string;
      merchant_id?: string;
      pricing_snapshot?: Order['pricing_snapshot'];
      pricing?: {
        items_subtotal_minor?: number;
        subtotal_minor?: number;
        delivery_fee_minor?: number;
        service_fee_minor?: number;
        discount_minor?: number;
        total_minor?: number;
      };
      delivery_fee_minor?: number;
      service_fee_minor?: number;
      total_amount_minor?: number;
    }
  ): Promise<OrderFinancialSummary> {
    if (!order.merchant_id) {
      throw new AppError(500, 'ORDER_MERCHANT_MISSING', 'Cannot post order economics without a merchant_id: settlement attribution would be lost');
    }
    const idempotencyKey = `payment.captured:${payment.id}`;

    await lockCommand(`capture-ledger:${payment.id}`);
    if(config.storage.mode==='postgres' && !await one('SELECT payment_id FROM payment_capture_evidence WHERE payment_id=$1 AND amount_minor=$2 AND currency=$3',[payment.id,payment.captured_minor,payment.currency]))throw new AppError(409,'PAYMENT_NOT_VERIFIED','Ledger capture requires durable verification evidence');
    const existing = await this.repo.findTransactionByIdempotencyKey(idempotencyKey);
    if (existing) {
      const summary = await this.repo.findOrderSummary(order.id);
      if (!summary) throw new Error('Capture posting exists without its financial summary');
      return summary;
    }
    const priorSummary = await this.repo.findOrderSummary(order.id);
    const {paymentRepository: capturePayments} = await import('../payment/payment.repository');
    const otherCaptured = (await capturePayments.findPaymentsByOrderId(order.id)).some(p=>p.id!==payment.id&&p.captured_minor>0);
    if (priorSummary && otherCaptured) {
      // A separate attempt captured after this order was already funded. Recognize
      // the extra receivable and a customer liability, never duplicate merchant economics.
      const funds=await this.repo.getOrCreateAccount(LedgerAccountType.CUSTOMER_FUNDS_CLEARING,LedgerAccountOwnerType.SYSTEM,null,payment.currency);
      const liability=await this.repo.getOrCreateAccount(LedgerAccountType.CUSTOMER_REFUND_PAYABLE,LedgerAccountOwnerType.CUSTOMER,payment.customer_id,payment.currency);
      await this.repo.postTransaction({transaction_type:LedgerTransactionType.PAYMENT_CAPTURED,reference_type:'PAYMENT',reference_id:payment.id,idempotency_key:idempotencyKey,currency:payment.currency,description:'Duplicate capture reserved for customer refund',total_amount_minor:payment.captured_minor,effective_at:payment.captured_at!},[
        {accountId:funds.id,accountType:funds.account_type,direction:LedgerEntryDirection.DEBIT,amountMinor:payment.captured_minor},
        {accountId:liability.id,accountType:liability.account_type,direction:LedgerEntryDirection.CREDIT,amountMinor:payment.captured_minor},
      ]);
      return priorSummary;
    }
    const pricing = order.pricing_snapshot;
    const frozen = pricing?.financial_snapshot;
    if (!pricing || !frozen || !order.merchant_id) throw new AppError(409, 'UNBOUND_ORDER_PRICING', 'Frozen pricing and merchant identity are required for capture posting');
    const foodSubtotal = pricing.gross_subtotal_minor;
    const deliveryRevenue = frozen.gross_delivery_fee_minor;
    const serviceFeeRevenue = pricing.service_fee_minor;
    const platformDiscount = frozen.platform_funded_minor;
    const merchantDiscount = frozen.merchant_funded_minor;
    const customerPaid = payment.captured_minor;
    const merchantId = order.merchant_id;
    const commCalc = frozen.commission;
    const commissionRevenue = commCalc.commissionAmountMinor;
    const merchantPayable = commCalc.merchantPayableMinor;
    const processorFeeMinor = 0; // Recognize actual fees only from provider evidence, never estimates.
    const amounts = [foodSubtotal,deliveryRevenue,serviceFeeRevenue,platformDiscount,merchantDiscount,customerPaid,commissionRevenue,merchantPayable];
    if (amounts.some(n => !Number.isSafeInteger(n) || n < 0) || pricing.tax_minor !== 0 ||
      customerPaid !== payment.amount_minor || customerPaid !== pricing.total_minor || pricing.currency !== payment.currency ||
      merchantDiscount + platformDiscount !== pricing.discount_minor ||
      merchantPayable + commissionRevenue !== foodSubtotal - merchantDiscount ||
      customerPaid + platformDiscount !== merchantPayable + commissionRevenue + deliveryRevenue + serviceFeeRevenue) {
      throw new AppError(409, 'CAPTURE_ECONOMICS_MISMATCH', 'Verified capture does not balance against frozen pricing');
    }

    // Retrieve or create ledger accounts
    const customerFundsAcc = await this.repo.getOrCreateAccount(
      LedgerAccountType.CUSTOMER_FUNDS_CLEARING,
      LedgerAccountOwnerType.SYSTEM,
      null,
      payment.currency
    );

    const platformPromoAcc = await this.repo.getOrCreateAccount(
      LedgerAccountType.PROMOTION_EXPENSE_PLATFORM,
      LedgerAccountOwnerType.PLATFORM,
      null,
      payment.currency
    );

    const merchantPayableAcc = await this.repo.getOrCreateAccount(
      LedgerAccountType.MERCHANT_PAYABLE,
      LedgerAccountOwnerType.MERCHANT,
      merchantId,
      payment.currency
    );

    const platformCommAcc = await this.repo.getOrCreateAccount(
      LedgerAccountType.PLATFORM_COMMISSION_REVENUE,
      LedgerAccountOwnerType.PLATFORM,
      null,
      payment.currency
    );

    const platformDeliveryAcc = await this.repo.getOrCreateAccount(
      LedgerAccountType.PLATFORM_DELIVERY_REVENUE,
      LedgerAccountOwnerType.PLATFORM,
      null,
      payment.currency
    );

    const platformServiceFeeAcc = await this.repo.getOrCreateAccount(
      LedgerAccountType.PLATFORM_SERVICE_FEE_REVENUE,
      LedgerAccountOwnerType.PLATFORM,
      null,
      payment.currency
    );

    // Prepare double-entry entries
    // Total Debits: customerPaid + platformDiscount
    // Total Credits: merchantPayable + commissionRevenue + deliveryRevenue + serviceFeeRevenue
    const entriesData: Array<{
      accountId: string;
      accountType: LedgerAccountType;
      direction: LedgerEntryDirection;
      amountMinor: number;
      description?: string;
    }> = [];

    // Debit customer funds clearing
    if (customerPaid > 0) {
      entriesData.push({
        accountId: customerFundsAcc.id,
        accountType: LedgerAccountType.CUSTOMER_FUNDS_CLEARING,
        direction: LedgerEntryDirection.DEBIT,
        amountMinor: customerPaid,
        description: `Customer payment captured for order ${order.order_number || order.id}`,
      });
    }

    // Debit platform promo expense if discount was granted
    if (platformDiscount > 0) {
      entriesData.push({
        accountId: platformPromoAcc.id,
        accountType: LedgerAccountType.PROMOTION_EXPENSE_PLATFORM,
        direction: LedgerEntryDirection.DEBIT,
        amountMinor: platformDiscount,
        description: `Platform discount subsidy for order ${order.order_number || order.id}`,
      });
    }

    // Credit merchant payable
    if (merchantPayable > 0) {
      entriesData.push({
        accountId: merchantPayableAcc.id,
        accountType: LedgerAccountType.MERCHANT_PAYABLE,
        direction: LedgerEntryDirection.CREDIT,
        amountMinor: merchantPayable,
        description: `Merchant food earnings for order ${order.order_number || order.id}`,
      });
    }

    // Credit platform commission
    if (commissionRevenue > 0) {
      entriesData.push({
        accountId: platformCommAcc.id,
        accountType: LedgerAccountType.PLATFORM_COMMISSION_REVENUE,
        direction: LedgerEntryDirection.CREDIT,
        amountMinor: commissionRevenue,
        description: `Platform commission (${(commCalc.commissionRate * 100).toFixed(1)}%) for order ${order.order_number || order.id}`,
      });
    }

    // Credit delivery revenue
    if (deliveryRevenue > 0) {
      entriesData.push({
        accountId: platformDeliveryAcc.id,
        accountType: LedgerAccountType.PLATFORM_DELIVERY_REVENUE,
        direction: LedgerEntryDirection.CREDIT,
        amountMinor: deliveryRevenue,
        description: `Customer delivery fee revenue for order ${order.order_number || order.id}`,
      });
    }

    // Credit service fee revenue
    if (serviceFeeRevenue > 0) {
      entriesData.push({
        accountId: platformServiceFeeAcc.id,
        accountType: LedgerAccountType.PLATFORM_SERVICE_FEE_REVENUE,
        direction: LedgerEntryDirection.CREDIT,
        amountMinor: serviceFeeRevenue,
        description: `Platform service fee revenue for order ${order.order_number || order.id}`,
      });
    }

    // Post to double-entry ledger
    await this.repo.postTransaction(
      {
        transaction_type: LedgerTransactionType.PAYMENT_CAPTURED,
        reference_type: 'PAYMENT',
        reference_id: payment.id,
        idempotency_key: idempotencyKey,
        currency: payment.currency,
        description: `Payment captured and order economics posted for ${order.order_number || order.id}`,
        total_amount_minor: customerPaid + platformDiscount,
        effective_at: payment.captured_at || new Date().toISOString(),
      },
      entriesData
    );

    // Calculate contribution economics
    const gmvMinor = foodSubtotal + deliveryRevenue + serviceFeeRevenue;
    const grossPlatformRevenue = commissionRevenue + deliveryRevenue + serviceFeeRevenue;
    const initialContributionProfit = grossPlatformRevenue - processorFeeMinor - platformDiscount;
    const contributionMarginPct =
      grossPlatformRevenue > 0
        ? parseFloat(((initialContributionProfit / grossPlatformRevenue) * 100).toFixed(2))
        : 0;

    const summary: OrderFinancialSummary = {
      order_id: order.id,
      order_number: order.order_number || `ORD-${order.id.substring(0, 8).toUpperCase()}`,
      merchant_id: order.merchant_id,
      currency: payment.currency,
      gmv_minor: gmvMinor,
      food_subtotal_minor: foodSubtotal,
      commission_rate: commCalc.commissionRate,
      commission_revenue_minor: commissionRevenue,
      delivery_revenue_minor: deliveryRevenue,
      service_fee_revenue_minor: serviceFeeRevenue,
      gross_platform_revenue_minor: grossPlatformRevenue,
      rider_cost_minor: 0, // updated when delivery finishes
      payment_processing_cost_minor: processorFeeMinor,
      platform_funded_discount_minor: platformDiscount,
      merchant_funded_discount_minor: merchantDiscount,
      refund_cost_minor: 0,
      contribution_profit_minor: initialContributionProfit,
      contribution_margin_pct: contributionMarginPct,
      merchant_payable_minor: merchantPayable,
      is_negative_margin: initialContributionProfit < 0,
      calculated_at: new Date().toISOString(),
    };

    return await this.repo.saveOrderSummary(summary);
  }

  /**
   * Posts financial ledger entries when a refund is processed.
   * Handles merchant clawback or platform goodwill absorption.
   */
  public async postRefundReversal(
    refund: Refund,
    options: {
      merchantId?: string;
      isMerchantFault?: boolean;
    } = {}
  ): Promise<void> {
    const idempotencyKey = `refund.succeeded:${refund.id}`;
    await lockCommand(`refund-ledger:${refund.id}`);
    if (await this.repo.findTransactionByIdempotencyKey(idempotencyKey)) return;
    const {paymentRepository} = await import('../payment/payment.repository');
    const payment = await paymentRepository.findPaymentById(refund.payment_id);
    if (!payment || payment.captured_minor <= 0 || payment.refunded_minor + refund.amount_minor > payment.captured_minor) throw new Error('Invalid refund capture basis');
    const capture = await this.repo.findTransactionByIdempotencyKey(`payment.captured:${payment.id}`);
    if (!capture) throw new Error('Capture ledger transaction missing');
    const original = await this.repo.findEntriesByTransactionId(capture.id);
    const previous = payment.refunded_minor;
    const cumulative = previous + refund.amount_minor;
    const delta = (amount:number) => Number(BigInt(amount)*BigInt(cumulative)/BigInt(payment.captured_minor)-BigInt(amount)*BigInt(previous)/BigInt(payment.captured_minor));
    const entriesData = original.map(e=>({accountId:e.account_id,accountType:e.account_type,
      direction:e.direction===LedgerEntryDirection.DEBIT?LedgerEntryDirection.CREDIT:LedgerEntryDirection.DEBIT,
      amountMinor:delta(e.amount_minor),description:`Reversal of capture entry ${e.id}`})).filter(e=>e.amountMinor>0);
    // Independent integer floors can differ by a few minor units on a partial refund.
    // A traceable rounding adjustment cancels cumulatively on the full reversal.
    const balance = entriesData.reduce((sum,e)=>sum+(e.direction===LedgerEntryDirection.DEBIT?e.amountMinor:-e.amountMinor),0);
    if(balance){
      const rounding = await this.repo.getOrCreateAccount(LedgerAccountType.REFUND_EXPENSE_PLATFORM,LedgerAccountOwnerType.PLATFORM,null,refund.currency);
      entriesData.push({accountId:rounding.id,accountType:LedgerAccountType.REFUND_EXPENSE_PLATFORM,direction:balance>0?LedgerEntryDirection.CREDIT:LedgerEntryDirection.DEBIT,amountMinor:Math.abs(balance),description:'Cumulative partial-refund integer rounding'});
    }
    await this.repo.postTransaction({transaction_type:LedgerTransactionType.REFUND_REVERSAL,reference_type:'REFUND',reference_id:refund.id,idempotency_key:idempotencyKey,currency:refund.currency,description:`Frozen capture allocation reversal for ${refund.order_id}`,total_amount_minor:entriesData.filter(e=>e.direction===LedgerEntryDirection.DEBIT).reduce((s,e)=>s+e.amountMinor,0),effective_at:new Date().toISOString()},entriesData);
    const summary = await this.repo.findOrderSummary(refund.order_id);
    if(!summary)throw new Error('Capture financial summary missing');
    const reversalFor=(type:LedgerAccountType)=>original.filter(e=>e.account_type===type).reduce((s,e)=>s+delta(e.amount_minor),0);
    summary.merchant_payable_minor-=reversalFor(LedgerAccountType.MERCHANT_PAYABLE);
    summary.commission_revenue_minor-=reversalFor(LedgerAccountType.PLATFORM_COMMISSION_REVENUE);
    summary.delivery_revenue_minor-=reversalFor(LedgerAccountType.PLATFORM_DELIVERY_REVENUE);
    summary.service_fee_revenue_minor-=reversalFor(LedgerAccountType.PLATFORM_SERVICE_FEE_REVENUE);
    summary.platform_funded_discount_minor-=reversalFor(LedgerAccountType.PROMOTION_EXPENSE_PLATFORM);
    summary.gross_platform_revenue_minor=summary.commission_revenue_minor+summary.delivery_revenue_minor+summary.service_fee_revenue_minor;
    summary.refund_cost_minor-=balance;
    summary.contribution_profit_minor=summary.gross_platform_revenue_minor-summary.platform_funded_discount_minor-summary.rider_cost_minor-summary.payment_processing_cost_minor-summary.refund_cost_minor;
    summary.contribution_margin_pct=summary.gross_platform_revenue_minor?100*summary.contribution_profit_minor/summary.gross_platform_revenue_minor:0;
    summary.is_negative_margin=summary.contribution_profit_minor<0;
    await this.repo.saveOrderSummary(summary);
  }

  /**
   * Posts rider earnings to ledger when a delivery is completed.
   * Debits RIDER_DELIVERY_EXPENSE, credits RIDER_PAYABLE.
   */
  public async postRiderEarning(earning: RiderEarning): Promise<void> {
    const idempotencyKey = `delivery.delivered:${earning.delivery_id}`;

    const riderExpenseAcc = await this.repo.getOrCreateAccount(
      LedgerAccountType.RIDER_DELIVERY_EXPENSE,
      LedgerAccountOwnerType.PLATFORM,
      null,
      earning.currency
    );

    const riderPayableAcc = await this.repo.getOrCreateAccount(
      LedgerAccountType.RIDER_PAYABLE,
      LedgerAccountOwnerType.RIDER,
      earning.rider_id,
      earning.currency
    );

    const entriesData = [
      {
        accountId: riderExpenseAcc.id,
        accountType: LedgerAccountType.RIDER_DELIVERY_EXPENSE,
        direction: LedgerEntryDirection.DEBIT,
        amountMinor: earning.total_amount_minor,
        description: `Fulfillment courier expense for delivery ${earning.delivery_id}`,
      },
      {
        accountId: riderPayableAcc.id,
        accountType: LedgerAccountType.RIDER_PAYABLE,
        direction: LedgerEntryDirection.CREDIT,
        amountMinor: earning.total_amount_minor,
        description: `Courier earnings credit for delivery ${earning.delivery_id}`,
      },
    ];

    await this.repo.postTransaction(
      {
        transaction_type: LedgerTransactionType.RIDER_EARNING,
        reference_type: 'DELIVERY',
        reference_id: earning.delivery_id,
        idempotency_key: idempotencyKey,
        currency: earning.currency,
        description: `Rider earnings posted for delivery ${earning.delivery_id}`,
        total_amount_minor: earning.total_amount_minor,
        effective_at: earning.created_at,
      },
      entriesData
    );

    // Update order financial summary with rider fulfillment cost
    const summary = await this.repo.findOrderSummary(earning.order_id);
    if (summary) {
      summary.rider_cost_minor = earning.total_amount_minor;
      summary.contribution_profit_minor =
        summary.gross_platform_revenue_minor -
        summary.rider_cost_minor -
        summary.payment_processing_cost_minor -
        summary.platform_funded_discount_minor -
        summary.refund_cost_minor;

      summary.contribution_margin_pct =
        summary.gross_platform_revenue_minor > 0
          ? parseFloat(((summary.contribution_profit_minor / summary.gross_platform_revenue_minor) * 100).toFixed(2))
          : 0;

      summary.is_negative_margin = summary.contribution_profit_minor < 0;
      summary.calculated_at = new Date().toISOString();
      await this.repo.saveOrderSummary(summary);
    }
  }

  /**
   * Posts merchant settlement to ledger when settlement is executed/paid.
   * Debits MERCHANT_PAYABLE, credits SETTLEMENT_CLEARING.
   */
  public async postMerchantSettlement(settlement: MerchantSettlement): Promise<void> {
    const idempotencyKey = `merchant.settlement:${settlement.id}`;

    const merchantPayableAcc = await this.repo.getOrCreateAccount(
      LedgerAccountType.MERCHANT_PAYABLE,
      LedgerAccountOwnerType.MERCHANT,
      settlement.merchant_id,
      settlement.currency
    );

    const settlementClearingAcc = await this.repo.getOrCreateAccount(
      LedgerAccountType.SETTLEMENT_CLEARING,
      LedgerAccountOwnerType.SYSTEM,
      null,
      settlement.currency
    );

    const entriesData = [
      {
        accountId: merchantPayableAcc.id,
        accountType: LedgerAccountType.MERCHANT_PAYABLE,
        direction: LedgerEntryDirection.DEBIT,
        amountMinor: settlement.net_settlement_amount_minor,
        description: `Settlement payout debited against merchant payable: ${settlement.settlement_number}`,
      },
      {
        accountId: settlementClearingAcc.id,
        accountType: LedgerAccountType.SETTLEMENT_CLEARING,
        direction: LedgerEntryDirection.CREDIT,
        amountMinor: settlement.net_settlement_amount_minor,
        description: `Outbound bank settlement clearing: ${settlement.settlement_number}`,
      },
    ];

    await this.repo.postTransaction(
      {
        transaction_type: LedgerTransactionType.MERCHANT_SETTLEMENT,
        reference_type: 'SETTLEMENT',
        reference_id: settlement.id,
        idempotency_key: idempotencyKey,
        currency: settlement.currency,
        description: `Settlement execution for merchant ${settlement.merchant_id}: ${settlement.settlement_number}`,
        total_amount_minor: settlement.net_settlement_amount_minor,
        effective_at: settlement.paid_at || new Date().toISOString(),
      },
      entriesData
    );
  }

  /**
   * Posts rider payout to ledger when payout is executed/paid.
   * Debits RIDER_PAYABLE, credits RIDER_PAYOUT_CLEARING.
   */
  public async postRiderPayout(payout: RiderPayout): Promise<void> {
    const idempotencyKey = `rider.payout:${payout.id}`;

    const riderPayableAcc = await this.repo.getOrCreateAccount(
      LedgerAccountType.RIDER_PAYABLE,
      LedgerAccountOwnerType.RIDER,
      payout.rider_id,
      payout.currency
    );

    const payoutClearingAcc = await this.repo.getOrCreateAccount(
      LedgerAccountType.RIDER_PAYOUT_CLEARING,
      LedgerAccountOwnerType.SYSTEM,
      null,
      payout.currency
    );

    const entriesData = [
      {
        accountId: riderPayableAcc.id,
        accountType: LedgerAccountType.RIDER_PAYABLE,
        direction: LedgerEntryDirection.DEBIT,
        amountMinor: payout.amount_minor,
        description: `Rider payout debit: ${payout.payout_number}`,
      },
      {
        accountId: payoutClearingAcc.id,
        accountType: LedgerAccountType.RIDER_PAYOUT_CLEARING,
        direction: LedgerEntryDirection.CREDIT,
        amountMinor: payout.amount_minor,
        description: `Outbound M-PESA B2C payout clearing: ${payout.payout_number}`,
      },
    ];

    await this.repo.postTransaction(
      {
        transaction_type: LedgerTransactionType.RIDER_PAYOUT,
        reference_type: 'PAYOUT',
        reference_id: payout.id,
        idempotency_key: idempotencyKey,
        currency: payout.currency,
        description: `Payout execution for rider ${payout.rider_id}: ${payout.payout_number}`,
        total_amount_minor: payout.amount_minor,
        effective_at: payout.paid_at || new Date().toISOString(),
      },
      entriesData
    );
  }

  /**
   * Posts a manual financial adjustment between two ledger accounts
   */
  public async postFinancialAdjustment(adj: FinancialAdjustment): Promise<void> {
    const idempotencyKey = `finance.adjustment:${adj.id}`;

    const entriesData = [
      {
        accountId: adj.target_account_id,
        direction: adj.direction,
        amountMinor: adj.amount_minor,
        description: `Adjustment (${adj.reason_code}): ${adj.note}`,
      },
      {
        accountId: adj.offset_account_id,
        direction: adj.direction === LedgerEntryDirection.DEBIT ? LedgerEntryDirection.CREDIT : LedgerEntryDirection.DEBIT,
        amountMinor: adj.amount_minor,
        description: `Offset adjustment (${adj.reason_code}): ${adj.note}`,
      },
    ];

    const result = await this.repo.postTransaction(
      {
        transaction_type: LedgerTransactionType.FINANCIAL_ADJUSTMENT,
        reference_type: 'ADJUSTMENT',
        reference_id: adj.id,
        idempotency_key: idempotencyKey,
        currency: adj.currency,
        description: `Financial adjustment: ${adj.note}`,
        total_amount_minor: adj.amount_minor,
        effective_at: new Date().toISOString(),
      },
      entriesData
    );

    adj.ledger_transaction_id = result.transaction.id;
    await this.repo.saveAdjustment(adj);
  }
}

export const financialPostingService = transactionalService(new FinancialPostingService());
