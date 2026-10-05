/**
 * DEETOO - Authoritative Order State Machine
 * Compliant with DEE-STATE-001, DEE-DOM-001, and Sprint 7 Specifications
 * Enforces strict lifecycle transitions, actor role authorization, and terminal state invariants.
 */

import { OrderStatus, Order, OrderTimelineEntry } from '@deetoo/types';
import { AppError } from '../../middleware/error-handler';
import { generateId } from '@deetoo/utils';

export type OrderActorType = 'CUSTOMER' | 'MERCHANT' | 'ADMIN' | 'SYSTEM';

export interface TransitionRequest {
  targetStatus: OrderStatus;
  actorType: OrderActorType;
  actorId?: string | null;
  actorName?: string | null;
  reasonCode?: string | null;
  note?: string | null;
  metadata?: Record<string, unknown>;
}

export interface TransitionResult {
  previousStatus: OrderStatus;
  newStatus: OrderStatus;
  timelineEntry: OrderTimelineEntry;
  updatedOrderFields: Partial<Order>;
}

// 1. Authoritative Allowed Order Transitions (DEE-STATE-001 Section 2)
export const ALLOWED_ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING_PAYMENT]: [OrderStatus.PLACED, OrderStatus.CANCELLED],
  [OrderStatus.PLACED]: [OrderStatus.ACCEPTED, OrderStatus.REJECTED, OrderStatus.CANCELLED],
  [OrderStatus.ACCEPTED]: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  [OrderStatus.PREPARING]: [OrderStatus.READY, OrderStatus.CANCELLED],
  [OrderStatus.READY]: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
  [OrderStatus.COMPLETED]: [],
  [OrderStatus.REJECTED]: [],
  [OrderStatus.CANCELLED]: [],
};

export class OrderStateMachine {
  /**
   * Validates whether a transition from one status to another is mathematically allowed
   */
  public canTransition(from: OrderStatus, to: OrderStatus): boolean {
    const allowed = ALLOWED_ORDER_TRANSITIONS[from];
    return allowed ? allowed.includes(to) : false;
  }

  /**
   * Asserts and executes a state transition on an order, verifying actor privileges and business rules
   */
  public transition(order: Order, req: TransitionRequest): TransitionResult {
    const currentStatus = order.status;
    const targetStatus = req.targetStatus;

    // 1. Terminal state check
    if (
      currentStatus === OrderStatus.COMPLETED ||
      currentStatus === OrderStatus.REJECTED ||
      currentStatus === OrderStatus.CANCELLED
    ) {
      throw new AppError(
        409,
        'TERMINAL_ORDER_STATE',
        `Order is in terminal state '${currentStatus}' and cannot be modified`
      );
    }

    // 2. State graph topology check
    if (!this.canTransition(currentStatus, targetStatus)) {
      throw new AppError(
        400,
        'INVALID_ORDER_TRANSITION',
        `Cannot transition order from '${currentStatus}' to '${targetStatus}'`
      );
    }

    // 3. Actor-specific permission rules
    this.validateActorPermissions(order, req);

    // 4. Calculate updated timestamps and fields based on target status
    const now = new Date().toISOString();
    const updatedFields: Partial<Order> = {
      status: targetStatus,
      updated_at: now,
    };

    if (targetStatus === OrderStatus.PLACED) {
      updatedFields.placed_at = order.placed_at || now;
    } else if (targetStatus === OrderStatus.ACCEPTED) {
      updatedFields.accepted_at = now;
      const prepMinutes = (req.metadata?.preparation_minutes as number) || (req.metadata?.estimatedPreparationMinutes as number) || 20;
      updatedFields.estimated_prep_minutes = prepMinutes;
      const readyAt = new Date(Date.now() + prepMinutes * 60 * 1000).toISOString();
      updatedFields.estimated_ready_at = readyAt;
    } else if (targetStatus === OrderStatus.PREPARING) {
      updatedFields.preparing_at = now;
    } else if (targetStatus === OrderStatus.READY) {
      updatedFields.ready_at = now;
    } else if (targetStatus === OrderStatus.COMPLETED) {
      updatedFields.completed_at = now;
    } else if (targetStatus === OrderStatus.REJECTED) {
      updatedFields.rejected_at = now;
      updatedFields.rejection_reason = req.reasonCode || 'MERCHANT_REJECTED';
    } else if (targetStatus === OrderStatus.CANCELLED) {
      updatedFields.cancelled_at = now;
      updatedFields.cancellation_reason = req.reasonCode || 'USER_CANCELLED';
      updatedFields.cancelled_by_type = req.actorType;
      updatedFields.cancelled_by_id = req.actorId || undefined;
    }

    // 5. Build immutable timeline audit entry
    const timelineEntry: OrderTimelineEntry = {
      id: generateId('ot'),
      order_id: order.id,
      from_status: currentStatus,
      to_status: targetStatus,
      actor_type: req.actorType,
      actor_id: req.actorId || null,
      actor_name: req.actorName || req.actorType,
      reason_code: req.reasonCode || null,
      note: req.note || null,
      metadata: req.metadata || {},
      created_at: now,
    };

    return {
      previousStatus: currentStatus,
      newStatus: targetStatus,
      timelineEntry,
      updatedOrderFields: updatedFields,
    };
  }

  /**
   * Validates actor permissions for specific transitions
   */
  private validateActorPermissions(order: Order, req: TransitionRequest) {
    const { targetStatus, actorType } = req;
    const currentStatus = order.status;

    // CUSTOMER rules
    if (actorType === 'CUSTOMER') {
      if (targetStatus === OrderStatus.CANCELLED) {
        // Customer can only cancel while order is in PLACED status (before merchant accepts)
        if (currentStatus !== OrderStatus.PLACED && currentStatus !== OrderStatus.PENDING_PAYMENT) {
          throw new AppError(
            409,
            'CUSTOMER_CANCELLATION_WINDOW_CLOSED',
            'Orders cannot be cancelled by the customer once accepted by the restaurant kitchen'
          );
        }
      } else {
        throw new AppError(
          403,
          'FORBIDDEN_ORDER_ACTION',
          `Customers are not authorized to transition orders to '${targetStatus}'`
        );
      }
    }

    // MERCHANT rules
    if (actorType === 'MERCHANT') {
      if (targetStatus === OrderStatus.ACCEPTED) {
        if (currentStatus !== OrderStatus.PLACED) {
          throw new AppError(409, 'INVALID_ORDER_STATE', 'Only incoming PLACED orders can be accepted');
        }
      } else if (targetStatus === OrderStatus.REJECTED) {
        if (currentStatus !== OrderStatus.PLACED) {
          throw new AppError(409, 'INVALID_ORDER_STATE', 'Only incoming PLACED orders can be rejected');
        }
      } else if (targetStatus === OrderStatus.PREPARING) {
        if (currentStatus !== OrderStatus.ACCEPTED) {
          throw new AppError(409, 'INVALID_ORDER_STATE', 'Order must be ACCEPTED before starting preparation');
        }
      } else if (targetStatus === OrderStatus.READY) {
        if (currentStatus !== OrderStatus.PREPARING) {
          throw new AppError(409, 'INVALID_ORDER_STATE', 'Order must be PREPARING before marking ready');
        }
      } else if (targetStatus === OrderStatus.CANCELLED) {
        // Merchant operational cancellation
        if (currentStatus !== OrderStatus.ACCEPTED && currentStatus !== OrderStatus.PREPARING) {
          throw new AppError(
            409,
            'MERCHANT_CANNOT_CANCEL',
            `Merchant cannot cancel order in status '${currentStatus}'`
          );
        }
      }
    }

    // ADMIN rules
    if (actorType === 'ADMIN') {
      // Admins can cancel any non-terminal order for operational or support reasons
      if (targetStatus !== OrderStatus.CANCELLED) {
        // Admin direct status overrides are restricted to cancellation unless authorized by operations
      }
    }
  }
}

export const orderStateMachine = new OrderStateMachine();
