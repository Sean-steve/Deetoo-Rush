import { Router, Response, NextFunction } from "express";
import { config } from "@deetoo/config";
import { getDbPool } from "../../db/client";
import { AppError } from "../../middleware/error-handler";
import {
  requireAuth,
  requireRole,
  AuthenticatedRequest,
} from "../auth/auth.middleware";
import { riderRepository } from "../rider/rider.repository";
import { trustService, TrustActor } from "./trust.service";
import { riderPerformanceService } from "./rider-performance.service";
import { riderWalletService } from "../finance/rider-wallet.service";

export const trustRouter = Router();
trustRouter.use(requireAuth);

async function buildTrustActor(req: AuthenticatedRequest): Promise<TrustActor> {
  const roles = req.user?.roles || req.session?.roles || ([] as any[]);
  let riderId = req.user?.rider_id || req.session?.rider_id;
  if (!riderId && roles.includes("rider" as any)) {
    const profile = await riderRepository.findProfileByUserId(req.user!.id);
    riderId = profile?.id;
  }
  return {
    id: req.user?.id || req.session?.user_id || "",
    name: req.user?.name || req.user?.email || req.session?.email || "User",
    email: req.user?.email,
    roles: roles as any,
    isStaff: roles.some((role: any) =>
      ["super_admin", "admin", "ops", "support", "finance"].includes(role),
    ),
    merchant_ids: req.user?.merchant_ids || req.session?.merchant_ids || [],
    rider_id: riderId,
  };
}

const trustStaff = [
  requireRole("super_admin", "admin", "ops", "support"),
];

const financeStaff = [
  requireRole("super_admin", "admin", "finance"),
];

trustRouter.post(
  "/disputes",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const actor = await buildTrustActor(req);
      const result = await trustService.openDispute(actor, {
        subject: String(req.body?.subject || ""),
        description: String(req.body?.description || ""),
        category: req.body?.category ? String(req.body.category) : undefined,
        order_id: req.body?.order_id ? String(req.body.order_id) : undefined,
        delivery_id: req.body?.delivery_id ? String(req.body.delivery_id) : undefined,
        payment_id: req.body?.payment_id ? String(req.body.payment_id) : undefined,
        refund_id: req.body?.refund_id ? String(req.body.refund_id) : undefined,
        allegation_code: req.body?.allegation_code ? String(req.body.allegation_code) : undefined,
        media_ids: Array.isArray(req.body?.media_ids) ? req.body.media_ids.map(String) : [],
      });
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

trustRouter.get(
  "/disputes",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const actor = await buildTrustActor(req);
      const cases = await trustService.listDisputes(actor);
      res.json({ success: true, data: { cases } });
    } catch (error) {
      next(error);
    }
  },
);

trustRouter.get(
  "/disputes/:id",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const actor = await buildTrustActor(req);
      res.json({
        success: true,
        data: await trustService.getDispute(req.params.id, actor),
      });
    } catch (error) {
      next(error);
    }
  },
);

trustRouter.post(
  "/disputes/:id/evidence",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const actor = await buildTrustActor(req);
      const allowed = new Set([
        "PHOTO",
        "VIDEO",
        "DOCUMENT",
        "DELIVERY_PROOF",
        "GPS_HISTORY",
        "ORDER_EVENT",
        "PAYMENT_EVIDENCE",
        "OTP_EVIDENCE",
        "SYSTEM_EVENT",
      ]);
      const evidenceType = String(req.body?.evidence_type || "DOCUMENT").toUpperCase();
      if (!allowed.has(evidenceType)) {
        throw new AppError(400, "INVALID_EVIDENCE_TYPE", "Unsupported dispute evidence type");
      }
      const evidence = await trustService.addEvidence(req.params.id, actor, {
        evidence_type: evidenceType as any,
        media_object_id: req.body?.media_object_id ? String(req.body.media_object_id) : undefined,
        summary: req.body?.summary ? String(req.body.summary).slice(0, 1000) : undefined,
        snapshot:
          req.body?.snapshot && typeof req.body.snapshot === "object"
            ? req.body.snapshot
            : undefined,
      });
      res.status(201).json({ success: true, data: evidence });
    } catch (error) {
      next(error);
    }
  },
);

trustRouter.get(
  "/orders/:orderId/authoritative-amount",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const actor = await buildTrustActor(req);
      const amount = await trustService.getAuthoritativeAmount(actor, req.params.orderId);
      res.json({ success: true, data: amount });
    } catch (error) {
      next(error);
    }
  },
);

trustRouter.post(
  "/conduct/extra-payment",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const actor = await buildTrustActor(req);
      const result = await trustService.reportExtraPaymentRequest(actor, {
        order_id: String(req.body?.order_id || ""),
        requested_amount_minor: Number(req.body?.requested_amount_minor),
        description: req.body?.description ? String(req.body.description) : undefined,
        media_ids: Array.isArray(req.body?.media_ids) ? req.body.media_ids.map(String) : [],
      });
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

trustRouter.get(
  "/conduct",
  ...trustStaff,
  async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      res.json({
        success: true,
        data: { reports: await trustService.listConductReports() },
      });
    } catch (error) {
      next(error);
    }
  },
);

trustRouter.post(
  "/conduct/:id/review",
  ...trustStaff,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const actor = await buildTrustActor(req);
      const decision =
        String(req.body?.decision || "").toUpperCase() === "SUBSTANTIATED"
          ? "SUBSTANTIATED"
          : "UNSUBSTANTIATED";
      const result = await trustService.reviewConduct(
        req.params.id,
        actor,
        decision,
        String(req.body?.note || "").slice(0, 2000),
      );
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

trustRouter.post(
  "/ratings",
  requireRole("customer"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const rating = await riderPerformanceService.rateDelivery(
        req.user!.id,
        String(req.body?.order_id || ""),
        Number(req.body?.rating),
        req.body?.comment ? String(req.body.comment) : undefined,
      );
      res.status(201).json({ success: true, data: rating });
    } catch (error) {
      next(error);
    }
  },
);

trustRouter.get(
  "/riders/:riderId/performance",
  ...trustStaff,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const days = req.query.days ? Number(req.query.days) : 30;
      res.json({
        success: true,
        data: await riderPerformanceService.getMetrics(req.params.riderId, {
          windowDays: Number.isFinite(days) ? days : 30,
        }),
      });
    } catch (error) {
      next(error);
    }
  },
);

trustRouter.get(
  "/cash-settlements",
  ...financeStaff,
  async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      res.json({
        success: true,
        data: { settlements: await riderWalletService.listPendingCashSettlements() },
      });
    } catch (error) {
      next(error);
    }
  },
);

trustRouter.post(
  "/cash-settlements/:id/confirm",
  ...financeStaff,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const reference = String(req.body?.provider_reference || "").trim();
      const result = await riderWalletService.confirmCashSettlement(
        req.params.id,
        req.user!.id,
        reference,
      );
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

trustRouter.post(
  "/cash-collections",
  ...financeStaff,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (String(process.env.CASH_ON_DELIVERY_ENABLED || "").toLowerCase() !== "true") {
        throw new AppError(
          409,
          "CASH_ON_DELIVERY_DISABLED",
          "Cash-on-delivery accounting exists, but COD intake is not enabled for this environment",
        );
      }
      const result = await riderWalletService.recordCashCollected({
        riderId: String(req.body?.rider_id || ""),
        deliveryId: String(req.body?.delivery_id || ""),
        orderId: String(req.body?.order_id || ""),
        amountMinor: Number(req.body?.amount_minor),
        actorUserId: req.user!.id,
        currency: req.body?.currency ? String(req.body.currency) : "KES",
      });
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

trustRouter.get(
  "/advisories",
  ...trustStaff,
  async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (config.storage.mode !== "postgres") {
        return res.json({ success: true, data: { advisories: [] } });
      }
      const result = await getDbPool().query(
        "SELECT * FROM marketplace_advisories ORDER BY generated_at DESC LIMIT 200",
      );
      res.json({ success: true, data: { advisories: result.rows } });
    } catch (error) {
      next(error);
    }
  },
);

trustRouter.patch(
  "/advisories/:id",
  ...trustStaff,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const status = String(req.body?.status || "").toUpperCase();
      if (!["ACKNOWLEDGED", "DISMISSED", "APPLIED"].includes(status)) {
        throw new AppError(400, "INVALID_ADVISORY_STATUS", "Advisory status must be acknowledged, dismissed or applied");
      }
      if (config.storage.mode !== "postgres") {
        return res.json({ success: true, data: { id: req.params.id, status } });
      }
      const result = await getDbPool().query(
        `UPDATE marketplace_advisories
            SET status=$1,reviewed_by=$2,reviewed_at=NOW()
          WHERE id=$3
          RETURNING *`,
        [status, req.user!.id, req.params.id],
      );
      if (!result.rows[0]) throw new AppError(404, "ADVISORY_NOT_FOUND", "Advisory not found");
      res.json({ success: true, data: result.rows[0] });
    } catch (error) {
      next(error);
    }
  },
);
