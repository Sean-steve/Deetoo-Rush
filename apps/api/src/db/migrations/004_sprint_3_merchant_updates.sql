-- =========================================================
-- DEETOO SPRINT 3 MIGRATION: 004_sprint_3_merchant_updates.sql
-- Merchant, Branch, Opening Hours, Service Zones, Memberships & Invitations
-- =========================================================

-- 1. Extend Merchants Table
ALTER TABLE merchants 
    ADD COLUMN IF NOT EXISTS approval_status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    ADD COLUMN IF NOT EXISTS slug VARCHAR(255),
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS phone VARCHAR(50),
    ADD COLUMN IF NOT EXISTS email VARCHAR(255),
    ADD COLUMN IF NOT EXISTS logo_url TEXT,
    ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_merchants_approval_status ON merchants(approval_status);
CREATE INDEX IF NOT EXISTS idx_merchants_status ON merchants(status);
CREATE INDEX IF NOT EXISTS idx_merchants_slug ON merchants(slug);

-- 2. Extend Merchant Branches Table
ALTER TABLE merchant_branches 
    ADD COLUMN IF NOT EXISTS operational_status VARCHAR(30) NOT NULL DEFAULT 'CLOSED',
    ADD COLUMN IF NOT EXISTS slug VARCHAR(255),
    ADD COLUMN IF NOT EXISTS email VARCHAR(255),
    ADD COLUMN IF NOT EXISTS address_line1 VARCHAR(255),
    ADD COLUMN IF NOT EXISTS address_line2 VARCHAR(255),
    ADD COLUMN IF NOT EXISTS landmark VARCHAR(255),
    ADD COLUMN IF NOT EXISTS city VARCHAR(100) DEFAULT 'Nairobi',
    ADD COLUMN IF NOT EXISTS region VARCHAR(100) DEFAULT 'Nairobi',
    ADD COLUMN IF NOT EXISTS country_code CHAR(2) DEFAULT 'KE',
    ADD COLUMN IF NOT EXISTS postal_code VARCHAR(30);

CREATE INDEX IF NOT EXISTS idx_branches_merchant ON merchant_branches(merchant_id);
CREATE INDEX IF NOT EXISTS idx_branches_status ON merchant_branches(status);
CREATE INDEX IF NOT EXISTS idx_branches_op_status ON merchant_branches(operational_status);

-- 3. Branch Opening Hours (Supports multiple intervals per day)
CREATE TABLE IF NOT EXISTS branch_opening_hours (
    id UUID PRIMARY KEY,
    branch_id UUID NOT NULL REFERENCES merchant_branches(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
    open_time VARCHAR(5) NOT NULL, -- HH:mm 24-hr format
    close_time VARCHAR(5) NOT NULL, -- HH:mm 24-hr format
    is_closed BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_opening_hours_branch ON branch_opening_hours(branch_id);
CREATE INDEX IF NOT EXISTS idx_opening_hours_branch_day ON branch_opening_hours(branch_id, day_of_week);

-- 4. Branch Service Zone Association
CREATE TABLE IF NOT EXISTS branch_service_zones (
    branch_id UUID NOT NULL REFERENCES merchant_branches(id) ON DELETE CASCADE,
    service_zone_id UUID NOT NULL REFERENCES service_zones(id) ON DELETE CASCADE,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (branch_id, service_zone_id)
);

CREATE INDEX IF NOT EXISTS idx_branch_service_zones_branch ON branch_service_zones(branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_service_zones_zone ON branch_service_zones(service_zone_id);

-- 5. Branch-Scoped Access for Merchant Memberships
CREATE TABLE IF NOT EXISTS merchant_membership_branches (
    membership_id UUID NOT NULL REFERENCES merchant_memberships(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES merchant_branches(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (membership_id, branch_id)
);

-- 6. Merchant Staff Invitations
CREATE TABLE IF NOT EXISTS merchant_invitations (
    id UUID PRIMARY KEY,
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    phone_e164 VARCHAR(30),
    role_code VARCHAR(50) NOT NULL, -- 'MERCHANT_OWNER', 'MERCHANT_MANAGER', 'MERCHANT_STAFF'
    branch_ids JSONB DEFAULT '[]'::jsonb,
    invitation_token VARCHAR(255) NOT NULL UNIQUE,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED'
    expires_at TIMESTAMPTZ NOT NULL,
    invited_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_invitations_token ON merchant_invitations(invitation_token);
CREATE INDEX IF NOT EXISTS idx_invitations_merchant ON merchant_invitations(merchant_id);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON merchant_invitations(email);
