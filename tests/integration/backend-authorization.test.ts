import { payFixtureOrder } from '../helpers/paid-order';
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { randomUUID } from "node:crypto";
import { signAccessToken } from "../../packages/auth/src/crypto";
import { UserRole, UserStatus, DeliveryStatus } from "@deetoo/types";
import { createApp } from "../../apps/api/src/app";
import { authRepository } from "../../apps/api/src/modules/auth/auth.repository";
import { riderRepository } from "../../apps/api/src/modules/rider/rider.repository";
import { riderRouter } from "../../apps/api/src/modules/rider/rider.router";
import { adminRouter } from "../../apps/api/src/modules/admin/admin.router";
import { customerRouter } from "../../apps/api/src/modules/customer/customer.router";
import { financeRouter } from "../../apps/api/src/modules/finance/finance.router";
import { operationsRouter } from "../../apps/api/src/modules/operations/operations.router";
import { merchantRepository } from "../../apps/api/src/modules/merchant/merchant.repository";
import { deliveryRepository } from "../../apps/api/src/modules/order/delivery.repository";
import { orderRepository } from "../../apps/api/src/modules/order/order.repository";
import { orderEventBroker } from "../../apps/api/src/modules/realtime/event-broker";
import { operationsRepository } from "../../apps/api/src/modules/operations/operations.repository";
import { login, closeTestResources } from "../helpers/marketplace";

let server: http.Server, base: string;
const tokens: Record<string, string> = {};
const ids: Record<string, string> = {};
let ownDelivery: any,
  otherDelivery: any,
  ownOffer: any,
  ownOrder: any,
  otherOrder: any;
export function routes(router: any): { path: string; method: string }[] {
  return router.stack.flatMap((l: any) =>
    l.route
      ? Object.keys(l.route.methods).map((method) => ({
          path: l.route.path,
          method: method.toUpperCase(),
        }))
      : [],
  );
}
async function fixture(role: string) {
  const id = randomUUID(),
    sessionId = randomUUID();
  ids[role] = id;
  await authRepository.createUser({
    id,
    email: `${id}@test.invalid`,
    password_hash: "not-a-login-password",
    status: UserStatus.ACTIVE,
  });
  await authRepository.setUserRoles(id, [role.replace("2", "") as UserRole]);
  await authRepository.createSession({
    id: sessionId,
    user_id: id,
    refresh_token_hash: randomUUID(),
    expires_at: new Date(Date.now() + 3600000),
  });
  tokens[role] = signAccessToken({ sub: id, sessionId });
}
async function request(
  role: string | null,
  path: string,
  method = "GET",
  body?: any,
) {
  return fetch(base + "/api/v1" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(role ? { Authorization: `Bearer ${tokens[role]}` } : {}),
    },
    ...(method !== "GET" ? { body: JSON.stringify(body || {}) } : {}),
  });
}
before(async () => {
  server = http.createServer(createApp());
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
  for (const role of ["customer", "merchant", "rider", "admin"])
    tokens[role] = await login(base, role);
  for (const role of [
    "customer2",
    "rider2",
    "merchant_staff",
    "finance",
    "support",
    "ops",
  ])
    await fixture(role);
  const rider = await riderRepository.findProfileByUserId(
    "10000000-0000-0000-0000-000000000003",
  );
  assert.ok(rider);
  const rider2 = await riderRepository.createProfile({
    id: randomUUID(),
    userId: ids.rider2,
    firstName: "Second",
    lastName: "Rider",
    phone: "+254700000009",
  });
  const orderData = {
    customer_id: "10000000-0000-0000-0000-000000000004",
    branch_id: "branch_westlands_01",
    merchant_id: "merchant_westlands_01",
    status: "PLACED",
    items: [],
    timeline: [],
    total_minor: 10000,
    currency: "KES",
  };
  ownOrder = await orderRepository.createOrder({
    ...orderData,
    id: randomUUID(),
    order_number: "SEC-OWN",
  } as any);
  otherOrder = await orderRepository.createOrder({
    ...orderData,
    id: randomUUID(),
    customer_id: ids.customer2,
    branch_id: "foreign-branch",
    merchant_id: "foreign-merchant",
    order_number: "SEC-OTHER",
  } as any);
  const data = {
    order_id: ownOrder.id,
    branch_id: "branch_westlands_01",
    customer_id: orderData.customer_id,
    pickup_location: { latitude: -1.26, longitude: 36.8 },
    dropoff_location: { latitude: -1.27, longitude: 36.81 },
    pickup_address_text: "Kitchen",
    dropoff_address_text: "Home",
    status: DeliveryStatus.ASSIGNED,
  };
  ownDelivery = await deliveryRepository.createDelivery({
    ...data,
    id: randomUUID(),
    assigned_rider_id: rider.id,
  } as any);
  otherDelivery = await deliveryRepository.createDelivery({
    ...data,
    id: randomUUID(),
    order_id: otherOrder.id,
    assigned_rider_id: rider2.id,
  } as any);
  ownOffer = await deliveryRepository.createOffer({
    id: randomUUID(),
    delivery_id: ownDelivery.id,
    order_id: ownOrder.id,
    rider_id: rider.id,
    expires_at: new Date(Date.now() + 3600000).toISOString(),
  } as any);
});
after(async () => {
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
  await closeTestResources();
});

for (const route of routes(riderRouter)) {
  test(`Rider guard: ${route.method} ${route.path} denies anonymous, Customer and Admin without Rider role`, async () => {
    const path =
      "/rider" +
      route.path
        .replace(":offerId", ownOffer.id)
        .replace(":id", ownDelivery.id);
    for (const role of [null, "customer", "admin"]) {
      const res = await request(role, path, route.method);
      assert.equal(res.status, role ? 403 : 401, `${role}: ${path}`);
    }
  });
  if (route.path.includes(":id") || route.path.includes(":offerId")) {
    test(`Rider ownership: ${route.method} ${route.path} denies Rider B before mutation`, async () => {
      const path =
        "/rider" +
        route.path
          .replace(":offerId", ownOffer.id)
          .replace(":id", ownDelivery.id);
      const before = await deliveryRepository.findById(ownDelivery.id);
      assert.equal(
        (
          await request("rider2", path, route.method, {
            status: "DELIVERED",
            otp: "0000",
            latitude: 0,
            longitude: 0,
          })
        ).status,
        403,
      );
      assert.deepEqual(
        await deliveryRepository.findById(ownDelivery.id),
        before,
      );
    });
  }
}
test("Rider self-service GET routes resolve authenticated identity despite forged query IDs", async () => {
  for (const route of routes(riderRouter).filter(
    (r) => r.method === "GET" && !r.path.includes(":"),
  )) {
    const res = await request(
      "rider",
      "/rider" +
        route.path +
        "?user_id=" +
        ids.rider2 +
        "&rider_id=" +
        otherDelivery.assigned_rider_id,
    );
    assert.equal(res.status, 200, route.path);
    assert.ok(!JSON.stringify(await res.json()).includes(otherDelivery.id));
  }
});
test("Rider terminal generic status cannot bypass dedicated proof actions", async () => {
  assert.equal(
    (
      await request(
        "rider",
        `/rider/deliveries/${ownDelivery.id}/status`,
        "POST",
        { status: "DELIVERED" },
      )
    ).status,
    409,
  );
});
for (const [prefix, router, role] of [
  ["/admin", adminRouter, "customer"],
  ["/customer", customerRouter, "rider"],
  ["/operations", operationsRouter, "customer"],
  ["/finance", financeRouter, "customer"],
] as const) {
  for (const route of routes(router))
    test(`${prefix} role boundary: ${route.method} ${route.path}`, async () => {
      const path =
        prefix + route.path.replace(/:[A-Za-z]+/g, "foreign-resource");
      assert.equal((await request(role, path, route.method)).status, 403, path);
    });
}
test("Identity headers never authenticate carts, checkout or role endpoints", async () => {
  for (const path of ["/cart", "/checkout/quote", "/rider/offers/active"]) {
    const res = await fetch(base + "/api/v1" + path, {
      method: path.includes("quote") ? "POST" : "GET",
      headers: {
        "x-customer-id": "10000000-0000-0000-0000-000000000004",
        "x-user-id": "10000000-0000-0000-0000-000000000003",
      },
    });
    assert.equal(res.status, 401, path);
  }
});
test("Foreign customer and merchant order, tracking, payment and branch scope denied", async () => {
  for (const role of ["customer", "merchant"])
    for (const suffix of ["", "/delivery", "/track", "/payments"]) {
      assert.equal(
        (await request(role, `/orders/${otherOrder.id}${suffix}`)).status,
        403,
        role + suffix,
      );
    }
  for (const suffix of [
    "",
    "/accept",
    "/reject",
    "/preparing",
    "/ready",
    "/cancel",
    "/pickup-status",
  ]) {
    assert.equal(
      (
        await request(
          "merchant",
          `/merchant/orders/${otherOrder.id}${suffix}`,
          suffix && suffix != "/pickup-status" ? "POST" : "GET",
        )
      ).status,
      403,
      suffix,
    );
  }
  assert.equal(
    (await request("merchant", "/merchant/orders?branch_id=foreign-branch"))
      .status,
    403,
  );
  assert.equal(
    (
      await request(
        "merchant",
        "/finance/merchant/statement?merchant_id=foreign-merchant",
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        "rider",
        `/finance/rider/earnings?rider_id=${otherDelivery.assigned_rider_id}`,
      )
    ).status,
    403,
  );
  const earnings: any = await (
    await request("rider", "/finance/rider/earnings")
  ).json();
  assert.equal(earnings.rider_id, ownDelivery.assigned_rider_id);
});
test("Merchant staff and foreign memberships cannot mutate teams or platform commission", async () => {
  assert.equal((await request("merchant_staff", "/merchant/team")).status, 403);
  assert.equal(
    (
      await request("merchant", "/merchant/team/memberships/foreign", "PATCH", {
        role_code: "merchant_owner",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("merchant", "/merchant/profile", "PATCH", {
        commission_bps: 0,
      })
    ).status,
    403,
  );
});
test("Support cases and notes enforce personal ownership and linked order ownership", async () => {
  const created: any = await (
    await request("customer2", "/customer/support/cases", "POST", {
      subject: "Private",
      description: "Private message",
    })
  ).json();
  const id = created.data.id;
  assert.equal(
    (await request("customer", `/customer/support/cases/${id}`)).status,
    403,
  );
  assert.equal(
    (
      await request("customer", `/customer/support/cases/${id}/notes`, "POST", {
        body: "intrusion",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("customer", "/customer/support/cases", "POST", {
        order_id: otherOrder.id,
        subject: "x",
        description: "x",
      })
    ).status,
    403,
  );
  assert.equal(
    (await request("customer2", `/customer/support/cases/${id}`)).status,
    200,
  );
});
test("Support and Finance cannot control dispatch or kill switches", async () => {
  for (const role of ["support", "finance"])
    for (const path of [
      "/operations/kill-switches",
      "/operations/recovery/manual-assign-rider",
    ])
      assert.equal((await request(role, path, "POST")).status, 403);
});
test("Private realtime rejects anonymous, wildcards, foreign resources and mixed-channel escalation", async () => {
  for (const path of [
    "/realtime/stream?channels=admin:dispatch",
    "/realtime/events",
    "/realtime/health",
  ])
    assert.equal((await request(null, path)).status, 401);
  for (const channel of [
    "*",
    "all",
    "admin:dispatch",
    `order:${otherOrder.id}`,
    `rider:${ids.rider2}`,
    "merchant-branch:foreign-branch",
  ]) {
    for (const kind of ["stream?channels=", "events?channel="])
      assert.equal(
        (
          await request(
            "customer",
            "/realtime/" + kind + encodeURIComponent(channel),
          )
        ).status,
        403,
        channel,
      );
  }
  assert.equal(
    (
      await request(
        "customer",
        `/realtime/stream?channels=order:${ownOrder.id},admin:dispatch`,
      )
    ).status,
    403,
  );
  assert.equal((await request("customer", "/realtime/events")).status, 400);
  assert.equal(
    (
      await request(
        "merchant",
        "/realtime/events?channel=merchant-branch:foreign-branch",
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        "merchant",
        "/realtime/events?channel=merchant-branch:branch_westlands_01",
      )
    ).status,
    200,
  );
  assert.equal(
    (await request("admin", "/realtime/events?channel=admin:dispatch")).status,
    200,
  );
});
test("Realtime canonical history strips private payload and checks order ownership", async () => {
  await orderEventBroker.publish(`order:${ownOrder.id}`, {
    type: "order.updated",
    channel: `order:${otherOrder.id}`,
    data: { delivery_otp: "SECRET", phone: "PRIVATE" },
    order_id: ownOrder.id,
    timestamp: new Date().toISOString(),
  } as any);
  const res = await request(
    "customer",
    `/realtime/events?channel=order:${ownOrder.id}`,
  );
  assert.equal(res.status, 200);
  const body = JSON.stringify(await res.json());
  assert.ok(!body.includes("SECRET"));
  assert.ok(!body.includes("PRIVATE"));
  assert.ok(body.includes(ownOrder.id));
});
// SSE frames may span network chunks or share a chunk. Assert complete frames.
async function* sseFrames(reader: ReadableStreamDefaultReader<Uint8Array>): AsyncGenerator<string, undefined> {
  const decoder = new TextDecoder();
  let pending = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      assert.equal(pending.trim(), "", "Stream ended inside an SSE frame");
      return;
    }
    pending += decoder.decode(value, { stream: true });
    let boundary: number;
    while ((boundary = pending.indexOf("\n\n")) !== -1) {
      const frame = pending.slice(0, boundary);
      pending = pending.slice(boundary + 2);
      if (frame.split("\n").some(line => line.startsWith("data:"))) yield frame;
    }
  }
}

test("SSE authenticates, delivers scoped invalidations and closes on session revocation", async (t) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  t.after(() => { clearTimeout(timeout); controller.abort(); });
  const res = await fetch(
    base + `/api/v1/realtime/stream?channels=customer:${ids.customer2}`,
    {
      headers: { Authorization: `Bearer ${tokens.customer2}` },
      signal: controller.signal,
    },
  );
  assert.equal(res.status, 200);
  const reader = res.body!.getReader();
  const frames = sseFrames(reader);
  assert.match((await frames.next()).value!, /event: connected/);
  await orderEventBroker.publish(`customer:${ids.customer2}`, {
    type: "order.updated",
    timestamp: new Date().toISOString(),
    data: { secret: "no" },
  } as any);
  const event = (await frames.next()).value!;
  assert.match(event, /order.updated/);
  assert.ok(!event.includes("secret"));
  await authRepository.revokeAllUserSessions(ids.customer2);
  await orderEventBroker.publish(`customer:${ids.customer2}`, {
    type: "order.updated",
    timestamp: new Date().toISOString(),
  } as any);
  assert.equal((await frames.next()).done, true);
  controller.abort();
});

test("Access tokens require matching, unexpired sessions and active accounts", async () => {
  const sessionId = randomUUID();
  await authRepository.createSession({
    id: sessionId,
    user_id: ids.rider2,
    refresh_token_hash: randomUUID(),
    expires_at: new Date(Date.now() + 60000),
  });
  tokens.mismatch = signAccessToken({
    sub: "10000000-0000-0000-0000-000000000004",
    sessionId,
  });
  assert.equal((await request("mismatch", "/cart")).status, 401);
  const expiredId = randomUUID();
  await authRepository.createSession({
    id: expiredId,
    user_id: ids.rider2,
    refresh_token_hash: randomUUID(),
    expires_at: new Date(Date.now() - 60000),
  });
  tokens.expired = signAccessToken({ sub: ids.rider2, sessionId: expiredId });
  assert.equal((await request("expired", "/rider/offers/active")).status, 401);
  await authRepository.updateUserStatus(ids.rider2, UserStatus.SUSPENDED);
  assert.equal((await request("rider2", "/rider/offers/active")).status, 403);
  await authRepository.updateUserStatus(ids.rider2, UserStatus.ACTIVE);
});
test("Merchant branch membership is checked freshly for REST and an already-open SSE stream", async (t) => {
  const branch = await merchantRepository.findBranchById("branch_westlands_01");
  assert.ok(branch);
  const membershipId = randomUUID();
  await merchantRepository.createMembership({
    id: membershipId,
    user_id: ids.merchant_staff,
    merchant_id: branch.merchant_id,
    role_code: "merchant_staff",
    status: "ACTIVE",
    branch_ids: [branch.id],
    created_at: new Date().toISOString(),
  } as any);
  assert.equal(
    (await request("merchant_staff", `/merchant/orders?branch_id=${branch.id}`))
      .status,
    200,
  );
  assert.equal(
    (
      await request("merchant_staff", "/merchant/menus", "POST", {
        name: "Unauthorized menu",
      })
    ).status,
    403,
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  t.after(() => { clearTimeout(timeout); controller.abort(); });
  const response = await fetch(
    base + `/api/v1/realtime/stream?channels=merchant-branch:${branch.id}`,
    {
      headers: { Authorization: `Bearer ${tokens.merchant_staff}` },
      signal: controller.signal,
    },
  );
  assert.equal(response.status, 200);
  const reader = response.body!.getReader();
  const frames = sseFrames(reader);
  assert.match((await frames.next()).value!, /event: connected/);
  await merchantRepository.updateMembership(membershipId, {
    status: "REVOKED",
  } as any);
  assert.equal(
    (await request("merchant_staff", `/merchant/orders?branch_id=${branch.id}`))
      .status,
    403,
  );
  assert.equal(
    (
      await request(
        "merchant_staff",
        `/realtime/events?channel=merchant-branch:${branch.id}`,
      )
    ).status,
    403,
  );
  await orderEventBroker.publish(`merchant-branch:${branch.id}`, {
    type: "order.updated",
    timestamp: new Date().toISOString(),
  } as any);
  assert.equal((await frames.next()).done, true);
  controller.abort();
});
test("Payment list alias has the same order ownership checks", async () => {
  assert.equal(
    (await request("customer", `/payments/order/${otherOrder.id}`)).status,
    403,
  );
  assert.equal(
    (await request("merchant", `/payments/order/${otherOrder.id}`)).status,
    403,
  );
  assert.equal(
    (await request("customer", `/payments/order/${ownOrder.id}`)).status,
    200,
  );
});

test("Catalogue reordering cannot read or mutate foreign parent resources", async () => {
  const { catalogueRepository } =
    await import("../../apps/api/src/modules/merchant/catalogue.repository");
  const category = await catalogueRepository.createCategory({
    id: randomUUID(),
    menu_id: "foreign-menu",
    name: "Private category",
    sort_order: 9,
  } as any);
  const item = await catalogueRepository.createItem({
    id: randomUUID(),
    menu_id: "foreign-menu",
    category_id: "foreign-category",
    name: "Private item",
    sort_order: 9,
  } as any);
  const option = await catalogueRepository.createModifierOption({
    id: randomUUID(),
    modifier_group_id: "foreign-group",
    name: "Private option",
    sort_order: 9,
  } as any);
  for (const [path, body] of [
    [
      "/merchant/menus/menu_burger_main_01/categories/reorder",
      { category_ids: [category.id] },
    ],
    [
      "/merchant/categories/cat_burgers_01/items/reorder",
      { item_ids: [item.id] },
    ],
    [
      "/merchant/modifier-groups/mg_burger_bun_01/options/reorder",
      { option_ids: [option.id] },
    ],
  ] as const)
    assert.equal(
      (await request("merchant", path, "POST", body)).status,
      403,
      path,
    );
  assert.equal(
    (await catalogueRepository.findCategoryById(category.id))?.sort_order,
    9,
  );
  assert.equal(
    (await catalogueRepository.findItemById(item.id))?.sort_order,
    9,
  );
  assert.equal(
    (await catalogueRepository.findModifierOptionById(option.id))?.sort_order,
    9,
  );
});
test("Generic Merchant role does not promote an active staff membership into owner or manager", async () => {
  const branch = await merchantRepository.findBranchById("branch_westlands_01");
  assert.ok(branch);
  await authRepository.setUserRoles(ids.merchant_staff, [
    UserRole.MERCHANT,
    UserRole.MERCHANT_STAFF,
  ]);
  await merchantRepository.createMembership({
    id: randomUUID(),
    user_id: ids.merchant_staff,
    merchant_id: branch.merchant_id,
    role_code: "merchant_staff",
    status: "ACTIVE",
    branch_ids: [branch.id],
    created_at: new Date().toISOString(),
  } as any);
  assert.equal(
    (
      await request("merchant_staff", "/merchant/menus", "POST", {
        name: "Escalated",
      })
    ).status,
    403,
  );
  assert.equal(
    (await request("merchant_staff", "/merchant/branches", "POST")).status,
    403,
  );
  assert.equal(
    (
      await request(
        "merchant_staff",
        `/merchant/branches/${branch.id}`,
        "PATCH",
        { name: "Escalated" },
      )
    ).status,
    403,
  );
  assert.equal((await request("merchant_staff", "/merchant/team")).status, 403);
});

test('Rider responses never disclose the expected delivery OTP', async () => {
  const { riderResponse }=await import('../../apps/api/src/modules/rider/rider-response');
  const safe=riderResponse({success:true,data:{delivery:{status:'DELIVERED',delivery_otp:'912345',customer_phone:'+254700123456',dropoff_location:{latitude:1,longitude:2},proofs:[{type:'OTP',proof_value:'912345'}]}}});
  assert.equal(JSON.stringify(safe).includes('912345'),false);
  assert.equal(safe.data.delivery.customer_phone,undefined);
  assert.equal(safe.data.delivery.dropoff_location,undefined);
  const response=await request('rider','/rider/deliveries/active');
  // The route inventory tests separately verify role and ownership; inspect all operational response payloads.
  assert.equal(response.status,200);
  assert.equal((await response.text()).includes('"delivery_otp":'),false);
});

test('Ops cannot mutate catalogue or execute refunds; Support cannot bypass refund approval',async()=>{
  assert.equal((await request('ops','/merchant/menus?merchant_id=merchant_burger_01','POST',{name:'Forbidden'})).status,403);
  assert.equal((await request('ops',`/payments/admin/${randomUUID()}/refunds`,'POST',{})).status,403);
  const support=await request('support',`/payments/admin/${randomUUID()}/refunds`,'POST',{});
  assert.equal(support.status,403);
  assert.equal((await support.json()).error.code,'REFUND_APPROVAL_REQUIRED');
});

test('Finance may read support cases but cannot create or change them',async()=>{
  assert.equal((await request('finance','/operations/support/cases')).status,200);
  assert.equal((await request('finance','/operations/support/cases','POST',{})).status,403);
  assert.equal((await request('finance',`/operations/support/cases/${randomUUID()}/notes`,'POST',{})).status,403);
});


test('historical merchant orders hide fulfilment PII and Finance views hide coordinates', async () => {
  const {scopedResponse}=await import('../../apps/api/src/middleware/scoped-response');
  const projected=scopedResponse({data:{branch_id:'branch',status:'COMPLETED',customer_phone:'secret',delivery_address_snapshot:{address:'secret'},total_minor:10000}},['merchant_owner']);
  assert.equal(projected.data.total_minor,10000);
  assert.equal(projected.data.customer_phone,undefined);
  assert.equal(projected.data.delivery_address_snapshot,undefined);
  assert.deepEqual(scopedResponse({rider:{location:{latitude:1,longitude:2},id:'r'}},['finance']),{rider:{id:'r'}});
  const order=await orderRepository.findById(ownOrder.id);
  order!.status='PENDING_PAYMENT' as any;
  await payFixtureOrder(order!);
  await orderRepository.updateOrderStatus(ownOrder.id,'COMPLETED' as any,{}, {id:randomUUID(),order_id:ownOrder.id,from_status:order!.status,to_status:'COMPLETED',actor_type:'SYSTEM',created_at:new Date().toISOString()} as any);
  const response=await request('merchant','/orders/'+ownOrder.id);
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.data.delivery_address_snapshot,undefined);
  assert.equal(body.data.customer_phone,undefined);
});


test('operations support-refund alias cannot bypass Support or Ops approval restrictions',async()=>{
  for(const role of ['support','ops']) {
    const response=await request(role,'/operations/support/cases/'+randomUUID()+'/refund','POST',{orderId:ownOrder.id,amountMinor:100});
    assert.equal(response.status,403);
    assert.equal((await response.json()).error.code,'REFUND_APPROVAL_REQUIRED');
  }
});


test('completed Customer order never exposes assigned Rider live location or delivery OTP',async()=>{
  const response=await request('customer','/orders/'+ownOrder.id+'/track');
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.data.riderLiveLocation,null);
  assert.equal(body.data.rider,null);
  assert.ok(!body.data.deliveryOtp);
});
