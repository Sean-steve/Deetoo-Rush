/**
 * DEETOO - System Health Router
 * Implements Section 19 & DEE-ARC-001
 * Exposes /health, /health/live, /health/ready
 */

import { Router, Request, Response } from 'express';
import { checkDatabaseHealth, checkPostGisHealth } from '../../db/client';
import { checkRedisHealth } from '../../db/redis';
import { SystemHealthResponse } from '@deetoo/types';
import { config } from '@deetoo/config';

export const healthRouter = Router();

// Basic health
healthRouter.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'deetoo-platform',
    localWorkflow: config.localWorkflow,
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Liveness probe (process is running)
healthRouter.get('/health/live', (req: Request, res: Response) => {
  res.json({
    status: 'alive',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// Readiness probe (verifies DB, PostGIS, Redis)
healthRouter.get('/health/ready', async (req: Request, res: Response) => {
  const [dbHealth, postgisHealth, redisHealth] = await Promise.all([
    checkDatabaseHealth(),
    checkPostGisHealth(),
    checkRedisHealth(),
  ]);

  const allHealthy =
    dbHealth.status === 'healthy' &&
    postgisHealth.status === 'healthy' &&
    redisHealth.status === 'healthy';

  const overallStatus = allHealthy ? 'healthy' : 'degraded';

  const response: SystemHealthResponse = {
    status: overallStatus,
    version: '1.0.0',
    environment: config.environment,
    timestamp: new Date().toISOString(),
    dependencies: {
      postgres: dbHealth,
      postgis: postgisHealth,
      redis: redisHealth,
    },
  };

  // A process without its durable dependencies is not ready for marketplace traffic.
  res.status(allHealthy && config.storage.mode === "postgres" ? 200 : 503).json(response);
});
