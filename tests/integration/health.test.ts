import { closeTestResources } from "../helpers/marketplace";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../../apps/api/src/app";
import { closeDbPool } from "../../apps/api/src/db/client";
import { closeRedisClient } from "../../apps/api/src/db/redis";
import http from "http";

after(() => {
  return closeTestResources();
});

test("Integration: /health and /health/ready endpoints respond correctly", async () => {
  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as { port: number };
  const port = address.port;

  try {
    // 1. Check GET /health
    const res = await fetch(`http://127.0.0.1:${port}/health`, {
      headers: { Connection: "close" },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, "ok");
    assert.equal(body.service, "deetoo-platform");

    // 2. Check GET /health/ready
    const readyRes = await fetch(`http://127.0.0.1:${port}/health/ready`, {
      headers: { Connection: "close" },
    });
    assert.equal(readyRes.status, 503, "Explicit fixture storage must never advertise production readiness");
    const readyBody = await readyRes.json();
    assert.ok(readyBody.dependencies);
    assert.ok(readyBody.dependencies.postgres);
    assert.ok(readyBody.dependencies.postgis);
    assert.ok(readyBody.dependencies.redis);
  } finally {
    (server as any).closeAllConnections?.();
    server.close();
    server.unref();
    await closeDbPool();
    closeRedisClient();
  }
});
