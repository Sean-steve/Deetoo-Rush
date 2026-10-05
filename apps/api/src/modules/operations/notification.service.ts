import { transactionalService } from '../../db/transaction';
import { requireSimulationMode } from '../../db/storage-policy';
/**
 * DEETOO - Multi-Channel Notification Service
 * Sprint 13: Transactional Notifications, Idempotency, Delivery Simulation, Retries & Dead-Letter Integration
 */

import { randomUUID } from 'crypto';
import { logger } from '@deetoo/utils';
import {
  NotificationRecord,
  NotificationChannel,
  NotificationRecipientType,
  NotificationStatus,
} from '@deetoo/types';
import { operationsRepository } from './operations.repository';
import { orderEventBroker } from '../realtime/event-broker';

export interface SendNotificationParams {
  recipientType: NotificationRecipientType;
  recipientId: string;
  channel: NotificationChannel;
  templateCode: string;
  subject?: string;
  payload: Record<string, any>;
  referenceId?: string; // e.g. orderId, deliveryId, paymentId for idempotency
}

export class NotificationService {
  /**
   * Send notification across designated channel with idempotency guarantee
   */
  public async sendNotification(params: SendNotificationParams): Promise<NotificationRecord> {
    const idempotencyKey = `${params.recipientType}:${params.recipientId}:${params.templateCode}:${params.referenceId || 'single'}`;

    // 1. Idempotency Check
    const existing = await operationsRepository.getNotificationByIdempotencyKey(idempotencyKey);
    if (existing) {
      return existing;
    }

    const notificationId = randomUUID();
    const now = new Date().toISOString();

    const record: NotificationRecord = {
      id: notificationId,
      recipient_type: params.recipientType,
      recipient_id: params.recipientId,
      channel: params.channel,
      template_code: params.templateCode,
      status: 'PENDING',
      subject: params.subject || this.renderDefaultSubject(params.templateCode, params.payload),
      payload: params.payload,
      provider: 'SIMULATED',
      retry_count: 0,
      max_retries: 3,
      idempotency_key: idempotencyKey,
      created_at: now,
    };

    const saved = await operationsRepository.createNotification(record);

    // 2. Dispatch via Simulated Channel Provider
    return this.dispatch(saved);
  }

  /**
   * Internal channel dispatcher with bounded retry and failure tracking
   */
  private async dispatch(record: NotificationRecord): Promise<NotificationRecord> {
    const now = new Date().toISOString();

    try {
      let providerRef: string;
      if (record.channel === 'IN_APP') {
        // IN_APP has a genuine, non-simulated delivery mechanism (the realtime SSE broker below)
        // and does not depend on any third-party integration, so it is never subject to the
        // simulation-mode guard that PUSH/SMS/EMAIL correctly remain behind.
        providerRef = `sse_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      } else {
        // No SMS/Email/Push provider (Africa's Talking, SendGrid/SES, FCM/APNs, etc.) exists in
        // this codebase. This guard is deliberately left in place rather than guessing at a
        // vendor and fabricating an unverifiable integration -- fail closed, don't fail silent.
        requireSimulationMode();
        providerRef = `sim_${record.channel.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      }

      // Simulate delivery success
      const delivered: Partial<NotificationRecord> = {
        status: 'DELIVERED',
        provider_reference: providerRef,
        sent_at: now,
        delivered_at: now,
      };

      const updated = await operationsRepository.updateNotification(record.id, delivered);

      // Publish in-app event if IN_APP channel
      if (record.channel === 'IN_APP') {
        const channelKey = `${record.recipient_type.toLowerCase()}:${record.recipient_id}`;
        await orderEventBroker.publish(channelKey, {
          channel: channelKey,
          type: 'notification.received',
          orderId: record.payload?.orderId || '',
          orderNumber: record.payload?.orderNumber || '',
          status: 'COMPLETED' as any,
          timestamp: now,
          data: updated || record,
        });
      }

      logger.info('Notification delivered', {
        service: 'notification-service',
        channel: record.channel,
        template: record.template_code,
        recipient: this.maskRecipient(record.recipient_id),
      });

      return updated || record;
    } catch (err: any) {
      const nextRetry = record.retry_count + 1;
      const isFinalFailure = nextRetry >= record.max_retries;

      const failureUpdate: Partial<NotificationRecord> = {
        status: 'FAILED',
        failed_at: now,
        failure_code: 'PROVIDER_ERROR',
        failure_reason: err.message,
        retry_count: nextRetry,
      };

      const updated = await operationsRepository.updateNotification(record.id, failureUpdate);

      // If max retries reached, route to dead-letter queue
      if (isFinalFailure) {
        await operationsRepository.createDeadLetterJob({
          id: randomUUID(),
          job_type: 'NOTIFICATION_DELIVERY',
          job_id: record.id,
          payload: {
            recipientType: record.recipient_type,
            recipientId: this.maskRecipient(record.recipient_id),
            channel: record.channel,
            templateCode: record.template_code,
          },
          attempt_count: nextRetry,
          max_attempts: record.max_retries,
          last_error: err.message,
          status: 'DEAD_LETTER',
          failed_at: now,
        });
      }

      return updated || record;
    }
  }

  /**
   * Retry sending a failed notification
   */
  public async retryNotification(notificationId: string): Promise<NotificationRecord> {
    const record = await operationsRepository.getNotificationById(notificationId);
    if (!record) {
      throw new Error(`Notification ${notificationId} not found`);
    }

    if (record.status === 'DELIVERED') {
      return record;
    }

    return this.dispatch(record);
  }

  /**
   * Mark in-app notification as read
   */
  public async markAsRead(notificationId: string, recipientId: string): Promise<NotificationRecord> {
    const record = await operationsRepository.getNotificationById(notificationId);
    if (!record || record.recipient_id !== recipientId) {
      throw new Error('Notification not found or unauthorized');
    }

    const updated = await operationsRepository.updateNotification(notificationId, {
      read_at: new Date().toISOString(),
    });

    return updated || record;
  }

  /**
   * Generate human-readable default subject from template code
   */
  private renderDefaultSubject(templateCode: string, payload: Record<string, any>): string {
    switch (templateCode) {
      case 'CUSTOMER_ORDER_ACCEPTED':
        return `Order #${payload.orderNumber || ''} Accepted!`;
      case 'CUSTOMER_ORDER_REJECTED':
        return `Order #${payload.orderNumber || ''} Update`;
      case 'CUSTOMER_RIDER_ASSIGNED':
        return `Courier Assigned to Order #${payload.orderNumber || ''}`;
      case 'CUSTOMER_ORDER_PICKED_UP':
        return `Order #${payload.orderNumber || ''} Picked Up`;
      case 'CUSTOMER_RIDER_ARRIVED':
        return `Courier Arrived with Order #${payload.orderNumber || ''}`;
      case 'CUSTOMER_ORDER_DELIVERED':
        return `Order #${payload.orderNumber || ''} Delivered`;
      case 'MERCHANT_NEW_ORDER':
        return `New Order #${payload.orderNumber || ''}!`;
      case 'PAYMENT_SUCCESS':
        return `Payment Received: KES ${(Number(payload.amountMinor || 0) / 100).toFixed(2)}`;
      case 'PAYMENT_FAILED':
        return `Payment Failed for Order #${payload.orderNumber || ''}`;
      case 'REFUND_SUCCESS':
        return `Refund Processed for Order #${payload.orderNumber || ''}`;
      case 'SLA_ALERT':
        return `Operational SLA Breach: ${payload.slaType || ''}`;
      default:
        return 'Deetoo Notification';
    }
  }

  /**
   * Safe PII scrubber/masker for logging
   */
  private maskRecipient(recipient: string): string {
    if (!recipient) return 'unknown';
    if (recipient.includes('@')) {
      const [user, domain] = recipient.split('@');
      return `${user.slice(0, 2)}***@${domain}`;
    }
    if (recipient.length > 7) {
      return `${recipient.slice(0, 4)}***${recipient.slice(-3)}`;
    }
    return '***';
  }
}

export const notificationService = transactionalService(new NotificationService());
