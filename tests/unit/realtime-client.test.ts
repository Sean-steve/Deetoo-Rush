import { test } from "node:test";
import assert from "node:assert/strict";
import { DeetooApiClient } from "../../packages/api-client/src/index";

test("Realtime client keeps credentials out of URLs and handles events split across network chunks", async (t) => {
  const client = new DeetooApiClient({
    baseUrl: "http://localhost/api/v1",
    clientApp: "customer",
    initialToken: "private-access-token",
  });
  let notifications = 0,
    connected = 0;
  t.mock.method(
    globalThis,
    "fetch",
    async (url: string, options: RequestInit) => {
      assert.ok(!url.includes("private-access-token"));
      assert.equal(
        (options.headers as Record<string, string>).Authorization,
        "Bearer private-access-token",
      );
      const encoder = new TextEncoder();
      return new Response(
        new ReadableStream({
          start(controller) {
            for (const text of [
              "event: connected\ndata: {}\n\n:ping 1\n\n",
              "event: order.up",
              'dated\ndata: {"order_id":"owned"}\n',
              "\n",
            ])
              controller.enqueue(encoder.encode(text));
            controller.close();
          },
        }),
        { headers: { "Content-Type": "text/event-stream" } },
      );
    },
  );
  await client.subscribeRealtime(
    ["order:owned"],
    new AbortController().signal,
    () => notifications++,
    () => connected++,
  );
  assert.equal(connected, 1);
  assert.equal(notifications, 1);
});
test("Realtime client surfaces denied subscriptions instead of treating them as connected", async (t) => {
  const client = new DeetooApiClient({
    baseUrl: "http://localhost/api/v1",
    clientApp: "customer",
    initialToken: "token",
  });
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("{}", { status: 403 }),
  );
  let connected = false;
  await assert.rejects(
    client.subscribeRealtime(
      ["order:foreign"],
      new AbortController().signal,
      () => {},
      () => {
        connected = true;
      },
    ),
    /403/,
  );
  assert.equal(connected, false);
});
