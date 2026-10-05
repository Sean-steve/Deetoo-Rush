/**
 * DEETOO - Cart & Checkout Preparation Router
 * Endpoints for customer cart manipulation, promo codes, and authoritative quotes
 */

import { Router, Request, Response, NextFunction } from "express";
import {
  requireAuth,
  requireRole,
  AuthenticatedRequest,
} from "../auth/auth.middleware";
import {
  AddToCartSchema,
  UpdateCartItemSchema,
  ApplyPromoCodeSchema,
  GenerateQuoteSchema,
} from "@deetoo/validation";
import { cartService } from "./cart.service";
import { checkoutService } from "./checkout.service";
import { AppError } from "../../middleware/error-handler";

export const cartRouter = Router();
export const checkoutRouter = Router();

cartRouter.use(requireAuth, requireRole("customer"));
checkoutRouter.use(requireAuth, requireRole("customer"));

export function resolveCustomerId(req: AuthenticatedRequest): string {
  return req.user!.id;
}

// ==========================================
// 1. Cart Endpoints
// ==========================================

/**
 * GET /api/v1/cart
 * Retrieve current active enriched cart for customer
 */
cartRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const customerId = resolveCustomerId(req);
    const enriched = await cartService.getEnrichedCart(customerId);
    res.json({
      data: enriched,
      requestId: (req as any).requestId,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/cart/items
 * Add product with modifiers to customer cart
 */
cartRouter.post(
  "/items",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const customerId = resolveCustomerId(req);
      const input = AddToCartSchema.parse(req.body);
      const updated = await cartService.addItem(customerId, input);
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
 * PATCH /api/v1/cart/items/:id
 * Update quantity for a cart item
 */
cartRouter.patch(
  "/items/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const customerId = resolveCustomerId(req);
      const itemId = req.params.id;
      const input = UpdateCartItemSchema.parse(req.body);
      const updated = await cartService.updateItemQuantity(
        customerId,
        itemId,
        input.quantity,
      );
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
 * DELETE /api/v1/cart/items/:id
 * Remove product from customer cart
 */
cartRouter.delete(
  "/items/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const customerId = resolveCustomerId(req);
      const itemId = req.params.id;
      const updated = await cartService.removeItem(customerId, itemId);
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
 * DELETE /api/v1/cart
 * Clear customer's active cart
 */
cartRouter.delete(
  "/",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const customerId = resolveCustomerId(req);
      await cartService.clearCart(customerId);
      res.json({
        data: { success: true, message: "Cart cleared successfully" },
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/cart/promo
 * Apply promotion code to cart
 */
cartRouter.post(
  "/promo",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const customerId = resolveCustomerId(req);
      const input = ApplyPromoCodeSchema.parse(req.body);
      const updated = await cartService.applyPromo(customerId, input.code);
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
 * DELETE /api/v1/cart/promo
 * Remove applied promo code from cart
 */
cartRouter.delete(
  "/promo",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const customerId = resolveCustomerId(req);
      const updated = await cartService.removePromo(customerId);
      res.json({
        data: updated,
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ==========================================
// 2. Authoritative Checkout Quote Endpoints
// ==========================================

/**
 * POST /api/v1/checkout/quote
 * Generate authoritative checkout quote
 */
checkoutRouter.post(
  "/quote",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const customerId = resolveCustomerId(req);
      const input = GenerateQuoteSchema.parse(req.body);
      const quote = await checkoutService.generateQuote(customerId, input);
      res.json({
        data: quote,
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/checkout/quote/:id
 * Retrieve authoritative checkout quote
 */
checkoutRouter.get(
  "/quote/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const customerId = resolveCustomerId(req);
      const quoteId = req.params.id;
      const quote = await checkoutService.getQuote(quoteId, customerId);
      res.json({
        data: quote,
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  },
);

// Also mount quote endpoints directly on cart router for ease of frontend consumption
cartRouter.post(
  "/quote",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const customerId = resolveCustomerId(req);
      const input = GenerateQuoteSchema.parse(req.body);
      const quote = await checkoutService.generateQuote(customerId, input);
      res.json({
        data: quote,
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  },
);

cartRouter.get(
  "/quote/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const customerId = resolveCustomerId(req);
      const quoteId = req.params.id;
      const quote = await checkoutService.getQuote(quoteId, customerId);
      res.json({
        data: quote,
        requestId: (req as any).requestId,
      });
    } catch (err) {
      next(err);
    }
  },
);
