-- Phase 1: governance, support conversations and privileged lifecycle controls

-- 1) Elevated platform authority. Existing ADMIN remains operationally powerful,
-- while SUPER_ADMIN is reserved for identity lifecycle and destructive/high-risk actions.
INSERT INTO roles (id, code, name)
VALUES ('11111111-1111-1111-1111-111111111111', 'super_admin', 'Super Administrator')
ON CONFLICT (code) DO NOTHING;

-- 2) Account lifecycle metadata. Transactional history is retained; "delete" actions
-- deactivate/anonymize rather than cascading through orders, payments or ledger records.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deactivation_reason TEXT,
  ADD COLUMN IF NOT EXISTS anonymized_at TIMESTAMPTZ;

-- 3) Support cases are conversations. "Resolution proposed" is not equivalent to closed.
ALTER TABLE support_cases
  DROP CONSTRAINT IF EXISTS support_cases_status_check;

ALTER TABLE support_cases
  ADD CONSTRAINT support_cases_status_check CHECK (
    status IN (
      'OPEN','ASSIGNED','IN_PROGRESS','IN_CONVERSATION',
      'WAITING_CUSTOMER','WAITING_MERCHANT','WAITING_RIDER','WAITING_INTERNAL',
      'RESOLUTION_PROPOSED','PARTY_CONFIRMATION','RESOLVED','CLOSED'
    )
  );

ALTER TABLE support_cases
  ADD COLUMN IF NOT EXISTS resolution_proposed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closure_reason TEXT;

CREATE TABLE IF NOT EXISTS support_case_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES support_cases(id) ON DELETE CASCADE,
  participant_type VARCHAR(20) NOT NULL CHECK (
    participant_type IN ('CUSTOMER','MERCHANT','RIDER')
  ),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  entity_id UUID,
  display_name VARCHAR(255),
  required_confirmation BOOLEAN NOT NULL DEFAULT TRUE,
  confirmation_status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (
    confirmation_status IN ('PENDING','ACCEPTED','ACKNOWLEDGED','DISPUTED')
  ),
  confirmation_note TEXT,
  confirmed_at TIMESTAMPTZ,
  last_read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_case_participants_case
  ON support_case_participants(case_id, participant_type);
CREATE INDEX IF NOT EXISTS idx_support_case_participants_user
  ON support_case_participants(user_id, case_id);

-- Existing notes become messages. Keep CUSTOMER_VISIBLE for backwards compatibility,
-- while new messages can target all participants or a specific party.
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
  ADD COLUMN IF NOT EXISTS message_type VARCHAR(30) NOT NULL DEFAULT 'MESSAGE' CHECK (
    message_type IN ('MESSAGE','SYSTEM','RESOLUTION','CONFIRMATION')
  ),
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS support_case_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES support_cases(id) ON DELETE CASCADE,
  note_id UUID REFERENCES support_case_notes(id) ON DELETE CASCADE,
  media_object_id UUID NOT NULL REFERENCES media_objects(id) ON DELETE RESTRICT,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (case_id, media_object_id)
);

CREATE INDEX IF NOT EXISTS idx_support_case_attachments_case
  ON support_case_attachments(case_id, created_at ASC);
