CREATE TABLE user_mfa_credentials (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  encrypted_secret TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  last_counter BIGINT NOT NULL DEFAULT -1,
  failures INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE sessions ADD COLUMN mfa_verified_at TIMESTAMPTZ;
