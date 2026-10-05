import { resetFixturePaymentCommands } from './payment-commands';
import { randomUUID as durableEntityId } from 'node:crypto';
import { storageAdapter } from '../../db/adapter';
import { postgresPayment } from './payment.postgres';
import { allowMemoryAdapter } from '../../db/storage-policy';
/**
 * DEETOO - Payment & Refund Repository
 * Dual-layer persistence (PostgreSQL with resilient in-memory fallback)
 * Stores payments, timelines, provider events, refunds, and idempotency records.
 */

import {
  Payment,
  PaymentStatus,
  PaymentTimelineEntry,
  PaymentProviderEvent,
  Refund,
  RefundStatus,
  RefundTimelineEntry,
  PaymentFilterParams,
  PaymentReconciliationStatus,
} from '@deetoo/types';
import { getDbPool } from '../../db/client';
import { logger } from '@deetoo/utils';

export interface PaymentIdempotencyRecord {
  idempotencyKey: string;
  customerId: string;
  orderId: string;
  requestHash: string;
  paymentId: string;
  createdAt: string;
}

export class PaymentRepository {
  private payments = new Map<string, Payment>();
  private paymentTimelines = new Map<string, PaymentTimelineEntry[]>();
  private providerEvents = new Map<string, PaymentProviderEvent>();
  private refunds = new Map<string, Refund>();
  private refundTimelines = new Map<string, RefundTimelineEntry[]>();
  private idempotencyRecords = new Map<string, PaymentIdempotencyRecord>();

  public clearInMemory(): void {
    resetFixturePaymentCommands();
    this.payments.clear();
    this.paymentTimelines.clear();
    this.providerEvents.clear();
    this.refunds.clear();
    this.refundTimelines.clear();
    this.idempotencyRecords.clear();
  }

  // ==========================================
  // Payments
  // ==========================================

  public async savePayment(payment: Payment): Promise<Payment> {
    const clone: Payment = {
      ...payment,
      created_at: payment.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    this.payments.set(clone.id, clone);

    // Persist to PostgreSQL if available
    try {
      const pool = getDbPool();
      if (pool) {
        const client = await pool.connect();
        try {
          await client.query(
            `INSERT INTO payments (
              id, order_id, customer_id, status, currency, requested_minor, captured_minor, refunded_minor,
              provider_preference, idempotency_key, provider, method, provider_payment_id, provider_reference,
              merchant_request_id, checkout_request_id, mpesa_receipt_number, phone, failure_code, failure_message,
              reconciliation_status, initiated_at, authorized_at, captured_at, failed_at, cancelled_at, refunded_at,
              created_at, updated_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8,
              $9, $10, $11, $12, $13, $14,
              $15, $16, $17, $18, $19, $20,
              $21, $22, $23, $24, $25, $26, $27,
              $28, $29
            )
            ON CONFLICT (id) DO UPDATE SET
              status = EXCLUDED.status,
              captured_minor = EXCLUDED.captured_minor,
              refunded_minor = EXCLUDED.refunded_minor,
              provider_payment_id = EXCLUDED.provider_payment_id,
              provider_reference = EXCLUDED.provider_reference,
              merchant_request_id = EXCLUDED.merchant_request_id,
              checkout_request_id = EXCLUDED.checkout_request_id,
              mpesa_receipt_number = EXCLUDED.mpesa_receipt_number,
              phone = EXCLUDED.phone,
              failure_code = EXCLUDED.failure_code,
              failure_message = EXCLUDED.failure_message,
              reconciliation_status = EXCLUDED.reconciliation_status,
              initiated_at = EXCLUDED.initiated_at,
              authorized_at = EXCLUDED.authorized_at,
              captured_at = EXCLUDED.captured_at,
              failed_at = EXCLUDED.failed_at,
              cancelled_at = EXCLUDED.cancelled_at,
              refunded_at = EXCLUDED.refunded_at,
              updated_at = EXCLUDED.updated_at`,
            [
              clone.id,
              clone.order_id,
              clone.customer_id,
              clone.status,
              clone.currency,
              clone.amount_minor,
              clone.captured_minor || 0,
              clone.refunded_minor || 0,
              clone.provider,
              clone.idempotency_key || clone.id,
              clone.provider,
              clone.method,
              clone.provider_payment_id || null,
              clone.provider_reference || null,
              clone.merchant_request_id || null,
              clone.checkout_request_id || null,
              clone.mpesa_receipt_number || null,
              clone.phone || null,
              clone.failure_code || null,
              clone.failure_message || null,
              clone.reconciliation_status || 'UNRECONCILED',
              clone.initiated_at || null,
              clone.authorized_at || null,
              clone.captured_at || null,
              clone.failed_at || null,
              clone.cancelled_at || null,
              clone.refunded_at || null,
              clone.created_at,
              clone.updated_at,
            ]
          );
        } finally {
          client.release();
        }
      }
    } catch (err: any) {
      allowMemoryAdapter();
      logger.warn('Payment DB save fallback to in-memory', {
        service: 'payment-repository',
        metadata: { error: err.message },
      });
    }

    return clone;
  }

  public async updatePayment(payment: Payment): Promise<Payment> {
    return this.savePayment(payment);
  }

  public async save(payment: Payment): Promise<Payment> {
    return this.savePayment(payment);
  }

  public async findAll(): Promise<Payment[]> {
    allowMemoryAdapter();
    return Array.from(this.payments.values());
  }

  public async findRefunds(): Promise<Refund[]> {
    allowMemoryAdapter();
    return Array.from(this.refunds.values());
  }

  public async findById(id: string): Promise<Payment | null> {
    return this.findPaymentById(id);
  }

  public async findPaymentById(id: string): Promise<Payment | null> {
    const memory = this.payments.get(id);
    if (memory) {
      const timeline = this.paymentTimelines.get(id) || [];
      return { ...memory, timeline };
    }

    try {
      const pool = getDbPool();
      if (pool) {
        const client = await pool.connect();
        try {
          const res = await client.query('SELECT * FROM payments WHERE id = $1', [id]);
          if (res.rows.length > 0) {
            const p = this.mapDbRowToPayment(res.rows[0]);
            this.payments.set(p.id, p);
            return p;
          }
        } finally {
          client.release();
        }
      }
    } catch {
      allowMemoryAdapter();
      // ignore
    }

    return null;
  }

  public async findPaymentsByOrderId(orderId: string): Promise<Payment[]> {
    allowMemoryAdapter();
    const results: Payment[] = [];
    for (const p of this.payments.values()) {
      if (p.order_id === orderId) {
        const timeline = this.paymentTimelines.get(p.id) || [];
        results.push({ ...p, timeline });
      }
    }
    // Sort descending by created_at
    results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return results;
  }

  public async findPaymentByCheckoutRequestId(checkoutRequestId: string): Promise<Payment | null> {
    allowMemoryAdapter();
    for (const p of this.payments.values()) {
      if (p.checkout_request_id === checkoutRequestId) {
        const timeline = this.paymentTimelines.get(p.id) || [];
        return { ...p, timeline };
      }
    }
    return null;
  }

  public async findPaymentByMerchantRequestId(merchantRequestId: string): Promise<Payment | null> {
    allowMemoryAdapter();
    for (const p of this.payments.values()) {
      if (p.merchant_request_id === merchantRequestId) {
        const timeline = this.paymentTimelines.get(p.id) || [];
        return { ...p, timeline };
      }
    }
    return null;
  }

  public async findPaymentByProviderReference(provider: string, reference: string): Promise<Payment | null> {
    allowMemoryAdapter();
    for (const p of this.payments.values()) {
      if (
        p.provider.toUpperCase() === provider.toUpperCase() &&
        (p.provider_reference === reference ||
          p.mpesa_receipt_number === reference ||
          p.provider_payment_id === reference ||
          p.checkout_request_id === reference)
      ) {
        const timeline = this.paymentTimelines.get(p.id) || [];
        return { ...p, timeline };
      }
    }
    return null;
  }

  public async appendPaymentTimeline(
    entry: Omit<PaymentTimelineEntry, 'id' | 'created_at'>
  ): Promise<PaymentTimelineEntry> {
    const record: PaymentTimelineEntry = {
      id: durableEntityId(),
      created_at: new Date().toISOString(),
      ...entry,
    };

    const current = this.paymentTimelines.get(entry.payment_id) || [];
    current.push(record);
    this.paymentTimelines.set(entry.payment_id, current);

    // Sync back to payment instance
    const p = this.payments.get(entry.payment_id);
    if (p) {
      p.timeline = current;
    }

    try {
      const pool = getDbPool();
      if (pool) {
        const client = await pool.connect();
        try {
          await client.query(
            `INSERT INTO payment_timeline (id, payment_id, event_type, from_status, to_status, provider_reference, reason_code, metadata, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              record.id,
              record.payment_id,
              record.event_type,
              record.from_status,
              record.to_status,
              record.provider_reference || null,
              record.reason_code || null,
              JSON.stringify(record.metadata || {}),
              record.created_at,
            ]
          );
        } finally {
          client.release();
        }
      }
    } catch {
      allowMemoryAdapter();
      // in-memory fallback
    }

    return record;
  }

  public async getPaymentTimeline(paymentId: string): Promise<PaymentTimelineEntry[]> {
    allowMemoryAdapter();
    return this.paymentTimelines.get(paymentId) || [];
  }

  // ==========================================
  // Provider Events (Deduplication / Webhook Replay Protection)
  // ==========================================

  public async recordProviderEvent(
    event: Omit<PaymentProviderEvent, 'id' | 'received_at'>
  ): Promise<PaymentProviderEvent> {
    const key = `${event.provider}:${event.provider_event_id}`;
    const record: PaymentProviderEvent = {
      id: durableEntityId(),
      received_at: new Date().toISOString(),
      ...event,
    };

    this.providerEvents.set(key, record);

    try {
      const pool = getDbPool();
      if (pool) {
        const client = await pool.connect();
        try {
          await client.query(
            `INSERT INTO payment_provider_events (
              id, provider, provider_event_id, payment_id, event_type, payload_hash, raw_payload, processing_status, received_at, processed_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (provider, provider_event_id) DO UPDATE SET
              processing_status = EXCLUDED.processing_status,
              processed_at = EXCLUDED.processed_at`,
            [
              record.id,
              record.provider,
              record.provider_event_id,
              record.payment_id || null,
              record.event_type,
              record.payload_hash,
              JSON.stringify(record.raw_payload),
              record.processing_status,
              record.received_at,
              record.processed_at || null,
            ]
          );
        } finally {
          client.release();
        }
      }
    } catch {
      allowMemoryAdapter();
      // in-memory fallback
    }

    return record;
  }

  public async findProviderEvent(
    provider: string,
    providerEventId: string
  ): Promise<PaymentProviderEvent | null> {
    allowMemoryAdapter();
    const key = `${provider}:${providerEventId}`;
    return this.providerEvents.get(key) || null;
  }

  // ==========================================
  // Refunds
  // ==========================================

  public async saveRefund(refund: Refund): Promise<Refund> {
    const clone: Refund = {
      ...refund,
      created_at: refund.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    this.refunds.set(clone.id, clone);

    try {
      const pool = getDbPool();
      if (pool) {
        const client = await pool.connect();
        try {
          await client.query(
            `INSERT INTO refunds (
              id, payment_id, order_id, amount_minor, currency, status, reason_code, note, requested_by,
              provider_refund_id, requested_at, processed_at, failed_at, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            ON CONFLICT (id) DO UPDATE SET
              status = EXCLUDED.status,
              provider_refund_id = EXCLUDED.provider_refund_id,
              processed_at = EXCLUDED.processed_at,
              failed_at = EXCLUDED.failed_at,
              updated_at = EXCLUDED.updated_at`,
            [
              clone.id,
              clone.payment_id,
              clone.order_id,
              clone.amount_minor,
              clone.currency,
              clone.status,
              clone.reason_code,
              clone.note || null,
              clone.requested_by,
              clone.provider_refund_id || null,
              clone.requested_at,
              clone.processed_at || null,
              clone.failed_at || null,
              clone.created_at,
              clone.updated_at,
            ]
          );
        } finally {
          client.release();
        }
      }
    } catch {
      allowMemoryAdapter();
      // in-memory fallback
    }

    return clone;
  }

  public async updateRefund(refund: Refund): Promise<Refund> {
    return this.saveRefund(refund);
  }

  public async findRefundById(id: string): Promise<Refund | null> {
    allowMemoryAdapter();
    const memory = this.refunds.get(id);
    if (memory) {
      const timeline = this.refundTimelines.get(id) || [];
      return { ...memory, timeline };
    }
    return null;
  }

  public async findRefundsByPaymentId(paymentId: string): Promise<Refund[]> {
    allowMemoryAdapter();
    const results: Refund[] = [];
    for (const r of this.refunds.values()) {
      if (r.payment_id === paymentId) {
        const timeline = this.refundTimelines.get(r.id) || [];
        results.push({ ...r, timeline });
      }
    }
    return results;
  }

  public async findRefundsByOrderId(orderId: string): Promise<Refund[]> {
    allowMemoryAdapter();
    const results: Refund[] = [];
    for (const r of this.refunds.values()) {
      if (r.order_id === orderId) {
        const timeline = this.refundTimelines.get(r.id) || [];
        results.push({ ...r, timeline });
      }
    }
    return results;
  }

  public async appendRefundTimeline(
    entry: Omit<RefundTimelineEntry, 'id' | 'created_at'>
  ): Promise<RefundTimelineEntry> {
    allowMemoryAdapter();
    const record: RefundTimelineEntry = {
      id: durableEntityId(),
      created_at: new Date().toISOString(),
      ...entry,
    };

    const current = this.refundTimelines.get(entry.refund_id) || [];
    current.push(record);
    this.refundTimelines.set(entry.refund_id, current);

    const r = this.refunds.get(entry.refund_id);
    if (r) {
      r.timeline = current;
    }

    return record;
  }

  public async getRefundTimeline(refundId: string): Promise<RefundTimelineEntry[]> {
    allowMemoryAdapter();
    return this.refundTimelines.get(refundId) || [];
  }

  // ==========================================
  // Idempotency
  // ==========================================

  public async getIdempotencyRecord(key: string): Promise<PaymentIdempotencyRecord | null> {
    allowMemoryAdapter();
    return this.idempotencyRecords.get(key) || null;
  }

  public async saveIdempotencyRecord(record: PaymentIdempotencyRecord): Promise<void> {
    allowMemoryAdapter();
    this.idempotencyRecords.set(record.idempotencyKey, record);
  }

  // ==========================================
  // List & Filters (Admin)
  // ==========================================

  public async listPayments(params: PaymentFilterParams): Promise<{ payments: Payment[]; total: number }> {
    allowMemoryAdapter();
    let list = Array.from(this.payments.values());

    if (params.status) {
      list = list.filter((p) => p.status === params.status);
    }
    if (params.order_id) {
      list = list.filter((p) => p.order_id === params.order_id);
    }
    if (params.customer_id) {
      list = list.filter((p) => p.customer_id === params.customer_id);
    }
    if (params.provider) {
      list = list.filter((p) => p.provider.toUpperCase() === params.provider?.toUpperCase());
    }
    if (params.method) {
      list = list.filter((p) => p.method.toUpperCase() === params.method?.toUpperCase());
    }
    if (params.reconciliation_status) {
      list = list.filter((p) => p.reconciliation_status === params.reconciliation_status);
    }
    if (params.search) {
      const q = params.search.toLowerCase();
      list = list.filter(
        (p) =>
          p.id.toLowerCase().includes(q) ||
          p.order_id.toLowerCase().includes(q) ||
          (p.mpesa_receipt_number && p.mpesa_receipt_number.toLowerCase().includes(q)) ||
          (p.provider_reference && p.provider_reference.toLowerCase().includes(q)) ||
          (p.phone && p.phone.includes(q))
      );
    }

    // Sort newest first
    list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const total = list.length;
    const page = params.page || 1;
    const limit = params.limit || 20;
    const offset = (page - 1) * limit;
    const paginated = list.slice(offset, offset + limit).map((p) => ({
      ...p,
      timeline: this.paymentTimelines.get(p.id) || [],
    }));

    return { payments: paginated, total };
  }

  private mapDbRowToPayment(row: any): Payment {
    return {
      id: row.id,
      order_id: row.order_id,
      customer_id: row.customer_id,
      status: row.status as PaymentStatus,
      currency: row.currency,
      amount_minor: Number(row.requested_minor),
      amount: Number(row.requested_minor) / 100,
      captured_minor: Number(row.captured_minor || 0),
      refunded_minor: Number(row.refunded_minor || 0),
      provider: row.provider || row.provider_preference || 'MPESA',
      method: row.method || 'MPESA',
      provider_payment_id: row.provider_payment_id,
      provider_reference: row.provider_reference,
      merchant_request_id: row.merchant_request_id,
      checkout_request_id: row.checkout_request_id,
      mpesa_receipt_number: row.mpesa_receipt_number,
      phone: row.phone,
      failure_code: row.failure_code,
      failure_message: row.failure_message,
      reconciliation_status: (row.reconciliation_status || 'UNRECONCILED') as PaymentReconciliationStatus,
      idempotency_key: row.idempotency_key,
      initiated_at: row.initiated_at?.toISOString?.() || row.initiated_at,
      authorized_at: row.authorized_at?.toISOString?.() || row.authorized_at,
      captured_at: row.captured_at?.toISOString?.() || row.captured_at,
      failed_at: row.failed_at?.toISOString?.() || row.failed_at,
      cancelled_at: row.cancelled_at?.toISOString?.() || row.cancelled_at,
      refunded_at: row.refunded_at?.toISOString?.() || row.refunded_at,
      created_at: row.created_at?.toISOString?.() || row.created_at,
      updated_at: row.updated_at?.toISOString?.() || row.updated_at,
    };
  }
}

export const paymentRepository = storageAdapter(new PaymentRepository(), postgresPayment);
