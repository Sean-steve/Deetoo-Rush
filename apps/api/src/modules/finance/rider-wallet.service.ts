import { randomUUID } from "node:crypto";
import { config } from "@deetoo/config";
import {
  LedgerAccountOwnerType,
  LedgerAccountType,
  LedgerEntryDirection,
  LedgerTransactionType,
  RiderEarningStatus,
  RiderWalletSummary,
} from "@deetoo/types";
import { AppError } from "../../middleware/error-handler";
import { getDbPool } from "../../db/client";
import { ledgerRepository } from "./ledger.repository";

type CashEventType = "COLLECTED" | "SETTLED" | "OFFSET" | "ADJUSTMENT";
type CashEvent = {
  id: string;
  rider_id: string;
  delivery_id?: string | null;
  order_id?: string | null;
  event_type: CashEventType;
  amount_minor: number;
  currency: string;
  provider_reference?: string | null;
  ledger_transaction_id?: string | null;
  actor_user_id?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
};

type CashSettlement = {
  id: string;
  rider_id: string;
  amount_minor: number;
  currency: string;
  status: "REQUESTED" | "PENDING_PROVIDER" | "CONFIRMED" | "FAILED" | "CANCELLED";
  provider: string;
  provider_reference?: string | null;
  requested_by: string;
  confirmed_by?: string | null;
  requested_at: string;
  confirmed_at?: string | null;
  failure_reason?: string | null;
  created_at: string;
};

export class RiderWalletService {
  private cashEvents = new Map<string, CashEvent>();
  private settlements = new Map<string, CashSettlement>();

  private cashThresholdMinor(): number {
    const parsed = Number(process.env.RIDER_CASH_THRESHOLD_MINOR || "1500000");
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1500000;
  }

  public clearInMemory(): void {
    this.cashEvents.clear();
    this.settlements.clear();
  }

  private async listCashEvents(riderId: string): Promise<CashEvent[]> {
    if (config.storage.mode === "postgres") {
      const result = await getDbPool().query(
        "SELECT * FROM rider_cash_events WHERE rider_id=$1 ORDER BY created_at DESC",
        [riderId],
      );
      return result.rows.map((row: any) => ({
        ...row,
        amount_minor: Number(row.amount_minor),
        metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata || {},
        created_at: new Date(row.created_at).toISOString(),
      }));
    }
    return [...this.cashEvents.values()]
      .filter((event) => event.rider_id === riderId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  private async listSettlements(riderId: string): Promise<CashSettlement[]> {
    if (config.storage.mode === "postgres") {
      const result = await getDbPool().query(
        "SELECT * FROM rider_cash_settlements WHERE rider_id=$1 ORDER BY created_at DESC",
        [riderId],
      );
      return result.rows.map((row: any) => ({
        ...row,
        amount_minor: Number(row.amount_minor),
        requested_at: new Date(row.requested_at).toISOString(),
        confirmed_at: row.confirmed_at ? new Date(row.confirmed_at).toISOString() : null,
        created_at: new Date(row.created_at).toISOString(),
      }));
    }
    return [...this.settlements.values()]
      .filter((settlement) => settlement.rider_id === riderId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  public async getWallet(riderId: string): Promise<RiderWalletSummary & {
    cash_events: CashEvent[];
    cash_settlements: CashSettlement[];
  }> {
    const currency = "KES";
    const riderPayable = await ledgerRepository.getOrCreateAccount(
      LedgerAccountType.RIDER_PAYABLE,
      LedgerAccountOwnerType.RIDER,
      riderId,
      currency,
    );
    const grossPayable = await ledgerRepository.recalculateAccountBalance(riderPayable.id);

    const cashReceivable = await ledgerRepository.getOrCreateAccount(
      LedgerAccountType.RIDER_CASH_RECEIVABLE,
      LedgerAccountOwnerType.RIDER,
      riderId,
      currency,
    );
    const ledgerCashOwed = Math.max(
      0,
      await ledgerRepository.recalculateAccountBalance(cashReceivable.id),
    );

    const earnings = await ledgerRepository.findRiderEarningsByRiderId(riderId);
    const pendingEarnings = earnings
      .filter((earning) => earning.status === RiderEarningStatus.PENDING)
      .reduce((sum, earning) => sum + earning.total_amount_minor, 0);

    const cashEvents = await this.listCashEvents(riderId);
    const cashCollected = cashEvents
      .filter((event) => event.event_type === "COLLECTED")
      .reduce((sum, event) => sum + event.amount_minor, 0);
    const cashSettled = cashEvents
      .filter((event) => event.event_type === "SETTLED" || event.event_type === "OFFSET")
      .reduce((sum, event) => sum + event.amount_minor, 0);
    const eventCashOwed = Math.max(0, cashCollected - cashSettled);

    const payouts = await ledgerRepository.findRiderPayouts({ riderId });
    const nextPayout =
      payouts.find((payout) => ["PROCESSING", "APPROVED", "DRAFT"].includes(payout.status)) || null;
    const cashSettlements = await this.listSettlements(riderId);
    const threshold = this.cashThresholdMinor();
    const reconciliationDifference = ledgerCashOwed - eventCashOwed;

    return {
      rider_id: riderId,
      currency,
      gross_payable_balance_minor: grossPayable,
      available_earnings_minor: Math.max(0, grossPayable - ledgerCashOwed),
      pending_earnings_minor: pendingEarnings,
      cash_collected_minor: cashCollected,
      cash_settled_minor: cashSettled,
      cash_owed_minor: ledgerCashOwed,
      cash_threshold_minor: threshold,
      cash_restricted: ledgerCashOwed >= threshold,
      next_payout: nextPayout,
      settlement_status: cashSettlements[0]?.status || null,
      ledger_reconciled: reconciliationDifference === 0,
      reconciliation_difference_minor: reconciliationDifference,
      cash_events: cashEvents,
      cash_settlements: cashSettlements,
    };
  }

  public async recordCashCollected(input: {
    riderId: string;
    deliveryId: string;
    orderId: string;
    amountMinor: number;
    actorUserId?: string;
    currency?: string;
  }): Promise<CashEvent> {
    if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
      throw new AppError(400, "INVALID_CASH_AMOUNT", "Cash collection must be a positive integer minor-unit amount");
    }
    const existing = (await this.listCashEvents(input.riderId)).find(
      (event) => event.event_type === "COLLECTED" && event.delivery_id === input.deliveryId,
    );
    if (existing) return existing;

    const currency = input.currency || "KES";
    const riderReceivable = await ledgerRepository.getOrCreateAccount(
      LedgerAccountType.RIDER_CASH_RECEIVABLE,
      LedgerAccountOwnerType.RIDER,
      input.riderId,
      currency,
    );
    const cashLiability = await ledgerRepository.getOrCreateAccount(
      LedgerAccountType.CASH_COLLECTION_LIABILITY,
      LedgerAccountOwnerType.SYSTEM,
      null,
      currency,
    );

    const posted = await ledgerRepository.postTransaction(
      {
        transaction_type: LedgerTransactionType.RIDER_CASH_COLLECTED,
        reference_type: "DELIVERY_CASH",
        reference_id: input.deliveryId,
        idempotency_key: `rider.cash.collected:${input.deliveryId}`,
        currency,
        description: `Cash collected by Rider for delivery ${input.deliveryId}`,
        total_amount_minor: input.amountMinor,
        effective_at: new Date().toISOString(),
      },
      [
        {
          accountId: riderReceivable.id,
          accountType: LedgerAccountType.RIDER_CASH_RECEIVABLE,
          direction: LedgerEntryDirection.DEBIT,
          amountMinor: input.amountMinor,
        },
        {
          accountId: cashLiability.id,
          accountType: LedgerAccountType.CASH_COLLECTION_LIABILITY,
          direction: LedgerEntryDirection.CREDIT,
          amountMinor: input.amountMinor,
        },
      ],
    );

    const event: CashEvent = {
      id: randomUUID(),
      rider_id: input.riderId,
      delivery_id: input.deliveryId,
      order_id: input.orderId,
      event_type: "COLLECTED",
      amount_minor: input.amountMinor,
      currency,
      ledger_transaction_id: posted.transaction.id,
      actor_user_id: input.actorUserId || null,
      metadata: {},
      created_at: new Date().toISOString(),
    };

    if (config.storage.mode === "postgres") {
      await getDbPool().query(
        `INSERT INTO rider_cash_events
          (id,rider_id,delivery_id,order_id,event_type,amount_minor,currency,ledger_transaction_id,actor_user_id,metadata,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          event.id,
          event.rider_id,
          event.delivery_id,
          event.order_id,
          event.event_type,
          event.amount_minor,
          event.currency,
          event.ledger_transaction_id,
          event.actor_user_id,
          JSON.stringify(event.metadata || {}),
          event.created_at,
        ],
      );
    } else {
      this.cashEvents.set(event.id, event);
    }
    return event;
  }

  public async requestCashSettlement(
    riderId: string,
    requestedBy: string,
    amountMinor: number,
  ): Promise<CashSettlement> {
    const wallet = await this.getWallet(riderId);
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
      throw new AppError(400, "INVALID_SETTLEMENT_AMOUNT", "Settlement amount must be a positive integer minor-unit amount");
    }
    if (amountMinor > wallet.cash_owed_minor) {
      throw new AppError(
        409,
        "CASH_SETTLEMENT_EXCEEDS_OWED",
        "Settlement amount cannot exceed cash currently owed to DeeToo",
        { cash_owed_minor: wallet.cash_owed_minor },
      );
    }

    const now = new Date().toISOString();
    const settlement: CashSettlement = {
      id: randomUUID(),
      rider_id: riderId,
      amount_minor: amountMinor,
      currency: "KES",
      status: "REQUESTED",
      provider: "MPESA",
      requested_by: requestedBy,
      requested_at: now,
      created_at: now,
    };

    if (config.storage.mode === "postgres") {
      await getDbPool().query(
        `INSERT INTO rider_cash_settlements
          (id,rider_id,amount_minor,currency,status,provider,requested_by,requested_at,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          settlement.id,
          riderId,
          amountMinor,
          settlement.currency,
          settlement.status,
          settlement.provider,
          requestedBy,
          now,
          now,
        ],
      );
    } else {
      this.settlements.set(settlement.id, settlement);
    }
    return settlement;
  }

  public async listPendingCashSettlements(): Promise<CashSettlement[]> {
    if (config.storage.mode === "postgres") {
      const result = await getDbPool().query(
        "SELECT * FROM rider_cash_settlements WHERE status IN ('REQUESTED','PENDING_PROVIDER') ORDER BY created_at ASC",
      );
      return result.rows.map((row: any) => ({ ...row, amount_minor: Number(row.amount_minor) }));
    }
    return [...this.settlements.values()].filter((item) =>
      ["REQUESTED", "PENDING_PROVIDER"].includes(item.status),
    );
  }

  public async confirmCashSettlement(
    settlementId: string,
    confirmedBy: string,
    providerReference: string,
  ): Promise<CashSettlement> {
    let settlement: CashSettlement | undefined;
    if (config.storage.mode === "postgres") {
      const result = await getDbPool().query(
        "SELECT * FROM rider_cash_settlements WHERE id=$1",
        [settlementId],
      );
      if (result.rows[0]) settlement = { ...result.rows[0], amount_minor: Number(result.rows[0].amount_minor) };
    } else {
      settlement = this.settlements.get(settlementId);
    }
    if (!settlement) throw new AppError(404, "CASH_SETTLEMENT_NOT_FOUND", "Cash settlement not found");
    if (settlement.status === "CONFIRMED") return settlement;
    if (!["REQUESTED", "PENDING_PROVIDER"].includes(settlement.status)) {
      throw new AppError(409, "CASH_SETTLEMENT_INVALID_STATE", `Cannot confirm settlement in status ${settlement.status}`);
    }
    if (!providerReference.trim()) {
      throw new AppError(400, "PROVIDER_REFERENCE_REQUIRED", "A verified settlement reference is required");
    }

    const riderReceivable = await ledgerRepository.getOrCreateAccount(
      LedgerAccountType.RIDER_CASH_RECEIVABLE,
      LedgerAccountOwnerType.RIDER,
      settlement.rider_id,
      settlement.currency,
    );
    const clearing = await ledgerRepository.getOrCreateAccount(
      LedgerAccountType.CASH_SETTLEMENT_CLEARING,
      LedgerAccountOwnerType.SYSTEM,
      null,
      settlement.currency,
    );

    const posted = await ledgerRepository.postTransaction(
      {
        transaction_type: LedgerTransactionType.RIDER_CASH_SETTLED,
        reference_type: "RIDER_CASH_SETTLEMENT",
        reference_id: settlement.id,
        idempotency_key: `rider.cash.settled:${settlement.id}`,
        currency: settlement.currency,
        description: `Rider cash settlement ${settlement.id}`,
        total_amount_minor: settlement.amount_minor,
        effective_at: new Date().toISOString(),
      },
      [
        {
          accountId: clearing.id,
          accountType: LedgerAccountType.CASH_SETTLEMENT_CLEARING,
          direction: LedgerEntryDirection.DEBIT,
          amountMinor: settlement.amount_minor,
        },
        {
          accountId: riderReceivable.id,
          accountType: LedgerAccountType.RIDER_CASH_RECEIVABLE,
          direction: LedgerEntryDirection.CREDIT,
          amountMinor: settlement.amount_minor,
        },
      ],
    );

    const now = new Date().toISOString();
    const event: CashEvent = {
      id: randomUUID(),
      rider_id: settlement.rider_id,
      event_type: "SETTLED",
      amount_minor: settlement.amount_minor,
      currency: settlement.currency,
      provider_reference: providerReference,
      ledger_transaction_id: posted.transaction.id,
      actor_user_id: confirmedBy,
      metadata: { settlement_id: settlement.id },
      created_at: now,
    };

    const updated: CashSettlement = {
      ...settlement,
      status: "CONFIRMED",
      provider_reference: providerReference,
      confirmed_by: confirmedBy,
      confirmed_at: now,
    };

    if (config.storage.mode === "postgres") {
      await getDbPool().query(
        `UPDATE rider_cash_settlements
         SET status='CONFIRMED',provider_reference=$1,confirmed_by=$2,confirmed_at=$3
         WHERE id=$4`,
        [providerReference, confirmedBy, now, settlement.id],
      );
      await getDbPool().query(
        `INSERT INTO rider_cash_events
          (id,rider_id,event_type,amount_minor,currency,provider_reference,ledger_transaction_id,actor_user_id,metadata,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          event.id,
          event.rider_id,
          event.event_type,
          event.amount_minor,
          event.currency,
          providerReference,
          event.ledger_transaction_id,
          confirmedBy,
          JSON.stringify(event.metadata),
          now,
        ],
      );
    } else {
      this.settlements.set(updated.id, updated);
      this.cashEvents.set(event.id, event);
    }
    return updated;
  }
}

export const riderWalletService = new RiderWalletService();
