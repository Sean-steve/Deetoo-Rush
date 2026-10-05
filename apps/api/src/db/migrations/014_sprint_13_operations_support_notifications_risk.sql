-- ============================================================================
-- Migration 014: Sprint 13 - Operations, Support, Notifications,
-- Failure Recovery, Fraud Controls & Production Resilience
-- ============================================================================

-- 1. Operational Incidents
CREATE TABLE IF NOT EXISTS operational_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    status VARCHAR(30) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'INVESTIGATING', 'RESOLVED', 'DISMISSED')),
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    delivery_id UUID REFERENCES deliveries(id) ON DELETE SET NULL,
    payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
    refund_id UUID REFERENCES refunds(id) ON DELETE SET NULL,
    merchant_id UUID REFERENCES merchants(id) ON DELETE SET NULL,
    rider_id UUID REFERENCES rider_profiles(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    reason_code VARCHAR(100) NOT NULL,
    summary TEXT NOT NULL,
    details TEXT,
    metadata JSONB NOT NULL DEFAULT '{}',
    assigned_to_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    assigned_to_name VARCHAR(255),
    detected_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    acknowledged_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_operational_incidents_status_sev 
    ON operational_incidents(status, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_operational_incidents_order 
    ON operational_incidents(order_id);
CREATE INDEX IF NOT EXISTS idx_operational_incidents_delivery 
    ON operational_incidents(delivery_id);
CREATE INDEX IF NOT EXISTS idx_operational_incidents_payment 
    ON operational_incidents(payment_id);
CREATE INDEX IF NOT EXISTS idx_operational_incidents_type_status 
    ON operational_incidents(type, status);

-- 2. Operational Incident Timeline
CREATE TABLE IF NOT EXISTS operational_incident_timeline (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID NOT NULL REFERENCES operational_incidents(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_name VARCHAR(255),
    note TEXT,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_incident_timeline_incident 
    ON operational_incident_timeline(incident_id, created_at ASC);

-- 3. Support Cases
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
    priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
    status VARCHAR(30) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'WAITING_MERCHANT', 'WAITING_RIDER', 'WAITING_INTERNAL', 'RESOLVED', 'CLOSED')),
    subject VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    resolution_code VARCHAR(50),
    resolution_notes TEXT,
    assigned_agent_id UUID REFERENCES users(id) ON DELETE SET NULL,
    assigned_agent_name VARCHAR(255),
    refund_id UUID REFERENCES refunds(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_support_cases_number 
    ON support_cases(case_number);
CREATE INDEX IF NOT EXISTS idx_support_cases_status_prio 
    ON support_cases(status, priority, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_cases_customer 
    ON support_cases(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_cases_merchant 
    ON support_cases(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_cases_rider 
    ON support_cases(rider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_cases_order 
    ON support_cases(order_id);
CREATE INDEX IF NOT EXISTS idx_support_cases_agent 
    ON support_cases(assigned_agent_id, status);

-- 4. Support Case Notes
CREATE TABLE IF NOT EXISTS support_case_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES support_cases(id) ON DELETE CASCADE,
    author_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    author_role VARCHAR(50),
    author_name VARCHAR(255),
    visibility VARCHAR(20) NOT NULL DEFAULT 'INTERNAL' CHECK (visibility IN ('INTERNAL', 'CUSTOMER_VISIBLE')),
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_support_case_notes_case 
    ON support_case_notes(case_id, visibility, created_at ASC);

-- 5. Notifications Store
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_type VARCHAR(20) NOT NULL,
    recipient_id VARCHAR(255) NOT NULL,
    channel VARCHAR(20) NOT NULL CHECK (channel IN ('IN_APP', 'PUSH', 'SMS', 'EMAIL')),
    template_code VARCHAR(100) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'CANCELLED')),
    subject VARCHAR(255),
    payload JSONB NOT NULL DEFAULT '{}',
    provider VARCHAR(50) NOT NULL DEFAULT 'SIMULATED',
    provider_reference VARCHAR(255),
    scheduled_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    failure_code VARCHAR(100),
    failure_reason TEXT,
    retry_count INT NOT NULL DEFAULT 0,
    max_retries INT NOT NULL DEFAULT 3,
    idempotency_key VARCHAR(255) NOT NULL UNIQUE,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient 
    ON notifications(recipient_type, recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_status_sched 
    ON notifications(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_notifications_idemp 
    ON notifications(idempotency_key);

-- 6. Dead-Letter Queue for failed background jobs
CREATE TABLE IF NOT EXISTS dead_letter_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type VARCHAR(100) NOT NULL,
    job_id VARCHAR(255) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    attempt_count INT NOT NULL DEFAULT 1,
    max_attempts INT NOT NULL DEFAULT 3,
    last_error TEXT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'DEAD_LETTER' CHECK (status IN ('DEAD_LETTER', 'RETRIED', 'RESOLVED')),
    failed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMPTZ,
    resolved_by VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_dead_letter_jobs_status 
    ON dead_letter_jobs(status, job_type, failed_at DESC);

-- 7. Fraud & Risk Signals
CREATE TABLE IF NOT EXISTS risk_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signal_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'MEDIUM' CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    customer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    merchant_id UUID REFERENCES merchants(id) ON DELETE SET NULL,
    rider_id UUID REFERENCES rider_profiles(id) ON DELETE SET NULL,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
    promotion_id VARCHAR(255),
    score_weight INT NOT NULL DEFAULT 10,
    metadata JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(30) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'REVIEWED', 'DISMISSED', 'CONFIRMED')),
    detected_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMPTZ,
    reviewed_by VARCHAR(255),
    review_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_risk_signals_status_sev 
    ON risk_signals(status, severity, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_risk_signals_customer 
    ON risk_signals(customer_id);
CREATE INDEX IF NOT EXISTS idx_risk_signals_rider 
    ON risk_signals(rider_id);
CREATE INDEX IF NOT EXISTS idx_risk_signals_merchant 
    ON risk_signals(merchant_id);
CREATE INDEX IF NOT EXISTS idx_risk_signals_order 
    ON risk_signals(order_id);

-- 8. Operational Kill Switches & Feature Flags
CREATE TABLE IF NOT EXISTS operational_kill_switches (
    key_name VARCHAR(100) PRIMARY KEY,
    enabled BOOLEAN NOT NULL DEFAULT false,
    description TEXT,
    updated_by VARCHAR(255),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO operational_kill_switches (key_name, enabled, description) VALUES
('auto_dispatch_paused', false, 'Pause automated dispatch engine assignments'),
('zone_paused_all', false, 'Global pause on accepting new orders in all zones'),
('payment_mpesa_paused', false, 'Pause initiating new M-PESA STK pushes'),
('live_tracking_paused', false, 'Fallback live GPS tracking to static delivery status')
ON CONFLICT (key_name) DO NOTHING;
