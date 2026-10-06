import { scopedResponseMiddleware } from '../../middleware/scoped-response';
import { AppError } from '../../middleware/error-handler';
import { orderScope, deny } from "../auth/scope";
import { deliveryRepository } from "../order/delivery.repository";
import { paymentRepository } from "../payment/payment.repository";
/**
 * DEETOO - Operations & Support Router
 * Sprint 13: Centralized Operations API, Support Cases, Manual Recovery, and Resilience Controls
 */

import { Router, Request, Response, NextFunction } from "express";
import {
  requireAuth,
  requireRole,
  AuthenticatedRequest,
} from "../auth/auth.middleware";
import { operationsRepository } from "./operations.repository";
import { operationalIncidentService } from "./incident.service";
import { operationalRecoveryService } from "./recovery.service";
import { supportService, SupportViewer } from "./support.service";
import { notificationService } from "./notification.service";
import { asyncJobService } from "./async-job.service";
import { fraudRiskService } from "./risk.service";
import { unifiedOrderViewService } from "./unified-order-view.service";
import { operationsSlaService } from "./sla.service";
import { controlTowerService } from "./control-tower.service";
import { launchReadinessService } from "./launch-readiness.service";

export const operationsRouter = Router();
operationsRouter.use(scopedResponseMiddleware);
operationsRouter.use(async (req: AuthenticatedRequest, res, next) => {
  if (req.method === "GET" || req.method === "HEAD") return next();
  requireAuth(req, res, (error) => {
    if (error) return next(error);
    const roles = req.user!.roles;
    if (roles.includes("finance" as any) && !roles.some(r => ["admin", "ops", "support"].includes(r))
      && !["/recovery/reconcile-payment", "/recovery/reconcile-ledger"].includes(req.path)) {
      return next(new AppError(403, "FORBIDDEN_ROLE", "Finance operational access is read-only"));
    }
    next();
  });
});

function buildViewer(req: AuthenticatedRequest): SupportViewer {
  const roles = req.user?.roles || req.session?.roles || ["customer"];
  const isStaff = roles.some((r: any) =>
    ["super_admin", "admin", "ops", "support", "finance"].includes(r),
  );
  return {
    id: req.user?.id || req.session?.user_id || "anonymous",
    name: req.user?.email || req.session?.email || "User",
    email: req.user?.email,
    roles,
    isStaff,
    merchant_ids: req.user?.merchant_ids || req.session?.merchant_ids || [],
    rider_id: req.user?.rider_id || req.session?.rider_id,
  };
}

// ============================================================================
// ADMIN / OPS / SUPPORT PROTECTED ENDPOINTS
// ============================================================================

const opsAuth = [requireAuth, requireRole("super_admin", "admin", "ops")];
const financeAuth = [requireAuth, requireRole("super_admin", "admin", "finance")];
const staffAuth = [
  requireAuth,
  requireRole("super_admin", "admin", "ops", "support", "finance"),
];

operationsRouter.get(
  "/control-tower",
  staffAuth,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ success: true, data: await controlTowerService.snapshot() });
    } catch (error) { next(error); }
  },
);

operationsRouter.get(
  "/supply",
  opsAuth,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ success: true, data: await controlTowerService.supplyByZone() });
    } catch (error) { next(error); }
  },
);

operationsRouter.get(
  "/launch-readiness",
  staffAuth,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ success: true, data: await launchReadinessService.getReadiness() });
    } catch (error) { next(error); }
  },
);

operationsRouter.patch(
  "/launch-readiness/:gate",
  requireAuth,
  requireRole("admin"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const data = await launchReadinessService.updateGate(
        req.params.gate,
        String(req.body?.status || '').toUpperCase(),
        req.user!.id,
        req.body?.evidence_reference ? String(req.body.evidence_reference) : undefined,
        req.body?.note ? String(req.body.note) : undefined,
      );
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

/**
 * Operations Overview Dashboard Metrics
 */
operationsRouter.get(
  "/overview",
  staffAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { incidents } = await operationsRepository.findIncidents({
        limit: 1000,
      });
      const { cases } = await operationsRepository.findSupportCases({
        limit: 1000,
      });
      const { jobs: deadLetterJobs } =
        await operationsRepository.findDeadLetterJobs({
          status: "DEAD_LETTER",
          limit: 1000,
        });
      const { signals: riskSignals } =
        await operationsRepository.findRiskSignals({
          status: "OPEN",
          limit: 1000,
        });
      const killSwitches = await operationsRepository.getKillSwitches();

      const openIncidents = incidents.filter(
        (i) =>
          i.status === "OPEN" ||
          i.status === "INVESTIGATING" ||
          i.status === "ACKNOWLEDGED",
      );
      const criticalIncidents = openIncidents.filter(
        (i) => i.severity === "CRITICAL",
      );
      const highIncidents = openIncidents.filter((i) => i.severity === "HIGH");
      const mediumIncidents = openIncidents.filter(
        (i) => i.severity === "MEDIUM",
      );

      const openSupportCases = cases.filter(
        (c) => c.status !== "RESOLVED" && c.status !== "CLOSED",
      );
      const urgentSupportCases = openSupportCases.filter(
        (c) => c.priority === "URGENT",
      );

      const activeKillSwitches = Object.entries(killSwitches).filter(
        ([_, v]) => v.enabled,
      ).length;

      res.json({
        success: true,
        data: {
          incidents: {
            totalOpen: openIncidents.length,
            critical: criticalIncidents.length,
            high: highIncidents.length,
            medium: mediumIncidents.length,
          },
          supportCases: {
            totalOpen: openSupportCases.length,
            urgent: urgentSupportCases.length,
          },
          deadLetterJobs: {
            total: deadLetterJobs.length,
          },
          riskSignals: {
            totalOpen: riskSignals.length,
          },
          killSwitches: {
            activeCount: activeKillSwitches,
            switches: killSwitches,
          },
          slaConfig: operationsSlaService.getConfig(),
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Universal Global Operations Search
 */
operationsRouter.get(
  "/search",
  staffAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const q = (req.query.q as string) || "";
      const results = await unifiedOrderViewService.globalOperationsSearch(q);
      res.json({ success: true, data: results });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Unified 360-Degree Order Operational View
 */
operationsRouter.get(
  "/orders/unified/:id",
  staffAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const view = await unifiedOrderViewService.getUnifiedOrderView(
        req.params.id,
      );
      if (!view) {
        return res
          .status(404)
          .json({ success: false, error: "Order not found" });
      }
      res.json({ success: true, data: view });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Operational Incidents Endpoints
 */
operationsRouter.get(
  "/incidents",
  staffAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filter = {
        status: req.query.status as any,
        severity: req.query.severity as any,
        type: req.query.type as any,
        order_id: req.query.order_id as any,
        delivery_id: req.query.delivery_id as any,
        payment_id: req.query.payment_id as any,
        limit: req.query.limit ? Number(req.query.limit) : 50,
        offset: req.query.offset ? Number(req.query.offset) : 0,
      };
      const result = await operationsRepository.findIncidents(filter);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

operationsRouter.get(
  "/incidents/:id",
  staffAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const incident = await operationsRepository.getIncidentById(
        req.params.id,
      );
      if (!incident) {
        return res
          .status(404)
          .json({ success: false, error: "Incident not found" });
      }
      res.json({ success: true, data: incident });
    } catch (err) {
      next(err);
    }
  },
);

operationsRouter.post(
  "/incidents/:id/acknowledge",
  staffAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const viewer = buildViewer(req);
      const incident = await operationalIncidentService.acknowledgeIncident(
        req.params.id,
        viewer.id,
        viewer.name,
      );
      res.json({ success: true, data: incident });
    } catch (err) {
      next(err);
    }
  },
);

operationsRouter.post(
  "/incidents/:id/investigate",
  staffAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const viewer = buildViewer(req);
      const incident = await operationalIncidentService.investigateIncident(
        req.params.id,
        viewer.id,
        viewer.name,
        req.body.note,
      );
      res.json({ success: true, data: incident });
    } catch (err) {
      next(err);
    }
  },
);

operationsRouter.post(
  "/incidents/:id/assign",
  staffAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const viewer = buildViewer(req);
      const incident = await operationalIncidentService.assignIncident(
        req.params.id,
        viewer.id,
        viewer.name,
        req.body.assigneeId,
        req.body.assigneeName,
      );
      res.json({ success: true, data: incident });
    } catch (err) {
      next(err);
    }
  },
);

operationsRouter.post(
  "/incidents/:id/resolve",
  staffAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const viewer = buildViewer(req);
      const incident = await operationalIncidentService.resolveIncident(
        req.params.id,
        viewer.id,
        viewer.name,
        req.body.resolutionNotes,
      );
      res.json({ success: true, data: incident });
    } catch (err) {
      next(err);
    }
  },
);

operationsRouter.post(
  "/incidents/:id/dismiss",
  staffAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const viewer = buildViewer(req);
      const incident = await operationalIncidentService.dismissIncident(
        req.params.id,
        viewer.id,
        viewer.name,
        req.body.reason,
      );
      res.json({ success: true, data: incident });
    } catch (err) {
      next(err);
    }
  },
);

operationsRouter.post(
  "/incidents/:id/reopen",
  staffAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const viewer = buildViewer(req);
      const incident = await operationalIncidentService.reopenIncident(
        req.params.id,
        viewer.id,
        viewer.name,
        req.body.reason,
      );
      res.json({ success: true, data: incident });
    } catch (err) {
      next(err);
    }
  },
);

operationsRouter.post(
  "/incidents/:id/timeline",
  staffAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const viewer = buildViewer(req);
      const entry = await operationalIncidentService.addTimelineNote(
        req.params.id,
        viewer.id,
        viewer.name,
        req.body.note,
        req.body.metadata,
      );
      res.json({ success: true, data: entry });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Operations Support Cases Endpoints
 */
operationsRouter.get(
  "/support/cases",
  staffAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const viewer = buildViewer(req);
      const filter = {
        status: req.query.status as any,
        priority: req.query.priority as any,
        order_id: req.query.order_id as any,
        limit: req.query.limit ? Number(req.query.limit) : 50,
        offset: req.query.offset ? Number(req.query.offset) : 0,
      };
      const result = await supportService.listCases(filter, viewer);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

operationsRouter.get(
  "/support/cases/:id/attachments/:mediaId/read-url",
  staffAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const viewer = buildViewer(req);
      const url = await supportService.getAttachmentReadUrl(
        req.params.id,
        req.params.mediaId,
        viewer,
      );
      res.json({ success: true, data: { url } });
    } catch (err) { next(err); }
  },
);

operationsRouter.get(
  "/support/cases/:id",
  staffAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const viewer = buildViewer(req);
      const result = await supportService.getCaseById(req.params.id, viewer);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

operationsRouter.post(
  "/support/cases",
  staffAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const viewer = buildViewer(req);
      const newCase = await supportService.createCase({
        ...req.body,
        creator: {
          id: viewer.id,
          name: viewer.name,
          role: viewer.roles[0] || "support",
        },
      });
      res.status(201).json({ success: true, data: newCase });
    } catch (err) {
      next(err);
    }
  },
);

operationsRouter.post(
  "/support/cases/:id/notes",
  staffAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const viewer = buildViewer(req);
      const note = await supportService.addNote(
        req.params.id,
        viewer,
        req.body.visibility || "INTERNAL",
        req.body.body,
        Array.isArray(req.body.media_ids) ? req.body.media_ids : [],
      );
      res.status(201).json({ success: true, data: note });
    } catch (err) {
      next(err);
    }
  },
);

operationsRouter.post(
  "/support/cases/:id/assign",
  staffAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const viewer = buildViewer(req);
      const updated = await supportService.assignCase(
        req.params.id,
        req.body.agentId,
        req.body.agentName,
        viewer,
      );
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },
);

operationsRouter.post(
  "/support/cases/:id/status",
  staffAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const viewer = buildViewer(req);
      const updated = await supportService.updateStatus(
        req.params.id,
        req.body.status,
        viewer,
      );
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },
);

operationsRouter.post(
  "/support/cases/:id/resolve",
  staffAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const viewer = buildViewer(req);
      const updated = await supportService.resolveCase(
        req.params.id,
        req.body.resolutionCode,
        req.body.resolutionNotes,
        viewer,
      );
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },
);

operationsRouter.post(
  "/support/cases/:id/force-close",
  requireAuth,
  requireRole("super_admin"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const viewer = buildViewer(req);
      const updated = await supportService.forceCloseCase(
        req.params.id,
        viewer,
        String(req.body.reason || ""),
      );
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },
);

operationsRouter.post(
  "/support/cases/:id/refund",
  staffAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const viewer = buildViewer(req);
      const result = await supportService.triggerSupportRefund(
        req.params.id,
        {
          orderId: req.body.orderId,
          amountMinor: Number(req.body.amountMinor),
          reasonCategory: req.body.reasonCategory || "OTHER",
          notes: req.body.notes || "Support refund granted",
        },
        viewer,
      );
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Controlled Manual Recovery Actions
 */
operationsRouter.post(
  "/recovery/retry-merchant-notification",
  opsAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const viewer = buildViewer(req);
      const result = await operationalRecoveryService.retryMerchantNotification(
        req.body.orderId,
        viewer,
      );
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

operationsRouter.post(
  "/recovery/retry-dispatch",
  opsAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const viewer = buildViewer(req);
      const result = await operationalRecoveryService.retryDispatch(
        req.body.deliveryId,
        viewer,
      );
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

operationsRouter.post(
  "/recovery/reconcile-payment",
  financeAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const viewer = buildViewer(req);
      const result = await operationalRecoveryService.reconcilePayment(
        req.body.paymentId,
        viewer,
      );
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

operationsRouter.post(
  "/recovery/retry-refund",
  financeAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const viewer = buildViewer(req);
      const result = await operationalRecoveryService.retryRefund(
        req.body.refundId,
        viewer,
      );
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

operationsRouter.post(
  "/recovery/retry-settlement",
  financeAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const viewer = buildViewer(req);
      const result = await operationalRecoveryService.retrySettlement(
        req.body.settlementId,
        viewer,
      );
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

operationsRouter.post(
  "/recovery/retry-payout",
  financeAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const viewer = buildViewer(req);
      const result = await operationalRecoveryService.retryRiderPayout(
        req.body.payoutId,
        viewer,
      );
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

operationsRouter.post(
  "/recovery/cancel-order",
  opsAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const viewer = buildViewer(req);
      const result = await operationalRecoveryService.cancelOrder(
        req.body.orderId,
        viewer,
        req.body.reasonCode || "ADMIN_INTERVENTION",
        req.body.notes,
      );
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

operationsRouter.post(
  "/recovery/manual-assign-rider",
  opsAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const viewer = buildViewer(req);
      const result = await operationalRecoveryService.manualAssignRider(
        req.body.deliveryId,
        req.body.riderId,
        viewer,
        req.body.note,
      );
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Run Automated Scanners On Demand
 */
operationsRouter.post(
  "/scan/all",
  opsAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const results = await operationalIncidentService.runAllScans();
      res.json({ success: true, data: results });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Notifications Management
 */
operationsRouter.get(
  "/notifications",
  staffAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filter = {
        recipient_type: req.query.recipient_type as any,
        recipient_id: req.query.recipient_id as any,
        channel: req.query.channel as any,
        status: req.query.status as any,
        limit: req.query.limit ? Number(req.query.limit) : 50,
        offset: req.query.offset ? Number(req.query.offset) : 0,
      };
      const result = await operationsRepository.findNotifications(filter);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

operationsRouter.post(
  "/notifications/:id/retry",
  opsAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const retried = await notificationService.retryNotification(
        req.params.id,
      );
      res.json({ success: true, data: retried });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Dead-Letter Queue (DLQ)
 */
operationsRouter.get(
  "/dead-letter-jobs",
  staffAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filter = {
        status: req.query.status as any,
        job_type: req.query.job_type as any,
        limit: req.query.limit ? Number(req.query.limit) : 50,
        offset: req.query.offset ? Number(req.query.offset) : 0,
      };
      const result = await operationsRepository.findDeadLetterJobs(filter);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

operationsRouter.post(
  "/dead-letter-jobs/:id/retry",
  opsAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const viewer = buildViewer(req);
      const result = await asyncJobService.retryJob(req.params.id, viewer);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Risk Signals & Fraud Controls
 */
operationsRouter.get(
  "/risk-signals",
  staffAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filter = {
        customer_id: req.query.customer_id as any,
        merchant_id: req.query.merchant_id as any,
        rider_id: req.query.rider_id as any,
        status: req.query.status as any,
        severity: req.query.severity as any,
        limit: req.query.limit ? Number(req.query.limit) : 50,
        offset: req.query.offset ? Number(req.query.offset) : 0,
      };
      const result = await operationsRepository.findRiskSignals(filter);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

operationsRouter.post(
  "/risk-signals/:id/review",
  staffAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const viewer = buildViewer(req);
      const result = await fraudRiskService.reviewSignal(
        req.params.id,
        req.body.status,
        viewer,
        req.body.notes,
      );
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

operationsRouter.get(
  "/risk-signals/score/:type/:id",
  staffAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const score = await fraudRiskService.calculateRiskScore(
        req.params.type.toUpperCase() as any,
        req.params.id,
      );
      res.json({ success: true, data: score });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Operational Kill Switches
 */
operationsRouter.get(
  "/kill-switches",
  staffAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const switches = await operationsRepository.getKillSwitches();
      res.json({ success: true, data: switches });
    } catch (err) {
      next(err);
    }
  },
);

operationsRouter.post(
  "/kill-switches",
  opsAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const viewer = buildViewer(req);
      await operationsRepository.setKillSwitch(
        req.body.keyName,
        Boolean(req.body.enabled),
        viewer.name,
        req.body.description,
      );
      const switches = await operationsRepository.getKillSwitches();
      res.json({ success: true, data: switches });
    } catch (err) {
      next(err);
    }
  },
);

// ============================================================================
// CUSTOMER SUPPORT WORKFLOW ENDPOINTS (User Authenticated)
// ============================================================================

export const participantSupportRouter = Router();

participantSupportRouter.use(requireAuth);

participantSupportRouter.post(
  "/cases",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const viewer = { ...buildViewer(req), isStaff: false };
      const isRider = viewer.roles.includes("rider");
      const isMerchant = viewer.roles.some((role: any) =>
        ["merchant","merchant_owner","merchant_manager","merchant_staff"].includes(role),
      );
      const created = await supportService.createCase({
        customer_id: !isRider && !isMerchant ? viewer.id : undefined,
        merchant_id: isMerchant ? viewer.merchant_ids?.[0] : undefined,
        rider_id: isRider ? viewer.rider_id : undefined,
        order_id: req.body.order_id || undefined,
        delivery_id: req.body.delivery_id || undefined,
        payment_id: req.body.payment_id || undefined,
        category: req.body.category || "OTHER",
        priority: req.body.priority || "MEDIUM",
        subject: String(req.body.subject || "Support request"),
        description: String(req.body.description || ""),
        creator: {
          id: viewer.id,
          name: viewer.name,
          role: viewer.roles[0] || "customer",
        },
      });
      res.status(201).json({ success: true, data: created });
    } catch (err) { next(err); }
  },
);

participantSupportRouter.get(
  "/cases",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const viewer = { ...buildViewer(req), isStaff: false };
      const result = await supportService.listCases({}, viewer);
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  },
);

participantSupportRouter.get(
  "/cases/:id/attachments/:mediaId/read-url",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const viewer = { ...buildViewer(req), isStaff: false };
      const url = await supportService.getAttachmentReadUrl(
        req.params.id,
        req.params.mediaId,
        viewer,
      );
      res.json({ success: true, data: { url } });
    } catch (err) { next(err); }
  },
);

participantSupportRouter.get(
  "/cases/:id",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const viewer = { ...buildViewer(req), isStaff: false };
      res.json({ success: true, data: await supportService.getCaseById(req.params.id, viewer) });
    } catch (err) { next(err); }
  },
);

participantSupportRouter.post(
  "/cases/:id/messages",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const viewer = { ...buildViewer(req), isStaff: false };
      const note = await supportService.addNote(
        req.params.id,
        viewer,
        "ALL_PARTICIPANTS",
        String(req.body.body || ""),
        Array.isArray(req.body.media_ids) ? req.body.media_ids : [],
      );
      res.status(201).json({ success: true, data: note });
    } catch (err) { next(err); }
  },
);

participantSupportRouter.post(
  "/cases/:id/resolution-response",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const viewer = { ...buildViewer(req), isStaff: false };
      const decision = req.body.decision === "DISPUTED" ? "DISPUTED" : "ACCEPTED";
      const updated = await supportService.respondToResolution(
        req.params.id,
        viewer,
        decision,
        req.body.comment ? String(req.body.comment) : undefined,
      );
      res.json({ success: true, data: updated });
    } catch (err) { next(err); }
  },
);

export const customerSupportRouter = Router();

customerSupportRouter.post(
  "/cases",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const viewer = {
        ...buildViewer(req),
        isStaff: false,
        roles: ["customer"],
        merchant_ids: [],
        rider_id: undefined,
      };
      if (req.body.order_id) await orderScope(req.user!, req.body.order_id);
      if (req.body.delivery_id) {
        const delivery = await deliveryRepository.findById(
          req.body.delivery_id,
        );
        if (!delivery) deny();
        await orderScope(req.user!, delivery!.order_id);
        if (req.body.order_id && req.body.order_id !== delivery!.order_id)
          deny();
      }
      if (req.body.payment_id) {
        const payment = await paymentRepository.findPaymentById(
          req.body.payment_id,
        );
        if (!payment) deny();
        await orderScope(req.user!, payment!.order_id, true);
        if (req.body.order_id && req.body.order_id !== payment!.order_id)
          deny();
      }
      const newCase = await supportService.createCase({
        customer_id: viewer.id,
        order_id: req.body.order_id,
        delivery_id: req.body.delivery_id,
        payment_id: req.body.payment_id,
        category: req.body.category || "ORDER_ISSUE",
        subject: req.body.subject,
        description: req.body.description,
        creator: { id: viewer.id, name: viewer.name, role: "customer" },
      });
      res.status(201).json({ success: true, data: newCase });
    } catch (err) {
      next(err);
    }
  },
);

customerSupportRouter.get(
  "/cases",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const viewer = {
        ...buildViewer(req),
        isStaff: false,
        roles: ["customer"],
        merchant_ids: [],
        rider_id: undefined,
      };
      const result = await supportService.listCases(
        { customer_id: viewer.id } as any,
        viewer,
      );
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

customerSupportRouter.get(
  "/cases/:id/attachments/:mediaId/read-url",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const viewer = {
        ...buildViewer(req),
        isStaff: false,
        roles: ["customer"],
        merchant_ids: [],
        rider_id: undefined,
      };
      const url = await supportService.getAttachmentReadUrl(
        req.params.id,
        req.params.mediaId,
        viewer,
      );
      res.json({ success: true, data: { url } });
    } catch (err) { next(err); }
  },
);

customerSupportRouter.get(
  "/cases/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const viewer = {
        ...buildViewer(req),
        isStaff: false,
        roles: ["customer"],
        merchant_ids: [],
        rider_id: undefined,
      };
      const result = await supportService.getCaseById(req.params.id, viewer);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

customerSupportRouter.post(
  "/cases/:id/notes",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const viewer = {
        ...buildViewer(req),
        isStaff: false,
        roles: ["customer"],
        merchant_ids: [],
        rider_id: undefined,
      };
      const note = await supportService.addNote(
        req.params.id,
        viewer,
        "ALL_PARTICIPANTS",
        req.body.body,
        Array.isArray(req.body.media_ids) ? req.body.media_ids : [],
      );
      res.status(201).json({ success: true, data: note });
    } catch (err) {
      next(err);
    }
  },
);

customerSupportRouter.post(
  "/cases/:id/resolution-response",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const viewer = {
        ...buildViewer(req),
        isStaff: false,
        roles: ["customer"],
        merchant_ids: [],
        rider_id: undefined,
      };
      const updated = await supportService.respondToResolution(
        req.params.id,
        viewer,
        req.body.decision === "DISPUTED" ? "DISPUTED" : "ACCEPTED",
        req.body.comment ? String(req.body.comment) : undefined,
      );
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },
);

customerSupportRouter.get(
  "/notifications",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const viewer = {
        ...buildViewer(req),
        isStaff: false,
        roles: ["customer"],
        merchant_ids: [],
        rider_id: undefined,
      };
      const result = await operationsRepository.findNotifications({
        recipient_type: "CUSTOMER",
        recipient_id: viewer.id,
        limit: 50,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

customerSupportRouter.post(
  "/notifications/:id/read",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const viewer = {
        ...buildViewer(req),
        isStaff: false,
        roles: ["customer"],
        merchant_ids: [],
        rider_id: undefined,
      };
      const result = await notificationService.markAsRead(
        req.params.id,
        viewer.id,
      );
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);
