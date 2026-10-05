-- ============================================================================
-- Migration 007: Sprint 6 - Cart, Pricing Engine & Checkout Preparation
-- Implements cart persistence, modifier selections, delivery pricing rules,
-- platform service fee rules, promotion engine, and authoritative checkout quotes.
-- ============================================================================

-- 1. Active Customer Carts
CREATE TABLE IF NOT EXISTS carts (
    id VARCHAR(64) PRIMARY KEY,
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES merchant_branches(id) ON DELETE RESTRICT,
    currency CHAR(3) NOT NULL DEFAULT 'KES',
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    applied_promo_code VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_carts_customer_status ON carts(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_carts_branch ON carts(branch_id);

-- 2. Cart Items
CREATE TABLE IF NOT EXISTS cart_items (
    id VARCHAR(64) PRIMARY KEY,
    cart_id VARCHAR(64) NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
    menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL CHECK (quantity > 0 AND quantity <= 99),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cart_items_cart_id ON cart_items(cart_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_menu_item ON cart_items(menu_item_id);

-- 3. Cart Item Modifiers (Options selected per item)
CREATE TABLE IF NOT EXISTS cart_item_modifiers (
    id VARCHAR(64) PRIMARY KEY,
    cart_item_id VARCHAR(64) NOT NULL REFERENCES cart_items(id) ON DELETE CASCADE,
    modifier_option_id UUID NOT NULL REFERENCES modifier_options(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cart_item_modifiers_item ON cart_item_modifiers(cart_item_id);
CREATE INDEX IF NOT EXISTS idx_cart_item_modifiers_option ON cart_item_modifiers(modifier_option_id);

-- 4. Delivery Pricing Rules
CREATE TABLE IF NOT EXISTS delivery_pricing_rules (
    id VARCHAR(64) PRIMARY KEY,
    zone_id UUID REFERENCES service_zones(id) ON DELETE SET NULL,
    base_fee_minor BIGINT NOT NULL CHECK (base_fee_minor >= 0),
    included_distance_meters INTEGER NOT NULL CHECK (included_distance_meters >= 0),
    per_km_fee_minor BIGINT NOT NULL CHECK (per_km_fee_minor >= 0),
    minimum_fee_minor BIGINT NOT NULL CHECK (minimum_fee_minor >= 0),
    maximum_fee_minor BIGINT NOT NULL CHECK (maximum_fee_minor >= minimum_fee_minor),
    max_delivery_distance_meters INTEGER NOT NULL CHECK (max_delivery_distance_meters > 0),
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    effective_from TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    effective_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. Service Fee Rules
CREATE TABLE IF NOT EXISTS service_fee_rules (
    id VARCHAR(64) PRIMARY KEY,
    fee_type VARCHAR(30) NOT NULL DEFAULT 'PERCENTAGE',
    percentage_basis_points INTEGER NOT NULL DEFAULT 250 CHECK (percentage_basis_points >= 0),
    fixed_fee_minor BIGINT NOT NULL DEFAULT 0 CHECK (fixed_fee_minor >= 0),
    minimum_fee_minor BIGINT NOT NULL DEFAULT 2000 CHECK (minimum_fee_minor >= 0),
    maximum_fee_minor BIGINT NOT NULL DEFAULT 10000 CHECK (maximum_fee_minor >= minimum_fee_minor),
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    effective_from TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    effective_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 6. Promotions Engine
CREATE TABLE IF NOT EXISTS promotions (
    id VARCHAR(64) PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    type VARCHAR(30) NOT NULL,
    value_minor_or_bps BIGINT NOT NULL DEFAULT 0 CHECK (value_minor_or_bps >= 0),
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    start_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    end_at TIMESTAMPTZ NOT NULL,
    minimum_basket_minor BIGINT NOT NULL DEFAULT 0 CHECK (minimum_basket_minor >= 0),
    usage_limit INTEGER NOT NULL DEFAULT 1000,
    times_used INTEGER NOT NULL DEFAULT 0 CHECK (times_used >= 0),
    per_customer_limit INTEGER NOT NULL DEFAULT 1 CHECK (per_customer_limit > 0),
    merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES merchant_branches(id) ON DELETE CASCADE,
    zone_id UUID REFERENCES service_zones(id) ON DELETE SET NULL,
    funding_source VARCHAR(30) NOT NULL DEFAULT 'DEETOO',
    merchant_funding_bps INTEGER NOT NULL DEFAULT 0 CHECK (merchant_funding_bps >= 0 AND merchant_funding_bps <= 10000),
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_promotions_code ON promotions(code);
CREATE INDEX IF NOT EXISTS idx_promotions_status ON promotions(status);

-- 7. Authoritative Checkout Quotes
CREATE TABLE IF NOT EXISTS checkout_quotes (
    id VARCHAR(64) PRIMARY KEY,
    quote_id VARCHAR(64) NOT NULL UNIQUE,
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    cart_id VARCHAR(64) NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES merchant_branches(id) ON DELETE RESTRICT,
    branch_name VARCHAR(255) NOT NULL,
    delivery_address_id UUID REFERENCES addresses(id) ON DELETE SET NULL,
    delivery_address_snapshot JSONB NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'KES',
    items_subtotal_minor BIGINT NOT NULL CHECK (items_subtotal_minor >= 0),
    modifiers_subtotal_minor BIGINT NOT NULL CHECK (modifiers_subtotal_minor >= 0),
    gross_subtotal_minor BIGINT NOT NULL CHECK (gross_subtotal_minor >= 0),
    discount_minor BIGINT NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
    discount_funding_source VARCHAR(30),
    net_subtotal_minor BIGINT NOT NULL CHECK (net_subtotal_minor >= 0),
    delivery_fee_minor BIGINT NOT NULL CHECK (delivery_fee_minor >= 0),
    service_fee_minor BIGINT NOT NULL CHECK (service_fee_minor >= 0),
    tax_minor BIGINT NOT NULL DEFAULT 0 CHECK (tax_minor >= 0),
    total_minor BIGINT NOT NULL CHECK (total_minor >= 0),
    distance_meters INTEGER NOT NULL CHECK (distance_meters >= 0),
    estimated_duration_min INTEGER NOT NULL DEFAULT 30,
    delivery_pricing_rule_id VARCHAR(64),
    service_fee_rule_id VARCHAR(64),
    promotion_id VARCHAR(64),
    promotion_code VARCHAR(50),
    pricing_rule_snapshot JSONB DEFAULT '{}'::jsonb,
    cart_items_snapshot JSONB DEFAULT '[]'::jsonb,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_checkout_quotes_quote_id ON checkout_quotes(quote_id);
CREATE INDEX IF NOT EXISTS idx_checkout_quotes_customer ON checkout_quotes(customer_id);
CREATE INDEX IF NOT EXISTS idx_checkout_quotes_cart ON checkout_quotes(cart_id);
