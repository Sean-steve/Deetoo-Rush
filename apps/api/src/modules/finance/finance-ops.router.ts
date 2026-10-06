import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import { config } from "@deetoo/config";
import { UserRole, PaymentReconciliationStatus } from "@deetoo/types";
import { getDbPool } from "../../db/client";
import {
  requireAuth,
  requireRole,
  AuthenticatedRequest,
} from "../auth/auth.middleware";
import { AppError } from "../../middleware/error-handler";
import { ledgerRepository } from "./ledger.repository";
import { reconciliationService } from "./reconciliation.service";
import { paymentService } from "../payment/payment.service";
import { orderRepository } from "../order/order.repository";

const commissionRuleSchema = z.object({
  merchant_id: z.string().uuid().nullable().optional(),
  percentage_rate: z.number().min(0).max(1),
  fixed_fee_minor: z.number().int().min(0).optional().default(0),
  effective_from: z.string().datetime().optional(),
  effective_until: z.string().datetime().nullable().optional(),
});

const reviewRequestSchema = z.object({
  reason: z.string().trim().min(10).max(2000),
});

const riderRuleSchema = z.object({
  base_amount_minor: z.number().int().min(0),
  per_kilometre_amount_minor: z.number().int().min(0),
  included_distance_meters: z.number().int().min(0).optional().default(0),
  waiting_amount_minor_per_minute: z.number().int().min(0),
  included_waiting_minutes: z.number().int().min(0).optional().default(0),
  zone_peak_bonus_minor: z.number().int().min(0).optional().default(0),
  stacked_order_component_minor: z.number().int().min(0).optional().default(0),
  effective_from: z.string().datetime().optional(),
  effective_until: z.string().datetime().nullable().optional(),
});

function reconciliationBucket(status?: string | null): "matched" | "pending" | "mismatched" | "manual_review" {
  switch (status) {
    case PaymentReconciliationStatus.MATCHED:
      return "matched";
    case PaymentReconciliationStatus.MISMATCHED:
      return "mismatched";
    case PaymentReconciliationStatus.REVIEW_REQUIRED:
      return "manual_review";
    default:
      return "pending";
  }
}

function journalLabel(transactionType: string): string {
  const type = transactionType.toUpperCase();
  if (type.includes("REFUND")) return "Refund";
  if (type.includes("PAYMENT")) return "Customer payment";
  if (type.includes("COMMISSION")) return "Platform commission";
  if (type.includes("MERCHANT")) return "Merchant payable";
  if (type.includes("RIDER") || type.includes("DELIVERY")) return "Rider earning";
  return transactionType
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/(^|\s)\S/g, (value) => value.toUpperCase());
}

function financeMerchantId(req: AuthenticatedRequest): string {
  const roles = req.user?.roles || [];
  const isMerchant = roles.some((role) =>
    ["merchant", "merchant_owner", "merchant_manager", "merchant_staff"].includes(String(role)),
  );
  if (!isMerchant) {
    throw new AppError(403, "FORBIDDEN_ROLE", "Merchant account required");
  }
  const merchantId = req.user?.merchant_ids?.[0];
  if (!merchantId) {
    throw new AppError(403, "MERCHANT_SCOPE_REQUIRED", "Merchant scope required");
  }
  return merchantId;
}

export const financeOpsRouter = Router();
financeOpsRouter.use(requireAuth);

financeOpsRouter.get(
  "/overview",
  requireRole(UserRole.ADMIN, UserRole.FINANCE),
  async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const [accounts, settlements, payouts, paymentResult, report] = await Promise.all([
        ledgerRepository.getAllAccounts(),
        ledgerRepository.findSettlements(),
        ledgerRepository.findRiderPayouts(),
        paymentService.listPayments({ page: 1, limit: 500 }),
        reconciliationService.generateReport(),
      ]);

      const accountSummaries = new Map<string, number>();
      for (const account of accounts) {
        const balance = await ledgerRepository.recalculateAccountBalance(account.id);
        const key = String((account as any).account_type || (account as any).type || "OTHER");
        accountSummaries.set(key, (accountSummaries.get(key) || 0) + balance);
      }

      const reconciliation = { matched: 0, pending: 0, mismatched: 0, manual_review: 0 };
      for (const payment of paymentResult.payments) {
        reconciliation[reconciliationBucket(payment.reconciliation_status)]++;
      }

      let automationRuns: any[] = [];
      if (config.storage.mode === "postgres") {
        const runRows = await getDbPool().query(
          "SELECT run_type,status,result,error_message,started_at,finished_at FROM finance_automation_runs ORDER BY finished_at DESC LIMIT 20",
        );
        automationRuns = runRows.rows;
      }

      return res.json({
        data: {
          account_balances: Object.fromEntries(accountSummaries),
          payment_count: paymentResult.total,
          reconciliation,
          reconciliation_balanced: report.all_balanced,
          settlement_queue: {
            calculated: settlements.filter((item) => ["DRAFT", "CALCULATED"].includes(item.status)).length,
            approved: settlements.filter((item) => item.status === "APPROVED").length,
            failed: settlements.filter((item) => item.status === "FAILED").length,
          },
          payout_queue: {
            calculated: payouts.filter((item) => ["DRAFT", "CALCULATED"].includes(item.status)).length,
            approved: payouts.filter((item) => item.status === "APPROVED").length,
            failed: payouts.filter((item) => item.status === "FAILED").length,
          },
          automation: {
            reconciliation_interval_ms: Number(process.env.AUTOMATION_RECONCILIATION_INTERVAL_MS || 120000),
            batch_generation_interval_ms: Number(process.env.AUTOMATION_FINANCE_BATCH_INTERVAL_MS || 900000),
            approval_mode: "MAKER_CHECKER",
            runs: automationRuns,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

financeOpsRouter.get(
  "/payments",
  requireRole(UserRole.ADMIN, UserRole.FINANCE, UserRole.SUPPORT),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const result = await paymentService.listPayments({
        page: Number(req.query.page || 1),
        limit: Math.min(Number(req.query.limit || 50), 100),
        status: req.query.status as string | undefined,
        provider: req.query.provider as string | undefined,
        method: req.query.method as string | undefined,
        reconciliation_status: req.query.reconciliation_status as string | undefined,
        search: req.query.search as string | undefined,
      });
      const payments = await Promise.all(
        result.payments.map(async (payment) => {
          const order = await orderRepository.findById(payment.order_id);
          return {
            id: payment.id,
            order_id: payment.order_id,
            order_number: (order as any)?.public_code || payment.order_id,
            amount_minor: payment.amount_minor,
            captured_minor: payment.captured_minor,
            refunded_minor: payment.refunded_minor,
            currency: payment.currency,
            method: payment.method,
            provider: payment.provider,
            provider_reference:
              payment.mpesa_receipt_number ||
              payment.provider_reference ||
              payment.provider_payment_id ||
              null,
            internal_status: payment.status,
            reconciliation_status: payment.reconciliation_status || PaymentReconciliationStatus.UNRECONCILED,
            failure_reason: payment.failure_message || payment.failure_code || null,
            created_at: payment.created_at,
            details: {
              raw_payment_id: payment.id,
              raw_order_id: payment.order_id,
              merchant_request_id: payment.merchant_request_id || null,
              checkout_request_id: payment.checkout_request_id || null,
            },
          };
        }),
      );
      return res.json({ data: payments, meta: { total: result.total } });
    } catch (error) {
      next(error);
    }
  },
);

financeOpsRouter.get(
  "/journal",
  requireRole(UserRole.ADMIN, UserRole.FINANCE),
  async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const transactions = (await ledgerRepository.listTransactions()).slice(0, 100);
      const events = await Promise.all(
        transactions.map(async (transaction) => {
          const order =
            String(transaction.reference_type).toUpperCase() === "ORDER"
              ? await orderRepository.findById(transaction.reference_id)
              : null;
          const label = journalLabel(transaction.transaction_type);
          const subject = order
            ? `Order ${(order as any).public_code || transaction.reference_id}`
            : transaction.description;
          return {
            id: transaction.id,
            event: `${label} — ${subject}`,
            amount_minor: transaction.total_amount_minor,
            currency: transaction.currency,
            effective_at: transaction.effective_at,
            status: transaction.status,
            details: {
              raw_transaction_id: transaction.id,
              transaction_type: transaction.transaction_type,
              reference_type: transaction.reference_type,
              reference_id: transaction.reference_id,
              idempotency_key: transaction.idempotency_key,
              entries: await ledgerRepository.findEntriesByTransactionId(transaction.id),
            },
          };
        }),
      );
      return res.json({ data: events });
    } catch (error) {
      next(error);
    }
  },
);

financeOpsRouter.get(
  "/reconciliation",
  requireRole(UserRole.ADMIN, UserRole.FINANCE),
  async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const [payments, report] = await Promise.all([
        paymentService.listPayments({ page: 1, limit: 500 }),
        reconciliationService.generateReport(),
      ]);
      const counts = { matched: 0, pending: 0, mismatched: 0, manual_review: 0 };
      for (const payment of payments.payments) {
        counts[reconciliationBucket(payment.reconciliation_status)]++;
      }
      let lastRuns: any[] = [];
      if (config.storage.mode === "postgres") {
        const rows = await getDbPool().query(
          "SELECT status,result,error_message,started_at,finished_at FROM finance_automation_runs WHERE run_type='RECONCILIATION' ORDER BY finished_at DESC LIMIT 10",
        );
        lastRuns = rows.rows;
      }
      return res.json({
        data: {
          ...counts,
          all_balanced: report.all_balanced,
          exceptions: report,
          last_runs: lastRuns,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

financeOpsRouter.post(
  "/reconciliation/run",
  requireRole(UserRole.ADMIN, UserRole.FINANCE),
  async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startedAt = new Date();
    try {
      const result = await reconciliationService.autoReconcile();
      if (config.storage.mode === "postgres") {
        await getDbPool().query(
          `INSERT INTO finance_automation_runs(run_type,status,result,started_at,finished_at)
           VALUES('RECONCILIATION','SUCCEEDED',$1,$2,NOW())`,
          [JSON.stringify(result), startedAt.toISOString()],
        );
      }
      return res.json({ data: result });
    } catch (error) {
      if (config.storage.mode === "postgres") {
        await getDbPool().query(
          `INSERT INTO finance_automation_runs(run_type,status,result,error_message,started_at,finished_at)
           VALUES('RECONCILIATION','FAILED','{}'::jsonb,$1,$2,NOW())`,
          [error instanceof Error ? error.message : String(error), startedAt.toISOString()],
        ).catch(() => undefined);
      }
      next(error);
    }
  },
);

financeOpsRouter.get(
  "/money-out/approval-queue",
  requireRole(UserRole.ADMIN, UserRole.FINANCE),
  async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const [settlements, payouts] = await Promise.all([
        ledgerRepository.findSettlements(),
        ledgerRepository.findRiderPayouts(),
      ]);
      const data = [
        ...settlements
          .filter((item) => ["DRAFT", "CALCULATED"].includes(item.status))
          .map((item) => ({
            id: item.id,
            resource_type: "MERCHANT_SETTLEMENT",
            reference: item.settlement_number,
            owner_id: item.merchant_id,
            amount_minor: item.net_settlement_amount_minor,
            currency: item.currency,
            status: item.status,
            created_at: item.created_at,
          })),
        ...payouts
          .filter((item) => ["DRAFT", "CALCULATED"].includes(item.status))
          .map((item) => ({
            id: item.id,
            resource_type: "RIDER_PAYOUT",
            reference: item.payout_number,
            owner_id: item.rider_id,
            amount_minor: item.amount_minor,
            currency: item.currency,
            status: item.status,
            created_at: item.created_at,
          })),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return res.json({ data });
    } catch (error) {
      next(error);
    }
  },
);

financeOpsRouter.get(
  "/commercial/commission-rules",
  requireRole(UserRole.ADMIN, UserRole.FINANCE),
  async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (config.storage.mode !== "postgres") {
        return res.json({ data: [await ledgerRepository.getCommissionRuleForMerchant(null)] });
      }
      const result = await getDbPool().query(`
        SELECT r.*,m.display_name AS merchant_name
        FROM merchant_commission_rules r
        LEFT JOIN merchants m ON m.id=r.merchant_id
        ORDER BY (r.merchant_id IS NULL) DESC,r.effective_from DESC
      `);
      return res.json({ data: result.rows.map((row) => ({ ...row, percentage_rate: Number(row.percentage_rate) })) });
    } catch (error) {
      next(error);
    }
  },
);

financeOpsRouter.post(
  "/commercial/commission-rules",
  requireRole(UserRole.ADMIN, UserRole.FINANCE),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (config.storage.mode !== "postgres") {
        throw new AppError(409, "POSTGRES_REQUIRED", "Commercial rules require durable PostgreSQL storage");
      }
      const input = commissionRuleSchema.parse(req.body);
      const effectiveFrom = input.effective_from || new Date().toISOString();
      const client = await getDbPool().connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `UPDATE merchant_commission_rules
           SET effective_until=$2,status=CASE WHEN effective_from < $2 THEN status ELSE 'INACTIVE' END
           WHERE merchant_id IS NOT DISTINCT FROM $1::uuid
             AND status='ACTIVE'
             AND effective_from < $2
             AND (effective_until IS NULL OR effective_until > $2)`,
          [input.merchant_id || null, effectiveFrom],
        );
        const created = await client.query(
          `INSERT INTO merchant_commission_rules(
             merchant_id,percentage_rate,fixed_fee_minor,effective_from,effective_until,status,created_by,rule_source
           ) VALUES($1,$2,$3,$4,$5,'ACTIVE',$6,$7)
           RETURNING *`,
          [
            input.merchant_id || null,
            input.percentage_rate,
            input.fixed_fee_minor,
            effectiveFrom,
            input.effective_until || null,
            req.user!.id,
            input.merchant_id ? "NEGOTIATED" : "PLATFORM",
          ],
        );
        await client.query("COMMIT");
        return res.status(201).json({ data: { ...created.rows[0], percentage_rate: Number(created.rows[0].percentage_rate) } });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      next(error);
    }
  },
);

financeOpsRouter.get(
  "/commercial/review-requests",
  requireRole(UserRole.ADMIN, UserRole.FINANCE),
  async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (config.storage.mode !== "postgres") return res.json({ data: [] });
      const result = await getDbPool().query(`
        SELECT r.*,m.display_name AS merchant_name
        FROM merchant_commission_review_requests r
        JOIN merchants m ON m.id=r.merchant_id
        ORDER BY CASE r.status WHEN 'OPEN' THEN 0 ELSE 1 END,r.created_at DESC
      `);
      return res.json({ data: result.rows });
    } catch (error) {
      next(error);
    }
  },
);

financeOpsRouter.get(
  "/commercial/merchant-rate",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const merchantId = financeMerchantId(req);
      const rule = await ledgerRepository.getCommissionRuleForMerchant(merchantId);
      return res.json({ data: rule });
    } catch (error) {
      next(error);
    }
  },
);

financeOpsRouter.post(
  "/commercial/review-requests",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const merchantId = financeMerchantId(req);
      const { reason } = reviewRequestSchema.parse(req.body);
      if (config.storage.mode !== "postgres") {
        return res.status(201).json({
          data: {
            id: "memory-review-request",
            merchant_id: merchantId,
            reason,
            status: "OPEN",
          },
        });
      }
      const currentRule = await ledgerRepository.getCommissionRuleForMerchant(merchantId);
      const created = await getDbPool().query(
        `INSERT INTO merchant_commission_review_requests(merchant_id,requested_by,current_rule_id,reason)
         VALUES($1,$2,$3,$4)
         RETURNING *`,
        [merchantId, req.user!.id, currentRule.id === "default" ? null : currentRule.id, reason],
      );
      return res.status(201).json({ data: created.rows[0] });
    } catch (error) {
      next(error);
    }
  },
);

financeOpsRouter.get(
  "/commercial/rider-earning-rules",
  requireRole(UserRole.ADMIN, UserRole.FINANCE),
  async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (config.storage.mode !== "postgres") {
        return res.json({
          data: [{
            id: "default",
            base_amount_minor: 15000,
            per_kilometre_amount_minor: 3000,
            included_distance_meters: 2000,
            waiting_amount_minor_per_minute: 500,
            included_waiting_minutes: 10,
            zone_peak_bonus_minor: 0,
            stacked_order_component_minor: 0,
            effective_from: "2020-01-01T00:00:00.000Z",
            status: "ACTIVE",
          }],
        });
      }
      const result = await getDbPool().query(
        "SELECT * FROM rider_earning_rules ORDER BY effective_from DESC",
      );
      return res.json({ data: result.rows });
    } catch (error) {
      next(error);
    }
  },
);

financeOpsRouter.post(
  "/commercial/rider-earning-rules",
  requireRole(UserRole.ADMIN, UserRole.FINANCE),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (config.storage.mode !== "postgres") {
        throw new AppError(409, "POSTGRES_REQUIRED", "Rider earning rules require durable PostgreSQL storage");
      }
      const input = riderRuleSchema.parse(req.body);
      const effectiveFrom = input.effective_from || new Date().toISOString();
      const client = await getDbPool().connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `UPDATE rider_earning_rules
           SET effective_until=$1
           WHERE status='ACTIVE' AND effective_from < $1
             AND (effective_until IS NULL OR effective_until > $1)`,
          [effectiveFrom],
        );
        const created = await client.query(
          `INSERT INTO rider_earning_rules(
             base_amount_minor,per_kilometre_amount_minor,included_distance_meters,
             waiting_amount_minor_per_minute,included_waiting_minutes,zone_peak_bonus_minor,
             stacked_order_component_minor,effective_from,effective_until,status,created_by
           ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'ACTIVE',$10)
           RETURNING *`,
          [
            input.base_amount_minor,
            input.per_kilometre_amount_minor,
            input.included_distance_meters,
            input.waiting_amount_minor_per_minute,
            input.included_waiting_minutes,
            input.zone_peak_bonus_minor,
            input.stacked_order_component_minor,
            effectiveFrom,
            input.effective_until || null,
            req.user!.id,
          ],
        );
        await client.query("COMMIT");
        return res.status(201).json({ data: created.rows[0] });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      next(error);
    }
  },
);
