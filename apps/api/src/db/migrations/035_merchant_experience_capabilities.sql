-- Merchant experience Phase 2: additive read models and domain metadata.
-- Depends on 001..034; do not modify historic migrations.
CREATE TABLE IF NOT EXISTS merchant_item_inventory (
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES merchant_branches(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity >= 0),
  low_stock_threshold INTEGER NOT NULL DEFAULT 3 CHECK (low_stock_threshold >= 0),
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (branch_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_merchant_stock_low ON merchant_item_inventory(branch_id, quantity, low_stock_threshold);
CREATE TABLE IF NOT EXISTS merchant_inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES merchant_branches(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL CHECK (delta <> 0),
  quantity_after INTEGER NOT NULL CHECK (quantity_after >= 0),
  reason VARCHAR(60) NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  actor_user_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (branch_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS merchant_branch_policies (
  branch_id UUID PRIMARY KEY REFERENCES merchant_branches(id) ON DELETE CASCADE,
  delivery_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  pickup_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  dine_in_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  table_qr_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  max_concurrent_orders INTEGER NOT NULL DEFAULT 30 CHECK (max_concurrent_orders BETWEEN 1 AND 500),
  cover_media_id UUID REFERENCES media_objects(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (NOT table_qr_enabled OR dine_in_enabled)
);

CREATE TABLE IF NOT EXISTS merchant_document_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  media_id UUID NOT NULL UNIQUE REFERENCES media_objects(id) ON DELETE RESTRICT,
  document_type VARCHAR(40) NOT NULL CHECK (document_type IN ('BUSINESS_REGISTRATION','KRA_PIN','FOOD_HANDLING','OTHER')),
  review_status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (review_status IN ('PENDING','VERIFIED','REJECTED','EXPIRED')),
  expires_at DATE,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_merchant_docs_merchant ON merchant_document_records(merchant_id, created_at DESC);

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_notifications_merchant_inbox ON notifications(recipient_type, recipient_id, created_at DESC) WHERE channel = 'IN_APP';
CREATE TABLE IF NOT EXISTS merchant_notification_preferences (
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  push_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sound_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (merchant_id, user_id)
);

CREATE TABLE IF NOT EXISTS merchant_help_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(120) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'GENERAL',
  body TEXT NOT NULL,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_merchant_help_published ON merchant_help_articles(published, category);
CREATE TABLE IF NOT EXISTS merchant_support_contacts (
  code VARCHAR(40) PRIMARY KEY,
  label VARCHAR(120) NOT NULL,
  phone_e164 VARCHAR(20),
  email VARCHAR(255),
  hours_text VARCHAR(180),
  verified_by UUID NOT NULL REFERENCES users(id),
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  CHECK (phone_e164 IS NOT NULL OR email IS NOT NULL)
);

-- Trust is granted only to an authenticated session verified via step-up; push tokens are unrelated.
CREATE TABLE IF NOT EXISTS user_trusted_auth_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_fingerprint_hash VARCHAR(64) NOT NULL,
  display_name VARCHAR(120) NOT NULL,
  created_by_session UUID REFERENCES sessions(id) ON DELETE SET NULL,
  trusted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  UNIQUE(user_id, device_fingerprint_hash)
);
CREATE INDEX IF NOT EXISTS idx_trusted_auth_devices_user ON user_trusted_auth_devices(user_id, revoked_at);
CREATE TABLE IF NOT EXISTS user_security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  session_id UUID,
  device_info VARCHAR(255),
  ip_address VARCHAR(45),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_security_events_user ON user_security_events(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS merchant_deactivation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'REQUESTED' CHECK(status IN('REQUESTED','APPROVED','REJECTED','CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_merchant_deactivate ON merchant_deactivation_requests(user_id, merchant_id) WHERE status='REQUESTED';
