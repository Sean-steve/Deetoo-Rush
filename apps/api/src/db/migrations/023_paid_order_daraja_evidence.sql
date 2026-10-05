CREATE TABLE daraja_requests (
  id UUID PRIMARY KEY,
  request_key TEXT NOT NULL UNIQUE,
  payment_id UUID NOT NULL REFERENCES payments(id),
  refund_id UUID REFERENCES refunds(id),
  kind TEXT NOT NULL CHECK(kind IN ('QUERY','REVERSAL')),
  receipt TEXT NOT NULL,
  amount_minor BIGINT NOT NULL CHECK(amount_minor>0),
  currency CHAR(3) NOT NULL CHECK(currency='KES'),
  receiver TEXT NOT NULL,
  originator_conversation_id TEXT UNIQUE,
  conversation_id TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE daraja_results (
  originator_conversation_id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  payload_hash CHAR(64) NOT NULL,
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER immutable_daraja_result BEFORE UPDATE OR DELETE ON daraja_results FOR EACH ROW EXECUTE FUNCTION immutable_paid_order_fact();
