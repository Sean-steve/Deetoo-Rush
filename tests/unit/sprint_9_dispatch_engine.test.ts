import { createPaidDispatchFixture } from '../helpers/paid-order';
/**
 * DEETOO - Sprint 9 Unit Tests
 * Dispatch, Rider Matching, Delivery Offers, Timeouts, Concurrency Protection & Auto-Reassignment
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DeliveryStatus,
  DeliveryOfferStatus,
  RiderWorkStatus,
  RiderOnboardingStatus,
  RiderOperationalStatus,
  VehicleType,
} from '../../packages/types/src/index';
import { DeliveryStateMachine } from '../../apps/api/src/modules/order/delivery-state-machine';
import { deliveryRepository } from '../../apps/api/src/modules/order/delivery.repository';
import { dispatchService } from '../../apps/api/src/modules/order/dispatch.service';
import { riderRepository } from '../../apps/api/src/modules/rider/rider.repository';
import { riderLocationStore } from '../../apps/api/src/db/redis';
import { randomUUID } from 'crypto';

test('1. Delivery State Machine enforces strict lifecycle transitions and prevents illegal state jumps', () => {
  // Valid happy path
  assert.equal(DeliveryStateMachine.canTransition(DeliveryStatus.UNASSIGNED, DeliveryStatus.OFFERED), true);
  assert.equal(DeliveryStateMachine.canTransition(DeliveryStatus.OFFERED, DeliveryStatus.ASSIGNED), true);
  assert.equal(DeliveryStateMachine.canTransition(DeliveryStatus.ASSIGNED, DeliveryStatus.ARRIVED_PICKUP), true);
  assert.equal(DeliveryStateMachine.canTransition(DeliveryStatus.ARRIVED_PICKUP, DeliveryStatus.PICKED_UP), true);
  assert.equal(DeliveryStateMachine.canTransition(DeliveryStatus.PICKED_UP, DeliveryStatus.EN_ROUTE), true);
  assert.equal(DeliveryStateMachine.canTransition(DeliveryStatus.EN_ROUTE, DeliveryStatus.ARRIVED_DROPOFF), true);
  assert.equal(DeliveryStateMachine.canTransition(DeliveryStatus.ARRIVED_DROPOFF, DeliveryStatus.DELIVERED), true);

  // Illegal jumps
  assert.equal(DeliveryStateMachine.canTransition(DeliveryStatus.UNASSIGNED, DeliveryStatus.DELIVERED), false);
  assert.equal(DeliveryStateMachine.canTransition(DeliveryStatus.PICKED_UP, DeliveryStatus.ASSIGNED), false);
  assert.equal(DeliveryStateMachine.canTransition(DeliveryStatus.DELIVERED, DeliveryStatus.UNASSIGNED), false);

  // Transition helper generates audit timeline entry
  const transition = DeliveryStateMachine.transition(DeliveryStatus.UNASSIGNED, 'del_100', {
    targetStatus: DeliveryStatus.OFFERED,
    actorType: 'SYSTEM',
    note: 'Offered to courier',
  });

  assert.equal(transition.newStatus, DeliveryStatus.OFFERED);
  assert.equal(transition.timelineEntry.from_status, DeliveryStatus.UNASSIGNED);
  assert.equal(transition.timelineEntry.to_status, DeliveryStatus.OFFERED);
  assert.equal(transition.timelineEntry.actor_type, 'SYSTEM');

  // Throws on terminal transition
  assert.throws(
    () => {
      DeliveryStateMachine.transition(DeliveryStatus.DELIVERED, 'del_100', {
        targetStatus: DeliveryStatus.UNASSIGNED,
        actorType: 'SYSTEM',
      });
    },
    (err: any) => err.code === 'DELIVERY_TERMINAL_STATE' || /terminal state/.test(err.message)
  );
});

test('2. Intelligent Lead-Time calculation holds dispatch until threshold to prevent courier kitchen wait time', () => {
  const acceptedAt = new Date('2026-09-08T12:00:00Z');
  const prepMinutes = 20; // Ready at 12:20:00Z
  // Expected travel = 8 min (480s), buffer = 2 min (120s) -> lead time = 10 min
  // dispatch_not_before = 12:20 - 10 min = 12:10:00Z

  // At 12:02:00Z (too early): should NOT dispatch yet
  const earlyCheck = dispatchService.calculateDispatchTiming(acceptedAt, prepMinutes, {
    travelSeconds: 480,
    bufferSeconds: 120,
    now: new Date('2026-09-08T12:02:00Z'),
  });
  assert.equal(earlyCheck.shouldDispatchNow, false);
  assert.equal(earlyCheck.dispatchNotBefore, '2026-09-08T12:10:00.000Z');

  // At 12:11:00Z (reached threshold): SHOULD dispatch now
  const readyCheck = dispatchService.calculateDispatchTiming(acceptedAt, prepMinutes, {
    travelSeconds: 480,
    bufferSeconds: 120,
    now: new Date('2026-09-08T12:11:00Z'),
  });
  assert.equal(readyCheck.shouldDispatchNow, true);
});

test('3. Concurrency Protection: Prevents double-assignment of rider to multiple active deliveries', async () => {
  const riderId = 'rider_test_concurrent_01';
  const del1Id = `del_con_${Date.now()}_1`;
  const del2Id = `del_con_${Date.now()}_2`;

  // Create two deliveries
  await deliveryRepository.createDelivery({
    id: del1Id,
    order_id: `ord_${del1Id}`,
    status: DeliveryStatus.UNASSIGNED,
    branch_id: 'b_01',
    customer_id: 'c_01',
    pickup_location: { lat: -1.2683, lng: 36.8111 },
    dropoff_location: { lat: -1.2600, lng: 36.8200 },
    pickup_address_text: 'Westlands Kitchen',
    dropoff_address_text: 'Parklands Avenue',
    reassignment_count: 0,
    dispatch_attention_required: false,
    current_search_radius_meters: 2000,
    dispatch_cycle_count: 0,
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  await deliveryRepository.createDelivery({
    id: del2Id,
    order_id: `ord_${del2Id}`,
    status: DeliveryStatus.UNASSIGNED,
    branch_id: 'b_01',
    customer_id: 'c_02',
    pickup_location: { lat: -1.2683, lng: 36.8111 },
    dropoff_location: { lat: -1.2650, lng: 36.8250 },
    pickup_address_text: 'Westlands Kitchen',
    dropoff_address_text: 'Kileleshwa Ridge',
    reassignment_count: 0,
    dispatch_attention_required: false,
    current_search_radius_meters: 2000,
    dispatch_cycle_count: 0,
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // Assign delivery 1 to rider
  const assigned1 = await deliveryRepository.atomicAssign(del1Id, riderId, 'John Kamau', '+254711000111');
  assert.equal(assigned1.status, DeliveryStatus.ASSIGNED);
  assert.equal(assigned1.assigned_rider_id, riderId);

  // Attempting to assign delivery 2 to SAME rider must fail immediately
  await assert.rejects(async () => {
    await deliveryRepository.atomicAssign(del2Id, riderId, 'John Kamau', '+254711000111');
  }, /already assigned to an active delivery/);
});

test('4. Proximity Discovery & Candidate Ranking selects and ranks nearest eligible couriers', async () => {
  // Seed two couriers in location store: one close (500m), one farther (3500m)
  const riderClose = 'rider_test_close';
  const riderFar = 'rider_test_far';

  // Seed profiles
  await riderRepository.createProfile({
    id: riderClose,
    userId: 'usr_close',
    firstName: 'Peter',
    lastName: 'Kipchoge',
    phone: '+254722111222',
    onboardingStatus: RiderOnboardingStatus.APPROVED,
    operationalStatus: RiderOperationalStatus.ACTIVE,
    workStatus: RiderWorkStatus.ONLINE_AVAILABLE,
    vehicleType: VehicleType.MOTORBIKE,
  });

  await riderRepository.createProfile({
    id: riderFar,
    userId: 'usr_far',
    firstName: 'David',
    lastName: 'Omondi',
    phone: '+254722333444',
    onboardingStatus: RiderOnboardingStatus.APPROVED,
    operationalStatus: RiderOperationalStatus.ACTIVE,
    workStatus: RiderWorkStatus.ONLINE_AVAILABLE,
    vehicleType: VehicleType.BICYCLE,
  });

  // Seed GPS locations in Redis store (Westlands Nairobi)
  // Restaurant at (-1.2683, 36.8111)
  await riderLocationStore.saveLiveLocation(riderClose, {
    riderId: riderClose,
    latitude: -1.2690, // ~100m away
    longitude: 36.8115,
    accuracyMeters: 5,
    recordedAt: new Date().toISOString(),
    receivedAt: new Date().toISOString(),
  });
  await riderLocationStore.addAvailableRider(riderClose, 36.8115, -1.2690);

  await riderLocationStore.saveLiveLocation(riderFar, {
    riderId: riderFar,
    latitude: -1.2850, // ~2.5km away
    longitude: 36.8200,
    accuracyMeters: 10,
    recordedAt: new Date().toISOString(),
    receivedAt: new Date().toISOString(),
  });
  await riderLocationStore.addAvailableRider(riderFar, 36.8200, -1.2850);

  const restaurantLocation = { lat: -1.2683, lng: 36.8111 };
  const candidates = await dispatchService.findAndRankCandidates(restaurantLocation, 5000);

  assert.ok(candidates.length >= 2, 'Should find both eligible candidates');
  assert.equal(candidates[0].riderId, riderClose, 'Nearest courier must be ranked #1');
  assert.equal(candidates[0].rank, 1);
  assert.ok(candidates[0].score > candidates[1].score, 'Closer courier gets higher score');
});

test('5. Cascading Dispatch: Offer rejection triggers auto-cascade to next ranked courier', async () => {
  const deliveryId = `del_cascade_${Date.now()}`;
  await createPaidDispatchFixture(`ord_${deliveryId}`);
  const riderCandidate1 = 'rider_casc_1';
  const riderCandidate2 = 'rider_casc_2';

  // Seed two couriers
  await riderRepository.createProfile({
    id: riderCandidate1,
    userId: 'usr_casc_1',
    firstName: 'Candidate',
    lastName: 'One',
    phone: '+254733000001',
    onboardingStatus: RiderOnboardingStatus.APPROVED,
    operationalStatus: RiderOperationalStatus.ACTIVE,
    workStatus: RiderWorkStatus.ONLINE_AVAILABLE,
    vehicleType: VehicleType.MOTORBIKE,
  });

  await riderRepository.createProfile({
    id: riderCandidate2,
    userId: 'usr_casc_2',
    firstName: 'Candidate',
    lastName: 'Two',
    phone: '+254733000002',
    onboardingStatus: RiderOnboardingStatus.APPROVED,
    operationalStatus: RiderOperationalStatus.ACTIVE,
    workStatus: RiderWorkStatus.ONLINE_AVAILABLE,
    vehicleType: VehicleType.MOTORBIKE,
  });

  await riderLocationStore.saveLiveLocation(riderCandidate1, {
    riderId: riderCandidate1,
    latitude: -1.2685,
    longitude: 36.8112,
    accuracyMeters: 5,
    recordedAt: new Date().toISOString(),
    receivedAt: new Date().toISOString(),
  });
  await riderLocationStore.addAvailableRider(riderCandidate1, 36.8112, -1.2685);

  await riderLocationStore.saveLiveLocation(riderCandidate2, {
    riderId: riderCandidate2,
    latitude: -1.2720,
    longitude: 36.8140,
    accuracyMeters: 5,
    recordedAt: new Date().toISOString(),
    receivedAt: new Date().toISOString(),
  });
  await riderLocationStore.addAvailableRider(riderCandidate2, 36.8140, -1.2720);

  // Create delivery
  await deliveryRepository.createDelivery({
    id: deliveryId,
    order_id: `ord_${deliveryId}`,
    status: DeliveryStatus.UNASSIGNED,
    branch_id: 'b_01',
    customer_id: 'c_01',
    pickup_location: { lat: -1.2683, lng: 36.8111 },
    dropoff_location: { lat: -1.2600, lng: 36.8200 },
    pickup_address_text: 'Restaurant',
    dropoff_address_text: 'Dropoff',
    reassignment_count: 0,
    dispatch_attention_required: false,
    current_search_radius_meters: 2000,
    dispatch_cycle_count: 0,
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // Cycle 1: Dispatches to Candidate 1
  const cycle1 = await dispatchService.executeDispatchCycle(deliveryId);
  assert.equal(cycle1.status, 'OFFERED');
  assert.ok(cycle1.offer);
  assert.equal(cycle1.offer.rider_id, riderCandidate1);

  // Candidate 1 declines with DISTANCE_TOO_FAR
  const rejectResult = await dispatchService.rejectOffer(
    cycle1.offer.id,
    'usr_casc_1',
    'DISTANCE_TOO_FAR',
    'Too far from current location'
  );
  assert.equal(rejectResult.rejected, true);

  // Verify delivery cascaded away from candidate 1 to next eligible courier
  const activeOffer = await deliveryRepository.findActiveOfferByDeliveryId(deliveryId);
  assert.ok(activeOffer);
  assert.notEqual(activeOffer.rider_id, riderCandidate1, 'Dispatch cascaded away from candidate #1');
  assert.equal(activeOffer.status, DeliveryOfferStatus.OFFERED);
});

test('6. Offer Acceptance transitions delivery to ASSIGNED and courier to BUSY', async () => {
  const deliveryId = `del_accept_${Date.now()}`;
  await createPaidDispatchFixture(`ord_${deliveryId}`);
  const riderId = 'rider_accept_01';
  const userId = 'usr_accept_01';

  await riderRepository.createProfile({
    id: riderId,
    userId,
    firstName: 'Samuel',
    lastName: 'Mwangi',
    phone: '+254744000111',
    onboardingStatus: RiderOnboardingStatus.APPROVED,
    operationalStatus: RiderOperationalStatus.ACTIVE,
    workStatus: RiderWorkStatus.ONLINE_AVAILABLE,
    vehicleType: VehicleType.MOTORBIKE,
  });

  await deliveryRepository.createDelivery({
    id: deliveryId,
    order_id: `ord_${deliveryId}`,
    status: DeliveryStatus.UNASSIGNED,
    branch_id: 'b_01',
    customer_id: 'c_01',
    pickup_location: { lat: -1.2683, lng: 36.8111 },
    dropoff_location: { lat: -1.2600, lng: 36.8200 },
    pickup_address_text: 'Restaurant',
    dropoff_address_text: 'Dropoff',
    reassignment_count: 0,
    dispatch_attention_required: false,
    current_search_radius_meters: 2000,
    dispatch_cycle_count: 0,
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const offer = await deliveryRepository.createOffer({
    id: `offer_${Date.now()}`,
    delivery_id: deliveryId,
    order_id: `ord_${deliveryId}`,
    rider_id: riderId,
    status: DeliveryOfferStatus.OFFERED,
    rank: 1,
    score: 95,
    distance_to_pickup_meters: 300,
    estimated_pickup_eta_seconds: 90,
    offered_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 30000).toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // Courier accepts
  const assigned = await dispatchService.acceptOffer(offer.id, userId);
  assert.equal(assigned.status, DeliveryStatus.ASSIGNED);
  assert.equal(assigned.assigned_rider_id, riderId);

  // Check courier profile is now BUSY
  const profile = await riderRepository.findProfileById(riderId);
  assert.equal(profile?.workStatus, RiderWorkStatus.BUSY);
});

test('7. Courier Self-Release before pickup unassigns delivery and auto-retriggers dispatch', async () => {
  const deliveryId = `del_release_${Date.now()}`;
  await createPaidDispatchFixture(`ord_${deliveryId}`);
  const riderId = 'rider_rel_01';
  const userId = 'usr_rel_01';

  await riderRepository.createProfile({
    id: riderId,
    userId,
    firstName: 'Brian',
    lastName: 'Otieno',
    phone: '+254755000111',
    onboardingStatus: RiderOnboardingStatus.APPROVED,
    operationalStatus: RiderOperationalStatus.ACTIVE,
    workStatus: RiderWorkStatus.BUSY,
    vehicleType: VehicleType.MOTORBIKE,
  });

  await deliveryRepository.createDelivery({
    id: deliveryId,
    order_id: `ord_${deliveryId}`,
    status: DeliveryStatus.ASSIGNED,
    assigned_rider_id: riderId,
    branch_id: 'b_01',
    customer_id: 'c_01',
    pickup_location: { lat: -1.2683, lng: 36.8111 },
    dropoff_location: { lat: -1.2600, lng: 36.8200 },
    pickup_address_text: 'Restaurant',
    dropoff_address_text: 'Dropoff',
    reassignment_count: 0,
    dispatch_attention_required: false,
    current_search_radius_meters: 2000,
    dispatch_cycle_count: 1,
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // Courier self-releases due to puncture
  const released = await dispatchService.riderReleaseDelivery(
    deliveryId,
    userId,
    'VEHICLE_ISSUE',
    'Flat tyre near Westlands roundabout'
  );

  assert.equal(released.status, DeliveryStatus.UNASSIGNED);
  assert.equal(released.assigned_rider_id, null);
  assert.equal(released.reassignment_count, 1);

  // Courier returned to ONLINE_AVAILABLE
  const updatedProfile = await riderRepository.findProfileById(riderId);
  assert.equal(updatedProfile?.workStatus, RiderWorkStatus.ONLINE_AVAILABLE);
});

test('8. Admin Manual Override assigns courier and logs audit timeline', async () => {
  const deliveryId = `del_admin_${Date.now()}`;
  await createPaidDispatchFixture(`ord_${deliveryId}`);
  const riderId = 'rider_adm_01';

  await riderRepository.createProfile({
    id: riderId,
    userId: 'usr_adm_01',
    firstName: 'Victor',
    lastName: 'Kariuki',
    phone: '+254766000111',
    onboardingStatus: RiderOnboardingStatus.APPROVED,
    operationalStatus: RiderOperationalStatus.ACTIVE,
    workStatus: RiderWorkStatus.ONLINE_AVAILABLE,
    vehicleType: VehicleType.MOTORBIKE,
  });

  await deliveryRepository.createDelivery({
    id: deliveryId,
    order_id: `ord_${deliveryId}`,
    status: DeliveryStatus.UNASSIGNED,
    branch_id: 'b_01',
    customer_id: 'c_01',
    pickup_location: { lat: -1.2683, lng: 36.8111 },
    dropoff_location: { lat: -1.2600, lng: 36.8200 },
    pickup_address_text: 'Restaurant',
    dropoff_address_text: 'Dropoff',
    reassignment_count: 0,
    dispatch_attention_required: false,
    current_search_radius_meters: 2000,
    dispatch_cycle_count: 0,
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const assigned = await dispatchService.adminManualAssign(
    deliveryId,
    riderId,
    { id: 'admin_usr_01', email: 'dispatch-lead@deetoo.co.ke' },
    'Priority VIP order manual assignment'
  );

  assert.equal(assigned.status, DeliveryStatus.ASSIGNED);
  assert.equal(assigned.assigned_rider_id, riderId);

  // Verify timeline recorded ADMIN action
  const timeline = await deliveryRepository.getTimelineByDeliveryId(deliveryId);
  const adminEntry = timeline.find((t) => t.actor_type === 'ADMIN');
  assert.ok(adminEntry);
  assert.equal(adminEntry.action, 'ADMIN_MANUAL_ASSIGNMENT');
  assert.equal(adminEntry.actor_name, 'dispatch-lead@deetoo.co.ke');
});


test('9. Unanswered rider offers expire automatically before the next dispatch cycle', async () => {
  const deliveryId = `del_expired_offer_${Date.now()}`;
  const orderId = `ord_${deliveryId}`;
  const riderId = `rider_expired_${Date.now()}`;

  await deliveryRepository.createDelivery({
    id: deliveryId,
    order_id: orderId,
    order_number: 'AUTO-TIMEOUT-01',
    status: DeliveryStatus.OFFERED,
    branch_id: 'b_auto_timeout',
    customer_id: 'c_auto_timeout',
    pickup_location: { lat: -1.2864, lng: 36.8172 },
    dropoff_location: { lat: -1.29, lng: 36.82 },
    pickup_address_text: 'Automation Kitchen',
    dropoff_address_text: 'Automation Dropoff',
    reassignment_count: 0,
    dispatch_attention_required: false,
    current_search_radius_meters: 2000,
    dispatch_cycle_count: 1,
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const offer = await deliveryRepository.createOffer({
    id: `offer_expired_${Date.now()}`,
    delivery_id: deliveryId,
    order_id: orderId,
    order_number: 'AUTO-TIMEOUT-01',
    rider_id: riderId,
    rider_name: 'Unresponsive Rider',
    status: DeliveryOfferStatus.OFFERED,
    rank: 1,
    score: 90,
    distance_to_pickup_meters: 250,
    estimated_pickup_eta_seconds: 90,
    offered_at: new Date(Date.now() - 60_000).toISOString(),
    expires_at: new Date(Date.now() - 30_000).toISOString(),
    created_at: new Date(Date.now() - 60_000).toISOString(),
    updated_at: new Date(Date.now() - 60_000).toISOString(),
  });

  const expired = await deliveryRepository.expireStaleOffersForDelivery(deliveryId);
  assert.equal(expired.length, 1);
  assert.equal(expired[0].id, offer.id);
  assert.equal(expired[0].status, DeliveryOfferStatus.EXPIRED);
  assert.equal(expired[0].rejection_reason, 'OFFER_TIMEOUT');

  const stored = await deliveryRepository.findOfferById(offer.id);
  assert.equal(stored?.status, DeliveryOfferStatus.EXPIRED);
  assert.equal(await deliveryRepository.findActiveOfferByDeliveryId(deliveryId), null);
});
