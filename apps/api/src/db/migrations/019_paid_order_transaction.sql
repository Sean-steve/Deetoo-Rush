-- Wave 2: immutable quote bindings and durable verified economic evidence.
ALTER TABLE checkout_quotes ADD COLUMN binding_hash CHAR(64);
CREATE UNIQUE INDEX orders_one_quote ON orders(checkout_quote_id) WHERE checkout_quote_id IS NOT NULL;
CREATE UNIQUE INDEX ledger_account_identity ON ledger_accounts(account_type,owner_type,owner_id,currency) NULLS NOT DISTINCT;
CREATE UNIQUE INDEX payment_provider_intent_identity ON payments(provider,provider_payment_id) WHERE provider_payment_id IS NOT NULL;
CREATE UNIQUE INDEX payment_provider_checkout_identity ON payments(provider,checkout_request_id) WHERE checkout_request_id IS NOT NULL;

CREATE TABLE payment_capture_evidence (
  payment_id UUID PRIMARY KEY REFERENCES payments(id),
  order_id UUID NOT NULL REFERENCES orders(id),
  provider TEXT NOT NULL,
  provider_reference TEXT NOT NULL,
  amount_minor BIGINT NOT NULL CHECK(amount_minor>0),
  currency CHAR(3) NOT NULL,
  receiver TEXT NOT NULL,
  evidence JSONB NOT NULL,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider,provider_reference)
);
CREATE TABLE payment_commands (
  id UUID PRIMARY KEY,
  payment_id UUID NOT NULL REFERENCES payments(id),
  refund_id UUID REFERENCES refunds(id),
  kind TEXT NOT NULL CHECK(kind IN ('INITIATE','VERIFY','VOID','REFUND')),
  request_hash CHAR(64) NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','RUNNING','SUCCEEDED','REVIEW','FAILED')),
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  leased_until TIMESTAMPTZ,
  lease_token UUID,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX payment_commands_pending ON payment_commands(available_at) WHERE status IN ('PENDING','RUNNING');
ALTER TABLE refunds ADD COLUMN idempotency_key TEXT, ADD COLUMN request_hash CHAR(64),
  ADD COLUMN approved_by UUID REFERENCES users(id), ADD COLUMN approved_at TIMESTAMPTZ,
  ADD COLUMN policy TEXT, ADD COLUMN reversal_snapshot JSONB;
CREATE UNIQUE INDEX refunds_payment_idempotency ON refunds(payment_id,idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE FUNCTION immutable_paid_order_fact() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION '% is immutable; append a correction instead', TG_TABLE_NAME; END $$;
CREATE TRIGGER immutable_quote BEFORE UPDATE OR DELETE ON checkout_quotes FOR EACH ROW EXECUTE FUNCTION immutable_paid_order_fact();
CREATE TRIGGER immutable_capture_evidence BEFORE UPDATE OR DELETE ON payment_capture_evidence FOR EACH ROW EXECUTE FUNCTION immutable_paid_order_fact();

ALTER TABLE payments ADD COLUMN provider_receiver TEXT;
CREATE TRIGGER immutable_ledger_entry BEFORE UPDATE OR DELETE ON ledger_entries FOR EACH ROW EXECUTE FUNCTION immutable_paid_order_fact();
CREATE TRIGGER immutable_ledger_transaction BEFORE UPDATE OR DELETE ON ledger_transactions FOR EACH ROW EXECUTE FUNCTION immutable_paid_order_fact();
CREATE FUNCTION protect_order_economics() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.customer_id,NEW.merchant_id,NEW.branch_id,NEW.checkout_quote_id,NEW.currency,NEW.total_minor,NEW.pricing_snapshot,NEW.promotion_snapshot,NEW.delivery_address_snapshot)
    IS DISTINCT FROM (OLD.customer_id,OLD.merchant_id,OLD.branch_id,OLD.checkout_quote_id,OLD.currency,OLD.total_minor,OLD.pricing_snapshot,OLD.promotion_snapshot,OLD.delivery_address_snapshot)
  THEN RAISE EXCEPTION 'Order economics are immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER immutable_order_economics BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION protect_order_economics();
CREATE TRIGGER immutable_order_item BEFORE UPDATE OR DELETE ON order_items FOR EACH ROW EXECUTE FUNCTION immutable_paid_order_fact();
CREATE TRIGGER immutable_order_modifier BEFORE UPDATE OR DELETE ON order_item_modifiers FOR EACH ROW EXECUTE FUNCTION immutable_paid_order_fact();

CREATE FUNCTION validate_ledger_posting() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target UUID; debit BIGINT; credit BIGINT; invalid INTEGER;
BEGIN
  target:=CASE WHEN TG_TABLE_NAME='ledger_transactions' THEN NEW.id ELSE NEW.transaction_id END;
  SELECT coalesce(sum(e.amount_minor) FILTER(WHERE e.direction='DEBIT'),0),
    coalesce(sum(e.amount_minor) FILTER(WHERE e.direction='CREDIT'),0),
    count(*) FILTER(WHERE e.currency<>t.currency OR e.currency<>a.currency OR e.amount_minor<=0)
    INTO debit,credit,invalid
    FROM ledger_entries e JOIN ledger_transactions t ON t.id=e.transaction_id JOIN ledger_accounts a ON a.id=e.account_id WHERE e.transaction_id=target;
  IF debit<>credit OR invalid>0 OR debit=0 THEN RAISE EXCEPTION 'Unbalanced, empty or cross-currency ledger posting'; END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER ledger_balance_transaction AFTER INSERT ON ledger_transactions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_ledger_posting();
CREATE CONSTRAINT TRIGGER ledger_balance_entry AFTER INSERT ON ledger_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_ledger_posting();
