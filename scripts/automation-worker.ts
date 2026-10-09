import { config } from '@deetoo/config';
import { logger } from '@deetoo/utils';
import { closeDbPool } from '../apps/api/src/db/client';
import { expireCheckoutStockHolds } from '../apps/api/src/modules/merchant/stock-expiry.service';
import { automationService } from '../apps/api/src/modules/operations/automation.service';

if (config.storage.mode !== 'postgres') {
  throw new Error('Automation worker requires PostgreSQL storage');
}

let stopping = false;
process.on('SIGTERM', () => { stopping = true; });
process.on('SIGINT', () => { stopping = true; });

const intervals = {
  staleRiders: Number(process.env.AUTOMATION_STALE_RIDER_INTERVAL_MS || 30_000),
  zones: Number(process.env.AUTOMATION_ZONE_SYNC_INTERVAL_MS || 60_000),
  incidents: Number(process.env.AUTOMATION_INCIDENT_SCAN_INTERVAL_MS || 60_000),
  reconciliation: Number(process.env.AUTOMATION_RECONCILIATION_INTERVAL_MS || 120_000),
  finance: Number(process.env.AUTOMATION_FINANCE_BATCH_INTERVAL_MS || 15 * 60_000),
  onboarding: Number(process.env.AUTOMATION_ONBOARDING_INTERVAL_MS || 5 * 60_000),
  stockHolds: Number(process.env.AUTOMATION_STOCK_HOLD_INTERVAL_MS || 60_000),
};

const lastRun: Record<keyof typeof intervals, number> = {
  staleRiders: 0,
  zones: 0,
  incidents: 0,
  reconciliation: 0,
  finance: 0,
  onboarding: 0,
  stockHolds: 0,
};

async function runDue(
  key: keyof typeof intervals,
  work: () => Promise<unknown>,
): Promise<void> {
  if (Date.now() - lastRun[key] < intervals[key]) return;
  lastRun[key] = Date.now();
  try {
    const result = await work();
    if (result) {
      logger.info(`Automation task completed: ${key}`, {
        service: 'automation-worker',
        metadata: result as Record<string, unknown>,
      });
    }
  } catch (error) {
    logger.error(`Automation task failed: ${key}`, {
      service: 'automation-worker',
      error,
      metadata: {
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

logger.info('Automation worker started', {
  service: 'automation-worker',
  metadata: { intervals },
});

while (!stopping) {
  await runDue('staleRiders', () => automationService.cleanupStaleRiders());
  await runDue('zones', () => automationService.syncMissingServiceZones());
  await runDue('incidents', () => automationService.scanOperationalIncidents());
  await runDue('reconciliation', () => automationService.reconcileFinancials());
  await runDue('finance', () => automationService.prepareFinancialBatches());
  await runDue('onboarding', () => automationService.refreshMerchantReadiness());
  await runDue('stockHolds', () => expireCheckoutStockHolds());
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

await closeDbPool();
