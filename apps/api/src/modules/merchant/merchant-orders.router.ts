import { requirePaidOrder } from '../payment/paid-order-guard';
import { scopedResponseMiddleware } from '../../middleware/scoped-response';
import { branchScope } from "../auth/scope";
/**
 * DEETOO - Merchant Order Management Router
 * Dedicated endpoints for merchant order queue, acceptance, preparation, ready status, and rejection (Section 13, 14)
 */

import { Router, Response, NextFunction } from "express";
import { ApiResponse, Order } from "@deetoo/types";
import {
  OrderAcceptSchema,
  OrderRejectSchema,
  OrderCancelSchema,
} from "@deetoo/validation";
import { AuthenticatedRequest } from "../auth/auth.middleware";
import { orderService } from "../order/order.service";
import { deliveryRepository } from "../order/delivery.repository";
import { riderRepository } from "../rider/rider.repository";
import { merchantRepository } from "./merchant.repository";
import { requireMerchantCapability } from "./merchant-role-policy.service";
import { AppError } from "../../middleware/error-handler";

export const merchantOrderRouter = Router();
merchantOrderRouter.use(scopedResponseMiddleware);
merchantOrderRouter.param(
  "id",
  async (req: AuthenticatedRequest, _res, next, id) => {
    try {
      const order = await orderService.getOrderById(id);
      await branchScope(req.user!, order.branch_id);
      await requirePaidOrder(order.id);
      if(req.method !== "GET" && !req.user!.roles.some(r=>["admin","ops"].includes(String(r))))
        await requireMerchantCapability(req.user!.id,order.merchant_id,"ORDERS_WRITE");
      next();
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Helper to resolve the active branch ID for merchant operations
 */
async function resolveBranchId(
  req: AuthenticatedRequest,
  explicitBranchId?: string,
): Promise<string> {
  if (explicitBranchId) {
    await branchScope(req.user!, explicitBranchId);
    return explicitBranchId;
  }

  const queryBranchId = req.query.branch_id as string | undefined;
  if (queryBranchId) {
    await branchScope(req.user!, queryBranchId);
    return queryBranchId;
  }

  // Look up user's merchant memberships
  const memberships = (
    await merchantRepository.getMembershipsForUser(req.user!.id)
  ).filter((m) => m.status === "ACTIVE");
  if (memberships.length === 0) {
    throw new AppError(
      403,
      "NO_MERCHANT_MEMBERSHIP",
      "User has no merchant memberships",
    );
  }

  // If user is assigned to a specific branch
  const branchMembership = memberships.find(
    (m) => m.branch_ids && m.branch_ids.length > 0,
  );
  if (
    branchMembership &&
    branchMembership.branch_ids &&
    branchMembership.branch_ids.length > 0
  ) {
    await branchScope(req.user!, branchMembership.branch_ids[0]);
    return branchMembership.branch_ids[0];
  }

  // Otherwise, get the first branch of their primary merchant
  const primaryMerchantId = memberships[0].merchant_id;
  const branches =
    await merchantRepository.listBranchesByMerchant(primaryMerchantId);
  if (branches.length === 0) {
    throw new AppError(
      404,
      "NO_BRANCH_FOUND",
      "No active branch found for merchant",
    );
  }

  await branchScope(req.user!, branches[0].id);
  return branches[0].id;
}

/**
 * GET /api/v1/merchant/orders
 * Retrieve active order queue for merchant branch
 */
merchantOrderRouter.get(
  "/",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const branchId = await resolveBranchId(req);
      const status = req.query.status as string | undefined;
      const limit = req.query.limit
        ? parseInt(req.query.limit as string, 10)
        : 100;

      const orders = await orderService.getBranchOrders(branchId, {
        status,
        limit,
      });

      const response: ApiResponse<Order[]> = {
        success: true,
        data: orders,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.headers["x-request-id"] as string,
        },
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/v1/merchant/orders/:id
 * Retrieve full order detail
 */
merchantOrderRouter.get(
  "/:id",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const orderId = req.params.id;
      const order = await orderService.getOrderById(orderId);

      const response: ApiResponse<Order> = {
        success: true,
        data: order,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.headers["x-request-id"] as string,
        },
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/v1/merchant/orders/:id/accept
 * Merchant accepts incoming order and submits estimated prep time
 */
merchantOrderRouter.post(
  "/:id/accept",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const orderId = req.params.id;
      const validatedBody = OrderAcceptSchema.parse(req.body);
      const prepMinutes =
        validatedBody.preparation_minutes ||
        validatedBody.estimatedPreparationMinutes ||
        20;

      const order = await orderService.getOrderById(orderId);
      const branchId = order.branch_id;

      const updated = await orderService.merchantAcceptOrder(
        branchId,
        { id: req.user!.id, email: req.user!.email },
        orderId,
        prepMinutes,
      );

      const response: ApiResponse<Order> = {
        success: true,
        data: updated,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.headers["x-request-id"] as string,
        },
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/v1/merchant/orders/:id/reject
 * Merchant rejects incoming order with structured reason code
 */
merchantOrderRouter.post(
  "/:id/reject",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const orderId = req.params.id;
      const validatedBody = OrderRejectSchema.parse(req.body);

      const order = await orderService.getOrderById(orderId);
      const branchId = order.branch_id;

      const updated = await orderService.merchantRejectOrder(
        branchId,
        { id: req.user!.id, email: req.user!.email },
        orderId,
        validatedBody.reason_code ||
          validatedBody.reasonCode ||
          "KITCHEN_OVERLOAD",
        validatedBody.note,
      );

      const response: ApiResponse<Order> = {
        success: true,
        data: updated,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.headers["x-request-id"] as string,
        },
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/v1/merchant/orders/:id/preparing
 * Merchant marks order as in food preparation
 */
merchantOrderRouter.post(
  "/:id/preparing",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const orderId = req.params.id;
      const order = await orderService.getOrderById(orderId);
      const branchId = order.branch_id;

      const updated = await orderService.merchantMarkPreparing(
        branchId,
        { id: req.user!.id, email: req.user!.email },
        orderId,
      );

      const response: ApiResponse<Order> = {
        success: true,
        data: updated,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.headers["x-request-id"] as string,
        },
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/v1/merchant/orders/:id/ready
 * Merchant marks order as packaged and ready for dispatch/pickup
 */
merchantOrderRouter.post(
  "/:id/ready",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const orderId = req.params.id;
      const order = await orderService.getOrderById(orderId);
      const branchId = order.branch_id;

      const updated = await orderService.merchantMarkReady(
        branchId,
        { id: req.user!.id, email: req.user!.email },
        orderId,
      );

      const response: ApiResponse<Order> = {
        success: true,
        data: updated,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.headers["x-request-id"] as string,
        },
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/v1/merchant/orders/:id/cancel
 * Merchant cancels order with operational reason
 */
merchantOrderRouter.post(
  "/:id/cancel",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const orderId = req.params.id;
      const validatedBody = OrderCancelSchema.parse(req.body);

      const order = await orderService.getOrderById(orderId);
      const branchId = order.branch_id;

      const updated = await orderService.merchantCancelOrder(
        branchId,
        { id: req.user!.id, email: req.user!.email },
        orderId,
        validatedBody.reason_code ||
          validatedBody.reasonCode ||
          "MERCHANT_CANCELLED",
        validatedBody.note,
      );

      const response: ApiResponse<Order> = {
        success: true,
        data: updated,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.headers["x-request-id"] as string,
        },
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/v1/merchant/orders/:id/pickup-status
 * Live visibility for restaurant staff into courier assignment, arrival, and pickup verification
 */
merchantOrderRouter.get(
  "/:id/pickup-status",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const orderId = req.params.id;
      const order = await orderService.getOrderById(orderId);
      const branchId = await resolveBranchId(req);

      if (order.branch_id !== branchId) {
        throw new AppError(
          403,
          "FORBIDDEN_OPERATION",
          "Order does not belong to your active merchant branch",
        );
      }

      const delivery = await deliveryRepository.findByOrderId(orderId);
      let riderSummary = null;

      if (delivery?.assigned_rider_id) {
        const riderProfile = await riderRepository.findProfileById(
          delivery.assigned_rider_id,
        );
        if (riderProfile) {
          const rawReg = riderProfile.vehicleRegistration || "";
          const maskedReg =
            rawReg.length > 4
              ? `${rawReg.slice(0, 2)}***${rawReg.slice(-1)}`
              : rawReg;
          riderSummary = {
            id: riderProfile.id,
            firstName: riderProfile.firstName,
            vehicleType: riderProfile.vehicleType,
            vehicleRegistration: maskedReg,
            phone: "+254 700 000 000 ext 404",
          };
        }
      }

      res.json({
        success: true,
        data: {
          orderId: order.id,
          orderNumber: order.order_number,
          orderStatus: order.status,
          deliveryId: delivery?.id || null,
          deliveryStatus: delivery?.status || "UNASSIGNED",
          pickupVerificationCode:
            delivery?.pickup_verification_code || order.public_code || null,
          rider: riderSummary,
          arrivedPickupAt: delivery?.arrived_pickup_at || null,
          pickedUpAt: delivery?.picked_up_at || null,
          dispatchAttentionRequired:
            delivery?.dispatch_attention_required || false,
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.headers["x-request-id"] as string,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);
