-- Add a narrow kitchen availability permission without granting menu CRUD.
-- Existing merchant-specific role restrictions remain in force.
ALTER TABLE merchant_role_capability_controls
  DROP CONSTRAINT IF EXISTS merchant_role_capability_controls_capability_check;
ALTER TABLE merchant_role_capability_controls
  ADD CONSTRAINT merchant_role_capability_controls_capability_check
  CHECK (capability IN (
    'ORDERS_WRITE','MENU_WRITE','MENU_AVAILABILITY_WRITE','INVENTORY_WRITE',
    'BRANCH_WRITE','DOCUMENTS_WRITE','FINANCE_READ','TEAM_INVITE'
  ));
