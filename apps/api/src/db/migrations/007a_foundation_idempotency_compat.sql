-- 008 assumes these columns already exist, but 001 defines an actor-scoped table.
ALTER TABLE idempotency_keys
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'PROCESSING',
  ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id);
UPDATE idempotency_keys SET user_id=actor_id WHERE actor_type='CUSTOMER' AND user_id IS NULL;
