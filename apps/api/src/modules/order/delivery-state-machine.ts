/**
 * DEETOO - Authoritative Delivery State Machine
 * Implements Sprint 9: Delivery Lifecycle, Strict Transition Validation & Operational Guards
 */

import {
  DeliveryStatus,
  DELIVERY_STATUS_TRANSITIONS,
  canTransitionDelivery,
  DeliveryTimelineEntry,
} from '@deetoo/types';
import { AppError } from '../../middleware/error-handler';

export interface DeliveryTransitionParams {
  targetStatus: DeliveryStatus;
  actorType: 'SYSTEM' | 'RIDER' | 'ADMIN' | 'MERCHANT';
  actorId?: string;
  actorName?: string;
  reasonCode?: string;
  note?: string;
  metadata?: Record<string, unknown>;
}

export interface DeliveryTransitionResult {
  previousStatus: DeliveryStatus;
  newStatus: DeliveryStatus;
  targetStatus?: DeliveryStatus;
  timelineEntry: Omit<DeliveryTimelineEntry, 'id' | 'created_at'>;
  updatedFields: Record<string, unknown>;
}

export class DeliveryStateMachine {
  /**
   * Validates if transition is permitted
   */
  public static canTransition(from: DeliveryStatus, to: DeliveryStatus): boolean {
    return canTransitionDelivery(from, to);
  }

  /**
   * Executes transition validation and produces timestamped updates & timeline entry
   */
  public static transition(
    currentStatus: DeliveryStatus,
    deliveryId: string,
    params: DeliveryTransitionParams
  ): DeliveryTransitionResult {
    const { targetStatus, actorType, actorId, actorName, reasonCode, note, metadata } = params;

    // Terminal state check
    if (currentStatus === DeliveryStatus.DELIVERED || currentStatus === DeliveryStatus.CANCELLED) {
      throw new AppError(
        409,
        'DELIVERY_TERMINAL_STATE',
        `Cannot transition delivery from terminal state ${currentStatus}`,
        { currentStatus, targetStatus }
      );
    }

    const isExplicitAdminFailedDeliveryCompletion =
      actorType === 'ADMIN' &&
      currentStatus === DeliveryStatus.FAILED &&
      targetStatus === DeliveryStatus.DELIVERED &&
      Boolean(reasonCode);

    if (
      !canTransitionDelivery(currentStatus, targetStatus) &&
      !isExplicitAdminFailedDeliveryCompletion
    ) {
      throw new AppError(
        409,
        'DELIVERY_INVALID_STATE_TRANSITION',
        `Invalid delivery status transition from ${currentStatus} to ${targetStatus}`,
        { currentStatus, targetStatus }
      );
    }

    const now = new Date().toISOString();
    const updatedFields: Record<string, unknown> = {
      status: targetStatus,
      updated_at: now,
    };

    // Populate phase-specific timestamps
    switch (targetStatus) {
      case DeliveryStatus.ASSIGNED:
        updatedFields.assigned_at = now;
        break;
      case DeliveryStatus.ARRIVED_PICKUP:
        updatedFields.arrived_pickup_at = now;
        break;
      case DeliveryStatus.PICKED_UP:
        updatedFields.picked_up_at = now;
        break;
      case DeliveryStatus.EN_ROUTE:
        updatedFields.en_route_at = now;
        break;
      case DeliveryStatus.ARRIVED_DROPOFF:
        updatedFields.arrived_dropoff_at = now;
        break;
      case DeliveryStatus.DELIVERED:
        updatedFields.delivered_at = now;
        if (metadata?.proofType) {
          updatedFields.proof_type = metadata.proofType;
        }
        if (metadata?.proofRef) {
          updatedFields.proof_reference = metadata.proofRef;
        }
        break;
      case DeliveryStatus.FAILED:
        updatedFields.failed_at = now;
        updatedFields.dispatch_attention_required = true;
        updatedFields.attention_reason = note || reasonCode || 'Delivery marked failed';
        if (reasonCode) updatedFields.failure_reason = reasonCode;
        if (note) updatedFields.failure_note = note;
        break;
      case DeliveryStatus.CANCELLED:
        updatedFields.cancelled_at = now;
        break;
      case DeliveryStatus.UNASSIGNED:
        // Reset assignment fields
        updatedFields.assigned_rider_id = null;
        updatedFields.assigned_rider_name = null;
        updatedFields.assigned_rider_phone = null;
        break;
    }

    const timelineEntry: Omit<DeliveryTimelineEntry, 'id' | 'created_at'> = {
      delivery_id: deliveryId,
      from_status: currentStatus,
      to_status: targetStatus,
      actor_type: actorType,
      actor_id: actorId || null,
      actor_name: actorName || null,
      action: `DELIVERY_${targetStatus}`,
      reason_code: reasonCode || null,
      note: note || null,
      metadata: metadata || {},
    };

    return {
      previousStatus: currentStatus,
      newStatus: targetStatus,
      targetStatus,
      timelineEntry,
      updatedFields,
    };
  }
}
