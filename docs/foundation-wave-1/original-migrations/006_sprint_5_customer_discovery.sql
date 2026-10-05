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

-- 7. Seed Initial Platform Restaurant Categories
INSERT INTO restaurant_categories (id, name, slug, icon, description, image_url, sort_order, is_active)
VALUES
    ('44444444-4444-4444-4444-444444444401', 'Burgers', 'burgers', 'Burger', 'Gourmet smash burgers, beef & chicken patties', 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400', 1, true),
    ('44444444-4444-4444-4444-444444444402', 'Pizza', 'pizza', 'Pizza', 'Authentic wood-fired and pan pizzas', 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400', 2, true),
    ('44444444-4444-4444-4444-444444444403', 'Chicken', 'chicken', 'Drumstick', 'Crispy fried chicken, wings & tenders', 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=400', 3, true),
    ('44444444-4444-4444-4444-444444444404', 'African', 'african', 'Utensils', 'Authentic local cuisine, pilau, nyama choma & stews', 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400', 4, true),
    ('44444444-4444-4444-4444-444444444405', 'Healthy & Bowls', 'healthy', 'Salad', 'Fresh salads, grain bowls and wholesome plates', 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400', 5, true),
    ('44444444-4444-4444-4444-444444444406', 'Fast Food', 'fast-food', 'Flame', 'Quick bites, fries, hot dogs & loaded snacks', 'https://images.unsplash.com/photo-1551782450-a2132b4ba21d?w=400', 6, true),
    ('44444444-4444-4444-4444-444444444407', 'Desserts & Bakery', 'desserts', 'Cake', 'Cakes, pastries, ice cream & sweet treats', 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=400', 7, true),
    ('44444444-4444-4444-4444-444444444408', 'Asian & Noodles', 'asian', 'Soup', 'Noodles, stir-fries, ramen and Asian delicacies', 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=400', 8, true),
    ('44444444-4444-4444-4444-444444444409', 'Drinks & Shakes', 'drinks', 'Coffee', 'Handcrafted milkshakes, smoothies, coffee & juices', 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=400', 9, true)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    slug = EXCLUDED.slug,
    icon = EXCLUDED.icon,
    description = EXCLUDED.description,
    image_url = EXCLUDED.image_url,
    sort_order = EXCLUDED.sort_order;

-- 8. Seed Demo Assignments
INSERT INTO restaurant_category_assignments (category_id, branch_id, merchant_id)
VALUES
    ('44444444-4444-4444-4444-444444444401', 'branch_westlands_01', 'merchant_burger_01'),
    ('44444444-4444-4444-4444-444444444406', 'branch_westlands_01', 'merchant_burger_01'),
    ('44444444-4444-4444-4444-444444444409', 'branch_westlands_01', 'merchant_burger_01'),
    ('44444444-4444-4444-4444-444444444401', 'branch_kilimani_02', 'merchant_burger_01'),
    ('44444444-4444-4444-4444-444444444406', 'branch_kilimani_02', 'merchant_burger_01')
ON CONFLICT (category_id, branch_id) DO NOTHING;
