-- Rider withdrawal intent only. Provider completion still belongs to finance/callback.
CREATE TABLE IF NOT EXISTS rider_withdrawal_requests (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 rider_id UUID NOT NULL REFERENCES rider_profiles(id) ON DELETE RESTRICT,
 amount_minor BIGINT NOT NULL CHECK(amount_minor>=10000),
 currency TEXT NOT NULL DEFAULT 'KES' CHECK(currency='KES'),
 idempotency_key TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK(status IN ('REQUESTED','QUEUED_FOR_BATCH','BATCHED','REJECTED')),
 -- One finance batch links to at most one Rider request to prevent double accounting.
 payout_id UUID UNIQUE REFERENCES rider_payouts(id) ON DELETE RESTRICT,
 reviewed_by UUID REFERENCES users(id),
 reviewed_at TIMESTAMPTZ,
 rejection_reason TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(rider_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS rider_withdrawal_queue_idx ON rider_withdrawal_requests(status,created_at DESC);
CREATE INDEX IF NOT EXISTS rider_withdrawal_owner_idx ON rider_withdrawal_requests(rider_id,created_at DESC);
