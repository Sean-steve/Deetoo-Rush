/**
 * DEETOO - Sprint 6 Unit Tests: Pricing Engine & Money Arithmetic
 * Tests integer minor units financial calculations, delivery fee tiers,
 * service fee rules, and promotional discounts
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  addMoney,
  subtractMoney,
  multiplyMoney,
  multiplyBasisPoints,
  calculateDistanceMeters,
} from '@deetoo/utils';
import { pricingService } from '../../apps/api/src/modules/cart/pricing.service';
import {
  DeliveryPricingRule,
  ServiceFeeRule,
  Promotion,
  PromotionType,
  PromotionStatus,
  PromotionFundingSource,
} from '@deetoo/types';

describe('Sprint 6: Pricing Engine & Financial Precision', () => {
  describe('Minor Units Financial Arithmetic', () => {
    test('adds money accurately in minor units', () => {
      // KES 450.00 + KES 120.50 -> 45000 + 12050 = 57050
      assert.strictEqual(addMoney(45000, 12050), 57050);
    });

    test('subtracts money and clamps at zero without negative money', () => {
      assert.strictEqual(subtractMoney(50000, 15000), 35000);
      assert.strictEqual(subtractMoney(10000, 20000), 0);
    });

    test('multiplies money by quantity integer', () => {
      // 3 items @ KES 350 -> 35000 * 3 = 105000
      assert.strictEqual(multiplyMoney(35000, 3), 105000);
    });

    test('calculates basis points with round-half-up precision', () => {
      // 2.5% (250 bps) on KES 1,000 (100000 minor) = 2500 minor (KES 25.00)
      assert.strictEqual(multiplyBasisPoints(100000, 250), 2500);
      // 15% (1500 bps) on KES 650 (65000 minor) = 9750 minor (KES 97.50)
      assert.strictEqual(multiplyBasisPoints(65000, 1500), 9750);
    });

    test('strictly rejects non-integer inputs to prevent floating point leaks', () => {
      assert.throws(() => addMoney(450.5, 100), /Financial math violation/);
      assert.throws(() => multiplyMoney(350.25, 2), /Financial math violation/);
    });
  });

  describe('Delivery Fee Tier Calculation', () => {
    const testRule: DeliveryPricingRule = {
      id: 'rule_test',
      zone_id: null,
      base_fee_minor: 12000, // KES 120
      included_distance_meters: 3000, // 3 km
      per_km_fee_minor: 3500, // KES 35 / km
      minimum_fee_minor: 10000, // KES 100
      maximum_fee_minor: 45000, // KES 450
      max_delivery_distance_meters: 15000, // 15 km
      status: 'ACTIVE',
      effective_from: new Date().toISOString(),
    };

    test('charges base fee when delivery distance is within included distance', () => {
      // 2.5 km <= 3.0 km included -> fee = base_fee = 12000 (KES 120)
      const res = pricingService.calculateDeliveryFee(2500, testRule);
      assert.strictEqual(res.is_within_range, true);
      assert.strictEqual(res.fee_minor, 12000);
    });

    test('adds per-km fee for distance beyond included threshold', () => {
      // 5.5 km -> 2.5 km excess -> ceil(2.5) = 3 km excess
      // fee = 12000 + 3 * 3500 = 12000 + 10500 = 22500 (KES 225)
      const res = pricingService.calculateDeliveryFee(5500, testRule);
      assert.strictEqual(res.is_within_range, true);
      assert.strictEqual(res.fee_minor, 22500);
    });

    test('caps delivery fee at maximum_fee_minor', () => {
      // 14 km -> 11 km excess -> 12000 + 11 * 3500 = 50500 -> capped at 45000 (KES 450)
      const res = pricingService.calculateDeliveryFee(14000, testRule);
      assert.strictEqual(res.is_within_range, true);
      assert.strictEqual(res.fee_minor, 45000);
    });

    test('flags distance exceeding max_delivery_distance_meters as out of range', () => {
      const res = pricingService.calculateDeliveryFee(18000, testRule);
      assert.strictEqual(res.is_within_range, false);
    });
  });

  describe('Service Fee Calculation', () => {
    const testServiceRule: ServiceFeeRule = {
      id: 'sfr_test',
      fee_type: 'PERCENTAGE',
      percentage_basis_points: 250, // 2.5%
      fixed_fee_minor: 0,
      minimum_fee_minor: 2000, // min KES 20
      maximum_fee_minor: 8000, // max KES 80
      status: 'ACTIVE',
      effective_from: new Date().toISOString(),
    };

    test('calculates 2.5% percentage fee on gross subtotal', () => {
      // On KES 2,000 (200000 minor) -> 2.5% = 5000 minor (KES 50)
      const fee = pricingService.calculateServiceFee(200000, testServiceRule);
      assert.strictEqual(fee, 5000);
    });

    test('enforces minimum fee threshold', () => {
      // On KES 400 (40000 minor) -> 2.5% = 1000 minor (KES 10) -> clamped up to min KES 20 (2000 minor)
      const fee = pricingService.calculateServiceFee(40000, testServiceRule);
      assert.strictEqual(fee, 2000);
    });

    test('enforces maximum fee cap', () => {
      // On KES 5,000 (500000 minor) -> 2.5% = 12500 minor (KES 125) -> clamped down to max KES 80 (8000 minor)
      const fee = pricingService.calculateServiceFee(500000, testServiceRule);
      assert.strictEqual(fee, 8000);
    });
  });

  describe('Promotions & Discounts Evaluation', () => {
    const now = new Date();
    const future = new Date(Date.now() + 86400000).toISOString();
    const past = new Date(Date.now() - 86400000).toISOString();

    const fixedPromo: Promotion = {
      id: 'promo_fixed',
      code: 'SAVE100',
      type: PromotionType.FIXED_AMOUNT,
      value_minor_or_bps: 10000, // KES 100
      status: PromotionStatus.ACTIVE,
      start_at: past,
      end_at: future,
      minimum_basket_minor: 50000, // KES 500
      usage_limit: 100,
      times_used: 10,
      per_customer_limit: 1,
      funding_source: PromotionFundingSource.DEETOO,
      merchant_funding_bps: 0,
      description: 'Save KES 100 on orders over KES 500',
      created_at: past,
      updated_at: past,
    };

    test('applies fixed discount when minimum basket is satisfied', () => {
      // Basket KES 800 (80000 minor) > KES 500
      const evalRes = pricingService.evaluatePromotion(fixedPromo, 80000, 15000);
      assert.strictEqual(evalRes.isValid, true);
      assert.strictEqual(evalRes.discountMinor, 10000);
    });

    test('rejects promotion when minimum basket is not met', () => {
      // Basket KES 400 (40000 minor) < KES 500
      const evalRes = pricingService.evaluatePromotion(fixedPromo, 40000, 15000);
      assert.strictEqual(evalRes.isValid, false);
      assert.strictEqual(evalRes.reasonCode, 'PROMOTION_MINIMUM_NOT_MET');
      assert.strictEqual(evalRes.discountMinor, 0);
    });

    test('evaluates free delivery promotion', () => {
      const freeDelPromo: Promotion = {
        id: 'promo_free',
        code: 'FREEDEL',
        type: PromotionType.FREE_DELIVERY,
        value_minor_or_bps: 0,
        status: PromotionStatus.ACTIVE,
        start_at: past,
        end_at: future,
        minimum_basket_minor: 60000,
        usage_limit: 100,
        times_used: 0,
        per_customer_limit: 1,
        funding_source: PromotionFundingSource.DEETOO,
        merchant_funding_bps: 0,
        description: 'Free delivery',
        created_at: past,
        updated_at: past,
      };

      // Delivery fee is KES 150 (15000 minor) -> discount should equal full delivery fee
      const evalRes = pricingService.evaluatePromotion(freeDelPromo, 70000, 15000);
      assert.strictEqual(evalRes.isValid, true);
      assert.strictEqual(evalRes.discountMinor, 15000);
    });
  });
});
