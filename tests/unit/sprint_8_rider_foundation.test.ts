/**
 * DEETOO - Sprint 8 Unit Tests: Rider Application Foundation & Eligibility
 * Validates rider operational eligibility, availability state preconditions,
 * GPS location ingestion boundaries, and admin action contracts (DEE-RID-001)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  RiderOnboardingStatus,
  RiderOperationalStatus,
  RiderWorkStatus,
  VehicleType,
} from '@deetoo/types';
import { riderEligibilityService } from '../../apps/api/src/modules/rider/rider-eligibility.service';
import {
  RiderLocationSchema,
  RiderVehicleSchema,
  AdminRejectRiderSchema,
  AdminSuspendRiderSchema,
} from '@deetoo/validation';
import { isLocalDevelopmentApiOrigin } from '../../apps/rider-android/src/index';

describe('Sprint 8: Rider Operational Eligibility & Foundation', () => {
  describe('Authoritative Eligibility Evaluation', () => {
    test('marks rider eligible when APPROVED, ACTIVE, and vehicle is configured', () => {
      const evaluation = riderEligibilityService.evaluateEligibilityCriteria({
        onboardingStatus: RiderOnboardingStatus.APPROVED,
        operationalStatus: RiderOperationalStatus.ACTIVE,
        vehicleType: VehicleType.MOTORBIKE,
      });

      assert.strictEqual(evaluation.isEligible, true);
      assert.strictEqual(evaluation.canGoOnline, true);
      assert.strictEqual(evaluation.blockers.length, 0);
    });

    test('rejects eligibility when onboarding is PENDING_REVIEW (Authentication != Eligibility)', () => {
      const evaluation = riderEligibilityService.evaluateEligibilityCriteria({
        onboardingStatus: RiderOnboardingStatus.PENDING_REVIEW,
        operationalStatus: RiderOperationalStatus.ACTIVE,
        vehicleType: VehicleType.MOTORBIKE,
      });

      assert.strictEqual(evaluation.isEligible, false);
      assert.strictEqual(evaluation.canGoOnline, false);
      assert.ok(evaluation.blockers.includes('ONBOARDING_NOT_APPROVED'));
    });

    test('rejects eligibility when onboarding is DRAFT', () => {
      const evaluation = riderEligibilityService.evaluateEligibilityCriteria({
        onboardingStatus: RiderOnboardingStatus.DRAFT,
        operationalStatus: RiderOperationalStatus.ACTIVE,
        vehicleType: VehicleType.BICYCLE,
      });

      assert.strictEqual(evaluation.isEligible, false);
      assert.strictEqual(evaluation.canGoOnline, false);
      assert.ok(evaluation.blockers.includes('ONBOARDING_NOT_APPROVED'));
    });

    test('rejects eligibility when rider is SUSPENDED by ops/admin', () => {
      const evaluation = riderEligibilityService.evaluateEligibilityCriteria({
        onboardingStatus: RiderOnboardingStatus.APPROVED,
        operationalStatus: RiderOperationalStatus.SUSPENDED,
        vehicleType: VehicleType.MOTORBIKE,
      });

      assert.strictEqual(evaluation.isEligible, false);
      assert.strictEqual(evaluation.canGoOnline, false);
      assert.ok(evaluation.blockers.includes('ACCOUNT_NOT_ACTIVE'));
    });

    test('rejects eligibility when no vehicle is configured', () => {
      const evaluation = riderEligibilityService.evaluateEligibilityCriteria({
        onboardingStatus: RiderOnboardingStatus.APPROVED,
        operationalStatus: RiderOperationalStatus.ACTIVE,
        vehicleType: null,
      });

      assert.strictEqual(evaluation.isEligible, false);
      assert.strictEqual(evaluation.canGoOnline, false);
      assert.ok(evaluation.blockers.includes('NO_VEHICLE_CONFIGURED'));
    });
  });

  describe('Location Ingestion Bounds Validation', () => {
    test('accepts valid GPS coordinates for Nairobi', () => {
      const validLocation = {
        latitude: -1.2921,
        longitude: 36.8219,
        accuracy_meters: 8.5,
      };
      const result = RiderLocationSchema.safeParse(validLocation);
      assert.strictEqual(result.success, true);
    });

    test('rejects latitude out of valid range (> 90)', () => {
      const invalid = {
        latitude: 91.5,
        longitude: 36.8219,
        accuracy_meters: 10,
      };
      const result = RiderLocationSchema.safeParse(invalid);
      assert.strictEqual(result.success, false);
    });

    test('rejects longitude out of valid range (< -180)', () => {
      const invalid = {
        latitude: -1.2921,
        longitude: -185.0,
        accuracy_meters: 10,
      };
      const result = RiderLocationSchema.safeParse(invalid);
      assert.strictEqual(result.success, false);
    });

    test('rejects negative accuracy meters', () => {
      const invalid = {
        latitude: -1.2921,
        longitude: 36.8219,
        accuracy_meters: -5,
      };
      const result = RiderLocationSchema.safeParse(invalid);
      assert.strictEqual(result.success, false);
    });
  });

  describe('Vehicle Configuration Validation', () => {
    test('accepts supported vehicle types (BICYCLE, MOTORBIKE, CAR)', () => {
      const bike = RiderVehicleSchema.safeParse({ type: 'BICYCLE' });
      const motorbike = RiderVehicleSchema.safeParse({ type: 'MOTORBIKE', registration_number: 'KMCA 123X' });
      const car = RiderVehicleSchema.safeParse({ type: 'CAR', registration_number: 'KDA 456Y' });

      assert.strictEqual(bike.success, true);
      assert.strictEqual(motorbike.success, true);
      assert.strictEqual(car.success, true);
    });

    test('rejects unsupported vehicle types', () => {
      const invalid = RiderVehicleSchema.safeParse({ type: 'HELICOPTER' });
      assert.strictEqual(invalid.success, false);
    });
  });

  describe('Rider local API transport boundary', () => {
    test('accepts Android emulator and RFC1918 development origins', () => {
      assert.strictEqual(isLocalDevelopmentApiOrigin('http://10.0.2.2:3000'), true);
      assert.strictEqual(isLocalDevelopmentApiOrigin('http://10.0.3.2:3000'), true);
      assert.strictEqual(isLocalDevelopmentApiOrigin('http://192.168.1.20:3000'), true);
      assert.strictEqual(isLocalDevelopmentApiOrigin('http://172.20.0.10:3000'), true);
      assert.strictEqual(isLocalDevelopmentApiOrigin('http://localhost:3000'), true);
    });

    test('rejects public or malformed insecure origins', () => {
      assert.strictEqual(isLocalDevelopmentApiOrigin('http://example.com'), false);
      assert.strictEqual(isLocalDevelopmentApiOrigin('http://8.8.8.8:3000'), false);
      assert.strictEqual(isLocalDevelopmentApiOrigin('not-a-url'), false);
    });
  });

  describe('Admin Audit Controls for Courier Fleet', () => {
    test('enforces rejection reason code when rejecting onboarding', () => {
      const valid = AdminRejectRiderSchema.safeParse({
        reason_code: 'INVALID_ID_DOCUMENT',
        note: 'National ID copy was illegible',
      });
      assert.strictEqual(valid.success, true);

      const invalid = AdminRejectRiderSchema.safeParse({ note: 'No reason provided' });
      assert.strictEqual(invalid.success, false);
    });

    test('enforces reason description when suspending a courier', () => {
      const valid = AdminSuspendRiderSchema.safeParse({
        reason: 'Multiple customer complaints of reckless transit',
      });
      assert.strictEqual(valid.success, true);

      const invalid = AdminSuspendRiderSchema.safeParse({});
      assert.strictEqual(invalid.success, false);
    });
  });
});
