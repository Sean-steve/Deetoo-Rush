import { allowMemoryAdapter } from '../../db/storage-policy';
import { transactionalService } from '../../db/transaction';
/**
 * DEETOO - Operational Incident Service
 * Sprint 13: Incident Lifecycle Management, Deduplication, Automated Detectors, and Timelines
 */

import { randomUUID } from 'crypto';
import { logger } from '@deetoo/utils';
import {
  OperationalIncident,
  IncidentTimelineEntry,
  IncidentStatus,
  IncidentSeverity,
  IncidentType,
} from '@deetoo/types';
import { operationsRepository } from './operations.repository';
import { operationsSlaService } from './sla.service';
import { orderRepository } from '../order/order.repository';
import { deliveryRepository } from '../order/delivery.repository';
import { paymentRepository } from '../payment/payment.repository';
import { orderEventBroker } from '../realtime/event-broker';

const SEVERITY_RANK: Record<IncidentSeverity, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

export interface RaiseIncidentParams {
  type: IncidentType | string;
  severity: IncidentSeverity;
  order_id?: string | null;
  orderId?: string | null;
  delivery_id?: string | null;
  deliveryId?: string | null;
  payment_id?: string | null;
  paymentId?: string | null;
  refund_id?: string | null;
  refundId?: string | null;
  merchant_id?: string | null;
  merchantId?: string | null;
  rider_id?: string | null;
  riderId?: string | null;
  customer_id?: string | null;
  customerId?: string | null;
  reason_code?: string;
  reasonCode?: string;
  actor_id?: string | null;
  actorId?: string | null;
  actor_name?: string | null;
  actorName?: string | null;
  summary: string;
  details?: string;
  metadata?: Record<string, any>;
}

export class OperationalIncidentService {
  /**
   * Raises or escalates an operational incident with deduplication
   */
  public async raiseIncident(params: RaiseIncidentParams): Promise<OperationalIncident> {
    const order_id = params.order_id || params.orderId || null;
    const delivery_id = params.delivery_id || params.deliveryId || null;
    const payment_id = params.payment_id || params.paymentId || null;
    const refund_id = params.refund_id || params.refundId || null;
    const merchant_id = params.merchant_id || params.merchantId || null;
    const rider_id = params.rider_id || params.riderId || null;
    const customer_id = params.customer_id || params.customerId || null;
    const reason_code = params.reason_code || params.reasonCode || 'GENERIC';

    const existing = await operationsRepository.findActiveIncidentByEntity(params.type, {
      order_id,
      delivery_id,
      payment_id,
      merchant_id,
      rider_id,
    });

    const now = new Date().toISOString();

    if (existing) {
      // Deduplicate: check if severity needs escalation
      const currentRank = SEVERITY_RANK[existing.severity] || 1;
      const newRank = SEVERITY_RANK[params.severity] || 1;
      const shouldEscalate = newRank > currentRank;
      const finalSeverity = shouldEscalate ? params.severity : existing.severity;

      const updated = await operationsRepository.updateIncident(existing.id, {
        severity: finalSeverity,
        details: params.details || existing.details,
        metadata: {
          ...existing.metadata,
          ...params.metadata,
          lastDetectedAt: now,
          detectionCount: ((existing.metadata?.detectionCount as number) || 1) + 1,
        },
      });

      if (shouldEscalate) {
        await operationsRepository.addIncidentTimeline({
          id: randomUUID(),
          incident_id: existing.id,
          action: 'SEVERITY_ESCALATED',
          actor_name: 'SYSTEM_DETECTOR',
          note: `Severity escalated from ${existing.severity} to ${finalSeverity}: ${params.summary}`,
          metadata: { previousSeverity: existing.severity, newSeverity: finalSeverity },
          created_at: now,
        });
      } else {
        await operationsRepository.addIncidentTimeline({
          id: randomUUID(),
          incident_id: existing.id,
          action: 'INCIDENT_UPDATED',
          actor_name: 'SYSTEM_DETECTOR',
          note: `Recurring detection observed: ${params.summary}`,
          metadata: params.metadata,
          created_at: now,
        });
      }

      return updated || existing;
    }

    // Create new incident
    const incidentId = randomUUID();
    const newIncident: OperationalIncident = {
      id: incidentId,
      type: params.type,
      severity: params.severity,
      status: 'OPEN',
      order_id,
      delivery_id,
      payment_id,
      refund_id,
      merchant_id,
      rider_id,
      customer_id,
      reason_code,
      summary: params.summary,
      details: params.details || null,
      metadata: {
        ...(params.metadata || {}),
        detectionCount: 1,
      },
      detected_at: now,
      created_at: now,
      updated_at: now,
    };

    const created = await operationsRepository.createIncident(newIncident);

    // Emit realtime operational event
    await this.publishIncidentEvent('operations.incident_raised', created);

    return created;
  }

  // ============================================================================
  // Lifecycle Operations
  // ============================================================================

  public async acknowledgeIncident(incidentId: string, userId?: string, userName?: string): Promise<OperationalIncident> {
    const existing = await operationsRepository.getIncidentById(incidentId);
    if (!existing) {
      throw new Error(`Incident ${incidentId} not found`);
    }

    const now = new Date().toISOString();
    const updated = await operationsRepository.updateIncident(incidentId, {
      status: 'ACKNOWLEDGED',
      acknowledged_at: now,
      assigned_to_user_id: userId || existing.assigned_to_user_id,
      assigned_to_name: userName || existing.assigned_to_name,
    });

    await operationsRepository.addIncidentTimeline({
      id: randomUUID(),
      incident_id: incidentId,
      action: 'INCIDENT_ACKNOWLEDGED',
      actor_user_id: userId,
      actor_name: userName || 'Operations Agent',
      note: `Incident acknowledged by ${userName || 'Operations Agent'}`,
      created_at: now,
    });

    const result = updated || existing;
    await this.publishIncidentEvent('operations.incident_acknowledged', result);
    return result;
  }

  public async investigateIncident(
    incidentId: string,
    userId?: string,
    userName?: string,
    note?: string
  ): Promise<OperationalIncident> {
    const existing = await operationsRepository.getIncidentById(incidentId);
    if (!existing) {
      throw new Error(`Incident ${incidentId} not found`);
    }

    const now = new Date().toISOString();
    const updated = await operationsRepository.updateIncident(incidentId, {
      status: 'INVESTIGATING',
    });

    await operationsRepository.addIncidentTimeline({
      id: randomUUID(),
      incident_id: incidentId,
      action: 'INCIDENT_INVESTIGATING',
      actor_user_id: userId,
      actor_name: userName || 'Operations Agent',
      note: note || `Investigation initiated by ${userName || 'Operations Agent'}`,
      created_at: now,
    });

    const result = updated || existing;
    await this.publishIncidentEvent('operations.incident_investigating', result);
    return result;
  }

  public async assignIncident(
    incidentId: string,
    actorId?: string,
    actorName?: string,
    assigneeId?: string,
    assigneeName?: string
  ): Promise<OperationalIncident> {
    const existing = await operationsRepository.getIncidentById(incidentId);
    if (!existing) {
      throw new Error(`Incident ${incidentId} not found`);
    }

    const now = new Date().toISOString();
    const updated = await operationsRepository.updateIncident(incidentId, {
      assigned_to_user_id: assigneeId,
      assigned_to_name: assigneeName,
    });

    await operationsRepository.addIncidentTimeline({
      id: randomUUID(),
      incident_id: incidentId,
      action: 'INCIDENT_ASSIGNED',
      actor_user_id: actorId,
      actor_name: actorName || 'Operations Agent',
      note: `Incident assigned to ${assigneeName || assigneeId}`,
      metadata: { assigneeId, assigneeName },
      created_at: now,
    });

    return updated || existing;
  }

  public async resolveIncident(
    incidentId: string,
    userId?: string,
    userName?: string,
    resolutionNotes?: string
  ): Promise<OperationalIncident> {
    const existing = await operationsRepository.getIncidentById(incidentId);
    if (!existing) {
      throw new Error(`Incident ${incidentId} not found`);
    }

    const now = new Date().toISOString();
    const updated = await operationsRepository.updateIncident(incidentId, {
      status: 'RESOLVED',
      resolved_at: now,
    });

    await operationsRepository.addIncidentTimeline({
      id: randomUUID(),
      incident_id: incidentId,
      action: 'INCIDENT_RESOLVED',
      actor_user_id: userId,
      actor_name: userName || 'Operations Agent',
      note: resolutionNotes || `Incident marked resolved by ${userName || 'Operations Agent'}`,
      metadata: { resolutionNotes },
      created_at: now,
    });

    const result = updated || existing;
    await this.publishIncidentEvent('operations.incident_resolved', result);
    return result;
  }

  public async dismissIncident(
    incidentId: string,
    userId?: string,
    userName?: string,
    reason?: string
  ): Promise<OperationalIncident> {
    const existing = await operationsRepository.getIncidentById(incidentId);
    if (!existing) {
      throw new Error(`Incident ${incidentId} not found`);
    }

    const now = new Date().toISOString();
    const updated = await operationsRepository.updateIncident(incidentId, {
      status: 'DISMISSED',
      resolved_at: now,
    });

    await operationsRepository.addIncidentTimeline({
      id: randomUUID(),
      incident_id: incidentId,
      action: 'INCIDENT_DISMISSED',
      actor_user_id: userId,
      actor_name: userName || 'Operations Agent',
      note: reason || `Incident dismissed as false alarm / duplicate by ${userName || 'Operations Agent'}`,
      metadata: { reason },
      created_at: now,
    });

    return updated || existing;
  }

  public async reopenIncident(
    incidentId: string,
    userId?: string,
    userName?: string,
    reason?: string
  ): Promise<OperationalIncident> {
    const existing = await operationsRepository.getIncidentById(incidentId);
    if (!existing) {
      throw new Error(`Incident ${incidentId} not found`);
    }

    const now = new Date().toISOString();
    const updated = await operationsRepository.updateIncident(incidentId, {
      status: 'OPEN',
      resolved_at: null,
    });

    await operationsRepository.addIncidentTimeline({
      id: randomUUID(),
      incident_id: incidentId,
      action: 'INCIDENT_REOPENED',
      actor_user_id: userId,
      actor_name: userName || 'Operations Agent',
      note: reason || `Incident reopened by ${userName || 'Operations Agent'}`,
      metadata: { reason },
      created_at: now,
    });

    return updated || existing;
  }

  public async addTimelineNote(
    incidentId: string,
    userId?: string,
    userName?: string,
    note?: string,
    metadata?: Record<string, any>
  ): Promise<IncidentTimelineEntry> {
    const existing = await operationsRepository.getIncidentById(incidentId);
    if (!existing) {
      throw new Error(`Incident ${incidentId} not found`);
    }

    const entry: IncidentTimelineEntry = {
      id: randomUUID(),
      incident_id: incidentId,
      action: 'NOTE_ADDED',
      actor_user_id: userId,
      actor_name: userName || 'Operations Agent',
      note: note || '',
      metadata: metadata || {},
      created_at: new Date().toISOString(),
    };

    return operationsRepository.addIncidentTimeline(entry);
  }

  // ============================================================================
  // Automated Detection Scanners
  // ============================================================================

  /**
   * Scan for stuck orders (placed without response, preparation delays, ready without courier)
   */
  public async scanStuckOrders(): Promise<OperationalIncident[]> {
    const raisedIncidents: OperationalIncident[] = [];
    const now = new Date();

    try {
      // Find orders in PLACED, PREPARING, READY
      const activeStatuses = ['PLACED', 'PREPARING', 'READY'];
      const { orders } = await orderRepository.findAllOrders({ limit: 1000 } as any);
      const targetOrders = orders.filter((o) => activeStatuses.includes(o.status));

      for (const order of targetOrders) {
        const slaResults = operationsSlaService.evaluateOrder(order, now);

        for (const breach of slaResults) {
          if (breach.status === 'BREACHED') {
            let severity: IncidentSeverity = 'MEDIUM';
            let reasonCode = 'OP_ORDER_STUCK';

            if (breach.slaType === 'MERCHANT_RESPONSE_DELAY') {
              severity = breach.elapsedMinutes > 15 ? 'HIGH' : 'MEDIUM';
              reasonCode = 'MERCHANT_RESPONSE_DELAY';
            } else if (breach.slaType === 'MERCHANT_PREPARATION_DELAY') {
              severity = breach.elapsedMinutes > 30 ? 'HIGH' : 'MEDIUM';
              reasonCode = 'MERCHANT_PREPARATION_DELAY';
            } else if (breach.slaType === 'DISPATCH_DELAY') {
              severity = breach.elapsedMinutes > 10 ? 'HIGH' : 'MEDIUM';
              reasonCode = 'DISPATCH_NO_RIDER';
            }

            let incidentType = breach.slaType;
            if (order.status === 'PLACED') {
              incidentType = 'ORDER_STUCK_PLACED';
              reasonCode = 'MERCHANT_RESPONSE_DELAY';
            }

            const incident = await this.raiseIncident({
              type: incidentType,
              severity,
              order_id: order.id,
              merchant_id: (order as any).merchant_id || (order as any).branch_id,
              customer_id: order.customer_id,
              reason_code: reasonCode,
              summary: breach.details,
              details: `Order #${order.order_number || order.id} status is ${order.status}. Elapsed time: ${breach.elapsedMinutes}m.`,
              metadata: {
                orderNumber: order.order_number,
                orderStatus: order.status,
                elapsedMinutes: breach.elapsedMinutes,
                thresholdMinutes: breach.thresholdMinutes,
              },
            });
            raisedIncidents.push(incident);
          }
        }
      }
    } catch (err: any) {
      logger.error('Error running scanStuckOrders', { error: err.message });
    }

    return raisedIncidents;
  }

  /**
   * Scan for stuck deliveries (unassigned, pickup delays, kitchen wait, travel delays, stale GPS)
   */
  public async scanStuckDeliveries(): Promise<OperationalIncident[]> {
    const raisedIncidents: OperationalIncident[] = [];
    const now = new Date();

    try {
      const activeStatuses = ['UNASSIGNED', 'ASSIGNED', 'ARRIVED_PICKUP', 'PICKED_UP', 'EN_ROUTE', 'ARRIVED_DROPOFF'];
      const allDeliveries = await deliveryRepository.findAll();
      const deliveries = allDeliveries.filter((d) => activeStatuses.includes(d.status));

      for (const delivery of deliveries) {
        const slaResults = operationsSlaService.evaluateDelivery(delivery, now);

        for (const breach of slaResults) {
          if (breach.status === 'BREACHED') {
            let severity: IncidentSeverity = 'MEDIUM';
            let reasonCode = 'OP_DELIVERY_DELAY';

            if (breach.slaType === 'DISPATCH_NO_RIDER') {
              severity = breach.elapsedMinutes > 10 ? 'HIGH' : 'MEDIUM';
              reasonCode = 'DISPATCH_NO_RIDER';
            } else if (breach.slaType === 'RIDER_LOCATION_STALE') {
              severity = breach.elapsedMinutes > 15 ? 'HIGH' : 'LOW';
              reasonCode = 'RIDER_LOCATION_STALE';
            } else if (breach.slaType === 'DELIVERY_DELAY') {
              severity = breach.elapsedMinutes > 45 ? 'HIGH' : 'MEDIUM';
              reasonCode = 'DELIVERY_DELAY';
            }

            let incidentType = breach.slaType;
            if (delivery.status === 'UNASSIGNED') {
              incidentType = 'DELIVERY_DISPATCH_UNASSIGNED_TIMEOUT';
            }

            const incident = await this.raiseIncident({
              type: incidentType,
              severity,
              delivery_id: delivery.id,
              order_id: delivery.order_id,
              rider_id: delivery.rider_id,
              merchant_id: delivery.pickup?.branch_id,
              reason_code: reasonCode,
              summary: breach.details,
              details: `Delivery ${delivery.id} status is ${delivery.status}. Elapsed time: ${breach.elapsedMinutes}m.`,
              metadata: {
                deliveryStatus: delivery.status,
                elapsedMinutes: breach.elapsedMinutes,
                thresholdMinutes: breach.thresholdMinutes,
                riderId: delivery.rider_id,
              },
            });
            raisedIncidents.push(incident);
          }
        }
      }
    } catch (err: any) {
      logger.error('Error running scanStuckDeliveries', { error: err.message });
    }

    return raisedIncidents;
  }

  /**
   * Scan for payment incidents (stuck pending payments, callbacks not received)
   */
  public async scanPaymentIncidents(): Promise<OperationalIncident[]> {
    const raisedIncidents: OperationalIncident[] = [];
    const now = new Date();

    try {
      const allPayments = await paymentRepository.findAll();
      const pendingPayments = allPayments.filter((p) => p.status === 'PENDING');

      for (const payment of pendingPayments) {
        const slaResults = operationsSlaService.evaluatePayment(payment, now);

        for (const breach of slaResults) {
          if (breach.status === 'BREACHED') {
            const severity: IncidentSeverity = breach.elapsedMinutes > 15 ? 'HIGH' : 'MEDIUM';

            const incident = await this.raiseIncident({
              type: 'PAYMENT_PENDING',
              severity,
              payment_id: payment.id,
              order_id: payment.order_id,
              customer_id: payment.customer_id,
              reason_code: 'PAYMENT_PENDING',
              summary: breach.details,
              details: `Payment ${payment.id} has been PENDING for ${breach.elapsedMinutes}m without callback receipt. Provider: ${payment.provider}`,
              metadata: {
                provider: payment.provider,
                amountMinor: payment.amount_minor,
                currency: payment.currency,
                elapsedMinutes: breach.elapsedMinutes,
              },
            });
            raisedIncidents.push(incident);
          }
        }
      }
    } catch (err: any) {
      logger.error('Error running scanPaymentIncidents', { error: err.message });
    }

    return raisedIncidents;
  }

  /**
   * Run all operational scans
   */
  public async runAllScans(): Promise<{
    orderIncidents: OperationalIncident[];
    deliveryIncidents: OperationalIncident[];
    paymentIncidents: OperationalIncident[];
  }> {
    const orderIncidents = await this.scanStuckOrders();
    const deliveryIncidents = await this.scanStuckDeliveries();
    const paymentIncidents = await this.scanPaymentIncidents();

    return {
      orderIncidents,
      deliveryIncidents,
      paymentIncidents,
    };
  }

  private async publishIncidentEvent(eventType: string, incident: OperationalIncident): Promise<void> {
    try {
      await orderEventBroker.publish('admin:operations', {
        channel: 'admin:operations',
        type: eventType,
        orderId: incident.order_id || '',
        orderNumber: '',
        status: incident.status as any,
        timestamp: new Date().toISOString(),
        data: incident,
      });
    } catch {
      allowMemoryAdapter();
      // ignore
    }
  }
}

export const operationalIncidentService = transactionalService(new OperationalIncidentService());
