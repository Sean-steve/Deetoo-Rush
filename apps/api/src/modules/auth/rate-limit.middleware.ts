import { config } from '@deetoo/config';
import { readyRedis } from '../../db/redis';
import { createHash, randomUUID } from 'node:crypto';
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

export function createAuthRateLimiter(options: {
  windowMs: number;
  max: number;
  keyPrefix: string;
  useIdentifier?: boolean;
}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // In test environment, allow high throughput
    if (config.storage.mode === "memory" && config.storage.fixtures && process.env.NODE_ENV === "test" && !req.headers["x-test-rate-limit"]) {
      return next();
    }

    const ip =
      req.ip ||
      req.headers["x-forwarded-for"] ||
      req.socket.remoteAddress ||
      "unknown-ip";
    let key = `${options.keyPrefix}:${ip}`;

    if (options.useIdentifier && req.body) {
      const identifier =
        req.body.identifier || req.body.email || req.body.phone_e164;
      if (identifier) {
        key = `${options.keyPrefix}:${ip}:${String(identifier).trim().toLowerCase()}`;
      }
    }

    if (config.storage.mode === 'postgres') {
      try {
        const redis = await readyRedis();
        const keys = new Set([`${options.keyPrefix}:${ip}`, key]);
        for (const raw of keys) {
          const redisKey = 'rate:' + createHash('sha256').update(raw).digest('hex');
          const retryMs = Number(await redis.eval(`
            local t=redis.call('TIME'); local now=t[1]*1000+math.floor(t[2]/1000)
            redis.call('ZREMRANGEBYSCORE',KEYS[1],'-inf',now-tonumber(ARGV[1]))
            if redis.call('ZCARD',KEYS[1])>=tonumber(ARGV[2]) then
              local first=redis.call('ZRANGE',KEYS[1],0,0,'WITHSCORES')
              return math.max(1,tonumber(first[2])+tonumber(ARGV[1])-now)
            end
            redis.call('ZADD',KEYS[1],now,ARGV[3]); redis.call('PEXPIRE',KEYS[1],ARGV[1]); return 0
          `,1,redisKey,options.windowMs,options.max,randomUUID()));
          if (retryMs) {
            res.setHeader('Retry-After',Math.ceil(retryMs/1000));
            return next(new AppError(429,'RATE_LIMIT_EXCEEDED','Too many attempts'));
          }
        }
        return next();
      } catch { return next(new AppError(503,'RATE_LIMIT_UNAVAILABLE','Authentication rate limiter is unavailable')); }
    }

    const now = Date.now();
    let bucket = memoryBuckets.get(key);
    if (!bucket) {
      bucket = { timestamps: [] };
      memoryBuckets.set(key, bucket);
    }

    // Keep only requests inside the sliding window
    bucket.timestamps = bucket.timestamps.filter(
      (ts) => now - ts < options.windowMs,
    );

    if (bucket.timestamps.length >= options.max) {
      const oldest = bucket.timestamps[0];
      const retryAfterSec = Math.ceil((oldest + options.windowMs - now) / 1000);
      res.setHeader("Retry-After", retryAfterSec);
      return next(
        new AppError(
          429,
          "RATE_LIMIT_EXCEEDED",
          `Too many attempts. Please wait ${retryAfterSec} seconds before trying again.`,
          { retry_after_seconds: retryAfterSec },
        ),
      );
    }

    bucket.timestamps.push(now);
    next();
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
