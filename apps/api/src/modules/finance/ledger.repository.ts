import { transactionalService } from '../../db/transaction';
import { canonicalHash, lockCommand } from '../cart/quote-binding';
import { randomUUID as durableEntityId } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { rows,one } from '../../db/adapter';
import { AppError } from '../../middleware/error-handler';
import { allowMemoryAdapter } from '../../db/storage-policy';
import { config } from '@deetoo/config';
/**
 * DEETOO - Financial Ledger & Settlement Repository
 * Sprint 12: Dual-layer persistence (PostgreSQL with resilient in-memory fallback)
 * Implements double-entry ledger, immutability, balance derivation, and financial records.
 */

import { getDbPool } from '../../db/client';
import { logger } from '@deetoo/utils';

const pool = {
  query: (...args: any[]) => (getDbPool() as any).query(...args),
  connect: () => getDbPool().connect(),
};
import {
  LedgerAccount,
  LedgerAccountType,
  LedgerAccountOwnerType,
  LedgerTransaction,
  LedgerTransactionType,
  LedgerTransactionStatus,
  LedgerEntry,
  LedgerEntryDirection,
  MerchantCommissionRule,
  RiderEarning,
  RiderEarningStatus,
  MerchantSettlement,
  MerchantSettlementStatus,
  MerchantSettlementLine,
  RiderPayout,
  RiderPayoutStatus,
  RiderPayoutLine,
  FinancialAdjustment,
  OrderFinancialSummary,
} from '@deetoo/types';

export class LedgerRepository {
  // Resilient In-Memory Fallback Stores
  public accounts: Map<string, LedgerAccount> = new Map();
  public transactions: Map<string, LedgerTransaction> = new Map();
  public entries: Map<string, LedgerEntry[]> = new Map(); // transactionId -> entries
  public commissionRules: Map<string, MerchantCommissionRule> = new Map();
  public riderEarnings: Map<string, RiderEarning> = new Map();
  public settlements: Map<string, MerchantSettlement> = new Map();
  public settlementLines: Map<string, MerchantSettlementLine[]> = new Map(); // settlementId -> lines
  public payouts: Map<string, RiderPayout> = new Map();
  public payoutLines: Map<string, RiderPayoutLine[]> = new Map(); // payoutId -> lines
  public adjustments: Map<string, FinancialAdjustment> = new Map();
  public orderSummaries: Map<string, OrderFinancialSummary> = new Map();

  constructor() {
    this.seedDefaultAccountsAndRules();
  }

  /**
   * Clears in-memory state between tests
   */
  public clearInMemory(): void {
    this.accounts.clear();
    this.transactions.clear();
    this.entries.clear();
    this.commissionRules.clear();
    this.riderEarnings.clear();
    this.settlements.clear();
    this.settlementLines.clear();
    this.payouts.clear();
    this.payoutLines.clear();
    this.adjustments.clear();
    this.orderSummaries.clear();
    this.seedDefaultAccountsAndRules();
  }

  private seedDefaultAccountsAndRules(): void {
    if (!config.storage.fixtures) return;
    // Platform Default Commission Rule: 20%
    const defaultRule: MerchantCommissionRule = {
      id: 'rule_platform_default',
      merchant_id: null,
      percentage_rate: 0.20,
      fixed_fee_minor: 0,
      effective_from: new Date('2020-01-01').toISOString(),
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
    };
    this.commissionRules.set(defaultRule.id, defaultRule);

    // Seed primary platform chart of accounts
    const platformAccounts = [
      { type: LedgerAccountType.CUSTOMER_FUNDS_CLEARING, num: 'ACC-1000-FUNDS-CLEARING', owner: LedgerAccountOwnerType.SYSTEM },
      { type: LedgerAccountType.PLATFORM_COMMISSION_REVENUE, num: 'ACC-4000-REV-COMMISSION', owner: LedgerAccountOwnerType.PLATFORM },
      { type: LedgerAccountType.PLATFORM_DELIVERY_REVENUE, num: 'ACC-4100-REV-DELIVERY', owner: LedgerAccountOwnerType.PLATFORM },
      { type: LedgerAccountType.PLATFORM_SERVICE_FEE_REVENUE, num: 'ACC-4200-REV-SERVICE-FEE', owner: LedgerAccountOwnerType.PLATFORM },
      { type: LedgerAccountType.PROMOTION_EXPENSE_PLATFORM, num: 'ACC-5000-EXP-PROMO-PLATFORM', owner: LedgerAccountOwnerType.PLATFORM },
      { type: LedgerAccountType.PROMOTION_EXPENSE_MERCHANT, num: 'ACC-5100-EXP-PROMO-MERCHANT', owner: LedgerAccountOwnerType.PLATFORM },
      { type: LedgerAccountType.PAYMENT_PROCESSOR_FEE_EXPENSE, num: 'ACC-5200-EXP-PROCESSOR-FEE', owner: LedgerAccountOwnerType.PLATFORM },
      { type: LedgerAccountType.RIDER_DELIVERY_EXPENSE, num: 'ACC-5300-EXP-RIDER-DELIVERY', owner: LedgerAccountOwnerType.PLATFORM },
      { type: LedgerAccountType.REFUND_EXPENSE_PLATFORM, num: 'ACC-5400-EXP-REFUND-PLATFORM', owner: LedgerAccountOwnerType.PLATFORM },
      { type: LedgerAccountType.SETTLEMENT_CLEARING, num: 'ACC-2100-SETTLEMENT-CLEARING', owner: LedgerAccountOwnerType.SYSTEM },
      { type: LedgerAccountType.RIDER_PAYOUT_CLEARING, num: 'ACC-2200-PAYOUT-CLEARING', owner: LedgerAccountOwnerType.SYSTEM },
      { type: LedgerAccountType.GENERAL_ADJUSTMENT_CLEARING, num: 'ACC-9999-ADJUSTMENT-CLEARING', owner: LedgerAccountOwnerType.SYSTEM },
    ];

    for (const acc of platformAccounts) {
      const id = `acc_${acc.type.toLowerCase()}`;
      if (!this.accounts.has(id)) {
        this.accounts.set(id, {
          id,
          account_number: acc.num,
          account_type: acc.type,
          owner_type: acc.owner,
          owner_id: null,
          currency: 'KES',
          balance_minor: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    }
  }

  // ==========================================================================
  // LEDGER ACCOUNTS
  // ==========================================================================

  public async getOrCreateAccount(
    accountType: LedgerAccountType,
    ownerType: LedgerAccountOwnerType,
    ownerId?: string | null,
    currency = 'KES'
  ): Promise<LedgerAccount> {
    const key = `${accountType}:${ownerType}:${ownerId || 'system'}:${currency}`;
    await lockCommand(`ledger-account:${key}`);

    // Check memory first
    for (const acc of config.storage.mode === "memory" ? this.accounts.values() : []) {
      if (
        acc.account_type === accountType &&
        acc.owner_type === ownerType &&
        (acc.owner_id || null) === (ownerId || null) &&
        acc.currency === currency
      ) {
        return acc;
      }
    }

    // Try DB
    try {
      const res = await pool.query(
        `SELECT * FROM ledger_accounts 
         WHERE account_type = $1 AND owner_type = $2 AND (owner_id = $3 OR (owner_id IS NULL AND $3 IS NULL)) AND currency = $4`,
        [accountType, ownerType, ownerId || null, currency]
      );
      if (res.rows.length > 0) {
        const acc = this.mapAccount(res.rows[0]);
        this.accounts.set(acc.id, acc);
        return acc;
      }
    } catch {
      allowMemoryAdapter();
      // Fallback
    }

    // Create new account
    const id = randomUUID();
    const accountNumber = `ACC-${accountType.substring(0, 4)}-${ownerId ? ownerId.substring(0, 8) : 'PLT'}-${Math.floor(1000 + Math.random() * 9000)}`;
    const now = new Date().toISOString();

    const newAcc: LedgerAccount = {
      id,
      account_number: accountNumber,
      account_type: accountType,
      owner_type: ownerType,
      owner_id: ownerId || null,
      currency,
      balance_minor: 0,
      created_at: now,
      updated_at: now,
    };

    try {
      await pool.query(
        `INSERT INTO ledger_accounts (id, account_number, account_type, owner_type, owner_id, currency, balance_minor, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [newAcc.id, newAcc.account_number, newAcc.account_type, newAcc.owner_type, newAcc.owner_id, newAcc.currency, 0, now, now]
      );
    } catch {
      allowMemoryAdapter();
      // Memory fallback
    }

    this.accounts.set(newAcc.id, newAcc);
    return newAcc;
  }

  public async listTransactions(): Promise<LedgerTransaction[]> {
    if(config.storage.mode === 'memory')return Array.from(this.transactions.values());
    return (await rows('SELECT * FROM ledger_transactions ORDER BY created_at DESC')).map(this.mapTransaction);
  }

  public async getAccountById(accountId: string): Promise<LedgerAccount | null> {
    if (config.storage.mode === "postgres") { const found=await rows("SELECT * FROM ledger_accounts WHERE id=$1",[accountId]); return found[0]?this.mapAccount(found[0]):null; }
    if (this.accounts.has(accountId)) {
      return this.accounts.get(accountId)!;
    }
    try {
      const res = await pool.query('SELECT * FROM ledger_accounts WHERE id = $1', [accountId]);
      if (res.rows.length > 0) {
        const acc = this.mapAccount(res.rows[0]);
        this.accounts.set(acc.id, acc);
        return acc;
      }
    } catch {
      allowMemoryAdapter();
      // Memory fallback
    }
    return null;
  }

  public async getAllAccounts(): Promise<LedgerAccount[]> {
    if (config.storage.mode === "postgres") { const found=await rows("SELECT * FROM ledger_accounts",[]); return found.map(this.mapAccount); }
    try {
      const res = await pool.query('SELECT * FROM ledger_accounts ORDER BY created_at ASC');
      if (res.rows.length > 0) {
        return res.rows.map(this.mapAccount);
      }
    } catch {
      allowMemoryAdapter();
      // Memory fallback
    }
    return Array.from(this.accounts.values());
  }

  // ==========================================================================
  // DOUBLE-ENTRY LEDGER TRANSACTIONS & ENTRIES
  // ==========================================================================

  /**
   * Posts an immutable double-entry transaction.
   * Validates Debits === Credits.
   * Enforces idempotency by idempotency_key.
   */
  public async postTransaction(
    txData: Omit<LedgerTransaction, 'id' | 'created_at' | 'status'>,
    entriesData: Array<{
      accountId: string;
      accountType?: LedgerAccountType;
      direction: LedgerEntryDirection;
      amountMinor: number;
      currency?: string;
      description?: string;
    }>
  ): Promise<{ transaction: LedgerTransaction; entries: LedgerEntry[] }> {
    await lockCommand(`ledger-post:${txData.idempotency_key}`);
    // 1. Idempotency check
    const existing = await this.findTransactionByIdempotencyKey(txData.idempotency_key);
    if (existing) {
      const existingEntries = await this.findEntriesByTransactionId(existing.id);
      const normalize=(entries:any[])=>entries.map(e=>({account:e.accountId||e.account_id,direction:e.direction,amount:e.amountMinor??e.amount_minor})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
      if(existing.reference_type!==txData.reference_type||existing.reference_id!==txData.reference_id||existing.transaction_type!==txData.transaction_type||existing.currency!==txData.currency||canonicalHash(normalize(existingEntries))!==canonicalHash(normalize(entriesData)))throw new AppError(409,'LEDGER_IDEMPOTENCY_CONFLICT','Ledger key reused with different economic effects');
      return { transaction: existing, entries: existingEntries };
    }

    if (config.storage.mode === 'postgres') {
      const accounts=await rows('SELECT id,currency FROM ledger_accounts WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',[entriesData.map(e=>e.accountId)]);
      if(new Set(entriesData.map(e=>e.accountId)).size!==accounts.length || accounts.some(a=>a.currency!==txData.currency) || entriesData.some(e=>e.currency&&e.currency!==txData.currency)) throw new AppError(409,'LEDGER_CURRENCY_MISMATCH','All accounts and entries must use transaction currency');
    }
    // 2. Validate double-entry invariant: Debits == Credits
    let totalDebits = 0;
    let totalCredits = 0;

    for (const entry of entriesData) {
      if (!Number.isSafeInteger(entry.amountMinor) || entry.amountMinor <= 0) {
        throw new Error(`Ledger entry amount must be positive integer minor unit: received ${entry.amountMinor}`);
      }
      if (entry.direction === LedgerEntryDirection.DEBIT) {
        totalDebits += entry.amountMinor;
      } else if (entry.direction === LedgerEntryDirection.CREDIT) {
        totalCredits += entry.amountMinor;
      } else {
        throw new Error(`Invalid ledger entry direction: ${entry.direction}`);
      }
    }

    if (totalDebits !== totalCredits) {
      throw new Error(
        `Unbalanced double-entry transaction! Total Debits (${totalDebits}) !== Total Credits (${totalCredits}) for ref ${txData.reference_type}:${txData.reference_id}`
      );
    }

    const txId = durableEntityId();
    const now = new Date().toISOString();

    const transaction: LedgerTransaction = {
      id: txId,
      transaction_type: txData.transaction_type,
      reference_type: txData.reference_type,
      reference_id: txData.reference_id,
      idempotency_key: txData.idempotency_key,
      currency: txData.currency || 'KES',
      description: txData.description,
      status: LedgerTransactionStatus.POSTED,
      total_amount_minor: totalDebits,
      effective_at: txData.effective_at || now,
      created_at: now,
    };

    const entries: LedgerEntry[] = entriesData.map((e, idx) => ({
      id: durableEntityId(),
      transaction_id: txId,
      account_id: e.accountId,
      account_type: e.accountType,
      direction: e.direction,
      amount_minor: e.amountMinor,
      currency: e.currency || txData.currency || 'KES',
      description: e.description || txData.description,
      created_at: now,
    }));

    // Save to Database / in-memory
    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO ledger_transactions (id, transaction_type, reference_type, reference_id, idempotency_key, currency, description, status, total_amount_minor, effective_at, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            transaction.id,
            transaction.transaction_type,
            transaction.reference_type,
            transaction.reference_id,
            transaction.idempotency_key,
            transaction.currency,
            transaction.description,
            transaction.status,
            transaction.total_amount_minor,
            transaction.effective_at,
            transaction.created_at,
          ]
        );

        for (const entry of entries) {
          await client.query(
            `INSERT INTO ledger_entries (id, transaction_id, account_id, direction, amount_minor, currency, description, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              entry.id,
              entry.transaction_id,
              entry.account_id,
              entry.direction,
              entry.amount_minor,
              entry.currency,
              entry.description,
              entry.created_at,
            ]
          );
        }

        await client.query('COMMIT');
      } catch (dbErr) {
        await client.query('ROLLBACK');
        throw dbErr;
      } finally {
        client.release();
      }
    } catch {
      allowMemoryAdapter();
      // Resilient In-Memory Fallback
    }

    // Save in memory
    this.transactions.set(transaction.id, transaction);
    this.entries.set(transaction.id, entries);

    // Update account balances
    for (const entry of entries) {
      await this.recalculateAccountBalance(entry.account_id);
    }

    logger.info('Posted balanced double-entry ledger transaction', {
      metadata: {
        transactionId: transaction.id,
        transactionType: transaction.transaction_type,
        reference: `${transaction.reference_type}:${transaction.reference_id}`,
        totalMinor: totalDebits,
      },
    });

    return { transaction, entries };
  }

  public async findTransactionByIdempotencyKey(key: string): Promise<LedgerTransaction | null> {
    if (config.storage.mode === "postgres") { const found=await rows("SELECT * FROM ledger_transactions WHERE idempotency_key=$1",[key]); return found[0]?this.mapTransaction(found[0]):null; }
    for (const tx of this.transactions.values()) {
      if (tx.idempotency_key === key) return tx;
    }
    try {
      const res = await pool.query('SELECT * FROM ledger_transactions WHERE idempotency_key = $1', [key]);
      if (res.rows.length > 0) {
        const tx = this.mapTransaction(res.rows[0]);
        this.transactions.set(tx.id, tx);
        return tx;
      }
    } catch {
      allowMemoryAdapter();
      // Memory fallback
    }
    return null;
  }

  public async findTransactionById(id: string): Promise<LedgerTransaction | null> {
    if (config.storage.mode === "postgres") { const found=await rows("SELECT * FROM ledger_transactions WHERE id=$1",[id]); return found[0]?this.mapTransaction(found[0]):null; }
    if (this.transactions.has(id)) return this.transactions.get(id)!;
    try {
      const res = await pool.query('SELECT * FROM ledger_transactions WHERE id = $1', [id]);
      if (res.rows.length > 0) {
        const tx = this.mapTransaction(res.rows[0]);
        this.transactions.set(tx.id, tx);
        return tx;
      }
    } catch {
      allowMemoryAdapter();
      // Memory fallback
    }
    return null;
  }

  public async findEntriesByTransactionId(txId: string): Promise<LedgerEntry[]> {
    if (config.storage.mode === "postgres") { const found=await rows("SELECT e.*,a.account_type FROM ledger_entries e JOIN ledger_accounts a ON a.id=e.account_id WHERE e.transaction_id=$1",[txId]); return found.map(this.mapEntry); }
    if (this.entries.has(txId)) return this.entries.get(txId)!;
    try {
      const res = await pool.query('SELECT * FROM ledger_entries WHERE transaction_id = $1 ORDER BY created_at ASC', [txId]);
      if (res.rows.length > 0) {
        const list = res.rows.map(this.mapEntry);
        this.entries.set(txId, list);
        return list;
      }
    } catch {
      allowMemoryAdapter();
      // Memory fallback
    }
    return [];
  }

  public async findEntriesByAccountId(accountId: string): Promise<LedgerEntry[]> {
    if (config.storage.mode === "postgres") { const found=await rows("SELECT * FROM ledger_entries WHERE account_id=$1",[accountId]); return found.map(this.mapEntry); }
    const list: LedgerEntry[] = [];
    for (const entryList of this.entries.values()) {
      for (const e of entryList) {
        if (e.account_id === accountId) list.push(e);
      }
    }
    if (list.length > 0) return list;

    try {
      const res = await pool.query('SELECT * FROM ledger_entries WHERE account_id = $1 ORDER BY created_at DESC', [accountId]);
      return res.rows.map(this.mapEntry);
    } catch {
      allowMemoryAdapter();
      return [];
    }
  }

  /**
   * Recalculates and derives account balance from immutable ledger entries.
   * Liabilities & Revenues: Credits - Debits.
   * Assets & Expenses: Debits - Credits.
   */
  public async recalculateAccountBalance(accountId: string): Promise<number> {
    const account = await this.getAccountById(accountId);
    if (!account) return 0;

    const entries = await this.findEntriesByAccountId(accountId);
    let balance = 0;

    const isLiabilityOrRevenue = [
      LedgerAccountType.CUSTOMER_REFUND_PAYABLE,
      LedgerAccountType.MERCHANT_PAYABLE,
      LedgerAccountType.RIDER_PAYABLE,
      LedgerAccountType.PLATFORM_COMMISSION_REVENUE,
      LedgerAccountType.PLATFORM_DELIVERY_REVENUE,
      LedgerAccountType.PLATFORM_SERVICE_FEE_REVENUE,
      LedgerAccountType.SETTLEMENT_CLEARING,
      LedgerAccountType.RIDER_PAYOUT_CLEARING,
      LedgerAccountType.CASH_COLLECTION_LIABILITY,
    ].includes(account.account_type);

    for (const e of entries) {
      if (isLiabilityOrRevenue) {
        if (e.direction === LedgerEntryDirection.CREDIT) balance += e.amount_minor;
        else if (e.direction === LedgerEntryDirection.DEBIT) balance -= e.amount_minor;
      } else {
        // Asset or Expense
        if (e.direction === LedgerEntryDirection.DEBIT) balance += e.amount_minor;
        else if (e.direction === LedgerEntryDirection.CREDIT) balance -= e.amount_minor;
      }
    }

    account.balance_minor = balance;
    account.updated_at = new Date().toISOString();
    this.accounts.set(account.id, account);

    try {
      await pool.query('UPDATE ledger_accounts SET balance_minor = $1, updated_at = $2 WHERE id = $3', [
        balance,
        account.updated_at,
        account.id,
      ]);
    } catch {
      allowMemoryAdapter();
      // Memory fallback
    }

    return balance;
  }

  // ==========================================================================
  // COMMISSION RULES
  // ==========================================================================

  public async getCommissionRuleForMerchant(merchantId?: string | null): Promise<MerchantCommissionRule> {
    if (config.storage.mode === "postgres") {
      const r=await one("SELECT * FROM merchant_commission_rules WHERE (merchant_id=$1 OR merchant_id IS NULL) AND status='ACTIVE' AND effective_from<=now() AND (effective_until IS NULL OR effective_until>now()) ORDER BY (merchant_id IS NOT NULL) DESC,effective_from DESC LIMIT 1",[merchantId||null]);
      if(!r)throw new AppError(503,'COMMISSION_NOT_CONFIGURED','No active commission rule');
      return {...r,percentage_rate:Number(r.percentage_rate)};
    }
    allowMemoryAdapter();
    const now = new Date();
    // 1. Check merchant override
    if (merchantId) {
      for (const rule of this.commissionRules.values()) {
        if (
          rule.merchant_id === merchantId &&
          rule.status === 'ACTIVE' &&
          new Date(rule.effective_from) <= now &&
          (!rule.effective_until || new Date(rule.effective_until) > now)
        ) {
          return rule;
        }
      }
    }

    // 2. Default platform rule
    for (const rule of this.commissionRules.values()) {
      if (!rule.merchant_id && rule.status === 'ACTIVE') {
        return rule;
      }
    }

    return {
      id: 'default',
      merchant_id: null,
      percentage_rate: 0.20,
      fixed_fee_minor: 0,
      effective_from: new Date('2020-01-01').toISOString(),
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
    };
  }

  public async saveCommissionRule(rule: MerchantCommissionRule): Promise<MerchantCommissionRule> {
    this.commissionRules.set(rule.id, rule);
    try {
      await pool.query(
        `INSERT INTO merchant_commission_rules (id, merchant_id, percentage_rate, fixed_fee_minor, effective_from, effective_until, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET percentage_rate = EXCLUDED.percentage_rate, status = EXCLUDED.status`,
        [
          rule.id,
          rule.merchant_id || null,
          rule.percentage_rate,
          rule.fixed_fee_minor,
          rule.effective_from,
          rule.effective_until || null,
          rule.status,
          rule.created_at,
        ]
      );
    } catch {
      allowMemoryAdapter();
      // Memory fallback
    }
    return rule;
  }

  // ==========================================================================
  // RIDER EARNINGS
  // ==========================================================================

  public async findRiderEarningByDeliveryId(deliveryId: string): Promise<RiderEarning | null> {
    if (config.storage.mode === "postgres") { const found=await rows("SELECT * FROM rider_earnings WHERE delivery_id=$1",[deliveryId]); return found[0]?this.mapRiderEarning(found[0]):null; }
    for (const e of this.riderEarnings.values()) {
      if (e.delivery_id === deliveryId) return e;
    }
    try {
      const res = await pool.query('SELECT * FROM rider_earnings WHERE delivery_id = $1', [deliveryId]);
      if (res.rows.length > 0) {
        const e = this.mapRiderEarning(res.rows[0]);
        this.riderEarnings.set(e.id, e);
        return e;
      }
    } catch {
      allowMemoryAdapter();
      // Memory fallback
    }
    return null;
  }

  public async findRiderEarningsByRiderId(riderId: string): Promise<RiderEarning[]> {
    if (config.storage.mode === "postgres") { const found=await rows("SELECT * FROM rider_earnings WHERE rider_id=$1",[riderId]); return found.map(this.mapRiderEarning); }
    const list = Array.from(this.riderEarnings.values()).filter((e) => e.rider_id === riderId);
    if (list.length > 0) return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    try {
      const res = await pool.query('SELECT * FROM rider_earnings WHERE rider_id = $1 ORDER BY created_at DESC', [riderId]);
      return res.rows.map(this.mapRiderEarning);
    } catch {
      allowMemoryAdapter();
      return [];
    }
  }

  public async findRiderEarningById(id: string): Promise<RiderEarning | null> {
    if (config.storage.mode === "memory") return this.riderEarnings.get(id) || null;
    try {
      const res = await pool.query('SELECT * FROM rider_earnings WHERE id=$1', [id]);
      return res.rows[0] ? this.mapRiderEarning(res.rows[0]) : null;
    } catch {
      allowMemoryAdapter();
      return null;
    }
  }

  public async saveRiderEarning(earning: RiderEarning): Promise<RiderEarning> {
    this.riderEarnings.set(earning.id, earning);
    try {
      await pool.query(
        `INSERT INTO rider_earnings (id, rider_id, delivery_id, order_id, base_amount_minor, distance_amount_minor, waiting_amount_minor, bonus_amount_minor, adjustment_amount_minor, total_amount_minor, currency, status, rules_snapshot, created_at, settled_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, settled_at = EXCLUDED.settled_at`,
        [
          earning.id,
          earning.rider_id,
          earning.delivery_id,
          earning.order_id,
          earning.base_amount_minor,
          earning.distance_amount_minor,
          earning.waiting_amount_minor,
          earning.bonus_amount_minor,
          earning.adjustment_amount_minor,
          earning.total_amount_minor,
          earning.currency,
          earning.status,
          JSON.stringify(earning.rules_snapshot || {}),
          earning.created_at,
          earning.settled_at || null,
        ]
      );
    } catch {
      allowMemoryAdapter();
      // Memory fallback
    }
    return earning;
  }

  // ==========================================================================
  // MERCHANT SETTLEMENTS
  // ==========================================================================

  public async saveSettlement(settlement: MerchantSettlement, lines: MerchantSettlementLine[]): Promise<MerchantSettlement> {
    this.settlements.set(settlement.id, settlement);
    this.settlementLines.set(settlement.id, lines);

    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO merchant_settlements (id, settlement_number, merchant_id, currency, period_start, period_end, gross_order_value_minor, commission_amount_minor, promotion_amount_minor, refund_amount_minor, adjustment_amount_minor, net_settlement_amount_minor, status, calculated_by, approved_by, approved_at, initiated_by, processing_at, paid_at, failed_at, payment_reference, failure_reason, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
           ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, approved_by = EXCLUDED.approved_by, approved_at = EXCLUDED.approved_at, initiated_by = EXCLUDED.initiated_by, processing_at = EXCLUDED.processing_at, paid_at = EXCLUDED.paid_at, failed_at = EXCLUDED.failed_at, payment_reference = EXCLUDED.payment_reference, failure_reason = EXCLUDED.failure_reason`,
          [
            settlement.id,
            settlement.settlement_number,
            settlement.merchant_id,
            settlement.currency,
            settlement.period_start,
            settlement.period_end,
            settlement.gross_order_value_minor,
            settlement.commission_amount_minor,
            settlement.promotion_amount_minor,
            settlement.refund_amount_minor,
            settlement.adjustment_amount_minor,
            settlement.net_settlement_amount_minor,
            settlement.status,
            settlement.calculated_by || null,
            settlement.approved_by || null,
            settlement.approved_at || null,
            settlement.initiated_by || null,
            settlement.processing_at || null,
            settlement.paid_at || null,
            settlement.failed_at || null,
            settlement.payment_reference || null,
            settlement.failure_reason || null,
            settlement.created_at,
          ]
        );

        for (const line of lines) {
          await client.query(
            `INSERT INTO merchant_settlement_lines (id, settlement_id, entry_type, reference_id, gross_amount_minor, commission_amount_minor, net_amount_minor, description, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (settlement_id, reference_id, entry_type) DO NOTHING`,
            [
              line.id,
              line.settlement_id,
              line.entry_type,
              line.reference_id,
              line.gross_amount_minor,
              line.commission_amount_minor,
              line.net_amount_minor,
              line.description || null,
              line.created_at,
            ]
          );
        }

        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    } catch {
      allowMemoryAdapter();
      // Memory fallback
    }

    return { ...settlement, lines };
  }

  public async findSettlementById(id: string): Promise<MerchantSettlement | null> {
    if (config.storage.mode === "memory" && this.settlements.has(id)) {
      const s = this.settlements.get(id)!;
      const lines = this.settlementLines.get(id) || [];
      return { ...s, lines };
    }
    try {
      const res = await pool.query('SELECT * FROM merchant_settlements WHERE id = $1', [id]);
      if (res.rows.length > 0) {
        const s = this.mapSettlement(res.rows[0]);
        const linesRes = await pool.query('SELECT * FROM merchant_settlement_lines WHERE settlement_id = $1', [id]);
        s.lines = linesRes.rows.map(this.mapSettlementLine);
        this.settlements.set(s.id, s);
        this.settlementLines.set(s.id, s.lines);
        return s;
      }
    } catch {
      allowMemoryAdapter();
      // Memory fallback
    }
    return null;
  }

  public async findSettlements(filter?: { merchantId?: string; status?: MerchantSettlementStatus }): Promise<MerchantSettlement[]> {
    let list = config.storage.mode === "memory" ? Array.from(this.settlements.values()) : [];
    if (filter?.merchantId) list = list.filter((s) => s.merchant_id === filter.merchantId);
    if (filter?.status) list = list.filter((s) => s.status === filter.status);

    if (list.length > 0) {
      return list
        .map((s) => ({ ...s, lines: this.settlementLines.get(s.id) || [] }))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    try {
      let query = 'SELECT * FROM merchant_settlements WHERE 1=1';
      const params: any[] = [];
      if (filter?.merchantId) {
        params.push(filter.merchantId);
        query += ` AND merchant_id = $${params.length}`;
      }
      if (filter?.status) {
        params.push(filter.status);
        query += ` AND status = $${params.length}`;
      }
      query += ' ORDER BY created_at DESC';
      const res = await pool.query(query, params);
      return res.rows.map(this.mapSettlement);
    } catch {
      allowMemoryAdapter();
      return [];
    }
  }

  // ==========================================================================
  // RIDER PAYOUTS
  // ==========================================================================

  public async saveRiderPayout(payout: RiderPayout, lines: RiderPayoutLine[]): Promise<RiderPayout> {
    this.payouts.set(payout.id, payout);
    this.payoutLines.set(payout.id, lines);

    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO rider_payouts (id, payout_number, rider_id, currency, amount_minor, period_start, period_end, status, provider, provider_reference, calculated_by, approved_by, approved_at, initiated_by, processing_at, paid_at, failed_at, failure_reason, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
           ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, approved_by = EXCLUDED.approved_by, approved_at = EXCLUDED.approved_at, initiated_by = EXCLUDED.initiated_by, processing_at = EXCLUDED.processing_at, paid_at = EXCLUDED.paid_at, failed_at = EXCLUDED.failed_at, failure_reason = EXCLUDED.failure_reason, provider_reference = EXCLUDED.provider_reference`,
          [
            payout.id,
            payout.payout_number,
            payout.rider_id,
            payout.currency,
            payout.amount_minor,
            payout.period_start,
            payout.period_end,
            payout.status,
            payout.provider,
            payout.provider_reference || null,
            payout.calculated_by || null,
            payout.approved_by || null,
            payout.approved_at || null,
            payout.initiated_by || null,
            payout.processing_at || null,
            payout.paid_at || null,
            payout.failed_at || null,
            payout.failure_reason || null,
            payout.created_at,
          ]
        );

        for (const line of lines) {
          await client.query(
            `INSERT INTO rider_payout_lines (id, payout_id, earning_id, amount_minor, created_at)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (payout_id, earning_id) DO NOTHING`,
            [line.id, line.payout_id, line.earning_id, line.amount_minor, line.created_at]
          );
        }

        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    } catch {
      allowMemoryAdapter();
      // Memory fallback
    }

    return { ...payout, lines };
  }

  public async findRiderPayoutById(id: string): Promise<RiderPayout | null> {
    if (config.storage.mode === "memory" && this.payouts.has(id)) {
      const p = this.payouts.get(id)!;
      const lines = this.payoutLines.get(id) || [];
      return { ...p, lines };
    }
    try {
      const res = await pool.query('SELECT * FROM rider_payouts WHERE id = $1', [id]);
      if (res.rows.length > 0) {
        const p = this.mapPayout(res.rows[0]);
        const linesRes = await pool.query('SELECT * FROM rider_payout_lines WHERE payout_id = $1', [id]);
        p.lines = linesRes.rows.map(this.mapPayoutLine);
        this.payouts.set(p.id, p);
        this.payoutLines.set(p.id, p.lines);
        return p;
      }
    } catch {
      allowMemoryAdapter();
      // Memory fallback
    }
    return null;
  }

  public async findRiderPayouts(filter?: { riderId?: string; status?: RiderPayoutStatus }): Promise<RiderPayout[]> {
    let list = config.storage.mode === "memory" ? Array.from(this.payouts.values()) : [];
    if (filter?.riderId) list = list.filter((p) => p.rider_id === filter.riderId);
    if (filter?.status) list = list.filter((p) => p.status === filter.status);

    if (list.length > 0) {
      return list
        .map((p) => ({ ...p, lines: this.payoutLines.get(p.id) || [] }))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    try {
      let query = 'SELECT * FROM rider_payouts WHERE 1=1';
      const params: any[] = [];
      if (filter?.riderId) {
        params.push(filter.riderId);
        query += ` AND rider_id = $${params.length}`;
      }
      if (filter?.status) {
        params.push(filter.status);
        query += ` AND status = $${params.length}`;
      }
      query += ' ORDER BY created_at DESC';
      const res = await pool.query(query, params);
      return res.rows.map(this.mapPayout);
    } catch {
      allowMemoryAdapter();
      return [];
    }
  }

  // ==========================================================================
  // ORDER FINANCIAL SUMMARIES
  // ==========================================================================

  public async saveOrderSummary(summary: OrderFinancialSummary): Promise<OrderFinancialSummary> {
    if (!summary.merchant_id) {
      // The settlement engine now scopes exclusively by merchant_id (see
      // getOrderSummariesByMerchant); a summary saved without it would be permanently
      // unreachable by any settlement run rather than silently mis-attributed to the wrong
      // merchant, which is the failure mode this guard exists to prevent.
      throw new Error('OrderFinancialSummary.merchant_id is required to save an order summary');
    }
    this.orderSummaries.set(summary.order_id, summary);
    try {
      await pool.query(
        `INSERT INTO order_financial_summaries (order_id, order_number, merchant_id, currency, gmv_minor, food_subtotal_minor, commission_rate, commission_revenue_minor, delivery_revenue_minor, service_fee_revenue_minor, gross_platform_revenue_minor, rider_cost_minor, payment_processing_cost_minor, platform_funded_discount_minor, merchant_funded_discount_minor, refund_cost_minor, contribution_profit_minor, contribution_margin_pct, merchant_payable_minor, is_negative_margin, calculated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
         ON CONFLICT (order_id) DO UPDATE SET
           commission_revenue_minor = EXCLUDED.commission_revenue_minor,
           delivery_revenue_minor = EXCLUDED.delivery_revenue_minor,
           service_fee_revenue_minor = EXCLUDED.service_fee_revenue_minor,
           gross_platform_revenue_minor = EXCLUDED.gross_platform_revenue_minor,
           payment_processing_cost_minor = EXCLUDED.payment_processing_cost_minor,
           platform_funded_discount_minor = EXCLUDED.platform_funded_discount_minor,
           rider_cost_minor = EXCLUDED.rider_cost_minor,
           refund_cost_minor = EXCLUDED.refund_cost_minor,
           contribution_profit_minor = EXCLUDED.contribution_profit_minor,
           contribution_margin_pct = EXCLUDED.contribution_margin_pct,
           merchant_payable_minor = EXCLUDED.merchant_payable_minor,
           is_negative_margin = EXCLUDED.is_negative_margin,
           calculated_at = EXCLUDED.calculated_at`,
        [
          summary.order_id,
          summary.order_number,
          summary.merchant_id,
          summary.currency,
          summary.gmv_minor,
          summary.food_subtotal_minor,
          summary.commission_rate,
          summary.commission_revenue_minor,
          summary.delivery_revenue_minor,
          summary.service_fee_revenue_minor,
          summary.gross_platform_revenue_minor,
          summary.rider_cost_minor,
          summary.payment_processing_cost_minor,
          summary.platform_funded_discount_minor,
          summary.merchant_funded_discount_minor,
          summary.refund_cost_minor,
          summary.contribution_profit_minor,
          summary.contribution_margin_pct,
          summary.merchant_payable_minor,
          summary.is_negative_margin,
          summary.calculated_at,
        ]
      );
    } catch {
      allowMemoryAdapter();
      // Memory fallback
    }
    return summary;
  }

  public async findOrderSummary(orderId: string): Promise<OrderFinancialSummary | null> {
    if (config.storage.mode === "postgres") { const found=await rows("SELECT * FROM order_financial_summaries WHERE order_id=$1",[orderId]); return found[0]?this.mapOrderSummary(found[0]):null; }
    if (this.orderSummaries.has(orderId)) return this.orderSummaries.get(orderId)!;
    try {
      const res = await pool.query('SELECT * FROM order_financial_summaries WHERE order_id = $1', [orderId]);
      if (res.rows.length > 0) {
        const s = this.mapOrderSummary(res.rows[0]);
        this.orderSummaries.set(s.order_id, s);
        return s;
      }
    } catch {
      allowMemoryAdapter();
      // Memory fallback
    }
    return null;
  }

  public async getAllOrderSummaries(): Promise<OrderFinancialSummary[]> {
    if (config.storage.mode === "postgres") { const found=await rows("SELECT * FROM order_financial_summaries",[]); return found.map(this.mapOrderSummary); }
    try {
      const res = await pool.query('SELECT * FROM order_financial_summaries ORDER BY calculated_at DESC');
      if (res.rows.length > 0) return res.rows.map(this.mapOrderSummary);
    } catch {
      allowMemoryAdapter();
      // Memory fallback
    }
    return Array.from(this.orderSummaries.values());
  }

  /**
   * Order summaries for exactly one merchant within a period. This is what
   * SettlementService.calculateSettlement must use -- getAllOrderSummaries() returns every
   * merchant's summaries with no merchant scoping at all, which is what let one merchant's
   * settlement draw in another merchant's revenue (settlement.service.ts previously filtered
   * only by date after calling it).
   */
  public async getOrderSummariesByMerchant(
    merchantId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<OrderFinancialSummary[]> {
    if (config.storage.mode === "postgres") {
      const found = await rows(
        "SELECT * FROM order_financial_summaries WHERE merchant_id=$1 AND calculated_at >= $2 AND calculated_at <= $3",
        [merchantId, periodStart.toISOString(), periodEnd.toISOString()]
      );
      return found.map(this.mapOrderSummary);
    }
    try {
      const res = await pool.query(
        'SELECT * FROM order_financial_summaries WHERE merchant_id = $1 AND calculated_at >= $2 AND calculated_at <= $3',
        [merchantId, periodStart.toISOString(), periodEnd.toISOString()]
      );
      if (res.rows.length > 0) return res.rows.map(this.mapOrderSummary);
    } catch {
      allowMemoryAdapter();
      // Memory fallback
    }
    return Array.from(this.orderSummaries.values()).filter((s) => {
      if (s.merchant_id !== merchantId) return false;
      const calcDate = new Date(s.calculated_at);
      return calcDate >= periodStart && calcDate <= periodEnd;
    });
  }

  // ==========================================================================
  // FINANCIAL ADJUSTMENTS
  // ==========================================================================

  public async saveAdjustment(adj: FinancialAdjustment): Promise<FinancialAdjustment> {
    this.adjustments.set(adj.id, adj);
    try {
      await pool.query(
        `INSERT INTO financial_adjustments (
          id,reason_code,target_account_id,offset_account_id,direction,amount_minor,currency,note,
          requested_by,approved_by,approved_at,status,rejected_at,rejection_reason,ledger_transaction_id,created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        ON CONFLICT(id) DO UPDATE SET approved_by=EXCLUDED.approved_by,approved_at=EXCLUDED.approved_at,
          status=EXCLUDED.status,rejected_at=EXCLUDED.rejected_at,rejection_reason=EXCLUDED.rejection_reason,
          ledger_transaction_id=EXCLUDED.ledger_transaction_id`,
        [adj.id,adj.reason_code,adj.target_account_id,adj.offset_account_id,adj.direction,adj.amount_minor,
          adj.currency,adj.note,adj.requested_by,adj.approved_by||null,adj.approved_at||null,
          adj.status||'REQUESTED',adj.rejected_at||null,adj.rejection_reason||null,
          adj.ledger_transaction_id||null,adj.created_at]
      );
    } catch {
      allowMemoryAdapter();
    }
    return adj;
  }

  public async findAdjustmentById(id:string):Promise<FinancialAdjustment|null>{
    if(config.storage.mode==="memory") return this.adjustments.get(id)||null;
    const res=await pool.query('SELECT * FROM financial_adjustments WHERE id=$1',[id]);
    return res.rows[0]?this.mapAdjustment(res.rows[0]):null;
  }

  public async listAdjustments():Promise<FinancialAdjustment[]>{
    if(config.storage.mode==="memory") return Array.from(this.adjustments.values());
    const res=await pool.query('SELECT * FROM financial_adjustments ORDER BY created_at DESC LIMIT 200');
    return res.rows.map((r:any)=>this.mapAdjustment(r));
  }

  // ==========================================================================
  // HELPERS & MAPPERS
  // ==========================================================================

  private mapAdjustment(row:any):FinancialAdjustment {
    return {
      id:row.id,reason_code:row.reason_code,target_account_id:row.target_account_id,
      offset_account_id:row.offset_account_id,direction:row.direction,amount_minor:Number(row.amount_minor),
      currency:row.currency,note:row.note,requested_by:row.requested_by,approved_by:row.approved_by,
      approved_at:row.approved_at?new Date(row.approved_at).toISOString():null,status:row.status,
      rejected_at:row.rejected_at?new Date(row.rejected_at).toISOString():null,
      rejection_reason:row.rejection_reason,ledger_transaction_id:row.ledger_transaction_id,
      created_at:new Date(row.created_at).toISOString()
    };
  }

  private mapAccount(row: any): LedgerAccount {
    return {
      id: row.id,
      account_number: row.account_number,
      account_type: row.account_type,
      owner_type: row.owner_type,
      owner_id: row.owner_id,
      currency: row.currency,
      balance_minor: parseInt(row.balance_minor || '0', 10),
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
    };
  }

  private mapTransaction(row: any): LedgerTransaction {
    return {
      id: row.id,
      transaction_type: row.transaction_type,
      reference_type: row.reference_type,
      reference_id: row.reference_id,
      idempotency_key: row.idempotency_key,
      currency: row.currency,
      description: row.description,
      status: row.status,
      total_amount_minor: parseInt(row.total_amount_minor || '0', 10),
      effective_at: new Date(row.effective_at).toISOString(),
      created_at: new Date(row.created_at).toISOString(),
    };
  }

  private mapEntry(row: any): LedgerEntry {
    return {
      id: row.id,
      transaction_id: row.transaction_id,
      account_id: row.account_id,
      account_type: row.account_type,
      direction: row.direction,
      amount_minor: parseInt(row.amount_minor || '0', 10),
      currency: row.currency,
      description: row.description,
      created_at: new Date(row.created_at).toISOString(),
    };
  }

  private mapRiderEarning(row: any): RiderEarning {
    return {
      id: row.id,
      rider_id: row.rider_id,
      delivery_id: row.delivery_id,
      order_id: row.order_id,
      base_amount_minor: parseInt(row.base_amount_minor || '0', 10),
      distance_amount_minor: parseInt(row.distance_amount_minor || '0', 10),
      waiting_amount_minor: parseInt(row.waiting_amount_minor || '0', 10),
      bonus_amount_minor: parseInt(row.bonus_amount_minor || '0', 10),
      adjustment_amount_minor: parseInt(row.adjustment_amount_minor || '0', 10),
      total_amount_minor: parseInt(row.total_amount_minor || '0', 10),
      currency: row.currency,
      status: row.status,
      rules_snapshot: typeof row.rules_snapshot === 'string' ? JSON.parse(row.rules_snapshot) : row.rules_snapshot || {},
      created_at: new Date(row.created_at).toISOString(),
      settled_at: row.settled_at ? new Date(row.settled_at).toISOString() : null,
    };
  }

  private mapSettlement(row: any): MerchantSettlement {
    return {
      id: row.id,
      settlement_number: row.settlement_number,
      merchant_id: row.merchant_id,
      currency: row.currency,
      period_start: new Date(row.period_start).toISOString(),
      period_end: new Date(row.period_end).toISOString(),
      gross_order_value_minor: parseInt(row.gross_order_value_minor || '0', 10),
      commission_amount_minor: parseInt(row.commission_amount_minor || '0', 10),
      promotion_amount_minor: parseInt(row.promotion_amount_minor || '0', 10),
      refund_amount_minor: parseInt(row.refund_amount_minor || '0', 10),
      adjustment_amount_minor: parseInt(row.adjustment_amount_minor || '0', 10),
      net_settlement_amount_minor: parseInt(row.net_settlement_amount_minor || '0', 10),
      status: row.status,
      calculated_by: row.calculated_by,
      approved_by: row.approved_by,
      approved_at: row.approved_at ? new Date(row.approved_at).toISOString() : null,
      initiated_by: row.initiated_by,
      processing_at: row.processing_at ? new Date(row.processing_at).toISOString() : null,
      paid_at: row.paid_at ? new Date(row.paid_at).toISOString() : null,
      failed_at: row.failed_at ? new Date(row.failed_at).toISOString() : null,
      payment_reference: row.payment_reference,
      failure_reason: row.failure_reason,
      created_at: new Date(row.created_at).toISOString(),
    };
  }

  private mapSettlementLine(row: any): MerchantSettlementLine {
    return {
      id: row.id,
      settlement_id: row.settlement_id,
      entry_type: row.entry_type,
      reference_id: row.reference_id,
      gross_amount_minor: parseInt(row.gross_amount_minor || '0', 10),
      commission_amount_minor: parseInt(row.commission_amount_minor || '0', 10),
      net_amount_minor: parseInt(row.net_amount_minor || '0', 10),
      description: row.description,
      created_at: new Date(row.created_at).toISOString(),
    };
  }

  private mapPayout(row: any): RiderPayout {
    return {
      id: row.id,
      payout_number: row.payout_number,
      rider_id: row.rider_id,
      currency: row.currency,
      amount_minor: parseInt(row.amount_minor || '0', 10),
      period_start: new Date(row.period_start).toISOString(),
      period_end: new Date(row.period_end).toISOString(),
      status: row.status,
      provider: row.provider,
      provider_reference: row.provider_reference,
      calculated_by: row.calculated_by,
      approved_by: row.approved_by,
      approved_at: row.approved_at ? new Date(row.approved_at).toISOString() : null,
      initiated_by: row.initiated_by,
      processing_at: row.processing_at ? new Date(row.processing_at).toISOString() : null,
      paid_at: row.paid_at ? new Date(row.paid_at).toISOString() : null,
      failed_at: row.failed_at ? new Date(row.failed_at).toISOString() : null,
      failure_reason: row.failure_reason,
      created_at: new Date(row.created_at).toISOString(),
    };
  }

  private mapPayoutLine(row: any): RiderPayoutLine {
    return {
      id: row.id,
      payout_id: row.payout_id,
      earning_id: row.earning_id,
      amount_minor: parseInt(row.amount_minor || '0', 10),
      created_at: new Date(row.created_at).toISOString(),
    };
  }

  private mapOrderSummary(row: any): OrderFinancialSummary {
    return {
      order_id: row.order_id,
      order_number: row.order_number,
      merchant_id: row.merchant_id,
      currency: row.currency,
      gmv_minor: parseInt(row.gmv_minor || '0', 10),
      food_subtotal_minor: parseInt(row.food_subtotal_minor || '0', 10),
      commission_rate: parseFloat(row.commission_rate || '0'),
      commission_revenue_minor: parseInt(row.commission_revenue_minor || '0', 10),
      delivery_revenue_minor: parseInt(row.delivery_revenue_minor || '0', 10),
      service_fee_revenue_minor: parseInt(row.service_fee_revenue_minor || '0', 10),
      gross_platform_revenue_minor: parseInt(row.gross_platform_revenue_minor || '0', 10),
      rider_cost_minor: parseInt(row.rider_cost_minor || '0', 10),
      payment_processing_cost_minor: parseInt(row.payment_processing_cost_minor || '0', 10),
      platform_funded_discount_minor: parseInt(row.platform_funded_discount_minor || '0', 10),
      merchant_funded_discount_minor: parseInt(row.merchant_funded_discount_minor || '0', 10),
      refund_cost_minor: parseInt(row.refund_cost_minor || '0', 10),
      contribution_profit_minor: parseInt(row.contribution_profit_minor || '0', 10),
      contribution_margin_pct: parseFloat(row.contribution_margin_pct || '0'),
      merchant_payable_minor: parseInt(row.merchant_payable_minor || '0', 10),
      is_negative_margin: Boolean(row.is_negative_margin),
      calculated_at: new Date(row.calculated_at).toISOString(),
    };
  }
}

export const ledgerRepository = transactionalService(new LedgerRepository());
