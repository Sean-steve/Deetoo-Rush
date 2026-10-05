import { config } from './packages/config/src/index';
import { startRealtimeListener } from './apps/api/src/modules/realtime/listener';
import { createServer as createViteServer } from 'vite';
import { createApp } from './apps/api/src/app';
import { logger } from './packages/utils/src/index';

if (config.isProduction) {
  throw new Error('The Deetoo development harness must never run in a deployed environment');
}
const PORT = config.port;
async function startHarness() {
  const app = createApp();
  const stopRealtime = startRealtimeListener();
  const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
  const server = app.listen(PORT, '127.0.0.1', () => logger.info(
    `Deetoo development harness running on http://127.0.0.1:${PORT}`,
    { service: 'deetoo-dev-harness' }
  ));
  const shutdown = async () => {
    await stopRealtime();
    await vite.close();
    server.close(() => process.exit(0));
  };
  process.once('SIGTERM', () => { void shutdown(); });
  process.once('SIGINT', () => { void shutdown(); });
}
startHarness().catch((err) => {
  console.error('Fatal error starting Deetoo development harness:', err);
  process.exit(1);
});
