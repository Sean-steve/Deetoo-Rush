/**
 * DEETOO - Authoritative Payment State Machine
 * Based on Section 6, 7 & 8 of Sprint 11 Specifications
 * Enforces valid state transitions, state regression prevention, and terminal states.
 */

import { PaymentStatus, RefundStatus, PAYMENT_STATUS_TRANSITIONS, REFUND_STATUS_TRANSITIONS } from '@deetoo/types';
import { AppError } from '../../middleware/error-handler';

export class PaymentStateMachine {
  /**
   * Terminal payment states that allow no further progression except refunding from CAPTURED
   */
  public static readonly TERMINAL_PAYMENT_STATES: ReadonlySet<PaymentStatus> = new Set([
    PaymentStatus.FAILED,
    PaymentStatus.CANCELLED,
    PaymentStatus.EXPIRED,
    PaymentStatus.REFUNDED,
  ]);

  /**
   * Terminal refund states
   */
  public static readonly TERMINAL_REFUND_STATES: ReadonlySet<RefundStatus> = new Set([
    RefundStatus.SUCCEEDED,
    RefundStatus.FAILED,
    RefundStatus.CANCELLED,
  ]);

  /**
   * Verifies if a transition is valid and throws AppError(400) if illegal
   */
  public static validatePaymentTransition(from: PaymentStatus, to: PaymentStatus): void {
    // If attempting to transition to same state, it is idempotent
    if (from === to) {
      return;
    }

    // Critical State Regression Protection:
    // A captured payment can NEVER regress to FAILED, PENDING, or CANCELLED on out-of-order callback
    if (
      (from === PaymentStatus.CAPTURED || from === PaymentStatus.PARTIALLY_REFUNDED) &&
      (to === PaymentStatus.PENDING || to === PaymentStatus.FAILED || to === PaymentStatus.CANCELLED || to === PaymentStatus.INITIATED)
    ) {
      throw new AppError(
        400,
        'ILLEGAL_PAYMENT_STATE_REGRESSION',
        `Captured payment cannot regress from ${from} to ${to}`
      );
    }

    const allowed = PAYMENT_STATUS_TRANSITIONS[from];
    if (!allowed || !allowed.includes(to)) {
      throw new AppError(
        400,
        'INVALID_PAYMENT_STATE_TRANSITION',
        `Illegal payment transition from ${from} to ${to}`
      );
    }
  }

  /**
   * Check without throwing
   */
  public static canTransitionPayment(from: PaymentStatus, to: PaymentStatus): boolean {
    if (from === to) return true;
    const allowed = PAYMENT_STATUS_TRANSITIONS[from];
    return allowed?.includes(to) ?? false;
  }

  /**
   * Verifies if a refund transition is valid
   */
  public static validateRefundTransition(from: RefundStatus, to: RefundStatus): void {
    if (from === to) {
      return;
    }

    const allowed = REFUND_STATUS_TRANSITIONS[from];
    if (!allowed || !allowed.includes(to)) {
      throw new AppError(
        400,
        'INVALID_REFUND_STATE_TRANSITION',
        `Illegal refund transition from ${from} to ${to}`
      );
    }
  }

  /**
   * Check refund transition without throwing
   */
  public static canTransitionRefund(from: RefundStatus, to: RefundStatus): boolean {
    if (from === to) return true;
    const allowed = REFUND_STATUS_TRANSITIONS[from];
    return allowed?.includes(to) ?? false;
  }

  public static isTerminalPayment(status: PaymentStatus): boolean {
    return this.TERMINAL_PAYMENT_STATES.has(status);
  }

  public static isTerminalRefund(status: RefundStatus): boolean {
    return this.TERMINAL_REFUND_STATES.has(status);
  }
}
