-- ============================================================================
-- Migration 032: Phase 2 - Finance, Geography, Notifications & Commercial Controls
-- Keeps serviceability polygon-authoritative while adding selectable county scope
-- and effective-dated commercial configuration.
-- ============================================================================

CREATE TABLE IF NOT EXISTS operating_counties (
  code CHAR(3) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  country_code CHAR(2) NOT NULL DEFAULT 'KE',
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  enabled_at TIMESTAMPTZ,
  enabled_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT operating_counties_kenya_only CHECK (country_code = 'KE')
);

INSERT INTO operating_counties(code,name,country_code,enabled) VALUES
('001','Mombasa','KE',FALSE),('002','Kwale','KE',FALSE),('003','Kilifi','KE',FALSE),
('004','Tana River','KE',FALSE),('005','Lamu','KE',FALSE),('006','Taita-Taveta','KE',FALSE),
('007','Garissa','KE',FALSE),('008','Wajir','KE',FALSE),('009','Mandera','KE',FALSE),
('010','Marsabit','KE',FALSE),('011','Isiolo','KE',FALSE),('012','Meru','KE',FALSE),
('013','Tharaka-Nithi','KE',FALSE),('014','Embu','KE',FALSE),('015','Kitui','KE',FALSE),
('016','Machakos','KE',FALSE),('017','Makueni','KE',FALSE),('018','Nyandarua','KE',FALSE),
('019','Nyeri','KE',FALSE),('020','Kirinyaga','KE',FALSE),('021','Murang''a','KE',FALSE),
('022','Kiambu','KE',FALSE),('023','Turkana','KE',FALSE),('024','West Pokot','KE',FALSE),
('025','Samburu','KE',FALSE),('026','Trans Nzoia','KE',FALSE),('027','Uasin Gishu','KE',FALSE),
('028','Elgeyo-Marakwet','KE',FALSE),('029','Nandi','KE',FALSE),('030','Baringo','KE',FALSE),
('031','Laikipia','KE',FALSE),('032','Nakuru','KE',FALSE),('033','Narok','KE',FALSE),
('034','Kajiado','KE',FALSE),('035','Kericho','KE',FALSE),('036','Bomet','KE',FALSE),
('037','Kakamega','KE',FALSE),('038','Vihiga','KE',FALSE),('039','Bungoma','KE',FALSE),
('040','Busia','KE',FALSE),('041','Siaya','KE',FALSE),('042','Kisumu','KE',FALSE),
('043','Homa Bay','KE',FALSE),('044','Migori','KE',FALSE),('045','Kisii','KE',FALSE),
('046','Nyamira','KE',FALSE),('047','Nairobi','KE',TRUE)
ON CONFLICT(code) DO UPDATE SET
  name=EXCLUDED.name,
  country_code=EXCLUDED.country_code;

CREATE TABLE IF NOT EXISTS service_markets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  county_code CHAR(3) NOT NULL REFERENCES operating_counties(code) ON DELETE RESTRICT,
  name VARCHAR(120) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_service_market_county_name UNIQUE(county_code,name)
);

ALTER TABLE service_zones
  ADD COLUMN IF NOT EXISTS county_code CHAR(3) REFERENCES operating_counties(code) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS market_id UUID REFERENCES service_markets(id) ON DELETE SET NULL;

UPDATE service_zones
SET county_code='047'
WHERE county_code IS NULL AND UPPER(COALESCE(city_id,''))='NAIROBI';

CREATE INDEX IF NOT EXISTS idx_service_zones_county ON service_zones(county_code,status);
CREATE INDEX IF NOT EXISTS idx_service_zones_market ON service_zones(market_id,status);
CREATE INDEX IF NOT EXISTS idx_service_markets_county ON service_markets(county_code,enabled);

ALTER TABLE merchant_commission_rules
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rule_source VARCHAR(30) NOT NULL DEFAULT 'PLATFORM';

CREATE INDEX IF NOT EXISTS idx_commission_effective_window
  ON merchant_commission_rules(merchant_id,status,effective_from,effective_until);

CREATE TABLE IF NOT EXISTS merchant_commission_review_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE RESTRICT,
  requested_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  current_rule_id UUID REFERENCES merchant_commission_rules(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  review_note TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_commission_review_queue
  ON merchant_commission_review_requests(status,created_at);

CREATE TABLE IF NOT EXISTS rider_earning_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_amount_minor BIGINT NOT NULL CHECK(base_amount_minor >= 0),
  per_kilometre_amount_minor BIGINT NOT NULL CHECK(per_kilometre_amount_minor >= 0),
  included_distance_meters INTEGER NOT NULL DEFAULT 0 CHECK(included_distance_meters >= 0),
  waiting_amount_minor_per_minute BIGINT NOT NULL DEFAULT 0 CHECK(waiting_amount_minor_per_minute >= 0),
  included_waiting_minutes INTEGER NOT NULL DEFAULT 0 CHECK(included_waiting_minutes >= 0),
  zone_peak_bonus_minor BIGINT NOT NULL DEFAULT 0 CHECK(zone_peak_bonus_minor >= 0),
  stacked_order_component_minor BIGINT NOT NULL DEFAULT 0 CHECK(stacked_order_component_minor >= 0),
  effective_from TIMESTAMPTZ NOT NULL,
  effective_until TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT rider_earning_rule_window CHECK(effective_until IS NULL OR effective_until > effective_from)
);

CREATE INDEX IF NOT EXISTS idx_rider_earning_rules_effective
  ON rider_earning_rules(status,effective_from,effective_until);

INSERT INTO rider_earning_rules(
  base_amount_minor,per_kilometre_amount_minor,included_distance_meters,
  waiting_amount_minor_per_minute,included_waiting_minutes,
  zone_peak_bonus_minor,stacked_order_component_minor,effective_from,status
)
SELECT 15000,3000,2000,500,10,0,0,'2020-01-01T00:00:00Z','ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM rider_earning_rules);

CREATE TABLE IF NOT EXISTS finance_automation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type VARCHAR(40) NOT NULL,
  status VARCHAR(20) NOT NULL,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_finance_automation_runs_type_time
  ON finance_automation_runs(run_type,finished_at DESC);
