-- Neither merchant_settlements nor rider_payouts recorded who calculated/created the draft --
-- only approved_by was tracked. That made it structurally impossible to enforce separation of
-- duties (a "maker-checker" control): nothing stopped the same user from both generating a
-- settlement or payout and then approving their own work, for any amount.
ALTER TABLE merchant_settlements ADD COLUMN IF NOT EXISTS calculated_by UUID REFERENCES users(id);
ALTER TABLE rider_payouts ADD COLUMN IF NOT EXISTS calculated_by UUID REFERENCES users(id);
