-- =========================================================
-- DEETOO SPRINT 4 MIGRATION: 005_sprint_4_catalogue.sql
-- Merchant Catalogue, Modifiers, Options & Branch Availability
-- =========================================================

-- 1. Extend and Align Menus Table (Catalogue belongs to Merchant)
ALTER TABLE menus
    ADD COLUMN IF NOT EXISTS merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE menus ALTER COLUMN branch_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_menus_merchant ON menus(merchant_id);
CREATE INDEX IF NOT EXISTS idx_menus_active ON menus(is_active);

-- 2. Menu Branch Assignments
CREATE TABLE IF NOT EXISTS menu_branch_assignments (
    menu_id UUID NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES merchant_branches(id) ON DELETE CASCADE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (menu_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_menu_branch_menu ON menu_branch_assignments(menu_id);
CREATE INDEX IF NOT EXISTS idx_menu_branch_branch ON menu_branch_assignments(branch_id);

-- 3. Extend Menu Categories Table
ALTER TABLE menu_categories
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_menu_categories_menu ON menu_categories(menu_id);
CREATE INDEX IF NOT EXISTS idx_menu_categories_order ON menu_categories(menu_id, sort_order);

-- 4. Extend Menu Items Table
ALTER TABLE menu_items
    ADD COLUMN IF NOT EXISTS currency CHAR(3) NOT NULL DEFAULT 'KES',
    ADD COLUMN IF NOT EXISTS image_url TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_menu_items_menu ON menu_items(menu_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_available ON menu_items(is_available);

-- 5. Modifier Groups Table
CREATE TABLE IF NOT EXISTS modifier_groups (
    id UUID PRIMARY KEY,
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    min_selections INTEGER NOT NULL DEFAULT 0 CHECK (min_selections >= 0),
    max_selections INTEGER NOT NULL DEFAULT 1 CHECK (max_selections >= min_selections),
    is_required BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_modifier_groups_merchant ON modifier_groups(merchant_id);

-- 6. Modifier Options Table
CREATE TABLE IF NOT EXISTS modifier_options (
    id UUID PRIMARY KEY,
    modifier_group_id UUID NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    price_delta_minor BIGINT NOT NULL DEFAULT 0 CHECK (price_delta_minor >= 0),
    is_available BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_modifier_options_group ON modifier_options(modifier_group_id);
CREATE INDEX IF NOT EXISTS idx_modifier_options_sort ON modifier_options(modifier_group_id, sort_order);

-- 7. Item Modifier Groups Join Table
CREATE TABLE IF NOT EXISTS item_modifier_groups (
    item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    modifier_group_id UUID NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (item_id, modifier_group_id)
);

CREATE INDEX IF NOT EXISTS idx_item_modifier_item ON item_modifier_groups(item_id);
CREATE INDEX IF NOT EXISTS idx_item_modifier_group ON item_modifier_groups(modifier_group_id);

-- 8. Branch-Specific Item Availability & Price Overrides
CREATE TABLE IF NOT EXISTS menu_item_branch_overrides (
    branch_id UUID NOT NULL REFERENCES merchant_branches(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    is_available BOOLEAN NOT NULL DEFAULT true,
    price_override_minor BIGINT CHECK (price_override_minor IS NULL OR price_override_minor >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (branch_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_branch_item_override_branch ON menu_item_branch_overrides(branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_item_override_item ON menu_item_branch_overrides(item_id);

-- 9. Branch-Specific Modifier Option Availability & Price Overrides
CREATE TABLE IF NOT EXISTS modifier_option_branch_overrides (
    branch_id UUID NOT NULL REFERENCES merchant_branches(id) ON DELETE CASCADE,
    modifier_option_id UUID NOT NULL REFERENCES modifier_options(id) ON DELETE CASCADE,
    is_available BOOLEAN NOT NULL DEFAULT true,
    price_delta_override_minor BIGINT CHECK (price_delta_override_minor IS NULL OR price_delta_override_minor >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (branch_id, modifier_option_id)
);

CREATE INDEX IF NOT EXISTS idx_branch_option_override_branch ON modifier_option_branch_overrides(branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_option_override_option ON modifier_option_branch_overrides(modifier_option_id);
