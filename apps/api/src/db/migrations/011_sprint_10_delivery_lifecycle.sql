-- ============================================================================
-- Migration 011: Sprint 10 - Delivery Lifecycle, Rider Navigation, Pickup, 
-- En Route, Customer Live Tracking, Proof of Delivery & Operational Interventions
-- ============================================================================

-- 1. Extend deliveries table with in-flight lifecycle timestamps, OTPs, and failure details
ALTER TABLE deliveries
    ADD COLUMN IF NOT EXISTS arrived_pickup_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS en_route_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS arrived_dropoff_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS pickup_verification_code VARCHAR(20),
    ADD COLUMN IF NOT EXISTS delivery_otp VARCHAR(10),
    ADD COLUMN IF NOT EXISTS delivery_otp_attempts INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS delivery_otp_locked BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS failure_reason VARCHAR(100),
    ADD COLUMN IF NOT EXISTS failure_note TEXT,
    ADD COLUMN IF NOT EXISTS stuck_flag VARCHAR(50),
    ADD COLUMN IF NOT EXISTS stuck_detected_at TIMESTAMPTZ;

-- 2. Create delivery_proofs table
CREATE TABLE IF NOT EXISTS delivery_proofs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_id UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- 'OTP', 'PHOTO', 'SIGNATURE', 'CONTACTLESS_CONFIRMATION'
    proof_value VARCHAR(255),
    storage_url VARCHAR(500),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_by_rider_id UUID REFERENCES rider_profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Create delivery_incidents table for failed deliveries, stuck delivery investigations & ops alerts
CREATE TABLE IF NOT EXISTS delivery_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_id UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    rider_id UUID REFERENCES rider_profiles(id),
    reason_code VARCHAR(100) NOT NULL,
    note TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'OPEN', -- 'OPEN', 'INVESTIGATING', 'RESOLVED', 'DISMISSED'
    reported_by_type VARCHAR(50) NOT NULL, -- 'RIDER', 'CUSTOMER', 'MERCHANT', 'SYSTEM', 'ADMIN'
    reported_by_id UUID,
    resolved_by_id UUID,
    resolution_action VARCHAR(100),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Indexes for fast operational lookup and audit reporting
CREATE INDEX IF NOT EXISTS idx_deliveries_arrived_pickup ON deliveries(arrived_pickup_at);
CREATE INDEX IF NOT EXISTS idx_deliveries_en_route ON deliveries(en_route_at);
CREATE INDEX IF NOT EXISTS idx_deliveries_arrived_dropoff ON deliveries(arrived_dropoff_at);
CREATE INDEX IF NOT EXISTS idx_deliveries_failed ON deliveries(failed_at) WHERE status = 'FAILED';
CREATE INDEX IF NOT EXISTS idx_deliveries_stuck ON deliveries(stuck_flag) WHERE stuck_flag IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_delivery_proofs_delivery ON delivery_proofs(delivery_id, created_at);
CREATE INDEX IF NOT EXISTS idx_delivery_incidents_delivery ON delivery_incidents(delivery_id, status);
CREATE INDEX IF NOT EXISTS idx_delivery_incidents_order ON delivery_incidents(order_id);
CREATE INDEX IF NOT EXISTS idx_delivery_incidents_status ON delivery_incidents(status, created_at);
