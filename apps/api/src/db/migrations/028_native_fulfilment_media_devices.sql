-- Phase 2: native fulfilment device registration and private media evidence
CREATE TABLE IF NOT EXISTS device_registrations (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_type VARCHAR(30) NOT NULL CHECK (recipient_type IN ('CUSTOMER','MERCHANT','RIDER','ADMIN')),
  platform VARCHAR(20) NOT NULL CHECK (platform IN ('ANDROID','IOS','WEB')),
  push_token TEXT NOT NULL UNIQUE,
  device_id VARCHAR(160),
  app_version VARCHAR(80),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_device_registrations_user_active
  ON device_registrations(user_id, active);

CREATE TABLE IF NOT EXISTS media_objects (
  id UUID PRIMARY KEY,
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  purpose VARCHAR(50) NOT NULL,
  reference_type VARCHAR(50),
  reference_id UUID,
  bucket VARCHAR(255) NOT NULL,
  object_key VARCHAR(1024) NOT NULL UNIQUE,
  content_type VARCHAR(120) NOT NULL,
  byte_size BIGINT,
  status VARCHAR(30) NOT NULL DEFAULT 'REQUESTED'
    CHECK (status IN ('REQUESTED','UPLOADED','VERIFIED','REJECTED')),
  provider_etag VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_media_objects_owner
  ON media_objects(owner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_objects_reference
  ON media_objects(reference_type, reference_id);

ALTER TABLE delivery_proofs
  ADD COLUMN IF NOT EXISTS media_object_id UUID REFERENCES media_objects(id) ON DELETE RESTRICT;
