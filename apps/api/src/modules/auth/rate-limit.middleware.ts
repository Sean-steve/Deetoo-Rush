import { config } from '@deetoo/config';
import { readyRedis } from '../../db/redis';
import { createHash, randomUUID } from 'node:crypto';
import { logger } from '@deetoo/utils';
/**
 * DEETOO - Authentication Rate Limiter
 * Implements sliding-window rate limiting per IP and identifier (Section 57)
 */

import { Request, Response, NextFunction } from "express";
import { AppError } from "../../middleware/error-handler";

interface RateLimitBucket {
  timestamps: number[];
}

const memoryBuckets = new Map<string, RateLimitBucket>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of memoryBuckets.entries()) {
    bucket.timestamps = bucket.timestamps.filter((ts) => now - ts < 300000);
    if (bucket.timestamps.length === 0) {
      memoryBuckets.delete(key);
    }
  }
}, 300000).unref();

/**
 * In development, local process memory preserves basic authentication protection
 * if the shared Redis service is down. Never use this for staging/production:
 * independent API instances would otherwise have independent counters.
 */
let redisDegradedNoticeLogged = false;

function limitInProcess(
  keys: string[],
  options: { windowMs: number; max: number },
  res: Response,
  next: NextFunction,
) {
  const now = Date.now();
  const buckets = keys.map((key) => {
    let bucket = memoryBuckets.get(key);
    if (!bucket) {
      bucket = { timestamps: [] };
      memoryBuckets.set(key, bucket);
    }
    bucket.timestamps = bucket.timestamps.filter((ts) => now - ts < options.windowMs);
    return bucket;
  });

  // Check all buckets before incrementing any. Separate IP and IP+identifier
  // buckets ensure rotating identifiers cannot evade the per-IP limit.
  const retryMs = Math.max(
    0,
    ...buckets
      .filter((bucket) => bucket.timestamps.length >= options.max)
      .map((bucket) => bucket.timestamps[0] + options.windowMs - now),
  );
  if (retryMs > 0) {
    const retryAfterSec = Math.max(1, Math.ceil(retryMs / 1000));
    res.setHeader('Retry-After', retryAfterSec);
    return next(new AppError(429, 'RATE_LIMIT_EXCEEDED',
      `Too many attempts. Please wait ${retryAfterSec} seconds before trying again.`,
      { retry_after_seconds: retryAfterSec }));
  }

  for (const bucket of buckets) bucket.timestamps.push(now);
  return next();
}

export function createAuthRateLimiter(options: {
  windowMs: number;
  max: number;
  keyPrefix: string;
  useIdentifier?: boolean;
}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Test fixtures bypass throttling unless the test explicitly opts into it.
    if (config.storage.mode === 'memory' && config.storage.fixtures &&
      process.env.NODE_ENV === 'test' && !req.headers['x-test-rate-limit']) {
      return next();
    }

    // Trust Express's configured proxy chain, never a raw user-supplied
    // X-Forwarded-For header. Always limit by IP, even with distinct identifiers.
    const ip = req.ip || req.socket?.remoteAddress || 'unknown-ip';
    const rawKeys = [`${options.keyPrefix}:ip:${ip}`];
    if (options.useIdentifier && req.body) {
      const identifier = req.body.identifier || req.body.email || req.body.phone_e164;
      if (identifier) {
        rawKeys.push(`${options.keyPrefix}:identity:${ip}:${String(identifier).trim().toLowerCase()}`);
      }
    }
    // Hashed keys avoid storing plaintext email/phone identifiers in Redis or RAM.
    const keys = rawKeys.map((raw) => 'rate:' + createHash('sha256').update(raw).digest('hex'));

    if (config.storage.mode === 'postgres') {
      try {
        const redis = await readyRedis();
        for (const redisKey of keys) {
          const retryMs = Number(await redis.eval(`
            local t=redis.call('TIME'); local now=t[1]*1000+math.floor(t[2]/1000)
            redis.call('ZREMRANGEBYSCORE',KEYS[1],'-inf',now-tonumber(ARGV[1]))
            if redis.call('ZCARD',KEYS[1])>=tonumber(ARGV[2]) then
              local first=redis.call('ZRANGE',KEYS[1],0,0,'WITHSCORES')
              return math.max(1,tonumber(first[2])+tonumber(ARGV[1])-now)
            end
            redis.call('ZADD',KEYS[1],now,ARGV[3]); redis.call('PEXPIRE',KEYS[1],ARGV[1]); return 0
          `, 1, redisKey, options.windowMs, options.max, randomUUID()));
          if (retryMs > 0) {
            res.setHeader('Retry-After', Math.max(1, Math.ceil(retryMs / 1000)));
            return next(new AppError(429, 'RATE_LIMIT_EXCEEDED', 'Too many attempts'));
          }
        }
        if (redisDegradedNoticeLogged) {
          logger.info('Redis authentication rate limiting recovered', { service: 'auth' });
          redisDegradedNoticeLogged = false;
        }
        return next();
      } catch {
        // Fail closed in staging/production. Local development may keep signing
        // in, but remains rate limited in this single API process.
        if (!config.isDevelopment) {
          return next(new AppError(503, 'RATE_LIMIT_UNAVAILABLE',
            'Authentication rate limiter is unavailable'));
        }
        if (!redisDegradedNoticeLogged) {
          logger.warn('Redis authentication rate limiter unavailable; using development-only in-memory limits', {
            service: 'auth',
            errorCode: 'RATE_LIMIT_LOCAL_FALLBACK',
          });
          redisDegradedNoticeLogged = true;
        }
        return limitInProcess(keys, options, res, next);
      }
    }

    return limitInProcess(keys, options, res, next);
  };
}

// Pre-configured rate limiters per Section 57
export const loginRateLimiter = createAuthRateLimiter({
  keyPrefix: "auth:login",
  windowMs: 60000, // 1 minute
  max: 10,
  useIdentifier: true,
});

export const registerRateLimiter = createAuthRateLimiter({
  keyPrefix: "auth:register",
  windowMs: 60000,
  max: 10,
});

export const passwordResetRateLimiter = createAuthRateLimiter({
  keyPrefix: "auth:password-reset",
  windowMs: 60000,
  max: 5,
  useIdentifier: true,
});

export const otpRateLimiter = createAuthRateLimiter({
  keyPrefix: "auth:otp",
  windowMs: 60000,
  max: 5,
});

export const refreshRateLimiter = createAuthRateLimiter({
  keyPrefix: "auth:refresh",
  windowMs: 60000,
  max: 30,
});

export const sensitiveWriteRateLimiter = createAuthRateLimiter({keyPrefix:'api:write',windowMs:60000,max:120});
