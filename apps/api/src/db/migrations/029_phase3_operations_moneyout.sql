-- Phase 3: operations control, payout destinations and verified money-out
-- Durable money-out is asynchronous: approved batches move to PROCESSING and only a
-- verified provider callback can mark them PAID and trigger final ledger posting.

CREATE TABLE IF NOT EXISTS payout_destinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type VARCHAR(20) NOT NULL CHECK (owner_type IN ('MERCHANT','RIDER')),
  owner_id UUID NOT NULL,
  method VARCHAR(30) NOT NULL CHECK (method IN ('MPESA_B2C','BANK_GATEWAY')),
  provider VARCHAR(50) NOT NULL,
  provider_beneficiary_ciphertext TEXT NOT NULL,
  masked_destination VARCHAR(120) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'KES',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  verified_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payout_destinations_owner
  ON payout_destinations(owner_type, owner_id, active);

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_payout_destination_method
  ON payout_destinations(owner_type, owner_id, method)
  WHERE active = TRUE;

CREATE TABLE IF NOT EXISTS disbursement_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type VARCHAR(20) NOT NULL CHECK (resource_type IN ('SETTLEMENT','PAYOUT')),
  resource_id UUID NOT NULL,
  destination_id UUID NOT NULL REFERENCES payout_destinations(id) ON DELETE RESTRICT,
  provider VARCHAR(50) NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency CHAR(3) NOT NULL DEFAULT 'KES',
  status VARCHAR(30) NOT NULL CHECK (status IN ('CREATED','SUBMITTED','SUCCEEDED','FAILED')),
  idempotency_key VARCHAR(255) NOT NULL UNIQUE,
  provider_request_id VARCHAR(255),
  provider_reference VARCHAR(255),
  failure_code VARCHAR(120),
  failure_reason TEXT,
  callback_payload_hash VARCHAR(128),
  callback_received_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  initiated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_disbursement_resource
  ON disbursement_attempts(resource_type, resource_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_disbursement_provider_request
  ON disbursement_attempts(provider, provider_request_id);

ALTER TABLE merchant_settlements
  ADD COLUMN IF NOT EXISTS initiated_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS processing_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ;

ALTER TABLE rider_payouts
  ADD COLUMN IF NOT EXISTS initiated_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS processing_at TIMESTAMPTZ;

-- An order/earning can be claimed by only one settlement/payout across the system.
-- Existing ambiguous data must be reconciled rather than silently migrated.
CREATE UNIQUE INDEX IF NOT EXISTS uq_merchant_settlement_order_claim
  ON merchant_settlement_lines(reference_id)
  WHERE entry_type = 'ORDER';

CREATE UNIQUE INDEX IF NOT EXISTS uq_rider_payout_earning_claim
  ON rider_payout_lines(earning_id);

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
  ON merchant_onboarding_state(stage, updated_at);
