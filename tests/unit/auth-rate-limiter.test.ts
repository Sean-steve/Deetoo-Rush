import assert from 'node:assert/strict';
import { test } from 'node:test';
import { config } from '@deetoo/config';
import { createAuthRateLimiter } from '../../apps/api/src/modules/auth/rate-limit.middleware';

function attempt(limiter: ReturnType<typeof createAuthRateLimiter>, identifier = 'someone@example.com') {
  const headers: Record<string, number | string> = {};
  const request = {
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    headers: { 'x-test-rate-limit': 'true' },
    body: { identifier },
  } as any;
  const response = {
    setHeader(key: string, value: number | string) { headers[key] = value; },
  } as any;
  return new Promise<{ error?: any; headers: Record<string, number | string> }>((resolve) => {
    void limiter(request, response, (error?: any) => resolve({ error, headers }));
  });
}

test('in-memory authentication limiter enforces an IP cap across distinct identifiers', async () => {
  const limiter = createAuthRateLimiter({
    windowMs: 60000, max: 2, keyPrefix: 'test:ip-wide-auth',
    useIdentifier: true,
  });
  assert.equal((await attempt(limiter, 'first@example.com')).error, undefined);
  assert.equal((await attempt(limiter, 'second@example.com')).error, undefined);
  const blocked = await attempt(limiter, 'third@example.com');
  assert.equal(blocked.error?.statusCode, 429);
  assert.equal(blocked.error?.code, 'RATE_LIMIT_EXCEEDED');
  assert.ok(Number(blocked.headers['Retry-After']) > 0);
});

test('unavailable Redis uses bounded in-process protection for local development only', async () => {
  const oldMode = config.storage.mode;
  const oldDev = config.isDevelopment;
  const oldRedisUrl = config.redis.url;
  try {
    config.storage.mode = 'postgres';
    config.isDevelopment = true;
    // A closed loopback port makes the dependency failure deterministic.
    config.redis.url = 'redis://127.0.0.1:1';
    const limiter = createAuthRateLimiter({
      windowMs: 60000, max: 2, keyPrefix: 'test:dev-redis-fallback',
      useIdentifier: true,
    });
    assert.equal((await attempt(limiter)).error, undefined);
    assert.equal((await attempt(limiter)).error, undefined);
    const denied = await attempt(limiter);
    assert.equal(denied.error?.code, 'RATE_LIMIT_EXCEEDED');
    assert.equal(denied.error?.statusCode, 429);
  } finally {
    config.storage.mode = oldMode;
    config.isDevelopment = oldDev;
    config.redis.url = oldRedisUrl;
  }
});

test('durable non-development authentication still fails closed without Redis', async () => {
  const oldMode = config.storage.mode;
  const oldDev = config.isDevelopment;
  const oldRedisUrl = config.redis.url;
  try {
    config.storage.mode = 'postgres';
    config.isDevelopment = false;
    config.redis.url = 'redis://127.0.0.1:1';
    const limiter = createAuthRateLimiter({
      windowMs: 60000, max: 2, keyPrefix: 'test:prod-redis-closed',
      useIdentifier: true,
    });
    const denied = await attempt(limiter);
    assert.equal(denied.error?.statusCode, 503);
    assert.equal(denied.error?.code, 'RATE_LIMIT_UNAVAILABLE');
  } finally {
    config.storage.mode = oldMode;
    config.isDevelopment = oldDev;
    config.redis.url = oldRedisUrl;
  }
});
