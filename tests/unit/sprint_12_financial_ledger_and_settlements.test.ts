import { freezeFixtureEconomics } from '../helpers/paid-order';
import { paymentRepository } from '../../apps/api/src/modules/payment/payment.repository';
/**
 * DEETOO - Sprint 12 Unit & Integration Tests
 * Financial Ledger, Merchant Settlements, Rider Earnings & Payouts, Platform Profitability & Reconciliation
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  LedgerAccountType,
  LedgerAccountOwnerType,
  LedgerEntryDirection,
  LedgerTransactionType,
  PaymentStatus,
  PaymentMethod,
  PaymentProvider,
  RefundStatus,
  RefundReasonCode,
  MerchantSettlementStatus,
  RiderPayoutStatus,
  RiderEarningStatus,
} from '@deetoo/types';
import { ledgerRepository } from '../../apps/api/src/modules/finance/ledger.repository';
import { commissionService } from '../../apps/api/src/modules/finance/commission.service';
import { riderEarningsService } from '../../apps/api/src/modules/finance/rider-earnings.service';
import { financialPostingService } from '../../apps/api/src/modules/finance/financial-posting.service';
import { settlementService } from '../../apps/api/src/modules/finance/settlement.service';
import { riderPayoutService } from '../../apps/api/src/modules/finance/rider-payout.service';
import { profitabilityService } from '../../apps/api/src/modules/finance/profitability.service';
import { reconciliationService } from '../../apps/api/src/modules/finance/reconciliation.service';

describe('Sprint 12: Financial Ledger, Settlements, Rider Earnings & Profitability', () => {
  const testMerchantId = 'merch_westlands_s12';
  const testRiderId = 'rider_kilimani_s12';

  beforeEach(() => {
    ledgerRepository.clearInMemory();
  });

  // ==========================================================================
  // 1. Double-Entry Balance Invariant & Immutability
  // ==========================================================================
  describe('Double-Entry Balance Invariant', () => {
    test('strictly enforces total debits === total credits', async () => {
      const acc1 = await ledgerRepository.getOrCreateAccount(
        LedgerAccountType.CUSTOMER_FUNDS_CLEARING,
        LedgerAccountOwnerType.SYSTEM,
        null,
        'KES'
      );
      const acc2 = await ledgerRepository.getOrCreateAccount(
        LedgerAccountType.PLATFORM_COMMISSION_REVENUE,
        LedgerAccountOwnerType.PLATFORM,
        null,
        'KES'
      );

      // Unbalanced transaction: Debit 10,000, Credit 9,000
      await assert.rejects(
        async () => {
          await ledgerRepository.postTransaction(
            {
              transaction_type: LedgerTransactionType.PAYMENT_CAPTURED,
              reference_type: 'PAYMENT',
              reference_id: 'pay_unbalanced_test',
              idempotency_key: 'test:unbalanced:01',
              currency: 'KES',
              description: 'Unbalanced posting attempt',
              total_amount_minor: 10000,
              effective_at: new Date().toISOString(),
            },
            [
              {
                accountId: acc1.id,
                accountType: LedgerAccountType.CUSTOMER_FUNDS_CLEARING,
                direction: LedgerEntryDirection.DEBIT,
                amountMinor: 10000,
              },
              {
                accountId: acc2.id,
                accountType: LedgerAccountType.PLATFORM_COMMISSION_REVENUE,
                direction: LedgerEntryDirection.CREDIT,
                amountMinor: 9000,
              },
            ]
          );
        },
        /Unbalanced double-entry transaction/
      );
    });

    test('accepts perfectly balanced transaction and derives correct account balances', async () => {
      const assetAcc = await ledgerRepository.getOrCreateAccount(
        LedgerAccountType.CUSTOMER_FUNDS_CLEARING,
        LedgerAccountOwnerType.SYSTEM,
        null,
        'KES'
      );
      const revAcc = await ledgerRepository.getOrCreateAccount(
        LedgerAccountType.PLATFORM_COMMISSION_REVENUE,
        LedgerAccountOwnerType.PLATFORM,
        null,
        'KES'
      );

      const res = await ledgerRepository.postTransaction(
        {
          transaction_type: LedgerTransactionType.PAYMENT_CAPTURED,
          reference_type: 'PAYMENT',
          reference_id: 'pay_balanced_01',
          idempotency_key: 'test:balanced:01',
          currency: 'KES',
          description: 'Balanced test posting',
          total_amount_minor: 15000,
          effective_at: new Date().toISOString(),
        },
        [
          {
            accountId: assetAcc.id,
            accountType: LedgerAccountType.CUSTOMER_FUNDS_CLEARING,
            direction: LedgerEntryDirection.DEBIT,
            amountMinor: 15000,
          },
          {
            accountId: revAcc.id,
            accountType: LedgerAccountType.PLATFORM_COMMISSION_REVENUE,
            direction: LedgerEntryDirection.CREDIT,
            amountMinor: 15000,
          },
        ]
      );

      assert.equal(res.transaction.status, 'POSTED');
      assert.equal(res.entries.length, 2);

      // Verify asset balance: Debits - Credits = 15,000
      const assetBal = await ledgerRepository.recalculateAccountBalance(assetAcc.id);
      assert.equal(assetBal, 15000);

      // Verify revenue balance: Credits - Debits = 15,000
      const revBal = await ledgerRepository.recalculateAccountBalance(revAcc.id);
      assert.equal(revBal, 15000);
    });

    test('enforces idempotency on duplicate transaction keys', async () => {
      const acc1 = await ledgerRepository.getOrCreateAccount(
        LedgerAccountType.CUSTOMER_FUNDS_CLEARING,
        LedgerAccountOwnerType.SYSTEM,
        null,
        'KES'
      );
      const acc2 = await ledgerRepository.getOrCreateAccount(
        LedgerAccountType.PLATFORM_SERVICE_FEE_REVENUE,
        LedgerAccountOwnerType.PLATFORM,
        null,
        'KES'
      );

      const params = {
        transaction_type: LedgerTransactionType.PAYMENT_CAPTURED,
        reference_type: 'PAYMENT',
        reference_id: 'pay_idem_01',
        idempotency_key: 'test:idem:key123',
        currency: 'KES',
        description: 'Idempotency test',
        total_amount_minor: 5000,
        effective_at: new Date().toISOString(),
      };
      const entries = [
        {
          accountId: acc1.id,
          direction: LedgerEntryDirection.DEBIT,
          amountMinor: 5000,
        },
        {
          accountId: acc2.id,
          direction: LedgerEntryDirection.CREDIT,
          amountMinor: 5000,
        },
      ];

      const first = await ledgerRepository.postTransaction(params, entries);
      const second = await ledgerRepository.postTransaction(params, entries);

      assert.equal(first.transaction.id, second.transaction.id);
      // Account balance should only reflect 1 transaction (5,000, not 10,000)
      const bal = await ledgerRepository.recalculateAccountBalance(acc2.id);
      assert.equal(bal, 5000);
    });
  });

  // ==========================================================================
  // 2. Merchant Commission & Pricing Split
  // ==========================================================================
  describe('Merchant Commission Service', () => {
    test('calculates 20% commission on food subtotal correctly', async () => {
      const foodSubtotal = 100000; // KES 1,000.00
      const calc = await commissionService.calculateOrderCommission(testMerchantId, foodSubtotal, 0);

      // Default rate: 20%
      assert.equal(calc.commissionRate, 0.2);
      assert.equal(calc.commissionAmountMinor, 20000); // KES 200.00
      assert.equal(calc.merchantPayableMinor, 80000); // KES 800.00
    });

    test('supports custom merchant commission rule', async () => {
      await commissionService.setMerchantCommissionRule(testMerchantId, 0.15, 2000); // 15% + KES 20.00
      const foodSubtotal = 200000; // KES 2,000.00
      const calc = await commissionService.calculateOrderCommission(testMerchantId, foodSubtotal, 0);

      // 15% of 2,000.00 = 300.00 + 20.00 fixed = 320.00 = 32,000 minor
      assert.equal(calc.commissionRate, 0.15);
      assert.equal(calc.commissionAmountMinor, 32000);
      assert.equal(calc.merchantPayableMinor, 168000);
    });
  });

  // ==========================================================================
  // 3. Payment Capture & Order Economics Posting
  // ==========================================================================
  describe('Payment Capture Financial Posting', () => {
    test('posts comprehensive double-entry economics on payment capture', async () => {
      // Order: Food = KES 1,200.00, Delivery = KES 250.00, Service Fee = KES 50.00, Total = KES 1,500.00
      const payment = {
        id: 'pay_s12_ord01',
        order_id: 'ord_s12_01',
        customer_id: 'cust_01',
        amount_minor: 150000,
        currency: 'KES',
        method: PaymentMethod.MPESA,
        provider: PaymentProvider.SAFARICOM_MPESA,
        status: PaymentStatus.CAPTURED,
        captured_minor: 150000,
        refunded_minor: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const order = {
        id: 'ord_s12_01',
        order_number: 'ORD-2026-S12-01',
        merchant_id: testMerchantId,
        pricing: {
          items_subtotal_minor: 120000,
          delivery_fee_minor: 25000,
          service_fee_minor: 5000,
          discount_minor: 0,
          total_minor: 150000,
        },
      };

      Object.assign(order,{currency:'KES',total_minor:150000,delivery_fee_minor:25000,service_fee_minor:5000});
      await freezeFixtureEconomics(order as any);
      await paymentRepository.savePayment(payment);
      const summary = await financialPostingService.postPaymentCapture(payment, order);

      assert.equal(summary.order_id, order.id);
      assert.equal(summary.food_subtotal_minor, 120000);
      assert.equal(summary.commission_revenue_minor, 24000); // 20% of 120,000
      assert.equal(summary.delivery_revenue_minor, 25000);
      assert.equal(summary.service_fee_revenue_minor, 5000);
      assert.equal(summary.gross_platform_revenue_minor, 54000); // 24,000 + 25,000 + 5,000
      assert.equal(summary.merchant_payable_minor, 96000); // 120,000 - 24,000

      // Verify merchant payable balance on ledger
      const merchantAcc = await ledgerRepository.getOrCreateAccount(
        LedgerAccountType.MERCHANT_PAYABLE,
        LedgerAccountOwnerType.MERCHANT,
        testMerchantId,
        'KES'
      );
      const merchantBal = await ledgerRepository.recalculateAccountBalance(merchantAcc.id);
      assert.equal(merchantBal, 96000);

      // Verify platform revenue accounts on ledger
      const commAcc = await ledgerRepository.getOrCreateAccount(
        LedgerAccountType.PLATFORM_COMMISSION_REVENUE,
        LedgerAccountOwnerType.PLATFORM,
        null,
        'KES'
      );
      const commBal = await ledgerRepository.recalculateAccountBalance(commAcc.id);
      assert.equal(commBal, 24000);
    });
  });

  // ==========================================================================
  // 4. Courier Earnings & Delivery Fulfillment Posting
  // ==========================================================================
  describe('Rider Delivery Earnings Calculation & Posting', () => {
    test('calculates base pay + distance pay + waiting compensation accurately', async () => {
      // 5.5 km (3.5 km extra) + 16 minutes (6 min extra)
      const earning = await riderEarningsService.calculateAndRecordEarning({
        riderId: testRiderId,
        deliveryId: 'del_s12_01',
        orderId: 'ord_s12_01',
        distanceMeters: 5500,
        waitingMinutes: 16,
      });

      // Base pay: KES 150.00 = 15,000 minor
      assert.equal(earning.base_amount_minor, 15000);

      // Distance pay: 3.5 km * KES 30.00 = KES 105.00 = 10,500 minor
      assert.equal(earning.distance_amount_minor, 10500);

      // Waiting pay: 6 mins * KES 5.00 = KES 30.00 = 3,000 minor
      assert.equal(earning.waiting_amount_minor, 3000);

      // Total pay: 15,000 + 10,500 + 3,000 = 28,500 minor (KES 285.00)
      assert.equal(earning.total_amount_minor, 28500);
      assert.equal(earning.status, RiderEarningStatus.ELIGIBLE);
    });

    test('posts rider earning to ledger and updates order contribution profit', async () => {
      const earning = await riderEarningsService.calculateAndRecordEarning({
        riderId: testRiderId,
        deliveryId: 'del_s12_02',
        orderId: 'ord_s12_01',
        distanceMeters: 3000,
      });

      await financialPostingService.postRiderEarning(earning);

      // Check rider payable on ledger
      const riderAcc = await ledgerRepository.getOrCreateAccount(
        LedgerAccountType.RIDER_PAYABLE,
        LedgerAccountOwnerType.RIDER,
        testRiderId,
        'KES'
      );
      const riderBal = await ledgerRepository.recalculateAccountBalance(riderAcc.id);
      assert.equal(riderBal, earning.total_amount_minor);

      // Verify order contribution margin was updated
      const summary = await ledgerRepository.findOrderSummary('ord_s12_01');
      if (summary) {
        assert.equal(summary.rider_cost_minor, earning.total_amount_minor);
        assert.ok(summary.contribution_profit_minor !== undefined);
      }
    });
  });

  // ==========================================================================
  // 5. Merchant Settlement Lifecycle
  // ==========================================================================
  describe('Merchant Settlement Lifecycle', () => {
    test('calculates, approves, and executes settlement with ledger debit', async () => {
      // 1. Give merchant an initial payable balance via ledger
      const merchantAcc = await ledgerRepository.getOrCreateAccount(
        LedgerAccountType.MERCHANT_PAYABLE,
        LedgerAccountOwnerType.MERCHANT,
        testMerchantId,
        'KES'
      );
      const clearingAcc = await ledgerRepository.getOrCreateAccount(
        LedgerAccountType.CUSTOMER_FUNDS_CLEARING,
        LedgerAccountOwnerType.SYSTEM,
        null,
        'KES'
      );

      await ledgerRepository.postTransaction(
        {
          transaction_type: LedgerTransactionType.PAYMENT_CAPTURED,
          reference_type: 'SEED',
          reference_id: 'seed_merchant_01',
          idempotency_key: 'seed:merch:01',
          currency: 'KES',
          description: 'Seed merchant balance',
          total_amount_minor: 50000,
          effective_at: new Date().toISOString(),
        },
        [
          {
            accountId: clearingAcc.id,
            direction: LedgerEntryDirection.DEBIT,
            amountMinor: 50000,
          },
          {
            accountId: merchantAcc.id,
            direction: LedgerEntryDirection.CREDIT,
            amountMinor: 50000,
          },
        ]
      );

      const initialBal = await ledgerRepository.recalculateAccountBalance(merchantAcc.id);
      assert.equal(initialBal, 50000);

      // 2. Calculate Settlement
      const settlement = await settlementService.calculateSettlement(testMerchantId);
      assert.equal(settlement.status, MerchantSettlementStatus.CALCULATED);
      assert.equal(settlement.net_settlement_amount_minor, 50000);

      // 3. Approve Settlement
      const approved = await settlementService.approveSettlement(settlement.id, 'user_finance_admin');
      assert.equal(approved.status, MerchantSettlementStatus.APPROVED);

      // 4. Pay Settlement
      const paid = await settlementService.paySettlement(settlement.id, 'BANK-EFT-778899');
      assert.equal(paid.status, MerchantSettlementStatus.PAID);
      assert.equal(paid.payment_reference, 'BANK-EFT-778899');

      // 5. Merchant Payable balance should now be 0
      const finalBal = await ledgerRepository.recalculateAccountBalance(merchantAcc.id);
      assert.equal(finalBal, 0);
    });

    test('settlement for one merchant never includes another merchant\'s order revenue', async () => {
      const merchantA = 'merch_settlement_isolation_a';
      const merchantB = 'merch_settlement_isolation_b';
      const now = new Date().toISOString();

      await ledgerRepository.saveOrderSummary({
        order_id: 'ord_isolation_a', order_number: 'ISO-A', merchant_id: merchantA, currency: 'KES',
        gmv_minor: 10000, food_subtotal_minor: 10000, commission_rate: 0, commission_revenue_minor: 0,
        delivery_revenue_minor: 0, service_fee_revenue_minor: 0, gross_platform_revenue_minor: 0,
        rider_cost_minor: 0, payment_processing_cost_minor: 0, platform_funded_discount_minor: 0,
        merchant_funded_discount_minor: 0, refund_cost_minor: 0, contribution_profit_minor: 0,
        contribution_margin_pct: 0, merchant_payable_minor: 10000, is_negative_margin: false, calculated_at: now,
      });
      await ledgerRepository.saveOrderSummary({
        order_id: 'ord_isolation_b', order_number: 'ISO-B', merchant_id: merchantB, currency: 'KES',
        gmv_minor: 999900, food_subtotal_minor: 999900, commission_rate: 0, commission_revenue_minor: 0,
        delivery_revenue_minor: 0, service_fee_revenue_minor: 0, gross_platform_revenue_minor: 0,
        rider_cost_minor: 0, payment_processing_cost_minor: 0, platform_funded_discount_minor: 0,
        merchant_funded_discount_minor: 0, refund_cost_minor: 0, contribution_profit_minor: 0,
        contribution_margin_pct: 0, merchant_payable_minor: 999900, is_negative_margin: false, calculated_at: now,
      });

      const settlementA = await settlementService.calculateSettlement(merchantA);
      assert.equal(settlementA.lines.length, 1);
      assert.equal(settlementA.lines[0].reference_id, 'ord_isolation_a');
      assert.equal(settlementA.net_settlement_amount_minor, 10000);
      assert.ok(
        !settlementA.lines.some((l) => l.reference_id === 'ord_isolation_b'),
        'merchant A settlement must never include merchant B\'s order'
      );
    });

    test('the user who calculated a settlement cannot also approve it (maker-checker)', async () => {
      const merchantId = 'merch_maker_checker_s12';
      const maker = 'user_finance_maker';
      const checker = 'user_finance_checker';
      await ledgerRepository.saveOrderSummary({
        order_id: 'ord_maker_checker', order_number: 'MK-01', merchant_id: merchantId, currency: 'KES',
        gmv_minor: 5000, food_subtotal_minor: 5000, commission_rate: 0, commission_revenue_minor: 0,
        delivery_revenue_minor: 0, service_fee_revenue_minor: 0, gross_platform_revenue_minor: 0,
        rider_cost_minor: 0, payment_processing_cost_minor: 0, platform_funded_discount_minor: 0,
        merchant_funded_discount_minor: 0, refund_cost_minor: 0, contribution_profit_minor: 0,
        contribution_margin_pct: 0, merchant_payable_minor: 5000, is_negative_margin: false,
        calculated_at: new Date().toISOString(),
      });

      const settlement = await settlementService.calculateSettlement(merchantId, maker);
      assert.equal(settlement.calculated_by, maker);

      await assert.rejects(
        settlementService.approveSettlement(settlement.id, maker),
        { code: 'SELF_APPROVAL_NOT_ALLOWED' }
      );

      const approved = await settlementService.approveSettlement(settlement.id, checker);
      assert.equal(approved.status, MerchantSettlementStatus.APPROVED);
      assert.equal(approved.approved_by, checker);
    });
  });

  // ==========================================================================
  // 6. Rider Payout Lifecycle
  // ==========================================================================
  describe('Rider Payout Lifecycle', () => {
    test('calculates, approves, and disburses rider payout via M-PESA B2C', async () => {
      // 1. Create eligible earning
      const earning = await riderEarningsService.calculateAndRecordEarning({
        riderId: testRiderId,
        deliveryId: 'del_payout_01',
        orderId: 'ord_payout_01',
        distanceMeters: 4000,
      });
      await financialPostingService.postRiderEarning(earning);

      // 2. Calculate Payout
      const payout = await riderPayoutService.calculatePayout(testRiderId);
      assert.equal(payout.status, RiderPayoutStatus.DRAFT);
      assert.equal(payout.amount_minor, earning.total_amount_minor);

      // 3. Approve Payout
      const approved = await riderPayoutService.approvePayout(payout.id, 'user_finance_admin');
      assert.equal(approved.status, RiderPayoutStatus.APPROVED);

      // 4. Pay Payout
      const paid = await riderPayoutService.payPayout(payout.id, 'MPESA-B2C-998811');
      assert.equal(paid.status, RiderPayoutStatus.PAID);

      // 5. Rider Payable balance should now be 0
      const riderAcc = await ledgerRepository.getOrCreateAccount(
        LedgerAccountType.RIDER_PAYABLE,
        LedgerAccountOwnerType.RIDER,
        testRiderId,
        'KES'
      );
      const finalBal = await ledgerRepository.recalculateAccountBalance(riderAcc.id);
      assert.equal(finalBal, 0);

      // 6. Earning should be marked PAID
      const updatedEarning = await ledgerRepository.findRiderEarningByDeliveryId('del_payout_01');
      assert.equal(updatedEarning?.status, RiderEarningStatus.PAID);
    });

    test('a second calculatePayout call cannot claim earnings already reserved by an unpaid draft', async () => {
      const rider = 'rider_payout_isolation_s12';
      const earning = await riderEarningsService.calculateAndRecordEarning({
        riderId: rider,
        deliveryId: 'del_payout_isolation',
        orderId: 'ord_payout_isolation',
        distanceMeters: 4000,
      });
      await financialPostingService.postRiderEarning(earning);

      const first = await riderPayoutService.calculatePayout(rider);
      assert.equal(first.status, RiderPayoutStatus.DRAFT);
      assert.equal(first.amount_minor, earning.total_amount_minor);

      const reserved = await ledgerRepository.findRiderEarningByDeliveryId('del_payout_isolation');
      assert.equal(reserved?.status, RiderEarningStatus.RESERVED);

      // The earning is now RESERVED (not ELIGIBLE), and the ledger balance fallback must not
      // re-discover the same money while `first` remains an outstanding, unpaid DRAFT payout.
      await assert.rejects(
        riderPayoutService.calculatePayout(rider),
        /No eligible earnings or payable balance found/
      );

      // Failing the draft releases the earning so it becomes payable again.
      const failed = await riderPayoutService.failPayout(first.id, 'test: releasing for reuse');
      assert.equal(failed.status, RiderPayoutStatus.FAILED);
      const released = await ledgerRepository.findRiderEarningByDeliveryId('del_payout_isolation');
      assert.equal(released?.status, RiderEarningStatus.ELIGIBLE);

      const second = await riderPayoutService.calculatePayout(rider);
      assert.equal(second.amount_minor, earning.total_amount_minor);
    });

    test('the user who calculated a payout cannot also approve it (maker-checker)', async () => {
      const rider = 'rider_maker_checker_s12';
      const maker = 'user_finance_maker_2';
      const checker = 'user_finance_checker_2';
      const earning = await riderEarningsService.calculateAndRecordEarning({
        riderId: rider,
        deliveryId: 'del_maker_checker',
        orderId: 'ord_maker_checker_payout',
        distanceMeters: 3000,
      });
      await financialPostingService.postRiderEarning(earning);

      const payout = await riderPayoutService.calculatePayout(rider, maker);
      assert.equal(payout.calculated_by, maker);

      await assert.rejects(
        riderPayoutService.approvePayout(payout.id, maker),
        { code: 'SELF_APPROVAL_NOT_ALLOWED' }
      );

      const approved = await riderPayoutService.approvePayout(payout.id, checker);
      assert.equal(approved.status, RiderPayoutStatus.APPROVED);
      assert.equal(approved.approved_by, checker);
    });
  });

  // ==========================================================================
  // 7. Refund Reversal Accounting
  // ==========================================================================
  describe('Refund Reversal Accounting', () => {
    test('posts merchant-fault refund debiting merchant payable', async () => {
      const merchantAcc = await ledgerRepository.getOrCreateAccount(
        LedgerAccountType.MERCHANT_PAYABLE,
        LedgerAccountOwnerType.MERCHANT,
        testMerchantId,
        'KES'
      );

      // Initial credit of 20,000
      await ledgerRepository.postTransaction(
        {
          transaction_type: LedgerTransactionType.PAYMENT_CAPTURED,
          reference_type: 'SEED',
          reference_id: 'seed_refund_01',
          idempotency_key: 'payment.captured:pay_test_01',
          currency: 'KES',
          description: 'Seed for refund',
          total_amount_minor: 20000,
          effective_at: new Date().toISOString(),
        },
        [
          {
            accountId: (await ledgerRepository.getOrCreateAccount(LedgerAccountType.CUSTOMER_FUNDS_CLEARING, LedgerAccountOwnerType.SYSTEM, null, 'KES')).id,
            direction: LedgerEntryDirection.DEBIT,
            amountMinor: 20000,
          },
          {
            accountId: merchantAcc.id,
            accountType: LedgerAccountType.MERCHANT_PAYABLE,
            direction: LedgerEntryDirection.CREDIT,
            amountMinor: 20000,
          },
        ]
      );

      await paymentRepository.savePayment({id:'pay_test_01',order_id:'ord_test_01',customer_id:'cust_test',amount_minor:20000,captured_minor:20000,refunded_minor:0,currency:'KES',status:PaymentStatus.CAPTURED,provider:PaymentProvider.MPESA,method:PaymentMethod.MPESA,created_at:new Date().toISOString(),updated_at:new Date().toISOString()});
      await ledgerRepository.saveOrderSummary({order_id:'ord_test_01',order_number:'refund-test',merchant_id:testMerchantId,currency:'KES',gmv_minor:20000,food_subtotal_minor:20000,commission_rate:0,commission_revenue_minor:0,delivery_revenue_minor:0,service_fee_revenue_minor:0,gross_platform_revenue_minor:0,rider_cost_minor:0,payment_processing_cost_minor:0,platform_funded_discount_minor:0,merchant_funded_discount_minor:0,refund_cost_minor:0,contribution_profit_minor:0,contribution_margin_pct:0,merchant_payable_minor:20000,is_negative_margin:false,calculated_at:new Date().toISOString()});
      // Process merchant-fault refund of 8,000
      const refund = {
        id: 'ref_test_01',
        payment_id: 'pay_test_01',
        order_id: 'ord_test_01',
        amount_minor: 8000,
        currency: 'KES',
        status: RefundStatus.SUCCEEDED,
        reason_code: RefundReasonCode.MERCHANT_REJECTED,
        requested_by: 'admin_user',
        requested_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await financialPostingService.postRefundReversal(refund, {
        merchantId: testMerchantId,
        isMerchantFault: true,
      });

      // Merchant balance should now be 20,000 - 8,000 = 12,000
      const bal = await ledgerRepository.recalculateAccountBalance(merchantAcc.id);
      assert.equal(bal, 12000);
    });
  });

  // ==========================================================================
  // 8. Reconciliation & Exception Audit
  // ==========================================================================
  describe('Reconciliation Engine', () => {
    test('generates reconciliation report verifying ledger audit integrity', async () => {
      const report = await reconciliationService.generateReport();
      assert.ok(report.generated_at);
      assert.ok(Array.isArray(report.unreconciled_captured_payments));
      assert.ok(Array.isArray(report.unreconciled_succeeded_refunds));
      assert.ok(Array.isArray(report.unreconciled_delivered_deliveries));
      assert.ok(Array.isArray(report.unbalanced_ledger_transactions));
    });
  });

  // ==========================================================================
  // 9. Profitability & Materialized Economics
  // ==========================================================================
  describe('Platform Profitability Engine', () => {
    test('aggregates platform gross revenue, variable costs, and contribution margins', async () => {
      const metrics = await profitabilityService.getProfitabilityMetrics();
      assert.ok(metrics.gmv_minor !== undefined);
      assert.ok(metrics.gross_platform_revenue_minor !== undefined);
      assert.ok(metrics.contribution_profit_minor !== undefined);
      assert.ok(metrics.contribution_margin_pct !== undefined);
    });
  });
});
