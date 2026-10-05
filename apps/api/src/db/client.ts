import { currentTransaction } from './transaction';
/**
 * DEETOO - Database Connection Pool & PostGIS Checker
 * Based on DEE-ARC-001, DEE-DATA-001
 */

import net from 'net';
import pg from 'pg';
import { config } from '@deetoo/config';
import { logger } from '@deetoo/utils';
import { DependencyHealth } from '@deetoo/types';

const { Pool } = pg;
pg.types.setTypeParser(20, value => {
  const number=Number(value);
  if (!Number.isSafeInteger(number)) throw new Error('Database integer exceeds safe minor-unit range');
  return number;
});

let pool: pg.Pool | null = null;
let lastKnownHealth: DependencyHealth = {
  status: 'degraded',
  message: 'Database connection initialized, awaiting verification',
};

function parsePgUrl(urlStr: string): { host: string; port: number } {
  try {
    const parsed = new URL(urlStr);
    return {
      host: parsed.hostname || '127.0.0.1',
      port: parseInt(parsed.port || '5432', 10),
    };
  } catch {
    return { host: '127.0.0.1', port: 5432 };
  }
}

function isPostgresReachable(host: string, port: number, timeoutMs = 250): Promise<boolean> {
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

export async function closeDbPool(): Promise<void> {
  if (pool) {
    await pool.end().catch(() => {});
    pool = null;
  }
}

let savepointSequence = 0;
export function getDbPool(): pg.Pool {
  if (config.storage.mode === 'memory') throw new Error('Explicit memory adapter selected');
  const active = currentTransaction();
  if (active) {
    // Legacy repositories may own an inner transaction. Borrow the current client with
    // a savepoint instead of committing/releasing the enclosing service transaction.
    return {
      query: (...args: any[]) => (active.query as any)(...args),
      connect: async () => {
        const savepoint = `repository_${++savepointSequence}`;
        let opened = false;
        return {
          query: async (sql: any, ...args: any[]) => {
            if (typeof sql === 'string' && sql.trim() === 'BEGIN') { opened=true; return active.query(`SAVEPOINT ${savepoint}`); }
            if (typeof sql === 'string' && sql.trim() === 'COMMIT' && opened) { opened=false; return active.query(`RELEASE SAVEPOINT ${savepoint}`); }
            if (typeof sql === 'string' && sql.trim() === 'ROLLBACK' && opened) { opened=false; return active.query(`ROLLBACK TO SAVEPOINT ${savepoint}`); }
            return (active.query as any)(sql,...args);
          },
          release: () => {},
        };
      },
    } as unknown as pg.Pool;
  }
  if (!pool) {
    try {
      pool = new Pool({
        connectionString: config.database.url,
        max: config.database.maxConnections,
        idleTimeoutMillis: config.database.idleTimeoutMs,
        connectionTimeoutMillis: 3000,
      });

      pool.on('error', (err) => {
        logger.error('Unexpected error on idle PostgreSQL client', {
          service: 'database',
          metadata: { error: err.message },
        });
      });
    } catch (err: any) {
      logger.warn('Could not initialize PostgreSQL pool with given DATABASE_URL, connection initialization failed', {
        service: 'database',
        metadata: { error: err.message },
      });
      throw err;
    }
  }
  return pool!;
}

export async function checkDatabaseHealth(): Promise<DependencyHealth> {
  const startTime = Date.now();
  try {
    const { host, port } = parsePgUrl(config.database.url);
    const reachable = await isPostgresReachable(host, port, 250);
    if (!reachable) {
      lastKnownHealth = {
        status: 'degraded',
        latencyMs: Date.now() - startTime,
        message: 'PostgreSQL daemon not reachable ',
        details: { postGisInstalled: false, fallbackModeActive: false },
      };
      return lastKnownHealth;
    }

    const currentPool = getDbPool();
    if (!currentPool) {
      return {
        status: 'degraded',
        message: 'Database pool not initialized ',
      };
    }

    const client = await currentPool.connect();
    try {
      // 1. Basic query check
      await client.query('SELECT 1 as health_check');
      
      const schema = await client.query("SELECT checksum FROM schema_migrations WHERE version='022_paid_order_posted_entry_boundary.sql'");
      if (!schema.rows[0]?.checksum) throw new Error("Foundation schema migration is missing or unverified");
      // 2. Check PostGIS extension
      let postGisInstalled = false;
      try {
        const postgisRes = await client.query("SELECT PostGIS_Version() as version");
        postGisInstalled = !!postgisRes.rows[0]?.version;
      } catch {
        postGisInstalled = false;
      }

      const latencyMs = Date.now() - startTime;
      lastKnownHealth = {
        status: postGisInstalled ? 'healthy' : 'degraded',
        latencyMs,
        message: postGisInstalled ? 'PostgreSQL connected with PostGIS enabled' : 'PostgreSQL connected, PostGIS extension not loaded',
        details: { postGisInstalled },
      };
      return lastKnownHealth;
    } finally {
      client.release();
    }
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    lastKnownHealth = {
      status: 'degraded',
      latencyMs,
      message: `PostgreSQL connection unavailable: ${err.message}`,
      details: { fallbackModeActive: false },
    };
    return lastKnownHealth;
  }
}

export async function checkPostGisHealth(): Promise<DependencyHealth> {
  const dbHealth = await checkDatabaseHealth();
  if (dbHealth.status !== 'healthy' || !dbHealth.details?.postGisInstalled) {
    return {
      status: 'degraded',
      message: 'PostGIS extension unavailable ',
      details: { srid: 4326 },
    };
  }
  return {
    status: 'healthy',
    message: 'PostGIS SRID 4326 active',
    details: { srid: 4326 },
  };
}
