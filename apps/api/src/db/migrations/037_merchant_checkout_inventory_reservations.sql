-- Checkout stock holds: only inventory-managed products receive reservations.
-- Existing untracked menu items remain available until inventory management is enabled.
CREATE TABLE IF NOT EXISTS merchant_stock_reservations (
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES merchant_branches(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  state VARCHAR(15) NOT NULL DEFAULT 'HELD' CHECK (state IN ('HELD','CONFIRMED','RELEASED')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  PRIMARY KEY (order_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_merchant_stock_hold_expiry
  ON merchant_stock_reservations(expires_at,branch_id) WHERE state='HELD';
-- Never allow backdoor negative inventory; free quantity is adjusted atomically.
