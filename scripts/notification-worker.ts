import { config } from '@deetoo/config';
import { closeDbPool } from '../apps/api/src/db/client';
import { notificationServiceCore } from '../apps/api/src/modules/operations/notification.service';

if (config.storage.mode !== 'postgres') {
  throw new Error('Notification worker requires PostgreSQL storage');
}

let stopping = false;
process.on('SIGTERM', () => {
  stopping = true;
});
process.on('SIGINT', () => {
  stopping = true;
});

while (!stopping) {
  try {
    const processed = await notificationServiceCore.processPendingBatch(25);
    if (processed === 0) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } catch (error) {
    console.error(
      'Notification worker unavailable',
      error instanceof Error ? error.message : error,
    );
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

await closeDbPool();
