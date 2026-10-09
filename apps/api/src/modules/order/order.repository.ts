import { allowMemoryAdapter } from '../../db/storage-policy';
import { config } from '@deetoo/config';
/**
 * DEETOO - Core Order Repository
 * Implements dual-persistence architecture (PostgreSQL + In-Memory Fallback)
 * Handles transactional order creation, immutable item snapshots, modifiers, timeline, and idempotency.
 */

import {
  Order,
  OrderItem,
  OrderItemModifier,
  OrderStatus,
  OrderTimelineEntry,
  OrderFilterParams,
  PromotionRedemption,
} from '@deetoo/types';
import { getDbPool } from '../../db/client';
import { logger } from '@deetoo/utils';
import { AppError } from '../../middleware/error-handler';

export interface IdempotencyRecord {
  key: string;
  user_id: string;
  request_hash: string;
  status: 'PROCESSING' | 'COMPLETED';
  response_code: number;
  response_body: Record<string, unknown>;
  order_id?: string;
  created_at: string;
}

export class OrderRepository {
  private orders = new Map<string, Order>();
  private items = new Map<string, OrderItem>();
  private modifiers = new Map<string, OrderItemModifier>();
  private timelineEntries = new Map<string, OrderTimelineEntry[]>();
  private idempotencyStore = new Map<string, IdempotencyRecord>();
  private promoRedemptions = new Map<string, PromotionRedemption>();

  constructor() {
    this.seedBaseline();
  }

  private seedBaseline() {
    if (!config.storage.fixtures) return;
    // Baseline demo orders can be loaded here if needed for tests
  }

  public clearInMemory(): void {
    this.orders.clear();
    this.items.clear();
    this.modifiers.clear();
    this.timelineEntries.clear();
    this.idempotencyStore.clear();
    this.promoRedemptions.clear();
  }

  public async createOrder(order: any): Promise<Order> {
    return this.createOrderAtomic(order);
  }

  /**
   * Atomically save order, items, modifiers, timeline, and idempotency key
   */
  public async createOrderAtomic(
    order: any,
    idempotencyKey?: string,
    requestHash?: string
  ): Promise<Order> {
    if (config.storage.mode === "memory") {
    // 1. In-memory store update (always kept in sync)
    this.orders.set(order.id, { ...order });

    // Store items and modifiers
    for (const item of (order.items || [])) {
      this.items.set(item.id, { ...item });
      for (const mod of (item.modifiers || [])) {
        this.modifiers.set(mod.id, { ...mod });
      }
    }

    // Store timeline entries
    this.timelineEntries.set(order.id, [...(order.timeline || [])]);

    // Record idempotency
    if (idempotencyKey && order.customer_id) {
      this.idempotencyStore.set(`${order.customer_id}:${idempotencyKey}`, {
        key: idempotencyKey,
        user_id: order.customer_id,
        request_hash: requestHash || '',
        status: 'COMPLETED',
        response_code: 201,
        response_body: { id: order.id, order_number: order.order_number },
        order_id: order.id,
        created_at: new Date().toISOString(),
      });
    }

    }

    // 2. Try PostgreSQL persistence
    try {
      const pool = getDbPool();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Insert Order
        await client.query(
          `INSERT INTO orders (
            id, public_code, order_number, checkout_quote_id, customer_id, branch_id, merchant_id,
            status, currency, subtotal_minor, delivery_fee_minor, service_fee_minor, discount_minor, total_minor,
            customer_name, customer_phone, branch_name, merchant_name,
            delivery_address_snapshot, pricing_snapshot, promotion_snapshot, special_instructions,
            placed_at, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            $8, $9, $10, $11, $12, $13, $14,
            $15, $16, $17, $18,
            $19, $20, $21, $22,
            $23, $24, $25
          ) ON CONFLICT (id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP`,
          [
            order.id,
            order.public_code,
            order.order_number,
            order.checkout_quote_id,
            order.customer_id,
            order.branch_id,
            order.merchant_id,
            order.status,
            order.currency,
            order.subtotal_minor,
            order.delivery_fee_minor,
            order.service_fee_minor,
            order.discount_minor,
            order.total_minor,
            order.customer_name || null,
            order.customer_phone || null,
            order.branch_name || null,
            order.merchant_name || null,
            JSON.stringify(order.delivery_address_snapshot),
            JSON.stringify(order.pricing_snapshot),
            order.promotion_snapshot ? JSON.stringify(order.promotion_snapshot) : null,
            order.special_instructions || null,
            order.placed_at || null,
            order.created_at,
            order.updated_at,
          ]
        );

        // Reserve available inventory inside the SAME transaction as the order snapshot.
        // No stock row = intentionally untracked product; tracked products cannot oversell.
        // Sorted IDs establish consistent row lock ordering between concurrent carts.
        const stockQuantities = new Map<string, number>();
        for (const item of order.items || []) if (item.source_menu_item_id) {
          stockQuantities.set(item.source_menu_item_id,
            (stockQuantities.get(item.source_menu_item_id) || 0) + item.quantity);
        }
        for (const [itemId, quantity] of [...stockQuantities.entries()].sort(([a], [b]) => a.localeCompare(b))) {
          const inventory = await client.query(
            `SELECT quantity,low_stock_threshold FROM merchant_item_inventory
             WHERE branch_id=$1 AND item_id=$2 FOR UPDATE`, [order.branch_id, itemId]);
          if (!inventory.rowCount) continue;
          const remaining = Number(inventory.rows[0].quantity) - quantity;
          if (remaining < 0) {
            throw new AppError(409, 'INSUFFICIENT_STOCK', 'Insufficient stock for an item in this order');
          }
          await client.query(
            `UPDATE merchant_item_inventory SET quantity=$3,updated_at=NOW()
             WHERE branch_id=$1 AND item_id=$2`, [order.branch_id,itemId,remaining]);
          await client.query(
            `INSERT INTO merchant_stock_reservations(order_id,branch_id,item_id,quantity,expires_at)
             VALUES($1,$2,$3,$4,NOW()+INTERVAL '30 minutes')`,
            [order.id,order.branch_id,itemId,quantity]);
          if (Number(inventory.rows[0].quantity)>Number(inventory.rows[0].low_stock_threshold) &&
              remaining<=Number(inventory.rows[0].low_stock_threshold)) {
            await client.query(
              `INSERT INTO notifications(recipient_type,recipient_id,channel,template_code,subject,payload,idempotency_key)
               VALUES('MERCHANT',$1,'IN_APP','LOW_STOCK','Item stock below threshold',$2,$3)
               ON CONFLICT (idempotency_key) DO NOTHING`,
               [order.merchant_id,JSON.stringify({branch_id:order.branch_id,item_id:itemId,quantity:remaining}),
                 'stock-order:'+order.id+':'+itemId]);
          }
        }

        // Insert Order Items
        for (const item of order.items) {
          await client.query(
            `INSERT INTO order_items (
              id, order_id, source_menu_item_id, item_name, quantity, unit_base_minor, line_total_minor, item_snapshot
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (id) DO NOTHING`,
            [
              item.id,
              order.id,
              item.source_menu_item_id || null,
              item.item_name,
              item.quantity,
              item.unit_base_minor,
              item.line_total_minor,
              JSON.stringify(item.item_snapshot),
            ]
          );

          // Insert Item Modifiers
          for (const mod of item.modifiers) {
            await client.query(
              `INSERT INTO order_item_modifiers (
                id, order_item_id, source_modifier_option_id, group_name, option_name, unit_price_delta_minor, quantity, created_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
               ON CONFLICT (id) DO NOTHING`,
              [
                mod.id,
                item.id,
                mod.source_modifier_option_id || null,
                mod.group_name,
                mod.option_name,
                mod.unit_price_delta_minor,
                mod.quantity,
              ]
            );
          }
        }

        // Insert Timeline entries
        for (const entry of order.timeline) {
          await client.query(
            `INSERT INTO order_timeline (
              id, order_id, from_status, to_status, actor_type, actor_id, actor_name, reason_code, note, metadata, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             ON CONFLICT (id) DO NOTHING`,
            [
              entry.id,
              order.id,
              entry.from_status,
              entry.to_status,
              entry.actor_type,
              entry.actor_id || null,
              entry.actor_name || null,
              entry.reason_code || null,
              entry.note || null,
              JSON.stringify(entry.metadata || {}),
              entry.created_at,
            ]
          );
        }

        // Record Idempotency Key
        if (idempotencyKey && order.customer_id) {
          await client.query(
            `INSERT INTO idempotency_keys (
              id, actor_type, actor_id, operation, expires_at, key, user_id, request_hash, status, response_code, response_body, order_id
            ) VALUES (gen_random_uuid(), 'CUSTOMER', $2, 'CREATE_ORDER', now()+interval '24 hours', $1, $2, $3, 'COMPLETED', 201, $4, $5)`,
            [
              idempotencyKey,
              order.customer_id,
              requestHash || '',
              JSON.stringify({ id: order.id, order_number: order.order_number }),
              order.id,
            ]
          );
        }

        await client.query('COMMIT');
      } catch (sqlErr) {
        await client.query('ROLLBACK');
        throw sqlErr;
      } finally {
        client.release();
      }
    } catch (err: any) {
      if (config.storage.mode !== 'memory') {
        if (err instanceof AppError) throw err;
        throw new AppError(503,'DURABLE_STORAGE_REQUIRED','Order persistence failed; no inventory was reserved');
      }
      allowMemoryAdapter();
      logger.warn('Order persisted to memory store (PostgreSQL unavailable or offline)', {
        service: 'order-repo',
        metadata: { orderId: order.id, error: err.message },
      });
    }

    return order;
  }

  /**
   * Find order by unique database ID
   */
  public async findById(orderId: string): Promise<Order | null> {
    const memoryOrder = config.storage.mode === "memory" ? this.orders.get(orderId) : undefined;
    if (memoryOrder) {
      return this.enrichMemoryOrder(memoryOrder);
    }

    try {
      const pool = getDbPool();
      const client = await pool.connect();
      try {
        const { rows } = await client.query('SELECT * FROM orders WHERE id = $1', [orderId]);
        if (rows.length === 0) return null;
        return this.mapSqlRowToOrder(rows[0], client);
      } finally {
        client.release();
      }
    } catch {
      allowMemoryAdapter();
      return null;
    }
  }

  /**
   * Find order by human-friendly public order number (e.g. DT-8F4K2)
   */
  public async findByOrderNumber(orderNumber: string): Promise<Order | null> {
    for (const order of config.storage.mode === "memory" ? this.orders.values() : []) {
      if (order.order_number === orderNumber || order.public_code === orderNumber) {
        return this.enrichMemoryOrder(order);
      }
    }

    try {
      const pool = getDbPool();
      const client = await pool.connect();
      try {
        const { rows } = await client.query(
          'SELECT * FROM orders WHERE order_number = $1 OR public_code = $1',
          [orderNumber]
        );
        if (rows.length === 0) return null;
        return this.mapSqlRowToOrder(rows[0], client);
      } finally {
        client.release();
      }
    } catch {
      allowMemoryAdapter();
      return null;
    }
  }

  /**
   * Find order by source checkout quote ID
   */
  public async findByQuoteId(quoteId: string): Promise<Order | null> {
    for (const order of config.storage.mode === "memory" ? this.orders.values() : []) {
      if (order.checkout_quote_id === quoteId) {
        return this.enrichMemoryOrder(order);
      }
    }

    try {
      const pool = getDbPool();
      const client = await pool.connect();
      try {
        const { rows } = await client.query(
          'SELECT * FROM orders WHERE checkout_quote_id = $1',
          [quoteId]
        );
        if (rows.length === 0) return null;
        return this.mapSqlRowToOrder(rows[0], client);
      } finally {
        client.release();
      }
    } catch {
      allowMemoryAdapter();
      return null;
    }
  }

  /**
   * Find orders placed by a specific customer, newest first
   */
  public async findCustomerOrders(
    customerId: string,
    options: { status?: string; limit?: number; page?: number } = {}
  ): Promise<Order[]> {
    if (config.storage.mode === "postgres") return (await this.findAllOrders({ customer_id:customerId,status:options.status as any,limit:options.limit,page:options.page })).orders;
    const limit = options.limit || 50;
    const all = Array.from(this.orders.values())
      .filter((o) => o.customer_id === customerId)
      .filter((o) => (options.status ? o.status === options.status : true))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit);

    return all.map((o) => this.enrichMemoryOrder(o));
  }

  /**
   * Find orders for a specific merchant branch
   */
  public async findBranchOrders(
    branchId: string,
    options: { status?: string; limit?: number; page?: number } = {}
  ): Promise<Order[]> {
    if (config.storage.mode === 'postgres') {
      const result=await getDbPool().query("SELECT o.id FROM orders o WHERE o.branch_id=$1 AND o.status<>'PENDING_PAYMENT' AND ($2::text IS NULL OR o.status=$2) AND EXISTS(SELECT 1 FROM payment_capture_evidence e WHERE e.order_id=o.id) ORDER BY o.created_at DESC LIMIT $3 OFFSET $4",[branchId,options.status||null,Math.min(options.limit||100,500),(Math.max(options.page||1,1)-1)*(options.limit||100)]);
      return (await Promise.all(result.rows.map(r=>this.findById(r.id)))).filter((o):o is Order=>!!o);
    }
    const limit = options.limit || 100;
    const all = Array.from(this.orders.values())
      .filter((o) => o.branch_id === branchId)
      .filter((o) => (options.status ? o.status === options.status : true))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit);

    return all.map((o) => this.enrichMemoryOrder(o));
  }

  /**
   * Admin / Operations global order listing with rich filters
   */
  public async findAllOrders(
    filters: OrderFilterParams = {}
  ): Promise<{ orders: Order[]; total: number }> {
    if (config.storage.mode === "postgres") {
      const client=await getDbPool().connect();
      try {
        const args=[filters.status||null,filters.branch_id||filters.branchId||null,filters.customer_id||filters.customerId||null,filters.search||null];
        const where="($1::text IS NULL OR status=$1) AND ($2::uuid IS NULL OR branch_id=$2) AND ($3::uuid IS NULL OR customer_id=$3) AND ($4::text IS NULL OR order_number ILIKE '%'||$4||'%' OR customer_name ILIKE '%'||$4||'%')";
        const limit=Math.min(filters.limit||50,500),page=Math.max(filters.page||1,1);
        const result=await client.query(`SELECT * FROM orders WHERE ${where} ORDER BY created_at DESC LIMIT $5 OFFSET $6`,[...args,limit,(page-1)*limit]);
        const orders=[];
        for(const row of result.rows)orders.push(await this.mapSqlRowToOrder(row,client));
        const count=await client.query(`SELECT count(*) AS n FROM orders WHERE ${where}`,args);
        return {orders,total:Number(count.rows[0].n)};
      } finally {client.release();}
    }
    let list = Array.from(this.orders.values());

    if (filters.status) {
      list = list.filter((o) => o.status === filters.status);
    }
    if (filters.branch_id || filters.branchId) {
      const bId = filters.branch_id || filters.branchId;
      list = list.filter((o) => o.branch_id === bId);
    }
    if (filters.customer_id || filters.customerId) {
      const cId = filters.customer_id || filters.customerId;
      list = list.filter((o) => o.customer_id === cId);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(
        (o) =>
          (o.order_number && o.order_number.toLowerCase().includes(q)) ||
          (o.public_code && o.public_code.toLowerCase().includes(q)) ||
          (o.customer_name && o.customer_name.toLowerCase().includes(q)) ||
          (o.branch_name && o.branch_name.toLowerCase().includes(q))
      );
    }

    list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const total = list.length;
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const paginated = list.slice((page - 1) * limit, page * limit);

    return {
      orders: paginated.map((o) => this.enrichMemoryOrder(o)),
      total,
    };
  }

  /**
   * Update order status with timeline audit entry
   */
  public async updateOrderStatus(
    orderId: string,
    nextStatus: OrderStatus,
    updates: Partial<Order>,
    timelineEntry: OrderTimelineEntry
  ): Promise<Order> {
    const existing = await this.findById(orderId);
    if (!existing) {
      throw new Error(`Order ${orderId} not found`);
    }

    const updated: Order = {
      ...existing,
      ...updates,
      status: nextStatus,
      updated_at: new Date().toISOString(),
      version: existing.version + 1,
    };

    if (config.storage.mode === "memory") {
    // Update memory
    this.orders.set(orderId, updated);
    const existingTimeline = this.timelineEntries.get(orderId) || [];
    existingTimeline.push(timelineEntry);
    this.timelineEntries.set(orderId, existingTimeline);
    updated.timeline = existingTimeline;

    }
    // Try PostgreSQL update
    try {
      const pool = getDbPool();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const statusResult = await client.query(
          `UPDATE orders
           SET status = $1,
               version = version + 1,
               estimated_prep_minutes = COALESCE($2, estimated_prep_minutes),
               estimated_ready_at = COALESCE($3, estimated_ready_at),
               accepted_at = COALESCE($4, accepted_at),
               preparing_at = COALESCE($5, preparing_at),
               ready_at = COALESCE($6, ready_at),
               completed_at = COALESCE($7, completed_at),
               rejected_at = COALESCE($8, rejected_at),
               rejection_reason = COALESCE($9, rejection_reason),
               cancelled_at = COALESCE($10, cancelled_at),
               cancellation_reason = COALESCE($11, cancellation_reason),
               cancelled_by_type = COALESCE($12, cancelled_by_type),
               cancelled_by_id = COALESCE($13, cancelled_by_id),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $14 AND status = $15`,
          [
            nextStatus,
            updates.estimated_prep_minutes || null,
            updates.estimated_ready_at || null,
            updates.accepted_at || null,
            updates.preparing_at || null,
            updates.ready_at || null,
            updates.completed_at || null,
            updates.rejected_at || null,
            updates.rejection_reason || null,
            updates.cancelled_at || null,
            updates.cancellation_reason || null,
            updates.cancelled_by_type || null,
            updates.cancelled_by_id || null,
            orderId,
            existing.status,
          ]
        );
        if (!statusResult.rowCount) {
          throw new AppError(409,'ORDER_STATE_CONFLICT','Order changed while this transition was being processed');
        }

        await client.query(
          `INSERT INTO order_timeline (
            id, order_id, from_status, to_status, actor_type, actor_id, actor_name, reason_code, note, metadata, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            timelineEntry.id,
            orderId,
            timelineEntry.from_status,
            timelineEntry.to_status,
            timelineEntry.actor_type,
            timelineEntry.actor_id || null,
            timelineEntry.actor_name || null,
            timelineEntry.reason_code || null,
            timelineEntry.note || null,
            JSON.stringify(timelineEntry.metadata || {}),
            timelineEntry.created_at,
          ]
        );

        // Reservations become confirmed only after verified provider capture and PLACED.
        // Cancellation/rejection restores *unconfirmed* stock once (idempotent transition).
        if (nextStatus === OrderStatus.PLACED) {
          await client.query(
            `UPDATE merchant_stock_reservations SET state='CONFIRMED',confirmed_at=NOW()
             WHERE order_id=$1 AND state='HELD'`, [orderId]);
        } else if (nextStatus === OrderStatus.CANCELLED || nextStatus === OrderStatus.REJECTED) {
          const released = await client.query(
            `UPDATE merchant_stock_reservations
             SET state='RELEASED',released_at=NOW()
             WHERE order_id=$1 AND state IN ('HELD','CONFIRMED')
             RETURNING branch_id,item_id,quantity`, [orderId]);
          for (const held of released.rows) {
            await client.query(
              `UPDATE merchant_item_inventory SET quantity=quantity+$3,updated_at=NOW()
               WHERE branch_id=$1 AND item_id=$2`,
              [held.branch_id,held.item_id,held.quantity]);
          }
        }

        await client.query('COMMIT');
      } catch (sqlErr) {
        await client.query('ROLLBACK');
        throw sqlErr;
      } finally {
        client.release();
      }
    } catch (err: any) {
      allowMemoryAdapter();
      logger.warn('Updated order status in memory store', {
        service: 'order-repo',
        metadata: { orderId, nextStatus, error: err.message },
      });
    }

    return updated;
  }

  /**
   * Check idempotency record
   */
  public async findIdempotency(key: string, userId: string): Promise<IdempotencyRecord | null> {
    const memoryRecord = config.storage.mode === "memory" ? this.idempotencyStore.get(`${userId}:${key}`) : undefined;
    if (memoryRecord) {
      return memoryRecord;
    }

    try {
      const pool = getDbPool();
      const client = await pool.connect();
      try {
        const { rows } = await client.query(
          'SELECT * FROM idempotency_keys WHERE key = $1 AND user_id = $2',
          [key, userId]
        );
        if (rows.length === 0) return null;
        const r = rows[0];
        return {
          key: r.key,
          user_id: r.user_id,
          request_hash: r.request_hash,
          status: r.status,
          response_code: r.response_code,
          response_body: typeof r.response_body === 'string' ? JSON.parse(r.response_body) : r.response_body,
          order_id: r.order_id,
          created_at: r.created_at,
        };
      } finally {
        client.release();
      }
    } catch {
      allowMemoryAdapter();
      return null;
    }
  }

  /**
   * Record promotion redemption
   */
  public async recordPromotionRedemption(redemption: PromotionRedemption): Promise<void> {
    if (config.storage.mode === "memory") this.promoRedemptions.set(redemption.id, redemption);

    try {
      const pool = getDbPool();
      const client = await pool.connect();
      try {
        await client.query(
          `INSERT INTO promotion_redemptions (id, promotion_id, customer_id, order_id, discount_minor)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (id) DO NOTHING`,
          [
            redemption.id,
            redemption.promotion_id,
            redemption.customer_id,
            redemption.order_id,
            redemption.discount_minor,
          ]
        );
      } finally {
        client.release();
      }
    } catch {
      allowMemoryAdapter();
      // In-memory fallback
    }
  }

  /**
   * Helper to attach timeline and items to memory order
   */
  private enrichMemoryOrder(order: Order): Order {
    const timeline = this.timelineEntries.get(order.id) || [];
    return {
      ...order,
      timeline,
    };
  }

  /**
   * Helper to map a raw PostgreSQL row to Order with items and timeline
   */
  private async mapSqlRowToOrder(row: any, client: any): Promise<Order> {
    // 1. Fetch items
    const { rows: itemRows } = await client.query(
      'SELECT * FROM order_items WHERE order_id = $1',
      [row.id]
    );

    const items: OrderItem[] = [];
    for (const iRow of itemRows) {
      // Fetch modifiers for item
      const { rows: modRows } = await client.query(
        'SELECT * FROM order_item_modifiers WHERE order_item_id = $1',
        [iRow.id]
      );

      const modifiers: OrderItemModifier[] = modRows.map((m: any) => ({
        id: m.id,
        order_item_id: m.order_item_id,
        source_modifier_option_id: m.source_modifier_option_id,
        group_name: m.group_name,
        option_name: m.option_name,
        unit_price_delta_minor: parseInt(m.unit_price_delta_minor, 10),
        quantity: parseInt(m.quantity, 10),
        created_at: m.created_at,
      }));

      items.push({
        id: iRow.id,
        order_id: iRow.order_id,
        source_menu_item_id: iRow.source_menu_item_id,
        item_name: iRow.item_name,
        quantity: parseInt(iRow.quantity, 10),
        unit_base_minor: parseInt(iRow.unit_base_minor, 10),
        line_total_minor: parseInt(iRow.line_total_minor, 10),
        item_snapshot: typeof iRow.item_snapshot === 'string' ? JSON.parse(iRow.item_snapshot) : iRow.item_snapshot || {},
        modifiers,
      });
    }

    // 2. Fetch timeline
    const { rows: timelineRows } = await client.query(
      'SELECT * FROM order_timeline WHERE order_id = $1 ORDER BY created_at ASC',
      [row.id]
    );

    const timeline: OrderTimelineEntry[] = timelineRows.map((t: any) => ({
      id: t.id,
      order_id: t.order_id,
      from_status: t.from_status,
      to_status: t.to_status,
      actor_type: t.actor_type,
      actor_id: t.actor_id,
      actor_name: t.actor_name,
      reason_code: t.reason_code,
      note: t.note,
      metadata: typeof t.metadata === 'string' ? JSON.parse(t.metadata) : t.metadata || {},
      created_at: t.created_at,
    }));

    return {
      id: row.id,
      public_code: row.public_code,
      order_number: row.order_number || row.public_code,
      checkout_quote_id: row.checkout_quote_id,
      customer_id: row.customer_id,
      customer_name: row.customer_name,
      customer_phone: row.customer_phone,
      branch_id: row.branch_id,
      branch_name: row.branch_name,
      merchant_id: row.merchant_id,
      merchant_name: row.merchant_name,
      status: row.status as OrderStatus,
      currency: row.currency || 'KES',
      subtotal_minor: parseInt(row.subtotal_minor, 10),
      delivery_fee_minor: parseInt(row.delivery_fee_minor, 10),
      service_fee_minor: parseInt(row.service_fee_minor, 10),
      discount_minor: parseInt(row.discount_minor || '0', 10),
      total_minor: parseInt(row.total_minor, 10),
      items,
      delivery_address_snapshot:
        typeof row.delivery_address_snapshot === 'string'
          ? JSON.parse(row.delivery_address_snapshot)
          : row.delivery_address_snapshot || {},
      pricing_snapshot:
        typeof row.pricing_snapshot === 'string'
          ? JSON.parse(row.pricing_snapshot)
          : row.pricing_snapshot || {},
      promotion_snapshot:
        typeof row.promotion_snapshot === 'string'
          ? JSON.parse(row.promotion_snapshot)
          : row.promotion_snapshot || null,
      special_instructions: row.special_instructions,
      estimated_prep_minutes: row.estimated_prep_minutes,
      estimated_ready_at: row.estimated_ready_at,
      placed_at: row.placed_at,
      accepted_at: row.accepted_at,
      preparing_at: row.preparing_at,
      ready_at: row.ready_at,
      completed_at: row.completed_at,
      cancelled_at: row.cancelled_at,
      rejected_at: row.rejected_at,
      rejection_reason: row.rejection_reason,
      cancellation_reason: row.cancellation_reason,
      cancelled_by_type: row.cancelled_by_type,
      cancelled_by_id: row.cancelled_by_id,
      timeline,
      version: row.version || 1,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}

export const orderRepository = new OrderRepository();
