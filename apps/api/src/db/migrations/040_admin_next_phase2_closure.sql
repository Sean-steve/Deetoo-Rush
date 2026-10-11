-- Phase 2 closure: consented campaigns, identity recovery and observed measurements.
-- Never modify already-applied 039 (checksummed migration runner).
CREATE TABLE IF NOT EXISTS admin_broadcast_consents(
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 channel VARCHAR(12) NOT NULL CHECK(channel IN ('IN_APP','EMAIL','SMS','PUSH')),
 consented BOOLEAN NOT NULL DEFAULT false,
 recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 source VARCHAR(30) NOT NULL DEFAULT 'SELF_SERVICE' CHECK(source='SELF_SERVICE'),
 PRIMARY KEY(user_id,channel)
);
CREATE INDEX IF NOT EXISTS admin_broadcast_opted_in ON admin_broadcast_consents(channel,user_id) WHERE consented=true;

ALTER TABLE admin_campaigns ADD COLUMN IF NOT EXISTS audience_frozen_at TIMESTAMPTZ;
ALTER TABLE admin_campaigns ADD COLUMN IF NOT EXISTS dispatch_idempotency_key VARCHAR(120) UNIQUE;
ALTER TABLE admin_campaign_recipients ADD COLUMN IF NOT EXISTS queued_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS admin_campaign_recipients_notifications_idx ON admin_campaign_recipients(notification_id) WHERE notification_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS admin_staff_invitations(
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 token_hash CHAR(64) NOT NULL UNIQUE,
 status VARCHAR(22) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','DELIVERY_SUBMITTED','DELIVERY_FAILED','CONSUMED','REVOKED')),
 email VARCHAR(255) NOT NULL,
 invited_by UUID NOT NULL REFERENCES users(id),
 delivered_provider_ref TEXT,
 expires_at TIMESTAMPTZ NOT NULL,
 delivered_at TIMESTAMPTZ,
 consumed_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK(expires_at>created_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS active_admin_staff_invitation ON admin_staff_invitations(user_id) WHERE status IN ('PENDING','DELIVERY_SUBMITTED','DELIVERY_FAILED');
CREATE INDEX IF NOT EXISTS admin_staff_invitations_expires ON admin_staff_invitations(expires_at);

CREATE TABLE IF NOT EXISTS admin_mfa_recovery_requests(
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 target_user_id UUID NOT NULL REFERENCES users(id),
 requested_by UUID NOT NULL REFERENCES users(id),
 approved_by UUID REFERENCES users(id),
 reason TEXT NOT NULL CHECK(length(btrim(reason))>=10),
 status VARCHAR(12) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED','EXPIRED')),
 expires_at TIMESTAMPTZ NOT NULL DEFAULT (now()+interval '30 minutes'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 decided_at TIMESTAMPTZ,
 CHECK(approved_by IS NULL OR approved_by<>requested_by)
);
CREATE INDEX IF NOT EXISTS admin_mfa_recovery_pending ON admin_mfa_recovery_requests(target_user_id,expires_at) WHERE status='PENDING';

ALTER TABLE admin_saved_reports ADD COLUMN IF NOT EXISTS next_run_at TIMESTAMPTZ;
ALTER TABLE admin_saved_reports ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMPTZ;
ALTER TABLE admin_saved_reports ADD COLUMN IF NOT EXISTS delivery_enabled BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS admin_saved_reports_due ON admin_saved_reports(next_run_at) WHERE delivery_enabled=true;
CREATE TABLE IF NOT EXISTS admin_report_delivery_runs(
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 report_id UUID NOT NULL REFERENCES admin_saved_reports(id) ON DELETE CASCADE,
 cadence_slot TIMESTAMPTZ NOT NULL,
 notification_id UUID REFERENCES notifications(id),
 status VARCHAR(12) NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','SKIPPED','FAILED')),
 error_code VARCHAR(70),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(report_id,cadence_slot)
);

CREATE TABLE IF NOT EXISTS admin_dependency_samples(
 id BIGSERIAL PRIMARY KEY,
 service VARCHAR(24) NOT NULL CHECK(service IN ('postgres','postgis','redis')),
 status VARCHAR(16) NOT NULL CHECK(status IN ('healthy','degraded','unhealthy','unknown')),
 latency_ms INTEGER CHECK(latency_ms>=0),
 observed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_dependency_samples_time ON admin_dependency_samples(service,observed_at DESC);

-- Writeable configuration keys MUST have an enforcing consumer. Other UX toggles are explicitly unsupported.
INSERT INTO admin_configuration(key,value,description)
 VALUES ('notification_campaign_paused','false'::jsonb,'When true the campaign enqueue route and the notification worker pause campaign items'),
        ('support_intake_paused','false'::jsonb,'When true customer-initiated support case creation is rejected at the API boundary'),
        ('maintenance_banner','false'::jsonb,'Read-only banner indicator, not a server maintenance switch')
 ON CONFLICT (key) DO NOTHING;
