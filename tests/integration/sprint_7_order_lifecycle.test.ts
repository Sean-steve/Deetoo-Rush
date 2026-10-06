import { payFixtureOrder } from '../helpers/paid-order';
import { orderService } from '../../apps/api/src/modules/order/order.service';
import { operationsRepository } from '../../apps/api/src/modules/operations/operations.repository';
import {
  login,
  openTestKitchen,
  closeTestResources,
} from "../helpers/marketplace";
/**
 * DEETOO - Sprint 7 Integration Tests: Core Order Engine & Merchant Workflow
 * Tests order creation from quote, idempotency key enforcement, immutable snapshots,
 * merchant acceptance with preparation time, preparation and ready state transitions,
 * customer history, and admin order monitoring (DEE-DOM-001, DEE-STATE-001, Sprint 7)
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp } from "../../apps/api/src/app";
import { OrderStatus } from "@deetoo/types";

describe("Sprint 7 Integration: Core Order Engine & Merchant Workflow", () => {
  let server: http.Server;
  let baseUrl: string;

  const customerId = "10000000-0000-0000-0000-000000000004";
  const merchantId = "10000000-0000-0000-0000-000000000002";
  const adminId = "10000000-0000-0000-0000-000000000001";

  const customerHeaders = {
    "Content-Type": "application/json",
    Authorization: "",
  };

  const merchantHeaders = {
    "Content-Type": "application/json",
    Authorization: "",
  };

  const adminHeaders = {
    "Content-Type": "application/json",
    Authorization: "",
  };

  let activeQuoteId: string;
  let createdOrderId: string;
  let createdOrderNumber: string;
  const idempotencyKey = `idem_test_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  before(async () => {
    const app = createApp();
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${address.port}`;
    await openTestKitchen();
    customerHeaders.Authorization = `Bearer ${await login(baseUrl, "customer")}`;
    merchantHeaders.Authorization = `Bearer ${await login(baseUrl, "merchant")}`;
    adminHeaders.Authorization = `Bearer ${await login(baseUrl, "admin")}`;
  });

  after(async () => {
    if (server) {
      (server as any).closeAllConnections?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await closeTestResources();
  });

  test("Step 1: Sets up customer cart and obtains authoritative checkout quote", async () => {
    // Clear existing cart
    await fetch(`${baseUrl}/api/v1/cart`, {
      method: "DELETE",
      headers: customerHeaders,
    });

    // Add item with modifier
    const addRes = await fetch(`${baseUrl}/api/v1/cart/items`, {
      method: "POST",
      headers: customerHeaders,
      body: JSON.stringify({
        branch_id: "branch_westlands_01",
        menu_item_id: "item_westlands_double_01",
        quantity: 2,
        modifier_option_ids: ["mo_bun_brioche"],
      }),
    });
    assert.equal(addRes.status, 200);

    // Generate checkout quote
    const quoteRes = await fetch(`${baseUrl}/api/v1/checkout/quote`, {
      method: "POST",
      headers: customerHeaders,
      body: JSON.stringify({
        address_id: "55555555-5555-5555-5555-555555555501",
        payment_method: "MPESA",
      }),
    });
    assert.equal(quoteRes.status, 200);
    const quoteBody = (await quoteRes.json()) as any;
    assert.ok(quoteBody.data.quote_id);
    activeQuoteId = quoteBody.data.quote_id;
  });

  test("Step 2: Creates Order atomically with idempotency key", async () => {
    const res = await fetch(`${baseUrl}/api/v1/orders`, {
      method: "POST",
      headers: {
        ...customerHeaders,
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        quote_id: activeQuoteId,
        special_instructions: "Ring apartment doorbell on arrival",
      }),
    });

    assert.equal(res.status, 201);
    const body = (await res.json()) as any;
    assert.ok(body.data);
    const order = body.data;

    createdOrderId = order.id;
    createdOrderNumber = order.order_number;

    assert.equal(order.status, OrderStatus.PENDING_PAYMENT);
    assert.ok(order.order_number.startsWith("DT-"));
    assert.equal(order.branch_id, "branch_westlands_01");
    assert.equal(order.customer_id, customerId);

    // Verify snapshots are immutable and complete
    assert.ok(order.delivery_address_snapshot);
    assert.equal(order.delivery_address_snapshot.recipient_name, "Jane Doe");
    assert.ok(order.items.length >= 1);
    assert.equal(order.items[0].modifiers.length, 1);
    assert.ok(order.items[0].modifiers[0].option_name.includes("Brioche"));

    // Verify initial timeline contains PLACED event
    assert.ok(order.timeline);
    assert.ok(order.timeline.length >= 1);
    assert.equal(order.timeline[0].to_status, OrderStatus.PENDING_PAYMENT);
  });

  test("Step 3: Enforces Idempotency (Duplicate submission returns existing order without side effects)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/orders`, {
      method: "POST",
      headers: {
        ...customerHeaders,
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        quote_id: activeQuoteId,
        special_instructions: "Ring apartment doorbell on arrival",
      }),
    });

    // Should return 201 with the exact same order entity
    assert.equal(res.status, 201);
    const body = (await res.json()) as any;
    assert.equal(body.data.id, createdOrderId);
    assert.equal(body.data.order_number, createdOrderNumber);
  });

  test("Step 4: Customer can view order details with full snapshot and timeline", async () => {
    const res = await fetch(`${baseUrl}/api/v1/orders/${createdOrderId}`, {
      method: "GET",
      headers: customerHeaders,
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.data.id, createdOrderId);
    assert.equal(body.data.order_number, createdOrderNumber);
    assert.equal(body.data.status, OrderStatus.PENDING_PAYMENT);
  });

  test("Step 5: Merchant views incoming order in branch queue after verified capture", async () => {
    await payFixtureOrder(await orderService.getOrderById(createdOrderId));
    const res = await fetch(
      `${baseUrl}/api/v1/merchant/orders?branch_id=branch_westlands_01`,
      {
        method: "GET",
        headers: merchantHeaders,
      },
    );

    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.ok(Array.isArray(body.data));
    const found = body.data.find((o: any) => o.id === createdOrderId);
    assert.ok(found, "Created order must be visible in merchant branch queue");
    assert.equal(found.status, OrderStatus.PLACED);
  });

  test("Step 6: Merchant accepts order with preparation time submission", async () => {
    const res = await fetch(
      `${baseUrl}/api/v1/merchant/orders/${createdOrderId}/accept`,
      {
        method: "POST",
        headers: merchantHeaders,
        body: JSON.stringify({
          preparation_minutes: 25,
        }),
      },
    );

    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    const order = body.data;

    assert.equal(order.status, OrderStatus.ACCEPTED);
    assert.equal(order.estimated_prep_minutes, 25);
    assert.ok(order.accepted_at);
    assert.ok(order.estimated_ready_at);

    // Verify timeline entry for ACCEPTED
    const acceptEvent = order.timeline.find(
      (t: any) => t.to_status === OrderStatus.ACCEPTED,
    );
    assert.ok(acceptEvent);
    assert.equal(acceptEvent.metadata?.estimated_prep_minutes, 25);

    // The customer must actually receive a real notification on this transition -- not just a
    // realtime event, a durable NotificationRecord the notification pipeline delivered.
    const notification = await operationsRepository.getNotificationByIdempotencyKey(
      `CUSTOMER:${customerId}:ORDER_ACCEPTED:${createdOrderId}`,
    );
    assert.ok(notification, "customer must receive an ORDER_ACCEPTED notification");
    assert.equal(notification!.status, "DELIVERED");
    assert.equal(notification!.channel, "IN_APP");
  });

  test("Step 7: Customer cancellation after merchant acceptance opens Support review", async () => {
    const res = await fetch(
      `${baseUrl}/api/v1/orders/${createdOrderId}/cancel`,
      {
        method: "POST",
        headers: customerHeaders,
        body: JSON.stringify({
          reason_code: "CHANGED_MIND",
          note: "Requesting cancellation after accept",
        }),
      },
    );

    assert.equal(res.status, 409);
    const body = (await res.json()) as any;
    assert.equal(body.error.code, "CANCELLATION_REVIEW_REQUIRED");
    assert.equal(body.error.details?.cancellation_assessment?.outcome, "SUPPORT_REVIEW");
    assert.equal(body.error.details?.cancellation_assessment?.stage, "PREPARATION");
    assert.ok(
      body.error.details?.cancellation_assessment?.support_case_id,
      "late cancellation must create a linked Support case instead of guessing financial consequences",
    );
  });

  test("Step 8: Merchant transitions order to PREPARING", async () => {
    const res = await fetch(
      `${baseUrl}/api/v1/merchant/orders/${createdOrderId}/preparing`,
      {
        method: "POST",
        headers: merchantHeaders,
      },
    );

    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.data.status, OrderStatus.PREPARING);
    assert.ok(body.data.preparing_at);
  });

  test("Step 9: Merchant transitions order to READY", async () => {
    const res = await fetch(
      `${baseUrl}/api/v1/merchant/orders/${createdOrderId}/ready`,
      {
        method: "POST",
        headers: merchantHeaders,
      },
    );

    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.data.status, OrderStatus.READY);
    assert.ok(body.data.ready_at);
  });

  test("Step 10: Customer order history lists the updated order", async () => {
    const res = await fetch(`${baseUrl}/api/v1/customer/orders`, {
      method: "GET",
      headers: customerHeaders,
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.ok(Array.isArray(body.data));
    const found = body.data.find((o: any) => o.id === createdOrderId);
    assert.ok(found);
    assert.equal(found.status, OrderStatus.READY);
  });

  test("Step 11: Admin monitors order and inspects complete timeline audit trail", async () => {
    const res = await fetch(
      `${baseUrl}/api/v1/admin/orders/${createdOrderId}`,
      {
        method: "GET",
        headers: adminHeaders,
      },
    );

    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    const order = body.data;

    assert.equal(order.id, createdOrderId);
    assert.equal(order.status, OrderStatus.READY);

    // Verify the full sequence of events recorded in timeline
    const statuses = order.timeline.map((t: any) => t.to_status);
    assert.ok(statuses.includes(OrderStatus.PLACED));
    assert.ok(statuses.includes(OrderStatus.ACCEPTED));
    assert.ok(statuses.includes(OrderStatus.PREPARING));
    assert.ok(statuses.includes(OrderStatus.READY));
  });
});
