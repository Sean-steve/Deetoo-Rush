-- Hotfix: repair durable support conversation and merchant onboarding schema.
-- This migration is intentionally idempotent so existing databases that predate
-- Phase 1/Phase 3 can be brought forward safely.

CREATE TABLE IF NOT EXISTS support_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number VARCHAR(50) NOT NULL UNIQUE,
  customer_id UUID REFERENCES users(id) ON DELETE SET NULL,
  merchant_id UUID REFERENCES merchants(id) ON DELETE SET NULL,
  rider_id UUID REFERENCES rider_profiles(id) ON DELETE SET NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  delivery_id UUID REFERENCES deliveries(id) ON DELETE SET NULL,
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  category VARCHAR(50) NOT NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
  status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
  subject VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  resolution_code VARCHAR(50),
  resolution_notes TEXT,
  assigned_agent_id UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_agent_name VARCHAR(255),
  refund_id UUID REFERENCES refunds(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

ALTER TABLE support_cases
  ADD COLUMN IF NOT EXISTS resolution_proposed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS disputed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

ALTER TABLE support_cases
  DROP CONSTRAINT IF EXISTS support_cases_status_check;

ALTER TABLE support_cases
  ADD CONSTRAINT support_cases_status_check CHECK (
    status IN (
      'OPEN','ASSIGNED','IN_PROGRESS','IN_CONVERSATION',
      'WAITING_CUSTOMER','WAITING_MERCHANT','WAITING_RIDER','WAITING_INTERNAL',
      'RESOLUTION_PROPOSED','PARTY_CONFIRMATION','DISPUTED',
      'RESOLVED','CLOSED'
    )
  );

CREATE TABLE IF NOT EXISTS support_case_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES support_cases(id) ON DELETE CASCADE,
  author_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_role VARCHAR(50),
  author_name VARCHAR(255),
  visibility VARCHAR(20) NOT NULL DEFAULT 'INTERNAL',
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE support_case_notes
  ADD COLUMN IF NOT EXISTS message_type VARCHAR(30) NOT NULL DEFAULT 'MESSAGE',
  ADD COLUMN IF NOT EXISTS target_party VARCHAR(20);

ALTER TABLE support_case_notes
  DROP CONSTRAINT IF EXISTS support_case_notes_visibility_check,
  DROP CONSTRAINT IF EXISTS support_case_notes_message_type_check,
  DROP CONSTRAINT IF EXISTS support_case_notes_target_party_check;

ALTER TABLE support_case_notes
  ADD CONSTRAINT support_case_notes_visibility_check CHECK (
    visibility IN (
      'INTERNAL','CUSTOMER_VISIBLE','ALL_PARTICIPANTS',
      'CUSTOMER_ONLY','MERCHANT_ONLY','RIDER_ONLY'
    )
  ),
  ADD CONSTRAINT support_case_notes_message_type_check CHECK (
    message_type IN ('MESSAGE','SYSTEM','RESOLUTION')
  ),
  ADD CONSTRAINT support_case_notes_target_party_check CHECK (
    target_party IS NULL OR target_party IN ('CUSTOMER','MERCHANT','RIDER')
  );

CREATE INDEX IF NOT EXISTS idx_support_case_notes_case
  ON support_case_notes(case_id, visibility, created_at ASC);

CREATE TABLE IF NOT EXISTS support_case_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES support_cases(id) ON DELETE CASCADE,
  note_id UUID REFERENCES support_case_notes(id) ON DELETE CASCADE,
  media_object_id UUID NOT NULL REFERENCES media_objects(id) ON DELETE RESTRICT,
  uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(case_id, media_object_id)
);

CREATE INDEX IF NOT EXISTS idx_support_case_attachments_case
  ON support_case_attachments(case_id, created_at);

CREATE TABLE IF NOT EXISTS support_case_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES support_cases(id) ON DELETE CASCADE,
  party_type VARCHAR(20) NOT NULL CHECK (party_type IN ('CUSTOMER','MERCHANT','RIDER')),
  party_id UUID NOT NULL,
  decision VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (decision IN ('PENDING','ACCEPTED','DISPUTED')),
  comment TEXT,
  decided_by UUID REFERENCES users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(case_id, party_type, party_id)
);

CREATE INDEX IF NOT EXISTS idx_support_case_confirmations_case
  ON support_case_confirmations(case_id, party_type);

CREATE TABLE IF NOT EXISTS merchant_onboarding_state (
  merchant_id UUID PRIMARY KEY REFERENCES merchants(id) ON DELETE CASCADE,
  stage VARCHAR(40) NOT NULL DEFAULT 'APPLICATION' CHECK (
    stage IN (
      'APPLICATION','DOCUMENTS_PENDING','COMMERCIAL_TERMS',
      'CONTENT_SETUP','MENU_QA','STAFF_TRAINING',
      'READY_FOR_REVIEW','APPROVED','LIVE','BLOCKED'
    )
  ),
  readiness JSONB NOT NULL DEFAULT '{}'::jsonb,
  assigned_to UUID REFERENCES users(id),
  note TEXT,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchant_onboarding_stage
  ON merchant_onboarding_state(stage, updated_at DESC);
