-- Phase 3 — account-associated website cookie preference history.
-- Guest preferences live only in a minimal first-party browser receipt.
-- A new record is appended for every authenticated change; no admin override.
CREATE TABLE IF NOT EXISTS user_cookie_consent_receipts (
  receipt_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  policy_version varchar(32) NOT NULL,
  functional_allowed boolean NOT NULL DEFAULT false,
  analytics_allowed boolean NOT NULL DEFAULT false,
  marketing_allowed boolean NOT NULL DEFAULT false,
  source varchar(20) NOT NULL CHECK (source IN ('banner','customize','settings')),
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_cookie_consent_history
  ON user_cookie_consent_receipts (user_id, recorded_at DESC, receipt_id DESC);
COMMENT ON TABLE user_cookie_consent_receipts IS
  'Append-only authenticated website cookie choices. Does not authorize SMS/email campaigns and does not store device or browser identifiers.';
