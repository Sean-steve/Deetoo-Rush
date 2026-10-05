/**
 * Scheduled dispatch worker.
 *
 * executeDispatchCycle was previously only ever invoked reactively: on delivery creation, when a
 * rider explicitly rejects an offer, from the ADMIN/OPS manual "retry dispatch" endpoint, or from
 * an operator-triggered recovery action. Nothing re-checked a delivery over time on its own, so a
 * delivery created while no rider was in range -- or whose sole active offer simply expired with
 * no response -- stayed stuck until a human happened to notice and click retry (audit-flagged: no
 * scheduled dispatch worker exists). This closes that gap the same way payment-worker.ts already
 * closes the equivalent gap for payment verification: a small polling loop, not a cron dependency.
 *
 * Known follow-on limitation, not fixed here: a rider who receives an offer and never responds
 * (letting it expire) is not added to the delivery's rejected-rider set, since nothing flips that
 * offer's status from OFFERED to EXPIRED -- only an explicit rider rejection or response does. A
 * delivery swept here can therefore be re-offered to the same unresponsive rider on a later cycle.
 * Fixing that requires changing offer status-transition logic, not just adding a scheduler, and is
 * out of scope for this pass.
 */
import { dispatchService } from '../apps/api/src/modules/order/dispatch.service';
import { deliveryRepository } from '../apps/api/src/modules/order/delivery.repository';
import { operationsRepository } from '../apps/api/src/modules/operations/operations.repository';
import { closeDbPool } from '../apps/api/src/db/client';
import { logger } from '@deetoo/utils';
import { config } from '@deetoo/config';
import { DeliveryStatus } from '@deetoo/types';

if (config.storage.mode !== 'postgres') throw new Error('Dispatch worker requires PostgreSQL');

let stopping = false;
process.on('SIGTERM', () => { stopping = true; });
process.on('SIGINT', () => { stopping = true; });

const SCAN_INTERVAL_MS = 15000;

async function findStuckDeliveries() {
  const { deliveries: unassigned } = await deliveryRepository.listDeliveries({
    status: DeliveryStatus.UNASSIGNED,
    limit: 100,
  });
  const { deliveries: offered } = await deliveryRepository.listDeliveries({
    status: DeliveryStatus.OFFERED,
    limit: 100,
  });
  const expiredOffered = [];
  for (const delivery of offered) {
    // OFFERED with no currently-active offer means the sole offer expired unanswered.
    // executeDispatchCycle itself already treats a genuinely active offer as a no-op (it returns
    // status:'OFFERED' without re-searching), so it is always safe to call for every delivery
    // this sweep selects.
    const activeOffer = await deliveryRepository.findActiveOfferByDeliveryId(delivery.id);
    if (!activeOffer) expiredOffered.push(delivery);
  }
  return [...unassigned, ...expiredOffered];
}

async function sweep(): Promise<void> {
  // Same kill switch operational-recovery's manual retryDispatch already honors: an Ops-paused
  // dispatch engine must stay paused for the automatic sweep too, not only the manual endpoint.
  if (await operationsRepository.isKillSwitchActive('auto_dispatch_paused')) return;

  const stuck = await findStuckDeliveries();
  for (const delivery of stuck) {
    try {
      await dispatchService.executeDispatchCycle(delivery.id);
    } catch (error) {
      // One delivery's guard failure (e.g. ORDER_NOT_PAID for a delivery mid-checkout) must never
      // abort the sweep for every other stuck delivery.
      logger.error('Scheduled dispatch cycle failed', {
        service: 'dispatch-worker',
        deliveryId: delivery.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

while (!stopping) {
  try {
    await sweep();
  } catch (error) {
    logger.error('Dispatch sweep unavailable', {
      service: 'dispatch-worker',
      error: error instanceof Error ? error.message : String(error),
    });
  }
  await new Promise((resolve) => setTimeout(resolve, SCAN_INTERVAL_MS));
}
await closeDbPool();
