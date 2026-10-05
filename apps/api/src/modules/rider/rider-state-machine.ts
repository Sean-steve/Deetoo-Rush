/**
 * DEETOO - Authoritative Rider State Machine & Transition Rules
 * Implements Section 7, 24, 77-82 of Sprint 8
 */

import {
  RiderWorkStatus,
  RiderOperationalStatus,
  RiderOnboardingStatus,
  RIDER_WORK_STATUS_TRANSITIONS,
} from '@deetoo/types';
import { AppError } from '../../middleware/error-handler';

export class RiderStateMachine {
  /**
   * Verifies whether a transition from one RiderWorkStatus to another is structurally valid.
   */
  public static isValidTransition(from: RiderWorkStatus, to: RiderWorkStatus): boolean {
    if (from === to) return true;
    const allowed = RIDER_WORK_STATUS_TRANSITIONS[from];
    return allowed ? allowed.includes(to) : false;
  }

  /**
   * Asserts and enforces that a work transition satisfies all operational guards.
   */
  public static assertCanTransition(
    from: RiderWorkStatus,
    to: RiderWorkStatus,
    context: {
      onboardingStatus: RiderOnboardingStatus;
      operationalStatus: RiderOperationalStatus;
      hasLocation?: boolean;
    }
  ): void {
    // 1. Structural transition check
    if (!this.isValidTransition(from, to)) {
      throw new AppError(
        409,
        'RIDER_INVALID_STATE_TRANSITION',
        `Cannot transition rider work status from ${from} to ${to}`,
        { from, to }
      );
    }

    // 2. Operational guards for going ONLINE_AVAILABLE
    if (to === RiderWorkStatus.ONLINE_AVAILABLE) {
      if (context.operationalStatus === RiderOperationalStatus.SUSPENDED) {
        throw new AppError(
          403,
          'RIDER_SUSPENDED',
          'Rider account is suspended and cannot go online'
        );
      }

      if (context.operationalStatus === RiderOperationalStatus.DISABLED) {
        throw new AppError(
          403,
          'RIDER_DISABLED',
          'Rider account is disabled and cannot go online'
        );
      }

      if (context.onboardingStatus !== RiderOnboardingStatus.APPROVED) {
        throw new AppError(
          403,
          'RIDER_NOT_APPROVED',
          `Rider onboarding is ${context.onboardingStatus}. Operational approval is required to go online.`,
          { onboardingStatus: context.onboardingStatus }
        );
      }
    }
  }
}
