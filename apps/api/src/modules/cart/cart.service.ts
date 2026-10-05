import { transactionalService } from '../../db/transaction';
/**
 * DEETOO - Cart Service
 * Manages customer cart lifecycle, restaurant isolation, modifier validation,
 * deduplication, live enrichment, and promotion codes (ADR-005, DEE-DOM-001)
 */

import {
  Cart,
  CartItem,
  CartStatus,
  AddToCartInput,
  EnrichedCart,
  EnrichedCartItem,
  CartWarning,
  BranchOperationalStatus,
  MerchantStatus,
  MerchantApprovalStatus,
  PromotionStatus,
} from '@deetoo/types';
import {
  generateCartId,
  generateCartItemId,
  logger,
} from '@deetoo/utils';
import { AppError } from '../../middleware/error-handler';
import { cartRepository } from './cart.repository';
import { pricingService } from './pricing.service';
import { merchantRepository } from '../merchant/merchant.repository';
import { merchantService } from '../merchant/merchant.service';
import { catalogueRepository } from '../merchant/catalogue.repository';

export class CartService {
  /**
   * Retrieves or initializes an active cart for the customer, returning a fully enriched view
   */
  public async getEnrichedCart(customerId: string): Promise<EnrichedCart | null> {
    const cart = await cartRepository.findActiveCartByCustomer(customerId);
    if (!cart) {
      return null;
    }

    const branch = await merchantRepository.findBranchById(cart.branch_id);
    if (!branch) {
      return null;
    }

    const merchant = await merchantRepository.findMerchantById(branch.merchant_id);
    const availability = await merchantService.evaluateBranchAvailability(branch.id);
    const rawItems = await cartRepository.listCartItems(cart.id);

    // Enrich items
    const enrichedItems: EnrichedCartItem[] = [];
    const warnings: CartWarning[] = [];

    // Restaurant availability check
    if (!availability.is_available) {
      warnings.push({
        code: 'RESTAURANT_CLOSED',
        message: `${branch.name} is currently closed. You may still prepare your cart, but ordering requires an open restaurant.`,
      });
    }

    for (const rawItem of rawItems) {
      try {
        const enriched = await pricingService.enrichCartItem(cart.branch_id, rawItem);
        enrichedItems.push(enriched);

        if (!enriched.is_available) {
          warnings.push({
            code: 'ITEM_UNAVAILABLE',
            message: `"${enriched.item_name}" is currently sold out`,
            item_id: enriched.menu_item_id,
            item_name: enriched.item_name,
          });
        }

        const unavailableMod = enriched.modifiers.find((m) => !m.is_available);
        if (unavailableMod) {
          warnings.push({
            code: 'MODIFIER_UNAVAILABLE',
            message: `Option "${unavailableMod.option_name}" on "${enriched.item_name}" is currently unavailable`,
            item_id: enriched.menu_item_id,
            item_name: enriched.item_name,
          });
        }
      } catch (err: any) {
        warnings.push({
          code: 'ITEM_UNAVAILABLE',
          message: 'An item in your cart is no longer available on the menu',
          item_id: rawItem.menu_item_id,
        });
      }
    }

    // Pricing calculation
    const pricing = await pricingService.calculateFullPricing({
      branchId: cart.branch_id,
      items: enrichedItems,
      promoCode: cart.applied_promo_code,
    });

    if (!pricing.minimum_order_met) {
      warnings.push({
        code: 'MINIMUM_ORDER_NOT_MET',
        message: `Order minimum of KES ${(pricing.minimum_order_minor / 100).toFixed(
          0
        )} not met. Add KES ${(pricing.minimum_order_remaining_minor / 100).toFixed(0)} more.`,
        details: {
          minimum_minor: pricing.minimum_order_minor,
          current_minor: pricing.gross_subtotal_minor,
          remaining_minor: pricing.minimum_order_remaining_minor,
        },
      });
    }

    // Check if applied promo is invalid
    if (cart.applied_promo_code && !pricing.applied_promotion) {
      warnings.push({
        code: 'PROMOTION_NO_LONGER_VALID',
        message: `Promo code "${cart.applied_promo_code}" is not valid for this basket`,
      });
    }

    const totalQuantity = enrichedItems.reduce((acc, i) => acc + i.quantity, 0);

    return {
      id: cart.id,
      customer_id: cart.customer_id,
      branch_id: cart.branch_id,
      branch: {
        id: branch.id,
        merchant_id: branch.merchant_id,
        name: branch.name,
        merchant_name: merchant?.display_name || branch.name,
        min_order_minor: branch.min_order_minor || 0,
        currency: branch.currency || 'KES',
        open_status: availability.is_available ? 'OPEN' : 'CLOSED',
        is_open_now: availability.is_available,
        address_text: branch.address_text,
        latitude: branch.latitude,
        longitude: branch.longitude,
      },
      items: enrichedItems,
      total_quantity: totalQuantity,
      currency: cart.currency || 'KES',
      pricing: {
        items_subtotal_minor: pricing.items_subtotal_minor,
        modifiers_subtotal_minor: pricing.modifiers_subtotal_minor,
        subtotal_minor: pricing.gross_subtotal_minor,
        minimum_order_minor: pricing.minimum_order_minor,
        minimum_order_met: pricing.minimum_order_met,
        minimum_order_remaining_minor: pricing.minimum_order_remaining_minor,
        estimated_delivery_fee_minor: pricing.delivery_fee_minor,
        estimated_service_fee_minor: pricing.service_fee_minor,
        discount_minor: pricing.discount_minor,
        estimated_total_minor: pricing.total_minor,
      },
      applied_promo: pricing.applied_promotion
        ? {
            code: pricing.applied_promotion.code,
            type: pricing.applied_promotion.type,
            discount_minor: pricing.discount_minor,
            description: pricing.applied_promotion.description,
          }
        : undefined,
      warnings,
      created_at: cart.created_at,
      updated_at: cart.updated_at,
    };
  }

  /**
   * Add item to active cart with restaurant isolation and duplicate item detection
   */
  public async addItem(customerId: string, input: AddToCartInput): Promise<EnrichedCart> {
    if (!input.quantity || input.quantity < 1 || input.quantity > 99) {
      throw new AppError(400, 'INVALID_QUANTITY', 'Quantity must be between 1 and 99');
    }

    // 1. Verify branch exists and is operational
    const branch = await merchantRepository.findBranchById(input.branch_id);
    if (!branch) {
      throw new AppError(404, 'BRANCH_NOT_FOUND', 'Restaurant branch not found');
    }

    const merchant = await merchantRepository.findMerchantById(branch.merchant_id);
    if (
      !merchant ||
      merchant.status !== MerchantStatus.ACTIVE ||
      merchant.approval_status !== MerchantApprovalStatus.APPROVED
    ) {
      throw new AppError(403, 'MERCHANT_NOT_ACTIVE', 'This restaurant is not currently available');
    }

    // 2. Validate menu item belongs to branch and is available
    const item = await catalogueRepository.findItemById(input.menu_item_id);
    if (!item) {
      throw new AppError(404, 'ITEM_NOT_FOUND', 'Menu item not found');
    }

    const effectiveCatalogue = await catalogueRepository.getEffectiveCatalogueForBranch(input.branch_id);
    if (!effectiveCatalogue) {
      throw new AppError(404, 'MENU_NOT_FOUND', 'No active menu assigned to this branch');
    }

    let foundItemInCatalogue = false;
    for (const cat of effectiveCatalogue.categories) {
      const match = cat.items.find((i) => i.id === input.menu_item_id);
      if (match) {
        foundItemInCatalogue = true;
        if (!match.effective_available) {
          throw new AppError(409, 'ITEM_UNAVAILABLE', `"${match.name}" is currently sold out`);
        }
        break;
      }
    }

    if (!foundItemInCatalogue) {
      throw new AppError(404, 'ITEM_NOT_IN_BRANCH_MENU', 'Item does not belong to this restaurant branch menu');
    }

    // 3. Validate Modifier Option Selections
    const selectedOptionIds = input.modifier_option_ids || [];
    const itemModifierGroups = await catalogueRepository.getModifierGroupsForItem(item.id);

    // Group selected option IDs by their parent modifier group
    const selectionsByGroup = new Map<string, string[]>();
    for (const group of itemModifierGroups) {
      selectionsByGroup.set(group.id, []);
    }

    for (const optId of selectedOptionIds) {
      const option = await catalogueRepository.findModifierOptionById(optId);
      if (!option) {
        throw new AppError(404, 'MODIFIER_OPTION_NOT_FOUND', `Modifier option ${optId} does not exist`);
      }
      if (!option.is_available) {
        throw new AppError(409, 'MODIFIER_UNAVAILABLE', `Selected option "${option.name}" is unavailable`);
      }
      if (!selectionsByGroup.has(option.modifier_group_id)) {
        throw new AppError(400, 'INVALID_MODIFIER_SELECTION', `Option "${option.name}" is not valid for this item`);
      }
      selectionsByGroup.get(option.modifier_group_id)!.push(optId);
    }

    // Validate min/max requirements
    for (const group of itemModifierGroups) {
      const count = selectionsByGroup.get(group.id)!.length;
      if (group.is_required && count < group.min_selections) {
        throw new AppError(
          400,
          'MISSING_REQUIRED_MODIFIER',
          `Please select at least ${group.min_selections} option(s) for "${group.name}"`
        );
      }
      if (count > group.max_selections) {
        throw new AppError(
          400,
          'EXCEEDED_MAX_MODIFIERS',
          `You can select at most ${group.max_selections} option(s) for "${group.name}"`
        );
      }
    }

    // 4. Restaurant Isolation & Conflict Check
    let activeCart = await cartRepository.findActiveCartByCustomer(customerId);

    if (activeCart && activeCart.branch_id !== input.branch_id) {
      const hasItems = (await cartRepository.listCartItems(activeCart.id)).length > 0;
      if (hasItems && !input.force_clear_existing) {
        const existingBranch = await merchantRepository.findBranchById(activeCart.branch_id);
        const existingMerchant = existingBranch
          ? await merchantRepository.findMerchantById(existingBranch.merchant_id)
          : null;

        throw new AppError(
          409,
          'CROSS_RESTAURANT_CART_CONFLICT',
          `Your cart contains items from ${
            existingBranch?.name || 'another restaurant'
          }. Starting a new order will clear your current cart.`,
          {
            existing_cart_id: activeCart.id,
            existing_branch_id: activeCart.branch_id,
            existing_branch_name: existingBranch?.name || 'Previous Restaurant',
            new_branch_id: input.branch_id,
            new_branch_name: branch.name,
          }
        );
      }

      // Retain immutable quotes and order references when retiring a basket.
      await cartRepository.updateCartStatus(activeCart.id, CartStatus.ABANDONED);
      activeCart = null;
    }

    // 5. Create active cart if none exists
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    if (!activeCart) {
      activeCart = await cartRepository.createCart({
        id: generateCartId(),
        customer_id: customerId,
        branch_id: input.branch_id,
        currency: 'KES',
        status: CartStatus.ACTIVE,
        created_at: now,
        updated_at: now,
        expires_at: expiresAt,
      });
    }

    // 6. Duplicate Item Detection
    // Check if an existing cart item has the exact same menu_item_id and same modifier options
    const existingItems = await cartRepository.listCartItems(activeCart.id);
    const sortedSelectedOpts = [...selectedOptionIds].sort();

    let matchedItem: CartItem | null = null;
    for (const existing of existingItems) {
      if (existing.menu_item_id === input.menu_item_id) {
        const existingSortedOpts = [...existing.modifier_option_ids].sort();
        if (
          existingSortedOpts.length === sortedSelectedOpts.length &&
          existingSortedOpts.every((val, idx) => val === sortedSelectedOpts[idx])
        ) {
          matchedItem = existing;
          break;
        }
      }
    }

    if (matchedItem) {
      // Increment quantity
      const newQty = Math.min(99, matchedItem.quantity + input.quantity);
      await cartRepository.updateCartItemQuantity(matchedItem.id, newQty);
    } else {
      // Create new cart item
      const newItem: CartItem = {
        id: generateCartItemId(),
        cart_id: activeCart.id,
        menu_item_id: input.menu_item_id,
        quantity: input.quantity,
        created_at: now,
        updated_at: now,
        modifier_option_ids: selectedOptionIds,
      };
      await cartRepository.createCartItem(newItem);
    }

    // Return refreshed enriched cart
    const updated = await this.getEnrichedCart(customerId);
    return updated!;
  }

  /**
   * Update item quantity in active cart
   */
  public async updateItemQuantity(
    customerId: string,
    itemId: string,
    quantity: number
  ): Promise<EnrichedCart | null> {
    const activeCart = await cartRepository.findActiveCartByCustomer(customerId);
    if (!activeCart) {
      throw new AppError(404, 'CART_NOT_FOUND', 'Active cart not found');
    }

    const item = await cartRepository.findCartItemById(itemId);
    if (!item || item.cart_id !== activeCart.id) {
      throw new AppError(404, 'ITEM_NOT_FOUND', 'Cart item not found');
    }

    if (quantity <= 0) {
      await cartRepository.deleteCartItem(itemId);
    } else {
      const capped = Math.min(99, quantity);
      await cartRepository.updateCartItemQuantity(itemId, capped);
    }

    return this.getEnrichedCart(customerId);
  }

  /**
   * Remove item from cart
   */
  public async removeItem(customerId: string, itemId: string): Promise<EnrichedCart | null> {
    const activeCart = await cartRepository.findActiveCartByCustomer(customerId);
    if (!activeCart) {
      throw new AppError(404, 'CART_NOT_FOUND', 'Active cart not found');
    }

    const item = await cartRepository.findCartItemById(itemId);
    if (!item || item.cart_id !== activeCart.id) {
      throw new AppError(404, 'ITEM_NOT_FOUND', 'Cart item not found');
    }

    await cartRepository.deleteCartItem(itemId);
    return this.getEnrichedCart(customerId);
  }

  /**
   * Clear entire cart
   */
  public async clearCart(customerId: string): Promise<void> {
    const activeCart = await cartRepository.findActiveCartByCustomer(customerId);
    if (activeCart) {
      await cartRepository.updateCartStatus(activeCart.id, CartStatus.ABANDONED);
    }
  }

  /**
   * Apply promotion code to cart
   */
  public async applyPromo(customerId: string, code: string): Promise<EnrichedCart> {
    const activeCart = await cartRepository.findActiveCartByCustomer(customerId);
    if (!activeCart) {
      throw new AppError(404, 'CART_NOT_FOUND', 'Active cart not found');
    }

    const promo = await cartRepository.findPromotionByCode(code);
    if (!promo || promo.status !== PromotionStatus.ACTIVE) {
      throw new AppError(404, 'PROMOTION_NOT_FOUND', `Invalid promotion code "${code}"`);
    }

    const enriched = await this.getEnrichedCart(customerId);
    if (!enriched || enriched.items.length === 0) {
      throw new AppError(400, 'CART_EMPTY', 'Add items to your cart before applying a promo code');
    }

    const evalResult = pricingService.evaluatePromotion(
      promo,
      enriched.pricing.subtotal_minor,
      enriched.pricing.estimated_delivery_fee_minor,
      activeCart.branch_id
    );

    if (!evalResult.isValid) {
      if (evalResult.reasonCode === 'PROMOTION_MINIMUM_NOT_MET') {
        throw new AppError(
          400,
          'PROMOTION_MINIMUM_NOT_MET',
          `This code requires a minimum order of KES ${(promo.minimum_basket_minor / 100).toFixed(0)}`
        );
      }
      throw new AppError(400, 'PROMOTION_INVALID', 'This promotion cannot be applied to your current basket');
    }

    await cartRepository.updateCartPromo(activeCart.id, promo.code);
    const updated = await this.getEnrichedCart(customerId);
    return updated!;
  }

  /**
   * Remove applied promotion code
   */
  public async removePromo(customerId: string): Promise<EnrichedCart> {
    const activeCart = await cartRepository.findActiveCartByCustomer(customerId);
    if (!activeCart) {
      throw new AppError(404, 'CART_NOT_FOUND', 'Active cart not found');
    }

    await cartRepository.updateCartPromo(activeCart.id, null);
    const updated = await this.getEnrichedCart(customerId);
    return updated!;
  }
}

export const cartService = transactionalService(new CartService());
