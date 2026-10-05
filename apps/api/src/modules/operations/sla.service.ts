import { allowMemoryAdapter } from '../../db/storage-policy';
import { transactionalService } from '../../db/transaction';
/**
 * DEETOO - Operations SLA Service
 * Sprint 13: Centralized Operational SLA Evaluator & Monitoring
 * Implements SLA evaluation for Orders, Deliveries, Payments, and Support Cases.
 */

import { logger } from '@deetoo/utils';
import { orderEventBroker } from '../realtime/event-broker';
import {
  SlaConfig,
  SlaStatus,
  SlaEvaluationResult,
} from '@deetoo/types';

export const DEFAULT_SLA_CONFIG: SlaConfig = {
  merchantResponseSlaMinutes: 5,        // Max 5 min for merchant to accept/reject PLACED order
  preparationDelayToleranceMinutes: 10,  // Max 10 min past estimatedReadyAt before flagging prep delay
  dispatchAssignmentSlaMinutes: 3,      // Max 3 min for READY order to have assigned courier
  pickupArrivalSlaMinutes: 15,          // Max 15 min for courier to arrive at restaurant branch
  pickupWaitSlaMinutes: 10,             // Max 10 min courier waiting at restaurant
  deliveryTravelSlaMinutes: 30,         // Max 30 min en route to customer
  paymentPendingSlaMinutes: 5,          // Max 5 min in PENDING payment state
  riderLocationStaleSlaMinutes: 3,      // Max 3 min without GPS ping during active delivery
  supportFirstResponseSlaMinutes: 15,   // Max 15 min for agent response on high/urgent case
};

export type SlaOrderEvaluationResult = SlaEvaluationResult[] & {
  merchantAcceptance?: {
    status: 'ON_TRACK' | 'WARNING' | 'BREACHED';
    elapsedSeconds: number;
    breachSeconds?: number;
    thresholdSeconds: number;
  };
};

export class OperationsSlaService {
  private config: SlaConfig;

  constructor(customConfig?: Partial<SlaConfig>) {
    this.config = { ...DEFAULT_SLA_CONFIG, ...(customConfig || {}) };
  }

  public getConfig(): SlaConfig {
    return { ...this.config };
  }

  public updateConfig(updates: Partial<SlaConfig>): SlaConfig {
    this.config = { ...this.config, ...updates };
    return this.getConfig();
  }

  /**
   * Evaluates Order against merchant response, preparation delay, and ready dispatch SLAs
   */
  public evaluateOrder(order: any, now: Date = new Date()): SlaOrderEvaluationResult {
    const results: SlaEvaluationResult[] = [];
    const createdAt = new Date(order.created_at || order.placed_at || now).getTime();
    const nowTime = now.getTime();

    // 1. Merchant Response SLA (Order in PLACED state)
    if (order.status === 'PLACED') {
      const elapsedMinutes = (nowTime - createdAt) / (1000 * 60);
      const elapsedSeconds = (nowTime - createdAt) / 1000;
      const threshold = this.config.merchantResponseSlaMinutes;
      const thresholdSeconds = threshold * 60;

      let merchantStatus: 'ON_TRACK' | 'WARNING' | 'BREACHED' = 'ON_TRACK';
      let breachSeconds: number | undefined = undefined;

      if (elapsedMinutes > threshold) {
        merchantStatus = 'BREACHED';
        breachSeconds = Math.round(elapsedSeconds - thresholdSeconds);
        results.push({
          entityType: 'ORDER',
          entityId: order.id,
          slaType: 'MERCHANT_RESPONSE_DELAY',
          status: 'BREACHED',
          elapsedMinutes: Math.round(elapsedMinutes * 10) / 10,
          thresholdMinutes: threshold,
          details: `Merchant has not responded to order ${order.order_number || order.id} within ${threshold}m SLA (${Math.round(elapsedMinutes)}m elapsed)`,
        });
      } else if (elapsedMinutes >= threshold * 0.7) {
        merchantStatus = 'WARNING';
        results.push({
          entityType: 'ORDER',
          entityId: order.id,
          slaType: 'MERCHANT_RESPONSE_DELAY',
          status: 'WARNING',
          elapsedMinutes: Math.round(elapsedMinutes * 10) / 10,
          thresholdMinutes: threshold,
          details: `Order ${order.order_number || order.id} nearing merchant response SLA threshold (${Math.round(elapsedMinutes)}m elapsed of ${threshold}m)`,
        });
      } else {
        merchantStatus = 'ON_TRACK';
        results.push({
          entityType: 'ORDER',
          entityId: order.id,
          slaType: 'MERCHANT_RESPONSE_DELAY',
          status: 'WITHIN_SLA',
          elapsedMinutes: Math.round(elapsedMinutes * 10) / 10,
          thresholdMinutes: threshold,
          details: `Merchant response within SLA`,
        });
      }

      (results as any).merchantAcceptance = {
        status: merchantStatus,
        elapsedSeconds: Math.round(elapsedSeconds),
        breachSeconds,
        thresholdSeconds,
      };
    }

    // 2. Preparation Delay Tolerance (Order in PREPARING state)
    if (order.status === 'PREPARING' && order.estimated_ready_at) {
      const estimatedReadyTime = new Date(order.estimated_ready_at).getTime();
      const toleranceMs = this.config.preparationDelayToleranceMinutes * 60 * 1000;

      if (nowTime > estimatedReadyTime + toleranceMs) {
        const delayMinutes = (nowTime - estimatedReadyTime) / (1000 * 60);
        results.push({
          entityType: 'ORDER',
          entityId: order.id,
          slaType: 'MERCHANT_PREPARATION_DELAY',
          status: 'BREACHED',
          elapsedMinutes: Math.round(delayMinutes * 10) / 10,
          thresholdMinutes: this.config.preparationDelayToleranceMinutes,
          details: `Kitchen preparation exceeded estimated ready time by ${Math.round(delayMinutes)}m (tolerance: ${this.config.preparationDelayToleranceMinutes}m)`,
        });
      }
    }

    // 3. Ready Without Rider (Order in READY state)
    if (order.status === 'READY' && order.ready_at) {
      const readyTime = new Date(order.ready_at).getTime();
      const elapsedMinutes = (nowTime - readyTime) / (1000 * 60);
      const threshold = this.config.dispatchAssignmentSlaMinutes;

      // Only breach if there is no courier assigned
      const hasAssignedCourier = !!order.rider_id;
      if (!hasAssignedCourier && elapsedMinutes > threshold) {
        results.push({
          entityType: 'ORDER',
          entityId: order.id,
          slaType: 'DISPATCH_DELAY',
          status: 'BREACHED',
          elapsedMinutes: Math.round(elapsedMinutes * 10) / 10,
          thresholdMinutes: threshold,
          details: `Order READY for ${Math.round(elapsedMinutes)}m without assigned courier (SLA: ${threshold}m)`,
        });
      }
    }

    return results;
  }

  /**
   * Evaluates Delivery against dispatch, pickup arrival, kitchen wait, en-route, and rider GPS SLAs
   */
  public evaluateDelivery(delivery: any, now: Date = new Date()): SlaEvaluationResult[] {
    const results: SlaEvaluationResult[] = [];
    const nowTime = now.getTime();

    // 1. Unassigned Dispatch Delay
    if (delivery.status === 'UNASSIGNED') {
      const createdTime = new Date(delivery.created_at || now).getTime();
      const elapsedMinutes = (nowTime - createdTime) / (1000 * 60);
      const threshold = this.config.dispatchAssignmentSlaMinutes;

      if (elapsedMinutes > threshold) {
        results.push({
          entityType: 'DELIVERY',
          entityId: delivery.id,
          slaType: 'DISPATCH_NO_RIDER',
          status: 'BREACHED',
          elapsedMinutes: Math.round(elapsedMinutes * 10) / 10,
          thresholdMinutes: threshold,
          details: `Delivery unassigned for ${Math.round(elapsedMinutes)}m without rider acceptance (threshold: ${threshold}m)`,
        });
      }
    }

    // 2. Pickup Arrival Delay (Rider ASSIGNED heading to restaurant)
    if (delivery.status === 'ASSIGNED' && delivery.assigned_at) {
      const assignedTime = new Date(delivery.assigned_at).getTime();
      const elapsedMinutes = (nowTime - assignedTime) / (1000 * 60);
      const threshold = this.config.pickupArrivalSlaMinutes;

      if (elapsedMinutes > threshold) {
        results.push({
          entityType: 'DELIVERY',
          entityId: delivery.id,
          slaType: 'DELIVERY_DELAY',
          status: 'BREACHED',
          elapsedMinutes: Math.round(elapsedMinutes * 10) / 10,
          thresholdMinutes: threshold,
          details: `Courier took ${Math.round(elapsedMinutes)}m to arrive at restaurant (SLA: ${threshold}m)`,
        });
      }
    }

    // 3. Kitchen Wait Delay (Rider ARRIVED_PICKUP waiting for food)
    if (delivery.status === 'ARRIVED_PICKUP' && delivery.arrived_pickup_at) {
      const arrivedTime = new Date(delivery.arrived_pickup_at).getTime();
      const elapsedMinutes = (nowTime - arrivedTime) / (1000 * 60);
      const threshold = this.config.pickupWaitSlaMinutes;

      if (elapsedMinutes > threshold) {
        results.push({
          entityType: 'DELIVERY',
          entityId: delivery.id,
          slaType: 'DELIVERY_DELAY',
          status: 'BREACHED',
          elapsedMinutes: Math.round(elapsedMinutes * 10) / 10,
          thresholdMinutes: threshold,
          details: `Courier has been waiting at restaurant for ${Math.round(elapsedMinutes)}m (threshold: ${threshold}m)`,
        });
      }
    }

    // 4. En-Route Travel Delay (Rider EN_ROUTE to customer)
    if (delivery.status === 'EN_ROUTE' && delivery.en_route_at) {
      const enRouteTime = new Date(delivery.en_route_at).getTime();
      const elapsedMinutes = (nowTime - enRouteTime) / (1000 * 60);
      const threshold = this.config.deliveryTravelSlaMinutes;

      if (elapsedMinutes > threshold) {
        results.push({
          entityType: 'DELIVERY',
          entityId: delivery.id,
          slaType: 'DELIVERY_DELAY',
          status: 'BREACHED',
          elapsedMinutes: Math.round(elapsedMinutes * 10) / 10,
          thresholdMinutes: threshold,
          details: `Delivery en route to customer for ${Math.round(elapsedMinutes)}m (SLA: ${threshold}m)`,
        });
      }
    }

    // 5. Rider Location Staleness on Active Deliveries
    const activeRiderStatuses = ['ASSIGNED', 'ARRIVED_PICKUP', 'PICKED_UP', 'EN_ROUTE', 'ARRIVED_DROPOFF'];
    if (activeRiderStatuses.includes(delivery.status) && delivery.rider_id) {
      const lastPingTime = delivery.last_location_updated_at || delivery.updated_at || delivery.assigned_at;
      if (lastPingTime) {
        const pingTime = new Date(lastPingTime).getTime();
        const elapsedMinutes = (nowTime - pingTime) / (1000 * 60);
        const threshold = this.config.riderLocationStaleSlaMinutes;

        if (elapsedMinutes > threshold) {
          results.push({
            entityType: 'DELIVERY',
            entityId: delivery.id,
            slaType: 'RIDER_LOCATION_STALE',
            status: 'BREACHED',
            elapsedMinutes: Math.round(elapsedMinutes * 10) / 10,
            thresholdMinutes: threshold,
            details: `Active delivery courier GPS location stale for ${Math.round(elapsedMinutes)}m (threshold: ${threshold}m)`,
          });
        }
      }
    }

    return results;
  }

  /**
   * Evaluates Payment SLA (Pending duration)
   */
  public evaluatePayment(payment: any, now: Date = new Date()): SlaEvaluationResult[] {
    const results: SlaEvaluationResult[] = [];
    if (payment.status === 'PENDING') {
      const createdTime = new Date(payment.created_at || now).getTime();
      const elapsedMinutes = (now.getTime() - createdTime) / (1000 * 60);
      const threshold = this.config.paymentPendingSlaMinutes;

      if (elapsedMinutes > threshold) {
        results.push({
          entityType: 'PAYMENT',
          entityId: payment.id,
          slaType: 'PAYMENT_PENDING',
          status: 'BREACHED',
          elapsedMinutes: Math.round(elapsedMinutes * 10) / 10,
          thresholdMinutes: threshold,
          details: `Payment ${payment.id} has been PENDING for ${Math.round(elapsedMinutes)}m (SLA: ${threshold}m)`,
        });
      }
    }
    return results;
  }

  /**
   * Publishes SLA breach event to Realtime channel
   */
  public async publishSlaBreachEvent(breach: SlaEvaluationResult): Promise<void> {
    logger.warn('Operational SLA breached', {
      service: 'sla-service',
      metadata: breach as any,
    });

    const payload = {
      type: 'operations.sla_breached',
      entityType: breach.entityType,
      entityId: breach.entityId,
      slaType: breach.slaType,
      status: breach.status,
      elapsedMinutes: breach.elapsedMinutes,
      thresholdMinutes: breach.thresholdMinutes,
      details: breach.details,
      timestamp: new Date().toISOString(),
    };

    try {
      await orderEventBroker.publish('admin:operations', {
        channel: 'admin:operations',
        type: 'operations.sla_breached',
        orderId: breach.entityType === 'ORDER' ? breach.entityId : '',
        orderNumber: '',
        status: 'WARNING' as any,
        timestamp: payload.timestamp,
        data: payload,
      });
    } catch {
      allowMemoryAdapter();
      // ignore realtime publish errors
    }
  }
}

export const operationsSlaService = transactionalService(new OperationsSlaService());
