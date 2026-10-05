-- =========================================================
-- DEETOO SPRINT 1 MIGRATION: 001_initial_schema.sql
-- Based on DEE-DATA-001 (PostgreSQL / PostGIS Schema)
-- =========================================================

-- 1. Identity and Access
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    email VARCHAR(255) UNIQUE,
    phone_e164 VARCHAR(20) UNIQUE,
    password_hash VARCHAR(255),
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_hash VARCHAR(255) NOT NULL UNIQUE,
    device_id VARCHAR(100),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS user_roles (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    scope_type VARCHAR(50),
    scope_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS customer_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    display_name VARCHAR(100) NOT NULL,
    default_address_id UUID,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE'
);

CREATE TABLE IF NOT EXISTS merchants (
    id UUID PRIMARY KEY,
    legal_name VARCHAR(255) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'APPROVED',
    commission_bps INTEGER NOT NULL DEFAULT 2000, -- 20.00%
    settlement_schedule VARCHAR(50) NOT NULL DEFAULT 'WEEKLY',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS merchant_memberships (
    id UUID PRIMARY KEY,
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_code VARCHAR(50) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    UNIQUE (merchant_id, user_id)
);

CREATE TABLE IF NOT EXISTS rider_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    public_code VARCHAR(50) NOT NULL UNIQUE,
    vehicle_type VARCHAR(30) NOT NULL DEFAULT 'BICYCLE',
    operational_status VARCHAR(30) NOT NULL DEFAULT 'OFFLINE',
    compliance_status VARCHAR(30) NOT NULL DEFAULT 'APPROVED'
);

-- 2. Merchant & Catalogue
CREATE TABLE IF NOT EXISTS merchant_branches (
    id UUID PRIMARY KEY,
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE RESTRICT,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
    phone VARCHAR(30),
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    address_text VARCHAR(255) NOT NULL,
    timezone VARCHAR(50) NOT NULL DEFAULT 'Africa/Nairobi',
    min_order_minor BIGINT NOT NULL DEFAULT 0,
    currency CHAR(3) NOT NULL DEFAULT 'KES',
    prep_default_min INTEGER NOT NULL DEFAULT 20,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS service_zones (
    id UUID PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    city_id VARCHAR(50) NOT NULL DEFAULT 'NAIROBI',
    config JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS branch_service_zones (
    branch_id UUID NOT NULL REFERENCES merchant_branches(id) ON DELETE CASCADE,
    service_zone_id UUID NOT NULL REFERENCES service_zones(id) ON DELETE CASCADE,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    PRIMARY KEY (branch_id, service_zone_id)
);

CREATE TABLE IF NOT EXISTS menus (
    id UUID PRIMARY KEY,
    branch_id UUID NOT NULL REFERENCES merchant_branches(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    currency CHAR(3) NOT NULL DEFAULT 'KES'
);

CREATE TABLE IF NOT EXISTS menu_categories (
    id UUID PRIMARY KEY,
    menu_id UUID NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS menu_items (
    id UUID PRIMARY KEY,
    menu_id UUID NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES menu_categories(id) ON DELETE RESTRICT,
    sku VARCHAR(100),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price_minor BIGINT NOT NULL CHECK (price_minor >= 0),
    is_available BOOLEAN NOT NULL DEFAULT true,
    image_key VARCHAR(255),
    sort_order INTEGER NOT NULL DEFAULT 0
);

-- 3. Customer & Orders
CREATE TABLE IF NOT EXISTS addresses (
    id UUID PRIMARY KEY,
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label VARCHAR(50) NOT NULL,
    recipient_name VARCHAR(100) NOT NULL,
    phone_e164 VARCHAR(20) NOT NULL,
    address_text VARCHAR(255) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    instructions TEXT,
    is_default BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY,
    public_code VARCHAR(30) NOT NULL UNIQUE,
    customer_id UUID NOT NULL REFERENCES users(id),
    branch_id UUID NOT NULL REFERENCES merchant_branches(id),
    delivery_address_id UUID,
    service_zone_id UUID,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING_PAYMENT',
    currency CHAR(3) NOT NULL DEFAULT 'KES',
    subtotal_minor BIGINT NOT NULL CHECK (subtotal_minor >= 0),
    delivery_fee_minor BIGINT NOT NULL CHECK (delivery_fee_minor >= 0),
    service_fee_minor BIGINT NOT NULL CHECK (service_fee_minor >= 0),
    discount_minor BIGINT NOT NULL DEFAULT 0,
    total_minor BIGINT NOT NULL CHECK (total_minor >= 0),
    payment_id UUID,
    placed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    source_menu_item_id UUID,
    item_name VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_base_minor BIGINT NOT NULL CHECK (unit_base_minor >= 0),
    line_total_minor BIGINT NOT NULL CHECK (line_total_minor >= 0),
    item_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS order_status_history (
    id UUID PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    from_status VARCHAR(30) NOT NULL,
    to_status VARCHAR(30) NOT NULL,
    actor_type VARCHAR(50) NOT NULL,
    actor_id UUID,
    reason_code VARCHAR(50),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Rider & Delivery
CREATE TABLE IF NOT EXISTS deliveries (
    id UUID PRIMARY KEY,
    order_id UUID NOT NULL UNIQUE REFERENCES orders(id),
    status VARCHAR(30) NOT NULL DEFAULT 'UNASSIGNED',
    assigned_rider_id UUID REFERENCES users(id),
    pickup_branch_id UUID NOT NULL REFERENCES merchant_branches(id),
    dropoff_latitude DOUBLE PRECISION NOT NULL,
    dropoff_longitude DOUBLE PRECISION NOT NULL,
    offered_at TIMESTAMPTZ,
    assigned_at TIMESTAMPTZ,
    picked_up_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    proof_type VARCHAR(50),
    proof_ref VARCHAR(255),
    version INTEGER NOT NULL DEFAULT 1
);

-- 5. Payments & Double-Entry Ledger
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY,
    order_id UUID REFERENCES orders(id),
    customer_id UUID NOT NULL REFERENCES users(id),
    status VARCHAR(30) NOT NULL DEFAULT 'INITIATED',
    currency CHAR(3) NOT NULL DEFAULT 'KES',
    requested_minor BIGINT NOT NULL CHECK (requested_minor >= 0),
    captured_minor BIGINT NOT NULL DEFAULT 0 CHECK (captured_minor >= 0),
    refunded_minor BIGINT NOT NULL DEFAULT 0 CHECK (refunded_minor <= captured_minor),
    provider_preference VARCHAR(50) NOT NULL DEFAULT 'MPESA',
    idempotency_key VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ledger_accounts (
    id UUID PRIMARY KEY,
    code VARCHAR(100) NOT NULL UNIQUE,
    owner_type VARCHAR(50) NOT NULL,
    owner_id UUID,
    account_type VARCHAR(50) NOT NULL, -- ASSET, LIABILITY, REVENUE, EXPENSE
    currency CHAR(3) NOT NULL DEFAULT 'KES',
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE'
);

CREATE TABLE IF NOT EXISTS ledger_transactions (
    id UUID PRIMARY KEY,
    reference_type VARCHAR(50) NOT NULL,
    reference_id UUID NOT NULL,
    transaction_type VARCHAR(50) NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'KES',
    status VARCHAR(30) NOT NULL DEFAULT 'POSTED',
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    posted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reversed_by_id UUID REFERENCES ledger_transactions(id)
);

CREATE TABLE IF NOT EXISTS ledger_entries (
    id UUID PRIMARY KEY,
    transaction_id UUID NOT NULL REFERENCES ledger_transactions(id) ON DELETE RESTRICT,
    account_id UUID NOT NULL REFERENCES ledger_accounts(id),
    side VARCHAR(10) NOT NULL CHECK (side IN ('DEBIT', 'CREDIT')),
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 6. Platform Support & Outbox
CREATE TABLE IF NOT EXISTS idempotency_keys (
    id UUID PRIMARY KEY,
    actor_type VARCHAR(50) NOT NULL,
    actor_id UUID NOT NULL,
    operation VARCHAR(100) NOT NULL,
    key VARCHAR(128) NOT NULL,
    request_hash VARCHAR(128) NOT NULL,
    response_code INTEGER,
    response_body JSONB,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(actor_id, operation, key)
);

CREATE TABLE IF NOT EXISTS outbox_events (
    id UUID PRIMARY KEY,
    aggregate_type VARCHAR(50) NOT NULL,
    aggregate_id UUID NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    published_at TIMESTAMPTZ,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    actor_user_id UUID,
    actor_role VARCHAR(50),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID,
    request_id VARCHAR(100),
    reason TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
