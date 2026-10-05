import { riderResponse } from './rider-response';
import { riderRepository } from "./rider.repository";
/**
 * DEETOO - Rider Application Endpoints Router
 * Handles rider profile, onboarding submission, vehicle settings,
 * availability status (Go Online / Go Offline), and GPS location ingestion (Sprint 8)
 */

import { Router, Response, NextFunction } from "express";
import {
  requireAuth,
  requireRole,
  AuthenticatedRequest,
} from "../auth/auth.middleware";
import { riderService } from "./rider.service";
import { VehicleType } from "@deetoo/types";
import {
  RiderProfileUpdateSchema,
  RiderVehicleSchema,
  RiderLocationSchema,
  RiderAvailabilityOnlineSchema,
  RiderRejectOfferSchema,
  RiderReleaseDeliverySchema,
  RiderArrivePickupSchema,
  RiderConfirmPickupSchema,
  RiderArriveDropoffSchema,
  RiderCompleteDeliverySchema,
  RiderFailDeliverySchema,
} from "@deetoo/validation";
import { DeliveryStatus, DeliveryOfferStatus } from "@deetoo/types";
import { AppError } from "../../middleware/error-handler";
import { dispatchService } from "../order/dispatch.service";
import { deliveryRepository } from "../order/delivery.repository";
import { orderRepository } from "../order/order.repository";

export const riderRouter = Router();

// All rider endpoints require valid authentication
riderRouter.use(requireAuth, requireRole("rider"));
riderRouter.use((_req,res,next)=>{
  const json=res.json.bind(res);
  res.json=(value)=>json(riderResponse(value));
  next();
});
// Check ownership before validation or any location/proof/status side effect.
riderRouter.param("id", async (req: AuthenticatedRequest, _res, next, id) => {
  try {
    const delivery = await deliveryRepository.findById(id);
    if (!delivery)
      throw new AppError(404, "DELIVERY_NOT_FOUND", "Delivery not found");
    const rider = await riderRepository.findProfileByUserId(req.user!.id);
    if (!rider || delivery.assigned_rider_id !== rider.id)
      throw new AppError(
        403,
        "FORBIDDEN_DELIVERY",
        "Delivery belongs to another rider",
      );
    next();
  } catch (err) {
    next(err);
  }
});
riderRouter.param(
  "offerId",
  async (req: AuthenticatedRequest, _res, next, id) => {
    try {
      const offer = await deliveryRepository.findOfferById(id);
      if (!offer) throw new AppError(404, "OFFER_NOT_FOUND", "Offer not found");
      const rider = await riderRepository.findProfileByUserId(req.user!.id);
      if (!rider || offer.rider_id !== rider.id)
        throw new AppError(
          403,
          "FORBIDDEN_OFFER",
          "Offer belongs to another rider",
        );
      next();
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/rider/status
 * Central status query for the Rider App: profile, vehicle, eligibility, active session, location freshness
 */
riderRouter.get(
  "/status",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const status = await riderService.getRiderStatus(userId);
      res.json({
        data: status,
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/rider/profile
 * Returns profile details, vehicle, and assigned zones
 */
riderRouter.get(
  "/profile",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const status = await riderService.getRiderStatus(userId);
      res.json({
        data: {
          profile: status.profile,
          vehicle: status.vehicle,
          assignedZones: status.assignedZones,
        },
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/rider/profile
 * Update rider profile fields (mass-assignment protected)
 */
riderRouter.patch(
  "/profile",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const parseResult = RiderProfileUpdateSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          parseResult.error.issues[0]?.message || "Invalid profile updates",
        );
      }

      const userId = req.user!.id;
      const updated = await riderService.updateProfile(userId, {
        ...parseResult.data,
        vehicle_type: parseResult.data.vehicle_type as VehicleType | undefined,
      });
      res.json({
        data: updated,
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/rider/onboarding/submit
 * Submit profile for administrative review and approval (DRAFT -> PENDING_REVIEW)
 */
riderRouter.post(
  "/onboarding/submit",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const submitted = await riderService.submitOnboarding(userId);
      res.json({
        data: submitted,
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/rider/vehicles
 * Get vehicle configuration for rider
 */
riderRouter.get(
  "/vehicles",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const status = await riderService.getRiderStatus(userId);
      res.json({
        data: status.vehicle,
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/rider/vehicles
 * Register or update vehicle configuration
 */
riderRouter.post(
  "/vehicles",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const parseResult = RiderVehicleSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          parseResult.error.issues[0]?.message || "Invalid vehicle details",
        );
      }

      const userId = req.user!.id;
      const vehicle = await riderService.updateVehicle(userId, {
        type: parseResult.data.type as any,
        registration_number: parseResult.data.registration_number,
        status: parseResult.data.status as any,
      });

      res.json({
        data: vehicle,
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/rider/availability
 * Get current availability, active session, and operational readiness
 */
riderRouter.get(
  "/availability",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const status = await riderService.getRiderStatus(userId);
      res.json({
        data: {
          workStatus: status.profile.workStatus,
          operationalStatus: status.profile.operationalStatus,
          onboardingStatus: status.profile.onboardingStatus,
          activeSession: status.activeSession,
          eligibility: status.eligibility,
          locationFreshness: status.locationFreshness,
        },
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/rider/availability/online
 * Rider toggles Go Online. Validates all eligibility, operational, vehicle, and location guards.
 */
riderRouter.post(
  "/availability/online",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const parseResult = RiderAvailabilityOnlineSchema.safeParse(
        req.body || {},
      );
      if (!parseResult.success) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          parseResult.error.issues[0]?.message || "Invalid location payload",
        );
      }

      const userId = req.user!.id;
      const result = await riderService.goOnline(userId, parseResult.data);
      res.json({
        data: result,
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/rider/availability/offline
 * Rider toggles Go Offline. Closes active session and unregisters from dispatch geo index.
 */
riderRouter.post(
  "/availability/offline",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const result = await riderService.goOffline(userId);
      res.json({
        data: result,
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/rider/location
 * High-frequency GPS location ingestion from rider application
 */
riderRouter.post(
  "/location",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const parseResult = RiderLocationSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          parseResult.error.issues[0]?.message || "Invalid GPS location update",
        );
      }

      const userId = req.user!.id;
      const result = await riderService.recordLocation(userId, {
        latitude: parseResult.data.latitude,
        longitude: parseResult.data.longitude,
        accuracyMeters: parseResult.data.accuracy_meters,
        recordedAt: parseResult.data.recorded_at,
      });

      res.json({
        data: result,
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/rider/heartbeat
 * Periodic heartbeat ping when location is unchanged
 */
riderRouter.post(
  "/heartbeat",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const status = await riderService.getRiderStatus(userId);
      res.json({
        data: {
          acknowledged: true,
          workStatus: status.profile.workStatus,
          timestamp: new Date().toISOString(),
        },
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ==========================================
// Sprint 9: Dispatch & Delivery Endpoints for Rider
// ==========================================

/**
 * GET /api/v1/rider/offers/active
 * Returns the currently pending delivery offer for the authenticated courier
 */
riderRouter.get(
  "/offers/active",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const status = await riderService.getRiderStatus(userId);
      const activeOffer = await deliveryRepository.findActiveOfferByRiderId(
        status.profile.id,
      );

      if (!activeOffer) {
        return res.json({
          data: null,
          requestId: (req as any).requestId,
        });
      }

      const delivery = await deliveryRepository.findById(
        activeOffer.delivery_id,
      );
      const order = delivery
        ? await orderRepository.findById(delivery.order_id)
        : null;
      const nowMs = Date.now();
      const expiresMs = new Date(activeOffer.expires_at).getTime();
      const secondsRemaining = Math.max(
        0,
        Math.round((expiresMs - nowMs) / 1000),
      );

      res.json({
        data: {
          offer: activeOffer,
          delivery,
          orderNumber: delivery?.order_number || order?.order_number,
          restaurantName:
            delivery?.pickup_address_text || order?.branch_name || "Restaurant",
          pickupAddress: delivery?.pickup_address_text,
          pickupLocation: delivery?.pickup_location,
          dropoffAddress: delivery?.dropoff_address_text,
          dropoffLocation: delivery?.dropoff_location,
          distanceToPickupMeters: activeOffer.distance_to_pickup_meters,
          estimatedPickupEtaSeconds: activeOffer.estimated_pickup_eta_seconds,
          estimatedEarningsMinor: 15000, // Standard KES 150.00 base delivery pay
          itemCount: order?.items?.length || 1,
          secondsRemaining,
        },
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/rider/offers/:offerId/accept
 * Courier accepts incoming delivery offer (atomic assignment)
 */
riderRouter.post(
  "/offers/:offerId/accept",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const { offerId } = req.params;
      const delivery = await dispatchService.acceptOffer(offerId, userId);

      res.json({
        data: {
          delivery,
          status: delivery.status,
          message: "Delivery offer accepted successfully",
        },
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/rider/offers/:offerId/reject
 * Courier declines delivery offer with standard reason code
 */
riderRouter.post(
  "/offers/:offerId/reject",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const parseResult = RiderRejectOfferSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          parseResult.error.issues[0]?.message || "Invalid rejection payload",
        );
      }

      const userId = req.user!.id;
      const { offerId } = req.params;
      const result = await dispatchService.rejectOffer(
        offerId,
        userId,
        parseResult.data.reason_code,
        parseResult.data.note,
      );

      res.json({
        data: result,
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/rider/deliveries/active
 * Returns current active assigned delivery for the courier
 */
riderRouter.get(
  "/deliveries/active",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const status = await riderService.getRiderStatus(userId);
      const activeDelivery = await deliveryRepository.findActiveByRiderId(
        status.profile.id,
      );

      if (!activeDelivery) {
        return res.json({
          data: null,
          requestId: (req as any).requestId,
        });
      }

      const order = await orderRepository.findById(activeDelivery.order_id);

      res.json({
        data: {
          delivery: activeDelivery,
          order,
        },
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/rider/deliveries/:id/status
 * Courier advances delivery milestone (ARRIVED_PICKUP, PICKED_UP, EN_ROUTE, ARRIVED_DROPOFF, DELIVERED)
 */
riderRouter.post(
  "/deliveries/:id/status",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { status, note, proof_type, proof_ref, coordinates } = req.body;
      if (
        [
          DeliveryStatus.PICKED_UP,
          DeliveryStatus.DELIVERED,
          DeliveryStatus.FAILED,
        ].includes(status)
      ) {
        throw new AppError(
          409,
          "DEDICATED_ACTION_REQUIRED",
          "Use confirm-pickup, complete or fail to supply required verification",
        );
      }

      if (!status || !Object.values(DeliveryStatus).includes(status)) {
        throw new AppError(
          400,
          "INVALID_DELIVERY_STATUS",
          `Invalid target delivery status ${status}`,
        );
      }

      const userId = req.user!.id;
      const updated = await dispatchService.updateDeliveryStatus(
        id,
        userId,
        status,
        {
          note,
          proofType: proof_type,
          proofRef: proof_ref,
          currentCoordinates: coordinates,
        },
      );

      res.json({
        data: {
          delivery: updated,
          status: updated.status,
        },
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/rider/deliveries/:id/release
 * Courier self-releases an assigned delivery (emergency or mechanical issue)
 */
riderRouter.post(
  "/deliveries/:id/release",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const parseResult = RiderReleaseDeliverySchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          parseResult.error.issues[0]?.message || "Invalid release payload",
        );
      }

      const { id } = req.params;
      const userId = req.user!.id;
      const unassigned = await dispatchService.riderReleaseDelivery(
        id,
        userId,
        parseResult.data.reason_code,
        parseResult.data.note,
      );

      res.json({
        data: {
          delivery: unassigned,
          message: "Delivery released and returned to dispatch queue",
        },
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ==========================================
// Sprint 10 Dedicated Lifecycle Routes
// ==========================================

/**
 * GET /api/v1/rider/deliveries/:id
 * Retrieve detailed delivery task for assigned courier with addresses, navigation deep-links, and pickup verification code
 */
riderRouter.get(
  "/deliveries/:id",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      const details = await dispatchService.getRiderDeliveryDetail(id, userId);

      res.json({
        data: details,
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/rider/deliveries/:id/arrive-pickup
 * Courier confirms arrival at merchant pickup location
 */
riderRouter.post(
  "/deliveries/:id/arrive-pickup",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      const validated = RiderArrivePickupSchema.parse(req.body);

      const delivery = await dispatchService.riderArrivePickup(
        id,
        userId,
        validated,
      );

      res.json({
        data: {
          delivery,
          status: delivery.status,
          arrivedAt: delivery.arrived_pickup_at,
        },
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/rider/deliveries/:id/confirm-pickup
 * Courier confirms order pickup with kitchen verification code validation
 */
riderRouter.post(
  "/deliveries/:id/confirm-pickup",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      const validated = RiderConfirmPickupSchema.parse(req.body);

      const delivery = await dispatchService.riderConfirmPickup(
        id,
        userId,
        validated,
      );

      res.json({
        data: {
          delivery,
          status: delivery.status,
          pickedUpAt: delivery.picked_up_at,
        },
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/rider/deliveries/:id/start-trip
 * POST /api/v1/rider/deliveries/:id/en-route
 * Courier transitions to en-route delivery to customer
 */
const handleStartTrip = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const delivery = await dispatchService.riderStartTrip(id, userId);

    res.json({
      data: {
        delivery,
        status: delivery.status,
        enRouteAt: delivery.en_route_at,
      },
      requestId: (req as any).requestId,
    });
  } catch (err) {
    next(err);
  }
};

riderRouter.post("/deliveries/:id/start-trip", handleStartTrip);
riderRouter.post("/deliveries/:id/en-route", handleStartTrip);

/**
 * POST /api/v1/rider/deliveries/:id/arrive-dropoff
 * Courier signals arrival at customer dropoff destination
 */
riderRouter.post(
  "/deliveries/:id/arrive-dropoff",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      const validated = RiderArriveDropoffSchema.parse(req.body);

      const delivery = await dispatchService.riderArriveDropoff(
        id,
        userId,
        validated,
      );

      res.json({
        data: {
          delivery,
          status: delivery.status,
          arrivedDropoffAt: delivery.arrived_dropoff_at,
        },
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/rider/deliveries/:id/complete
 * Courier marks delivery completed with Proof of Delivery (OTP, photo, or signature)
 */
riderRouter.post(
  "/deliveries/:id/complete",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      const validated = RiderCompleteDeliverySchema.parse(req.body);

      const delivery = await dispatchService.riderCompleteDelivery(
        id,
        userId,
        validated as any,
      );

      res.json({
        data: {
          delivery,
          status: delivery.status,
          deliveredAt: delivery.delivered_at,
          proofType: delivery.proof_type,
        },
        message:
          "Delivery completed successfully and courier released to available status",
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/rider/deliveries/:id/fail
 * Courier reports failed delivery attempt with reason and incident creation
 */
riderRouter.post(
  "/deliveries/:id/fail",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      const validated = RiderFailDeliverySchema.parse(req.body);

      const delivery = await dispatchService.riderFailDelivery(
        id,
        userId,
        validated,
      );

      res.json({
        data: {
          delivery,
          status: delivery.status,
          failedAt: delivery.failed_at,
        },
        message: "Delivery marked as failed. Incident reported to operations.",
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  },
);
