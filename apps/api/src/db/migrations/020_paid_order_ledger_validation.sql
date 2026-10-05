-- Correct polymorphic trigger record field access: ledger_transactions has no transaction_id.
CREATE OR REPLACE FUNCTION validate_ledger_posting() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target UUID; debit BIGINT; credit BIGINT; invalid INTEGER;
BEGIN
  IF TG_TABLE_NAME='ledger_transactions' THEN target:=NEW.id;
  ELSE target:=NEW.transaction_id; END IF;
  SELECT coalesce(sum(e.amount_minor) FILTER(WHERE e.direction='DEBIT'),0),
    coalesce(sum(e.amount_minor) FILTER(WHERE e.direction='CREDIT'),0),
    count(*) FILTER(WHERE e.currency<>t.currency OR e.currency<>a.currency OR e.amount_minor<=0)
    INTO debit,credit,invalid
    FROM ledger_entries e JOIN ledger_transactions t ON t.id=e.transaction_id JOIN ledger_accounts a ON a.id=e.account_id WHERE e.transaction_id=target;
  IF debit<>credit OR invalid>0 OR debit=0 THEN RAISE EXCEPTION 'Unbalanced, empty or cross-currency ledger posting'; END IF;
  RETURN NEW;
END $$;
