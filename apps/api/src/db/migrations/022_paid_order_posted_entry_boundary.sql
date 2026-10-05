-- A balanced extra pair must not be appended to a transaction committed earlier.
ALTER TABLE ledger_transactions ADD COLUMN posting_xid xid8 NOT NULL DEFAULT pg_current_xact_id();
CREATE FUNCTION require_open_ledger_posting() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE posting xid8;
BEGIN
  SELECT posting_xid INTO posting FROM ledger_transactions WHERE id=NEW.transaction_id;
  IF posting IS DISTINCT FROM pg_current_xact_id() THEN
    RAISE EXCEPTION 'Posted ledger transactions cannot receive additional entries';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ledger_entry_open_posting BEFORE INSERT ON ledger_entries FOR EACH ROW EXECUTE FUNCTION require_open_ledger_posting();
