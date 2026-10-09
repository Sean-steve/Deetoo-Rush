-- Per-merchant restrictions for pre-existing role capabilities. Overrides can only REMOVE
-- capabilities granted by the platform's server-enforced Owner/Manager/Staff RBAC.
CREATE TABLE IF NOT EXISTS merchant_role_capability_controls (
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  role_code VARCHAR(30) NOT NULL CHECK (role_code IN ('merchant_manager','merchant_staff')),
  capability VARCHAR(35) NOT NULL CHECK (capability IN
    ('ORDERS_WRITE','MENU_WRITE','INVENTORY_WRITE','BRANCH_WRITE',
     'DOCUMENTS_WRITE','FINANCE_READ','TEAM_INVITE')),
  allowed BOOLEAN NOT NULL,
  updated_by UUID NOT NULL REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (merchant_id, role_code, capability)
);
