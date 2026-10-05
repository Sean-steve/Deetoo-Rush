import { scopedResponseMiddleware } from '../../middleware/scoped-response';
import { orderScope } from "../auth/scope";
/**
 * DEETOO - Core Order API Router
 * Endpoints for order placement, order status retrieval, and customer cancellation (Section 12, 13)
 */

import { Router, Response, NextFunction } from "express";
import { ApiResponse, Order, UserRole } from "@deetoo/types";
import { CreateOrderSchema, OrderCancelSchema } from "@deetoo/validation";
import {
  requireAuth,
  requireRole,
  AuthenticatedRequest,
} from "../auth/auth.middleware";
import { orderService } from "./order.service";
import { deliveryRepository } from "./delivery.repository";
import { dispatchService } from "./dispatch.service";
import { riderLocationStore } from "../../db/redis";
import { AppError } from "../../middleware/error-handler";

export const orderRouter = Router();
orderRouter.use(scopedResponseMiddleware);

// Order placement and management requires authentication
orderRouter.use(requireAuth);
orderRouter.param("id", async (req: AuthenticatedRequest, _res, next, id) => {
  try {
    await orderScope(req.user!, id, req.path.endsWith("/payments"));
    next();
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/orders
 * Authoritative Order Creation from Checkout Quote with Idempotency Key
 */
orderRouter.post(
  "/",
  requireRole("customer"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const customerId = req.user!.id;
      const validatedBody = CreateOrderSchema.parse(req.body);
      const idempotencyKey =
        (req.headers["idempotency-key"] as string) || undefined;

      const order = await orderService.createOrderFromQuote(
        customerId,
        validatedBody,
        idempotencyKey,
      );

      const response: ApiResponse<Order> = {
        success: true,
        data: order,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.headers["x-request-id"] as string,
        },
      };

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/v1/orders/:id
 * Retrieve authoritative order with items, modifiers, snapshots, and timeline
 */
orderRouter.get(
  "/:id",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const orderId = req.params.id;
      const order = await orderService.getOrderById(orderId);

      // Permission check: customer must own the order or be platform staff/admin
      const isCustomerOwner = order.customer_id === req.user!.id;
      const isStaffOrAdmin = req.user!.roles.some((r) =>
        [
          UserRole.ADMIN,
          UserRole.OPS,
          UserRole.MERCHANT_OWNER,
          UserRole.MERCHANT_MANAGER,
          UserRole.MERCHANT_STAFF,
          UserRole.MERCHANT,
        ].includes(r),
      );

      if (!isCustomerOwner && !isStaffOrAdmin) {
        throw new AppError(
          403,
          "FORBIDDEN_OPERATION",
          "You do not have permission to view this order",
        );
      }

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
 * POST /api/v1/orders/:id/cancel
 * Customer cancels order (Permitted only before merchant accepts)
 */
orderRouter.post(
  "/:id/cancel",
  requireRole("customer"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const orderId = req.params.id;
      const customerId = req.user!.id;
      const validatedBody = OrderCancelSchema.parse(req.body);

      const cancelledOrder = await orderService.customerCancelOrder(
        customerId,
        orderId,
        validatedBody.reason_code ||
          validatedBody.reasonCode ||
          "CUSTOMER_CANCELLED",
        validatedBody.note,
      );

      const response: ApiResponse<Order> = {
        success: true,
        data: cancelledOrder,
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
 * GET /api/v1/orders/:id/delivery
 * Retrieve authoritative delivery record and active courier info for an order
 */
orderRouter.get(
  "/:id/delivery",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const orderId = req.params.id;
      const order = await orderService.getOrderById(orderId);

      const isCustomerOwner = order.customer_id === req.user!.id;
      const isStaffOrAdmin = req.user!.roles.some((r) =>
        [
          UserRole.ADMIN,
          UserRole.OPS,
          UserRole.SUPPORT,
          UserRole.MERCHANT_OWNER,
          UserRole.MERCHANT_MANAGER,
          UserRole.MERCHANT_STAFF,
          UserRole.MERCHANT,
        ].includes(r),
      );

      if (!isCustomerOwner && !isStaffOrAdmin) {
        throw new AppError(
          403,
          "FORBIDDEN_OPERATION",
          "You do not have permission to view delivery for this order",
        );
      }

      const delivery = await deliveryRepository.findByOrderId(orderId);
      let riderLiveLocation = null;
      if (delivery?.assigned_rider_id) {
        riderLiveLocation = await riderLocationStore.getLatestLocation(
          delivery.assigned_rider_id,
        );
      }

      res.json({
        success: true,
        data: {
          delivery,
          riderLocation: riderLiveLocation,
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

/**
 * GET /api/v1/orders/:id/track
 * Customer Live Delivery Tracking with safe masked courier profile, live GPS location, and ETA
 */
orderRouter.get(
  "/:id/track",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const orderId = req.params.id;
      const isStaffOrAdmin = req.user!.roles.some((r) =>
        [
          UserRole.ADMIN,
          UserRole.OPS,
          UserRole.SUPPORT,
          UserRole.MERCHANT_OWNER,
          UserRole.MERCHANT_MANAGER,
          UserRole.MERCHANT_STAFF,
          UserRole.MERCHANT,
        ].includes(r),
      );

      const tracking = await dispatchService.getCustomerTracking(
        orderId,
        req.user!.id,
        isStaffOrAdmin,
      );

      res.json({
        success: true,
        data: tracking,
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

/**
 * POST /api/v1/orders/:id/pay
 * Initiate payment for an order via M-PESA or Card
 */
orderRouter.post(
  "/:id/pay",
  requireRole("customer"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { paymentService } = await import("../payment/payment.service");
      const { PaymentInitiateSchema } = await import("@deetoo/validation");
      const validated = PaymentInitiateSchema.parse(req.body);
      const idempotencyKey = (req.headers["idempotency-key"] ||
        req.headers["x-idempotency-key"]) as string | undefined;

      const payment = await paymentService.initiatePayment({
        orderId: req.params.id,
        customerId: req.user!.id,
        method: validated.method,
        phone: validated.phone,
        paymentMethodToken: validated.payment_method_token,
        idempotencyKey,
      });

      res.status(201).json({
        success: true,
        data: payment,
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

/**
 * GET /api/v1/orders/:id/payments
 * Get payment attempts for an order
 */
orderRouter.get(
  "/:id/payments",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { paymentService } = await import("../payment/payment.service");
      const payments = await paymentService.getPaymentsByOrder(req.params.id);

      res.json({
        success: true,
        data: payments,
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
