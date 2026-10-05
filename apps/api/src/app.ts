/**
 * DEETOO - Central Express Application
 * Configures middleware, health checks, /api/v1 routes, and centralized error handling
 */

import express, { Express } from 'express';
import { requestIdMiddleware } from './middleware/request-id';
import { requestLoggingMiddleware } from './middleware/logging';
import { securityHeadersMiddleware } from './middleware/security';
import { errorHandlerMiddleware } from './middleware/error-handler';
import { healthRouter } from './modules/health/health.router';
import { v1Router } from './modules/index';

export function createApp(): Express {
  const app = express();

  // 1. Security & Core Middlewares
  app.use(securityHeadersMiddleware);
  app.use(requestIdMiddleware);
  app.use(requestLoggingMiddleware);

  // 2. Body Parser with payload limit (Section 28)
  app.use(express.json({ limit: '2mb', verify: (req, _res, buffer) => { (req as any).rawBody = buffer.toString('utf8'); } }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  // 3. Health & Observability Endpoints (Root)
  app.use('/', healthRouter);

  // 4. API v1 Router
  app.use('/api/v1', v1Router);

  // 5. Centralized Error Handler (must be registered last)
  app.use(errorHandlerMiddleware);

  return app;
}
