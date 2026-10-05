import { requirePaidOrder, hasVerifiedCapture } from '../payment/paid-order-guard';
import { canonicalHash, lockQuoteSources, requireIdempotencyKey, lockCommand } from '../cart/quote-binding';
import { transactionalService } from '../../db/transaction';
import { notificationService } from '../operations/notification.service';
/**
 * DEETOO - Authoritative Order Engine & Service
 * Orchestrates order placement from checkout quotes, immutable snapshots, state transitions,
 * merchant workflows, idempotency verification, and multi-channel realtime event publication.
 */

import crypto from 'crypto';
import {
  Order,
  OrderItem,
  OrderItemModifier,
  OrderStatus,
  CartStatus,
  CreateOrderInput,
  OrderFilterParams,
  PromotionRedemption,
  RealtimeOrderEvent,
  PromotionFundingSource,
  PromotionType,
} from '@deetoo/types';
import { generateId, logger } from '@deetoo/utils';
import { AppError } from '../../middleware/error-handler';
import { orderRepository } from './order.repository';
import { orderStateMachine } from './order-state-machine';
import { checkoutService } from '../cart/checkout.service';
import { cartRepository } from '../cart/cart.repository';
import { cartService } from '../cart/cart.service';
import { customerRepository } from '../customer/customer.repository';
import { merchantService } from '../merchant/merchant.service';
import { orderEventBroker } from '../realtime/event-broker';
import { dispatchService } from './dispatch.service';

export class OrderService {
  /**
   * Generates a concise human-friendly public order code (e.g. DT-8F4K2)
   */
  private generateOrderNumber(): string {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `DT-${code}`;
  }

  /**
   * POST /orders
   * Convert an authoritative checkout quote into a real, immutable Order.
   * Enforces strict idempotency, TTL, operational availability, and atomic snapshotting.
   */
  public async createOrderFromQuote(
    customerId: string,
    input: CreateOrderInput,
    idempotencyKey?: string
  ): Promise<Order> {
    requireIdempotencyKey(idempotencyKey);
    await lockQuoteSources();
    const quoteId = input.quote_id || input.quoteId;
    if (!quoteId) {
      throw new AppError(400, 'QUOTE_REQUIRED', 'Checkout quote ID is required to place an order');
    }

    // 1. Idempotency Check
    const requestHash = canonicalHash({customerId, quoteId, special_instructions: input.special_instructions || ''});

    if (idempotencyKey) {
      const existingIdempotency = await orderRepository.findIdempotency(idempotencyKey, customerId);
      if (existingIdempotency) {
        if (existingIdempotency.request_hash !== requestHash) throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency key was used for a different order request');
        logger.info('Idempotent order replay detected', {
          service: 'order-engine',
          metadata: { idempotencyKey, customerId, orderId: existingIdempotency.order_id },
        });

        if (existingIdempotency.order_id) {
          const replayOrder = await orderRepository.findById(existingIdempotency.order_id);
          if (replayOrder) {
            return replayOrder;
          }
        }
      }
    }

    // Check if quote was already converted to an order
    const existingOrderForQuote = await orderRepository.findByQuoteId(quoteId);
    if (existingOrderForQuote) {
      throw new AppError(409, 'QUOTE_ALREADY_CONSUMED', 'Replay the original idempotency key or generate a new quote');
    }

    // 2. Authoritative Checkout Quote Validation
    const quote = await checkoutService.getQuote(quoteId, customerId);

    // Verify Quote Expiration TTL
    const expiresAtTime = new Date(quote.expires_at).getTime();
    if (expiresAtTime <= Date.now()) {
      throw new AppError(
        410,
        'QUOTE_EXPIRED',
        'Checkout quote has expired. Please recalculate checkout to obtain current pricing and availability'
      );
    }

    // 3. Re-verify Branch Availability
    const branchAvailability = await merchantService.evaluateBranchAvailability(quote.branch_id);
    if (!branchAvailability.is_available) {
      throw new AppError(
        409,
        'RESTAURANT_UNAVAILABLE',
        `Restaurant is currently not accepting orders: ${(branchAvailability.reasons || []).join(', ') || 'Closed'}`
      );
    }

    // 4. Retrieve Customer and Cart items for snapshotting
    const customer = await customerRepository.getProfileByUserId(customerId);
    const enrichedCart = await cartService.getEnrichedCart(customerId);

    if (!enrichedCart || enrichedCart.items.length === 0) {
      throw new AppError(400, 'CART_EMPTY', 'No active cart items found to snapshot');
    }

    // Verify cart matches quote branch
    if (enrichedCart.branch_id !== quote.branch_id) {
      throw new AppError(
        409,
        'CART_BRANCH_MISMATCH',
        'Active cart does not match the quoted restaurant branch'
      );
    }

    // 5. Build Immutable Order and Item Snapshots
    const orderId = generateId('ord');
    const orderNumber = this.generateOrderNumber();
    const now = new Date().toISOString();

    await checkoutService.validateBinding(quote);
    const orderItems: OrderItem[] = quote.cart_items_snapshot!.map((cartItem) => {
      const orderItemId = generateId('oit');

      const itemModifiers: OrderItemModifier[] = cartItem.modifiers.map((mod) => ({
        id: generateId('oim'),
        order_item_id: orderItemId,
        source_modifier_option_id: mod.option_id,
        group_name: mod.group_name || 'Modifier',
        option_name: mod.option_name,
        unit_price_delta_minor: mod.price_delta_minor,
        quantity: 1,
        created_at: now,
      }));

      return {
        id: orderItemId,
        order_id: orderId,
        source_menu_item_id: cartItem.menu_item_id,
        item_name: cartItem.item_name,
        quantity: cartItem.quantity,
        unit_base_minor: cartItem.unit_base_price_minor,
        line_total_minor: cartItem.line_total_minor,
        item_snapshot: {
          image_url: cartItem.item_image_url,
          unit_modifiers_minor: cartItem.unit_modifiers_price_minor,
          unit_total_minor: cartItem.unit_total_price_minor,
        },
        modifiers: itemModifiers,
      };
    });

    // 6. Build Promotion Snapshot (if applicable)
    let promotionSnapshot = null;
    if (quote.promotion_id && quote.promotion_code) {
      promotionSnapshot = {
        promotion_id: quote.promotion_id,
        promotion_code: quote.promotion_code,
        promotion_type: quote.pricing_rule_snapshot?.promotion?.type,
        discount_minor: quote.discount_minor,
        funding_source: quote.discount_funding_source || PromotionFundingSource.DEETOO,
        merchant_funded_amount_minor: quote.pricing_rule_snapshot!.merchant_funded_minor,
        platform_funded_amount_minor: quote.pricing_rule_snapshot!.platform_funded_minor,
      };
    }

    // 7. Initial Timeline Entry
    const initialTimelineEntry = {
      id: generateId('ot'),
      order_id: orderId,
      from_status: null,
      to_status: OrderStatus.PENDING_PAYMENT,
      actor_type: 'CUSTOMER' as const,
      actor_id: customerId,
      actor_name: customer ? `${customer.first_name} ${customer.last_name}` : 'Customer',
      reason_code: 'PAYMENT_PENDING',
      note: 'Order placed by customer from authoritative checkout quote',
      metadata: {
        quote_id: quote.quote_id,
        total_minor: quote.total_minor,
      },
      created_at: now,
    };

    // 8. Assemble Full Order Entity
    const order: Order = {
      id: orderId,
      public_code: orderNumber,
      order_number: orderNumber,
      checkout_quote_id: quote.quote_id,
      customer_id: customerId,
      customer_name: customer ? `${customer.first_name} ${customer.last_name}` : undefined,
      customer_phone: customer?.phone || quote.delivery_address_snapshot.phone_e164,
      branch_id: quote.branch_id,
      branch_name: quote.branch_name,
      merchant_id: enrichedCart.branch.merchant_id,
      merchant_name: enrichedCart.branch.name,
      status: OrderStatus.PENDING_PAYMENT,
      currency: quote.currency || 'KES',
      subtotal_minor: quote.gross_subtotal_minor,
      delivery_fee_minor: quote.delivery_fee_minor,
      service_fee_minor: quote.service_fee_minor,
      discount_minor: quote.discount_minor,
      total_minor: quote.total_minor,
      items: orderItems,
      delivery_address_snapshot: quote.delivery_address_snapshot,
      pricing_snapshot: {
        financial_snapshot: quote.pricing_rule_snapshot,
        items_subtotal_minor: quote.items_subtotal_minor,
        modifiers_subtotal_minor: quote.modifiers_subtotal_minor,
        gross_subtotal_minor: quote.gross_subtotal_minor,
        discount_minor: quote.discount_minor,
        discount_funding_source: quote.discount_funding_source,
        net_subtotal_minor: quote.net_subtotal_minor,
        delivery_fee_minor: quote.delivery_fee_minor,
        service_fee_minor: quote.service_fee_minor,
        tax_minor: quote.tax_minor,
        total_minor: quote.total_minor,
        currency: quote.currency,
        distance_meters: quote.distance_meters,
        estimated_duration_min: quote.estimated_duration_min,
      },
      promotion_snapshot: promotionSnapshot,
      special_instructions: input.special_instructions || quote.delivery_address_snapshot.instructions,
      estimated_prep_minutes: null,
      estimated_ready_at: null,
      placed_at: null,
      timeline: [initialTimelineEntry],
      version: 1,
      created_at: now,
      updated_at: now,
    };

    // 9. Persist Order Atomically
    const createdOrder = await orderRepository.createOrderAtomic(
      order,
      idempotencyKey,
      requestHash
    );

    // 10. Post-Order Side Effects
    // Mark customer cart as CHECKED_OUT so cart is emptied for subsequent usage
    await cartRepository.updateCartStatus(enrichedCart.id, CartStatus.CHECKED_OUT);

    // Record promotion redemption if promo was applied
    if (quote.promotion_id && quote.discount_minor > 0) {
      const redemption: PromotionRedemption = {
        id: generateId('pred'),
        promotion_id: quote.promotion_id,
        customer_id: customerId,
        order_id: orderId,
        discount_minor: quote.discount_minor,
        created_at: now,
      };
      await orderRepository.recordPromotionRedemption(redemption);
    }

    // 11. Multi-Channel Realtime Event Publication
    const orderPlacedEvent: RealtimeOrderEvent = {
      type: 'order.updated',
      channel: `merchant-branch:${order.branch_id}`,
      order_id: order.id,
      order_number: order.order_number,
      status: OrderStatus.PENDING_PAYMENT,
      branch_id: order.branch_id,
      customer_id: order.customer_id,
      timestamp: now,
      data: {
        id: order.id,
        order_number: order.order_number,
        status: OrderStatus.PENDING_PAYMENT,
        total_minor: order.total_minor,
        items: order.items,
        customer_name: order.customer_name,
      },
    };

    // Publish to merchant branch channel
    // Merchant publication occurs only after verified capture.
    // Publish to customer channel
    await orderEventBroker.publish(`customer:${order.customer_id}`, {
      ...orderPlacedEvent,
      channel: `customer:${order.customer_id}`,
    });
    // Publish to specific order channel
    await orderEventBroker.publish(`order:${order.id}`, {
      ...orderPlacedEvent,
      channel: `order:${order.id}`,
    });
    // Publish to admin monitoring channel
    await orderEventBroker.publish('admin:orders', {
      ...orderPlacedEvent,
      channel: 'admin:orders',
    });

    logger.info('Created new authoritative Order', {
      service: 'order-engine',
      metadata: {
        orderId: order.id,
        orderNumber: order.order_number,
        customerId: order.customer_id,
        branchId: order.branch_id,
        totalMinor: order.total_minor,
      },
    });

    return createdOrder;
  }

  /**
   * Customer cancels order (Permitted only in PLACED state)
   */
  public async customerCancelOrder(
    customerId: string,
    orderId: string,
    reasonCode: string = 'CUSTOMER_CANCELLED',
    note?: string
  ): Promise<Order> {
    await lockCommand(`order:${orderId}`);
    const order = await orderRepository.findById(orderId);
    if (!order) {
      throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found');
    }

    if (order.customer_id !== customerId) {
      throw new AppError(403, 'FORBIDDEN_OPERATION', 'You can only cancel your own orders');
    }

    const transitionResult = orderStateMachine.transition(order, {
      targetStatus: OrderStatus.CANCELLED,
      actorType: 'CUSTOMER',
      actorId: customerId,
      actorName: order.customer_name || 'Customer',
      reasonCode,
      note,
    });

    const updated = await orderRepository.updateOrderStatus(
      order.id,
      transitionResult.newStatus,
      transitionResult.updatedOrderFields,
      transitionResult.timelineEntry
    );

    // Publish cancellation events
    await (await import('../payment/payment.service')).paymentService.coordinateCancellation(updated.id);
    await this.publishTransitionEvents(updated, 'order.cancelled');

    return updated;
  }

  /**
   * Merchant accepts order and provides estimated preparation minutes
   */
  public async merchantAcceptOrder(
    branchId: string,
    staffUser: { id: string; email: string },
    orderId: string,
    preparationMinutes: number = 20
  ): Promise<Order> {
    await lockCommand(`order:${orderId}`);
    const order = await orderRepository.findById(orderId);
    if (!order) {
      throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found');
    }

    await requirePaidOrder(order.id, true);
    if (order.branch_id !== branchId) {
      throw new AppError(403, 'FORBIDDEN_BRANCH_ORDER', 'Order does not belong to your restaurant branch');
    }

    const prepMins = Math.max(1, Math.min(180, preparationMinutes));

    const transitionResult = orderStateMachine.transition(order, {
      targetStatus: OrderStatus.ACCEPTED,
      actorType: 'MERCHANT',
      actorId: staffUser.id,
      actorName: staffUser.email,
      metadata: {
        preparation_minutes: prepMins,
        estimated_prep_minutes: prepMins,
      },
      note: `Merchant accepted order with ${prepMins} min preparation estimate`,
    });

    const updated = await orderRepository.updateOrderStatus(
      order.id,
      transitionResult.newStatus,
      transitionResult.updatedOrderFields,
      transitionResult.timelineEntry
    );

    // Publish accept events
    await this.publishTransitionEvents(updated, 'order.accepted');
    await this.notifyCustomer(updated, 'ORDER_ACCEPTED', 'Your order was accepted', { preparationMinutes: prepMins });

    // Sprint 9: Hook Dispatch Engine to schedule or trigger delivery rider matching
    try {
      await dispatchService.onOrderAccepted(updated, prepMins);
    } catch (dispatchErr) {
      logger.warn('Failed to auto-trigger dispatch on order acceptance', {
        service: 'order-engine',
        metadata: { error: (dispatchErr as Error).message },
      });
    }

    return updated;
  }

  /**
   * Merchant rejects incoming order
   */
  public async merchantRejectOrder(
    branchId: string,
    staffUser: { id: string; email: string },
    orderId: string,
    reasonCode: string = 'KITCHEN_OVERLOAD',
    note?: string
  ): Promise<Order> {
    await lockCommand(`order:${orderId}`);
    const order = await orderRepository.findById(orderId);
    if (!order) {
      throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found');
    }

    await requirePaidOrder(order.id, true);
    if (order.branch_id !== branchId) {
      throw new AppError(403, 'FORBIDDEN_BRANCH_ORDER', 'Order does not belong to your restaurant branch');
    }

    const transitionResult = orderStateMachine.transition(order, {
      targetStatus: OrderStatus.REJECTED,
      actorType: 'MERCHANT',
      actorId: staffUser.id,
      actorName: staffUser.email,
      reasonCode,
      note,
    });

    const updated = await orderRepository.updateOrderStatus(
      order.id,
      transitionResult.newStatus,
      transitionResult.updatedOrderFields,
      transitionResult.timelineEntry
    );

    await (await import('../payment/payment.service')).paymentService.coordinateCancellation(updated.id);
    await this.publishTransitionEvents(updated, 'order.rejected');
    await this.notifyCustomer(updated, 'ORDER_REJECTED', 'Your order was declined', { reasonCode });

    return updated;
  }

  /**
   * Merchant marks order as PREPARING in kitchen
   */
  public async merchantMarkPreparing(
    branchId: string,
    staffUser: { id: string; email: string },
    orderId: string
  ): Promise<Order> {
    await lockCommand(`order:${orderId}`);
    const order = await orderRepository.findById(orderId);
    if (!order) {
      throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found');
    }

    await requirePaidOrder(order.id, true);
    if (order.branch_id !== branchId) {
      throw new AppError(403, 'FORBIDDEN_BRANCH_ORDER', 'Order does not belong to your restaurant branch');
    }

    const transitionResult = orderStateMachine.transition(order, {
      targetStatus: OrderStatus.PREPARING,
      actorType: 'MERCHANT',
      actorId: staffUser.id,
      actorName: staffUser.email,
      note: 'Kitchen started food preparation',
    });

    const updated = await orderRepository.updateOrderStatus(
      order.id,
      transitionResult.newStatus,
      transitionResult.updatedOrderFields,
      transitionResult.timelineEntry
    );

    await this.publishTransitionEvents(updated, 'order.preparing');

    return updated;
  }

  /**
   * Merchant marks order as READY for pickup/dispatch
   */
  public async merchantMarkReady(
    branchId: string,
    staffUser: { id: string; email: string },
    orderId: string
  ): Promise<Order> {
    await lockCommand(`order:${orderId}`);
    const order = await orderRepository.findById(orderId);
    if (!order) {
      throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found');
    }

    await requirePaidOrder(order.id, true);
    if (order.branch_id !== branchId) {
      throw new AppError(403, 'FORBIDDEN_BRANCH_ORDER', 'Order does not belong to your restaurant branch');
    }

    const transitionResult = orderStateMachine.transition(order, {
      targetStatus: OrderStatus.READY,
      actorType: 'MERCHANT',
      actorId: staffUser.id,
      actorName: staffUser.email,
      note: 'Kitchen marked food as packaged and ready',
    });

    const updated = await orderRepository.updateOrderStatus(
      order.id,
      transitionResult.newStatus,
      transitionResult.updatedOrderFields,
      transitionResult.timelineEntry
    );

    await this.publishTransitionEvents(updated, 'order.ready');
    await this.notifyCustomer(updated, 'ORDER_READY', 'Your order is ready and awaiting a rider');
    try {
      await dispatchService.onOrderReady(updated);
    } catch (dispatchErr) {
      logger.warn('Failed to auto-trigger dispatch on order ready', {
        service: 'order-engine',
        metadata: { error: (dispatchErr as Error).message },
      });
    }

    return updated;
  }

  /**
   * Merchant operational cancellation
   */
  public async merchantCancelOrder(
    branchId: string,
    staffUser: { id: string; email: string },
    orderId: string,
    reasonCode: string,
    note?: string
  ): Promise<Order> {
    await lockCommand(`order:${orderId}`);
    const order = await orderRepository.findById(orderId);
    if (!order) {
      throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found');
    }

    await requirePaidOrder(order.id, true);
    if (order.branch_id !== branchId) {
      throw new AppError(403, 'FORBIDDEN_BRANCH_ORDER', 'Order does not belong to your restaurant branch');
    }

    const transitionResult = orderStateMachine.transition(order, {
      targetStatus: OrderStatus.CANCELLED,
      actorType: 'MERCHANT',
      actorId: staffUser.id,
      actorName: staffUser.email,
      reasonCode: reasonCode || 'MERCHANT_CANCELLED',
      note,
    });

    const updated = await orderRepository.updateOrderStatus(
      order.id,
      transitionResult.newStatus,
      transitionResult.updatedOrderFields,
      transitionResult.timelineEntry
    );

    await (await import('../payment/payment.service')).paymentService.coordinateCancellation(updated.id);
    await this.publishTransitionEvents(updated, 'order.cancelled');

    return updated;
  }

  /**
   * Admin cancellation with operational note
   */
  public async adminCancelOrder(
    adminUser: { id: string; email: string },
    orderId: string,
    reasonCode: string,
    note?: string
  ): Promise<Order> {
    await lockCommand(`order:${orderId}`);
    const order = await orderRepository.findById(orderId);
    if (!order) {
      throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found');
    }

    const transitionResult = orderStateMachine.transition(order, {
      targetStatus: OrderStatus.CANCELLED,
      actorType: 'ADMIN',
      actorId: adminUser.id,
      actorName: adminUser.email,
      reasonCode: reasonCode || 'ADMIN_INTERVENTION',
      note,
    });

    const updated = await orderRepository.updateOrderStatus(
      order.id,
      transitionResult.newStatus,
      transitionResult.updatedOrderFields,
      transitionResult.timelineEntry
    );

    await (await import('../payment/payment.service')).paymentService.coordinateCancellation(updated.id);
    await this.publishTransitionEvents(updated, 'order.cancelled');

    return updated;
  }

  /**
   * Helper to broadcast order transition events across all relevant channels
   */
  private async publishTransitionEvents(
    order: Order,
    type: RealtimeOrderEvent['type']
  ): Promise<void> {
    const now = new Date().toISOString();
    const event: RealtimeOrderEvent = {
      type,
      channel: `order:${order.id}`,
      order_id: order.id,
      order_number: order.order_number,
      status: order.status,
      branch_id: order.branch_id,
      customer_id: order.customer_id,
      timestamp: now,
      data: order,
    };

    await orderEventBroker.publish(`order:${order.id}`, event);
    await orderEventBroker.publish(`customer:${order.customer_id}`, {
      ...event,
      channel: `customer:${order.customer_id}`,
    });
    await orderEventBroker.publish(`merchant-branch:${order.branch_id}`, {
      ...event,
      channel: `merchant-branch:${order.branch_id}`,
    });
    await orderEventBroker.publish('admin:orders', {
      ...event,
      channel: 'admin:orders',
    });
  }

  /**
   * Best-effort customer notification on an order lifecycle event. Never blocks or fails the
   * transition it's called from -- notification delivery is not part of the state machine's
   * correctness, and a notification-service outage must never prevent an order from being
   * accepted/rejected. Mirrors the same try/catch-and-log pattern already used for
   * dispatchService.onOrderAccepted/onOrderReady above.
   */
  private async notifyCustomer(
    order: Order,
    templateCode: string,
    subject: string,
    extraPayload: Record<string, unknown> = {}
  ): Promise<void> {
    try {
      await notificationService.sendNotification({
        recipientType: 'CUSTOMER' as any,
        recipientId: order.customer_id,
        channel: 'IN_APP' as any,
        templateCode,
        subject,
        referenceId: order.id,
        payload: { orderId: order.id, orderNumber: order.order_number, status: order.status, ...extraPayload },
      });
    } catch (notifyErr) {
      logger.warn('Failed to send customer order notification', {
        service: 'order-engine',
        orderId: order.id,
        templateCode,
        error: (notifyErr as Error).message,
      });
    }
  }

  /**
   * Get single order by ID or order number with access authorization check
   */
  public async getOrderById(orderIdOrNumber: string): Promise<Order> {
    let order = await orderRepository.findById(orderIdOrNumber);
    if (!order) {
      order = await orderRepository.findByOrderNumber(orderIdOrNumber);
    }
    if (!order) {
      throw new AppError(404, 'ORDER_NOT_FOUND', `Order '${orderIdOrNumber}' not found`);
    }
    return order;
  }

  /**
   * Get customer orders
   */
  public async getCustomerOrders(
    customerId: string,
    options: { status?: string; limit?: number; page?: number } = {}
  ): Promise<Order[]> {
    return orderRepository.findCustomerOrders(customerId, options);
  }

  /**
   * Get merchant branch orders
   */
  public async getBranchOrders(
    branchId: string,
    options: { status?: string; limit?: number; page?: number } = {}
  ): Promise<Order[]> {
    const orders = await orderRepository.findBranchOrders(branchId, options);
    const visible: Order[] = [];
    for (const order of orders) if (order.status !== OrderStatus.PENDING_PAYMENT && await hasVerifiedCapture(order.id)) visible.push(order);
    return visible;
  }

  /**
   * Get admin orders with filtering
   */
  public async getAdminOrders(
    filters: OrderFilterParams = {}
  ): Promise<{ orders: Order[]; total: number }> {
    return orderRepository.findAllOrders(filters);
  }
}

export const orderService = transactionalService(new OrderService());
