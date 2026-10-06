import { config } from './packages/config/src/index';
import { startRealtimeListener } from './apps/api/src/modules/realtime/listener';
import { createApp } from './apps/api/src/app';
import { logger } from './packages/utils/src/index';

const PORT = config.port;

async function startServer() {
  const app = createApp();
  const stopRealtime = startRealtimeListener();
  const bindHost =
    config.localWorkflow && !config.localWorkflowAllowLan ? '127.0.0.1' : '0.0.0.0';
  const server = app.listen(PORT, bindHost, () => {
    logger.info(`Deetoo Central API running on port ${PORT}`, {
      service: 'deetoo-api',
      metadata: {
        port: PORT,
        bindHost,
        localWorkflow: config.localWorkflow,
        localWorkflowAllowLan: config.localWorkflowAllowLan,
        env: process.env.NODE_ENV || process.env.APP_ENV || 'development',
      },
    });
  });
  const shutdown = async () => {
    await stopRealtime();
    server.close(() => process.exit(0));
  };
  process.once('SIGTERM', () => { void shutdown(); });
  process.once('SIGINT', () => { void shutdown(); });
}
startServer().catch((err) => {
  console.error('Fatal error starting Deetoo API:', err);
  process.exit(1);
});
