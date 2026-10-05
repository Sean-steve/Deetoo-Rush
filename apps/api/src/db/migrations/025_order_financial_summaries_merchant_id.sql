-- order_financial_summaries had no merchant_id column at all, despite being the read model
-- settlement.service.ts's calculateSettlement() draws from. Without it, that service could only
-- filter by date, not by merchant, and the code's own comment admitted as much: "Filter by date
-- and merchant (or simulate lines based on current payable balance)" -- the merchant filter never
-- existed. Running a settlement for merchant A therefore drew in every merchant's order revenue
-- for the date window: one merchant's payout could be computed from another merchant's money.
--
-- Backfilled from orders.merchant_id (every summary row references an order 1:1 via its PK/FK,
-- and every order has a merchant_id, so the backfill is expected to be complete) before the
-- column is made NOT NULL, so no future row can be written without merchant attribution.
ALTER TABLE order_financial_summaries ADD COLUMN IF NOT EXISTS merchant_id UUID REFERENCES merchants(id) ON DELETE RESTRICT;

UPDATE order_financial_summaries s
SET merchant_id = o.merchant_id
FROM orders o
WHERE o.id = s.order_id AND s.merchant_id IS NULL;

ALTER TABLE order_financial_summaries ALTER COLUMN merchant_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_financial_summaries_merchant
    ON order_financial_summaries(merchant_id, calculated_at);
