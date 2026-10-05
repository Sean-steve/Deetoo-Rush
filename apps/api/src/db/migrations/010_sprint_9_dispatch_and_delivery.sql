-- ============================================================================
-- Migration 010: Sprint 9 - Dispatch, Rider Matching, Delivery Offers & Reassignment
-- Implements production-capable dispatch engine, delivery lifecycle, offers,
-- timelines, attempts, and double-assignment prevention constraints.
-- ============================================================================

-- 1. Upgrade or create deliveries table
CREATE TABLE IF NOT EXISTS deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
    status VARCHAR(30) NOT NULL DEFAULT 'UNASSIGNED',
    assigned_rider_id UUID REFERENCES rider_profiles(id),
    branch_id UUID NOT NULL REFERENCES merchant_branches(id),
    customer_id UUID NOT NULL REFERENCES users(id),
    pickup_latitude DOUBLE PRECISION,
    pickup_longitude DOUBLE PRECISION,
    dropoff_latitude DOUBLE PRECISION NOT NULL,
    dropoff_longitude DOUBLE PRECISION NOT NULL,
    pickup_address_text TEXT,
    dropoff_address_text TEXT,
    delivery_instructions TEXT,
    estimated_prep_minutes INTEGER,
    estimated_ready_at TIMESTAMPTZ,
    dispatch_not_before TIMESTAMPTZ,
    dispatch_started_at TIMESTAMPTZ,
    assigned_at TIMESTAMPTZ,
    picked_up_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    reassignment_count INTEGER NOT NULL DEFAULT 0,
    dispatch_attention_required BOOLEAN NOT NULL DEFAULT FALSE,
    attention_reason VARCHAR(100),
    current_search_radius_meters INTEGER NOT NULL DEFAULT 2000,
    dispatch_cycle_count INTEGER NOT NULL DEFAULT 0,
    proof_type VARCHAR(50),
    proof_ref VARCHAR(255),
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- In case deliveries table was created in 001, ensure all columns exist
ALTER TABLE deliveries
    ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid(),
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES merchant_branches(id),
    ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS pickup_latitude DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS pickup_longitude DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS pickup_address_text TEXT,
    ADD COLUMN IF NOT EXISTS dropoff_address_text TEXT,
    ADD COLUMN IF NOT EXISTS delivery_instructions TEXT,
    ADD COLUMN IF NOT EXISTS estimated_prep_minutes INTEGER,
    ADD COLUMN IF NOT EXISTS estimated_ready_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS dispatch_not_before TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS dispatch_started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reassignment_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS dispatch_attention_required BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS attention_reason VARCHAR(100),
    ADD COLUMN IF NOT EXISTS current_search_radius_meters INTEGER NOT NULL DEFAULT 2000,
    ADD COLUMN IF NOT EXISTS dispatch_cycle_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 2. Create delivery_offers table
CREATE TABLE IF NOT EXISTS delivery_offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_id UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    rider_id UUID NOT NULL REFERENCES rider_profiles(id) ON DELETE CASCADE,
    status VARCHAR(30) NOT NULL DEFAULT 'OFFERED',
    rank INTEGER NOT NULL DEFAULT 1,
    score DOUBLE PRECISION NOT NULL DEFAULT 0,
    distance_to_pickup_meters INTEGER NOT NULL DEFAULT 0,
    estimated_pickup_eta_seconds INTEGER NOT NULL DEFAULT 0,
    offered_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    responded_at TIMESTAMPTZ,
    rejection_reason VARCHAR(100),
    rejection_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Create delivery_timeline table
CREATE TABLE IF NOT EXISTS delivery_timeline (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_id UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
    from_status VARCHAR(30),
    to_status VARCHAR(30) NOT NULL,
    actor_type VARCHAR(50) NOT NULL,
    actor_id UUID,
    actor_name VARCHAR(100),
    action VARCHAR(100) NOT NULL,
    reason_code VARCHAR(100),
    note TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Create dispatch_attempts table
CREATE TABLE IF NOT EXISTS dispatch_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_id UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL DEFAULT 1,
    search_radius_meters INTEGER NOT NULL DEFAULT 2000,
    candidate_count INTEGER NOT NULL DEFAULT 0,
    candidates_snapshot JSONB DEFAULT '[]'::jsonb,
    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMPTZ,
    result VARCHAR(50),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- 5. Indexes for fast lookup and dispatch SLA polling
CREATE INDEX IF NOT EXISTS idx_deliveries_order_id ON deliveries(order_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status, created_at);
CREATE INDEX IF NOT EXISTS idx_deliveries_assigned_rider ON deliveries(assigned_rider_id, status);
CREATE INDEX IF NOT EXISTS idx_deliveries_branch ON deliveries(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_deliveries_dispatch_schedule ON deliveries(status, dispatch_not_before);
CREATE INDEX IF NOT EXISTS idx_deliveries_attention ON deliveries(dispatch_attention_required) WHERE dispatch_attention_required = TRUE;

CREATE INDEX IF NOT EXISTS idx_delivery_offers_delivery ON delivery_offers(delivery_id, status);
CREATE INDEX IF NOT EXISTS idx_delivery_offers_rider ON delivery_offers(rider_id, status);
CREATE INDEX IF NOT EXISTS idx_delivery_offers_expiry ON delivery_offers(expires_at, status);

CREATE INDEX IF NOT EXISTS idx_delivery_timeline_delivery ON delivery_timeline(delivery_id, created_at);
CREATE INDEX IF NOT EXISTS idx_dispatch_attempts_delivery ON dispatch_attempts(delivery_id, started_at);

-- 6. Concurrency Protection & Strict Business Invariants
-- Unique Partial Index: At most ONE active delivery assignment per rider
CREATE UNIQUE INDEX IF NOT EXISTS uq_one_active_delivery_per_rider 
ON deliveries(assigned_rider_id) 
WHERE status IN ('ASSIGNED', 'ARRIVED_PICKUP', 'PICKED_UP', 'EN_ROUTE', 'ARRIVED_DROPOFF');

-- Unique Partial Index: At most ONE pending offer per delivery
CREATE UNIQUE INDEX IF NOT EXISTS uq_one_active_offer_per_delivery 
ON delivery_offers(delivery_id) 
WHERE status = 'OFFERED';
