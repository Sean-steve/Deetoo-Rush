/**
 * DEETOO - Customer Router
 * Authenticated endpoints for customer profile and address management
 */

import { Router, Response, NextFunction } from "express";
import { customerService } from "./customer.service";
import {
  requireAuth,
  requireRole,
  AuthenticatedRequest,
} from "../auth/auth.middleware";
import {
  UpdateCustomerProfileSchema,
  CreateCustomerAddressSchema,
  UpdateCustomerAddressSchema,
  OrderCancelSchema,
} from "@deetoo/validation";
import { AppError } from "../../middleware/error-handler";
import { orderService } from "../order/order.service";
import { deliveryRepository } from "../order/delivery.repository";
import { dispatchService } from "../order/dispatch.service";
import { riderLocationStore } from "../../db/redis";

export const customerRouter = Router();

// Apply authentication to all customer endpoints
customerRouter.use(requireAuth, requireRole("customer"));

// ==========================================
// Customer Profile Endpoints
// ==========================================

/**
 * GET /api/v1/customer/profile
 */
customerRouter.get(
  "/profile",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const profile = await customerService.getProfile(userId);
      res.json({
        data: profile,
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/customer/profile
 */
customerRouter.patch(
  "/profile",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const validated = UpdateCustomerProfileSchema.parse(req.body);
      const actor = {
        userId,
        role: req.user!.roles[0] || "customer",
        ip: req.ip,
      };

      const profile = await customerService.updateProfile(
        userId,
        validated,
        actor,
      );
      res.json({
        data: profile,
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ==========================================
// Customer Saved Delivery Addresses Endpoints
// ==========================================

/**
 * GET /api/v1/customer/addresses
 */
customerRouter.get(
  "/addresses",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const customerId = req.user!.id;
      const addresses = await customerService.listAddresses(customerId);
      res.json({
        data: addresses,
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/customer/addresses
 */
customerRouter.post(
  "/addresses",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const customerId = req.user!.id;
      const validated = CreateCustomerAddressSchema.parse(req.body);
      const actor = {
        userId: customerId,
        role: req.user!.roles[0] || "customer",
        ip: req.ip,
      };

      const address = await customerService.createAddress(
        customerId,
        validated as any,
        actor,
      );
      res.status(201).json({
        data: address,
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/customer/addresses/:id
 */
customerRouter.get(
  "/addresses/:id",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const customerId = req.user!.id;
      const addressId = req.params.id;
      const address = await customerService.getAddress(addressId, customerId);
      res.json({
        data: address,
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/customer/addresses/:id
 */
customerRouter.patch(
  "/addresses/:id",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const customerId = req.user!.id;
      const addressId = req.params.id;
      const validated = UpdateCustomerAddressSchema.parse(req.body);
      const actor = {
        userId: customerId,
        role: req.user!.roles[0] || "customer",
        ip: req.ip,
      };

      const address = await customerService.updateAddress(
        addressId,
        customerId,
        validated as any,
        actor,
      );
      res.json({
        data: address,
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /api/v1/customer/addresses/:id
 */
customerRouter.delete(
  "/addresses/:id",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const customerId = req.user!.id;
      const addressId = req.params.id;
      const actor = {
        userId: customerId,
        role: req.user!.roles[0] || "customer",
        ip: req.ip,
      };

      await customerService.deleteAddress(addressId, customerId, actor);
      res.json({
        data: { message: "Address deleted successfully" },
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/customer/addresses/:id/default
 */
customerRouter.post(
  "/addresses/:id/default",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const customerId = req.user!.id;
      const addressId = req.params.id;
      const actor = {
        userId: customerId,
        role: req.user!.roles[0] || "customer",
        ip: req.ip,
      };

      const address = await customerService.setDefaultAddress(
        addressId,
        customerId,
        actor,
      );
      res.json({
        data: address,
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ==========================================
// Customer Order Endpoints (Sprint 7)
// ==========================================

/**
 * GET /api/v1/customer/orders
 * Retrieve orders placed by the current customer
 */
customerRouter.get(
  "/orders",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const customerId = req.user!.id;
      const status = req.query.status as string | undefined;
      const limit = req.query.limit
        ? parseInt(req.query.limit as string, 10)
        : 50;

      const orders = await orderService.getCustomerOrders(customerId, {
        status,
        limit,
      });
      res.json({
        success: true,
        data: orders,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: (req as any).requestId,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/customer/orders/:id
 * Retrieve customer order details
 */
customerRouter.get(
  "/orders/:id",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const customerId = req.user!.id;
      const orderId = req.params.id;

      const order = await orderService.getOrderById(orderId);
      if (order.customer_id !== customerId) {
        throw new AppError(
          403,
          "FORBIDDEN_OPERATION",
          "You do not have access to this order",
        );
      }

      res.json({
        success: true,
        data: order,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: (req as any).requestId,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/customer/orders/:id/cancel
 * Customer cancels order (allowed while PLACED)
 */
customerRouter.post(
  "/orders/:id/cancel",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const customerId = req.user!.id;
      const orderId = req.params.id;
      const validated = OrderCancelSchema.parse(req.body);

      const order = await orderService.customerCancelOrder(
        customerId,
        orderId,
        validated.reason_code || validated.reasonCode || "CUSTOMER_CANCELLED",
        validated.note,
      );

      res.json({
        success: true,
        data: order,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: (req as any).requestId,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/customer/orders/:id/delivery
 * Returns the live delivery status and courier location for an order
 */
customerRouter.get(
  "/orders/:id/delivery",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const customerId = req.user!.id;
      const orderId = req.params.id;
      const order = await orderService.getOrderById(orderId);

      if (!order || order.customer_id !== customerId) {
        throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
      }

      const delivery = await deliveryRepository.findByOrderId(orderId);
      if (!delivery) {
        return res.json({
          data: null,
          requestId: (req as any).requestId,
        });
      }

      let riderLiveLocation = null;
      if (delivery.assigned_rider_id) {
        riderLiveLocation = await riderLocationStore.getLatestLocation(
          delivery.assigned_rider_id,
        );
      }

      res.json({
        data: {
          delivery,
          riderLocation: riderLiveLocation,
        },
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/customer/orders/:id/track
 * Full privacy-preserving live tracking payload for customer mobile & web
 */
customerRouter.get(
  "/orders/:id/track",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const customerId = req.user!.id;
      const orderId = req.params.id;

      const tracking = await dispatchService.getCustomerTracking(
        orderId,
        customerId,
        false,
      );

      res.json({
        data: tracking,
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  },
);
