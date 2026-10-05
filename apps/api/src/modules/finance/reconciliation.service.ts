import { transactionalService } from '../../db/transaction';
/**
 * DEETOO - Financial Reconciliation & Exception Detection Service
 * Sprint 12: Auditing payments, refunds, deliveries, and ledger integrity
 */

import { ledgerRepository, LedgerRepository } from './ledger.repository';
import { paymentRepository } from '../payment/payment.repository';
import { deliveryRepository } from '../order/delivery.repository';
import { orderRepository } from '../order/order.repository';
import { financialPostingService, FinancialPostingService } from './financial-posting.service';
import { riderEarningsService, RiderEarningsService } from './rider-earnings.service';
import {
  FinancialReconciliationReport,
  PaymentStatus,
  PaymentReconciliationStatus,
  RefundStatus,
  DeliveryStatus,
  LedgerEntryDirection,
} from '@deetoo/types';
import { logger } from '@deetoo/utils';

export class ReconciliationService {
  constructor(
    private repo: LedgerRepository = ledgerRepository,
    private postingSvc: FinancialPostingService = financialPostingService,
    private riderEarningsSvc: RiderEarningsService = riderEarningsService
  ) {}

  /**
   * Generates a comprehensive financial reconciliation report
   */
  public async generateReport(): Promise<FinancialReconciliationReport> {
    const report: FinancialReconciliationReport = {
      generated_at: new Date().toISOString(),
      unreconciled_captured_payments: [],
      unreconciled_succeeded_refunds: [],
      unreconciled_delivered_deliveries: [],
      unreconciled_completed_orders: [],
      unbalanced_ledger_transactions: [],
      all_balanced: true,
    };

    // 1. Audit Captured Payments vs Ledger
    const allPayments = await paymentRepository.findAll();
    for (const payment of allPayments) {
      if (payment.status === PaymentStatus.CAPTURED) {
        const key = `payment.captured:${payment.id}`;
        const tx = await this.repo.findTransactionByIdempotencyKey(key);
        if (!tx) {
          report.unreconciled_captured_payments.push({
            payment_id: payment.id,
            order_id: payment.order_id,
            amount_minor: payment.amount_minor,
            captured_at: payment.captured_at || payment.created_at,
            reason: 'Payment CAPTURED without corresponding double-entry ledger posting',
          });
        }
      }
    }

    // 2. Audit Succeeded Refunds vs Ledger
    const allRefunds = await paymentRepository.findRefunds();
    for (const refund of allRefunds) {
      if (refund.status === RefundStatus.SUCCEEDED) {
        const key = `refund.succeeded:${refund.id}`;
        const tx = await this.repo.findTransactionByIdempotencyKey(key);
        if (!tx) {
          report.unreconciled_succeeded_refunds.push({
            refund_id: refund.id,
            payment_id: refund.payment_id,
            amount_minor: refund.amount_minor,
            reason: 'Refund SUCCEEDED without corresponding double-entry ledger reversal',
          });
        }
      }
    }

    // 3. Audit Delivered Deliveries vs Rider Earnings & Ledger
    const allDeliveries = await deliveryRepository.findAll();
    for (const delivery of allDeliveries) {
      if (delivery.status === DeliveryStatus.DELIVERED && delivery.assigned_rider_id) {
        const earning = await this.repo.findRiderEarningByDeliveryId(delivery.id);
        const key = `delivery.delivered:${delivery.id}`;
        const tx = await this.repo.findTransactionByIdempotencyKey(key);
        if (!earning || !tx) {
          report.unreconciled_delivered_deliveries.push({
            delivery_id: delivery.id,
            order_id: delivery.order_id,
            rider_id: delivery.assigned_rider_id,
            reason: !earning
              ? 'Delivery DELIVERED without rider earning calculation'
              : 'Rider earning calculated without double-entry ledger posting',
          });
        }
      }
    }

    // 4. Audit Unbalanced Ledger Transactions
    for (const tx of await this.repo.listTransactions()) {
      const entries = await this.repo.findEntriesByTransactionId(tx.id);
      let debits = 0;
      let credits = 0;
      for (const e of entries) {
        if (e.direction === LedgerEntryDirection.DEBIT) debits += e.amount_minor;
        else if (e.direction === LedgerEntryDirection.CREDIT) credits += e.amount_minor;
      }
      if (debits !== credits) {
        report.unbalanced_ledger_transactions.push({
          transaction_id: tx.id,
          total_debits_minor: debits,
          total_credits_minor: credits,
        });
      }
    }

    report.all_balanced =
      report.unreconciled_captured_payments.length === 0 &&
      report.unreconciled_succeeded_refunds.length === 0 &&
      report.unreconciled_delivered_deliveries.length === 0 &&
      report.unbalanced_ledger_transactions.length === 0;

    return report;
  }

  /**
   * Automatically heals / reconciles missing ledger postings
   */
  public async autoReconcile(): Promise<{ reconciledCount: number }> {
    let reconciledCount = 0;
    const report = await this.generateReport();

    // Reconcile payments
    for (const unrec of report.unreconciled_captured_payments) {
      try {
        const payment = await paymentRepository.findById(unrec.payment_id);
        const order = await orderRepository.findById(unrec.order_id);
        if (payment && order) {
          await this.postingSvc.postPaymentCapture(payment, order);
          payment.reconciliation_status = PaymentReconciliationStatus.MATCHED;
          await paymentRepository.save(payment);
          reconciledCount++;
        }
      } catch (err) {
        logger.error('Failed to auto-reconcile payment', { error: err });
      }
    }

    // Reconcile deliveries
    for (const unrec of report.unreconciled_delivered_deliveries) {
      try {
        const delivery = await deliveryRepository.findById(unrec.delivery_id);
        if (delivery && delivery.assigned_rider_id) {
          let earning = await this.repo.findRiderEarningByDeliveryId(delivery.id);
          if (!earning) {
            earning = await this.riderEarningsSvc.calculateAndRecordEarning({
              riderId: delivery.assigned_rider_id,
              deliveryId: delivery.id,
              orderId: delivery.order_id,
              distanceMeters: delivery.dropoff_address_text ? 3500 : 2000,
            });
          }
          await this.postingSvc.postRiderEarning(earning);
          reconciledCount++;
        }
      } catch (err) {
        logger.error('Failed to auto-reconcile delivery', { error: err });
      }
    }

    return { reconciledCount };
  }
}

export const reconciliationService = transactionalService(new ReconciliationService());
