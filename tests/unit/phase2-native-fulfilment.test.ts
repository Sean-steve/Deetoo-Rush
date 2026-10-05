import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DeliveryStatus,
  OrderStatus,
  RiderOnboardingStatus,
  RiderOperationalStatus,
  RiderWorkStatus,
  VehicleType,
} from '@deetoo/types';
import { deliveryRepository } from '../../apps/api/src/modules/order/delivery.repository';
import { dispatchService } from '../../apps/api/src/modules/order/dispatch.service';
import { orderRepository } from '../../apps/api/src/modules/order/order.repository';
import { riderRepository } from '../../apps/api/src/modules/rider/rider.repository';
import { mediaService } from '../../apps/api/src/modules/media/media.service';
import { deviceRegistrationRepository } from '../../apps/api/src/modules/operations/device-registration.repository';
import { riderEarningsService } from '../../apps/api/src/modules/finance/rider-earnings.service';

async function riderFixture(suffix: string) {
  const userId = `phase2-user-${suffix}`;
  const riderId = `phase2-rider-${suffix}`;
  await riderRepository.createProfile({
    id: riderId,
    userId,
    firstName: 'Phase',
    lastName: 'Two',
    phone: '+254711000222',
    onboardingStatus: RiderOnboardingStatus.APPROVED,
    operationalStatus: RiderOperationalStatus.ACTIVE,
    workStatus: RiderWorkStatus.BUSY,
    vehicleType: VehicleType.MOTORBIKE,
  });
  return { userId, riderId };
}

async function orderFixture(orderId: string, status: OrderStatus) {
  return orderRepository.createOrderAtomic({
    id: orderId,
    order_number: `P2-${orderId.slice(-8)}`,
    customer_id: 'phase2-customer',
    branch_id: 'phase2-branch',
    branch_name: 'Phase 2 Kitchen',
    status,
    currency: 'KES',
    subtotal_amount: 100000,
    tax_amount: 0,
    delivery_fee_amount: 15000,
    tip_amount: 0,
    discount_amount: 0,
    total_amount: 115000,
    payment_status: 'PAID' as any,
    payment_method: 'MPESA' as any,
    items: [{
      id: `item-${orderId}`,
      order_id: orderId,
      catalogue_item_id: 'phase2-item',
      item_name: 'Phase 2 meal',
      base_price_amount: 100000,
      total_price_amount: 100000,
      quantity: 1,
      modifiers: [],
    }],
    delivery_address_snapshot: {
      recipient_name: 'Phase 2 Customer',
      phone: '+254700000100',
      formatted_address: 'Nairobi',
      location: { lat: -1.28, lng: 36.82 },
    },
  });
}

test('Phase 2: pickup cannot skip merchant READY', async () => {
  const suffix = String(Date.now());
  const { userId, riderId } = await riderFixture(`ready-${suffix}`);
  const orderId = `phase2-order-ready-${suffix}`;
  await orderFixture(orderId, OrderStatus.PREPARING);
  const delivery = await deliveryRepository.createDelivery({
    order_id: orderId,
    status: DeliveryStatus.ARRIVED_PICKUP,
    branch_id: 'phase2-branch',
    customer_id: 'phase2-customer',
    pickup_location: { lat: -1.27, lng: 36.81 },
    dropoff_location: { lat: -1.28, lng: 36.82 },
    pickup_address_text: 'Kitchen',
    dropoff_address_text: 'Customer',
    assigned_rider_id: riderId,
    pickup_verification_code: '3210',
    arrived_pickup_at: new Date().toISOString(),
  });

  await assert.rejects(
    () => dispatchService.riderConfirmPickup(delivery.id, userId, {
      pickup_verification_code: '3210',
    }),
    (error: any) => error?.code === 'ORDER_NOT_READY_FOR_PICKUP',
  );
});

test('Phase 2: delivery cannot be unassigned after Rider custody', async () => {
  const suffix = String(Date.now());
  const { riderId } = await riderFixture(`custody-${suffix}`);
  const delivery = await deliveryRepository.createDelivery({
    order_id: `phase2-custody-order-${suffix}`,
    status: DeliveryStatus.PICKED_UP,
    branch_id: 'phase2-branch',
    customer_id: 'phase2-customer',
    pickup_location: { lat: -1.27, lng: 36.81 },
    dropoff_location: { lat: -1.28, lng: 36.82 },
    pickup_address_text: 'Kitchen',
    dropoff_address_text: 'Customer',
    assigned_rider_id: riderId,
    picked_up_at: new Date().toISOString(),
  });

  await assert.rejects(
    () => deliveryRepository.atomicUnassign(
      delivery.id,
      'ADMIN',
      'ops-user',
      'Ops',
      'REASSIGN',
      'Should be blocked after pickup',
    ),
    /physical custody/,
  );
});

test('Phase 2: public photo URL cannot satisfy delivery proof', async () => {
  const suffix = String(Date.now());
  const { userId, riderId } = await riderFixture(`photo-${suffix}`);
  const orderId = `phase2-photo-order-${suffix}`;
  await orderFixture(orderId, OrderStatus.READY);
  const delivery = await deliveryRepository.createDelivery({
    order_id: orderId,
    status: DeliveryStatus.ARRIVED_DROPOFF,
    branch_id: 'phase2-branch',
    customer_id: 'phase2-customer',
    pickup_location: { lat: -1.27, lng: 36.81 },
    dropoff_location: { lat: -1.28, lng: 36.82 },
    pickup_address_text: 'Kitchen',
    dropoff_address_text: 'Customer',
    assigned_rider_id: riderId,
    picked_up_at: new Date().toISOString(),
    en_route_at: new Date().toISOString(),
    arrived_dropoff_at: new Date().toISOString(),
  });

  await assert.rejects(
    () => dispatchService.riderCompleteDelivery(delivery.id, userId, {
      proof_type: 'PHOTO',
      photo_url: 'https://public.example/proof.jpg',
    } as any),
    (error: any) => error?.code === 'PHOTO_PROOF_REQUIRED',
  );
});

test('Phase 2: private proof media is owner and delivery bound', async () => {
  const suffix = String(Date.now());
  const upload = await mediaService.createUpload({
    ownerUserId: `media-owner-${suffix}`,
    purpose: 'DELIVERY_PROOF',
    contentType: 'image/jpeg',
    referenceType: 'DELIVERY',
    referenceId: `delivery-${suffix}`,
  });
  await mediaService.completeUpload(upload.media.id, `media-owner-${suffix}`);

  await assert.rejects(
    () => mediaService.assertVerifiedOwnedMedia(
      upload.media.id,
      'other-rider',
      'DELIVERY_PROOF',
      `delivery-${suffix}`,
    ),
    (error: any) => error?.code === 'MEDIA_NOT_FOUND',
  );
  await assert.rejects(
    () => mediaService.assertVerifiedOwnedMedia(
      upload.media.id,
      `media-owner-${suffix}`,
      'DELIVERY_PROOF',
      'another-delivery',
    ),
    (error: any) => error?.code === 'MEDIA_REFERENCE_MISMATCH',
  );
});

test('Phase 2: native device registration can be revoked', async () => {
  const suffix = String(Date.now());
  const userId = `device-user-${suffix}`;
  const token = `fcm-phase2-${suffix}-012345678901234567890123456789`;
  const registered = await deviceRegistrationRepository.upsert({
    userId,
    recipientType: 'RIDER',
    platform: 'ANDROID',
    pushToken: token,
    deviceId: `android-${suffix}`,
    appVersion: '0.2.0',
  });
  assert.equal(registered.active, true);
  assert.equal((await deviceRegistrationRepository.listActiveTokens(userId)).length, 1);

  await deviceRegistrationRepository.deactivate(userId, token);
  assert.equal((await deviceRegistrationRepository.listActiveTokens(userId)).length, 0);
});

test('Phase 2: Rider earning preview uses the same rule engine as final earning', () => {
  const short = riderEarningsService.estimateEarning({ distanceMeters: 1500 });
  const long = riderEarningsService.estimateEarning({ distanceMeters: 5500 });
  assert.equal(short.baseMinor, 15000);
  assert.equal(short.distanceMinor, 0);
  assert.ok(long.distanceMinor > 0);
  assert.equal(long.totalMinor, long.baseMinor + long.distanceMinor + long.waitingMinor + long.bonusMinor);
});


test('Phase 2: Support privilege cannot read Rider identity documents', async () => {
  const suffix = String(Date.now());
  const owner = `rider-doc-owner-${suffix}`;
  const upload = await mediaService.createUpload({
    ownerUserId: owner,
    purpose: 'RIDER_DOCUMENT',
    contentType: 'application/pdf',
    referenceType: 'RIDER',
  });
  await mediaService.completeUpload(upload.media.id, owner);

  await assert.rejects(
    () => mediaService.getReadUrl(
      upload.media.id,
      `support-user-${suffix}`,
      ['DELIVERY_PROOF', 'DELIVERY_INCIDENT', 'SUPPORT_ATTACHMENT'],
    ),
    (error: any) => error?.code === 'MEDIA_FORBIDDEN',
  );

  const opsUrl = await mediaService.getReadUrl(
    upload.media.id,
    `ops-user-${suffix}`,
    ['RIDER_DOCUMENT'],
  );
  assert.ok(opsUrl.startsWith('memory://media/'));
});
