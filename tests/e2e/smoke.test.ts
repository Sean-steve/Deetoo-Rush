import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../apps/api/src/app';
import { checkDatabaseHealth, closeDbPool } from '../../apps/api/src/db/client';
import { checkRedisHealth, closeRedisClient } from '../../apps/api/src/db/redis';
import http from 'http';

test('E2E Smoke: Modular monolith boots, checks DB & Redis safety, and responds to discovery', async () => {
  const app = createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as { port: number }).port;

  try {
    // 1. API Live & Ready
    const health = await fetch(`http://127.0.0.1:${port}/health/ready`);
    assert.equal(health.status, 503, "Fixture adapter is not ready for production traffic");

    // 2. Database check fails safely / reports status without unhandled rejection
    const dbHealth = await checkDatabaseHealth();
    assert.ok(dbHealth.status === 'healthy' || dbHealth.status === 'degraded');

    // 3. Redis check fails safely / reports status without crash
    const redisHealth = await checkRedisHealth();
    assert.ok(redisHealth.status === 'healthy' || redisHealth.status === 'degraded');

    // 4. API v1 Serviceability Check
    const serviceRes = await fetch(`http://127.0.0.1:${port}/api/v1/serviceability?lat=-1.265&lng=36.804`);
    assert.equal(serviceRes.status, 200);
    const serviceData = await serviceRes.json();
    assert.equal(serviceData.data.serviceable, true);
    assert.equal(serviceData.data.reason_code, 'SERVICEABLE');
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await closeDbPool();
    closeRedisClient();
  }
});
