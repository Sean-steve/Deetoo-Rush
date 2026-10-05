import { requirePaidOrder } from '../payment/paid-order-guard';
import { allowMemoryAdapter } from '../../db/storage-policy';
import { transactionalService } from '../../db/transaction';
import { lockCommand } from '../cart/quote-binding';
import { notificationService } from '../operations/notification.service';
/**
 * DEETOO - Dispatch & Rider Matching Engine
 * Sprint 9: Proximity Search, Candidate Scoring, Lead-Time Scheduling,
 * Cascading Offers, Double-Assignment Prevention, and Escalation Controls.
 */

import {
  Delivery,
  DeliveryStatus,
  DeliveryOffer,
  DeliveryOfferStatus,
  DispatchCandidate,
  DispatchAttempt,
  DispatchConfig,
  DispatchTimingResult,
  RiderWorkStatus,
  RiderOnboardingStatus,
  RiderOperationalStatus,
  OrderStatus,
  RealtimeOrderEvent,
  GeoPoint,
  CustomerTrackingResponse,
  RiderDeliveryDetail,
  DeliveryProofType,
  DeliveryProof,
  DeliveryIncident,
  StuckDeliveryAlert,
} from '@deetoo/types';
import { config } from '@deetoo/config';
import { AppError } from '../../middleware/error-handler';
import { deliveryRepository } from './delivery.repository';
import { DeliveryStateMachine } from './delivery-state-machine';
import { merchantRepository } from '../merchant/merchant.repository';
import { riderRepository } from '../rider/rider.repository';
import { riderEligibilityService } from '../rider/rider-eligibility.service';
import { riderLocationStore } from '../../db/redis';
import { orderEventBroker } from '../realtime/event-broker';
import { orderRepository } from './order.repository';
import { orderStateMachine } from './order-state-machine';
import { riderEarningsService } from '../finance/rider-earnings.service';
import { financialPostingService } from '../finance/financial-posting.service';
import { logger, calculateDistanceMeters } from '@deetoo/utils';
import { randomUUID } from 'crypto';
import { mediaService } from '../media/media.service';

export class DispatchService {
  private dispatchConfig: DispatchConfig = { ...config.dispatch };
  private scheduledTimers = new Map<string, NodeJS.Timeout>();

  public getConfig(): DispatchConfig {
    return { ...this.dispatchConfig };
  }

  public updateConfig(updates: Partial<DispatchConfig>): DispatchConfig {
    this.dispatchConfig = {
      ...this.dispatchConfig,
      ...updates,
    };
    return this.getConfig();
  }

  /**
   * 1. Calculate Dispatch Timing & Intelligent Lead Time
   */
  public calculateDispatchTiming(
    acceptedAt: string | Date,
    prepMinutes: number = 20,
    options?: {
      travelSeconds?: number;
      bufferSeconds?: number;
      now?: Date;
    }
  ): DispatchTimingResult {
    const acceptedMs = new Date(acceptedAt).getTime();
    const prepMs = Math.max(1, prepMinutes) * 60 * 1000;
    const estimatedReadyAt = new Date(acceptedMs + prepMs);

    const travelSec = options?.travelSeconds ?? this.dispatchConfig.expectedRiderPickupTravelTimeSeconds;
    const bufferSec = options?.bufferSeconds ?? this.dispatchConfig.pickupArrivalBufferSeconds;
    const leadTimeMs = (travelSec + bufferSec) * 1000;

    const dispatchNotBefore = new Date(Math.max(acceptedMs, estimatedReadyAt.getTime() - leadTimeMs));
    const now = options?.now ?? new Date();

    const shouldDispatchNow = now.getTime() >= dispatchNotBefore.getTime();
    const reason = shouldDispatchNow
      ? 'Current time has reached or passed dispatch_not_before threshold'
      : `Holding dispatch until ${dispatchNotBefore.toISOString()} to prevent courier kitchen waiting time`;

    return {
      estimatedReadyAt: estimatedReadyAt.toISOString(),
      estimatedRiderTravelSeconds: travelSec,
      pickupArrivalBufferSeconds: bufferSec,
      dispatchNotBefore: dispatchNotBefore.toISOString(),
      shouldDispatchNow,
      reason,
    };
  }

  /**
   * 2. Find and Rank Nearby Eligible Candidates
   */
  public async findAndRankCandidates(
    pickupLocation: GeoPoint,
    radiusMeters: number,
    excludedRiderIds: string[] = []
  ): Promise<DispatchCandidate[]> {
    const pickupLat = pickupLocation.lat ?? pickupLocation.latitude;
    const pickupLng = pickupLocation.lng ?? pickupLocation.longitude;
    if (
      pickupLat === undefined ||
      pickupLng === undefined ||
      !Number.isFinite(pickupLat) ||
      !Number.isFinite(pickupLng) ||
      pickupLat < -90 ||
      pickupLat > 90 ||
      pickupLng < -180 ||
      pickupLng > 180
    ) {
      throw new AppError(
        409,
        'DISPATCH_PICKUP_LOCATION_REQUIRED',
        'Dispatch requires authoritative merchant pickup coordinates',
      );
    }

    // 1. Query nearby available riders in Redis
    const nearbyLocations = await riderLocationStore.findNearbyAvailableRiders({
      latitude: pickupLat,
      longitude: pickupLng,
      radiusMeters,
      limit: this.dispatchConfig.routingCandidateLimit * 2,
    });

    const candidates: DispatchCandidate[] = [];

    for (const item of nearbyLocations) {
      if (excludedRiderIds.includes(item.riderId)) {
        continue;
      }

      // Check active delivery assignment constraint (At most 1 active delivery per rider)
      const hasActive = await deliveryRepository.hasActiveDelivery(item.riderId);
      if (hasActive) {
        continue;
      }

      // Fetch profile and check authoritative eligibility
      const profile = await riderRepository.findProfileById(item.riderId);
      if (!profile) continue;

      if (
        profile.onboardingStatus !== RiderOnboardingStatus.APPROVED ||
        profile.operationalStatus !== RiderOperationalStatus.ACTIVE ||
        profile.workStatus !== RiderWorkStatus.ONLINE_AVAILABLE
      ) {
        continue;
      }

      // Verify operational eligibility
      const eligibility = await riderEligibilityService.isRiderEligibleForDispatch(profile.id);
      if (!eligibility.eligible) {
        continue;
      }

      // Calculate distance & ETA
      const distMeters = item.distanceMeters || Math.round(
        calculateDistanceMeters(
          pickupLat,
          pickupLng,
          item.latitude,
          item.longitude,
          1.0
        )
      );

      // Assume average speed 25 km/h (~7 m/s) in urban traffic
      const estimatedEtaSeconds = Math.max(60, Math.round(distMeters / 7));

      // Multi-factor Scoring:
      // Distance score: 0 - 100 (closer is higher)
      const distanceScore = Math.max(0, Math.round(100 - (distMeters / radiusMeters) * 100));
      // ETA score: 0 - 100 (lower ETA is higher)
      const etaScore = Math.max(0, Math.round(100 - (estimatedEtaSeconds / 900) * 100));
      // Activity & reliability score: 20 pts
      const activityScore = 20;

      const score = Math.round(distanceScore * 0.5 + etaScore * 0.3 + activityScore * 0.2);

      candidates.push({
        riderId: profile.id,
        userId: profile.userId,
        riderName: `${profile.firstName} ${profile.lastName}`.trim(),
        phone: profile.phone,
        vehicleType: profile.vehicleType,
        latitude: item.latitude,
        longitude: item.longitude,
        distanceToPickupMeters: distMeters,
        estimatedPickupEtaSeconds: estimatedEtaSeconds,
        rank: 0,
        score,
        scoreBreakdown: {
          distanceScore,
          etaScore,
          activityScore,
          rejectionPenalty: 0,
        },
      });
    }

    // Sort by score descending (higher score = better rank)
    candidates.sort((a, b) => b.score - a.score || a.distanceToPickupMeters - b.distanceToPickupMeters);

    // Assign rank 1..N
    candidates.forEach((c, idx) => {
      c.rank = idx + 1;
    });

    return candidates.slice(0, this.dispatchConfig.routingCandidateLimit);
  }

  /**
   * 3. Execute Dispatch Cycle for a Delivery
   */
  public async executeDispatchCycle(deliveryId: string): Promise<{
    status: 'OFFERED' | 'NO_CANDIDATES' | 'ALREADY_ASSIGNED' | 'TERMINAL';
    offer?: DeliveryOffer;
    candidatesCount: number;
    searchRadiusMeters: number;
  }> {
    const deliveryLookup = await deliveryRepository.findById(deliveryId);
    if (!deliveryLookup) {
      throw new AppError(404, 'DELIVERY_NOT_FOUND', `Delivery ${deliveryId} not found`);
    }

    // Same lock scope as acceptOffer/rejectOffer: a new dispatch cycle for this delivery (manual
    // trigger, cascading rejection, or the scheduled sweep) must not interleave with a rider
    // accepting or rejecting the offer this cycle is about to read or replace. Re-read after
    // acquiring the lock, since a concurrent transaction may have committed a change while this
    // one was blocked waiting.
    await lockCommand(`delivery-offer:${deliveryId}`);
    const delivery = await deliveryRepository.findById(deliveryId);
    if (!delivery) {
      throw new AppError(404, 'DELIVERY_NOT_FOUND', `Delivery ${deliveryId} not found`);
    }

    await requirePaidOrder(delivery.order_id, true);

    if (
      delivery.status === DeliveryStatus.ASSIGNED ||
      delivery.status === DeliveryStatus.ARRIVED_PICKUP ||
      delivery.status === DeliveryStatus.PICKED_UP ||
      delivery.status === DeliveryStatus.EN_ROUTE ||
      delivery.status === DeliveryStatus.ARRIVED_DROPOFF
    ) {
      return {
        status: 'ALREADY_ASSIGNED',
        candidatesCount: 0,
        searchRadiusMeters: delivery.current_search_radius_meters,
      };
    }

    if (
      delivery.status === DeliveryStatus.DELIVERED ||
      delivery.status === DeliveryStatus.CANCELLED ||
      delivery.status === DeliveryStatus.FAILED
    ) {
      // FAILED is reachable from custody-holding states (PICKED_UP, EN_ROUTE, ARRIVED_DROPOFF) as
      // well as pre-pickup ones, and the state machine legally allows FAILED -> UNASSIGNED "after
      // operational review" (packages/types delivery transition table). Nothing before this
      // change enforced that review: any caller of executeDispatchCycle -- including the
      // ADMIN/OPS manual dispatch-trigger endpoint -- could resume offering a FAILED delivery to
      // riders while its record still showed FAILED with dispatch_attention_required=true,
      // silently bypassing the incident review that flag exists to force (audit A60). Automatic
      // and manual-trigger dispatch cycles alike now stop here; the only way back into dispatch is
      // the explicit, audited DeliveryRepository.atomicUnassign reset (admin.router.ts's manual
      // unassign action, which already supports an optional immediate retriggerDispatch), which
      // requires an actor and a reason code and moves the record to UNASSIGNED before any new
      // offer round begins.
      return {
        status: 'TERMINAL',
        candidatesCount: 0,
        searchRadiusMeters: delivery.current_search_radius_meters,
      };
    }

    // Check if there is already an active pending offer for this delivery
    const existingActiveOffer = await deliveryRepository.findActiveOfferByDeliveryId(deliveryId);
    if (existingActiveOffer) {
      return {
        status: 'OFFERED',
        offer: existingActiveOffer,
        candidatesCount: 1,
        searchRadiusMeters: delivery.current_search_radius_meters,
      };
    }

    // Find riders who have already rejected this delivery
    const pastOffers = await deliveryRepository.getOffersByDeliveryId(deliveryId);
    const rejectedRiderIds = pastOffers
      .filter((o) => o.status === DeliveryOfferStatus.REJECTED || o.status === DeliveryOfferStatus.EXPIRED)
      .map((o) => o.rider_id);

    // Progressive radius search expansion steps
    const radiusSteps = this.dispatchConfig.radiusExpansionSteps;
    let chosenCandidates: DispatchCandidate[] = [];
    let matchedRadius = radiusSteps[0];

    for (const radius of radiusSteps) {
      matchedRadius = radius;
      const candidates = await this.findAndRankCandidates(
        delivery.pickup_location,
        radius,
        rejectedRiderIds
      );
      if (candidates.length > 0) {
        chosenCandidates = candidates;
        break;
      }
    }

    const cycleCount = (delivery.dispatch_cycle_count || 0) + 1;
    const now = new Date().toISOString();

    // Record attempt
    const attempt: DispatchAttempt = {
      id: randomUUID(),
      delivery_id: deliveryId,
      attempt_number: cycleCount,
      search_radius_meters: matchedRadius,
      candidate_count: chosenCandidates.length,
      candidates_snapshot: chosenCandidates,
      started_at: now,
      result: chosenCandidates.length > 0 ? 'OFFERED' : 'NO_CANDIDATES',
    };
    await deliveryRepository.recordAttempt(attempt);

    if (chosenCandidates.length === 0) {
      // Check SLA Escalation
      const createdMs = new Date(delivery.created_at).getTime();
      const ageSeconds = Math.round((Date.now() - createdMs) / 1000);
      const isSlaBreached = ageSeconds >= this.dispatchConfig.dispatchSlaSeconds;

      await deliveryRepository.updateDelivery(
        deliveryId,
        {
          status: DeliveryStatus.UNASSIGNED,
          current_search_radius_meters: matchedRadius,
          dispatch_cycle_count: cycleCount,
          dispatch_attention_required: isSlaBreached,
          attention_reason: isSlaBreached ? 'DISPATCH_SLA_EXCEEDED_NO_RIDERS' : 'NO_AVAILABLE_RIDERS',
        },
        {
          delivery_id: deliveryId,
          from_status: delivery.status,
          to_status: DeliveryStatus.UNASSIGNED,
          actor_type: 'SYSTEM',
          action: 'DISPATCH_CYCLE_EXHAUSTED',
          reason_code: isSlaBreached ? 'SLA_BREACH' : 'NO_CANDIDATES',
          note: `No eligible couriers within ${matchedRadius}m radius. Cycle ${cycleCount}.`,
        }
      );

      // Publish notification to admin dispatch channel
      await this.publishRealtimeEvent('admin:dispatch', 'dispatch.no_candidates', {
        deliveryId,
        orderId: delivery.order_id,
        matchedRadius,
        cycleCount,
        isSlaBreached,
      });

      return {
        status: 'NO_CANDIDATES',
        candidatesCount: 0,
        searchRadiusMeters: matchedRadius,
      };
    }

    // Top ranked candidate gets the offer
    const topCandidate = chosenCandidates[0];
    const expiresAt = new Date(Date.now() + this.dispatchConfig.offerTimeoutSeconds * 1000).toISOString();

    const offer = await deliveryRepository.createOffer({
      id: randomUUID(),
      delivery_id: deliveryId,
      order_id: delivery.order_id,
      order_number: delivery.order_number,
      rider_id: topCandidate.riderId,
      rider_name: topCandidate.riderName,
      status: DeliveryOfferStatus.OFFERED,
      rank: 1,
      score: topCandidate.score,
      distance_to_pickup_meters: topCandidate.distanceToPickupMeters,
      estimated_pickup_eta_seconds: topCandidate.estimatedPickupEtaSeconds,
      offered_at: now,
      expires_at: expiresAt,
      created_at: now,
      updated_at: now,
    });

    // Update delivery status to OFFERED
    await deliveryRepository.updateDelivery(
      deliveryId,
      {
        status: DeliveryStatus.OFFERED,
        current_search_radius_meters: matchedRadius,
        dispatch_cycle_count: cycleCount,
        dispatch_started_at: delivery.dispatch_started_at || now,
        dispatch_attention_required: false,
        attention_reason: null,
      },
      {
        delivery_id: deliveryId,
        from_status: delivery.status,
        to_status: DeliveryStatus.OFFERED,
        actor_type: 'SYSTEM',
        actor_id: topCandidate.riderId,
        actor_name: topCandidate.riderName,
        action: 'OFFER_SENT_TO_RIDER',
        note: `Offer dispatched to courier ${topCandidate.riderName} (${topCandidate.distanceToPickupMeters}m away)`,
      }
    );

    // Publish offer event to specific rider channel
    await this.publishRealtimeEvent(`rider:${topCandidate.userId}`, 'delivery.offer.created', {
      offerId: offer.id,
      deliveryId: delivery.id,
      orderId: delivery.order_id,
      orderNumber: delivery.order_number,
      pickupAddress: delivery.pickup_address_text,
      pickupLocation: delivery.pickup_location,
      dropoffAddress: delivery.dropoff_address_text,
      dropoffLocation: delivery.dropoff_location,
      distanceToPickupMeters: topCandidate.distanceToPickupMeters,
      estimatedPickupEtaSeconds: topCandidate.estimatedPickupEtaSeconds,
      expiresAt,
      timeoutSeconds: this.dispatchConfig.offerTimeoutSeconds,
    });

    logger.info('Dispatched delivery offer to rider', {
      service: 'dispatch-engine',
      metadata: {
        deliveryId,
        offerId: offer.id,
        riderId: topCandidate.riderId,
        riderUserId: topCandidate.userId,
        rank: topCandidate.rank,
        score: topCandidate.score,
        radius: matchedRadius,
      },
    });

    return {
      status: 'OFFERED',
      offer,
      candidatesCount: chosenCandidates.length,
      searchRadiusMeters: matchedRadius,
    };
  }

  /**
   * 4. Courier Accepts Delivery Offer
   */
  public async acceptOffer(offerId: string, riderUserId: string): Promise<Delivery> {
    const offerLookup = await deliveryRepository.findOfferById(offerId);
    if (!offerLookup) {
      throw new AppError(404, 'OFFER_NOT_FOUND', 'Delivery offer not found');
    }

    // Acquire the lock before any status/expiry/assignment check, keyed on the delivery rather
    // than the offer, so this also serializes against a concurrent rejectOffer or
    // executeDispatchCycle for the same delivery -- not only a second acceptOffer racing this
    // one. A concurrent transaction blocks here until this one commits or rolls back, then
    // re-reads current state rather than acting on what it saw before waiting (audit A58: the
    // prior check-then-act sequence had no lock at all, so two concurrent accepts on the same
    // still-"OFFERED" row could both pass every check and both write).
    await lockCommand(`delivery-offer:${offerLookup.delivery_id}`);
    const offer = await deliveryRepository.findOfferById(offerId);
    if (!offer) {
      throw new AppError(404, 'OFFER_NOT_FOUND', 'Delivery offer not found');
    }

    if (offer.status !== DeliveryOfferStatus.OFFERED) {
      throw new AppError(409, 'OFFER_NOT_PENDING', `Offer is already ${offer.status}`);
    }

    if (new Date(offer.expires_at).getTime() < Date.now()) {
      await deliveryRepository.updateOfferStatus(offerId, DeliveryOfferStatus.EXPIRED);
      throw new AppError(410, 'OFFER_EXPIRED', 'Delivery offer has expired');
    }

    const riderProfile = await riderRepository.findProfileByUserId(riderUserId);
    if (!riderProfile || riderProfile.id !== offer.rider_id) {
      throw new AppError(403, 'OFFER_NOT_ASSIGNED', 'This offer was not addressed to your account');
    }

    // The delivery-scoped lock above does not stop the same rider from accepting two different
    // delivery offers concurrently (each holds a different delivery lock). This second lock,
    // scoped to the rider, closes that: acquired after the delivery lock in both racing calls, so
    // ordering stays consistent between them and cannot deadlock.
    await lockCommand(`rider-assignment:${riderProfile.id}`);

    const offeredDelivery = await deliveryRepository.findById(offer.delivery_id);
    if (!offeredDelivery) throw new AppError(404, 'DELIVERY_NOT_FOUND', 'Delivery not found');
    await requirePaidOrder(offeredDelivery.order_id, true);
    // 1. Concurrency-safe atomic assign
    const assignedDelivery = await deliveryRepository.atomicAssign(
      offer.delivery_id,
      riderProfile.id,
      `${riderProfile.firstName} ${riderProfile.lastName}`.trim(),
      riderProfile.phone
    );

    // 2. Mark offer as accepted
    await deliveryRepository.updateOfferStatus(offerId, DeliveryOfferStatus.ACCEPTED, new Date().toISOString());

    // 3. Cancel competing offers for this delivery
    await deliveryRepository.cancelCompetingOffers(offer.delivery_id, offerId);

    // 4. Transition rider work status to BUSY
    await riderRepository.updateWorkStatus(riderProfile.id, RiderWorkStatus.BUSY);

    // 5. Emit real-time events across multi-channel mesh
    const eventPayload = {
      deliveryId: assignedDelivery.id,
      orderId: assignedDelivery.order_id,
      status: DeliveryStatus.ASSIGNED,
      riderId: riderProfile.id,
      riderName: `${riderProfile.firstName} ${riderProfile.lastName}`.trim(),
      riderPhone: riderProfile.phone,
      assignedAt: assignedDelivery.assigned_at,
    };

    await this.publishRealtimeEvent(`order:${assignedDelivery.order_id}`, 'delivery.assigned', eventPayload);
    await this.publishRealtimeEvent(`customer:${assignedDelivery.customer_id}`, 'delivery.assigned', eventPayload);
    await this.publishRealtimeEvent(`merchant-branch:${assignedDelivery.branch_id}`, 'delivery.assigned', eventPayload);
    await this.publishRealtimeEvent(`rider:${riderUserId}`, 'delivery.assigned', eventPayload);
    await this.publishRealtimeEvent('admin:dispatch', 'delivery.assigned', eventPayload);

    await this.notifyCustomer(assignedDelivery.customer_id, assignedDelivery.order_id, 'RIDER_ASSIGNED', 'A rider has been assigned to your order', { riderName: eventPayload.riderName });

    logger.info('Delivery successfully assigned to rider', {
      service: 'dispatch-engine',
      metadata: {
        deliveryId: assignedDelivery.id,
        riderId: riderProfile.id,
        orderId: assignedDelivery.order_id,
      },
    });

    return assignedDelivery;
  }

  /**
   * 5. Courier Rejects Delivery Offer
   */
  public async rejectOffer(
    offerId: string,
    riderUserId: string,
    reasonCode: string = 'OTHER',
    note?: string
  ): Promise<{ rejected: boolean; nextStatus: string }> {
    const offerLookup = await deliveryRepository.findOfferById(offerId);
    if (!offerLookup) {
      throw new AppError(404, 'OFFER_NOT_FOUND', 'Delivery offer not found');
    }

    // Same lock scope as acceptOffer/executeDispatchCycle: a reject racing an accept for the
    // same delivery must not interleave with it. Re-read after acquiring the lock, since a
    // concurrent transaction may have committed a change while this one was blocked waiting.
    await lockCommand(`delivery-offer:${offerLookup.delivery_id}`);
    const offer = await deliveryRepository.findOfferById(offerId);
    if (!offer) {
      throw new AppError(404, 'OFFER_NOT_FOUND', 'Delivery offer not found');
    }

    const riderProfile = await riderRepository.findProfileByUserId(riderUserId);
    if (!riderProfile || riderProfile.id !== offer.rider_id) {
      throw new AppError(403, 'OFFER_NOT_ASSIGNED', 'This offer was not addressed to your account');
    }

    if (offer.status !== DeliveryOfferStatus.OFFERED) {
      return { rejected: false, nextStatus: offer.status };
    }

    // Mark offer rejected
    await deliveryRepository.updateOfferStatus(
      offerId,
      DeliveryOfferStatus.REJECTED,
      new Date().toISOString(),
      reasonCode,
      note
    );

    // Record timeline entry on delivery
    await deliveryRepository.recordTimelineEntry({
      id: randomUUID(),
      delivery_id: offer.delivery_id,
      from_status: DeliveryStatus.OFFERED,
      to_status: DeliveryStatus.UNASSIGNED,
      actor_type: 'RIDER',
      actor_id: riderProfile.id,
      actor_name: `${riderProfile.firstName} ${riderProfile.lastName}`.trim(),
      action: 'OFFER_REJECTED',
      reason_code: reasonCode,
      note: note || `Rider declined offer with reason: ${reasonCode}`,
      created_at: new Date().toISOString(),
    });

    // Cascading dispatch: immediately evaluate next candidate!
    const nextCycle = await this.executeDispatchCycle(offer.delivery_id);

    return {
      rejected: true,
      nextStatus: nextCycle.status,
    };
  }

  /**
   * 6. Courier Updates Delivery Status (In-Flight Milestones)
   */
  public async updateDeliveryStatus(
    deliveryId: string,
    riderUserId: string,
    targetStatus: DeliveryStatus,
    options?: {
      reasonCode?: string;
      note?: string;
      proofType?: string;
      proofRef?: string;
      currentCoordinates?: GeoPoint;
    }
  ): Promise<Delivery> {
    const delivery = await deliveryRepository.findById(deliveryId);
    if (!delivery) {
      throw new AppError(404, 'DELIVERY_NOT_FOUND', 'Delivery not found');
    }

    const riderProfile = await riderRepository.findProfileByUserId(riderUserId);
    if (!riderProfile || delivery.assigned_rider_id !== riderProfile.id) {
      throw new AppError(403, 'FORBIDDEN_DELIVERY', 'You are not the assigned courier for this delivery');
    }

    // Validate transition with state machine
    const transition = DeliveryStateMachine.transition(delivery.status, deliveryId, {
      targetStatus,
      actorType: 'RIDER',
      actorId: riderProfile.id,
      actorName: `${riderProfile.firstName} ${riderProfile.lastName}`.trim(),
      reasonCode: options?.reasonCode,
      note: options?.note,
      metadata: {
        proofType: options?.proofType,
        proofRef: options?.proofRef,
        coordinates: options?.currentCoordinates,
      },
    });

    const updated = await deliveryRepository.updateDelivery(
      deliveryId,
      transition.updatedFields,
      transition.timelineEntry
    );

    if (targetStatus === DeliveryStatus.PICKED_UP) {
      await this.notifyCustomer(updated.customer_id, updated.order_id, 'ORDER_PICKED_UP', 'Your order has been picked up and is on its way');
    }
    if (targetStatus === DeliveryStatus.DELIVERED) {
      await this.notifyCustomer(updated.customer_id, updated.order_id, 'ORDER_DELIVERED', 'Your order has been delivered');
    }

    // If completed/delivered:
    if (targetStatus === DeliveryStatus.DELIVERED) {
      // Free up rider work status
      await riderRepository.updateWorkStatus(riderProfile.id, RiderWorkStatus.ONLINE_AVAILABLE);

      // Transition order to COMPLETED
      try {
        const order = await orderRepository.findById(delivery.order_id);
        if (order && order.status !== OrderStatus.COMPLETED) {
          const orderTransition = orderStateMachine.transition(order, {
            targetStatus: OrderStatus.COMPLETED,
            actorType: 'SYSTEM',
            actorName: 'Dispatch Engine',
            note: `Delivery confirmed completed by courier ${riderProfile.firstName}`,
          });

          await orderRepository.updateOrderStatus(
            order.id,
            orderTransition.newStatus,
            orderTransition.updatedOrderFields,
            orderTransition.timelineEntry
          );

          await this.publishRealtimeEvent(`order:${order.id}`, 'order.completed', {
            order_id: order.id,
            order_number: order.order_number,
            status: OrderStatus.COMPLETED,
            completed_at: new Date().toISOString(),
          });
        }
      } catch (err) {
        logger.error('Failed to transition order to COMPLETED upon delivery', {
          service: 'dispatch-engine',
          error: (err as Error).message,
        });
      }

      // Calculate courier earnings and post to double-entry ledger (Sprint 12)
      try {
        const distanceMeters =
          delivery.pickup_location && delivery.dropoff_location
            ? calculateDistanceMeters(
                delivery.pickup_location.latitude,
                delivery.pickup_location.longitude,
                delivery.dropoff_location.latitude,
                delivery.dropoff_location.longitude
              )
            : 3200;

        const earning = await riderEarningsService.calculateAndRecordEarning({
          riderId: riderProfile.id,
          deliveryId: delivery.id,
          orderId: delivery.order_id,
          distanceMeters,
        });
        await financialPostingService.postRiderEarning(earning);
      } catch (finErr) {
        logger.error('Failed to post rider earnings to financial ledger', {
          error: finErr,
        });
      }
    }

    // Publish multi-channel status update
    const eventPayload = {
      deliveryId,
      orderId: delivery.order_id,
      status: targetStatus,
      riderId: riderProfile.id,
      timestamp: new Date().toISOString(),
    };

    await this.publishRealtimeEvent(`order:${delivery.order_id}`, `delivery.${targetStatus.toLowerCase()}`, eventPayload);
    await this.publishRealtimeEvent(`customer:${delivery.customer_id}`, `delivery.${targetStatus.toLowerCase()}`, eventPayload);
    await this.publishRealtimeEvent(`merchant-branch:${delivery.branch_id}`, `delivery.${targetStatus.toLowerCase()}`, eventPayload);
    await this.publishRealtimeEvent('admin:dispatch', `delivery.${targetStatus.toLowerCase()}`, eventPayload);

    return updated;
  }

  // ==========================================
  // Sprint 10 Dedicated Lifecycle Methods
  // ==========================================

  /**
   * Rider arrives at restaurant/merchant pickup location
   */
  public async riderArrivePickup(
    deliveryId: string,
    riderUserId: string,
    options?: { latitude?: number; longitude?: number; accuracy_meters?: number; override_reason?: string }
  ): Promise<Delivery> {
    const riderProfile = await riderRepository.findProfileByUserId(riderUserId);
    if (riderProfile && options?.latitude !== undefined && options?.longitude !== undefined) {
      await riderLocationStore.updateLocation(riderProfile.id, {
        latitude: options.latitude,
        longitude: options.longitude,
        accuracyMeters: options.accuracy_meters || 10,
        recordedAt: new Date().toISOString(),
      });
    }

    return await this.updateDeliveryStatus(deliveryId, riderUserId, DeliveryStatus.ARRIVED_PICKUP, {
      note: options?.override_reason || 'Courier arrived at merchant pickup',
      currentCoordinates:
        options?.latitude !== undefined && options?.longitude !== undefined
          ? {
              lat: options.latitude,
              lng: options.longitude,
              latitude: options.latitude,
              longitude: options.longitude,
            }
          : undefined,
    });
  }

  /**
   * Rider confirms order pickup with optional kitchen verification code check
   */
  public async riderConfirmPickup(
    deliveryId: string,
    riderUserId: string,
    options?: { pickup_verification_code?: string; verification_code?: string; note?: string }
  ): Promise<Delivery> {
    const delivery = await deliveryRepository.findById(deliveryId);
    if (!delivery) {
      throw new AppError(404, 'DELIVERY_NOT_FOUND', 'Delivery not found');
    }

    const order = await orderRepository.findById(delivery.order_id);
    if (!order || order.status !== OrderStatus.READY) {
      throw new AppError(
        409,
        'ORDER_NOT_READY_FOR_PICKUP',
        'Pickup can only be confirmed after the merchant marks the paid order READY',
        { orderStatus: order?.status || 'MISSING' },
      );
    }

    const inputCode = options?.pickup_verification_code || options?.verification_code;
    // pickup_verification_code is always generated at delivery creation (delivery.repository.ts
    // COALESCE), so a delivery with none on file is a data problem, not a legitimate skip -- and
    // omitting the code in the request must never be treated as "nothing to check" (audit A62).
    if (!delivery.pickup_verification_code) {
      throw new AppError(409, 'PICKUP_CODE_MISSING', 'No pickup verification code is on file for this delivery');
    }
    if (!inputCode || inputCode.trim().toUpperCase() !== delivery.pickup_verification_code.trim().toUpperCase()) {
      throw new AppError(400, 'INVALID_PICKUP_CODE', 'Pickup verification code does not match order requirement');
    }

    return await this.updateDeliveryStatus(deliveryId, riderUserId, DeliveryStatus.PICKED_UP, {
      note: options?.note || 'Courier confirmed pickup from kitchen',
    });
  }

  /**
   * Rider starts en-route delivery trip towards customer dropoff
   */
  public async riderStartTrip(deliveryId: string, riderUserId: string): Promise<Delivery> {
    return await this.updateDeliveryStatus(deliveryId, riderUserId, DeliveryStatus.EN_ROUTE, {
      note: 'Courier is en route to customer dropoff',
    });
  }

  /**
   * Rider arrives at customer dropoff destination
   */
  public async riderArriveDropoff(
    deliveryId: string,
    riderUserId: string,
    options?: { latitude?: number; longitude?: number; accuracy_meters?: number; override_reason?: string }
  ): Promise<Delivery> {
    const riderProfile = await riderRepository.findProfileByUserId(riderUserId);
    if (riderProfile && options?.latitude !== undefined && options?.longitude !== undefined) {
      await riderLocationStore.updateLocation(riderProfile.id, {
        latitude: options.latitude,
        longitude: options.longitude,
        accuracyMeters: options.accuracy_meters || 10,
        recordedAt: new Date().toISOString(),
      });
    }

    return await this.updateDeliveryStatus(deliveryId, riderUserId, DeliveryStatus.ARRIVED_DROPOFF, {
      note: options?.override_reason || 'Courier arrived at customer dropoff',
      currentCoordinates:
        options?.latitude !== undefined && options?.longitude !== undefined
          ? {
              lat: options.latitude,
              lng: options.longitude,
              latitude: options.latitude,
              longitude: options.longitude,
            }
          : undefined,
    });
  }

  /**
   * Rider completes delivery with Proof-of-Delivery (OTP, Photo, Signature, Contactless)
   */
  public async riderCompleteDelivery(
    deliveryId: string,
    riderUserId: string,
    options: {
      proof_type: DeliveryProofType;
      otp?: string;
      verification_code?: string;
      photo_media_id?: string;
      photo_url?: string;
      signature_data?: string;
      note?: string;
      latitude?: number;
      longitude?: number;
    }
  ): Promise<Delivery> {
    const delivery = await deliveryRepository.findById(deliveryId);
    if (!delivery) {
      throw new AppError(404, 'DELIVERY_NOT_FOUND', 'Delivery not found');
    }

    const riderProfile = await riderRepository.findProfileByUserId(riderUserId);
    if (!riderProfile || delivery.assigned_rider_id !== riderProfile.id) {
      throw new AppError(403, 'FORBIDDEN_DELIVERY', 'You are not the assigned courier for this delivery');
    }

    const proofType: DeliveryProofType = options.proof_type || 'OTP';
    let proofValue: string | undefined;
    let storageUrl: string | undefined;
    const proofMetadata: Record<string, unknown> = { note: options.note };

    if (proofType === 'OTP') {
      const inputOtp = (options.otp || options.verification_code || '').trim();
      if (delivery.delivery_otp_locked) {
        throw new AppError(
          423,
          'DELIVERY_OTP_LOCKED',
          'Delivery OTP verification is locked due to 5 failed attempts. Please contact dispatch operations for manual override.'
        );
      }

      const expectedOtp = (delivery.delivery_otp || '').trim();
      if (!expectedOtp || !inputOtp || inputOtp !== expectedOtp) {
        const attempts = (delivery.delivery_otp_attempts || 0) + 1;
        const isLocked = attempts >= 5;
        await deliveryRepository.updateDelivery(deliveryId, {
          delivery_otp_attempts: attempts,
          delivery_otp_locked: isLocked,
          dispatch_attention_required: isLocked,
          attention_reason: isLocked ? 'Delivery OTP locked after 5 failed attempts' : undefined,
        });

        throw new AppError(
          400,
          'INVALID_DELIVERY_OTP',
          isLocked
            ? 'Incorrect OTP. Maximum attempts exceeded. Verification locked.'
            : `Incorrect OTP. ${5 - attempts} attempts remaining.`
        );
      }

      proofValue = 'OTP_VERIFIED';
      proofMetadata.verified = true;
    } else if (proofType === 'PHOTO') {
      if (!options.photo_media_id) {
        throw new AppError(
          400,
          'PHOTO_PROOF_REQUIRED',
          'A verified private media upload is required for PHOTO proof of delivery',
        );
      }
      const media = await mediaService.assertVerifiedOwnedMedia(
        options.photo_media_id,
        riderUserId,
        'DELIVERY_PROOF',
        deliveryId,
      );
      storageUrl = `s3://${media.bucket}/${media.object_key}`;
      proofMetadata.mediaObjectId = media.id;
    } else if (proofType === 'SIGNATURE') {
      if (!options.signature_data) {
        throw new AppError(400, 'SIGNATURE_PROOF_REQUIRED', 'Signature data is required for SIGNATURE proof of delivery');
      }
      // Store the actual signature payload as the proof of record, not a placeholder plus its
      // byte count -- a dispute needs evidence to inspect, not a number (audit-flagged gap).
      // A floor, not a format check: this cannot confirm the payload is a genuine signature
      // image/stroke-path rather than arbitrary bytes, only that it isn't trivially empty.
      if (options.signature_data.trim().length < 50) {
        throw new AppError(400, 'SIGNATURE_PROOF_TOO_SHORT', 'Signature data is too short to be a genuine signature capture');
      }
      proofValue = options.signature_data;
      proofMetadata.signatureLength = options.signature_data.length;
    } else if (proofType === 'CONTACTLESS_CONFIRMATION') {
      proofValue = 'CONTACTLESS';
    }

    // Persist Proof of Delivery Record
    await deliveryRepository.createProof({
      delivery_id: deliveryId,
      type: proofType,
      proof_value: proofValue,
      storage_url: storageUrl,
      media_object_id: proofType === 'PHOTO' ? options.photo_media_id : undefined,
      metadata: proofMetadata,
      created_by_rider_id: riderProfile.id,
    });

    return await this.updateDeliveryStatus(deliveryId, riderUserId, DeliveryStatus.DELIVERED, {
      proofType,
      proofRef: proofValue || storageUrl,
      note: options.note || `Delivery completed with ${proofType} proof`,
      currentCoordinates:
        options.latitude !== undefined && options.longitude !== undefined
          ? {
              lat: options.latitude,
              lng: options.longitude,
              latitude: options.latitude,
              longitude: options.longitude,
            }
          : undefined,
    });
  }

  /**
   * Rider marks delivery as failed with failure reason and opens incident
   */
  public async riderFailDelivery(
    deliveryId: string,
    riderUserId: string,
    options: {
      reason_code: string;
      note: string;
      photo_url?: string;
    }
  ): Promise<Delivery> {
    const delivery = await deliveryRepository.findById(deliveryId);
    if (!delivery) {
      throw new AppError(404, 'DELIVERY_NOT_FOUND', 'Delivery not found');
    }

    const riderProfile = await riderRepository.findProfileByUserId(riderUserId);
    if (!riderProfile || delivery.assigned_rider_id !== riderProfile.id) {
      throw new AppError(403, 'FORBIDDEN_DELIVERY', 'You are not assigned to this delivery');
    }

    // 1. Create incident report
    const incident = await deliveryRepository.createIncident({
      delivery_id: deliveryId,
      order_id: delivery.order_id,
      rider_id: riderProfile.id,
      reason_code: options.reason_code,
      note: options.note,
      status: 'OPEN',
      reported_by_type: 'RIDER',
      reported_by_id: riderProfile.id,
    });

    // 2. If photo proof of failure provided:
    if (options.photo_url) {
      await deliveryRepository.createProof({
        delivery_id: deliveryId,
        type: 'PHOTO',
        storage_url: options.photo_url,
        created_by_rider_id: riderProfile.id,
        metadata: { incident_id: incident.id, reason_code: options.reason_code },
      });
    }

    // 3. Update delivery to FAILED and flag attention
    await this.updateDeliveryStatus(deliveryId, riderUserId, DeliveryStatus.FAILED, {
      reasonCode: options.reason_code,
      note: options.note,
    });

    const finalDelivery = await deliveryRepository.updateDelivery(deliveryId, {
      dispatch_attention_required: true,
      attention_reason: `Delivery failed by courier: ${options.reason_code}`,
      failed_at: new Date().toISOString(),
      failure_reason: options.reason_code,
      failure_note: options.note,
    });

    // 4. Preserve custody after pickup. A rider holding an undelivered order remains BUSY
    // until Ops resolves the incident. Pre-pickup failures can safely release the rider.
    if (delivery.picked_up_at || [
      DeliveryStatus.PICKED_UP,
      DeliveryStatus.EN_ROUTE,
      DeliveryStatus.ARRIVED_DROPOFF,
    ].includes(delivery.status)) {
      await riderRepository.updateWorkStatus(riderProfile.id, RiderWorkStatus.BUSY);
    } else {
      await riderRepository.updateWorkStatus(riderProfile.id, RiderWorkStatus.ONLINE_AVAILABLE);
    }

    // 5. Broadcast incident alert to Admin/Ops
    await this.publishRealtimeEvent('admin:dispatch', 'delivery.incident_reported', {
      deliveryId,
      orderId: delivery.order_id,
      incidentId: incident.id,
      reasonCode: options.reason_code,
      note: options.note,
      riderId: riderProfile.id,
    });

    return finalDelivery;
  }

  /**
   * Admin / Operations: Force completes a stuck or verified delivery
   */
  public async adminForceCompleteDelivery(
    deliveryId: string,
    adminUserId: string,
    adminName: string,
    reason: string,
    note?: string
  ): Promise<Delivery> {
    const delivery = await deliveryRepository.findById(deliveryId);
    if (!delivery) {
      throw new AppError(404, 'DELIVERY_NOT_FOUND', 'Delivery not found');
    }

    // Transition delivery via state machine
    const transition = DeliveryStateMachine.transition(delivery.status, deliveryId, {
      targetStatus: DeliveryStatus.DELIVERED,
      actorType: 'ADMIN',
      actorId: adminUserId,
      actorName: adminName,
      reasonCode: reason,
      note: note || 'Operations administrative force completion',
    });

    const updated = await deliveryRepository.updateDelivery(
      deliveryId,
      {
        ...transition.updatedFields,
        dispatch_attention_required: false,
        attention_reason: null,
        stuck_flag: null,
      },
      transition.timelineEntry
    );

    // If a rider was assigned, free them up
    if (delivery.assigned_rider_id) {
      await riderRepository.updateWorkStatus(delivery.assigned_rider_id, RiderWorkStatus.ONLINE_AVAILABLE);
    }

    // Complete the Order
    try {
      const order = await orderRepository.findById(delivery.order_id);
      if (order && order.status !== OrderStatus.COMPLETED) {
        const orderTransition = orderStateMachine.transition(order, {
          targetStatus: OrderStatus.COMPLETED,
          actorType: 'ADMIN',
          actorId: adminUserId,
          actorName: adminName,
          note: `Force-completed by admin: ${reason}`,
        });

        await orderRepository.updateOrderStatus(
          order.id,
          orderTransition.newStatus,
          orderTransition.updatedOrderFields,
          orderTransition.timelineEntry
        );
      }
    } catch {
      // Non-blocking
    }

    // Create audit proof
    await deliveryRepository.createProof({
      delivery_id: deliveryId,
      type: 'CONTACTLESS_CONFIRMATION',
      proof_value: 'ADMIN_OVERRIDE',
      metadata: { adminUserId, adminName, reason, note },
    });

    const eventPayload = {
      deliveryId,
      orderId: delivery.order_id,
      status: DeliveryStatus.DELIVERED,
      adminUserId,
      reason,
      timestamp: new Date().toISOString(),
    };

    await this.publishRealtimeEvent(`order:${delivery.order_id}`, 'delivery.delivered', eventPayload);
    await this.publishRealtimeEvent(`customer:${delivery.customer_id}`, 'delivery.delivered', eventPayload);
    await this.publishRealtimeEvent(`merchant-branch:${delivery.branch_id}`, 'delivery.delivered', eventPayload);
    await this.publishRealtimeEvent('admin:dispatch', 'delivery.delivered', eventPayload);

    return updated;
  }

  /**
   * Admin / Operations: Resolves a reported delivery incident
   */
  public async adminResolveIncident(
    incidentId: string,
    adminUserId: string,
    action: string,
    note?: string
  ): Promise<DeliveryIncident> {
    const resolved = await deliveryRepository.resolveIncident(incidentId, {
      resolved_by_id: adminUserId,
      resolution_action: action,
      note,
    });
    if (!resolved) {
      throw new AppError(404, 'INCIDENT_NOT_FOUND', 'Incident not found');
    }
    return resolved;
  }

  /**
   * Secure view of delivery details for the assigned Rider
   */
  public async getRiderDeliveryDetail(deliveryId: string, riderUserId: string): Promise<RiderDeliveryDetail> {
    const delivery = await deliveryRepository.findById(deliveryId);
    if (!delivery) {
      throw new AppError(404, 'DELIVERY_NOT_FOUND', 'Delivery not found');
    }

    const riderProfile = await riderRepository.findProfileByUserId(riderUserId);
    if (!riderProfile || delivery.assigned_rider_id !== riderProfile.id) {
      throw new AppError(403, 'FORBIDDEN_DELIVERY', 'You are not the assigned courier for this delivery');
    }

    if ([DeliveryStatus.DELIVERED,DeliveryStatus.CANCELLED].includes(delivery.status)) {
      throw new AppError(403,'DELIVERY_ACCESS_ENDED','Private delivery details are available only during fulfilment');
    }
    const order = await orderRepository.findById(delivery.order_id);

    const pickupLat = delivery.pickup_location.latitude ?? delivery.pickup_location.lat;
    const pickupLng = delivery.pickup_location.longitude ?? delivery.pickup_location.lng;
    const dropoffLat = delivery.dropoff_location.latitude ?? delivery.dropoff_location.lat;
    const dropoffLng = delivery.dropoff_location.longitude ?? delivery.dropoff_location.lng;

    const itemsSummary = {
      itemCount: order?.items?.length || 0,
      items: (order?.items || []).map((i) => ({ name: i.item_name, quantity: i.quantity })),
    };

    return {
      deliveryId: delivery.id,
      orderId: delivery.order_id,
      orderNumber: delivery.order_number || order?.order_number || delivery.id.slice(0, 8),
      publicCode: order?.public_code || delivery.pickup_verification_code || '0000',
      status: delivery.status,
      pickup: {
        name: delivery.branch_name || order?.branch_name || 'Restaurant Branch',
        address: delivery.pickup_address_text,
        location: delivery.pickup_location,
        instructions: null,
        phoneProxy: '+254 700 000 000 ext 101',
        itemsSummary,
        isReady: order?.status === OrderStatus.READY || order?.status === OrderStatus.COMPLETED,
      },
      dropoff: {
        recipientName: delivery.customer_name || order?.delivery_address_snapshot?.recipient_name || 'Customer',
        address: delivery.dropoff_address_text,
        location: delivery.dropoff_location,
        instructions: delivery.delivery_instructions,
        phoneProxy: '+254 700 000 000 ext 202',
      },
      pickupVerificationCode: delivery.pickup_verification_code || (order?.public_code ? order.public_code.slice(-4) : '1234'),
      navigation: {
        pickupMapsUrl: `https://www.google.com/maps/dir/?api=1&destination=${pickupLat},${pickupLng}`,
        dropoffMapsUrl: `https://www.google.com/maps/dir/?api=1&destination=${dropoffLat},${dropoffLng}`,
      },
      proofRequirements: {
        otpRequired: true,
        photoAllowed: true,
      },
      timestamps: {
        assignedAt: delivery.assigned_at,
        arrivedPickupAt: delivery.arrived_pickup_at,
        pickedUpAt: delivery.picked_up_at,
        enRouteAt: delivery.en_route_at,
        arrivedDropoffAt: delivery.arrived_dropoff_at,
        deliveredAt: delivery.delivered_at,
        failedAt: delivery.failed_at,
      },
    };
  }

  /**
   * Customer Live Tracking API: privacy-preserving Rider view, live coordinates, and timeline
   */
  public async getCustomerTracking(
    orderId: string,
    customerUserId?: string,
    isAdmin = false
  ): Promise<CustomerTrackingResponse> {
    const order = await orderRepository.findById(orderId);
    if (!order) {
      throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found');
    }

    if (!isAdmin && customerUserId && order.customer_id !== customerUserId) {
      throw new AppError(403, 'FORBIDDEN_TRACKING', 'You are not authorized to track this order');
    }

    const delivery = await deliveryRepository.findByOrderId(orderId);
    if (!delivery) {
      throw new AppError(404, 'DELIVERY_NOT_FOUND', 'Delivery record not found for this order');
    }

    let riderSafe: CustomerTrackingResponse['rider'] = null;
    let riderLiveLocation: CustomerTrackingResponse['riderLiveLocation'] = null;

    const activeTracking = [DeliveryStatus.ASSIGNED, DeliveryStatus.ARRIVED_PICKUP, DeliveryStatus.PICKED_UP,
      DeliveryStatus.EN_ROUTE, DeliveryStatus.ARRIVED_DROPOFF].includes(delivery.status)
      && ![OrderStatus.CANCELLED, OrderStatus.REJECTED, OrderStatus.COMPLETED].includes(order.status);
    if (activeTracking && delivery.assigned_rider_id) {
      const riderProfile = await riderRepository.findProfileById(delivery.assigned_rider_id);
      if (riderProfile) {
        const rawReg = riderProfile.vehicleRegistration || '';
        const maskedReg =
          rawReg.length > 4
            ? `${rawReg.slice(0, 2)}***${rawReg.slice(-1)}`
            : rawReg || undefined;

        riderSafe = {
          id: riderProfile.id,
          firstName: riderProfile.firstName,
          vehicleType: riderProfile.vehicleType,
          vehicleRegistrationMasked: maskedReg,
          phoneProxy: '+254 700 000 000 ext 303',
        };

        // Live location from Redis/InMemory store
        const live = await riderLocationStore.getLiveLocation(riderProfile.id);
        if (live) {
          const ageSeconds = Math.round((Date.now() - new Date(live.recordedAt).getTime()) / 1000);
          riderLiveLocation = {
            latitude: live.latitude,
            longitude: live.longitude,
            accuracyMeters: live.accuracyMeters,
            recordedAt: live.recordedAt,
            isStale: ageSeconds > 180,
          };
        }
      }
    }

    // Human status message
    let statusMessage = 'Order placed and being prepared.';
    switch (delivery.status) {
      case DeliveryStatus.UNASSIGNED:
      case DeliveryStatus.OFFERED:
        statusMessage = 'Looking for the best nearby courier...';
        break;
      case DeliveryStatus.ASSIGNED:
        statusMessage = `${riderSafe?.firstName || 'A courier'} is on their way to the restaurant.`;
        break;
      case DeliveryStatus.ARRIVED_PICKUP:
        statusMessage = `${riderSafe?.firstName || 'Your courier'} has arrived at the restaurant.`;
        break;
      case DeliveryStatus.PICKED_UP:
      case DeliveryStatus.EN_ROUTE:
        statusMessage = `${riderSafe?.firstName || 'Your courier'} is en route to your delivery address!`;
        break;
      case DeliveryStatus.ARRIVED_DROPOFF:
        statusMessage = `${riderSafe?.firstName || 'Your courier'} has arrived! Please meet them at your dropoff point.`;
        break;
      case DeliveryStatus.DELIVERED:
        statusMessage = 'Order successfully delivered. Enjoy your meal!';
        break;
      case DeliveryStatus.FAILED:
        statusMessage = 'Delivery encounter an issue. Operations support has been notified.';
        break;
    }

    // ETA calculation
    let estimatedEtaMinutes: number | null = null;
    let estimatedArrivalAt: string | null = null;

    if (
      (delivery.status === DeliveryStatus.PICKED_UP || delivery.status === DeliveryStatus.EN_ROUTE) &&
      riderLiveLocation && !riderLiveLocation.isStale
    ) {
      const dropoffLat = delivery.dropoff_location.latitude ?? delivery.dropoff_location.lat;
      const dropoffLng = delivery.dropoff_location.longitude ?? delivery.dropoff_location.lng;
      const distanceMeters = calculateDistanceMeters(
        riderLiveLocation.latitude,
        riderLiveLocation.longitude,
        dropoffLat,
        dropoffLng,
        1.3
      );
      // Assume 25 km/h urban average
      estimatedEtaMinutes = Math.max(2, Math.round(distanceMeters / (25 * (1000 / 60))));
      estimatedArrivalAt = new Date(Date.now() + estimatedEtaMinutes * 60 * 1000).toISOString();
    } else if (delivery.status === DeliveryStatus.ASSIGNED || delivery.status === DeliveryStatus.ARRIVED_PICKUP) {
      estimatedEtaMinutes = 20;
      estimatedArrivalAt = new Date(Date.now() + 20 * 60 * 1000).toISOString();
    }

    const timeline = delivery.timeline || (await deliveryRepository.getTimelineByDeliveryId(delivery.id));

    return {
      orderId: order.id,
      orderNumber: order.order_number,
      publicCode: order.public_code || '0000',
      deliveryStatus: delivery.status,
      statusMessage,
      restaurant: {
        name: delivery.branch_name || order.branch_name || 'Restaurant',
        address: delivery.pickup_address_text,
        location: delivery.pickup_location,
        branchId: delivery.branch_id,
      },
      dropoff: {
        address: delivery.dropoff_address_text,
        location: delivery.dropoff_location,
        instructions: delivery.delivery_instructions,
      },
      rider: riderSafe,
      riderLiveLocation,
      estimatedEtaMinutes,
      estimatedArrivalAt,
      deliveryOtp: activeTracking ? delivery.delivery_otp : undefined,
      timeline,
    };
  }

  /**
   * Scan active deliveries against SLA thresholds and return stuck delivery alerts
   */
  public async scanStuckDeliveries(): Promise<StuckDeliveryAlert[]> {
    return await deliveryRepository.detectStuckDeliveries();
  }

  /**
   * 7. Courier Releases Active Delivery (Self-Unassign)
   */
  public async riderReleaseDelivery(
    deliveryId: string,
    riderUserId: string,
    reasonCode: string,
    note?: string
  ): Promise<Delivery> {
    const delivery = await deliveryRepository.findById(deliveryId);
    if (!delivery) {
      throw new AppError(404, 'DELIVERY_NOT_FOUND', 'Delivery not found');
    }

    const riderProfile = await riderRepository.findProfileByUserId(riderUserId);
    if (!riderProfile || delivery.assigned_rider_id !== riderProfile.id) {
      throw new AppError(403, 'FORBIDDEN_DELIVERY', 'You are not assigned to this delivery');
    }

    // Cannot release if order has already been picked up (must contact ops support)
    if (
      delivery.status === DeliveryStatus.PICKED_UP ||
      delivery.status === DeliveryStatus.EN_ROUTE ||
      delivery.status === DeliveryStatus.ARRIVED_DROPOFF
    ) {
      throw new AppError(
        400,
        'CANNOT_RELEASE_PICKED_UP_ORDER',
        'Cannot release order after pickup. Please contact operations support for critical handling.'
      );
    }

    // Atomic unassign
    const unassigned = await deliveryRepository.atomicUnassign(
      deliveryId,
      'RIDER',
      riderProfile.id,
      `${riderProfile.firstName} ${riderProfile.lastName}`.trim(),
      reasonCode,
      note || `Rider self-released order: ${reasonCode}`
    );

    // Return rider to available
    await riderRepository.updateWorkStatus(riderProfile.id, RiderWorkStatus.ONLINE_AVAILABLE);

    // Auto-retrigger dispatch for new courier
    await this.executeDispatchCycle(deliveryId);

    return unassigned;
  }

  /**
   * 8. Admin Manual Override Assign
   */
  public async adminManualAssign(
    deliveryId: string,
    targetRiderId: string,
    adminUser: { id: string; email: string },
    note?: string
  ): Promise<Delivery> {
    const delivery=await deliveryRepository.findById(deliveryId);
    if(!delivery)throw new AppError(404,'DELIVERY_NOT_FOUND','Delivery not found');
    await requirePaidOrder(delivery.order_id, true);
    const targetProfile = await riderRepository.findProfileById(targetRiderId);
    if (!targetProfile) {
      throw new AppError(404, 'RIDER_NOT_FOUND', 'Target rider profile not found');
    }

    // Same two locks as acceptOffer, same order (delivery, then rider): an admin manually
    // assigning a rider must not interleave with that rider concurrently accepting a different
    // offer, or with a rider accept/reject/dispatch cycle for this same delivery.
    await lockCommand(`delivery-offer:${deliveryId}`);
    await lockCommand(`rider-assignment:${targetProfile.id}`);

    // Assert target rider is approved and active for admin assignment
    if (
      targetProfile.onboardingStatus !== RiderOnboardingStatus.APPROVED ||
      targetProfile.operationalStatus !== RiderOperationalStatus.ACTIVE
    ) {
      throw new AppError(
        400,
        'RIDER_NOT_ELIGIBLE',
        `Rider is not operational: onboarding=${targetProfile.onboardingStatus}, operational=${targetProfile.operationalStatus}`
      );
    }

    // Cancel any active offers
    const activeOffer = await deliveryRepository.findActiveOfferByDeliveryId(deliveryId);
    if (activeOffer) {
      await deliveryRepository.updateOfferStatus(activeOffer.id, DeliveryOfferStatus.CANCELLED);
    }

    // Atomic assign
    const assigned = await deliveryRepository.atomicAssign(
      deliveryId,
      targetRiderId,
      `${targetProfile.firstName} ${targetProfile.lastName}`.trim(),
      targetProfile.phone
    );

    // Record admin audit note
    await deliveryRepository.recordTimelineEntry({
      id: randomUUID(),
      delivery_id: deliveryId,
      from_status: DeliveryStatus.UNASSIGNED,
      to_status: DeliveryStatus.ASSIGNED,
      actor_type: 'ADMIN',
      actor_id: adminUser.id,
      actor_name: adminUser.email,
      action: 'ADMIN_MANUAL_ASSIGNMENT',
      note: note || `Manual assignment by operations admin ${adminUser.email}`,
      created_at: new Date().toISOString(),
    });

    // Update target rider work status
    await riderRepository.updateWorkStatus(targetRiderId, RiderWorkStatus.BUSY);

    // Realtime events
    await this.publishRealtimeEvent(`order:${assigned.order_id}`, 'delivery.assigned', {
      deliveryId: assigned.id,
      orderId: assigned.order_id,
      status: DeliveryStatus.ASSIGNED,
      riderId: targetRiderId,
      riderName: `${targetProfile.firstName} ${targetProfile.lastName}`.trim(),
    });

    return assigned;
  }

  /**
   * 9. Admin Manual Unassign
   */
  public async adminUnassign(
    deliveryId: string,
    adminUser: { id: string; email: string },
    reasonCode: string = 'ADMIN_OVERRIDE',
    note?: string,
    retriggerDispatch: boolean = true
  ): Promise<Delivery> {
    const delivery = await deliveryRepository.findById(deliveryId);
    if (!delivery) {
      throw new AppError(404, 'DELIVERY_NOT_FOUND', 'Delivery not found');
    }

    const previousRiderId = delivery.assigned_rider_id;

    const unassigned = await deliveryRepository.atomicUnassign(
      deliveryId,
      'ADMIN',
      adminUser.id,
      adminUser.email,
      reasonCode,
      note || `Manual unassign by operations ${adminUser.email}`
    );

    if (previousRiderId) {
      await riderRepository.updateWorkStatus(previousRiderId, RiderWorkStatus.ONLINE_AVAILABLE);
    }

    if (retriggerDispatch) {
      await this.executeDispatchCycle(deliveryId);
    }

    return unassigned;
  }

  /**
   * 10. Hook: Called when merchant accepts order
   */
  public async onOrderAccepted(order: any, prepMinutes: number): Promise<Delivery> {
    await requirePaidOrder(order.id, true);
    const timing = this.calculateDispatchTiming(order.accepted_at || new Date(), prepMinutes);

    // Initialize or find Delivery
    let delivery = await deliveryRepository.findByOrderId(order.id);
    if (!delivery) {
      const branch = await merchantRepository.findBranchById(order.branch_id);
      const address = order.delivery_address_snapshot;
      const pickupLat = branch?.latitude, pickupLng = branch?.longitude;
      const dropoffLat = address?.location?.lat ?? address?.latitude;
      const dropoffLng = address?.location?.lng ?? address?.longitude;
      if (![pickupLat,pickupLng,dropoffLat,dropoffLng].every(v => typeof v === 'number' && Number.isFinite(v))) {
        throw new AppError(409, 'DELIVERY_COORDINATES_MISSING', 'Branch and customer coordinates are required for dispatch');
      }
      delivery = await deliveryRepository.createDelivery({
        id: randomUUID(),
        order_id: order.id,
        order_number: order.order_number,
        status: DeliveryStatus.UNASSIGNED,
        branch_id: order.branch_id,
        customer_id: order.customer_id,
        pickup_location: {lat:pickupLat!,lng:pickupLng!,latitude:pickupLat!,longitude:pickupLng!},
        dropoff_location: {lat:dropoffLat,lng:dropoffLng,latitude:dropoffLat,longitude:dropoffLng},
        pickup_address_text: branch!.address_text || branch!.address_line1 || branch!.name,
        dropoff_address_text: address?.formatted_address || address?.address_line1 || 'Customer Dropoff',
        delivery_instructions: order.special_instructions,
        estimated_prep_minutes: prepMinutes,
        estimated_ready_at: timing.estimatedReadyAt,
        dispatch_not_before: timing.dispatchNotBefore,
        reassignment_count: 0,
        dispatch_attention_required: false,
        current_search_radius_meters: this.dispatchConfig.initialSearchRadius,
        dispatch_cycle_count: 0,
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    } else {
      delivery = await deliveryRepository.updateDelivery(delivery.id, {
        estimated_prep_minutes: prepMinutes,
        estimated_ready_at: timing.estimatedReadyAt,
        dispatch_not_before: timing.dispatchNotBefore,
      });
    }

    if (timing.shouldDispatchNow) {
      await this.executeDispatchCycle(delivery.id);
    } else {
      logger.info('Scheduled dispatch for future execution', {
        service: 'dispatch-engine',
        metadata: {
          deliveryId: delivery.id,
          dispatchNotBefore: timing.dispatchNotBefore,
        },
      });
    }

    return delivery;
  }

  /**
   * 11. Hook: Called when order is READY for pickup
   */
  public async onOrderReady(order: any): Promise<void> {
    await requirePaidOrder(order.id, true);
    const delivery = await deliveryRepository.findByOrderId(order.id);
    if (!delivery) return;

    // If still unassigned, immediately force dispatch!
    if (delivery.status === DeliveryStatus.UNASSIGNED || delivery.status === DeliveryStatus.OFFERED) {
      await this.executeDispatchCycle(delivery.id);
    }
  }

  private async publishRealtimeEvent(channel: string, type: string, data: any): Promise<void> {
    try {
      await orderEventBroker.publish(channel, {
        type: type as any,
        channel,
        order_id: data.orderId || '',
        order_number: data.orderNumber || '',
        status: 'READY' as any,
        timestamp: new Date().toISOString(),
        data,
      });
    } catch {
      allowMemoryAdapter();
      // Non-blocking
    }
  }

  /**
   * Best-effort customer notification on a delivery lifecycle event. Never blocks or fails the
   * transition it's called from, mirroring OrderService.notifyCustomer's same rationale.
   */
  private async notifyCustomer(
    customerId: string,
    orderId: string,
    templateCode: string,
    subject: string,
    extraPayload: Record<string, unknown> = {}
  ): Promise<void> {
    try {
      await notificationService.sendNotification({
        recipientType: 'CUSTOMER' as any,
        recipientId: customerId,
        channel: 'IN_APP' as any,
        templateCode,
        subject,
        referenceId: orderId,
        payload: { orderId, ...extraPayload },
      });
    } catch (notifyErr) {
      logger.warn('Failed to send customer delivery notification', {
        service: 'dispatch-engine',
        orderId,
        templateCode,
        error: (notifyErr as Error).message,
      });
    }
  }
}

export const dispatchService = transactionalService(new DispatchService());
