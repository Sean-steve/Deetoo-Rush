-- Preserve values while reconciling 001 column names with the 013/runtime contract.
ALTER TABLE ledger_accounts RENAME COLUMN code TO account_number;
ALTER TABLE ledger_accounts ADD COLUMN balance_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE ledger_transactions ADD COLUMN description TEXT NOT NULL DEFAULT '',
  ADD COLUMN total_amount_minor BIGINT NOT NULL DEFAULT 0 CHECK(total_amount_minor >= 0),
  ADD COLUMN effective_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE ledger_transactions SET effective_at=posted_at,created_at=posted_at;
ALTER TABLE ledger_entries RENAME COLUMN side TO direction;
ALTER TABLE ledger_entries ADD COLUMN currency CHAR(3), ADD COLUMN description TEXT;
UPDATE ledger_entries e SET currency=t.currency FROM ledger_transactions t WHERE t.id=e.transaction_id;
ALTER TABLE ledger_entries ALTER COLUMN currency SET NOT NULL;
