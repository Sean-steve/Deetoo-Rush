import { closeTestResources } from "../helpers/marketplace";
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp } from "../../apps/api/src/app";
let server: http.Server;
let base: string;
const accounts = {
  customer: ["customer@deetoo.ke", "CustomerPass123!"],
  merchant: ["merchant@deetoo.ke", "MerchantPass123!"],
  rider: ["rider@deetoo.ke", "RiderPass123!"],
  admin: ["admin@deetoo.ke", "AdminPass123!"],
};
const tokens: Record<string, string> = {};
before(async () => {
  server = http.createServer(createApp());
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as any).port}/api/v1`;
  for (const [role, [identifier, password]] of Object.entries(accounts)) {
    const response = await fetch(base + "/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password }),
    });
    assert.equal(response.status, 200, `${role} fixture login`);
    tokens[role] = ((await response.json()) as any).data.accessToken;
  }
});
after(async () => {
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
  await closeTestResources();
});
async function get(role: string, path: string) {
  const response = await fetch(base + path, {
    headers: { Authorization: `Bearer ${tokens[role]}` },
  });
  assert.equal(response.status, 200, path);
  const result: any = await response.json();
  return result.data === undefined ? result : result.data;
}
test("Customer journey reads owned cart, addresses, history, and support", async () => {
  const cart = await get("customer", "/cart");
  assert.ok(cart === null || Array.isArray(cart.items));
  assert.ok(Array.isArray(await get("customer", "/customer/addresses")));
  assert.ok(Array.isArray(await get("customer", "/customer/orders")));
  assert.ok(
    Array.isArray((await get("customer", "/customer/support/cases")).cases),
  );
});
test("Merchant branch, kitchen, team and statement contracts match the UI", async () => {
  const branches = await get("merchant", "/merchant/branches");
  assert.ok(branches.length > 0);
  assert.ok(
    Array.isArray(
      await get("merchant", `/merchant/orders?branch_id=${branches[0].id}`),
    ),
  );
  assert.ok(Array.isArray((await get("merchant", "/merchant/team")).members));
  const statement = await get(
    "merchant",
    `/finance/merchant/statement?merchant_id=${branches[0].merchant_id}`,
  );
  assert.equal(typeof statement.payable_balance_minor, "number");
  assert.ok(Array.isArray(statement.settlements));
});
test("Rider run and earnings return authoritative empty or active state", async () => {
  const offer = await get("rider", "/rider/offers/active");
  assert.ok(offer === null || "offer" in offer);
  const active = await get("rider", "/rider/deliveries/active");
  assert.ok(active === null || "delivery" in active);
  const earnings = await get("rider", "/finance/rider/earnings");
  assert.equal(typeof earnings.available_balance_minor, "number");
  assert.ok(Array.isArray(earnings.payouts));
});
test("Operations views receive live arrays and financial records", async () => {
  for (const path of [
    "/admin/orders",
    "/admin/dispatch/deliveries",
    "/admin/merchants",
    "/admin/branches",
    "/admin/service-zones",
    "/payments/admin/all",
  ])
    assert.ok(Array.isArray(await get("admin", path)), path);
  assert.ok(Array.isArray((await get("admin", "/finance/accounts")).accounts));
  assert.ok(
    Array.isArray((await get("admin", "/finance/settlements")).settlements),
  );
  const overview = await get("admin", "/admin/operations/overview");
  assert.equal(typeof overview.incidents.totalOpen, "number");
});
test("Backend rejects customer access to staff and rider views", async () => {
  for (const path of [
    "/admin/orders",
    "/admin/operations/overview",
    "/rider/offers/active",
    "/finance/accounts",
  ]) {
    const response = await fetch(base + path, {
      headers: { Authorization: `Bearer ${tokens.customer}` },
    });
    assert.equal(response.status, 403, path);
  }
});
