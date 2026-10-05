import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DeliveryStatus,
  canTransitionDelivery,
} from '@deetoo/types';
import { operationsRepository } from '../../apps/api/src/modules/operations/operations.repository';
import { notificationService } from '../../apps/api/src/modules/operations/notification.service';

test('pickup custody cannot be bypassed or casually reassigned after failure', () => {
  assert.equal(
    canTransitionDelivery(DeliveryStatus.ARRIVED_PICKUP, DeliveryStatus.EN_ROUTE),
    false,
  );
  assert.equal(
    canTransitionDelivery(DeliveryStatus.ARRIVED_PICKUP, DeliveryStatus.PICKED_UP),
    true,
  );
  assert.equal(
    canTransitionDelivery(DeliveryStatus.PICKED_UP, DeliveryStatus.UNASSIGNED),
    false,
  );
  assert.equal(
    canTransitionDelivery(DeliveryStatus.FAILED, DeliveryStatus.UNASSIGNED),
    false,
  );
});

test('external push acceptance is SENT, while in-app delivery is DELIVERED', async () => {
  operationsRepository.clearInMemory();

  const push = await notificationService.sendNotification({
    recipientType: 'RIDER',
    recipientId: 'phase2-rider-user',
    channel: 'PUSH',
    templateCode: 'RIDER_NEW_OFFER',
    referenceId: 'phase2-offer',
    payload: { message: 'New delivery offer' },
  });

  assert.equal(push.status, 'SENT');
  assert.equal(push.provider, 'SIMULATED');
  assert.ok(push.provider_reference?.startsWith('sim_push_'));

  const inApp = await notificationService.sendNotification({
    recipientType: 'CUSTOMER',
    recipientId: 'phase2-customer-user',
    channel: 'IN_APP',
    templateCode: 'CUSTOMER_RIDER_ASSIGNED',
    referenceId: 'phase2-order',
    payload: { orderId: 'phase2-order', orderNumber: 'D2-200' },
  });

  assert.equal(inApp.status, 'DELIVERED');
  assert.equal(inApp.provider, 'IN_APP');
  assert.ok(inApp.delivered_at);
});
