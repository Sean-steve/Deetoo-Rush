-- Role taxonomy is configuration, never a grant or a seeded account.
INSERT INTO roles(id,code,name)
SELECT gen_random_uuid(), code, code FROM unnest(ARRAY['customer','merchant_owner','merchant_manager','merchant_staff','rider','admin','ops','finance','support']) code
ON CONFLICT(code) DO NOTHING;
ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE merchant_memberships ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE outbox_events
  ADD COLUMN channel TEXT,
  ADD COLUMN available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN lease_token UUID,
  ADD COLUMN leased_until TIMESTAMPTZ;
CREATE INDEX outbox_pending ON outbox_events(available_at,occurred_at) WHERE published_at IS NULL;
CREATE INDEX outbox_channel_history ON outbox_events(channel,occurred_at,id);
-- Prevent branch scope from crossing the membership's merchant, including direct SQL.
CREATE FUNCTION enforce_membership_branch_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM merchant_memberships m JOIN merchant_branches b ON b.merchant_id=m.merchant_id
    WHERE m.id=NEW.membership_id AND b.id=NEW.branch_id) THEN
    RAISE EXCEPTION 'Membership branch belongs to another merchant' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER membership_branch_scope BEFORE INSERT OR UPDATE ON merchant_membership_branches
FOR EACH ROW EXECUTE FUNCTION enforce_membership_branch_scope();
