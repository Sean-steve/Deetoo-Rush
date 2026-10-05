import { processPaymentCommand } from '../../apps/api/src/modules/payment/payment-worker';
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp } from "../../apps/api/src/app";
import {
  login,
  openTestKitchen,
  closeTestResources,
} from "../helpers/marketplace";
import { deliveryRepository } from "../../apps/api/src/modules/order/delivery.repository";
import { ledgerRepository } from "../../apps/api/src/modules/finance/ledger.repository";
import { merchantRepository } from "../../apps/api/src/modules/merchant/merchant.repository";
import { orderEventBroker } from "../../apps/api/src/modules/realtime/event-broker";
let server: http.Server, base: string;
const tokens: Record<string, string> = {};
async function api(
  role: string,
  path: string,
  method = "GET",
  body?: any,
  status = 200,
) {
  const res = await fetch(base + "/api/v1" + path, {
    method,
    headers: {
      Authorization: `Bearer ${tokens[role]}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `journey-${path}`,
    },
    ...(method !== "GET" ? { body: JSON.stringify(body || {}) } : {}),
  });
  const result: any = await res.json();
  assert.equal(
    res.status,
    status,
    `${method} ${path}: ${JSON.stringify(result)}`,
  );
  return result.data === undefined ? result : result.data;
}
before(async () => {
  server = http.createServer(createApp());
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
  for (const role of ["customer", "merchant", "rider", "admin"])
    tokens[role] = await login(base, role);
  await openTestKitchen();
});
after(async () => {
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
  await closeTestResources();
});

test("Core marketplace HTTP journey: owned address through delivery and automatic financial posting (simulated provider)", async (t) => {
  const addresses = await api("customer", "/customer/addresses");
  assert.ok(
    addresses.some((a: any) => a.id === "55555555-5555-5555-5555-555555555501"),
  );
  const area = await api("customer", "/serviceability?lat=-1.2676&lng=36.8108");
  assert.equal(area.serviceable, true);
  const restaurants = await api(
    "customer",
    "/restaurants?lat=-1.2676&lng=36.8108",
  );
  assert.ok(
    restaurants.some(
      (r: any) =>
        r.id === "branch_westlands_01" || r.branch_id === "branch_westlands_01",
    ),
  );
  await api("customer", "/cart", "DELETE");
  const cart = await api("customer", "/cart/items", "POST", {
    branch_id: "branch_westlands_01",
    menu_item_id: "item_westlands_double_01",
    quantity: 2,
    modifier_option_ids: ["mo_bun_brioche"],
  });
  assert.equal(cart.items.length, 1);
  const quote = await api("customer", "/checkout/quote", "POST", {
    address_id: "55555555-5555-5555-5555-555555555501",
    payment_method: "MPESA",
  });
  assert.ok(quote.quote_id);
  // Quote consumption creates a private pending order; only verified payment releases it.
  const order = await api(
    "customer",
    "/orders",
    "POST",
    { quote_id: quote.quote_id },
    201,
  );
  assert.equal(order.status, "PENDING_PAYMENT");
  const replay = await api(
    "customer",
    "/orders",
    "POST",
    { quote_id: quote.quote_id },
    201,
  );
  assert.equal(replay.id, order.id);
  let payment = await api(
    "customer",
    `/orders/${order.id}/pay`,
    "POST",
    { method: "MPESA", phone: "+254712345678" },
    201,
  );
  await processPaymentCommand();
  payment = await api("customer", `/payments/${payment.id}`);
  assert.ok(payment.checkout_request_id);
  const callback = {
    Body: {
      stkCallback: {
        MerchantRequestID: payment.merchant_request_id,
        CheckoutRequestID: payment.checkout_request_id,
        ResultCode: 0,
        ResultDesc: "Sandbox fixture only",
        CallbackMetadata: {
          Item: [
            { Name: "MpesaReceiptNumber", Value: `TEST-${order.id}` },
            { Name: "Amount", Value: payment.amount_minor / 100 },
          ],
        },
      },
    },
  };
  // Exercise the existing provider callback route; no direct capture or ledger calls.
  await api("customer", "/payments/providers/mpesa/callback", "POST", callback);
  await processPaymentCommand();
  const captured = await api("customer", `/payments/${payment.id}`);
  assert.equal(captured.status, "CAPTURED");
  const captureTx = await ledgerRepository.findTransactionByIdempotencyKey(
    `payment.captured:${payment.id}`,
  );
  assert.ok(captureTx, "capture automatically posts ledger");
  const entries = await ledgerRepository.findEntriesByTransactionId(
    captureTx.id,
  );
  assert.ok(entries.length >= 2);
  const debits = entries
    .filter((e) => e.direction === "DEBIT")
    .reduce((s, e) => s + e.amount_minor, 0);
  const credits = entries
    .filter((e) => e.direction === "CREDIT")
    .reduce((s, e) => s + e.amount_minor, 0);
  assert.equal(debits, credits);
  assert.equal(
    (
      await api("merchant", `/merchant/orders/${order.id}/accept`, "POST", {
        preparation_minutes: 10,
      })
    ).status,
    "ACCEPTED",
  );
  assert.equal(
    (await api("merchant", `/merchant/orders/${order.id}/preparing`, "POST"))
      .status,
    "PREPARING",
  );
  await api("rider", "/rider/availability/online", "POST", {
    latitude: -1.2676,
    longitude: 36.8108,
    accuracy_meters: 5,
  });
  await api("rider", "/rider/location", "POST", {
    latitude: -1.2676,
    longitude: 36.8108,
    accuracy_meters: 5,
  });
  assert.equal(
    (await api("merchant", `/merchant/orders/${order.id}/ready`, "POST"))
      .status,
    "READY",
  );
  const offered = await api("rider", "/rider/offers/active");
  assert.ok(offered?.offer, "ready automatically dispatches an offer");
  assert.equal(offered.offer.order_id, order.id);
  await api("rider", `/rider/offers/${offered.offer.id}/accept`, "POST");
  const delivery = await deliveryRepository.findByOrderId(order.id);
  assert.ok(delivery);
  assert.equal(delivery.status, "ASSIGNED");
  await api("rider", `/rider/deliveries/${delivery.id}/arrive-pickup`, "POST", {
    latitude: -1.2676,
    longitude: 36.8108,
  });
  const pickup = await api(
    "merchant",
    `/merchant/orders/${order.id}/pickup-status`,
  );
  await api(
    "rider",
    `/rider/deliveries/${delivery.id}/confirm-pickup`,
    "POST",
    { pickup_verification_code: pickup.pickupVerificationCode },
  );
  await api("rider", `/rider/deliveries/${delivery.id}/start-trip`, "POST");
  await api(
    "rider",
    `/rider/deliveries/${delivery.id}/arrive-dropoff`,
    "POST",
    { latitude: -1.2676, longitude: 36.8108 },
  );
  const customerDelivery = await api(
    "customer",
    `/customer/orders/${order.id}/delivery`,
  );
  await api("rider", `/rider/deliveries/${delivery.id}/complete`, "POST", {
    proof_type: "OTP",
    otp: customerDelivery.delivery.delivery_otp,
  });
  assert.equal(
    (await deliveryRepository.findById(delivery.id))?.status,
    "DELIVERED",
  );
  const completed = await api("customer", `/orders/${order.id}`);
  assert.equal(completed.status, "COMPLETED");
  const statement = await api(
    "merchant",
    `/finance/merchant/statement?merchant_id=${order.merchant_id}`,
  );
  assert.ok(statement.payable_balance_minor > 0);
  const earnings = await api("rider", "/finance/rider/earnings");
  assert.ok(earnings.earnings.some((e: any) => e.delivery_id === delivery.id));
  assert.ok(earnings.available_balance_minor > 0);
  assert.ok(
    orderEventBroker
      .getRecentEvents(`order:${order.id}`)
      .some((e) => e.type === "order.completed"),
  );
  t.diagnostic(
    `Verified order ${order.id}; payment ${payment.id}; delivery ${delivery.id}; ledger ${captureTx.id}; merchant payable ${statement.payable_balance_minor}; rider payable ${earnings.available_balance_minor}`,
  );
});

test("Closed kitchen still rejects checkout without changing the application clock", async () => {
  const hours = await merchantRepository.getOpeningHours("branch_westlands_01");
  try {
    await api("customer", "/cart", "DELETE");
    await api("customer", "/cart/items", "POST", {
      branch_id: "branch_westlands_01",
      menu_item_id: "item_westlands_double_01",
      quantity: 2,
      modifier_option_ids: ["mo_bun_brioche"],
    });
    await merchantRepository.setOpeningHours(
      "branch_westlands_01",
      hours.map((h) => ({ ...h, is_closed: true })),
    );
    await api(
      "customer",
      "/checkout/quote",
      "POST",
      { address_id: "55555555-5555-5555-5555-555555555501" },
      409,
    );
  } finally {
    await merchantRepository.setOpeningHours("branch_westlands_01", hours);
  }
});
