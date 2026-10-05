/**
 * DEETOO - Sprint 10 Unit Tests
 * Delivery Lifecycle, Rider Navigation, Pickup, En Route, Customer Live Tracking & Proof of Delivery
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  DeliveryStatus,
  RiderWorkStatus,
  RiderOnboardingStatus,
  RiderOperationalStatus,
  VehicleType,
  OrderStatus,
  DELIVERY_STATUS_TRANSITIONS,
} from '@deetoo/types';
import { deliveryRepository } from '../../apps/api/src/modules/order/delivery.repository';
import { DeliveryStateMachine } from '../../apps/api/src/modules/order/delivery-state-machine';
import { riderRepository } from '../../apps/api/src/modules/rider/rider.repository';
import { orderRepository } from '../../apps/api/src/modules/order/order.repository';
import { dispatchService } from '../../apps/api/src/modules/order/dispatch.service';
import { riderLocationStore } from '../../apps/api/src/db/redis';
import { mediaService } from '../../apps/api/src/modules/media/media.service';

describe('Sprint 10: Delivery Execution Lifecycle & Customer Tracking', () => {
  const testRiderUserId = 'usr_sprint10_rider';
  const testRiderId = 'rider_sprint10_01';
  const testCustomerId = 'cust_sprint10_01';
  const testBranchId = 'branch_sprint10_01';

  async function createReadyOrder(orderId: string) {
    return orderRepository.createOrderAtomic({
      id: orderId,
      order_number: `ORD-${orderId.slice(-8)}`,
      customer_id: testCustomerId,
      branch_id: testBranchId,
      branch_name: 'Sprint 10 Kitchen',
      status: OrderStatus.READY,
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
        id: `item_${orderId}`,
        order_id: orderId,
        catalogue_item_id: 'catalogue_s10',
        item_name: 'Test meal',
        base_price_amount: 100000,
        total_price_amount: 100000,
        quantity: 1,
        modifiers: [],
      }],
      delivery_address_snapshot: {
        recipient_name: 'Test Customer',
        phone: '+254700000999',
        formatted_address: 'Riverside Drive, Nairobi',
        location: { lat: -1.275, lng: 36.815 },
      },
    });
  }

  beforeEach(async () => {
    // 1. Setup active rider profile
    await riderRepository.createProfile({
      id: testRiderId,
      userId: testRiderUserId,
      firstName: 'Boniface',
      lastName: 'Kariuki',
      phone: '+254711223344',
      vehicleType: VehicleType.MOTORBIKE,
      vehicleRegistration: 'KMD 789Z',
      onboardingStatus: RiderOnboardingStatus.APPROVED,
      operationalStatus: RiderOperationalStatus.ACTIVE,
      workStatus: RiderWorkStatus.BUSY,
      serviceZoneIds: ['33333333-3333-3333-3333-333333333301'],
    });

    // 2. Set rider initial location
    await riderLocationStore.saveLiveLocation(testRiderId, {
      riderId: testRiderId,
      latitude: -1.2683,
      longitude: 36.8111,
      accuracyMeters: 5,
      recordedAt: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
    });
  });

  test('1. Delivery State Machine validates correct linear lifecycle and rejects illegal skips', () => {
    const deliveryId = 'del_state_test_01';

    // ASSIGNED -> ARRIVED_PICKUP
    const toArrivedPickup = DeliveryStateMachine.transition(DeliveryStatus.ASSIGNED, deliveryId, {
      targetStatus: DeliveryStatus.ARRIVED_PICKUP,
      actorType: 'RIDER',
      actorId: testRiderId,
    });
    assert.equal(toArrivedPickup.targetStatus, DeliveryStatus.ARRIVED_PICKUP);
    assert.ok(toArrivedPickup.updatedFields.arrived_pickup_at);

    // ARRIVED_PICKUP -> PICKED_UP
    const toPickedUp = DeliveryStateMachine.transition(DeliveryStatus.ARRIVED_PICKUP, deliveryId, {
      targetStatus: DeliveryStatus.PICKED_UP,
      actorType: 'RIDER',
      actorId: testRiderId,
    });
    assert.equal(toPickedUp.targetStatus, DeliveryStatus.PICKED_UP);
    assert.ok(toPickedUp.updatedFields.picked_up_at);

    // PICKED_UP -> EN_ROUTE
    const toEnRoute = DeliveryStateMachine.transition(DeliveryStatus.PICKED_UP, deliveryId, {
      targetStatus: DeliveryStatus.EN_ROUTE,
      actorType: 'RIDER',
      actorId: testRiderId,
    });
    assert.equal(toEnRoute.targetStatus, DeliveryStatus.EN_ROUTE);
    assert.ok(toEnRoute.updatedFields.en_route_at);

    // EN_ROUTE -> ARRIVED_DROPOFF
    const toArrivedDropoff = DeliveryStateMachine.transition(DeliveryStatus.EN_ROUTE, deliveryId, {
      targetStatus: DeliveryStatus.ARRIVED_DROPOFF,
      actorType: 'RIDER',
      actorId: testRiderId,
    });
    assert.equal(toArrivedDropoff.targetStatus, DeliveryStatus.ARRIVED_DROPOFF);
    assert.ok(toArrivedDropoff.updatedFields.arrived_dropoff_at);

    // ARRIVED_DROPOFF -> DELIVERED
    const toDelivered = DeliveryStateMachine.transition(DeliveryStatus.ARRIVED_DROPOFF, deliveryId, {
      targetStatus: DeliveryStatus.DELIVERED,
      actorType: 'RIDER',
      actorId: testRiderId,
    });
    assert.equal(toDelivered.targetStatus, DeliveryStatus.DELIVERED);
    assert.ok(toDelivered.updatedFields.delivered_at);

    // ARRIVED_PICKUP cannot jump directly to EN_ROUTE; custody confirmation is mandatory.
    assert.equal(
      DeliveryStateMachine.canTransition(DeliveryStatus.ARRIVED_PICKUP, DeliveryStatus.EN_ROUTE),
      false,
    );
    assert.equal(
      DeliveryStateMachine.canTransition(DeliveryStatus.FAILED, DeliveryStatus.UNASSIGNED),
      false,
    );

    // Assert illegal skip is rejected: ASSIGNED cannot jump directly to DELIVERED
    assert.throws(
      () => {
        DeliveryStateMachine.transition(DeliveryStatus.ASSIGNED, deliveryId, {
          targetStatus: DeliveryStatus.DELIVERED,
          actorType: 'RIDER',
          actorId: testRiderId,
        });
      },
      {
        name: 'AppError',
        message: /Invalid delivery status transition from ASSIGNED to DELIVERED/,
      }
    );
  });

  test('2. Rider Arrival at Pickup updates milestone timestamp and coordinates', async () => {
    const orderId = `ord_s10_${Date.now()}`;
    const delivery = await deliveryRepository.createDelivery({
      order_id: orderId,
      order_number: 'ORD-S10-001',
      status: DeliveryStatus.ASSIGNED,
      branch_id: testBranchId,
      customer_id: testCustomerId,
      pickup_location: { latitude: -1.2683, longitude: 36.8111 },
      dropoff_location: { latitude: -1.275, longitude: 36.815 },
      pickup_address_text: 'Mama Oliech Kitchen',
      dropoff_address_text: 'Westlands Pride Apartments, Block C',
      assigned_rider_id: testRiderId,
      assigned_at: new Date().toISOString(),
      reassignment_count: 0,
      dispatch_attention_required: false,
      current_search_radius_meters: 2000,
      dispatch_cycle_count: 1,
      version: 1,
    });

    const updated = await dispatchService.riderArrivePickup(delivery.id, testRiderUserId, {
      latitude: -1.2682,
      longitude: 36.8112,
      accuracy_meters: 6,
    });

    assert.equal(updated.status, DeliveryStatus.ARRIVED_PICKUP);
    assert.ok(updated.arrived_pickup_at);
  });

  test('3. Pickup Confirmation validates kitchen verification code and prevents unauthorized pickup', async () => {
    const orderId = `ord_s10_pickup_${Date.now()}`;
    await createReadyOrder(orderId);
    const delivery = await deliveryRepository.createDelivery({
      order_id: orderId,
      order_number: 'ORD-S10-002',
      status: DeliveryStatus.ARRIVED_PICKUP,
      branch_id: testBranchId,
      customer_id: testCustomerId,
      pickup_location: { latitude: -1.2683, longitude: 36.8111 },
      dropoff_location: { latitude: -1.275, longitude: 36.815 },
      pickup_address_text: 'Mama Oliech Kitchen',
      dropoff_address_text: 'Westlands Pride Apartments, Block C',
      assigned_rider_id: testRiderId,
      assigned_at: new Date().toISOString(),
      arrived_pickup_at: new Date().toISOString(),
      pickup_verification_code: '8842',
      reassignment_count: 0,
      dispatch_attention_required: false,
      current_search_radius_meters: 2000,
      dispatch_cycle_count: 1,
      version: 1,
    });

    // 1. Wrong pickup verification code should be rejected
    await assert.rejects(
      async () => {
        await dispatchService.riderConfirmPickup(delivery.id, testRiderUserId, {
          pickup_verification_code: '9999',
        });
      },
      {
        name: 'AppError',
        message: /Pickup verification code does not match order requirement/,
      }
    );

    // 2. Correct pickup verification code succeeds
    const confirmed = await dispatchService.riderConfirmPickup(delivery.id, testRiderUserId, {
      pickup_verification_code: '8842',
      note: 'Order packaged securely with tamper seal',
    });

    assert.equal(confirmed.status, DeliveryStatus.PICKED_UP);
    assert.ok(confirmed.picked_up_at);
  });

  test('4. En Route and Dropoff Arrival transitions work as expected', async () => {
    const orderId = `ord_s10_route_${Date.now()}`;
    const delivery = await deliveryRepository.createDelivery({
      order_id: orderId,
      order_number: 'ORD-S10-003',
      status: DeliveryStatus.PICKED_UP,
      branch_id: testBranchId,
      customer_id: testCustomerId,
      pickup_location: { latitude: -1.2683, longitude: 36.8111 },
      dropoff_location: { latitude: -1.275, longitude: 36.815 },
      pickup_address_text: 'Mama Oliech Kitchen',
      dropoff_address_text: 'Westlands Pride Apartments, Block C',
      assigned_rider_id: testRiderId,
      assigned_at: new Date().toISOString(),
      arrived_pickup_at: new Date().toISOString(),
      picked_up_at: new Date().toISOString(),
      reassignment_count: 0,
      dispatch_attention_required: false,
      current_search_radius_meters: 2000,
      dispatch_cycle_count: 1,
      version: 1,
    });

    // Transition to EN_ROUTE
    const enRoute = await dispatchService.riderStartTrip(delivery.id, testRiderUserId);
    assert.equal(enRoute.status, DeliveryStatus.EN_ROUTE);
    assert.ok(enRoute.en_route_at);

    // Transition to ARRIVED_DROPOFF
    const arrivedDropoff = await dispatchService.riderArriveDropoff(delivery.id, testRiderUserId, {
      latitude: -1.2751,
      longitude: 36.8151,
    });
    assert.equal(arrivedDropoff.status, DeliveryStatus.ARRIVED_DROPOFF);
    assert.ok(arrivedDropoff.arrived_dropoff_at);
  });

  test('5. Proof of Delivery with OTP: verifies code, locks after 5 failed attempts, completes on success', async () => {
    const orderId = `ord_s10_otp_${Date.now()}`;
    const delivery = await deliveryRepository.createDelivery({
      order_id: orderId,
      order_number: 'ORD-S10-004',
      status: DeliveryStatus.ARRIVED_DROPOFF,
      branch_id: testBranchId,
      customer_id: testCustomerId,
      pickup_location: { latitude: -1.2683, longitude: 36.8111 },
      dropoff_location: { latitude: -1.275, longitude: 36.815 },
      pickup_address_text: 'Mama Oliech Kitchen',
      dropoff_address_text: 'Westlands Pride Apartments, Block C',
      assigned_rider_id: testRiderId,
      assigned_at: new Date().toISOString(),
      arrived_pickup_at: new Date().toISOString(),
      picked_up_at: new Date().toISOString(),
      en_route_at: new Date().toISOString(),
      arrived_dropoff_at: new Date().toISOString(),
      delivery_otp: '7391',
      delivery_otp_attempts: 0,
      delivery_otp_locked: false,
      reassignment_count: 0,
      dispatch_attention_required: false,
      current_search_radius_meters: 2000,
      dispatch_cycle_count: 1,
      version: 1,
    });

    // Attempt 1 with wrong OTP
    await assert.rejects(
      async () => {
        await dispatchService.riderCompleteDelivery(delivery.id, testRiderUserId, {
          proof_type: 'OTP',
          otp: '0000',
        });
      },
      {
        name: 'AppError',
        message: /Incorrect OTP\. 4 attempts remaining/,
      }
    );

    // Verify attempts incremented in repository
    const afterAttempt1 = await deliveryRepository.findById(delivery.id);
    assert.equal(afterAttempt1?.delivery_otp_attempts, 1);
    assert.equal(afterAttempt1?.delivery_otp_locked, false);

    // Correct OTP succeeds!
    const completed = await dispatchService.riderCompleteDelivery(delivery.id, testRiderUserId, {
      proof_type: 'OTP',
      otp: '7391',
    });

    assert.equal(completed.status, DeliveryStatus.DELIVERED);
    assert.ok(completed.delivered_at);
    assert.equal(completed.proof_type, 'OTP');

    // Courier should be released back to ONLINE_AVAILABLE
    const riderProfile = await riderRepository.findProfileById(testRiderId);
    assert.equal(riderProfile?.workStatus, RiderWorkStatus.ONLINE_AVAILABLE);

    // Proof record should be stored in delivery_proofs
    const proofs = await deliveryRepository.getProofsByDeliveryId(delivery.id);
    assert.equal(proofs.length, 1);
    assert.equal(proofs[0].type, 'OTP');
    assert.equal(proofs[0].proof_value, 'OTP_VERIFIED');
  });

  test('6. Proof of Delivery with Photo: requires verified private media bound to delivery', async () => {
    const orderId = `ord_s10_photo_${Date.now()}`;
    const delivery = await deliveryRepository.createDelivery({
      order_id: orderId,
      order_number: 'ORD-S10-005',
      status: DeliveryStatus.ARRIVED_DROPOFF,
      branch_id: testBranchId,
      customer_id: testCustomerId,
      pickup_location: { latitude: -1.2683, longitude: 36.8111 },
      dropoff_location: { latitude: -1.275, longitude: 36.815 },
      pickup_address_text: 'Mama Oliech Kitchen',
      dropoff_address_text: 'Westlands Pride Apartments, Block C',
      assigned_rider_id: testRiderId,
      assigned_at: new Date().toISOString(),
      arrived_pickup_at: new Date().toISOString(),
      picked_up_at: new Date().toISOString(),
      en_route_at: new Date().toISOString(),
      arrived_dropoff_at: new Date().toISOString(),
      reassignment_count: 0,
      dispatch_attention_required: false,
      current_search_radius_meters: 2000,
      dispatch_cycle_count: 1,
      version: 1,
    });

    await assert.rejects(
      () => dispatchService.riderCompleteDelivery(delivery.id, testRiderUserId, { proof_type: 'PHOTO' }),
      (error: any) => error?.code === 'PHOTO_PROOF_REQUIRED',
    );

    const upload = await mediaService.createUpload({
      ownerUserId: testRiderUserId,
      purpose: 'DELIVERY_PROOF',
      contentType: 'image/jpeg',
      referenceType: 'DELIVERY',
      referenceId: delivery.id,
    });
    await mediaService.completeUpload(upload.media.id, testRiderUserId);

    const completed = await dispatchService.riderCompleteDelivery(delivery.id, testRiderUserId, {
      proof_type: 'PHOTO',
      photo_media_id: upload.media.id,
      note: 'Placed at front doorstep per instructions',
    });

    assert.equal(completed.status, DeliveryStatus.DELIVERED);
    const proofs = await deliveryRepository.getProofsByDeliveryId(delivery.id);
    assert.equal(proofs.length, 1);
    assert.equal(proofs[0].type, 'PHOTO');
    assert.equal(proofs[0].media_object_id, upload.media.id);
    assert.match(proofs[0].storage_url || '', /^s3:\/\/memory-private\//);
  });

  test('7. Failed Delivery Handling: preserves Rider custody after pickup and opens incident', async () => {
    const orderId = `ord_s10_fail_${Date.now()}`;
    const delivery = await deliveryRepository.createDelivery({
      order_id: orderId,
      order_number: 'ORD-S10-006',
      status: DeliveryStatus.ARRIVED_DROPOFF,
      branch_id: testBranchId,
      customer_id: testCustomerId,
      pickup_location: { latitude: -1.2683, longitude: 36.8111 },
      dropoff_location: { latitude: -1.275, longitude: 36.815 },
      pickup_address_text: 'Mama Oliech Kitchen',
      dropoff_address_text: 'Westlands Pride Apartments, Block C',
      assigned_rider_id: testRiderId,
      assigned_at: new Date().toISOString(),
      arrived_pickup_at: new Date().toISOString(),
      picked_up_at: new Date().toISOString(),
      en_route_at: new Date().toISOString(),
      arrived_dropoff_at: new Date().toISOString(),
      reassignment_count: 0,
      dispatch_attention_required: false,
      current_search_radius_meters: 2000,
      dispatch_cycle_count: 1,
      version: 1,
    });

    const failed = await dispatchService.riderFailDelivery(delivery.id, testRiderUserId, {
      reason_code: 'CUSTOMER_UNREACHABLE',
      note: 'Customer phone is off and gate security does not know tenant',
    });

    assert.equal(failed.status, DeliveryStatus.FAILED);
    assert.ok(failed.failed_at);
    assert.equal(failed.failure_reason, 'CUSTOMER_UNREACHABLE');
    assert.equal(failed.dispatch_attention_required, true);

    // Rider keeps custody after pickup until Operations resolves the incident.
    const rider = await riderRepository.findProfileById(testRiderId);
    assert.equal(rider?.workStatus, RiderWorkStatus.BUSY);
    const activeAfterFailure = await deliveryRepository.findActiveByRiderId(testRiderId);
    assert.equal(activeAfterFailure?.id, delivery.id);

    // Incident record should exist
    const incidents = await deliveryRepository.listIncidents({ delivery_id: delivery.id });
    assert.equal(incidents.length, 1);
    assert.equal(incidents[0].reason_code, 'CUSTOMER_UNREACHABLE');
    assert.equal(incidents[0].status, 'OPEN');
  });

  test('8. Admin Operations: Force complete stuck delivery and resolve incidents', async () => {
    const orderId = `ord_s10_admin_${Date.now()}`;
    const delivery = await deliveryRepository.createDelivery({
      order_id: orderId,
      order_number: 'ORD-S10-007',
      status: DeliveryStatus.ARRIVED_DROPOFF,
      branch_id: testBranchId,
      customer_id: testCustomerId,
      pickup_location: { latitude: -1.2683, longitude: 36.8111 },
      dropoff_location: { latitude: -1.275, longitude: 36.815 },
      pickup_address_text: 'Mama Oliech Kitchen',
      dropoff_address_text: 'Westlands Pride Apartments, Block C',
      assigned_rider_id: testRiderId,
      assigned_at: new Date().toISOString(),
      reassignment_count: 0,
      dispatch_attention_required: true,
      attention_reason: 'Rider app battery died',
      current_search_radius_meters: 2000,
      dispatch_cycle_count: 1,
      version: 1,
    });

    const forceCompleted = await dispatchService.adminForceCompleteDelivery(
      delivery.id,
      'admin_user_01',
      'Operations Lead',
      'CUSTOMER_CONFIRMED_RECEIPT',
      'Customer phoned support confirming food is received'
    );

    assert.equal(forceCompleted.status, DeliveryStatus.DELIVERED);
    assert.equal(forceCompleted.dispatch_attention_required, false);
  });

  test('9. Customer Live Tracking: masks rider PII, provides live GPS and ETA', async () => {
    const orderId = `ord_s10_track_${Date.now()}`;

    // Create order
    const order = await orderRepository.createOrderAtomic({
      id: orderId,
      order_number: 'ORD-S10-008',
      customer_id: testCustomerId,
      branch_id: testBranchId,
      branch_name: 'Urban Gourmet Burger',
      status: OrderStatus.READY,
      currency: 'KES',
      subtotal_amount: 120000,
      tax_amount: 19200,
      delivery_fee_amount: 15000,
      tip_amount: 0,
      discount_amount: 0,
      total_amount: 154200,
      payment_status: 'PAID' as any,
      payment_method: 'MPESA' as any,
      items: [
        {
          id: 'item_01',
          order_id: orderId,
          catalogue_item_id: 'ci_01',
          item_name: 'Smokey Bacon Burger',
          base_price_amount: 120000,
          total_price_amount: 120000,
          quantity: 1,
          modifiers: [],
        },
      ],
      delivery_address_snapshot: {
        recipient_name: 'Wanjiku Mwangi',
        phone: '+254700000111',
        formatted_address: 'Riverside Drive, Nairobi',
        location: { lat: -1.275, lng: 36.815 },
      },
    });

    // Create active delivery en route
    await deliveryRepository.createDelivery({
      order_id: order.id,
      order_number: order.order_number,
      status: DeliveryStatus.EN_ROUTE,
      branch_id: testBranchId,
      branch_name: 'Urban Gourmet Burger',
      customer_id: testCustomerId,
      customer_name: 'Wanjiku Mwangi',
      pickup_location: { latitude: -1.2683, longitude: 36.8111 },
      dropoff_location: { latitude: -1.275, longitude: 36.815 },
      pickup_address_text: 'Urban Gourmet Burger, Westgate',
      dropoff_address_text: 'Riverside Drive, Nairobi',
      assigned_rider_id: testRiderId,
      assigned_at: new Date().toISOString(),
      arrived_pickup_at: new Date().toISOString(),
      picked_up_at: new Date().toISOString(),
      en_route_at: new Date().toISOString(),
      delivery_otp: '6543',
      reassignment_count: 0,
      dispatch_attention_required: false,
      current_search_radius_meters: 2000,
      dispatch_cycle_count: 1,
      version: 1,
    });

    // Query customer tracking
    const tracking = await dispatchService.getCustomerTracking(order.id, testCustomerId, false);

    assert.equal(tracking.orderId, order.id);
    assert.equal(tracking.deliveryStatus, DeliveryStatus.EN_ROUTE);
    assert.equal(tracking.deliveryOtp, '6543');

    // Verify PII is masked
    assert.ok(tracking.rider);
    assert.equal(tracking.rider?.firstName, 'Boniface'); // First name only
    assert.equal(tracking.rider?.vehicleType, VehicleType.MOTORBIKE);
    assert.equal(tracking.rider?.vehicleRegistrationMasked, 'KM***Z'); // Masked registration
    assert.ok(tracking.rider?.phoneProxy.includes('ext')); // Virtual proxy phone

    // Verify live location and calculated ETA
    assert.ok(tracking.riderLiveLocation);
    assert.equal(tracking.riderLiveLocation?.latitude, -1.2683);
    assert.ok(tracking.estimatedEtaMinutes !== null && tracking.estimatedEtaMinutes > 0);

    await riderLocationStore.saveLiveLocation(testRiderId, {
      ...tracking.riderLiveLocation!, riderId: testRiderId, accuracyMeters: 5,
      recordedAt: new Date(Date.now() - 240000).toISOString(), receivedAt: new Date().toISOString(),
    });
    const stale = await dispatchService.getCustomerTracking(order.id, testCustomerId, false);
    assert.equal(stale.riderLiveLocation?.isStale, true);
    assert.equal(stale.estimatedEtaMinutes, null);
    assert.equal(stale.estimatedArrivalAt, null);

    // Verify non-owner customer tracking access is rejected (403 FORBIDDEN_TRACKING)
    await assert.rejects(
      async () => {
        await dispatchService.getCustomerTracking(order.id, 'unauthorized_customer_99', false);
      },
      {
        name: 'AppError',
        message: /You are not authorized to track this order/,
      }
    );
  });

  test('10. Stuck Delivery Detection scans active deliveries against SLAs', async () => {
    // Create an old delivery stuck in ARRIVED_PICKUP for 25 minutes (SLA is 15 minutes)
    const oldTimestamp = new Date(Date.now() - 25 * 60 * 1000).toISOString();
    const stuckDelivery = await deliveryRepository.createDelivery({
      order_id: `ord_stuck_${Date.now()}`,
      order_number: 'ORD-STUCK-001',
      status: DeliveryStatus.ARRIVED_PICKUP,
      branch_id: testBranchId,
      customer_id: testCustomerId,
      pickup_location: { latitude: -1.2683, longitude: 36.8111 },
      dropoff_location: { latitude: -1.275, longitude: 36.815 },
      pickup_address_text: 'Mama Oliech Kitchen',
      dropoff_address_text: 'Westlands Pride Apartments, Block C',
      assigned_rider_id: testRiderId,
      assigned_at: oldTimestamp,
      arrived_pickup_at: oldTimestamp,
      reassignment_count: 0,
      dispatch_attention_required: false,
      current_search_radius_meters: 2000,
      dispatch_cycle_count: 1,
      version: 1,
    });

    const alerts = await dispatchService.scanStuckDeliveries();
    const alert = alerts.find((a) => a.deliveryId === stuckDelivery.id);

    assert.ok(alert, 'Stuck delivery alert should be generated');
    assert.equal(alert?.phase, 'ARRIVED_PICKUP');
    assert.ok(alert?.stuckDurationMinutes !== undefined && alert?.stuckDurationMinutes >= 20);
    assert.ok(alert?.thresholdMinutes !== undefined);
  });
});
