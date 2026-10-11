-- Admin Next backend integration Phase 2. Additive only; no financial ledger replacement.
-- Requires migrations 001-038, PostgreSQL and PostGIS.
CREATE TABLE IF NOT EXISTS admin_order_notes(
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
 author_id UUID NOT NULL REFERENCES users(id),
 note TEXT NOT NULL CHECK(length(btrim(note)) BETWEEN 2 AND 4000),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_order_notes_order_idx ON admin_order_notes(order_id,created_at DESC);

CREATE TABLE IF NOT EXISTS admin_customer_notes(
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 customer_id UUID NOT NULL REFERENCES users(id),
 author_id UUID NOT NULL REFERENCES users(id),
 note TEXT NOT NULL CHECK(length(btrim(note)) BETWEEN 2 AND 4000),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_customer_notes_customer_idx ON admin_customer_notes(customer_id,created_at DESC);

CREATE TABLE IF NOT EXISTS admin_saved_reports(
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id UUID NOT NULL REFERENCES users(id),
 name VARCHAR(120) NOT NULL,
 metric VARCHAR(40) NOT NULL,
 filters JSONB NOT NULL DEFAULT '{}'::jsonb,
 cadence VARCHAR(15) NOT NULL DEFAULT 'MANUAL' CHECK(cadence IN ('MANUAL','WEEKLY','MONTHLY')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(owner_id,name)
);
CREATE INDEX IF NOT EXISTS admin_saved_reports_owner_idx ON admin_saved_reports(owner_id,created_at DESC);

CREATE TABLE IF NOT EXISTS admin_message_templates(
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 name VARCHAR(100) NOT NULL UNIQUE,
 title VARCHAR(180) NOT NULL,
 body TEXT NOT NULL,
 channel VARCHAR(12) NOT NULL CHECK(channel IN ('IN_APP','EMAIL','SMS','PUSH')),
 status VARCHAR(12) NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','APPROVED','ARCHIVED')),
 created_by UUID NOT NULL REFERENCES users(id),
 updated_by UUID NOT NULL REFERENCES users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_campaigns(
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 title VARCHAR(180) NOT NULL,
 body TEXT NOT NULL,
 audience VARCHAR(14) NOT NULL CHECK(audience IN ('CUSTOMERS','MERCHANTS','RIDERS','ALL')),
 channel VARCHAR(12) NOT NULL CHECK(channel IN ('IN_APP','EMAIL','SMS','PUSH')),
 classification VARCHAR(15) NOT NULL DEFAULT 'OPERATIONAL' CHECK(classification IN ('OPERATIONAL','MARKETING')),
 priority VARCHAR(12) NOT NULL DEFAULT 'NORMAL' CHECK(priority IN ('NORMAL','IMPORTANT','URGENT')),
 status VARCHAR(15) NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','APPROVED','CANCELLED','QUEUED','SENT','FAILED')),
 template_id UUID REFERENCES admin_message_templates(id),
 created_by UUID NOT NULL REFERENCES users(id),
 approved_by UUID REFERENCES users(id),
 approval_reason TEXT,
 approved_at TIMESTAMPTZ,
 recipient_count INTEGER NOT NULL DEFAULT 0 CHECK(recipient_count>=0),
 queued_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_campaigns_status_idx ON admin_campaigns(status,created_at DESC);

-- Campaign recipient ledger; unique membership prevents duplicated fanout.
CREATE TABLE IF NOT EXISTS admin_campaign_recipients(
 campaign_id UUID NOT NULL REFERENCES admin_campaigns(id) ON DELETE RESTRICT,
 recipient_type VARCHAR(12) NOT NULL CHECK(recipient_type IN ('CUSTOMER','MERCHANT','RIDER')),
 recipient_id UUID NOT NULL REFERENCES users(id),
 notification_id UUID REFERENCES notifications(id),
 status VARCHAR(12) NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','SENT','FAILED','SKIPPED')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(campaign_id,recipient_type,recipient_id)
);

CREATE TABLE IF NOT EXISTS admin_attention_reads(
 user_id UUID NOT NULL REFERENCES users(id),
 event_type VARCHAR(30) NOT NULL CHECK(event_type IN ('INCIDENT','SUPPORT')),
 event_id UUID NOT NULL,
 read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,event_type,event_id)
);

CREATE TABLE IF NOT EXISTS admin_change_audit(
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 actor_id UUID NOT NULL REFERENCES users(id),
 action VARCHAR(90) NOT NULL,
 resource_type VARCHAR(40) NOT NULL,
 resource_id UUID,
 reason TEXT NOT NULL,
 before_values JSONB NOT NULL DEFAULT '{}'::jsonb,
 after_values JSONB NOT NULL DEFAULT '{}'::jsonb,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_change_audit_resource_idx ON admin_change_audit(resource_type,resource_id,created_at DESC);
CREATE INDEX IF NOT EXISTS admin_change_audit_actor_idx ON admin_change_audit(actor_id,created_at DESC);

-- Only curated support settings; activation is explicitly separate from authoritative service enforcement.
CREATE TABLE IF NOT EXISTS admin_configuration(
 key VARCHAR(80) PRIMARY KEY,
 value JSONB NOT NULL,
 description TEXT,
 updated_by UUID REFERENCES users(id),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
