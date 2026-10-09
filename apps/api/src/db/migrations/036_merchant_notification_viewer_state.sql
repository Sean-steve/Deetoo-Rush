-- Read/archived state for merchant-wide notifications must be per viewer, not global.
-- Keep notifications.read_at for legacy direct-user flows. Never allow one staff member
-- to mark notifications as read/dismissed for the entire merchant workforce.
CREATE TABLE IF NOT EXISTS merchant_notification_views (
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  PRIMARY KEY(notification_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_merchant_notification_views_user
  ON merchant_notification_views(user_id,archived_at,read_at);
