-- =========================================================
-- DEETOO SPRINT 1 MIGRATION: 002_postgis_zones.sql
-- Enables PostGIS extension and sets up GIST spatial indices
-- =========================================================

-- Enable PostGIS if available on server
CREATE EXTENSION IF NOT EXISTS postgis;

-- Alter merchant_branches and addresses to add geometry columns if postgis is enabled
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
        -- Add geography columns if not present
        BEGIN
            ALTER TABLE merchant_branches ADD COLUMN IF NOT EXISTS location geography(Point, 4326);
            ALTER TABLE addresses ADD COLUMN IF NOT EXISTS location geography(Point, 4326);
            ALTER TABLE service_zones ADD COLUMN IF NOT EXISTS boundary geography(MultiPolygon, 4326);
            ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS dropoff_location geography(Point, 4326);
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;

        -- Create spatial GIST indexes
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_branch_location_gist ON merchant_branches USING GIST (location)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_addresses_location_gist ON addresses USING GIST (location)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_zone_boundary_gist ON service_zones USING GIST (boundary)';
    END IF;
END $$;
