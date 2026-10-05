-- ============================================================================
-- Migration 012: Sprint 11 - Payments, M-PESA/Card Integration,
-- Authoritative State Machine, Idempotency, Callbacks & Refund Foundation
-- ============================================================================

-- 1. Extend existing payments table with provider metadata, lifecycle timestamps, failure codes & reconciliation status
ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS provider VARCHAR(50) NOT NULL DEFAULT 'MPESA',
    ADD COLUMN IF NOT EXISTS method VARCHAR(50) NOT NULL DEFAULT 'MPESA',
    ADD COLUMN IF NOT EXISTS provider_payment_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS provider_reference VARCHAR(255),
    ADD COLUMN IF NOT EXISTS merchant_request_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS checkout_request_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS mpesa_receipt_number VARCHAR(100),
    ADD COLUMN IF NOT EXISTS phone VARCHAR(50),
    ADD COLUMN IF NOT EXISTS failure_code VARCHAR(100),
    ADD COLUMN IF NOT EXISTS failure_message TEXT,
    ADD COLUMN IF NOT EXISTS reconciliation_status VARCHAR(50) NOT NULL DEFAULT 'UNRECONCILED',
    ADD COLUMN IF NOT EXISTS initiated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS authorized_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS captured_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;

-- 2. Create payment_timeline table for immutable event history
CREATE TABLE IF NOT EXISTS payment_timeline (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    from_status VARCHAR(50),
    to_status VARCHAR(50) NOT NULL,
    provider_reference VARCHAR(255),
    reason_code VARCHAR(100),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Create payment_provider_events table for webhook audit & replay protection / deduplication
CREATE TABLE IF NOT EXISTS payment_provider_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(50) NOT NULL,
    provider_event_id VARCHAR(255) NOT NULL,
    payment_id UUID REFERENCES payments(id),
    event_type VARCHAR(100) NOT NULL,
    payload_hash VARCHAR(64) NOT NULL,
    raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    processing_status VARCHAR(50) NOT NULL DEFAULT 'RECEIVED', -- 'RECEIVED', 'PROCESSED', 'FAILED', 'DUPLICATE'
    received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMPTZ,
    CONSTRAINT uq_payment_provider_events UNIQUE (provider, provider_event_id)
);

-- 4. Create refunds table for refund tracking and limits
CREATE TABLE IF NOT EXISTS refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    currency CHAR(3) NOT NULL DEFAULT 'KES',
    status VARCHAR(50) NOT NULL DEFAULT 'REQUESTED', -- 'REQUESTED', 'PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED'
    reason_code VARCHAR(100) NOT NULL,
    note TEXT,
    requested_by UUID NOT NULL REFERENCES users(id),
    provider_refund_id VARCHAR(255),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. Create refund_timeline table
CREATE TABLE IF NOT EXISTS refund_timeline (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    refund_id UUID NOT NULL REFERENCES refunds(id) ON DELETE CASCADE,
    from_status VARCHAR(50),
    to_status VARCHAR(50) NOT NULL,
    reason_code VARCHAR(100),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 6. Create payment_idempotency_keys table
CREATE TABLE IF NOT EXISTS payment_idempotency_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    customer_id UUID NOT NULL,
    order_id UUID NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    payment_id UUID REFERENCES payments(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 7. High-performance operational and audit indexes
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer_created ON payments(customer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_payments_status_created ON payments(status, created_at);
CREATE INDEX IF NOT EXISTS idx_payments_provider_ref ON payments(provider, provider_reference);
CREATE INDEX IF NOT EXISTS idx_payments_merchant_req_id ON payments(merchant_request_id);
CREATE INDEX IF NOT EXISTS idx_payments_checkout_req_id ON payments(checkout_request_id);
CREATE INDEX IF NOT EXISTS idx_payments_mpesa_receipt ON payments(mpesa_receipt_number);
CREATE INDEX IF NOT EXISTS idx_payments_reconciliation ON payments(reconciliation_status);

CREATE INDEX IF NOT EXISTS idx_payment_timeline_payment ON payment_timeline(payment_id, created_at);

CREATE INDEX IF NOT EXISTS idx_payment_provider_events_lookup ON payment_provider_events(provider, provider_event_id);
CREATE INDEX IF NOT EXISTS idx_payment_provider_events_status ON payment_provider_events(processing_status, received_at);

CREATE INDEX IF NOT EXISTS idx_refunds_payment ON refunds(payment_id);
CREATE INDEX IF NOT EXISTS idx_refunds_order ON refunds(order_id);
CREATE INDEX IF NOT EXISTS idx_refunds_status_created ON refunds(status, created_at);

CREATE INDEX IF NOT EXISTS idx_refund_timeline_refund ON refund_timeline(refund_id, created_at);
