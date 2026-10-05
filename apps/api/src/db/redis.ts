import { allowMemoryAdapter } from './storage-policy';
/**
 * DEETOO - Redis Connection Manager & Ephemeral Fallback
 * Implements Section 12 & ADR-005 (Non-authoritative ephemeral store with safe degradation failure policy)
 */

import net from 'net';
import Redis from 'ioredis';
import { config } from '@deetoo/config';
import { logger, calculateDistanceMeters } from '@deetoo/utils';
import { DependencyHealth } from '@deetoo/types';

let redisClient: Redis | null = null;
let isConnected = false;
let connecting: Promise<void> | null = null;

/**
 * In-memory fallback ephemeral store when external Redis is unavailable.
 * Provides basic TTL and key-value capabilities per ADR-005.
 */
export class InMemoryCache {
  private store = new Map<string, { value: string; expiresAt?: number }>();
  private geoStore = new Map<string, Map<string, { longitude: number; latitude: number }>>();

  async get(key: string): Promise<string | null> {
    const item = this.store.get(key);
    if (!item) return null;
    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return item.value;
  }

  async set(key: string, value: string, mode?: string, duration?: number): Promise<'OK'> {
    let expiresAt: number | undefined;
    if (mode === 'EX' && duration) {
      expiresAt = Date.now() + duration * 1000;
    } else if (mode === 'PX' && duration) {
      expiresAt = Date.now() + duration;
    }
    this.store.set(key, { value, expiresAt });
    return 'OK';
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }

  async keys(pattern: string): Promise<string[]> {
    const now = Date.now();
    const result: string[] = [];
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    for (const [key, item] of this.store.entries()) {
      if (item.expiresAt && now > item.expiresAt) {
        this.store.delete(key);
        continue;
      }
      if (regex.test(key)) {
        result.push(key);
      }
    }
    return result;
  }

  async geoadd(key: string, longitude: number | string, latitude: number | string, member: string): Promise<number> {
    let map = this.geoStore.get(key);
    if (!map) {
      map = new Map();
      this.geoStore.set(key, map);
    }
    map.set(member, {
      longitude: typeof longitude === 'number' ? longitude : parseFloat(longitude),
      latitude: typeof latitude === 'number' ? latitude : parseFloat(latitude),
    });
    return 1;
  }

  async zrem(key: string, ...members: string[]): Promise<number> {
    const map = this.geoStore.get(key);
    if (!map) return 0;
    let count = 0;
    for (const m of members) {
      if (map.delete(m)) count++;
    }
    return count;
  }

  async zrange(key: string, start = 0, stop = -1): Promise<string[]> {
    const map = this.geoStore.get(key);
    if (!map) return [];
    const members = Array.from(map.keys());
    if (stop === -1) return members.slice(start);
    return members.slice(start, stop + 1);
  }

  async geopos(key: string, member: string): Promise<Array<[string, string] | null>> {
    const map = this.geoStore.get(key);
    if (!map || !map.has(member)) return [null];
    const pos = map.get(member)!;
    return [[pos.longitude.toString(), pos.latitude.toString()]];
  }

  async geosearch(
    key: string,
    longitude: number,
    latitude: number,
    radiusMeters: number,
    limit = 50
  ): Promise<Array<{ member: string; distanceMeters: number; longitude: number; latitude: number }>> {
    const map = this.geoStore.get(key);
    if (!map) return [];
    const results: Array<{ member: string; distanceMeters: number; longitude: number; latitude: number }> = [];
    for (const [member, pos] of map.entries()) {
      const dist = calculateDistanceMeters(latitude, longitude, pos.latitude, pos.longitude, 1.0);
      if (dist <= radiusMeters) {
        results.push({
          member,
          distanceMeters: dist,
          longitude: pos.longitude,
          latitude: pos.latitude,
        });
      }
    }
    results.sort((a, b) => a.distanceMeters - b.distanceMeters);
    return results.slice(0, limit);
  }

  async ping(): Promise<string> {
    return 'PONG';
  }
}

export const fallbackCache = new InMemoryCache();

function parseRedisUrl(urlStr: string): { host: string; port: number } {
  try {
    const parsed = new URL(urlStr);
    return {
      host: parsed.hostname || '127.0.0.1',
      port: parseInt(parsed.port || '6379', 10),
    };
  } catch {
    return { host: '127.0.0.1', port: 6379 };
  }
}

/**
 * Lightweight socket probe to verify if a Redis server is actively listening
 * without triggering noisy connection failure retries in ioredis.
 */
function isRedisReachable(host: string, port: number, timeoutMs = 250): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finalize = (reachable: boolean) => {
      if (!settled) {
        settled = true;
        socket.destroy();
        resolve(reachable);
      }
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finalize(true));
    socket.once('timeout', () => finalize(false));
    socket.once('error', () => finalize(false));

    try {
      socket.connect(port, host);
    } catch {
      finalize(false);
    }
  });
}

export function closeRedisClient(): void {
  isConnected = false;
  connecting = null;
  if (redisClient) {
    redisClient.disconnect();
    redisClient = null;
  }
}

export function getRedisClient(): Redis | null {
  if (!redisClient) {
    try {
      redisClient = new Redis(config.redis.url, {
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
        lazyConnect: true,
        enableOfflineQueue: false,
        retryStrategy() {
          // Do not spin retry loops if connection fails; ADR-005 mandates safe fallback
          return null;
        },
      });

      redisClient.on('ready', () => {
        isConnected = true;
        logger.info('Connected to Redis', { service: 'cache' });
      });

      redisClient.on('error', () => {
        isConnected = false;
        // Non-blocking & quiet: Redis is strictly non-authoritative
      });
    } catch {
      return null;
    }
  }
  return redisClient;
}

export async function readyRedis(): Promise<Redis> {
  const client = getRedisClient();
  if (!client) throw new Error('Redis unavailable');
  if (client.status !== 'ready') {
    if (!connecting) connecting = client.connect().finally(() => { connecting = null; });
    await connecting;
  }
  return client;
}

export async function checkRedisHealth(): Promise<DependencyHealth> {
  const startTime = Date.now();
  const { host, port } = parseRedisUrl(config.redis.url);

  // 1. Fast probe: check if Redis port is listening before triggering ioredis connect
  const reachable = await isRedisReachable(host, port);
  if (!reachable) {
    return {
      status: 'degraded',
      latencyMs: Date.now() - startTime,
      message: 'Redis daemon not detected; operating in unavailable',
      details: { safeFailureMode: true, fallback: config.storage.mode === 'memory' ? 'explicit-test-adapter' : 'disabled' },
    };
  }

  // 2. If endpoint is reachable, verify Redis PING
  const client = getRedisClient();
  if (!client) {
    return {
      status: 'degraded',
      latencyMs: Date.now() - startTime,
      message: 'Redis client initialization skipped; safe fallback mode active',
      details: { safeFailureMode: true, fallback: config.storage.mode === 'memory' ? 'explicit-test-adapter' : 'disabled' },
    };
  }

  try {
    await readyRedis();
    const pong = await client.ping();
    const latencyMs = Date.now() - startTime;
    return {
      status: pong === 'PONG' ? 'healthy' : 'degraded',
      latencyMs,
      message: pong === 'PONG' ? 'Redis connected' : 'Unexpected Redis ping response',
    };
  } catch {
    return {
      status: 'degraded',
      latencyMs: Date.now() - startTime,
      message: 'Redis connection interrupted; operating in unavailable',
      details: { safeFailureMode: true, fallback: config.storage.mode === 'memory' ? 'explicit-test-adapter' : 'disabled' },
    };
  }
}

/**
 * Ephemeral Rider Location & Availability Index Store (ADR-005 & Sprint 8 Section 30-45)
 */
export class RiderLocationStore {
  private async getStore(): Promise<any> {
    if (config.storage.mode === 'memory') return fallbackCache;
    try { return await readyRedis(); }
    catch { allowMemoryAdapter(); return fallbackCache; }
  }

  async updateLocation(
    riderId: string,
    location: {
      latitude: number;
      longitude: number;
      accuracyMeters?: number;
      recordedAt?: string;
      riderId?: string;
    },
    ttlSeconds = 180
  ): Promise<void> {
    const now = new Date().toISOString();
    return this.saveLiveLocation(
      riderId,
      {
        riderId,
        latitude: location.latitude,
        longitude: location.longitude,
        accuracyMeters: location.accuracyMeters ?? 10,
        recordedAt: location.recordedAt || now,
        receivedAt: now,
      },
      ttlSeconds
    );
  }

  async saveLiveLocation(
    riderId: string,
    location: {
      riderId: string;
      latitude: number;
      longitude: number;
      accuracyMeters: number;
      recordedAt: string;
      receivedAt: string;
    },
    ttlSeconds = 180
  ): Promise<void> {
    const store = await this.getStore();
    const key = `rider:location:${riderId}`;
    await store.set(key, JSON.stringify(location), 'EX', ttlSeconds);
  }

  async getLiveLocation(riderId: string): Promise<{
    riderId: string;
    latitude: number;
    longitude: number;
    accuracyMeters: number;
    recordedAt: string;
    receivedAt: string;
    isStale?: boolean;
  } | null> {
    const store = await this.getStore();
    const key = `rider:location:${riderId}`;
    const data = await store.get(key);
    if (!data) return null;
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  async removeLiveLocation(riderId: string): Promise<void> {
    const store = await this.getStore();
    await store.del(`rider:location:${riderId}`);
  }

  async getLatestLocation(riderId: string) {
    return await this.getLiveLocation(riderId);
  }

  async addAvailableRider(
    riderId: string,
    lng: number,
    lat: number,
    zoneIds: string[] = []
  ): Promise<void> {
    const store = await this.getStore();
    await store.geoadd('riders:available', lng, lat, riderId);
    for (const zoneId of zoneIds) {
      await store.geoadd(`riders:available:${zoneId}`, lng, lat, riderId);
    }
  }

  async removeAvailableRider(riderId: string, zoneIds: string[] = []): Promise<void> {
    const store = await this.getStore();
    await store.zrem('riders:available', riderId);
    for (const zoneId of zoneIds) {
      await store.zrem(`riders:available:${zoneId}`, riderId);
    }
  }

  async listAvailableRiders(zoneId?: string): Promise<string[]> {
    const store = await this.getStore();
    const key = zoneId ? `riders:available:${zoneId}` : 'riders:available';
    return await store.zrange(key, 0, -1);
  }

  async findNearbyAvailableRiders(params: {
    longitude: number;
    latitude: number;
    radiusMeters: number;
    zoneId?: string;
    limit?: number;
  }): Promise<Array<{ riderId: string; distanceMeters: number; longitude: number; latitude: number }>> {
    const store = await this.getStore();
    const key = params.zoneId ? `riders:available:${params.zoneId}` : 'riders:available';
    const limit = params.limit ?? 50;

    // Check if store supports geosearch (InMemoryCache)
    if (store instanceof InMemoryCache) {
      const results = await store.geosearch(key, params.longitude, params.latitude, params.radiusMeters, limit);
      return results.map((r: any) => ({
        riderId: r.member,
        distanceMeters: r.distanceMeters,
        longitude: r.longitude,
        latitude: r.latitude,
      }));
    }

    // If ioredis client
    try {
      if (typeof store.georadius === 'function') {
        const rawResults = await store.georadius(
          key,
          params.longitude,
          params.latitude,
          params.radiusMeters,
          'm',
          'WITHDIST',
          'WITHCOORD',
          'ASC',
          'COUNT',
          limit
        );
        if (Array.isArray(rawResults)) {
          return rawResults.map((item: any) => ({
            riderId: item[0],
            distanceMeters: Math.round(parseFloat(item[1])),
            longitude: parseFloat(item[2][0]),
            latitude: parseFloat(item[2][1]),
          }));
        }
      }
    } catch {
      allowMemoryAdapter();
      // Fallback
    }

    // Fallback: list riders in key and check positions
    const riders = await this.listAvailableRiders(params.zoneId);
    const results: Array<{ riderId: string; distanceMeters: number; longitude: number; latitude: number }> = [];
    for (const riderId of riders) {
      const loc = await this.getLiveLocation(riderId);
      if (loc) {
        const dist = calculateDistanceMeters(params.latitude, params.longitude, loc.latitude, loc.longitude, 1.0);
        if (dist <= params.radiusMeters) {
          results.push({
            riderId,
            distanceMeters: dist,
            longitude: loc.longitude,
            latitude: loc.latitude,
          });
        }
      }
    }
    results.sort((a, b) => a.distanceMeters - b.distanceMeters);
    return results.slice(0, limit);
  }

  async recordHeartbeat(riderId: string, ttlSeconds = 180): Promise<void> {
    const store = await this.getStore();
    await store.set(`rider:heartbeat:${riderId}`, Date.now().toString(), 'EX', ttlSeconds);
  }

  async getHeartbeat(riderId: string): Promise<number | null> {
    const store = await this.getStore();
    const val = await store.get(`rider:heartbeat:${riderId}`);
    return val ? parseInt(val, 10) : null;
  }
}

export const riderLocationStore = new RiderLocationStore();


