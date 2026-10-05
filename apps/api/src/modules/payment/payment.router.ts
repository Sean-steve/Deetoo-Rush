import { scopedResponseMiddleware } from '../../middleware/scoped-response';
import { orderScope } from "../auth/scope";
/**
 * DEETOO - Payment & Refund REST Router
 * Implements M-PESA & Card initiation, webhooks/callbacks, customer status,
 * and administrative refund & reconciliation endpoints (Sprint 11).
 */

import { Router, Response, NextFunction } from "express";
import { UserRole } from "@deetoo/types";
import {
  PaymentInitiateSchema,
  AdminRefundSchema,
  PaymentQueryFilterSchema,
} from "@deetoo/validation";
import {
  requireAuth,
  requireRole,
  AuthenticatedRequest,
} from "../auth/auth.middleware";
import { AppError } from "../../middleware/error-handler";
import { paymentService } from "./payment.service";
import { paymentProviderRegistry } from "./providers/provider-registry";
import { recordDarajaResult, findDarajaRequestByOriginator } from "./providers/daraja-evidence";
import { enqueuePaymentCommand } from "./payment-commands";

export const paymentRouter = Router();
paymentRouter.use(scopedResponseMiddleware);

// ==========================================
// 1. Provider Webhook / Callback Ingress (Public)
// ==========================================

/**
 * POST /api/v1/payments/providers/mpesa/callback
 * Safaricom Daraja STK Push Callback URL
 */
paymentRouter.post(
  "/providers/mpesa/callback",
  async (req, res: Response, next: NextFunction) => {
    try {
      const rawBody =
        (req as any).rawBody;
      const result = await paymentService.handleCallback(
        "MPESA",
        req.headers as Record<string, string>,
        rawBody,
        req.body,
      );

      // Standard Safaricom Daraja acknowledgement format
      return res.status(200).json({
        ResultCode: 0,
        ResultDesc: "Callback processed successfully",
        PaymentId: result.paymentId,
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/v1/payments/providers/mpesa/transaction-result
 * Safaricom Daraja Result URL for Transaction Status Query and Reversal commands.
 * These are async command acknowledgements, not the STK short callback above: the durable
 * evidence they carry is what actually verifies a capture or a reversal (ADR-007). Authenticated
 * by the same ingress-gateway secret as the STK callback; Safaricom itself carries no signature.
 */
paymentRouter.post(
  "/providers/mpesa/transaction-result",
  async (req, res: Response, next: NextFunction) => {
    try {
      const rawBody = (req as any).rawBody;
      const provider = paymentProviderRegistry.getProvider("MPESA");
      if (!provider.verifyCallback(req.headers as Record<string, string>, rawBody)) {
        throw new AppError(401, "INVALID_WEBHOOK_SIGNATURE", "Daraja result authentication failed");
      }
      await recordDarajaResult(req.body);
      const originatorConversationId = req.body?.Result?.OriginatorConversationID;
      const darajaRequest = typeof originatorConversationId === "string"
        ? await findDarajaRequestByOriginator(originatorConversationId)
        : null;
      if (darajaRequest?.kind === "QUERY") {
        await enqueuePaymentCommand(
          "VERIFY",
          darajaRequest.payment_id,
          `daraja-result:${originatorConversationId}`,
          {},
        );
      } else if (darajaRequest?.kind === "REVERSAL" && darajaRequest.refund_id) {
        await enqueuePaymentCommand(
          "REFUND",
          darajaRequest.payment_id,
          `daraja-result:${originatorConversationId}`,
          { refundId: darajaRequest.refund_id },
          darajaRequest.refund_id,
        );
      }
      // Unmatched results remain durable evidence in daraja_results for manual reconciliation.
      return res.status(200).json({ ResultCode: 0, ResultDesc: "Result accepted" });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/v1/payments/providers/mpesa/transaction-timeout
 * Safaricom Daraja Queue Timeout URL for the same commands. Safaricom's timeout payload carries
 * the same Result envelope shape with a non-zero ResultCode, so it is recorded identically; it
 * never fabricates a success outcome.
 */
paymentRouter.post(
  "/providers/mpesa/transaction-timeout",
  async (req, res: Response, next: NextFunction) => {
    try {
      const rawBody = (req as any).rawBody;
      const provider = paymentProviderRegistry.getProvider("MPESA");
      if (!provider.verifyCallback(req.headers as Record<string, string>, rawBody)) {
        throw new AppError(401, "INVALID_WEBHOOK_SIGNATURE", "Daraja timeout authentication failed");
      }
      await recordDarajaResult(req.body);
      const originatorConversationId = req.body?.Result?.OriginatorConversationID;
      const darajaRequest = typeof originatorConversationId === "string"
        ? await findDarajaRequestByOriginator(originatorConversationId)
        : null;
      if (darajaRequest?.kind === "QUERY") {
        await enqueuePaymentCommand(
          "VERIFY",
          darajaRequest.payment_id,
          `daraja-timeout:${originatorConversationId}`,
          {},
        );
      } else if (darajaRequest?.kind === "REVERSAL" && darajaRequest.refund_id) {
        await enqueuePaymentCommand(
          "REFUND",
          darajaRequest.payment_id,
          `daraja-timeout:${originatorConversationId}`,
          { refundId: darajaRequest.refund_id },
          darajaRequest.refund_id,
        );
      }
      return res.status(200).json({ ResultCode: 0, ResultDesc: "Timeout accepted" });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/v1/payments/providers/card/webhook
 * Tokenized Card Webhook endpoint
 */
paymentRouter.post(
  "/providers/card/webhook",
  async (req, res: Response, next: NextFunction) => {
    try {
      const rawBody =
        (req as any).rawBody;
      const result = await paymentService.handleCallback(
        "CARD",
        req.headers as Record<string, string>,
        rawBody,
        req.body,
      );

      return res.status(200).json({
        received: true,
        duplicate: result.duplicate,
        paymentId: result.paymentId,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ==========================================
// 2. Customer Payment Endpoints (Authenticated)
// ==========================================

/**
 * POST /api/v1/payments/initiate
 * Initiate payment for an order via M-PESA STK Push or Card
 */
paymentRouter.post(
  "/initiate",
  requireAuth,
  requireRole("customer"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const validated = PaymentInitiateSchema.parse(req.body);
      const orderId = req.body.order_id || req.body.orderId;
      if (!orderId) {
        throw new AppError(
          400,
          "ORDER_ID_REQUIRED",
          "order_id is required to initiate payment",
        );
      }

      const idempotencyKey = (req.headers["idempotency-key"] ||
        req.headers["x-idempotency-key"]) as string | undefined;

      const payment = await paymentService.initiatePayment({
        orderId,
        customerId: req.user!.id,
        method: validated.method,
        phone: validated.phone,
        paymentMethodToken: validated.payment_method_token,
        idempotencyKey,
      });

      return res.status(201).json({
        success: true,
        data: payment,
        message: "Payment initiated successfully",
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/v1/payments/:id
 * Retrieve payment status by ID
 */
paymentRouter.get(
  "/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const payment = await paymentService.getPayment(req.params.id);
      if (!payment) {
        throw new AppError(404, "PAYMENT_NOT_FOUND", "Payment not found");
      }

      // Access control: customer can only view own payments unless admin/support
      const isStaffOrAdmin = req.user!.roles.some((r) =>
        [UserRole.ADMIN, UserRole.OPS, UserRole.SUPPORT, UserRole.FINANCE].includes(r),
      );
      if (!isStaffOrAdmin && payment.customer_id !== req.user!.id) {
        throw new AppError(403, "FORBIDDEN", "Access to payment denied");
      }

      return res.status(200).json({
        success: true,
        data: payment,
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/v1/payments/order/:orderId
 * Retrieve all payment attempts for an order
 */
paymentRouter.get(
  "/order/:orderId",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      await orderScope(req.user!, req.params.orderId, true);
      const payments = await paymentService.getPaymentsByOrder(
        req.params.orderId,
      );
      return res.status(200).json({
        success: true,
        data: payments,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ==========================================
// 3. Admin & Support Operations
// ==========================================

/**
 * GET /api/v1/payments/admin/all
 * List payments with filters & pagination
 */
paymentRouter.get(
  "/admin/all",
  requireAuth,
  requireRole(UserRole.ADMIN, UserRole.FINANCE, UserRole.SUPPORT),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const filters = PaymentQueryFilterSchema.parse(req.query);
      const result = await paymentService.listPayments(filters);
      return res.status(200).json({
        success: true,
        data: result.payments,
        meta: {
          total: result.total,
          page: filters.page,
          limit: filters.limit,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/v1/payments/admin/:id/refunds
 * Process refund (full or partial)
 */
paymentRouter.post(
  "/admin/:id/refunds",
  requireAuth,
  requireRole(UserRole.ADMIN, UserRole.FINANCE, UserRole.SUPPORT),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user!.roles.some(r => [UserRole.ADMIN, UserRole.FINANCE].includes(r))) {
        throw new AppError(403, "REFUND_APPROVAL_REQUIRED", "Support refund execution requires the configured approval workflow");
      }
      const validated = AdminRefundSchema.parse(req.body);
      const refund = await paymentService.requestRefund({
        paymentId: req.params.id,
        amountMinor: validated.amount_minor,
        amount: validated.amount,
        reasonCode: validated.reason_code,
        note: validated.note,
        requestedBy: req.user!.id,
        idempotencyKey: req.get("Idempotency-Key"),
      });

      return res.status(201).json({
        success: true,
        data: refund,
        message: "Refund processed successfully",
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/v1/payments/admin/:id/refunds
 * List refunds for a payment
 */
paymentRouter.get(
  "/admin/:id/refunds",
  requireAuth,
  requireRole(UserRole.ADMIN, UserRole.FINANCE, UserRole.SUPPORT),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const refunds = await paymentService.getRefundsByPayment(req.params.id);
      return res.status(200).json({
        success: true,
        data: refunds,
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/v1/payments/admin/:id/reconcile
 * Trigger payment reconciliation against provider
 */
paymentRouter.post(
  "/admin/:id/reconcile",
  requireAuth,
  requireRole(UserRole.ADMIN, UserRole.FINANCE),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const reconciled = await paymentService.reconcilePayment(req.params.id);
      return res.status(200).json({
        success: true,
        data: reconciled,
        message: "Payment successfully reconciled",
      });
    } catch (error) {
      next(error);
    }
  },
);

paymentRouter.post('/admin/refunds/:id/approve', requireAuth, requireRole(UserRole.ADMIN,UserRole.FINANCE), async(req:AuthenticatedRequest,res,next)=>{
  try { res.json({success:true,data:await paymentService.approveRefund(req.params.id,req.user!.id)}); } catch(error){next(error);}
});

paymentRouter.post('/admin/commands/:id/retry', requireAuth, requireRole(UserRole.ADMIN,UserRole.FINANCE), async(req:AuthenticatedRequest,res,next)=>{
  try {
    const {retryReviewedPaymentCommand}=await import('./payment-commands');
    await retryReviewedPaymentCommand(req.params.id,req.user!.id);
    res.json({success:true,message:'Payment recovery queued'});
  }catch(error){next(error);}
});
