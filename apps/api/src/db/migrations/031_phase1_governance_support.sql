-- Phase 1 governance, support conversation and privileged account controls

-- 1. Super Admin role. Existing admins remain admins; elevation is explicit.
INSERT INTO roles (id, code, name)
SELECT gen_random_uuid(), 'super_admin', 'Super Admin'
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE code='super_admin');

-- 2. Support becomes a conversation with proposed resolution + party confirmation.
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

ALTER TABLE support_cases
  ADD COLUMN IF NOT EXISTS resolution_proposed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS disputed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

ALTER TABLE support_case_notes
  DROP CONSTRAINT IF EXISTS support_case_notes_visibility_check;

ALTER TABLE support_case_notes
  ADD CONSTRAINT support_case_notes_visibility_check CHECK (
    visibility IN (
      'INTERNAL','CUSTOMER_VISIBLE','ALL_PARTICIPANTS',
      'CUSTOMER_ONLY','MERCHANT_ONLY','RIDER_ONLY'
    )
  );

ALTER TABLE support_case_notes
  ADD COLUMN IF NOT EXISTS message_type VARCHAR(30) NOT NULL DEFAULT 'MESSAGE'
    CHECK (message_type IN ('MESSAGE','SYSTEM','RESOLUTION')),
  ADD COLUMN IF NOT EXISTS target_party VARCHAR(20)
    CHECK (target_party IS NULL OR target_party IN ('CUSTOMER','MERCHANT','RIDER'));

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

-- 3. Governance lifecycle metadata: no destructive deletion of financial history.
CREATE TABLE IF NOT EXISTS account_governance_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  subject_type VARCHAR(20) NOT NULL CHECK (subject_type IN ('CUSTOMER','MERCHANT','RIDER','STAFF')),
  action VARCHAR(30) NOT NULL CHECK (
    action IN ('PROVISIONED','PROFILE_EDITED','SUSPENDED','REACTIVATED','DEACTIVATED','ANONYMIZED','ROLE_CHANGED')
  ),
  reason TEXT NOT NULL,
  before_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  after_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_role VARCHAR(50),
  request_id VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_account_governance_subject
  ON account_governance_events(subject_user_id, created_at DESC);
