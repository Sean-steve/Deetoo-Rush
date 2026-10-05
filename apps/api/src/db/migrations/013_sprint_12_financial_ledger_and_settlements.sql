-- ============================================================================
-- Migration 013: Sprint 12 - Financial Ledger, Merchant Settlements,
-- Rider Earnings & Payouts, Platform Revenue and Profitability Accounting
-- ============================================================================

-- 1. Ledger Accounts (Double-Entry Chart of Accounts)
CREATE TABLE IF NOT EXISTS ledger_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_number VARCHAR(100) NOT NULL UNIQUE,
    account_type VARCHAR(100) NOT NULL,
    owner_type VARCHAR(50) NOT NULL,
    owner_id VARCHAR(255),
    currency CHAR(3) NOT NULL DEFAULT 'KES',
    balance_minor BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ledger_accounts_lookup 
    ON ledger_accounts(account_type, owner_type, owner_id, currency);

-- 2. Ledger Transactions (Group of balanced entries)
CREATE TABLE IF NOT EXISTS ledger_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_type VARCHAR(100) NOT NULL,
    reference_type VARCHAR(50) NOT NULL,
    reference_id VARCHAR(255) NOT NULL,
    idempotency_key VARCHAR(255) NOT NULL UNIQUE,
    currency CHAR(3) NOT NULL DEFAULT 'KES',
    description TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'POSTED',
    total_amount_minor BIGINT NOT NULL CHECK (total_amount_minor >= 0),
    effective_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ledger_transactions_ref 
    ON ledger_transactions(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_ledger_transactions_type_time 
    ON ledger_transactions(transaction_type, effective_at);

-- 3. Ledger Entries (Immutable double-entry debits and credits)
CREATE TABLE IF NOT EXISTS ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES ledger_transactions(id) ON DELETE RESTRICT,
    account_id UUID NOT NULL REFERENCES ledger_accounts(id) ON DELETE RESTRICT,
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('DEBIT', 'CREDIT')),
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    currency CHAR(3) NOT NULL DEFAULT 'KES',
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_account 
    ON ledger_entries(account_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_transaction 
    ON ledger_entries(transaction_id);

-- 4. Merchant Commission Rules
CREATE TABLE IF NOT EXISTS merchant_commission_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE,
    percentage_rate NUMERIC(6, 4) NOT NULL CHECK (percentage_rate >= 0 AND percentage_rate <= 1),
    fixed_fee_minor BIGINT NOT NULL DEFAULT 0 CHECK (fixed_fee_minor >= 0),
    effective_from TIMESTAMPTZ NOT NULL,
    effective_until TIMESTAMPTZ,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_merchant_commission_rules_merchant 
    ON merchant_commission_rules(merchant_id, status, effective_from);

-- 5. Rider Earnings (Per-delivery courier compensation)
CREATE TABLE IF NOT EXISTS rider_earnings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rider_id UUID NOT NULL REFERENCES rider_profiles(id) ON DELETE RESTRICT,
    delivery_id UUID NOT NULL REFERENCES deliveries(id) ON DELETE RESTRICT UNIQUE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    base_amount_minor BIGINT NOT NULL CHECK (base_amount_minor >= 0),
    distance_amount_minor BIGINT NOT NULL DEFAULT 0 CHECK (distance_amount_minor >= 0),
    waiting_amount_minor BIGINT NOT NULL DEFAULT 0 CHECK (waiting_amount_minor >= 0),
    bonus_amount_minor BIGINT NOT NULL DEFAULT 0 CHECK (bonus_amount_minor >= 0),
    adjustment_amount_minor BIGINT NOT NULL DEFAULT 0,
    total_amount_minor BIGINT NOT NULL CHECK (total_amount_minor >= 0),
    currency CHAR(3) NOT NULL DEFAULT 'KES',
    status VARCHAR(50) NOT NULL DEFAULT 'ELIGIBLE',
    rules_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    settled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_rider_earnings_rider_status 
    ON rider_earnings(rider_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_rider_earnings_delivery 
    ON rider_earnings(delivery_id);

-- 6. Merchant Settlements
CREATE TABLE IF NOT EXISTS merchant_settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    settlement_number VARCHAR(100) NOT NULL UNIQUE,
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE RESTRICT,
    currency CHAR(3) NOT NULL DEFAULT 'KES',
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    gross_order_value_minor BIGINT NOT NULL DEFAULT 0,
    commission_amount_minor BIGINT NOT NULL DEFAULT 0,
    promotion_amount_minor BIGINT NOT NULL DEFAULT 0,
    refund_amount_minor BIGINT NOT NULL DEFAULT 0,
    adjustment_amount_minor BIGINT NOT NULL DEFAULT 0,
    net_settlement_amount_minor BIGINT NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'CALCULATED',
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    payment_reference VARCHAR(255),
    failure_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_merchant_settlements_merchant 
    ON merchant_settlements(merchant_id, status, period_end);

-- 7. Merchant Settlement Lines
CREATE TABLE IF NOT EXISTS merchant_settlement_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    settlement_id UUID NOT NULL REFERENCES merchant_settlements(id) ON DELETE CASCADE,
    entry_type VARCHAR(50) NOT NULL,
    reference_id VARCHAR(255) NOT NULL,
    gross_amount_minor BIGINT NOT NULL DEFAULT 0,
    commission_amount_minor BIGINT NOT NULL DEFAULT 0,
    net_amount_minor BIGINT NOT NULL DEFAULT 0,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_settlement_line UNIQUE (settlement_id, reference_id, entry_type)
);

-- 8. Rider Payouts
CREATE TABLE IF NOT EXISTS rider_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payout_number VARCHAR(100) NOT NULL UNIQUE,
    rider_id UUID NOT NULL REFERENCES rider_profiles(id) ON DELETE RESTRICT,
    currency CHAR(3) NOT NULL DEFAULT 'KES',
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
    provider VARCHAR(50) NOT NULL DEFAULT 'MPESA_B2C',
    provider_reference VARCHAR(255),
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    failure_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rider_payouts_rider 
    ON rider_payouts(rider_id, status, created_at);

-- 9. Rider Payout Lines
CREATE TABLE IF NOT EXISTS rider_payout_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payout_id UUID NOT NULL REFERENCES rider_payouts(id) ON DELETE CASCADE,
    earning_id UUID NOT NULL REFERENCES rider_earnings(id) ON DELETE RESTRICT,
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_payout_earning UNIQUE (payout_id, earning_id)
);

-- 10. Financial Adjustments
CREATE TABLE IF NOT EXISTS financial_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reason_code VARCHAR(100) NOT NULL,
    target_account_id UUID NOT NULL REFERENCES ledger_accounts(id) ON DELETE RESTRICT,
    offset_account_id UUID NOT NULL REFERENCES ledger_accounts(id) ON DELETE RESTRICT,
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('DEBIT', 'CREDIT')),
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    currency CHAR(3) NOT NULL DEFAULT 'KES',
    note TEXT NOT NULL,
    requested_by UUID NOT NULL REFERENCES users(id),
    approved_by UUID REFERENCES users(id),
    ledger_transaction_id UUID REFERENCES ledger_transactions(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 11. Order Financial Summaries (Read Model / Materialized Economics)
CREATE TABLE IF NOT EXISTS order_financial_summaries (
    order_id UUID PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
    order_number VARCHAR(100) NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'KES',
    gmv_minor BIGINT NOT NULL,
    food_subtotal_minor BIGINT NOT NULL,
    commission_rate NUMERIC(6, 4) NOT NULL,
    commission_revenue_minor BIGINT NOT NULL,
    delivery_revenue_minor BIGINT NOT NULL,
    service_fee_revenue_minor BIGINT NOT NULL,
    gross_platform_revenue_minor BIGINT NOT NULL,
    rider_cost_minor BIGINT NOT NULL DEFAULT 0,
    payment_processing_cost_minor BIGINT NOT NULL DEFAULT 0,
    platform_funded_discount_minor BIGINT NOT NULL DEFAULT 0,
    merchant_funded_discount_minor BIGINT NOT NULL DEFAULT 0,
    refund_cost_minor BIGINT NOT NULL DEFAULT 0,
    contribution_profit_minor BIGINT NOT NULL,
    contribution_margin_pct NUMERIC(6, 2) NOT NULL,
    merchant_payable_minor BIGINT NOT NULL,
    is_negative_margin BOOLEAN NOT NULL DEFAULT FALSE,
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
