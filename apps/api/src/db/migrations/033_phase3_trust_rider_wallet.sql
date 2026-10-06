-- Phase 3: Trust & Disputes, Rider Wallet, cash accountability and explainable performance
-- Extends Phase 1 support conversations and the immutable double-entry ledger rather than replacing them.

CREATE TABLE IF NOT EXISTS trust_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  support_case_id UUID NOT NULL UNIQUE REFERENCES support_cases(id) ON DELETE CASCADE,
  kind VARCHAR(20) NOT NULL CHECK (kind IN ('DISPUTE','CONDUCT')),
  opened_by_party VARCHAR(20) NOT NULL CHECK (opened_by_party IN ('CUSTOMER','MERCHANT','RIDER','STAFF')),
  opened_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  delivery_id UUID REFERENCES deliveries(id) ON DELETE SET NULL,
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  refund_id UUID REFERENCES refunds(id) ON DELETE SET NULL,
  merchant_id UUID REFERENCES merchants(id) ON DELETE SET NULL,
  rider_id UUID REFERENCES rider_profiles(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES users(id) ON DELETE SET NULL,
  allegation_code VARCHAR(100),
  review_status VARCHAR(30) NOT NULL DEFAULT 'OPEN'
    CHECK (review_status IN ('OPEN','INVESTIGATING','AWAITING_PARTIES','SUBSTANTIATED','UNSUBSTANTIATED','CLOSED')),
  enforcement_status VARCHAR(30) NOT NULL DEFAULT 'NONE'
    CHECK (enforcement_status IN ('NONE','WARNING_RECOMMENDED','INVESTIGATION_RECOMMENDED','TEMP_SUSPENSION_RECOMMENDED','HUMAN_REVIEW_REQUIRED','ENFORCED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trust_cases_status
  ON trust_cases(kind, review_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trust_cases_order ON trust_cases(order_id);
CREATE INDEX IF NOT EXISTS idx_trust_cases_rider ON trust_cases(rider_id, review_status);
CREATE INDEX IF NOT EXISTS idx_trust_cases_customer ON trust_cases(customer_id, review_status);

CREATE TABLE IF NOT EXISTS dispute_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trust_case_id UUID NOT NULL REFERENCES trust_cases(id) ON DELETE CASCADE,
  evidence_type VARCHAR(30) NOT NULL CHECK (
    evidence_type IN (
      'PHOTO','VIDEO','DOCUMENT','DELIVERY_PROOF','GPS_HISTORY',
      'ORDER_EVENT','PAYMENT_EVIDENCE','OTP_EVIDENCE','SYSTEM_EVENT'
    )
  ),
  media_object_id UUID REFERENCES media_objects(id) ON DELETE RESTRICT,
  reference_type VARCHAR(50),
  reference_id VARCHAR(255),
  summary TEXT,
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dispute_evidence_case
  ON dispute_evidence(trust_case_id, created_at);

CREATE TABLE IF NOT EXISTS rider_conduct_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trust_case_id UUID NOT NULL UNIQUE REFERENCES trust_cases(id) ON DELETE CASCADE,
  rider_id UUID NOT NULL REFERENCES rider_profiles(id) ON DELETE RESTRICT,
  customer_id UUID REFERENCES users(id) ON DELETE SET NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  delivery_id UUID REFERENCES deliveries(id) ON DELETE SET NULL,
  conduct_type VARCHAR(60) NOT NULL CHECK (
    conduct_type IN ('EXTRA_PAYMENT_REQUEST','OFF_PLATFORM_PAYMENT','HARASSMENT','OTHER')
  ),
  authoritative_amount_minor BIGINT,
  requested_amount_minor BIGINT,
  currency CHAR(3) NOT NULL DEFAULT 'KES',
  status VARCHAR(30) NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN','INVESTIGATING','SUBSTANTIATED','UNSUBSTANTIATED','CLOSED')),
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rider_conduct_rider
  ON rider_conduct_reports(rider_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS cancellation_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  stage VARCHAR(40) NOT NULL CHECK (
    stage IN ('BEFORE_ACCEPTANCE','PREPARATION','RIDER_ASSIGNED','AFTER_PICKUP','TERMINAL')
  ),
  outcome VARCHAR(40) NOT NULL CHECK (
    outcome IN ('AUTO_CANCEL','SUPPORT_REVIEW','NOT_CANCELLABLE')
  ),
  customer_refund_minor BIGINT,
  merchant_compensation_minor BIGINT,
  rider_compensation_minor BIGINT,
  support_case_id UUID REFERENCES support_cases(id) ON DELETE SET NULL,
  reason_code VARCHAR(100),
  calculation_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cancellation_assessments_order
  ON cancellation_assessments(order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS rider_cash_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES rider_profiles(id) ON DELETE RESTRICT,
  delivery_id UUID REFERENCES deliveries(id) ON DELETE SET NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  event_type VARCHAR(30) NOT NULL CHECK (
    event_type IN ('COLLECTED','SETTLED','OFFSET','ADJUSTMENT')
  ),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency CHAR(3) NOT NULL DEFAULT 'KES',
  provider_reference VARCHAR(255),
  ledger_transaction_id UUID REFERENCES ledger_transactions(id) ON DELETE RESTRICT,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rider_cash_events_rider
  ON rider_cash_events(rider_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_rider_cash_collection_delivery
  ON rider_cash_events(delivery_id)
  WHERE event_type='COLLECTED' AND delivery_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS rider_cash_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES rider_profiles(id) ON DELETE RESTRICT,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency CHAR(3) NOT NULL DEFAULT 'KES',
  status VARCHAR(30) NOT NULL DEFAULT 'REQUESTED'
    CHECK (status IN ('REQUESTED','PENDING_PROVIDER','CONFIRMED','FAILED','CANCELLED')),
  provider VARCHAR(50) NOT NULL DEFAULT 'MPESA',
  provider_reference VARCHAR(255),
  requested_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  confirmed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rider_cash_settlements_rider
  ON rider_cash_settlements(rider_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS delivery_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  delivery_id UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  rider_id UUID NOT NULL REFERENCES rider_profiles(id) ON DELETE RESTRICT,
  customer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(order_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_delivery_ratings_rider
  ON delivery_ratings(rider_id, created_at DESC);

CREATE TABLE IF NOT EXISTS rider_performance_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES rider_profiles(id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  metrics JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rider_performance_snapshots
  ON rider_performance_snapshots(rider_id, generated_at DESC);

CREATE TABLE IF NOT EXISTS marketplace_advisories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advisory_type VARCHAR(50) NOT NULL CHECK (
    advisory_type IN ('PREP_TIME','DEMAND_HEAT','SUPPLY_SHORTAGE','RIDER_POSITIONING','DISPATCH_RADIUS')
  ),
  scope_type VARCHAR(30) NOT NULL,
  scope_id VARCHAR(255),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence NUMERIC(5,4),
  status VARCHAR(20) NOT NULL DEFAULT 'ADVISORY'
    CHECK (status IN ('ADVISORY','ACKNOWLEDGED','DISMISSED','APPLIED')),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_marketplace_advisories
  ON marketplace_advisories(advisory_type, status, generated_at DESC);
