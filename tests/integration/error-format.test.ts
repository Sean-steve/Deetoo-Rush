import { closeTestResources } from "../helpers/marketplace";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../../apps/api/src/app";
import { AppError } from "../../apps/api/src/middleware/error-handler";
import http from "http";

after(() => {
  return closeTestResources();
});

test("Integration: Centralized error handling outputs DEE-API-001 standardized error envelope", async () => {
  const app = createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/test/error`, {
      headers: { "X-Request-Id": "req_test_custom_123", Connection: "close" },
    });

    assert.equal(res.status, 409);
    assert.equal(res.headers.get("x-request-id"), "req_test_custom_123");

    const body = await res.json();
    assert.ok(body.error);
    assert.equal(body.error.code, "ORDER_INVALID_STATE");
    assert.equal(
      body.error.message,
      "Order cannot be accepted from its current state",
    );
    assert.equal(body.error.request_id, "req_test_custom_123");
    assert.equal(body.error.details.current_state, "CANCELLED");
  } finally {
    (server as any).closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});
