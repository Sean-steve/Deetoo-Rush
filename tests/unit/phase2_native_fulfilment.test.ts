import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DeliveryStatus,
  canTransitionDelivery,
} from '@deetoo/types';
import { operationsRepository } from '../../apps/api/src/modules/operations/operations.repository';
import { notificationService } from '../../apps/api/src/modules/operations/notification.service';
import { KENYA_COUNTIES } from '../../apps/api/src/modules/geography/geography.router';
import { RiderEarningsService } from '../../apps/api/src/modules/finance/rider-earnings.service';

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


test('notification claims are leased and recoverable after worker loss', async () => {
  operationsRepository.clearInMemory();

  const now = new Date().toISOString();
  await operationsRepository.createNotification({
    id: '00000000-0000-4000-8000-000000000201',
    recipient_type: 'RIDER',
    recipient_id: 'phase2-lease-rider',
    channel: 'PUSH',
    template_code: 'RIDER_NEW_OFFER',
    status: 'PENDING',
    subject: 'Offer',
    payload: { offerId: 'phase2-lease-offer' },
    provider: 'SIMULATED',
    retry_count: 0,
    max_retries: 3,
    idempotency_key: 'phase2-lease-notification',
    created_at: now,
  });

  const first = await operationsRepository.claimPendingNotifications(10);
  assert.equal(first.length, 1);
  assert.equal(first[0].status, 'QUEUED');
  assert.ok(first[0].scheduled_at);

  const immediateSecondClaim = await operationsRepository.claimPendingNotifications(10);
  assert.equal(immediateSecondClaim.length, 0);

  await operationsRepository.updateNotification(first[0].id, {
    status: 'QUEUED',
    scheduled_at: new Date(Date.now() - 1_000).toISOString(),
  });
  const recovered = await operationsRepository.claimPendingNotifications(10);
  assert.equal(recovered.length, 1);
  assert.equal(recovered[0].id, first[0].id);
});


test('Phase 2 provisions every Kenyan county as a unique operating region', () => {
  assert.equal(KENYA_COUNTIES.length, 47);
  assert.equal(new Set(KENYA_COUNTIES.map(([code]) => code)).size, 47);
  assert.deepEqual(KENYA_COUNTIES[0], ['001', 'Mombasa']);
  assert.deepEqual(KENYA_COUNTIES[46], ['047', 'Nairobi']);
});

test('Rider earnings are decomposed into base, distance, waiting and bonuses', () => {
  const service = new RiderEarningsService();
  const estimate = service.estimateEarning({
    distanceMeters: 5000,
    waitingMinutes: 15,
    bonusMinor: 1000,
  });

  assert.deepEqual(estimate, {
    baseMinor: 15000,
    distanceMinor: 9000,
    waitingMinor: 2500,
    bonusMinor: 1000,
    zonePeakBonusMinor: 0,
    stackedOrderMinor: 0,
    totalMinor: 27500,
  });
});
