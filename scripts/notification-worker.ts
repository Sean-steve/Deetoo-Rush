import 'dotenv/config';
import { notificationServiceCore } from '../apps/api/src/modules/operations/notification.service';
import { logger } from '@deetoo/utils';

const intervalMs = Math.max(1000, Number(process.env.NOTIFICATION_WORKER_INTERVAL_MS || 3000));
const batchSize = Math.max(1, Math.min(100, Number(process.env.NOTIFICATION_WORKER_BATCH_SIZE || 25)));

let stopping = false;

async function runOnce(): Promise<void> {
  try {
    const claimed = await notificationServiceCore.processPendingBatch(batchSize);
    if (claimed > 0) {
      logger.info('Notification worker processed durable batch', {
        service: 'notification-worker',
        metadata: { claimed },
      });
    }
  } catch (error) {
    logger.error('Notification worker batch failed', {
      service: 'notification-worker',
      error,
    });
  }
}

async function main(): Promise<void> {
  logger.info('Notification worker started', {
    service: 'notification-worker',
    metadata: { intervalMs, batchSize },
  });

  while (!stopping) {
    await runOnce();
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  logger.info('Notification worker stopped', { service: 'notification-worker' });
}

process.on('SIGTERM', () => {
  stopping = true;
});
process.on('SIGINT', () => {
  stopping = true;
});

await main();
