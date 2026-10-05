-- Do not invent ownership for unassigned/shared legacy menus.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM menus m WHERE
      (m.branch_id IS NULL AND (SELECT count(*) FROM menu_branch_assignments a WHERE a.menu_id=m.id) <> 1)
      OR (m.branch_id IS NOT NULL AND EXISTS(SELECT 1 FROM menu_branch_assignments a WHERE a.menu_id=m.id AND a.branch_id<>m.branch_id))
  ) THEN RAISE EXCEPTION 'Legacy menus require explicit branch reconciliation; no data was changed'; END IF;
END $$;
UPDATE menus m SET branch_id=(SELECT branch_id FROM menu_branch_assignments a WHERE a.menu_id=m.id) WHERE branch_id IS NULL;
UPDATE menus m SET merchant_id=b.merchant_id FROM merchant_branches b WHERE m.branch_id=b.id AND m.merchant_id IS NULL;
ALTER TABLE menus ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE menus ALTER COLUMN merchant_id SET NOT NULL;
ALTER TABLE merchant_branches ADD CONSTRAINT foundation_branch_merchant UNIQUE(id,merchant_id);
ALTER TABLE menus ADD CONSTRAINT foundation_menu_branch_owner FOREIGN KEY(branch_id,merchant_id) REFERENCES merchant_branches(id,merchant_id);
ALTER TABLE menus ADD CONSTRAINT foundation_menu_branch UNIQUE(id,branch_id);
ALTER TABLE menu_branch_assignments ADD CONSTRAINT foundation_assignment_owner FOREIGN KEY(menu_id,branch_id) REFERENCES menus(id,branch_id);
CREATE UNIQUE INDEX foundation_one_menu_branch ON menu_branch_assignments(menu_id);
INSERT INTO menu_branch_assignments(menu_id,branch_id,is_active) SELECT id,branch_id,is_active FROM menus ON CONFLICT(menu_id,branch_id) DO NOTHING;
ALTER TABLE menu_categories ADD CONSTRAINT foundation_category_menu UNIQUE(id,menu_id);
ALTER TABLE menu_items ADD CONSTRAINT foundation_item_category FOREIGN KEY(category_id,menu_id) REFERENCES menu_categories(id,menu_id);
