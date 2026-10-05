import { transactionalService } from '../../db/transaction';
/**
 * DEETOO - Central Pricing Engine (PricingService)
 * Authoritative backend calculations for items, modifiers, delivery fee, service fee,
 * promotions, minimum orders, and grand totals in integer minor units (ADR-001, DEE-DOM-001)
 */

import {
  CartItem,
  EnrichedCartItem,
  EnrichedCartModifierSelection,
  DeliveryPricingRule,
  ServiceFeeRule,
  Promotion,
  PromotionType,
  PromotionFundingSource,
  CartPricingBreakdown,
  GeoPoint,
} from '@deetoo/types';
import {
  addMoney,
  subtractMoney,
  multiplyMoney,
  multiplyBasisPoints,
  calculateDistanceMeters,
  logger,
} from '@deetoo/utils';
import { AppError } from '../../middleware/error-handler';
import { cartRepository } from './cart.repository';
import { catalogueRepository } from '../merchant/catalogue.repository';
import { merchantRepository } from '../merchant/merchant.repository';

export interface CalculatedPricingResult {
  items_subtotal_minor: number;
  modifiers_subtotal_minor: number;
  gross_subtotal_minor: number;
  minimum_order_minor: number;
  minimum_order_met: boolean;
  minimum_order_remaining_minor: number;
  distance_meters: number;
  estimated_duration_min: number;
  delivery_fee_minor: number;
  gross_delivery_fee_minor: number;
  delivery_pricing_rule: DeliveryPricingRule;
  service_fee_minor: number;
  service_fee_rule: ServiceFeeRule;
  discount_minor: number;
  discount_funding_source?: PromotionFundingSource;
  applied_promotion?: Promotion;
  tax_minor: number;
  net_subtotal_minor: number;
  total_minor: number;
}

export class PricingService {
  /**
   * Enrich a single cart item with real-time catalogue item pricing and modifier options
   */
  public async enrichCartItem(branchId: string, cartItem: CartItem): Promise<EnrichedCartItem> {
    const item = await catalogueRepository.findItemById(cartItem.menu_item_id);
    if (!item) {
      throw new AppError(404, 'ITEM_NOT_FOUND', `Menu item ${cartItem.menu_item_id} no longer exists`);
    }

    // Check branch override for item
    const itemOverride = await catalogueRepository.findBranchItemOverride(branchId, item.id);
    const effectiveBasePrice =
      itemOverride && itemOverride.price_override_minor !== null && itemOverride.price_override_minor !== undefined
        ? itemOverride.price_override_minor
        : item.price_minor;

    const effectiveAvailable =
      item.is_available && (itemOverride === null || itemOverride.is_available);

    // Fetch modifier options
    const enrichedModifiers: EnrichedCartModifierSelection[] = [];
    let modifiersUnitTotal = 0;

    for (const optId of cartItem.modifier_option_ids) {
      const option = await catalogueRepository.findModifierOptionById(optId);
      if (!option) continue;

      const group = await catalogueRepository.findModifierGroupById(option.modifier_group_id);
      const optOverride = await catalogueRepository.findBranchModifierOptionOverride(branchId, optId);

      const effectiveDelta =
        optOverride && optOverride.price_delta_override_minor !== null && optOverride.price_delta_override_minor !== undefined
          ? optOverride.price_delta_override_minor
          : option.price_delta_minor;

      const optAvailable =
        option.is_available && (optOverride === null || optOverride.is_available);

      modifiersUnitTotal = addMoney(modifiersUnitTotal, effectiveDelta);

      enrichedModifiers.push({
        group_id: option.modifier_group_id,
        group_name: group?.name || 'Options',
        option_id: option.id,
        option_name: option.name,
        price_delta_minor: effectiveDelta,
        is_available: optAvailable,
      });
    }

    const unitTotalPrice = addMoney(effectiveBasePrice, modifiersUnitTotal);
    const lineTotal = multiplyMoney(unitTotalPrice, cartItem.quantity);

    return {
      id: cartItem.id,
      cart_id: cartItem.cart_id,
      menu_item_id: item.id,
      item_name: item.name,
      item_image_url: item.image_url,
      quantity: cartItem.quantity,
      unit_base_price_minor: effectiveBasePrice,
      unit_modifiers_price_minor: modifiersUnitTotal,
      unit_total_price_minor: unitTotalPrice,
      line_total_minor: lineTotal,
      is_available: effectiveAvailable,
      price_changed: false,
      modifiers: enrichedModifiers,
    };
  }

  /**
   * Calculate distance-based delivery fee according to platform DeliveryPricingRule
   */
  public calculateDeliveryFee(
    distanceMeters: number,
    rule: DeliveryPricingRule,
    eligibilityDistanceMeters = distanceMeters
  ): { fee_minor: number; is_within_range: boolean } {
    if (eligibilityDistanceMeters > rule.max_delivery_distance_meters) {
      return { fee_minor: rule.maximum_fee_minor, is_within_range: false };
    }

    if (distanceMeters <= rule.included_distance_meters) {
      const base = Math.max(rule.base_fee_minor, rule.minimum_fee_minor);
      return { fee_minor: Math.min(base, rule.maximum_fee_minor), is_within_range: true };
    }

    const excessMeters = distanceMeters - rule.included_distance_meters;
    // Calculate fractional km or ceiling km (standard logistics: round up to nearest 100m or km)
    const excessKm = Math.ceil(excessMeters / 1000);
    const distanceFee = multiplyMoney(rule.per_km_fee_minor, excessKm);
    let total = addMoney(rule.base_fee_minor, distanceFee);

    if (total < rule.minimum_fee_minor) total = rule.minimum_fee_minor;
    if (total > rule.maximum_fee_minor) total = rule.maximum_fee_minor;

    return { fee_minor: total, is_within_range: true };
  }

  /**
   * Calculate platform service fee according to ServiceFeeRule
   */
  public calculateServiceFee(grossSubtotalMinor: number, rule: ServiceFeeRule): number {
    let fee = 0;
    if (rule.fee_type === 'FIXED') {
      fee = rule.fixed_fee_minor;
    } else if (rule.fee_type === 'PERCENTAGE') {
      fee = multiplyBasisPoints(grossSubtotalMinor, rule.percentage_basis_points);
    } else {
      // HYBRID
      const pct = multiplyBasisPoints(grossSubtotalMinor, rule.percentage_basis_points);
      fee = addMoney(rule.fixed_fee_minor, pct);
    }

    if (fee < rule.minimum_fee_minor) fee = rule.minimum_fee_minor;
    if (fee > rule.maximum_fee_minor) fee = rule.maximum_fee_minor;

    return fee;
  }

  /**
   * Evaluate and apply a promotion code against gross subtotal and delivery fee
   */
  public evaluatePromotion(
    promo: Promotion,
    grossSubtotalMinor: number,
    deliveryFeeMinor: number,
    branchId?: string,
    zoneId?: string | null
  ): {
    isValid: boolean;
    reasonCode?: string;
    discountMinor: number;
    fundingSource: PromotionFundingSource;
  } {
    const now = new Date();
    if (new Date(promo.start_at) > now) {
      return { isValid: false, reasonCode: 'PROMOTION_NOT_STARTED', discountMinor: 0, fundingSource: promo.funding_source };
    }
    if (new Date(promo.end_at) < now) {
      return { isValid: false, reasonCode: 'PROMOTION_EXPIRED', discountMinor: 0, fundingSource: promo.funding_source };
    }
    if (promo.status !== 'ACTIVE') {
      return { isValid: false, reasonCode: 'PROMOTION_INACTIVE', discountMinor: 0, fundingSource: promo.funding_source };
    }
    if (promo.times_used >= promo.usage_limit) {
      return { isValid: false, reasonCode: 'PROMOTION_USAGE_EXCEEDED', discountMinor: 0, fundingSource: promo.funding_source };
    }
    if (grossSubtotalMinor < promo.minimum_basket_minor) {
      return { isValid: false, reasonCode: 'PROMOTION_MINIMUM_NOT_MET', discountMinor: 0, fundingSource: promo.funding_source };
    }
    if (promo.branch_id && branchId && promo.branch_id !== branchId) {
      return { isValid: false, reasonCode: 'PROMOTION_BRANCH_RESTRICTED', discountMinor: 0, fundingSource: promo.funding_source };
    }
    if (promo.zone_id && zoneId && promo.zone_id !== zoneId) {
      return { isValid: false, reasonCode: 'PROMOTION_ZONE_RESTRICTED', discountMinor: 0, fundingSource: promo.funding_source };
    }

    let discount = 0;
    if (promo.type === PromotionType.FIXED_AMOUNT) {
      discount = Math.min(grossSubtotalMinor, promo.value_minor_or_bps);
    } else if (promo.type === PromotionType.PERCENTAGE) {
      discount = multiplyBasisPoints(grossSubtotalMinor, promo.value_minor_or_bps);
    } else if (promo.type === PromotionType.FREE_DELIVERY) {
      discount = deliveryFeeMinor;
    }

    return {
      isValid: true,
      discountMinor: discount,
      fundingSource: promo.funding_source,
    };
  }

  /**
   * Complete Authoritative Pricing Calculation
   */
  public async calculateFullPricing(params: {
    branchId: string;
    items: EnrichedCartItem[];
    destination?: GeoPoint | null;
    zoneId?: string | null;
    promoCode?: string | null;
  }): Promise<CalculatedPricingResult> {
    const branch = await merchantRepository.findBranchById(params.branchId);
    if (!branch) {
      throw new AppError(404, 'BRANCH_NOT_FOUND', `Restaurant branch not found`);
    }

    // 1. Calculate Items & Modifiers Subtotals
    let itemsSubtotal = 0;
    let modifiersSubtotal = 0;

    for (const item of params.items) {
      const baseLine = multiplyMoney(item.unit_base_price_minor, item.quantity);
      const modLine = multiplyMoney(item.unit_modifiers_price_minor, item.quantity);
      itemsSubtotal = addMoney(itemsSubtotal, baseLine);
      modifiersSubtotal = addMoney(modifiersSubtotal, modLine);
    }

    const grossSubtotal = addMoney(itemsSubtotal, modifiersSubtotal);

    // 2. Minimum Order Check
    const minOrder = branch.min_order_minor || 0;
    const minOrderMet = grossSubtotal >= minOrder;
    const minOrderRemaining = minOrderMet ? 0 : minOrder - grossSubtotal;

    // 3. Distance & Delivery Fee
    let distanceMeters = 2500; // default estimated distance (2.5 km) if destination not provided
    if (params.destination && branch.latitude && branch.longitude) {
      distanceMeters = calculateDistanceMeters(
        branch.latitude,
        branch.longitude,
        params.destination.lat,
        params.destination.lng
      );
    }

    // Estimated delivery duration: prep default + ~3 min/km
    const estimatedDurationMin = (branch.prep_default_min || 20) + Math.round((distanceMeters / 1000) * 3);

    const deliveryRule = await cartRepository.getDeliveryPricingRuleForZone(params.zoneId);
    // Eligibility uses the approved straight-line radius; fee distance retains its road estimate.
    const eligibilityDistance = params.destination
      ? calculateDistanceMeters(branch.latitude, branch.longitude, params.destination.lat, params.destination.lng, 1)
      : distanceMeters;
    const { fee_minor: grossDeliveryFee, is_within_range } = this.calculateDeliveryFee(distanceMeters, deliveryRule, eligibilityDistance);

    if (params.destination && !is_within_range) {
      throw new AppError(
        422,
        'OUTSIDE_DELIVERY_RANGE',
        `Delivery address is ${(eligibilityDistance / 1000).toFixed(1)}km away, which exceeds the maximum delivery limit of ${(
          deliveryRule.max_delivery_distance_meters / 1000
        ).toFixed(1)}km`
      );
    }

    // 4. Service Fee
    const serviceFeeRule = await cartRepository.getServiceFeeRule();
    const serviceFee = this.calculateServiceFee(grossSubtotal, serviceFeeRule);

    // 5. Promotion & Discount
    let discount = 0;
    let appliedPromo: Promotion | undefined;
    let fundingSource: PromotionFundingSource | undefined;

    if (params.promoCode) {
      const promo = await cartRepository.findPromotionByCode(params.promoCode);
      if (promo) {
        const evalResult = this.evaluatePromotion(
          promo,
          grossSubtotal,
          grossDeliveryFee,
          params.branchId,
          params.zoneId
        );
        if (evalResult.isValid) {
          discount = evalResult.discountMinor;
          appliedPromo = promo;
          fundingSource = evalResult.fundingSource;
        }
      }
    }

    // Delivery fee adjusted if free delivery promo
    let finalDeliveryFee = grossDeliveryFee;
    let totalDiscount = discount;

    if (appliedPromo?.type === PromotionType.FREE_DELIVERY) {
      finalDeliveryFee = 0;
    }

    // Net food subtotal
    const netFoodDiscount = appliedPromo?.type !== PromotionType.FREE_DELIVERY ? discount : 0;
    const netSubtotal = subtractMoney(grossSubtotal, netFoodDiscount);

    // 6. Tax Strategy: Kenyan restaurant menu prices are VAT inclusive (16% inclusive).
    // Tax breakdown recorded without charging extra fee to customer.
    const tax = 0;

    // 7. Grand Total
    // total = netSubtotal + finalDeliveryFee + serviceFee + tax
    const total = addMoney(addMoney(netSubtotal, finalDeliveryFee), serviceFee);

    return {
      items_subtotal_minor: itemsSubtotal,
      modifiers_subtotal_minor: modifiersSubtotal,
      gross_subtotal_minor: grossSubtotal,
      minimum_order_minor: minOrder,
      minimum_order_met: minOrderMet,
      minimum_order_remaining_minor: minOrderRemaining,
      distance_meters: distanceMeters,
      estimated_duration_min: estimatedDurationMin,
      delivery_fee_minor: finalDeliveryFee,
      gross_delivery_fee_minor: grossDeliveryFee,
      delivery_pricing_rule: deliveryRule,
      service_fee_minor: serviceFee,
      service_fee_rule: serviceFeeRule,
      discount_minor: totalDiscount,
      discount_funding_source: fundingSource,
      applied_promotion: appliedPromo,
      tax_minor: tax,
      net_subtotal_minor: netSubtotal,
      total_minor: total,
    };
  }
}

export const pricingService = transactionalService(new PricingService());
