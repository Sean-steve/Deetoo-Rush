-- ============================================================================
-- Migration 009: Sprint 8 - Rider Application Foundation, Profiles, Approval,
-- Availability & Location Infrastructure
-- Implements Rider profiles, onboarding status, operational status, work status,
-- vehicle management, service zone assignments, availability sessions, and indexes.
-- ============================================================================

-- 1. Upgrade or Create rider_profiles table
CREATE TABLE IF NOT EXISTS rider_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    first_name VARCHAR(100) NOT NULL DEFAULT '',
    last_name VARCHAR(100) NOT NULL DEFAULT '',
    phone VARCHAR(30) NOT NULL DEFAULT '',
    onboarding_status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    operational_status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    work_status VARCHAR(30) NOT NULL DEFAULT 'OFFLINE',
    vehicle_type VARCHAR(30) NOT NULL DEFAULT 'MOTORBIKE',
    vehicle_registration VARCHAR(50),
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES users(id),
    rejected_at TIMESTAMPTZ,
    rejection_reason TEXT,
    suspended_at TIMESTAMPTZ,
    suspension_reason TEXT,
    last_known_latitude DOUBLE PRECISION,
    last_known_longitude DOUBLE PRECISION,
    last_location_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- In case table already existed from 001, ensure all columns are present:
ALTER TABLE rider_profiles
    ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid(),
    ADD COLUMN IF NOT EXISTS first_name VARCHAR(100) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS last_name VARCHAR(100) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS phone VARCHAR(30) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS onboarding_status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    ADD COLUMN IF NOT EXISTS operational_status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    ADD COLUMN IF NOT EXISTS work_status VARCHAR(30) NOT NULL DEFAULT 'OFFLINE',
    ADD COLUMN IF NOT EXISTS vehicle_type VARCHAR(30) NOT NULL DEFAULT 'MOTORBIKE',
    ADD COLUMN IF NOT EXISTS vehicle_registration VARCHAR(50),
    ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
    ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS suspension_reason TEXT,
    ADD COLUMN IF NOT EXISTS last_known_latitude DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS last_known_longitude DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS last_location_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_rider_profiles_user_id ON rider_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_rider_profiles_onboarding ON rider_profiles(onboarding_status);
CREATE INDEX IF NOT EXISTS idx_rider_profiles_operational ON rider_profiles(operational_status);
CREATE INDEX IF NOT EXISTS idx_rider_profiles_work_status ON rider_profiles(work_status);
CREATE INDEX IF NOT EXISTS idx_rider_profiles_last_location ON rider_profiles(last_location_at);

-- 2. Rider Vehicles Table
CREATE TABLE IF NOT EXISTS rider_vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rider_id UUID NOT NULL REFERENCES rider_profiles(id) ON DELETE CASCADE,
    type VARCHAR(30) NOT NULL DEFAULT 'MOTORBIKE',
    registration_number VARCHAR(50),
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rider_vehicles_rider_id ON rider_vehicles(rider_id);
CREATE INDEX IF NOT EXISTS idx_rider_vehicles_status ON rider_vehicles(status);

-- 3. Rider Service Zones Mapping
CREATE TABLE IF NOT EXISTS rider_service_zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rider_id UUID NOT NULL REFERENCES rider_profiles(id) ON DELETE CASCADE,
    zone_id UUID NOT NULL REFERENCES service_zones(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_rider_zone UNIQUE (rider_id, zone_id)
);

CREATE INDEX IF NOT EXISTS idx_rider_service_zones_rider ON rider_service_zones(rider_id);
CREATE INDEX IF NOT EXISTS idx_rider_service_zones_zone ON rider_service_zones(zone_id);

-- 4. Rider Availability Sessions
CREATE TABLE IF NOT EXISTS rider_availability_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rider_id UUID NOT NULL REFERENCES rider_profiles(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMPTZ,
    start_zone_id UUID REFERENCES service_zones(id),
    end_reason VARCHAR(50)
);

CREATE INDEX IF NOT EXISTS idx_rider_sessions_rider ON rider_availability_sessions(rider_id);
CREATE INDEX IF NOT EXISTS idx_rider_sessions_active ON rider_availability_sessions(rider_id, ended_at);
