-- ============================================================================
-- Migration 006: Sprint 5 - Customer Profiles, Addresses, Discovery & PostGIS
-- Implements customer profile enhancements, address geography, restaurant categories,
-- category assignments, and customer discovery indexing.
-- ============================================================================

-- 1. Extend customer_profiles table with structured fields
ALTER TABLE customer_profiles
    ADD COLUMN IF NOT EXISTS first_name VARCHAR(100),
    ADD COLUMN IF NOT EXISTS last_name VARCHAR(100),
    ADD COLUMN IF NOT EXISTS phone VARCHAR(30),
    ADD COLUMN IF NOT EXISTS email VARCHAR(255),
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 2. Extend addresses table with Sprint 5 structured address columns
ALTER TABLE addresses
    ADD COLUMN IF NOT EXISTS address_line1 VARCHAR(255),
    ADD COLUMN IF NOT EXISTS address_line2 VARCHAR(255),
    ADD COLUMN IF NOT EXISTS landmark VARCHAR(255),
    ADD COLUMN IF NOT EXISTS city VARCHAR(100) NOT NULL DEFAULT 'Nairobi',
    ADD COLUMN IF NOT EXISTS region VARCHAR(100) NOT NULL DEFAULT 'Nairobi County',
    ADD COLUMN IF NOT EXISTS country_code CHAR(2) NOT NULL DEFAULT 'KE',
    ADD COLUMN IF NOT EXISTS postal_code VARCHAR(30),
    ADD COLUMN IF NOT EXISTS delivery_instructions TEXT,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Ensure geography point is present
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'addresses' AND column_name = 'location'
    ) THEN
        ALTER TABLE addresses ADD COLUMN location geography(Point, 4326);
    END IF;
END $$;

-- Populate location from latitude and longitude if null
UPDATE addresses
SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
WHERE location IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL;

-- 3. Address Indexes for performance and isolation
CREATE INDEX IF NOT EXISTS idx_addresses_customer_id ON addresses(customer_id);
CREATE INDEX IF NOT EXISTS idx_addresses_customer_default ON addresses(customer_id, is_default) WHERE is_default = true;
CREATE INDEX IF NOT EXISTS idx_addresses_active ON addresses(customer_id, is_active) WHERE is_active = true;

-- Spatial GIST index on customer addresses
CREATE INDEX IF NOT EXISTS idx_addresses_location_gist ON addresses USING GIST (location);

-- Convenience View for Customer Addresses
CREATE OR REPLACE VIEW customer_addresses AS
SELECT
    id,
    customer_id,
    label,
    recipient_name,
    phone_e164,
    COALESCE(address_line1, address_text) AS address_line1,
    address_line2,
    landmark,
    city,
    region,
    country_code,
    postal_code,
    address_text,
    latitude,
    longitude,
    location,
    COALESCE(delivery_instructions, instructions) AS delivery_instructions,
    is_default,
    is_active,
    deleted_at,
    created_at,
    updated_at
FROM addresses;

-- 4. Restaurant Categories Table
CREATE TABLE IF NOT EXISTS restaurant_categories (
    id UUID PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    icon VARCHAR(50),
    description TEXT,
    image_url TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_restaurant_categories_slug ON restaurant_categories(slug);
CREATE INDEX IF NOT EXISTS idx_restaurant_categories_sort ON restaurant_categories(sort_order);

-- 5. Restaurant Category Assignments (Branch-Level Cuisines / Categories)
CREATE TABLE IF NOT EXISTS restaurant_category_assignments (
    category_id UUID NOT NULL REFERENCES restaurant_categories(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES merchant_branches(id) ON DELETE CASCADE,
    merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (category_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_cat_assign_cat ON restaurant_category_assignments(category_id);
CREATE INDEX IF NOT EXISTS idx_cat_assign_branch ON restaurant_category_assignments(branch_id);
CREATE INDEX IF NOT EXISTS idx_cat_assign_merchant ON restaurant_category_assignments(merchant_id);

-- 6. Discovery Search Performance Indexes
CREATE INDEX IF NOT EXISTS idx_branches_operational_status ON merchant_branches(status, operational_status);
CREATE INDEX IF NOT EXISTS idx_branches_merchant_id ON merchant_branches(merchant_id);

-- Fixture categories/assignments are deliberately excluded from schema migrations.
-- The original mixed schema/fixture file is archived under docs/foundation-wave-1/original-migrations.
