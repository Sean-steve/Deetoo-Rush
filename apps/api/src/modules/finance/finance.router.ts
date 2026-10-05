import { hasAnyRole, merchantScope, deny } from "../auth/scope";
import { riderRepository } from "../rider/rider.repository";
/**
 * DEETOO - Financial Ledger, Settlement & Profitability REST Router
 * Sprint 12: Endpoints for double-entry ledger, settlements, rider payouts, profitability, and statements
 */

import { Router, Response, NextFunction } from "express";
import {
  UserRole,
  LedgerAccountType,
  LedgerAccountOwnerType,
} from "@deetoo/types";
import {
  SettlementCalculateSchema,
  SettlementApproveSchema,
  SettlementPaySchema,
  RiderPayoutCalculateSchema,
  RiderPayoutApproveSchema,
  RiderPayoutPaySchema,
  FinancialAdjustmentCreateSchema,
} from "@deetoo/validation";
import {
  requireAuth,
  requireRole,
  AuthenticatedRequest,
} from "../auth/auth.middleware";
import { AppError } from "../../middleware/error-handler";
import { ledgerRepository } from "./ledger.repository";
import { settlementService } from "./settlement.service";
import { riderPayoutService } from "./rider-payout.service";
import { profitabilityService } from "./profitability.service";
import { reconciliationService } from "./reconciliation.service";
import { financialPostingService } from "./financial-posting.service";
import { disbursementService } from "./disbursement.service";

export const financeRouter = Router();
async function financeMerchant(req: AuthenticatedRequest, optional = false) {
  const id = req.query.merchant_id as string | undefined;
  if (hasAnyRole(req.user!, ["admin", "finance"])) {
    if (!id && !optional)
      throw new AppError(400, "MERCHANT_REQUIRED", "merchant_id required");
    return id;
  }
  if (!hasAnyRole(req.user!, ["merchant_owner", "merchant_manager"])) deny();
  const own = id || req.user!.merchant_ids?.[0];
  if (!own) deny();
  await merchantScope(req.user!, own!);
  return own;
}
async function financeRider(req: AuthenticatedRequest, optional = false) {
  const id = req.query.rider_id as string | undefined;
  if (hasAnyRole(req.user!, ["admin", "finance"])) {
    if (!id && !optional)
      throw new AppError(400, "RIDER_REQUIRED", "rider_id required");
    return id;
  }
  if (!hasAnyRole(req.user!, ["rider"])) deny();
  const profile = await riderRepository.findProfileByUserId(req.user!.id);
  if (!profile || (id && id !== profile.id)) deny();
  return profile!.id;
}

// ============================================================================
// 1. Double-Entry Ledger Accounts & Transactions (Admin / Finance)
// ============================================================================

/**
 * GET /api/v1/finance/accounts
 * List all chart of accounts with dynamically derived balances
 */
financeRouter.get(
  "/accounts",
  requireAuth,
  requireRole(UserRole.ADMIN, UserRole.FINANCE),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const accounts = await ledgerRepository.getAllAccounts();
      // Ensure balances are freshly calculated
      for (const acc of accounts) {
        acc.balance_minor = await ledgerRepository.recalculateAccountBalance(
          acc.id,
        );
      }
      return res.status(200).json({ accounts });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/v1/finance/accounts/:id/entries
 * Inspect immutable ledger entries for an account
 */
financeRouter.get(
  "/accounts/:id/entries",
  requireAuth,
  requireRole(UserRole.ADMIN, UserRole.FINANCE),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const entries = await ledgerRepository.findEntriesByAccountId(
        req.params.id,
      );
      return res.status(200).json({ entries });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/v1/finance/transactions
 * List and search balanced double-entry transactions
 */
financeRouter.get(
  "/transactions",
  requireAuth,
  requireRole(UserRole.ADMIN, UserRole.FINANCE),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const search = req.query.search
        ? String(req.query.search).toLowerCase()
        : null;
      let txs = await ledgerRepository.listTransactions();

      if (search) {
        txs = txs.filter(
          (t) =>
            t.id.toLowerCase().includes(search) ||
            t.reference_id.toLowerCase().includes(search) ||
            t.idempotency_key.toLowerCase().includes(search) ||
            t.description.toLowerCase().includes(search),
        );
      }

      // Sort descending by effective_at
      txs.sort(
        (a, b) =>
          new Date(b.effective_at).getTime() -
          new Date(a.effective_at).getTime(),
      );

      // Attach entries preview
      const enriched = await Promise.all(
        txs.slice(0, 50).map(async (t) => {
          const entries = await ledgerRepository.findEntriesByTransactionId(
            t.id,
          );
          return { ...t, entries };
        }),
      );

      return res.status(200).json({ transactions: enriched });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/v1/finance/adjustments
 * Post a manual financial adjustment between two ledger accounts
 */
financeRouter.get(
  "/adjustments",
  requireAuth,
  requireRole(UserRole.ADMIN, UserRole.FINANCE),
  async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      res.status(200).json({ adjustments: await ledgerRepository.listAdjustments() });
    } catch (error) { next(error); }
  },
);

financeRouter.post(
  "/adjustments",
  requireAuth,
  requireRole(UserRole.ADMIN, UserRole.FINANCE),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const parsed = FinancialAdjustmentCreateSchema.parse(req.body);
      const adj = {
        id: `adj_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        reason_code: parsed.reasonCode as any,
        target_account_id: parsed.targetAccountId,
        offset_account_id: parsed.offsetAccountId,
        direction: parsed.direction as any,
        amount_minor: parsed.amountMinor,
        currency: parsed.currency || "KES",
        note: parsed.note,
        requested_by: req.user!.id,
        approved_by: null,
        approved_at: null,
        status: "REQUESTED" as const,
        ledger_transaction_id: null,
        created_at: new Date().toISOString(),
      };
      await ledgerRepository.saveAdjustment(adj);
      return res.status(201).json({ adjustment: adj });
    } catch (error) { next(error); }
  },
);

financeRouter.post(
  "/adjustments/:id/approve",
  requireAuth,
  requireRole(UserRole.ADMIN, UserRole.FINANCE),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const adj = await ledgerRepository.findAdjustmentById(req.params.id);
      if (!adj) throw new AppError(404, "ADJUSTMENT_NOT_FOUND", "Financial adjustment not found");
      if (adj.status !== "REQUESTED") throw new AppError(409, "ADJUSTMENT_NOT_REQUESTED", "Adjustment is not awaiting approval");
      if (adj.requested_by === req.user!.id) throw new AppError(403, "SELF_APPROVAL_NOT_ALLOWED", "The requester cannot approve their own financial adjustment");
      adj.approved_by = req.user!.id;
      adj.approved_at = new Date().toISOString();
      adj.status = "POSTED";
      await financialPostingService.postFinancialAdjustment(adj);
      return res.status(200).json({ adjustment: await ledgerRepository.findAdjustmentById(adj.id) });
    } catch (error) { next(error); }
  },
);

financeRouter.post(
  "/adjustments/:id/reject",
  requireAuth,
  requireRole(UserRole.ADMIN, UserRole.FINANCE),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const adj = await ledgerRepository.findAdjustmentById(req.params.id);
      if (!adj) throw new AppError(404, "ADJUSTMENT_NOT_FOUND", "Financial adjustment not found");
      if (adj.status !== "REQUESTED") throw new AppError(409, "ADJUSTMENT_NOT_REQUESTED", "Adjustment is not awaiting review");
      adj.status = "REJECTED";
      adj.rejected_at = new Date().toISOString();
      adj.rejection_reason = String(req.body?.reason || "Rejected by finance reviewer").slice(0, 500);
      await ledgerRepository.saveAdjustment(adj);
      return res.status(200).json({ adjustment: adj });
    } catch (error) { next(error); }
  },
);

// ============================================================================
// 2. Merchant Settlements (Admin / Finance & Merchant)
// ============================================================================

/**
 * GET /api/v1/finance/settlements
 * List merchant settlement batches
 */
financeRouter.get(
  "/settlements",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const merchantIdFilter = await financeMerchant(req, true);

      const settlements = await ledgerRepository.findSettlements({
        merchantId: merchantIdFilter,
        status: req.query.status as any,
      });

      return res.status(200).json({ settlements });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/v1/finance/settlements/calculate
 * Calculate a settlement batch for a merchant
 */
financeRouter.post(
  "/settlements/calculate",
  requireAuth,
  requireRole(UserRole.ADMIN, UserRole.FINANCE),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const parsed = SettlementCalculateSchema.parse(req.body);
      const merchantId = parsed.merchantId || "merchant_westlands_01";
      const settlement = await settlementService.calculateSettlement(
        merchantId,
        req.user!.id,
        parsed.periodStart,
        parsed.periodEnd,
      );
      return res.status(201).json({ settlement });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/v1/finance/settlements/:id/approve
 * Approve a settlement batch for disbursement
 */
financeRouter.post(
  "/settlements/:id/approve",
  requireAuth,
  requireRole(UserRole.ADMIN, UserRole.FINANCE),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const settlement = await settlementService.approveSettlement(
        req.params.id,
        req.user!.id,
      );
      return res.status(200).json({ settlement });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/v1/finance/settlements/:id/pay
 * Disburse settlement and post to double-entry ledger
 */
financeRouter.post(
  "/settlements/:id/pay",
  requireAuth,
  requireRole(UserRole.ADMIN, UserRole.FINANCE),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const result = await disbursementService.initiateSettlement(
        req.params.id,
        req.user!.id,
        req.body?.destination_id ? String(req.body.destination_id) : undefined,
      );
      return res.status(202).json(result);
    } catch (error) {
      next(error);
    }
  },
);

// ============================================================================
// 3. Rider Payouts (Admin / Finance)
// ============================================================================

/**
 * GET /api/v1/finance/payouts
 * List rider payout batches
 */
financeRouter.get(
  "/payouts",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const riderIdFilter = await financeRider(req, true);

      const payouts = await ledgerRepository.findRiderPayouts({
        riderId: riderIdFilter,
        status: req.query.status as any,
      });

      return res.status(200).json({ payouts });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/v1/finance/payouts/calculate
 * Calculate a payout for a courier
 */
financeRouter.post(
  "/payouts/calculate",
  requireAuth,
  requireRole(UserRole.ADMIN, UserRole.FINANCE),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const parsed = RiderPayoutCalculateSchema.parse(req.body);
      const riderId = parsed.riderId || req.user!.id;
      const payout = await riderPayoutService.calculatePayout(
        riderId,
        req.user!.id,
        parsed.periodStart,
        parsed.periodEnd,
      );
      return res.status(201).json({ payout });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/v1/finance/payouts/:id/approve
 * Approve a rider payout for disbursement
 */
financeRouter.post(
  "/payouts/:id/approve",
  requireAuth,
  requireRole(UserRole.ADMIN, UserRole.FINANCE),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const payout = await riderPayoutService.approvePayout(
        req.params.id,
        req.user!.id,
      );
      return res.status(200).json({ payout });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/v1/finance/payouts/:id/pay
 * Disburse rider payout via M-PESA B2C and post to ledger
 */
financeRouter.post(
  "/payouts/:id/pay",
  requireAuth,
  requireRole(UserRole.ADMIN, UserRole.FINANCE),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const result = await disbursementService.initiatePayout(
        req.params.id,
        req.user!.id,
        req.body?.destination_id ? String(req.body.destination_id) : undefined,
      );
      return res.status(202).json(result);
    } catch (error) {
      next(error);
    }
  },
);

// ============================================================================
// 4. Rider Self-Service Earnings & Payouts (Rider Role)
// ============================================================================

/**
 * GET /api/v1/finance/rider/earnings
 * Rider viewing own earnings, recent deliveries, and payable balance
 */
financeRouter.get(
  "/rider/earnings",
  requireAuth,
  requireRole(UserRole.RIDER, UserRole.ADMIN, UserRole.FINANCE),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const riderId = (await financeRider(req))!;

      // Current balance on ledger
      const riderAcc = await ledgerRepository.getOrCreateAccount(
        LedgerAccountType.RIDER_PAYABLE,
        LedgerAccountOwnerType.RIDER,
        riderId,
        "KES",
      );
      const availableBalanceMinor =
        await ledgerRepository.recalculateAccountBalance(riderAcc.id);

      // Earnings list
      const earnings =
        await ledgerRepository.findRiderEarningsByRiderId(riderId);

      // Payouts list
      const payouts = await ledgerRepository.findRiderPayouts({ riderId });

      return res.status(200).json({
        rider_id: riderId,
        available_balance_minor: availableBalanceMinor,
        total_earnings_count: earnings.length,
        earnings,
        payouts,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ============================================================================
// 5. Merchant Statement & Finance (Merchant Role)
// ============================================================================

/**
 * GET /api/v1/finance/merchant/statement
 * Merchant viewing current payable balance, completed settlements, and order economics
 */
financeRouter.get(
  "/merchant/statement",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const merchantId = (await financeMerchant(req))!;

      // Current balance on ledger
      const merchantAcc = await ledgerRepository.getOrCreateAccount(
        LedgerAccountType.MERCHANT_PAYABLE,
        LedgerAccountOwnerType.MERCHANT,
        merchantId,
        "KES",
      );
      const payableBalanceMinor =
        await ledgerRepository.recalculateAccountBalance(merchantAcc.id);

      // Settlements
      const settlements = await ledgerRepository.findSettlements({
        merchantId,
      });

      // Commission rule
      const rule =
        await ledgerRepository.getCommissionRuleForMerchant(merchantId);

      return res.status(200).json({
        merchant_id: merchantId,
        payable_balance_minor: payableBalanceMinor,
        commission_rate: rule.percentage_rate,
        settlements,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ============================================================================
// 6. Platform Profitability & Unit Economics (Admin / Finance)
// ============================================================================

/**
 * GET /api/v1/finance/profitability
 * Comprehensive platform GMV, Gross Revenue, Variable Costs & Net Contribution Margins
 */
financeRouter.get(
  "/profitability",
  requireAuth,
  requireRole(UserRole.ADMIN, UserRole.FINANCE),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const metrics = await profitabilityService.getProfitabilityMetrics({
        merchantId: req.query.merchant_id as string,
        startDate: req.query.start_date as string,
        endDate: req.query.end_date as string,
      });
      const orderSummaries = await profitabilityService.getAllOrderSummaries();

      return res.status(200).json({
        metrics,
        recent_orders: orderSummaries.slice(0, 50),
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/v1/finance/orders/:orderId
 * Per-order unit economics and contribution margin breakdown
 */
financeRouter.get(
  "/orders/:orderId",
  requireAuth,
  requireRole(UserRole.ADMIN, UserRole.FINANCE),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const summary = await profitabilityService.getOrderSummary(
        req.params.orderId,
      );
      if (!summary) {
        throw new AppError(
          404,
          "ORDER_ECONOMICS_NOT_FOUND",
          "Financial economics for this order not found",
        );
      }
      return res.status(200).json({ summary });
    } catch (error) {
      next(error);
    }
  },
);

// ============================================================================
// 7. Financial Reconciliation & Exception Alerts (Admin / Finance)
// ============================================================================

/**
 * GET /api/v1/finance/reconciliation/report
 * Financial reconciliation exception report
 */
financeRouter.get(
  "/reconciliation/report",
  requireAuth,
  requireRole(UserRole.ADMIN, UserRole.FINANCE),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const report = await reconciliationService.generateReport();
      return res.status(200).json({ report });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/v1/finance/reconciliation/heal
 * Trigger automated reconciliation healing
 */
financeRouter.post(
  "/reconciliation/heal",
  requireAuth,
  requireRole(UserRole.ADMIN, UserRole.FINANCE),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const result = await reconciliationService.autoReconcile();
      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },
);
