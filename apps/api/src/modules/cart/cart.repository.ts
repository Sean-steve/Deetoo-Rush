import { storageAdapter } from '../../db/adapter';
import { postgresCart } from './cart.postgres';
import { allowMemoryAdapter } from '../../db/storage-policy';
import { config } from '@deetoo/config';
/**
 * DEETOO - Cart, Pricing, Promotion & Quote Repository
 * Implements persistence with dual PostgreSQL and resilient in-memory storage (ADR-005, DEE-DOM-001)
 */

import {
  Cart,
  CartItem,
  CartStatus,
  DeliveryPricingRule,
  ServiceFeeRule,
  Promotion,
  PromotionType,
  PromotionStatus,
  PromotionFundingSource,
  CheckoutQuote,
} from '@deetoo/types';
import { getDbPool } from '../../db/client';
import { logger } from '@deetoo/utils';

export class CartRepository {
  private carts = new Map<string, Cart>();
  private cartItems = new Map<string, CartItem>();
  private deliveryRules = new Map<string, DeliveryPricingRule>();
  private serviceFeeRules = new Map<string, ServiceFeeRule>();
  private promotions = new Map<string, Promotion>();
  private quotes = new Map<string, CheckoutQuote>();

  constructor() {
    this.seedBaseline();
  }

  private seedBaseline() {
    if (!config.storage.fixtures) return;
    const now = new Date().toISOString();
    const future = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

    // 1. Default Delivery Pricing Rule
    const defaultDeliveryRule: DeliveryPricingRule = {
      id: 'dpr_default_nairobi',
      zone_id: null,
      base_fee_minor: 12000, // KES 120
      included_distance_meters: 3000, // 3.0 km
      per_km_fee_minor: 3500, // KES 35/km beyond 3km
      minimum_fee_minor: 10000, // KES 100
      maximum_fee_minor: 45000, // KES 450
      max_delivery_distance_meters: 15000, // 15 km limit
      status: 'ACTIVE',
      effective_from: now,
      effective_until: future,
      created_at: now,
      updated_at: now,
    };
    this.deliveryRules.set(defaultDeliveryRule.id, defaultDeliveryRule);

    // 2. Default Service Fee Rule (2.5%, min KES 20, max KES 80)
    const defaultServiceFeeRule: ServiceFeeRule = {
      id: 'sfr_default_platform',
      fee_type: 'PERCENTAGE',
      percentage_basis_points: 250, // 2.5%
      fixed_fee_minor: 0,
      minimum_fee_minor: 2000, // KES 20
      maximum_fee_minor: 8000, // KES 80
      status: 'ACTIVE',
      effective_from: now,
      effective_until: future,
      created_at: now,
      updated_at: now,
    };
    this.serviceFeeRules.set(defaultServiceFeeRule.id, defaultServiceFeeRule);

    // 3. Baseline Platform Promotions
    const promoKaribu: Promotion = {
      id: 'promo_karibu100',
      code: 'KARIBU100',
      type: PromotionType.FIXED_AMOUNT,
      value_minor_or_bps: 10000, // KES 100 off
      status: PromotionStatus.ACTIVE,
      start_at: now,
      end_at: future,
      minimum_basket_minor: 50000, // min KES 500
      usage_limit: 5000,
      times_used: 12,
      per_customer_limit: 1,
      funding_source: PromotionFundingSource.DEETOO,
      merchant_funding_bps: 0,
      description: 'KES 100 off welcome discount on orders above KES 500',
      created_at: now,
      updated_at: now,
    };
    this.promotions.set(promoKaribu.code, promoKaribu);

    const promoFreeDel: Promotion = {
      id: 'promo_freedel',
      code: 'FREEDEL',
      type: PromotionType.FREE_DELIVERY,
      value_minor_or_bps: 0,
      status: PromotionStatus.ACTIVE,
      start_at: now,
      end_at: future,
      minimum_basket_minor: 75000, // min KES 750
      usage_limit: 2000,
      times_used: 45,
      per_customer_limit: 2,
      funding_source: PromotionFundingSource.DEETOO,
      merchant_funding_bps: 0,
      description: 'Free delivery on qualifying orders over KES 750',
      created_at: now,
      updated_at: now,
    };
    this.promotions.set(promoFreeDel.code, promoFreeDel);

    const promoDeetoo15: Promotion = {
      id: 'promo_deetoo15',
      code: 'DEETOO15',
      type: PromotionType.PERCENTAGE,
      value_minor_or_bps: 1500, // 15%
      status: PromotionStatus.ACTIVE,
      start_at: now,
      end_at: future,
      minimum_basket_minor: 60000, // min KES 600
      usage_limit: 1000,
      times_used: 8,
      per_customer_limit: 1,
      funding_source: PromotionFundingSource.SHARED,
      merchant_funding_bps: 5000, // 50% merchant funded
      description: '15% discount on food orders over KES 600',
      created_at: now,
      updated_at: now,
    };
    this.promotions.set(promoDeetoo15.code, promoDeetoo15);
  }

  // ==========================================
  // 1. Cart Operations
  // ==========================================

  public async findActiveCartByCustomer(customerId: string): Promise<Cart | null> {
    try {
      const pool = getDbPool();
      const res = await pool.query(
        `SELECT * FROM carts WHERE customer_id = $1 AND status = 'ACTIVE' ORDER BY created_at DESC LIMIT 1`,
        [customerId]
      );
      if (res.rows.length > 0) {
        return res.rows[0];
      }
    } catch {
      allowMemoryAdapter();
      // Ephemeral fallback
    }

    for (const cart of this.carts.values()) {
      if (cart.customer_id === customerId && cart.status === CartStatus.ACTIVE) {
        return { ...cart };
      }
    }
    return null;
  }

  public async findCartById(cartId: string): Promise<Cart | null> {
    try {
      const pool = getDbPool();
      const res = await pool.query(`SELECT * FROM carts WHERE id = $1`, [cartId]);
      if (res.rows.length > 0) {
        return res.rows[0];
      }
    } catch {
      allowMemoryAdapter();
      // Ephemeral fallback
    }

    const cart = this.carts.get(cartId);
    return cart ? { ...cart } : null;
  }

  public async createCart(cart: Cart): Promise<Cart> {
    try {
      const pool = getDbPool();
      await pool.query(
        `INSERT INTO carts (id, customer_id, branch_id, currency, status, applied_promo_code, created_at, updated_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          cart.id,
          cart.customer_id,
          cart.branch_id,
          cart.currency,
          cart.status,
          cart.applied_promo_code || null,
          cart.created_at,
          cart.updated_at,
          cart.expires_at,
        ]
      );
    } catch {
      allowMemoryAdapter();
      // Ephemeral fallback
    }

    this.carts.set(cart.id, { ...cart });
    return { ...cart };
  }

  public async updateCartStatus(cartId: string, status: CartStatus): Promise<void> {
    const now = new Date().toISOString();
    try {
      const pool = getDbPool();
      await pool.query(`UPDATE carts SET status = $1, updated_at = $2 WHERE id = $3`, [status, now, cartId]);
    } catch {
      allowMemoryAdapter();
      // Ephemeral fallback
    }

    const cart = this.carts.get(cartId);
    if (cart) {
      cart.status = status;
      cart.updated_at = now;
    }
  }

  public async updateCartPromo(cartId: string, promoCode: string | null): Promise<void> {
    const now = new Date().toISOString();
    try {
      const pool = getDbPool();
      await pool.query(`UPDATE carts SET applied_promo_code = $1, updated_at = $2 WHERE id = $3`, [
        promoCode,
        now,
        cartId,
      ]);
    } catch {
      allowMemoryAdapter();
      // Ephemeral fallback
    }

    const cart = this.carts.get(cartId);
    if (cart) {
      cart.applied_promo_code = promoCode;
      cart.updated_at = now;
    }
  }

  public async deleteCart(cartId: string): Promise<void> {
    try {
      const pool = getDbPool();
      await pool.query(`DELETE FROM carts WHERE id = $1`, [cartId]);
    } catch {
      allowMemoryAdapter();
      // Ephemeral fallback
    }

    this.carts.delete(cartId);
    for (const [itemId, item] of this.cartItems.entries()) {
      if (item.cart_id === cartId) {
        this.cartItems.delete(itemId);
      }
    }
  }

  // ==========================================
  // 2. Cart Items & Modifiers
  // ==========================================

  public async listCartItems(cartId: string): Promise<CartItem[]> {
    try {
      const pool = getDbPool();
      const res = await pool.query(
        `SELECT ci.*, 
                COALESCE(json_agg(cim.modifier_option_id) FILTER (WHERE cim.modifier_option_id IS NOT NULL), '[]') as modifier_option_ids
         FROM cart_items ci
         LEFT JOIN cart_item_modifiers cim ON ci.id = cim.cart_item_id
         WHERE ci.cart_id = $1
         GROUP BY ci.id
         ORDER BY ci.created_at ASC`,
        [cartId]
      );
      if (res.rows.length > 0) {
        return res.rows.map((r) => ({
          id: r.id,
          cart_id: r.cart_id,
          menu_item_id: r.menu_item_id,
          quantity: r.quantity,
          created_at: r.created_at,
          updated_at: r.updated_at,
          modifier_option_ids: r.modifier_option_ids || [],
        }));
      }
    } catch {
      allowMemoryAdapter();
      // Ephemeral fallback
    }

    const items: CartItem[] = [];
    for (const item of this.cartItems.values()) {
      if (item.cart_id === cartId) {
        items.push({ ...item, modifier_option_ids: [...item.modifier_option_ids] });
      }
    }
    return items.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  public async findCartItemById(itemId: string): Promise<CartItem | null> {
    try {
      const pool = getDbPool();
      const res = await pool.query(
        `SELECT ci.*, 
                COALESCE(json_agg(cim.modifier_option_id) FILTER (WHERE cim.modifier_option_id IS NOT NULL), '[]') as modifier_option_ids
         FROM cart_items ci
         LEFT JOIN cart_item_modifiers cim ON ci.id = cim.cart_item_id
         WHERE ci.id = $1
         GROUP BY ci.id`,
        [itemId]
      );
      if (res.rows.length > 0) {
        const r = res.rows[0];
        return {
          id: r.id,
          cart_id: r.cart_id,
          menu_item_id: r.menu_item_id,
          quantity: r.quantity,
          created_at: r.created_at,
          updated_at: r.updated_at,
          modifier_option_ids: r.modifier_option_ids || [],
        };
      }
    } catch {
      allowMemoryAdapter();
      // Ephemeral fallback
    }

    const item = this.cartItems.get(itemId);
    return item ? { ...item, modifier_option_ids: [...item.modifier_option_ids] } : null;
  }

  public async createCartItem(item: CartItem): Promise<CartItem> {
    try {
      const pool = getDbPool();
      await pool.query(
        `INSERT INTO cart_items (id, cart_id, menu_item_id, quantity, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [item.id, item.cart_id, item.menu_item_id, item.quantity, item.created_at, item.updated_at]
      );

      for (const optId of item.modifier_option_ids) {
        await pool.query(
          `INSERT INTO cart_item_modifiers (id, cart_item_id, modifier_option_id)
           VALUES ($1, $2, $3)`,
          [`mod_${item.id}_${optId}`, item.id, optId]
        );
      }
    } catch {
      allowMemoryAdapter();
      // Ephemeral fallback
    }

    this.cartItems.set(item.id, { ...item, modifier_option_ids: [...item.modifier_option_ids] });
    return { ...item };
  }

  public async updateCartItemQuantity(itemId: string, quantity: number): Promise<CartItem | null> {
    const now = new Date().toISOString();
    try {
      const pool = getDbPool();
      await pool.query(`UPDATE cart_items SET quantity = $1, updated_at = $2 WHERE id = $3`, [quantity, now, itemId]);
    } catch {
      allowMemoryAdapter();
      // Ephemeral fallback
    }

    const item = this.cartItems.get(itemId);
    if (item) {
      item.quantity = quantity;
      item.updated_at = now;
      return { ...item, modifier_option_ids: [...item.modifier_option_ids] };
    }
    return null;
  }

  public async deleteCartItem(itemId: string): Promise<void> {
    try {
      const pool = getDbPool();
      await pool.query(`DELETE FROM cart_items WHERE id = $1`, [itemId]);
    } catch {
      allowMemoryAdapter();
      // Ephemeral fallback
    }

    this.cartItems.delete(itemId);
  }

  public async deleteCartItemsByCart(cartId: string): Promise<void> {
    try {
      const pool = getDbPool();
      await pool.query(`DELETE FROM cart_items WHERE cart_id = $1`, [cartId]);
    } catch {
      allowMemoryAdapter();
      // Ephemeral fallback
    }

    for (const [id, item] of this.cartItems.entries()) {
      if (item.cart_id === cartId) {
        this.cartItems.delete(id);
      }
    }
  }

  // ==========================================
  // 3. Pricing Rules
  // ==========================================

  public async getDeliveryPricingRuleForZone(zoneId?: string | null): Promise<DeliveryPricingRule> {
    try {
      const pool = getDbPool();
      if (zoneId) {
        const res = await pool.query(
          `SELECT * FROM delivery_pricing_rules WHERE zone_id = $1 AND status = 'ACTIVE' ORDER BY created_at DESC LIMIT 1`,
          [zoneId]
        );
        if (res.rows.length > 0) return res.rows[0];
      }
      const defaultRes = await pool.query(
        `SELECT * FROM delivery_pricing_rules WHERE status = 'ACTIVE' ORDER BY created_at DESC LIMIT 1`
      );
      if (defaultRes.rows.length > 0) return defaultRes.rows[0];
    } catch {
      allowMemoryAdapter();
      // Ephemeral fallback
    }

    if (zoneId) {
      for (const rule of this.deliveryRules.values()) {
        if (rule.zone_id === zoneId && rule.status === 'ACTIVE') return { ...rule };
      }
    }
    // Return first active rule
    for (const rule of this.deliveryRules.values()) {
      if (rule.status === 'ACTIVE') return { ...rule };
    }

    // Default safety fallback
    return {
      id: 'dpr_fallback',
      base_fee_minor: 12000,
      included_distance_meters: 3000,
      per_km_fee_minor: 3500,
      minimum_fee_minor: 10000,
      maximum_fee_minor: 45000,
      max_delivery_distance_meters: 15000,
      status: 'ACTIVE',
      effective_from: new Date().toISOString(),
    };
  }

  public async getServiceFeeRule(): Promise<ServiceFeeRule> {
    try {
      const pool = getDbPool();
      const res = await pool.query(
        `SELECT * FROM service_fee_rules WHERE status = 'ACTIVE' ORDER BY created_at DESC LIMIT 1`
      );
      if (res.rows.length > 0) return res.rows[0];
    } catch {
      allowMemoryAdapter();
      // Ephemeral fallback
    }

    for (const rule of this.serviceFeeRules.values()) {
      if (rule.status === 'ACTIVE') return { ...rule };
    }

    return {
      id: 'sfr_fallback',
      fee_type: 'PERCENTAGE',
      percentage_basis_points: 250,
      fixed_fee_minor: 0,
      minimum_fee_minor: 2000,
      maximum_fee_minor: 8000,
      status: 'ACTIVE',
      effective_from: new Date().toISOString(),
    };
  }

  public async listDeliveryPricingRules(): Promise<DeliveryPricingRule[]> {
    try {
      const pool = getDbPool();
      const res = await pool.query(`SELECT * FROM delivery_pricing_rules ORDER BY created_at DESC`);
      if (res.rows.length > 0) return res.rows;
    } catch {
      allowMemoryAdapter();
      // Ephemeral fallback
    }
    return Array.from(this.deliveryRules.values());
  }

  public async listServiceFeeRules(): Promise<ServiceFeeRule[]> {
    try {
      const pool = getDbPool();
      const res = await pool.query(`SELECT * FROM service_fee_rules ORDER BY created_at DESC`);
      if (res.rows.length > 0) return res.rows;
    } catch {
      allowMemoryAdapter();
      // Ephemeral fallback
    }
    return Array.from(this.serviceFeeRules.values());
  }

  public async saveDeliveryPricingRule(rule: DeliveryPricingRule): Promise<DeliveryPricingRule> {
    allowMemoryAdapter();
    this.deliveryRules.set(rule.id, { ...rule });
    return { ...rule };
  }

  public async saveServiceFeeRule(rule: ServiceFeeRule): Promise<ServiceFeeRule> {
    allowMemoryAdapter();
    this.serviceFeeRules.set(rule.id, { ...rule });
    return { ...rule };
  }

  // ==========================================
  // 4. Promotions
  // ==========================================

  public async findPromotionByCode(code: string): Promise<Promotion | null> {
    const normalized = code.trim().toUpperCase();
    try {
      const pool = getDbPool();
      const res = await pool.query(`SELECT * FROM promotions WHERE UPPER(code) = $1`, [normalized]);
      if (res.rows.length > 0) return res.rows[0];
    } catch {
      allowMemoryAdapter();
      // Ephemeral fallback
    }

    const promo = this.promotions.get(normalized);
    return promo ? { ...promo } : null;
  }

  public async listPromotions(filter?: { activeOnly?: boolean }): Promise<Promotion[]> {
    try {
      const pool = getDbPool();
      const query = filter?.activeOnly
        ? `SELECT * FROM promotions WHERE status = 'ACTIVE' ORDER BY created_at DESC`
        : `SELECT * FROM promotions ORDER BY created_at DESC`;
      const res = await pool.query(query);
      if (res.rows.length > 0) return res.rows;
    } catch {
      allowMemoryAdapter();
      // Ephemeral fallback
    }

    const list = Array.from(this.promotions.values());
    if (filter?.activeOnly) {
      return list.filter((p) => p.status === PromotionStatus.ACTIVE);
    }
    return list;
  }

  public async createPromotion(promo: Promotion): Promise<Promotion> {
    const normalized = promo.code.trim().toUpperCase();
    promo.code = normalized;
    try {
      const pool = getDbPool();
      await pool.query(
        `INSERT INTO promotions (id, code, type, value_minor_or_bps, status, start_at, end_at, minimum_basket_minor, usage_limit, times_used, per_customer_limit, merchant_id, branch_id, zone_id, funding_source, merchant_funding_bps, description, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
        [
          promo.id,
          promo.code,
          promo.type,
          promo.value_minor_or_bps,
          promo.status,
          promo.start_at,
          promo.end_at,
          promo.minimum_basket_minor,
          promo.usage_limit,
          promo.times_used,
          promo.per_customer_limit,
          promo.merchant_id || null,
          promo.branch_id || null,
          promo.zone_id || null,
          promo.funding_source,
          promo.merchant_funding_bps,
          promo.description,
          promo.created_at,
          promo.updated_at,
        ]
      );
    } catch {
      allowMemoryAdapter();
      // Ephemeral fallback
    }

    this.promotions.set(normalized, { ...promo });
    return { ...promo };
  }

  public async updatePromotion(id: string, updates: Partial<Promotion>): Promise<Promotion | null> {
    allowMemoryAdapter();
    for (const [code, promo] of this.promotions.entries()) {
      if (promo.id === id) {
        const updated = { ...promo, ...updates, updated_at: new Date().toISOString() };
        this.promotions.set(code, updated);
        return { ...updated };
      }
    }
    return null;
  }

  // ==========================================
  // 5. Checkout Quotes
  // ==========================================

  public async createCheckoutQuote(quote: CheckoutQuote): Promise<CheckoutQuote> {
    try {
      const pool = getDbPool();
      await pool.query(
        `INSERT INTO checkout_quotes (id, quote_id, customer_id, cart_id, branch_id, branch_name, delivery_address_id, delivery_address_snapshot, currency, items_subtotal_minor, modifiers_subtotal_minor, gross_subtotal_minor, discount_minor, discount_funding_source, net_subtotal_minor, delivery_fee_minor, service_fee_minor, tax_minor, total_minor, distance_meters, estimated_duration_min, delivery_pricing_rule_id, service_fee_rule_id, promotion_id, promotion_code, expires_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)`,
        [
          quote.id,
          quote.quote_id,
          quote.customer_id,
          quote.cart_id,
          quote.branch_id,
          quote.branch_name,
          quote.delivery_address_id,
          JSON.stringify(quote.delivery_address_snapshot),
          quote.currency,
          quote.items_subtotal_minor,
          quote.modifiers_subtotal_minor,
          quote.gross_subtotal_minor,
          quote.discount_minor,
          quote.discount_funding_source || null,
          quote.net_subtotal_minor,
          quote.delivery_fee_minor,
          quote.service_fee_minor,
          quote.tax_minor,
          quote.total_minor,
          quote.distance_meters,
          quote.estimated_duration_min,
          quote.delivery_pricing_rule_id,
          quote.service_fee_rule_id,
          quote.promotion_id || null,
          quote.promotion_code || null,
          quote.expires_at,
          quote.created_at,
        ]
      );
    } catch {
      allowMemoryAdapter();
      // Ephemeral fallback
    }

    this.quotes.set(quote.quote_id, { ...quote });
    return { ...quote };
  }

  public async findCheckoutQuoteById(quoteId: string): Promise<CheckoutQuote | null> {
    try {
      const pool = getDbPool();
      const res = await pool.query(`SELECT * FROM checkout_quotes WHERE quote_id = $1 OR id = $1`, [quoteId]);
      if (res.rows.length > 0) {
        const r = res.rows[0];
        return {
          ...r,
          delivery_address_snapshot:
            typeof r.delivery_address_snapshot === 'string'
              ? JSON.parse(r.delivery_address_snapshot)
              : r.delivery_address_snapshot,
        };
      }
    } catch {
      allowMemoryAdapter();
      // Ephemeral fallback
    }

    for (const quote of this.quotes.values()) {
      if (quote.quote_id === quoteId || quote.id === quoteId) {
        return { ...quote };
      }
    }
    return null;
  }
}

export const cartRepository = storageAdapter(new CartRepository(), postgresCart);
