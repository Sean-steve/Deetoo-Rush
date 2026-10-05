import { canonicalHash, lockQuoteSources } from './quote-binding';
import { commissionService } from '../finance/commission.service';
import { transactionalService } from '../../db/transaction';
/**
 * DEETOO - Authoritative Checkout Quote Service
 * Validates serviceability, restaurant status, catalogue availability, and generates
 * immutable backend-signed checkout quotes with strict TTL (ADR-001, DEE-DOM-001)
 */

import {
  CheckoutQuote,
  GenerateQuoteInput,
  AddressSnapshot,
  GeoPoint,
} from '@deetoo/types';
import {
  generateQuoteId,
  logger,
} from '@deetoo/utils';
import { AppError } from '../../middleware/error-handler';
import { cartRepository } from './cart.repository';
import { cartService } from './cart.service';
import { pricingService } from './pricing.service';
import { customerRepository } from '../customer/customer.repository';
import { merchantRepository } from '../merchant/merchant.repository';
import { merchantService } from '../merchant/merchant.service';
import { serviceabilityService } from '../serviceability/serviceability.service';

export class CheckoutService {
  /**
   * Generates an authoritative checkout quote for the customer's active cart and selected delivery address
   */
  public async generateQuote(customerId: string, input: GenerateQuoteInput, persist = true): Promise<CheckoutQuote> {
    await lockQuoteSources();
    const cart = await cartRepository.findActiveCartByCustomer(customerId);
    if (!cart) {
      throw new AppError(404, 'CART_NOT_FOUND', 'No active cart found');
    }

    const enrichedCart = await cartService.getEnrichedCart(customerId);
    if (!enrichedCart || enrichedCart.items.length === 0) {
      throw new AppError(400, 'CART_EMPTY', 'Cart is empty. Add items before preparing checkout');
    }

    // 1. Delivery Address Verification
    const address = await customerRepository.findAddressById(input.address_id);
    if (!address || address.customer_id !== customerId || !address.is_active) {
      throw new AppError(404, 'ADDRESS_NOT_FOUND', 'Valid delivery address not found');
    }

    // 2. Spatial Serviceability Validation
    const serviceability = await serviceabilityService.checkServiceability(address.latitude, address.longitude);
    if (!serviceability.serviceable) {
      throw new AppError(
        422,
        'OUTSIDE_SERVICE_AREA',
        `Delivery address is outside active platform service zones: ${serviceability.reason_code}`
      );
    }

    // Check branch service zone match
    const branchZones = await merchantRepository.getBranchServiceZones(cart.branch_id);
    if (serviceability.zone_id && !branchZones.includes(serviceability.zone_id)) {
      throw new AppError(
        422,
        'BRANCH_NOT_SERVICEABLE_IN_ZONE',
        `This restaurant does not deliver to ${address.city} (${serviceability.zone_name || 'selected zone'})`
      );
    }

    // 3. Restaurant Operational Availability Check
    const branchAvailability = await merchantService.evaluateBranchAvailability(cart.branch_id);
    if (!branchAvailability.is_available) {
      throw new AppError(
        409,
        'RESTAURANT_CLOSED',
        `${enrichedCart.branch.name} is currently closed. Cannot proceed to checkout.`
      );
    }

    // 4. Catalogue & Modifiers Revalidation
    for (const item of enrichedCart.items) {
      if (!item.is_available) {
        throw new AppError(
          409,
          'ITEM_UNAVAILABLE',
          `"${item.item_name}" is currently sold out and cannot be ordered`
        );
      }

      for (const mod of item.modifiers) {
        if (!mod.is_available) {
          throw new AppError(
            409,
            'MODIFIER_UNAVAILABLE',
            `Option "${mod.option_name}" on "${item.item_name}" is currently unavailable`
          );
        }
      }
    }

    // 5. Minimum Order Revalidation
    if (!enrichedCart.pricing.minimum_order_met) {
      throw new AppError(
        400,
        'MINIMUM_ORDER_NOT_MET',
        `Minimum order requirement of KES ${(enrichedCart.pricing.minimum_order_minor / 100).toFixed(
          0
        )} not met. Add KES ${(enrichedCart.pricing.minimum_order_remaining_minor / 100).toFixed(0)} more.`
      );
    }

    // 6. Authoritative Pricing Calculation with Destination
    const destination: GeoPoint = {
      lat: address.latitude,
      lng: address.longitude,
    };

    const pricing = await pricingService.calculateFullPricing({
      branchId: cart.branch_id,
      items: enrichedCart.items,
      destination,
      zoneId: serviceability.zone_id,
      promoCode: cart.applied_promo_code,
    });

    // 7. Assemble Address Snapshot
    const addressSnapshot: AddressSnapshot = {
      label: address.label,
      recipient_name: address.recipient_name,
      phone_e164: address.phone_e164,
      address_text: address.address_line1 || address.address_text,
      location: {
        lat: address.latitude,
        lng: address.longitude,
      },
      instructions: input.notes || address.delivery_instructions,
    };

    const promo = pricing.applied_promotion;
    const merchantBps = promo?.funding_source === 'MERCHANT' ? 10000 : promo?.funding_source === 'SHARED' ? promo.merchant_funding_bps : 0;
    const merchantDiscount = Number((BigInt(pricing.discount_minor) * BigInt(merchantBps || 0) + 5000n) / 10000n);
    const commission = await commissionService.calculateOrderCommission(enrichedCart.branch.merchant_id, pricing.gross_subtotal_minor, merchantDiscount);
    const roundingAdjustment = input.payment_method === 'MPESA' ? (100 - pricing.total_minor % 100) % 100 : 0;
    const frozen = {
      payment_method: input.payment_method || null, rounding_adjustment_minor: roundingAdjustment,
      delivery_rule: pricing.delivery_pricing_rule, service_rule: pricing.service_fee_rule,
      promotion: promo || null, commission,
      merchant_funded_minor: merchantDiscount,
      platform_funded_minor: pricing.discount_minor - merchantDiscount,
      gross_delivery_fee_minor: pricing.gross_delivery_fee_minor,
    };
    const binding = canonicalHash({ cart_id: cart.id, branch_id: cart.branch_id, items: enrichedCart.items,
      address, notes: input.notes || null, promo_code: cart.applied_promo_code || null, frozen });
    const now = new Date().toISOString();
    // Quote expires in 10 minutes (TTL)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const quoteId = generateQuoteId();

    const quote: CheckoutQuote = {
      binding_hash: binding,
      cart_items_snapshot: structuredClone(enrichedCart.items),
      pricing_rule_snapshot: { ...frozen, notes: input.notes || null },
      id: quoteId,
      quote_id: quoteId,
      customer_id: customerId,
      cart_id: cart.id,
      branch_id: cart.branch_id,
      branch_name: enrichedCart.branch.name,
      delivery_address_id: address.id,
      delivery_address_snapshot: addressSnapshot,
      currency: 'KES',
      items_subtotal_minor: pricing.items_subtotal_minor,
      modifiers_subtotal_minor: pricing.modifiers_subtotal_minor,
      gross_subtotal_minor: pricing.gross_subtotal_minor,
      discount_minor: pricing.discount_minor,
      discount_funding_source: pricing.discount_funding_source,
      net_subtotal_minor: pricing.net_subtotal_minor,
      delivery_fee_minor: pricing.delivery_fee_minor,
      service_fee_minor: pricing.service_fee_minor + roundingAdjustment,
      tax_minor: pricing.tax_minor,
      total_minor: pricing.total_minor + roundingAdjustment,
      distance_meters: pricing.distance_meters,
      estimated_duration_min: pricing.estimated_duration_min,
      delivery_pricing_rule_id: pricing.delivery_pricing_rule.id,
      service_fee_rule_id: pricing.service_fee_rule.id,
      promotion_id: pricing.applied_promotion?.id,
      promotion_code: pricing.applied_promotion?.code,
      expires_at: expiresAt,
      created_at: now,
    };

    if (persist) await cartRepository.createCheckoutQuote(quote);

    logger.info('Generated authoritative checkout quote', {
      metadata: {
        quote_id: quote.quote_id,
        customer_id: quote.customer_id,
        branch_id: quote.branch_id,
        total_minor: quote.total_minor,
      },
    });

    return quote;
  }

  public async validateBinding(quote: CheckoutQuote): Promise<void> {
    if (!quote.binding_hash || !quote.cart_items_snapshot?.length) throw new AppError(409, 'STALE_QUOTE', 'Generate a new bound checkout quote');
    const current = await this.generateQuote(quote.customer_id, {address_id: quote.delivery_address_id, notes: quote.pricing_rule_snapshot?.notes || undefined, payment_method: quote.pricing_rule_snapshot?.payment_method || undefined}, false);
    if (current.binding_hash !== quote.binding_hash) throw new AppError(409, 'STALE_QUOTE', 'Cart, address, catalogue or pricing configuration changed; request a new quote');
  }

  /**
   * Retrieve and validate an existing checkout quote
   */
  public async getQuote(quoteId: string, customerId?: string): Promise<CheckoutQuote> {
    const quote = await cartRepository.findCheckoutQuoteById(quoteId);
    if (!quote) {
      throw new AppError(404, 'QUOTE_NOT_FOUND', 'Checkout quote not found or expired');
    }

    if (customerId && quote.customer_id !== customerId) {
      throw new AppError(403, 'FORBIDDEN_OPERATION', 'You do not have access to this quote');
    }

    return quote;
  }
}

export const checkoutService = transactionalService(new CheckoutService());
