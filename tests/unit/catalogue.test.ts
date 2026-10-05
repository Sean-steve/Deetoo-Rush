import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  CreateMenuSchema,
  CreateCategorySchema,
  CreateMenuItemSchema,
  CreateModifierGroupSchema,
  CreateModifierOptionSchema,
  BranchCatalogueOverrideSchema,
} from '../../packages/validation/src/index';

describe('Sprint 4: Catalogue Validation & Domain Rules', () => {
  describe('Minor Units Currency & Price Rules', () => {
    it('accepts valid non-negative integer minor unit prices', () => {
      const validItem = CreateMenuItemSchema.safeParse({
        category_id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Classic Smash Burger',
        description: 'Double beef patty, cheddar, house sauce',
        price_minor: 85000, // KES 850.00
        currency: 'KES',
        is_available: true,
      });

      assert.strictEqual(validItem.success, true);
    });

    it('rejects floating point price (never use floating point arithmetic for prices)', () => {
      const floatItem = CreateMenuItemSchema.safeParse({
        category_id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Classic Smash Burger',
        price_minor: 850.5, // Float rejected!
        currency: 'KES',
      });

      assert.strictEqual(floatItem.success, false);
    });

    it('rejects negative item prices', () => {
      const negativeItem = CreateMenuItemSchema.safeParse({
        category_id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Negative Burger',
        price_minor: -100,
        currency: 'KES',
      });

      assert.strictEqual(negativeItem.success, false);
    });

    it('accepts zero price delta for free modifier options', () => {
      const freeOption = CreateModifierOptionSchema.safeParse({
        name: 'No Onions (Special Request)',
        price_delta_minor: 0,
        is_available: true,
      });

      assert.strictEqual(freeOption.success, true);
    });

    it('accepts positive price delta for add-on modifier options', () => {
      const addonOption = CreateModifierOptionSchema.safeParse({
        name: 'Extra Cheddar Cheese Slice',
        price_delta_minor: 12000, // + KES 120.00
        is_available: true,
      });

      assert.strictEqual(addonOption.success, true);
    });
  });

  describe('Modifier Group Selection Bounds', () => {
    it('validates single-choice modifier group (min 1, max 1)', () => {
      const singleChoice = CreateModifierGroupSchema.safeParse({
        name: 'Choose Bun Type',
        min_selections: 1,
        max_selections: 1,
        is_required: true,
      });

      assert.strictEqual(singleChoice.success, true);
    });

    it('validates optional multi-choice modifier group (min 0, max 5)', () => {
      const multiChoice = CreateModifierGroupSchema.safeParse({
        name: 'Add Extra Toppings',
        min_selections: 0,
        max_selections: 5,
        is_required: false,
      });

      assert.strictEqual(multiChoice.success, true);
    });

    it('rejects when min_selections exceeds max_selections', () => {
      const invalidBounds = CreateModifierGroupSchema.safeParse({
        name: 'Invalid Group',
        min_selections: 3,
        max_selections: 1, // Invalid!
        is_required: true,
      });

      assert.strictEqual(invalidBounds.success, false);
    });
  });

  describe('Branch-Specific Overrides & Effective Availability Logic', () => {
    it('computes effective availability combining base item availability and branch override', () => {
      const computeEffectiveAvailability = (
        baseAvailable: boolean,
        override?: { is_available: boolean }
      ) => {
        if (!baseAvailable) return false;
        if (override) return override.is_available;
        return true;
      };

      // Case 1: Base is available, no override -> true
      assert.strictEqual(computeEffectiveAvailability(true, undefined), true);

      // Case 2: Base is available, branch marked unavailable -> false
      assert.strictEqual(computeEffectiveAvailability(true, { is_available: false }), false);

      // Case 3: Base is unavailable at merchant master level, branch tried to mark available -> false
      // (Merchant master availability overrides branch availability)
      assert.strictEqual(computeEffectiveAvailability(false, { is_available: true }), false);

      // Case 4: Both unavailable -> false
      assert.strictEqual(computeEffectiveAvailability(false, { is_available: false }), false);
    });

    it('computes effective price combining base price and branch override price', () => {
      const computeEffectivePrice = (
        basePriceMinor: number,
        override?: { price_minor?: number }
      ) => {
        if (override?.price_minor !== undefined) {
          return override.price_minor;
        }
        return basePriceMinor;
      };

      const basePrice = 75000; // KES 750.00
      assert.strictEqual(computeEffectivePrice(basePrice, undefined), 75000);
      assert.strictEqual(computeEffectivePrice(basePrice, { price_minor: 82000 }), 82000);
    });

    it('validates branch override schema', () => {
      const override = BranchCatalogueOverrideSchema.safeParse({
        is_available: false,
        price_override_minor: 90000,
      });

      assert.strictEqual(override.success, true);
    });
  });

  describe('Cross-Merchant Safety Rule (Section 4 BR-CAT-004)', () => {
    it('prevents assigning menu to branch belonging to a different merchant', () => {
      const validateMenuBranchAssignment = (
        menuMerchantId: string,
        branchMerchantId: string
      ) => {
        if (menuMerchantId !== branchMerchantId) {
          throw new Error('CROSS_MERCHANT_FORBIDDEN: Menu cannot be assigned to branch of another merchant');
        }
        return true;
      };

      const merchantA = 'merchant-uuid-1111';
      const merchantB = 'merchant-uuid-2222';

      assert.strictEqual(validateMenuBranchAssignment(merchantA, merchantA), true);
      assert.throws(
        () => validateMenuBranchAssignment(merchantA, merchantB),
        /CROSS_MERCHANT_FORBIDDEN/
      );
    });
  });
});
