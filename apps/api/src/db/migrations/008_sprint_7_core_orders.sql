-- ============================================================================
-- Migration 008: Sprint 7 - Core Order Engine, Merchant Workflow & State Machine
-- Implements authoritative orders, snapshots, item modifiers, status timeline,
-- promotion redemptions, and idempotency key persistence.
-- ============================================================================

-- 1. Ensure orders table has all Sprint 7 authoritative snapshot columns
ALTER TABLE orders 
    ADD COLUMN IF NOT EXISTS order_number VARCHAR(32) UNIQUE,
    ADD COLUMN IF NOT EXISTS checkout_quote_id VARCHAR(64),
    ADD COLUMN IF NOT EXISTS merchant_id UUID REFERENCES merchants(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS customer_name VARCHAR(100),
    ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(50),
    ADD COLUMN IF NOT EXISTS branch_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS merchant_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS delivery_address_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS pricing_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS promotion_snapshot JSONB,
    ADD COLUMN IF NOT EXISTS estimated_prep_minutes INTEGER,
    ADD COLUMN IF NOT EXISTS estimated_ready_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS preparing_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ready_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS rejection_reason VARCHAR(100),
    ADD COLUMN IF NOT EXISTS cancellation_reason VARCHAR(100),
    ADD COLUMN IF NOT EXISTS cancelled_by_type VARCHAR(50),
    ADD COLUMN IF NOT EXISTS cancelled_by_id UUID,
    ADD COLUMN IF NOT EXISTS special_instructions TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_branch_status ON orders(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_customer_status ON orders(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);

-- 2. Order Item Modifiers (Immutable modifier snapshot per ordered item)
CREATE TABLE IF NOT EXISTS order_item_modifiers (
    id VARCHAR(64) PRIMARY KEY,
    order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    source_modifier_option_id UUID REFERENCES modifier_options(id) ON DELETE SET NULL,
    group_name VARCHAR(100) NOT NULL,
    option_name VARCHAR(100) NOT NULL,
    unit_price_delta_minor BIGINT NOT NULL DEFAULT 0 CHECK (unit_price_delta_minor >= 0),
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_order_item_modifiers_item ON order_item_modifiers(order_item_id);

-- 3. Order Timeline (Immutable lifecycle audit log per order)
CREATE TABLE IF NOT EXISTS order_timeline (
    id VARCHAR(64) PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    from_status VARCHAR(30),
    to_status VARCHAR(30) NOT NULL,
    actor_type VARCHAR(50) NOT NULL, -- CUSTOMER, MERCHANT, ADMIN, SYSTEM
    actor_id UUID,
    actor_name VARCHAR(100),
    reason_code VARCHAR(100),
    note TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_order_timeline_order ON order_timeline(order_id, created_at ASC);

-- 4. Promotion Redemptions (Tracks coupon usage per customer and order)
CREATE TABLE IF NOT EXISTS promotion_redemptions (
    id VARCHAR(64) PRIMARY KEY,
    promotion_id VARCHAR(64) NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    discount_minor BIGINT NOT NULL CHECK (discount_minor >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_promo_redemptions_promo ON promotion_redemptions(promotion_id);
CREATE INDEX IF NOT EXISTS idx_promo_redemptions_cust ON promotion_redemptions(customer_id);

-- 5. Idempotency Keys (Deduplication of critical mutation requests)
CREATE TABLE IF NOT EXISTS idempotency_keys (
    key VARCHAR(128) PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    request_hash VARCHAR(64) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PROCESSING',
    response_code INTEGER,
    response_body JSONB,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_idempotency_user ON idempotency_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys(expires_at);

-- 6. Add status column to checkout_quotes if missing
ALTER TABLE checkout_quotes
    ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'PENDING';
