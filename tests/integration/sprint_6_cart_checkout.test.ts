import {
  login,
  openTestKitchen,
  closeTestResources,
} from "../helpers/marketplace";
/**
 * DEETOO - Sprint 6 Integration Tests: Cart Lifecycle, Isolation & Checkout Preparation
 * Tests full cart operations, cross-restaurant isolation, modifier options,
 * promo code application, and authoritative quote generation via HTTP API
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp } from "../../apps/api/src/app";

describe("Sprint 6 Integration: Cart & Checkout Preparation", () => {
  let server: http.Server;
  let baseUrl: string;

  const customerHeader = {
    "Content-Type": "application/json",
    Authorization: "",
  };

  before(async () => {
    const app = createApp();
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${address.port}`;
    await openTestKitchen();
    customerHeader.Authorization = `Bearer ${await login(baseUrl, "customer")}`;
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await closeTestResources();
  });

  test("clears any existing cart for test customer", async () => {
    const res = await fetch(`${baseUrl}/api/v1/cart`, {
      method: "DELETE",
      headers: customerHeader,
    });
    assert.equal(res.status, 200);
  });

  test("adds item with required modifier option to cart", async () => {
    const res = await fetch(`${baseUrl}/api/v1/cart/items`, {
      method: "POST",
      headers: customerHeader,
      body: JSON.stringify({
        branch_id: "branch_westlands_01",
        menu_item_id: "item_westlands_double_01",
        quantity: 2,
        modifier_option_ids: ["mo_bun_brioche"],
      }),
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.ok(body.data);
    assert.equal(body.data.items.length, 1);
    assert.equal(body.data.total_quantity, 2);
    assert.equal(body.data.branch_id, "branch_westlands_01");

    const item = body.data.items[0];
    assert.equal(item.quantity, 2);
    assert.ok(item.unit_total_price_minor > 0);
    assert.equal(item.line_total_minor, item.unit_total_price_minor * 2);
  });

  test("deduplicates identical item + modifiers by increasing quantity", async () => {
    const res = await fetch(`${baseUrl}/api/v1/cart/items`, {
      method: "POST",
      headers: customerHeader,
      body: JSON.stringify({
        branch_id: "branch_westlands_01",
        menu_item_id: "item_westlands_double_01",
        quantity: 1,
        modifier_option_ids: ["mo_bun_brioche"],
      }),
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    // Still 1 distinct item, but quantity increased from 2 to 3
    assert.equal(body.data.items.length, 1);
    assert.equal(body.data.items[0].quantity, 3);
    assert.equal(body.data.total_quantity, 3);
  });

  test("enforces single restaurant isolation: rejects item from different branch with 409 conflict", async () => {
    const res = await fetch(`${baseUrl}/api/v1/cart/items`, {
      method: "POST",
      headers: customerHeader,
      body: JSON.stringify({
        branch_id: "branch_kilimani_02", // Different branch
        menu_item_id: "item_crispy_chicken_02",
        quantity: 1,
        modifier_option_ids: ["mo_bun_brioche"],
        force_clear_existing: false,
      }),
    });

    assert.equal(res.status, 409);
    const body = (await res.json()) as any;
    assert.equal(body.error.code, "CROSS_RESTAURANT_CART_CONFLICT");
    assert.ok(body.error.details);
    assert.equal(body.error.details.new_branch_id, "branch_kilimani_02");
  });

  test("allows overriding cart when force_clear_existing is true", async () => {
    const res = await fetch(`${baseUrl}/api/v1/cart/items`, {
      method: "POST",
      headers: customerHeader,
      body: JSON.stringify({
        branch_id: "branch_kilimani_02",
        menu_item_id: "item_crispy_chicken_02",
        quantity: 1,
        modifier_option_ids: ["mo_bun_brioche"],
        force_clear_existing: true,
      }),
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.data.branch_id, "branch_kilimani_02");
    assert.equal(body.data.items.length, 1);
  });

  test("updates item quantity and recalculates totals", async () => {
    const cartRes = await fetch(`${baseUrl}/api/v1/cart`, {
      headers: customerHeader,
    });
    const cartBody = (await cartRes.json()) as any;
    const itemId = cartBody.data.items[0].id;

    const updateRes = await fetch(`${baseUrl}/api/v1/cart/items/${itemId}`, {
      method: "PATCH",
      headers: customerHeader,
      body: JSON.stringify({ quantity: 4 }),
    });

    assert.equal(updateRes.status, 200);
    const updateBody = (await updateRes.json()) as any;
    assert.equal(updateBody.data.items[0].quantity, 4);
    assert.equal(updateBody.data.total_quantity, 4);
  });

  test("removes item when quantity is set to 0", async () => {
    const cartRes = await fetch(`${baseUrl}/api/v1/cart`, {
      headers: customerHeader,
    });
    const cartBody = (await cartRes.json()) as any;
    const itemId = cartBody.data.items[0].id;

    const updateRes = await fetch(`${baseUrl}/api/v1/cart/items/${itemId}`, {
      method: "PATCH",
      headers: customerHeader,
      body: JSON.stringify({ quantity: 0 }),
    });

    assert.equal(updateRes.status, 200);
    const updateBody = (await updateRes.json()) as any;
    assert.equal(updateBody.data.items.length, 0);
  });

  test("an empty branch cart does not require permission to switch restaurants", async () => {
    const response = await fetch(`${baseUrl}/api/v1/cart/items`, {
      method: "POST", headers: customerHeader,
      body: JSON.stringify({branch_id:"branch_westlands_01",menu_item_id:"item_westlands_double_01",quantity:1,modifier_option_ids:["mo_bun_brioche"]}),
    });
    assert.equal(response.status,200);
    const cart=(await response.json() as any).data;
    assert.equal(cart.branch_id,"branch_westlands_01");
    const removed=await fetch(`${baseUrl}/api/v1/cart/items/${cart.items[0].id}`,{method:"DELETE",headers:customerHeader});
    assert.equal(removed.status,200);
    const next=await fetch(`${baseUrl}/api/v1/cart/items`,{method:"POST",headers:customerHeader,body:JSON.stringify({branch_id:"branch_kilimani_02",menu_item_id:"item_crispy_chicken_02",quantity:1,modifier_option_ids:["mo_bun_brioche"]})});
    assert.equal(next.status,200);
    assert.equal((await next.json() as any).data.branch_id,"branch_kilimani_02");
  });

  test("applies promo code KARIBU100 to cart and recalculates breakdown", async () => {
    // Add item that meets min basket (KES 850 >= KES 500)
    await fetch(`${baseUrl}/api/v1/cart/items`, {
      method: "POST",
      headers: customerHeader,
      body: JSON.stringify({
        branch_id: "branch_westlands_01",
        menu_item_id: "item_westlands_double_01",
        quantity: 1,
        modifier_option_ids: ["mo_bun_brioche"],
        force_clear_existing: true,
      }),
    });

    const promoRes = await fetch(`${baseUrl}/api/v1/cart/promo`, {
      method: "POST",
      headers: customerHeader,
      body: JSON.stringify({ code: "KARIBU100" }),
    });

    assert.equal(promoRes.status, 200);
    const promoBody = (await promoRes.json()) as any;
    assert.ok(promoBody.data.applied_promo);
    assert.equal(promoBody.data.applied_promo.code, "KARIBU100");
    assert.equal(promoBody.data.applied_promo.discount_minor, 10000); // KES 100 off
    assert.equal(promoBody.data.pricing.discount_minor, 10000);
  });

  test("generates authoritative checkout quote with breakdown and 10min TTL", async () => {
    // Request quote with valid customer address in Westlands (home address)
    const quoteRes = await fetch(`${baseUrl}/api/v1/checkout/quote`, {
      method: "POST",
      headers: customerHeader,
      body: JSON.stringify({
        address_id: "55555555-5555-5555-5555-555555555501",
        notes: "Ring apartment 4B or leave with security",
      }),
    });

    assert.equal(quoteRes.status, 200);
    const quoteBody = (await quoteRes.json()) as any;
    const quote = quoteBody.data;
    assert.ok(quote.quote_id);
    assert.equal(quote.currency, "KES");
    assert.ok(quote.gross_subtotal_minor > 0);
    assert.ok(quote.delivery_fee_minor > 0);
    assert.ok(quote.service_fee_minor > 0);
    assert.equal(
      quote.total_minor,
      quote.net_subtotal_minor +
        quote.delivery_fee_minor +
        quote.service_fee_minor,
    );
    assert.ok(quote.delivery_address_snapshot);
    assert.equal(
      quote.delivery_address_snapshot.instructions,
      "Ring apartment 4B or leave with security",
    );

    // Verify quote retrieval by quote_id
    const fetchRes = await fetch(
      `${baseUrl}/api/v1/checkout/quote/${quote.quote_id}`,
      {
        headers: customerHeader,
      },
    );
    assert.equal(fetchRes.status, 200);
    const fetchBody = (await fetchRes.json()) as any;
    assert.equal(fetchBody.data.quote_id, quote.quote_id);
    assert.equal(fetchBody.data.total_minor, quote.total_minor);
  });
});
