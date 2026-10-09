-- Merchant experience: durable per-user inbox preferences and dismissal.
-- Additive to notifications; never mutate original payment/order event records.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_inbox
  ON notifications(recipient_type, recipient_id, created_at DESC)
  WHERE dismissed_at IS NULL;
CREATE TABLE IF NOT EXISTS user_notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  push_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  order_sound_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
