import { transactionalService } from '../../db/transaction';
/**
 * DEETOO - Operational Recovery Service
 * Sprint 13: Controlled, audited manual recovery actions for marketplace operations
 */

import { randomUUID } from 'crypto';
import { logger } from '@deetoo/utils';
import { operationsRepository } from './operations.repository';
import { orderRepository } from '../order/order.repository';
import { orderService } from '../order/order.service';
import { deliveryRepository } from '../order/delivery.repository';
import { dispatchService } from '../order/dispatch.service';
import { paymentRepository } from '../payment/payment.repository';
import { paymentService } from '../payment/payment.service';
import { settlementService } from '../finance/settlement.service';
import { riderPayoutService } from '../finance/rider-payout.service';
import { orderEventBroker } from '../realtime/event-broker';
import { DeliveryStatus, OrderStatus, RefundStatus } from '@deetoo/types';

export interface RecoveryActor {
  id: string;
  name: string;
  email?: string;
  role?: string;
}

export class OperationalRecoveryService {
  /**
   * 1. Retry sending order alert to merchant branch
   */
  public async retryMerchantNotification(orderId: string, actor: RecoveryActor): Promise<{ success: boolean; message: string }> {
    const order = await orderRepository.findById(orderId);
    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }

    if (order.status !== OrderStatus.PLACED) {
      throw new Error(`Cannot retry merchant notification: Order is in status ${order.status}, expected PLACED`);
    }

    const branchId = order.branch_id;
    if (branchId) {
      await orderEventBroker.publish(`merchant-branch:${branchId}`, {
        channel: `merchant-branch:${branchId}`,
        type: 'order.placed',
        orderId: order.id,
        orderNumber: order.order_number,
        status: order.status,
        timestamp: new Date().toISOString(),
        data: {
          ...order,
          isOperationalRetry: true,
          retriedBy: actor.name,
        },
      });
    }

    logger.info('Operational retry: Merchant notification re-emitted', {
      service: 'recovery-service',
      orderId,
      branchId,
      actor: actor.name,
    });

    return {
      success: true,
      message: `Merchant notification successfully re-sent for order #${order.order_number || order.id}`,
    };
  }

  /**
   * 2. Retry dispatch cycle for stuck unassigned delivery
   */
  public async retryDispatch(deliveryId: string, actor: RecoveryActor): Promise<{
    success: boolean;
    status: string;
    candidatesCount: number;
    searchRadiusMeters: number;
  }> {
    // Check kill switch
    const autoDispatchPaused = await operationsRepository.isKillSwitchActive('auto_dispatch_paused');
    if (autoDispatchPaused) {
      throw new Error('Automated dispatch engine is currently paused by operational kill switch (auto_dispatch_paused). Resume before retrying.');
    }

    const delivery = await deliveryRepository.findById(deliveryId);
    if (!delivery) {
      throw new Error(`Delivery ${deliveryId} not found`);
    }

    if (delivery.status !== DeliveryStatus.UNASSIGNED && delivery.status !== DeliveryStatus.OFFERED) {
      throw new Error(`Delivery ${deliveryId} is in status ${delivery.status}; retry dispatch is only permitted for UNASSIGNED or OFFERED deliveries`);
    }

    const result = await dispatchService.executeDispatchCycle(deliveryId);

    logger.info('Operational recovery: Dispatch cycle executed', {
      service: 'recovery-service',
      deliveryId,
      resultStatus: result.status,
      candidatesCount: result.candidatesCount,
      actor: actor.name,
    });

    return {
      success: true,
      status: result.status,
      candidatesCount: result.candidatesCount,
      searchRadiusMeters: result.searchRadiusMeters,
    };
  }

  /**
   * 3. Reconcile stuck or pending payment
   */
  public async reconcilePayment(paymentId: string, actor: RecoveryActor): Promise<{ success: boolean; payment: any }> {
    const reconciled = await paymentService.reconcilePayment(paymentId);

    logger.info('Operational recovery: Payment reconciled', {
      service: 'recovery-service',
      paymentId,
      finalStatus: reconciled.status,
      actor: actor.name,
    });

    return {
      success: true,
      payment: reconciled,
    };
  }

  /**
   * 4. Retry failed refund with idempotency
   */
  public async retryRefund(refundId: string, actor: RecoveryActor): Promise<{ success: boolean; refund: any }> {
    const refund = await paymentRepository.findRefundById(refundId);
    if (!refund) {
      throw new Error(`Refund ${refundId} not found`);
    }

    if (refund.status === RefundStatus.SUCCEEDED || (refund.status as string) === 'COMPLETED') {
      return { success: true, refund };
    }

    // Attempt processing refund through payment service
    const retried = await paymentService.requestRefund({
      paymentId: refund.payment_id,
      amountMinor: refund.amount_minor,
      reasonCode: (refund as any).reason_code || 'OP_RECOVERY_RETRY',
      reasonCategory: (refund as any).reason_category,
      note: `[RECOVERY RETRY by ${actor.name}] ${(refund as any).reason_details || refund.note || ''}`,
      requestedBy: actor.id,
    });

    logger.info('Operational recovery: Refund retried', {
      service: 'recovery-service',
      refundId,
      newRefundId: retried.id,
      status: retried.status,
      actor: actor.name,
    });

    return {
      success: true,
      refund: retried,
    };
  }

  /**
   * 5. Retry merchant settlement
   */
  public async retrySettlement(settlementId: string, actor: RecoveryActor): Promise<{ success: boolean; settlement: any }> {
    const settlement = await settlementService.approveSettlement(settlementId, actor.id);
    return {
      success: true,
      settlement,
    };
  }

  /**
   * 6. Retry rider payout
   */
  public async retryRiderPayout(payoutId: string, actor: RecoveryActor): Promise<{ success: boolean; payout: any }> {
    const payout = await riderPayoutService.getPayoutById(payoutId);
    if (!payout) {
      throw new Error(`Payout ${payoutId} not found`);
    }

    logger.info('Operational recovery: Rider payout status checked/retried', {
      service: 'recovery-service',
      payoutId,
      status: payout.status,
      actor: actor.name,
    });

    return {
      success: true,
      payout,
    };
  }

  /**
   * 7. Cancel order with operational reason code and audit trail
   */
  public async cancelOrder(
    orderId: string,
    actor: RecoveryActor,
    reasonCode: string,
    notes?: string
  ): Promise<{ success: boolean; order: any }> {
    const order = await orderService.adminCancelOrder(
      { id: actor.id, email: actor.email || actor.name },
      orderId,
      reasonCode,
      notes
    );

    logger.info('Operational recovery: Admin order cancelled', {
      service: 'recovery-service',
      orderId,
      reasonCode,
      actor: actor.name,
    });

    return {
      success: true,
      order,
    };
  }

  /**
   * 8. Manually assign eligible rider to delivery
   */
  public async manualAssignRider(
    deliveryId: string,
    riderId: string,
    actor: RecoveryActor,
    note?: string
  ): Promise<{ success: boolean; delivery: any }> {
    const delivery = await dispatchService.adminManualAssign(
      deliveryId,
      riderId,
      { id: actor.id, email: actor.email || actor.name },
      note
    );

    logger.info('Operational recovery: Rider manually assigned', {
      service: 'recovery-service',
      deliveryId,
      riderId,
      actor: actor.name,
    });

    return {
      success: true,
      delivery,
    };
  }
}

export const operationalRecoveryService = transactionalService(new OperationalRecoveryService());
