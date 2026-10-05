import { config } from './packages/config/src/index';
import { startRealtimeListener } from './apps/api/src/modules/realtime/listener';
/**
 * DEETOO - Unified Full-Stack Server
 * Serves Central Modular-Monolith API on /api/v1 and /health,
 * and mounts Vite middleware for frontend applications.
 */

import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { createApp } from './apps/api/src/app';
import { logger } from './packages/utils/src/index';

const PORT = config.port;

async function startServer() {
  const app = createApp();
  const stopRealtime = startRealtimeListener();
  process.once("SIGTERM", () => { void stopRealtime(); });

  // In development, integrate Vite middleware
  if (!config.isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, config.localWorkflow ? '127.0.0.1' : '0.0.0.0', () => {
    logger.info(`Deetoo Central Platform Server running on port ${PORT}`, {
      service: 'deetoo-api',
      metadata: { port: PORT, env: process.env.NODE_ENV || 'development' },
    });
    console.log(`Deetoo Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});
